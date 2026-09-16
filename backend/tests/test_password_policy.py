from security.password_policy import MIN_PASSWORD_LENGTH, validate_password


def test_rejects_short_password():
    assert validate_password("Ab1") is not None


def test_rejects_letters_only():
    assert validate_password("abcdefghijk") is not None


def test_rejects_numbers_only():
    assert validate_password("12345678901") is not None


def test_rejects_email_local_part():
    assert validate_password("alicealice12", "alice@example.com") is not None


def test_accepts_strong_password():
    assert validate_password("correct-horse-1", "alice@example.com") is None
    assert MIN_PASSWORD_LENGTH == 10


def test_rejects_common_password():
    assert validate_password("password123") is not None
