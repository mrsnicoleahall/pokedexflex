# Flex Phase P — Trainer Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop showing the user's raw email as their public display identity (dashboard "Welcome back {email}", the top-bar account button) and replace it with a proper **Trainer Profile**: a display name, a gender (playful, on-theme: **Boy / Girl / Ditto**), and an optional profile photo. A signed-in user who hasn't set a name+gender yet is blocked behind a required one-time onboarding screen before they can use the rest of the app. Email remains visible only as the login identity in Settings — never as the public name.

**Architecture:** `users.displayName` already exists (unused); this phase adds two nullable columns — `gender` (text) and `avatar_key` (text, an R2 object key) — via one more Drizzle migration. A new **pure** validation module `src/worker/profile/validate.ts` (the fixed `{boy, girl, ditto}` gender set, display-name trim/length rules) mirrors the existing `src/worker/collection/validate.ts` pattern — no I/O, unit-tested directly. A new route group `src/worker/routes/profile.ts` (mounted at `/api/profile`) owns `PUT /` (name+gender), `POST /avatar` (multipart upload), and `GET /avatar/:userId` (public image serve) — the last two reuse the **existing** `SPRITES` R2 bucket binding under a new `avatars/` key prefix (see Task P3 for why no new bucket is introduced). `GET /api/auth/me` is extended additively with `gender`/`hasAvatar`. Client-side, `src/react-app/api.ts` gets matching type + fetch-helper additions, a new pure module `src/react-app/profile/display.ts` holds DOM-free helpers (gender option list, initials fallback, avatar URL builder, the `needsOnboarding` predicate) that are unit-tested the same way `src/react-app/ribbons/incentiveDisplay.ts` is, and three small components (`Avatar`, `ProfileFields`, `ProfileSetup`) wire the onboarding gate into `App.tsx` and a profile editor into `Settings.tsx`. `TopBar`/`AccountMenu`/`Home` are updated to show the avatar + display name and never fall back to email.

**Tech Stack:** Cloudflare Workers + Hono + Drizzle (D1) + R2 (`SPRITES` binding); Vitest (`@cloudflare/vitest-pool-workers`) for pure-validation, route, and pure-display-helper tests; drizzle-kit for the migration; React 19 + Vite for the client (no component-test harness exists in this repo — see the Global Constraints — so React tasks are verified via `tsc -b`/`npm run build` only, matching how `Ribbons.tsx`/`Home.tsx` are already handled).

## Global Constraints

