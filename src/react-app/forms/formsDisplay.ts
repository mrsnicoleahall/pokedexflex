// src/react-app/forms/formsDisplay.ts
//
// DOM-free grouping + display logic for the Forms gallery. Takes the raw form
// rows from GET /api/forms and buckets them into browsable families (the four
// regional variants split apart, plus the cosmetic/battle families), with a
// cleaned-up display name and per-family "how to obtain" copy. Pure + unit
// tested — no React, no fetch (mirrors leaderboardDisplay.ts).

export type FormItem = {
	formId: number;
	speciesId: number;
	name: string;
	formType: string;
	homeId: number | null;
	slug: string | null;
	owned: boolean;
};

export type GalleryForm = FormItem & { display: string };

export type GalleryGroup = {
	key: string;
	label: string;
	blurb: string;
	acquisition: string;
	forms: GalleryForm[];
};

type Family = {
	key: string;
	label: string;
	blurb: string;
	acquisition: string;
	match: (name: string) => boolean;
};

// Display order of the sub-nav. `match` is evaluated in this order and the
// first hit wins, so the specific prefix families are listed before the
// region-suffix ones (keeps "pikachu-alola-cap" out of the Alolan tab).
const FAMILIES: Family[] = [
	{
		key: "vivillon",
		label: "Vivillon",
		blurb: "Twenty wing patterns tied to the trainer's real-world region.",
		acquisition: "Vivillon's pattern is set by the region of the game you're playing; collectors trade across regions to complete all twenty.",
		match: (n) => n.startsWith("vivillon-"),
	},
	{
		key: "alcremie",
		label: "Alcremie",
		blurb: "Every cream-and-sweet decoration combination.",
		acquisition: "Evolve Milcery by spinning while holding a sweet. The cream depends on the time of day and spin direction; the topping depends on the sweet used.",
		match: (n) => n.startsWith("alcremie-"),
	},
	{
		key: "unown",
		label: "Unown",
		blurb: "The full alphabet, plus ! and ?.",
		acquisition: "Caught in the Ruins of Alph (Johto) and Solaceon Ruins (Sinnoh). Each shape appears in specific rooms once puzzles are solved.",
		match: (n) => n.startsWith("unown-"),
	},
	{
		key: "furfrou",
		label: "Furfrou",
		blurb: "Every groomed trim style.",
		acquisition: "Groom Furfrou at the Friseur Furfrou salon in Kalos. Trims reset after five days, so keep re-styling to snapshot each look.",
		match: (n) => n.startsWith("furfrou-"),
	},
	{
		key: "flowers",
		label: "Flabébé Line",
		blurb: "Flabébé, Floette, and Florges in every flower color.",
		acquisition: "Flabébé's flower color is fixed when caught in different patches of Kalos; it carries through to Floette and Florges.",
		match: (n) => n.startsWith("flabebe-") || n.startsWith("floette-") || n.startsWith("florges-"),
	},
	{
		key: "pikachu",
		label: "Pikachu Caps",
		blurb: "Ash's caps and cosplay outfits.",
		acquisition: "Distributed as event Pikachu for the movie tie-in caps, and dressed up as Cosplay Pikachu in the Omega Ruby / Alpha Sapphire contests.",
		match: (n) => n.startsWith("pikachu-"),
	},
	{
		key: "rotom",
		label: "Rotom",
		blurb: "Rotom's five appliance possessions.",
		acquisition: "Take Rotom to the appliances in the Rotom room (or the Dex in later games) and pick a device to change its form and secondary type.",
		match: (n) => n.startsWith("rotom-"),
	},
	{
		key: "oricorio",
		label: "Oricorio",
		blurb: "The four nectar-fueled dance styles.",
		acquisition: "Sip colored Nectar from a different island in Alola to switch Oricorio between its Baile, Pom-Pom, Pa'u, and Sensu styles.",
		match: (n) => n.startsWith("oricorio-"),
	},
	{
		key: "deoxys",
		label: "Deoxys",
		blurb: "Normal, Attack, Defense, and Speed formes.",
		acquisition: "Deoxys changes forme at the meteorites found in various games (e.g. the one on Birth Island / in Veilstone).",
		match: (n) => n.startsWith("deoxys-"),
	},
	{
		key: "alolan",
		label: "Alolan",
		blurb: "Alola-region variants.",
		acquisition: "Found in the wild across the Alola region (Sun / Moon), or transferred in through Pokémon HOME.",
		match: (n) => n.includes("-alola"),
	},
	{
		key: "galarian",
		label: "Galarian",
		blurb: "Galar-region variants.",
		acquisition: "Found in the wild across the Galar region (Sword / Shield), or transferred in through Pokémon HOME.",
		match: (n) => n.includes("-galar"),
	},
	{
		key: "hisuian",
		label: "Hisuian",
		blurb: "Ancient Hisui-region variants.",
		acquisition: "Caught in the Hisui region (Legends: Arceus), then brought forward through Pokémon HOME.",
		match: (n) => n.includes("-hisui"),
	},
	{
		key: "paldean",
		label: "Paldean",
		blurb: "Paldea-region variants.",
		acquisition: "Found in the wild across the Paldea region (Scarlet / Violet).",
		match: (n) => n.includes("-paldea"),
	},
	{
		key: "mega",
		label: "Mega Evolutions",
		blurb: "Every Mega Evolution and Primal Reversion.",
		acquisition: "Give the matching Mega Stone to hold, then Mega Evolve in battle. Primal Reversion triggers with the Blue / Red Orb.",
		match: (n) => n.includes("-mega") || n.endsWith("-primal"),
	},
	{
		key: "gmax",
		label: "Gigantamax",
		blurb: "Gigantamax forms from the Galar region.",
		acquisition: "Encountered in Max Raid Battles in Sword / Shield. A Pokémon needs the Gigantamax Factor to take on this form.",
		match: (n) => n.endsWith("-gmax"),
	},
];

