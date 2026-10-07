from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app import models  # noqa: F401  (ensures all models are registered)
from app.api import admin, auth, cart, chat, orders, products
from app.config import settings
from app.database import Base, engine

Base.metadata.create_all(bind=engine)


def _bootstrap_admin() -> None:
    """Create the store owner's admin account from ADMIN_EMAIL / ADMIN_PASSWORD (first start only)."""
    if not (settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD):
        return
    from app.database import SessionLocal
    from app.models.user import User, UserRole
    from app.services.auth_service import hash_password

    with SessionLocal() as db:
        if not db.query(User).filter(User.email == settings.ADMIN_EMAIL).first():
            db.add(
                User(
                    email=settings.ADMIN_EMAIL,
                    hashed_password=hash_password(settings.ADMIN_PASSWORD),
                    full_name="Store Admin",
                    role=UserRole.admin,
                    preferred_currency="PKR",
                )
            )
            db.commit()


_bootstrap_admin()

app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered e-commerce assistant API - product search, cart, orders, and a LangGraph shopping agent.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(cart.router)
app.include_router(orders.router)
app.include_router(chat.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {"status": "healthy"}


# --- Uploaded product photos ---
UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
# (Older local uploads only; new photos are stored in the database.)
if UPLOAD_DIR.is_dir():
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# --- Serve the built React frontend from this same server (one platform) ---
# Build it once with:  cd frontend && npm install && npm run build
FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith(("api/", "uploads/", "docs", "openapi.json", "redoc")):
            raise HTTPException(status_code=404)
        candidate = (FRONTEND_DIST / full_path).resolve()
        if full_path and candidate.is_file() and FRONTEND_DIST in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
else:

    @app.get("/")
    def root():
        return {
            "name": settings.APP_NAME,
            "status": "ok",
            "docs": "/docs",
            "note": "Frontend not built yet. Run: cd frontend && npm install && npm run build",
        }
