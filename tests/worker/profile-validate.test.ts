import { describe, expect, it } from "vitest";
import { GENDERS, validateProfileInput } from "../../src/worker/profile/validate";

describe("GENDERS", () => {
  it("is exactly boy/girl/ditto", () => {
    expect(GENDERS).toEqual(["boy", "girl", "ditto"]);
  });
});

describe("validateProfileInput", () => {
  it("accepts a valid displayName + gender, trimmed and lowercased", () => {
    const result = validateProfileInput({ displayName: "  Ash  ", gender: "BOY" });
    expect(result).toEqual({ ok: true, value: { displayName: "Ash", gender: "boy" } });
  });

  it("accepts a partial update (displayName only)", () => {
    expect(validateProfileInput({ displayName: "Misty" })).toEqual({ ok: true, value: { displayName: "Misty" } });
  });

  it("accepts a partial update (gender only)", () => {
    expect(validateProfileInput({ gender: "ditto" })).toEqual({ ok: true, value: { gender: "ditto" } });
  });

  it("rejects an empty or whitespace-only displayName", () => {
    expect(validateProfileInput({ displayName: "" }).ok).toBe(false);
    expect(validateProfileInput({ displayName: "   " }).ok).toBe(false);
  });

  it("rejects a displayName over 40 characters", () => {
    const result = validateProfileInput({ displayName: "x".repeat(41) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/40/);
  });

  it("accepts a displayName at exactly the 40-character cap", () => {
    expect(validateProfileInput({ displayName: "x".repeat(40) }).ok).toBe(true);
  });

  it("rejects a gender outside {boy, girl, ditto}", () => {
    const result = validateProfileInput({ gender: "robot" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/boy, girl, ditto/);
  });

  it("rejects a non-object body", () => {
    expect(validateProfileInput(null).ok).toBe(false);
    expect(validateProfileInput("nope").ok).toBe(false);
  });

  it("returns an empty value (still ok) when neither field is present — the route decides whether that's an error", () => {
    expect(validateProfileInput({})).toEqual({ ok: true, value: {} });
  });
});
