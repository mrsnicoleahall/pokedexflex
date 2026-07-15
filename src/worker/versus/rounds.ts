/**
 * Pure head-to-head round scoring for Versus (Flex Phase G). No I/O — takes
 * two plain `RoundValues` objects (produced by `versus/stats.ts`) and returns
 * per-round winners + the overall outcome. Mirrors `ribbons/scoring.ts`'s
 * pure-and-unit-tested posture; the route (`routes/versus.ts`) is the caller.
 *
 * The six rounds and the exact formula each metric comes from (formulas live
 * in `stats.ts`; this module only COMPARES the resulting numbers):
 *  - strength   : competitive investment  = 3*sixIvCount + 2*level100Count + megaFormCount + gmaxFormCount
 *  - diversity  : breadth                  = distinct types owned + distinct generations owned
 *  - completion : National Dex fraction    = ownedSpecies / totalSpecies   (0..1, shown as %)
 *  - shiny      : distinct shiny species   = shinySpeciesIds.size
 *  - ribbons    : Ribbon score             = trainerScoreFor(earned)
 *  - rarity     : Rarity Crown             = Σ points of earned ribbons in rare-flex categories
 * Every round is "higher wins"; equal values (including 0-0) tie.
 */

export type RoundKey = "strength" | "diversity" | "completion" | "shiny" | "ribbons" | "rarity";

/** The six per-side metric values a versus is scored on (see the formula notes above). */
export type RoundValues = Record<RoundKey, number>;

export type RoundResult = {
  key: RoundKey;
  label: string;
  /** How the client should format the raw values: "percent" multiplies by 100 and appends %. */
  format: "int" | "percent";
  a: number;
  b: number;
  winner: "a" | "b" | "tie";
};

/** Round metadata in display order. */
export const ROUND_DEFS: readonly { key: RoundKey; label: string; format: "int" | "percent" }[] = [
  { key: "strength", label: "Strength", format: "int" },
  { key: "diversity", label: "Diversity", format: "int" },
  { key: "completion", label: "Completion", format: "percent" },
  { key: "shiny", label: "Shiny", format: "int" },
  { key: "ribbons", label: "Ribbon Score", format: "int" },
  { key: "rarity", label: "Rarity Crown", format: "int" },
];

/** Higher value wins; equal (including 0-0) is a tie. */
export function winnerOf(a: number, b: number): "a" | "b" | "tie" {
  if (a > b) return "a";
  if (b > a) return "b";
  return "tie";
}

/** Scores all six rounds for two sides, in `ROUND_DEFS` order. */
export function computeRounds(a: RoundValues, b: RoundValues): RoundResult[] {
  return ROUND_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    format: def.format,
    a: a[def.key],
    b: b[def.key],
    winner: winnerOf(a[def.key], b[def.key]),
  }));
}

/** Tallies round wins and names the overall winner (most rounds won; equal round-wins → tie). */
export function overallOutcome(rounds: readonly RoundResult[]): {
  winner: "a" | "b" | "tie";
  aWins: number;
  bWins: number;
  ties: number;
} {
  let aWins = 0;
  let bWins = 0;
  let ties = 0;
  for (const r of rounds) {
    if (r.winner === "a") aWins++;
    else if (r.winner === "b") bWins++;
    else ties++;
  }
  const winner = aWins > bWins ? "a" : bWins > aWins ? "b" : "tie";
  return { winner, aWins, bWins, ties };
}
