import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";
import { syncEarnedRibbons, loadUserRibbonRows } from "../../src/worker/ribbons/incentive-store";

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
