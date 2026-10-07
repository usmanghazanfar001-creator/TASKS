from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cart import CartItem, Coupon, CouponType
from app.models.order import Order, OrderItem, OrderStatus, Payment, PaymentStatus, SupportTicket
from app.models.user import User
from app.schemas.order import (
    OrderCancel,
    OrderCreate,
    OrderOut,
    SupportTicketCreate,
    SupportTicketOut,
)
from app.services.deps import get_current_user

router = APIRouter(prefix="/api/orders", tags=["orders"])

# Simple flat-rate + weight based shipping model, used by both the
# checkout endpoint and the AI shipping-cost-calculator tool.
# Amounts are in Rs. - edit these to match your delivery charges.
BASE_SHIPPING = 250.0
FREE_SHIPPING_THRESHOLD = 5000.0
PER_KG_RATE = 100.0


def calculate_shipping(subtotal: float, total_weight_kg: float = 1.0) -> float:
    if subtotal >= FREE_SHIPPING_THRESHOLD:
        return 0.0
    return round(BASE_SHIPPING + PER_KG_RATE * max(total_weight_kg - 1, 0), 2)


@router.post("", response_model=OrderOut, status_code=201)
def checkout(payload: OrderCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cart_items = db.query(CartItem).filter(CartItem.user_id == current_user.id).all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    for ci in cart_items:
        if ci.product.stock < ci.quantity:
            raise HTTPException(status_code=400, detail=f"'{ci.product.name}' no longer has enough stock")

    subtotal = sum(ci.product.final_price * ci.quantity for ci in cart_items)
    total_weight = sum((ci.product.weight_kg or 0.5) * ci.quantity for ci in cart_items)
    shipping_cost = calculate_shipping(subtotal, total_weight)

    discount_total = 0.0
    coupon_code = ""
    if payload.coupon_code:
        coupon = db.query(Coupon).filter(Coupon.code == payload.coupon_code.upper(), Coupon.is_active == True).first()  # noqa: E712
        if coupon and subtotal >= coupon.min_order_value:
            if coupon.type == CouponType.percent:
                discount_total = subtotal * (coupon.value / 100)
                if coupon.max_discount:
                    discount_total = min(discount_total, coupon.max_discount)
            else:
                discount_total = coupon.value
            discount_total = round(min(discount_total, subtotal), 2)
            coupon.times_used += 1
            coupon_code = coupon.code

    total = round(subtotal - discount_total + shipping_cost, 2)

    order = Order(
        user_id=current_user.id,
        status=OrderStatus.confirmed,
        subtotal=round(subtotal, 2),
        discount_total=discount_total,
        shipping_cost=shipping_cost,
        total=total,
        coupon_code=coupon_code,
        shipping_address_id=payload.shipping_address_id,
        estimated_delivery=datetime.utcnow() + timedelta(days=max((ci.product.delivery_days for ci in cart_items), default=3)),
    )
    db.add(order)
    db.flush()

    for ci in cart_items:
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=ci.product_id,
                product_name=ci.product.name,
                unit_price=ci.product.final_price,
                quantity=ci.quantity,
            )
        )
        ci.product.stock -= ci.quantity
        db.delete(ci)

    db.add(Payment(order_id=order.id, method=payload.payment_method, status=PaymentStatus.paid, amount=total))

    db.commit()
    db.refresh(order)
    return order


@router.get("", response_model=list[OrderOut])
def list_orders(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Order).filter(Order.user_id == current_user.id).order_by(Order.created_at.desc()).all()


@router.get("/{order_ref}", response_model=OrderOut)
def get_order(order_ref: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Look up by numeric id or human-friendly order_number (e.g. ORD-AB12CD)."""
    query = db.query(Order).filter(Order.user_id == current_user.id)
    order = None
    if order_ref.isdigit():
        order = query.filter(Order.id == int(order_ref)).first()
    if not order:
        order = query.filter(Order.order_number == order_ref.upper()).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/{order_ref}/cancel", response_model=OrderOut)
def cancel_order(
    order_ref: str,
    payload: OrderCancel,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = get_order(order_ref, current_user, db)
    if order.status in (OrderStatus.shipped, OrderStatus.out_for_delivery, OrderStatus.delivered):
        raise HTTPException(status_code=400, detail=f"Order already {order.status.value} and can no longer be cancelled")
    if order.status == OrderStatus.cancelled:
        raise HTTPException(status_code=400, detail="Order is already cancelled")

    order.status = OrderStatus.cancelled
    order.cancelled_reason = payload.reason
    # restock
    for item in order.items:
        product = item.product
        if product:
            product.stock += item.quantity
    db.commit()
    db.refresh(order)
    return order


@router.get("/shipping/estimate")
def shipping_estimate(subtotal: float, weight_kg: float = 1.0):
    return {
        "shipping_cost": calculate_shipping(subtotal, weight_kg),
        "free_shipping_threshold": FREE_SHIPPING_THRESHOLD,
        "qualifies_for_free_shipping": subtotal >= FREE_SHIPPING_THRESHOLD,
    }


@router.get("/policies/returns")
def return_policy():
    return {
        "policy": (
            "Items may be returned within 30 days of delivery in original condition. "
            "Electronics must include all original accessories and packaging. "
            "Refunds are issued to the original payment method within 5-7 business days "
            "of the returned item being received. Final-sale and personal-care items are not eligible."
        )
    }


@router.post("/support-tickets", response_model=SupportTicketOut, status_code=201)
def create_support_ticket(
    payload: SupportTicketCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    ticket = SupportTicket(user_id=current_user.id, **payload.model_dump())
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/support-tickets/mine", response_model=list[SupportTicketOut])
def my_support_tickets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(SupportTicket).filter(SupportTicket.user_id == current_user.id).all()
