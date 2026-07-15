import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { getDb } from "../../src/worker/db";
import { users, species } from "../../src/db/schema";
import { getFavorites, getFavoritesEnriched, setFavorites, FAVORITE_SLOTS } from "../../src/worker/profile/favorites-store";

const seedSpecies = async (db: ReturnType<typeof getDb>) => {
  await db.insert(species).values([
    { id: 5001, name: "picksta", generation: 1, types: JSON.stringify(["electric"]), homeId: 5001 },
    { id: 5002, name: "bulbo", generation: 1, types: JSON.stringify(["grass"]), homeId: null },
    { id: 5003, name: "charry", generation: 1, types: JSON.stringify(["fire"]), homeId: 5003 },
  ]);
};

describe("favorites-store: getFavorites / getFavoritesEnriched", () => {
  it("defaults to an all-null 3-slot favorites list", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "ffs-u1", email: "ffs-u1@x.com", createdAt: 1 });
    expect(await getFavorites(db, "ffs-u1")).toEqual(new Array(FAVORITE_SLOTS).fill(null));
    expect(await getFavoritesEnriched(db, "ffs-u1")).toEqual([]);
  });
});

describe("favorites-store: setFavorites", () => {
  it("rejects an unknown species id and writes nothing", async () => {
    const db = getDb(env.DB);
    await seedSpecies(db);
    await db.insert(users).values({ id: "ffs-u2", email: "ffs-u2@x.com", createdAt: 1 });

    const result = await setFavorites(db, "ffs-u2", [999999]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/unknown species/);
    expect(await getFavorites(db, "ffs-u2")).toEqual(new Array(FAVORITE_SLOTS).fill(null));
  });

  it("rejects more than 3 species and duplicate ids", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "ffs-u3", email: "ffs-u3@x.com", createdAt: 1 });

    const tooMany = await setFavorites(db, "ffs-u3", [5001, 5002, 5003, 5001]);
    expect(tooMany.ok).toBe(false);

    const dup = await setFavorites(db, "ffs-u3", [5001, 5001]);
    expect(dup.ok).toBe(false);
  });

  it("pins valid species in slot order and replaces a prior list wholesale", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "ffs-u4", email: "ffs-u4@x.com", createdAt: 1 });

    const first = await setFavorites(db, "ffs-u4", [5001, 5002]);
    expect(first.ok).toBe(true);
    expect(await getFavorites(db, "ffs-u4")).toEqual([5001, 5002, null]);

    const enriched = await getFavoritesEnriched(db, "ffs-u4");
    expect(enriched).toEqual([
      { speciesId: 5001, name: "picksta", homeId: 5001 },
      { speciesId: 5002, name: "bulbo", homeId: null },
    ]);

    const second = await setFavorites(db, "ffs-u4", [5003]); // replaces, doesn't append
    expect(second.ok).toBe(true);
    expect(await getFavorites(db, "ffs-u4")).toEqual([5003, null, null]);
  });

  it("an empty list clears all favorites", async () => {
    const db = getDb(env.DB);
    await db.insert(users).values({ id: "ffs-u5", email: "ffs-u5@x.com", createdAt: 1 });
    await setFavorites(db, "ffs-u5", [5001]);
    await setFavorites(db, "ffs-u5", []);
    expect(await getFavorites(db, "ffs-u5")).toEqual(new Array(FAVORITE_SLOTS).fill(null));
  });
});
