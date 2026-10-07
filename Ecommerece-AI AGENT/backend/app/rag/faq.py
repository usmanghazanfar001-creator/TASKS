"""
Minimal RAG-style knowledge base for store policies and FAQs.

For this demo it uses simple keyword/TF scoring over a small in-memory
corpus, so it runs with zero external dependencies. To swap in a real
vector store (pgvector, Chroma, Pinecone) for production, replace the
`search_faq` implementation - the tool interface in misc_tools.py that
calls it stays the same, as would the embedding step you'd add to
`Product Embeddings` in the DB for semantic product search.
"""
import re

KNOWLEDGE_BASE = [
    {
        "topic": "Shipping",
        "text": (
            "Standard shipping takes 3-7 business days depending on the product. "
            "Orders of Rs. 5,000 or more ship free. Expedited 2-day shipping is available at "
            "checkout for an additional fee. We currently ship within Pakistan."
        ),
    },
    {
        "topic": "Returns",
        "text": (
            "Items may be returned within 30 days of delivery in original condition "
            "with all original packaging and accessories. Refunds go back to the "
            "original payment method within 5-7 business days of us receiving the item. "
            "Final-sale items, gift cards, and opened personal-care products are not "
            "eligible for return."
        ),
    },
    {
        "topic": "Warranty",
        "text": (
            "Most electronics carry a manufacturer warranty of 12-24 months against "
            "defects, shown on each product page. Warranty claims are handled by "
            "opening a support ticket with your order number; we will coordinate "
            "repair, replacement, or refund with the manufacturer."
        ),
    },
    {
        "topic": "Order changes",
        "text": (
            "Orders can be modified or cancelled only before they ship - once an order "
            "status is 'shipped' it can no longer be changed, but you can request a "
            "return once it arrives. To change a shipping address, contact support "
            "before the order ships."
        ),
    },
    {
        "topic": "Payments",
        "text": (
            "We accept all major credit and debit cards. Payment is captured at the "
            "time of checkout. If a payment fails, the order is held as 'pending' and "
            "you'll be prompted to retry with a different payment method."
        ),
    },
    {
        "topic": "Account & Password",
        "text": (
            "You can reset your password from the login page's 'Forgot password' link. "
            "For security, reset links expire after 30 minutes. Update your email, "
            "shipping addresses, and saved payment methods anytime from your account "
            "profile page."
        ),
    },
    {
        "topic": "Coupons & Promotions",
        "text": (
            "Coupon codes are entered at checkout and apply to the order subtotal "
            "before shipping. Only one coupon can be used per order. Some coupons "
            "have a minimum order value or a maximum discount cap, shown when you "
            "validate the code."
        ),
    },
    {
        "topic": "Eco-friendly products",
        "text": (
            "Products tagged 'eco-friendly' meet at least one of: recycled/recyclable "
            "packaging, sustainably sourced materials, or a manufacturer carbon-neutral "
            "certification. Use the eco-friendly filter on search to browse them."
        ),
    },
]


def _score(query: str, text: str) -> int:
    query_terms = set(re.findall(r"[a-z]+", query.lower()))
    text_terms = set(re.findall(r"[a-z]+", text.lower()))
    return len(query_terms & text_terms)


def search_faq(query: str, top_k: int = 3) -> list[dict]:
    scored = [
        {**entry, "score": _score(query, entry["topic"] + " " + entry["text"])} for entry in KNOWLEDGE_BASE
    ]
    scored = [s for s in scored if s["score"] > 0]
    scored.sort(key=lambda s: s["score"], reverse=True)
    if not scored:
        # Fall back to returning the most likely general policies rather than nothing
        return [{"topic": e["topic"], "text": e["text"]} for e in KNOWLEDGE_BASE[:top_k]]
    return [{"topic": s["topic"], "text": s["text"]} for s in scored[:top_k]]
