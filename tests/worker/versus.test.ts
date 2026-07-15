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

/** Signs in, sets a display name (backfills a handle) then overrides the handle explicitly. */
const makeTrainer = async (email: string, handle: string, name: string): Promise<string> => {
  const cookie = await signIn(email);
  await putJson("/api/profile", { displayName: name, gender: "boy" }, cookie);
  await putJson("/api/profile/handle", { handle }, cookie);
  return cookie;
};

describe("GET /api/versus/:a/:b", () => {
  it("404s when a side is unknown", async () => {
    await makeTrainer("vsx-a@x.com", "vsx-real", "Real One");
    const res = await call("/api/versus/vsx-real/vsx-nobody");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("compares two public trainers WITHOUT leaking either email, readable without a cookie", async () => {
    await makeTrainer("vsx-red@x.com", "vsx-red", "Red");
    await makeTrainer("vsx-blue@x.com", "vsx-blue", "Blue");

    const res = await call("/api/versus/vsx-red/vsx-blue");
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain("vsx-red@x.com");
    expect(raw).not.toContain("vsx-blue@x.com");
    const body = JSON.parse(raw) as any;
    expect(body.versus.a.handle).toBe("vsx-red");
    expect(body.versus.b.handle).toBe("vsx-blue");
    expect(body.versus.a).not.toHaveProperty("email");
    expect(body.versus.b).not.toHaveProperty("email");
    expect(Array.isArray(body.versus.rounds)).toBe(true);
    expect(body.versus.rounds).toHaveLength(6);
    expect(["a", "b", "tie"]).toContain(body.versus.outcome.winner);
    expect(typeof body.versus.verdict).toBe("string");
    expect(body.versus.verdict.length).toBeGreaterThan(0);
  });

  it("is case-insensitive on both handles", async () => {
    await makeTrainer("vsx-c1@x.com", "vsx-caseone", "Case One");
    await makeTrainer("vsx-c2@x.com", "vsx-casetwo", "Case Two");
    const res = await call("/api/versus/VSX-CaseOne/VSX-CaseTwo");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.versus.a.handle).toBe("vsx-caseone");
  });

  it("404s (indistinguishably) when a side is private", async () => {
    await makeTrainer("vsx-pub@x.com", "vsx-pub", "Pub");
    const ghost = await makeTrainer("vsx-ghost@x.com", "vsx-ghost", "Ghost");
    await putJson("/api/profile/visibility", { isPublic: false }, ghost);

    const res = await call("/api/versus/vsx-pub/vsx-ghost");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
