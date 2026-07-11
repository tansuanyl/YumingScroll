import type { StoryState } from "../../src/types/domain";
import {
  buildVisualStyleGuardrail,
  buildVisualStylePromptSuffix,
  buildVisualStyleSeedanceLines,
  getDefaultVisualStylePreset,
  getVisualStyleKeywords,
  getVisualStylePreset
} from "../../src/data/visualStylePresets";
import {
  estimateImportedSourceSegmentCount,
  extractImportedSourceDialogues,
  getImportedSourceSegmentBeats,
  normalizeGeneratedStoryStateForInput,
  sanitizeImportedSourceText,
  type MediaPromptOptimizationInput,
  type OpenAITextProvider,
  type StoryGenerationInput,
  type TextModelSelection
} from "../providers/OpenAITextProvider";
import { syncStoryStateWithSeedanceSegments } from "./ProjectDerivation";
import { env } from "../env";

type TextPipelineServiceOptions = {
  requestTimeoutMs?: number;
  fallbackToMockOnTimeout?: boolean;
};

type StoryPromptOptimizationOptions = {
  allowFallbackDraftOnTransientOptimizationError?: boolean;
};

const LONG_IMPORTED_SOURCE_CHAR_THRESHOLD = 12_000;
const MAX_SYNC_MEDIA_PROMPT_OPTIMIZATION_SHOTS = 12;
const AVAILABLE_TEXT_MODELS = ["kimi-k2.6", "gpt-5.5"] as const;

export class TextPipelineService {
  private readonly requestTimeoutMs: number;
  private readonly fallbackToMockOnTimeout: boolean;

