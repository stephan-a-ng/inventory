"""Business logic for product revisions, firmware versions, and build steps.

Conventions match other slices (see devices/services.py):
- Static-method service classes.
- Parameterized SQL ($1, $2, ...) — never f-string interpolation of user input.
- Returns asyncpg.Record converted with dict().
"""
from typing import Optional
from uuid import UUID

from app.shared.db import DatabasePool


class ProductRevisionService:
    @staticmethod
    async def list_for(product_type: Optional[str] = None) -> list[dict]:
        if product_type:
            rows = await DatabasePool.fetch(
                """SELECT * FROM product_revisions
                   WHERE product_type = $1
                   ORDER BY is_default DESC, label ASC""",
                product_type,
            )
        else:
            rows = await DatabasePool.fetch(
                "SELECT * FROM product_revisions ORDER BY product_type, label"
            )
        return [dict(r) for r in rows]

    @staticmethod
    async def get(revision_id: UUID) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            "SELECT * FROM product_revisions WHERE id = $1", revision_id
        )
        return dict(row) if row else None

    @staticmethod
    async def create(product_type: str, label: str, notes: Optional[str], is_default: bool) -> dict:
        # If marking default, clear any existing default for this product_type
        # in the same transaction to honor the partial unique index.
        if is_default:
            await DatabasePool.execute(
                "UPDATE product_revisions SET is_default = FALSE WHERE product_type = $1",
                product_type,
            )
        row = await DatabasePool.fetchrow(
            """INSERT INTO product_revisions (product_type, label, notes, is_default)
               VALUES ($1, $2, $3, $4) RETURNING *""",
            product_type, label, notes, is_default,
        )
        return dict(row)

    @staticmethod
    async def update(revision_id: UUID, label: Optional[str], notes: Optional[str]) -> Optional[dict]:
        updates, params, idx = [], [], 1
        if label is not None:
            updates.append(f"label = ${idx}"); params.append(label); idx += 1
        if notes is not None:
            updates.append(f"notes = ${idx}"); params.append(notes); idx += 1
        if not updates:
            return await ProductRevisionService.get(revision_id)
        updates.append("updated_at = now()")
        params.append(revision_id)
        row = await DatabasePool.fetchrow(
            f"UPDATE product_revisions SET {', '.join(updates)} WHERE id = ${idx} RETURNING *",
            *params,
        )
        return dict(row) if row else None

    @staticmethod
    async def set_default(revision_id: UUID) -> Optional[dict]:
        # Resolve product_type first so we can clear other defaults in the same tx.
        existing = await ProductRevisionService.get(revision_id)
        if not existing:
            return None
        async with DatabasePool._pool.acquire() as conn:  # noqa: SLF001 — singleton pattern
            async with conn.transaction():
                await conn.execute(
                    "UPDATE product_revisions SET is_default = FALSE WHERE product_type = $1",
                    existing["product_type"],
                )
                row = await conn.fetchrow(
                    """UPDATE product_revisions SET is_default = TRUE, updated_at = now()
                       WHERE id = $1 RETURNING *""",
                    revision_id,
                )
        return dict(row) if row else None

    @staticmethod
    async def delete(revision_id: UUID) -> bool:
        result = await DatabasePool.execute(
            "DELETE FROM product_revisions WHERE id = $1", revision_id
        )
        return result == "DELETE 1"

    @staticmethod
    async def resolve_for_device(product_type: str, hardware_revision: Optional[str]) -> Optional[dict]:
        """Pick the right revision row for a device.

        Match `devices.hardware_revision` against `product_revisions.label`
        case-insensitively within the same product_type; fall back to the
        is_default=true row. Returns None if neither match.
        """
        if hardware_revision:
            row = await DatabasePool.fetchrow(
                """SELECT * FROM product_revisions
                   WHERE product_type = $1 AND LOWER(label) = LOWER($2)
                   LIMIT 1""",
                product_type, hardware_revision,
            )
            if row:
                return dict(row)
        row = await DatabasePool.fetchrow(
            """SELECT * FROM product_revisions
               WHERE product_type = $1 AND is_default = TRUE
               LIMIT 1""",
            product_type,
        )
        return dict(row) if row else None


