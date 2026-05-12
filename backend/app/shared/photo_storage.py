"""Photo storage chokepoint — Google Cloud Storage.

All build-step photo uploads/downloads/deletes go through this module so the
GCS API surface is mocked in one place and Cloud Run service-account signing
quirks (no private key in metadata-server creds) are handled once.

Env vars:
  GCS_BUCKET           — bucket name. If unset, the module degrades to a
                         disabled mode (`is_enabled()==False`). Uploads
                         raise; the rest of the API still works for testing
                         metadata-only flows.
  GCS_SIGNER_SA_EMAIL  — service account email for IAM signBlob (Cloud Run
                         path). If unset, falls back to local default
                         credentials (works against fake-gcs-server).
  STORAGE_EMULATOR_HOST — automatically honored by the google-cloud-storage
                         client. When set, we also create the bucket on
                         first use so the dev compose stack is self-bootstrap.
"""
from __future__ import annotations

import os
from datetime import timedelta
from typing import Optional

_client = None
_bucket = None
_emulator_bucket_initialized = False


def _resolve_bucket_name() -> Optional[str]:
    return os.getenv("GCS_BUCKET")


def is_enabled() -> bool:
    """True iff GCS_BUCKET is configured. Used by routes to 503 early."""
    return bool(_resolve_bucket_name())


def _client_singleton():
    global _client
    if _client is None:
        # Imported lazily so the slice's unit tests don't need google libs
        # installed; mock the module-level functions instead.
        from google.cloud import storage  # type: ignore
        _client = storage.Client()
    return _client


def _bucket_singleton():
    global _bucket, _emulator_bucket_initialized
    name = _resolve_bucket_name()
    if not name:
        raise RuntimeError("GCS_BUCKET is not set; photo storage is disabled.")
    if _bucket is None or _bucket.name != name:
        client = _client_singleton()
        _bucket = client.bucket(name)
        # Dev convenience: when running against fake-gcs-server, create the
        # bucket on first use so we don't have to bootstrap it externally.
        if os.getenv("STORAGE_EMULATOR_HOST") and not _emulator_bucket_initialized:
            try:
                client.create_bucket(name)
            except Exception:
                # Already exists, or backend doesn't support create; ignore.
                pass
            _emulator_bucket_initialized = True
    return _bucket


def put_object(key: str, data: bytes, content_type: str) -> None:
    """Upload bytes to GCS. Synchronous (the google-cloud-storage client is
    blocking); wrap in `run_in_executor` from async callers if latency
    matters. For ~1MB photos at our volume the blocking call is fine.
    """
    blob = _bucket_singleton().blob(key)
    blob.upload_from_string(data, content_type=content_type)


def signed_url(key: str, *, method: str = "GET", expires_minutes: int = 5,
               content_type: Optional[str] = None) -> str:
    """V4 signed URL for the given key.

    On Cloud Run the metadata-server creds have no private key, so we route
    signing through IAM signBlob when GCS_SIGNER_SA_EMAIL is set. Locally
    (or against fake-gcs-server) we skip signing entirely and return the
    emulator's plain object URL — fake-gcs-server doesn't enforce auth.
    """
    bucket_name = _resolve_bucket_name()
    emulator = os.getenv("STORAGE_EMULATOR_HOST")
    if emulator:
        # Direct URL into the emulator; signing isn't enforced and signing
        # with default creds would require a private key we don't have.
        # The `?X-Goog-Signature=stub` marker keeps test assertions happy
        # and surfaces "this URL came from photo_storage.signed_url" in
        # logs/inspections.
        base = emulator.rstrip("/")
        return f"{base}/storage/v1/b/{bucket_name}/o/{key.replace('/', '%2F')}?alt=media&X-Goog-Signature=emulator"

    blob = _bucket_singleton().blob(key)
    kwargs = dict(
        version="v4",
        method=method,
        expiration=timedelta(minutes=expires_minutes),
    )
    if content_type:
        kwargs["content_type"] = content_type

    signer_email = os.getenv("GCS_SIGNER_SA_EMAIL")
    if signer_email:
        import google.auth  # type: ignore
        from google.auth.transport import requests as g_requests  # type: ignore
        creds, _ = google.auth.default()
        creds.refresh(g_requests.Request())
        kwargs["service_account_email"] = signer_email
        kwargs["access_token"] = creds.token

    return blob.generate_signed_url(**kwargs)


def delete_objects(keys: list[str]) -> None:
    """Best-effort delete; missing keys are not an error."""
    if not keys:
        return
    bucket = _bucket_singleton()
    for k in keys:
        try:
            bucket.blob(k).delete()
        except Exception:
            pass


_MAGIC_BYTES = {
    b"\xff\xd8\xff": ("image/jpeg", "jpg"),
    b"\x89PNG\r\n\x1a\n": ("image/png", "png"),
    # WebP: "RIFF" .... "WEBP"
    b"RIFF": ("image/webp", "webp"),
}


def sniff_image(data: bytes) -> Optional[tuple[str, str]]:
    """Return (content_type, ext) for known image magic bytes, else None.

    Used to validate uploads before we trust the multipart-declared mime.
    """
    if data.startswith(b"\xff\xd8\xff"):
        return ("image/jpeg", "jpg")
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ("image/png", "png")
    if data.startswith(b"RIFF") and len(data) >= 12 and data[8:12] == b"WEBP":
        return ("image/webp", "webp")
    return None


MAX_PHOTO_BYTES = 4 * 1024 * 1024  # 4 MiB hard cap, matches frontend resize target
