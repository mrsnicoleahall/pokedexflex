# Flex Phase A — Type Iconography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the documented 18-type color palette app-wide and replace text type-chips with recolorable, icon-only type chips everywhere types appear.

**Architecture:** Store the 18 monochrome type SVGs in `public/types/`. Recolor them with the CSS `mask-image` + `background-color` technique via a reusable `TypeIcon` component. `TypeChip` becomes a circular colored chip wrapping a contrast-colored `TypeIcon` (no text label, but screen-reader-labeled). The palette lives in `theme.ts` where `typeColor()` already feeds chips, auras, and ribbon accents, so the swap ripples app-wide.

**Tech Stack:** Vite + React + TypeScript; Vitest (`@cloudflare/vitest-pool-workers`) for pure-TS tests; CSS in `src/react-app/styles.css`.

## Global Constraints

- Type icon SVGs come from `assets/types/*.svg` (already in repo), served from `public/types/*.svg`. Filenames are the lowercase type slug (`fire.svg` … `water.svg`).
- Documented palette (exact hexes, adopt verbatim): `normal #A0A29F · fire #FBA54C · water #539DDF · grass #5FBD58 · electric #F2D94E · ice #75D0C1 · fighting #D3425F · poison #B763CF · ground #DA7C4D · flying #A1BBEC · psychic #FA8581 · bug #92BC2C · rock #C9BB8A · ghost #5F6DBC · dragon #0C69C8 · dark #595761 · steel #5695A3 · fairy #EE90E6`.
- No React component-test harness exists (Vitest runs the Workers pool; tests live in `tests/**/*.test.ts` and are pure/worker-only). TDD the pure `theme.ts` helpers; verify components via `tsc -b`, `npm run build`, and browser-preview visual review. Do NOT start a second dev server — one runs on :5173 for the controller.
- Keep one dev server (`:5173`) live for the controller; build subagents verify via `tsc -b` / `npm test` / `npm run build` only.
- Type chips are **icon-only** (no text word) but MUST carry `role="img"`, `aria-label={type}`, and `title={type}`.

---

### Task 1: Adopt the documented type palette

**Files:**
- Modify: `src/react-app/theme.ts:7-25` (the `TYPE_COLORS` object)
- Test: `tests/react-app/theme.test.ts` (create)

**Interfaces:**
- Consumes: nothing new.
- Produces: `TYPE_COLORS` (unchanged shape `Record<string,string>`), `typeColor(type: string): string`, `getContrastText(hexColor: string): string` — all already exported from `src/react-app/theme.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/react-app/theme.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getContrastText, typeColor, TYPE_COLORS } from "../../src/react-app/theme";

describe("type palette (documented duiker101 colors)", () => {
  it("has all 18 canonical types", () => {
    expect(Object.keys(TYPE_COLORS).sort()).toEqual(
      [
        "bug", "dark", "dragon", "electric", "fairy", "fighting", "fire",
        "flying", "ghost", "grass", "ground", "ice", "normal", "poison",
        "psychic", "rock", "steel", "water",
      ].sort(),
    );
  });

  it("uses the documented hexes", () => {
    expect(typeColor("dragon")).toBe("#0C69C8"); // was purple, now blue
    expect(typeColor("fire")).toBe("#FBA54C");
    expect(typeColor("water")).toBe("#539DDF");
    expect(typeColor("electric")).toBe("#F2D94E");
    expect(typeColor("dark")).toBe("#595761");
  });

  it("picks dark contrast text for pale types, light for deep types", () => {
    expect(getContrastText(typeColor("electric"))).toBe("#14171F"); // pale yellow → dark glyph
    expect(getContrastText(typeColor("ice"))).toBe("#14171F");
    expect(getContrastText(typeColor("dragon"))).toBe("#FFFFFF"); // deep blue → light glyph
    expect(getContrastText(typeColor("dark"))).toBe("#FFFFFF");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/react-app/theme.test.ts`
Expected: FAIL — `typeColor("dragon")` returns `#6A5BE0`, not `#0C69C8`.

- [ ] **Step 3: Replace the palette**

In `src/react-app/theme.ts`, replace the `TYPE_COLORS` object body with the documented hexes:

