from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict

from app.models.user import UserRole


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    role: UserRole
    preferred_currency: str
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class AddressCreate(BaseModel):
    label: str = "Home"
    line1: str
    line2: str = ""
    city: str
    state: str = ""
    postal_code: str
    country: str
    is_default: bool = False


class AddressOut(AddressCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
