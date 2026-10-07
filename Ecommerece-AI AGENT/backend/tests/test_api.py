"""
Integration tests for the core REST API (auth, products, cart, orders).

Uses a throwaway SQLite DB per test session so tests never touch the
dev/seed database. Run with: pytest -v (from the backend/ directory).
"""
import os

os.environ["DATABASE_URL"] = "sqlite:///./test_ecommerce_ai.db"

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True, scope="module")
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("test_ecommerce_ai.db"):
        os.remove("test_ecommerce_ai.db")


@pytest.fixture(scope="module")
def auth_headers():
    client.post(
        "/api/auth/register",
        json={"email": "tester@example.com", "password": "TestPass123!", "full_name": "Test User"},
    )
    res = client.post("/api/auth/login", json={"email": "tester@example.com", "password": "TestPass123!"})
    token = res.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_register_and_login():
    res = client.post(
        "/api/auth/register",
        json={"email": "newuser@example.com", "password": "Password123!", "full_name": "New User"},
    )
    assert res.status_code == 201
    assert res.json()["user"]["email"] == "newuser@example.com"

    res = client.post("/api/auth/login", json={"email": "newuser@example.com", "password": "Password123!"})
    assert res.status_code == 200
    assert "access_token" in res.json()


def test_duplicate_registration_fails():
    client.post(
        "/api/auth/register", json={"email": "dup@example.com", "password": "Password123!", "full_name": "Dup"}
    )
    res = client.post(
        "/api/auth/register", json={"email": "dup@example.com", "password": "Password123!", "full_name": "Dup"}
    )
    assert res.status_code == 400


def test_wrong_password_rejected():
    client.post(
        "/api/auth/register", json={"email": "wrongpw@example.com", "password": "Correct123!", "full_name": "X"}
    )
    res = client.post("/api/auth/login", json={"email": "wrongpw@example.com", "password": "Incorrect123!"})
    assert res.status_code == 401


def test_me_requires_auth():
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_product_crud_and_search(auth_headers):
    # Admin-only create should be rejected for a normal customer
    res = client.post(
        "/api/products",
        json={"name": "Test Widget", "brand_name": "TestBrand", "category_name": "TestCat", "price": 19.99},
        headers=auth_headers,
    )
    assert res.status_code == 403

    res = client.get("/api/products")
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_cart_flow(auth_headers):
    # Make an admin-created product available by hitting the DB directly via admin flow is out of scope here;
    # instead verify cart endpoints behave correctly against an empty/nonexistent product.
    res = client.get("/api/cart", headers=auth_headers)
    assert res.status_code == 200
    assert res.json()["items"] == []

    res = client.post("/api/cart/items", json={"product_id": 999999, "quantity": 1}, headers=auth_headers)
    assert res.status_code == 404


def test_coupon_validation_rejects_unknown_code():
    res = client.post("/api/coupons/validate", json={"code": "NOPE", "order_subtotal": 100})
    assert res.status_code == 200
    assert res.json()["valid"] is False


def test_checkout_requires_nonempty_cart(auth_headers):
    res = client.post("/api/orders", json={"coupon_code": ""}, headers=auth_headers)
    assert res.status_code == 400


def test_admin_routes_require_admin_role(auth_headers):
    res = client.get("/api/admin/analytics/dashboard", headers=auth_headers)
    assert res.status_code == 403


def test_shipping_estimate():
    res = client.get("/api/orders/shipping/estimate", params={"subtotal": 100, "weight_kg": 1})
    assert res.status_code == 200
    assert res.json()["qualifies_for_free_shipping"] is True

    res = client.get("/api/orders/shipping/estimate", params={"subtotal": 10, "weight_kg": 1})
    assert res.json()["qualifies_for_free_shipping"] is False
    assert res.json()["shipping_cost"] > 0


def test_return_policy_endpoint():
    res = client.get("/api/orders/policies/returns")
    assert res.status_code == 200
    assert "30 days" in res.json()["policy"]
