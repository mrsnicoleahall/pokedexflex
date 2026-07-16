import type { SpecimenInput, StatBlock } from "../collection/validate";

/**
 * Maps a CSV header (verbatim, as it appeared in row 0) to a specimen field
 * key, or `null` if the column should be ignored.
 *
 * Field keys are either:
 * - a direct `SpecimenInput` property name (e.g. "nickname", "level"), or
 * - the sentinel `"species"`, meaning the column holds a species name or
 *   dex number that must be resolved to a `speciesId` via `resolveSpecies`
 *   (see `rowToInput`), or
 * - a dotted stat path `"ivs.<stat>"` / `"evs.<stat>"` for one of
 *   hp/atk/def/spa/spd/spe.
 */
export type FieldMapping = Record<string, string | null>;

const normalize = (header: string): string => header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Direct header → field-key recognition table. Keys are pre-normalized
 * (lowercased, non-alphanumeric characters stripped) so that "Held Item",
 * "held_item", and "HeldItem" all resolve the same way.
 */
const DIRECT_MATCHES: Record<string, string> = {
  // species (sentinel — resolved to speciesId downstream)
  species: "species",
  pokemon: "species",
  speciesname: "species",
  dex: "species",
  dexno: "species",
  dexnumber: "species",
  nationaldex: "species",

  form: "formId",
  formid: "formId",

  nickname: "nickname",

  level: "level",
  lvl: "level",

  shiny: "isShiny",
  isshiny: "isShiny",

  gender: "gender",
  sex: "gender",

  nature: "nature",

  ability: "ability",

  item: "heldItem",
  helditem: "heldItem",
  helditemname: "heldItem",

  ball: "ball",
  pokeball: "ball",

  ot: "otName",
  otname: "otName",
  trainer: "otName",
  trainername: "otName",

  id: "otId",
  otid: "otId",
  trainerid: "otId",

  metlocation: "metLocation",
  location: "metLocation",
  metat: "metLocation",

  metdate: "metDate",
  datemet: "metDate",

  origingame: "originGame",
  originalgame: "originGame",
  game: "originGame",

  originera: "originEra",
  era: "originEra",

  isevent: "isEvent",
  event: "isEvent",

  eventname: "eventName",

  notes: "notes",
  note: "notes",
  comment: "notes",
  comments: "notes",

  // NOTE: a bare "box" column is deliberately NOT mapped — third-party catalogs
  // use it for a physical box NUMBER (1, 2, 3…), but the app's boxId is a box
  // UUID, so auto-mapping it made every such row fail the box-ownership check on
  // commit. Only the app's own "boxId" (UUID) column maps.
  boxid: "boxId",

  moves: "moves",
  movesknown: "moves",

  ribbons: "ribbons",
};

/** Stat abbreviations recognized for the "<stat> iv"/"<stat> ev" columns. */
const STAT_ALIASES: Record<keyof StatBlock, string[]> = {
  hp: ["hp"],
  atk: ["atk", "attack"],
  def: ["def", "defense", "defence"],
  spa: ["spa", "spatk", "spattack", "specialattack"],
  spd: ["spd", "spdef", "specialdefense"],
  spe: ["spe", "speed"],
};

const findStat = (remainder: string): keyof StatBlock | null => {
  for (const stat of Object.keys(STAT_ALIASES) as Array<keyof StatBlock>) {
    if (STAT_ALIASES[stat].includes(remainder)) return stat;
  }
  return null;
};

/**
 * Matches a normalized header against the "<stat>iv"/"iv<stat>" (or "ev")
 * shape and returns e.g. "ivs.hp", or null if it isn't an IV/EV column.
 * A bare stat name (e.g. "hp") is intentionally NOT matched here — per the
 * spec, "HP" alone is ambiguous, so it's only recognized combined with an
 * "iv"/"ev" marker.
 */
const matchStatColumn = (normalized: string): string | null => {
  for (const [suffix, group] of [["iv", "ivs"], ["ev", "evs"]] as const) {
    if (normalized.endsWith(suffix) && normalized.length > suffix.length) {
      const stat = findStat(normalized.slice(0, -suffix.length));
      if (stat) return `${group}.${stat}`;
    }
    if (normalized.startsWith(suffix) && normalized.length > suffix.length) {
      const stat = findStat(normalized.slice(suffix.length));
      if (stat) return `${group}.${stat}`;
    }
  }
  return null;
};

/** Case-insensitive/space-insensitive auto-mapping of CSV headers to specimen fields. */
export const autoDetectMapping = (headers: string[]): FieldMapping => {
  const mapping: FieldMapping = {};
  for (const header of headers) {
    const normalized = normalize(header);
    mapping[header] = DIRECT_MATCHES[normalized] ?? matchStatColumn(normalized) ?? null;
  }
  return mapping;
};

const toOptionalString = (value: string): string | null => {
  const s = value.trim();
  return s === "" ? null : s;
};

const toBit = (value: string): 0 | 1 => {
  const s = value.trim().toLowerCase();
  return s === "yes" || s === "true" || s === "1" ? 1 : 0;
};

const splitList = (value: string): string[] =>
  value
    .split(/[,/|]/)
    .map((s) => s.trim())
    .filter((s) => s !== "");