class FirmwareVersionService:
    @staticmethod
    async def list_for(revision_id: UUID) -> list[dict]:
        rows = await DatabasePool.fetch(
            """SELECT * FROM firmware_versions
               WHERE product_revision_id = $1
               ORDER BY is_standard DESC, released_at DESC NULLS LAST, version DESC""",
            revision_id,
        )
        return [dict(r) for r in rows]

    @staticmethod
    async def get(version_id: UUID) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            "SELECT * FROM firmware_versions WHERE id = $1", version_id
        )
        return dict(row) if row else None

    @staticmethod
    async def create(
        revision_id: UUID,
        version: str,
        notes: Optional[str],
        is_standard: bool,
        released_at,
    ) -> dict:
        if is_standard:
            await DatabasePool.execute(
                "UPDATE firmware_versions SET is_standard = FALSE WHERE product_revision_id = $1",
                revision_id,
            )
        row = await DatabasePool.fetchrow(
            """INSERT INTO firmware_versions
                 (product_revision_id, version, notes, is_standard, released_at)
               VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            revision_id, version, notes, is_standard, released_at,
        )
        return dict(row)

    @staticmethod
    async def update(version_id: UUID, version, notes, released_at) -> Optional[dict]:
        updates, params, idx = [], [], 1
        if version is not None:
            updates.append(f"version = ${idx}"); params.append(version); idx += 1
        if notes is not None:
            updates.append(f"notes = ${idx}"); params.append(notes); idx += 1
        if released_at is not None:
            updates.append(f"released_at = ${idx}"); params.append(released_at); idx += 1
        if not updates:
            return await FirmwareVersionService.get(version_id)
        updates.append("updated_at = now()")
        params.append(version_id)
        row = await DatabasePool.fetchrow(
            f"UPDATE firmware_versions SET {', '.join(updates)} WHERE id = ${idx} RETURNING *",
            *params,
        )
        return dict(row) if row else None

    @staticmethod
    async def set_standard(version_id: UUID) -> Optional[dict]:
        existing = await FirmwareVersionService.get(version_id)
        if not existing:
            return None
        async with DatabasePool._pool.acquire() as conn:  # noqa: SLF001
            async with conn.transaction():
                await conn.execute(
                    "UPDATE firmware_versions SET is_standard = FALSE WHERE product_revision_id = $1",
                    existing["product_revision_id"],
                )
                row = await conn.fetchrow(
                    """UPDATE firmware_versions SET is_standard = TRUE, updated_at = now()
                       WHERE id = $1 RETURNING *""",
                    version_id,
                )
        return dict(row) if row else None

    @staticmethod
    async def delete(version_id: UUID) -> bool:
        result = await DatabasePool.execute(
            "DELETE FROM firmware_versions WHERE id = $1", version_id
        )
        return result == "DELETE 1"


class InstructionSetService:
    """Versioned authoring container — one set per (revision, stage_key) is
    active at a time. Admins create new sets to iterate instructions; devices
    stay pinned to whichever set they first interacted with."""

    @staticmethod
    async def list_for(revision_id: UUID, stage_key: Optional[str] = None) -> list[dict]:
        if stage_key:
            rows = await DatabasePool.fetch(
                """SELECT * FROM instruction_sets
                   WHERE product_revision_id = $1 AND stage_key = $2
                   ORDER BY is_active DESC, created_at DESC""",
                revision_id, stage_key,
            )
        else:
            rows = await DatabasePool.fetch(
                """SELECT * FROM instruction_sets
                   WHERE product_revision_id = $1
                   ORDER BY stage_key ASC, is_active DESC, created_at DESC""",
                revision_id,
            )
        return [dict(r) for r in rows]

    @staticmethod
    async def get(set_id: UUID) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            "SELECT * FROM instruction_sets WHERE id = $1", set_id
        )
        return dict(row) if row else None

    @staticmethod
    async def get_active(revision_id: UUID, stage_key: str) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            """SELECT * FROM instruction_sets
               WHERE product_revision_id = $1 AND stage_key = $2 AND is_active = TRUE
               LIMIT 1""",
            revision_id, stage_key,
        )
        return dict(row) if row else None

    @staticmethod
    async def get_or_create_default(revision_id: UUID, stage_key: str) -> dict:
        """Lazy: returns the active set if there is one, else creates "v1" and
        marks it active. Lets `POST /build-steps` work without a prior
        explicit set-creation step."""
        existing = await InstructionSetService.get_active(revision_id, stage_key)
        if existing:
            return existing
        return await InstructionSetService.create(
            revision_id, stage_key, label="v1", is_active=True,
        )

    @staticmethod
    async def create(
        revision_id: UUID, stage_key: str, label: str, is_active: bool,
    ) -> dict:
        async with DatabasePool._pool.acquire() as conn:  # noqa: SLF001
            async with conn.transaction():
                if is_active:
                    await conn.execute(
                        """UPDATE instruction_sets SET is_active = FALSE
                           WHERE product_revision_id = $1 AND stage_key = $2""",
                        revision_id, stage_key,
                    )
                row = await conn.fetchrow(
                    """INSERT INTO instruction_sets
                         (product_revision_id, stage_key, label, is_active)
                       VALUES ($1, $2, $3, $4) RETURNING *""",
                    revision_id, stage_key, label, is_active,
                )
        return dict(row)

    @staticmethod
    async def clone(source_set_id: UUID, label: str, *, activate: bool) -> Optional[dict]:
        """Deep-copy the source set's steps + sub-steps into a new set with the
        given label. Returns the new set row."""
        src = await InstructionSetService.get(source_set_id)
        if not src:
            return None
        async with DatabasePool._pool.acquire() as conn:  # noqa: SLF001
            async with conn.transaction():
                if activate:
                    await conn.execute(
                        """UPDATE instruction_sets SET is_active = FALSE
                           WHERE product_revision_id = $1 AND stage_key = $2""",
                        src["product_revision_id"], src["stage_key"],
                    )
                new_row = await conn.fetchrow(
                    """INSERT INTO instruction_sets
                         (product_revision_id, stage_key, label, is_active)
                       VALUES ($1, $2, $3, $4) RETURNING *""",
                    src["product_revision_id"], src["stage_key"], label, activate,
                )
                src_steps = await conn.fetch(
                    """SELECT * FROM build_steps
                       WHERE instruction_set_id = $1
                       ORDER BY sort_order ASC, created_at ASC""",
                    source_set_id,
                )
                for s in src_steps:
                    new_step_id = await conn.fetchval(
                        """INSERT INTO build_steps
                             (instruction_set_id, sort_order, title, description,
                              reference_photo_key, required_photo_count)
                           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id""",
                        new_row["id"], s["sort_order"], s["title"], s["description"],
                        s["reference_photo_key"], s["required_photo_count"],
                    )
                    src_subs = await conn.fetch(
                        """SELECT * FROM build_sub_steps
                           WHERE build_step_id = $1
                           ORDER BY sort_order ASC, created_at ASC""",
                        s["id"],
                    )
                    for sub in src_subs:
                        await conn.execute(
                            """INSERT INTO build_sub_steps
                                 (build_step_id, sort_order, title, description)
                               VALUES ($1, $2, $3, $4)""",
                            new_step_id, sub["sort_order"], sub["title"], sub["description"],
                        )
        return dict(new_row)

    @staticmethod
    async def activate(set_id: UUID) -> Optional[dict]:
        existing = await InstructionSetService.get(set_id)
        if not existing:
            return None
        async with DatabasePool._pool.acquire() as conn:  # noqa: SLF001
            async with conn.transaction():
                await conn.execute(
                    """UPDATE instruction_sets SET is_active = FALSE
                       WHERE product_revision_id = $1 AND stage_key = $2""",
                    existing["product_revision_id"], existing["stage_key"],
                )
                row = await conn.fetchrow(
                    """UPDATE instruction_sets SET is_active = TRUE, updated_at = now()
                       WHERE id = $1 RETURNING *""",
                    set_id,
                )
        return dict(row) if row else None

    @staticmethod
    async def update_label(set_id: UUID, label: str) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            """UPDATE instruction_sets SET label = $1, updated_at = now()
               WHERE id = $2 RETURNING *""",
            label, set_id,
        )
        return dict(row) if row else None

    @staticmethod
    async def delete(set_id: UUID) -> bool:
        result = await DatabasePool.execute(
            "DELETE FROM instruction_sets WHERE id = $1", set_id
        )
        return result == "DELETE 1"


class BuildStepService:
    @staticmethod
    async def list_for_set(set_id: UUID) -> list[dict]:
        rows = await DatabasePool.fetch(
            """SELECT * FROM build_steps
               WHERE instruction_set_id = $1
               ORDER BY sort_order ASC, created_at ASC""",
            set_id,
        )
        return [dict(r) for r in rows]

    @staticmethod
    async def get(step_id: UUID) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            "SELECT * FROM build_steps WHERE id = $1", step_id
        )
        return dict(row) if row else None

    @staticmethod
    async def create(
        instruction_set_id: UUID,
        title: str,
        description: Optional[str],
        required_photo_count: int,
    ) -> dict:
        # New step appends to the end of its instruction set's list.
        next_order = await DatabasePool.fetchval(
            """SELECT COALESCE(MAX(sort_order), -1) + 1 FROM build_steps
               WHERE instruction_set_id = $1""",
            instruction_set_id,
        )
        row = await DatabasePool.fetchrow(
            """INSERT INTO build_steps
                 (instruction_set_id, sort_order, title, description, required_photo_count)
               VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            instruction_set_id, next_order, title, description, required_photo_count,
        )
        return dict(row)

    @staticmethod
    async def update(
        step_id: UUID,
        title: Optional[str],
        description: Optional[str],
        required_photo_count: Optional[int],
        sort_order: Optional[int],
    ) -> Optional[dict]:
        updates, params, idx = [], [], 1
        if title is not None:
            updates.append(f"title = ${idx}"); params.append(title); idx += 1
        if description is not None:
            updates.append(f"description = ${idx}"); params.append(description); idx += 1
        if required_photo_count is not None:
            updates.append(f"required_photo_count = ${idx}")
            params.append(required_photo_count); idx += 1
        if sort_order is not None:
            updates.append(f"sort_order = ${idx}"); params.append(sort_order); idx += 1
        if not updates:
            return await BuildStepService.get(step_id)
        updates.append("updated_at = now()")
        params.append(step_id)
        row = await DatabasePool.fetchrow(
            f"UPDATE build_steps SET {', '.join(updates)} WHERE id = ${idx} RETURNING *",
            *params,
        )
        return dict(row) if row else None

    @staticmethod
    async def reorder(ids: list[UUID]) -> int:
        """Reassign sort_order in the given order. Returns rows updated."""
        if not ids:
            return 0
        async with DatabasePool._pool.acquire() as conn:  # noqa: SLF001
            async with conn.transaction():
                count = 0
                for new_order, step_id in enumerate(ids):
                    result = await conn.execute(
                        "UPDATE build_steps SET sort_order = $1, updated_at = now() WHERE id = $2",
                        new_order, step_id,
                    )
                    if result == "UPDATE 1":
                        count += 1
        return count

    @staticmethod
    async def set_reference_photo_key(step_id: UUID, key: Optional[str]) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            """UPDATE build_steps
               SET reference_photo_key = $1, updated_at = now()
               WHERE id = $2 RETURNING *""",
            key, step_id,
        )
        return dict(row) if row else None

    @staticmethod
    async def delete(step_id: UUID) -> bool:
        result = await DatabasePool.execute(
            "DELETE FROM build_steps WHERE id = $1", step_id
        )
        return result == "DELETE 1"


