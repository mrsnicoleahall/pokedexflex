/**
 * Pure validation + suggestion for public-profile handles (Flex Phase F).
 * No I/O — mirrors `src/worker/profile/validate.ts`'s `{ok, value|errors}`
 * shape. Uniqueness is deliberately NOT checked here (it needs the DB); the
 * route (`routes/profile.ts`) does the case-insensitive uniqueness check
 * against normalized, always-lowercased stored handles. Consumed by
 * `routes/profile.ts`; unit-tested directly here.
 */

/** Route/app words a handle may never be, so `/u/:handle` can never shadow a real path or a reserved concept. */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "api", "u", "admin", "settings", "home", "species", "events", "collection",
  "ribbons", "versus", "login", "logout", "signin", "signout", "auth", "profile",
  "me", "favorites", "showcase", "import", "export", "sprites", "assets", "static",
  "help", "about", "root", "new", "edit", "null", "undefined", "true", "false",
]);

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;

/** Only lowercase alphanumerics and single interior hyphens — no leading/trailing/double hyphen. */
const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Lowercase + trim. Handles are ALWAYS stored normalized, which is what makes the DB uniqueness check case-insensitive. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export type HandleValidationResult = { ok: true; value: string } | { ok: false; errors: string[] };

/**
 * Validates a candidate handle (after normalization): allowed characters,
 * length bounds, and the reserved-word blocklist. Returns the normalized
 * value on success. Does not touch the DB — uniqueness is the route's job.
 */
export function validateHandle(raw: unknown): HandleValidationResult {
  if (typeof raw !== "string") return { ok: false, errors: ["handle must be a string"] };
  const value = normalizeHandle(raw);
  const errors: string[] = [];

  if (value.length < HANDLE_MIN) errors.push(`handle must be at least ${HANDLE_MIN} characters`);
  else if (value.length > HANDLE_MAX) errors.push(`handle must be at most ${HANDLE_MAX} characters`);

  if (!HANDLE_PATTERN.test(value)) {
    errors.push("handle may use only lowercase letters, numbers, and single hyphens (no leading, trailing, or doubled hyphens)");
  } else if (RESERVED_HANDLES.has(value)) {
    // Only meaningful once the pattern passed (a reserved word is always pattern-valid).
    errors.push("that handle is reserved");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value };
}

/**
 * Slugifies a display name into a valid handle BASE (never the final handle —
 * the route appends a numeric suffix if needed for uniqueness). Strips to
 * `a-z0-9`, collapses separators into single hyphens, trims hyphens, and caps
 * length to leave room for a suffix. Falls back to `"trainer"` when the name
 * yields fewer than `HANDLE_MIN` usable characters. Guaranteed to itself pass
 * `validateHandle`.
 */
export function suggestHandleBase(displayName: string): string {
  const slug = displayName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const capped = slug.slice(0, 24).replace(/-$/g, "");
  return capped.length >= HANDLE_MIN ? capped : "trainer";
}
