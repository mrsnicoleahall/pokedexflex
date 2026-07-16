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

// Brand-analogous ribbon palette — a blue→teal→green metallic family echoing the
// PokéDexFlex logo. Non-type families are distinguished by their position on this
// ramp plus their center glyph, rather than a full rainbow, so the trophy wall
// reads as one cohesive collection. (Type ribbons intentionally keep their
// official per-type colors — see resolveRibbonIcon.)
const BRAND = {
	green: "#33b06a",
	teal: "#1f9a8a",
	aqua: "#2bb3b0",
	cyan: "#4aa8dd",
	blue: "#2f6fb0",
	deep: "#1c3a63",
	steel: "#7fb0cf", // polished steel-cyan for rare/precious tiers
	slate: "#4a6b8a", // neutral fallback
} as const;

/** 9-step green→teal→cyan→blue ramp for generation/regional ribbons (distinct but analogous). */
const GEN_RAMP: Record<number, string> = {
	1: "#35b06a", 2: "#23a986", 3: "#1f9a97", 4: "#2493b5",
	5: "#2f88c9", 6: "#3273bd", 7: "#3660b0", 8: "#2f50a0", 9: "#294486",
};

/** Emoji for the three form-fanatic ribbons. */
const FORM_EMOJI: Record<string, string> = { mega: "🧬", regional: "🗺️", gigantamax: "🌀" };

// Regional ribbons reuse the generation ramp (region == generation).
const REGION_COLORS: Record<number, string> = GEN_RAMP;

// Metallic tone for rarity-class ribbons — polished steel-cyan, in the logo's vein.
const RARITY_METAL = BRAND.steel;

export function resolveRibbonIcon(ribbon: { id: string; category: string }): RibbonVisual {
	const { id, category } = ribbon;

	if (id === "living-dex") return { kind: "piece", piece: "trophy" };
	if (id === "complete-dex-forms") return { kind: "piece", piece: "diamond" };
	if (id === "national-dex-100") return { kind: "piece", piece: "coin" };
	if (id === "shiny-living-dex") return { kind: "piece", piece: "heart" };
	// Grand mythical capstone — a distinct violet rosette with a star.
	if (id === "grand-mythicals") return { kind: "rosette", baseColor: "#8b5cf6", glyph: { kind: "emoji", emoji: "🌟" } };

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
		return { kind: "rosette", baseColor: BRAND.cyan, glyph: { kind: "emoji", emoji: "✦" } };
	}

	if (category === "Events") {
		if (id === "event-100") return { kind: "piece", piece: "gift" };
		return { kind: "rosette", baseColor: BRAND.teal, glyph: { kind: "emoji", emoji: "🎁" } };
	}

	if (category === "Forms") {
		if (id === "furfrou-fashionista") return { kind: "rosette", baseColor: BRAND.blue, glyph: { kind: "emoji", emoji: "✂️" } };
		if (id === "floette-florist") return { kind: "rosette", baseColor: BRAND.green, glyph: { kind: "emoji", emoji: "🌸" } };
		const key = id.replace("form-fanatic-", "");
		return { kind: "rosette", baseColor: BRAND.blue, glyph: { kind: "emoji", emoji: FORM_EMOJI[key] ?? "✨" } };
	}

	if (category === "Form Sets") {
		const spId = Number(id.replace("formset-", "")) || 0;
		const hue = 160 + ((spId * 37) % 70);
		return { kind: "rosette", baseColor: `hsl(${hue} 52% 50%)`, glyph: { kind: "emoji", emoji: "🎴" } };
	}

	if (category === "Fun") {
		return { kind: "rosette", baseColor: BRAND.aqua, glyph: { kind: "emoji", emoji: "🎉" } };
	}

	if (category === "Completion" && id.startsWith("national-dex-")) {
		// Just the number (no "%") so the digits sit dead-center in the rosette —
		// the "%" made the label read right-heavy. The card title still says "25%".
		const pct = id.slice("national-dex-".length);
		return { kind: "rosette", baseColor: BRAND.deep, glyph: { kind: "text", text: pct } };
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
		return { kind: "rosette", baseColor: BRAND.green, glyph: { kind: "emoji", emoji } };
	}

	if (category === "Grand") return { kind: "piece", piece: "trophy" };

	return { kind: "rosette", baseColor: BRAND.slate, glyph: { kind: "text", text: (id[0] ?? "?").toUpperCase() } };
}
