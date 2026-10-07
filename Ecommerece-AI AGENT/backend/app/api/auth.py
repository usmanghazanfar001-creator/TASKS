from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import TokenOut, UserCreate, UserLogin, UserOut
from app.services.auth_service import create_access_token, hash_password, verify_password
from app.services.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=user.email)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")

    token = create_access_token(subject=user.email)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@router.post("/token", include_in_schema=False)
def swagger_token(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Form-based login used by the Authorize button in /docs (username = email)."""
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    return {"access_token": create_access_token(subject=user.email), "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
def forgot_password(email: str, db: Session = Depends(get_db)):
    """
    Demo-safe implementation: always returns the same message whether or
    not the email exists, so the endpoint can't be used to enumerate
    registered accounts. In production this would send a reset email
    with a signed, expiring token.
    """
    db.query(User).filter(User.email == email).first()  # lookup kept for parity with a real impl
    return {"message": "If that email is registered, a password reset link has been sent."}

