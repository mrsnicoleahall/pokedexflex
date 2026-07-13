# PokeFlexDex Phase 6 — USUM Save-File Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a signed-in user upload an Ultra Sun / Ultra Moon (USUM) `.sav` file and import the Pokémon from its PC boxes + party into their collection, via a preview → confirm flow. **USUM only** (per project scope) — other save formats are rejected with a clear message.

**Architecture:** A pure PK7 decrypt/parse module (block-unshuffle + PRNG XOR, then field extraction), a USUM save reader that validates the format and iterates box/party slots, a login-required `save-import` route (upload → parse → resolve species → preview, reusing the Phase-4 preview/commit shapes), and a save-import UI panel. Correctness of the crypto is proven with **synthetic round-trip tests** (build a PK7 → encrypt → decrypt → parse → assert), since no real `.sav` fixture is committed.

**Tech Stack:** Cloudflare Workers, D1/Drizzle, Hono; Vite/React/TS; Vitest.

## Global Constraints

- Cloudflare Workers runtime (no Node-only APIs — use `DataView`/`Uint8Array`, not Node Buffer); TS strict; `tsc -b` of record.
- **USUM only.** Detect by save size + game-version bytes; reject Sun/Moon, other gens, or unrecognized files with `{error:"unsupported_save"}` and a clear UI message ("Only Ultra Sun / Ultra Moon saves are supported."). No auto-detection of other generations. (See memory: save-file import = USUM only.)
- **No real `.sav` fixture** is available in this environment, so end-to-end correctness against a genuine save cannot be verified here. Prove the crypto/parse with synthetic PK7/box round-trip tests, structure the reader to documented USUM offsets, and DOCUMENT in the report + UI that a real USUM save should be validated before relying on it. Never fabricate imported Pokémon — parse only.
- Login-required (`requireUser`), user-scoped. Human-in-the-loop: preview before create. Reuse `validateSpecimen`, species resolution, and the Phase-4 commit path. Uploaded saves are processed in-memory (optionally stored to R2); never committed to git.

## Reference (documented Gen-7 PK7 / USUM layout — implement to these)

- **PK7**: 232 bytes. `EncryptionConstant` (EC) u32 at 0x00; `Sanity` u16 at 0x04; `Checksum` u16 at 0x06; encrypted data 0x08..0xE7 (224 bytes = four 56-byte blocks). Decrypt: seed = EC; walk the 224-byte region as u16 LE, `value ^= (seed = (seed*0x41C64E6D + 0x6073) >>> 0) >>> 16`; then **unshuffle** the four blocks using the permutation indexed by `((EC >> 13) & 31) % 24`. Field offsets in the *decrypted, unshuffled* data (block A): Species u16 @ 0x08; Held item u16 @ 0x0A; TID u16 @ 0x0C; SID u16 @ 0x0E; PID u32 @ 0x18; Nature @ 0x1C; Form/gender byte @ 0x1D; EVs bytes @ 0x1E..0x23; Nickname (UTF-16LE, 12 chars) @ 0x40; Move1-4 u16 @ 0x5A; IVs packed u32 @ 0x74 (each 5 bits: hp/atk/def/spe/spa/spd; bit30 = isEgg, bit31 = isNicknamed); OT name @ 0xB0; level derived from EXP u32 @ 0x10 via the species' growth rate — for import, level may be left null or computed from EXP if a growth table is available (null is acceptable). **Shiny**: `((TID ^ SID ^ (PID>>16) ^ (PID&0xFFFF)) < 16)`.
- **USUM save**: total size ~0x6CC00. PC box data is a contiguous block of 32 boxes × 30 slots × 232 bytes (stored/encrypted PK7). Party + current box also PK7 slots. Use the documented USUM box-data offset; iterate slots, skip empty (all-zero / species 0). (Confirm exact offset from PKHeX-documented USUM layout during implementation.)

## File Structure

```
src/worker/import/pk7.ts          # decryptPk7, parsePk7 (pure)
src/worker/import/usum-save.ts    # isUsumSave(bytes), readUsumBoxes(bytes) -> ParsedMon[] (pure)
src/worker/routes/save-import.ts  # POST /api/import/save/preview (login-required)
src/worker/index.ts               # mount
src/react-app/pages/ImportExport.tsx  # add "From a USUM save file" panel
src/react-app/api.ts              # savePreview(file)
tests/worker/pk7.test.ts
tests/worker/usum-save.test.ts
```

---

### Task 1: PK7 decrypt + parse (pure) with synthetic round-trip tests

**Files:** Create `src/worker/import/pk7.ts`; Test `tests/worker/pk7.test.ts`.

**Interfaces (Produces):**
- `type ParsedMon = { species: number; form: number; shiny: boolean; nickname: string | null; level: number | null; ivs: {hp,atk,def,spa,spd,spe} | null; evs: {hp,atk,def,spa,spd,spe} | null; moves: number[]; otName: string | null; otId: string | null; heldItem: number | null; nature: number | null }`.
- `decryptPk7(stored: Uint8Array): Uint8Array` — pure; PRNG-XOR the 0x08..0xE7 region then unshuffle the four 56-byte blocks per EC. Returns the 232-byte decrypted+unshuffled buffer.
- `encryptPk7(decrypted: Uint8Array): Uint8Array` — inverse (shuffle + XOR) — needed for round-trip tests (and harmless to ship).
- `parsePk7(decrypted: Uint8Array): ParsedMon` — read the documented offsets into `ParsedMon`; shiny from TID/SID/PID; IVs unpacked from the u32; nickname/OT from UTF-16LE; empty slot (species 0) → species 0 (caller skips).