class BuildSubStepService:
    @staticmethod
    async def list_for(step_id: UUID) -> list[dict]:
        rows = await DatabasePool.fetch(
            """SELECT * FROM build_sub_steps
               WHERE build_step_id = $1
               ORDER BY sort_order ASC, created_at ASC""",
            step_id,
        )
        return [dict(r) for r in rows]

    @staticmethod
    async def list_for_steps(step_ids: list[UUID]) -> dict[UUID, list[dict]]:
        if not step_ids:
            return {}
        rows = await DatabasePool.fetch(
            """SELECT * FROM build_sub_steps
               WHERE build_step_id = ANY($1::uuid[])
               ORDER BY sort_order ASC, created_at ASC""",
            step_ids,
        )
        out: dict = {}
        for r in rows:
            out.setdefault(r["build_step_id"], []).append(dict(r))
        return out

    @staticmethod
    async def get(sub_id: UUID) -> Optional[dict]:
        row = await DatabasePool.fetchrow(
            "SELECT * FROM build_sub_steps WHERE id = $1", sub_id
        )
        return dict(row) if row else None

    @staticmethod
    async def create(step_id: UUID, title: str, description: Optional[str]) -> dict:
        next_order = await DatabasePool.fetchval(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM build_sub_steps WHERE build_step_id = $1",
            step_id,
        )
        row = await DatabasePool.fetchrow(
            """INSERT INTO build_sub_steps (build_step_id, sort_order, title, description)
               VALUES ($1, $2, $3, $4) RETURNING *""",
            step_id, next_order, title, description,
        )
        return dict(row)

    @staticmethod
    async def update(
        sub_id: UUID, title: Optional[str], description: Optional[str], sort_order: Optional[int],
    ) -> Optional[dict]:
        updates, params, idx = [], [], 1
        if title is not None:
            updates.append(f"title = ${idx}"); params.append(title); idx += 1
        if description is not None:
            updates.append(f"description = ${idx}"); params.append(description); idx += 1
        if sort_order is not None:
            updates.append(f"sort_order = ${idx}"); params.append(sort_order); idx += 1
        if not updates:
            return await BuildSubStepService.get(sub_id)
        updates.append("updated_at = now()")
        params.append(sub_id)
        row = await DatabasePool.fetchrow(
            f"UPDATE build_sub_steps SET {', '.join(updates)} WHERE id = ${idx} RETURNING *",
            *params,
        )
        return dict(row) if row else None

    @staticmethod
    async def reorder(ids: list[UUID]) -> int:
        if not ids:
            return 0
        async with DatabasePool._pool.acquire() as conn:  # noqa: SLF001
            async with conn.transaction():
                count = 0
                for new_order, sub_id in enumerate(ids):
                    result = await conn.execute(
                        "UPDATE build_sub_steps SET sort_order = $1, updated_at = now() WHERE id = $2",
                        new_order, sub_id,
                    )
                    if result == "UPDATE 1":
                        count += 1
        return count

    @staticmethod
    async def delete(sub_id: UUID) -> bool:
        result = await DatabasePool.execute(
            "DELETE FROM build_sub_steps WHERE id = $1", sub_id
        )
        return result == "DELETE 1"


