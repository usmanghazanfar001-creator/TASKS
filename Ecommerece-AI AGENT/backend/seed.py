"""
Seed the database with demo data: categories, brands, products, coupons,
and a demo customer + admin account.

Run with:  python seed.py
"""
import json
from datetime import datetime, timedelta

from app.database import Base, SessionLocal, engine
from app.models.cart import Coupon, CouponType
from app.models.product import Brand, Category, Product, Review
from app.models.user import User, UserRole
from app.services.auth_service import hash_password

Base.metadata.create_all(bind=engine)
db = SessionLocal()

if db.query(Product).count() > 0:
    print("Database already has products - skipping seed. Delete ecommerce_ai.db to reseed.")
    db.close()
    raise SystemExit(0)

# --- Categories & brands ------------------------------------------------

categories = {
    name: Category(name=name, slug=name.lower().replace(" ", "-"))
    for name in ["Laptops", "Smartphones", "Smartwatches", "Footwear", "Home", "Audio"]
}
db.add_all(categories.values())

brands = {
    name: Brand(name=name)
    for name in ["Apple", "Samsung", "Google", "Dell", "Nike", "Adidas", "Sony", "EcoHome", "Bose", "Lenovo"]
}
db.add_all(brands.values())
db.flush()

# --- Products -------------------------------------------------------------

