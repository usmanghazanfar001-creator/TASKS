import json

from langchain_core.tools import tool
from sqlalchemy.orm import Session

from app.models.user import User
from app.rag.faq import search_faq

# Static demo exchange rates (USD base). In production, swap this for a
# real FX API call - the tool interface stays identical either way.
EXCHANGE_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "PKR": 278.5,
    "INR": 83.4,
    "CAD": 1.37,
    "AUD": 1.52,
}

STORE_LOCATIONS = [
    {"city": "New York, NY", "address": "350 5th Ave, New York, NY 10118", "hours": "9am-9pm daily"},
    {"city": "San Francisco, CA", "address": "1 Market St, San Francisco, CA 94105", "hours": "10am-8pm daily"},
    {"city": "Chicago, IL", "address": "233 S Wacker Dr, Chicago, IL 60606", "hours": "9am-9pm daily"},
    {"city": "London, UK", "address": "1 Canada Square, London E14 5AB", "hours": "9am-8pm daily"},
]


def make_misc_tools(db: Session, current_user: User):
    @tool
    def convert_currency(amount: float, from_currency: str, to_currency: str) -> str:
        """Convert a price between currencies (USD, EUR, GBP, PKR, INR, CAD, AUD).
        Use when a customer asks for a price in their own currency."""
        from_currency, to_currency = from_currency.upper(), to_currency.upper()
        if from_currency not in EXCHANGE_RATES or to_currency not in EXCHANGE_RATES:
            return json.dumps({"error": "Unsupported currency"})
        usd = amount / EXCHANGE_RATES[from_currency]
        converted = round(usd * EXCHANGE_RATES[to_currency], 2)
        return json.dumps({"amount": amount, "from": from_currency, "to": to_currency, "converted": converted})

    @tool
    def find_store_locations(city: str = "") -> str:
        """Find physical store locations, optionally filtered by city. Use when a
        customer asks about a nearby store or wants to pick up in person."""
        results = STORE_LOCATIONS
        if city:
            results = [s for s in STORE_LOCATIONS if city.lower() in s["city"].lower()]
        return json.dumps(results if results else {"message": "No stores found matching that city"})

    @tool
    def search_faqs(question: str) -> str:
        """Search the store's FAQ / policy knowledge base (shipping, warranty,
        returns, account help, etc). Use for general policy questions that aren't
        about a specific order."""
        results = search_faq(question)
        return json.dumps(results)

    @tool
    def get_customer_profile() -> str:
        """Get the current customer's saved preferences (favorite brands,
        preferred currency) to personalize recommendations. Takes no arguments."""
        return json.dumps(
            {
                "name": current_user.full_name,
                "preferred_currency": current_user.preferred_currency,
                "preferred_brands": [b.strip() for b in current_user.preferred_brands.split(",") if b.strip()],
            }
        )

    return [convert_currency, find_store_locations, search_faqs, get_customer_profile]
