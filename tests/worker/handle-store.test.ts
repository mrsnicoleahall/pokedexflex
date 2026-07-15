import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users } from "../../src/db/schema";
import { isHandleTaken, generateUniqueHandle } from "../../src/worker/profile/handle-store";

describe("handle-store: isHandleTaken", () => {
  it("is false for an unused handle and true (case-insensitively) for a used one", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "hs-1", email: "hs-1@x.com", handle: "taken-one", createdAt: 1 });
    expect(await isHandleTaken(db, "free-one")).toBe(false);
    expect(await isHandleTaken(db, "taken-one")).toBe(true);
    expect(await isHandleTaken(db, "TAKEN-ONE")).toBe(true); // normalized before checking
  });

  it("excludes a given user id (so a user can 're-save' their own handle)", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "hs-2", email: "hs-2@x.com", handle: "mine-two", createdAt: 1 });
    expect(await isHandleTaken(db, "mine-two", "hs-2")).toBe(false);
    expect(await isHandleTaken(db, "mine-two", "someone-else")).toBe(true);
  });
});

describe("handle-store: generateUniqueHandle", () => {
  it("returns the base itself when free", async () => {
    const db = getDb(env.DB);
    expect(await generateUniqueHandle(db, "brand-new-base")).toBe("brand-new-base");
  });

  it("appends a numeric suffix when the base is taken", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "hs-3", email: "hs-3@x.com", handle: "collide", createdAt: 1 });
    const next = await generateUniqueHandle(db, "collide");
    expect(next).toBe("collide-2");

    await db.insert(users).values({ id: "hs-4", email: "hs-4@x.com", handle: "collide-2", createdAt: 1 });
    expect(await generateUniqueHandle(db, "collide")).toBe("collide-3");
  });
});
