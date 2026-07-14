// src/react-app/api.ts

export type FormDto = {
	id: number;
	name: string;
	formType: string;
	spriteUrl: string | null;
	homeId: number | null;
};

export type SpeciesDto = {
	id: number;
	name: string;
	generation: number;
	types: string[];
	spriteUrl: string | null;
	homeId: number | null;
	forms: FormDto[];
	owned: boolean;
};

export async function fetchSpecies(
	params: { q?: string; gen?: number } = {},
): Promise<{ items: SpeciesDto[]; total: number }> {
	const qs = new URLSearchParams();
	if (params.q) qs.set("q", params.q);
	if (params.gen) qs.set("gen", String(params.gen));
	const res = await fetch(`/api/species?${qs}`);
	if (!res.ok) throw new Error(`species fetch failed: ${res.status}`);
	return res.json() as Promise<{ items: SpeciesDto[]; total: number }>;
}

/** Fetches a single species (with its forms) by id — used to hydrate the specimen editor. */
export async function fetchSpeciesById(id: number): Promise<SpeciesDto> {
	const res = await fetch(`/api/species/${id}`);
	if (!res.ok) throw new Error(`species fetch failed: ${res.status}`);
	return res.json() as Promise<SpeciesDto>;
}

export type EventDto = {
	id: number;
	slug: string;
	name: string;
	speciesId: number;
	speciesName: string;
	speciesTypes: string[];
	homeId: number | null;
	year: number | null;
	games: string | null;
	region: string | null;
	method: string | null;
	otName: string | null;
	otId: string | null;
	ribbon: string | null;
	isShiny: boolean;
	notes: string | null;
	owned: boolean;
};

export async function fetchEvents(
	params: { q?: string; gen?: number; limit?: number; offset?: number } = {},
): Promise<{ items: EventDto[]; total: number }> {
	const qs = new URLSearchParams();
	if (params.q) qs.set("q", params.q);
	if (params.gen) qs.set("gen", String(params.gen));
	if (params.limit) qs.set("limit", String(params.limit));
	if (params.offset) qs.set("offset", String(params.offset));
	const res = await fetch(`/api/events?${qs}`);
	if (!res.ok) throw new Error(`events fetch failed: ${res.status}`);
	return res.json() as Promise<{ items: EventDto[]; total: number }>;
}

/* ---------- Collection ---------- */

/** Thrown by any collection/box helper when the server responds 401 (no/expired session). */
export class AuthRequiredError extends Error {
	constructor() {
		super("sign in required");
		this.name = "AuthRequiredError";
	}
}

/** Thrown when the server responds 400 with a validation `{ errors: string[] }` body. */
export class ApiValidationError extends Error {
	errors: string[];
	constructor(errors: string[]) {
		super(errors.join("; ") || "validation failed");
		this.name = "ApiValidationError";
		this.errors = errors;
	}
}

/**
 * Shared response handler: surfaces 401s as `AuthRequiredError`, 400s carrying a validation
 * `{ errors: string[] }` body as `ApiValidationError` (so callers can show the exact server
 * messages), and any other non-ok status as a plain Error.
 */
async function handleJson<T>(res: Response, action: string): Promise<T> {
	if (res.status === 401) throw new AuthRequiredError();
	if (!res.ok) {
		if (res.status === 400) {
			const body = (await res.json().catch(() => null)) as { errors?: unknown } | null;
			if (Array.isArray(body?.errors) && body.errors.length > 0) {
				throw new ApiValidationError(body.errors.map((e) => String(e)));
			}
		}
		throw new Error(`${action} failed: ${res.status}`);
	}
	return res.json() as Promise<T>;
}

export type StatBlock = {
	hp: number;
	atk: number;
	def: number;
	spa: number;
	spd: number;
	spe: number;
};

export type SpecimenDto = {
	id: string;
	speciesId: number;
	speciesName: string;
	homeId: number | null;
	types: string[];
	formId: number | null;
	nickname: string | null;
	level: number | null;
	isShiny: boolean;
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
	isEvent: boolean;
	eventName: string | null;
	ribbons: string[];
	ivs: StatBlock | null;
	evs: StatBlock | null;
	moves: string[];
	notes: string | null;
	boxId: string | null;
	createdAt: number;
	updatedAt: number;
};

