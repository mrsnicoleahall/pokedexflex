import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";
import { saveRivalry, listRivalries, deleteRivalry } from "../../src/worker/rivalries/rivalries-store";

describe("rivalries-store", () => {
  it("saves, lists (joined to the opponent's current profile), and deletes", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "rs-owner", email: "rs-owner@x.com", createdAt: 1 },
      { id: "rs-opp", email: "rs-opp@x.com", handle: "rs-opp-handle", displayName: "Opp Name", isPublic: 1, createdAt: 1 },
    ]);

    await saveRivalry(db, "rs-owner", "rs-opp", 100);
    const list = await listRivalries(db, "rs-owner");
    expect(list).toHaveLength(1);
    expect(list[0].opponentUserId).toBe("rs-opp");
    expect(list[0].handle).toBe("rs-opp-handle");
    expect(list[0].displayName).toBe("Opp Name");
    expect(list[0].isPublic).toBe(true);

    const removed = await deleteRivalry(db, "rs-owner", list[0].id);
    expect(removed).toBe(true);
    expect(await listRivalries(db, "rs-owner")).toHaveLength(0);
  });

  it("is idempotent on re-save (unique on owner+opponent)", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "rs-o2", email: "rs-o2@x.com", createdAt: 1 },
      { id: "rs-p2", email: "rs-p2@x.com", handle: "rs-p2-h", createdAt: 1 },
    ]);
    await saveRivalry(db, "rs-o2", "rs-p2", 1);
    await saveRivalry(db, "rs-o2", "rs-p2", 2);
    expect(await listRivalries(db, "rs-o2")).toHaveLength(1);
  });

  it("deleteRivalry only removes the caller's own row", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values([
      { id: "rs-o3", email: "rs-o3@x.com", createdAt: 1 },
      { id: "rs-o4", email: "rs-o4@x.com", createdAt: 1 },
      { id: "rs-p3", email: "rs-p3@x.com", createdAt: 1 },
    ]);
    await saveRivalry(db, "rs-o3", "rs-p3", 1);
    const [mine] = await listRivalries(db, "rs-o3");
    // rs-o4 tries to delete rs-o3's rivalry id — no-op
    expect(await deleteRivalry(db, "rs-o4", mine.id)).toBe(false);
    expect(await listRivalries(db, "rs-o3")).toHaveLength(1);
  });
});
