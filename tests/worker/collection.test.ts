import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values({
    id: 6,
    name: "charizard",
    generation: 1,
    types: JSON.stringify(["fire", "flying"]),
    spriteUrl: null,
  });
});

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

/** Runs the real magic-link flow and returns the session cookie string for `email`. */
const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
};

describe("collection API", () => {
  it("rejects unauthenticated POST with 401", async () => {
    const res = await postJson("/api/collection", { speciesId: 6 });
    expect(res.status).toBe(401);
  });

  it("creates a specimen for the signed-in user", async () => {
    const cookie = await signIn("owner@x.com");
    const res = await postJson("/api/collection", { speciesId: 6, nickname: "Char", level: 36 }, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.id).toBeTruthy();
    expect(body.userId).toBeTruthy();
    expect(body.source).toBe("manual");
    expect(body.speciesId).toBe(6);
    expect(body.nickname).toBe("Char");
  });

  it("lists the user's specimens joined to species", async () => {
    const cookie = await signIn("lister@x.com");
    await postJson("/api/collection", { speciesId: 6, nickname: "Listed" }, cookie);
    const res = await call("/api/collection", undefined, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.total).toBeGreaterThanOrEqual(1);
    const item = body.items.find((i: any) => i.nickname === "Listed");
    expect(item).toBeTruthy();
    expect(item.speciesName).toBe("charizard");
    expect("homeId" in item).toBe(true);
  });

  it("rejects an out-of-range IV with 400", async () => {
    const cookie = await signIn("badiv@x.com");
    const res = await postJson("/api/collection", { speciesId: 6, ivs: { hp: 40, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } }, cookie);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.errors.length).toBeGreaterThan(0);
  });

  it("rejects an EV sum over 510 with 400", async () => {
    const cookie = await signIn("badev@x.com");
    const res = await postJson(
      "/api/collection",
      { speciesId: 6, evs: { hp: 252, atk: 252, def: 252, spa: 0, spd: 0, spe: 0 } },
      cookie,
    );
    expect(res.status).toBe(400);
  });

  it("gets, patches, and deletes a specimen for its owner", async () => {
    const cookie = await signIn("crud@x.com");
    const created = await (await postJson("/api/collection", { speciesId: 6, nickname: "Original" }, cookie)).json() as any;

    const got = await call(`/api/collection/${created.id}`, undefined, cookie);
    expect(got.status).toBe(200);
    expect((await got.json() as any).nickname).toBe("Original");

    const patched = await call(
      `/api/collection/${created.id}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "Renamed" }) },
      cookie,
    );
    expect(patched.status).toBe(200);
    expect((await patched.json() as any).nickname).toBe("Renamed");

    const deleted = await call(`/api/collection/${created.id}`, { method: "DELETE" }, cookie);
    expect(deleted.status).toBe(200);
    expect((await deleted.json() as any).ok).toBe(true);

    const gone = await call(`/api/collection/${created.id}`, undefined, cookie);
    expect(gone.status).toBe(404);
  });

  it("404s (not 403) when a user reaches for another user's specimen", async () => {
    const ownerCookie = await signIn("owner2@x.com");
    const intruderCookie = await signIn("intruder@x.com");
    const created = await (await postJson("/api/collection", { speciesId: 6, nickname: "Mine" }, ownerCookie)).json() as any;

    const getRes = await call(`/api/collection/${created.id}`, undefined, intruderCookie);
    expect(getRes.status).toBe(404);

    const patchRes = await call(
      `/api/collection/${created.id}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "Stolen" }) },
      intruderCookie,
    );
    expect(patchRes.status).toBe(404);

    const deleteRes = await call(`/api/collection/${created.id}`, { method: "DELETE" }, intruderCookie);
    expect(deleteRes.status).toBe(404);

    // still there for the real owner
    const stillThere = await call(`/api/collection/${created.id}`, undefined, ownerCookie);
    expect(stillThere.status).toBe(200);
  });
});