/**
 * Builds a `SpecimenInput` from one CSV row, using `mapping` to interpret
 * each column. Only performs structural coercion + species resolution;
 * range/bound validation (level 1-100, IV 0-31, etc.) is `validateSpecimen`'s
 * job downstream. `input` is null whenever any structural error occurred
 * (unresolved species, non-numeric value where a number was expected).
 */
export const rowToInput = (
  headers: string[],
  row: string[],
  mapping: FieldMapping,
  resolveSpecies: (nameOrDex: string) => number | null,
): { input: SpecimenInput | null; errors: string[] } => {
  const errors: string[] = [];

  let speciesId: number | null = null;
  let formId: number | null = null;
  let nickname: string | null = null;
  let level: number | null = null;
  let isShiny: 0 | 1 = 0;
  let gender: string | null = null;
  let nature: string | null = null;
  let ability: string | null = null;
  let heldItem: string | null = null;
  let ball: string | null = null;
  let otName: string | null = null;
  let otId: string | null = null;
  let metLocation: string | null = null;
  let metDate: string | null = null;
  let originGame: string | null = null;
  let originEra: string | null = null;
  let isEvent: 0 | 1 = 0;
  let eventName: string | null = null;
  let notes: string | null = null;
  let boxId: string | null = null;
  let moves: string[] = [];
  let ribbons: string[] = [];
  const ivs: Partial<Record<keyof StatBlock, number>> = {};
  const evs: Partial<Record<keyof StatBlock, number>> = {};
  let hasIvs = false;
  let hasEvs = false;

  const toNumberOrError = (value: string, label: string): number | null => {
    const s = value.trim();
    if (s === "") return null;
    const n = Number(s);
    if (!Number.isFinite(n)) {
      errors.push(`${label} must be a number: "${value}"`);
      return null;
    }
    return n;
  };

  for (let i = 0; i < headers.length; i++) {
    const key = mapping[headers[i]];
    if (!key) continue;
    const value = row[i] ?? "";

    if (key === "species") {
      const trimmed = value.trim();
      const resolved = trimmed === "" ? null : resolveSpecies(trimmed);
      if (resolved === null) {
        errors.push(`unknown species: ${trimmed === "" ? "(empty)" : value}`);
      } else {
        speciesId = resolved;
      }
    } else if (key === "formId") {
      const n = toNumberOrError(value, "formId");
      if (n !== null) formId = n;
    } else if (key === "nickname") {
      nickname = toOptionalString(value);
    } else if (key === "level") {
      const n = toNumberOrError(value, "level");
      if (n !== null) level = n;
    } else if (key === "isShiny") {
      isShiny = toBit(value);
    } else if (key === "gender") {
      gender = toOptionalString(value);
    } else if (key === "nature") {
      nature = toOptionalString(value);
    } else if (key === "ability") {
      ability = toOptionalString(value);
    } else if (key === "heldItem") {
      heldItem = toOptionalString(value);
    } else if (key === "ball") {
      ball = toOptionalString(value);
    } else if (key === "otName") {
      otName = toOptionalString(value);
    } else if (key === "otId") {
      otId = toOptionalString(value);
    } else if (key === "metLocation") {
      metLocation = toOptionalString(value);
    } else if (key === "metDate") {
      metDate = toOptionalString(value);
    } else if (key === "originGame") {
      originGame = toOptionalString(value);
    } else if (key === "originEra") {
      originEra = toOptionalString(value);
    } else if (key === "isEvent") {
      isEvent = toBit(value);
    } else if (key === "eventName") {
      eventName = toOptionalString(value);
    } else if (key === "notes") {
      notes = toOptionalString(value);
    } else if (key === "boxId") {
      boxId = toOptionalString(value);
    } else if (key === "moves") {
      moves = splitList(value);
    } else if (key === "ribbons") {
      ribbons = splitList(value);
    } else if (key.startsWith("ivs.")) {
      const stat = key.slice(4) as keyof StatBlock;
      const n = toNumberOrError(value, `ivs.${stat}`);
      if (n !== null) {
        ivs[stat] = n;
        hasIvs = true;
      }
    } else if (key.startsWith("evs.")) {
      const stat = key.slice(4) as keyof StatBlock;
      const n = toNumberOrError(value, `evs.${stat}`);
      if (n !== null) {
        evs[stat] = n;
        hasEvs = true;
      }
    }
  }

  if (speciesId === null && !errors.some((e) => e.startsWith("unknown species"))) {
    errors.push("unknown species: (missing)");
  }

  if (errors.length > 0) {
    return { input: null, errors };
  }

  const fillStatBlock = (partial: Partial<Record<keyof StatBlock, number>>): StatBlock => ({
    hp: partial.hp ?? 0,
    atk: partial.atk ?? 0,
    def: partial.def ?? 0,
    spa: partial.spa ?? 0,
    spd: partial.spd ?? 0,
    spe: partial.spe ?? 0,
  });

  const input: SpecimenInput = {
    speciesId: speciesId as number,
    formId,
    nickname,
    level,
    isShiny,
    gender,
    nature,
    ability,
    heldItem,
    ball,
    otName,
    otId,
    metLocation,
    metDate,
    originGame,
    originEra,
    isEvent,
    eventName,
    notes,
    boxId,
    ivs: hasIvs ? fillStatBlock(ivs) : null,
    evs: hasEvs ? fillStatBlock(evs) : null,
    moves,
    ribbons,
  };

  return { input, errors };
};
