from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.order import OrderStatus


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    product_id: int
    product_name: str
    unit_price: float
    quantity: int


class OrderCreate(BaseModel):
    shipping_address_id: int | None = None
    coupon_code: str = ""
    payment_method: str = "card"


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    order_number: str
    status: OrderStatus
    subtotal: float
    discount_total: float
    shipping_cost: float
    total: float
    created_at: datetime
    estimated_delivery: datetime | None
    items: list[OrderItemOut]


class OrderCancel(BaseModel):
    reason: str = ""


class SupportTicketCreate(BaseModel):
    subject: str
    description: str
    order_id: int | None = None


class SupportTicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    subject: str
    description: str
    status: str
    created_at: datetime
