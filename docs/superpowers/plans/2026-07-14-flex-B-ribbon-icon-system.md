# Flex Phase B — Ribbon Icon System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every ribbon a unique, generated icon: a recolorable rosette frame with a center glyph, plus reserved kawaii "piece" icons for marquee ribbons — applied to the existing Ribbons page.

**Architecture:** A pure resolver (`ribbonIcon.ts`) maps each ribbon's `id`/`category` to a `RibbonVisual` (either a recolored rosette + glyph, or a fixed kawaii piece). `RibbonFrame` inlines one rosette SVG whose three pleat fills are CSS `var()`s; shades derive from a single `--r-base` via `color-mix` (no JS color math). `RibbonIcon` composes the resolver + frame + glyph (a `TypeIcon`, text, emoji, or a piece `<img>`). The worker/API is untouched — resolution is purely client-side.

**Tech Stack:** Vite + React + TypeScript; Vitest (Workers pool) for pure-TS tests; CSS in `src/react-app/styles.css`. Depends on Phase A (`TypeIcon`, `typeColor`).

## Global Constraints

- Resolution is client-side only. Do NOT change `src/worker/ribbons/catalog.ts`, the API, or `RibbonDto`.
- Ribbon id/category patterns (verbatim): Grand = `living-dex`, `complete-dex-forms`; `gen-{1..9}` (cat `Generation`); `type-{slug}` (cat `Type`); `form-fanatic-{mega|regional|gigantamax}` (cat `Forms`); `formset-{speciesId}` (cat `Form Sets`); `shiny-{10|50|100}` (cat `Shiny`); `event-{10|50|100}` (cat `Events`); `fun-*` (cat `Fun`, some `secret`).
- Rosette recolor: swap the 3 pleat fills (`#e4007f`→`var(--r-main)`, `#f92891`→`var(--r-mid)`, `#ff9fd4`→`var(--r-light)`) only; keep the gold ring (`#fdf37a`) and white center (`#fff`) fixed. Shades from `--r-base` via `color-mix`.
- Kawaii pieces used as-is (no recolor), reserved one-per-marquee: `trophy`=living-dex/Grand, `diamond`=complete-dex-forms, `starribbon`=shiny-100, `gift`=event-100. (`coin`, `heart` reserved for later phases.)
- Secret unearned ribbons must render a neutral "?" rosette (no glyph leak) — the component receives a `hidden` flag from the page.
- Do NOT start a dev server; verify via `npx vitest run`, `npx tsc -b`, `npm run build`. Visual verification is the controller's job.

---

### Task 1: Rosette recolor template

**Files:**
- Copy: `assets/ribbons/darkpinkribbon.svg` → `src/react-app/ribbons/rosette.svg`
- Create: `src/react-app/ribbons/rosette.ts`
- Test: `tests/react-app/rosette.test.ts`

**Interfaces:**
- Produces: `transformRosette(raw: string): string` and `ROSETTE_MARKUP: string` from `src/react-app/ribbons/rosette.ts`. `transformRosette` replaces the 3 pleat hexes with `var(--r-main|mid|light)` and leaves gold/white intact.

- [ ] **Step 1: Copy the rosette into src**

```bash
mkdir -p src/react-app/ribbons && cp assets/ribbons/darkpinkribbon.svg src/react-app/ribbons/rosette.svg
```

- [ ] **Step 2: Write the failing test**

