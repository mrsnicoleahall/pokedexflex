# PokeDexFlex Phase 2 — Collection Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a signed-in user manage their own collection — create/edit/delete individual specimens with the full detail set, organize them into boxes, and have the app's "owned" state reflect their real collection.

**Architecture:** New login-required Hono route groups (`collection.ts`, `boxes.ts`) over the existing `specimens`/`boxes` tables, using `requireUser(c)` (Phase 1) for auth + ownership scoping and a shared `validateSpecimen` helper. The species/events browse routes compute `owned` from the current user's specimens. React gets collection api helpers, a "My Collection" view, a full specimen editor, and box management — all reusing the design system.

**Tech Stack:** Cloudflare Workers, D1, Drizzle, Hono; Vite/React/TS; Vitest.

## Global Constraints

- Cloudflare Workers runtime (no Node-only APIs); TS strict; `tsc -b` of record.
- All collection/box mutations are **login-required** (`requireUser` → 401) and **user-scoped** (never touch another user's rows; unknown/foreign id → 404).
- Validation (server-side, reject with 400 + message): IV each 0–31; EV each 0–252 and sum ≤ 510; level 1–100; ≤ 4 moves; `speciesId` must exist. JSON columns (`ivs`,`evs`,`moves`,`ribbons`) stored as JSON strings.
- Reuse the design system (one visual language); light/dark; responsive; a11y (focus, labels, reduced-motion). Owned state = derived from specimens (species owned iff ≥1 specimen; event owned iff a specimen has matching `eventName`).
- New specimens get `source="manual"`, server-set `id`/`userId`/timestamps.

## File Structure

```
src/worker/collection/validate.ts     # validateSpecimen(input) -> {ok, value, errors}
src/worker/routes/collection.ts        # /api/collection CRUD (login-required)
src/worker/routes/boxes.ts             # /api/boxes CRUD (login-required)
src/worker/routes/species.ts           # MODIFY owned = current user
src/worker/routes/events.ts            # MODIFY owned = current user
src/worker/index.ts                    # mount collection + boxes routes
src/react-app/api.ts                   # collection + boxes client helpers + dtos
src/react-app/collection/SpecimenEditor.tsx
src/react-app/pages/MyCollection.tsx
src/react-app/components/BoxBar.tsx
src/react-app/App.tsx                  # wire My Collection view + add-to-collection
tests/worker/collection.test.ts
tests/worker/boxes.test.ts
tests/worker/owned.test.ts
```

---

### Task 1: Specimen validation + collection CRUD API

**Files:** Create `src/worker/collection/validate.ts`, `src/worker/routes/collection.ts`; Modify `src/worker/index.ts`; Test `tests/worker/collection.test.ts`.

**Interfaces (Produces):**
- `validateSpecimen(input: unknown): { ok: true; value: SpecimenInput } | { ok: false; errors: string[] }` — `SpecimenInput` = the writable fields (speciesId:number required; formId?:number|null; nickname?,level?,isShiny?,gender?,nature?,ability?,heldItem?,ball?,otName?,otId?,metLocation?,metDate?,originGame?,originEra?,isEvent?,eventName?,notes?,boxId?:string|null; ivs?:{hp,atk,def,spa,spd,spe}; evs?:same; moves?:string[]; ribbons?:string[]). Applies the bounds in Global Constraints; unknown/missing optionals default sensibly.
- Routes under `/api/collection` (all `requireUser` first):
  - `POST /` → validate; insert specimen (id=random, userId=user.id, source="manual", createdAt/updatedAt=now, JSON-encode ivs/evs/moves/ribbons); return the created row.
  - `GET /?q=&box=&limit=&offset=` → `{ items: SpecimenDto[], total }` for this user, joined to species (speciesName, homeId, types), filter by `box` (boxId) and `q` (nickname/species name), paginated.
  - `GET /:id` → the user's specimen or 404.
  - `PATCH /:id` → validate partial; update the user's specimen (404 if not theirs); bump updatedAt.
  - `DELETE /:id` → delete the user's specimen (404 if not theirs).

- [ ] **Step 1: failing tests** in `tests/worker/collection.test.ts`: sign in (reuse the auth flow: request-link → verify → grab cookie — or insert a user + session row directly and build a signed cookie via a helper). Then: POST a valid specimen → 200 + row with server id/userId; GET list → contains it with speciesName; POST with IV=40 → 400; POST with EV sum > 510 → 400; PATCH someone else's specimen id → 404; DELETE → gone; unauthenticated POST → 401.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `validate.ts` + routes; mount `app.route("/api/collection", collectionRoutes)`. **Step 4:** run → PASS; `tsc -b` → 0; full suite pass. **Step 5: commit** `feat: collection CRUD API with validation`.

---

### Task 2: Boxes CRUD API

**Files:** Create `src/worker/routes/boxes.ts`; Modify `src/worker/index.ts`; Test `tests/worker/boxes.test.ts`.

**Interfaces:** `/api/boxes` (all `requireUser`): `GET /` → `{ boxes: {id,name,count}[] }` (count = specimens in box for this user); `POST /` `{name}` → created box (id random, userId); `PATCH /:id` `{name}` → rename (user-scoped); `DELETE /:id` → set `boxId=null` on this user's specimens in that box, then delete the box (never deletes specimens).

- [ ] **Step 1: failing test**: signed-in user creates a box, lists (count 0), adds a specimen to it (via collection POST with boxId), list shows count 1, rename works, delete box → box gone AND the specimen still exists with boxId null. Foreign box id → 404.
- [ ] **Step 2:** FAIL. **Step 3:** implement + mount. **Step 4:** PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: boxes CRUD API`.

---

### Task 3: Real per-user owned flags

**Files:** Modify `src/worker/routes/species.ts`, `src/worker/routes/events.ts`; Test `tests/worker/owned.test.ts`.

**Interfaces:** Both browse endpoints compute `owned` from the **current user** (via `getCurrentUser(c)`): species owned iff the user has ≥1 specimen with that speciesId; event owned iff the user has a specimen with `isEvent=1` and `eventName == events.name`. Logged out → `owned:false` everywhere. Remove the `owner=demo` default (keep the demo seed harmless but no longer special-cased).

- [ ] **Step 1: failing test** `tests/worker/owned.test.ts`: signed-in user with no specimens → species/events `owned:false`; after POSTing a specimen for species 6 → `/api/species?q=charizard` shows `owned:true` for Charizard; a second user does NOT see it as owned; logged out → false.
- [ ] **Step 2:** FAIL. **Step 3:** implement (fetch the current user's owned species-id set + owned event-name set once per request; mark items). **Step 4:** PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: per-user owned flags on species and events`.

---

### Task 4: Client helpers + My Collection view + box bar

**Files:** Modify `src/react-app/api.ts`, `App.tsx`; Create `src/react-app/pages/MyCollection.tsx`, `components/BoxBar.tsx`.

**Interfaces:** `api.ts` gains (all `credentials:"include"`): `SpecimenDto` (specimen + speciesName/homeId/types), `BoxDto {id,name,count}`; `listCollection(params)`, `createSpecimen(input)`, `getSpecimen(id)`, `updateSpecimen(id,input)`, `deleteSpecimen(id)`, `listBoxes()`, `createBox(name)`, `renameBox(id,name)`, `deleteBox(id)`.

- [ ] **Step 1:** implement api.ts helpers (throw on non-ok; 401 → surface "sign in required").
- [ ] **Step 2:** `MyCollection` page (login-required; if logged out, prompt to sign in): fetches `listCollection` + `listBoxes`; renders specimens as cards reusing the sprite + type-aura language, each showing nickname/species, level, shiny ✨, box; search + a `BoxBar` (All + each box with counts) to filter by box; empty state ("Your collection is empty — browse the dex and add your first Pokémon."). "Add Pokémon" button opens the specimen editor (Task 5).
- [ ] **Step 3:** `BoxBar` component (box tabs/pills with counts; a "＋ New box" that calls `createBox`; rename/delete affordances calling the box API).
- [ ] **Step 4:** wire into `App.tsx`: a "My Collection" view reachable from AccountMenu/Home quick links (replaces the placeholder). 
- [ ] **Step 5: VERIFY** `tsc -b` 0; suite pass; `npm run build` clean. **Commit** `feat: My Collection view + box bar`.

---

### Task 5: Specimen editor + add-to-collection

**Files:** Create `src/react-app/collection/SpecimenEditor.tsx`; Modify `src/react-app/pages/MyCollection.tsx`, species/events cards or detail to add an "Add to collection" affordance, `styles.css`.

**Interfaces:** `SpecimenEditor` (modal/drawer): props `{ mode: "create"|"edit", initial?: Partial<SpecimenInput> & {speciesId, formId?}, onSaved, onClose }`. Renders grouped fields — **Identity** (species [prefilled/read-only when adding from a card], form select, nickname, level, shiny toggle, gender, nature, ability, held item, ball), **Stats** (IV inputs hp/atk/def/spa/spd/spe 0–31; EV inputs 0–252 with a live sum/510), **Moves** (up to 4), **Origin/Event** (OT name/ID, met location/date, origin game/era, event toggle + event name), **Ribbons** (in-game ribbon multi-select/tags), **Storage/Notes** (box select incl. "＋ new", notes). Save calls create/update; delete (edit mode) with confirm. Client mirrors server validation (bounds) for instant feedback; server is source of truth.

- [ ] **Step 1:** build `SpecimenEditor` with the grouped form + client-side bound checks (IV 0–31, EV 0–252 & sum ≤510, level 1–100, ≤4 moves), reusing input/select styles.
- [ ] **Step 2:** "Add to collection": on a species card/detail and an event card, an "＋ Add" button opens the editor in create mode prefilled with that species/form (and event fields when from an event). On save, the item's Owned badge updates (refetch).
- [ ] **Step 3:** edit + delete from a specimen card in My Collection.
- [ ] **Step 4:** add editor styles to `styles.css` (grouped fieldsets, IV/EV grids) using tokens.
- [ ] **Step 5: VERIFY** `tsc -b` 0; suite pass; build clean. **Commit** `feat: full specimen editor + add-to-collection`.

---

## Self-Review

- Full specimen CRUD with all fields + validation → Tasks 1, 5. ✅
- Boxes (create/rename/delete, never deletes specimens) → Tasks 2, 4. ✅
- Real per-user owned flags → Task 3. ✅
- My Collection view + specimen editor + add-to-collection → Tasks 4–5. ✅
- Login-required + user-scoped (401/404) → Tasks 1–2 (via `requireUser`). ✅
- Type consistency: `SpecimenInput`/`SpecimenDto`/`BoxDto`, `validateSpecimen`, `requireUser`/`getCurrentUser` (Phase 1) used consistently. ✅
- Ribbons here = the Pokémon's in-game ribbons (specimen field); achievement ribbons are Phase 3 (distinct). ✅
