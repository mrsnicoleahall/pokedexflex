import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { users, species, specimens } from "../../src/db/schema";

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

describe("GET /api/stats", () => {
  it("401s when unauthenticated", async () => {
    const res = await call("/api/stats");
    expect(res.status).toBe(401);
  });

  it("returns completion, breakdowns, and tiles for the signed-in user without leaking email", async () => {
    const db = getDb(env.DB);
    // Reference species with unique ids for this file.
    await db.insert(species).values([
      { id: 8001, name: "stat-a", generation: 1, types: JSON.stringify(["fire"]), homeId: 8001 },
      { id: 8002, name: "stat-b", generation: 2, types: JSON.stringify(["water", "flying"]), homeId: 8002 },
    ]);
    const email = "stats-user@x.com";
    const cookie = await signIn(email);
    const [u] = await db.select().from(users).where(eq(users.email, email));
    const now = Date.now();
    await db.insert(specimens).values([
      { id: "st-s1", userId: u.id, speciesId: 8001, isShiny: 1, isEvent: 0, level: 100, source: "manual", createdAt: now, updatedAt: now },
      { id: "st-s2", userId: u.id, speciesId: 8002, isShiny: 0, isEvent: 0, source: "manual", createdAt: now, updatedAt: now },
    ]);

    const res = await call("/api/stats", undefined, cookie);
    expect(res.status).toBe(200);
    const raw = await res.text();
    expect(raw).not.toContain(email);
    const { stats } = JSON.parse(raw) as any;

    // Overall completion: owned exactly 2; total is the whole reference dex (>= 2).
    expect(stats.completion.owned).toBe(2);
    expect(stats.completion.total).toBeGreaterThanOrEqual(2);
    expect(stats.completion.pct).toBeGreaterThan(0);
    expect(stats.completion.pct).toBeLessThanOrEqual(1);

    // Owned breakdown (exact); totals are >= owned.
    expect(stats.byGen["1"]).toBe(1);
    expect(stats.byGen["2"]).toBe(1);
    expect(stats.byType.fire).toBe(1);
    expect(stats.byType.water).toBe(1);
    expect(stats.byType.flying).toBe(1);
    expect(stats.totalByGen["1"]).toBeGreaterThanOrEqual(1);
    expect(stats.totalByType.fire).toBeGreaterThanOrEqual(1);

    // Tiles.
    expect(stats.shinySpeciesCount).toBe(1);
    expect(stats.specimenCount).toBe(2);
    expect(typeof stats.eventCount).toBe("number");
    expect(typeof stats.boxCount).toBe("number");
    expect(typeof stats.megaFormCount).toBe("number");
    expect(typeof stats.gmaxFormCount).toBe("number");
    expect(typeof stats.ribbonCount).toBe("number");
    expect(typeof stats.trainerScore).toBe("number");
    expect(typeof stats.rank).toBe("string");
    expect(typeof stats.rarityScore).toBe("number");

    // No email/private column leaks.
    expect(stats).not.toHaveProperty("email");
  });
});
