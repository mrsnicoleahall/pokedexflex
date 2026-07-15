import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import worker from "../../src/worker/index";
import { getDb } from "../../src/worker/db";
import { users, species, specimens, userRibbons } from "../../src/db/schema";

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
const makeTrainer = async (email: string, handle: string, name: string): Promise<string> => {
  const cookie = await signIn(email);
  await putJson("/api/profile", { displayName: name, gender: "boy" }, cookie);
  await putJson("/api/profile/handle", { handle }, cookie);
  return cookie;
};

const uid = async (email: string): Promise<string> => {
  const db = getDb(env.DB);
  const [u] = await db.select().from(users).where(eq(users.email, email));
  return u.id;
};
const addRibbon = async (userId: string, ribbonId: string) => {
  const db = getDb(env.DB);
  await db.insert(userRibbons).values({ id: crypto.randomUUID(), userId, ribbonId, earnedAt: Date.now(), seenAt: null });
};
const addSpecimen = async (userId: string, speciesId: number, isShiny: 0 | 1) => {
  const db = getDb(env.DB);
  const now = Date.now();
  await db.insert(specimens).values({
    id: crypto.randomUUID(), userId, speciesId, isShiny, isEvent: 0, source: "manual", createdAt: now, updatedAt: now,
  });
};

