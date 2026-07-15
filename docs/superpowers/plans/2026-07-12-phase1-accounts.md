# PokeDexFlex Phase 1 — Accounts + Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add passwordless (magic-link, dev-friendly) user accounts with sessions, a sign-in / account / settings UI, login-required mutation middleware, and a homepage intro/hero.

**Architecture:** New D1 tables (`login_tokens`, `sessions`; `users.display_name`) via drizzle-kit. Auth logic in small worker modules (`auth/tokens.ts`, `auth/session.ts`, `auth/email.ts`, `auth/current-user.ts`) behind a Hono `auth.ts` route group. Signed session cookie via `hono/cookie` `setSignedCookie`/`getSignedCookie` (HMAC) carrying a `sessions` row id. React gets an `AuthProvider` context, a sign-in panel, an account menu, a Settings page, and a Home hero — all reusing the existing design system.

**Tech Stack:** Cloudflare Workers, D1, Drizzle, Hono (+ `hono/cookie`), Web Crypto (`crypto.subtle`, `crypto.getRandomValues`); Vite/React/TS; Vitest + @cloudflare/vitest-pool-workers.

## Global Constraints

- Cloudflare Workers runtime — no Node-only APIs in Worker code (use Web Crypto, not `node:crypto`). TS strict; typecheck of record `tsc -b`.
- D1 schema changes via drizzle-kit migrations only. Local-only (no deploy); miniflare/local D1; tests apply migrations automatically.
- Secrets via env: `SESSION_SECRET` from `c.env` (set in gitignored `.dev.vars`; NEVER committed). No secret in client code.
- Dev email delivery = **DevEmailSender** (returns/logs the link; no external email). Real provider is deploy-time only, not required locally.
- Session cookie: `httpOnly`, `SameSite=Lax`, `Path=/`, signed. Token TTL ~15 min; session TTL ~30 days.
- Browsing stays public; only mutations are login-required. Reuse the existing design system + components (one visual language).
- Use the generated global `Env` type for bindings; extend it (via `wrangler types` / worker-configuration) with `SESSION_SECRET`.

---

## File Structure

```
.dev.vars                              # add SESSION_SECRET (gitignored)
src/db/schema/user.ts                  # add loginTokens, sessions tables; users.displayName
src/worker/auth/tokens.ts              # random token + SHA-256 hash helpers
src/worker/auth/session.ts             # create/verify session rows; cookie name const
src/worker/auth/email.ts               # EmailSender interface + DevEmailSender + factory
src/worker/auth/current-user.ts        # getCurrentUser(c), requireUser(c)
src/worker/routes/auth.ts              # /api/auth/* routes
src/worker/index.ts                    # mount auth routes
src/react-app/auth/AuthProvider.tsx    # context: user, requestLink, verify, logout, refresh
src/react-app/components/SignInPanel.tsx
src/react-app/components/AccountMenu.tsx     # in TopBar
src/react-app/pages/Settings.tsx
src/react-app/pages/Home.tsx           # hero/intro
src/react-app/App.tsx                  # wire AuthProvider + Home hero + views
tests/worker/auth.test.ts
tests/db/schema.test.ts                # new tables round-trip
```

---

### Task 1: Auth schema (login_tokens, sessions, users.display_name)

**Files:** Modify `src/db/schema/user.ts`; Test `tests/db/schema.test.ts`; new migration.

**Interfaces (Produces):**
- `users.displayName` (text, nullable) added.
- `loginTokens` — `id` (text PK), `tokenHash` (text, not null), `email` (text, not null), `expiresAt` (int epoch ms), `usedAt` (int, nullable), `createdAt` (int).
- `sessions` — `id` (text PK), `userId` (text FK→users.id), `expiresAt` (int), `createdAt` (int).

- [ ] **Step 1: failing test** — in `tests/db/schema.test.ts`, insert a user (with displayName), a loginTokens row, and a sessions row (FK to user); read back and assert fields. Run `npx vitest run tests/db/schema.test.ts` → FAIL.
- [ ] **Step 2:** Add the two tables + `displayName` column to `user.ts` (mirror existing Drizzle style; sessions.userId `.references(() => users.id)`). `export *` already re-exports.
- [ ] **Step 3:** `npx drizzle-kit generate` (new migration); `npx tsc -b` → 0; run the test → PASS; full suite → pass.
- [ ] **Step 4: commit** `feat: add auth schema (login_tokens, sessions, display_name)`.

---

### Task 2: Token + session + email helpers

**Files:** Create `src/worker/auth/tokens.ts`, `src/worker/auth/session.ts`, `src/worker/auth/email.ts`; Test `tests/worker/auth.test.ts`.

