import { describe, expect, it } from "vitest";
import { sanitizeImagePromptSourceText } from "../src/lib/imagePromptSourceText";

describe("image prompt source text", () => {
  it("keeps derived visual prompt terms without copying novel source prose", () => {
    const pollutedPrompt = [
      "破庙的残阳被风卷得支离破碎，沈砚握着，剑尖斜指地面，周身气息紧绷",
      "苏衍嗤笑一声，指尖抚过腰间软剑，衣袂翻飞间已欺身而上",
      "沈砚侧身避过，素铁剑横削而出，两剑相撞发出刺耳铮鸣，火星溅在他染尘的衣袖上",
      "悬疑国漫，冷蓝灰，强线稿，破庙梁柱，残阳斜照，尘雾，断裂木柱，寒光，空间结构清楚"
    ].join("，");

    const cleaned = sanitizeImagePromptSourceText(pollutedPrompt, { maxLength: 500 });

    expect(cleaned).toContain("悬疑国漫");
    expect(cleaned).toContain("冷蓝灰");
    expect(cleaned).toContain("强线稿");
    expect(cleaned).toContain("破庙梁柱");
    expect(cleaned).toContain("残阳斜照");
    expect(cleaned).not.toContain("沈砚握着");
    expect(cleaned).not.toContain("苏衍嗤笑");
    expect(cleaned).not.toContain("指尖抚过腰间软剑");
    expect(cleaned).not.toContain("沈砚侧身避过");
    expect(cleaned).not.toContain("火星溅在他染尘的衣袖上");
  });
});
