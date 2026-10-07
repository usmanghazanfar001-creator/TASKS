import json

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.models.order import Order, OrderStatus, SupportTicket
from app.models.user import User


def make_order_tools(db: Session, current_user: User):
    @tool
    def track_order(order_number: str) -> str:
        """Look up the status of a customer's order by its order number
        (e.g. 'ORD-AB12CD') or numeric ID. Use when the customer asks
        'where is my order' or 'track my order'."""
        query = db.query(Order).filter(Order.user_id == current_user.id)
        order = None
        ref = order_number.strip()
        if ref.isdigit():
            order = query.filter(Order.id == int(ref)).first()
        if not order:
            order = query.filter(Order.order_number == ref.upper()).first()
        if not order:
            return json.dumps({"error": "No order found with that number"})
        return json.dumps(
            {
                "order_number": order.order_number,
                "status": order.status.value,
                "total": order.total,
                "estimated_delivery": order.estimated_delivery.isoformat() if order.estimated_delivery else None,
                "items": [{"product": i.product_name, "quantity": i.quantity} for i in order.items],
            }
        )

    @tool
    def list_my_orders(limit: int = 5) -> str:
        """List the customer's most recent orders with status and total. Use when
        they ask 'what have I ordered' or don't have a specific order number."""
        orders = (
            db.query(Order)
            .filter(Order.user_id == current_user.id)
            .order_by(Order.created_at.desc())
            .limit(limit)
            .all()
        )
        return json.dumps(
            [
                {"order_number": o.order_number, "status": o.status.value, "total": o.total, "created_at": o.created_at.isoformat()}
                for o in orders
            ]
        )

    @tool
    def cancel_order(order_number: str, reason: str = "") -> str:
        """Cancel a customer's order, if it hasn't shipped yet. Use when the customer
        explicitly asks to cancel an order. Always confirm the order number with the
        customer before calling this."""
        query = db.query(Order).filter(Order.user_id == current_user.id)
        ref = order_number.strip()
        order = query.filter(Order.id == int(ref)).first() if ref.isdigit() else None
        if not order:
            order = query.filter(Order.order_number == ref.upper()).first()
        if not order:
            return json.dumps({"error": "No order found with that number"})
        if order.status in (OrderStatus.shipped, OrderStatus.out_for_delivery, OrderStatus.delivered):
            return json.dumps({"error": f"Order already {order.status.value} and can no longer be cancelled"})
        if order.status == OrderStatus.cancelled:
            return json.dumps({"error": "Order is already cancelled"})

        order.status = OrderStatus.cancelled
        order.cancelled_reason = reason
        for item in order.items:
            if item.product:
                item.product.stock += item.quantity
        db.commit()
        return json.dumps({"message": f"Order {order.order_number} has been cancelled"})

    @tool
    def calculate_shipping_cost(subtotal: float, weight_kg: float = 1.0) -> str:
        """Estimate shipping cost for a given order subtotal and total weight in kg.
        Orders at or above the free-shipping threshold ship free. Amounts are in Rs."""
        from app.api.orders import calculate_shipping, FREE_SHIPPING_THRESHOLD

        cost = calculate_shipping(subtotal, weight_kg)
        return json.dumps({"shipping_cost": cost, "free_shipping_threshold": FREE_SHIPPING_THRESHOLD})

    @tool
    def get_return_policy() -> str:
        """Return the store's return policy text. Use when a customer asks about
        returns, refunds, or exchanges."""
        return json.dumps(
            {
                "policy": (
                    "Items may be returned within 30 days of delivery in original condition. "
                    "Electronics must include all original accessories and packaging. Refunds are "
                    "issued to the original payment method within 5-7 business days of receipt. "
                    "Final-sale and personal-care items are not eligible."
                )
            }
        )

    @tool
    def create_support_ticket(subject: str, description: str, order_number: str = "") -> str:
        """File a customer support ticket for issues the assistant can't resolve
        directly (e.g. damaged item, billing dispute). Use as a last resort after
        trying to help directly."""
        order_id = None
        if order_number:
            order = (
                db.query(Order)
                .filter(Order.user_id == current_user.id, Order.order_number == order_number.upper())
                .first()
            )
            order_id = order.id if order else None
        ticket = SupportTicket(user_id=current_user.id, subject=subject, description=description, order_id=order_id)
        db.add(ticket)
        db.commit()
        db.refresh(ticket)
        return json.dumps({"message": "Support ticket created", "ticket_id": ticket.id})

    return [track_order, list_my_orders, cancel_order, calculate_shipping_cost, get_return_policy, create_support_ticket]