const REGION_LABEL: Record<string, string> = {
	alola: "Alolan",
	galar: "Galarian",
	hisui: "Hisuian",
	paldea: "Paldean",
};

const SPECIES_FIX: Record<string, string> = { mr: "Mr.", farfetchd: "Farfetch'd", flabebe: "Flabébé" };

function cap(s: string): string {
	return s
		.split("-")
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function speciesTitle(tok: string): string {
	return tok
		.split("-")
		.filter(Boolean)
		.map((w) => SPECIES_FIX[w] ?? w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function regionalDisplay(name: string): string {
	for (const [key, label] of Object.entries(REGION_LABEL)) {
		if (!name.includes(`-${key}`)) continue;
		let base = name.split(`-${key}`)[0];
		const after = name.split(`-${key}`)[1]?.replace(/^-/, "") ?? "";
		let qual = "";
		if (base.endsWith("-totem")) {
			base = base.slice(0, -6);
			qual = "Totem";
		}
		const rest = after.replace("-breed", "").replace("standard", "").replace(/^-|-$/g, "");
		const extra = [qual, rest ? cap(rest) : ""].filter(Boolean).join(" ").trim();
		const disp = `${label} ${speciesTitle(base)}`;
		return extra ? `${disp} (${extra})` : disp;
	}
	return speciesTitle(name);
}

const UNOWN: Record<string, string> = { exclamation: "!", question: "?" };

function displayName(key: string, name: string): string {
	if (key === "alolan" || key === "galarian" || key === "hisuian" || key === "paldean") {
		return regionalDisplay(name);
	}
	if (key === "flowers") {
		const [sp, ...rest] = name.split("-");
		return rest.length ? `${speciesTitle(sp)} ${cap(rest.join("-"))}` : speciesTitle(sp);
	}
	if (key === "mega") {
		if (name.endsWith("-primal")) return `${speciesTitle(name.slice(0, -7))} (Primal)`;
		let base = name.replace("-mega", "");
		let suffix = "";
		if (base.endsWith("-x")) {
			base = base.slice(0, -2);
			suffix = " X";
		} else if (base.endsWith("-y")) {
			base = base.slice(0, -2);
			suffix = " Y";
		}
		return `Mega ${speciesTitle(base)}${suffix}`;
	}
	if (key === "gmax") return speciesTitle(name.replace(/-gmax$/, ""));

	const prefix = `${key}-`;
	const suffix = name.startsWith(prefix) ? name.slice(prefix.length) : name;
	if (key === "unown") return UNOWN[suffix] ?? suffix.toUpperCase();
	if (key === "alcremie") return cap(suffix.replace("-sweet", ""));
	if (key === "oricorio") return suffix === "pau" ? "Pa'u" : cap(suffix);
	if (key === "pikachu") return cap(suffix.replace("-cap", " Cap"));
	return suffix ? cap(suffix) : speciesTitle(name);
}

const BY_KEY = new Map(FAMILIES.map((f) => [f.key, f]));

// Sub-nav order: regional variants lead (the marquee forms), then cosmetic
// families, then the battle forms.
const DISPLAY_ORDER = [
	"alolan",
	"galarian",
	"hisuian",
	"paldean",
	"vivillon",
	"alcremie",
	"unown",
	"furfrou",
	"flowers",
	"pikachu",
	"rotom",
	"oricorio",
	"deoxys",
	"mega",
	"gmax",
];

// Match precedence, independent of display order: the most specific buckets
// win first, so e.g. "alcremie-gmax" and "pikachu-gmax" land in Gigantamax,
// and "pikachu-alola-cap" lands in Pikachu Caps rather than Alolan.
const PRECEDENCE = [
	"gmax",
	"mega",
	"vivillon",
	"alcremie",
	"unown",
	"furfrou",
	"flowers",
	"pikachu",
	"rotom",
	"oricorio",
	"deoxys",
	"alolan",
	"galarian",
	"hisuian",
	"paldean",
];

function familyFor(name: string): Family | null {
	for (const key of PRECEDENCE) {
		const fam = BY_KEY.get(key);
		if (fam && fam.match(name)) return fam;
	}
	return null;
}

/** Bucket raw form rows into the browsable families, in sub-nav order. */
export function groupForms(items: FormItem[]): GalleryGroup[] {
	const byKey = new Map<string, GalleryForm[]>();
	for (const item of items) {
		const fam = familyFor(item.name);
		if (!fam) continue;
		const list = byKey.get(fam.key) ?? [];
		list.push({ ...item, display: displayName(fam.key, item.name) });
		byKey.set(fam.key, list);
	}
	const groups: GalleryGroup[] = [];
	for (const key of DISPLAY_ORDER) {
		const fam = BY_KEY.get(key);
		const forms = byKey.get(key);
		if (!fam || !forms || forms.length === 0) continue;
		groups.push({ key: fam.key, label: fam.label, blurb: fam.blurb, acquisition: fam.acquisition, forms });
	}
	return groups;
}
