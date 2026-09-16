from fastapi import HTTPException

from security import (
    assert_csv_bytes,
    assert_docx_bytes,
    assert_safe_image_bytes,
    assert_secure_runtime,
    sniff_image_content_type,
    validate_password_strength,
)


def test_password_requires_letter_and_number():
    try:
        validate_password_strength("abcdefgh")
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400


def test_password_rejects_email_local_part():
    try:
        validate_password_strength("jane1234", "jane@example.com")
        assert False, "expected HTTPException"
    except HTTPException as exc:
        assert exc.status_code == 400


def test_password_accepts_strong_secret():
    validate_password_strength("CorrectHorse9")


def test_sniff_png_and_reject_svg():
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    assert sniff_image_content_type(png) == "image/png"
    assert assert_safe_image_bytes(png) == "image/png"
    try:
        assert_safe_image_bytes(b"<svg xmlns='http://www.w3.org/2000/svg'></svg>")
        assert False, "svg should be rejected"
    except HTTPException as exc:
        assert exc.status_code == 400


def test_csv_rejects_null_bytes_and_docx_requires_zip():
    assert_csv_bytes(b"part,vendor\nA,B\n")
    try:
        assert_csv_bytes(b"\x00binary")
        assert False
    except HTTPException:
        pass
    assert_docx_bytes(b"PK\x03\x04rest-of-zip")
    try:
        assert_docx_bytes(b"not-a-docx")
        assert False
    except HTTPException:
        pass


def test_production_requires_strong_secret():
    try:
        assert_secure_runtime("short", is_production=True, dev_return_otp=False)
        assert False
    except RuntimeError:
        pass
    try:
        assert_secure_runtime("x" * 40, is_production=True, dev_return_otp=True)
        assert False
    except RuntimeError:
        pass
    assert_secure_runtime("x" * 40, is_production=True, dev_return_otp=False) is None
