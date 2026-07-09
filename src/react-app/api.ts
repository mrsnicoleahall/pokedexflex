// src/react-app/api.ts

export type FormDto = {
	id: number;
	name: string;
	formType: string;
	spriteUrl: string | null;
};

export type SpeciesDto = {
	id: number;
	name: string;
	generation: number;
	types: string[];
	spriteUrl: string | null;
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
