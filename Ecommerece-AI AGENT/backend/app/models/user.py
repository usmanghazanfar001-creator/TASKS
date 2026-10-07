import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    customer = "customer"
    admin = "admin"
    support_agent = "support_agent"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.customer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    preferred_brands: Mapped[str] = mapped_column(String(500), default="")  # comma separated, used by AI memory
    preferred_currency: Mapped[str] = mapped_column(String(10), default="USD")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    addresses: Mapped[list["Address"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    orders: Mapped[list["Order"]] = relationship(back_populates="user")
    cart_items: Mapped[list["CartItem"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    wishlist_items: Mapped[list["WishlistItem"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    reviews: Mapped[list["Review"]] = relationship(back_populates="user")
    support_tickets: Mapped[list["SupportTicket"]] = relationship(back_populates="user")
    conversations: Mapped[list["Conversation"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Address(Base):
    __tablename__ = "addresses"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    label: Mapped[str] = mapped_column(String(50), default="Home")
    line1: Mapped[str] = mapped_column(String(255))
    line2: Mapped[str] = mapped_column(String(255), default="")
    city: Mapped[str] = mapped_column(String(100))
    state: Mapped[str] = mapped_column(String(100), default="")
    postal_code: Mapped[str] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(100))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="addresses")
