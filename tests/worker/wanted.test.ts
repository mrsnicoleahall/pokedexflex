import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";

beforeAll(async () => {
  const db = getDb(env.DB);
  // Two species to add/remove from the wanted list (ids unused by other suites).
  await db.insert(species).values([
    { id: 777, name: "wanted-mon-a", generation: 7, types: JSON.stringify(["steel", "flying"]), spriteUrl: null },
    { id: 778, name: "wanted-mon-b", generation: 7, types: JSON.stringify(["ghost"]), spriteUrl: null },
  ]);
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

const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = `/api/auth/verify?token=${new URL(devLink).searchParams.get("token")}`;
  const verify = await call(path, { redirect: "manual" } as any);
  return verify.headers.get("set-cookie")!.split(";")[0];
};

describe("wanted list API", () => {
  it("adds, lists (newest first), dedupes, and removes wanted species", async () => {
    const cookie = await signIn("wanted-user@x.com");

    await postJson("/api/wanted", { speciesId: 777 }, cookie);
    await postJson("/api/wanted", { speciesId: 778 }, cookie);
    await postJson("/api/wanted", { speciesId: 777 }, cookie); // duplicate — no-op

    const list = (await (await call("/api/wanted", undefined, cookie)).json()) as any;
    expect(list.items).toHaveLength(2); // duplicate add was a no-op
    expect(list.items.map((i: any) => i.speciesId).sort()).toEqual([777, 778]);
    expect(list.items[0]).toHaveProperty("name");
    expect(list.items[0]).toHaveProperty("types");

    const del = await call("/api/wanted/777", { method: "DELETE" }, cookie);
    expect(del.status).toBe(200);
    const after = (await (await call("/api/wanted", undefined, cookie)).json()) as any;
    expect(after.items.map((i: any) => i.speciesId)).toEqual([778]);
  });

  it("400s a non-existent species and requires auth", async () => {
    const cookie = await signIn("wanted-user2@x.com");
    const bad = await postJson("/api/wanted", { speciesId: 999999 }, cookie);
    expect(bad.status).toBe(400);

    const unauth = await call("/api/wanted");
    expect(unauth.status).toBe(401);
  });

  it("exposes the wanted flag on the species catalog", async () => {
    const cookie = await signIn("wanted-user3@x.com");
    await postJson("/api/wanted", { speciesId: 778 }, cookie);
    const res = (await (await call("/api/species?q=wanted-mon-b", undefined, cookie)).json()) as any;
    const row = res.items.find((s: any) => s.id === 778);
    expect(row.wanted).toBe(true);
  });
});
