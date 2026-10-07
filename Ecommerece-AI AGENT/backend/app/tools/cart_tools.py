import json
from datetime import datetime, timezone

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.models.cart import CartItem, Coupon, CouponType, WishlistItem
from app.models.product import Product
from app.models.user import User


def make_cart_tools(db: Session, current_user: User):
    @tool
    def add_to_cart(product_id: int, quantity: int = 1) -> str:
        """Add a product to the customer's shopping cart. Use when the customer
        says things like 'add that to my cart' or 'I'll take the second one'."""
        product = db.get(Product, product_id)
        if not product:
            return json.dumps({"error": "Product not found"})
        if product.stock < quantity:
            return json.dumps({"error": f"Only {product.stock} of '{product.name}' left in stock"})

        existing = (
            db.query(CartItem)
            .filter(CartItem.user_id == current_user.id, CartItem.product_id == product_id)
            .first()
        )
        if existing:
            existing.quantity += quantity
        else:
            db.add(CartItem(user_id=current_user.id, product_id=product_id, quantity=quantity))
        db.commit()
        return json.dumps({"message": f"Added {quantity} x '{product.name}' to cart"})

    @tool
    def view_cart() -> str:
        """View the current contents of the customer's shopping cart, including subtotal."""
        items = db.query(CartItem).filter(CartItem.user_id == current_user.id).all()
        subtotal = sum(i.product.final_price * i.quantity for i in items)
        return json.dumps(
            {
                "items": [
                    {"cart_item_id": i.id, "product": i.product.name, "quantity": i.quantity, "unit_price": i.product.final_price}
                    for i in items
                ],
                "subtotal": round(subtotal, 2),
            }
        )

    @tool
    def remove_from_cart(product_id: int) -> str:
        """Remove a product from the customer's cart entirely, by product ID."""
        item = (
            db.query(CartItem)
            .filter(CartItem.user_id == current_user.id, CartItem.product_id == product_id)
            .first()
        )
        if not item:
            return json.dumps({"error": "That item is not in the cart"})
        db.delete(item)
        db.commit()
        return json.dumps({"message": "Removed from cart"})

    @tool
    def add_to_wishlist(product_id: int) -> str:
        """Save a product to the customer's wishlist for later."""
        product = db.get(Product, product_id)
        if not product:
            return json.dumps({"error": "Product not found"})
        exists = (
            db.query(WishlistItem)
            .filter(WishlistItem.user_id == current_user.id, WishlistItem.product_id == product_id)
            .first()
        )
        if not exists:
            db.add(WishlistItem(user_id=current_user.id, product_id=product_id))
            db.commit()
        return json.dumps({"message": f"Added '{product.name}' to wishlist"})

    @tool
    def validate_coupon(code: str, order_subtotal: float) -> str:
        """Check whether a coupon code is valid for a given order subtotal, and
        return the discount it would apply. Use when the customer mentions a
        promo code or asks 'do you have any discounts'."""
        coupon = db.query(Coupon).filter(Coupon.code == code.upper()).first()
        if not coupon or not coupon.is_active:
            return json.dumps({"valid": False, "message": "Coupon code not found"})
        if coupon.expires_at and coupon.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
            return json.dumps({"valid": False, "message": "Coupon has expired"})
        if order_subtotal < coupon.min_order_value:
            return json.dumps(
                {"valid": False, "message": f"Order must be at least ${coupon.min_order_value:.2f}"}
            )
        if coupon.type == CouponType.percent:
            discount = order_subtotal * (coupon.value / 100)
            if coupon.max_discount:
                discount = min(discount, coupon.max_discount)
        else:
            discount = coupon.value
        discount = round(min(discount, order_subtotal), 2)
        return json.dumps({"valid": True, "discount_amount": discount, "final_total": round(order_subtotal - discount, 2)})

    @tool
    def list_active_coupons() -> str:
        """List all currently active, non-expired coupon codes and what they offer.
        Use when a customer asks 'do you have any coupons or discounts available'."""
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        coupons = db.query(Coupon).filter(Coupon.is_active == True).all()  # noqa: E712
        active = [c for c in coupons if not c.expires_at or c.expires_at > now]
        return json.dumps(
            [{"code": c.code, "type": c.type.value, "value": c.value, "min_order_value": c.min_order_value} for c in active]
        )

    return [add_to_cart, view_cart, remove_from_cart, add_to_wishlist, validate_coupon, list_active_coupons]