/** Writable subset of `SpecimenDto` accepted by create/update — everything but `speciesId` is optional. */
export type SpecimenInput = {
	speciesId: number;
	formId?: number | null;
	nickname?: string | null;
	level?: number | null;
	isShiny?: boolean;
	gender?: string | null;
	nature?: string | null;
	ability?: string | null;
	heldItem?: string | null;
	ball?: string | null;
	otName?: string | null;
	otId?: string | null;
	metLocation?: string | null;
	metDate?: string | null;
	originGame?: string | null;
	originEra?: string | null;
	isEvent?: boolean;
	eventName?: string | null;
	ribbons?: string[];
	ivs?: StatBlock | null;
	evs?: StatBlock | null;
	moves?: string[];
	notes?: string | null;
	boxId?: string | null;
};

export async function listCollection(
	params: { q?: string; box?: string; limit?: number; offset?: number } = {},
): Promise<{ items: SpecimenDto[]; total: number }> {
	const qs = new URLSearchParams();
	if (params.q) qs.set("q", params.q);
	if (params.box) qs.set("box", params.box);
	if (params.limit) qs.set("limit", String(params.limit));
	if (params.offset) qs.set("offset", String(params.offset));
	const res = await fetch(`/api/collection?${qs}`, { credentials: "include" });
	return handleJson<{ items: SpecimenDto[]; total: number }>(res, "collection fetch");
}

export async function createSpecimen(input: SpecimenInput): Promise<SpecimenDto> {
	const res = await fetch("/api/collection", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
	return handleJson<SpecimenDto>(res, "create specimen");
}

export async function getSpecimen(id: string): Promise<SpecimenDto> {
	const res = await fetch(`/api/collection/${id}`, { credentials: "include" });
	return handleJson<SpecimenDto>(res, "specimen fetch");
}

export async function updateSpecimen(id: string, input: Partial<SpecimenInput>): Promise<SpecimenDto> {
	const res = await fetch(`/api/collection/${id}`, {
		method: "PATCH",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(input),
	});
	return handleJson<SpecimenDto>(res, "update specimen");
}

export async function deleteSpecimen(id: string): Promise<void> {
	const res = await fetch(`/api/collection/${id}`, {
		method: "DELETE",
		credentials: "include",
	});
	await handleJson<{ ok: boolean }>(res, "delete specimen");
}

/* ---------- Boxes ---------- */

export type BoxDto = {
	id: string;
	name: string;
	count: number;
};

export async function listBoxes(): Promise<{ boxes: BoxDto[] }> {
	const res = await fetch("/api/boxes", { credentials: "include" });
	return handleJson<{ boxes: BoxDto[] }>(res, "boxes fetch");
}

export async function createBox(name: string): Promise<BoxDto> {
	const res = await fetch("/api/boxes", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name }),
	});
	return handleJson<BoxDto>(res, "create box");
}

export async function renameBox(id: string, name: string): Promise<BoxDto> {
	const res = await fetch(`/api/boxes/${id}`, {
		method: "PATCH",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ name }),
	});
	return handleJson<BoxDto>(res, "rename box");
}

export async function deleteBox(id: string): Promise<void> {
	const res = await fetch(`/api/boxes/${id}`, {
		method: "DELETE",
		credentials: "include",
	});
	await handleJson<{ ok: boolean }>(res, "delete box");
}

/* ---------- Ribbons ---------- */

export type RibbonDto = {
	id: string;
	name: string;
	description: string;
	category: string;
	earned: boolean;
	progress: { current: number; total: number };
	/** Hidden easter-egg ribbon: the UI must not reveal name/description until earned. */
	secret?: boolean;
	/** Points this ribbon contributes to trainerScore once earned (Flex Phase D). */
	points: number;
	/** Fraction (0..1) of all registered users who have earned this ribbon. */
	rarityPct: number;
	/** True if earned but not yet acknowledged via `ackRibbonsSeen` — drives the earn-moment toast (Phase E). */
	newlyEarned: boolean;
};