```ts
export const TYPE_COLORS: Record<string, string> = {
	normal: "#A0A29F",
	fire: "#FBA54C",
	water: "#539DDF",
	grass: "#5FBD58",
	electric: "#F2D94E",
	ice: "#75D0C1",
	fighting: "#D3425F",
	poison: "#B763CF",
	ground: "#DA7C4D",
	flying: "#A1BBEC",
	psychic: "#FA8581",
	bug: "#92BC2C",
	rock: "#C9BB8A",
	ghost: "#5F6DBC",
	dragon: "#0C69C8",
	dark: "#595761",
	steel: "#5695A3",
	fairy: "#EE90E6",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/react-app/theme.test.ts`
Expected: PASS (3 tests).
If the import from `src/react-app/theme.ts` fails to resolve under the Workers pool, add `tests/react-app/` is covered by `tests/**/*.test.ts` (it is); the module is pure TS with no browser APIs so it must import cleanly. If resolution still fails, check `tests/tsconfig.json` includes the path.

- [ ] **Step 5: Commit**

```bash
git add src/react-app/theme.ts tests/react-app/theme.test.ts
git commit -m "feat(flex-A): adopt documented 18-type color palette"
```

---

### Task 2: Type icon assets + URL helper

**Files:**
- Create: `public/types/*.svg` (copy of the 18 files in `assets/types/`)
- Modify: `src/react-app/theme.ts` (add `typeIconUrl`)
- Test: `tests/react-app/theme.test.ts` (extend)

**Interfaces:**
- Consumes: `typeColor` from Task 1.
- Produces: `typeIconUrl(type: string): string` from `src/react-app/theme.ts` — returns `/types/<slug>.svg`, lowercasing the type and falling back to `/types/normal.svg` for unknown types.

- [ ] **Step 1: Copy the SVGs into `public/`**

```bash
mkdir -p public/types && cp assets/types/*.svg public/types/ && ls public/types | wc -l
```
Expected: `18`

- [ ] **Step 2: Write the failing test**

Append to `tests/react-app/theme.test.ts`:

```ts
import { typeIconUrl } from "../../src/react-app/theme";

describe("typeIconUrl", () => {
  it("maps a type to its public SVG path", () => {
    expect(typeIconUrl("fire")).toBe("/types/fire.svg");
  });
  it("lowercases the slug", () => {
    expect(typeIconUrl("Water")).toBe("/types/water.svg");
  });
  it("falls back to normal for unknown types", () => {
    expect(typeIconUrl("mystery")).toBe("/types/normal.svg");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/react-app/theme.test.ts`
Expected: FAIL — `typeIconUrl` is not exported.

- [ ] **Step 4: Implement `typeIconUrl`**

Add to `src/react-app/theme.ts` (below `typeColor`):

```ts
/** Path to a type's icon SVG (served from public/types), falling back to "normal" for unknown types. */
export function typeIconUrl(type: string): string {
	const slug = type.toLowerCase();
	return `/types/${slug in TYPE_COLORS ? slug : "normal"}.svg`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/react-app/theme.test.ts`
Expected: PASS (all theme tests).

- [ ] **Step 6: Commit**

```bash
git add public/types src/react-app/theme.ts tests/react-app/theme.test.ts
git commit -m "feat(flex-A): serve type icon SVGs + typeIconUrl helper"
```

---

### Task 3: `TypeIcon` component (mask-recolored glyph)

**Files:**
- Create: `src/react-app/components/TypeIcon.tsx`
- Modify: `src/react-app/styles.css` (add `.type-icon`)

**Interfaces:**
- Consumes: `typeIconUrl` (Task 2).
- Produces: `TypeIcon` React component with props `{ type: string; color: string; size?: number }` — renders a recolored masked glyph, no text, `role="img"` + `aria-label` + `title` = type. Exported from `src/react-app/components/TypeIcon.tsx`.

- [ ] **Step 1: Create the component**

`src/react-app/components/TypeIcon.tsx`:

```tsx
// src/react-app/components/TypeIcon.tsx
//
// A single Pokémon type glyph, recolored via the CSS mask technique: the
// monochrome SVG in public/types/<type>.svg becomes the alpha mask and
// `color` paints through it. No text; screen-reader-labeled with the type.

import { typeIconUrl } from "../theme";

export function TypeIcon({ type, color, size = 18 }: { type: string; color: string; size?: number }) {
	const url = `url(${typeIconUrl(type)})`;
	return (
		<span
			className="type-icon"
			role="img"
			aria-label={type}
			title={type}
			style={{
				width: size,
				height: size,
				backgroundColor: color,
				WebkitMaskImage: url,
				maskImage: url,
			}}
		/>
	);
}
```

