"""Unit tests for FirmwareReleaseService — product_type → repo mapping,
tag normalization, in-process cache, and graceful error handling.
The real GitHub API is never hit; httpx.AsyncClient.get is monkeypatched.
"""
from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import httpx
import pytest

from app.features.devices.firmware_release_service import (
    FirmwareReleaseService,
    PRODUCT_TYPE_TO_REPO,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    FirmwareReleaseService._reset_cache_for_tests()
    yield
    FirmwareReleaseService._reset_cache_for_tests()


def _mock_response(status_code: int, body: Any) -> httpx.Response:
    kwargs: dict[str, Any] = {
        "status_code": status_code,
        "request": httpx.Request("GET", "https://api.github.com/repos/x/y/releases/latest"),
    }
    if isinstance(body, (dict, list)):
        kwargs["json"] = body
    elif isinstance(body, str):
        kwargs["text"] = body
    return httpx.Response(**kwargs)


def _patch_get(monkeypatch, *responses):
    """Each call to AsyncClient.get yields the next response (or raises)."""
    queue = list(responses)

    async def fake_get(self, url, headers=None, **kwargs):
        if not queue:
            raise AssertionError(f"unexpected extra GET to {url}")
        item = queue.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    return queue  # tests can assert it's drained


# ---------------------------------------------------------------------------
# Product-type → repo mapping
# ---------------------------------------------------------------------------


def test_repo_for_bems():
    assert FirmwareReleaseService.repo_for("BEMS") == "moon-five-technologies/OllieDriver"


def test_repo_for_evse():
    assert FirmwareReleaseService.repo_for("EVSE") == "moon-five-technologies/argo"


@pytest.mark.parametrize("product_type", ["AEMS", "NETWORKING", "WAT", ""])
def test_repo_for_untracked(product_type):
    assert FirmwareReleaseService.repo_for(product_type) is None


async def test_get_latest_tag_returns_none_for_untracked_product(monkeypatch):
    """No HTTP should happen for AEMS / NETWORKING."""
    called = False

    async def fake_get(self, *a, **kw):
        nonlocal called
        called = True
        raise AssertionError("should not call GitHub for untracked product type")

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    assert await FirmwareReleaseService.get_latest_tag("AEMS") is None
    assert called is False


# ---------------------------------------------------------------------------
# Tag normalization + match
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("v1.2.3", "1.2.3"),
        ("V1.2.3", "1.2.3"),
        ("1.2.3", "1.2.3"),
        ("  v1.2.3  ", "1.2.3"),
        ("release-1.0", "release-1.0"),
        (None, None),
        ("", None),
    ],
)
def test_normalize_tag(raw, expected):
    assert FirmwareReleaseService.normalize_tag(raw) == expected


def test_is_match_normalizes_leading_v():
    assert FirmwareReleaseService.is_match("v1.2.3", "1.2.3") is True
    assert FirmwareReleaseService.is_match("1.2.3", "v1.2.3") is True


def test_is_match_distinguishes_different_versions():
    assert FirmwareReleaseService.is_match("v1.0.0", "v1.0.1") is False


@pytest.mark.parametrize("current, latest", [(None, "v1.0"), ("v1.0", None), (None, None)])
def test_is_match_returns_none_when_either_side_missing(current, latest):
    assert FirmwareReleaseService.is_match(current, latest) is None


def test_release_url():
    assert (
        FirmwareReleaseService.release_url("moon-five-technologies/argo", "v0.4.2")
        == "https://github.com/moon-five-technologies/argo/releases/tag/v0.4.2"
    )


# ---------------------------------------------------------------------------
# HTTP fetch + cache
# ---------------------------------------------------------------------------


async def test_get_latest_tag_fetches_and_returns_tag(monkeypatch):
    _patch_get(monkeypatch, _mock_response(200, {"tag_name": "v1.4.0"}))
    tag = await FirmwareReleaseService.get_latest_tag("EVSE")
    assert tag == "v1.4.0"


async def test_get_latest_tag_caches_within_ttl(monkeypatch):
    # Only one response queued — second call must hit the cache.
    _patch_get(monkeypatch, _mock_response(200, {"tag_name": "v2.0"}))
    first = await FirmwareReleaseService.get_latest_tag("EVSE")
    second = await FirmwareReleaseService.get_latest_tag("EVSE")
    assert first == "v2.0"
    assert second == "v2.0"


async def test_get_latest_tag_cache_expires(monkeypatch):
    """When monotonic() advances past the TTL, the next call re-fetches."""
    import types
    import app.features.devices.firmware_release_service as mod

    # Two distinct responses; the second is what we expect after expiry.
    _patch_get(
        monkeypatch,
        _mock_response(200, {"tag_name": "v1"}),
        _mock_response(200, {"tag_name": "v2"}),
    )
    monkeypatch.setattr(mod, "FIRMWARE_RELEASE_CACHE_TTL_SECONDS", 60)

    # Shadow the `time` reference inside the service module only — patching
    # time.monotonic globally clobbers pytest/asyncio internals.
    times = iter([1000.0, 1100.0, 1100.0])
    monkeypatch.setattr(mod, "time", types.SimpleNamespace(monotonic=lambda: next(times)))

    assert await FirmwareReleaseService.get_latest_tag("EVSE") == "v1"
    assert await FirmwareReleaseService.get_latest_tag("EVSE") == "v2"


async def test_get_latest_tag_http_error_returns_none(monkeypatch):
    _patch_get(monkeypatch, _mock_response(500, {"message": "boom"}))
    assert await FirmwareReleaseService.get_latest_tag("EVSE") is None


async def test_get_latest_tag_network_error_returns_none(monkeypatch):
    _patch_get(monkeypatch, httpx.ConnectError("dns failed"))
    assert await FirmwareReleaseService.get_latest_tag("EVSE") is None


async def test_get_latest_tag_missing_tag_name_returns_none(monkeypatch):
    """If GitHub responds 200 but the body is missing tag_name, don't crash."""
    _patch_get(monkeypatch, _mock_response(200, {}))
    assert await FirmwareReleaseService.get_latest_tag("EVSE") is None


async def test_get_latest_tag_failure_does_not_cache(monkeypatch):
    """A failed fetch must not poison the cache — next call should try again."""
    _patch_get(
        monkeypatch,
        _mock_response(503, {"message": "down"}),
        _mock_response(200, {"tag_name": "v3"}),
    )
    assert await FirmwareReleaseService.get_latest_tag("EVSE") is None
    assert await FirmwareReleaseService.get_latest_tag("EVSE") == "v3"


def test_product_type_map_only_lists_bems_and_evse():
    """Guard against accidental additions until AEMS/NETWORKING repos exist."""
    assert set(PRODUCT_TYPE_TO_REPO.keys()) == {"BEMS", "EVSE"}
