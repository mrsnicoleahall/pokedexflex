import { describe, expect, it } from "vitest";
import { rivalTargetHandle } from "../../src/react-app/versus/rivalTarget";

describe("rivalTargetHandle", () => {
	it("returns the opponent's handle when the viewer is side A", () => {
		expect(rivalTargetHandle({ viewerHandle: "red", aHandle: "red", bHandle: "blue" })).toBe("blue");
	});
	it("returns the opponent's handle when the viewer is side B", () => {
		expect(rivalTargetHandle({ viewerHandle: "blue", aHandle: "red", bHandle: "blue" })).toBe("red");
	});
	it("returns null for a spectator (viewer is neither side)", () => {
		expect(rivalTargetHandle({ viewerHandle: "green", aHandle: "red", bHandle: "blue" })).toBeNull();
	});
	it("returns null when the viewer has no handle (not signed in / no handle yet)", () => {
		expect(rivalTargetHandle({ viewerHandle: null, aHandle: "red", bHandle: "blue" })).toBeNull();
	});
});
