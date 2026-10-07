import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CartItem(Base):
    __tablename__ = "cart_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="cart_items")
    product: Mapped["Product"] = relationship()


class WishlistItem(Base):
    __tablename__ = "wishlist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    added_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="wishlist_items")
    product: Mapped["Product"] = relationship()


class CouponType(str, enum.Enum):
    percent = "percent"
    fixed = "fixed"


class Coupon(Base):
    __tablename__ = "coupons"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    type: Mapped[CouponType] = mapped_column(Enum(CouponType), default=CouponType.percent)
    value: Mapped[float] = mapped_column(Float, nullable=False)  # percent (0-100) or fixed amount
    min_order_value: Mapped[float] = mapped_column(Float, default=0.0)
    max_discount: Mapped[float] = mapped_column(Float, default=0.0)  # 0 = no cap
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    usage_limit: Mapped[int] = mapped_column(Integer, default=0)  # 0 = unlimited
    times_used: Mapped[int] = mapped_column(Integer, default=0)
