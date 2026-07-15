import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users, species, specimens } from "../../src/db/schema";
import { buildReferenceData } from "../../src/worker/ribbons/collection-summary";
import { buildVersusStats, RARITY_FLEX_CATEGORIES } from "../../src/worker/versus/stats";

describe("versus/stats: buildVersusStats", () => {
  it("aggregates round metrics + type/gen breakdown for a user's collection", async () => {
    const db = getDb(env.DB);
    // Two reference species of different type + generation.
    await db.insert(species).values([
      { id: 7001, name: "vstat-a", generation: 1, types: JSON.stringify(["fire"]), homeId: 7001 },
      { id: 7002, name: "vstat-b", generation: 2, types: JSON.stringify(["water", "flying"]), homeId: 7002 },
    ]);
    await db.insert(users).values({ id: "vs-u1", email: "vs-u1@x.com", handle: "vs-u1", createdAt: 1 });
    const now = Date.now();
    await db.insert(specimens).values([
      { id: "vs-s1", userId: "vs-u1", speciesId: 7001, isShiny: 1, isEvent: 0, level: 100, source: "manual", createdAt: now, updatedAt: now },
      { id: "vs-s2", userId: "vs-u1", speciesId: 7002, isShiny: 0, isEvent: 0, source: "manual", createdAt: now, updatedAt: now },
    ]);

    const ref = await buildReferenceData(db);
    const u = { id: "vs-u1", handle: "vs-u1", displayName: "Vstat One", gender: null, avatarKey: null };
    const s = await buildVersusStats(db, u, ref);

    expect(s.handle).toBe("vs-u1");
    expect(s.displayName).toBe("Vstat One");
    expect(s.stats.dexCount).toBe(2);
    expect(s.stats.shinySpeciesCount).toBe(1);
    expect(s.stats.specimenCount).toBe(2);
    // breakdown: one fire, one water, one flying (species 7002 is dual-type)
    expect(s.byType.fire).toBe(1);
    expect(s.byType.water).toBe(1);
    expect(s.byType.flying).toBe(1);
    expect(s.byGen["1"]).toBe(1);
    expect(s.byGen["2"]).toBe(1);
    // diversity = distinct types (3) + distinct gens (2)
    expect(s.rounds.diversity).toBe(5);
    // shiny round = distinct shiny species
    expect(s.rounds.shiny).toBe(1);
    // strength = 3*sixIv + 2*level100 + mega + gmax = 0 + 2 + 0 + 0
    expect(s.rounds.strength).toBe(2);
    // completion is a 0..1 fraction of total reference species
    expect(s.rounds.completion).toBeGreaterThan(0);
    expect(s.rounds.completion).toBeLessThanOrEqual(1);
    // ribbons round mirrors trainerScore
    expect(s.rounds.ribbons).toBe(s.trainerScore);
    expect(typeof s.rounds.rarity).toBe("number");
  });

  it("exposes the rare-flex categories the rarity round scores", () => {
    expect(RARITY_FLEX_CATEGORIES.has("Rarity Class")).toBe(true);
    expect(RARITY_FLEX_CATEGORIES.has("Grand")).toBe(true);
    expect(RARITY_FLEX_CATEGORIES.has("Collector")).toBe(true);
    expect(RARITY_FLEX_CATEGORIES.has("Fun")).toBe(false);
  });
});