class DeviceProgressService:
    """Per-device, per-step status + photo aggregation for the worker UI."""

    @staticmethod
    async def resolve_pinned_set(
        device_id: UUID, revision_id: UUID, stage_key: str,
    ) -> Optional[dict]:
        """Pick which instruction_set the worker sees for this device.

        If the device has already interacted with any step in some set
        (a device_build_step_status row exists or a photo was captured),
        return that set — even if it's no longer the active one. This
        keeps in-flight units pinned to the steps they started with.

        Otherwise return the currently active set for (revision, stage_key)."""
        row = await DatabasePool.fetchrow(
            """SELECT instruction_sets.* FROM instruction_sets
               JOIN build_steps ON build_steps.instruction_set_id = instruction_sets.id
               WHERE instruction_sets.product_revision_id = $2
                 AND instruction_sets.stage_key = $3
                 AND build_steps.id IN (
                   SELECT build_step_id FROM device_build_step_status WHERE device_id = $1
                   UNION
                   SELECT build_step_id FROM build_step_photos WHERE device_id = $1
                 )
               ORDER BY instruction_sets.created_at ASC
               LIMIT 1""",
            device_id, revision_id, stage_key,
        )
        if row:
            return dict(row)
        return await InstructionSetService.get_active(revision_id, stage_key)

    @staticmethod
    async def get_worker_view(
        device_id: UUID, set_id: UUID,
    ) -> list[dict]:
        """Return [{step, sub_steps, status, photos}, ...] for the given set."""
        rows = await DatabasePool.fetch(
            """SELECT
                  bs.*,
                  dbss.checked,
                  dbss.checked_at,
                  dbss.checked_by_user_id
               FROM build_steps bs
               LEFT JOIN device_build_step_status dbss
                 ON dbss.build_step_id = bs.id AND dbss.device_id = $1
               WHERE bs.instruction_set_id = $2
               ORDER BY bs.sort_order ASC, bs.created_at ASC""",
            device_id, set_id,
        )
        steps = [dict(r) for r in rows]
        step_ids = [s["id"] for s in steps]
        subs_by_step = await BuildSubStepService.list_for_steps(step_ids)

        photos_by_step: dict = {}
        if step_ids:
            photo_rows = await DatabasePool.fetch(
                """SELECT * FROM build_step_photos
                   WHERE device_id = $1 AND build_step_id = ANY($2::uuid[])
                   ORDER BY taken_at ASC""",
                device_id, step_ids,
            )
            for p in photo_rows:
                photos_by_step.setdefault(p["build_step_id"], []).append(dict(p))

        return [
            {
                "step": {k: v for k, v in s.items() if k not in {"checked", "checked_at", "checked_by_user_id"}},
                "sub_steps": subs_by_step.get(s["id"], []),
                "status": {
                    "build_step_id": s["id"],
                    "checked": bool(s["checked"]) if s["checked"] is not None else False,
                    "checked_at": s["checked_at"],
                    "checked_by_user_id": s["checked_by_user_id"],
                },
                "photos": photos_by_step.get(s["id"], []),
            }
            for s in steps
        ]

    @staticmethod
    async def toggle_status(
        device_id: UUID, build_step_id: UUID, user_id: UUID, checked: bool
    ) -> dict:
        """Upsert the per-device step state. Stamps user + timestamp on check."""
        # Decide check fields in Python so asyncpg sees plain typed params.
        # (A SQL CASE branch returning NULL would force a uuid<->text cast.)
        from datetime import datetime, timezone
        checked_at = datetime.now(timezone.utc) if checked else None
        checked_by = user_id if checked else None
        row = await DatabasePool.fetchrow(
            """INSERT INTO device_build_step_status
                 (device_id, build_step_id, checked, checked_at, checked_by_user_id)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (device_id, build_step_id) DO UPDATE
                 SET checked = EXCLUDED.checked,
                     checked_at = EXCLUDED.checked_at,
                     checked_by_user_id = EXCLUDED.checked_by_user_id,
                     updated_at = now()
               RETURNING *""",
            device_id, build_step_id, checked, checked_at, checked_by,
        )
        return dict(row)

    @staticmethod
    async def add_photo(
        device_id: UUID,
        build_step_id: UUID,
        photo_key: str,
        taken_by_user_id: UUID,
        caption: Optional[str] = None,
    ) -> dict:
        row = await DatabasePool.fetchrow(
            """INSERT INTO build_step_photos
                 (device_id, build_step_id, photo_key, caption, taken_by_user_id)
               VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            device_id, build_step_id, photo_key, caption, taken_by_user_id,
        )
        return dict(row)

    @staticmethod
    async def delete_photo(photo_id: UUID) -> Optional[dict]:
        """Returns the deleted row (so the caller can clean up GCS)."""
        row = await DatabasePool.fetchrow(
            "DELETE FROM build_step_photos WHERE id = $1 RETURNING *", photo_id
        )
        return dict(row) if row else None
