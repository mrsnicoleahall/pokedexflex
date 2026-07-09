# PokéFlexBank — Design Spec

**Date:** 2026-07-09
**Status:** Approved (design), pending implementation plan

## Summary

PokéFlexBank is a login-required web app for tracking a personal Pokémon
collection across every generation. It tracks both a **collection overview**
(living-dex style: which species/forms you own) and **individual specimens**
(each actual Pokémon with its full details). It is built **personal-first but
scale-ready** — the same architecture serves one user or thousands with no
rewrite.

Forms (regional variants, Megas, Gigantamax, alternate formes) and event
Pokémon are **first-class parts of the data model**, not afterthoughts.

## Goals

- Track individual Pokémon with full detail, and a derived collection/living-dex view.
- Make getting data in as frictionless as possible ("super user friendly").
- Start as a personal tool; grow into a public multi-user product without rearchitecting.

## Non-Goals (for now)

- Trading, marketplace, or social features.
- Battle/team-building or competitive damage calculators.
- Real-time sync with the official games/HOME (no official API exists).

## Tech Stack

- **Front-end:** React (single-page app).
- **API:** Cloudflare Workers.
- **Database:** Cloudflare D1 (SQLite).
- **File storage:** Cloudflare R2 (uploaded screenshots and save files).
- **Auth:** Passwordless email magic-link sign-in (no passwords to manage).
- **Species/form reference data:** seeded from the free PokéAPI so the catalog
  of ~1,000 species and their forms is not hand-entered.

**Rationale:** Cloudflare is free/near-free at personal scale and the identical
setup scales to a public product — satisfying "start personal, become public,
no rewrite" cheaply. SQLite/D1 fits structured collection data well.

## Data Model

### Reference data (shared, seeded from PokéAPI)

**Species**
- national dex number, name, generation, types, default sprite URL.

**Forms**
- belongs to a Species.
- form name, form type (regional / mega / gigantamax / alternate-forme /
  gender-difference / other), sprite URL.
- Base form is represented implicitly (a specimen with no explicit form).

### User data

**User**
- id, email, created_at.

**Specimen** (a single Pokémon owned by a user)
- user_id, species (ref), form (ref, nullable → base form)
- nickname, level, is_shiny, gender, nature, ability, held_item, ball
- **OT name, trainer ID (OT/ID)** — identity fields
- met_location, met_date, origin_game, origin_era
- **is_event, event_name, ribbons (list)** — event tracking
- IVs (hp/atk/def/spa/spd/spe), EVs (same six), moves (list)
- notes
- box_id (which storage location it currently lives in)
- source (manual / csv / photo / savefile)
- created_at, updated_at

**Box** (storage location)
- user_id, name (e.g. "Living Dex", "HOME Box 3", "My Scarlet save")

**Import Job** (powers upload → preview → confirm)
- user_id, type (csv / photo / savefile), status, raw file (R2 key),
  parsed preview (structured), created_at.

### Derived

**Collection / Living Dex** — computed from a user's specimens (which
species+forms they own at least one of). Not stored; derived on read.

## Import Methods (by era)

| Era | Manual | CSV | Photo/Vision | Save file |
|---|---|---|---|---|
| Gen 1–7 (GB → 3DS) | ✅ | ✅ | ❌ | ✅ (phase 3) |
| Gen 8, 9, HOME (Switch) | ✅ | ✅ | ✅ (phase 2) | ❌ |

- **Manual add** — autocomplete species → pick form → fill details. The
  always-works foundation.
- **CSV import** — the primary bulk path (including exporting an existing
  Airtable base to CSV). Flow: upload → map columns → preview → confirm.
- **JSON import/export** — export is a free backup feature; import reuses the
  CSV pipeline. Power-user oriented.
- **Photo/vision (phase 2)** — user screenshots Pokémon HOME / SV boxes; a
  vision model reads the grid (species, shiny, rough level) → **user confirms
  before saving.** Modern only (Gen 8/9/HOME have clean box grids).
- **Save file (phase 3)** — parse `.sav` / `.pk*` files for Gen 1–7 only (the
  only era whose saves are user-accessible and parseable). Tackled one
  generation at a time.

## Pages / Features

- **Dashboard** — collection completion %, total/shiny counts, recent additions.
- **Living Dex grid** — all species/forms; owned highlighted; filter by
  generation, type, owned/unowned, shiny.
- **Specimen browser + detail/edit** — search, view, and edit individual Pokémon.
- **Add flows** — manual add; CSV import wizard; (phase 2) photo; (phase 3) save file.
- **Sign-in** — email magic link.
- **Settings** — JSON export (backup).

## Build Phases

- **Phase 1 (launch):** Cloudflare stack + auth + seeded species/forms +
  specimen CRUD + Living Dex grid + dashboard + manual add + CSV import +
  JSON export. A complete, usable app.
- **Phase 2:** photo/vision import (Gen 8/9/HOME).
- **Phase 3:** save-file import (Gen 1–7), one generation at a time.

## Open Questions / Future

- Naming: "PokéFlexBank" is fine for a hobby project; revisit trademark exposure
  if it ever goes commercial.
- Public-launch concerns (rate limiting, abuse, storage quotas) deferred until
  the personal-first version is proven.
