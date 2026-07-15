import { describe, expect, it } from "vitest";
import { FORM_GROUPS, DEFAULT_FORM_GROUP, TOTAL_FORMS } from "../../src/react-app/forms/formsData";

// Mirror of the FORM_SLUG guard in src/worker/routes/sprites.ts. Every slug in
// the dataset must satisfy it, or the /sprites/form/:slug proxy 400s the tile.
const FORM_SLUG = /^[a-z0-9-]{1,64}$/;

describe("formsData", () => {
	it("has non-empty families with unique keys", () => {
		expect(FORM_GROUPS.length).toBeGreaterThan(0);
		for (const g of FORM_GROUPS) {
			expect(g.forms.length).toBeGreaterThan(0);
			expect(g.label.length).toBeGreaterThan(0);
		}
		const keys = FORM_GROUPS.map((g) => g.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("every slug is servable by the form-sprite proxy", () => {
		for (const g of FORM_GROUPS) {
			for (const f of g.forms) {
				expect(f.slug, `${g.key}/${f.name}`).toMatch(FORM_SLUG);
				expect(f.name.length).toBeGreaterThan(0);
			}
		}
	});

	it("slugs are unique within each family and TOTAL_FORMS matches the sum", () => {
		let sum = 0;
		for (const g of FORM_GROUPS) {
			const slugs = g.forms.map((f) => f.slug);
			expect(new Set(slugs).size, g.key).toBe(slugs.length);
			sum += g.forms.length;
		}
		expect(TOTAL_FORMS).toBe(sum);
	});

	it("DEFAULT_FORM_GROUP is a real family key", () => {
		expect(FORM_GROUPS.some((g) => g.key === DEFAULT_FORM_GROUP)).toBe(true);
	});
});
