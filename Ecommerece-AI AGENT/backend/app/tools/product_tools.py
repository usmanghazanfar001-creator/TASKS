"""
LangChain tools for product discovery. Each factory function takes a
live DB session and returns a bound @tool the agent can call. Binding
the session this way (rather than opening a new one per call) keeps
every tool call in a request on the same transaction and avoids
threading a session through LangChain's tool-calling machinery.
"""
import json

from langchain_core.tools import tool
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.product import Brand, Category, Product, Review


def make_product_tools(db: Session):
    @tool
    def search_products(
        query: str = "",
        category: str = "",
        brand: str = "",
        min_price: float = 0,
        max_price: float = 0,
        min_rating: float = 0,
        eco_friendly: bool = False,
        on_sale: bool = False,
        color: str = "",
        sort: str = "relevance",
        limit: int = 8,
    ) -> str:
        """Search the product catalog. Use this whenever a customer describes something
        they want to find or browse (e.g. "laptop under Rs. 150000", "waterproof smartwatches").
        All filters are optional - only pass the ones the customer's request implies.
        sort can be 'relevance', 'price_asc', 'price_desc', or 'rating'.
        Returns a JSON list of matching products with id, name, brand, price, final_price,
        discount, rating, stock, and tags."""
        q = db.query(Product).filter(Product.is_active == True)  # noqa: E712
        if query:
            like = f"%{query}%"
            q = q.filter(or_(Product.name.ilike(like), Product.description.ilike(like), Product.tags.ilike(like)))
        if category:
            q = q.join(Category).filter(Category.name.ilike(f"%{category}%"))
        if brand:
            q = q.join(Brand).filter(Brand.name.ilike(f"%{brand}%"))
        if min_price:
            q = q.filter(Product.price >= min_price)
        if max_price:
            q = q.filter(Product.price <= max_price)
        if min_rating:
            q = q.filter(Product.rating_avg >= min_rating)
        if eco_friendly:
            q = q.filter(Product.is_eco_friendly == True)  # noqa: E712
        if on_sale:
            q = q.filter(Product.discount_percent > 0)
        if color:
            q = q.filter(Product.color.ilike(f"%{color}%"))

        if sort == "price_asc":
            q = q.order_by(Product.price.asc())
        elif sort == "price_desc":
            q = q.order_by(Product.price.desc())
        elif sort == "rating":
            q = q.order_by(Product.rating_avg.desc())

        products = q.limit(limit).all()
        if not products:
            return json.dumps({"count": 0, "products": [], "message": "No matching products found."})

        return json.dumps(
            {
                "count": len(products),
                "products": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "brand": p.brand.name if p.brand else "",
                        "category": p.category.name if p.category else "",
                        "price": p.price,
                        "discount_percent": p.discount_percent,
                        "final_price": p.final_price,
                        "rating": p.rating_avg,
                        "rating_count": p.rating_count,
                        "stock": p.stock,
                        "color": p.color,
                        "tags": p.tags,
                        "eco_friendly": p.is_eco_friendly,
                    }
                    for p in products
                ],
            }
        )

    @tool
    def compare_products(product_ids: list[int]) -> str:
        """Compare two or more products side by side by their catalog IDs.
        Use this after search_products has identified candidate products and the
        customer wants a comparison (e.g. "compare iPhone 15 and Pixel 9").
        Returns full specs, price, and rating for each so the model can produce a
        structured comparison and a recommendation."""
        products = db.query(Product).filter(Product.id.in_(product_ids)).all()
        if not products:
            return json.dumps({"error": "No products found for the given IDs"})

        return json.dumps(
            {
                "products": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "brand": p.brand.name if p.brand else "",
                        "price": p.price,
                        "final_price": p.final_price,
                        "rating": p.rating_avg,
                        "rating_count": p.rating_count,
                        "stock": p.stock,
                        "color": p.color,
                        "size": p.size,
                        "weight_kg": p.weight_kg,
                        "warranty_months": p.warranty_months,
                        "delivery_days": p.delivery_days,
                        "specifications": json.loads(p.specifications) if p.specifications else {},
                        "eco_friendly": p.is_eco_friendly,
                    }
                    for p in products
                ]
            }
        )

    @tool
    def recommend_products(
        based_on_category: str = "",
        budget_max: float = 0,
        occasion: str = "",
        limit: int = 5,
    ) -> str:
        """Recommend products for a customer, e.g. gift ideas, budget-based suggestions,
        or 'frequently bought together' style picks. Pass based_on_category (e.g.
        'electronics', 'home'), an optional budget_max, and an optional occasion string
        (e.g. 'anniversary gift', 'back to school') for context. Returns top-rated
        in-stock products matching the criteria, sorted by rating."""
        q = db.query(Product).filter(Product.is_active == True, Product.stock > 0)  # noqa: E712
        if based_on_category:
            q = q.join(Category).filter(Category.name.ilike(f"%{based_on_category}%"))
        if budget_max:
            q = q.filter(Product.price <= budget_max)
        products = q.order_by(Product.rating_avg.desc()).limit(limit).all()

        return json.dumps(
            {
                "occasion": occasion,
                "recommendations": [
                    {
                        "id": p.id,
                        "name": p.name,
                        "brand": p.brand.name if p.brand else "",
                        "final_price": p.final_price,
                        "rating": p.rating_avg,
                        "why": f"Rated {p.rating_avg}/5 across {p.rating_count} reviews"
                        + (", currently on sale" if p.discount_percent else ""),
                    }
                    for p in products
                ],
            }
        )

    @tool
    def check_inventory(product_id: int) -> str:
        """Check real-time stock/availability for a specific product ID.
        Use this before confirming a customer can buy something, or when they
        ask 'is this in stock' / 'how many are left'."""
        product = db.get(Product, product_id)
        if not product:
            return json.dumps({"error": "Product not found"})
        return json.dumps(
            {
                "id": product.id,
                "name": product.name,
                "in_stock": product.stock > 0,
                "stock": product.stock,
                "delivery_days": product.delivery_days,
            }
        )

    @tool
    def summarize_reviews(product_id: int) -> str:
        """Fetch and summarize customer reviews for a product, including a rough
        pros/cons breakdown based on review text. Use when a customer asks
        'what do people think of this' or wants pros and cons."""
        product = db.get(Product, product_id)
        if not product:
            return json.dumps({"error": "Product not found"})
        reviews = (
            db.query(Review).filter(Review.product_id == product_id).order_by(Review.created_at.desc()).limit(20).all()
        )
        return json.dumps(
            {
                "product": product.name,
                "rating_avg": product.rating_avg,
                "rating_count": product.rating_count,
                "recent_reviews": [
                    {"rating": r.rating, "title": r.title, "body": r.body} for r in reviews
                ],
            }
        )

    return [search_products, compare_products, recommend_products, check_inventory, summarize_reviews]
