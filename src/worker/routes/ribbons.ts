import { Hono } from "hono";
import { getDb } from "../db";
import { getCurrentUser, requireUser } from "../auth/current-user";
import { computeRibbons, EMPTY_SUMMARY, buildCollectionSummary, buildReferenceData } from "../ribbons/collection-summary";
import { nearestRibbons, pointsForRibbon, trainerScoreFor, rankFor } from "../ribbons/scoring";
import {
  syncEarnedRibbons,
  loadUserRibbonRows,
  ribbonRarity,
  getShowcase,
  setShowcase,
  SHOWCASE_SLOTS,
  markRibbonsSeen,
} from "../ribbons/incentive-store";

export const ribbonRoutes = new Hono<{ Bindings: Env }>();

ribbonRoutes.get("/", async (c) => {
  const db = getDb(c.env.DB);
  const user = await getCurrentUser(c);

  const summary = user ? await buildCollectionSummary(db, user.id) : EMPTY_SUMMARY;
  const ref = await buildReferenceData(db);
  const ribbons = computeRibbons(summary, ref);

  const newlyEarnedIds = new Set<string>();
  if (user) {
    const now = Date.now();
    const earnedIds = ribbons.filter((r) => r.earned).map((r) => r.id);
    await syncEarnedRibbons(db, user.id, earnedIds, now);
    const userRibbonRows = await loadUserRibbonRows(db, user.id);
    for (const r of ribbons) {
      const row = userRibbonRows.get(r.id);
      if (r.earned && row && (row.seenAt === null || row.earnedAt > row.seenAt)) {
        newlyEarnedIds.add(r.id);
      }
    }
  }

  const rarity = await ribbonRarity(db);
  const showcase = user ? await getShowcase(db, user.id) : new Array(SHOWCASE_SLOTS).fill(null);
  const ribbonsOut = ribbons.map((r) => ({
    ...r,
    newlyEarned: newlyEarnedIds.has(r.id),
    rarityPct: rarity.totalUsers > 0 ? (rarity.counts.get(r.id) ?? 0) / rarity.totalUsers : 0,
    points: pointsForRibbon(r),
  }));
  const trainerScore = trainerScoreFor(ribbons.filter((r) => r.earned));
  const rank = rankFor(trainerScore);

  const nearest = nearestRibbons(ribbonsOut, 5);

  return c.json({
    ribbons: ribbonsOut,
    earnedCount: ribbons.filter((r) => r.earned).length,
    total: ribbons.length,
    trainerScore,
    rank,
    showcase,
    nearest,
  });
});

ribbonRoutes.put("/showcase", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);

  const body = await c.req.json().catch(() => null);
  const ribbonIds = Array.isArray(body?.ribbonIds) ? body.ribbonIds : null;
  if (!ribbonIds || !ribbonIds.every((id: unknown) => typeof id === "string")) {
    return c.json({ errors: ["ribbonIds must be an array of strings"] }, 400);
  }

  const result = await setShowcase(db, user.id, ribbonIds);
  if (!result.ok) return c.json({ errors: result.errors }, 400);

  return c.json({ showcase: await getShowcase(db, user.id) });
});

ribbonRoutes.post("/seen", async (c) => {
  const user = await requireUser(c);
  const db = getDb(c.env.DB);
  await markRibbonsSeen(db, user.id, Date.now());
  return c.json({ ok: true });
});
