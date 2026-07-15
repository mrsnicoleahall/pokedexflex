import { describe, expect, it } from "vitest";
import { groupForms, type FormItem } from "../../src/react-app/forms/formsDisplay";

function item(partial: Partial<FormItem> & { name: string; formId: number }): FormItem {
	return {
		speciesId: 1,
		formType: "cosmetic",
		homeId: null,
		slug: null,
		owned: false,
		...partial,
	};
}

describe("groupForms", () => {
	it("splits the four regional variants into separate families", () => {
		const groups = groupForms([
			item({ formId: 1, name: "rattata-alola" }),
			item({ formId: 2, name: "meowth-galar" }),
			item({ formId: 3, name: "growlithe-hisui" }),
			item({ formId: 4, name: "wooper-paldea" }),
		]);
		const keys = groups.map((g) => g.key);
		expect(keys).toEqual(["alolan", "galarian", "hisuian", "paldean"]);
	});

	it("keeps Pikachu caps out of the Alolan family", () => {
		const groups = groupForms([item({ formId: 1, name: "pikachu-alola-cap" })]);
		expect(groups).toHaveLength(1);
		expect(groups[0].key).toBe("pikachu");
	});

	it("routes Gigantamax variants of prefix families into the gmax tab", () => {
		const groups = groupForms([
			item({ formId: 1, name: "alcremie-gmax" }),
			item({ formId: 2, name: "pikachu-gmax" }),
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].key).toBe("gmax");
	});

	it("cleans up display names per family", () => {
		const groups = groupForms([
			item({ formId: 1, name: "rattata-alola" }),
			item({ formId: 2, name: "vivillon-icy-snow", speciesId: 666 }),
			item({ formId: 3, name: "unown-exclamation", speciesId: 201 }),
			item({ formId: 4, name: "charizard-mega-x", formType: "mega" }),
			item({ formId: 5, name: "venusaur-gmax", formType: "gigantamax" }),
			item({ formId: 6, name: "flabebe-red", speciesId: 669 }),
		]);
		const byKey = Object.fromEntries(groups.map((g) => [g.key, g.forms[0].display]));
		expect(byKey.alolan).toBe("Alolan Rattata");
		expect(byKey.vivillon).toBe("Icy Snow");
		expect(byKey.unown).toBe("!");
		expect(byKey.mega).toBe("Mega Charizard X");
		expect(byKey.gmax).toBe("Venusaur");
		expect(byKey.flowers).toBe("Flabébé Red");
	});

	it("every family carries a non-empty acquisition blurb", () => {
		const groups = groupForms([
			item({ formId: 1, name: "rattata-alola" }),
			item({ formId: 2, name: "vivillon-meadow" }),
		]);
		for (const g of groups) expect(g.acquisition.length).toBeGreaterThan(0);
	});

	it("drops forms that match no tracked family", () => {
		const groups = groupForms([item({ formId: 1, name: "castform-sunny" })]);
		expect(groups).toHaveLength(0);
	});

	it("preserves owned flags", () => {
		const groups = groupForms([item({ formId: 1, name: "raichu-alola", owned: true })]);
		expect(groups[0].forms[0].owned).toBe(true);
	});
});