products_data = [
    dict(
        name="MacBook Air 15 M3", brand="Apple", category="Laptops",
        description="Thin and light 15-inch laptop with the M3 chip, all-day battery life.",
        price=1299.00, discount_percent=0, stock=25, color="Midnight", size="15-inch",
        weight_kg=1.51, warranty_months=12, delivery_days=3,
        specs={"cpu": "Apple M3", "ram": "16GB", "storage": "512GB SSD", "display": "15.3-inch Liquid Retina"},
        tags="laptop,apple,macbook,ultrabook,student", image_url="", eco=False,
    ),
    dict(
        name="Dell XPS 13", brand="Dell", category="Laptops",
        description="Compact Windows ultrabook with a stunning InfinityEdge display, great for gaming-lite and productivity.",
        price=899.00, discount_percent=10, stock=18, color="Silver", size="13-inch",
        weight_kg=1.2, warranty_months=12, delivery_days=4,
        specs={"cpu": "Intel Core i7", "ram": "16GB", "storage": "512GB SSD", "gpu": "Intel Iris Xe"},
        tags="laptop,dell,windows,ultrabook,budget", image_url="", eco=False,
    ),
    dict(
        name="Lenovo Legion 5 Gaming Laptop", brand="Lenovo", category="Laptops",
        description="Gaming laptop with dedicated RTX graphics, high refresh display, and strong cooling.",
        price=1149.00, discount_percent=5, stock=12, color="Black", size="15.6-inch",
        weight_kg=2.4, warranty_months=12, delivery_days=5,
        specs={"cpu": "AMD Ryzen 7", "ram": "16GB", "storage": "1TB SSD", "gpu": "RTX 4060"},
        tags="laptop,gaming,lenovo,rtx", image_url="", eco=False,
    ),
    dict(
        name="iPhone 15", brand="Apple", category="Smartphones",
        description="Apple's latest mainstream iPhone with a 48MP main camera and USB-C.",
        price=799.00, discount_percent=0, stock=40, color="Blue", size="6.1-inch",
        weight_kg=0.171, warranty_months=12, delivery_days=2,
        specs={"chip": "A16 Bionic", "storage": "128GB", "camera": "48MP main"},
        tags="phone,apple,iphone,smartphone", image_url="", eco=False,
    ),
    dict(
        name="Samsung Galaxy S24", brand="Samsung", category="Smartphones",
        description="Flagship Android phone with a bright AMOLED display and AI photo tools.",
        price=799.99, discount_percent=8, stock=35, color="Onyx Black", size="6.2-inch",
        weight_kg=0.168, warranty_months=12, delivery_days=2,
        specs={"chip": "Snapdragon 8 Gen 3", "storage": "256GB", "camera": "50MP main"},
        tags="phone,samsung,galaxy,android,smartphone", image_url="", eco=False,
    ),
    dict(
        name="Google Pixel 9", brand="Google", category="Smartphones",
        description="Google's flagship with the best-in-class computational photography and clean Android.",
        price=699.00, discount_percent=0, stock=30, color="Obsidian", size="6.3-inch",
        weight_kg=0.198, warranty_months=12, delivery_days=3,
        specs={"chip": "Google Tensor G4", "storage": "128GB", "camera": "50MP main"},
        tags="phone,google,pixel,android,smartphone", image_url="", eco=False,
    ),
    dict(
        name="Apple Watch Series 10", brand="Apple", category="Smartwatches",
        description="Waterproof smartwatch with advanced health tracking and a bright always-on display.",
        price=429.00, discount_percent=0, stock=22, color="Starlight", size="42mm",
        weight_kg=0.039, warranty_months=12, delivery_days=2,
        specs={"water_resistance": "50m", "battery_life": "18 hours", "display": "LTPO OLED"},
        tags="smartwatch,apple,waterproof,fitness,health", image_url="", eco=False,
    ),
    dict(
        name="Samsung Galaxy Watch 6", brand="Samsung", category="Smartwatches",
        description="Waterproof Android smartwatch with sleep coaching and body composition analysis.",
        price=299.99, discount_percent=15, stock=28, color="Graphite", size="44mm",
        weight_kg=0.034, warranty_months=12, delivery_days=3,
        specs={"water_resistance": "50m", "battery_life": "40 hours", "display": "AMOLED"},
        tags="smartwatch,samsung,waterproof,fitness,health", image_url="", eco=False,
    ),
    dict(
        name="Nike Air Zoom Pegasus", brand="Nike", category="Footwear",
        description="Versatile everyday running shoe with responsive cushioning; a supportive fit that works well for runners with flat feet.",
        price=130.00, discount_percent=0, stock=60, color="Black/White", size="US 9-13",
        weight_kg=0.28, warranty_months=6, delivery_days=3,
        specs={"terrain": "road", "arch_support": "supportive/stability", "drop": "10mm"},
        tags="shoes,running,nike,flat feet,stability", image_url="", eco=False,
    ),
    dict(
        name="Adidas Terrex Free Hiker", brand="Adidas", category="Footwear",
        description="Rugged hiking shoe with BOOST cushioning and a grippy Continental rubber outsole for varied terrain.",
        price=180.00, discount_percent=12, stock=40, color="Olive", size="US 8-13",
        weight_kg=0.34, warranty_months=6, delivery_days=4,
        specs={"terrain": "trail/hiking", "waterproof": "GORE-TEX", "arch_support": "neutral"},
        tags="shoes,hiking,adidas,outdoor,waterproof", image_url="", eco=True,
    ),
    dict(
        name="Sony WH-1000XM5 Headphones", brand="Sony", category="Audio",
        description="Industry-leading noise-cancelling over-ear headphones with 30-hour battery life.",
        price=399.99, discount_percent=20, stock=33, color="Black", size="Over-ear",
        weight_kg=0.25, warranty_months=12, delivery_days=2,
        specs={"battery_life": "30 hours", "noise_cancelling": "yes", "bluetooth": "5.2"},
        tags="headphones,sony,audio,noise cancelling,travel", image_url="", eco=False,
    ),
    dict(
        name="Bose SoundLink Flex", brand="Bose", category="Audio",
        description="Compact, rugged waterproof Bluetooth speaker with surprisingly big, clear sound.",
        price=149.00, discount_percent=0, stock=50, color="Stone Blue", size="Portable",
        weight_kg=0.59, warranty_months=12, delivery_days=3,
        specs={"battery_life": "12 hours", "waterproof": "IP67", "bluetooth": "5.1"},
        tags="speaker,bose,bluetooth,waterproof,portable", image_url="", eco=False,
    ),
    dict(
        name="EcoHome Bamboo Kitchen Set", brand="EcoHome", category="Home",
        description="6-piece kitchen utensil set made from sustainably sourced bamboo, plastic-free packaging.",
        price=39.99, discount_percent=0, stock=80, color="Natural", size="6-piece",
        weight_kg=0.6, warranty_months=0, delivery_days=5,
        specs={"material": "bamboo", "dishwasher_safe": "hand wash recommended"},
        tags="kitchen,eco-friendly,sustainable,bamboo,gift", image_url="", eco=True,
    ),
    dict(
        name="EcoHome Solar Garden Lights (Set of 8)", brand="EcoHome", category="Home",
        description="Solar-powered LED garden lights, no wiring needed, recycled aluminum housing.",
        price=34.99, discount_percent=25, stock=70, color="Warm White", size="Set of 8",
        weight_kg=1.1, warranty_months=12, delivery_days=5,
        specs={"power": "solar", "material": "recycled aluminum", "runtime": "8 hours"},
        tags="home,garden,eco-friendly,solar,outdoor", image_url="", eco=True,
    ),
    dict(
        name="Samsung 55-inch QLED TV", brand="Samsung", category="Home",
        description="4K QLED smart TV with vibrant color and built-in streaming apps.",
        price=649.99, discount_percent=18, stock=15, color="Black", size="55-inch",
        weight_kg=14.0, warranty_months=24, delivery_days=6,
        specs={"resolution": "4K QLED", "smart_platform": "Tizen", "refresh_rate": "120Hz"},
        tags="tv,samsung,home,entertainment,4k", image_url="", eco=False,
    ),
]

