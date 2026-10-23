import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("client/src/index.css", "utf8");

describe("Guide 2.1 compact vehicle selector", () => {
  it("shows 200cc in four columns and 250cc in five columns", () => {
    expect(css).toMatch(/\.m3-guide-21-input \.m3-guide-21-vehicle-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s);
    expect(css).toMatch(/\.m3-guide-21-input \.m3-guide-21-vehicle-grid-250\s*\{[^}]*grid-template-columns:\s*repeat\(5,/s);
  });

  it("keeps vehicle tiles square and colors them from their responsibility group", () => {
    expect(css).toMatch(/\.m3-guide-21-input \.m3-guide-21-vehicle-tile\s*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/s);
    expect(css).toContain("--vehicle-accent, #81e597");
    expect(css).toContain("color: var(--vehicle-accent, #81e597)");
  });
});
