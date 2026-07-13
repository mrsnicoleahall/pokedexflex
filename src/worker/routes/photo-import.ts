import { Hono, type Context } from "hono";
import { requireUser } from "../auth/current-user";
import { getDb } from "../db";
import { species } from "../../db/schema";
import { validateSpecimen, type SpecimenInput } from "../collection/validate";
import { getRecognizer, VisionUnavailableError, type VisionRecognizer } from "../import/vision";

export const photoImportRoutes = new Hono<{ Bindings: Env }>();

type RowResult = { input: SpecimenInput | null; errors: string[] };

/** Test-only override for the recognizer, so tests never call the real Workers AI binding. */
let recognizerOverride: VisionRecognizer | null = null;

/** Injects (or clears, via `null`) a mock recognizer for tests. */
export const __setRecognizerForTest = (recognizer: VisionRecognizer | null): void => {
  recognizerOverride = recognizer;
};

/** Resolves the recognizer to use: the test override if set, else the real/stub one from `getRecognizer`. */
const resolveRecognizer = (env: Env): VisionRecognizer => recognizerOverride ?? getRecognizer(env);

/**
 * Whether an error from `recognizer.recognize()` means the vision backend is unavailable —
 * either the explicit `VisionUnavailableError` (no `AI` binding configured), or, in the
 * `@cloudflare/vitest-pool-workers` test runner (which runs with `remoteBindings: false`),
 * the `AI` binding is present but throws "needs to be run remotely" as soon as it's actually
 * invoked, since Workers AI has no local simulator. Both cases mean the same thing to a
 * caller of this route: no recognition is possible right now.
 */
const isVisionUnavailable = (err: unknown): boolean =>
  err instanceof VisionUnavailableError ||
  (err instanceof Error && /needs to be run remotely/i.test(err.message));

/** Extracts the uploaded image's raw bytes from a multipart form (`image` field) or a JSON `{imageBase64}` body. */
const extractImageBytes = async (c: Context<{ Bindings: Env }>): Promise<ArrayBuffer | null> => {
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) return null;
    return await file.arrayBuffer();
  }
  if (contentType.includes("application/json")) {
    const body = await c.req.json().catch(() => null);
    if (typeof body !== "object" || body === null) return null;
    const b64 = (body as Record<string, unknown>).imageBase64;
    if (typeof b64 !== "string" || b64 === "") return null;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }
  return null;
};

/** Best-effort upload of the raw image to R2 under a per-user key; storage failures never fail the request. */
const storeUpload = async (env: Env, userId: string, bytes: ArrayBuffer): Promise<void> => {
  try {
    await env.SPRITES.put(`uploads/${userId}/${crypto.randomUUID()}`, bytes);
  } catch (err) {
    console.error("photo-import: failed to store upload to R2", err);
  }
};

photoImportRoutes.post("/preview", async (c) => {
  const user = await requireUser(c);

  const bytes = await extractImageBytes(c);
  if (!bytes) return c.json({ error: "missing_image" }, 400);

  await storeUpload(c.env, user.id, bytes);

  let recognized;
  try {
    const recognizer = resolveRecognizer(c.env);
    recognized = await recognizer.recognize(bytes);
  } catch (err) {
    if (isVisionUnavailable(err)) return c.json({ error: "vision_unavailable" }, 503);
    throw err;
  }

  const db = getDb(c.env.DB);
  const speciesRows = await db.select({ id: species.id, name: species.name }).from(species);
  const byName = new Map(speciesRows.map((r) => [r.name.toLowerCase(), r.id]));

  const rows: RowResult[] = recognized.map((r) => {
    const speciesId = byName.get(r.speciesName.toLowerCase().trim());
    if (speciesId === undefined) {
      return { input: null, errors: [`unknown species: ${r.speciesName}`] };
    }
    const result = validateSpecimen({ speciesId, isShiny: r.shiny });
    if (!result.ok) return { input: null, errors: result.errors };
    return { input: result.value, errors: [] };
  });

  const validCount = rows.filter((r) => r.input !== null).length;
  return c.json({
    rows,
    validCount,
    errorCount: rows.length - validCount,
  });
});
