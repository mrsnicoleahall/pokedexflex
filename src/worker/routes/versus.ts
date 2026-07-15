import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../db/schema";
import { normalizeHandle } from "../profile/handle";
import { buildReferenceData } from "../ribbons/collection-summary";
import { buildVersusStats } from "../versus/stats";
import { computeRounds, overallOutcome } from "../versus/rounds";
import { pickVerdict, seedFrom } from "../versus/verdict";

export const versusRoutes = new Hono<{ Bindings: Env }>();

/** Serializes one side of a versus — public fields only, never email. */
function sideResponse(s: Awaited<ReturnType<typeof buildVersusStats>>) {
  return {
    userId: s.userId, // ONLY exposed so the client can fetch the public avatar image
    handle: s.handle,
    displayName: s.displayName,
    gender: s.gender,
    hasAvatar: s.hasAvatar,
    trainerScore: s.trainerScore,
    rank: s.rank,
    favorites: s.favorites,
    showcase: s.showcase,
    stats: s.stats,
    byType: s.byType,
    byGen: s.byGen,
  };
}

/**
 * Public, unauthenticated head-to-head of two trainers by handle. Both sides
 * must be public; if EITHER handle is unknown or that user is private
 * (`isPublic !== 1`), returns the IDENTICAL 404 the public profile uses — never
 * revealing which side failed or that a private profile exists. Never returns
 * email for either side.
 */
versusRoutes.get("/:a/:b", async (c) => {
  const handleA = normalizeHandle(c.req.param("a"));
  const handleB = normalizeHandle(c.req.param("b"));
  const db = getDb(c.env.DB);

  const [rowsA, rowsB] = await Promise.all([
    db.select().from(users).where(eq(users.handle, handleA)).limit(1),
    db.select().from(users).where(eq(users.handle, handleB)).limit(1),
  ]);
  const userA = rowsA[0];
  const userB = rowsB[0];
  if (!userA || userA.isPublic !== 1 || !userB || userB.isPublic !== 1) {
    return c.json({ error: "not_found" }, 404);
  }

  const ref = await buildReferenceData(db);
  const [sideA, sideB] = await Promise.all([
    buildVersusStats(
      db,
      { id: userA.id, handle: userA.handle!, displayName: userA.displayName, gender: userA.gender, avatarKey: userA.avatarKey },
      ref,
    ),
    buildVersusStats(
      db,
      { id: userB.id, handle: userB.handle!, displayName: userB.displayName, gender: userB.gender, avatarKey: userB.avatarKey },
      ref,
    ),
  ]);

  const rounds = computeRounds(sideA.rounds, sideB.rounds);
  const outcome = overallOutcome(rounds);
  const verdict = pickVerdict({
    winner: outcome.winner,
    aWins: outcome.aWins,
    bWins: outcome.bWins,
    aName: sideA.displayName ?? sideA.handle,
    bName: sideB.displayName ?? sideB.handle,
    seed: seedFrom(sideA.handle, sideB.handle),
  });

  return c.json({
    versus: {
      a: sideResponse(sideA),
      b: sideResponse(sideB),
      rounds,
      outcome,
      verdict,
    },
  });
});
