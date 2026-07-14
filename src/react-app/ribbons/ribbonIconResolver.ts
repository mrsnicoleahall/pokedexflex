// Pure client-side resolver: maps a ribbon's id/category to how its icon
// should render. Marquee ribbons get a reserved kawaii "piece"; families get
// a recolored rosette + a center glyph. Color-coding (type color, generation
// ramp, per-species hue) keeps every ribbon visually distinct at scale.
import { typeColor } from "../theme";

export type RibbonGlyph =
	| { kind: "type"; type: string }
	| { kind: "text"; text: string }
	| { kind: "emoji"; emoji: string };

export type RibbonVisual =
	| { kind: "rosette"; baseColor: string; glyph: RibbonGlyph }
	| { kind: "piece"; piece: string };

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

/** Per-generation base hues (distinct, roughly evoking each region's palette). */
const GEN_COLORS: Record<number, string> = {
	1: "#EF5350", 2: "#FFB300", 3: "#43A047", 4: "#26C6DA",
	5: "#5C6BC0", 6: "#EC407A", 7: "#FF7043", 8: "#AB47BC", 9: "#8D6E63",
};

/** Emoji for the three form-fanatic ribbons. */
const FORM_EMOJI: Record<string, string> = { mega: "🧬", regional: "🗺️", gigantamax: "🌀" };

// Per-generation base hues reused for Regional ribbons (region == generation).
const REGION_COLORS: Record<number, string> = GEN_COLORS;

// Metallic tone for rarity-class ribbons.
const RARITY_METAL = "#C0A062";

export function resolveRibbonIcon(ribbon: { id: string; category: string }): RibbonVisual {
	const { id, category } = ribbon;

	if (id === "living-dex") return { kind: "piece", piece: "trophy" };
	if (id === "complete-dex-forms") return { kind: "piece", piece: "diamond" };
	if (id === "national-dex-100") return { kind: "piece", piece: "coin" };
	if (id === "shiny-living-dex") return { kind: "piece", piece: "heart" };

	if (category === "Type" && id.startsWith("type-")) {
		const type = id.slice("type-".length);
		return { kind: "rosette", baseColor: typeColor(type), glyph: { kind: "type", type } };
	}
	if (category === "Type" && id.startsWith("typemaster-")) {
		// typemaster-<slug>-<tier>
		const rest = id.slice("typemaster-".length);
		const slug = rest.slice(0, rest.lastIndexOf("-"));
		return { kind: "rosette", baseColor: typeColor(slug), glyph: { kind: "type", type: slug } };
	}

	if ((category === "Generation" || category === "Regional") && id.startsWith("gen-")) {
		const n = Number(id.slice("gen-".length));
		return {
			kind: "rosette",
			baseColor: REGION_COLORS[n] ?? "#7E8AA2",
			glyph: { kind: "text", text: ROMAN[n] ?? String(n) },
		};
	}

	if (category === "Shiny") {
		if (id === "shiny-100") return { kind: "piece", piece: "starribbon" };
		return { kind: "rosette", baseColor: typeColor("fairy"), glyph: { kind: "emoji", emoji: "✦" } };
	}

	if (category === "Events") {
		if (id === "event-100") return { kind: "piece", piece: "gift" };
		return { kind: "rosette", baseColor: typeColor("grass"), glyph: { kind: "emoji", emoji: "🎁" } };
	}

	if (category === "Forms") {
		const key = id.replace("form-fanatic-", "");
		return { kind: "rosette", baseColor: typeColor("psychic"), glyph: { kind: "emoji", emoji: FORM_EMOJI[key] ?? "✨" } };
	}

	if (category === "Form Sets") {
		const spId = Number(id.replace("formset-", "")) || 0;
		const hue = (spId * 47) % 360;
		return { kind: "rosette", baseColor: `hsl(${hue} 68% 55%)`, glyph: { kind: "emoji", emoji: "🎴" } };
	}

	if (category === "Fun") {
		return { kind: "rosette", baseColor: typeColor("poison"), glyph: { kind: "emoji", emoji: "🎉" } };
	}

	if (category === "Completion" && id.startsWith("national-dex-")) {
		const pct = id.slice("national-dex-".length);
		return { kind: "rosette", baseColor: typeColor("electric"), glyph: { kind: "text", text: `${pct}%` } };
	}

	if (category === "Rarity Class") {
		return { kind: "rosette", baseColor: RARITY_METAL, glyph: { kind: "emoji", emoji: "💎" } };
	}

	if (category === "Collector") {
		const emoji =
			id === "collector-natures" ? "🌿" :
			id === "collector-balls" ? "🔴" :
			id.startsWith("collector-level100") ? "💯" :
			id.startsWith("collector-6iv") ? "⭐" :
			id === "collector-mega" ? "🧬" :
			id === "collector-gmax" ? "🔺" : "📦";
		return { kind: "rosette", baseColor: typeColor("steel"), glyph: { kind: "emoji", emoji } };
	}

	if (category === "Grand") return { kind: "piece", piece: "trophy" };

	return { kind: "rosette", baseColor: typeColor("normal"), glyph: { kind: "text", text: (id[0] ?? "?").toUpperCase() } };
}
