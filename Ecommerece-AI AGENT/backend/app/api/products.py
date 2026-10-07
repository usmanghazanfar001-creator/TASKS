from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.product import Brand, Category, Product, ProductImage, RecentlyViewed, Review
from app.models.user import User
from app.schemas.product import ProductCreate, ProductOut, ReviewCreate, ReviewOut
from app.services.deps import get_current_user, require_admin

router = APIRouter(prefix="/api/products", tags=["products"])


@router.get("", response_model=list[ProductOut])
def list_products(
    q: str | None = Query(None, description="Free-text search over name, description, tags"),
    category: str | None = None,
    brand: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    min_rating: float | None = None,
    eco_friendly: bool | None = None,
    on_sale: bool | None = None,
    color: str | None = None,
    sort: str = Query("relevance", description="relevance | price_asc | price_desc | rating"),
    limit: int = Query(24, le=100),
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = db.query(Product).filter(Product.is_active == True)  # noqa: E712

    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(Product.name.ilike(like), Product.description.ilike(like), Product.tags.ilike(like))
        )
    if category:
        query = query.join(Category).filter(Category.slug == category)
    if brand:
        query = query.join(Brand).filter(Brand.name.ilike(brand))
    if min_price is not None:
        query = query.filter(Product.price >= min_price)
    if max_price is not None:
        query = query.filter(Product.price <= max_price)
    if min_rating is not None:
        query = query.filter(Product.rating_avg >= min_rating)
    if eco_friendly:
        query = query.filter(Product.is_eco_friendly == True)  # noqa: E712
    if on_sale:
        query = query.filter(Product.discount_percent > 0)
    if color:
        query = query.filter(Product.color.ilike(color))

    if sort == "price_asc":
        query = query.order_by(Product.price.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.price.desc())
    elif sort == "rating":
        query = query.order_by(Product.rating_avg.desc())

    products = query.offset(offset).limit(limit).all()
    return [ProductOut.from_orm_with_relations(p) for p in products]


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product or not product.is_active:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductOut.from_orm_with_relations(product)


@router.post("/{product_id}/view")
def record_view(product_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.add(RecentlyViewed(user_id=current_user.id, product_id=product_id))
    db.commit()
    return {"message": "recorded"}


@router.get("/me/recently-viewed", response_model=list[ProductOut])
def recently_viewed(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(RecentlyViewed)
        .filter(RecentlyViewed.user_id == current_user.id)
        .order_by(RecentlyViewed.viewed_at.desc())
        .limit(10)
        .all()
    )
    products = [db.get(Product, r.product_id) for r in rows]
    return [ProductOut.from_orm_with_relations(p) for p in products if p]


@router.get("/{product_id}/reviews", response_model=list[ReviewOut])
def get_reviews(product_id: int, db: Session = Depends(get_db)):
    return db.query(Review).filter(Review.product_id == product_id).order_by(Review.created_at.desc()).all()


@router.post("/{product_id}/reviews", response_model=ReviewOut, status_code=201)
def add_review(
    product_id: int,
    payload: ReviewCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not (1 <= payload.rating <= 5):
        raise HTTPException(status_code=422, detail="Rating must be between 1 and 5")

    review = Review(product_id=product_id, user_id=current_user.id, **payload.model_dump())
    db.add(review)

    # Recompute running average rating
    total_points = product.rating_avg * product.rating_count + payload.rating
    product.rating_count += 1
    product.rating_avg = round(total_points / product.rating_count, 2)

    db.commit()
    db.refresh(review)
    return review


@router.post("", response_model=ProductOut, status_code=201)
def create_product(payload: ProductCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Admin-only: create a new product, creating brand/category on the fly if needed."""
    brand = db.query(Brand).filter(Brand.name.ilike(payload.brand_name)).first()
    if not brand:
        brand = Brand(name=payload.brand_name)
        db.add(brand)
        db.flush()

    category = db.query(Category).filter(Category.name.ilike(payload.category_name)).first()
    if not category:
        slug = payload.category_name.lower().replace(" ", "-")
        category = Category(name=payload.category_name, slug=slug)
        db.add(category)
        db.flush()

    data = payload.model_dump(exclude={"brand_name", "category_name"})
    product = Product(**data, brand_id=brand.id, category_id=category.id)
    db.add(product)
    db.commit()
    db.refresh(product)
    return ProductOut.from_orm_with_relations(product)


# --- Admin helpers: image upload, edit, delete -------------------------------

ALLOWED_IMAGE_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
}
MAX_IMAGE_BYTES = 3 * 1024 * 1024


@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...), _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Admin-only: upload a product photo (kept in the database). Returns the URL to store in image_url."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Please upload a JPG, PNG, WEBP or GIF image")
    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image is too large (max 3 MB)")
    image = ProductImage(content_type=ALLOWED_IMAGE_TYPES[ext], data=data)
    db.add(image)
    db.commit()
    db.refresh(image)
    return {"url": f"/api/products/images/{image.id}"}


@router.get("/images/{image_id}", include_in_schema=False)
def get_image(image_id: int, db: Session = Depends(get_db)):
    image = db.get(ProductImage, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(
        content=image.data,
        media_type=image.content_type,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.put("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductCreate, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Admin-only: edit an existing product."""
    product = db.get(Product, product_id)
    if not product or not product.is_active:
        raise HTTPException(status_code=404, detail="Product not found")

    brand = db.query(Brand).filter(Brand.name.ilike(payload.brand_name)).first()
    if not brand:
        brand = Brand(name=payload.brand_name)
        db.add(brand)
        db.flush()

    category = db.query(Category).filter(Category.name.ilike(payload.category_name)).first()
    if not category:
        category = Category(name=payload.category_name, slug=payload.category_name.lower().replace(" ", "-"))
        db.add(category)
        db.flush()

    for key, value in payload.model_dump(exclude={"brand_name", "category_name"}).items():
        setattr(product, key, value)
    product.brand_id = brand.id
    product.category_id = category.id
    db.commit()
    db.refresh(product)
    return ProductOut.from_orm_with_relations(product)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Admin-only: remove a product from the store (hidden, past orders keep working)."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.is_active = False
    db.commit()