**Interfaces (Produces):**
- `tokens.ts`: `generateToken(): string` (32 random bytes hex via `crypto.getRandomValues`); `hashToken(token: string): Promise<string>` (SHA-256 hex via `crypto.subtle.digest`).
- `session.ts`: `SESSION_COOKIE = "pfd_session"`; `createSession(db, userId): Promise<string>` (inserts a sessions row with a random id + 30-day expiry, returns id); `getSession(db, id): Promise<{userId} | null>` (row exists and not expired); `deleteSession(db, id): Promise<void>`.
- `email.ts`: `interface EmailSender { sendLoginLink(email: string, link: string): Promise<{ devLink?: string }> }`; `class DevEmailSender implements EmailSender` (logs, returns `{ devLink: link }`); `getEmailSender(env): EmailSender` (returns DevEmailSender unless a real provider env var is set — real sender may be a stub for now).

- [ ] **Step 1: failing tests** in `tests/worker/auth.test.ts`:

```ts
import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "../../src/worker/auth/tokens";
import { createSession, getSession, deleteSession } from "../../src/worker/auth/session";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";

describe("auth helpers", () => {
  it("token is random hex and hash is stable", async () => {
    const a = generateToken(), b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/); expect(a).not.toBe(b);
    expect(await hashToken(a)).toBe(await hashToken(a));
    expect(await hashToken(a)).not.toBe(await hashToken(b));
  });
  it("session lifecycle", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "u1", email: "a@b.com", createdAt: 1 });
    const sid = await createSession(db, "u1");
    expect((await getSession(db, sid))?.userId).toBe("u1");
    await deleteSession(db, sid);
    expect(await getSession(db, sid)).toBeNull();
  });
});
```

- [ ] **Step 2:** run → FAIL. **Step 3:** implement the three modules (Web Crypto only; `createSession` uses `generateToken()` for the id; expiry = a passed-in `now` or `Date.now()` — accept an optional `nowMs` param so tests are deterministic, defaulting to `Date.now()`). **Step 4:** run → PASS; `tsc -b` → 0. **Step 5: commit** `feat: auth token/session/email helpers`.

---

### Task 3: Auth routes + current-user + require-auth middleware

**Files:** Create `src/worker/auth/current-user.ts`, `src/worker/routes/auth.ts`; Modify `src/worker/index.ts`; Test `tests/worker/auth.test.ts` (add).

**Interfaces:**
- Consumes: Task 2 helpers; `users` table; `hono/cookie` `setSignedCookie`/`getSignedCookie`/`deleteCookie`.
- Produces: `getCurrentUser(c): Promise<{id,email,displayName}|null>` (reads signed `pfd_session` cookie with `c.env.SESSION_SECRET`, looks up session→user). `requireUser(c)` → user or `throw` an `HTTPException(401)`.
- Routes under `/api/auth`:
  - `POST /request-link` `{email}` → creates loginTokens row (hashed), builds link `${origin}/api/auth/verify?token=${raw}`, calls the email sender; returns `{ ok: true, devLink? }` (devLink present with DevEmailSender).
  - `GET /verify?token` → hash, find unused unexpired token, mark used, find-or-create user by email, `createSession`, `setSignedCookie`, redirect (302) to `/`.
  - `POST /logout` → read cookie, deleteSession, deleteCookie, `{ ok: true }`.
  - `GET /me` → `{ user: {...} | null }`.
  - `DELETE /account` → requireUser; delete user's specimens, boxes, sessions, then the user; deleteCookie; `{ ok: true }`.

- [ ] **Step 1: failing test** (full magic-link flow, no real email):

```ts
// add to tests/worker/auth.test.ts
import worker from "../../src/worker/index";
const call = async (path: string, init?: RequestInit, cookie?: string) => {
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers); if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx); return res;
};
it("magic-link flow issues a session and /me returns the user", async () => {
  const r1 = await call("/api/auth/request-link", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email: "new@x.com" }) });
  const { devLink } = await r1.json() as any;
  expect(devLink).toContain("/api/auth/verify?token=");
  const verify = await call(new URL(devLink).pathname + new URL(devLink).search, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  expect(setCookie).toContain("pfd_session=");
  const cookie = setCookie.split(";")[0];
  const me = await call("/api/auth/me", undefined, cookie);
  expect((await me.json() as any).user.email).toBe("new@x.com");
});
it("/me is null without a cookie", async () => {
  expect((await (await call("/api/auth/me")).json() as any).user).toBeNull();
});
```

(imports `createExecutionContext`, `waitOnExecutionContext` from `cloudflare:test`.)

