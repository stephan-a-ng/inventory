# Known Bugs

Tracked latent issues that aren't yet fixed. Each entry: what, where, severity, repro, fix sketch.

When fixing, add a regression test and delete the entry.

---

## 1. `SubsystemService.create_subsystem` writes `"ProductType.AEMS"` instead of `"AEMS"`

**Where:** `backend/app/features/subsystems/services.py:28,34`

**Severity:** Low. Latent data-correctness bug; no errors thrown.

**Symptom:** When an admin creates a new subsystem via the Settings UI, the row's `product_type` column is written as the literal Python repr `"ProductType.AEMS"` (or BEMS/CHARGER/NETWORKING) instead of the canonical `"AEMS"`. That subsystem then never appears when the UI filters by `product_type='AEMS'`, so it looks "lost." Existing seeded rows are fine — they were inserted via raw SQL with string values.

**Root cause:** Same Python 3.11+ str-Enum `__str__` change that affected `DeviceService.create_device` (already fixed). `SubsystemCreate.product_type` is a `ProductType(str, Enum)`, `model_dump()` returns the enum object, `str(enum)` returns `"ProductType.AEMS"` rather than `"AEMS"`.

**Why we haven't seen it bite:** The `subsystems` table lacks the CHECK-constraint guard that `devices` has, so the INSERT succeeds silently. New subsystems are rare in normal operation (the seeded defaults cover the common product types).

**Fix sketch (when we get to it):**

```python
# in create_subsystem:
pt = data["product_type"]
product_type = pt.value if hasattr(pt, "value") else str(pt)
# then use `product_type` instead of str(data["product_type"]) in both calls
```

Also add: an integration test in `backend/app/features/subsystems/test_routes_integration.py` that POSTs a new subsystem and asserts the row reads back with `product_type='AEMS'`.

**Cleanup, when fixed:** scan the `inventory.subsystems` table on prod + staging for any rows with `product_type LIKE 'ProductType.%'` and update them in-place.

---

## Template for new entries

```markdown
## N. <one-line summary>

**Where:** path:line

**Severity:** Critical | High | Medium | Low

**Symptom:** <user-facing observable>

**Root cause:** <technical>

**Why we haven't seen it bite:** <if applicable>

**Fix sketch:** <code/approach>
```
