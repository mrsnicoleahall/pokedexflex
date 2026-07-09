import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { species, forms, users, boxes, specimens } from "../../src/db/schema";

describe("reference schema", () => {
  it("inserts a species with a form", async () => {
    const db = getDb(env.DB);
    await db.insert(species).values({
      id: 6, name: "charizard", generation: 1,
      types: JSON.stringify(["fire", "flying"]),
      spriteUrl: "http://x/6.png",
    });
    await db.insert(forms).values({
      speciesId: 6, name: "charizard-mega-x", formType: "mega", spriteUrl: "http://x/6mx.png",
    });
    const rows = await db.select().from(forms);
    expect(rows).toHaveLength(1);
    expect(rows[0].formType).toBe("mega");
  });
});

describe("user schema", () => {
  it("inserts a specimen linked to user, species, box", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "u1", email: "a@b.com", createdAt: 1 });
    await db.insert(boxes).values({ id: "b1", userId: "u1", name: "Living Dex" });
    await db.insert(species).values({ id: 25, name: "pikachu", generation: 1, types: "[]" });
    await db.insert(specimens).values({
      id: "s1", userId: "u1", speciesId: 25, boxId: "b1",
      isShiny: 1, isEvent: 0, source: "manual", createdAt: 1, updatedAt: 1,
    });
    const rows = await db.select().from(specimens);
    expect(rows[0].source).toBe("manual");
    expect(rows[0].isShiny).toBe(1);
  });
});
