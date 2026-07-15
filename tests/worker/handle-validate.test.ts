import { describe, expect, it } from "vitest";
import {
  RESERVED_HANDLES,
  HANDLE_MIN,
  HANDLE_MAX,
  normalizeHandle,
  validateHandle,
  suggestHandleBase,
} from "../../src/worker/profile/handle";

describe("normalizeHandle", () => {
  it("lowercases and trims", () => {
    expect(normalizeHandle("  AshKetchum  ")).toBe("ashketchum");
  });
});

describe("validateHandle", () => {
  it("accepts a simple lowercase handle", () => {
    expect(validateHandle("ash-ketchum")).toEqual({ ok: true, value: "ash-ketchum" });
  });

  it("normalizes case + surrounding whitespace before validating", () => {
    expect(validateHandle("  Misty  ")).toEqual({ ok: true, value: "misty" });
  });

  it("accepts digits and single interior hyphens", () => {
    expect(validateHandle("gen1-master99").ok).toBe(true);
  });

  it("rejects a too-short handle (< 3)", () => {
    const r = validateHandle("ab");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/3/);
  });

  it("rejects a too-long handle (> 30)", () => {
    const r = validateHandle("a".repeat(31));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/30/);
  });

  it("accepts a handle at exactly the min and max length", () => {
    expect(validateHandle("abc").ok).toBe(true);
    expect(validateHandle("a".repeat(30)).ok).toBe(true);
  });

  it("rejects leading, trailing, and doubled hyphens", () => {
    expect(validateHandle("-ash").ok).toBe(false);
    expect(validateHandle("ash-").ok).toBe(false);
    expect(validateHandle("ash--ketchum").ok).toBe(false);
  });

  it("rejects disallowed characters (spaces, underscores, symbols, unicode)", () => {
    expect(validateHandle("ash ketchum").ok).toBe(false);
    expect(validateHandle("ash_ketchum").ok).toBe(false);
    expect(validateHandle("ash.k").ok).toBe(false);
    expect(validateHandle("piká").ok).toBe(false);
  });

  it("rejects reserved words (case-insensitively)", () => {
    expect(validateHandle("admin").ok).toBe(false);
    expect(validateHandle("API").ok).toBe(false);
    expect(validateHandle("settings").ok).toBe(false);
    expect(validateHandle("u").ok).toBe(false);
  });

  it("rejects a non-string body", () => {
    expect(validateHandle(null).ok).toBe(false);
    expect(validateHandle(42).ok).toBe(false);
  });

  it("exposes the length bounds it enforces", () => {
    expect(HANDLE_MIN).toBe(3);
    expect(HANDLE_MAX).toBe(30);
    expect(RESERVED_HANDLES.has("versus")).toBe(true);
  });
});

describe("suggestHandleBase", () => {
  it("slugifies a display name to a valid handle base", () => {
    expect(suggestHandleBase("Ash Ketchum")).toBe("ash-ketchum");
  });

  it("collapses runs of non-alphanumerics into single hyphens and trims them", () => {
    expect(suggestHandleBase("  Prof. Oak!!  ")).toBe("prof-oak");
  });

  it("falls back to 'trainer' when the name yields too few usable characters", () => {
    expect(suggestHandleBase("!!")).toBe("trainer");
    expect(suggestHandleBase("")).toBe("trainer");
  });

  it("never returns a base that itself fails validateHandle", () => {
    expect(validateHandle(suggestHandleBase("Ash Ketchum")).ok).toBe(true);
    expect(validateHandle(suggestHandleBase("!!")).ok).toBe(true);
  });
});