  constructor(private readonly provider: OpenAITextProvider, options: TextPipelineServiceOptions = {}) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? env.OPENAI_TEXT_TIMEOUT_MS;
    this.fallbackToMockOnTimeout =
      options.fallbackToMockOnTimeout ?? env.OPENAI_FALLBACK_TO_MOCK_ON_TIMEOUT === "true";
  }

  status() {
    const configuredModels = this.provider.isMock()
      ? [...AVAILABLE_TEXT_MODELS]
      : AVAILABLE_TEXT_MODELS.filter((model) => this.provider.isConfiguredFor(model));
    const configured = configuredModels.length > 0;

    return {
      provider: "openai",
      mode: this.provider.isMock() ? "mock" : configured ? "live" : "unconfigured",
      configured,
      configuredModels,
      configurationSource: this.provider.isMock() ? "mock" : configured ? "server-env" : "missing",
      model: this.provider.model(),
      availableModels: [...AVAILABLE_TEXT_MODELS],
      requestTimeoutMs: this.requestTimeoutMs,
      fallbackToMockOnTimeout: this.fallbackToMockOnTimeout
    };
  }

  async generateStory(input: string | StoryGenerationInput): Promise<StoryState> {
    const storyInput = typeof input === "string" ? { inspiration: input } : input;
    let story: StoryState;
    try {
      story = await withTimeout(this.provider.generateStory(input), this.requestTimeoutMs, "Text generation timed out");
    } catch (error) {
      if (!this.fallbackToMockOnTimeout || !isRecoverableInitialStoryGenerationError(error)) {
        throw error;
      }

      console.warn("Text story generation failed; saving a local imported-source fallback draft.", error);
      const fallbackStory = normalizeGeneratedStoryStateForInput(createFallbackStory(input), storyInput);
      return this.optimizeGeneratedStoryPrompts(fallbackStory, storyInput, {
        allowFallbackDraftOnTransientOptimizationError: true
      });
    }

    return this.optimizeGeneratedStoryPrompts(story, storyInput);
  }

  private async optimizeGeneratedSeedanceScript(
    story: StoryState,
    storyInput: StoryGenerationInput
  ): Promise<StoryState> {
    if (this.provider.isMock()) {
      return story;
    }
    if (shouldUseFastImportedSourceTextPath(storyInput, story)) {
      return { ...story, promptOptimizationEnabled: false };
    }

    const optimizer = this.provider as OpenAITextProvider & {
      optimizeSeedanceScript?: OpenAITextProvider["optimizeSeedanceScript"];
    };
    if (typeof optimizer.optimizeSeedanceScript !== "function") {
      return story;
    }

    const visualStyleId = story.visualStyleId || storyInput.visualStyleId;
    const visualStyle = getVisualStylePreset(visualStyleId) || getDefaultVisualStylePreset();
    const sourceReferenceText =
      story.sourceReferenceText ||
      (storyInput.sourceType === "novel" && storyInput.sourceText
        ? sanitizeImportedSourceText(storyInput.sourceText)
        : undefined);

    try {
      const optimizedScript = await withTimeout(
        optimizer.optimizeSeedanceScript({
          currentScript: story.seedanceScript,
          story,
          sourceReferenceText,
          visualStyleLabel: visualStyle.label,
          visualStylePrompt: visualStyle.prompt,
          textModel: story.promptOptimizerModel || storyInput.textModel
        }),
        this.requestTimeoutMs,
        "Seedance script optimization timed out"
      );
      const trimmedScript = optimizedScript.trim();
      return trimmedScript ? { ...story, seedanceScript: trimmedScript, promptOptimizationEnabled: true } : story;
    } catch (error) {
      console.warn("Seedance script optimization failed; saving a director-grade local fallback script.", error);
      return {
        ...story,
        seedanceScript: buildFallbackSeedanceScript({
          title: story.world.title || storyInput.inspiration,
          inspiration: storyInput.inspiration,
          background: story.world.background,
          outline: story.outline,
          characters: story.characters.map((character) => character.name),
          storyboard: story.storyboard,
          sourceType: storyInput.sourceType,
          sourceReferenceText,
          visualStyleId
        }),
        promptOptimizationEnabled: false
      };
    }
  }

  private async optimizeGeneratedStoryPrompts(
    story: StoryState,
    storyInput: StoryGenerationInput,
    options: StoryPromptOptimizationOptions = {}
  ): Promise<StoryState> {
    let scriptOptimizedStory: StoryState;
    try {
      scriptOptimizedStory = syncStoryStateWithSeedanceSegments(
        await this.optimizeGeneratedSeedanceScript(story, storyInput)
      );
    } catch (error) {
      if (
        (options.allowFallbackDraftOnTransientOptimizationError && isTransientTextProviderError(error)) ||
        (shouldUseFastImportedSourceTextPath(storyInput, story) && isRecoverableSeedanceOptimizationError(error))
      ) {
        console.warn("Seedance script optimization failed; keeping the generated imported-source draft.", error);
        return syncStoryStateWithSeedanceSegments({ ...story, promptOptimizationEnabled: false });
      }
      throw error;
    }
    return syncStoryStateWithSeedanceSegments(
      await this.optimizeGeneratedImageAndVideoPrompts(scriptOptimizedStory, storyInput)
    );
  }

  private async optimizeGeneratedImageAndVideoPrompts(
    story: StoryState,
    storyInput: StoryGenerationInput
  ): Promise<StoryState> {
    if (this.provider.isMock() || story.storyboard.length === 0) {
      return story;
    }
    if (shouldUseFastImportedSourceTextPath(storyInput, story)) {
      return story;
    }

    const optimizer = this.provider as OpenAITextProvider & {
      optimizeMediaPrompt?: OpenAITextProvider["optimizeMediaPrompt"];
    };
    if (typeof optimizer.optimizeMediaPrompt !== "function") {
      return story;
    }

    const visualStyleId = story.visualStyleId || storyInput.visualStyleId;
    const visualStyle = getVisualStylePreset(visualStyleId) || getDefaultVisualStylePreset();
    const sourceReferenceText =
      story.sourceReferenceText ||
      (storyInput.sourceType === "novel" && storyInput.sourceText
        ? sanitizeImportedSourceText(storyInput.sourceText)
        : undefined);
    const model = story.promptOptimizerModel || storyInput.textModel;
    const storyContext = buildGeneratedPromptOptimizationContext(story);

    const storyboard = await mapWithConcurrency(story.storyboard, 3, async (shot) => {
      const [imagePrompt, videoPrompt] = await Promise.all([
        this.optimizeGeneratedMediaPrompt(optimizer, {
          prompt: shot.imagePrompt,
          kind: "imagePromptImage",
          visualStyleLabel: visualStyle.label,
          visualStylePrompt: visualStyle.prompt,
          storyContext,
          sourceReferenceText,
          textModel: model
        }),
        this.optimizeGeneratedMediaPrompt(optimizer, {
          prompt: shot.videoPrompt,
          kind: "video",
          visualStyleLabel: visualStyle.label,
          visualStylePrompt: visualStyle.prompt,
          storyContext,
          sourceReferenceText,
          textModel: model
        })
      ]);

      return {
        ...shot,
        imagePrompt,
        videoPrompt
      };
    });

    const promptsByShotId = new Map(storyboard.map((shot) => [shot.id, shot]));
    return {
      ...story,
      storyboard,
      visualPrompts: story.visualPrompts.map((prompt) => {
        const shot = promptsByShotId.get(prompt.shotId);
        if (!shot) return prompt;
        return {
          ...prompt,
          imagePrompt: shot.imagePrompt,
          videoPrompt: shot.videoPrompt
        };
      })
    };
  }

  private async optimizeGeneratedMediaPrompt(
    optimizer: OpenAITextProvider & { optimizeMediaPrompt?: OpenAITextProvider["optimizeMediaPrompt"] },
    input: MediaPromptOptimizationInput
  ): Promise<string> {
    const sourcePrompt = input.prompt.trim();
    if (!sourcePrompt || typeof optimizer.optimizeMediaPrompt !== "function") return sourcePrompt;

    try {
      const optimizedPrompt = await withTimeout(
        optimizer.optimizeMediaPrompt(input),
        this.requestTimeoutMs,
        "Generated media prompt optimization timed out"
      );
      return optimizedPrompt.trim() || sourcePrompt;
    } catch (error) {
      console.warn("Generated media prompt optimization failed; keeping the generated draft prompt.", error);
      return sourcePrompt;
    }
  }

  async regenerateSection(
    section: string,
    inspiration: string,
    textModel?: TextModelSelection
  ): Promise<Partial<StoryState>> {
    return withTimeout(
      this.provider.regenerateSection(section, inspiration, textModel),
      this.requestTimeoutMs,
      "Text section regeneration timed out"
    );
  }

  async reviseSeedanceScript(input: {
    currentScript: string;
    revisionPrompt: string;
    storyContext?: string;
    textModel?: TextModelSelection;
  }): Promise<string> {
    return withTimeout(
      this.provider.reviseSeedanceScript(input),
      this.requestTimeoutMs,
      "Seedance script revision timed out"
    );
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timer = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new TimeoutError(`${message} after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timer]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(workers);
  return results;
}

function buildGeneratedPromptOptimizationContext(story: StoryState): string {
  const characters = story.characters
    .map((character) => `${character.name}：${character.role}，${character.appearance}`)
    .filter(Boolean)
    .join("\n");
  const scenes = story.script
    .map((scene) => `${scene.title || scene.location}：${scene.location}，${scene.description}`)
    .filter(Boolean)
    .join("\n");

  return [
    `项目标题：${story.world.title}`,
    `世界观：${shortPromptContext(story.world.background, 1000)}`,
    story.world.styleKeywords.length ? `画风关键词：${story.world.styleKeywords.join("、")}` : "",
    characters ? `人物设定：\n${shortPromptContext(characters, 1600)}` : "",
    scenes ? `场景设定：\n${shortPromptContext(scenes, 1400)}` : "",
    story.outline ? `剧情大纲：${shortPromptContext(story.outline, 1000)}` : "",
    story.seedanceScript ? `Seedance 优化分镜脚本：\n${shortPromptContext(story.seedanceScript, 2400)}` : ""
  ]
    .filter(Boolean)
    .join("\n\n");
}

function shortPromptContext(value: string | undefined, maxLength: number): string {
  const text = value?.replace(/\s+/g, " ").trim() || "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 16)).trim()}...[已截断]`;
}

function createFallbackStory(input: string | StoryGenerationInput): StoryState {
  const storyInput = typeof input === "string" ? { inspiration: input } : input;
  const importedSourceText =
    storyInput.sourceType === "novel" && storyInput.sourceText ? sanitizeImportedSourceText(storyInput.sourceText) : "";
  const sourceBeats = importedSourceText ? extractFallbackSourceBeats(importedSourceText) : [];
  const brief = [
    storyInput.inspiration,
    storyInput.worldTitle,
    storyInput.worldBackground,
    storyInput.outline,
    importedSourceText.slice(0, 10000)
  ]
    .filter(Boolean)
    .join("\n");
  const title = selectFallbackTitle(storyInput);
  const background =
    storyInput.worldBackground?.trim() ||
    buildFallbackSourceBackground(storyInput, sourceBeats);
  const outline =
    storyInput.outline?.trim() ||
    buildFallbackSourceOutline(storyInput, sourceBeats);
  const styleSuffix = buildVisualStylePromptSuffix(storyInput.visualStyleId);
  const styleGuardrail = buildVisualStyleGuardrail(storyInput.visualStyleId);
  const characterNames = extractCharacterNames(brief);
  const characters = characterNames.map((name, index) => {
    const identity = inferFallbackCharacterIdentity(name, index, brief, characterNames[0] || "主角");
    return {
      id: `char-fallback-${index + 1}`,
      name,
      role: identity.role || (index === 0 ? "核心主角 / 事件调查者" : "关键关联角色"),
      age: identity.age,
      gender: identity.gender,
      relationshipToProtagonist: identity.relationshipToProtagonist,
      personality: index === 0 ? ["冷静", "警觉", "执着"] : ["神秘", "克制", "掌握线索"],
      appearance:
        identity.appearance ||
        (index === 0
          ? "成熟人物比例，深色长外套，冷静警觉的眼神，处在异常事件中心的角色。"
          : "成熟人物比例，深色服装，眼神克制，带有重要线索感的角色。"),
      speakingStyle: index === 0 ? "短句克制，先观察再判断。" : "话语简短，留下暗示和悬念。",
      consistencyPrompt: [
        name,
        identity.gender,
        identity.age,
        identity.relationshipToProtagonist,
        identity.role,
        identity.appearance,
        "成熟人物比例，角色定妆图",
        styleSuffix,
        identity.gender?.includes("女性") ? "不是男性角色，不要男性化脸部和体型" : "",
        styleGuardrail
      ]
        .filter(Boolean)
        .join("，")
    };
  });
  const mainCharacter = characters[0]?.name || "主角";
  const secondaryCharacter = characters[1]?.name;
  const scenes =
    sourceBeats.length > 0
      ? sourceBeats.map((beat, index) => {
          const dialogues = extractImportedSourceDialogues(beat, mainCharacter);
          return {
            id: `scene-source-fallback-${index + 1}`,
            title: buildFallbackBeatTitle(beat, index),
            location: inferFallbackLocation(beat, title),
            description: dialogues[0]?.narration || beat,
            dialogues: dialogues.length > 0
              ? dialogues.map((dialogue) => ({
                  character: dialogue.character,
                  line: dialogue.line,
                  emotion: inferFallbackDialogueEmotion(beat)
                }))
              : extractFallbackDialogue(beat, mainCharacter)
          };
        })
      : [
          {
            id: "scene-fallback-1",
            title: "初始情境",
            location: title,
            description: `从“${storyInput.inspiration}”切入，建立主角、场景和当前事件的第一处变化。`,
            dialogues: [
              {
                character: mainCharacter,
                line: "这里不对劲。",
                emotion: "警觉"
              }
            ]
          },
          {
            id: "scene-fallback-2",
            title: "关键地点",
            location: title,
            description: `角色接近故事设定中的关键地点，观察到与剧情大纲相关的推进信息。`,
            dialogues: [
              {
                character: secondaryCharacter || mainCharacter,
                line: "先确认这里发生了什么。",
                emotion: "压抑"
              }
            ]
          },
          {
            id: "scene-fallback-3",
            title: "下一步线索",
            location: title,
            description: "新的证据或角色反应把剧情推向下一段视频。",
            dialogues: [
              {
                character: mainCharacter,
                line: "先把线索记下来。",
                emotion: "克制"
              }
            ]
          }
        ];
  const storyboard = scenes.map((scene, index) => {
    const order = index + 1;
    return {
      id: `shot-fallback-${order}`,
      sceneId: scene.id,
      order,
      shotType: index === 0 ? "全景到中景" : index === 1 ? "中景到近景" : "特写",
      cameraMovement: index === 0 ? "缓慢推镜" : index === 1 ? "跟拍推进" : "快速切换到关键物件",
      composition:
        sourceBeats.length > 0
          ? shortText(scene.description, `${scene.location}中的原文关键情节`, 180)
          : `${scene.location}中，${mainCharacter}处在画面视觉中心，环境线索围绕角色逐步显现。`,
      characterActions:
        sourceBeats.length > 0
          ? `${mainCharacter}经历原文中的关键推进：${shortText(scene.description, "剧情推进", 150)}`
          : index === 0
            ? `${mainCharacter}发现异常并停下脚步。`
            : index === 1
              ? `${mainCharacter}进入关键空间，视线扫过隐藏线索。`
              : `${mainCharacter}根据新的证据和人物反应，准备推进下一步。`,
      expression: index === 0 ? "警觉、压抑" : index === 1 ? "冷静、疑惑" : "震惊但克制",
      background: sourceBeats.length > 0 ? `${scene.location}：${scene.description}` : background,
      dialogue: scene.dialogues.map((dialogue) => formatFallbackDialogue(dialogue, mainCharacter)).filter(Boolean).join("\n"),
      imagePrompt: `${title}，${scene.description}，${mainCharacter}，${styleSuffix}，${styleGuardrail}`,
      videoPrompt: `15秒短剧片段，${scene.description}，${mainCharacter}完成关键动作，镜头${index === 0 ? "缓慢推近" : index === 1 ? "跟拍进入" : "切到特写"}，${styleSuffix}，${styleGuardrail}`
    };
  });
  const visualPrompts = storyboard.map((shot) => ({
    id: `prompt-${shot.id}`,
    shotId: shot.id,
    imagePrompt: shot.imagePrompt,
    videoPrompt: shot.videoPrompt
  }));

  return {
    world: {
      title,
      background,
      rules:
        sourceBeats.length > 0
          ? ["严格按导入原文推进剧情", "保留原文人物关系、场景和关键转折", "每个 15 秒段落只改编对应原文内容"]
          : ["空间会随着剧情推进发生变化", "角色行动会影响下一步信息呈现", "关键线索会通过人物观察或物件变化出现"],
      factions: sourceBeats.length > 0 ? ["导入原文主角方", "原文关键关联者", "原文中的规则或威胁方"] : ["调查者", "隐藏档案管理者", "被卷入事件的关联者"],
      timeline:
        sourceBeats.length > 0
          ? sourceBeats.slice(0, 8).map((beat, index) => `原文推进 ${index + 1}：${shortText(beat, "关键剧情", 36)}`)
          : ["初始情境", "角色接近关键地点", "新的线索出现", "下一步行动展开"],
      styleKeywords: getVisualStyleKeywords(storyInput.visualStyleId)
    },
    characters,
    outline,
    script: scenes,
    storyboard,
    visualPrompts,
    seedanceScript: buildFallbackSeedanceScript({
      title,
      inspiration: storyInput.inspiration,
      background,
      outline,
      characters: characters.map((character) => character.name),
      storyboard,
      sourceType: storyInput.sourceType,
      sourceReferenceText: storyInput.sourceText ? sanitizeImportedSourceText(storyInput.sourceText) : undefined,
      visualStyleId: storyInput.visualStyleId
    })
  };
}

function extractFallbackSourceBeats(sourceText: string): string[] {
  const normalized = sourceText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const targetCount = estimateImportedSourceSegmentCount(normalized, 1);
  const providerSegments = getImportedSourceSegmentBeats(normalized, targetCount);
  if (providerSegments.length > 0) return providerSegments;

  const explicitShots = normalized
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => /(?:分镜\s*\d+|第\s*\d+\s*段|景别|运镜|主角|动作|台词|场景)/.test(line) && line.length >= 12);
  if (explicitShots.length >= 3) {
    return selectFallbackRepresentativeItems(chunkFallbackItems(explicitShots, 3).map((items) => items.join(" ")), targetCount);
  }

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 24);
  if (paragraphs.length >= 3) return selectFallbackRepresentativeItems(paragraphs, targetCount);

  const sentences =
    normalized
      .match(/[^。！？!?]+[。！？!?]?/g)
      ?.map((sentence) => sentence.replace(/\s+/g, " ").trim())
      .filter((sentence) => sentence.length >= 12) || [];
  if (sentences.length === 0) return [shortText(normalized, "导入原文", 220)];
  return selectFallbackRepresentativeItems(chunkFallbackItems(sentences, 3).map((items) => items.join("")), targetCount);
}

