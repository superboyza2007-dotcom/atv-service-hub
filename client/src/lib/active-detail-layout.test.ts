import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("client/src/index.css", "utf8");

describe("shared active vehicle detail layout", () => {
  it("uses the shared card list selector without requiring the Guide-only panel wrapper", () => {
    expect(css).toContain(".m3-active-vehicle-card-list {");
    expect(css).toContain(".m3-active-vehicle-card-list .vehicle-chip {");
  });

  it("forces one full-width card per row on mobile", () => {
    expect(css).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.m3-active-vehicle-card-list \{\s*grid-template-columns: 1fr;/,
    );
  });

  it("keeps the Guide card information areas in the shared card", () => {
    expect(css).toContain('"identity managers"');
    expect(css).toContain('"identity session"');
    expect(css).toContain(".vehicle-manager-list");
    expect(css).toContain(".vehicle-session-meta");
  });
});
