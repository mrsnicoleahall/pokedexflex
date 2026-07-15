// src/react-app/profile/display.ts
//
// DOM-free helpers for the Trainer Profile UI (Flex Phase P): the gender
// option list, an initials fallback for the Avatar placeholder, the avatar
// image URL builder, and the onboarding-required predicate. No fetch, no
// DOM, no React — kept separate from components so it's unit-testable the
// same way src/react-app/ribbons/incentiveDisplay.ts is. Must never import
// api.ts or any component (see the BUILD-GATE GOTCHA in this plan's Global
// Constraints — tests/tsconfig.json has no DOM lib).

export const GENDER_OPTIONS: readonly { value: "boy" | "girl" | "ditto"; label: string }[] = [
	{ value: "boy", label: "Boy" },
	{ value: "girl", label: "Girl" },
	{ value: "ditto", label: "Ditto" },
];

/** Neutral placeholder for wherever a display name isn't available yet — never email. */
export const NAME_PLACEHOLDER = "Trainer";

/** Public avatar image URL for a user id (the server 404s if they have none — callers use `hasAvatar` to decide whether to render it). */
export function avatarUrl(userId: string): string {
	return `/api/profile/avatar/${userId}`;
}

/**
 * Up to 2 initials from a display name (e.g. "Ash Ketchum" -> "AK", "Ash" ->
 * "A"), uppercased. Falls back to "?" for a null/empty/blank name — never
 * derives initials from an email address.
 */
export function initials(displayName: string | null): string {
	if (!displayName) return "?";
	const parts = displayName.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "?";
	const first = parts[0][0] ?? "";
	const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
	const combined = (first + last).toUpperCase();
	return combined === "" ? "?" : combined;
}

/**
 * True when a signed-in user must complete onboarding before using the rest
 * of the app: a display name AND a gender are both required. Photo is never
 * required — it plays no part in this check. `null` (signed out) never
 * needs onboarding, since there's no profile to complete yet.
 */
export function needsOnboarding(user: { displayName: string | null; gender: string | null } | null): boolean {
	return user !== null && (!user.displayName || !user.gender);
}