function buildFallbackSourceBackground(storyInput: StoryGenerationInput, sourceBeats: string[]): string {
  if (sourceBeats.length === 0) {
    return `围绕“${storyInput.inspiration}”展开的现代都市悬疑世界，空间规则异常，隐藏线索会逐步推动角色进入核心事件。`;
  }

  return [
    "根据导入小说原文改编。",
    `开端：${shortText(sourceBeats[0], "原文开端", 180)}`,
    sourceBeats[1] ? `推进：${shortText(sourceBeats[1], "原文推进", 160)}` : "",
    sourceBeats[sourceBeats.length - 1] ? `阶段钩子：${shortText(sourceBeats[sourceBeats.length - 1], "原文后段", 160)}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function buildFallbackSourceOutline(storyInput: StoryGenerationInput, sourceBeats: string[]): string {
  if (sourceBeats.length === 0) {
    return `主角从“${storyInput.inspiration}”出发，发现现实规则出现异常，并在追查过程中进入一个被隐藏的关键空间。`;
  }

  const middleBeat = sourceBeats[Math.floor(sourceBeats.length / 2)];
  return [
    `起点：${shortText(sourceBeats[0], "原文开端", 170)}`,
    middleBeat ? `中段：${shortText(middleBeat, "原文中段", 170)}` : "",
    `收束：${shortText(sourceBeats[sourceBeats.length - 1], "原文结尾钩子", 170)}`
  ]
    .filter(Boolean)
    .join(" ");
}

function buildFallbackBeatTitle(beat: string, index: number): string {
  const explicitTitle = beat.match(/(?:第\s*\d+\s*段\s*15\s*秒|分镜\s*\d+)[：:：]?\s*([^。！？!?；;\n]{2,24})/)?.[1];
  if (explicitTitle) return explicitTitle.trim();
  return `剧情段落 ${index + 1}`;
}

function inferFallbackLocation(beat: string, fallback: string): string {
  const match = beat.match(/(?:场景|地点|位置)[：:]\s*([^。！？!?；;\n]{2,40})/);
  if (match?.[1]) return match[1].trim();
  const locationHint = beat.match(/(?:车厢|大客车|驾驶座|公路|仓库|竞技场|小镇|医院|档案馆|教室|走廊|电梯|房间)/)?.[0];
  return locationHint || fallback;
}

function extractFallbackDialogue(beat: string, fallbackCharacter: string): Array<{ character: string; line: string; emotion: string }> {
  const quoted = beat.match(/(?:“([^”]{1,60})”|"([^"]{1,60})")/);
  const line = quoted?.[1] || quoted?.[2];
  if (!line) return [];
  const beforeQuote = beat.slice(0, quoted.index || 0);
  const speaker = beforeQuote.match(/([\u4e00-\u9fa5]{2,3})(?:低声|沉声|问道|说道|开口|喊道|打断|呻吟|画外音)?\s*$/)?.[1];
  return [
    {
      character: speaker || fallbackCharacter,
      line,
      emotion: /惊|恐|尖叫|痛|颤/.test(beat) ? "紧张" : "克制"
    }
  ];
}

function inferFallbackDialogueEmotion(beat: string): string {
  return /惊|恐|尖叫|痛|颤|急|怒|骂/.test(beat) ? "紧张" : "克制";
}

function formatFallbackDialogue(
  dialogue: { character: string; line: string; emotion: string } | undefined,
  fallbackCharacter: string
): string | undefined {
  if (!dialogue?.line?.trim()) return undefined;
  const line = dialogue.line.trim();
  if (line.includes("：") || line.includes(":") || line.includes("“")) return ensureFallbackPeriod(line);
  return `${dialogue.character || fallbackCharacter}：“${line}”`;
}

function formatSeedanceDialogueLine(dialogue: string | undefined, fallbackCharacter: string): string {
  const text = dialogue?.trim();
  if (!text || text === "无" || text === "无。") return "无。";
  if (text.includes("：") || text.includes(":") || text.includes("“")) return ensureFallbackPeriod(text);
  return `${fallbackCharacter}：“${text}”`;
}

function ensureFallbackPeriod(value: string): string {
  const text = value.trim();
  return /[。！？.!?”"']$/.test(text) ? text : `${text}。`;
}

function chunkFallbackItems(items: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function selectFallbackRepresentativeItems<T>(items: T[], maxItems: number): T[] {
  if (items.length <= maxItems) return items;
  if (maxItems <= 1) return [items[0]];

  const selected: T[] = [];
  const usedIndexes = new Set<number>();
  for (let index = 0; index < maxItems; index += 1) {
    const sourceIndex = Math.round((index * (items.length - 1)) / (maxItems - 1));
    if (usedIndexes.has(sourceIndex)) continue;
    usedIndexes.add(sourceIndex);
    selected.push(items[sourceIndex]);
  }
  return selected;
}

function shortText(value: string | undefined, fallback: string, maxLength = 26): string {
  const text = value?.replace(/\s+/g, " ").trim() || fallback;
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function deriveFallbackTitle(inspiration: string): string {
  const archiveMatch = inspiration.match(/第十?三层[\u4e00-\u9fa5]{0,8}/);
  if (archiveMatch) return archiveMatch[0];
  const bookTitleMatch = inspiration.match(/《([^》]+)》/);
  if (bookTitleMatch?.[1]) return bookTitleMatch[1];
  const cleaned = inspiration.replace(/^[^：:]+[：:]/, "").trim();
  return cleaned.slice(0, 18) || "未命名悬疑短剧";
}

function selectFallbackTitle(input: StoryGenerationInput): string {
  const derivedTitle = deriveFallbackTitle(input.inspiration);
  const explicitTitle = input.worldTitle?.trim();
  if (!explicitTitle) return derivedTitle;
  if (isLikelyStaleDemoTitle(explicitTitle, input.inspiration)) return derivedTitle;
  return explicitTitle;
}

function isLikelyStaleDemoTitle(title: string, inspiration: string): boolean {
  return ["雨幕新东京", "霓虹雨夜的芯片恋人"].includes(title) && !inspiration.includes(title);
}

function extractCharacterNames(brief: string): string[] {
  const knownNames = ["林彻", "林澈", "越铭", "林夏"];
  const names = knownNames.filter((name) => brief.includes(name));
  if (names.length > 0) return names;

  const matches = Array.from(
    brief.matchAll(/([\u4e00-\u9fa5]{2,3})(?:在|进入|发现|看到|抬头|站在|追查|回收|逃跑)/g),
    (match) => match[1]
  ).filter((name) => !["故事", "世界", "剧情", "少女", "刑警", "档案", "电梯"].includes(name));

  return Array.from(new Set(matches)).slice(0, 2).concat(["主角"]).slice(0, Math.max(1, Math.min(2, matches.length || 1)));
}

function inferFallbackCharacterIdentity(
  name: string,
  index: number,
  brief: string,
  protagonistName: string
): {
  age?: string;
  gender?: string;
  relationshipToProtagonist?: string;
  role?: string;
  appearance?: string;
} {
  const nearContext = collectNearNameText(brief, name);
  const context = `${nearContext}。${brief}`;
  const relationship = inferFallbackRelationship(name, protagonistName, context);
  const gender =
    ["林夏"].includes(name) ||
    relationship.includes("妹妹") ||
    relationship.includes("姐姐") ||
    /(女性|女人|女子|女孩|少女|女儿|女主)/.test(context)
      ? "中国女性角色"
      : ["林彻", "林澈", "越铭"].includes(name) || /(男性|男人|男子|男孩|哥哥|弟弟|男主|刑警)/.test(context)
        ? "中国男性角色"
        : undefined;
  const age = inferFallbackAge(name, context);

  if (relationship.includes("妹妹")) {
    return {
      age: age || "成年或青年女性",
      gender,
      relationshipToProtagonist: relationship,
      role: `${protagonistName}的妹妹 / 失踪关键人物`,
      appearance: "成熟或青年女性比例，深色服装，气质神秘克制，眼神带有失踪事件的脆弱与悬念，不是男性角色。"
    };
  }

  return {
    age,
    gender,
    relationshipToProtagonist: relationship || (index === 0 ? "主角" : undefined)
  };
}

function inferFallbackRelationship(name: string, protagonistName: string, context: string): string {
  if (name === protagonistName) return "";
  if (matchesFallbackFamilyRelationship(name, protagonistName, context, "妹妹")) {
    return `${protagonistName}的妹妹`;
  }
  if (matchesFallbackFamilyRelationship(name, protagonistName, context, "姐姐")) {
    return `${protagonistName}的姐姐`;
  }
  if (matchesFallbackFamilyRelationship(name, protagonistName, context, "弟弟")) {
    return `${protagonistName}的弟弟`;
  }
  if (matchesFallbackFamilyRelationship(name, protagonistName, context, "哥哥")) {
    return `${protagonistName}的哥哥`;
  }
  return "";
}

function matchesFallbackFamilyRelationship(name: string, protagonistName: string, context: string, relation: string): boolean {
  const escapedName = escapeRegExp(name);
  const escapedProtagonist = escapeRegExp(protagonistName);
  const relationBeforeName = new RegExp(`(?:${escapedProtagonist}|主角|他|她)?(?:的)?(?:失踪)?${relation}[^，。；、\\n]{0,6}${escapedName}`);
  const nameBeforeRelation = new RegExp(
    `${escapedName}(?:是|为|，|,|：|:|、|——|—)[^，。；、\\n]{0,12}(?:${escapedProtagonist}|主角)?(?:的)?(?:失踪)?${relation}`
  );
  return relationBeforeName.test(context) || nameBeforeRelation.test(context);
}

function inferFallbackAge(name: string, context: string): string | undefined {
  const escapedName = escapeRegExp(name);
  const nearAge = context.match(new RegExp(`${escapedName}[^，。；、\\n]{0,12}(\\d{1,2}\\s*岁)|(\\d{1,2}\\s*岁)[^，。；、\\n]{0,12}${escapedName}`));
  return nearAge?.[1] || nearAge?.[2] || undefined;
}

function collectNearNameText(context: string, name: string): string {
  if (!name) return "";
  const chunks: string[] = [];
  let startIndex = 0;
  while (chunks.length < 8) {
    const index = context.indexOf(name, startIndex);
    if (index < 0) break;
    chunks.push(context.slice(Math.max(0, index - 24), Math.min(context.length, index + name.length + 32)));
    startIndex = index + name.length;
  }
  return chunks.join("。");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFallbackSeedanceScript(input: {
  title: string;
  inspiration: string;
  background: string;
  outline: string;
  characters: string[];
  storyboard: StoryState["storyboard"];
  sourceType?: StoryGenerationInput["sourceType"];
  sourceReferenceText?: string;
  visualStyleId?: string;
}): string {
  const mainCharacter = input.characters[0] || "主角";
  const characterNames = input.characters.filter(Boolean);
  const preset = getVisualStylePreset(input.visualStyleId) || getDefaultVisualStylePreset();
  const visualStyleLines = buildVisualStyleSeedanceLines(input.visualStyleId);
  const shots = input.storyboard.length > 0 ? input.storyboard : [buildSyntheticStoryboardShot(input, mainCharacter)];
  const sourceSegments =
    input.sourceType === "novel" && input.sourceReferenceText
      ? getImportedSourceSegmentBeats(input.sourceReferenceText, shots.length)
      : [];
  const segmentContexts = shots.map((shot, index) =>
    cleanRoughSeedanceText(sourceSegments[index] || shot.characterActions || shot.background || shot.composition || input.outline)
  );
  const tailFrames = shots.map((shot, index) =>
    buildDirectorTailFrameDescription(shot, segmentContexts[index], index, preset.label)
  );
  return [
    `《${input.title}》E01《异常开启》Seedance 2.0 优化分镜脚本`,
    "用途：适配即梦 / Seedance 2.0 视频模型，直接用于分段生成视频。",
    "格式：每段 15 秒，每段至少 3 个分镜，统一标注起止秒数。",
    `成片类型：${preset.label} AI 漫剧短剧。`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "【整体统一设定】",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ...visualStyleLines,
    "运镜：短剧感，平稳流畅，少用剧烈旋转，多用推镜、跟拍、特写切换、灯光闪烁。",
    "首尾帧连续：第 2 段及之后的开头承接上一段末帧的位置、光影、人物姿态、视线方向和镜头运动；每段结尾保留可衔接下一段首帧的尾帧。",
    `人物：${characterNames.join("，") || mainCharacter}。`,
    ...(input.sourceType === "novel" ? [] : [`故事灵感：${input.inspiration}`, `世界观：${input.background}`, `剧情大纲：${input.outline}`]),
    `禁忌：${buildVisualStyleGuardrail(input.visualStyleId)}`,
    "",
    ...shots.flatMap((shot, index) =>
      buildDirectorFallbackSegment({
        shot,
        index,
        mainCharacter,
        characterNames,
        sourceSegment: segmentContexts[index],
        previousTailFrame: index === 0 ? "" : tailFrames[index - 1],
        tailFrame: tailFrames[index],
        nextFirstFrame:
          index === shots.length - 1 ? "" : buildDirectorNextFirstFrameDescription(shots[index + 1], tailFrames[index], index),
        visualStyleLabel: preset.label
      })
    ),
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "【生成提示词附录】",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `【人物一致性提示词】${characterNames.join("、") || mainCharacter}：保持同一演员脸型、发型、服装主色和年龄感，${preset.label}质感，镜头内不要频繁换脸。`,
    `【场景一致性提示词】${cleanRoughSeedanceText(input.background || input.outline || "根据当前剧情场景保持空间连续。")}`,
    `【氛围关键词】${preset.label}，短剧镜头语言，15 秒分段，首尾帧连续，动作清晰，光影稳定。`
  ].join("\n");
}
function buildSyntheticStoryboardShot(
  input: {
    title: string;
    background: string;
    outline: string;
  },
  mainCharacter: string
): StoryState["storyboard"][number] {
  return {
    id: "SB01",
    sceneId: "SC01",
    order: 1,
    shotType: "全景到中景",
    cameraMovement: "缓慢推镜",
    composition: cleanRoughSeedanceText(input.outline || input.background || input.title),
    characterActions: `${mainCharacter}进入关键场景，观察环境变化并推动当前剧情。`,
    dialogue: "",
    expression: "警觉、克制",
    background: cleanRoughSeedanceText(input.background || input.outline || "关键场景内部。"),
    imagePrompt: "",
    videoPrompt: ""
  };
}

function buildDirectorFallbackSegment(input: {
  shot: StoryState["storyboard"][number];
  index: number;
  mainCharacter: string;
  characterNames: string[];
  sourceSegment: string;
  previousTailFrame: string;
  tailFrame: string;
  nextFirstFrame: string;
  visualStyleLabel: string;
}): string[] {
  const segmentNumber = input.index + 1;
  const characters = inferDirectorSegmentCharacters(
    [input.sourceSegment, input.shot.characterActions, input.shot.background, input.shot.dialogue].join(" "),
    input.characterNames,
    input.mainCharacter
  );
  const title = buildDirectorSegmentTitle(input.shot, input.sourceSegment, input.index);
  const shotType = cleanRoughSeedanceText(input.shot.shotType || "中景到近景");
  const cameraMovement = cleanRoughSeedanceText(input.shot.cameraMovement || "平稳推镜");
  const sceneText = cleanRoughSeedanceText(input.shot.background || input.sourceSegment || title);
  const actionText = cleanRoughSeedanceText(input.shot.characterActions || input.sourceSegment || title);
  const sourceText = cleanRoughSeedanceText(input.sourceSegment || actionText || sceneText);
  const dialogueLines = splitFallbackSeedanceDialogueLines(input.shot.dialogue, input.mainCharacter);
  const lightLine = `光影：遵循“${input.visualStyleLabel}”画风的色彩、光影、材质和阴影要求，突出当前剧情重点。`;
  const continuityLine = input.index === 0 ? "无，本段为开篇。" : `承接上一段尾帧：${input.previousTailFrame}`;

  return [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `【第 ${segmentNumber} 段 15 秒：${title}】`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `对应原文段落：${sourceText}`,
    `首帧承接上一段：${continuityLine}`,
    "",
    `分镜 1（0-5 秒）：${shotType} / 建立当前段落关系`,
    `景别：${shotType}。`,
    `运镜：${cameraMovement}，从环境关系推到人物动作。`,
    `主角：${characters}。`,
    "动作：",
    `  0.0-2.0秒：${shortText(sceneText, "镜头建立当前场景的空间、光线和人物站位", 120)}。`,
    `  2.0-4.0秒：${shortText(actionText, "人物完成当前段落的第一个关键动作", 120)}。`,
    "  4.0-5.0秒：镜头停在人物反应或关键道具上，为下一镜保留动作方向。",
    `台词：${dialogueLines[0] || "无。"}`,
    "音效：环境声持续，动作发生处加入细节声响，人物呼吸和衣料摩擦保持可感知。",
    lightLine,
    `场景关键词：${shortText(sceneText, "当前场景", 80)}。`,
    "",
    "分镜 2（5-10 秒）：近景 / 动作升级与情绪推进",
    "景别：近景。",
    "运镜：镜头跟随人物移动，保持动作方向和视线方向连续。",
    `主角：${characters}。`,
    "动作：",
    `  5.0-7.0秒：${shortText(actionText, "人物动作继续升级", 110)}。`,
    "  7.0-9.0秒：环境细节或关键道具回应人物动作，制造剧情压力。",
    "  9.0-10.0秒：切到主要角色表情变化，情绪进入下一层。",
    `台词：${dialogueLines[1] || "无。"}`,
    "音效：环境声短暂压低，突出当前动作中的主要声响。",
    lightLine,
    `场景关键词：${shortText(sceneText, "人物所在空间", 80)}。`,
    "",
    "分镜 3（10-15 秒）：特写 / 段落收束与尾帧衔接",
    "景别：特写。",
    "运镜：从人物反应切到段落结果，最后一秒保持镜头方向、动作方向和光影连续。",
    `主角：${characters}。`,
    "动作：",
    `  10.0-12.0秒：${shortText(input.shot.expression || actionText, "角色情绪出现明确变化", 100)}。`,
    "  12.0-14.0秒：关键动作或道具状态完成本段转折。",
    `  14.0-15.0秒：${input.tailFrame}`,
    `台词：${dialogueLines.slice(2).join("；") || "无。"}`,
    "音效：环境声保持连续，最后一秒不要静音切断，保留可接下一段的环境声尾音。",
    `光影：延续“${input.visualStyleLabel}”画风的光影逻辑，最后一秒停在可衔接下一段首帧的连续尾帧。`,
    `尾帧要求：${input.tailFrame}`,
    `本段尾帧描述：${input.tailFrame}`,
    `下一段首帧描述：${input.nextFirstFrame || "无，当前为最后一段。"}`,
    ""
  ];
}

function buildDirectorSegmentTitle(shot: StoryState["storyboard"][number], sourceSegment: string, index: number): string {
  const candidates = [shot.composition, shot.background, sourceSegment, shot.characterActions]
    .map((item) => cleanRoughSeedanceText(item || ""))
    .filter(Boolean);
  const selected = candidates.find((item) => item.length >= 4) || `剧情段落 ${index + 1}`;
  return shortText(selected.replace(/[，。！？；].*$/, ""), `剧情段落 ${index + 1}`, 18);
}

function inferDirectorSegmentCharacters(text: string, characterNames: string[], fallbackCharacter: string): string {
  const matched = characterNames.filter((name) => name && text.includes(name));
  return (matched.length > 0 ? matched : [fallbackCharacter]).join("、");
}

function buildDirectorTailFrameDescription(
  shot: StoryState["storyboard"][number],
  sourceSegment: string,
  index: number,
  visualStyleLabel: string
): string {
  const focus = cleanRoughSeedanceText(shot.expression || shot.characterActions || sourceSegment || shot.background);
  return `第 ${index + 1} 段最后 1 秒停在${shortText(focus, "角色反应和关键道具状态", 54)}，保持“${visualStyleLabel}”光影、人物姿态、视线方向和镜头运动连续。`;
}

function buildDirectorNextFirstFrameDescription(
  nextShot: StoryState["storyboard"][number],
  previousTailFrame: string,
  index: number
): string {
  const nextFocus = cleanRoughSeedanceText(nextShot.background || nextShot.characterActions || nextShot.composition);
  return `第 ${index + 2} 段 0 秒承接上一段尾帧：${previousTailFrame} 镜头不切黑，顺势拉开或推近到${shortText(nextFocus, "下一段关键动作", 54)}。`;
}

function cleanRoughSeedanceText(value: string | undefined): string {
  return (value || "")
    .replace(/原文推进\s*\d+[：:]?/g, "")
    .replace(/当前动作推进/g, "动作延续")
    .replace(/[\u4e00-\u9fa5]{1,12}经历原文中的关键(?:推进|事件)[：:]/g, "")
    .replace(/经历原文中的关键(?:推进|事件)[：:]/g, "")
    .replace(/推进原文中的关键事件[：:]?/g, "")
    .replace(/围绕[“"「]?[^”"」]{0,120}[”"」]?延展人物动作与环境反应，?保持与原文段落一致。?/g, "镜头延续人物动作、环境反应和剧情压力。")
    .replace(/[\s\n]+/g, " ")
    .replace(/[，,。；;：:]\s*[，,。；;：:]+/g, "，")
    .trim();
}

function splitFallbackSeedanceDialogueLines(dialogue: string | undefined, fallbackCharacter: string): string[] {
  const text = cleanRoughSeedanceText(dialogue);
  if (!text || text === "无" || text === "无。") return [];
  return text
    .split(/\n+|(?<=["”])\s*[；;]\s*(?=[\u4e00-\u9fa5]{2,6}[：:])/)
    .map((line) => formatSeedanceDialogueLine(line.trim(), fallbackCharacter))
    .filter((line) => line && line !== "无。");
}

function isTransientTextProviderError(error: unknown): boolean {
  if (error instanceof TimeoutError) return true;
  if (!error || typeof error !== "object") return false;

  const timeoutLike = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    cause?: unknown;
  };
  const signal = [timeoutLike.name, timeoutLike.message, timeoutLike.code]
    .filter((item): item is string => typeof item === "string")
    .join(" ");

  if (
    /APIConnectionTimeoutError|APIConnectionError|timed out|timeout|socket hang up|socket closed|fetch failed|network|ECONNRESET|ETIMEDOUT|EPIPE|ENOTFOUND|ECONNREFUSED|UND_ERR_HEADERS_TIMEOUT|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT/i.test(
      signal
    )
  ) {
    return true;
  }

  if (timeoutLike.cause && timeoutLike.cause !== error) {
    return isTransientTextProviderError(timeoutLike.cause);
  }

  return false;
}

function isRecoverableInitialStoryGenerationError(error: unknown): boolean {
  if (isTransientTextProviderError(error)) return true;
  if (!(error instanceof Error)) return false;

  const signal = `${error.name} ${error.message}`;
  if (/Missing .*API key|invalid_api_key|Incorrect API key|Unauthorized|401|forbidden|permission|billing|insufficient[_\s-]*(?:quota|balance|credit)|quota exceeded/i.test(signal)) {
    return false;
  }

  return /Text model returned (?:empty content|invalid JSON) for story generation|invalid JSON for story generation|story generation.*empty content|malformed.*story generation/i.test(
    signal
  );
}

function shouldUseFastImportedSourceTextPath(storyInput: StoryGenerationInput, story: StoryState): boolean {
  if (storyInput.sourceType !== "novel") return false;
  const importedSourceLength = storyInput.sourceText?.trim().length || story.sourceReferenceText?.trim().length || 0;
  return (
    importedSourceLength >= LONG_IMPORTED_SOURCE_CHAR_THRESHOLD ||
    story.storyboard.length > MAX_SYNC_MEDIA_PROMPT_OPTIMIZATION_SHOTS
  );
}

function isRecoverableSeedanceOptimizationError(error: unknown): boolean {
  if (isTransientTextProviderError(error)) return true;
  if (!(error instanceof Error)) return false;
  return /Seedance script optimization did not meet director-grade template quality/i.test(error.message);
}

class TimeoutError extends Error {
  name = "TimeoutError";
}
