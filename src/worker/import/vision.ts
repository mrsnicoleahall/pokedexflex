/** A single Pokémon identified in a box screenshot. */
export type Recognized = { speciesName: string; shiny: boolean };

/** Identifies Pokémon present in a box screenshot from raw image bytes. */
export interface VisionRecognizer {
  recognize(image: ArrayBuffer): Promise<Recognized[]>;
}

/** Thrown when no vision backend is configured (e.g. `AI` binding absent). */
export class VisionUnavailableError extends Error {}

const CODE_FENCE = /```(?:json)?/gi;

/** Removes ``` / ```json code fences, leaving any surrounding prose intact. */
const stripCodeFences = (text: string): string => text.replace(CODE_FENCE, "").trim();

/**
 * Extracts a JSON array of `{name, shiny?}` objects from a vision model's
 * free-form text response and maps each to a `Recognized` entry. PURE and
 * never throws: it strips ```/```json code fences, locates the first `[`
 * through the last `]` (tolerating prose before/after and a stray trailing
 * comma), and parses that slice as JSON. Entries missing a `name` are
 * skipped; `shiny` defaults to `false` unless it is exactly `true`. Returns
 * `[]` if no array can be found or parsed.
 */
export function parseRecognition(modelText: string): Recognized[] {
  try {
    const unfenced = stripCodeFences(modelText);
    const start = unfenced.indexOf("[");
    const end = unfenced.lastIndexOf("]");
    if (start === -1 || end === -1 || end < start) return [];

    const jsonish = unfenced.slice(start, end + 1).replace(/,(\s*[\]}])/g, "$1");
    const parsed: unknown = JSON.parse(jsonish);
    if (!Array.isArray(parsed)) return [];

    const results: Recognized[] = [];
    for (const entry of parsed) {
      if (entry === null || typeof entry !== "object") continue;
      const { name, shiny } = entry as { name?: unknown; shiny?: unknown };
      if (name === undefined || name === null) continue;
      results.push({ speciesName: String(name).toLowerCase().trim(), shiny: shiny === true });
    }
    return results;
  } catch {
    return [];
  }
}

/** Workers AI vision model used to identify Pokémon in a box screenshot. */
const MODEL = "@cf/meta/llama-3.2-11b-vision-instruct";

const PROMPT =
  "List every Pokémon in this box screenshot as a JSON array of {name, shiny}. " +
  "Use lowercase English species names. Only output the JSON.";

/** Real vision recognizer backed by the Workers AI `AI` binding. */
export class WorkersAiRecognizer implements VisionRecognizer {
  constructor(private readonly ai: Ai) {}

  async recognize(image: ArrayBuffer): Promise<Recognized[]> {
    const result = await this.ai.run(MODEL, {
      image: [...new Uint8Array(image)],
      prompt: PROMPT,
    });
    return parseRecognition(result.response ?? "");
  }
}

/** Stand-in recognizer used when no `AI` binding is configured. */
class UnavailableRecognizer implements VisionRecognizer {
  async recognize(): Promise<Recognized[]> {
    throw new VisionUnavailableError("vision_unavailable");
  }
}

/** Returns a `WorkersAiRecognizer` when `env.AI` is bound, else a stub that throws. */
export function getRecognizer(env: Env): VisionRecognizer {
  return env.AI ? new WorkersAiRecognizer(env.AI) : new UnavailableRecognizer();
}
