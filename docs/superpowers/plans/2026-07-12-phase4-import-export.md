# PokeDexFlex Phase 4 — Import & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a signed-in user bulk-import their collection from CSV (the Airtable path) or JSON, with a preview → confirm flow, and export their whole collection as JSON.

**Architecture:** Pure parse/map helpers (CSV/JSON → validated `SpecimenInput` rows) reused by a login-required `import.ts` route (`/preview`, `/commit`) and an `/export` route, over the existing `specimens` table + `validateSpecimen` (Phase 2). React gets an Import/Export page: upload → (CSV) column mapping → preview table → confirm; and a one-click JSON export.

**Tech Stack:** Cloudflare Workers, D1, Drizzle, Hono; Vite/React/TS; Vitest.

## Global Constraints

- Cloudflare Workers runtime (no Node-only APIs); TS strict; `tsc -b` of record.
- Import/export are **login-required** (`requireUser`), user-scoped. Reuse Phase 2 `validateSpecimen` for per-row validation; bad rows are reported, not silently dropped.
- No fabrication; preview shows exactly what will be created before commit. Reuse design system; a11y; light/dark.
- CSV parsing must handle quoted fields, embedded commas/newlines, and a header row. Keep it dependency-light (a small robust parser is fine; avoid heavy libs).

## File Structure

```
src/worker/import/csv.ts          # parseCsv(text) -> string[][]; pure
src/worker/import/map.ts          # header auto-detect + rowToSpecimenInput(mapping,row); pure
src/worker/routes/import.ts       # POST /api/import/preview, /api/import/commit (login-required)
src/worker/routes/export.ts       # GET /api/export (login-required) -> collection JSON
src/worker/index.ts               # mount
src/react-app/pages/ImportExport.tsx
src/react-app/api.ts              # import/export client helpers
src/react-app/App.tsx             # wire Import/Export view
tests/worker/import.test.ts
tests/scripts-or-worker/csv.test.ts (tests/worker/csv.test.ts)
```

---

### Task 1: CSV parser + column mapping (pure)

**Files:** Create `src/worker/import/csv.ts`, `src/worker/import/map.ts`; Test `tests/worker/csv.test.ts`.

**Interfaces (Produces):**
- `parseCsv(text: string): string[][]` — RFC4180-ish: comma-separated, `"`-quoted fields (with `""` escapes), handles commas/newlines inside quotes, trims a trailing newline. First row is data (caller treats row 0 as header).
- `type FieldMapping = Record<string, string | null>` (csv header → specimen field name or null=ignore).
- `autoDetectMapping(headers: string[]): FieldMapping` — case-insensitive match of headers to specimen fields (`species`/`pokemon`→speciesName-or-id resolution handled downstream, `nickname`,`level`,`shiny`,`gender`,`nature`,`ability`,`item`/`held item`→heldItem, `ball`,`ot`/`ot name`→otName,`id`/`ot id`→otId, `hp iv`..→ivs.*, `hp ev`..→evs.*, `box`,`notes`,`shiny`).
- `rowToInput(headers: string[], row: string[], mapping: FieldMapping, resolveSpecies: (name: string) => number | null): { input?: SpecimenInput; errors: string[] }` — builds a SpecimenInput from a row; resolves a `species` column (name or numeric dex) to speciesId via `resolveSpecies`; collects errors (unknown species, bad number) but leaves final bound-validation to `validateSpecimen`.

