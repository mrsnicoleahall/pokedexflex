import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { specimens, species, forms, boxes } from "../../db/schema";
import { requireUser } from "../auth/current-user";
import { validateSpecimen, type SpecimenInput } from "../collection/validate";
import { parseCsv } from "../import/csv";
import { autoDetectMapping, rowToInput, type FieldMapping } from "../import/map";
import { toStorage, type SpecimenRow } from "./collection";

export const importRoutes = new Hono<{ Bindings: Env }>();

type Db = ReturnType<typeof getDb>;

/** Rows beyond this count are still validated/counted, but omitted from the response body. */
const PREVIEW_ROW_CAP = 200;

/**
 * Max rows per insert statement. D1 caps bound parameters at 100 per statement
 * (well under the SQLite compile-time default of 999); specimens has 29 columns,
 * so 3 rows/chunk (87 params) stays safely under that limit.
 */
const INSERT_CHUNK_SIZE = 3;

type RowResult = { input: SpecimenInput | null; errors: string[] };

/**
 * Loads the whole `species` table once and returns a resolver that maps a CSV/JSON
 * "species" value (a name, case-insensitive, or a numeric dex id) to a speciesId that
 * is known to exist — plus the raw id set, so downstream code can re-check existence
 * without another query. Doing this once up front avoids per-row species lookups.
 */
const buildSpeciesResolver = async (db: Db) => {
  const rows = await db.select({ id: species.id, name: species.name }).from(species);
  const idSet = new Set(rows.map((r) => r.id));
  const byName = new Map(rows.map((r) => [r.name.toLowerCase(), r.id]));

  const resolve = (nameOrDex: string): number | null => {
    const trimmed = nameOrDex.trim();
    if (trimmed === "") return null;
    if (/^\d+$/.test(trimmed)) {
      const n = Number(trimmed);
      if (n > 0 && idSet.has(n)) return n;
    }
    return byName.get(trimmed.toLowerCase()) ?? null;
  };

  return { resolve, idSet };
};

/** Builds+validates a specimen from one CSV data row. */
const buildCsvRow = (
  headers: string[],
  row: string[],
  mapping: FieldMapping,
  resolveSpecies: (nameOrDex: string) => number | null,
): RowResult => {
  const { input, errors } = rowToInput(headers, row, mapping, resolveSpecies);
  if (!input) return { input: null, errors };
  const result = validateSpecimen(input);
  if (!result.ok) return { input: null, errors: result.errors };
  return { input: result.value, errors: [] };
};

const isPositiveInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0;

/** All-31 IV block used when a source only records "perfect IVs" as a boolean flag. */
const PERFECT_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

/**
 * Normalizes a gender value: "Male"/"Female" (any case) map to "male"/"female"; any
 * other non-empty string (e.g. "Genderless") is lowercased as-is. Non-string values
 * (including null/undefined) pass through unchanged so downstream null-handling applies.
 */
const normalizeGender = (g: unknown): unknown => {
  if (typeof g !== "string") return g;
  const trimmed = g.trim();
  if (trimmed === "") return g;
  const lower = trimmed.toLowerCase();
  if (lower === "male" || lower === "female") return lower;
  return lower;
};

/** True if `v` is a plain (non-array) object, e.g. a stat block. */
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Builds+validates a specimen from one JSON object. Supports two shapes:
 * - Our own `/api/export` shape (speciesId, ivs object, moves[], otName, otId, isShiny, ...).
 * - The common third-party "automator" export shape (dex, name, shiny, ot_name, ot_id,
 *   held_item_slug, ability_slug, iv_perfect, moves: string[], ...).
 * Our own field names always take priority when both are present.
 */
const buildJsonRow = (raw: unknown, resolveSpecies: (nameOrDex: string) => number | null): RowResult => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { input: null, errors: ["row must be an object"] };
  }
  const obj = raw as Record<string, unknown>;

  let speciesId: number | null = null;
  if (isPositiveInt(obj.speciesId)) {
    speciesId = obj.speciesId;
  } else if (isPositiveInt(obj.dex)) {
    speciesId = obj.dex;
  } else {
    const nameCandidate = obj.species ?? obj.speciesName ?? obj.name;
    if (nameCandidate !== undefined && nameCandidate !== null && String(nameCandidate).trim() !== "") {
      speciesId = resolveSpecies(String(nameCandidate));
    }
  }
  if (speciesId === null) {
    const shown = obj.speciesId ?? obj.dex ?? obj.species ?? obj.speciesName ?? obj.name;
    const label = shown === undefined || shown === null || shown === "" ? "(missing)" : String(shown);
    return { input: null, errors: [`unknown species: ${label}`] };
  }

  const heldItemSlug = obj.held_item_slug;
  const heldItem =
    obj.heldItem ?? (typeof heldItemSlug === "string" && heldItemSlug !== "none" ? heldItemSlug : null);

  const ivsField = isPlainObject(obj.ivs) ? obj.ivs : obj.iv_perfect === true ? PERFECT_IVS : null;
  const evsField = isPlainObject(obj.evs) ? obj.evs : null;

  const normalized: Record<string, unknown> = {
    ...obj,
    speciesId,
    isShiny: obj.isShiny ?? obj.shiny,
    ability: obj.ability ?? obj.ability_slug,
    heldItem,
    otName: obj.otName ?? obj.ot_name,
    otId: String(obj.otId ?? obj.ot_id ?? "") || null,
    gender: normalizeGender(obj.gender),
    nickname: obj.nickname,
    ivs: ivsField,
    evs: evsField,
    level: typeof obj.level === "number" ? obj.level : null,
  };

  const result = validateSpecimen(normalized);
  if (!result.ok) return { input: null, errors: result.errors };
  return { input: result.value, errors: [] };
};