export type RibbonsResponse = {
	ribbons: RibbonDto[];
	earnedCount: number;
	total: number;
	/** Sum of `points` across every ribbon the signed-in user has earned; 0 when logged out. */
	trainerScore: number;
	/** Rank title derived from `trainerScore` (e.g. "Novice" .. "Living Legend"); "Novice" when logged out. */
	rank: string;
	/** 6 fixed showcase slots, in slot order; `null` for an empty slot. All-null when logged out. */
	showcase: (string | null)[];
	/** Top ~5 locked, non-secret ribbons closest to completion, for dashboard nudges (Phase E). */
	nearest: RibbonDto[];
};

export async function fetchRibbons(): Promise<RibbonsResponse> {
	const res = await fetch("/api/ribbons", { credentials: "include" });
	if (!res.ok) throw new Error(`ribbons fetch failed: ${res.status}`);
	return res.json() as Promise<RibbonsResponse>;
}

/**
 * Pins up to 6 earned ribbon ids (array index = slot) to the signed-in
 * user's showcase. The server validates ownership + earned status — an
 * unearned or duplicate id, or more than 6 ids, is rejected with a 400
 * `{errors}` body (surfaced as `ApiValidationError` by `handleJson`).
 */
export async function setRibbonShowcase(ribbonIds: string[]): Promise<{ showcase: (string | null)[] }> {
	const res = await fetch("/api/ribbons/showcase", {
		method: "PUT",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ ribbonIds }),
	});
	return handleJson<{ showcase: (string | null)[] }>(res, "set ribbon showcase");
}

/** Acknowledges all outstanding earn moments (bumps `seenAt`) so `newlyEarned` clears on the next fetch. */
export async function ackRibbonsSeen(): Promise<void> {
	const res = await fetch("/api/ribbons/seen", { method: "POST", credentials: "include" });
	await handleJson<{ ok: boolean }>(res, "ack ribbons seen");
}

/* ---------- Import / Export ---------- */

export type ImportFormat = "csv" | "json";

/**
 * A CSV header (verbatim) or, for JSON imports, unused — maps to a specimen
 * field key (see `src/worker/import/map.ts`'s `FieldMapping`), the `"species"`
 * sentinel, or `null` to ignore the column.
 */
export type FieldMapping = Record<string, string | null>;

export type ImportRowResult = {
	/** The validated specimen-input object for this row, or `null` if it failed validation. */
	input: unknown;
	errors: string[];
};

export type ImportPreviewResponse = {
	/** CSV column headers, in order (present for `format: "csv"` only). */
	headers?: string[];
	/** Server's best-guess column mapping (present for `format: "csv"` only). */
	suggestedMapping?: FieldMapping;
	/** Per-row results, capped server-side to a preview window. */
	rows: ImportRowResult[];
	validCount: number;
	errorCount: number;
};

export type ImportCommitResponse = {
	created: number;
	skipped: number;
};

/**
 * Shared params for `importPreview`/`importCommit`: either pasted/small text via `content`
 * (sent as a JSON body), or a `File` (sent as `multipart/form-data` so a large file's bytes
 * aren't embedded/escaped inside a JSON string — that bloats the body enough to blow past the
 * server's JSON body-size limit for real multi-MB imports).
 */
export type ImportParams = {
	format: ImportFormat;
	mapping?: FieldMapping;
} & ({ content: string; file?: undefined } | { file: File; content?: undefined });

/** Builds the fetch `body`+`headers` for an import request: multipart for a `File`, JSON for pasted `content`. */
function buildImportRequestInit(params: ImportParams): { headers?: HeadersInit; body: BodyInit } {
	if (params.file) {
		const form = new FormData();
		form.append("file", params.file);
		form.append("format", params.format);
		if (params.mapping) form.append("mapping", JSON.stringify(params.mapping));
		return { body: form };
	}
	return {
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ format: params.format, content: params.content, mapping: params.mapping }),
	};
}

export async function importPreview(params: ImportParams): Promise<ImportPreviewResponse> {
	const { headers, body } = buildImportRequestInit(params);
	const res = await fetch("/api/import/preview", {
		method: "POST",
		credentials: "include",
		headers,
		body,
	});
	return handleJson<ImportPreviewResponse>(res, "import preview");
}

export async function importCommit(params: ImportParams): Promise<ImportCommitResponse> {
	const { headers, body } = buildImportRequestInit(params);
	const res = await fetch("/api/import/commit", {
		method: "POST",
		credentials: "include",
		headers,
		body,
	});
	return handleJson<ImportCommitResponse>(res, "import commit");
}

