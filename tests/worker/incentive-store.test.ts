import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";
import { syncEarnedRibbons, loadUserRibbonRows, ribbonRarity } from "../../src/worker/ribbons/incentive-store";
import { getShowcase, setShowcase, SHOWCASE_SLOTS } from "../../src/worker/ribbons/incentive-store";
import { markRibbonsSeen } from "../../src/worker/ribbons/incentive-store";

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

describe("incentive-store: getShowcase / setShowcase", () => {
  it("defaults to an all-null 6-slot showcase", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sc-u1", email: "sc-u1@x.com", createdAt: 1 });
    const showcase = await getShowcase(db, "sc-u1");
    expect(showcase).toEqual(new Array(SHOWCASE_SLOTS).fill(null));
  });

  it("rejects pinning a ribbon the user hasn't earned, and writes nothing", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sc-u2", email: "sc-u2@x.com", createdAt: 1 });
    const result = await setShowcase(db, "sc-u2", ["living-dex"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/not earned/);
    expect(await getShowcase(db, "sc-u2")).toEqual(new Array(SHOWCASE_SLOTS).fill(null));
  });

  it("rejects more than 6 ribbons and duplicate ribbon ids", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sc-u3", email: "sc-u3@x.com", createdAt: 1 });
    await syncEarnedRibbons(db, "sc-u3", ["living-dex"], 1000);

    const tooMany = await setShowcase(db, "sc-u3", new Array(7).fill("living-dex"));
    expect(tooMany.ok).toBe(false);

    const dup = await setShowcase(db, "sc-u3", ["living-dex", "living-dex"]);
    expect(dup.ok).toBe(false);
  });

  it("pins earned ribbons in slot order and replaces a prior showcase wholesale", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "sc-u4", email: "sc-u4@x.com", createdAt: 1 });
    await syncEarnedRibbons(db, "sc-u4", ["living-dex", "shiny-10"], 1000);

    const first = await setShowcase(db, "sc-u4", ["living-dex", "shiny-10"]);
    expect(first.ok).toBe(true);
    expect(await getShowcase(db, "sc-u4")).toEqual(["living-dex", "shiny-10", null, null, null, null]);

    const second = await setShowcase(db, "sc-u4", ["shiny-10"]); // replaces, doesn't append
    expect(second.ok).toBe(true);
    expect(await getShowcase(db, "sc-u4")).toEqual(["shiny-10", null, null, null, null, null]);
  });
});

describe("incentive-store: markRibbonsSeen", () => {
  it("bumps seenAt to now for every row the user owns, leaving earnedAt untouched", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "seen-u1", email: "seen-u1@x.com", createdAt: 1 });
    await syncEarnedRibbons(db, "seen-u1", ["living-dex", "shiny-10"], 1000);

    await markRibbonsSeen(db, "seen-u1", 5000);

    const rows = await loadUserRibbonRows(db, "seen-u1");
    expect(rows.get("living-dex")).toEqual({ earnedAt: 1000, seenAt: 5000 });
    expect(rows.get("shiny-10")).toEqual({ earnedAt: 1000, seenAt: 5000 });
  });

  it("does not affect another user's rows", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "seen-u2", email: "seen-u2@x.com", createdAt: 1 },
      { id: "seen-u3", email: "seen-u3@x.com", createdAt: 1 },
    ]);
    await syncEarnedRibbons(db, "seen-u2", ["living-dex"], 1000);
    await syncEarnedRibbons(db, "seen-u3", ["living-dex"], 1000);

    await markRibbonsSeen(db, "seen-u2", 9999);

    expect((await loadUserRibbonRows(db, "seen-u2")).get("living-dex")!.seenAt).toBe(9999);
    expect((await loadUserRibbonRows(db, "seen-u3")).get("living-dex")!.seenAt).toBeNull();
  });
});