/**
 * Parses a JSON import body. Accepts, in order: a bare array of specimen-like objects;
 * `{ specimens: [...] }` (our own `/api/export` shape); or `{ catalogue: [...] }` (a
 * common third-party "automator" export shape).
 */
const parseJsonRows = (content: string): unknown[] | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && parsed !== null) {
    const specimensField = (parsed as Record<string, unknown>).specimens;
    if (Array.isArray(specimensField)) return specimensField;
    const catalogueField = (parsed as Record<string, unknown>).catalogue;
    if (Array.isArray(catalogueField)) return catalogueField;
  }
  return null;
};

type ImportBody = { format?: string; content?: string; mapping?: FieldMapping };

/** Validates+narrows the shared `{format, content, mapping?}` request body shape. */
const parseImportBody = (body: unknown): ImportBody | null => {
  if (typeof body !== "object" || body === null) return null;
  const { format, content, mapping } = body as ImportBody;
  if (format !== "csv" && format !== "json") return null;
  if (typeof content !== "string") return null;
  return { format, content, mapping };
};

/** Builds the full (uncapped) list of row results for a preview/commit request. */
const buildRows = (
  parsedBody: ImportBody,
  resolveSpecies: (nameOrDex: string) => number | null,
): { rows: RowResult[]; headers?: string[]; suggestedMapping?: FieldMapping } | null => {
  if (parsedBody.format === "csv") {
    const table = parseCsv(parsedBody.content!);
    const headers = table[0] ?? [];
    const dataRows = table.slice(1);
    const mapping = parsedBody.mapping ?? autoDetectMapping(headers);
    const rows = dataRows.map((row) => buildCsvRow(headers, row, mapping, resolveSpecies));
    return { rows, headers, suggestedMapping: mapping };
  }

  const jsonRows = parseJsonRows(parsedBody.content!);
  if (jsonRows === null) return null;
  const rows = jsonRows.map((raw) => buildJsonRow(raw, resolveSpecies));
  return { rows };
};

importRoutes.post("/preview", async (c) => {
  await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseImportBody(body);
  if (!parsedBody) return c.json({ error: "invalid_body" }, 400);

  const db = getDb(c.env.DB);
  const { resolve: resolveSpecies } = await buildSpeciesResolver(db);

  const built = buildRows(parsedBody, resolveSpecies);
  if (!built) return c.json({ error: "invalid_json_body" }, 400);

  const validCount = built.rows.filter((r) => r.input !== null).length;
  return c.json({
    headers: built.headers,
    suggestedMapping: built.suggestedMapping,
    rows: built.rows.slice(0, PREVIEW_ROW_CAP),
    validCount,
    errorCount: built.rows.length - validCount,
  });
});

importRoutes.post("/commit", async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json().catch(() => null);
  const parsedBody = parseImportBody(body);
  if (!parsedBody) return c.json({ error: "invalid_body" }, 400);

  const db = getDb(c.env.DB);
  const { resolve: resolveSpecies, idSet: speciesIdSet } = await buildSpeciesResolver(db);

  const built = buildRows(parsedBody, resolveSpecies);
  if (!built) return c.json({ error: "invalid_json_body" }, 400);

  // Load form/box reference sets once up front (never per-row) so bad refs are skipped,
  // not a 500 from a foreign-key violation at insert time.
  const formIdSet = new Set((await db.select({ id: forms.id }).from(forms)).map((r) => r.id));
  const boxIdSet = new Set(
    (await db.select({ id: boxes.id }).from(boxes).where(eq(boxes.userId, user.id))).map((r) => r.id),
  );

  const now = Date.now();
  const source = parsedBody.format === "csv" ? "csv" : "json";
  const rowsToInsert: SpecimenRow[] = [];
  let skipped = 0;

  for (const { input } of built.rows) {
    if (!input) {
      skipped++;
      continue;
    }
    if (!speciesIdSet.has(input.speciesId)) {
      skipped++;
      continue;
    }
    if (input.formId !== null && !formIdSet.has(input.formId)) {
      skipped++;
      continue;
    }
    if (input.boxId !== null && !boxIdSet.has(input.boxId)) {
      skipped++;
      continue;
    }
    rowsToInsert.push({
      id: crypto.randomUUID(),
      userId: user.id,
      source,
      createdAt: now,
      updatedAt: now,
      ...toStorage(input),
    });
  }

  // Insert in chunks (see INSERT_CHUNK_SIZE): a single insert of hundreds/thousands of
  // rows exceeds D1's per-statement bound-parameter cap and 500s, inserting nothing.
  for (let i = 0; i < rowsToInsert.length; i += INSERT_CHUNK_SIZE) {
    await db.insert(specimens).values(rowsToInsert.slice(i, i + INSERT_CHUNK_SIZE));
  }
  return c.json({ created: rowsToInsert.length, skipped });
});
