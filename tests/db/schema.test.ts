import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { species, forms } from "../../src/db/schema";

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
