import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";
import { syncEarnedRibbons, loadUserRibbonRows, ribbonRarity } from "../../src/worker/ribbons/incentive-store";

describe("incentive-store: syncEarnedRibbons / loadUserRibbonRows", () => {
  it("inserts a row on first earn (earnedAt = now, seenAt = null)", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sync-u1", email: "sync-u1@x.com", createdAt: 1 });

    await syncEarnedRibbons(db, "sync-u1", ["living-dex", "shiny-10"], 5000);

    const rows = await loadUserRibbonRows(db, "sync-u1");
    expect(rows.size).toBe(2);
    expect(rows.get("living-dex")).toEqual({ earnedAt: 5000, seenAt: null });
    expect(rows.get("shiny-10")).toEqual({ earnedAt: 5000, seenAt: null });
  });

  it("leaves an existing row's earnedAt/seenAt untouched on a later sync (never overwrites)", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sync-u2", email: "sync-u2@x.com", createdAt: 1 });

    await syncEarnedRibbons(db, "sync-u2", ["living-dex"], 1000);
    await syncEarnedRibbons(db, "sync-u2", ["living-dex", "shiny-10"], 9999); // re-sync, later "now"

    const rows = await loadUserRibbonRows(db, "sync-u2");
    expect(rows.get("living-dex")!.earnedAt).toBe(1000); // unchanged, not bumped to 9999
    expect(rows.get("shiny-10")!.earnedAt).toBe(9999); // newly inserted this pass
  });

  it("is a no-op for an empty earned-ids list", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sync-u3", email: "sync-u3@x.com", createdAt: 1 });
    await syncEarnedRibbons(db, "sync-u3", [], 1000);
    expect((await loadUserRibbonRows(db, "sync-u3")).size).toBe(0);
  });
});

describe("incentive-store: ribbonRarity", () => {
  it("counts distinct earners per ribbon id and the total user count", async () => {
    const db = getDb(env.DB);
    // Baseline first: this test file's other cases (above) also sync
    // "living-dex" rows for their own users, and storage accumulates across
    // tests within a file (not reset per-test), so assert deltas rather than
    // absolute counts.
    const before = await ribbonRarity(db);
    const baseLivingDex = before.counts.get("living-dex") ?? 0;
    const baseShiny10 = before.counts.get("shiny-10") ?? 0;

    await db.insert(users).values([
      { id: "rar-a", email: "rar-a@x.com", createdAt: 1 },
      { id: "rar-b", email: "rar-b@x.com", createdAt: 1 },
    ]);
    await syncEarnedRibbons(db, "rar-a", ["living-dex"], 1000);
    await syncEarnedRibbons(db, "rar-b", ["living-dex", "shiny-10"], 1000);

    const { counts, totalUsers } = await ribbonRarity(db);
    expect(counts.get("living-dex")).toBe(baseLivingDex + 2);
    expect(counts.get("shiny-10")).toBe(baseShiny10 + 1);
    expect(counts.get("never-earned-anywhere")).toBeUndefined();
    expect(totalUsers).toBeGreaterThanOrEqual(2); // other tests in the suite add users too
  });
});
