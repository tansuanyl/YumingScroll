import { describe, expect, it } from "vitest";
import { detectPreferredLocale, LOCALE_STORAGE_KEY, translateMessage } from "../src/i18n/messages";
import { visualStylePresets } from "../src/data/visualStylePresets";

describe("interface localization", () => {
  it("defaults Chinese browsers to Chinese and other browsers to English", () => {
    expect(detectPreferredLocale(["zh-CN", "en"])).toBe("zh-CN");
    expect(detectPreferredLocale(["zh-TW"])).toBe("zh-CN");
    expect(detectPreferredLocale(["en-NZ", "zh-CN"])).toBe("en");
    expect(detectPreferredLocale([])).toBe("en");
  });

  it("uses a stable browser persistence key", () => {
    expect(LOCALE_STORAGE_KEY).toBe("yuming-scroll-locale");
  });

  it("translates literal and parameterized messages", () => {
    expect(translateMessage("en", "保存")).toBe("Save");
    expect(translateMessage("en", "第{index}段 15s 视频", { index: 2 })).toBe("Segment 2 · 15s Video");
    expect(translateMessage("zh-CN", "第{index}段 15s 视频", { index: 2 })).toBe("第2段 15s 视频");
  });

  it("translates dynamic Gallery labels without changing user names", () => {
    expect(translateMessage("en", "林澈 · 方案 3")).toBe("林澈 · Option 3");
    expect(translateMessage("en", "第 2 段 · 方案 1")).toBe("Segment 2 · Option 1");
    expect(translateMessage("en", "第 4 段风格图")).toBe("Segment 4 Style Image");
  });

  it("has English display names for every visual style", () => {
    for (const preset of visualStylePresets) {
      expect(translateMessage("en", preset.label)).not.toMatch(/[一-龥]/);
      expect(translateMessage("en", preset.sub)).not.toMatch(/[一-龥]/);
    }
  });
});
