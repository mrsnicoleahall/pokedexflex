/**
 * Pure validation for the Trainer Profile fields (Flex Phase P): the fixed
 * gender enum and display-name trim/length rules. No I/O — mirrors
 * `src/worker/collection/validate.ts`'s `{ok, value|errors}` shape. Consumed
 * by `routes/profile.ts`; unit-tested directly here.
 */

/** Fixed, on-theme gender set for this app — not a general identity field. Stored lowercased. */
export const GENDERS = ["boy", "girl", "ditto"] as const;
export type Gender = (typeof GENDERS)[number];

const isGender = (v: string): v is Gender => (GENDERS as readonly string[]).includes(v);

/** Display names longer than this are rejected — generous for any real name/nickname, short enough to fit the UI. */
export const DISPLAY_NAME_MAX = 40;

export type ProfileInput = { displayName?: string; gender?: Gender };
export type ProfileValidationResult = { ok: true; value: ProfileInput } | { ok: false; errors: string[] };

/**
 * Validates a partial profile update. Either field may be omitted (a
 * partial update); if present, it must be valid. An input with neither
 * field returns `{ok: true, value: {}}` — the route (not this pure
 * function) decides whether "nothing to update" is itself an error.
 */
export function validateProfileInput(body: unknown): ProfileValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: ["body must be an object"] };
  }
  const b = body as Record<string, unknown>;
  const errors: string[] = [];
  const value: ProfileInput = {};

  if ("displayName" in b) {
    const raw = b.displayName;
    if (typeof raw !== "string") {
      errors.push("displayName must be a string");
    } else {
      const trimmed = raw.trim();
      if (trimmed === "") errors.push("displayName must not be empty");
      else if (trimmed.length > DISPLAY_NAME_MAX) errors.push(`displayName must be at most ${DISPLAY_NAME_MAX} characters`);
      else value.displayName = trimmed;
    }
  }

  if ("gender" in b) {
    const raw = b.gender;
    const lower = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!isGender(lower)) {
      errors.push(`gender must be one of: ${GENDERS.join(", ")}`);
    } else {
      value.gender = lower;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}
