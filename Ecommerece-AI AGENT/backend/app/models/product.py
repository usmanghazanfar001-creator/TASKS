from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)

    products: Mapped[list["Product"]] = relationship(back_populates="brand")


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    brand_id: Mapped[int] = mapped_column(ForeignKey("brands.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))

    price: Mapped[float] = mapped_column(Float, nullable=False)
    discount_percent: Mapped[float] = mapped_column(Float, default=0.0)
    stock: Mapped[int] = mapped_column(Integer, default=0)

    rating_avg: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)

    color: Mapped[str] = mapped_column(String(50), default="")
    size: Mapped[str] = mapped_column(String(50), default="")
    weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    warranty_months: Mapped[int] = mapped_column(Integer, default=0)
    delivery_days: Mapped[int] = mapped_column(Integer, default=3)

    specifications: Mapped[str] = mapped_column(Text, default="{}")  # JSON string
    tags: Mapped[str] = mapped_column(String(500), default="")  # comma separated
    image_url: Mapped[str] = mapped_column(String(500), default="")
    is_eco_friendly: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    brand: Mapped["Brand"] = relationship(back_populates="products")
    category: Mapped["Category"] = relationship(back_populates="products")
    reviews: Mapped[list["Review"]] = relationship(back_populates="product", cascade="all, delete-orphan")

    @property
    def final_price(self) -> float:
        return round(self.price * (1 - self.discount_percent / 100), 2)

    @property
    def in_stock(self) -> bool:
        return self.stock > 0


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    title: Mapped[str] = mapped_column(String(200), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    product: Mapped["Product"] = relationship(back_populates="reviews")
    user: Mapped["User"] = relationship(back_populates="reviews")


class RecentlyViewed(Base):
    __tablename__ = "recently_viewed"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    viewed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProductImage(Base):
    """Uploaded product photo, stored in the database so it survives restarts on any host."""

    __tablename__ = "product_images"

    id: Mapped[int] = mapped_column(primary_key=True)
    content_type: Mapped[str] = mapped_column(String(50), default="image/jpeg")
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
