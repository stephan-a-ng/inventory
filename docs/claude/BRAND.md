# Moon Five — Brand & Visual Identity
> Core style guide applicable to all surfaces: apps, web, docs, decks, print, and generated assets.

---

## Brand Essence

Warm, precise, and direct. The visual system should feel like a well-made physical object — paper, ink, metal — not a software UI. No gradients, no glows, no decorative flourishes. Every element earns its place. The tone is confident without being loud: the Yellow accent works because it's the *only* accent.

---

## Color Palette

All colors share a **warm yellow-brown undertone**. There are no cool grays, no blues, no pure neutrals. The system is intentionally monochromatic in temperature.

### Core

| Token | Hex | Role |
|---|---|---|
| `--m5-ink` | `#2F2D27` | Primary text, dark backgrounds, filled elements |
| `--m5-cream` | `#FAF7EE` | Default background. Warm off-white, reads as paper |
| `--m5-yellow` | `#FCD01B` | **The sole accent.** Highlights, callouts, brand dot, key figures |

### Supporting

| Token | Hex | Role |
|---|---|---|
| `--m5-cream-deep` | `#F2EDDF` | Slightly darker cream. Stripe textures, nested backgrounds, hover states |
| `--m5-ink-soft` | `#4A4740` | Body text where full Ink feels heavy |
| `--m5-muted` | `#7A7468` | Labels, captions, metadata. The "whisper" voice |
| `--m5-rule` | `#DAD3C2` | Divider lines, borders. Warm, never clinical |
| `--m5-yellow-deep` | `#E8B800` | Yellow hover/pressed state, secondary yellow element |

### Semantic (reserved, use sparingly)

| Token | Value | Role |
|---|---|---|
| `--m5-green` | `oklch(0.58 0.13 150)` | Positive signal, success state |
| `--m5-red` | `oklch(0.58 0.18 25)` | Negative signal, risk, warning |

> Both semantic colors share the same oklch lightness (0.58) and similar chroma — muted and harmonious, not alarm colors.

### Background Rhythm

The system uses exactly **two backgrounds**:

- **Cream** (`#FAF7EE`) — default, everyday surfaces
- **Ink** (`#2F2D27`) — reserved for high-drama moments: covers, closings, modals, critical CTAs

This pairing creates contrast without introducing a third temperature. Do not add a third background color.

### What to avoid
- No pure white (`#FFFFFF`) or pure black (`#000000`)
- No blue, purple, teal, or any cool-toned color
- No gradients of any kind
- No drop shadows or glows
- No semi-transparent overlays except subtle alpha steps of Ink or Cream (e.g. `rgba(250,247,238,0.15)` for rules on dark surfaces)

---

## Typography

### Typefaces

| Role | Family | Weights |
|---|---|---|
| **Display & Body** | `HEX Franklin` | 400, 500, 600, 700, 900 |
| **Monospace / Labels** | `JetBrains Mono` | 400, 500 |

HEX Franklin is the **only** display and body typeface — a grotesque with excellent tight-tracking behavior at large sizes. JetBrains Mono is used exclusively for the "system voice": labels, kickers, metadata, captions, timestamps, and any supporting information that annotates rather than communicates.

> **Fallback:** `-apple-system, BlinkMacSystemFont, sans-serif`. Never substitute Inter, Roboto, or Arial — they read too neutral and undermine the warm character of the system.

### Typographic Rules

- **Tracking:** Negative at large sizes (`-0.04em` display, `-0.025em` titles). Positive at label sizes (`+0.06em` to `+0.14em`).
- **Leading:** Tight at display (`0.95–1.04`). Comfortable at body (`1.4–1.5`).
- **Case:** All JetBrains Mono text is `text-transform: uppercase`. Headlines and body are sentence case.
- **Text wrap:** `text-wrap: balance` on headlines. `text-wrap: pretty` on body copy.
- **Minimum size:** 14px in any context. Never smaller.

### Relative Type Scale (proportional, adapt to surface)

| Role | Relative size | Weight | Notes |
|---|---|---|---|
| Display | Largest | 900 | Cover headlines, hero statements |
| Title | Large | 900 | Section/page titles |
| Subtitle | Medium-large | 400 | Supporting statement under title |
| Body | Medium | 400–500 | Primary reading copy |
| Small | Medium-small | 400–500 | Secondary copy, card descriptions |
| Label / Kicker | Small | 400–500 | Mono, ALL CAPS, annotative |

---

## UI Patterns

### Cards

- Background options: Cream (`#FAF7EE`), White (`#fff`), Yellow (`#FCD01B`), or Ink (`#2F2D27`)
- Border: `1px solid --m5-rule` on light cards; none on Yellow or Ink cards
- **No border-radius.** Square corners only across the entire system.
- Padding: generous — never cramped. Minimum 24px on small surfaces, 32–40px on large.

### The Yellow Highlight Rule

Only **one element per view or layout group** should carry the Yellow fill. It is a pointer, not a pattern. If everything is highlighted, nothing is.

### Labels / Kickers

JetBrains Mono, small size, `--m5-muted`, uppercase, `letter-spacing: 0.12–0.14em`. Used to name a thing before the content explains it. Examples: `ADDRESSABLE REACH`, `TARGET SEGMENT`, `OUR APPROACH`.

### Rules / Dividers

- `1px solid --m5-rule` on light surfaces
- `1px solid rgba(250,247,238,0.15)` on dark (Ink) surfaces
- Never heavier than 1px except the YellowBar accent element (a short, thick horizontal bar used as a title underline accent)

### Tags / Pills

`border: 1px solid --m5-ink`, `border-radius: 999px`, JetBrains Mono, uppercase. Yellow-fill variant: `background: --m5-yellow`, `border-color: --m5-yellow`.

### Stat / Number Blocks

Large numeral at weight 900 with tight negative tracking. Label at medium weight below. Sub-label in mono uppercase at muted color. Numbers are the primary visual — size them aggressively.

### Image Placeholders

Diagonal stripe pattern: `repeating-linear-gradient(135deg, --m5-cream-deep 0 14px, transparent 14px 28px)` on a cream base. Add corner bracket marks and a monospace label describing what should be placed there. Never hand-draw SVG illustrations as stand-ins for photography or data visualization.

### Interactive States (apps/web)

- **Hover:** Shift background one step warmer/darker. Use `--m5-cream-deep` on cream, `--m5-yellow-deep` on yellow, slightly lighter Ink on dark.
- **Active/Pressed:** Add `1px solid --m5-ink` border or increase fill opacity.
- **Focus:** `2px solid --m5-yellow` outline. No blue focus rings.
- **Disabled:** Reduce opacity to 40%. Do not change color temperature.

---

## Voice & Copy

- **Direct.** Lead with the number or the claim. No throat-clearing.
- **Labels name the thing** before the content explains it.
- **Avoid:** filler superlatives ("revolutionary," "cutting-edge," "transformative," "seamless")
- **Avoid:** bullet points as primary structure — prefer stats, comparisons, or flowing prose
- **Numbers first.** If there's a number, it leads. The explanation follows.

---

## Core Principles

1. **Warmth over neutrality.** Every color, even the off-white, has a yellow undertone. The system never reads as gray or corporate.
2. **Yellow as a single instrument.** It appears once per view, maximum. It means: *look here.*
3. **Dark surfaces as punctuation.** Ink backgrounds are reserved for high-stakes moments — not everyday content.
4. **Type does the heavy lifting.** Large, heavy, tight type at weight 900 is the primary visual element. Decoration is not a substitute for good typography.
5. **Confidence through restraint.** No gradients, no shadows, no decorative icons, no emoji. The system trusts the content.