- [ ] **Step 1: failing tests** in `tests/worker/pk7.test.ts`: construct a decrypted PK7 buffer with known fields (set EC, species=6 @0x08, a PID/TID/SID that yields shiny, IVs packed, a UTF-16LE nickname "Blaze"), `encryptPk7` it, then `decryptPk7` → assert it equals the original decrypted buffer (round-trip); `parsePk7(decrypted)` → species 6, the nickname, correct shiny, unpacked IVs. Include a non-shiny case and an empty (all-zero) buffer → species 0.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `pk7.ts` (pure; DataView/Uint8Array only; the block-shuffle permutation table for 24 orderings). **Step 4:** run → PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: PK7 decrypt/parse with round-trip tests`.

---

### Task 2: USUM save reader (pure)

**Files:** Create `src/worker/import/usum-save.ts`; Test `tests/worker/usum-save.test.ts`.

**Interfaces:** `isUsumSave(bytes: Uint8Array): boolean` (size + version check — reject non-USUM); `readUsumBoxes(bytes: Uint8Array): ParsedMon[]` — iterate the PC box region (32×30 slots) + party, `decryptPk7`+`parsePk7` each non-empty slot (species != 0), return the parsed mons. Throw `UnsupportedSaveError` if `!isUsumSave`.

- [ ] **Step 1: failing test** `tests/worker/usum-save.test.ts`: build a synthetic "save" buffer of the USUM size with a couple encrypted PK7s placed at the documented box offset (reuse `encryptPk7` from Task 1) and the rest zero → `readUsumBoxes` returns those 2 parsed mons (species correct), skips empties. A too-small / wrong-size buffer → `isUsumSave` false and `readUsumBoxes` throws `UnsupportedSaveError`.
- [ ] **Step 2:** FAIL. **Step 3:** implement (documented USUM box offset + slot iteration; confirm the offset from PKHeX docs during impl and note it). **Step 4:** PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: USUM save reader (box iteration)`.

---

### Task 3: Save-import route

**Files:** Create `src/worker/routes/save-import.ts`; Modify `src/worker/index.ts`; Test `tests/worker/usum-save.test.ts` (add route cases).

**Interfaces:** `POST /api/import/save/preview` (login-required; multipart `save` file) → `readUsumBoxes(bytes)` (catch `UnsupportedSaveError` → `400 {error:"unsupported_save"}`), map each `ParsedMon` → SpecimenInput (species by national dex id — PK7 species IS the national dex number for Gen 7; set isShiny, nickname, ivs, evs, moves, otName, otId, level, heldItem-by-id-optional), `validateSpecimen`, return the Phase-4 preview shape. Confirmed rows create via the existing `POST /api/import/commit` (format json). Mount `/api/import/save`.

- [ ] **Step 1: failing test** (sign-in helper; seed species e.g. 6): build a synthetic USUM save with 2 known PK7s, `POST /api/import/save/preview` (authed) → preview with those species; a non-USUM buffer → 400 `unsupported_save`; unauthenticated → 401.
- [ ] **Step 2:** FAIL. **Step 3:** implement + mount. **Step 4:** PASS; `tsc -b` 0; suite pass. **Step 5: commit** `feat: USUM save-import preview route`.

---

### Task 4: Save-import UI

**Files:** Modify `src/react-app/pages/ImportExport.tsx`, `api.ts`, `styles.css`.

**Interfaces:** `api.ts`: `savePreview(file: File)` (multipart, credentials include; surface the 400 `unsupported_save` distinctly). UI: a "From an Ultra Sun / Ultra Moon save (.sav)" panel: file input (accept `.sav,.bin`) + note ("Gen 7 USUM only — export your save with a homebrew tool"). On upload → `savePreview` → preview table (recognized mons, editable/checkable) → confirm via `importCommit` (format json). On `unsupported_save` → friendly message ("That doesn't look like an Ultra Sun / Ultra Moon save. Only USUM saves are supported."). Note in the panel that save import is best-effort and to double-check results.

- [ ] **Step 1:** `api.ts` `savePreview`. **Step 2:** add the panel to ImportExport (upload → preview → confirm; unsupported message). Reuse preview-table styling. **Step 3: VERIFY** `tsc -b` 0; suite pass; `npm run build` clean. **Step 4: commit** `feat: USUM save-import UI`.

---

## Self-Review

- USUM `.sav` → parse boxes/party → preview → confirm into collection → Tasks 1–4. ✅
- USUM only; non-USUM rejected with a clear message → Tasks 2–4. ✅
- Crypto/parse proven via synthetic round-trip tests (no real save fixture); honesty about real-save validation documented → Tasks 1–2 + report. ✅
- Reuses `ParsedMon`→SpecimenInput, `validateSpecimen`, species resolution, Phase-4 commit; login-required; Web APIs only. ✅
- Manual/CSV/JSON/photo imports already done; this completes the import roadmap. ✅
