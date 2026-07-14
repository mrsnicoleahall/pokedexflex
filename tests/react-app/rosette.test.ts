import { describe, expect, it } from "vitest";
import { stripSvgWrapper, transformRosette } from "../../src/react-app/ribbons/rosette";

const SAMPLE = `.cls-2 { fill: #e4007f; } .cls-4 { fill: #f92891; } .cls-5 { fill: #ff9fd4; } .cls-6 { fill: #fdf37a; } .cls-3 { fill: #fff; }`;

describe("transformRosette", () => {
  it("replaces the three pleat fills with CSS variables", () => {
    const out = transformRosette(SAMPLE);
    expect(out).toContain("fill: var(--r-main)");
    expect(out).toContain("fill: var(--r-mid)");
    expect(out).toContain("fill: var(--r-light)");
    expect(out).not.toContain("#e4007f");
    expect(out).not.toContain("#f92891");
    expect(out).not.toContain("#ff9fd4");
  });
  it("keeps the gold ring and white center fixed", () => {
    const out = transformRosette(SAMPLE);
    expect(out).toContain("#fdf37a");
    expect(out).toContain("#fff");
  });
});

describe("stripSvgWrapper", () => {
  it("returns the inner content of an <svg ...>...</svg> string", () => {
    expect(stripSvgWrapper('<svg foo="1"><g><path/></g></svg>')).toBe("<g><path/></g>");
  });
  it("keeps a <defs> block that appears inside the svg", () => {
    const markup = '<svg viewBox="0 0 10 10"><defs><clipPath id="clippath"><path d="M0 0"/></clipPath></defs><g class="cls-7"><path/></g></svg>';
    const out = stripSvgWrapper(markup);
    expect(out).toContain("<defs>");
    expect(out).toContain('<clipPath id="clippath">');
    expect(out).toContain("</defs>");
  });
});
