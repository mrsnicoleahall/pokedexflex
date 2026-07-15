/**
 * Pure spice-by-margin trash-talk verdict pool for Versus (Flex Phase G). The
 * bigger the round-win margin, the spicier the tier. `pickVerdict` is a pure
 * function: it selects a tier by margin and a line within that tier by a
 * DETERMINISTIC index (`seed % pool.length`), so the same matchup URL always
 * renders the same line. Playful, never mean, no profanity. No I/O.
 */

export type VerdictTier = "draw" | "nailbiter" | "solid" | "decisive" | "shutout";

/**
 * Line pools per tier. `{winner}`/`{loser}` are filled by `pickVerdict`; the
 * `draw` pool names nobody (it's a tie). Kept tasteful — gentle ribbing only.
 */
export const VERDICT_POOLS: Record<VerdictTier, readonly string[]> = {
  draw: [
    "Dead heat. {a} and {b} are the same trainer in different hats.",
    "It's a tie. Somebody go catch one more Pokémon and settle this.",
    "Too close to call. This is exactly what the rematch button is for.",
    "Perfectly balanced, as all collections should be.",
  ],
  nailbiter: [
    "{winner} edges out {loser} by a whisker. Screenshot it fast.",
    "{winner} takes the photo finish; {loser} was one shiny away.",
    "A one-round nail-biter. {winner} wins it, {loser} takes notes.",
    "{winner} squeaks past {loser}. Rematch practically guaranteed.",
  ],
  solid: [
    "{winner} has the better dex today, and {loser} knows it.",
    "Clear enough: {winner} over {loser}. Respectable all around.",
    "{winner} takes the set. {loser} put up a real fight, though.",
    "{winner} wins comfortably; {loser} has a little homework.",
  ],
  decisive: [
    "{winner} runs the table on {loser}. Not much to debate.",
    "{winner} well clear of {loser}. Time for the tall grass, {loser}.",
    "Lopsided. {winner} was in a different tier than {loser} today.",
    "{winner} makes it look easy against {loser}.",
  ],
  shutout: [
    "Clean sweep. {winner} shuts out {loser} six-for-six.",
    "{winner} six, {loser} zero. Someone go check on {loser}.",
    "Total domination: {winner} leaves {loser} nothing.",
    "Flawless victory for {winner}. {loser} gets a participation ribbon.",
  ],
};

/** Tier by absolute round-win margin: 0 draw · 1 nailbiter · 2-3 solid · 4-5 decisive · 6 shutout. */
export function verdictTier(aWins: number, bWins: number): VerdictTier {
  const margin = Math.abs(aWins - bWins);
  if (margin === 0) return "draw";
  if (margin === 1) return "nailbiter";
  if (margin <= 3) return "solid";
  if (margin <= 5) return "decisive";
  return "shutout";
}

/** Small deterministic hash of the ordered handle pair — the line index seed. */
export function seedFrom(a: string, b: string): number {
  const s = `${a}|${b}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Picks the verdict line for a finished matchup. Tie → a `draw` line with the
 * two names filled into `{a}`/`{b}`. Otherwise the winner's name fills
 * `{winner}` and the loser's `{loser}`, choosing a line by `seed % pool.length`.
 */
export function pickVerdict(args: {
  winner: "a" | "b" | "tie";
  aWins: number;
  bWins: number;
  aName: string;
  bName: string;
  seed: number;
}): string {
  const tier = verdictTier(args.aWins, args.bWins);
  const pool = VERDICT_POOLS[tier];
  const line = pool[args.seed % pool.length];
  if (args.winner === "tie") {
    return line.replaceAll("{a}", args.aName).replaceAll("{b}", args.bName);
  }
  const winnerName = args.winner === "a" ? args.aName : args.bName;
  const loserName = args.winner === "a" ? args.bName : args.aName;
  return line.replaceAll("{winner}", winnerName).replaceAll("{loser}", loserName);
}