- [ ] **Step 2:** run → FAIL. **Step 3:** implement current-user + routes; mount `app.route("/api/auth", authRoutes)` in index.ts. Requires `SESSION_SECRET` in `.dev.vars` (add e.g. `SESSION_SECRET="dev-only-secret-change-me"`). **Step 4:** run → PASS; `tsc -b` → 0; full suite → pass. **Step 5: commit** `feat: magic-link auth routes + session cookie`.

---

### Task 4: React AuthProvider + sign-in + account menu + settings

**Files:** Create `src/react-app/auth/AuthProvider.tsx`, `components/SignInPanel.tsx`, `components/AccountMenu.tsx`, `pages/Settings.tsx`; Modify `App.tsx`, `api.ts`, `TopBar.tsx`.

**Interfaces:**
- `api.ts`: `authRequestLink(email): Promise<{ok:boolean; devLink?:string}>`, `authMe(): Promise<{user: UserDto|null}>`, `authLogout(): Promise<void>`, `authDeleteAccount(): Promise<void>`. `UserDto = { id, email, displayName: string|null }`.
- `AuthProvider`: context value `{ user: UserDto|null, loading: boolean, requestLink(email), logout(), refresh() }`; fetches `/api/auth/me` on mount.
- `SignInPanel`: email input → calls requestLink → in dev shows the returned `devLink` as a clickable "Sign in" link (opening it hits verify + sets cookie); after click, `refresh()`.
- `AccountMenu` (in TopBar right side): signed-out → "Sign in" button (opens SignInPanel); signed-in → shows email + "My Collection", "Ribbons", "Settings", "Sign out".

- [ ] **Step 1:** implement `api.ts` auth helpers (fetch with `credentials: "include"`). 
- [ ] **Step 2:** implement `AuthProvider` (context + me-on-mount + actions). Wrap `<App/>` (or its tree) in it in `main.tsx`/`App.tsx`.
- [ ] **Step 3:** implement `SignInPanel` (modal/section) + `AccountMenu`; put `AccountMenu` in `TopBar`. Dev link flow: after `requestLink`, render "Your sign-in link: [Sign in]" that navigates to the devLink (a normal `<a href={devLink}>`); on return the provider refreshes.
- [ ] **Step 4:** implement `Settings` page (edit display name via a `PATCH /api/auth/me`? — if not building that endpoint now, Settings shows email + Sign out + Delete account with a typed confirm). Keep scope tight: Sign out + Delete account (with confirm) required; display-name edit optional.
- [ ] **Step 5: VERIFY** `npx tsc -b` → 0; `npx vitest run` → all pass; `npm run build` → clean. **Commit** `feat: react auth provider, sign-in, account menu, settings`.

---

### Task 5: Homepage intro/hero

**Files:** Create `src/react-app/pages/Home.tsx`; Modify `App.tsx`, `styles.css`.

**Interfaces:** `Home` renders a hero (wordmark, tagline, intro copy, CTAs). Signed-out: "Browse the Dex" (switches to Species tab) + "Sign in" (opens SignInPanel). Signed-in: slim welcome ("Welcome back, {email}") + quick links (My Collection, Ribbons). Uses design tokens; responsive; light/dark; keyboard-accessible.

- [ ] **Step 1:** build `Home.tsx` with real copy (voice: friendly, Pokémon-collector): headline e.g. "Your whole Pokémon journey, in one dex." · subcopy explaining browse-free / sign-in-to-track / earn ribbons. CTAs wired to tab switch + sign-in.
- [ ] **Step 2:** add a "Home" as the default landing (App shows Home hero above or as the first view; Species/Events remain tabs). Add `.hero` styles to `styles.css` (type-aura accent, big display type, CTA buttons matching the design system).
- [ ] **Step 3: VERIFY** `tsc -b` 0; build clean; suite green. **Commit** `feat: homepage intro hero`.

---

## Self-Review

- Accounts (magic-link dev-friendly, sessions, me/logout/delete, login-required middleware) → Tasks 1–4. ✅
- Homepage intro → Task 5. ✅
- Dev email sender (no external email locally) → Task 2 (`DevEmailSender`), surfaced in UI Task 4. ✅
- Signed httpOnly session cookie, token TTL, Web Crypto only → Tasks 2–3. ✅
- `SESSION_SECRET` via `.dev.vars` (gitignored) → Task 3. ✅
- Login-required mutations: `requireUser` produced in Task 3; consumed by Phase 2 collection routes. ✅
- Type consistency: `UserDto {id,email,displayName}`, `SESSION_COOKIE="pfd_session"`, `getCurrentUser`/`requireUser`, `createSession/getSession/deleteSession` used consistently across tasks. ✅
- Display-name editing is optional in Task 4 (Settings focuses on sign-out + delete); not a spec gap (spec lists display_name as nullable, editing is a nicety).
