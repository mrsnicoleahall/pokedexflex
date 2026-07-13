import { Hono, type Context } from "hono";
import { requireUser } from "../auth/current-user";
import { getDb } from "../db";
import { species } from "../../db/schema";
import { validateSpecimen, type SpecimenInput } from "../collection/validate";
import { readUsumBoxes, UnsupportedSaveError } from "../import/usum-save";
import type { ParsedMon } from "../import/pk7";

export const saveImportRoutes = new Hono<{ Bindings: Env }>();

type RowResult = { input: SpecimenInput | null; errors: string[] };

/** Extracts the uploaded save file's raw bytes from a multipart form (`save` field). */
const extractSaveBytes = async (c: Context<{ Bindings: Env }>): Promise<Uint8Array | null> => {
  const contentType = c.req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) return null;
  const form = await c.req.formData();
  const file = form.get("save");
  if (!(file instanceof Blob)) return null;
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
};

/** Maps one `ParsedMon` from a USUM save into a Phase-4 `{input, errors}` preview row. */
const buildRow = (mon: ParsedMon, speciesIdSet: Set<number>): RowResult => {
  if (!speciesIdSet.has(mon.species)) {
    return { input: null, errors: [`unknown species: ${mon.species}`] };
  }

  const raw: Record<string, unknown> = {
    speciesId: mon.species,
    isShiny: mon.shiny,
    nickname: mon.nickname,
    level: mon.level,
    ivs: mon.ivs ?? undefined,
    evs: mon.evs ?? undefined,
    moves: mon.moves.filter((m) => m > 0).map(String),
    otName: mon.otName,
    otId: mon.otId,
    heldItem: mon.heldItem ? String(mon.heldItem) : undefined,
  };

  const result = validateSpecimen(raw);
  if (!result.ok) return { input: null, errors: result.errors };
  return { input: result.value, errors: [] };
};

saveImportRoutes.post("/preview", async (c) => {
  await requireUser(c);

  const bytes = await extractSaveBytes(c);
  if (!bytes) return c.json({ error: "missing_save" }, 400);

  let parsed: ParsedMon[];
  try {
    parsed = readUsumBoxes(bytes);
  } catch (err) {
    if (err instanceof UnsupportedSaveError) return c.json({ error: "unsupported_save" }, 400);
    throw err;
  }

  const db = getDb(c.env.DB);
  const speciesRows = await db.select({ id: species.id }).from(species);
  const speciesIdSet = new Set(speciesRows.map((r) => r.id));

  const rows: RowResult[] = parsed.map((mon) => buildRow(mon, speciesIdSet));

  const validCount = rows.filter((r) => r.input !== null).length;
  return c.json({
    rows,
    validCount,
    errorCount: rows.length - validCount,
  });
});
