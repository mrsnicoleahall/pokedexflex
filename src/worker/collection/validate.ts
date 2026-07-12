export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface SpecimenInput {
  speciesId: number;
  formId: number | null;
  nickname: string | null;
  level: number | null;
  isShiny: 0 | 1;
  gender: string | null;
  nature: string | null;
  ability: string | null;
  heldItem: string | null;
  ball: string | null;
  otName: string | null;
  otId: string | null;
  metLocation: string | null;
  metDate: string | null;
  originGame: string | null;
  originEra: string | null;
  isEvent: 0 | 1;
  eventName: string | null;
  notes: string | null;
  boxId: string | null;
  ivs: StatBlock | null;
  evs: StatBlock | null;
  moves: string[];
  ribbons: string[];
}

export type ValidationResult =
  | { ok: true; value: SpecimenInput }
  | { ok: false; errors: string[] };

const STAT_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;

/** Trims a value to a non-empty string, or null if empty/absent. */
const asString = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

/** Coerces truthy/falsy-ish values (booleans, 0/1, "true"/"false") to a 0/1 bit. */
const asBit = (v: unknown, fallback: 0 | 1 = 0): 0 | 1 => {
  if (v === undefined || v === null || v === "") return fallback;
  if (v === true || v === 1 || v === "1" || v === "true") return 1;
  if (v === false || v === 0 || v === "0" || v === "false") return 0;
  return fallback;
};

/** Validates a stat block (IVs or EVs), pushing messages onto `errors`. */
const parseStatBlock = (
  value: unknown,
  label: string,
  min: number,
  max: number,
  errors: string[],
  checkSum: boolean,
): StatBlock | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${label} must be an object`);
    return null;
  }
  const source = value as Record<string, unknown>;
  const out = {} as StatBlock;
  let sum = 0;
  for (const key of STAT_KEYS) {
    const raw = source[key];
    const n = raw === undefined || raw === null || raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`${label}.${key} must be an integer between ${min} and ${max}`);
    }
    out[key] = Number.isFinite(n) ? n : 0;
    sum += out[key];
  }
  if (checkSum && sum > 510) errors.push(`${label} total must not exceed 510`);
  return out;
};

/** Validates and normalizes a raw specimen payload (POST body, or a merged PATCH result). */
export const validateSpecimen = (input: unknown): ValidationResult => {
  const errors: string[] = [];
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["body must be an object"] };
  }
  const raw = input as Record<string, unknown>;

  const speciesId = Number(raw.speciesId);
  if (!Number.isInteger(speciesId) || speciesId <= 0) {
    errors.push("speciesId must be a positive integer");
  }

  let formId: number | null = null;
  if (raw.formId !== undefined && raw.formId !== null && raw.formId !== "") {
    const n = Number(raw.formId);
    if (!Number.isInteger(n) || n <= 0) errors.push("formId must be a positive integer");
    else formId = n;
  }

  let level: number | null = null;
  if (raw.level !== undefined && raw.level !== null && raw.level !== "") {
    const n = Number(raw.level);
    if (!Number.isInteger(n) || n < 1 || n > 100) errors.push("level must be an integer between 1 and 100");
    else level = n;
  }

  const ivs = parseStatBlock(raw.ivs, "ivs", 0, 31, errors, false);
  const evs = parseStatBlock(raw.evs, "evs", 0, 252, errors, true);

  let moves: string[] = [];
  if (raw.moves !== undefined && raw.moves !== null) {
    if (!Array.isArray(raw.moves)) {
      errors.push("moves must be an array");
    } else {
      moves = raw.moves.map((m) => String(m).trim()).filter((m) => m !== "");
      if (moves.length > 4) errors.push("moves must contain at most 4 entries");
    }
  }

  let ribbons: string[] = [];
  if (raw.ribbons !== undefined && raw.ribbons !== null) {
    if (!Array.isArray(raw.ribbons)) {
      errors.push("ribbons must be an array");
    } else {
      ribbons = raw.ribbons.map((r) => String(r).trim()).filter((r) => r !== "");
    }
  }

  const value: SpecimenInput = {
    speciesId,
    formId,
    nickname: asString(raw.nickname),
    level,
    isShiny: asBit(raw.isShiny),
    gender: asString(raw.gender),
    nature: asString(raw.nature),
    ability: asString(raw.ability),
    heldItem: asString(raw.heldItem),
    ball: asString(raw.ball),
    otName: asString(raw.otName),
    otId: asString(raw.otId),
    metLocation: asString(raw.metLocation),
    metDate: asString(raw.metDate),
    originGame: asString(raw.originGame),
    originEra: asString(raw.originEra),
    isEvent: asBit(raw.isEvent),
    eventName: asString(raw.eventName),
    notes: asString(raw.notes),
    boxId: asString(raw.boxId),
    ivs,
    evs,
    moves,
    ribbons,
  };

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
};
