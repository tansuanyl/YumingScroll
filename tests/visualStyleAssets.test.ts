import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { visualStylePresets } from "../src/data/visualStylePresets";

describe("visual style thumbnails", () => {
  it("keeps the complete original thumbnail set", () => {
    expect(visualStylePresets).toHaveLength(12);
    expect(new Set(visualStylePresets.map((preset) => preset.thumbnail)).size).toBe(12);
  });

  it.each(visualStylePresets)("serves the original JPG for $id", async (preset) => {
    expect(preset.thumbnail).toBe(`/style-thumbnails/custom/${preset.id}.jpg`);
    const assetPath = path.join(process.cwd(), "public", preset.thumbnail.slice(1));
    expect(fs.existsSync(assetPath)).toBe(true);
    const source = fs.readFileSync(assetPath);
    expect(Array.from(source.subarray(0, 3))).toEqual([0xff, 0xd8, 0xff]);
    const metadata = await sharp(source).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width: 480, height: 640 });
  });
});
