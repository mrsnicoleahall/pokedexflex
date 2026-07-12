# PokeFlexDex — Accounts, Collection & Achievement Ribbons Design

**Date:** 2026-07-12
**Status:** Approved (user thumbs-up); build all phases without check-in.

## Summary

Turn PokeFlexDex from a beautiful browser into a real tracker. Add user
accounts (passwordless, dev-friendly), full per-user collection management
(individual specimens with the complete detail set + boxes), and an
achievement-ribbon system that rewards collection milestones. Plus a homepage
intro and a deeper events dataset. Browsing stays public; anything that
mutates a user's data is login-required.

## Build order (phases)

1. **Events expansion** (data; independent, run early)
2. **Homepage intro** (independent; folded in with Phase 1)
3. **Phase 1 — Accounts / user management**
4. **Phase 2 — Collection management**
5. **Phase 3 — Achievement ribbons**

Accounts must land before Collection (per-user data). Ribbons depend on
Collection. Events-expansion and Homepage are independent and can go first.

---

## Events expansion (data)

Deepen the Bulbapedia events catalog beyond the current 2,030 rows by
improving coverage of pages the first scrape under-collected (older Gen I–III
prose pages, per-language regional pages, wikitable-only pages) and enriching
per-event fields. Keep the **one row per distributed Pokémon per event**
granularity and the no-fabrication rule (null over guess). Exclude item-only
distributions (berries/held items with no Pokémon) — those are not event
Pokémon. Success = a meaningfully larger, still-accurate `events` table with
the same schema; re-seed idempotently via UNIQUE(slug).

---

## Homepage intro

A landing section shown above the catalog (prominent for logged-out users):
- Hero: wordmark + one-line tagline (what PokeFlexDex is).
- Short intro: "Browse every Pokémon and event for free. Sign in to track your
  own living dex, box your collection, and earn ribbons." 
- Primary CTAs: **Browse the Dex** (jump to catalog) and **Sign in** (opens
  auth). For signed-in users, the hero collapses to a slim welcome + quick
  links (My Collection, Ribbons).
- Uses the existing type-aura design system; copy in the app's voice; keyboard
  accessible; light/dark.

---

## Phase 1 — Accounts (user management)

**Passwordless magic-link, dev-friendly.**

**Flow:**
1. User submits email → `POST /api/auth/request-link`. Server creates a
   single-use token (random, stored **hashed** in a `login_tokens` table with
   `email`, `expires_at` [~15 min], `used_at`). 
2. Delivery via an `EmailSender` abstraction:
   - **Dev sender** (default locally): does not email; returns the verify link
     in the response and logs it, so the UI can display "Your sign-in link
     (dev): …". No email provider needed to use accounts locally.
   - **Real sender** (production): sends the link by email (e.g. Resend). Wired
     at deploy behind an env var; not required for local dev.
3. `GET /api/auth/verify?token=…` validates (exists, not expired, not used),
   marks it used, finds-or-creates the `users` row by email, creates a session,
   sets an **httpOnly, SameSite=Lax, signed** session cookie, redirects to app.
4. Session = signed token (HMAC-SHA256 with `SESSION_SECRET` from env; a fixed
   dev default locally) mapping to a `sessions` row (id, user_id, expires_at) —
   or a stateless signed cookie carrying user id + expiry. Use a `sessions`
   table so logout/delete can revoke.

**Endpoints:** `POST /api/auth/request-link` · `GET /api/auth/verify` ·
`POST /api/auth/logout` · `GET /api/auth/me` (→ current user | null) ·
`DELETE /api/auth/account` (delete user + their specimens/boxes/sessions).

**Middleware:** a helper resolves the current user from the cookie; mutation
routes (collection, boxes) reject unauthenticated requests with 401.

**Data:** `login_tokens` (id, token_hash, email, expires_at, used_at,
created_at); `sessions` (id, user_id FK, expires_at, created_at). `users`
already exists (id, email, created_at) — add `display_name` (nullable).

**UI:** a sign-in panel (enter email → in dev, shows the sign-in link to click);
an account menu in the top bar (signed-out: "Sign in"; signed-in: email +
Sign out + Settings); a Settings page (display name, sign out, delete account
with confirm). Never store secrets in the client.

---

## Phase 2 — Collection management

**Specimens** (individual owned Pokémon). The `specimens` table already carries
the full field set. This phase adds per-user CRUD + UI.

**Ownership model:** a specimen is an owned Pokémon instance. A **species** is
"owned" if the user has ≥1 specimen of it (any form); a **form** is owned if a
specimen has that form; an **event** is owned if a specimen's `event_name`
matches (this replaces the demo-only owned flag with the real current user's).

**Full specimen fields (editor):** speciesId, formId, nickname, level, isShiny,
gender, nature, ability, heldItem, ball, IVs (hp/atk/def/spa/spd/spe), EVs
(same six), moves (≤4), otName, otId, metLocation, metDate, originGame,
originEra, isEvent + eventName, ribbons (in-game ribbons, multi-select), boxId,
notes.

**Endpoints (all login-required):**
- `GET /api/collection?q=&box=&limit=&offset=` — the user's specimens (joined
  to species for display), paginated, with `total`.
