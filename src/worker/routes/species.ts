import { Hono } from "hono";
import { eq, like, and, count, inArray, asc, exists, notExists } from "drizzle-orm";
import { getDb } from "../db";
import { species, forms, specimens, userWanted } from "../../db/schema";
import { getCurrentUser } from "../auth/current-user";
import { getRarityMap } from "../rarity/get-rarity-map";
import type { RarityTier } from "../rarity/priors";

export const speciesRoutes = new Hono<{ Bindings: Env }>();

/** Region key → the generation whose dex that region introduced (Living Dex region filter). */
const REGION_GENERATION: Record<string, number> = {
  kanto: 1, johto: 2, hoenn: 3, sinnoh: 4, unova: 5, kalos: 6, alola: 7, galar: 8, paldea: 9,
};

const shape = (s: any, f: any[], owned: boolean, rarity: RarityTier, wanted: boolean) => ({
  id: s.id, name: s.name, generation: s.generation,
  types: JSON.parse(s.types), spriteUrl: s.spriteUrl, homeId: s.homeId,
  forms: f.map(x => ({ id: x.id, name: x.name, formType: x.formType, spriteUrl: x.spriteUrl, homeId: x.homeId })),
  owned,
  rarity,
  wanted,
});

/** The given user's wanted (chase-list) species-id set. Empty for a logged-out user. */
const wantedSpeciesIds = async (
  db: ReturnType<typeof getDb>,
  user: { id: string } | null,
): Promise<Set<number>> => {
  if (!user) return new Set();
  const rows = await db.select({ speciesId: userWanted.speciesId }).from(userWanted).where(eq(userWanted.userId, user.id));
  return new Set(rows.map((r) => r.speciesId));
};

/** The given user's owned species-id set. Empty for a logged-out (null) user. */
const ownedSpeciesIds = async (
  db: ReturnType<typeof getDb>,
  user: { id: string } | null,
): Promise<Set<number>> => {
  if (!user) return new Set();
  const rows = await db
    .selectDistinct({ speciesId: specimens.speciesId })
    .from(specimens)
    .where(eq(specimens.userId, user.id));
  return new Set(rows.map((r) => r.speciesId));
};

speciesRoutes.get("/species", async (c) => {
  const db = getDb(c.env.DB);
  const q = c.req.query("q");
  const gen = c.req.query("gen");
  const region = c.req.query("region");
  const type = c.req.query("type");
  const ownedFilter = c.req.query("owned"); // "owned" | "missing" | (else = all)
  const sort = c.req.query("sort"); // "name" | (else = "dex", id asc)
  const limit = Math.min(Number(c.req.query("limit") ?? 60), 200);
  const offset = Number(c.req.query("offset") ?? 0);

  // Resolve the caller once: needed both for the per-row `owned` flag and for
  // the owned/missing filter's correlated subquery.
  const user = await getCurrentUser(c);

  const conds = [];
  if (q) conds.push(like(species.name, `%${q.toLowerCase()}%`));
  if (gen) conds.push(eq(species.generation, Number(gen)));
  if (region && REGION_GENERATION[region]) conds.push(eq(species.generation, REGION_GENERATION[region]));
  // `types` is a JSON text array like ["fire","flying"]. Match the QUOTED slug
  // so a type can't partial-match another; the 18 type tokens are mutually
  // non-substring, so this LIKE is exact enough. Part of the shared WHERE, so
  // `total` (the count query below) stays consistent with the page.
  if (type) conds.push(like(species.types, `%"${type.toLowerCase()}"%`));
  // owned/missing only when signed in; a signed-out request is treated as "all".
  if (user && (ownedFilter === "owned" || ownedFilter === "missing")) {
    const ownedSub = db
      .select({ id: specimens.id })
      .from(specimens)
      .where(and(eq(specimens.userId, user.id), eq(specimens.speciesId, species.id)));
    conds.push(ownedFilter === "owned" ? exists(ownedSub) : notExists(ownedSub));
  }
  const where = conds.length ? and(...conds) : undefined;

  const orderBy = sort === "name" ? asc(species.name) : asc(species.id);
  const rows = await db.select().from(species).where(where).orderBy(orderBy).limit(limit).offset(offset);
  const [{ value: total }] = await db.select({ value: count() }).from(species).where(where);
  const ids = rows.map((r) => r.id);
  const allForms = ids.length ? await db.select().from(forms).where(inArray(forms.speciesId, ids)) : [];
  const owned = await ownedSpeciesIds(db, user);
  const wanted = await wantedSpeciesIds(db, user);
  const rarityMap = await getRarityMap(db);
  const items = rows.map((s) =>
    shape(s, allForms.filter((f) => f.speciesId === s.id), owned.has(s.id), rarityMap.get(s.id) ?? "common", wanted.has(s.id)),
  );
  return c.json({ items, total });
});

speciesRoutes.get("/species/:id", async (c) => {
  const db = getDb(c.env.DB);
  const id = Number(c.req.param("id"));
  const [s] = await db.select().from(species).where(eq(species.id, id));
  if (!s) return c.json({ error: "not_found" }, 404);
  const f = await db.select().from(forms).where(eq(forms.speciesId, id));
  const user = await getCurrentUser(c);
  const owned = await ownedSpeciesIds(db, user);
  const wanted = await wantedSpeciesIds(db, user);
  const rarityMap = await getRarityMap(db);
  return c.json(shape(s, f, owned.has(id), rarityMap.get(id) ?? "common", wanted.has(id)));
});