- [ ] **Step 1: failing tests** in `tests/worker/csv.test.ts`: `parseCsv` on a quoted CSV with an embedded comma + newline → correct 2D array; `autoDetectMapping(["Species","Nickname","Level","Shiny"])` maps those; `rowToInput` builds an input with speciesId resolved (via a stub resolver) and flags an unknown species.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `csv.ts` + `map.ts` (pure; no I/O). **Step 4:** run → PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: CSV parser + column mapping helpers`.

---

### Task 2: Import (preview/commit) + Export API

**Files:** Create `src/worker/routes/import.ts`, `src/worker/routes/export.ts`; Modify `src/worker/index.ts`; Test `tests/worker/import.test.ts`.

**Interfaces (login-required, `requireUser`):**
- `POST /api/import/preview` body `{ format: "csv"|"json", content: string, mapping?: FieldMapping }` → `{ headers?: string[], suggestedMapping?: FieldMapping, rows: { input: SpecimenInput | null, errors: string[] }[], validCount, errorCount }`. CSV: parse, auto-detect (or use provided) mapping, build+validate each row (species resolved from the DB species table by name or dex). JSON: expects an array of specimen-like objects (e.g. from `/api/export`); validate each.
- `POST /api/import/commit` body `{ format, content, mapping? }` → re-parse+validate, insert all VALID rows as the user's specimens (source `"csv"` or `"json"`), skip invalid; return `{ created, skipped }`. (Re-validate server-side; never trust a client-sent "valid" list.)
- `GET /api/export` → `{ exportedAt, count, specimens: [...] }` — the user's specimens as plain objects (speciesId, formId, all fields, ivs/evs/moves/ribbons as arrays/objects), suitable to re-import.

- [ ] **Step 1: failing test** (sign-in helper from collection.test.ts; seed species e.g. 6 charizard, 25 pikachu): preview a small CSV (`Species,Nickname,Level,Shiny\nCharizard,Blaze,100,yes\nPikachu,,50,no\nNotAPokemon,,5,no`) → validCount 2, errorCount 1 (unknown species). commit the same → created 2, skipped 1; `GET /api/collection` shows 2. Export → JSON with 2 specimens; re-import that JSON via preview/commit → 2 more (round-trip). Unauthenticated → 401.
- [ ] **Step 2:** FAIL. **Step 3:** implement routes + mount (`/api/import`, `/api/export`); resolve species by name (lowercased) or numeric dex against the species table. **Step 4:** PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: import preview/commit + JSON export API`.

---

### Task 3: Import/Export UI

**Files:** Create `src/react-app/pages/ImportExport.tsx`; Modify `src/react-app/api.ts`, `App.tsx`, `styles.css`.

**Interfaces:** `api.ts`: `importPreview({format,content,mapping?})`, `importCommit({format,content,mapping?})`, `exportCollection()` (returns JSON; trigger a file download). Page (login-gated): 
- **Import:** a file input (accept .csv/.json) or paste box; on CSV, show detected column mapping (editable <select> per header → specimen field/ignore); a **Preview** table (first N rows: species, key fields, ✓/✗ with error messages, "{validCount} valid, {errorCount} skipped"); a **Confirm import** button → commit → success ("Added N Pokémon to your collection") → collection refetch.
- **Export:** a "Download my collection (JSON)" button → calls exportCollection → downloads `pokeflexdex-collection.json`.

- [ ] **Step 1:** api.ts helpers (credentials include; export triggers a Blob download).
- [ ] **Step 2:** build `ImportExport.tsx` (login-gated; upload/paste → mapping (CSV) → preview → confirm; export button). Reuse design tokens; a table with clear valid/invalid styling; loading/empty/error states.
- [ ] **Step 3:** wire an "Import / Export" view in `App.tsx` (from AccountMenu). Add styles to `styles.css`.
- [ ] **Step 4: VERIFY** `tsc -b` 0; suite pass; `npm run build` clean. **Commit** `feat: import/export page`.

---

## Self-Review

- CSV import (Airtable path) with mapping + preview + confirm → Tasks 1–3. ✅
- JSON export + JSON import (round-trip) → Tasks 2–3. ✅
- Login-required, user-scoped, server-side re-validation on commit → Task 2. ✅
- Reuses `validateSpecimen`, `SpecimenInput`, `requireUser`, species resolution → consistent. ✅
- Manual add already exists (Phase 2 specimen editor). Photo (Gen 8/9/HOME) + USUM save import are Phases 5–6. ✅
