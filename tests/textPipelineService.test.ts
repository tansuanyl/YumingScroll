import { describe, expect, it } from "vitest";
import type {
  MediaPromptOptimizationInput,
  OpenAITextProvider,
  SeedanceScriptOptimizationInput
} from "../server/providers/OpenAITextProvider";
import { TextPipelineService } from "../server/services/TextPipelineService";
import { createDemoProject, deriveCharacterModelsFromStory } from "../src/data/demoProject";

describe("TextPipelineService", () => {
  it("fails text generation instead of hanging forever when provider does not resolve", async () => {
    const provider = {
      isMock: () => false,
      model: () => "test-model",
      generateStory: () => new Promise(() => undefined),
      regenerateSection: () => new Promise(() => undefined),
      reviseSeedanceScript: () => new Promise(() => undefined)
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 5,
      fallbackToMockOnTimeout: false
    });

    await expect(service.generateStory("timeout case")).rejects.toThrow("Text generation timed out");
  });

  it("falls back to a local story draft when initial story generation times out", async () => {
    const provider = {
      isMock: () => false,
      model: () => "test-model",
      generateStory: () => new Promise(() => undefined),
      regenerateSection: () => new Promise(() => undefined),
      reviseSeedanceScript: () => new Promise(() => undefined)
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 5,
      fallbackToMockOnTimeout: true
    });

    const story = await service.generateStory({
      inspiration: "悬疑短剧：失踪刑警进入不存在的第十三层档案馆",
      worldTitle: "雨幕新东京",
      worldBackground: "旧警局档案楼只有十二层，但深夜电梯会出现红色 13 按钮。",
      outline: "林彻进入第十三层，发现妹妹照片和第一份黑色档案。"
    });

    expect(story.world.title).toBeTruthy();
    expect(story.outline).toBeTruthy();
    expect(story.characters.length).toBeGreaterThan(0);
    expect(story.seedanceScript).toContain("Seedance 2.0");
    expect(story.seedanceScript).toContain("第十三层档案馆");
    expect(story.seedanceScript).not.toContain("雨幕新东京");
  });

  it("falls back to a local story draft when the text model returns malformed story JSON", async () => {
    const malformedJsonError = new Error("Text model returned invalid JSON for story generation: Unexpected token '<'");
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: () => Promise.reject(malformedJsonError),
      regenerateSection: () => new Promise(() => undefined),
      reviseSeedanceScript: () => new Promise(() => undefined)
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 1000,
      fallbackToMockOnTimeout: true
    });

    const story = await service.generateStory({
      inspiration: "Imported source: short martial arts test",
      sourceType: "novel",
      sourceText:
        "沈砚握着素铁剑，剑尖抵住苏衍咽喉。苏衍却突然笑了，从怀中取出泛黄册子，告诉他那不是剑谱而是师父遗书。",
      visualStyleId: "cinematic-real",
      textModel: "kimi-k2.6"
    });

    expect(story.world.title).toBeTruthy();
    expect(story.storyboard.length).toBeGreaterThan(0);
    expect(story.seedanceScript.trim()).not.toBe("");
    expect(story.seedanceScript).toContain("Seedance 2.0");
  });

  it("does not hide provider configuration failures behind a local fallback", async () => {
    const missingKeyError = new Error("Missing MOONSHOT_API_KEY for kimi-k2.6");
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: () => Promise.reject(missingKeyError),
      regenerateSection: () => new Promise(() => undefined),
      reviseSeedanceScript: () => new Promise(() => undefined)
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 1000,
      fallbackToMockOnTimeout: true
    });

    await expect(
      service.generateStory({
        inspiration: "Imported source: short martial arts test",
        sourceType: "novel",
        sourceText: "沈砚握着素铁剑，剑尖抵住苏衍咽喉。",
        textModel: "kimi-k2.6"
      })
    ).rejects.toThrow("Missing MOONSHOT_API_KEY");
  });

  it("optimizes the local fallback Seedance script when initial story generation times out", async () => {
    const optimizedScript = [
      "《破庙的残阳》E01《异常开启》Seedance 2.0 优化分镜脚本",
      "【整体统一设定】",
      "【第 1 段 15 秒：对峙与试探】",
      "对应原文段落：从沈砚索要剑谱到苏衍出手。",
      "首帧承接上一段：无，本段为开篇。",
      "分镜 1（0-5 秒）：全景 → 中景 / 建立场景",
      "动作：\n  0.0-2.0秒：破庙残阳摇曳。",
      "尾帧要求：停在苏衍眼神特写。",
      "本段尾帧描述：第 14.0-15.0 秒停在苏衍眼神特写。",
      "下一段首帧描述：下一段 0 秒从苏衍眼神特写拉开。"
    ].join("\n");
    let capturedInput: SeedanceScriptOptimizationInput | undefined;
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: () => new Promise(() => undefined),
      regenerateSection: () => new Promise(() => undefined),
      reviseSeedanceScript: () => new Promise(() => undefined),
      optimizeSeedanceScript: async (input: SeedanceScriptOptimizationInput) => {
        capturedInput = input;
        return optimizedScript;
      }
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 5,
      fallbackToMockOnTimeout: true
    });

    const story = await service.generateStory({
      inspiration: "武侠同门反目",
      sourceType: "novel",
      sourceText: "沈砚握着素铁剑，剑尖斜指地面。",
      visualStyleId: "cinematic-real",
      textModel: "kimi-k2.6"
    });

    expect(story.seedanceScript).toBe(optimizedScript);
    expect(capturedInput?.currentScript).toContain("Seedance 2.0 优化分镜脚本");
    expect(capturedInput?.sourceReferenceText).toContain("沈砚握着素铁剑");
  });

  it("falls back when the OpenAI SDK reports a request timeout", async () => {
    const openAITimeout = Object.assign(new Error("Request timed out."), {
      name: "APIConnectionTimeoutError"
    });
    const provider = {
      isMock: () => false,
      model: () => "test-model",
      generateStory: () => Promise.reject(openAITimeout),
      regenerateSection: () => new Promise(() => undefined),
      reviseSeedanceScript: () => new Promise(() => undefined)
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 5000,
      fallbackToMockOnTimeout: true
    });

    const story = await service.generateStory("Request timeout case");

    expect(story.world.title).toBeTruthy();
    expect(story.storyboard.length).toBeGreaterThan(0);
    expect(story.seedanceScript).toContain("Seedance 2.0");
  });

  it("keeps a local fallback draft when the text provider connection is reset", async () => {
    const socketHangUp = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: () => Promise.reject(socketHangUp),
      regenerateSection: () => new Promise(() => undefined),
      reviseSeedanceScript: () => new Promise(() => undefined),
      optimizeSeedanceScript: () => Promise.reject(socketHangUp)
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 5000,
      fallbackToMockOnTimeout: true
    });

    const story = await service.generateStory({
      inspiration: "悬疑短剧：电梯出现不存在的第十三层",
      textModel: "kimi-k2.6"
    });

    expect(story.world.title).toBeTruthy();
    expect(story.storyboard.length).toBeGreaterThan(0);
    expect(story.seedanceScript).toContain("Seedance 2.0");
    expect(story.promptOptimizationEnabled).toBe(false);
  });

  it("uses the fast imported-source path for long novels instead of many optimizer calls", async () => {
    const baseStory = {
      ...createDemoProject().storyState,
      promptOptimizationEnabled: true
    };
    const optimizerCalls: MediaPromptOptimizationInput[] = [];
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: async () => baseStory,
      regenerateSection: async () => ({}),
      reviseSeedanceScript: async () => "",
      optimizeSeedanceScript: async () => {
        throw new Error("should not optimize long imported source script synchronously");
      },
      optimizeMediaPrompt: async (input: MediaPromptOptimizationInput) => {
        optimizerCalls.push(input);
        return input.prompt;
      }
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, { requestTimeoutMs: 5000 });

    const story = await service.generateStory({
      inspiration: "长篇小说导入",
      sourceType: "novel",
      sourceText: Array.from({ length: 520 }, (_, index) => `第 ${index + 1} 个剧情节点，主角在异常空间追查线索。`).join("\n\n"),
      textModel: "kimi-k2.6"
    });

    expect(story.seedanceScript).toContain("Seedance 2.0");
    expect(story.promptOptimizationEnabled).toBe(false);
    expect(optimizerCalls).toHaveLength(0);
  });

  it("keeps imported novel segmentation when story generation falls back after timeout", async () => {
    const provider = {
      isMock: () => false,
      model: () => "test-model",
      generateStory: () => new Promise(() => undefined),
      regenerateSection: () => new Promise(() => undefined),
      reviseSeedanceScript: () => new Promise(() => undefined)
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 5,
      fallbackToMockOnTimeout: true
    });
    const sourceText = [
      "第1卷 第1章 入戏",
      "",
      "（作者亲了你一口并给出一个提示：初始考验在大客车，很快就能出去啦。么么哒！）",
      "",
      ...Array.from({ length: 19 }, (_, index) => {
        const chapter = index + 1;
        const marker =
          chapter === 19
            ? "最终章：陈策逃出大客车，看见第十三层档案馆入口，所有乘客身份被反转揭晓。"
            : `第${chapter}章：陈策在无人驾驶大客车里追查异常规则，发现乘客、时钟和车速不断变化。`;
        return `${marker}${" 车厢灯光闪烁，人物关系和规则线索继续推进。".repeat(6)}`;
      })
    ].join("\n\n");

    const story = await service.generateStory({
      inspiration: "我在死亡副本编写逃生代码",
      sourceType: "novel",
      sourceText,
      textModel: "gpt-5.5"
    });

    expect(story.storyboard.length).toBeGreaterThan(3);
    expect(story.characters.map((character) => character.name)).toEqual(expect.arrayContaining(["陈策"]));
    expect(story.characters.map((character) => character.name)).not.toEqual(["主角"]);
    expect(story.visualPrompts).toHaveLength(story.storyboard.length);
    expect(story.seedanceScript).toContain("第 19 段 15 秒");
    expect(story.seedanceScript).toContain("逃出大客车");
    expect(story.seedanceScript).not.toContain("作者亲了你一口");
    expect(story.seedanceScript).not.toContain("么么哒");
  });

  it("preserves sibling gender facts in fallback character model prompts", async () => {
    const provider = {
      isMock: () => false,
      model: () => "test-model",
      generateStory: () => new Promise(() => undefined),
      regenerateSection: () => new Promise(() => undefined),
      reviseSeedanceScript: () => new Promise(() => undefined)
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 5,
      fallbackToMockOnTimeout: true
    });

    const story = await service.generateStory({
      inspiration: "退役刑警林彻追查妹妹林夏失踪，进入第十三层档案馆。",
      outline: "林彻为了寻找妹妹林夏，进入不存在的第十三层。"
    });
    const linChe = story.characters.find((character) => character.name === "林彻");
    const linXia = story.characters.find((character) => character.name === "林夏");
    const linCheModel = deriveCharacterModelsFromStory(story).find((model) => model.name === "林彻");
    const linXiaModel = deriveCharacterModelsFromStory(story).find((model) => model.name === "林夏");

    expect(linChe?.gender).toContain("男性");
    expect(linChe?.relationshipToProtagonist).not.toContain("妹妹");
    expect(linCheModel?.consistencyPrompt).toContain("中国男性角色");
    expect(linCheModel?.consistencyPrompt).not.toContain("林彻的妹妹");
    expect(linCheModel?.consistencyPrompt).not.toContain("中国女性角色");
    expect(linXia?.gender).toContain("女性");
    expect(linXia?.relationshipToProtagonist).toContain("妹妹");
    expect(linXiaModel?.consistencyPrompt).toContain("中国女性角色");
    expect(linXiaModel?.consistencyPrompt).toContain("林彻的妹妹");
    expect(linXiaModel?.consistencyPrompt).toContain("不是男性角色");
  });

  it("rewrites generated Seedance scripts through the selected prompt optimizer before saving", async () => {
    const baseStory = {
      ...createDemoProject().storyState,
      visualStyleId: "cinematic-real",
      promptOptimizerModel: "kimi-k2.6" as const,
      sourceReferenceText: "“何必挣扎？”沈砚步步紧逼，剑尖抵住苏衍咽喉。",
      seedanceScript:
        "《破庙的残阳》E01《异常开启》Seedance 2.0 分镜脚本\n第 1 段 15 秒：原文推进 1\n分镜 1（0-5 秒）：中景 / 原文推进"
    };
    let capturedInput: SeedanceScriptOptimizationInput | undefined;
    const optimizedScript = [
      "《破庙的残阳》E01《异常开启》Seedance 2.0 优化分镜脚本",
      "第 1 段 15 秒：对峙与试探",
      "分镜 1（0-5 秒）：全景 → 中景 / 建立场景与对峙关系",
      "景别：破庙全景，缓慢推至双人中景。"
    ].join("\n");
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: async () => baseStory,
      regenerateSection: async () => ({}),
      reviseSeedanceScript: async () => "",
      optimizeSeedanceScript: async (input: SeedanceScriptOptimizationInput) => {
        capturedInput = input;
        return optimizedScript;
      }
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, { requestTimeoutMs: 1000 });

    const story = await service.generateStory({
      inspiration: "武侠同门反目",
      sourceType: "novel",
      sourceText: baseStory.sourceReferenceText,
      visualStyleId: "cinematic-real",
      textModel: "kimi-k2.6"
    });

    expect(story.seedanceScript).toBe(optimizedScript);
    expect(capturedInput?.currentScript).toBe(baseStory.seedanceScript);
    expect(capturedInput?.sourceReferenceText).toContain("何必挣扎");
    expect(capturedInput?.visualStyleLabel).toBe("写实剧照");
    expect(capturedInput?.textModel).toBe("kimi-k2.6");
  });

  it("rewrites generated Seedance scripts even when the model marks prompt optimization disabled", async () => {
    const baseStory = {
      ...createDemoProject().storyState,
      visualStyleId: "cinematic-real",
      promptOptimizerModel: "kimi-k2.6" as const,
      promptOptimizationEnabled: false,
      seedanceScript:
        "《破庙的残阳》E01《异常开启》Seedance 2.0 分镜脚本\n第 1 段 15 秒：原文推进 1\n分镜 1（0-5 秒）：中景 / 原文推进"
    };
    const optimizedScript = [
      "《破庙的残阳》E01《异常开启》Seedance 2.0 优化分镜脚本",
      "【整体统一设定】",
      "【第 1 段 15 秒：对峙与试探】",
      "对应原文段落：从沈砚索要到苏衍出手。",
      "首帧承接上一段：无，本段为开篇。",
      "分镜 1（0-5 秒）：全景 → 中景 / 建立场景",
      "动作：\n  0.0-2.0秒：破庙残阳摇曳。",
      "尾帧要求：停在苏衍眼神特写。",
      "本段尾帧描述：第 14.0-15.0 秒停在苏衍眼神特写。",
      "下一段首帧描述：下一段 0 秒从苏衍眼神特写拉开。"
    ].join("\n");
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: async () => baseStory,
      regenerateSection: async () => ({}),
      reviseSeedanceScript: async () => "",
      optimizeSeedanceScript: async () => optimizedScript
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, { requestTimeoutMs: 1000 });

    const story = await service.generateStory({
      inspiration: "武侠同门反目",
      sourceType: "novel",
      sourceText: "沈砚握着素铁剑，剑尖斜指地面。",
      visualStyleId: "cinematic-real",
      textModel: "kimi-k2.6"
    });

    expect(story.seedanceScript).toBe(optimizedScript);
    expect(story.promptOptimizationEnabled).not.toBe(false);
  });

  it("saves a director-grade local Seedance script when script optimization times out", async () => {
    const baseStory = {
      ...createDemoProject().storyState,
      visualStyleId: "cinematic-real",
      promptOptimizerModel: "kimi-k2.6" as const,
      promptOptimizationEnabled: true,
      seedanceScript:
        "《破庙的残阳》E01《异常开启》Seedance 2.0 分镜脚本\n第 1 段 15 秒：原文推进 1\n分镜 1（0-5 秒）：中景 / 原文推进"
    };
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: async () => baseStory,
      regenerateSection: async () => ({}),
      reviseSeedanceScript: async () => "",
      optimizeSeedanceScript: () => new Promise(() => undefined)
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, {
      requestTimeoutMs: 5,
      fallbackToMockOnTimeout: true
    });

    const story = await service.generateStory({
      inspiration: "武侠同门反目",
      sourceType: "novel",
      sourceText: "“何必挣扎？”沈砚步步紧逼，剑尖抵住苏衍咽喉。",
      visualStyleId: "cinematic-real",
      textModel: "kimi-k2.6"
    });

    expect(story.seedanceScript).toContain("Seedance 2.0 优化分镜脚本");
    expect(story.seedanceScript).toContain("【整体统一设定】");
    expect(story.seedanceScript).toContain("对应原文段落");
    expect(story.seedanceScript).toContain("本段尾帧描述");
    expect(story.seedanceScript).toContain("下一段首帧描述");
    expect(story.seedanceScript).not.toContain("原文推进");
    expect(story.seedanceScript).not.toContain("当前动作推进");
  });

  it("saves a director-grade local Seedance script when script optimization fails quality gates", async () => {
    const baseStory = {
      ...createDemoProject().storyState,
      visualStyleId: "cinematic-real",
      promptOptimizerModel: "kimi-k2.6" as const,
      promptOptimizationEnabled: true,
      seedanceScript:
        "《破庙的残阳》E01《异常开启》Seedance 2.0 分镜脚本\n第 1 段 15 秒：原文推进 1\n分镜 1（0-5 秒）：中景 / 原文推进"
    };
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: async () => baseStory,
      regenerateSection: async () => ({}),
      reviseSeedanceScript: async () => "",
      optimizeSeedanceScript: async () => {
        throw new Error("director template quality gate failed");
      }
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, { requestTimeoutMs: 1000 });

    const story = await service.generateStory({
      inspiration: "武侠同门反目",
      sourceType: "novel",
      sourceText: "“何必挣扎？”沈砚步步紧逼，剑尖抵住苏衍咽喉。",
      visualStyleId: "cinematic-real",
      textModel: "kimi-k2.6"
    });

    expect(story.seedanceScript).toContain("Seedance 2.0 优化分镜脚本");
    expect(story.seedanceScript).toContain("【第 1 段 15 秒");
    expect(story.seedanceScript).toContain("动作：\n  0.0-2.0秒");
    expect(story.seedanceScript).toContain("尾帧要求");
    expect(story.seedanceScript).not.toContain("围绕");
    expect(story.seedanceScript).not.toContain("推进原文中的关键事件");
  });

  it("rewrites generated image and video prompts through the selected prompt optimizer before saving", async () => {
    const demoStory = createDemoProject().storyState;
    const storyboard = [
      {
        ...demoStory.storyboard[0],
        imagePrompt: "raw image prompt for SB01",
        videoPrompt: "raw video prompt for SB01"
      }
    ];
    const baseStory = {
      ...demoStory,
      storyboard,
      visualPrompts: [
        {
          ...demoStory.visualPrompts[0],
          shotId: storyboard[0].id,
          imagePrompt: storyboard[0].imagePrompt,
          videoPrompt: storyboard[0].videoPrompt
        }
      ],
      visualStyleId: "cinematic-real",
      promptOptimizerModel: "gpt-5.5" as const,
      sourceReferenceText: "“何必挣扎？”沈砚步步紧逼，剑尖抵住苏衍咽喉。",
      seedanceScript: [
        "《破庙的残阳》E01《异常开启》Seedance 2.0 优化分镜脚本",
        "第 1 段 15 秒：对峙与试探",
        "分镜 1（0-5 秒）：全景 → 中景 / 建立场景与对峙关系",
        "动作：0.0-2.0秒：残阳斜照破庙，沈砚握剑对峙苏衍。"
      ].join("\n")
    };
    const optimizerCalls: MediaPromptOptimizationInput[] = [];
    const provider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: async () => baseStory,
      regenerateSection: async () => ({}),
      reviseSeedanceScript: async () => "",
      optimizeMediaPrompt: async (input: MediaPromptOptimizationInput) => {
        optimizerCalls.push(input);
        return input.kind === "video" ? "optimized video prompt for SB01" : "optimized image prompt for SB01";
      }
    } as unknown as OpenAITextProvider;
    const service = new TextPipelineService(provider, { requestTimeoutMs: 1000 });

    const story = await service.generateStory({
      inspiration: "武侠同门反目",
      sourceType: "novel",
      sourceText: baseStory.sourceReferenceText,
      visualStyleId: "cinematic-real",
      textModel: "gpt-5.5"
    });

    expect(story.storyboard[0].imagePrompt).toBe("optimized image prompt for SB01");
    expect(story.storyboard[0].videoPrompt).toBe("optimized video prompt for SB01");
    expect(story.visualPrompts[0].imagePrompt).toBe("optimized image prompt for SB01");
    expect(story.visualPrompts[0].videoPrompt).toBe("optimized video prompt for SB01");
    expect(optimizerCalls.map((call) => call.kind).sort()).toEqual(["imagePromptImage", "video"]);
    expect(optimizerCalls.every((call) => call.visualStyleLabel === "写实剧照")).toBe(true);
    expect(optimizerCalls.every((call) => call.textModel === "gpt-5.5")).toBe(true);
    expect(optimizerCalls.every((call) => call.sourceReferenceText?.includes("何必挣扎"))).toBe(true);
    expect(optimizerCalls.every((call) => call.storyContext?.includes("Seedance 优化分镜脚本"))).toBe(true);
  });
});