- `POST /api/collection` — create a specimen (validated).
- `GET /api/collection/:id` · `PATCH /api/collection/:id` · `DELETE /api/collection/:id`
  — all scoped to the owning user (404/403 otherwise).
- `GET /api/boxes` · `POST /api/boxes` · `PATCH /api/boxes/:id` · `DELETE /api/boxes/:id`
  — box management (deleting a box moves its specimens to no box, not delete).
- The species and events browse endpoints compute `owned` from the **current
  user's** specimens (single query → Set), or `false` when logged out.

**UI:**
- **My Collection** view: the user's specimens as cards (reusing the sprite +
  type-aura language), filterable by box + search; box tabs/sidebar.
- **Add to collection**: from a species/form/event card or its detail — opens
  the specimen editor prefilled with species/form (and event fields when adding
  from an event).
- **Specimen editor**: a clean form covering all fields, grouped
  (Identity · Stats [IVs/EVs] · Moves · Origin/Event · Ribbons · Storage/Notes),
  with sensible inputs (IV/EV number fields 0–31 / 0–252, nature/ability/ball
  selects, shiny toggle). Save/cancel/delete.
- Owned badges across Species + Events reflect the signed-in user.

**Validation:** IVs 0–31, EVs 0–252 (sum ≤ 510), level 1–100, ≤4 moves; server
validates and rejects with clear messages.

---

## Phase 3 — Achievement ribbons 🎀

App-granted ribbons, **computed from the user's collection** (no manual
awarding). Distinct from in-game specimen ribbons.

**Ribbon catalog (static definitions; each: id, name, description, category,
target count, predicate over the collection):**
- **Living Dex Master** — own all 1,025 species.
- **Gen Cleared** ×9 — own every species in generation N.
- **Type Master** ×18 — own every species of type T.
- **Shiny Hunter** — tiers at 10 / 50 / 100 shiny specimens.
- **Form Fanatic** — own all Mega forms; all regional forms; all Gigantamax.
- **Form-set completion** — own every form of a specific multi-form species
  (e.g. all Vivillon patterns, all Furfrou trims, all Alcremie, all Unown).
  Generated from the `forms` table (one ribbon per species that has a
  qualifying form set above a threshold count).
- **Event Collector** — own N event Pokémon (tiers, e.g. 10 / 50 / 100).
- **Complete Dex + Forms** — the grand ribbon: all species and all forms.

**Computation:** `GET /api/ribbons` (current user) returns each ribbon with
`{ id, name, description, category, earned: boolean, progress: { current,
total } }`, computed by aggregating the user's specimens against the catalog
(owned species set, owned form set, shiny count, owned event count). Computed
on read (accurate, no stored state); efficient single-pass over the collection.

**UI:** a **Ribbons** page — earned ribbons rendered vibrantly (with the
type/achievement color language), locked ones shown with a progress bar
(current/total). A summary count ("14 / 60 ribbons earned"). Reachable from the
top bar / account area.

---

## Architecture notes

- Same stack (Workers + D1 + R2 + Drizzle + Hono; React front-end). New tables
  via drizzle-kit migrations. New routes as focused Hono sub-apps
  (`auth.ts`, `collection.ts`, `boxes.ts`, `ribbons.ts`). Auth helpers in a
  small module; `EmailSender` abstraction isolates the dev/prod delivery.
- React: an auth context/provider (current user, sign-in/out), a `RequireAuth`
  wrapper for collection UI, new pages (Home hero, My Collection, Specimen
  editor, Settings, Ribbons), reusing the existing design system + components.
- Tests: TDD per task — token lifecycle, session middleware (401s), specimen
  CRUD + ownership scoping, validation bounds, owned-flag correctness, ribbon
  predicates (earned/locked/progress), against the real migrated test DB.

## Constraints

- Cloudflare Workers runtime (no Node-only APIs in Worker code); TS strict;
  typecheck of record `tsc -b`. Migrations only for schema changes. Secrets
  (`SESSION_SECRET`, email API key) via env/`.dev.vars`, never committed.
  Local-only for now; deploy (real email + secrets) is a later, separate step.
- No fabricated data (events). Accessibility floor maintained (focus,
  reduced-motion, light/dark, responsive). Reuse the design system — one visual
  language across all new surfaces.

## Out of scope (for now)

- Real email sending in local dev (dev sender only; real provider at deploy).
- Admin-over-other-users management (each user manages only their own account).
- Import wizards (manual/CSV/photo/save) — later phases from the original plan.
- Trading/social.