/**
 * Thrown by `photoPreview` when the server's `503 { error: "vision_unavailable" }` response
 * means no vision backend is configured (e.g. local dev without the Cloudflare `AI` binding).
 * Callers should show a friendly "not available yet" message rather than treating this as a
 * crash-worthy error.
 */
export class VisionUnavailableError extends Error {
	constructor() {
		super("photo recognition isn't available in this environment yet");
		this.name = "VisionUnavailableError";
	}
}

/**
 * Uploads a box screenshot for AI recognition and returns the same preview shape as
 * `importPreview` (`{ rows, validCount, errorCount }`), one row per Pokémon the vision model
 * found. Throws `VisionUnavailableError` on a `503` (no vision backend configured) so the UI
 * can distinguish "try again later" from a genuine failure.
 */
export async function photoPreview(image: File): Promise<ImportPreviewResponse> {
	const form = new FormData();
	form.append("image", image);
	const res = await fetch("/api/import/photo/preview", {
		method: "POST",
		credentials: "include",
		body: form,
	});
	if (res.status === 503) throw new VisionUnavailableError();
	return handleJson<ImportPreviewResponse>(res, "photo preview");
}

/**
 * Thrown by `savePreview` when the server responds `400 {error:"unsupported_save"}` — the
 * uploaded file isn't a save the parser recognizes (only Gen 7 Ultra Sun/Ultra Moon saves are
 * supported). Callers should show a friendly "not a USUM save" message rather than a generic one.
 */
export class UnsupportedSaveError extends Error {
	constructor() {
		super("that doesn't look like a supported save file");
		this.name = "UnsupportedSaveError";
	}
}

/**
 * Uploads a Gen 7 Ultra Sun/Ultra Moon save file (multipart field `save`) for box/party parsing
 * and returns the same preview shape as `importPreview`/`photoPreview` (`{ rows, validCount,
 * errorCount }`), one row per recognized Pokémon. Throws `UnsupportedSaveError` on a `400
 * {error:"unsupported_save"}` response (not a recognized USUM save) so the UI can show a
 * friendly message instead of a generic failure.
 */
export async function savePreview(file: File): Promise<ImportPreviewResponse> {
	const form = new FormData();
	form.append("save", file);
	const res = await fetch("/api/import/save/preview", {
		method: "POST",
		credentials: "include",
		body: form,
	});
	if (res.status === 400) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		if (body?.error === "unsupported_save") throw new UnsupportedSaveError();
	}
	return handleJson<ImportPreviewResponse>(res, "save preview");
}

export type ExportResponse = {
	exportedAt: number;
	count: number;
	/** Re-importable specimen objects (see `GET /api/export`) — plain, JSON-decoded rows. */
	specimens: Record<string, unknown>[];
};

export async function exportCollection(): Promise<ExportResponse> {
	const res = await fetch("/api/export", { credentials: "include" });
	return handleJson<ExportResponse>(res, "export collection");
}

/* ---------- Auth ---------- */

export type UserDto = {
	id: string;
	email: string;
	displayName: string | null;
};

export async function authRequestLink(
	email: string,
): Promise<{ ok: boolean; devLink?: string }> {
	const res = await fetch("/api/auth/request-link", {
		method: "POST",
		credentials: "include",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email }),
	});
	if (!res.ok) throw new Error(`request-link failed: ${res.status}`);
	return res.json() as Promise<{ ok: boolean; devLink?: string }>;
}

export async function authMe(): Promise<{ user: UserDto | null }> {
	try {
		const res = await fetch("/api/auth/me", { credentials: "include" });
		if (!res.ok) return { user: null };
		return (await res.json()) as { user: UserDto | null };
	} catch {
		return { user: null };
	}
}

export async function authLogout(): Promise<void> {
	const res = await fetch("/api/auth/logout", {
		method: "POST",
		credentials: "include",
	});
	if (!res.ok) throw new Error(`logout failed: ${res.status}`);
}

export async function authDeleteAccount(): Promise<void> {
	const res = await fetch("/api/auth/account", {
		method: "DELETE",
		credentials: "include",
	});
	if (!res.ok) throw new Error(`delete account failed: ${res.status}`);
}
