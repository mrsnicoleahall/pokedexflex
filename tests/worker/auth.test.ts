import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "../../src/worker/auth/tokens";
import { createSession, getSession, deleteSession } from "../../src/worker/auth/session";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";
import worker from "../../src/worker/index";

const call = async (path: string, init?: RequestInit, cookie?: string) => {
  const ctx = createExecutionContext();
  const headers = new Headers(init?.headers); if (cookie) headers.set("Cookie", cookie);
  const res = await worker.fetch(new Request(`http://x${path}`, { ...init, headers }), env, ctx);
  await waitOnExecutionContext(ctx); return res;
};

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
  it("a verify link can only be used once (single-use token)", async () => {
    const r1 = await call("/api/auth/request-link", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email: "once@x.com" }) });
    const { devLink } = await r1.json() as any;
    const path = new URL(devLink).pathname + new URL(devLink).search;
    const verify1 = await call(path, { redirect: "manual" } as any);
    expect(verify1.status).toBe(302);
    expect(verify1.headers.get("set-cookie")).toContain("pfd_session=");
    const verify2 = await call(path, { redirect: "manual" } as any);
    expect(verify2.status).toBe(400);
    expect((await verify2.json() as any).error).toBe("invalid_or_expired");
  });
  it("normalizes email casing/whitespace on request-link so verify resolves to the lowercased email", async () => {
    const r1 = await call("/api/auth/request-link", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email: "  Foo@X.COM  " }) });
    const { devLink } = await r1.json() as any;
    const path = new URL(devLink).pathname + new URL(devLink).search;
    const verify = await call(path, { redirect: "manual" } as any);
    const cookie = verify.headers.get("set-cookie")!.split(";")[0];
    const me = await call("/api/auth/me", undefined, cookie);
    expect((await me.json() as any).user.email).toBe("foo@x.com");
  });
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

  it("deleting an account with an avatar also removes the R2 object (best-effort)", async () => {
    const r1 = await call("/api/auth/request-link", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email: "delete-with-avatar@x.com" }) });
    const { devLink } = await r1.json() as any;
    const verify = await call(new URL(devLink).pathname + new URL(devLink).search, { redirect: "manual" } as any);
    const cookie = verify.headers.get("set-cookie")!.split(";")[0];
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

  it("/me includes an empty favorites array by default", async () => {
    const r1 = await call("/api/auth/request-link", { method: "POST", headers: {"content-type":"application/json"}, body: JSON.stringify({ email: "favorites-fresh@x.com" }) });
    const { devLink } = await r1.json() as any;
    const path = new URL(devLink).pathname + new URL(devLink).search;
    const verify = await call(path, { redirect: "manual" } as any);
    const cookie = verify.headers.get("set-cookie")!.split(";")[0];
    const me = await call("/api/auth/me", undefined, cookie);
    expect((await me.json() as any).user.favorites).toEqual([]);
  });

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
});
