import { describe, expect, it } from "vitest";
import { deriveCharacterModelsFromStory } from "../src/data/demoProject";
import type { StoryState } from "../src/types/domain";

describe("character model prompts", () => {
  it("keeps imported novel prose out of character model prompts", () => {
    const story: StoryState = {
      world: {
        title: "导入小说改编",
        background: "现代都市悬疑",
        rules: [],
        factions: [],
        timeline: [],
        styleKeywords: ["悬疑国漫"]
      },
      characters: [
        {
          id: "char-hou-longtao",
          name: "侯龙涛",
          role: "男主",
          age: "二十多岁",
          gender: "中国男性角色",
          relationshipToProtagonist: "主角",
          personality: ["冷静", "警觉"],
          appearance: "黑发，深色外套，眼神警觉",
          speakingStyle: "侯龙涛：“你要相信我。” 他压低声音看着女孩儿。",
          consistencyPrompt:
            "者，侯龙涛：“侯龙涛看看女孩儿的眼睛，保持项目所选画风的角色设定。” 女性特有的柔美，也不错嘛。反正要飞十几个小时，不如和美女聊聊天打发时间。"
        }
      ],
      outline: "侯龙涛卷入异常事件。",
      script: [],
      storyboard: [],
      visualPrompts: [],
      seedanceScript: ""
    };

    const prompt = deriveCharacterModelsFromStory(story)[0]?.consistencyPrompt || "";

    expect(prompt).toContain("侯龙涛");
    expect(prompt).toContain("黑发");
    expect(prompt).toContain("深色外套");
    expect(prompt).not.toContain("看看女孩儿的眼睛");
    expect(prompt).not.toContain("女性特有的柔美");
    expect(prompt).not.toContain("也不错嘛");
    expect(prompt).not.toContain("打发时间");
    expect(prompt).not.toMatch(/侯龙涛[：:][“"]/);
  });

  it("converts novel action prose into derived character-model prompt attributes", () => {
    const story: StoryState = {
      world: {
        title: "破庙夺谱",
        background: "残破山庙里的同门剑谱冲突",
        rules: [],
        factions: [],
        timeline: [],
        styleKeywords: ["水墨武侠", "冷灰残阳"]
      },
      characters: [
        {
          id: "char-shen-yan",
          name: "沈砚",
          role: "同门师兄，黑衣剑客",
          age: "二十多岁",
          gender: "中国男性角色",
          relationshipToProtagonist: "主角",
          personality: ["警觉", "克制"],
          appearance: "黑发，深色武侠衣袍，肩线利落，身形精瘦",
          speakingStyle: "语气压抑，动作狠厉",
          consistencyPrompt:
            "例如，成熟人物比例，服装和体型需与主角区分，警觉、克制，火星溅在他染尘的衣袖上，沈砚一记旋身剑劈向苏衍左肩，软剑险些脱手"
        }
      ],
      outline: "沈砚与苏衍在破庙中因剑谱反目。",
      script: [],
      storyboard: [],
      visualPrompts: [],
      seedanceScript: ""
    };

    const prompt = deriveCharacterModelsFromStory(story)[0]?.consistencyPrompt || "";

    expect(prompt).toContain("沈砚");
    expect(prompt).toContain("黑发");
    expect(prompt).toContain("深色武侠衣袍");
    expect(prompt).toContain("警觉");
    expect(prompt).toContain("克制");
    expect(prompt).not.toContain("例如");
    expect(prompt).not.toContain("火星溅在他染尘的衣袖上");
    expect(prompt).not.toContain("一记旋身剑劈向");
    expect(prompt).not.toContain("软剑险些脱手");
  });
});
