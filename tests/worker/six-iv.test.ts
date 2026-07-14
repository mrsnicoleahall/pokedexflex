import { describe, expect, it } from "vitest";
import { isSixIv } from "../../src/worker/ribbons/catalog";

describe("isSixIv", () => {
  it("is true only when all six IVs are exactly 31", () => {
    expect(isSixIv(JSON.stringify({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }))).toBe(true);
  });
  it("is false when any IV is below 31", () => {
    expect(isSixIv(JSON.stringify({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 30 }))).toBe(false);
  });
  it("is false for null, empty, malformed, or partial ivs (never throws)", () => {
    expect(isSixIv(null)).toBe(false);
    expect(isSixIv("")).toBe(false);
    expect(isSixIv("not json")).toBe(false);
    expect(isSixIv(JSON.stringify({ hp: 31 }))).toBe(false);
    expect(isSixIv(JSON.stringify({ hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: "31" }))).toBe(false);
  });
});
