import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../db/schema";
import { normalizeHandle } from "../profile/handle";
import { getFavoritesEnriched } from "../profile/favorites-store";
import { getShowcase } from "../ribbons/incentive-store";
import { trainerScoreFor, rankFor } from "../ribbons/scoring";
import { computeRibbons, buildCollectionSummary, buildReferenceData } from "../ribbons/collection-summary";

export const publicProfileRoutes = new Hono<{ Bindings: Env }>();

/**
 * Public, unauthenticated read of a trainer's profile. A private profile
 * (`isPublic` = 0) and a nonexistent handle return the IDENTICAL 404, so the
 * private case never reveals the handle exists. The response carries ONLY the
 * fields below — never email, never any other `users` column.
 */
publicProfileRoutes.get("/:handle", async (c) => {
  const handle = normalizeHandle(c.req.param("handle"));
  const db = getDb(c.env.DB);

  const rows = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
  const user = rows[0];
  if (!user || user.isPublic !== 1) return c.json({ error: "not_found" }, 404);

  const summary = await buildCollectionSummary(db, user.id);
  const ref = await buildReferenceData(db);
  const ribbons = computeRibbons(summary, ref);
  const earned = ribbons.filter((r) => r.earned);
  const trainerScore = trainerScoreFor(earned);
  const rank = rankFor(trainerScore);

  const byId = new Map(ribbons.map((r) => [r.id, r] as const));
  const showcaseSlots = await getShowcase(db, user.id);
  const showcase = showcaseSlots
    .filter((id): id is string => id !== null)
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined)
    .map((r) => ({ id: r.id, name: r.name, category: r.category }));

  const favorites = await getFavoritesEnriched(db, user.id);

  return c.json({
    profile: {
      userId: user.id, // ONLY exposed so the client can fetch the public avatar image
      handle: user.handle,
      displayName: user.displayName,
      gender: user.gender,
      hasAvatar: user.avatarKey !== null,
      favorites,
      showcase,
      trainerScore,
      rank,
      stats: {
        dexCount: summary.speciesIds.size,
        shinySpeciesCount: summary.shinySpeciesIds.size,
        specimenCount: summary.specimenCount,
        ribbonCount: earned.length,
      },
    },
  });
});
