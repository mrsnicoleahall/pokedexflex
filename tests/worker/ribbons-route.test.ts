import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { species } from "../../src/db/schema";

// Seed a small gen-1 pair (2 species, both Generation 1) so we can drive the
// gen-1 ribbon to "earned" by owning both, without needing the full ~1025-row
// reference dataset.
beforeAll(async () => {
  const db = getDb(env.DB);
  await db.insert(species).values([
    { id: 1001, name: "genoneA", generation: 1, types: JSON.stringify(["normal"]), spriteUrl: null },
    { id: 1002, name: "genoneB", generation: 1, types: JSON.stringify(["normal"]), spriteUrl: null },
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

/** Runs the real magic-link flow and returns the session cookie string for `email`. */
const signIn = async (email: string): Promise<string> => {
  const r1 = await postJson("/api/auth/request-link", { email });
  const { devLink } = (await r1.json()) as any;
  const path = new URL(devLink).pathname + new URL(devLink).search;
  const verify = await call(path, { redirect: "manual" } as any);
  const setCookie = verify.headers.get("set-cookie")!;
  return setCookie.split(";")[0];
};

describe("ribbons API", () => {
  it("returns 200 with everything locked for a logged-out request (not 401)", async () => {
    const res = await call("/api/ribbons");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.earnedCount).toBe(0);
    expect(body.total).toBeGreaterThan(0);
    expect(body.ribbons.length).toBe(body.total);
    for (const r of body.ribbons) {
      expect(r.earned).toBe(false);
    }
  });

  it("returns earnedCount 0 for a signed-in user with no specimens", async () => {
    const cookie = await signIn("no-specimens@x.com");
    const res = await call("/api/ribbons", undefined, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.earnedCount).toBe(0);
  });

  it("marks the gen-1 ribbon earned after the user owns all seeded gen-1 species", async () => {
    const cookie = await signIn("gen1-collector@x.com");
    await postJson("/api/collection", { speciesId: 1001 }, cookie);
    await postJson("/api/collection", { speciesId: 1002 }, cookie);

    const res = await call("/api/ribbons", undefined, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const gen1 = body.ribbons.find((r: any) => r.id === "gen-1");
    expect(gen1).toBeTruthy();
    expect(gen1.earned).toBe(true);
    expect(body.earnedCount).toBeGreaterThan(0);
  });

  it("earns the secret fun-magikarp ribbon once the user owns a Magikarp specimen", async () => {
    const cookie = await signIn("magikarp-owner@x.com");
    await db_insertMagikarpSpecies();
    await postJson("/api/collection", { speciesId: 129 }, cookie);

    const res = await call("/api/ribbons", undefined, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const fun = body.ribbons.find((r: any) => r.id === "fun-magikarp");
    expect(fun).toBeTruthy();
    expect(fun.earned).toBe(true);
    expect(fun.category).toBe("Fun");
    expect(fun.secret).toBe(true);
  });

  it("flows specimenCount and boxCount through to their fun ribbons via aggregate counts", async () => {
    const cookie = await signIn("counter@x.com");
    await postJson("/api/collection", { speciesId: 1001 }, cookie);
    const boxRes = await postJson("/api/boxes", { name: "Box A" }, cookie);
    expect(boxRes.status).toBeLessThan(300);

    const res = await call("/api/ribbons", undefined, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const firstCatch = body.ribbons.find((r: any) => r.id === "fun-first-catch");
    expect(firstCatch.earned).toBe(true);
    const boxHoarder = body.ribbons.find((r: any) => r.id === "fun-box-hoarder");
    expect(boxHoarder.progress.current).toBeGreaterThanOrEqual(1);
  });

  it("still returns the catalog after the summary was widened (no crash on new aggregates)", async () => {
    const cookie = await signIn("widened@x.com");
    await postJson("/api/collection", { speciesId: 1001, level: 100, nature: "Adamant", ball: "Ultra Ball",
      ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } }, cookie);
    const res = await call("/api/ribbons", undefined, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    const level1 = body.ribbons.find((r: any) => r.id === "collector-level100-1");
    expect(level1.earned).toBe(true);
    const sixiv1 = body.ribbons.find((r: any) => r.id === "collector-6iv-1");
    expect(sixiv1.earned).toBe(true);
    const natures = body.ribbons.find((r: any) => r.id === "collector-natures");
    expect(natures.progress.current).toBe(1);
    const balls = body.ribbons.find((r: any) => r.id === "collector-balls");
    expect(balls.progress.current).toBe(1);
  });
});

/** Seeds species #129 (Magikarp) so a specimen referencing it can be created. */
async function db_insertMagikarpSpecies(): Promise<void> {
  const db = getDb(env.DB);
  const existing = await db.select({ id: species.id }).from(species).where(eq(species.id, 129)).limit(1);
  if (existing.length > 0) return;
  await db.insert(species).values({
    id: 129,
    name: "magikarp",
    generation: 1,
    types: JSON.stringify(["water"]),
    spriteUrl: null,
  });
}