Create `tests/react-app/rosette.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { transformRosette } from "../../src/react-app/ribbons/rosette";

const SAMPLE = `.cls-2 { fill: #e4007f; } .cls-4 { fill: #f92891; } .cls-5 { fill: #ff9fd4; } .cls-6 { fill: #fdf37a; } .cls-3 { fill: #fff; }`;

describe("transformRosette", () => {
  it("replaces the three pleat fills with CSS variables", () => {
    const out = transformRosette(SAMPLE);
    expect(out).toContain("fill: var(--r-main)");
    expect(out).toContain("fill: var(--r-mid)");
    expect(out).toContain("fill: var(--r-light)");
    expect(out).not.toContain("#e4007f");
    expect(out).not.toContain("#f92891");
    expect(out).not.toContain("#ff9fd4");
  });
  it("keeps the gold ring and white center fixed", () => {
    const out = transformRosette(SAMPLE);
    expect(out).toContain("#fdf37a");
    expect(out).toContain("#fff");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/react-app/rosette.test.ts`
Expected: FAIL — `transformRosette` not exported.

- [ ] **Step 4: Implement**

Create `src/react-app/ribbons/rosette.ts`:

```ts
// The one rosette geometry, recolored at runtime: its three pleat fills
// become CSS variables so any base color yields an on-brand rosette. The
// gold inner ring and white center stay fixed. Raw SVG imported as a string.
import rawRosette from "./rosette.svg?raw";

/** Swap the 3 pleat hexes for CSS vars; leave gold ring (#fdf37a) + white (#fff) alone. */
export function transformRosette(raw: string): string {
	return raw
		.replaceAll("#e4007f", "var(--r-main)")
		.replaceAll("#f92891", "var(--r-mid)")
		.replaceAll("#ff9fd4", "var(--r-light)");
}

export const ROSETTE_MARKUP = transformRosette(rawRosette);
```

If TypeScript complains about the `?raw` import, add a triple-slash `/// <reference types="vite/client" />` at the top of the file (the project uses Vite, which declares `*?raw` modules).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/react-app/rosette.test.ts`
Expected: PASS (2 tests). (The test imports only `transformRosette`, not `ROSETTE_MARKUP`, so the `?raw` import is not exercised under the Workers pool.)

- [ ] **Step 6: Commit**

```bash
git add src/react-app/ribbons/rosette.svg src/react-app/ribbons/rosette.ts tests/react-app/rosette.test.ts
git commit -m "feat(flex-B): recolorable rosette template (var-fill pleats)"
```

---

### Task 2: Ribbon icon resolver (pure)

**Files:**
- Create: `src/react-app/ribbons/ribbonIcon.ts`
- Test: `tests/react-app/ribbonIcon.test.ts`

**Interfaces:**
- Consumes: `typeColor` from `../theme`.
- Produces: `RibbonGlyph`, `RibbonVisual`, and `resolveRibbonIcon(ribbon: { id: string; category: string }): RibbonVisual` from `src/react-app/ribbons/ribbonIcon.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/react-app/ribbonIcon.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveRibbonIcon } from "../../src/react-app/ribbons/ribbonIcon";
import { typeColor } from "../../src/react-app/theme";

describe("resolveRibbonIcon", () => {
  it("marquee Grand ribbons use reserved pieces", () => {
    expect(resolveRibbonIcon({ id: "living-dex", category: "Grand" })).toEqual({ kind: "piece", piece: "trophy" });
    expect(resolveRibbonIcon({ id: "complete-dex-forms", category: "Grand" })).toEqual({ kind: "piece", piece: "diamond" });
  });
  it("type ribbons: rosette in the type color with the type glyph", () => {
    expect(resolveRibbonIcon({ id: "type-fire", category: "Type" })).toEqual({
      kind: "rosette", baseColor: typeColor("fire"), glyph: { kind: "type", type: "fire" },
    });
  });
  it("generation ribbons: ramp color + roman numeral", () => {
    const v = resolveRibbonIcon({ id: "gen-3", category: "Generation" });
    expect(v.kind).toBe("rosette");
    if (v.kind === "rosette") expect(v.glyph).toEqual({ kind: "text", text: "III" });
  });
  it("top shiny/event tiers use reserved pieces, lower tiers use rosettes", () => {
    expect(resolveRibbonIcon({ id: "shiny-100", category: "Shiny" })).toEqual({ kind: "piece", piece: "starribbon" });
    expect(resolveRibbonIcon({ id: "event-100", category: "Events" })).toEqual({ kind: "piece", piece: "gift" });
    expect(resolveRibbonIcon({ id: "shiny-10", category: "Shiny" }).kind).toBe("rosette");
  });
  it("form sets get a per-species hue so they stay distinct", () => {
    const a = resolveRibbonIcon({ id: "formset-25", category: "Form Sets" });
    const b = resolveRibbonIcon({ id: "formset-201", category: "Form Sets" });
    expect(a).not.toEqual(b);
    expect(a.kind).toBe("rosette");
  });
  it("unknown ids fall back to a normal-color rosette with a letter", () => {
    expect(resolveRibbonIcon({ id: "xyz", category: "Whatever" })).toEqual({
      kind: "rosette", baseColor: typeColor("normal"), glyph: { kind: "text", text: "X" },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/react-app/ribbonIcon.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/react-app/ribbons/ribbonIcon.ts`:

```ts
// Pure client-side resolver: maps a ribbon's id/category to how its icon
// should render. Marquee ribbons get a reserved kawaii "piece"; families get
// a recolored rosette + a center glyph. Color-coding (type color, generation
// ramp, per-species hue) keeps every ribbon visually distinct at scale.
import { typeColor } from "../theme";

export type RibbonGlyph =
	| { kind: "type"; type: string }
	| { kind: "text"; text: string }
	| { kind: "emoji"; emoji: string };

export type RibbonVisual =
	| { kind: "rosette"; baseColor: string; glyph: RibbonGlyph }
	| { kind: "piece"; piece: string };

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

/** Per-generation base hues (distinct, roughly evoking each region's palette). */
const GEN_COLORS: Record<number, string> = {
	1: "#EF5350", 2: "#FFB300", 3: "#43A047", 4: "#26C6DA",
	5: "#5C6BC0", 6: "#EC407A", 7: "#FF7043", 8: "#AB47BC", 9: "#8D6E63",
};

/** Emoji for the three form-fanatic ribbons. */
const FORM_EMOJI: Record<string, string> = { mega: "🧬", regional: "🗺️", gigantamax: "🌀" };

export function resolveRibbonIcon(ribbon: { id: string; category: string }): RibbonVisual {
	const { id, category } = ribbon;

	if (id === "living-dex") return { kind: "piece", piece: "trophy" };
	if (id === "complete-dex-forms") return { kind: "piece", piece: "diamond" };

	if (category === "Type" && id.startsWith("type-")) {
		const type = id.slice("type-".length);
		return { kind: "rosette", baseColor: typeColor(type), glyph: { kind: "type", type } };
	}

	if (category === "Generation" && id.startsWith("gen-")) {
		const n = Number(id.slice("gen-".length));
		return {
			kind: "rosette",
			baseColor: GEN_COLORS[n] ?? "#7E8AA2",
			glyph: { kind: "text", text: ROMAN[n] ?? String(n) },
		};
	}

	if (category === "Shiny") {
		if (id === "shiny-100") return { kind: "piece", piece: "starribbon" };
		return { kind: "rosette", baseColor: typeColor("fairy"), glyph: { kind: "emoji", emoji: "✦" } };
	}

	if (category === "Events") {
		if (id === "event-100") return { kind: "piece", piece: "gift" };
		return { kind: "rosette", baseColor: typeColor("grass"), glyph: { kind: "emoji", emoji: "🎁" } };
	}

	if (category === "Forms") {
		const key = id.replace("form-fanatic-", "");
		return { kind: "rosette", baseColor: typeColor("psychic"), glyph: { kind: "emoji", emoji: FORM_EMOJI[key] ?? "✨" } };
	}

	if (category === "Form Sets") {
		const spId = Number(id.replace("formset-", "")) || 0;
		const hue = (spId * 47) % 360;
		return { kind: "rosette", baseColor: `hsl(${hue} 68% 55%)`, glyph: { kind: "emoji", emoji: "🎴" } };
	}

	if (category === "Fun") {
		return { kind: "rosette", baseColor: typeColor("poison"), glyph: { kind: "emoji", emoji: "🎉" } };
	}

	if (category === "Grand") return { kind: "piece", piece: "trophy" };

	return { kind: "rosette", baseColor: typeColor("normal"), glyph: { kind: "text", text: (id[0] ?? "?").toUpperCase() } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/react-app/ribbonIcon.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/react-app/ribbons/ribbonIcon.ts tests/react-app/ribbonIcon.test.ts
git commit -m "feat(flex-B): ribbon icon resolver (id/category -> visual)"
```

---

### Task 3: `RibbonFrame` + `RibbonIcon` components

**Files:**
- Create: `src/react-app/ribbons/RibbonFrame.tsx`
- Create: `src/react-app/ribbons/RibbonIcon.tsx`
- Copy: 6 kawaii pieces → `public/ribbons/`
- Modify: `src/react-app/styles.css` (add ribbon-icon styles)

**Interfaces:**
- Consumes: `ROSETTE_MARKUP` (Task 1), `resolveRibbonIcon`/`RibbonVisual` (Task 2), `TypeIcon` (Phase A).
- Produces: `RibbonFrame({ baseColor, children, size? })` and `RibbonIcon({ ribbon, hidden?, size? })` from their respective files. `ribbon` is `{ id: string; category: string }`.

- [ ] **Step 1: Copy kawaii pieces to public**

```bash
mkdir -p public/ribbons && cp assets/ribbons/{trophy,diamond,coin,gift,heart,starribbon}.svg public/ribbons/ && ls public/ribbons
```
Expected: the 6 files listed.

- [ ] **Step 2: Create `RibbonFrame`**

`src/react-app/ribbons/RibbonFrame.tsx`:

```tsx
// The recolorable rosette. One inlined SVG whose pleat fills are CSS vars;
// mid/main/light shades derive from a single --r-base via color-mix. Children
// (the center glyph) are absolutely centered over the white rosette center.
import type { CSSProperties, ReactNode } from "react";
import { ROSETTE_MARKUP } from "./rosette";

export function RibbonFrame({ baseColor, children, size = 64 }: { baseColor: string; children?: ReactNode; size?: number }) {
	return (
		<span className="ribbon-frame" style={{ width: size, height: size, ["--r-base" as keyof CSSProperties]: baseColor } as CSSProperties}>
			<span className="ribbon-frame__art" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ROSETTE_MARKUP }} />
			{children && <span className="ribbon-frame__glyph">{children}</span>}
		</span>
	);
}
```

- [ ] **Step 3: Create `RibbonIcon`**

`src/react-app/ribbons/RibbonIcon.tsx`:

```tsx
// Composes the resolver + frame + glyph into one ribbon icon. Reserved kawaii
// pieces render as <img>. Rosette ribbons render a recolored frame with a
// TypeIcon / text / emoji glyph. `hidden` (secret unearned) forces a neutral
// "?" rosette so nothing leaks.
import { TypeIcon } from "../components/TypeIcon";
import { typeColor } from "../theme";
import { RibbonFrame } from "./RibbonFrame";
import { resolveRibbonIcon, type RibbonGlyph } from "./ribbonIcon";

function Glyph({ glyph, color, size }: { glyph: RibbonGlyph; color: string; size: number }) {
	if (glyph.kind === "type") return <TypeIcon type={glyph.type} color={color} size={size} />;
	if (glyph.kind === "emoji") return <span className="ribbon-glyph ribbon-glyph--emoji" style={{ fontSize: size }}>{glyph.emoji}</span>;
	return <span className="ribbon-glyph ribbon-glyph--text" style={{ color, fontSize: size * 0.72 }}>{glyph.text}</span>;
}

export function RibbonIcon({ ribbon, hidden = false, size = 64 }: { ribbon: { id: string; category: string }; hidden?: boolean; size?: number }) {
	if (hidden) {
		return (
			<RibbonFrame baseColor={typeColor("normal")} size={size}>
				<span className="ribbon-glyph ribbon-glyph--text" style={{ color: typeColor("normal"), fontSize: size * 0.5 }}>?</span>
			</RibbonFrame>
		);
	}
	const visual = resolveRibbonIcon(ribbon);
	if (visual.kind === "piece") {
		return <img className="ribbon-piece" src={`/ribbons/${visual.piece}.svg`} alt="" aria-hidden="true" style={{ width: size, height: size }} />;
	}
	return (
		<RibbonFrame baseColor={visual.baseColor} size={size}>
			<Glyph glyph={visual.glyph} color={visual.baseColor} size={size * 0.42} />
		</RibbonFrame>
	);
}
```

- [ ] **Step 4: Add CSS**

Append to `src/react-app/styles.css`:

```css
.ribbon-frame {
	--r-mid: var(--r-base);
	--r-main: color-mix(in srgb, var(--r-base) 72%, #000);
	--r-light: color-mix(in srgb, var(--r-base) 55%, #fff);
	position: relative;
	display: inline-flex;
	flex: none;
	align-items: center;
	justify-content: center;
}
.ribbon-frame__art,
.ribbon-frame__art svg {
	width: 100%;
	height: 100%;
	display: block;
}
.ribbon-frame__glyph {
	position: absolute;
	top: 42%;
	left: 50%;
	transform: translate(-50%, -50%);
	display: inline-flex;
	align-items: center;
	justify-content: center;
}
.ribbon-glyph--text { font-weight: 800; line-height: 1; }
.ribbon-glyph--emoji { line-height: 1; }
.ribbon-piece { flex: none; object-fit: contain; }
```

(The rosette's white center sits slightly above the geometric middle because of the tails, so the glyph is centered at 42% vertically.)

- [ ] **Step 5: Typecheck + build**

Run: `npx tsc -b && npm run build`
Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src/react-app/ribbons/RibbonFrame.tsx src/react-app/ribbons/RibbonIcon.tsx public/ribbons src/react-app/styles.css
git commit -m "feat(flex-B): RibbonFrame + RibbonIcon components"
```

---

### Task 4: Wire `RibbonIcon` into the Ribbons page

**Files:**
- Modify: `src/react-app/pages/Ribbons.tsx` (the `RibbonCard` component)
- Modify: `src/react-app/styles.css` (card icon placement + locked desaturation)

**Interfaces:**
- Consumes: `RibbonIcon` (Task 3).
- Produces: no new exports; `RibbonCard` renders a `RibbonIcon` for both earned and locked states.

- [ ] **Step 1: Add the icon to `RibbonCard`**

In `src/react-app/pages/Ribbons.tsx`, add the import at the top with the other imports:

```tsx
import { RibbonIcon } from "../ribbons/RibbonIcon";
```

In `RibbonCard`, the earned branch renders the icon before the `<h3>`. Insert immediately inside the earned `<article>`, before the `ribbon-card__shine` span:

```tsx
<div className="ribbon-card__icon">
	<RibbonIcon ribbon={{ id: ribbon.id, category: ribbon.category }} size={72} />
</div>
```

In the locked branch, insert immediately inside the locked `<article>`, before the `<h3>`:

```tsx
<div className="ribbon-card__icon ribbon-card__icon--locked">
	<RibbonIcon ribbon={{ id: ribbon.id, category: ribbon.category }} hidden={hiddenSecret} size={72} />
</div>
```

- [ ] **Step 2: Add CSS**

Append to `src/react-app/styles.css`:

```css
.ribbon-card__icon {
	display: flex;
	justify-content: center;
	margin-bottom: 8px;
}
.ribbon-card__icon--locked {
	filter: grayscale(0.85) opacity(0.55);
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc -b && npm run build`
Expected: both succeed.

- [ ] **Step 4: Visual verification (controller, browser preview on :5173)**

On the Ribbons page confirm: earned ribbons show recolored rosettes with the right center glyph (type ribbons show the type icon in the type color; generation ribbons show roman numerals; Grand shows the trophy; shiny-100/event-100 show the star/gift pieces); locked ribbons are greyed; secret unearned show a neutral "?" rosette with no leaked glyph. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/react-app/pages/Ribbons.tsx src/react-app/styles.css
git commit -m "feat(flex-B): render ribbon icons on the Ribbons page"
```

---

## Self-Review

**Spec coverage (Section 2 of the spec):**
- Recolorable rosette frame + center glyph → Tasks 1, 3. ✓
- Center glyph by family (type/gen/shiny/events/grand/…) → Task 2 resolver. ✓
- Kawaii pieces reserved one-per-marquee → Task 2 (trophy/diamond/starribbon/gift). ✓
- Uniqueness via color-coding (type color / gen ramp / per-species hue) → Task 2. ✓
- Client-side resolution, API lean → Task 2 (no worker changes). ✓
- Applied to existing catalog immediately → Task 4. ✓
- Secret ribbons don't leak → `hidden` path in Task 3, wired in Task 4. ✓

**Placeholder scan:** none — all steps carry concrete code/commands + expected output.

**Type consistency:** `RibbonVisual`/`RibbonGlyph` (Task 2) consumed by `RibbonIcon` (Task 3); `resolveRibbonIcon({id,category})` signature matches the `{id,category}` objects passed in Tasks 3–4; `RibbonFrame({baseColor,children,size})` matches its use in `RibbonIcon`. `ROSETTE_MARKUP` (Task 1) consumed by `RibbonFrame` (Task 3).

**Carried forward:** Phase C extends `resolveRibbonIcon` with new families (Regional, Rarity-class, Specimen-detail) and can assign the still-free `coin`/`heart` pieces. The rosette is inlined per-instance (acceptable for v1); a `<symbol>`+`<use>` sprite is a possible later optimization — note for the final review, not a blocker.
