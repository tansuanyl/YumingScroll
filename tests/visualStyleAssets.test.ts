import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { visualStylePresets } from "../src/data/visualStylePresets";

describe("visual style thumbnails", () => {
  it("keeps the complete original thumbnail set", () => {
    expect(visualStylePresets).toHaveLength(12);
    expect(new Set(visualStylePresets.map((preset) => preset.thumbnail)).size).toBe(12);
  });

  it.each(visualStylePresets)("serves a valid SVG for $id", (preset) => {
    expect(preset.thumbnail).toMatch(/^\/style-thumbnails\/[a-z0-9-]+\.svg$/);
    const assetPath = path.join(process.cwd(), "public", preset.thumbnail.slice(1));
    expect(fs.existsSync(assetPath)).toBe(true);
    const source = fs.readFileSync(assetPath, "utf8");
    expect(source).toContain("<svg");
    expect(source).toContain('viewBox="0 0 180 240"');
  });
});
