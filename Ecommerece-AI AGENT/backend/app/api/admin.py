from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.cart import Coupon
from app.models.order import Conversation, Order, OrderStatus, SupportTicket
from app.models.product import Product, Review
from app.models.user import User
from app.services.deps import require_admin, require_staff

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/analytics/dashboard")
def dashboard_analytics(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    total_revenue = db.query(func.sum(Order.total)).filter(Order.status != OrderStatus.cancelled).scalar() or 0
    orders_last_30 = db.query(func.count(Order.id)).filter(Order.created_at >= thirty_days_ago).scalar() or 0
    total_customers = db.query(func.count(User.id)).scalar() or 0
    total_products = db.query(func.count(Product.id)).scalar() or 0
    open_tickets = db.query(func.count(SupportTicket.id)).filter(SupportTicket.status == "open").scalar() or 0
    avg_rating = db.query(func.avg(Product.rating_avg)).scalar() or 0

    orders_by_status = dict(
        db.query(Order.status, func.count(Order.id)).group_by(Order.status).all()
    )

    return {
        "total_revenue": round(total_revenue, 2),
        "orders_last_30_days": orders_last_30,
        "total_customers": total_customers,
        "total_products": total_products,
        "open_support_tickets": open_tickets,
        "average_product_rating": round(avg_rating, 2),
        "orders_by_status": {k.value if hasattr(k, "value") else k: v for k, v in orders_by_status.items()},
    }


@router.get("/analytics/revenue-chart")
def revenue_chart(days: int = 30, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(func.date(Order.created_at).label("day"), func.sum(Order.total).label("revenue"))
        .filter(Order.created_at >= since, Order.status != OrderStatus.cancelled)
        .group_by("day")
        .order_by("day")
        .all()
    )
    return [{"date": str(r.day), "revenue": round(r.revenue or 0, 2)} for r in rows]


@router.get("/orders")
def manage_orders(status: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)
    orders = query.order_by(Order.created_at.desc()).limit(100).all()
    return [
        {
            "id": o.id,
            "order_number": o.order_number,
            "customer_email": o.user.email if o.user else "",
            "status": o.status.value,
            "total": o.total,
            "created_at": o.created_at,
        }
        for o in orders
    ]


@router.patch("/orders/{order_id}/status")
def update_order_status(order_id: int, status: str, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    order = db.get(Order, order_id)
    if not order:
        return {"error": "Order not found"}
    order.status = OrderStatus(status)
    db.commit()
    return {"message": f"Order {order.order_number} updated to {status}"}


@router.get("/users")
def manage_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).limit(200).all()
    return [{"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role.value, "is_active": u.is_active} for u in users]


@router.patch("/users/{user_id}/toggle-active")
def toggle_user_active(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.get(User, user_id)
    if not user:
        return {"error": "User not found"}
    user.is_active = not user.is_active
    db.commit()
    return {"message": f"User {user.email} is now {'active' if user.is_active else 'disabled'}"}


@router.get("/coupons")
def manage_coupons(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(Coupon).all()


@router.get("/reviews")
def manage_reviews(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    reviews = db.query(Review).order_by(Review.created_at.desc()).limit(100).all()
    return [
        {"id": r.id, "product": r.product.name if r.product else "", "rating": r.rating, "title": r.title, "created_at": r.created_at}
        for r in reviews
    ]


@router.get("/support-tickets")
def manage_support_tickets(db: Session = Depends(get_db), _: User = Depends(require_staff)):
    tickets = db.query(SupportTicket).order_by(SupportTicket.created_at.desc()).limit(100).all()
    return [
        {
            "id": t.id,
            "customer_email": t.user.email if t.user else "",
            "subject": t.subject,
            "status": t.status,
            "created_at": t.created_at,
        }
        for t in tickets
    ]


@router.patch("/support-tickets/{ticket_id}/status")
def update_ticket_status(ticket_id: int, status: str, db: Session = Depends(get_db), _: User = Depends(require_staff)):
    ticket = db.get(SupportTicket, ticket_id)
    if not ticket:
        return {"error": "Ticket not found"}
    ticket.status = status
    db.commit()
    return {"message": "Ticket updated"}


@router.get("/ai-conversation-logs")
def ai_conversation_logs(session_id: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    query = db.query(Conversation)
    if session_id:
        query = query.filter(Conversation.session_id == session_id)
    logs = query.order_by(Conversation.created_at.desc()).limit(200).all()
    return [
        {"id": c.id, "user_id": c.user_id, "session_id": c.session_id, "role": c.role, "content": c.content, "created_at": c.created_at}
        for c in logs
    ]