- **Never show email as the public/display name.** After Task P4 lands, every signed-in user reaching the rest of the app has a non-null `displayName` (onboarding enforces this) — but `TopBar`/`AccountMenu`/`Home` must never write `user.displayName ?? user.email` again; the fallback for the brief window before onboarding completes (or any defensive gap) is a neutral placeholder string (`"Trainer"`), never `user.email`. Email may still appear in Settings' Account section as the login identity — that is unchanged and intentional.
- **Gender is exactly `{boy, girl, ditto}`.** Stored lowercased. Validated server-side against this exact set in `src/worker/profile/validate.ts` — no other values accepted, case-insensitively normalized on input (`"Boy"`/`"BOY"` → `"boy"`). This is a fixed decision for this phase, not re-litigated here.
- **Onboarding is required, not optional.** A signed-in user with `!displayName || !gender` is shown a blocking `ProfileSetup` screen instead of the rest of the app (gated in `App.tsx`, predicate lives in `src/react-app/profile/display.ts` as `needsOnboarding` so it's unit-testable and reused by nothing else). Photo is never required to pass the gate.
- **Auth-scoped, never client-trusted.** `PUT /api/profile` and `POST /api/profile/avatar` always resolve the target user via `requireUser` (the signed-in session) — never from a body/query `userId`. `GET /api/profile/avatar/:userId` is the one deliberately public, unauthenticated read (an avatar is a public-facing profile image, same trust level as a sprite), and it returns **only** image bytes or a 404 JSON error — never a JSON body containing `email` or any other user field, so there is no path by which it could leak account data.
- **Photo is optional everywhere.** No code path requires an avatar: the onboarding gate only checks `displayName`/`gender`; `Avatar` always renders a legible initials-in-a-circle placeholder when `hasAvatar` is false; `ProfileFields` never blocks Save on a missing photo.
- **Migration via drizzle-kit, applied the repo's existing way.** Edit `src/db/schema/user.ts`, then run `npx drizzle-kit generate` (no `--name`). As of this writing the highest existing migration is `migrations/0006_chubby_proteus.sql` (`migrations/meta/_journal.json` idx 6), so this should generate `migrations/0007_<random-name>.sql` + `migrations/meta/0007_snapshot.json` + a new `_journal.json` entry — confirm the actual next index against that file at execution time rather than assuming. Do **not** hand-edit the generated files. `npm run db:local` must apply cleanly. Tests need no extra wiring — `vitest.config.ts` already reads every file under `migrations/` into `TEST_MIGRATIONS`, applied by `tests/setup/apply-migrations.ts` before each test file.
- **Additive only.** `GET /api/auth/me`'s existing `{user: {id, email, displayName}}` shape keeps every existing key; `gender`/`hasAvatar` are added fields on `user`, never a rename. `UserDto` in `api.ts` gains fields, not replacements — any other current caller of `authMe()`/`UserDto` keeps compiling.
- **BUILD-GATE GOTCHA (Phase E hit this — repeat here).** Root `tsc -b` compiles `tests/tsconfig.json`, which has **no DOM lib** and includes the whole `tests/` tree. A worker-side test (`tests/worker/**`) must only import worker/db code. A react-app-side pure-logic test (`tests/react-app/**`, e.g. this phase's `profileDisplay.test.ts`) must only import DOM-free modules under `src/react-app/**` (like `src/react-app/profile/display.ts`) — it must **never** import `src/react-app/api.ts` (DOM-typed `fetch`/`File`/`FormData` signatures) or any component file, directly or transitively. Verify **every** task with `npx tsc -b` **and** `npm run build`, plus `npx vitest run` for the relevant test files.
- **No component-test harness.** This repo has no React component-testing setup (see the comment atop `src/react-app/ribbons/incentiveDisplay.ts`). React tasks (P4–P6) extract all extractable logic into DOM-free pure modules that get real Vitest coverage, and are otherwise verified by `npx tsc -b` + `npm run build` succeeding — consistent with how `Ribbons.tsx`/`Home.tsx` are already handled. Do **not** start a dev server; visual verification is a separate, out-of-band step.
- **Accessibility.** Every form control in `ProfileFields` (name, gender, photo) has a real `<label htmlFor>` pairing (unique ids per mounting context via an `idPrefix` prop, since the same component is used in both the onboarding gate and Settings). No color-only state; focus-visible styles come from the existing `.input`/`.button` classes — no new CSS framework introduced.
- **Scope discipline.** This phase does **not** touch `users.handle`/public profiles (Phase F) or any Versus/rivalry feature (Phase G). It does not add a "remove photo" flow (upload/replace only — flagged as a Self-Review follow-up, not built). It does not add a dashboard "avatar upload nudge" or gamify profile completion — that's cosmetic scope creep beyond "make the display identity work."

---

### Task P1: Migration + schema (`gender`, `avatar_key`) — extend `GET /api/auth/me` — client `UserDto`

**Files:**
- Modify: `src/db/schema/user.ts` (add `gender`, `avatarKey` columns to `users`)
- Test: `tests/db/schema.test.ts` (append round-trip test)
- New (generated): `migrations/0007_<name>.sql`, `migrations/meta/0007_snapshot.json`, updated `migrations/meta/_journal.json`
- Modify: `src/worker/auth/current-user.ts` (`CurrentUser` gains `gender`, `hasAvatar`; `getCurrentUser` computes both)
- Modify: `src/worker/routes/auth.ts` (the new-user literal in `GET /verify` gains `gender: null, avatarKey: null`)
- Test: `tests/worker/auth.test.ts` (append: fresh user's `/me` has `gender: null`, `hasAvatar: false`)
- Modify: `src/react-app/api.ts` (`UserDto` gains `gender`, `hasAvatar`)

**Interfaces:**
- Produces: `users.gender: string | null`, `users.avatarKey: string | null` (both nullable, no default).
- Produces: `CurrentUser` (`src/worker/auth/current-user.ts`) — `{ id, email, displayName, gender, hasAvatar }`.
- Consumes: nothing new — extends the existing `users` table and `getCurrentUser`/`GET /api/auth/me` path.

- [ ] **Step 1: Write the failing schema test**

Append to `tests/db/schema.test.ts` (after the existing `describe("ribbon incentive schema", ...)` block, same file, same `users`/`eq`/`getDb` imports already present):

```ts
describe("trainer profile schema", () => {
  it("users: gender and avatar_key default to null and round-trip once set", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "prof1", email: "prof1@x.com", createdAt: 1 });

    const [before] = await db.select().from(users).where(eq(users.id, "prof1"));
    expect(before.gender).toBeNull();
    expect(before.avatarKey).toBeNull();

    await db
      .update(users)
      .set({ gender: "ditto", avatarKey: "avatars/prof1" })
      .where(eq(users.id, "prof1"));

    const [after] = await db.select().from(users).where(eq(users.id, "prof1"));
    expect(after.gender).toBe("ditto");
    expect(after.avatarKey).toBe("avatars/prof1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: FAIL — `gender`/`avatarKey` don't exist on the `users` select result (TypeScript will actually fail to compile this file before the test can even run, since `users.gender`/`users.avatarKey` aren't valid Drizzle column refs yet).

- [ ] **Step 3: Add the columns to `src/db/schema/user.ts`**

Change the `users` table definition:

```ts
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  gender: text("gender"),
  avatarKey: text("avatar_key"),
  createdAt: integer("created_at").notNull(),
});
```

(No `unique`/`integer` import changes needed — `text` is already imported.)

- [ ] **Step 4: Generate the migration**

Run: `npx drizzle-kit generate`

Confirm `migrations/meta/_journal.json` gained one new entry and check the generated `migrations/0007_<name>.sql` (index may differ if something else merged first — trust the file, not this number) contains two `ALTER TABLE` statements shaped like:

```sql
ALTER TABLE `users` ADD `gender` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_key` text;
```

If drizzle-kit emits anything else (e.g. a table rebuild), STOP and re-check the schema edit rather than hand-patching the migration.

- [ ] **Step 5: Apply locally + verify the schema test**

Run: `npm run db:local`
Run: `npx vitest run tests/db/schema.test.ts && npx tsc -b`
Expected: both green.

- [ ] **Step 6: Extend `CurrentUser` + `getCurrentUser` in `src/worker/auth/current-user.ts`**

```ts
export interface CurrentUser {
  id: string;
  email: string;
  displayName: string | null;
  gender: string | null;
  hasAvatar: boolean;
}
```

```ts
export const getCurrentUser = async (c: AppContext): Promise<CurrentUser | null> => {
  const sid = await getSignedCookie(c, c.env.SESSION_SECRET, SESSION_COOKIE);
  if (!sid) return null;
  const db = getDb(c.env.DB);
  const session = await getSession(db, sid);
  if (!session) return null;
  const rows = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  const user = rows[0];
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    gender: user.gender,
    hasAvatar: user.avatarKey !== null,
  };
};
```

- [ ] **Step 7: Fix the new-user literal in `src/worker/routes/auth.ts`**

The `GET /verify` handler builds a full `users` row by hand when no existing row is found for the email; it must now include the two new columns (TypeScript will otherwise fail to compile since the literal no longer structurally matches the `users` select type):

```ts
  let user = existing[0];
  if (!user) {
    user = { id: generateToken(), email: tokenRow.email, displayName: null, gender: null, avatarKey: null, createdAt: now };
    await db.insert(users).values(user);
  }
```

- [ ] **Step 8: Write the failing `/me` route test**

Append to `tests/worker/auth.test.ts` (inside the existing `describe("auth helpers", ...)` block, reusing the file's existing `call` helper):

```ts
  it("/me returns gender=null and hasAvatar=false for a freshly created user", async () => {
    const r1 = await call("/api/auth/request-link", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email: "profile-fresh@x.com" }) });
    const { devLink } = await r1.json() as any;
    const path = new URL(devLink).pathname + new URL(devLink).search;
    const verify = await call(path, { redirect: "manual" } as any);
    const cookie = verify.headers.get("set-cookie")!.split(";")[0];
    const me = await call("/api/auth/me", undefined, cookie);
    const body = (await me.json()) as any;
    expect(body.user.displayName).toBeNull();
    expect(body.user.gender).toBeNull();
    expect(body.user.hasAvatar).toBe(false);
  });
```

- [ ] **Step 9: Run to verify it fails, then passes**

Run: `npx vitest run tests/worker/auth.test.ts`
Expected: FAIL first (no `gender`/`hasAvatar` keys — actually a TS error until Step 6/7 land; if doing this plan strictly TDD-style, do Steps 8→9 confirm-fail immediately after Step 2's schema change and before Step 6/7's implementation). Once Steps 6–7 are in place: PASS.

- [ ] **Step 10: Extend the client `UserDto` in `src/react-app/api.ts`**

```ts
export type UserDto = {
	id: string;
	email: string;
	displayName: string | null;
	gender: string | null;
	hasAvatar: boolean;
};
```

- [ ] **Step 11: Verify + commit**

Run: `npx vitest run tests/db/schema.test.ts tests/worker/auth.test.ts && npx tsc -b && npm run build`
Expected: all green.

```bash
git add src/db/schema/user.ts migrations/ src/worker/auth/current-user.ts src/worker/routes/auth.ts tests/db/schema.test.ts tests/worker/auth.test.ts src/react-app/api.ts
git commit -m "feat(flex-P): add users.gender/avatar_key; extend GET /api/auth/me + UserDto"
```

---

### Task P2: `PUT /api/profile` — set display name + gender

**Files:**
- Create: `src/worker/profile/validate.ts` (pure — gender enum + display-name rules)
- Test: `tests/worker/profile-validate.test.ts`
- Create: `src/worker/routes/profile.ts` (new `profileRoutes` Hono group; this task adds `PUT /`)
- Modify: `src/worker/index.ts` (mount `app.route("/api/profile", profileRoutes)`)
- Test: `tests/worker/profile.test.ts` (new file; extended by P3/P4)
- Modify: `src/react-app/api.ts` (add `updateProfile`)

**Interfaces:**
- Produces: `GENDERS = ["boy", "girl", "ditto"] as const`; `validateProfileInput(body: unknown): {ok:true, value:{displayName?:string, gender?:Gender}} | {ok:false, errors:string[]}`.
- Produces (route): `PUT /api/profile` — body `{displayName?, gender?}`, at least one field, auth-scoped via `requireUser`; response `{ user: {id, email, displayName, gender, hasAvatar} }` (same shape as `/api/auth/me`'s `user`, so the client can update local state without an extra fetch).
- Produces (client): `updateProfile(input: {displayName?:string, gender?:string}): Promise<{user: UserDto}>`.
- Consumes: `users` table (Drizzle), `requireUser` (`../auth/current-user`).

- [ ] **Step 1: Write the failing pure-validation tests**

Create `tests/worker/profile-validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { GENDERS, validateProfileInput } from "../../src/worker/profile/validate";

describe("GENDERS", () => {
  it("is exactly boy/girl/ditto", () => {
    expect(GENDERS).toEqual(["boy", "girl", "ditto"]);
  });
});

describe("validateProfileInput", () => {
  it("accepts a valid displayName + gender, trimmed and lowercased", () => {
    const result = validateProfileInput({ displayName: "  Ash  ", gender: "BOY" });
    expect(result).toEqual({ ok: true, value: { displayName: "Ash", gender: "boy" } });
  });

  it("accepts a partial update (displayName only)", () => {
    expect(validateProfileInput({ displayName: "Misty" })).toEqual({ ok: true, value: { displayName: "Misty" } });
  });

  it("accepts a partial update (gender only)", () => {
    expect(validateProfileInput({ gender: "ditto" })).toEqual({ ok: true, value: { gender: "ditto" } });
  });

  it("rejects an empty or whitespace-only displayName", () => {
    expect(validateProfileInput({ displayName: "" }).ok).toBe(false);
    expect(validateProfileInput({ displayName: "   " }).ok).toBe(false);
  });

  it("rejects a displayName over 40 characters", () => {
    const result = validateProfileInput({ displayName: "x".repeat(41) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/40/);
  });

  it("accepts a displayName at exactly the 40-character cap", () => {
    expect(validateProfileInput({ displayName: "x".repeat(40) }).ok).toBe(true);
  });

  it("rejects a gender outside {boy, girl, ditto}", () => {
    const result = validateProfileInput({ gender: "robot" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/boy, girl, ditto/);
  });

  it("rejects a non-object body", () => {
    expect(validateProfileInput(null).ok).toBe(false);
    expect(validateProfileInput("nope").ok).toBe(false);
  });

  it("returns an empty value (still ok) when neither field is present — the route decides whether that's an error", () => {
    expect(validateProfileInput({})).toEqual({ ok: true, value: {} });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/worker/profile-validate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/worker/profile/validate.ts`**

```ts
/**
 * Pure validation for the Trainer Profile fields (Flex Phase P): the fixed
 * gender enum and display-name trim/length rules. No I/O — mirrors
 * `src/worker/collection/validate.ts`'s `{ok, value|errors}` shape. Consumed
 * by `routes/profile.ts`; unit-tested directly here.
 */

/** Fixed, on-theme gender set for this app — not a general identity field. Stored lowercased. */
export const GENDERS = ["boy", "girl", "ditto"] as const;
export type Gender = (typeof GENDERS)[number];

const isGender = (v: string): v is Gender => (GENDERS as readonly string[]).includes(v);

/** Display names longer than this are rejected — generous for any real name/nickname, short enough to fit the UI. */
export const DISPLAY_NAME_MAX = 40;

export type ProfileInput = { displayName?: string; gender?: Gender };
export type ProfileValidationResult = { ok: true; value: ProfileInput } | { ok: false; errors: string[] };

/**
 * Validates a partial profile update. Either field may be omitted (a
 * partial update); if present, it must be valid. An input with neither
 * field returns `{ok: true, value: {}}` — the route (not this pure
 * function) decides whether "nothing to update" is itself an error.
 */
export function validateProfileInput(body: unknown): ProfileValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["body must be an object"] };
  }
  const b = body as Record<string, unknown>;
  const errors: string[] = [];
  const value: ProfileInput = {};

  if ("displayName" in b) {
    const raw = b.displayName;
    if (typeof raw !== "string") {
      errors.push("displayName must be a string");
    } else {
      const trimmed = raw.trim();
      if (trimmed === "") errors.push("displayName must not be empty");
      else if (trimmed.length > DISPLAY_NAME_MAX) errors.push(`displayName must be at most ${DISPLAY_NAME_MAX} characters`);
      else value.displayName = trimmed;
    }
  }

  if ("gender" in b) {
    const raw = b.gender;
    const lower = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!isGender(lower)) {
      errors.push(`gender must be one of: ${GENDERS.join(", ")}`);
    } else {
      value.gender = lower;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/worker/profile-validate.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Write the failing route tests**

Create `tests/worker/profile.test.ts`:

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

/** Runs the real magic-link flow and returns the session cookie string for `email`. */
const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
};

describe("PUT /api/profile", () => {
  it("rejects when not signed in (401)", async () => {
    const res = await putJson("/api/profile", { displayName: "Ash", gender: "boy" });
    expect(res.status).toBe(401);
  });

  it("sets displayName + gender, and they persist on the next /me fetch", async () => {
    const cookie = await signIn("profile-set@x.com");
    const res = await putJson("/api/profile", { displayName: "Ash", gender: "boy" }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.user.displayName).toBe("Ash");
    expect(body.user.gender).toBe("boy");
    expect(body.user.email).toBe("profile-set@x.com");

    const me = await call("/api/auth/me", undefined, cookie);
    const meBody = (await me.json()) as any;
    expect(meBody.user.displayName).toBe("Ash");
    expect(meBody.user.gender).toBe("boy");
  });

  it("supports a partial update without clobbering the other field", async () => {
    const cookie = await signIn("profile-partial@x.com");
    await putJson("/api/profile", { displayName: "Misty", gender: "girl" }, cookie);
    await putJson("/api/profile", { gender: "ditto" }, cookie);

    const me = await call("/api/auth/me", undefined, cookie);
    const body = (await me.json()) as any;
    expect(body.user.displayName).toBe("Misty"); // untouched by the gender-only update
    expect(body.user.gender).toBe("ditto");
  });

  it("rejects an invalid gender (400) and does not persist it", async () => {
    const cookie = await signIn("profile-badgender@x.com");
    const res = await putJson("/api/profile", { displayName: "Ash", gender: "robot" }, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/boy, girl, ditto/);

    const me = await call("/api/auth/me", undefined, cookie);
    expect((await me.json() as any).user.gender).toBeNull();
  });

  it("rejects an empty displayName (400)", async () => {
    const cookie = await signIn("profile-emptyname@x.com");
    const res = await putJson("/api/profile", { displayName: "   " }, cookie);
    expect(res.status).toBe(400);
  });

  it("rejects a body with neither field (400 'nothing to update')", async () => {
    const cookie = await signIn("profile-empty@x.com");
    const res = await putJson("/api/profile", {}, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/nothing to update/);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run tests/worker/profile.test.ts`
Expected: FAIL — 404 (no `/api/profile` route mounted yet).

- [ ] **Step 7: Implement `src/worker/routes/profile.ts` and mount it**

```ts
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../db/schema";
import { requireUser } from "../auth/current-user";
import { validateProfileInput } from "../profile/validate";

export const profileRoutes = new Hono<{ Bindings: Env }>();

profileRoutes.put("/", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  if (body === null) return c.json({ errors: ["body must be JSON"] }, 400);

  const result = validateProfileInput(body);
  if (!result.ok) return c.json({ errors: result.errors }, 400);
  if (Object.keys(result.value).length === 0) return c.json({ errors: ["nothing to update"] }, 400);

  const db = getDb(c.env.DB);
  await db.update(users).set(result.value).where(eq(users.id, user.id));

  const rows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const updated = rows[0];
  return c.json({
    user: {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      gender: updated.gender,
      hasAvatar: updated.avatarKey !== null,
    },
  });
});
```

In `src/worker/index.ts`, add the import and mount alongside the other route groups:

```ts
import { profileRoutes } from "./routes/profile";
```

```ts
app.route("/api/profile", profileRoutes);
```

- [ ] **Step 8: Verify + commit**

Run: `npx vitest run tests/worker/profile-validate.test.ts tests/worker/profile.test.ts && npx tsc -b`
Expected: all green.

- [ ] **Step 9: Add the client wrapper in `src/react-app/api.ts`**

```ts
/**
 * Updates the signed-in user's display name and/or gender (a partial update —
 * either field may be omitted). Server validates gender against
 * `{boy, girl, ditto}` and trims/length-caps displayName; an invalid or
 * empty body throws `ApiValidationError` via `handleJson`.
 */
export async function updateProfile(input: { displayName?: string; gender?: string }): Promise<{ user: UserDto }> {
	const res = await fetch("/api/profile", {
		method: "PUT",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
	return handleJson<{ user: UserDto }>(res, "update profile");
}
```

- [ ] **Step 10: Final verify + commit**

Run: `npx vitest run tests/worker/profile-validate.test.ts tests/worker/profile.test.ts && npx tsc -b && npm run build`
Expected: all green.

```bash
git add src/worker/profile/validate.ts tests/worker/profile-validate.test.ts src/worker/routes/profile.ts src/worker/index.ts tests/worker/profile.test.ts src/react-app/api.ts
git commit -m "feat(flex-P): PUT /api/profile (displayName + gender) + client updateProfile"
```

---

### Task P3: Avatar upload/serve — `POST /api/profile/avatar`, `GET /api/profile/avatar/:userId`

**Files:**
- Modify: `src/worker/routes/profile.ts` (add `POST /avatar`, `GET /avatar/:userId`)
- Modify: `src/worker/routes/auth.ts` (best-effort R2 cleanup of the avatar object on `DELETE /api/auth/account`)
- Test: `tests/worker/profile.test.ts` (append)
- Modify: `src/react-app/api.ts` (add `uploadAvatar`)

**R2 approach (chosen — see Global Constraints/risk notes):** reuse the **existing** `SPRITES` R2 bucket binding (`wrangler.jsonc`'s only `r2_buckets` entry, already used by `src/worker/routes/sprites.ts` for cached HOME sprites and `src/worker/routes/photo-import.ts` for uploaded box screenshots) under a new `avatars/{userId}` key prefix, rather than adding a second bucket. Justification: one avatar per user is a tiny, low-volume workload that doesn't need bucket-level isolation from sprites; adding a second `r2_buckets` binding would mean a second bucket to provision/bind in every environment (`wrangler.jsonc`, CI, local `.wrangler` state) for no operational benefit, whereas `SPRITES` is already wired everywhere this repo runs. The key is **deterministic** (`avatars/{userId}`, no random suffix) so re-uploading a photo overwrites the old object in place — no orphaned old avatars to clean up on replace.

**Interfaces:**
- Produces (route): `POST /api/profile/avatar` — multipart form field `avatar`, auth-scoped via `requireUser`; validates content-type (`image/png`, `image/jpeg`, `image/webp` only) and size (≤ 2 MiB); stores to `SPRITES` at `avatars/{userId}` with `httpMetadata.contentType` set; sets `users.avatarKey`; responds `{hasAvatar: true}`.
- Produces (route): `GET /api/profile/avatar/:userId` — public, unauthenticated; streams the R2 object's bytes with its stored content-type, or `404 {error:"not_found"}` if the user has no avatar. Never returns any JSON field derived from the `users` row (no email, no id echo beyond the URL param already supplied by the caller) — image bytes or a fixed 404 shape only.
- Consumes: `SPRITES` R2 binding; `users.avatarKey`.

- [ ] **Step 1: Write the failing route tests**

Append to `tests/worker/profile.test.ts` (new `describe` block; add a small multipart helper near the top of the file, alongside `postJson`/`putJson`):

```ts
const postAvatar = async (path: string, bytes: Uint8Array, type: string, cookie?: string) => {
  const form = new FormData();
  form.set("avatar", new Blob([bytes], { type }), "avatar.png");
  const ctx = createExecutionContext();
  const headers = new Headers();
  if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { method: "POST", headers, body: form }), env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
};

const FAKE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe("avatar upload/serve", () => {
  it("rejects upload when not signed in (401)", async () => {
    const res = await postAvatar("/api/profile/avatar", FAKE_PNG, "image/png");
    expect(res.status).toBe(401);
  });

  it("rejects a disallowed content type (400)", async () => {
    const cookie = await signIn("avatar-badtype@x.com");
    const res = await postAvatar("/api/profile/avatar", new Uint8Array([1, 2, 3]), "text/plain", cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/unsupported/);
  });

  it("rejects a file over the 2 MiB cap (400)", async () => {
    const cookie = await signIn("avatar-toobig@x.com");
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    const res = await postAvatar("/api/profile/avatar", big, "image/png", cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/too large/);
  });

  it("404s a userId with no avatar", async () => {
    const res = await call("/api/profile/avatar/no-such-user");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("uploads a valid image, flips hasAvatar, and serves the same bytes+type back — publicly, no cookie needed", async () => {
    const cookie = await signIn("avatar-owner@x.com");
    const me1 = await call("/api/auth/me", undefined, cookie);
    const userId = ((await me1.json()) as any).user.id;

    const upload = await postAvatar("/api/profile/avatar", FAKE_PNG, "image/png", cookie);
    expect(upload.status).toBe(200);
    expect((await upload.json()) as any).toEqual({ hasAvatar: true });

    const me2 = await call("/api/auth/me", undefined, cookie);
    expect(((await me2.json()) as any).user.hasAvatar).toBe(true);

    const served = await call(`/api/profile/avatar/${userId}`); // no cookie — public read
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await served.arrayBuffer());
    expect(bytes).toEqual(FAKE_PNG);
  });

  it("re-uploading replaces the avatar at the same key rather than accumulating objects", async () => {
    const cookie = await signIn("avatar-replace@x.com");
    const me1 = await call("/api/auth/me", undefined, cookie);
    const userId = ((await me1.json()) as any).user.id;

    await postAvatar("/api/profile/avatar", FAKE_PNG, "image/png", cookie);
    const second = new Uint8Array([9, 9, 9]);
    await postAvatar("/api/profile/avatar", second, "image/jpeg", cookie);

    const served = await call(`/api/profile/avatar/${userId}`);
    expect(served.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(second);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/worker/profile.test.ts`
Expected: FAIL — no `/avatar` routes (404s where 200/400 expected).

- [ ] **Step 3: Implement in `src/worker/routes/profile.ts`**

Add these imports:

```ts
import type { Context } from "hono";
```

Add constants + helpers (after the existing imports, before `profileRoutes.put("/", ...)`):

```ts
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MiB — generous for a profile photo, small enough to stay cheap in R2.
const ALLOWED_AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Deterministic R2 key for a user's avatar — re-uploading overwrites this same object, never accumulates. */
export const avatarKeyFor = (userId: string) => `avatars/${userId}`;
```

Append the two routes:

```ts
profileRoutes.post("/avatar", async (c: Context<{ Bindings: Env }>) => {
  const user = await requireUser(c);

  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return c.json({ errors: ["expected multipart/form-data"] }, 400);
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("avatar");
  if (!(file instanceof Blob)) return c.json({ errors: ["missing avatar file"] }, 400);
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    return c.json({ errors: [`unsupported image type: ${file.type || "unknown"}`] }, 400);
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return c.json({ errors: [`image too large (max ${MAX_AVATAR_BYTES / (1024 * 1024)}MB)`] }, 400);
  }

  const bytes = await file.arrayBuffer();
  const key = avatarKeyFor(user.id);
  await c.env.SPRITES.put(key, bytes, { httpMetadata: { contentType: file.type } });

  const db = getDb(c.env.DB);
  await db.update(users).set({ avatarKey: key }).where(eq(users.id, user.id));

  return c.json({ hasAvatar: true });
});

profileRoutes.get("/avatar/:userId", async (c) => {
  const userId = c.req.param("userId");
  const object = await c.env.SPRITES.get(avatarKeyFor(userId));
  if (!object) return c.json({ error: "not_found" }, 404);
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=60",
    },
  });
});
```

(`cache-control: max-age=60`, not `immutable` like sprites — an avatar can be replaced by its owner at the same key, so a short cache window avoids serving a stale photo for long after a change, without making every load a network round-trip.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/worker/profile.test.ts`
Expected: PASS (all `avatar upload/serve` + prior `PUT /api/profile` cases).

- [ ] **Step 5: Best-effort R2 cleanup on account deletion**

Append to `tests/worker/auth.test.ts`:

```ts
  it("deleting an account with an avatar also removes the R2 object (best-effort)", async () => {
    const cookie = await signIn("delete-with-avatar@x.com");
    const me = await call("/api/auth/me", undefined, cookie);
    const userId = ((await me.json()) as any).user.id;

    const form = new FormData();
    form.set("avatar", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "a.png");
    const ctx1 = createExecutionContext();
    const h1 = new Headers({ Cookie: cookie });
    await worker.fetch(new Request("http://x/api/profile/avatar", { method: "POST", headers: h1, body: form }), env, ctx1);
    await waitOnExecutionContext(ctx1);

    expect(await env.SPRITES.get(`avatars/${userId}`)).not.toBeNull();

    await call("/api/auth/account", { method: "DELETE" }, cookie);

    expect(await env.SPRITES.get(`avatars/${userId}`)).toBeNull();
  });
```

In `src/worker/routes/auth.ts`, import `avatarKeyFor` from `./profile` and delete the object best-effort inside `DELETE /api/auth/account`, before the `db.batch` (so a storage hiccup never blocks the account deletion itself — mirrors `photo-import.ts`'s `storeUpload` best-effort try/catch):

```ts
import { avatarKeyFor } from "./profile";
```

```ts
authRoutes.delete("/account", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  try {
    await c.env.SPRITES.delete(avatarKeyFor(user.id));
  } catch (err) {
    console.error("account deletion: failed to remove avatar from R2", err);
  }
  await db.batch([
    db.delete(specimens).where(eq(specimens.userId, user.id)),
    db.delete(importJobs).where(eq(importJobs.userId, user.id)),
    db.delete(boxes).where(eq(boxes.userId, user.id)),
    db.delete(sessionsTable).where(eq(sessionsTable.userId, user.id)),
    db.delete(loginTokens).where(eq(loginTokens.email, user.email)),
    db.delete(users).where(eq(users.id, user.id)),
  ]);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});
```

(`R2Bucket.delete` on a nonexistent key is a no-op, not an error, so this is safe for the common case of a user with no avatar too.)

- [ ] **Step 6: Run to verify + commit**

Run: `npx vitest run tests/worker/profile.test.ts tests/worker/auth.test.ts && npx tsc -b`
Expected: all green.

- [ ] **Step 7: Add the client wrapper in `src/react-app/api.ts`**

```ts
/**
 * Uploads (or replaces) the signed-in user's avatar photo. Server validates
 * type (png/jpeg/webp) and a 2 MiB size cap; an invalid file throws
 * `ApiValidationError` via `handleJson`. Photo is always optional — no
 * caller is required to invoke this.
 */
export async function uploadAvatar(file: File): Promise<{ hasAvatar: boolean }> {
	const form = new FormData();
	form.append("avatar", file);
	const res = await fetch("/api/profile/avatar", { method: "POST", credentials: "include", body: form });
	return handleJson<{ hasAvatar: boolean }>(res, "upload avatar");
}
```

- [ ] **Step 8: Final verify + commit**

Run: `npx vitest run && npx tsc -b && npm run build`
Expected: full suite green, clean typecheck, successful build.

```bash
git add src/worker/routes/profile.ts src/worker/routes/auth.ts tests/worker/profile.test.ts tests/worker/auth.test.ts src/react-app/api.ts
git commit -m "feat(flex-P): avatar upload/serve via SPRITES R2 bucket (avatars/ prefix)"
```

---

### Task P4: Top 3 favorite Pokémon — `user_favorites` table + `PUT /api/profile/favorites` + `GET /api/auth/me`

**Data model decision:** a `user_favorites` table (`id`, `userId`, `speciesId`, `slot`), **not** three nullable `favSpecies1/2/3` columns on `users`. Justification, by direct analogy to the ribbon showcase (`user_showcase` in Phase D, same shape: `userId`, `ribbonId`, `slot`):
1. **Referential integrity.** `speciesId` can be a real FK to `species.id`; three loose integer columns on `users` can't each carry a meaningful FK name and still stay readable, and validating "does this id exist" becomes three near-duplicate checks instead of one `inArray` query.
2. **Reorder/replace is a single clean operation.** Saving a new top-3 is "delete this user's rows, insert the new ones" (identical to `setShowcase`) — with three columns, a partial update ("swap slot 2, leave 1 and 3") means conditional per-column SQL instead of one wholesale replace.
3. **Dedupe and cap-at-3 are enforceable in one place.** The unique indexes below make "one species per slot" and "one slot per species" a DB-level guarantee, exactly like `user_showcase`, instead of application code having to notice `favSpecies1 === favSpecies3`.
4. **No `users` schema churn.** `users` already gained two columns this phase (Task P1); a third unrelated concern (favorite species) living in its own small table keeps `users` from becoming a catch-all, and keeps this phase's `users`-table migration (P1) independent of this one.

**Files:**
- Modify: `src/db/schema/user.ts` (add `userFavorites` table — `species` is already imported at the top of this file)
- Test: `tests/db/schema.test.ts` (append round-trip + unique-constraint cases)
- New (generated): `migrations/0008_<name>.sql`, `migrations/meta/0008_snapshot.json`, updated `migrations/meta/_journal.json`
- Create: `src/worker/profile/favorites-store.ts` (data-access module, mirrors `src/worker/ribbons/incentive-store.ts`'s `Db`/showcase pattern)
- Test: `tests/worker/favorites-store.test.ts`
- Modify: `src/worker/routes/profile.ts` (add `PUT /favorites`)
- Modify: `src/worker/routes/auth.ts` (`GET /api/auth/me` gains `user.favorites`)
- Test: `tests/worker/profile.test.ts` (append; seeds a few species)
- Test: `tests/worker/auth.test.ts` (append: `/me` includes `favorites`)
- Modify: `src/react-app/api.ts` (`FavoriteDto`, `UserDto.favorites`, `setFavoriteSpecies`)

**Interfaces:**
- Produces: `userFavorites` — `id` (text PK), `userId` (FK→`users.id`), `speciesId` (int, FK→`species.id`), `slot` (int); unique on `(userId, slot)` **and** `(userId, speciesId)`.
- Produces: `FAVORITE_SLOTS = 3`; `getFavorites(db, userId): Promise<(number|null)[]>` (fixed length-3, slot-indexed); `getFavoritesEnriched(db, userId): Promise<{speciesId, name, homeId}[]>` (only the filled slots, joined against `species`, in slot order); `setFavorites(db, userId, speciesIds): Promise<{ok:true}|{ok:false,errors:string[]}>` (validates length ≤ 3, no duplicates, every id exists in `species` — never trusts the client that a species id is real).
- Produces (route): `PUT /api/profile/favorites` — body `{speciesIds: number[]}`, auth-scoped; response `{favorites: [...]}` (enriched, so the client can render immediately without a refetch).
- Produces (route): `GET /api/auth/me`'s `user.favorites` — enriched favorites array, `[]` for none, present for every signed-in user.
- Produces (client): `FavoriteDto = {speciesId, name, homeId}`; `UserDto.favorites: FavoriteDto[]`; `setFavoriteSpecies(speciesIds: number[]): Promise<{favorites: FavoriteDto[]}>`.
- Consumes: `species` table (existing); `users.id`.

- [ ] **Step 1: Write the failing schema tests**

Append to `tests/db/schema.test.ts` (extend the import line to add `userFavorites`, then add a new `describe` block at the end of the file):

```ts
import { species, forms, users, boxes, specimens, events, userRibbons, userShowcase, userFavorites } from "../../src/db/schema";
```

```ts
describe("favorites schema", () => {
  it("user_favorites: inserts, reads, and enforces one species per slot and one slot per species", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "fav1", email: "fav1@x.com", createdAt: 1 });
    await db.insert(species).values({ id: 4001, name: "favmon-a", generation: 1, types: JSON.stringify(["normal"]) });
    await db.insert(species).values({ id: 4002, name: "favmon-b", generation: 1, types: JSON.stringify(["normal"]) });

    await db.insert(userFavorites).values({ id: "uf1", userId: "fav1", speciesId: 4001, slot: 0 });
    const rows = await db.select().from(userFavorites).where(eq(userFavorites.userId, "fav1"));
    expect(rows).toHaveLength(1);
    expect(rows[0].slot).toBe(0);

    // Same user, same slot, different species -> blocked.
    await expect(
      db.insert(userFavorites).values({ id: "uf2", userId: "fav1", speciesId: 4002, slot: 0 }),
    ).rejects.toThrow();

    // Same user, same species, different slot -> blocked (a species occupies exactly one slot).
    await expect(
      db.insert(userFavorites).values({ id: "uf3", userId: "fav1", speciesId: 4001, slot: 1 }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/db/schema.test.ts`
Expected: FAIL — `userFavorites` is not exported.

- [ ] **Step 3: Add `userFavorites` to `src/db/schema/user.ts`**

Append at the end of the file (`species` and `unique` are already imported at the top):

```ts
/**
 * Up to 3 species a user has pinned as their "top 3 favorites" for their
 * trainer card / public profile (Phase F shows these publicly), keyed by
 * slot (0..2) — same shape and same validation posture as `userShowcase`:
 * membership (the species must exist) is checked in the store function
 * against the `species` table, not enforceable purely at the schema level
 * beyond the FK itself.
 */
export const userFavorites = sqliteTable(
  "user_favorites",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    speciesId: integer("species_id").notNull().references(() => species.id),
    slot: integer("slot").notNull(),
  },
  (t) => [
    unique("user_favorites_user_id_slot_unique").on(t.userId, t.slot),
    unique("user_favorites_user_id_species_id_unique").on(t.userId, t.speciesId),
  ],
);
```

- [ ] **Step 4: Generate the migration**

Run: `npx drizzle-kit generate`

Confirm the new `migrations/0008_<name>.sql` (check `migrations/meta/_journal.json` for the actual next index) creates `user_favorites` with both unique indexes and the FK to `species`, shaped like:

```sql
CREATE TABLE `user_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`species_id` integer NOT NULL,
	`slot` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`species_id`) REFERENCES `species`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_favorites_user_id_slot_unique` ON `user_favorites` (`user_id`,`slot`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_favorites_user_id_species_id_unique` ON `user_favorites` (`user_id`,`species_id`);
```

- [ ] **Step 5: Apply locally + verify**

Run: `npm run db:local`
Run: `npx vitest run tests/db/schema.test.ts && npx tsc -b`
Expected: both green.

- [ ] **Step 6: Commit the schema/migration**

```bash
git add src/db/schema/user.ts migrations/ tests/db/schema.test.ts
git commit -m "feat(flex-P): add user_favorites table (top 3 favorite species)"
```

- [ ] **Step 7: Write the failing data-access tests**

Create `tests/worker/favorites-store.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users, species } from "../../src/db/schema";
import { getFavorites, getFavoritesEnriched, setFavorites, FAVORITE_SLOTS } from "../../src/worker/profile/favorites-store";

const seedSpecies = async (db: ReturnType<typeof getDb>) => {
  await db.insert(species).values([
    { id: 5001, name: "picksta", generation: 1, types: JSON.stringify(["electric"]), homeId: 5001 },
    { id: 5002, name: "bulbo", generation: 1, types: JSON.stringify(["grass"]), homeId: null },
    { id: 5003, name: "charry", generation: 1, types: JSON.stringify(["fire"]), homeId: 5003 },
  ]);
};

describe("favorites-store: getFavorites / getFavoritesEnriched", () => {
  it("defaults to an all-null 3-slot favorites list", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "ffs-u1", email: "ffs-u1@x.com", createdAt: 1 });
    expect(await getFavorites(db, "ffs-u1")).toEqual(new Array(FAVORITE_SLOTS).fill(null));
    expect(await getFavoritesEnriched(db, "ffs-u1")).toEqual([]);
  });
});

describe("favorites-store: setFavorites", () => {
  it("rejects an unknown species id and writes nothing", async () => {
    const db = getDb(env.DB);
    await seedSpecies(db);
    await db.insert(users).values({ id: "ffs-u2", email: "ffs-u2@x.com", createdAt: 1 });

    const result = await setFavorites(db, "ffs-u2", [999999]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/unknown species/);
    expect(await getFavorites(db, "ffs-u2")).toEqual(new Array(FAVORITE_SLOTS).fill(null));
  });

  it("rejects more than 3 species and duplicate ids", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "ffs-u3", email: "ffs-u3@x.com", createdAt: 1 });

    const tooMany = await setFavorites(db, "ffs-u3", [5001, 5002, 5003, 5001]);
    expect(tooMany.ok).toBe(false);

    const dup = await setFavorites(db, "ffs-u3", [5001, 5001]);
    expect(dup.ok).toBe(false);
  });

  it("pins valid species in slot order and replaces a prior list wholesale", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "ffs-u4", email: "ffs-u4@x.com", createdAt: 1 });

    const first = await setFavorites(db, "ffs-u4", [5001, 5002]);
    expect(first.ok).toBe(true);
    expect(await getFavorites(db, "ffs-u4")).toEqual([5001, 5002, null]);

    const enriched = await getFavoritesEnriched(db, "ffs-u4");
    expect(enriched).toEqual([
      { speciesId: 5001, name: "picksta", homeId: 5001 },
      { speciesId: 5002, name: "bulbo", homeId: null },
    ]);

    const second = await setFavorites(db, "ffs-u4", [5003]); // replaces, doesn't append
    expect(second.ok).toBe(true);
    expect(await getFavorites(db, "ffs-u4")).toEqual([5003, null, null]);
  });

  it("an empty list clears all favorites", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "ffs-u5", email: "ffs-u5@x.com", createdAt: 1 });
    await setFavorites(db, "ffs-u5", [5001]);
    await setFavorites(db, "ffs-u5", []);
    expect(await getFavorites(db, "ffs-u5")).toEqual(new Array(FAVORITE_SLOTS).fill(null));
  });
});
```

- [ ] **Step 8: Run to verify failure**

Run: `npx vitest run tests/worker/favorites-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 9: Implement `src/worker/profile/favorites-store.ts`**

```ts
/**
 * Data-access layer for the Top-3 Favorite Species feature (Flex Phase P),
 * structurally identical to the ribbon showcase's `getShowcase`/`setShowcase`
 * in `src/worker/ribbons/incentive-store.ts` — see Task P4's write-up for
 * why this is a table rather than columns on `users`. All D1 I/O lives here;
 * `routes/profile.ts` is the only caller.
 */
import { eq, inArray } from "drizzle-orm";
import type { getDb } from "../db";
import { userFavorites, species } from "../../db/schema";

type Db = ReturnType<typeof getDb>;

/** Fixed favorites size — a "top 3", not a general watchlist. */
export const FAVORITE_SLOTS = 3;

/** Returns the user's favorites as a fixed 3-slot array (`null` for an empty slot), in slot order. */
export async function getFavorites(db: Db, userId: string): Promise<(number | null)[]> {
  const rows = await db
    .select({ speciesId: userFavorites.speciesId, slot: userFavorites.slot })
    .from(userFavorites)
    .where(eq(userFavorites.userId, userId));
  const out: (number | null)[] = new Array(FAVORITE_SLOTS).fill(null);
  for (const r of rows) {
    if (r.slot >= 0 && r.slot < FAVORITE_SLOTS) out[r.slot] = r.speciesId;
  }
  return out;
}

export type FavoriteSpecies = { speciesId: number; name: string; homeId: number | null };

/** Returns only the filled slots, joined against `species` for display, in slot order. */
export async function getFavoritesEnriched(db: Db, userId: string): Promise<FavoriteSpecies[]> {
  const slots = (await getFavorites(db, userId)).filter((id): id is number => id !== null);
  if (slots.length === 0) return [];
  const rows = await db
    .select({ id: species.id, name: species.name, homeId: species.homeId })
    .from(species)
    .where(inArray(species.id, slots));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return slots.map((id) => {
    const row = byId.get(id);
    return { speciesId: id, name: row?.name ?? "unknown", homeId: row?.homeId ?? null };
  });
}

/**
 * Replaces the user's favorites with `speciesIds` (array index = slot).
 * Every id must exist in `species` (checked here, never trusted from the
 * request) — the whole write is rejected, with no partial update, if any id
 * is unknown, the list is longer than `FAVORITE_SLOTS`, or it contains a
 * duplicate.
 */
export async function setFavorites(
  db: Db,
  userId: string,
  speciesIds: readonly number[],
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const errors: string[] = [];
  if (speciesIds.length > FAVORITE_SLOTS) errors.push(`at most ${FAVORITE_SLOTS} favorites allowed`);
  if (new Set(speciesIds).size !== speciesIds.length) errors.push("duplicate species ids");

  if (speciesIds.length > 0) {
    const rows = await db.select({ id: species.id }).from(species).where(inArray(species.id, speciesIds));
    const known = new Set(rows.map((r) => r.id));
    const unknown = speciesIds.filter((id) => !known.has(id));
    if (unknown.length > 0) errors.push(`unknown species: ${unknown.join(", ")}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  await db.delete(userFavorites).where(eq(userFavorites.userId, userId));
  if (speciesIds.length > 0) {
    await db.insert(userFavorites).values(
      speciesIds.map((speciesId, slot) => ({ id: crypto.randomUUID(), userId, speciesId, slot })),
    );
  }
  return { ok: true };
}
```

- [ ] **Step 10: Run the data-access tests to verify they pass**

Run: `npx vitest run tests/worker/favorites-store.test.ts`
Expected: PASS.

- [ ] **Step 11: Write the failing route + `/me` tests**

Append a `beforeAll` species seed and a new `describe` block to `tests/worker/profile.test.ts` (add `beforeAll` to the existing `vitest` import, and `getDb`/`species` imports at the top):

```ts
import { beforeAll } from "vitest";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values([
    { id: 6001, name: "favroutea", generation: 1, types: JSON.stringify(["water"]), homeId: 6001 },
    { id: 6002, name: "favrouteb", generation: 1, types: JSON.stringify(["grass"]), homeId: null },
  ]);
});
```

```ts
describe("PUT /api/profile/favorites", () => {
  it("rejects when not signed in (401)", async () => {
    const res = await putJson("/api/profile/favorites", { speciesIds: [] });
    expect(res.status).toBe(401);
  });

  it("pins up to 3 valid species and reflects them, enriched, on the response and on /me", async () => {
    const cookie = await signIn("fav-owner@x.com");
    const res = await putJson("/api/profile/favorites", { speciesIds: [6001, 6002] }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.favorites).toEqual([
      { speciesId: 6001, name: "favroutea", homeId: 6001 },
      { speciesId: 6002, name: "favrouteb", homeId: null },
    ]);

    const me = await call("/api/auth/me", undefined, cookie);
    expect(((await me.json()) as any).user.favorites).toEqual(body.favorites);
  });

  it("rejects an unknown species id (400)", async () => {
    const cookie = await signIn("fav-unknown@x.com");
    const res = await putJson("/api/profile/favorites", { speciesIds: [999999] }, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.join(" ")).toMatch(/unknown species/);
  });

  it("rejects more than 3 species ids (400)", async () => {
    const cookie = await signIn("fav-overflow@x.com");
    const res = await putJson("/api/profile/favorites", { speciesIds: [6001, 6002, 6001, 6002] }, cookie);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/auth/me favorites default", () => {
  it("is an empty array for a user who hasn't picked any favorites", async () => {
    const cookie = await signIn("fav-none@x.com");
    const me = await call("/api/auth/me", undefined, cookie);
    expect(((await me.json()) as any).user.favorites).toEqual([]);
  });
});
```

- [ ] **Step 12: Run to verify failure**

Run: `npx vitest run tests/worker/profile.test.ts`
Expected: FAIL — no `/favorites` route (404), and `user.favorites` missing from `/me`.

- [ ] **Step 13: Implement the route in `src/worker/routes/profile.ts`**

Extend the imports:

```ts
import { getFavorites, getFavoritesEnriched, setFavorites } from "./favorites-store";
```

Wait — `favorites-store.ts` lives under `../profile/`, and `routes/profile.ts` is itself at `src/worker/routes/profile.ts`, so the correct relative import is:

```ts
import { getFavoritesEnriched, setFavorites } from "../profile/favorites-store";
```

Append the route:

```ts
profileRoutes.put("/favorites", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);

  const body = await c.req.json().catch(() => null);
  const speciesIds = Array.isArray(body?.speciesIds) ? body.speciesIds : null;
  if (!speciesIds || !speciesIds.every((id: unknown) => typeof id === "number" && Number.isInteger(id))) {
    return c.json({ errors: ["speciesIds must be an array of integers"] }, 400);
  }

  const result = await setFavorites(db, user.id, speciesIds);
  if (!result.ok) return c.json({ errors: result.errors }, 400);

  return c.json({ favorites: await getFavoritesEnriched(db, user.id) });
});
```

- [ ] **Step 14: Implement `GET /api/auth/me`'s `favorites` field in `src/worker/routes/auth.ts`**

Add the import:

```ts
import { getFavoritesEnriched } from "../profile/favorites-store";
```

Replace the existing handler:

```ts
authRoutes.get("/me", async (c) => {
  const user = await getCurrentUser(c);
  return c.json({ user });
});
```

with:

```ts
authRoutes.get("/me", async (c) => {
  const user = await getCurrentUser(c);
  if (!user) return c.json({ user: null });
  const db = getDb(c.env.DB);
  const favorites = await getFavoritesEnriched(db, user.id);
  return c.json({ user: { ...user, favorites } });
});
```

- [ ] **Step 15: Run to verify it passes**

Run: `npx vitest run tests/worker/profile.test.ts tests/worker/favorites-store.test.ts && npx tsc -b`
Expected: all green.

- [ ] **Step 16: Append the `/me` favorites test to `tests/worker/auth.test.ts`**

```ts
  it("/me includes an empty favorites array by default", async () => {
    const r1 = await call("/api/auth/request-link", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email: "favorites-fresh@x.com" }) });
    const { devLink } = await r1.json() as any;
    const path = new URL(devLink).pathname + new URL(devLink).search;
    const verify = await call(path, { redirect: "manual" } as any);
    const cookie = verify.headers.get("set-cookie")!.split(";")[0];
    const me = await call("/api/auth/me", undefined, cookie);
    expect((await me.json() as any).user.favorites).toEqual([]);
  });
```

Run: `npx vitest run tests/worker/auth.test.ts`
Expected: PASS.

- [ ] **Step 17: Extend the client types + add `setFavoriteSpecies` in `src/react-app/api.ts`**

```ts
export type FavoriteDto = {
	speciesId: number;
	name: string;
	homeId: number | null;
};
```

```ts
export type UserDto = {
	id: string;
	email: string;
	displayName: string | null;
	gender: string | null;
	hasAvatar: boolean;
	favorites: FavoriteDto[];
};
```

```ts
/**
 * Replaces the signed-in user's top-3 favorite species (array order = display
 * order). Server validates each id is a real species, caps the list at 3, and
 * rejects duplicates — surfaced as `ApiValidationError` by `handleJson`.
 */
export async function setFavoriteSpecies(speciesIds: number[]): Promise<{ favorites: FavoriteDto[] }> {
	const res = await fetch("/api/profile/favorites", {
		method: "PUT",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ speciesIds }),
	});
	return handleJson<{ favorites: FavoriteDto[] }>(res, "set favorite species");
}
```

- [ ] **Step 18: Final verify + commit**

Run: `npx vitest run && npx tsc -b && npm run build`
Expected: full suite green, clean typecheck, successful build.

```bash
git add src/worker/profile/favorites-store.ts tests/worker/favorites-store.test.ts src/worker/routes/profile.ts src/worker/routes/auth.ts tests/worker/profile.test.ts tests/worker/auth.test.ts src/react-app/api.ts
git commit -m "feat(flex-P): top-3 favorite species (user_favorites table, PUT /api/profile/favorites, GET /api/auth/me)"
```

---

### Task P5: Required onboarding gate — `ProfileSetup` (name, gender, optional photo, optional top-3 favorites)

**Files:**
- Create: `src/react-app/profile/display.ts` (pure — gender options, initials fallback, avatar URL, `needsOnboarding`)
- Test: `tests/react-app/profileDisplay.test.ts`
- Create: `src/react-app/components/Avatar.tsx` (presentational; reused by P6/P7)
- Create: `src/react-app/components/ProfileFields.tsx` (name+gender+photo form pieces; reused by Task P6's Settings editor)
- Create: `src/react-app/components/FavoriteSpeciesPicker.tsx` (top-3 species picker; reused by Task P6)
- Create: `src/react-app/components/ProfileSetup.tsx` (the blocking onboarding screen)
- Modify: `src/react-app/App.tsx` (render `ProfileSetup` instead of the app when `needsOnboarding(user)`)
- Modify: `src/react-app/styles.css` (append `.avatar`, `.profile-fields`, `.profile-setup`, `.favorites-picker`, `.species-picker__item--picked`)
- Verify only (no component tests — see Global Constraints): `npx tsc -b` + `npm run build`

**Interfaces:**
- Produces: `GENDER_OPTIONS: {value: "boy"|"girl"|"ditto", label}[]`; `NAME_PLACEHOLDER = "Trainer"`; `avatarUrl(userId): string`; `initials(displayName: string|null): string`; `needsOnboarding(user: {displayName, gender} | null): boolean`.
- Consumes: `UserDto`-shaped `{displayName, gender}` (structural, not imported — see the BUILD-GATE note below); `updateProfile`, `uploadAvatar`, `setFavoriteSpecies`, `fetchSpecies` (`../api`, all already added in P2–P4).

- [ ] **Step 1: Write the failing pure-display tests**

Create `tests/react-app/profileDisplay.test.ts` (no import of `api.ts` — see the BUILD-GATE GOTCHA in this plan's Global Constraints; `tests/react-app/incentiveDisplay.test.ts` is the existing example of this pattern):

```ts
import { describe, expect, it } from "vitest";
import {
	GENDER_OPTIONS,
	NAME_PLACEHOLDER,
	avatarUrl,
	initials,
	needsOnboarding,
} from "../../src/react-app/profile/display";

describe("GENDER_OPTIONS", () => {
	it("is exactly Boy/Girl/Ditto, values lowercased", () => {
		expect(GENDER_OPTIONS.map((g) => g.value)).toEqual(["boy", "girl", "ditto"]);
		expect(GENDER_OPTIONS.map((g) => g.label)).toEqual(["Boy", "Girl", "Ditto"]);
	});
});

describe("NAME_PLACEHOLDER", () => {
	it("is a neutral placeholder, never derived from email", () => {
		expect(NAME_PLACEHOLDER).toBe("Trainer");
	});
});

describe("avatarUrl", () => {
	it("builds the profile avatar endpoint URL for a user id", () => {
		expect(avatarUrl("u1")).toBe("/api/profile/avatar/u1");
	});
});

describe("initials", () => {
	it("takes the first letter of the first and last word, uppercased", () => {
		expect(initials("Ash Ketchum")).toBe("AK");
	});
	it("takes just one letter for a single-word name", () => {
		expect(initials("Misty")).toBe("M");
	});
	it("collapses extra whitespace", () => {
		expect(initials("  Ash   Ketchum  ")).toBe("AK");
	});
	it("falls back to ? for null/empty/blank names", () => {
		expect(initials(null)).toBe("?");
		expect(initials("")).toBe("?");
		expect(initials("   ")).toBe("?");
	});
});

describe("needsOnboarding", () => {
	it("is false when signed out", () => {
		expect(needsOnboarding(null)).toBe(false);
	});
	it("is true when displayName or gender (or both) are missing", () => {
		expect(needsOnboarding({ displayName: null, gender: null })).toBe(true);
		expect(needsOnboarding({ displayName: "Ash", gender: null })).toBe(true);
		expect(needsOnboarding({ displayName: null, gender: "boy" })).toBe(true);
	});
	it("is false once both are set", () => {
		expect(needsOnboarding({ displayName: "Ash", gender: "boy" })).toBe(false);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/react-app/profileDisplay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/react-app/profile/display.ts`**

```ts
// src/react-app/profile/display.ts
//
// DOM-free helpers for the Trainer Profile UI (Flex Phase P): the gender
// option list, an initials fallback for the Avatar placeholder, the avatar
// image URL builder, and the onboarding-required predicate. No fetch, no
// DOM, no React — kept separate from components so it's unit-testable the
// same way src/react-app/ribbons/incentiveDisplay.ts is. Must never import
// api.ts or any component (see the BUILD-GATE GOTCHA in this plan's Global
// Constraints — tests/tsconfig.json has no DOM lib).

export const GENDER_OPTIONS: readonly { value: "boy" | "girl" | "ditto"; label: string }[] = [
	{ value: "boy", label: "Boy" },
	{ value: "girl", label: "Girl" },
	{ value: "ditto", label: "Ditto" },
];

/** Neutral placeholder for wherever a display name isn't available yet — never email. */
export const NAME_PLACEHOLDER = "Trainer";

/** Public avatar image URL for a user id (the server 404s if they have none — callers use `hasAvatar` to decide whether to render it). */
export function avatarUrl(userId: string): string {
	return `/api/profile/avatar/${userId}`;
}

/**
 * Up to 2 initials from a display name (e.g. "Ash Ketchum" -> "AK", "Ash" ->
 * "A"), uppercased. Falls back to "?" for a null/empty/blank name — never
 * derives initials from an email address.
 */
export function initials(displayName: string | null): string {
	if (!displayName) return "?";
	const parts = displayName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	const first = parts[0][0] ?? "";
	const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
	const combined = (first + last).toUpperCase();
	return combined === "" ? "?" : combined;
}

/**
 * True when a signed-in user must complete onboarding before using the rest
 * of the app: a display name AND a gender are both required. Photo is never
 * required — it plays no part in this check. `null` (signed out) never
 * needs onboarding, since there's no profile to complete yet.
 */
export function needsOnboarding(user: { displayName: string | null; gender: string | null } | null): boolean {
	return user !== null && (!user.displayName || !user.gender);
}
```

- [ ] **Step 4: Run to verify it passes, then typecheck**

Run: `npx vitest run tests/react-app/profileDisplay.test.ts && npx tsc -b`
Expected: PASS (11 tests); clean typecheck.

- [ ] **Step 5: Create `src/react-app/components/Avatar.tsx`**

```tsx
// src/react-app/components/Avatar.tsx
//
// The user's uploaded photo when `hasAvatar` is true, else an
// initials-in-a-circle placeholder derived from `displayName` — never from
// email. Purely presentational; used by AccountMenu, Home, Settings, and
// ProfileFields.

import { avatarUrl, initials } from "../profile/display";

type AvatarProps = {
	userId: string;
	displayName: string | null;
	hasAvatar: boolean;
	size?: "sm" | "md" | "lg";
};

export function Avatar({ userId, displayName, hasAvatar, size = "md" }: AvatarProps) {
	if (hasAvatar) {
		return (
			<img
				className={`avatar avatar--${size}`}
				src={avatarUrl(userId)}
				alt={displayName ? `${displayName}'s avatar` : "Trainer avatar"}
			/>
		);
	}
	return (
		<span className={`avatar avatar--${size} avatar--placeholder`} aria-hidden="true">
			{initials(displayName)}
		</span>
	);
}
```

- [ ] **Step 6: Create `src/react-app/components/ProfileFields.tsx`**

```tsx
// src/react-app/components/ProfileFields.tsx
//
// Shared trainer-name + gender + optional-photo form fields, used by both
// the blocking onboarding screen (ProfileSetup, Task P5) and the Settings
// profile editor (Task P6). `idPrefix` keeps label/input ids unique across
// the two mounting contexts (radio `name` groups too, so onboarding's
// gender radios never collide with Settings' if both existed in the same
// document — they don't today, but this keeps the component safe to reuse
// anywhere else later).

import { GENDER_OPTIONS } from "../profile/display";
import { Avatar } from "./Avatar";

export type Gender = "boy" | "girl" | "ditto";

export type ProfileFieldsProps = {
	idPrefix: string;
	displayName: string;
	onDisplayNameChange: (value: string) => void;
	gender: Gender | null;
	onGenderChange: (value: Gender) => void;
	userId: string;
	hasAvatar: boolean;
	/** Object URL for a freshly-picked (not yet uploaded) file; null shows the existing avatar/placeholder instead. */
	localPreviewUrl: string | null;
	onFileSelected: (file: File | null) => void;
};

export function ProfileFields({
	idPrefix,
	displayName,
	onDisplayNameChange,
	gender,
	onGenderChange,
	userId,
	hasAvatar,
	localPreviewUrl,
	onFileSelected,
}: ProfileFieldsProps) {
	return (
		<div className="profile-fields">
			<div className="profile-fields__row">
				<label className="field-label" htmlFor={`${idPrefix}-name`}>
					Trainer name
				</label>
				<input
					id={`${idPrefix}-name`}
					className="input input--full"
					value={displayName}
					maxLength={40}
					placeholder="e.g. Ash"
					onChange={(e) => onDisplayNameChange(e.target.value)}
				/>
			</div>

			<fieldset className="profile-fields__row">
				<legend className="field-label">Gender</legend>
				<div className="profile-fields__gender-options" role="radiogroup" aria-label="Gender">
					{GENDER_OPTIONS.map((opt) => (
						<label key={opt.value} className="profile-fields__gender-option">
							<input
								type="radio"
								name={`${idPrefix}-gender`}
								value={opt.value}
								checked={gender === opt.value}
								onChange={() => onGenderChange(opt.value)}
							/>
							{opt.label}
						</label>
					))}
				</div>
			</fieldset>

			<div className="profile-fields__row">
				<label className="field-label" htmlFor={`${idPrefix}-photo`}>
					Profile photo (optional)
				</label>
				<div className="profile-fields__photo-row">
					{localPreviewUrl ? (
						<img className="avatar avatar--md" src={localPreviewUrl} alt="Selected photo preview" />
					) : (
						<Avatar userId={userId} displayName={displayName || null} hasAvatar={hasAvatar} size="md" />
					)}
					<input
						id={`${idPrefix}-photo`}
						className="input"
						type="file"
						accept="image/png,image/jpeg,image/webp"
						onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
					/>
				</div>
			</div>
		</div>
	);
}
```

- [ ] **Step 7: Create `src/react-app/components/FavoriteSpeciesPicker.tsx`**

```tsx
// src/react-app/components/FavoriteSpeciesPicker.tsx
//
// Lets a user pick up to 3 favorite species for their trainer card. Modeled
// on both existing pickers: SpeciesPicker's debounced `fetchSpecies` search
// (favorites, unlike ribbons, aren't drawn from a fixed "earned" list — any
// species in the dex is eligible) and ShowcasePicker's toggle-and-save
// selection UX. Saves independently of the surrounding form (its own "Save
// favorites" button) since favorites are optional and unrelated to whether
// name+gender pass the onboarding gate.

import { useEffect, useState } from "react";
import { fetchSpecies, setFavoriteSpecies, type FavoriteDto, type SpeciesDto } from "../api";
import { Sprite } from "./Sprite";
import { formatDexNumber, formatName } from "../theme";

const MAX_FAVORITES = 3;

export function FavoriteSpeciesPicker({
	favorites,
	onSaved,
}: {
	favorites: FavoriteDto[];
	onSaved: (favorites: FavoriteDto[]) => void;
}) {
	const [selected, setSelected] = useState<FavoriteDto[]>(favorites);
	const [q, setQ] = useState("");
	const [results, setResults] = useState<SpeciesDto[]>([]);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setSelected(favorites);
	}, [favorites]);

	useEffect(() => {
		let cancelled = false;
		const t = setTimeout(() => {
			fetchSpecies({ q: q.trim() || undefined })
				.then((r) => {
					if (!cancelled) setResults(r.items.slice(0, 20));
				})
				.catch(() => {
					if (!cancelled) setResults([]);
				});
		}, 200);
		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [q]);

	function toggle(sp: SpeciesDto) {
		setError(null);
		setSelected((prev) => {
			if (prev.some((f) => f.speciesId === sp.id)) return prev.filter((f) => f.speciesId !== sp.id);
			if (prev.length >= MAX_FAVORITES) return prev; // full — ignore extra picks rather than silently evicting one
			return [...prev, { speciesId: sp.id, name: sp.name, homeId: sp.homeId }];
		});
	}

	async function save() {
		setSaving(true);
		setError(null);
		try {
			const result = await setFavoriteSpecies(selected.map((f) => f.speciesId));
			onSaved(result.favorites);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="favorites-picker">
			<div className="favorites-picker__header">
				<h2 className="ribbon-section__title">Top 3 favorites</h2>
				<span className="ribbon-section__count">
					{selected.length} / {MAX_FAVORITES}
				</span>
			</div>
			<p className="favorites-picker__hint">Optional — pin up to 3 species to show on your trainer card.</p>
			{error && (
				<p className="error-banner" role="alert">
					Error: {error}
				</p>
			)}
			{selected.length > 0 && (
				<div className="favorites-picker__selected">
					{selected.map((f) => (
						<button
							key={f.speciesId}
							type="button"
							className="favorites-picker__chip"
							onClick={() => setSelected((prev) => prev.filter((x) => x.speciesId !== f.speciesId))}
							aria-label={`Remove ${f.name} from favorites`}
						>
							<Sprite homeId={f.homeId ?? f.speciesId} alt={formatName(f.name)} />
							{formatName(f.name)} ✕
						</button>
					))}
				</div>
			)}
			<label className="field-label" htmlFor="favorites-picker-search">
				Search species
			</label>
			<input
				id="favorites-picker-search"
				className="input input--full"
				type="search"
				placeholder="e.g. Pikachu"
				value={q}
				onChange={(e) => setQ(e.target.value)}
			/>
			<div className="species-picker__list" role="listbox" aria-label="Species results">
				{results.map((sp) => {
					const picked = selected.some((f) => f.speciesId === sp.id);
					return (
						<button
							key={sp.id}
							type="button"
							className={`species-picker__item${picked ? " species-picker__item--picked" : ""}`}
							role="option"
							aria-selected={picked}
							onClick={() => toggle(sp)}
						>
							<Sprite homeId={sp.homeId ?? sp.id} alt={formatName(sp.name)} />
							<span className="species-picker__item-name">{formatName(sp.name)}</span>
							<span className="mono">{formatDexNumber(sp.id)}</span>
						</button>
					);
				})}
			</div>
			<button type="button" className="button button--primary" onClick={save} disabled={saving}>
				{saving ? "Saving…" : "Save favorites"}
			</button>
		</section>
	);
}
```

- [ ] **Step 8: Create `src/react-app/components/ProfileSetup.tsx`**

```tsx
// src/react-app/components/ProfileSetup.tsx
//
// Blocking onboarding screen: App.tsx renders this INSTEAD OF the rest of
// the app whenever needsOnboarding(user) is true (missing displayName or
// gender). Photo and top-3 favorites are optional and can be skipped here
// and added later from Settings. On save, calls useAuth().refresh() so
// App re-evaluates needsOnboarding against the freshly-fetched user and
// renders the real app.

import { useState } from "react";
import { updateProfile, uploadAvatar, type FavoriteDto } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { FavoriteSpeciesPicker } from "./FavoriteSpeciesPicker";
import { ProfileFields, type Gender } from "./ProfileFields";

export function ProfileSetup() {
	const { user, refresh } = useAuth();
	const [displayName, setDisplayName] = useState("");
	const [gender, setGender] = useState<Gender | null>(null);
	const [file, setFile] = useState<File | null>(null);
	const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
	const [favorites, setFavorites] = useState<FavoriteDto[]>(user?.favorites ?? []);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!user) return null; // App only renders ProfileSetup when a signed-in user exists

	function onFileSelected(f: File | null) {
		setFile(f);
		setLocalPreviewUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return f ? URL.createObjectURL(f) : null;
		});
	}

	async function handleSave() {
		setError(null);
		if (!displayName.trim() || !gender) {
			setError("A trainer name and a gender are both required.");
			return;
		}
		setSaving(true);
		try {
			await updateProfile({ displayName: displayName.trim(), gender });
			if (file) {
				try {
					await uploadAvatar(file);
				} catch {
					// Photo is optional — a failed upload never blocks completing onboarding.
				}
			}
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSaving(false);
		}
	}

	return (
		<div className="page container profile-setup">
			<h1 className="page__title">Welcome, Trainer!</h1>
			<p className="profile-setup__hint">
				Before you dive in, tell us a bit about yourself. Your name and gender are required; a photo and
				favorites are optional and can be added later from Settings too.
			</p>
			{error && (
				<p className="error-banner" role="alert">
					{error}
				</p>
			)}
			<ProfileFields
				idPrefix="onboarding"
				displayName={displayName}
				onDisplayNameChange={setDisplayName}
				gender={gender}
				onGenderChange={setGender}
				userId={user.id}
				hasAvatar={user.hasAvatar}
				localPreviewUrl={localPreviewUrl}
				onFileSelected={onFileSelected}
			/>
			<FavoriteSpeciesPicker favorites={favorites} onSaved={setFavorites} />
			<button type="button" className="button button--primary" onClick={handleSave} disabled={saving}>
				{saving ? "Saving…" : "Start exploring"}
			</button>
		</div>
	);
}
```

- [ ] **Step 9: Wire the gate into `src/react-app/App.tsx`**

Add the imports:

```ts
import { ProfileSetup } from "./components/ProfileSetup";
import { needsOnboarding } from "./profile/display";
```

At the top of the `App` component body, right after the existing `useState` calls, add the gate (before the `return`):

```tsx
	const { user, loading } = useAuth();

	if (!loading && needsOnboarding(user)) {
		return (
			<div className="app">
				<ProfileSetup />
			</div>
		);
	}
```

(`useAuth` needs importing too: `import { useAuth } from "./auth/AuthProvider";`.) This intentionally renders `ProfileSetup` **without** `TopBar`/`Footer` — no navigation escape hatch out of onboarding — matching "cannot use the rest of the app until name+gender are saved."

- [ ] **Step 10: Append CSS to `src/react-app/styles.css`**

```css
/* ---------- Avatar (Flex Phase P) ---------- */

.avatar {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: none;
	border-radius: 50%;
	object-fit: cover;
	background: var(--hairline);
	color: var(--ink);
	font-weight: 600;
	font-family: var(--font-display);
}

.avatar--sm {
	width: 28px;
	height: 28px;
	font-size: 0.7rem;
}

.avatar--md {
	width: 48px;
	height: 48px;
	font-size: 1rem;
}

.avatar--lg {
	width: 96px;
	height: 96px;
	font-size: 1.75rem;
}

/* ---------- Profile fields (onboarding + Settings) ---------- */

.profile-fields__row {
	margin-bottom: 1.25rem;
}

.profile-fields__gender-options {
	display: flex;
	gap: 0.75rem;
}

.profile-fields__gender-option {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	font-size: 0.9rem;
}

.profile-fields__photo-row {
	display: flex;
	align-items: center;
	gap: 1rem;
}

.profile-setup {
	max-width: 480px;
	margin: 0 auto;
	padding-top: 2rem;
}

.profile-setup__hint {
	color: var(--muted);
	margin-bottom: 1.5rem;
}

/* ---------- Favorites picker ---------- */

.favorites-picker__header {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
}

.favorites-picker__hint {
	color: var(--muted);
	font-size: 0.85rem;
	margin-bottom: 0.75rem;
}

.favorites-picker__selected {
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
	margin: 0.75rem 0;
}

.favorites-picker__chip {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	background: var(--surface);
	border: 1px solid var(--hairline);
	border-radius: var(--radius-control);
	padding: 4px 10px;
	font-size: 0.85rem;
}

.species-picker__item--picked {
	outline: 2px solid var(--ink);
	outline-offset: -2px;
}
```

- [ ] **Step 11: Verify + commit**

Run: `npx vitest run tests/react-app/profileDisplay.test.ts && npx tsc -b && npm run build`
Expected: all green — in particular `npm run build` confirms `App.tsx`, `ProfileSetup.tsx`, `ProfileFields.tsx`, `FavoriteSpeciesPicker.tsx`, and `Avatar.tsx` all compile and bundle cleanly. No component test is added (no harness exists in this repo — see Global Constraints); this is verified by build success only, same as `Ribbons.tsx`/`Home.tsx`.

```bash
git add src/react-app/profile/display.ts tests/react-app/profileDisplay.test.ts src/react-app/components/Avatar.tsx src/react-app/components/ProfileFields.tsx src/react-app/components/FavoriteSpeciesPicker.tsx src/react-app/components/ProfileSetup.tsx src/react-app/App.tsx src/react-app/styles.css
git commit -m "feat(flex-P): required onboarding gate (ProfileSetup: name, gender, optional photo + favorites)"
```

---

### Task P6: Settings profile editor (reuse `ProfileFields` + `FavoriteSpeciesPicker`)

**Files:**
- Modify: `src/react-app/pages/Settings.tsx` (add a "Profile" section + the favorites picker, above the existing "Account"/"Delete account" sections)
- Verify only: `npx tsc -b` + `npm run build` (no component-test harness — see Global Constraints)

**Interfaces:**
- Consumes: `ProfileFields`, `FavoriteSpeciesPicker` (Task P5); `updateProfile`, `uploadAvatar` (Task P2/P3); `useAuth().refresh` (existing).

- [ ] **Step 1: Rewrite `src/react-app/pages/Settings.tsx`**

```tsx
// src/react-app/pages/Settings.tsx
//
// Signed-in-only settings view: profile editing (name/gender/photo/top-3
// favorites — Flex Phase P), the account email + sign-out, and a
// destructive delete-account flow gated behind a typed "delete"
// confirmation.

import { useState } from "react";
import { authDeleteAccount, updateProfile, uploadAvatar } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { FavoriteSpeciesPicker } from "../components/FavoriteSpeciesPicker";
import { ProfileFields, type Gender } from "../components/ProfileFields";

type SettingsProps = {
	onBack: () => void;
};

const CONFIRM_WORD = "delete";

export function Settings({ onBack }: SettingsProps) {
	const { user, logout, refresh } = useAuth();
	const [confirmText, setConfirmText] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Profile-editing local state, seeded from the current user (both are
	// guaranteed non-null past onboarding, but Settings still guards below).
	const [displayName, setDisplayName] = useState(user?.displayName ?? "");
	const [gender, setGender] = useState<Gender | null>((user?.gender as Gender | null) ?? null);
	const [file, setFile] = useState<File | null>(null);
	const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
	const [savingProfile, setSavingProfile] = useState(false);
	const [profileError, setProfileError] = useState<string | null>(null);
	const [profileSaved, setProfileSaved] = useState(false);

	if (!user) {
		return (
			<div className="page container">
				<div className="state">
					<p className="state__title">You're signed out</p>
					<button type="button" className="button" onClick={onBack}>
						Back
					</button>
				</div>
			</div>
		);
	}

	function onFileSelected(f: File | null) {
		setFile(f);
		setLocalPreviewUrl((prev) => {
			if (prev) URL.revokeObjectURL(prev);
			return f ? URL.createObjectURL(f) : null;
		});
	}

	async function handleSaveProfile() {
		setProfileError(null);
		setProfileSaved(false);
		if (!displayName.trim() || !gender) {
			setProfileError("A trainer name and a gender are both required.");
			return;
		}
		setSavingProfile(true);
		try {
			await updateProfile({ displayName: displayName.trim(), gender });
			if (file) await uploadAvatar(file);
			await refresh();
			setFile(null);
			setLocalPreviewUrl(null);
			setProfileSaved(true);
		} catch (err) {
			setProfileError(err instanceof Error ? err.message : String(err));
		} finally {
			setSavingProfile(false);
		}
	}

	async function handleSignOut() {
		await logout();
		onBack();
	}

	async function handleDelete() {
		setError(null);
		setDeleting(true);
		try {
			await authDeleteAccount();
			await refresh();
			onBack();
		} catch {
			setError("Couldn't delete your account. Please try again.");
			setDeleting(false);
		}
	}

	return (
		<div className="page container settings-page">
			<div className="page__meta">
				<button type="button" className="button" onClick={onBack}>
					← Back
				</button>
			</div>
			<h1 className="page__title">Settings</h1>

			<section className="settings-section">
				<h2 className="settings-section__title">Profile</h2>
				{profileError && (
					<p className="error-banner" role="alert">
						{profileError}
					</p>
				)}
				<ProfileFields
					idPrefix="settings"
					displayName={displayName}
					onDisplayNameChange={(v) => {
						setDisplayName(v);
						setProfileSaved(false);
					}}
					gender={gender}
					onGenderChange={(v) => {
						setGender(v);
						setProfileSaved(false);
					}}
					userId={user.id}
					hasAvatar={user.hasAvatar}
					localPreviewUrl={localPreviewUrl}
					onFileSelected={onFileSelected}
				/>
				<button
					type="button"
					className="button button--primary"
					onClick={handleSaveProfile}
					disabled={savingProfile}
				>
					{savingProfile ? "Saving…" : profileSaved ? "Saved" : "Save profile"}
				</button>
			</section>

			<FavoriteSpeciesPicker favorites={user.favorites} onSaved={() => void refresh()} />

			<section className="settings-section">
				<h2 className="settings-section__title">Account</h2>
				<p className="settings-section__row">
					<span className="field-label">Email</span>
					<span>{user.email}</span>
				</p>
				<button type="button" className="button" onClick={handleSignOut}>
					Sign out
				</button>
			</section>

			<section className="settings-section settings-section--danger">
				<h2 className="settings-section__title">Delete account</h2>
				<p className="settings-section__hint">
					This permanently deletes your account, boxes, specimens, and import history. This
					cannot be undone.
				</p>
				<label className="field-label" htmlFor="confirm-delete">
					Type "{CONFIRM_WORD}" to confirm
				</label>
				<input
					id="confirm-delete"
					className="input input--full"
					value={confirmText}
					onChange={(e) => setConfirmText(e.target.value)}
					placeholder={CONFIRM_WORD}
				/>
				{error && (
					<p className="error-banner" role="alert">
						{error}
					</p>
				)}
				<button
					type="button"
					className="button button--danger"
					disabled={confirmText.trim().toLowerCase() !== CONFIRM_WORD || deleting}
					onClick={handleDelete}
				>
					{deleting ? "Deleting…" : "Delete account"}
				</button>
			</section>
		</div>
	);
}
```

(`FavoriteSpeciesPicker`'s `onSaved` prop is typed `(favorites: FavoriteDto[]) => void`; `() => void refresh()` structurally satisfies that — TS allows a callback with fewer parameters than the declared type. Re-running `refresh()` re-fetches `/api/auth/me`, which updates `user.favorites` through `AuthProvider`, so the picker's own `useEffect(() => setSelected(favorites), [favorites])` re-syncs from the new prop — no separate local-favorites state needed in `Settings`.)

- [ ] **Step 2: Verify + commit**

Run: `npx tsc -b && npm run build`
Expected: clean typecheck, successful build. No behavior test exists for this page today (`Settings.tsx` had none before this task either) — verified by build success only, per the Global Constraints.

```bash
git add src/react-app/pages/Settings.tsx
git commit -m "feat(flex-P): Settings profile editor (name/gender/photo/favorites)"
```

---

### Task P7: Display wiring — `TopBar`/`AccountMenu`/`Home` show avatar + display name (never email); favorites on the trainer card

**Files:**
- Modify: `src/react-app/components/AccountMenu.tsx` (trigger shows `Avatar` + `displayName ?? NAME_PLACEHOLDER`, never email)
- Modify: `src/react-app/pages/Home.tsx` (hero shows `Avatar` + `displayName ?? NAME_PLACEHOLDER`; renders `FavoritesStrip`)
- Create: `src/react-app/components/FavoritesStrip.tsx` (read-only top-3 favorites display — the "trainer card")
- Modify: `src/react-app/styles.css` (append `.hero__identity`, `.favorites-strip`; adjust `.account-menu__trigger` to a flex row + add `.account-menu__label`)
- Verify only: `npx tsc -b` + `npm run build`

**Interfaces:**
- Consumes: `Avatar` (Task P5), `avatarUrl`/`NAME_PLACEHOLDER` (`../profile/display`, Task P5), `UserDto.favorites` (Task P4).

- [ ] **Step 1: Update `src/react-app/components/AccountMenu.tsx`**

Update the file header comment and the signed-in trigger button:

```tsx
// src/react-app/components/AccountMenu.tsx
//
// Lives in the TopBar's control cluster. Signed-out renders a "Sign in"
// button that opens the SignInPanel modal. Signed-in renders a button
// showing the user's avatar + display name (never email — see
// src/react-app/profile/display.ts's NAME_PLACEHOLDER), which opens a menu
// with links to Collection/Ribbons/Import-Export/Settings and Sign out.
```

Add the imports:

```ts
import { Avatar } from "./Avatar";
import { NAME_PLACEHOLDER } from "../profile/display";
```

Replace the trigger button's contents:

```tsx
			<button
				ref={buttonRef}
				type="button"
				className="button account-menu__trigger"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onClick={() => setMenuOpen((open) => !open)}
			>
				<Avatar userId={user.id} displayName={user.displayName} hasAvatar={user.hasAvatar} size="sm" />
				<span className="account-menu__label">{user.displayName ?? NAME_PLACEHOLDER}</span>
			</button>
```

- [ ] **Step 2: Update `src/react-app/pages/Home.tsx`**

Add the imports:

```ts
import { Avatar } from "../components/Avatar";
import { FavoritesStrip } from "../components/FavoritesStrip";
import { NAME_PLACEHOLDER } from "../profile/display";
```

Replace the signed-in hero block:

```tsx
					<div className="hero__welcome">
						<div className="hero__identity">
							<Avatar userId={user.id} displayName={user.displayName} hasAvatar={user.hasAvatar} size="lg" />
							<div>
								<p className="hero__eyebrow">Welcome back</p>
								<h1 className="hero__title hero__title--slim">{user.displayName ?? NAME_PLACEHOLDER}</h1>
							</div>
						</div>
						<RankBadge trainerScore={trainerScore} rank={rank} size="sm" />
						<div className="hero__actions">
							<button
								type="button"
								className="button button--primary"
								onClick={() => onNavigate("collection")}
							>
								My Collection
							</button>
							<button type="button" className="button" onClick={() => onNavigate("ribbons")}>
								Ribbons
							</button>
						</div>
					</div>
```

Add `FavoritesStrip` right after the `hero` section (before `{user && <TrophyWall .../>}`):

```tsx
				</section>
				{user && <FavoritesStrip favorites={user.favorites} />}
				{user && <TrophyWall showcase={showcase} ribbons={ribbons} />}
```

- [ ] **Step 3: Create `src/react-app/components/FavoritesStrip.tsx`**

```tsx
// src/react-app/components/FavoritesStrip.tsx
//
// Read-only display of a user's top-3 favorite species (set via
// FavoriteSpeciesPicker in ProfileSetup/Settings) — the "trainer card"
// strip on the signed-in Home dashboard. Renders nothing if the user
// hasn't picked any favorites (they're entirely optional, not a required
// part of onboarding).

import type { FavoriteDto } from "../api";
import { Sprite } from "./Sprite";
import { formatName } from "../theme";

export function FavoritesStrip({ favorites }: { favorites: FavoriteDto[] }) {
	if (favorites.length === 0) return null;
	return (
		<section className="favorites-strip" aria-label="Favorite Pokémon">
			<h2 className="favorites-strip__title">Favorites</h2>
			<div className="favorites-strip__list">
				{favorites.map((f) => (
					<div key={f.speciesId} className="favorites-strip__item">
						<Sprite homeId={f.homeId ?? f.speciesId} alt={formatName(f.name)} />
						<span className="favorites-strip__name">{formatName(f.name)}</span>
					</div>
				))}
			</div>
		</section>
	);
}
```

- [ ] **Step 4: Update `src/react-app/styles.css`**

Change the existing `.account-menu__trigger` rule to a flex row and add a label class (keep the rule name, just replace its body):

```css
.account-menu__trigger {
	display: flex;
	align-items: center;
	gap: 8px;
	max-width: 220px;
}

.account-menu__label {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}
```

Append:

```css
/* ---------- Home hero identity + favorites strip ---------- */

.hero__identity {
	display: flex;
	align-items: center;
	gap: 1rem;
	margin-bottom: 0.5rem;
}

.favorites-strip {
	margin: 1.5rem 0;
}

.favorites-strip__title {
	font-size: 1rem;
	color: var(--muted);
	margin-bottom: 0.75rem;
}

.favorites-strip__list {
	display: flex;
	gap: 1.5rem;
	flex-wrap: wrap;
}

.favorites-strip__item {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.25rem;
	font-size: 0.85rem;
}
```

- [ ] **Step 5: Final verify + commit**

Run: `npx vitest run && npx tsc -b && npm run build`
Expected: full suite green (nothing in this task adds new test files — `AccountMenu.tsx`/`Home.tsx` have no existing component tests to update, consistent with the Global Constraints), clean typecheck, successful build.

Manually confirm (by reading the rendered JSX, since no dev server is started per the Global Constraints — visual review happens separately) that **no code path in `AccountMenu.tsx` or `Home.tsx` still references `user.email`** as a display fallback; the only remaining `user.email` reference in the whole `src/react-app` tree should be `Settings.tsx`'s "Account" section.

```bash
git add src/react-app/components/AccountMenu.tsx src/react-app/pages/Home.tsx src/react-app/components/FavoritesStrip.tsx src/react-app/styles.css
git commit -m "feat(flex-P): TopBar/AccountMenu/Home show avatar+displayName (never email); favorites strip"
```

---

## Self-Review

**Spec coverage:**

| Spec item | Task | Status |
| --- | --- | --- |
| Stop showing email as the display name anywhere public | P5 (gate ensures displayName always set past onboarding), P7 (AccountMenu/Home swapped to `displayName ?? NAME_PLACEHOLDER`) | ✓ — only remaining `user.email` reference in `src/react-app` is Settings' Account section (login identity, explicitly allowed) |
| Collect name, gender, photo | P1 (schema), P2 (name+gender endpoint), P3 (photo endpoint) | ✓ |
| Gender = exactly Boy/Girl/Ditto, stored lowercased, validated | P2 (`GENDERS`, `validateProfileInput`) | ✓ |
| Required onboarding: blocks the app until name+gender set; photo optional | P5 (`needsOnboarding`, `ProfileSetup`, `App.tsx` gate) | ✓ |
| `users.displayName` reused as-is; add gender + avatar ref | P1 (`gender`, `avatar_key` columns) | ✓ |
| Never leak email via new profile endpoints | P3 (`GET /api/profile/avatar/:userId` returns only image bytes or a fixed `{error}` 404 — Task P3 test asserts the 404 shape, and the route has no code path that touches `email`) | ✓ |
| Migration via `drizzle-kit generate`, no hand-written SQL | P1 (0007: `gender`/`avatar_key`), P4 (0008: `user_favorites`) | ✓ — two migrations, since P1's `users`-table change and P4's new table are independent concerns (see P4's data-model write-up) |
| `GET /api/auth/me` extended with displayName/gender/avatar info | P1 (`gender`, `hasAvatar`), P4 (`favorites`) | ✓ |
| `PUT /api/profile` (name+gender), auth-scoped, validated | P2 | ✓ |
| Avatar upload/serve, R2, size/type guard, photo optional | P3 (`POST /api/profile/avatar`, `GET /api/profile/avatar/:userId`) | ✓ |
| `api.ts` client wrappers (`updateProfile`, `uploadAvatar`) + extended user type | P2, P3 | ✓ |
| Required onboarding gate component | P5 | ✓ |
| Settings profile editor | P6 | ✓ |
| Display wiring (TopBar/AccountMenu/Home) | P7 | ✓ |
| **New requirement:** Top-3 favorite Pokémon, selectable, shown on trainer card + (later, Phase F) public profile | P4 (schema/store/endpoint/`/me`), P5 (picker in onboarding), P6 (picker in Settings), P7 (`FavoritesStrip` on Home) | ✓ — Phase F's public-profile rendering of these same favorites is out of scope here (no `/u/:handle` route exists yet); this phase only guarantees the *data* (`user_favorites`, enriched in `/me`) and the *authenticated* display surface exist, ready for Phase F to read |
| Custom profile URL/handle | *(not in this phase — Phase F, explicitly out of scope per the task)* | — |

**Tables/columns added:** `users.gender` (text, nullable), `users.avatar_key` (text, nullable) — Task P1, migration `0007`. `user_favorites` (`id`, `user_id` FK→`users.id`, `species_id` FK→`species.id`, `slot`; unique on `(user_id, slot)` and `(user_id, species_id)`) — Task P4, migration `0008`.

**Endpoints added:** `PUT /api/profile` (name+gender), `POST /api/profile/avatar` (multipart upload), `GET /api/profile/avatar/:userId` (public image serve), `PUT /api/profile/favorites` (top-3 species). `GET /api/auth/me` extended (not new) with `gender`, `hasAvatar`, `favorites`.

**R2 approach:** reuse the existing `SPRITES` bucket binding (the only `r2_buckets` entry in `wrangler.jsonc`, already used by `routes/sprites.ts` and `routes/photo-import.ts`) under a new `avatars/{userId}` deterministic key prefix — no new bucket binding. Rationale spelled out in Task P3: one small object per user doesn't need bucket-level isolation, and a second binding means provisioning/binding a second bucket everywhere this repo runs (local `.wrangler` state, CI, deploy) for no real benefit. The deterministic (non-random) key means re-uploads overwrite in place, so Task P3 also adds a best-effort R2 delete of that key on `DELETE /api/auth/account` to avoid an orphaned object outliving the user.

**Favorites data model:** a `user_favorites` table (`userId`, `speciesId`, `slot`), directly mirroring Phase D's `user_showcase` (`userId`, `ribbonId`, `slot`) rather than three nullable `favSpecies1/2/3` columns on `users` — see Task P4's write-up for the four-point justification (real FK to `species`, atomic wholesale-replace semantics, DB-enforced dedupe/cap via the two unique indexes, and keeping `users` from accumulating unrelated concerns). `getFavorites`/`setFavorites` in `src/worker/profile/favorites-store.ts` are near-verbatim structural twins of `getShowcase`/`setShowcase`; `getFavoritesEnriched` is the one addition beyond that pattern (joins against `species` for display, since unlike ribbons — which are computed catalog data already available client-side — species names/sprites live only in the DB).

**Placeholder scan:** none — every step carries complete, runnable code and exact verification commands. Two deliberately-approximate migration indices (`0007` for Task P1, `0008` for Task P4) are explicitly flagged as "confirm against `migrations/meta/_journal.json` at execution time" rather than hard assumptions, matching how Phase D's plan handled the same uncertainty.

**Type consistency:**
- `CurrentUser` (`src/worker/auth/current-user.ts`) stays intentionally lean (`id, email, displayName, gender, hasAvatar`) — it's resolved on *every* authenticated request across the whole app (collection, boxes, ribbons, profile, etc. all call `requireUser`/`getCurrentUser`). `favorites` is deliberately **not** added there; it's only ever attached in the `GET /api/auth/me` route handler itself (one extra query, once per session hydration), so no other route pays for a favorites lookup it never needed.
- `Gender` (`"boy" | "girl" | "ditto"`) is defined once server-side (`src/worker/profile/validate.ts`) and once client-side (`src/react-app/components/ProfileFields.tsx`, re-exported for `ProfileSetup.tsx`/`Settings.tsx`) as a literal union — not shared across the worker/client boundary (the two sides don't share a build target), but kept textually identical and cross-referenced in comments so a future edit to one is easy to spot needing the other.
- `Settings.tsx` casts `user.gender as Gender | null` once, at the single point where a `string | null` (the wire type) needs to become the literal union for `ProfileFields`. This is safe in practice (the server only ever writes one of the three values) but is a cast, not a proof — flagged as risk 4 below.
- `RibbonDto`-style additive-only discipline is mirrored for `UserDto`: `gender`, `hasAvatar`, `favorites` are all **added** fields; no existing `UserDto` consumer (there were none before this phase touching it beyond `AuthProvider`/`AccountMenu`/`Home`/`Settings`, all updated in-plan) breaks.
- `FavoriteSpeciesPicker`'s `onSaved: (favorites: FavoriteDto[]) => void` is called with the server's authoritative enriched list after a save (never the picker's own optimistic `selected` state) — same "trust the server's response, not local state" posture as `ShowcasePicker`.

**Determinism / idempotency:**
- `setFavorites`/`setShowcase`-style "delete then insert" is not transactional (same house-style tradeoff already accepted and documented in Phase D's Self-Review risk 4) — a crash mid-write leaves favorites empty, not corrupted, and is trivially re-settable.
- The avatar R2 key is deterministic (`avatars/{userId}`), so `POST /api/profile/avatar` is naturally idempotent-on-replace: no accumulation of orphaned objects from repeated uploads, verified by Task P3's "re-uploading replaces" test.
- `needsOnboarding` is a pure function of `{displayName, gender}` only — recomputed fresh on every `App` render from whatever `AuthProvider` currently holds, so there's no stale cached "onboarded" flag that could get out of sync with the server.

**Risks / open questions:**
1. **No "remove photo" endpoint.** `POST /api/profile/avatar` uploads/replaces; there's no way to clear `avatarKey` back to `null` short of a support request. Scoped out deliberately (photo is additive and optional; removing one is a smaller, separable follow-up) but flagged here since a user who regrets a photo choice has no self-serve undo yet.
2. **Avatar cache-control (`max-age=60`) is a short-but-nonzero window**, so a just-replaced photo can still show briefly (up to 60s) from a browser/CDN cache before the new one appears. Chosen over `immutable` (wrong, since the key is mutable) and over `no-store` (would make every avatar render a full network round-trip); 60s is a judgment call, not derived from a hard requirement.
3. **`hasAvatar`/hand-cast `Gender`.** `Settings.tsx`'s `user.gender as Gender | null` cast (see Type Consistency above) would silently pass through a hypothetical future bad value rather than erroring at compile time — low risk today since only `validateProfileInput` (Task P2) ever writes `gender`, but worth a second look if this schema is ever written from a second code path (e.g. an admin tool).
4. **Total favorite/onboarding load on `getCurrentUser`.** Deliberately did *not* add `favorites` to the hot-path `getCurrentUser`/`CurrentUser` (see Type Consistency) to avoid an extra query on every authenticated request; the tradeoff is that any *other* future route that wants a user's favorites must call `getFavoritesEnriched` itself rather than getting it "for free" off `requireUser` — acceptable, since only `/api/auth/me` needs it today.
5. **`FavoriteSpeciesPicker` search results are capped at 20** (mirroring `SpeciesPicker`'s cap of 30) and re-query on every keystroke after a 200 ms debounce — fine for this app's ~1000-species catalog, not virtualized/paginated, consistent with the existing `SpeciesPicker`'s same tradeoff.
6. **Onboarding's `ProfileSetup` renders without `TopBar`/`Footer`** (no navigation escape hatch), which also means no theme toggle or sign-out button are reachable from that screen — a user who signs in with the wrong account has to close the tab / clear cookies to escape rather than using an in-app "sign out." Deliberate (matches "cannot use the rest of the app until saved"), but worth a UX pass in a later phase if this friction proves annoying in practice.
7. **R2 binding availability locally/in CI.** No new binding is introduced (reuses `SPRITES`, already exercised by `tests/worker/sprites.test.ts` and `tests/worker/photo-import.test.ts` today), so this phase carries no *new* local-simulator risk — flagged only to confirm the existing assumption still holds, not because anything here changes it.
8. **Photo size/type validation is enforced server-side only** (`ALLOWED_AVATAR_TYPES`, `MAX_AVATAR_BYTES` in `routes/profile.ts`) — `ProfileFields`' `<input type="file" accept="...">` is a UX hint, not a guarantee (a user can still pick a 10 MB PNG and see the 400 only after choosing "Save"). Matches how `photo-import.ts`/`save-import.ts` already behave in this codebase (no client-side pre-validation there either), so this is consistent house style, not a regression.

