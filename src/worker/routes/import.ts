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

/**
 * Builds+validates a specimen from one JSON object (e.g. an `/api/export` entry, or a
 * hand-authored import row). Accepts a numeric `speciesId`, or a name/dex value under
 * `speciesId`/`species`/`speciesName`/`dex`, resolved via `resolveSpecies`.
 */
const buildJsonRow = (raw: unknown, resolveSpecies: (nameOrDex: string) => number | null): RowResult => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { input: null, errors: ["row must be an object"] };
  }
  const obj = { ...(raw as Record<string, unknown>) };
  const rawSpecies = obj.speciesId ?? obj.species ?? obj.speciesName ?? obj.dex;
  if (rawSpecies === undefined || rawSpecies === null || rawSpecies === "") {
    return { input: null, errors: ["unknown species: (missing)"] };
  }
  const resolved = resolveSpecies(String(rawSpecies));
  if (resolved === null) {
    return { input: null, errors: [`unknown species: ${String(rawSpecies)}`] };
  }
  obj.speciesId = resolved;

  const result = validateSpecimen(obj);
  if (!result.ok) return { input: null, errors: result.errors };
  return { input: result.value, errors: [] };
};

/** Parses a JSON import body: either a bare array of specimen-like objects, or `{ specimens: [...] }`. */
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

  if (rowsToInsert.length > 0) await db.insert(specimens).values(rowsToInsert);
  return c.json({ created: rowsToInsert.length, skipped });
});
