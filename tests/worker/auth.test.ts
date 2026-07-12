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
});
