"""Latest-release lookup for the per-product-type firmware repos.

Maps a device's `product_type` to its firmware GitHub repo, fetches
`releases/latest` from the GitHub API, and caches the tag in-process for
`FIRMWARE_RELEASE_CACHE_TTL_SECONDS`. Anonymous calls are fine — with the
default 1-hour cache one inventory replica makes ~24 requests/day total,
well under GitHub's 60/hour anonymous limit.

The DeviceDetail Firmware-stage card on the frontend reads from
`GET /api/devices/{id}/firmware-status`, which calls into here.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

import httpx

from app.shared.config import FIRMWARE_RELEASE_CACHE_TTL_SECONDS, GITHUB_API_TOKEN

logger = logging.getLogger(__name__)

# product_type → "owner/repo" on github.com.
# AEMS and NETWORKING have no tracked firmware repo yet; callers should
# treat them as `tracked=false` rather than fail.
PRODUCT_TYPE_TO_REPO: dict[str, str] = {
    "BEMS": "moon-five-technologies/OllieDriver",
    "EVSE": "moon-five-technologies/argo",
}


class FirmwareReleaseService:
    # Single-process cache: repo_slug -> (tag_name, fetched_at_monotonic).
    # Monotonic clock so a wall-clock shift doesn't poison the TTL.
    _cache: dict[str, tuple[str, float]] = {}

    @classmethod
    def repo_for(cls, product_type: str) -> Optional[str]:
        return PRODUCT_TYPE_TO_REPO.get(product_type)

    @classmethod
    def release_url(cls, repo: str, tag: str) -> str:
        return f"https://github.com/{repo}/releases/tag/{tag}"

    @staticmethod
    def normalize_tag(tag: Optional[str]) -> Optional[str]:
        """Drop a leading 'v' / 'V' so 'v1.2.3' and '1.2.3' compare equal."""
        if not tag:
            return None
        t = tag.strip()
        if t.startswith(("v", "V")):
            return t[1:]
        return t

    @classmethod
    def is_match(cls, current: Optional[str], latest: Optional[str]) -> Optional[bool]:
        """True/False match; None if either side is missing."""
        if not current or not latest:
            return None
        return cls.normalize_tag(current) == cls.normalize_tag(latest)

    @classmethod
    async def get_latest_tag(cls, product_type: str) -> Optional[str]:
        """Return the latest release tag (raw, e.g. 'v0.4.2') or None.

        Returns None for product types with no mapped repo, and for any
        network/HTTP failure — callers surface this as 'latest unknown'.
        """
        repo = cls.repo_for(product_type)
        if not repo:
            return None

        cached = cls._cache.get(repo)
        if cached is not None:
            tag, fetched_at = cached
            if time.monotonic() - fetched_at < FIRMWARE_RELEASE_CACHE_TTL_SECONDS:
                return tag

        headers = {"Accept": "application/vnd.github+json"}
        if GITHUB_API_TOKEN:
            headers["Authorization"] = f"Bearer {GITHUB_API_TOKEN}"

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"https://api.github.com/repos/{repo}/releases/latest",
                    headers=headers,
                )
            if response.status_code != 200:
                logger.warning(
                    "GitHub releases/latest for %s returned %s",
                    repo, response.status_code,
                )
                return None
            tag = response.json().get("tag_name")
        except (httpx.HTTPError, ValueError) as exc:
            # ValueError covers JSON decode failures; HTTPError covers network,
            # timeout, and protocol errors. Don't raise — the card just shows
            # 'latest unknown' if we can't reach GitHub.
            logger.warning("GitHub releases/latest fetch for %s failed: %s", repo, exc)
            return None

        if not tag:
            return None

        cls._cache[repo] = (tag, time.monotonic())
        return tag

    @classmethod
    def _reset_cache_for_tests(cls) -> None:
        cls._cache.clear()
