from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    price: float
    discount_percent: float
    final_price: float
    stock: int
    in_stock: bool
    rating_avg: float
    rating_count: int
    color: str
    size: str
    weight_kg: float
    warranty_months: int
    delivery_days: int
    tags: str
    image_url: str
    is_eco_friendly: bool
    brand_name: str = ""
    category_name: str = ""

    @classmethod
    def from_orm_with_relations(cls, product):
        data = cls.model_validate(product).model_dump()
        data["brand_name"] = product.brand.name if product.brand else ""
        data["category_name"] = product.category.name if product.category else ""
        return cls(**data)


class ProductCreate(BaseModel):
    name: str
    description: str = ""
    brand_name: str
    category_name: str
    price: float
    discount_percent: float = 0.0
    stock: int = 0
    color: str = ""
    size: str = ""
    weight_kg: float = 0.0
    warranty_months: int = 0
    delivery_days: int = 3
    tags: str = ""
    image_url: str = ""
    is_eco_friendly: bool = False


class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    rating: int
    title: str
    body: str
    created_at: datetime
    user_id: int


class ReviewCreate(BaseModel):
    rating: int
    title: str = ""
    body: str = ""
