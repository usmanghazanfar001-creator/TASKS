from pydantic import BaseModel, ConfigDict

from app.schemas.product import ProductOut


class CartItemAdd(BaseModel):
    product_id: int
    quantity: int = 1


class CartItemUpdate(BaseModel):
    quantity: int


class CartItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    quantity: int
    product: ProductOut


class CartOut(BaseModel):
    items: list[CartItemOut]
    subtotal: float
    item_count: int


class WishlistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    product: ProductOut


class CouponApply(BaseModel):
    code: str
    order_subtotal: float


class CouponResult(BaseModel):
    valid: bool
    message: str
    discount_amount: float = 0.0
    final_total: float = 0.0