- [ ] **Step 2: Add the CSS**

Append to `src/react-app/styles.css`:

```css
.type-icon {
	display: inline-block;
	flex: none;
	-webkit-mask-repeat: no-repeat;
	mask-repeat: no-repeat;
	-webkit-mask-position: center;
	mask-position: center;
	-webkit-mask-size: contain;
	mask-size: contain;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/react-app/components/TypeIcon.tsx src/react-app/styles.css
git commit -m "feat(flex-A): TypeIcon component (mask-recolored glyph)"
```

---

### Task 4: Convert `TypeChip` to icon-only

**Files:**
- Modify: `src/react-app/components/TypeChip.tsx`
- Modify: `src/react-app/styles.css:478` (the `.chip` rule → add `.chip--type`)

**Interfaces:**
- Consumes: `TypeIcon` (Task 3), `typeColor` + `getContrastText` (Task 1).
- Produces: `TypeChip` with unchanged prop shape `{ type: string }` — now a circular colored chip containing a contrast-colored `TypeIcon`, no text. The 3 existing callers (`PokemonCard.tsx:20`, `EventsCatalog.tsx:46`, `MyCollection.tsx:93`) need no changes.

- [ ] **Step 1: Rewrite `TypeChip`**

Replace `src/react-app/components/TypeChip.tsx` with:

```tsx
// src/react-app/components/TypeChip.tsx
//
// Icon-only type chip: a circle filled with the type's signature color,
// with the type glyph masked through in a contrasting color. No text label,
// but TypeIcon supplies role="img"/aria-label/title for accessibility.

import { getContrastText, typeColor } from "../theme";
import { TypeIcon } from "./TypeIcon";

export function TypeChip({ type }: { type: string }) {
	const color = typeColor(type);
	return (
		<span className="chip chip--type" style={{ backgroundColor: color }}>
			<TypeIcon type={type} color={getContrastText(color)} size={16} />
		</span>
	);
}
```

- [ ] **Step 2: Add the circular-chip CSS**

Append to `src/react-app/styles.css`:

```css
.chip--type {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	padding: 0;
	border-radius: 50%;
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc -b && npm run build`
Expected: both succeed with no errors.

- [ ] **Step 4: Visual verification (controller, browser preview on :5173)**

Navigate to the species catalog and confirm: each card shows circular type chips with the correct glyph and documented colors (Dragon now blue, Fire warmer orange); electric/ice/flying glyphs are dark for contrast; hovering a chip shows the type name tooltip; no text label appears. Check EventsCatalog and MyCollection chips too. Confirm no console errors via `read_console_messages`.

- [ ] **Step 5: Commit**

```bash
git add src/react-app/components/TypeChip.tsx src/react-app/styles.css
git commit -m "feat(flex-A): icon-only type chips everywhere"
```

---

## Self-Review

**Spec coverage (Section 1 of the spec):**
- Adopt documented palette app-wide → Task 1 (ripples via `typeColor` to auras/ribbon accents automatically). ✓
- `TypeIcon` via CSS mask, served from `public/types` → Tasks 2–3. ✓
- Icon-only chips everywhere types appear → Task 4 (all 3 `TypeChip` callers; no separate type-filter UI exists yet, so nothing else to convert). Stats by-type chart and type ribbons consume `TypeIcon` in later phases (B/G). ✓
- Accessibility (role/aria-label/title) → Task 3 component. ✓

**Placeholder scan:** none — every step has concrete code/commands and expected output.

**Type consistency:** `typeIconUrl` (Task 2) → used by `TypeIcon` (Task 3) → used by `TypeChip` (Task 4). `TypeIcon` props `{type,color,size}` consistent across Tasks 3–4. `TypeChip` prop shape `{type}` unchanged, so callers are untouched.

**Note carried forward:** Phases B–G get their own plans when reached. Phase B (ribbon icon system) will reuse `TypeIcon` for type-ribbon center glyphs.
