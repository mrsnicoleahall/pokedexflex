import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";
import { RARITY_ORDER } from "../../src/worker/rarity/compute";

const LEGENDARY_ID = 150; // Mewtwo
const COMMON_ID = 10; // Caterpie

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
  const path = `/api/auth/verify?token=${new URL(devLink).searchParams.get("token")}`;
  const verify = await call(path, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
};

beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values([
    { id: LEGENDARY_ID, name: "mewtwo", generation: 1, types: JSON.stringify(["psychic"]), spriteUrl: null },
    { id: COMMON_ID, name: "caterpie", generation: 1, types: JSON.stringify(["bug"]), spriteUrl: null },
  ]);

  const cookie = await signIn("rarity-owner@x.com");
  const res = await postJson("/api/collection", { speciesId: COMMON_ID, nickname: "Bug" }, cookie);
  expect(res.status).toBe(200);
});

describe("rarity API", () => {
  it("GET /api/rarity returns tiers covering the seeded species, legendary rarer than common", async () => {
    const res = await call("/api/rarity");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.tiers[LEGENDARY_ID]).toBeTruthy();
    expect(body.tiers[COMMON_ID]).toBeTruthy();

    const legendaryTier = body.tiers[LEGENDARY_ID];
    const commonTier = body.tiers[COMMON_ID];
    expect(RARITY_ORDER.indexOf(legendaryTier)).toBeGreaterThan(RARITY_ORDER.indexOf(commonTier));
  });

  it("GET /api/species includes a rarity field on each item", async () => {
    const res = await call("/api/species?q=mewtwo");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(RARITY_ORDER).toContain(item.rarity);
    }
  });

  it("GET /api/species/:id includes a rarity field", async () => {
    const res = await call(`/api/species/${LEGENDARY_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(RARITY_ORDER).toContain(body.rarity);
  });
});
