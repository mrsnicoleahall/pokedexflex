import { describe, it, expect } from "vitest";
import { classifyForm } from "../../scripts/fetch-pokeapi";

describe("classifyForm", () => {
  it("classifies known form-name patterns", () => {
    expect(classifyForm("charizard-mega-x")).toBe("mega");
    expect(classifyForm("charizard-gmax")).toBe("gigantamax");
    expect(classifyForm("raichu-alola")).toBe("regional");
    expect(classifyForm("darmanitan-galar")).toBe("regional");
    expect(classifyForm("deoxys-attack")).toBe("alternate");
  });
});