describe("GET /api/leaderboard", () => {
  it("ranks public trainers by every metric, excludes private + handle-less, and never leaks email", async () => {
    const db = getDb(env.DB);
    // Reference species (unique ids for this file) — completion denominator.
    await db.insert(species).values([
      { id: 9001, name: "lb-a", generation: 1, types: JSON.stringify(["fire"]), homeId: 9001 },
      { id: 9002, name: "lb-b", generation: 2, types: JSON.stringify(["water"]), homeId: 9002 },
    ]);

    await makeTrainer("lb-alpha@x.com", "lb-alpha", "Alpha");
    await makeTrainer("lb-beta@x.com", "lb-beta", "Beta");
    const ghost = await makeTrainer("lb-ghost@x.com", "lb-ghost", "Ghost");
    await putJson("/api/profile/visibility", { isPublic: false }, ghost); // private → excluded
    await signIn("lb-nohandle@x.com"); // public default but no handle → excluded

    const alpha = await uid("lb-alpha@x.com");
    const beta = await uid("lb-beta@x.com");

    // Alpha: 2 owned species (1 shiny); ribbons national-dex-25 + national-dex-50
    // (Completion=30 each, NOT a rarity category) + rarity-legendaries (Rarity
    // Class=40) → score 100, rarity 40. (Note: RARITY_FLEX_CATEGORIES also
    // includes "Grand" and "Collector", not just "Rarity Class" — avoid those
    // here so trainerScore and rarityScore differ, proving only rarity
    // categories feed rarityScore.)
    await addSpecimen(alpha, 9001, 1);
    await addSpecimen(alpha, 9002, 0);
    await addRibbon(alpha, "national-dex-25");
    await addRibbon(alpha, "national-dex-50");
    await addRibbon(alpha, "rarity-legendaries");
    // Beta: 1 owned species (0 shiny); ribbon fun-pikachu (Fun=5) → score 5, rarity 0.
    await addSpecimen(beta, 9001, 0);
    await addRibbon(beta, "fun-pikachu");

    // Default metric = score.
    const res = await call("/api/leaderboard");
    expect(res.status).toBe(200);
    const raw = await res.text();
    for (const e of ["lb-alpha@x.com", "lb-beta@x.com", "lb-ghost@x.com", "lb-nohandle@x.com"]) {
      expect(raw).not.toContain(e);
    }
    const body = JSON.parse(raw) as any;
    expect(body.metric).toBe("score");
    expect(body.limit).toBe(100);

    const handles = body.entries.map((r: any) => r.handle);
    expect(handles).toContain("lb-alpha");
    expect(handles).toContain("lb-beta");
    expect(handles).not.toContain("lb-ghost"); // private
    // handle-less user never appears (it has no handle at all)
    expect(body.entries.every((r: any) => typeof r.handle === "string" && r.handle.length > 0)).toBe(true);

    const alphaRow = body.entries.find((r: any) => r.handle === "lb-alpha");
    const betaRow = body.entries.find((r: any) => r.handle === "lb-beta");
    expect(alphaRow.position).toBeLessThan(betaRow.position); // 100 > 5
    expect(alphaRow).not.toHaveProperty("email");
    expect(alphaRow.trainerScore).toBe(100);
    expect(alphaRow.rarityScore).toBe(40);
    expect(alphaRow.rank).toBe("Collector"); // rankFor(100)
    expect(alphaRow.completionOwned).toBe(2);
    expect(alphaRow.completionTotal).toBeGreaterThanOrEqual(2);
    expect(alphaRow.completionPct).toBeGreaterThan(0);
    expect(alphaRow.completionPct).toBeLessThanOrEqual(1);
    expect(alphaRow.shinySpeciesCount).toBe(1);
    expect(alphaRow.value).toBe(100); // ranked-by-score value
    expect(betaRow.trainerScore).toBe(5);
    // ribbonCount is present on every metric's response: Alpha earned 3 ribbons, Beta earned 1.
    expect(alphaRow.ribbonCount).toBe(3);
    expect(betaRow.ribbonCount).toBe(1);

    // Completion metric: Alpha (2) before Beta (1); value = owned count.
    const compBody = (await (await call("/api/leaderboard?metric=completion")).json()) as any;
    expect(compBody.metric).toBe("completion");
    const compAlpha = compBody.entries.find((r: any) => r.handle === "lb-alpha");
    const compBeta = compBody.entries.find((r: any) => r.handle === "lb-beta");
    expect(compAlpha.position).toBeLessThan(compBeta.position);
    expect(compAlpha.value).toBe(2);

    // Shiny metric: Alpha (1) before Beta (0).
    const shinyBody = (await (await call("/api/leaderboard?metric=shiny")).json()) as any;
    expect(shinyBody.entries.find((r: any) => r.handle === "lb-alpha").position)
      .toBeLessThan(shinyBody.entries.find((r: any) => r.handle === "lb-beta").position);

    // Rarity metric: Alpha (40) before Beta (0).
    const rarBody = (await (await call("/api/leaderboard?metric=rarity")).json()) as any;
    expect(rarBody.metric).toBe("rarity");
    expect(rarBody.entries.find((r: any) => r.handle === "lb-alpha").value).toBe(40);

    // Ribbons metric: Alpha (3 earned ribbons) before Beta (1 earned ribbon); value = earned count.
    const ribbonsBody = (await (await call("/api/leaderboard?metric=ribbons")).json()) as any;
    expect(ribbonsBody.metric).toBe("ribbons");
    const ribbonsAlpha = ribbonsBody.entries.find((r: any) => r.handle === "lb-alpha");
    const ribbonsBeta = ribbonsBody.entries.find((r: any) => r.handle === "lb-beta");
    expect(ribbonsAlpha.position).toBeLessThan(ribbonsBeta.position);
    expect(ribbonsAlpha.value).toBe(3);
    expect(ribbonsAlpha.ribbonCount).toBe(3);
    expect(ribbonsBeta.value).toBe(1);
    expect(ribbonsAlpha).not.toHaveProperty("email");

    // Unknown metric falls back to score.
    const junk = (await (await call("/api/leaderboard?metric=bogus")).json()) as any;
    expect(junk.metric).toBe("score");
  });

  it("is readable without a cookie (public) and returns a well-formed shape", async () => {
    const res = await call("/api/leaderboard");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.total).toBe("number");
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBeLessThanOrEqual(body.limit);
  });
});
