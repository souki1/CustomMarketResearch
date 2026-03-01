from pydantic import BaseModel, EmailStr


class SignUpBody(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None


class SignInBody(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    display_name: str


class UserResponse(BaseModel):
    id: int
    email: str
    display_name: str

    class Config:
        from_attributes = True
