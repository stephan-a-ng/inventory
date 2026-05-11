"""Unit tests for CSV parse/validate. No DB needed for parsing."""
from app.features.devices.csv_service import CsvService


VALID_CSV = b"""mac_address,product_type,serial_number,location
AA:BB:CC:DD:EE:01,AEMS,SN-001,Bench-3
BB:CC:DD:EE:FF:02,BEMS,SN-002,Lab-1
"""


def test_parse_csv_happy_path():
    rows, errors = CsvService.parse_csv(VALID_CSV)
    assert errors == []
    assert len(rows) == 2
    assert rows[0]["mac_address"] == "AA:BB:CC:DD:EE:01"
    assert rows[0]["product_type"] == "AEMS"
    assert rows[0]["serial_number"] == "SN-001"


def test_parse_csv_uppercases_mac():
    rows, _ = CsvService.parse_csv(b"mac_address,product_type\naa:bb:cc:dd:ee:ff,AEMS\n")
    assert rows[0]["mac_address"] == "AA:BB:CC:DD:EE:FF"


def test_parse_csv_uppercases_product_type():
    rows, _ = CsvService.parse_csv(b"mac_address,product_type\nAA:BB:CC:DD:EE:01,aems\n")
    assert rows[0]["product_type"] == "AEMS"


def test_parse_csv_rejects_invalid_mac():
    rows, errors = CsvService.parse_csv(b"mac_address,product_type\nNOT-A-MAC,AEMS\n")
    assert rows == []
    assert any("Invalid MAC format" in e for e in errors)


def test_parse_csv_rejects_invalid_product_type():
    rows, errors = CsvService.parse_csv(b"mac_address,product_type\nAA:BB:CC:DD:EE:01,WIDGET\n")
    assert rows == []
    assert any("Invalid product type" in e for e in errors)


def test_parse_csv_rejects_missing_required_columns():
    rows, errors = CsvService.parse_csv(b"mac_address\nAA:BB:CC:DD:EE:01\n")
    assert rows == []
    assert any("Missing required columns" in e for e in errors)


def test_parse_csv_rejects_empty_file():
    rows, errors = CsvService.parse_csv(b"")
    assert rows == []
    assert errors


def test_parse_csv_continues_past_bad_rows():
    csv = b"""mac_address,product_type
AA:BB:CC:DD:EE:01,AEMS
not-valid,AEMS
BB:CC:DD:EE:FF:02,BEMS
"""
    rows, errors = CsvService.parse_csv(csv)
    assert len(rows) == 2
    assert len(errors) == 1
    assert "Row 3" in errors[0]