created_products = []
for p in products_data:
    product = Product(
        name=p["name"],
        description=p["description"],
        brand_id=brands[p["brand"]].id,
        category_id=categories[p["category"]].id,
        price=p["price"],
        discount_percent=p["discount_percent"],
        stock=p["stock"],
        color=p["color"],
        size=p["size"],
        weight_kg=p["weight_kg"],
        warranty_months=p["warranty_months"],
        delivery_days=p["delivery_days"],
        specifications=json.dumps(p["specs"]),
        tags=p["tags"],
        image_url=p["image_url"],
        is_eco_friendly=p["eco"],
    )
    db.add(product)
    created_products.append(product)

db.flush()

# --- Demo users -------------------------------------------------------------

admin_user = User(
    email="admin@shop.ai",
    hashed_password=hash_password("Admin123!"),
    full_name="Store Admin",
    role=UserRole.admin,
)
support_user = User(
    email="support@shop.ai",
    hashed_password=hash_password("Support123!"),
    full_name="Support Agent",
    role=UserRole.support_agent,
)
demo_customer = User(
    email="demo@shop.ai",
    hashed_password=hash_password("Demo123!"),
    full_name="Demo Customer",
    role=UserRole.customer,
    preferred_brands="Apple,Sony",
)
db.add_all([admin_user, support_user, demo_customer])
db.flush()

# --- A few seed reviews so summarize_reviews / rating_avg have real data ---

sample_reviews = [
    (created_products[0], 5, "Fantastic battery life", "Lasts me a full day of coding and video calls easily."),
    (created_products[0], 4, "Great but pricey", "Love the build quality, wish it was a bit cheaper."),
    (created_products[8], 5, "Perfect for flat feet", "First running shoe that doesn't leave my arches aching."),
    (created_products[9], 5, "Handled a muddy trail with no issue", "Grippy soles and my feet stayed dry the whole hike."),
    (created_products[10], 5, "Best noise cancelling I've tried", "Silences airplane engine noise almost completely."),
]
for product, rating, title, body in sample_reviews:
    db.add(Review(product_id=product.id, user_id=demo_customer.id, rating=rating, title=title, body=body))
    total_points = product.rating_avg * product.rating_count + rating
    product.rating_count += 1
    product.rating_avg = round(total_points / product.rating_count, 2)

# --- Coupons ------------------------------------------------------------

coupons = [
    Coupon(code="WELCOME10", type=CouponType.percent, value=10, min_order_value=0, max_discount=50,
           expires_at=datetime.utcnow() + timedelta(days=365)),
    Coupon(code="SAVE20", type=CouponType.percent, value=20, min_order_value=150, max_discount=100,
           expires_at=datetime.utcnow() + timedelta(days=60)),
    Coupon(code="FLAT15", type=CouponType.fixed, value=15, min_order_value=50,
           expires_at=datetime.utcnow() + timedelta(days=90)),
]
db.add_all(coupons)

db.commit()
db.close()

print("Seed complete.")
print(f"  {len(created_products)} products, {len(categories)} categories, {len(brands)} brands, {len(coupons)} coupons")
print("Demo accounts:")
print("  Admin:    admin@shop.ai / Admin123!")
print("  Support:  support@shop.ai / Support123!")
print("  Customer: demo@shop.ai / Demo123!")
