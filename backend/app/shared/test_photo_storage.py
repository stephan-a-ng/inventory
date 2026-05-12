"""Unit tests for the photo_storage chokepoint."""
from app.shared.photo_storage import sniff_image


def test_sniff_jpeg():
    assert sniff_image(b"\xff\xd8\xff\xe0\x00\x10JFIF") == ("image/jpeg", "jpg")


def test_sniff_png():
    assert sniff_image(b"\x89PNG\r\n\x1a\nrest") == ("image/png", "png")


def test_sniff_webp():
    # RIFF size WEBP
    assert sniff_image(b"RIFF\x00\x00\x00\x00WEBPmore") == ("image/webp", "webp")


def test_sniff_rejects_unknown():
    assert sniff_image(b"GIF89a\x00\x00") is None
    assert sniff_image(b"plain text bytes") is None


def test_sniff_rejects_short_webp_riff():
    # "RIFF" without the WEBP fourcc must not pass.
    assert sniff_image(b"RIFF1234WAVE...") is None
