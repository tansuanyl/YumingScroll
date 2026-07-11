import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { briefInputSections } from "../src/components/TextCreation";
import { visualPromptLibrary } from "../src/data/promptLibrary";
import { getVisualStylePreset, visualStylePresets } from "../src/data/visualStylePresets";

describe("text creation configuration", () => {
  it("keeps no-novel brief mode focused on creator inputs instead of Seedance revision", () => {
    expect(briefInputSections.map((section) => section.key)).toEqual(["inspiration", "world", "outline"]);
    expect(briefInputSections.some((section) => String(section.key) === "seedance")).toBe(false);
  });

  it("offers reusable visual style presets for text generation", () => {
    expect(visualStylePresets.length).toBeGreaterThanOrEqual(10);
    expect(getVisualStylePreset("suspense-guoman")?.prompt).toContain("半写实国漫悬疑");
    expect(visualStylePresets.every((preset) => preset.label && preset.prompt && preset.accent)).toBe(true);
  });

  it("uses the original JPG thumbnails for visual style cards", () => {
    for (const preset of visualStylePresets) {
      expect(preset.thumbnail).toBe(`/style-thumbnails/custom/${preset.id}.jpg`);
      expect(existsSync(join(process.cwd(), "public", preset.thumbnail.replace(/^\//, "")))).toBe(true);
    }
  });

  it("keeps prompt library templates bound to the selected project style", () => {
    const templateText = visualPromptLibrary.templates.map((template) => template.template).join("\n");

    expect(templateText).toContain("{项目所选画风提示词}");
    expect(templateText).not.toContain("2D 半写实国漫悬疑风");
    expect(templateText).not.toContain("不要 3D");
  });

  it("uses the project-owned prompt framework without external source references", () => {
    expect(visualPromptLibrary.source.name).toContain("Yuming Scroll");
    expect(JSON.stringify(visualPromptLibrary)).not.toContain("feishu");
    expect(JSON.stringify(visualPromptLibrary)).not.toContain("映悦");
  });
});
