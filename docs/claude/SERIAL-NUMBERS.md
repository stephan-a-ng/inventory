# Moon Five Serial Number Convention

## Format

```
M5-BEM-G2-26W19-A-001234-C
```

## Segment Breakdown

```
M5  - BEM - G2 - 26W19 - A - 001234 - C
│     │     │     │       │     │      │
│     │     │     │       │     │      └─ Check digit
│     │     │     │       │     └──────── Unit sequence
│     │     │     │       └────────────── Factory or line code
│     │     │     └────────────────────── Year + ISO week of manufacture
│     │     └──────────────────────────── Product generation
│     └────────────────────────────────── Product family
└──────────────────────────────────────── Company prefix
```

| Segment | Example | Description |
|---|---|---|
| Company prefix | `M5` | Fixed identifier for Moon Five. Never changes. |
| Product family | `BEM` | Three-letter code: BEM (Building EMS), AEM (Apartment EMS), EVS (EVSE). |
| Product generation | `G2` | Hardware generation. Increments with major hardware revisions (G2, G3, G4). |
| Manufacturing date | `26W19` | Two-digit year plus ISO week number. 26W19 = week 19 of 2026. |
| Factory or line code | `A` | Single letter identifying the manufacturing facility or production line. |
| Unit sequence | `001234` | Six-digit zero-padded sequence within that week and line. Supports one million units per batch. |
| Check digit | `C` | Single character (Luhn mod-10 or mod-36) for validating the rest. Catches typos and transposition errors. |

## Design Principles

### Front-load static segments

Company prefix and product family never change for a given device, so placing them first makes serials sort and filter cleanly in spreadsheets, databases, and inventory tools.

### Use ISO week for the date segment

Manufacturing happens in weekly batches, not calendar months. YYWW also sorts lexicographically, so a simple alphabetical sort gives you chronological order.

### Avoid ambiguous characters

When the sequence or check digit goes alphanumeric, skip O, 0, I, 1, and L. This prevents read errors from techs typing serials off a label or reading them over the phone. If the sequence stays purely numeric, this only applies to the check digit.

### Include a check digit

One character at the end that validates the rest of the serial. Luhn (mod-10) is the industry standard and catches roughly 98% of single-digit and transposition errors. This pays for itself the first time a field tech mistypes a serial into an RMA form.

### Keep structured serials separate from internal UUIDs

Every unit should have two identifiers:

1. **The structured serial** (above) for labels, RMAs, field techs, customers, and human-readable contexts.
2. **An opaque UUID** (v4 or v7) for database joins, API calls, and anything that should not be guessable or reverse-engineerable.

The structured serial is the immutable physical identity. The UUID is for software.

### Do not encode mutable data

Never put these in the serial:

- Customer name or ID
- Install site or address
- Firmware version
- Current owner
- Lease or subscription status

All of these change over the life of the device. They belong in database rows keyed to the serial, not in the serial itself.

## Examples

| Serial | Decoded |
|---|---|
| `M5-BEM-G2-26W19-A-001234-C` | Moon Five Building EMS, Gen 2, manufactured week 19 of 2026, line A, unit 1234 |
| `M5-AEM-G2-26W22-A-000087-K` | Moon Five Apartment EMS, Gen 2, week 22 of 2026, line A, unit 87 |
| `M5-EVS-G3-27W08-B-002841-M` | Moon Five EVSE, Gen 3, week 8 of 2027, line B, unit 2841 |

## Sub-Assembly Variant (Optional)

For tracking PCBs, enclosures, connector modules, or other sub-assemblies, extend the family code:

```
M5-BEM.PCB-G2-26W19-A-001234-C
M5-BEM.ENC-G2-26W19-A-001234-C
```

The dot-separated suffix keeps the parent format intact while allowing finer-grained traceability when needed.

## Implementation Notes

- **Label real estate**: EVSE products often have limited label space. Test the full serial at production print size before committing. Code 128 barcodes and QR codes both handle this length comfortably.
- **ERP integration**: Make sure your ERP and MES systems support the full format as a single field, not split across columns.
- **Check digit algorithm**: Document the exact algorithm chosen (Luhn mod-10 recommended) in your manufacturing SOP so contract manufacturers and any future tooling validate consistently.
- **Reserve ranges**: Consider reserving the first 100 sequence numbers per week for engineering samples, golden units, and rework, with production starting at sequence 100.
