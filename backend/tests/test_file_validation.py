from security.files import is_svg_payload, sniff_csv_safe, sniff_docx, sniff_image_type


def test_sniff_png():
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    assert sniff_image_type(png) == "image/png"


def test_sniff_jpeg():
    jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 16
    assert sniff_image_type(jpeg) == "image/jpeg"


def test_rejects_svg_as_image():
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    assert sniff_image_type(svg) is None
    assert is_svg_payload(svg) is True


def test_csv_rejects_nul_and_svg():
    assert sniff_csv_safe(b"part,vendor\nA,B\n") is True
    assert sniff_csv_safe(b"\x00binary") is False
    assert sniff_csv_safe(b"<svg xmlns='http://www.w3.org/2000/svg'>") is False


def test_docx_zip_magic():
    assert sniff_docx(b"PK\x03\x04rest-of-zip") is True
    assert sniff_docx(b"%PDF-1.4") is False
