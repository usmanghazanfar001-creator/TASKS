import enum
import secrets
from datetime import datetime

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class OrderStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    shipped = "shipped"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    cancelled = "cancelled"
    returned = "returned"


def generate_order_number() -> str:
    return "ORD-" + secrets.token_hex(5).upper()


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_number: Mapped[str] = mapped_column(String(30), unique=True, default=generate_order_number)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.pending)

    subtotal: Mapped[float] = mapped_column(Float, default=0.0)
    discount_total: Mapped[float] = mapped_column(Float, default=0.0)
    shipping_cost: Mapped[float] = mapped_column(Float, default=0.0)
    total: Mapped[float] = mapped_column(Float, default=0.0)

    coupon_code: Mapped[str] = mapped_column(String(50), default="")
    shipping_address_id: Mapped[int | None] = mapped_column(ForeignKey("addresses.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    estimated_delivery: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_reason: Mapped[str] = mapped_column(String(500), default="")

    user: Mapped["User"] = relationship(back_populates="orders")
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payment: Mapped["Payment"] = relationship(back_populates="order", uselist=False, cascade="all, delete-orphan")


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    product_name: Mapped[str] = mapped_column(String(255))  # snapshot at purchase time
    unit_price: Mapped[float] = mapped_column(Float)
    quantity: Mapped[int] = mapped_column(Integer, default=1)

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product"] = relationship()


class PaymentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    failed = "failed"
    refunded = "refunded"


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), unique=True)
    method: Mapped[str] = mapped_column(String(50), default="card")
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus), default=PaymentStatus.pending)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    transaction_ref: Mapped[str] = mapped_column(String(100), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    order: Mapped["Order"] = relationship(back_populates="payment")


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    subject: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(String(2000))
    status: Mapped[str] = mapped_column(String(30), default="open")
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="support_tickets")


class Conversation(Base):
    """A single chat turn, used both for AI memory and admin conversation logs."""
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    session_id: Mapped[str] = mapped_column(String(100), index=True)
    role: Mapped[str] = mapped_column(String(20))  # user | assistant | tool
    content: Mapped[str] = mapped_column(String(4000))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship(back_populates="conversations")
