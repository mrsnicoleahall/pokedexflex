# PokeDexFlex Phase 5 — Photo / HOME Screenshot Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a signed-in user upload a Pokémon HOME / Scarlet-Violet box screenshot and have the app recognize the Pokémon (species, shiny) into an editable preview they confirm into their collection.

**Architecture:** A `VisionRecognizer` interface isolates image→Pokémon recognition; the default impl calls **Cloudflare Workers AI** (`env.AI`) with a vision model and a structured prompt, and a pure `parseRecognition()` turns the model's text into `{ speciesName, shiny }[]`. A login-required `import/photo` route stores the upload to R2, runs the recognizer, resolves species, and returns a preview reusing the Phase-4 import preview/commit shapes. React gets a photo-import panel. Tests inject a **mock recognizer** so the whole pipeline is verified without the live model.

**Tech Stack:** Cloudflare Workers + Workers AI (`AI` binding) + R2 + D1/Drizzle + Hono; Vite/React/TS; Vitest.

## Global Constraints

- Cloudflare Workers runtime (no Node-only APIs); TS strict; `tsc -b` of record.
- **Activation caveat:** the real recognizer uses Workers AI, which requires the `AI` binding and runs on Cloudflare (deploy, or authenticated `wrangler dev --remote`). In plain local dev without Cloudflare auth the model call will fail — the route must return a clear, handled error (`{error:"vision_unavailable"}`, 503) and the UI must show a friendly message ("Photo recognition activates once the app is deployed"). All logic is behind an interface + fully tested with a mock; no fabricated recognition results ever.
- Login-required (`requireUser`), user-scoped. Reuse Phase-4 `validateSpecimen` + species resolution + the commit path. Recognition is HOME/SV boxes (Gen 8/9/HOME) per the product design. Human-in-the-loop: the user reviews/edits the recognized list before anything is created.
- Uploaded images stored in R2 (reuse/extend the sprites bucket or a new `uploads` binding); never commit binaries.

## File Structure

```
wrangler.jsonc                       # add AI binding; (optional) uploads R2 bucket
src/worker/import/vision.ts          # VisionRecognizer interface, parseRecognition() (pure), WorkersAiRecognizer, getRecognizer(env)
src/worker/routes/photo-import.ts    # POST /api/import/photo/preview (image -> recognized preview)
src/worker/index.ts                  # mount
src/react-app/pages/ImportExport.tsx # add a "From a HOME/SV screenshot" panel (or a sibling section)
src/react-app/api.ts                 # photoPreview(imageFile)
tests/worker/vision.test.ts
```

---

### Task 1: Vision recognizer interface + response parser (pure) + Workers AI impl

**Files:** Modify `wrangler.jsonc` (add `"ai": { "binding": "AI" }`); Create `src/worker/import/vision.ts`; Test `tests/worker/vision.test.ts`.

**Interfaces (Produces):**
- `type Recognized = { speciesName: string; shiny: boolean }`.
- `interface VisionRecognizer { recognize(image: ArrayBuffer): Promise<Recognized[]> }`.
- `parseRecognition(modelText: string): Recognized[]` — PURE: parse the model's JSON-ish output (an array of `{name, shiny}` possibly wrapped in prose/code fences) into `Recognized[]`; tolerant of code fences, trailing commas, missing shiny (default false); returns `[]` on unparseable.
- `class WorkersAiRecognizer implements VisionRecognizer` — calls `env.AI.run(<vision-model>, { image: [...bytes], prompt })` where the prompt instructs: "List every Pokémon in this box screenshot as a JSON array of {name, shiny}. Use lowercase English species names. Only output the JSON." Then `parseRecognition(result)`. Model id: use a current Workers AI vision model (e.g. `@cf/meta/llama-3.2-11b-vision-instruct`; if unavailable, `@cf/llava-1.5-7b-hf`) — consult current Cloudflare Workers AI model docs (context7 / developers.cloudflare.com/workers-ai/models) for the exact id + input shape.
- `getRecognizer(env): VisionRecognizer` — returns a `WorkersAiRecognizer` if `env.AI` exists, else a recognizer whose `recognize` throws a `VisionUnavailableError`.

