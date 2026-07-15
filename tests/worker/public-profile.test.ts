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
  const path = `/api/auth/verify?token=${new URL(devLink).searchParams.get("token")}`;
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
