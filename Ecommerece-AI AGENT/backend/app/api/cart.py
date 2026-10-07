from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cart import CartItem, Coupon, CouponType, WishlistItem
from app.models.product import Product
from app.models.user import User
from app.schemas.cart import (
    CartItemAdd,
    CartItemOut,
    CartItemUpdate,
    CartOut,
    CouponApply,
    CouponResult,
    WishlistItemOut,
)
from app.schemas.product import ProductOut
from app.services.deps import get_current_user

router = APIRouter(prefix="/api", tags=["cart"])


def _cart_out(db: Session, user_id: int) -> CartOut:
    items = db.query(CartItem).filter(CartItem.user_id == user_id).all()
    out_items = []
    subtotal = 0.0
    for item in items:
        out_items.append(
            CartItemOut(id=item.id, quantity=item.quantity, product=ProductOut.from_orm_with_relations(item.product))
        )
        subtotal += item.product.final_price * item.quantity
    return CartOut(items=out_items, subtotal=round(subtotal, 2), item_count=sum(i.quantity for i in items))


@router.get("/cart", response_model=CartOut)
def get_cart(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _cart_out(db, current_user.id)


@router.post("/cart/items", response_model=CartOut, status_code=201)
def add_to_cart(payload: CartItemAdd, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if payload.quantity < 1:
        raise HTTPException(status_code=422, detail="Quantity must be at least 1")
    if product.stock < payload.quantity:
        raise HTTPException(status_code=400, detail=f"Only {product.stock} left in stock")

    existing = (
        db.query(CartItem)
        .filter(CartItem.user_id == current_user.id, CartItem.product_id == payload.product_id)
        .first()
    )
    if existing:
        existing.quantity += payload.quantity
    else:
        db.add(CartItem(user_id=current_user.id, product_id=payload.product_id, quantity=payload.quantity))
    db.commit()
    return _cart_out(db, current_user.id)


@router.patch("/cart/items/{item_id}", response_model=CartOut)
def update_cart_item(
    item_id: int,
    payload: CartItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = db.query(CartItem).filter(CartItem.id == item_id, CartItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if payload.quantity < 1:
        db.delete(item)
    else:
        item.quantity = payload.quantity
    db.commit()
    return _cart_out(db, current_user.id)


@router.delete("/cart/items/{item_id}", response_model=CartOut)
def remove_cart_item(item_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(CartItem).filter(CartItem.id == item_id, CartItem.user_id == current_user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(item)
    db.commit()
    return _cart_out(db, current_user.id)


@router.delete("/cart")
def clear_cart(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(CartItem).filter(CartItem.user_id == current_user.id).delete()
    db.commit()
    return {"message": "Cart cleared"}


# --- Wishlist ---------------------------------------------------------


@router.get("/wishlist", response_model=list[WishlistItemOut])
def get_wishlist(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(WishlistItem).filter(WishlistItem.user_id == current_user.id).all()
    return [WishlistItemOut(id=i.id, product=ProductOut.from_orm_with_relations(i.product)) for i in items]


@router.post("/wishlist/{product_id}", status_code=201)
def add_to_wishlist(product_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    exists = (
        db.query(WishlistItem)
        .filter(WishlistItem.user_id == current_user.id, WishlistItem.product_id == product_id)
        .first()
    )
    if not exists:
        db.add(WishlistItem(user_id=current_user.id, product_id=product_id))
        db.commit()
    return {"message": "Added to wishlist"}


@router.delete("/wishlist/{product_id}")
def remove_from_wishlist(
    product_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    db.query(WishlistItem).filter(
        WishlistItem.user_id == current_user.id, WishlistItem.product_id == product_id
    ).delete()
    db.commit()
    return {"message": "Removed from wishlist"}


# --- Coupons ------------------------------------------------------------


@router.post("/coupons/validate", response_model=CouponResult)
def validate_coupon(payload: CouponApply, db: Session = Depends(get_db)):
    coupon = db.query(Coupon).filter(Coupon.code == payload.code.upper()).first()
    if not coupon or not coupon.is_active:
        return CouponResult(valid=False, message="Coupon code not found")
    if coupon.expires_at and coupon.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        return CouponResult(valid=False, message="Coupon has expired")
    if coupon.usage_limit and coupon.times_used >= coupon.usage_limit:
        return CouponResult(valid=False, message="Coupon usage limit reached")
    if payload.order_subtotal < coupon.min_order_value:
        return CouponResult(
            valid=False, message=f"Order must be at least ${coupon.min_order_value:.2f} to use this coupon"
        )

    if coupon.type == CouponType.percent:
        discount = payload.order_subtotal * (coupon.value / 100)
        if coupon.max_discount:
            discount = min(discount, coupon.max_discount)
    else:
        discount = coupon.value

    discount = round(min(discount, payload.order_subtotal), 2)
    final_total = round(payload.order_subtotal - discount, 2)
    return CouponResult(valid=True, message="Coupon applied", discount_amount=discount, final_total=final_total)


@router.get("/coupons/active")
def list_active_coupons(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    coupons = db.query(Coupon).filter(Coupon.is_active == True).all()  # noqa: E712
    return [
        {"code": c.code, "type": c.type, "value": c.value, "min_order_value": c.min_order_value}
        for c in coupons
        if not c.expires_at or c.expires_at > now
    ]