- [ ] **Step 1: failing tests** (PURE, no AI) in `tests/worker/vision.test.ts`: `parseRecognition('```json\n[{"name":"charizard","shiny":true},{"name":"pikachu"}]\n```')` → `[{speciesName:"charizard",shiny:true},{speciesName:"pikachu",shiny:false}]`; unparseable text → `[]`; a bare array without fences works too.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `vision.ts` (add AI binding to wrangler.jsonc; `npm run cf-typegen` so `Env.AI` is typed). **Step 4:** run → PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: vision recognizer interface + parser + Workers AI impl`.

---

### Task 2: Photo-import route (mockable, tested)

**Files:** Create `src/worker/routes/photo-import.ts`; Modify `src/worker/index.ts`; Test `tests/worker/vision.test.ts` (add route cases).

**Interfaces:** `POST /api/import/photo/preview` (login-required; multipart form with an `image` file, or base64 body) → store the image to R2 (key `uploads/{user}/{uuid}`), run `getRecognizer(c.env).recognize(bytes)`, resolve each recognized name to a speciesId (DB species by lowercased name; unknown → row with an error), return a preview in the SAME shape as Phase-4 import preview (`{ rows: {input, errors}[], validCount, errorCount }`) so the existing commit endpoint (`POST /api/import/commit` with `format:"json"` of the confirmed rows) can create them. On `VisionUnavailableError` → `503 {error:"vision_unavailable"}`.
- **Testability:** allow injecting a recognizer for tests — e.g. `getRecognizer` checks `env.AI`; in the test, either bind a fake `AI` or export a hook to pass a mock recognizer. Prefer: the route uses a module-level `getRecognizer` that tests can stub, OR accept a recognizer via a small factory that reads a test override. Keep the real path using `env.AI`.

- [ ] **Step 1: failing test**: with a MOCK recognizer returning `[{speciesName:"charizard",shiny:true},{speciesName:"notamon",shiny:false}]` and seeded species (charizard=6), `POST /api/import/photo/preview` with a tiny fake image → preview with validCount 1 (charizard, shiny) + errorCount 1 (unknown). Unauthenticated → 401. With no recognizer available → 503 `vision_unavailable`.
- [ ] **Step 2:** FAIL. **Step 3:** implement route + mount + R2 storage + the test recognizer injection seam. **Step 4:** PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: photo-import preview route (mockable recognizer)`.

---

### Task 3: Photo-import UI

**Files:** Modify `src/react-app/pages/ImportExport.tsx`, `api.ts`, `styles.css`.

**Interfaces:** `api.ts`: `photoPreview(image: File)` (multipart POST, credentials include) → the preview shape. UI: a "From a HOME / Scarlet-Violet screenshot" panel in the Import/Export page: an image file input (accept image/*) + a note ("Upload a box screenshot; we'll recognize the Pokémon for you to review"). On upload → `photoPreview` → show the recognized list as an editable/checkable preview (each: sprite once resolved, species name [editable], shiny toggle, ✓ include) → reuse the existing "Confirm import" → `importCommit` with `format:"json"` of the confirmed rows. Handle the `503 vision_unavailable` case with a friendly message ("Photo recognition activates once PokeDexFlex is deployed — for now use CSV/JSON or add manually.").

- [ ] **Step 1:** `api.ts` `photoPreview`. 
- [ ] **Step 2:** add the photo panel to ImportExport (upload → preview → edit → confirm), reusing preview-table styling; handle loading + the vision_unavailable message.
- [ ] **Step 3: VERIFY** `tsc -b` 0; suite pass; `npm run build` clean.
- [ ] **Step 4: commit** `feat: photo-import UI (HOME/SV screenshot)`.

---

## Self-Review

- Photo/HOME-SV screenshot → recognized → editable preview → confirm into collection → Tasks 1–3. ✅
- Human-in-the-loop review before create; species resolution + reuse of Phase-4 commit → Tasks 2–3. ✅
- Recognition isolated behind `VisionRecognizer`, pure `parseRecognition` fully tested, real path via Workers AI; graceful 503 when unavailable → Tasks 1–2. ✅ (Honest activation caveat documented.)
- No fabricated recognition; login-required; R2 storage; reuse `validateSpecimen`/commit. ✅
