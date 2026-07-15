# Flex Phase F — Public Profiles + Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every trainer a shareable public profile page at a custom, editable URL (`/u/:handle`) that shows their name, avatar, gender, top-3 favorites, ribbon showcase, and rank/score/collection stats — **never their email** — and convert the app's in-page tab-state navigation to real client-side routes so those pages (and every existing view) have real URLs.

**Architecture:** Phase P already added the trainer profile (`users.displayName`/`gender`/`avatarKey`, `user_favorites`, avatar upload/serve, the onboarding gate). Phase F adds two more `users` columns in one migration — `handle` (text, unique, nullable) and `isPublic` (integer, NOT NULL DEFAULT 1) — plus a pure handle-validation module `src/worker/profile/handle.ts` (format/length/reserved-word rules mirroring `src/worker/profile/validate.ts`, uniqueness checked in the route). New authenticated write endpoints `PUT /api/profile/handle` and `PUT /api/profile/visibility` set them; `PUT /api/profile` gains a server-side handle **backfill** so a trainer becomes publicly visible the moment they finish onboarding. A new **public, unauthenticated** read endpoint `GET /api/u/:handle` reuses the existing scoring engine (`ribbons/scoring.ts`), incentive store (`ribbons/incentive-store.ts` — `getShowcase`), and favorites store (`profile/favorites-store.ts` — `getFavoritesEnriched`); to compute rank/score/stats for an arbitrary user it reuses a **newly extracted** `buildCollectionSummary`/`buildReferenceData` pair pulled verbatim out of `routes/ribbons.ts` (that route is refactored to call them, so no behavior changes and Phase G's `stats.ts` has a foundation). Client-side, `react-router-dom` replaces `App.tsx`'s `useState`-driven `view`/`tab` navigation: a DOM-free `src/react-app/routes.ts` holds the path constants + pure path helpers (unit-tested like `profile/display.ts`), an `AppLayout` component owns the search/gen filter state + `TopBar` + `Footer` + the onboarding gate and renders authenticated views through an `<Outlet>`, and a top-level (ungated, public) `PublicProfile` page renders `/u/:handle` by reusing the read-only `Avatar`/`FavoritesStrip`/`RankBadge`/`RibbonIcon` components. Settings gains a handle editor, a public/private toggle, and a copy-able share link.

**Tech Stack:** Cloudflare Workers + Hono + Drizzle (D1) + R2 (`SPRITES` binding, unchanged); Vitest (`@cloudflare/vitest-pool-workers`) for pure-validation, route, and pure-helper tests; drizzle-kit for the migration; React 19 + Vite for the client; **new dependency `react-router-dom@^7`** (client-only). No React component-test harness exists — React tasks extract pure logic into DOM-free unit-tested modules and are otherwise verified by `npx tsc -b` + `npm run build`.

## Global Constraints

- **NEVER email — hard constraint.** The public endpoint `GET /api/u/:handle` and the `/u/:handle` page expose ONLY: `displayName`, avatar (via `hasAvatar` + the existing public `GET /api/profile/avatar/:userId` serve), `gender` (optional, cosmetic), top-3 favorites (enriched), ribbon showcase, and `rank` + `trainerScore` + collection/rarity stats. **Never** `email`; never the user id beyond the single `userId` field the public avatar fetch needs; never private collection internals beyond aggregate stats. Every task that touches the public response shape must respect this. Task F3's tests assert the serialized response contains no email substring.
- **Routing = `react-router-dom`.** Add it as a real dependency and refactor `App.tsx`'s in-page `view`/`tab` state into real routes. Preserve **every** existing view at a real path: Home `/`, Species `/species`, Events `/events`, Collection `/collection`, Ribbons `/ribbons`, Import/Export `/import-export`, Settings `/settings`. Add the public route `/u/:handle`.
- **Onboarding gate stays blocking.** A signed-in user with `needsOnboarding(user)` true is shown `ProfileSetup` instead of any **authenticated** view (the gate lives in `AppLayout`, which wraps every app route). The public `/u/:handle` route is a **top-level route outside `AppLayout`** and is therefore exempt — it renders without requiring auth and without the account-only TopBar chrome (see the resolved judgment call in the Self-Review). This is the deliberate resolution of "public route renders WITHOUT auth" vs. "gate from any route": the gate covers the app; the public page is genuinely public.
- **Public by default.** `users.isPublic` is `integer NOT NULL DEFAULT 1`. A profile is visible at `/u/:handle` as soon as the user has a handle AND `isPublic` is truthy. A private profile (`isPublic` = 0) returns the **same** `404 {error:"not_found"}` as a nonexistent handle — the private case never reveals that the handle exists.
- **Editable custom handle.** `users.handle` is `text UNIQUE` (nullable until set). Validation is a **pure module** `src/worker/profile/handle.ts` (unit-tested, mirrors `src/worker/profile/validate.ts`): normalize to lowercase + trim; allow only `a-z`, `0-9`, and single hyphens (no leading/trailing/double hyphen); length 3–30; reject a reserved-word blocklist. **Uniqueness is NOT in the pure validator** — it is checked case-insensitively in the route against the DB. Handles are always stored normalized (lowercased), so a plain equality check is case-insensitive by construction.
- **Reserved-word blocklist (verbatim, used by `handle.ts`):** `api, u, admin, settings, home, species, events, collection, ribbons, versus, login, logout, signin, signout, auth, profile, me, favorites, showcase, import, export, sprites, assets, static, help, about, root, new, edit, null, undefined, true, false`.
- **Migration via drizzle-kit, applied the repo's existing way.** Edit `src/db/schema/user.ts`, then run `npx drizzle-kit generate` (no `--name`). The highest existing migration is `migrations/0008_deep_wallflower.sql` (`migrations/meta/_journal.json` idx 8), so this should generate `migrations/0009_<random-name>.sql` + `migrations/meta/0009_snapshot.json` + a new `_journal.json` entry — **confirm the actual next index against `migrations/meta/_journal.json` at execution time** rather than assuming. Both new columns are on the `users` table, so they land in **one** migration. Do **not** hand-edit generated files. `npm run db:local` must apply cleanly. Tests need no extra wiring — `vitest.config.ts` reads every file under `migrations/` into `TEST_MIGRATIONS`, applied by `tests/setup/apply-migrations.ts` before each test file.
- **Additive only.** `GET /api/auth/me`'s `user` object keeps every existing key (`id, email, displayName, gender, hasAvatar, favorites`); `handle`/`isPublic` are **added** fields. `UserDto` in `api.ts` and `CurrentUser` in `src/worker/auth/current-user.ts` gain fields, never renames. Existing callers keep compiling.
- **Worker test D1 state accumulates across `it()` blocks** (reset only between files). Use **unique** emails AND unique handles per test case, and the real magic-link `signIn` helper (see `tests/worker/profile.test.ts`) for authenticated cases. Never assert absolute row counts across cases.
- **BUILD-GATE GOTCHA (still live).** Root `tsc -b` compiles `tests/tsconfig.json` (no DOM lib, Workers-only, excludes `react-app`) and `tests/tsconfig.react.json` (DOM-libbed, `react-app` only). A `tests/worker/**` test must import only worker/db code. A `tests/react-app/**` pure-logic test (e.g. `routes.test.ts`) must import only DOM-free modules under `src/react-app/**` (like `src/react-app/routes.ts`) — **never** `src/react-app/api.ts` or any component. `react-router-dom` is DOM-only and is imported only from `src/react-app` components (compiled under `tsconfig.app.json`, which has the DOM lib); the Workers tsconfig projects exclude `react-app`, so the new dependency cannot break them. Verify **every** task with `npx tsc -b` **and** `npm run build`, plus `npx vitest run` for the relevant test files.
- **No component-test harness.** React tasks (F4, F5, F6) extract all extractable logic into DOM-free pure modules that get real Vitest coverage, and are otherwise verified by `npx tsc -b` + `npm run build` succeeding — consistent with how `Home.tsx`/`Ribbons.tsx`/`ProfileSetup.tsx` are already handled. Do **not** start a dev server; visual verification is a separate, out-of-band step.
- **Verify of record, every task:** `npx tsc -b && npm run build && npx vitest run <relevant test files>`. The final task additionally runs the full `npx vitest run`.
- **Scope discipline.** This phase does **not** build Versus (Phase G), saved rivalries, the `rivalries` table, the stats dashboard, following/friends, or share-card image export. It extracts `buildCollectionSummary`/`buildReferenceData` (which Phase G's `stats.ts` will build on) but does not create `stats.ts` itself.

---

### Task F1: Schema (`handle`, `isPublic`) + migration + pure handle-validation module — extend `CurrentUser`/`GET /api/auth/me`/`UserDto`

**Files:**
- Modify: `src/db/schema/user.ts` (add `handle`, `isPublic` columns to `users`)
- New (generated): `migrations/0009_<name>.sql`, `migrations/meta/0009_snapshot.json`, updated `migrations/meta/_journal.json`
- Test: `tests/db/schema.test.ts` (append round-trip + default test)
- Create: `src/worker/profile/handle.ts` (pure — normalize, validate, reserved list, `suggestHandleBase`)
- Test: `tests/worker/handle-validate.test.ts`
- Modify: `src/worker/auth/current-user.ts` (`CurrentUser` gains `handle`, `isPublic`; `getCurrentUser` computes both)
- Modify: `src/worker/routes/auth.ts` (the new-user literal in `GET /verify` gains `handle: null, isPublic: 1`)
- Test: `tests/worker/auth.test.ts` (append: fresh user's `/me` has `handle: null`, `isPublic: true`)
- Modify: `src/react-app/api.ts` (`UserDto` gains `handle`, `isPublic`)

**Interfaces:**
- Produces: `users.handle: string | null` (unique), `users.isPublic: number` (NOT NULL, default 1).
- Produces: `CurrentUser` (`src/worker/auth/current-user.ts`) — now `{ id, email, displayName, gender, hasAvatar, handle, isPublic }` where `handle: string | null`, `isPublic: boolean`.
- Produces (pure, `src/worker/profile/handle.ts`): `RESERVED_HANDLES: ReadonlySet<string>`; `HANDLE_MIN = 3`, `HANDLE_MAX = 30`; `normalizeHandle(raw: string): string`; `validateHandle(raw: unknown): { ok: true; value: string } | { ok: false; errors: string[] }`; `suggestHandleBase(displayName: string): string`.
- Produces (client): `UserDto` gains `handle: string | null`, `isPublic: boolean`.
- Consumes: nothing new — extends the existing `users` table and the `getCurrentUser`/`GET /api/auth/me` path.

- [ ] **Step 1: Write the failing pure handle-validation tests**

Create `tests/worker/handle-validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  RESERVED_HANDLES,
  HANDLE_MIN,
  HANDLE_MAX,
  normalizeHandle,
  validateHandle,
  suggestHandleBase,
} from "../../src/worker/profile/handle";

describe("normalizeHandle", () => {
  it("lowercases and trims", () => {
    expect(normalizeHandle("  AshKetchum  ")).toBe("ashketchum");
  });
});

describe("validateHandle", () => {
  it("accepts a simple lowercase handle", () => {
    expect(validateHandle("ash-ketchum")).toEqual({ ok: true, value: "ash-ketchum" });
  });

  it("normalizes case + surrounding whitespace before validating", () => {
    expect(validateHandle("  Misty  ")).toEqual({ ok: true, value: "misty" });
  });

  it("accepts digits and single interior hyphens", () => {
    expect(validateHandle("gen1-master99").ok).toBe(true);
  });

  it("rejects a too-short handle (< 3)", () => {
    const r = validateHandle("ab");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/3/);
  });

  it("rejects a too-long handle (> 30)", () => {
    const r = validateHandle("a".repeat(31));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/30/);
  });

  it("accepts a handle at exactly the min and max length", () => {
    expect(validateHandle("abc").ok).toBe(true);
    expect(validateHandle("a".repeat(30)).ok).toBe(true);
  });

  it("rejects leading, trailing, and doubled hyphens", () => {
    expect(validateHandle("-ash").ok).toBe(false);
    expect(validateHandle("ash-").ok).toBe(false);
    expect(validateHandle("ash--ketchum").ok).toBe(false);
  });

  it("rejects disallowed characters (spaces, underscores, symbols, unicode)", () => {
    expect(validateHandle("ash ketchum").ok).toBe(false);
    expect(validateHandle("ash_ketchum").ok).toBe(false);
    expect(validateHandle("ash.k").ok).toBe(false);
    expect(validateHandle("piká").ok).toBe(false);
  });

  it("rejects reserved words (case-insensitively)", () => {
    expect(validateHandle("admin").ok).toBe(false);
    expect(validateHandle("API").ok).toBe(false);
    expect(validateHandle("settings").ok).toBe(false);
    expect(validateHandle("u").ok).toBe(false);
  });

  it("rejects a non-string body", () => {
    expect(validateHandle(null).ok).toBe(false);
    expect(validateHandle(42).ok).toBe(false);
  });

  it("exposes the length bounds it enforces", () => {
    expect(HANDLE_MIN).toBe(3);
    expect(HANDLE_MAX).toBe(30);
    expect(RESERVED_HANDLES.has("versus")).toBe(true);
  });
});

describe("suggestHandleBase", () => {
  it("slugifies a display name to a valid handle base", () => {
    expect(suggestHandleBase("Ash Ketchum")).toBe("ash-ketchum");
  });

  it("collapses runs of non-alphanumerics into single hyphens and trims them", () => {
    expect(suggestHandleBase("  Prof. Oak!!  ")).toBe("prof-oak");
  });

  it("falls back to 'trainer' when the name yields too few usable characters", () => {
    expect(suggestHandleBase("!!")).toBe("trainer");
    expect(suggestHandleBase("")).toBe("trainer");
  });

  it("never returns a base that itself fails validateHandle", () => {
    expect(validateHandle(suggestHandleBase("Ash Ketchum")).ok).toBe(true);
    expect(validateHandle(suggestHandleBase("!!")).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/worker/handle-validate.test.ts`
Expected: FAIL — module `src/worker/profile/handle` not found.

- [ ] **Step 3: Implement `src/worker/profile/handle.ts`**

```ts
/**
 * Pure validation + suggestion for public-profile handles (Flex Phase F).
 * No I/O — mirrors `src/worker/profile/validate.ts`'s `{ok, value|errors}`
 * shape. Uniqueness is deliberately NOT checked here (it needs the DB); the
 * route (`routes/profile.ts`) does the case-insensitive uniqueness check
 * against normalized, always-lowercased stored handles. Consumed by
 * `routes/profile.ts`; unit-tested directly here.
 */

/** Route/app words a handle may never be, so `/u/:handle` can never shadow a real path or a reserved concept. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "api", "u", "admin", "settings", "home", "species", "events", "collection",
  "ribbons", "versus", "login", "logout", "signin", "signout", "auth", "profile",
  "me", "favorites", "showcase", "import", "export", "sprites", "assets", "static",
  "help", "about", "root", "new", "edit", "null", "undefined", "true", "false",
]);

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/** Only lowercase alphanumerics and single interior hyphens — no leading/trailing/double hyphen. */
const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercase + trim. Handles are ALWAYS stored normalized, which is what makes the DB uniqueness check case-insensitive. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export type HandleValidationResult = { ok: true; value: string } | { ok: false; errors: string[] };

/**
 * Validates a candidate handle (after normalization): allowed characters,
 * length bounds, and the reserved-word blocklist. Returns the normalized
 * value on success. Does not touch the DB — uniqueness is the route's job.
 */
export function validateHandle(raw: unknown): HandleValidationResult {
  if (typeof raw !== "string") return { ok: false, errors: ["handle must be a string"] };
  const value = normalizeHandle(raw);
  const errors: string[] = [];

  if (value.length < HANDLE_MIN) errors.push(`handle must be at least ${HANDLE_MIN} characters`);
  else if (value.length > HANDLE_MAX) errors.push(`handle must be at most ${HANDLE_MAX} characters`);

  if (!HANDLE_PATTERN.test(value)) {
    errors.push("handle may use only lowercase letters, numbers, and single hyphens (no leading, trailing, or doubled hyphens)");
  } else if (RESERVED_HANDLES.has(value)) {
    // Only meaningful once the pattern passed (a reserved word is always pattern-valid).
    errors.push("that handle is reserved");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

/**
 * Slugifies a display name into a valid handle BASE (never the final handle —
 * the route appends a numeric suffix if needed for uniqueness). Strips to
 * `a-z0-9`, collapses separators into single hyphens, trims hyphens, and caps
 * length to leave room for a suffix. Falls back to `"trainer"` when the name
 * yields fewer than `HANDLE_MIN` usable characters. Guaranteed to itself pass
 * `validateHandle`.
 */
export function suggestHandleBase(displayName: string): string {
  const slug = displayName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const capped = slug.slice(0, 24).replace(/-$/g, "");
  return capped.length >= HANDLE_MIN ? capped : "trainer";
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/worker/handle-validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing schema test**

Append to `tests/db/schema.test.ts` (after the existing final `describe` block — reuse the file's existing `users`/`eq`/`getDb` imports):

```ts
describe("public profile schema (handle + isPublic)", () => {
  it("users: handle defaults to null, is_public defaults to 1, and both round-trip", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "pub1", email: "pub1@x.com", createdAt: 1 });

    const [before] = await db.select().from(users).where(eq(users.id, "pub1"));
    expect(before.handle).toBeNull();
    expect(before.isPublic).toBe(1);

    await db.update(users).set({ handle: "pub-one", isPublic: 0 }).where(eq(users.id, "pub1"));
    const [after] = await db.select().from(users).where(eq(users.id, "pub1"));
    expect(after.handle).toBe("pub-one");
    expect(after.isPublic).toBe(0);
  });

  it("users: handle is unique across users", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "puA", email: "puA@x.com", handle: "dupe-handle", createdAt: 1 });
    await expect(
      db.insert(users).values({ id: "puB", email: "puB@x.com", handle: "dupe-handle", createdAt: 1 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: FAIL — `handle`/`isPublic` aren't valid Drizzle column refs yet (TypeScript fails to compile the file).

- [ ] **Step 7: Add the columns to `src/db/schema/user.ts`**

Change the `users` table definition (leave every other table untouched):

```ts
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  gender: text("gender"),
  avatarKey: text("avatar_key"),
  handle: text("handle").unique(),
  isPublic: integer("is_public").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});
```

(`integer` and `text` are already imported at the top of the file. `isPublic` follows the existing numeric-boolean house style — same as `specimens.isShiny`/`isEvent` — resolved to a JS `boolean` in `getCurrentUser`.)

- [ ] **Step 8: Generate the migration**

Run: `npx drizzle-kit generate`

Confirm `migrations/meta/_journal.json` gained one new entry (expected idx `9`) and inspect the generated `migrations/0009_<name>.sql`. It should contain two `ALTER TABLE` statements and a unique index, shaped roughly like:

```sql
ALTER TABLE `users` ADD `handle` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `is_public` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);
```

If drizzle-kit emits a full table rebuild instead, STOP and re-check the schema edit rather than hand-patching the migration. Trust the actual generated index number over the `0009` written here.

- [ ] **Step 9: Apply locally + verify the schema test**

Run: `npm run db:local`
Run: `npx vitest run tests/db/schema.test.ts && npx tsc -b`
Expected: both green.

- [ ] **Step 10: Extend `CurrentUser` + `getCurrentUser` in `src/worker/auth/current-user.ts`**

```ts
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  gender: string | null;
  hasAvatar: boolean;
  handle: string | null;
  isPublic: boolean;
}
```

In `getCurrentUser`, extend the returned object (the `rows`/`user` lookup above it is unchanged):

```ts
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    gender: user.gender,
    hasAvatar: user.avatarKey !== null,
    handle: user.handle,
    isPublic: user.isPublic === 1,
  };
```

- [ ] **Step 11: Fix the new-user literal in `src/worker/routes/auth.ts`**

The `GET /verify` handler builds a full `users` row by hand when no row exists for the email; it must now include the two new columns (TypeScript otherwise fails to compile, since the literal no longer structurally matches the `users` insert type):

```ts
  let user = existing[0];
  if (!user) {
    user = { id: generateToken(), email: tokenRow.email, displayName: null, gender: null, avatarKey: null, handle: null, isPublic: 1, createdAt: now };
    await db.insert(users).values(user);
  }
```

- [ ] **Step 12: Write the failing `/me` route test**

Append to `tests/worker/auth.test.ts` (inside the existing `describe("auth helpers", ...)` block, reusing the file's existing `call` helper):

```ts
  it("/me returns handle=null and isPublic=true for a freshly created user", async () => {
    const r1 = await call("/api/auth/request-link", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email: "handle-fresh@x.com" }) });
    const { devLink } = await r1.json() as any;
    const path = new URL(devLink).pathname + new URL(devLink).search;
    const verify = await call(path, { redirect: "manual" } as any);
    const cookie = verify.headers.get("set-cookie")!.split(";")[0];
    const me = await call("/api/auth/me", undefined, cookie);
    const body = (await me.json()) as any;
    expect(body.user.handle).toBeNull();
    expect(body.user.isPublic).toBe(true);
  });
```

- [ ] **Step 13: Run to verify it passes**

Run: `npx vitest run tests/worker/auth.test.ts`
Expected: PASS (fresh user's `/me` now carries `handle: null`, `isPublic: true`; every prior auth test still green).

- [ ] **Step 14: Extend the client `UserDto` in `src/react-app/api.ts`**

```ts
export type UserDto = {
	id: string;
	email: string;
	displayName: string | null;
	gender: string | null;
	hasAvatar: boolean;
	favorites: FavoriteDto[];
	handle: string | null;
	isPublic: boolean;
};
```

- [ ] **Step 15: Verify + commit**

Run: `npx vitest run tests/worker/handle-validate.test.ts tests/db/schema.test.ts tests/worker/auth.test.ts && npx tsc -b && npm run build`
Expected: all green, clean typecheck, successful build.

```bash
git add src/db/schema/user.ts migrations/ src/worker/profile/handle.ts tests/worker/handle-validate.test.ts src/worker/auth/current-user.ts src/worker/routes/auth.ts tests/db/schema.test.ts tests/worker/auth.test.ts src/react-app/api.ts
git commit -m "feat(flex-F): add users.handle/is_public (migration 0009) + pure handle validation; extend /me + UserDto"
```

---

### Task F2: Handle + visibility write endpoints — `PUT /api/profile/handle`, `PUT /api/profile/visibility`, handle backfill on `PUT /api/profile` — client wrappers

**Files:**
- Create: `src/worker/profile/handle-store.ts` (data-access — `generateUniqueHandle`, `isHandleTaken`)
- Test: `tests/worker/handle-store.test.ts`
- Modify: `src/worker/routes/profile.ts` (add `PUT /handle`, `PUT /visibility`; backfill a handle inside `PUT /`)
- Test: `tests/worker/profile.test.ts` (append handle + visibility + backfill cases)
- Modify: `src/react-app/api.ts` (add `setHandle`, `setProfileVisibility`)

**Interfaces:**
- Produces (store): `isHandleTaken(db, handle, exceptUserId?): Promise<boolean>` (case-insensitive against normalized stored handles); `generateUniqueHandle(db, base): Promise<string>` (validates the base, appends `-2`, `-3`, … until unique; falls back to a random suffix).
- Produces (route): `PUT /api/profile/handle` — body `{handle: string}`, auth-scoped; validates via `validateHandle`, then DB uniqueness (excluding self); response `{ user: UserDto-shaped }`; invalid/taken → `400 {errors}`.
- Produces (route): `PUT /api/profile/visibility` — body `{isPublic: boolean}`, auth-scoped; response `{ user: UserDto-shaped }`; non-boolean → `400 {errors}`.
- Produces (route behavior): `PUT /api/profile` now **backfills** `users.handle` with `generateUniqueHandle(db, suggestHandleBase(displayName))` when the user has no handle yet and a `displayName` is being set — so finishing onboarding makes the profile publicly reachable. Never overwrites an existing handle.
- Produces (client): `setHandle(handle: string): Promise<{ user: UserDto }>`; `setProfileVisibility(isPublic: boolean): Promise<{ user: UserDto }>`.
- Consumes: `validateHandle`, `normalizeHandle`, `suggestHandleBase` (`../profile/handle`, F1); `users` table; `requireUser`.

- [ ] **Step 1: Write the failing store tests**

Create `tests/worker/handle-store.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";
import { isHandleTaken, generateUniqueHandle } from "../../src/worker/profile/handle-store";

describe("handle-store: isHandleTaken", () => {
  it("is false for an unused handle and true (case-insensitively) for a used one", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "hs-1", email: "hs-1@x.com", handle: "taken-one", createdAt: 1 });
    expect(await isHandleTaken(db, "free-one")).toBe(false);
    expect(await isHandleTaken(db, "taken-one")).toBe(true);
    expect(await isHandleTaken(db, "TAKEN-ONE")).toBe(true); // normalized before checking
  });

  it("excludes a given user id (so a user can 're-save' their own handle)", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "hs-2", email: "hs-2@x.com", handle: "mine-two", createdAt: 1 });
    expect(await isHandleTaken(db, "mine-two", "hs-2")).toBe(false);
    expect(await isHandleTaken(db, "mine-two", "someone-else")).toBe(true);
  });
});

describe("handle-store: generateUniqueHandle", () => {
  it("returns the base itself when free", async () => {
    const db = getDb(env.DB);
    expect(await generateUniqueHandle(db, "brand-new-base")).toBe("brand-new-base");
  });

  it("appends a numeric suffix when the base is taken", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "hs-3", email: "hs-3@x.com", handle: "collide", createdAt: 1 });
    const next = await generateUniqueHandle(db, "collide");
    expect(next).toBe("collide-2");

    await db.insert(users).values({ id: "hs-4", email: "hs-4@x.com", handle: "collide-2", createdAt: 1 });
    expect(await generateUniqueHandle(db, "collide")).toBe("collide-3");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/worker/handle-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/worker/profile/handle-store.ts`**

```ts
/**
 * Data-access helpers for public-profile handles (Flex Phase F): a
 * case-insensitive uniqueness check and a unique-handle generator used to
 * backfill a handle at onboarding. All D1 I/O lives here; the pure format
 * rules live in `./handle`. `routes/profile.ts` is the only caller.
 */
import { eq } from "drizzle-orm";
import type { getDb } from "../db";
import { users } from "../../db/schema";
import { normalizeHandle, validateHandle } from "./handle";

type Db = ReturnType<typeof getDb>;

/**
 * True if `handle` (normalized) already belongs to some user other than
 * `exceptUserId`. Case-insensitive by construction: handles are always
 * stored normalized (lowercased), so a plain equality on the normalized
 * candidate is a case-insensitive match.
 */
export async function isHandleTaken(db: Db, handle: string, exceptUserId?: string): Promise<boolean> {
  const normalized = normalizeHandle(handle);
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, normalized))
    .limit(2);
  return rows.some((r) => r.id !== exceptUserId);
}

/**
 * Returns a unique, valid handle derived from `base`: tries the base itself,
 * then `base-2`, `base-3`, … until one is free. `base` is expected to come
 * from `suggestHandleBase` (already valid); any candidate that would fail
 * `validateHandle` (e.g. length overflow from the suffix) is skipped. Falls
 * back to a random suffix in the pathological case that nothing else is free.
 */
export async function generateUniqueHandle(db: Db, base: string): Promise<string> {
  const root = validateHandle(base).ok ? normalizeHandle(base) : "trainer";
  for (let n = 1; n <= 1000; n++) {
    const candidate = n === 1 ? root : `${root.slice(0, 27)}-${n}`;
    const v = validateHandle(candidate);
    if (!v.ok) continue;
    if (!(await isHandleTaken(db, v.value))) return v.value;
  }
  return `trainer-${crypto.randomUUID().slice(0, 8)}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/worker/handle-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing route tests**

Append to `tests/worker/profile.test.ts` (new `describe` blocks; reuses the file's existing `call`/`postJson`/`putJson`/`signIn` helpers):

```ts
describe("PUT /api/profile/handle", () => {
  it("rejects when not signed in (401)", async () => {
    const res = await putJson("/api/profile/handle", { handle: "somebody" });
    expect(res.status).toBe(401);
  });

  it("sets a valid handle and reflects it on /me", async () => {
    const cookie = await signIn("handle-set@x.com");
    const res = await putJson("/api/profile/handle", { handle: "Ash-Ketchum" }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.handle).toBe("ash-ketchum"); // normalized
    expect(body.user.email).toBe("handle-set@x.com");

    const me = await call("/api/auth/me", undefined, cookie);
    expect(((await me.json()) as any).user.handle).toBe("ash-ketchum");
  });

  it("rejects an invalid handle (400) and does not persist it", async () => {
    const cookie = await signIn("handle-bad@x.com");
    const res = await putJson("/api/profile/handle", { handle: "no" }, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/at least 3/);
  });

  it("rejects a reserved handle (400)", async () => {
    const cookie = await signIn("handle-reserved@x.com");
    const res = await putJson("/api/profile/handle", { handle: "admin" }, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/reserved/);
  });

  it("rejects a handle already taken by another user (400)", async () => {
    const a = await signIn("handle-owner-a@x.com");
    await putJson("/api/profile/handle", { handle: "unique-target" }, a);

    const b = await signIn("handle-owner-b@x.com");
    const res = await putJson("/api/profile/handle", { handle: "unique-target" }, b);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/taken/);
  });

  it("lets a user re-save their own current handle", async () => {
    const cookie = await signIn("handle-resave@x.com");
    await putJson("/api/profile/handle", { handle: "keep-mine" }, cookie);
    const res = await putJson("/api/profile/handle", { handle: "keep-mine" }, cookie);
    expect(res.status).toBe(200);
  });
});

describe("PUT /api/profile/visibility", () => {
  it("rejects when not signed in (401)", async () => {
    const res = await putJson("/api/profile/visibility", { isPublic: false });
    expect(res.status).toBe(401);
  });

  it("toggles isPublic and reflects it on /me", async () => {
    const cookie = await signIn("vis-toggle@x.com");
    const res = await putJson("/api/profile/visibility", { isPublic: false }, cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).user.isPublic).toBe(false);

    const me = await call("/api/auth/me", undefined, cookie);
    expect(((await me.json()) as any).user.isPublic).toBe(false);
  });

  it("rejects a non-boolean isPublic (400)", async () => {
    const cookie = await signIn("vis-bad@x.com");
    const res = await putJson("/api/profile/visibility", { isPublic: "yes" }, cookie);
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/profile handle backfill", () => {
  it("assigns a handle derived from displayName the first time a name is set", async () => {
    const cookie = await signIn("backfill-new@x.com");
    const res = await putJson("/api/profile", { displayName: "Gary Oak", gender: "boy" }, cookie);
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).user.handle).toBe("gary-oak");
  });

  it("does not overwrite a handle the user already set", async () => {
    const cookie = await signIn("backfill-keep@x.com");
    await putJson("/api/profile/handle", { handle: "chosen-one" }, cookie);
    const res = await putJson("/api/profile", { displayName: "Totally Different Name" }, cookie);
    expect(((await res.json()) as any).user.handle).toBe("chosen-one");
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run tests/worker/profile.test.ts`
Expected: FAIL — no `/handle` or `/visibility` routes (404/405), and `PUT /api/profile` doesn't backfill a handle yet.

- [ ] **Step 7: Implement the endpoints + backfill in `src/worker/routes/profile.ts`**

Extend the imports at the top of the file:

```ts
import { validateHandle } from "../profile/handle";
import { suggestHandleBase } from "../profile/handle";
import { isHandleTaken, generateUniqueHandle } from "../profile/handle-store";
```

Add a shared serializer near the top of the file (after `avatarKeyFor`), so every profile write returns the identical `UserDto` shape without duplication:

```ts
/** Serializes a fresh `users` row into the exact `{user}` shape the client `UserDto` expects (never leaks columns beyond it). */
async function serializeUser(db: ReturnType<typeof getDb>, userId: string) {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const u = rows[0];
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    gender: u.gender,
    hasAvatar: u.avatarKey !== null,
    favorites: await getFavoritesEnriched(db, u.id),
    handle: u.handle,
    isPublic: u.isPublic === 1,
  };
}
```

Replace the body of the existing `profileRoutes.put("/", ...)` handler's response section so it (a) backfills a handle and (b) reuses `serializeUser`:

```ts
profileRoutes.put("/", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json({ errors: ["body must be JSON"] }, 400);

  const result = validateProfileInput(body);
  if (!result.ok) return c.json({ errors: result.errors }, 400);
  if (Object.keys(result.value).length === 0) return c.json({ errors: ["nothing to update"] }, 400);

  const db = getDb(c.env.DB);
  await db.update(users).set(result.value).where(eq(users.id, user.id));

  // Backfill a public handle the first time a display name exists, so
  // finishing onboarding makes the trainer publicly reachable. Never
  // overwrites a handle the user already chose.
  if (user.handle === null && result.value.displayName) {
    const handle = await generateUniqueHandle(db, suggestHandleBase(result.value.displayName));
    await db.update(users).set({ handle }).where(eq(users.id, user.id));
  }

  return c.json({ user: await serializeUser(db, user.id) });
});
```

(Note: `user.handle` is available on `CurrentUser` as of Task F1, so the backfill guard needs no extra query.)

Append the two new endpoints:

```ts
profileRoutes.put("/handle", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const result = validateHandle((body as { handle?: unknown } | null)?.handle);
  if (!result.ok) return c.json({ errors: result.errors }, 400);

  const db = getDb(c.env.DB);
  if (await isHandleTaken(db, result.value, user.id)) {
    return c.json({ errors: ["that handle is already taken"] }, 400);
  }
  await db.update(users).set({ handle: result.value }).where(eq(users.id, user.id));
  return c.json({ user: await serializeUser(db, user.id) });
});

profileRoutes.put("/visibility", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const isPublic = (body as { isPublic?: unknown } | null)?.isPublic;
  if (typeof isPublic !== "boolean") return c.json({ errors: ["isPublic must be a boolean"] }, 400);

  const db = getDb(c.env.DB);
  await db.update(users).set({ isPublic: isPublic ? 1 : 0 }).where(eq(users.id, user.id));
  return c.json({ user: await serializeUser(db, user.id) });
});
```

(`getFavoritesEnriched` and `getDb` are already imported in this file; `users`/`eq` too.)

- [ ] **Step 8: Run to verify it passes**

Run: `npx vitest run tests/worker/profile.test.ts && npx tsc -b`
Expected: all green (new handle/visibility/backfill cases plus every prior `profile.test.ts` case, including the existing `PUT /api/profile` display-name/gender/favorites/avatar tests — the `serializeUser` refactor is behavior-preserving for them).

- [ ] **Step 9: Add the client wrappers in `src/react-app/api.ts`**

```ts
/**
 * Sets the signed-in user's public-profile handle. Server validates format
 * (lowercase alnum + single hyphens, 3–30 chars, not reserved) and
 * case-insensitive uniqueness; an invalid or taken handle throws
 * `ApiValidationError` via `handleJson`.
 */
export async function setHandle(handle: string): Promise<{ user: UserDto }> {
	const res = await fetch("/api/profile/handle", {
		method: "PUT",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ handle }),
	});
	return handleJson<{ user: UserDto }>(res, "set handle");
}

/** Toggles whether the signed-in user's profile is publicly visible at `/u/:handle`. */
export async function setProfileVisibility(isPublic: boolean): Promise<{ user: UserDto }> {
	const res = await fetch("/api/profile/visibility", {
		method: "PUT",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ isPublic }),
	});
	return handleJson<{ user: UserDto }>(res, "set profile visibility");
}
```

- [ ] **Step 10: Final verify + commit**

Run: `npx vitest run tests/worker/handle-store.test.ts tests/worker/profile.test.ts && npx tsc -b && npm run build`
Expected: all green.

```bash
git add src/worker/profile/handle-store.ts tests/worker/handle-store.test.ts src/worker/routes/profile.ts tests/worker/profile.test.ts src/react-app/api.ts
git commit -m "feat(flex-F): PUT /api/profile/handle + /visibility, handle backfill on profile save; client wrappers"
```

---

### Task F3: Public read endpoint `GET /api/u/:handle` — extract `buildCollectionSummary`/`buildReferenceData`, reuse scoring/showcase/favorites — never leak email

**Files:**
- Create: `src/worker/ribbons/collection-summary.ts` (extracted `buildCollectionSummary`, `EMPTY_SUMMARY`, `buildReferenceData`)
- Modify: `src/worker/routes/ribbons.ts` (refactor to consume the extracted helpers — behavior-preserving)
- Create: `src/worker/routes/public-profile.ts` (new `publicProfileRoutes`, `GET /:handle`)
- Modify: `src/worker/index.ts` (mount `app.route("/api/u", publicProfileRoutes)`)
- Test: `tests/worker/public-profile.test.ts`
- Modify: `src/react-app/api.ts` (`PublicProfileDto`, `PublicShowcaseRibbon`, `fetchPublicProfile`)

**Interfaces:**
- Produces: `EMPTY_SUMMARY: CollectionSummary`; `buildCollectionSummary(db, userId): Promise<CollectionSummary>`; `buildReferenceData(db): Promise<ReferenceData>` — all in `src/worker/ribbons/collection-summary.ts`, moved verbatim from the inline logic currently in `routes/ribbons.ts`.
- Produces (route): `GET /api/u/:handle` — **public, unauthenticated**. `200 { profile: {...} }` for a public user with that handle, `404 {error:"not_found"}` for an unknown handle OR a private user (indistinguishable). The `profile` object is exactly: `{ userId, handle, displayName, gender, hasAvatar, favorites, showcase, trainerScore, rank, stats }` — **no email, no other user column**.
- Produces (client): `PublicShowcaseRibbon = { id, name, category }`; `PublicProfileDto = { userId, handle, displayName, gender: string | null, hasAvatar, favorites: FavoriteDto[], showcase: PublicShowcaseRibbon[], trainerScore, rank, stats: { dexCount, shinySpeciesCount, specimenCount, ribbonCount } }`; `fetchPublicProfile(handle): Promise<PublicProfileDto | null>` (`null` on 404).
- Consumes: `computeRibbons`, `CollectionSummary`, `ReferenceData` (`../ribbons/catalog`); `trainerScoreFor`, `rankFor` (`../ribbons/scoring`); `getShowcase` (`../ribbons/incentive-store`); `getFavoritesEnriched` (`../profile/favorites-store`); `normalizeHandle` (`../profile/handle`); `users` table.

- [ ] **Step 1: Extract the collection-summary helpers into `src/worker/ribbons/collection-summary.ts`**

Create the file by moving the logic **verbatim** out of `routes/ribbons.ts` (the `emptySummary` constant and the inline `if (user) { ... }` summary-building block, plus the `ref` construction). No behavior change — this is a pure refactor whose regression guard is the existing ribbons test suite.

```ts
/**
 * Per-user collection aggregation for the ribbon engine (extracted from
 * `routes/ribbons.ts` in Flex Phase F so the public-profile endpoint can
 * reuse the exact same computation). `buildCollectionSummary` runs the
 * per-user D1 queries; `buildReferenceData` loads the global species/forms
 * reference. Phase G's `stats.ts` dashboard aggregator will build on these.
 */
import { and, count, countDistinct, eq, isNotNull } from "drizzle-orm";
import type { getDb } from "../db";
import { species, forms, specimens, boxes } from "../../db/schema";
import { computeRibbons as _computeRibbons, isSixIv, type CollectionSummary, type ReferenceData } from "./catalog";

type Db = ReturnType<typeof getDb>;

/** The summary for a user who owns nothing (also used for logged-out ribbon fetches). */
export const EMPTY_SUMMARY: CollectionSummary = {
  speciesIds: new Set(),
  formIds: new Set(),
  shinyCount: 0,
  eventCount: 0,
  specimenCount: 0,
  boxCount: 0,
  naturesOwned: new Set(),
  ballsOwned: new Set(),
  level100Count: 0,
  sixIvCount: 0,
  megaFormCount: 0,
  gmaxFormCount: 0,
  shinySpeciesIds: new Set(),
};

/** Runs the per-user aggregation queries and assembles a `CollectionSummary`. */
export async function buildCollectionSummary(db: Db, userId: string): Promise<CollectionSummary> {
  const [
    speciesRows,
    formRows,
    [{ value: shinyCount }],
    [{ value: eventCount }],
    [{ value: specimenCount }],
    [{ value: boxCount }],
    natureRows,
    ballRows,
    [{ value: level100Count }],
    shinySpeciesRows,
    ownedFormTypeRows,
    ivsRows,
  ] = await Promise.all([
    db.selectDistinct({ speciesId: specimens.speciesId }).from(specimens).where(eq(specimens.userId, userId)),
    db
      .selectDistinct({ formId: specimens.formId })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), isNotNull(specimens.formId))),
    db
      .select({ value: countDistinct(specimens.id) })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), eq(specimens.isShiny, 1))),
    db
      .select({ value: countDistinct(specimens.eventName) })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), eq(specimens.isEvent, 1), isNotNull(specimens.eventName))),
    db.select({ value: count(specimens.id) }).from(specimens).where(eq(specimens.userId, userId)),
    db.select({ value: count(boxes.id) }).from(boxes).where(eq(boxes.userId, userId)),
    db
      .selectDistinct({ nature: specimens.nature })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), isNotNull(specimens.nature))),
    db
      .selectDistinct({ ball: specimens.ball })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), isNotNull(specimens.ball))),
    db
      .select({ value: count(specimens.id) })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), eq(specimens.level, 100))),
    db
      .selectDistinct({ speciesId: specimens.speciesId })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), eq(specimens.isShiny, 1))),
    db
      .selectDistinct({ formId: specimens.formId, formType: forms.formType })
      .from(specimens)
      .innerJoin(forms, eq(specimens.formId, forms.id))
      .where(eq(specimens.userId, userId)),
    db
      .select({ ivs: specimens.ivs })
      .from(specimens)
      .where(and(eq(specimens.userId, userId), isNotNull(specimens.ivs))),
  ]);

  let megaFormCount = 0;
  let gmaxFormCount = 0;
  for (const r of ownedFormTypeRows) {
    if (r.formType === "mega") megaFormCount++;
    else if (r.formType === "gigantamax") gmaxFormCount++;
  }
  const sixIvCount = ivsRows.reduce((n, r) => (isSixIv(r.ivs) ? n + 1 : n), 0);

  return {
    speciesIds: new Set(speciesRows.map((r) => r.speciesId)),
    formIds: new Set(formRows.map((r) => r.formId).filter((id): id is number => id !== null)),
    shinyCount,
    eventCount,
    specimenCount,
    boxCount,
    naturesOwned: new Set(natureRows.map((r) => (r.nature ?? "").toLowerCase()).filter(Boolean)),
    ballsOwned: new Set(ballRows.map((r) => (r.ball ?? "").toLowerCase()).filter(Boolean)),
    level100Count,
    sixIvCount,
    megaFormCount,
    gmaxFormCount,
    shinySpeciesIds: new Set(shinySpeciesRows.map((r) => r.speciesId)),
  };
}

/** Loads the global species/forms reference data the ribbon engine needs. */
export async function buildReferenceData(db: Db): Promise<ReferenceData> {
  const [speciesRows, formRows] = await Promise.all([
    db.select({ id: species.id, name: species.name, generation: species.generation, types: species.types }).from(species),
    db.select({ id: forms.id, speciesId: forms.speciesId, formType: forms.formType }).from(forms),
  ]);
  return {
    species: speciesRows.map((s) => ({ id: s.id, generation: s.generation, types: JSON.parse(s.types) as string[] })),
    forms: formRows,
    speciesNames: new Map(speciesRows.map((s) => [s.id, s.name] as const)),
  };
}

/** Re-export so callers can import the engine + its inputs from one module. */
export { _computeRibbons as computeRibbons };
```

- [ ] **Step 2: Refactor `src/worker/routes/ribbons.ts` to use the extracted helpers**

Remove the now-duplicated `emptySummary` constant and the inline summary/ref-building blocks. Update imports: drop the direct `count`/`countDistinct`/`isNotNull`/`isSixIv`/`species`/`forms`/`specimens`/`boxes` imports that are now only used inside `collection-summary.ts` (keep `eq`, `species` etc. only if still referenced elsewhere in the file — verify by compiling). The handler's top becomes:

```ts
import { computeRibbons, EMPTY_SUMMARY, buildCollectionSummary, buildReferenceData } from "../ribbons/collection-summary";
```

```ts
ribbonRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const user = await getCurrentUser(c);

  const summary = user ? await buildCollectionSummary(db, user.id) : EMPTY_SUMMARY;
  const ref = await buildReferenceData(db);
  const ribbons = computeRibbons(summary, ref);
  // ...the rest of the handler (newlyEarned diff, rarity, showcase, scoring, nearest) is UNCHANGED...
});
```

Keep the remainder of the handler (the `syncEarnedRibbons`/`newlyEarnedIds` block, `ribbonRarity`, `getShowcase`, `pointsForRibbon`/`trainerScoreFor`/`rankFor`, `nearestRibbons`, and the `c.json({...})` response) exactly as it is today.

- [ ] **Step 3: Verify the refactor is behavior-preserving**

Run: `npx vitest run tests/worker/ribbons.test.ts && npx tsc -b`
Expected: PASS — every existing ribbons test still green (this proves the extraction changed no behavior). If any ribbons test fails, the extraction diverged from the original inline code — fix the helper to match rather than editing the test.

- [ ] **Step 4: Write the failing public-endpoint tests**

Create `tests/worker/public-profile.test.ts`:

```ts
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../../src/worker/index";

const call = async (path: string, init?: RequestInit, cookie?: string) => {
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers);
  if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};
const postJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);
const putJson = (path: string, body: unknown, cookie?: string) =>
  call(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, cookie);

const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  return verify.headers.get("set-cookie")!.split(";")[0];
};

describe("GET /api/u/:handle", () => {
  it("404s an unknown handle", async () => {
    const res = await call("/api/u/nobody-here");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("returns a public profile — WITHOUT the email, and readable without a cookie", async () => {
    const email = "pubprof-visible@x.com";
    const cookie = await signIn(email);
    await putJson("/api/profile", { displayName: "Red", gender: "boy" }, cookie);
    await putJson("/api/profile/handle", { handle: "trainer-red" }, cookie);

    const res = await call("/api/u/trainer-red"); // no cookie — public read
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain(email); // HARD CONSTRAINT: never leak email
    const body = JSON.parse(raw) as any;
    expect(body.profile.handle).toBe("trainer-red");
    expect(body.profile.displayName).toBe("Red");
    expect(body.profile.gender).toBe("boy");
    expect(body.profile).not.toHaveProperty("email");
    expect(body.profile.email).toBeUndefined();
    expect(Array.isArray(body.profile.favorites)).toBe(true);
    expect(Array.isArray(body.profile.showcase)).toBe(true);
    expect(typeof body.profile.trainerScore).toBe("number");
    expect(typeof body.profile.rank).toBe("string");
    expect(body.profile.stats).toEqual(
      expect.objectContaining({ dexCount: expect.any(Number), specimenCount: expect.any(Number), ribbonCount: expect.any(Number) }),
    );
  });

  it("is case-insensitive on the handle in the URL", async () => {
    const cookie = await signIn("pubprof-case@x.com");
    await putJson("/api/profile", { displayName: "Blue" }, cookie);
    await putJson("/api/profile/handle", { handle: "trainer-blue" }, cookie);
    const res = await call("/api/u/Trainer-BLUE");
    expect(res.status).toBe(200);
    expect(((await res.json()) as any).profile.handle).toBe("trainer-blue");
  });

  it("404s a private profile — never revealing it exists", async () => {
    const cookie = await signIn("pubprof-private@x.com");
    await putJson("/api/profile", { displayName: "Ghost" }, cookie);
    await putJson("/api/profile/handle", { handle: "trainer-ghost" }, cookie);
    await putJson("/api/profile/visibility", { isPublic: false }, cookie);

    const res = await call("/api/u/trainer-ghost");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
```

- [ ] **Step 5: Run to verify failure**

Run: `npx vitest run tests/worker/public-profile.test.ts`
Expected: FAIL — no `/api/u/:handle` route (404 with the SPA/Hono fallback, not the `{error:"not_found"}` shape and not 200).

- [ ] **Step 6: Implement `src/worker/routes/public-profile.ts`**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../db/schema";
import { normalizeHandle } from "../profile/handle";
import { getFavoritesEnriched } from "../profile/favorites-store";
import { getShowcase } from "../ribbons/incentive-store";
import { trainerScoreFor, rankFor } from "../ribbons/scoring";
import { computeRibbons, buildCollectionSummary, buildReferenceData } from "../ribbons/collection-summary";

export const publicProfileRoutes = new Hono<{ Bindings: Env }>();

/**
 * Public, unauthenticated read of a trainer's profile. A private profile
 * (`isPublic` = 0) and a nonexistent handle return the IDENTICAL 404, so the
 * private case never reveals the handle exists. The response carries ONLY the
 * fields below — never email, never any other `users` column.
 */
publicProfileRoutes.get("/:handle", async (c) => {
  const handle = normalizeHandle(c.req.param("handle"));
  const db = getDb(c.env.DB);

  const rows = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  const user = rows[0];
  if (!user || user.isPublic !== 1) return c.json({ error: "not_found" }, 404);

  const summary = await buildCollectionSummary(db, user.id);
  const ref = await buildReferenceData(db);
  const ribbons = computeRibbons(summary, ref);
  const earned = ribbons.filter((r) => r.earned);
  const trainerScore = trainerScoreFor(earned);
  const rank = rankFor(trainerScore);

  const byId = new Map(ribbons.map((r) => [r.id, r] as const));
  const showcaseSlots = await getShowcase(db, user.id);
  const showcase = showcaseSlots
    .filter((id): id is string => id !== null)
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => ({ id: r.id, name: r.name, category: r.category }));

  const favorites = await getFavoritesEnriched(db, user.id);

  return c.json({
    profile: {
      userId: user.id, // ONLY exposed so the client can fetch the public avatar image
      handle: user.handle,
      displayName: user.displayName,
      gender: user.gender,
      hasAvatar: user.avatarKey !== null,
      favorites,
      showcase,
      trainerScore,
      rank,
      stats: {
        dexCount: summary.speciesIds.size,
        shinySpeciesCount: summary.shinySpeciesIds.size,
        specimenCount: summary.specimenCount,
        ribbonCount: earned.length,
      },
    },
  });
});
```

Mount it in `src/worker/index.ts` (add the import alongside the other route imports and the mount alongside the other `app.route` calls):

```ts
import { publicProfileRoutes } from "./routes/public-profile";
```

```ts
app.route("/api/u", publicProfileRoutes);
```

- [ ] **Step 7: Run to verify it passes**

Run: `npx vitest run tests/worker/public-profile.test.ts && npx tsc -b`
Expected: PASS (all four cases, including the no-email assertion and private→404).

- [ ] **Step 8: Add the client types + `fetchPublicProfile` in `src/react-app/api.ts`**

```ts
export type PublicShowcaseRibbon = { id: string; name: string; category: string };

export type PublicProfileStats = {
	dexCount: number;
	shinySpeciesCount: number;
	specimenCount: number;
	ribbonCount: number;
};

export type PublicProfileDto = {
	/** Only used to build the public avatar URL (`avatarUrl(userId)`); no other user id is exposed. */
	userId: string;
	handle: string;
	displayName: string | null;
	gender: string | null;
	hasAvatar: boolean;
	favorites: FavoriteDto[];
	showcase: PublicShowcaseRibbon[];
	trainerScore: number;
	rank: string;
	stats: PublicProfileStats;
};

/**
 * Fetches a trainer's PUBLIC profile by handle. Returns `null` for a 404 —
 * which covers both an unknown handle and a private profile (the server makes
 * the two indistinguishable on purpose). Never sends credentials; the endpoint
 * is public and returns no account-private data.
 */
export async function fetchPublicProfile(handle: string): Promise<PublicProfileDto | null> {
	const res = await fetch(`/api/u/${encodeURIComponent(handle)}`);
	if (res.status === 404) return null;
	const body = await handleJson<{ profile: PublicProfileDto }>(res, "fetch public profile");
	return body.profile;
}
```

- [ ] **Step 9: Final verify + commit**

Run: `npx vitest run tests/worker/ribbons.test.ts tests/worker/public-profile.test.ts && npx tsc -b && npm run build`
Expected: all green.

```bash
git add src/worker/ribbons/collection-summary.ts src/worker/routes/ribbons.ts src/worker/routes/public-profile.ts src/worker/index.ts tests/worker/public-profile.test.ts src/react-app/api.ts
git commit -m "feat(flex-F): GET /api/u/:handle public profile (no email, private->404); extract collection-summary helpers"
```

---

### Task F4: `react-router-dom` integration — refactor `App.tsx` to real routes + `AppLayout` + gate; pure route helpers

**This is the riskiest task — sequenced so nothing regresses.** It converts the in-page `view`/`tab` state machine into real routes while preserving every existing view and keeping the onboarding gate blocking for authenticated views. The public `/u/:handle` route is registered here as a placeholder that renders a "coming in F5" stub; F5 replaces the stub with the real page. All extractable logic is a DOM-free, unit-tested module; the rest is verified by build only.

**Files:**
- Modify: `package.json` (add `react-router-dom` dependency) + `package-lock.json` (via `npm install`)
- Create: `src/react-app/routes.ts` (pure — path constants + `AccountView` type + path helpers)
- Test: `tests/react-app/routes.test.ts`
- Modify: `src/react-app/components/AccountMenu.tsx` (import `AccountView` from `../routes`; re-export it for back-compat)
- Create: `src/react-app/components/AppLayout.tsx` (search/gen state + `TopBar` + `Footer` + onboarding gate + `<Outlet>`)
- Modify: `src/react-app/App.tsx` (becomes the `<Routes>` definition + thin route wrappers)
- Modify: `src/react-app/main.tsx` (wrap in `<BrowserRouter>`)
- Verify only (no component tests — see Global Constraints): `npx tsc -b` + `npm run build`, plus `npx vitest run tests/react-app/routes.test.ts`

**Interfaces:**
- Produces (pure, `src/react-app/routes.ts`): `PATHS` (the seven app paths); `AccountView = "collection" | "ribbons" | "importExport" | "settings"`; `pathForAccountView(v: AccountView): string`; `publicProfilePath(handle: string): string`; `tabForPath(pathname: string): "species" | "events"`; `showFiltersForPath(pathname: string): boolean`.
- Consumes: `useAuth` (`./auth/AuthProvider`), `needsOnboarding` (`./profile/display`), `ProfileSetup`, `TopBar`, `Footer`, `RosetteSprite`, and the page components — all existing.

- [ ] **Step 1: Install `react-router-dom`**

Run: `npm install react-router-dom@^7`
Expected: `react-router-dom` appears under `dependencies` in `package.json`; `package-lock.json` updates. (It is a client-only dependency; the Workers tsconfig projects exclude `src/react-app`, so it cannot affect the worker build.)

- [ ] **Step 2: Write the failing pure route-helper tests**

Create `tests/react-app/routes.test.ts` (no `api.ts` / component import — see the BUILD-GATE GOTCHA; `tests/react-app/incentiveDisplay.test.ts` / `profileDisplay.test.ts` are the existing examples of this pattern):

```ts
import { describe, expect, it } from "vitest";
import {
	PATHS,
	pathForAccountView,
	publicProfilePath,
	tabForPath,
	showFiltersForPath,
} from "../../src/react-app/routes";

describe("PATHS", () => {
	it("defines every existing app view at a stable path", () => {
		expect(PATHS).toEqual({
			home: "/",
			species: "/species",
			events: "/events",
			collection: "/collection",
			ribbons: "/ribbons",
			importExport: "/import-export",
			settings: "/settings",
		});
	});
});

describe("pathForAccountView", () => {
	it("maps each account view to its path", () => {
		expect(pathForAccountView("collection")).toBe("/collection");
		expect(pathForAccountView("ribbons")).toBe("/ribbons");
		expect(pathForAccountView("importExport")).toBe("/import-export");
		expect(pathForAccountView("settings")).toBe("/settings");
	});
});

describe("publicProfilePath", () => {
	it("builds the /u/:handle path", () => {
		expect(publicProfilePath("ash-ketchum")).toBe("/u/ash-ketchum");
	});
});

describe("tabForPath", () => {
	it("is 'events' only on the events path, 'species' everywhere else", () => {
		expect(tabForPath("/events")).toBe("events");
		expect(tabForPath("/species")).toBe("species");
		expect(tabForPath("/")).toBe("species");
		expect(tabForPath("/collection")).toBe("species");
	});
});

describe("showFiltersForPath", () => {
	it("shows the search/gen filters only on the two catalog paths", () => {
		expect(showFiltersForPath("/species")).toBe(true);
		expect(showFiltersForPath("/events")).toBe(true);
		expect(showFiltersForPath("/")).toBe(false);
		expect(showFiltersForPath("/ribbons")).toBe(false);
	});
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/react-app/routes.test.ts`
Expected: FAIL — module `src/react-app/routes` not found.

- [ ] **Step 4: Implement `src/react-app/routes.ts`**

```ts
// src/react-app/routes.ts
//
// DOM-free routing constants + pure path helpers for the client router (Flex
// Phase F). Kept free of React/DOM/api.ts imports so it's unit-testable the
// same way profile/display.ts is (see the BUILD-GATE GOTCHA — tests import
// this, never a component). `AccountView` lives here (not in AccountMenu.tsx)
// so this pure module can own it without pulling a component into the tests.

/** Every existing app view, at a real, stable URL path. */
export const PATHS = {
	home: "/",
	species: "/species",
	events: "/events",
	collection: "/collection",
	ribbons: "/ribbons",
	importExport: "/import-export",
	settings: "/settings",
} as const;

/** The account-menu destinations (unchanged set from Phase P's AccountMenu). */
export type AccountView = "collection" | "ribbons" | "importExport" | "settings";

const ACCOUNT_VIEW_PATHS: Record<AccountView, string> = {
	collection: PATHS.collection,
	ribbons: PATHS.ribbons,
	importExport: PATHS.importExport,
	settings: PATHS.settings,
};

/** Path for an account-menu destination. */
export function pathForAccountView(view: AccountView): string {
	return ACCOUNT_VIEW_PATHS[view];
}

/** Public trainer profile path for a handle. */
export function publicProfilePath(handle: string): string {
	return `/u/${handle}`;
}

/** Which catalog tab a path represents (drives TopBar's tab highlight). */
export function tabForPath(pathname: string): "species" | "events" {
	return pathname === PATHS.events ? "events" : "species";
}

/** Whether the TopBar's search + generation filters apply on this path. */
export function showFiltersForPath(pathname: string): boolean {
	return pathname === PATHS.species || pathname === PATHS.events;
}
```

- [ ] **Step 5: Run to verify it passes, then typecheck**

Run: `npx vitest run tests/react-app/routes.test.ts && npx tsc -b`
Expected: PASS; clean typecheck.

- [ ] **Step 6: Point `AccountView` at `routes.ts` in `src/react-app/components/AccountMenu.tsx`**

Replace the local `AccountView` declaration with an import + re-export (so existing `import { type AccountView } from "./AccountMenu"` sites in `App.tsx`/`Home.tsx`/`TopBar.tsx` keep compiling unchanged):

```ts
import { type AccountView } from "../routes";
export type { AccountView };
```

(Delete the old `export type AccountView = "collection" | "ribbons" | "importExport" | "settings";` line. The rest of `AccountMenu.tsx` — which already takes an `onNavigate: (view: AccountView) => void` prop — is unchanged; the layout supplies a navigate-backed `onNavigate` in Step 7.)

- [ ] **Step 7: Create `src/react-app/components/AppLayout.tsx`**

```tsx
// src/react-app/components/AppLayout.tsx
//
// The authenticated app shell (Flex Phase F): owns the catalog search/gen
// filter state, renders the TopBar + Footer + the RosetteSprite, enforces the
// blocking onboarding gate, and renders the current route's page through
// <Outlet>. Every app route is a child of this layout; the public
// /u/:handle route is registered OUTSIDE it (App.tsx) so it is not gated.

import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { needsOnboarding } from "../profile/display";
import { pathForAccountView, PATHS, showFiltersForPath, tabForPath } from "../routes";
import { Footer } from "./Footer";
import { ProfileSetup } from "./ProfileSetup";
import { RosetteSprite } from "../ribbons/RosetteSprite";
import { TopBar } from "./TopBar";

/** Shared via <Outlet context> so catalog routes can read the live filter state. */
export type LayoutContext = { q: string; gen: number | undefined };

export function AppLayout() {
	const [q, setQ] = useState("");
	const [gen, setGen] = useState<number | undefined>(undefined);
	const { user, loading } = useAuth();
	const location = useLocation();
	const navigate = useNavigate();

	if (!loading && needsOnboarding(user)) {
		return (
			<div className="app">
				<ProfileSetup />
			</div>
		);
	}

	const context: LayoutContext = { q, gen };

	return (
		<div className="app">
			<RosetteSprite />
			<TopBar
				tab={tabForPath(location.pathname)}
				onTabChange={(next) => navigate(next === "events" ? PATHS.events : PATHS.species)}
				search={q}
				onSearchChange={setQ}
				gen={gen}
				onGenChange={setGen}
				showFilters={showFiltersForPath(location.pathname)}
				onNavigate={(view) => navigate(pathForAccountView(view))}
				onLogoClick={() => navigate(PATHS.home)}
			/>
			<Outlet context={context} />
			<Footer />
		</div>
	);
}
```

- [ ] **Step 8: Rewrite `src/react-app/App.tsx` as the route table + thin wrappers**

```tsx
// src/react-app/App.tsx
//
// Client route table (Flex Phase F). Authenticated views render inside
// AppLayout (TopBar/Footer/onboarding gate); the public trainer profile at
// /u/:handle is a top-level, ungated route. Thin wrapper components adapt the
// existing page callback props (onBrowse/onNavigate/onBack/onBrowseSpecies) to
// react-router navigation, and feed the catalog pages the layout's live
// search/gen filter state via useOutletContext.

import { Routes, Route, useNavigate, useOutletContext } from "react-router-dom";
import { AppLayout, type LayoutContext } from "./components/AppLayout";
import { PublicProfile } from "./pages/PublicProfile";
import { EventsCatalog } from "./pages/EventsCatalog";
import { Home } from "./pages/Home";
import { ImportExport } from "./pages/ImportExport";
import { MyCollection } from "./pages/MyCollection";
import { Ribbons } from "./pages/Ribbons";
import { Settings } from "./pages/Settings";
import { SpeciesCatalog } from "./pages/SpeciesCatalog";
import { PATHS, pathForAccountView } from "./routes";

function HomeRoute() {
	const navigate = useNavigate();
	return <Home onBrowse={() => navigate(PATHS.species)} onNavigate={(view) => navigate(pathForAccountView(view))} />;
}

function SpeciesRoute() {
	const { q, gen } = useOutletContext<LayoutContext>();
	return <SpeciesCatalog q={q} gen={gen} />;
}

function EventsRoute() {
	const { q, gen } = useOutletContext<LayoutContext>();
	return <EventsCatalog q={q} gen={gen} />;
}

function CollectionRoute() {
	const navigate = useNavigate();
	return <MyCollection onBrowseSpecies={() => navigate(PATHS.species)} />;
}

function SettingsRoute() {
	const navigate = useNavigate();
	return <Settings onBack={() => navigate(PATHS.home)} />;
}

function App() {
	return (
		<Routes>
			<Route path="/u/:handle" element={<PublicProfile />} />
			<Route element={<AppLayout />}>
				<Route index element={<HomeRoute />} />
				<Route path="species" element={<SpeciesRoute />} />
				<Route path="events" element={<EventsRoute />} />
				<Route path="collection" element={<CollectionRoute />} />
				<Route path="ribbons" element={<Ribbons />} />
				<Route path="import-export" element={<ImportExport />} />
				<Route path="settings" element={<SettingsRoute />} />
				<Route path="*" element={<HomeRoute />} />
			</Route>
		</Routes>
	);
}

export default App;
```

- [ ] **Step 9: Create a temporary `src/react-app/pages/PublicProfile.tsx` stub (replaced in F5)**

So `App.tsx` compiles now and F5 is a focused, isolated change:

```tsx
// src/react-app/pages/PublicProfile.tsx
//
// Public trainer profile at /u/:handle. Placeholder stub — the real page
// (fetch + Avatar/FavoritesStrip/RankBadge/showcase) lands in Flex Phase F,
// Task F5. Ungated + unauthenticated by design (registered outside AppLayout).

import { useParams } from "react-router-dom";

export function PublicProfile() {
	const { handle } = useParams<{ handle: string }>();
	return (
		<div className="app">
			<div className="container page">
				<p>Public profile for {handle} — coming in F5.</p>
			</div>
		</div>
	);
}
```

- [ ] **Step 10: Wrap the app in `<BrowserRouter>` in `src/react-app/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "@fontsource/jetbrains-mono/500.css";

import "./styles.css";
import App from "./App.tsx";
import { AuthProvider } from "./auth/AuthProvider.tsx";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<BrowserRouter>
			<AuthProvider>
				<App />
			</AuthProvider>
		</BrowserRouter>
	</StrictMode>,
);
```

- [ ] **Step 11: Verify + commit**

Run: `npx vitest run tests/react-app/routes.test.ts && npx tsc -b && npm run build`
Expected: all green — `npm run build` confirms `App.tsx`, `AppLayout.tsx`, `main.tsx`, the wrappers, and the `PublicProfile` stub all compile and bundle with `react-router-dom`. No component test is added (no harness — see Global Constraints); routing correctness is confirmed by build success plus the pure `routes.test.ts`.

Manually confirm (by reading the JSX) that every previous view is still reachable: `/` (Home), `/species`, `/events`, `/collection`, `/ribbons`, `/import-export`, `/settings`, and that `AppLayout` still gates on `needsOnboarding`. (SPA fallback is already configured — `wrangler.jsonc` has `not_found_handling: "single-page-application"` — so deep links like `/u/x` and `/settings` serve `index.html` and the router takes over.)

```bash
git add package.json package-lock.json src/react-app/routes.ts tests/react-app/routes.test.ts src/react-app/components/AccountMenu.tsx src/react-app/components/AppLayout.tsx src/react-app/App.tsx src/react-app/pages/PublicProfile.tsx src/react-app/main.tsx
git commit -m "feat(flex-F): react-router-dom — real routes for every view + AppLayout gate; /u/:handle stub"
```

---

### Task F5: `PublicProfile` page — render `/u/:handle` (reuse Avatar/FavoritesStrip/RankBadge/RibbonIcon, read-only) + CSS

**Files:**
- Modify: `src/react-app/pages/PublicProfile.tsx` (replace the F4 stub with the real page)
- Modify: `src/react-app/styles.css` (append `.public-profile*` styles)
- Verify only: `npx tsc -b` + `npm run build`

**Interfaces:**
- Consumes: `fetchPublicProfile`, `PublicProfileDto` (`../api`, F3); `Avatar` (`../components/Avatar`), `FavoritesStrip` (`../components/FavoritesStrip`), `RankBadge` (`../components/RankBadge`), `RibbonIcon` (`../ribbons/RibbonIcon`), `ThemeToggle` (`../components/ThemeToggle`); `PATHS` (`../routes`); `useParams`, `Link` (`react-router-dom`).

- [ ] **Step 1: Replace `src/react-app/pages/PublicProfile.tsx` with the real page**

```tsx
// src/react-app/pages/PublicProfile.tsx
//
// Public trainer profile at /u/:handle (Flex Phase F). Ungated +
// unauthenticated: registered outside AppLayout, fetched via the public
// GET /api/u/:handle endpoint, which never returns email or private data. A
// missing handle OR a private profile both come back as null (the server
// makes them indistinguishable) and render the same "not found" state. Its
// own minimal header (wordmark link home + theme toggle) — deliberately NO
// AccountMenu, so no account-only chrome leaks onto a public page.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPublicProfile, type PublicProfileDto } from "../api";
import { Avatar } from "../components/Avatar";
import { FavoritesStrip } from "../components/FavoritesStrip";
import { RankBadge } from "../components/RankBadge";
import { ThemeToggle } from "../components/ThemeToggle";
import { RibbonIcon } from "../ribbons/RibbonIcon";
import { PATHS } from "../routes";

type LoadState =
	| { status: "loading" }
	| { status: "not_found" }
	| { status: "error" }
	| { status: "ok"; profile: PublicProfileDto };

function PublicHeader() {
	return (
		<header className="toolbar public-profile__bar">
			<div className="toolbar__inner container">
				<Link className="wordmark" to={PATHS.home}>
					PokeFlexDex
				</Link>
				<div className="toolbar__controls">
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}

export function PublicProfile() {
	const { handle } = useParams<{ handle: string }>();
	const [state, setState] = useState<LoadState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;
		setState({ status: "loading" });
		fetchPublicProfile(handle ?? "")
			.then((profile) => {
				if (cancelled) return;
				setState(profile ? { status: "ok", profile } : { status: "not_found" });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});
		return () => {
			cancelled = true;
		};
	}, [handle]);

	return (
		<div className="app">
			<PublicHeader />
			<div className="container page">
				{state.status === "loading" && <p className="state__title">Loading…</p>}

				{state.status === "not_found" && (
					<div className="state">
						<p className="state__title">Trainer not found</p>
						<p className="state__hint">
							This profile doesn't exist or is private.{" "}
							<Link to={PATHS.home}>Back to PokeFlexDex</Link>
						</p>
					</div>
				)}

				{state.status === "error" && (
					<div className="state">
						<p className="state__title">Something went wrong</p>
						<p className="state__hint">
							Couldn't load this profile. <Link to={PATHS.home}>Back to PokeFlexDex</Link>
						</p>
					</div>
				)}

				{state.status === "ok" && <PublicProfileBody profile={state.profile} />}
			</div>
		</div>
	);
}

function PublicProfileBody({ profile }: { profile: PublicProfileDto }) {
	return (
		<>
			<section className="public-profile__hero">
				<Avatar userId={profile.userId} displayName={profile.displayName} hasAvatar={profile.hasAvatar} size="lg" />
				<div>
					<p className="hero__eyebrow">@{profile.handle}</p>
					<h1 className="hero__title hero__title--slim">{profile.displayName ?? "Trainer"}</h1>
					<RankBadge trainerScore={profile.trainerScore} rank={profile.rank} size="sm" />
				</div>
			</section>

			<section className="public-profile__stats" aria-label="Collection stats">
				<Stat label="Dex" value={profile.stats.dexCount} />
				<Stat label="Shiny" value={profile.stats.shinySpeciesCount} />
				<Stat label="Specimens" value={profile.stats.specimenCount} />
				<Stat label="Ribbons" value={profile.stats.ribbonCount} />
			</section>

			<FavoritesStrip favorites={profile.favorites} />

			{profile.showcase.length > 0 && (
				<section className="public-profile__showcase" aria-label="Ribbon showcase">
					<h2 className="ribbon-section__title">Trophy Wall</h2>
					<div className="trophy-wall__grid">
						{profile.showcase.map((r) => (
							<div className="trophy-wall__slot" key={r.id}>
								<RibbonIcon ribbon={{ id: r.id, category: r.category }} size={64} />
								<span className="trophy-wall__name">{r.name}</span>
							</div>
						))}
					</div>
				</section>
			)}
		</>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div className="public-profile__stat">
			<span className="public-profile__stat-value">{value.toLocaleString()}</span>
			<span className="public-profile__stat-label">{label}</span>
		</div>
	);
}
```

- [ ] **Step 2: Append CSS to `src/react-app/styles.css`**

```css
/* ---------- Public profile (Flex Phase F) ---------- */

.public-profile__bar {
	/* Minimal public header: reuses .toolbar layout, no account chrome. */
	margin-bottom: 1rem;
}

.public-profile__hero {
	display: flex;
	align-items: center;
	gap: 1.25rem;
	margin: 1rem 0 1.5rem;
}

.public-profile__stats {
	display: flex;
	flex-wrap: wrap;
	gap: 1.5rem;
	margin-bottom: 1.5rem;
}

.public-profile__stat {
	display: flex;
	flex-direction: column;
}

.public-profile__stat-value {
	font-family: var(--font-display);
	font-size: 1.5rem;
	font-weight: 700;
}

.public-profile__stat-label {
	color: var(--muted);
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.04em;
}

.public-profile__showcase {
	margin-top: 1.5rem;
}
```

- [ ] **Step 3: Verify + commit**

Run: `npx tsc -b && npm run build`
Expected: clean typecheck, successful build. No component test (no harness — see Global Constraints); verified by build success, same as `Home.tsx`/`ProfileSetup.tsx`. The endpoint behavior is already covered by `tests/worker/public-profile.test.ts` (Task F3).

```bash
git add src/react-app/pages/PublicProfile.tsx src/react-app/styles.css
git commit -m "feat(flex-F): PublicProfile page at /u/:handle (avatar, favorites, rank, showcase, stats)"
```

---

### Task F6: Settings — handle editor + public/private toggle + share link; onboarding suggestion copy

**Files:**
- Modify: `src/react-app/pages/Settings.tsx` (add a "Public profile" section: handle editor, visibility toggle, share link)
- Modify: `src/react-app/components/ProfileSetup.tsx` (one line of copy telling the user a public page is being created)
- Verify only: `npx tsc -b` + `npm run build`

**Interfaces:**
- Consumes: `setHandle`, `setProfileVisibility` (`../api`, F2); `publicProfilePath` (`../routes`, F4); `useAuth().user`/`refresh` (existing).

- [ ] **Step 1: Add the "Public profile" section to `src/react-app/pages/Settings.tsx`**

Extend the imports:

```ts
import { authDeleteAccount, setHandle, setProfileVisibility, updateProfile, uploadAvatar } from "../api";
import { publicProfilePath } from "../routes";
```

Add local state for the handle editor + visibility, alongside the existing `useState` calls in the `Settings` component body (after the `profileSaved` state):

```ts
	const [handleInput, setHandleInput] = useState(user?.handle ?? "");
	const [savingHandle, setSavingHandle] = useState(false);
	const [handleError, setHandleError] = useState<string | null>(null);
	const [handleSaved, setHandleSaved] = useState(false);
	const [savingVisibility, setSavingVisibility] = useState(false);
	const [copied, setCopied] = useState(false);
```

Add the handlers (after `handleSaveProfile`, before `handleSignOut`):

```ts
	async function handleSaveHandle() {
		setHandleError(null);
		setHandleSaved(false);
		setSavingHandle(true);
		try {
			await setHandle(handleInput.trim());
			await refresh();
			setHandleSaved(true);
		} catch (err) {
			setHandleError(err instanceof Error ? err.message : String(err));
		} finally {
			setSavingHandle(false);
		}
	}

	async function handleToggleVisibility() {
		if (!user) return;
		setSavingVisibility(true);
		try {
			await setProfileVisibility(!user.isPublic);
			await refresh();
		} finally {
			setSavingVisibility(false);
		}
	}

	async function copyShareLink() {
		if (!user?.handle) return;
		const url = `${window.location.origin}${publicProfilePath(user.handle)}`;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
		}
	}
```

Insert a new `<section>` between the existing "Profile" section's `FavoriteSpeciesPicker` and the "Account" section (i.e. right before `<section className="settings-section"><h2 ...>Account</h2>`):

```tsx
				<section className="settings-section">
					<h2 className="settings-section__title">Public profile</h2>
					<p className="settings-section__hint">
						Your profile is visible at a public link when it's set to public. It shows your name,
						avatar, favorites, ribbon showcase, and rank — never your email.
					</p>

					<label className="field-label" htmlFor="handle-input">
						Your handle (the trailing part of your URL)
					</label>
					<div className="profile-fields__photo-row">
						<span className="settings-section__handle-prefix">/u/</span>
						<input
							id="handle-input"
							className="input input--full"
							value={handleInput}
							maxLength={30}
							placeholder="ash-ketchum"
							onChange={(e) => {
								setHandleInput(e.target.value);
								setHandleSaved(false);
							}}
						/>
					</div>
					{handleError && (
						<p className="error-banner" role="alert">
							{handleError}
						</p>
					)}
					<button
						type="button"
						className="button button--primary"
						onClick={handleSaveHandle}
						disabled={savingHandle}
					>
						{savingHandle ? "Saving…" : handleSaved ? "Saved" : "Save handle"}
					</button>

					<p className="settings-section__row">
						<span className="field-label">Visibility</span>
						<span>{user.isPublic ? "Public" : "Private"}</span>
					</p>
					<button type="button" className="button" onClick={handleToggleVisibility} disabled={savingVisibility}>
						{savingVisibility ? "Saving…" : user.isPublic ? "Make private" : "Make public"}
					</button>

					{user.handle && user.isPublic && (
						<p className="settings-section__row">
							<span className="field-label">Share link</span>
							<span className="mono">
								{window.location.origin}
								{publicProfilePath(user.handle)}
							</span>
							<button type="button" className="button" onClick={copyShareLink}>
								{copied ? "Copied!" : "Copy link"}
							</button>
						</p>
					)}
				</section>
```

- [ ] **Step 2: Append CSS for the handle prefix to `src/react-app/styles.css`**

```css
.settings-section__handle-prefix {
	color: var(--muted);
	font-family: var(--font-mono);
}
```

- [ ] **Step 3: Add onboarding copy in `src/react-app/components/ProfileSetup.tsx`**

Update the onboarding hint paragraph text (the existing `<p className="profile-setup__hint">…</p>`) to mention the public page — copy only, no logic change (the handle itself is created server-side by the F2 backfill when the user saves their name):

```tsx
				<p className="profile-setup__hint">
					Before you dive in, tell us a bit about yourself. Your name and gender are required; a
					photo and favorites are optional and can be added later from Settings. We'll also set up a
					public trainer page for you — you can customize its link or make it private anytime in
					Settings.
				</p>
```

- [ ] **Step 4: Final verify + commit**

Run: `npx vitest run && npx tsc -b && npm run build`
Expected: full suite green, clean typecheck, successful build.

Manually confirm (by reading the JSX) that the Settings "Account" section still shows `user.email` (the login identity — the ONE allowed place) and that no new code path renders `user.email` on the public profile or anywhere else.

```bash
git add src/react-app/pages/Settings.tsx src/react-app/components/ProfileSetup.tsx src/react-app/styles.css
git commit -m "feat(flex-F): Settings handle editor + public/private toggle + share link; onboarding copy"
```

---

## Self-Review

**Spec coverage** (against `docs/superpowers/specs/2026-07-14-ribbons-and-rivalry-design.md` §5–6 and the HANDOFF Phase F description + the four LOCKED DECISIONS):

| Spec / locked-decision item | Task | Status |
| --- | --- | --- |
| `users.handle` (text, unique, nullable) | F1 (schema, migration 0009) | ✓ |
| `users.isPublic` (int, DEFAULT 1) | F1 (schema, migration 0009) | ✓ |
| Public `GET /api/u/:handle` (+ collection stats) | F3 | ✓ — reuses scoring + showcase + favorites + extracted summary |
| Page at `/u/:handle` | F5 (real page), F4 (route registration) | ✓ |
| User-EDITABLE custom handle (validate lowercase alnum+dashes, length, reserved blocklist, uniqueness) | F1 (pure `handle.ts`: format/length/reserved), F2 (route uniqueness), F6 (Settings editor) | ✓ |
| Suggest an initial handle at onboarding | F2 (server-side backfill on `PUT /api/profile` via `suggestHandleBase` + `generateUniqueHandle`), F6 (onboarding copy) | ✓ — implemented as automatic backfill so the profile is reachable the moment onboarding completes (judgment call, below) |
| Public profile shows name + avatar + top-3 favorites + ribbon showcase + rank/score/stats | F3 (response), F5 (render: Avatar/FavoritesStrip/RankBadge/RibbonIcon + stats) | ✓ |
| **Never email** (public endpoint + page) | F3 (response shape excludes email; test asserts serialized response has no email substring + `profile.email` undefined), F5 (no email rendered), F6 (email stays only in Settings' Account section) | ✓ — hard constraint, enforced + tested |
| Private toggle; private → 404, no email leak | F2 (`PUT /api/profile/visibility`), F3 (private and unknown both return identical `404 {error:"not_found"}`; test covers it), F6 (toggle UI) | ✓ |
| Lightweight URL routing replacing in-page tab state; preserve every view; onboarding gate blocking | F4 (`react-router-dom`, `AppLayout` gate, all 7 views at real paths) | ✓ |
| Public route renders without auth / without account-only chrome | F4 (top-level route outside `AppLayout`), F5 (own minimal header, no AccountMenu) | ✓ |
| Migration via `drizzle-kit generate`, no hand-written SQL, confirm index | F1 (0009 expected; instructs confirming against `_journal.json`) | ✓ |
| `GET /api/auth/me` + `UserDto` extended additively with handle/isPublic | F1 | ✓ |
| Versus / rivalries / stats dashboard | *(out of scope — Phase G)* | — deliberately excluded; F3 extracts `buildCollectionSummary`/`buildReferenceData` as the foundation Phase G's `stats.ts` will use |

**Tables/columns added:** `users.handle` (text, unique, nullable) and `users.isPublic` (integer, NOT NULL, default 1) — Task F1, one migration (expected `0009`, confirm at execution). No new tables.

**Endpoints added:** `PUT /api/profile/handle` (F2), `PUT /api/profile/visibility` (F2), `GET /api/u/:handle` (F3, public). `PUT /api/profile` behavior extended (F2: handle backfill). `GET /api/auth/me` response extended (F1: `handle`, `isPublic`).

**Reuse / DRY:** F3 extracts the per-user collection aggregation out of `routes/ribbons.ts` into `ribbons/collection-summary.ts` (`buildCollectionSummary`, `buildReferenceData`, `EMPTY_SUMMARY`) and refactors the ribbons route to consume it, so the public endpoint computes rank/score/stats through the identical code path (regression-guarded by the existing ribbons test suite). The public endpoint reuses `trainerScoreFor`/`rankFor` (`scoring.ts`), `getShowcase` (`incentive-store.ts`), and `getFavoritesEnriched` (`favorites-store.ts`) verbatim — no duplicated scoring/showcase/favorites logic. F2 adds a single `serializeUser` helper in `routes/profile.ts` so `PUT /`, `PUT /handle`, and `PUT /visibility` all return the identical `UserDto` shape without triplicated serialization. F5 reuses the read-only `Avatar`/`FavoritesStrip`/`RankBadge`/`RibbonIcon` components; the public showcase renders with the same `.trophy-wall__grid`/`RibbonIcon` markup `TrophyWall` uses.

**Placeholder scan:** none — every code step carries complete, runnable code and exact verification commands. The one deliberately-approximate value is the migration index (`0009`), explicitly flagged as "confirm against `migrations/meta/_journal.json` at execution time" (matching how Phases P/D handled the same uncertainty). F4's `PublicProfile.tsx` is intentionally a stub with a clearly-labeled F5 follow-up, so the risky router refactor and the page render are separately reviewable — the stub is replaced with complete code in F5, not left as a placeholder.

**Type consistency:**
- `CurrentUser` (worker) and `UserDto` (client) both gain `handle: string \| null` + `isPublic: boolean`, in lockstep (F1). `isPublic` is stored numeric (`0`/`1`, house style matching `isShiny`/`isEvent`) and converted to a JS `boolean` exactly once per boundary: `getCurrentUser` (`user.isPublic === 1`), `serializeUser` (`u.isPublic === 1`), and the public route (`user.isPublic !== 1` guard). The write endpoints convert the other way (`isPublic ? 1 : 0`).
- `AccountView` moves from `AccountMenu.tsx` to the DOM-free `routes.ts` and is re-exported from `AccountMenu.tsx`, so every existing `import { type AccountView } from "./AccountMenu"` site (`App.tsx`, `Home.tsx`, `TopBar.tsx`) keeps compiling — additive, no rename.
- `PublicProfileDto` (client, F3) mirrors the F3 server response field-for-field (`userId, handle, displayName, gender, hasAvatar, favorites, showcase, trainerScore, rank, stats`); `PublicShowcaseRibbon = {id, name, category}` matches the resolved showcase objects the endpoint emits, and `RibbonIcon` accepts exactly `{id, category}`.
- `validateHandle` returns `{ok, value}` (value = normalized handle) mirroring `validateProfileInput`'s shape; the route surfaces its `errors` as 400 `{errors}` → `ApiValidationError` client-side, consistent with every other validated endpoint.

**Determinism / idempotency:**
- `generateUniqueHandle` is deterministic given DB state (tries `base`, `base-2`, …) with a random-suffix fallback only in the pathological ≥1000-collision case; the backfill only runs when `user.handle === null`, so it never churns an existing handle and re-saving a name is a no-op on the handle.
- The public endpoint is a pure read (no writes), safe to call unauthenticated and repeatedly.
- Handles are always stored normalized (lowercased), which is what makes both the uniqueness check (F2) and the public lookup (F3) case-insensitive without any `lower()` SQL.

**Risks / open questions (resolved via judgment call — flagged for the controller to sanity-check):**
1. **Onboarding-gate vs. public route for a signed-in-but-not-onboarded viewer.** LOCKED DECISION 1 says both "onboarding gate blocks from any route" and "the public route renders WITHOUT requiring auth." These conflict only for a signed-in user who hasn't onboarded and visits someone else's `/u/:handle`. **Resolution:** the gate lives in `AppLayout`, and `/u/:handle` is a top-level route *outside* `AppLayout`, so the public page always renders (it needs no auth and forcing onboarding to view someone else's public page would be user-hostile). The gate still blocks every *authenticated* view. I judged "public route renders without auth" to be the stronger, more specific requirement for that one overlap. Flagging in case the controller wants a not-onboarded signed-in user redirected to onboarding even from `/u/:handle`.
2. **Handle suggestion = server-side backfill, not a client suggest-and-confirm flow.** DECISION 3 says "SUGGEST an initial handle during/after onboarding." I implemented this as an automatic server-side backfill inside `PUT /api/profile` (assign a unique handle derived from the display name when none exists yet), rather than a client UI that proposes a handle for the user to accept/edit before saving. Rationale: it guarantees "public by default as soon as they have a handle" (DECISION 2) with zero extra round-trips and no client-side uniqueness-retry logic, and Settings (F6) is the editable surface. The tradeoff: onboarding doesn't show the suggested handle inline before it's assigned (the F6 copy tells the user a page was created and where to customize it). Flagging in case a visible in-onboarding suggestion field is wanted.
3. **Taken/invalid handle returns 400 (not 409).** To reuse the existing `handleJson` → `ApiValidationError` path (which special-cases 400 `{errors}`), a taken handle returns 400 like a format error, so the Settings editor shows the server message uniformly. A stricter REST reading would use 409 for the conflict; I chose consistency with the app's existing validation-error convention.
4. **Public endpoint cost.** `GET /api/u/:handle` runs the full per-user `buildCollectionSummary` + `computeRibbons` (same cost as the owner's `GET /api/ribbons`) on every public view, uncached. Acceptable for current scale and consistent with the existing ribbons route; a cache/denormalized-stats optimization is deferred (naturally fits Phase G's `stats.ts`).
5. **`react-router-dom@^7` version pin.** Specified `^7` (current major, React 19 compatible). If the repo's install resolves an unexpected major, pin explicitly; the integration uses only stable core APIs (`BrowserRouter`, `Routes`, `Route`, `Outlet`, `useNavigate`, `useLocation`, `useParams`, `useOutletContext`, `Link`) present across v6/v7.
6. **Catalog filter state resets on route change.** Search/gen state lives in `AppLayout` (React state, not URL params), so navigating away from `/species` and back clears the query — same behavior as today's in-page `view` switch (which also didn't persist filters across views). Deliberately not promoted to URL search params to keep this task's blast radius small; a follow-up could sync them to the querystring.
7. **Showcase on a public profile can reveal a secret ribbon's name.** If a user pins a secret (`Fun`) ribbon to their showcase, the public endpoint returns its real `name`/`category`. Judged acceptable because the user explicitly chose to display it; the "hidden until earned" rule protects *un*earned secrets, and a pinned ribbon is by definition earned and deliberately surfaced.
