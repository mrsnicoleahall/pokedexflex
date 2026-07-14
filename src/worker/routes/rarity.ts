import { Hono } from "hono";
import { getDb } from "../db";
import { getRarityMap } from "../rarity/get-rarity-map";

export const rarityRoutes = new Hono<{ Bindings: Env }>();

rarityRoutes.get("/rarity", async (c) => {
  const db = getDb(c.env.DB);
  const map = await getRarityMap(db);
  const tiers: Record<number, string> = {};
  for (const [speciesId, tier] of map) tiers[speciesId] = tier;
  return c.json({ tiers });
});
