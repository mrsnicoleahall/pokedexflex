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
