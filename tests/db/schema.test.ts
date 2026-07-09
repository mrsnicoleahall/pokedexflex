import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
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

  it("re-seeding a form with INSERT OR REPLACE replaces instead of duplicating (UNIQUE(species_id, name))", async () => {
    const db = getDb(env.DB);
    await db.insert(species).values({
      id: 150, name: "mewtwo", generation: 1,
      types: JSON.stringify(["psychic"]),
      spriteUrl: "http://x/150.png",
    });

    // Mirrors exactly what the seed generator emits for `forms`.
    await env.DB.prepare(
      "INSERT OR REPLACE INTO forms (species_id,name,form_type,sprite_url) VALUES (?,?,?,?)",
    )
      .bind(150, "mewtwo-mega-x", "mega", "http://x/150mx-v1.png")
      .run();

    // Re-run the exact same statement, as `npm run db:local` would on a second seed.
    await env.DB.prepare(
      "INSERT OR REPLACE INTO forms (species_id,name,form_type,sprite_url) VALUES (?,?,?,?)",
    )
      .bind(150, "mewtwo-mega-x", "mega", "http://x/150mx-v2.png")
      .run();

    const rows = await db.select().from(forms).where(eq(forms.speciesId, 150));
    expect(rows).toHaveLength(1);
    // The row was replaced (new id, new sprite_url), not duplicated.
    expect(rows[0].spriteUrl).toBe("http://x/150mx-v2.png");
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
