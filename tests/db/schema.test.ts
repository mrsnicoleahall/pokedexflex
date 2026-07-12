import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "../../src/worker/db";
import { species, forms, users, boxes, specimens, events } from "../../src/db/schema";

describe("reference schema", () => {
  it("inserts a species with a form", async () => {
    const db = getDb(env.DB);
    await db.insert(species).values({
      id: 6, name: "charizard", generation: 1,
      types: JSON.stringify(["fire", "flying"]),
      spriteUrl: "http://x/6.png",
      homeId: 6,
    });
    await db.insert(forms).values({
      speciesId: 6, name: "charizard-mega-x", formType: "mega", spriteUrl: "http://x/6mx.png",
      homeId: 10034,
    });
    const rows = await db.select().from(forms);
    expect(rows).toHaveLength(1);
    expect(rows[0].formType).toBe("mega");
    expect(rows[0].homeId).toBe(10034);

    const speciesRows = await db.select().from(species).where(eq(species.id, 6));
    expect(speciesRows[0].homeId).toBe(6);
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

  it("events: insert, read, and slug is unique (idempotent upsert)", async () => {
    const db = getDb(env.DB);
    await db.insert(species).values({ id: 801, name: "magearna", generation: 7, types: "[]" });
    await db.insert(events).values({
      slug: "magearna-qr-2016",
      name: "Magearna (QR Code)",
      speciesId: 801,
      method: "QR Code",
      isShiny: 0,
    });
    await db
      .insert(events)
      .values({
        slug: "magearna-qr-2016",
        name: "Magearna (QR Code) v2",
        speciesId: 801,
        method: "QR Code",
        isShiny: 0,
      })
      .onConflictDoUpdate({ target: events.slug, set: { name: "Magearna (QR Code) v2" } });
    const rows = await db.select().from(events).where(eq(events.slug, "magearna-qr-2016"));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Magearna (QR Code) v2");
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

  it("inserts auth records: user with displayName, loginToken, and session", async () => {
    const db = getDb(env.DB);
    const { loginTokens, sessions } = await import("../../src/db/schema");

    // Insert user with displayName
    await db.insert(users).values({
      id: "u-auth-test",
      email: "auth@example.com",
      displayName: "Test User",
      createdAt: 1000,
    });

    // Insert loginToken
    await db.insert(loginTokens).values({
      id: "lt-1",
      tokenHash: "hash123",
      email: "auth@example.com",
      expiresAt: 2000,
      createdAt: 1000,
    });

    // Insert session
    await db.insert(sessions).values({
      id: "sess-1",
      userId: "u-auth-test",
      expiresAt: 3000,
      createdAt: 1000,
    });

    // Read back and assert
    const userRows = await db.select().from(users).where(eq(users.id, "u-auth-test"));
    expect(userRows).toHaveLength(1);
    expect(userRows[0].displayName).toBe("Test User");
    expect(userRows[0].email).toBe("auth@example.com");

    const tokenRows = await db.select().from(loginTokens).where(eq(loginTokens.id, "lt-1"));
    expect(tokenRows).toHaveLength(1);
    expect(tokenRows[0].tokenHash).toBe("hash123");
    expect(tokenRows[0].email).toBe("auth@example.com");
    expect(tokenRows[0].expiresAt).toBe(2000);
    expect(tokenRows[0].usedAt).toBeNull();

    const sessionRows = await db.select().from(sessions).where(eq(sessions.id, "sess-1"));
    expect(sessionRows).toHaveLength(1);
    expect(sessionRows[0].userId).toBe("u-auth-test");
    expect(sessionRows[0].expiresAt).toBe(3000);
  });
});
