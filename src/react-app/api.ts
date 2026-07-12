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
