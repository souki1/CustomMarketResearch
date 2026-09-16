import secrets

import pytest
from fastapi.testclient import TestClient

from auth_utils import create_access_token, decode_token
from config import Settings, assert_secure_runtime
from security.rate_limit import limiter


def _unique_email() -> str:
    return f"sec-{secrets.token_hex(8)}@example.com"


@pytest.fixture(scope="module")
def client():
    from main import app

    with TestClient(app) as test_client:
        yield test_client
    limiter.reset()


def test_health_security_headers(client: TestClient):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "healthy"}
    assert res.headers.get("X-Content-Type-Options") == "nosniff"
    assert res.headers.get("X-Frame-Options") == "DENY"
    assert res.headers.get("Referrer-Policy") == "no-referrer"
    assert "default-src 'none'" in res.headers.get("Content-Security-Policy", "")


def test_debug_public_removed(client: TestClient):
    res = client.get("/datasheet/selections/debug-public")
    assert res.status_code in {401, 404, 405}


def test_me_requires_auth(client: TestClient):
    res = client.get("/auth/me")
    assert res.status_code == 401


def test_signup_rejects_weak_password(client: TestClient):
    res = client.post(
        "/auth/signup",
        json={"email": _unique_email(), "password": "short"},
    )
    assert res.status_code == 422


def test_signup_signin_session_and_logout(client: TestClient):
    email = _unique_email()
    password = "Enterprise1x"
    signup = client.post("/auth/signup", json={"email": email, "password": password, "display_name": "Sec User"})
    assert signup.status_code == 200, signup.text
    body = signup.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["expires_in"]
    token = body["access_token"]
    payload = decode_token(token, expected_typ="access")
    assert payload is not None
    assert payload.get("sid")
    assert payload.get("typ") == "access"

    me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["email"] == email
    assert me.json()["totp_enabled"] is False

    sessions = client.get("/auth/sessions", headers={"Authorization": f"Bearer {token}"})
    assert sessions.status_code == 200
    listed = sessions.json()
    assert len(listed) >= 1
    assert any(item["current"] for item in listed)

    refresh = client.post("/auth/refresh", json={"refresh_token": body["refresh_token"]})
    assert refresh.status_code == 200
    new_access = refresh.json()["access_token"]
    assert new_access
    assert new_access != token

    old_me = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert old_me.status_code == 200  # access token still valid until expiry; refresh rotated

    logout = client.post(
        "/auth/logout",
        headers={"Authorization": f"Bearer {new_access}"},
        json={"refresh_token": refresh.json()["refresh_token"]},
    )
    assert logout.status_code == 200
    after = client.get("/auth/me", headers={"Authorization": f"Bearer {new_access}"})
    assert after.status_code == 401


def test_refresh_token_cannot_call_me(client: TestClient):
    email = _unique_email()
    signup = client.post("/auth/signup", json={"email": email, "password": "Enterprise1x"})
    assert signup.status_code == 200
    refresh = signup.json()["refresh_token"]
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {refresh}"})
    assert res.status_code == 401


def test_legacy_access_token_without_sid_still_works(client: TestClient):
    email = _unique_email()
    signup = client.post("/auth/signup", json={"email": email, "password": "Enterprise1x"})
    assert signup.status_code == 200
    user_id = client.get("/auth/me", headers={"Authorization": f"Bearer {signup.json()['access_token']}"}).json()["id"]
    legacy = create_access_token(user_id, extra={"ver": 0})
    res = client.get("/auth/me", headers={"Authorization": f"Bearer {legacy}"})
    assert res.status_code == 200


def test_wrong_password_then_lockout(client: TestClient):
    email = _unique_email()
    password = "Enterprise1x"
    assert client.post("/auth/signup", json={"email": email, "password": password}).status_code == 200
    # Sign-in from a different IP-ish path: lockout uses the same user record.
    last = None
    for _ in range(5):
        last = client.post("/auth/signin", json={"email": email, "password": "WrongPass1x"})
        assert last.status_code in {401, 423}
    locked = client.post("/auth/signin", json={"email": email, "password": password})
    assert locked.status_code == 423


def test_production_refuses_weak_secret():
    settings = Settings.model_construct(
        environment="production",
        secret_key="dev-secret-change-me",
        dev_return_otp=False,
        frontend_url="https://example.com",
    )
    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        assert_secure_runtime(settings)


def test_production_refuses_dev_otp():
    settings = Settings.model_construct(
        environment="production",
        secret_key="a" * 32,
        dev_return_otp=True,
        frontend_url="https://example.com",
    )
    with pytest.raises(RuntimeError, match="DEV_RETURN_OTP"):
        assert_secure_runtime(settings)


def test_mfa_setup_requires_auth(client: TestClient):
    res = client.post("/auth/mfa/setup")
    assert res.status_code == 401


def test_cors_does_not_reflect_unknown_origin(client: TestClient):
    res = client.options(
        "/health",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    allow = res.headers.get("access-control-allow-origin")
    assert allow != "https://evil.example"
