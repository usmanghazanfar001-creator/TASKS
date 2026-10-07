"""
Import every model module here so SQLAlchemy sees all mapped classes
before any relationship() string references are resolved, and so
`Base.metadata.create_all()` in main.py picks up every table.
"""
from app.models.user import User, Address, UserRole  # noqa: F401
from app.models.product import Category, Brand, Product, ProductImage, Review, RecentlyViewed  # noqa: F401
from app.models.cart import CartItem, WishlistItem, Coupon, CouponType  # noqa: F401
from app.models.order import (  # noqa: F401
    Order,
    OrderItem,
    OrderStatus,
    Payment,
    PaymentStatus,
    SupportTicket,
    Conversation,
)
