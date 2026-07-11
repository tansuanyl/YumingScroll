import OpenAI from "openai";
import { createDemoProject } from "../../src/data/demoProject";
import {
  buildVisualStyleGuardrail,
  buildVisualStyleInstruction,
  buildVisualStylePromptSuffix,
  buildVisualStyleSeedanceLines,
  getDefaultVisualStylePreset,
  getVisualStyleKeywords,
  getVisualStylePreset
} from "../../src/data/visualStylePresets";
import { buildStoryPromptLibraryGuidance } from "../../src/lib/promptLibraryGuidance";
import type { StoryState, TextModelSelection } from "../../src/types/domain";

type OpenAITextProviderOptions = {
  mock?: boolean;
  apiMode?: TextApiMode;
  baseURL?: string;
  client?: OpenAI;
  maxCompletionTokens?: number;
};

export type { TextModelSelection } from "../../src/types/domain";

export type MediaPromptOptimizationKind = "characterImage" | "sceneImage" | "imagePromptImage" | "video";

export type MediaPromptOptimizationInput = {
  prompt: string;
  kind: MediaPromptOptimizationKind;
  visualStyleLabel?: string;
  visualStylePrompt?: string;
  storyContext?: string;
  sourceReferenceText?: string;
  textModel?: TextModelSelection;
};

export type SeedanceScriptOptimizationInput = {
  currentScript: string;
  story: StoryState;
  sourceReferenceText?: string;
  visualStyleLabel?: string;
  visualStylePrompt?: string;
  textModel?: TextModelSelection;
};

export type StoryGenerationInput = {
  inspiration: string;
  worldTitle?: string;
  worldBackground?: string;
  outline?: string;
  sourceType?: "brief" | "novel";
  sourceText?: string;
  sourceFileName?: string;
  visualStyleId?: string;
  textModel?: TextModelSelection;
};

type TextApiMode = "responses" | "chat";

const OPENAI_MODEL = "gpt-5.5";
const MOONSHOT_MODEL = "kimi-k2.6";
const MOONSHOT_BASE_URL = "https://api.moonshot.cn/v1";
const MAX_IMPORTED_SOURCE_SEGMENTS = 40;
const MAX_IMPORTED_PROMPT_CHARS = 36000;
const SOURCE_CHARS_PER_SEGMENT = 700;
const MAX_IMPORTED_SOURCE_CHARACTERS = 6;
const CJK_NAME_CHARS = "\\u4e00-\\u9fa5";
const CHINESE_NAME_BOUNDARY = "(?=[\\uFF0C,\\u3002\\uFF1B;\\s])";
const GENERIC_CHARACTER_NAMES = new Set(["主角", "男主", "女主", "主人公", "核心主角", "事件调查者"]);
const IMPORTED_NAME_STOP_WORDS = new Set([
  "故事",
  "世界",
  "剧情",
  "少女",
  "刑警",
  "档案",
  "电梯",
  "作者",
  "读者",
  "系统",
  "规则",
  "线索",
  "人物",
  "主角",
  "男人",
  "男子",
  "女人",
  "女子",
  "乘客",
  "司机",
  "车厢",
  "大客车",
  "驾驶座",
  "方向盘",
  "路灯",
  "壮汉",
  "大个子",
  "肌肉男",
  "瘦弱男",
  "瘦弱男子",
  "黑衣男子",
  "黑衣男人",
  "后面",
  "前方",
  "左侧",
  "右侧",
  "三人",
  "二人",
  "众人",
  "对方",
  "自己",
  "这里",
  "那里",
  "观察者",
  "表演者",
  "一人",
  "两人",
  "四人",
  "几人",
  "你们",
  "他们",
  "接着",
  "没有",
  "开口",
  "应该",
  "此刻",
  "广播",
  "起来",
  "进去",
  "下去",
  "出去",
  "周围",
  "之前",
  "之后",
  "现在",
  "知道",
  "看见",
  "看到",
  "继续",
  "不是"
]);
const IMPORTED_DESCRIPTIVE_CHARACTER_LABELS = new Set([
  "壮汉",
  "大个子",
  "肌肉男",
  "瘦弱男",
  "瘦弱男子",
  "黑衣男子",
  "黑衣男人",
  "黑色西装男人",
  "黑色西装的男人",
  "前排左侧的人",
  "前排右侧的人"
]);
const COMMON_CHINESE_SURNAME_CHARS = new Set(
  "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程邢裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘斜厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲台从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦尚农温庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公"
    .split("")
);
const COMMON_CHINESE_COMPOUND_SURNAMES = [
  "欧阳",
  "太史",
  "端木",
  "上官",
  "司马",
  "东方",
  "独孤",
  "南宫",
  "万俟",
  "闻人",
  "夏侯",
  "诸葛",
  "尉迟",
  "公羊",
  "赫连",
  "澹台",
  "皇甫",
  "宗政",
  "濮阳",
  "公冶",
  "太叔",
  "申屠",
  "公孙",
  "慕容",
  "仲孙",
  "钟离",
  "长孙",
  "宇文",
  "司徒",
  "鲜于",
  "司空",
  "闾丘",
  "子车",
  "亓官",
  "司寇",
  "巫马",
  "公西",
  "颛孙",
  "壤驷",
  "公良",
  "漆雕",
  "乐正",
  "宰父",
  "谷梁",
  "拓跋",
  "夹谷",
  "轩辕",
  "令狐",
  "段干",
  "百里",
  "呼延",
  "东郭",
  "南门",
  "羊舌",
  "微生",
  "公户",
  "公玉",
  "公仪",
  "梁丘",
  "公仲",
  "公上",
  "公门",
  "公山",
  "公坚",
  "左丘",
  "公伯",
  "西门",
  "公祖",
  "第五",
  "公乘",
  "贯丘",
  "公皙",
  "南荣",
  "东里",
  "东宫",
  "仲长",
  "子书",
  "子桑",
  "即墨",
  "达奚",
  "褚师"
];
const IMPORTED_DESCRIPTIVE_LABEL_NOUNS =
  "男人|女人|男子|女子|男孩|女孩|男生|女生|少年|少女|青年|壮汉|大汉|老者|老人|小孩|孩子|乘客|司机|警察|刑警|记者|医生|老师|学生|大叔|阿姨";
const IMPORTED_NARRATIVE_FRAGMENT_PATTERN =
  /(缓缓|猛然|忽然|突然|立刻|顿时|再次|正在|已经|正|抬头|低头|抬眼|回头|转身|站起|坐直|看向|看着|看了|望去|打量|问道|说道|喊道|答道|开口|继续|皱眉|沉声|低声|大声|笑|侧身|避过|横削|直刺|欺身|抚过|缠绕|化解|旋身|劈向|躲闪|步步|紧逼|点头|摇头|抱头|走向|追问|回答|盯着|发现|发觉|觉得|意识到|伸手|抓住|离开|进入|分别|斜靠|坐在|扶住|压低|听见|注意到|闪烁|回|望|坐|看|问|说|喊|答|扶|摇|晃)$/;
const IMPORTED_ACTION_NAME_FRAGMENT =
  /(正斜靠|分别坐|斜靠|坐直|抬眼|望去|打量|发觉|觉得|发现|看清|看不|开口|点头|愣了|冲他|冲她|左右看|站起|站了|回头|低头|勾头|走向|抱头|摸了|摊了|喊道|说道|问道|回答|打断)$/;
const IMPORTED_TRAILING_NAME_PARTICLES = new Set(["嗤", "却", "便", "也", "又", "仍"]);

const SEEDANCE_SEGMENTED_SCRIPT_CONTRACT = [
  "Seedance script format is strict:",
  "1. storyboard 数组中每个对象都代表一个 15 秒视频段，不是 5 秒小分镜。",
  "2. seedanceScript 必须按段输出：第 1 段 15 秒、第 2 段 15 秒、第 3 段 15 秒，继续递增直到覆盖完整主线内容，段数不固定为 3 段。",
  "3. 每段至少 3 个分镜：分镜 1（0-5 秒）、分镜 2（5-10 秒）、分镜 3（10-15 秒）。",
  "4. 每段内部秒数都从 0-5、5-10、10-15 重新开始。",
  "5. 不要输出从 0 到 75 秒的连续总时间轴，不要输出分镜 4（15-20 秒）或分镜 13（60-75 秒）这种跨段编号。",
  "6. 每个分镜都必须包含：景别、运镜、主角、动作、台词、音效、光影、场景。",
  "7. 每个 15 秒段落都要能直接作为一次 Seedance 2.0 / 即梦视频生成输入。",
  "8. 根据小说全文的叙事节拍动态决定 15 秒片段数量，不要套用固定 3 段或固定 40 段模板，也不要为了填满上限而扩写。",
  "9. storyboard.length 就是你分析后认为需要生成的视频段数量；短摘录可以只有 1-5 段，长篇多章节可以超过 40 段，但必须由内容密度决定。",
  "10. 必须覆盖导入原文中的完整主线内容，保留关键起因、转折、发现、冲突和结尾钩子。",
  "11. 首尾帧连续：第 2 段及之后的开头要承接上一段末帧的位置、光影、人物姿态、视线方向和镜头运动；每段结尾要保留可衔接到下一段首帧的尾帧。",
  "12. 不要默认切黑、黑屏、眨眼或闪白转场；除非原文明确写到停电、闭眼或黑场，否则用动作连续、视线连续、镜头方向连续、物体运动连续来连接相邻 15 秒片段。",
  "13. seedanceScript 必须直接输出导演级成稿，标题必须包含“Seedance 2.0 优化分镜脚本”，不要输出粗稿式“Seedance 2.0 分镜脚本”。",
  "14. seedanceScript 必须使用用户示例里的 Kimi K2.6 导演分镜稿结构：先写用途、格式、成片类型，再写【整体统一设定】，再按【第 1 段 15 秒：段落标题】、【第 2 段 15 秒：段落标题】递增展开，最后写【生成提示词附录】。",
  "15. 每段必须写“对应原文段落”和“首帧承接上一段”；第 1 段写“无，本段为开篇”，第 2 段及之后必须逐项引用上一段“本段尾帧描述”的位置、光影、人物姿态、视线方向、道具位置和镜头运动。",
  "16. 每段分镜 1/2/3 必须像导演稿一样拆成 0.0-2.0秒、2.0-4.0秒、4.0-5.0秒或对应区间内的子秒点动作，并包含景别、运镜、主角、动作、台词、音效、光影、场景关键词。",
  "17. 每段结尾必须同时写“尾帧要求”“本段尾帧描述”“下一段首帧描述”；最后一段的“下一段首帧描述”可以写“无，当前为最后一段”。",
  "18. 禁止使用“原文推进 1”“当前动作推进”“围绕……延展”“推进原文中的关键事件”等粗稿占位表达；禁止把“翻飞间已”“沈砚浑身”这类原文动作片段当作说话人。"
].join("\n");

const stringArraySchema = {
  type: "array",
  items: { type: "string" }
} as const;

const STORY_STATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    world: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
        background: { type: "string" },
        rules: stringArraySchema,
        factions: stringArraySchema,
        timeline: stringArraySchema,
        styleKeywords: stringArraySchema
      },
      required: ["title", "background", "rules", "factions", "timeline", "styleKeywords"]
    },
    characters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          role: { type: "string" },
          age: { type: "string" },
          gender: { type: "string" },
          relationshipToProtagonist: { type: "string" },
          personality: stringArraySchema,
          appearance: { type: "string" },
          speakingStyle: { type: "string" },
          consistencyPrompt: { type: "string" }
        },
        required: [
          "id",
          "name",
          "role",
          "age",
          "gender",
          "relationshipToProtagonist",
          "personality",
          "appearance",
          "speakingStyle",
          "consistencyPrompt"
        ]
      }
    },
    outline: { type: "string" },
    script: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          location: { type: "string" },
          description: { type: "string" },
          dialogues: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                character: { type: "string" },
                line: { type: "string" },
                emotion: { type: "string" }
              },
              required: ["character", "line", "emotion"]
            }
          }
        },
        required: ["id", "title", "location", "description", "dialogues"]
      }
    },
    storyboard: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          sceneId: { type: "string" },
          order: { type: "number" },
          shotType: { type: "string" },
          cameraMovement: { type: "string" },
          composition: { type: "string" },
          characterActions: { type: "string" },
          expression: { type: "string" },
          background: { type: "string" },
          dialogue: { type: "string" },
          imagePrompt: { type: "string" },
          videoPrompt: { type: "string" }
        },
        required: [
          "id",
          "sceneId",
          "order",
          "shotType",
          "cameraMovement",
          "composition",
          "characterActions",
          "expression",
          "background",
          "dialogue",
          "imagePrompt",
          "videoPrompt"
        ]
      }
    },
    visualPrompts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          shotId: { type: "string" },
          imagePrompt: { type: "string" },
          videoPrompt: { type: "string" }
        },
        required: ["id", "shotId", "imagePrompt", "videoPrompt"]
      }
    },
    seedanceScript: { type: "string" }
  },
  required: ["world", "characters", "outline", "script", "storyboard", "visualPrompts", "seedanceScript"]
} as const;

const STORY_SYSTEM_PROMPT = [
  "You are a professional AI comic writer. Return only a StoryState JSON object that exactly matches the provided schema.",
  "For every character, infer and preserve age, gender, and relationshipToProtagonist from the user brief or imported source.",
  "Family words are binding: if the source says 妹妹林夏 or 林彻的妹妹林夏, 林夏 must be a female character and relationshipToProtagonist must say 主角的妹妹.",
  "Do not turn female characters into male characters, and do not erase family relationships.",
  "Each character consistencyPrompt must explicitly include gender, age or age range, family/story role, facial features, hair, outfit, body type, temperament, and anti-drift constraints.",
  buildStoryPromptLibraryGuidance(),
  SEEDANCE_SEGMENTED_SCRIPT_CONTRACT,
  "The storyboard and visualPrompts arrays must correspond by shotId."
].join("\n");

const SEEDANCE_REVISION_SYSTEM_PROMPT = [
  "You revise Chinese Seedance 2.0 storyboard scripts for AI comic videos. Return only the revised script, no explanation.",
  "Preserve the structure and convert old continuous timelines into independent 15-second segments when needed.",
  buildStoryPromptLibraryGuidance(),
  SEEDANCE_SEGMENTED_SCRIPT_CONTRACT,
  "Keep the story consistent unless the user explicitly asks to change it."
].join("\n");

const MEDIA_PROMPT_OPTIMIZATION_SYSTEM_PROMPT = [
  "You optimize Chinese prompts for Jimeng / Seedance 2.0 image and 15-second video generation.",
  "Return only the optimized prompt text. Do not add explanations, markdown titles, JSON, or code fences.",
  "Preserve character names, relationships, scene names, causal order, selected references, aspect ratio, and existing negative constraints.",
  "Do not introduce new plot events, new characters, extra dialogue, readable text overlays, watermarks, or logos.",
  "Do not paste large chunks of novel source text into the output. Convert source text into visual action, camera, composition, light, and continuity language."
].join("\n");

const SEEDANCE_SCRIPT_OPTIMIZATION_SYSTEM_PROMPT = [
  "You are a professional Chinese director and prompt engineer for Jimeng / Seedance 2.0 AI comic short videos.",
  "Rewrite the provided Seedance script into a polished production-ready shot script. Return only the rewritten script, no explanation and no markdown fence.",
  "Use the source novel reference as the authority. The rough script is only a draft and may have missing dialogue, collapsed beats, or poor segmentation.",
  "Keep all plot beats, character names, relationships, dialogue intent, causal order, and selected visual style, but rebalance or add 15-second segments when the source requires it.",
  "Do not invent new characters or new story reversals. Do not use name fragments or action fragments as speakers.",
  "Convert rough novel excerpts into clear camera language: shot size, camera movement, actor blocking, object details, lighting, sound, continuity, and exact 0-5 / 5-10 / 10-15 second action beats.",
  "The result should look like a high-quality director storyboard script that can be pasted directly into Jimeng / Seedance 2.0."
].join("\n");

export class OpenAITextProvider {
  private readonly mock: boolean;
  private readonly client?: OpenAI;
  private readonly configuredApiMode?: TextApiMode;
  private readonly configuredBaseURL?: string;
  private readonly maxCompletionTokens: number;

  constructor(options: OpenAITextProviderOptions = {}) {
    this.mock = options.mock ?? resolveOpenAIMockMode();
    this.configuredApiMode = options.apiMode;
    this.configuredBaseURL = options.baseURL;
    this.maxCompletionTokens = options.maxCompletionTokens ?? resolveMaxCompletionTokens();
    this.client = this.mock ? undefined : options.client;
  }

  isMock(): boolean {
    return this.mock;
  }

  isConfiguredFor(textModel?: string): boolean {
    if (this.mock || this.client) return true;
    return Boolean(resolveTextApiKey(this.model(textModel)));
  }

  model(textModel?: string): string {
    return resolveProviderModel(textModel || resolveDefaultTextModel(this.configuredApiMode));
  }

  async generateStory(input: string | StoryGenerationInput): Promise<StoryState> {
    const storyInput = typeof input === "string" ? { inspiration: input } : input;
    const importedSourceText =
      storyInput.sourceType === "novel" && storyInput.sourceText ? sanitizeImportedSourceText(storyInput.sourceText) : "";
    const storyInputForGeneration = importedSourceText ? { ...storyInput, sourceText: importedSourceText } : storyInput;
    const promptSourceText = importedSourceText ? buildImportedSourcePromptText(importedSourceText) : "";
    const model = this.model(storyInput.textModel);
    const client = this.clientFor(model);

    if (this.mock) {
      const story = createDemoProject({ inspiration: importedSourceText || storyInput.inspiration }).storyState;
      return normalizeGeneratedStoryStateForInput(
        {
          ...story,
          world: {
            ...story.world,
            title: storyInput.worldTitle?.trim() || story.world.title,
            background: storyInput.worldBackground?.trim() || story.world.background
          },
          outline: storyInput.outline?.trim() || story.outline
        },
        storyInputForGeneration
      );
    }

    if (!client) {
      throw new Error(buildMissingApiKeyMessage(model));
    }

    if (this.apiModeFor(model) === "chat") {
      return this.generateStoryWithChatCompletions(client, model, storyInputForGeneration, promptSourceText);
    }

    const response = await client.responses.create({
      model,
      text: {
        format: {
          type: "json_schema",
          name: "story_state",
          strict: true,
          schema: STORY_STATE_JSON_SCHEMA
        } as any
      },
      input: [
        {
          role: "system",
          content: STORY_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildStoryGenerationPrompt(storyInputForGeneration, promptSourceText)
        }
      ]
    });

    return normalizeGeneratedStoryStateForInput(
      parseStoryStateJson(response.output_text, "story generation"),
      storyInputForGeneration
    );
  }

  async regenerateSection(
    section: string,
    inspiration: string,
    textModel?: TextModelSelection
  ): Promise<Partial<StoryState>> {
    const story = await this.generateStory({ inspiration, textModel });
    if (section === "world") return { world: story.world };
    if (section === "characters") return { characters: story.characters };
    if (section === "outline") return { outline: story.outline };
    if (section === "script") return { script: story.script };
    if (section === "storyboard") return { storyboard: story.storyboard, visualPrompts: story.visualPrompts };
    return story;
  }

  async reviseSeedanceScript(input: {
    currentScript: string;
    revisionPrompt: string;
    storyContext?: string;
    textModel?: TextModelSelection;
  }): Promise<string> {
    const model = this.model(input.textModel);
    const client = this.clientFor(model);

    if (this.mock) {
      return [
        input.currentScript,
        "",
        "Seedance 2.0 分镜脚本定向修改：",
        input.revisionPrompt
      ].join("\n");
    }

    if (!client) {
      throw new Error(buildMissingApiKeyMessage(model));
    }

    if (this.apiModeFor(model) === "chat") {
      return this.reviseSeedanceScriptWithChatCompletions(client, model, input);
    }

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: SEEDANCE_REVISION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            "当前故事上下文：",
            input.storyContext || "未提供",
            "",
            "当前 Seedance 2.0 分镜脚本：",
            input.currentScript,
            "",
            "用户针对性修改提示词：",
            input.revisionPrompt
          ].join("\n")
        }
      ]
    });

    return response.output_text.trim();
  }

  async optimizeMediaPrompt(input: MediaPromptOptimizationInput): Promise<string> {
    const model = this.model(input.textModel);
    const client = this.clientFor(model);

    if (this.mock) {
      return input.prompt;
    }

    if (!client) {
      throw new Error(buildMissingApiKeyMessage(model));
    }

    if (this.apiModeFor(model) === "chat") {
      return this.optimizeMediaPromptWithChatCompletions(client, model, input);
    }

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: MEDIA_PROMPT_OPTIMIZATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildMediaPromptOptimizationPrompt(input)
        }
      ]
    });

    return sanitizeOptimizedMediaPrompt(response.output_text, input.prompt);
  }

  async optimizeSeedanceScript(input: SeedanceScriptOptimizationInput): Promise<string> {
    const model = this.model(input.textModel);
    const client = this.clientFor(model);

    if (this.mock) {
      return input.currentScript;
    }

    if (!client) {
      throw new Error(buildMissingApiKeyMessage(model));
    }

    if (this.apiModeFor(model) === "chat") {
      return this.optimizeSeedanceScriptWithChatCompletions(client, model, input);
    }

    const response = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: SEEDANCE_SCRIPT_OPTIMIZATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildSeedanceScriptOptimizationPrompt(input)
        }
      ]
    });

    const optimizedScript = sanitizeOptimizedSeedanceScript(response.output_text, input.currentScript);
    if (isDirectorGradeSeedanceScript(optimizedScript)) return optimizedScript;

    const repairResponse = await client.responses.create({
      model,
      input: [
        {
          role: "system",
          content: SEEDANCE_SCRIPT_OPTIMIZATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildSeedanceScriptQualityRepairPrompt(input, optimizedScript)
        }
      ]
    });
    const repairedScript = sanitizeOptimizedSeedanceScript(repairResponse.output_text, input.currentScript);
    if (isDirectorGradeSeedanceScript(repairedScript)) return repairedScript;

    throw new Error(buildSeedanceScriptQualityError(repairedScript));
  }

  private async generateStoryWithChatCompletions(
    client: OpenAI,
    model: string,
    storyInput: StoryGenerationInput,
    importedSourceText: string
  ): Promise<StoryState> {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: STORY_SYSTEM_PROMPT
        },
        ...(isKimiModel(model)
          ? [
              {
                role: "system" as const,
                content: `Output must be one valid JSON object matching this JSON Schema:\n${JSON.stringify(STORY_STATE_JSON_SCHEMA)}`
              }
            ]
          : []),
        {
          role: "user",
          content: buildStoryGenerationPrompt(storyInput, importedSourceText)
        }
      ],
      response_format: buildChatResponseFormat(model),
      ...buildChatTokenOptions(model, this.maxCompletionTokens),
      ...buildKimiChatOptions(model)
    } as any);

    return normalizeGeneratedStoryStateForInput(
      parseStoryStateJson(extractTextContent(response.choices[0]?.message?.content, "story generation"), "story generation"),
      storyInput
    );
  }

  private async reviseSeedanceScriptWithChatCompletions(
    client: OpenAI,
    model: string,
    input: {
      currentScript: string;
      revisionPrompt: string;
      storyContext?: string;
    }
  ): Promise<string> {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: SEEDANCE_REVISION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: [
            "当前故事上下文：",
            input.storyContext || "未提供",
            "",
            "当前 Seedance 2.0 分镜脚本：",
            input.currentScript,
            "",
            "用户针对性修改提示词：",
            input.revisionPrompt
          ].join("\n")
        }
      ],
      ...buildChatTokenOptions(model, this.maxCompletionTokens),
      ...buildKimiChatOptions(model)
    } as any);

    return extractTextContent(response.choices[0]?.message?.content, "Seedance script revision").trim();
  }

  private async optimizeMediaPromptWithChatCompletions(
    client: OpenAI,
    model: string,
    input: MediaPromptOptimizationInput
  ): Promise<string> {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: MEDIA_PROMPT_OPTIMIZATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildMediaPromptOptimizationPrompt(input)
        }
      ],
      ...buildChatTokenOptions(model, Math.min(this.maxCompletionTokens, 12000)),
      ...buildKimiChatOptions(model)
    } as any);

    return sanitizeOptimizedMediaPrompt(
      extractTextContent(response.choices[0]?.message?.content, "media prompt optimization"),
      input.prompt
    );
  }

  private async optimizeSeedanceScriptWithChatCompletions(
    client: OpenAI,
    model: string,
    input: SeedanceScriptOptimizationInput
  ): Promise<string> {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: SEEDANCE_SCRIPT_OPTIMIZATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildSeedanceScriptOptimizationPrompt(input)
        }
      ],
      ...buildChatTokenOptions(model, this.maxCompletionTokens),
      ...buildKimiChatOptions(model)
    } as any);

    const optimizedScript = sanitizeOptimizedSeedanceScript(
      extractTextContent(response.choices[0]?.message?.content, "Seedance script optimization"),
      input.currentScript
    );
    if (isDirectorGradeSeedanceScript(optimizedScript)) return optimizedScript;

    const repairResponse = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: SEEDANCE_SCRIPT_OPTIMIZATION_SYSTEM_PROMPT
        },
        {
          role: "user",
          content: buildSeedanceScriptQualityRepairPrompt(input, optimizedScript)
        }
      ],
      ...buildChatTokenOptions(model, this.maxCompletionTokens),
      ...buildKimiChatOptions(model)
    } as any);

    const repairedScript = sanitizeOptimizedSeedanceScript(
      extractTextContent(repairResponse.choices[0]?.message?.content, "Seedance script quality repair"),
      input.currentScript
    );
    if (isDirectorGradeSeedanceScript(repairedScript)) return repairedScript;

    throw new Error(buildSeedanceScriptQualityError(repairedScript));
  }

  private clientFor(model: string): OpenAI | undefined {
    if (this.client) return this.client;
    const apiKey = resolveTextApiKey(model);
    if (!apiKey) return undefined;
    return new OpenAI({
      apiKey,
      baseURL: resolveTextBaseURL(model, this.configuredBaseURL)
    });
  }

  private apiModeFor(model: string): TextApiMode {
    if (isKimiModel(model)) return "chat";
    if (/^gpt-/i.test(model)) return "responses";
    return this.configuredApiMode ?? resolveTextApiMode(model);
  }
}

function buildMediaPromptOptimizationPrompt(input: MediaPromptOptimizationInput): string {
  const visualStyleLabel = input.visualStyleLabel?.trim() || "项目所选";
  const visualStylePrompt = input.visualStylePrompt?.trim();
  const storyContext = input.storyContext?.trim();
  const sourceReferenceText = input.sourceReferenceText?.trim();
  const taskLabel = mediaPromptOptimizationTaskLabel(input.kind);

  return [
    `任务类型：${taskLabel}`,
    "",
    `核心要求：我将严格遵循${visualStyleLabel}画风、15 秒分段要求，拆解原文动作、明确分镜细节，并参考小说原文，优化表述让大模型精准捕捉镜头逻辑，贴合即梦 / Seedance 2.0 生成需求。`,
    "",
    "优化规则：",
    "1. 只输出优化后的提示词正文，不要解释优化过程。",
    "2. 保持原项目画风、人物身份、场景设定、镜头连续性和负面约束。",
    "3. 人物模型图要聚焦角色定妆，不要把小说原文或整段剧情台词塞入人物定妆提示词。",
    "4. 场景模型图要聚焦空场景、光影、材质和空间结构，除非原提示词明确需要人物，否则不要新增人物。",
    "5. Image Prompt 图要服务当前 15 秒片段风格参考，保留人物/场景参考图锁定关系。",
    "6. 15 秒视频提示词必须明确 0-5、5-10、10-15 秒动作推进、景别、运镜、光影、音效和首尾帧连续。",
    "7. 参考小说原文时，只提取动作、情绪、台词意图、因果关系和镜头可视化信息，不要把大段原文复制进输出。",
    "8. 不要添加原提示词没有的剧情反转、角色、可读文字、水印、logo 或血腥细节。",
    visualStylePrompt ? `\n所选画风细则：\n${visualStylePrompt}` : "",
    storyContext ? `\n项目上下文：\n${storyContext}` : "",
    sourceReferenceText ? `\n小说原文参考：\n${sourceReferenceText}` : "",
    `\n待优化提示词：\n${input.prompt.trim()}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSeedanceScriptOptimizationPrompt(input: SeedanceScriptOptimizationInput): string {
  const story = input.story;
  const visualStyleLabel = input.visualStyleLabel?.trim() || "项目所选";
  const visualStylePrompt = input.visualStylePrompt?.trim();
  const sourceReferenceText = input.sourceReferenceText?.trim();
  const characterNames = story.characters.map((character) => character.name).filter(Boolean);
  const sceneNames = story.script.map((scene) => scene.title || scene.location).filter(Boolean);
  const dialogueLines = story.script
    .flatMap((scene) => scene.dialogues || [])
    .map((dialogue) => `${dialogue.character}：“${dialogue.line}”`)
    .slice(0, 80);

  return [
    `核心要求：我将严格遵循${visualStyleLabel}画风、15 秒分段要求，拆解原文动作、明确分镜细节，并参考小说原文，优化表述让大模型精准捕捉镜头逻辑，贴合即梦 / Seedance 2.0 生成需求。`,
    "",
    "输出目标：把下面粗分镜重写成更像专业导演分镜稿的 Seedance 2.0 优化分镜脚本，质量参考用户手动用 Kimi K2.6 得到的版本：动作按秒拆开，镜头语言具体，光影和声音可执行，首尾帧连续清楚。",
    "重要判断：当前粗分镜只是草稿，不是必须保留的结构。如果当前粗分镜段数不足、剧情压缩、台词遗漏或动作过粗，必须根据小说原文重新拆分或增加 15 秒段落，直到覆盖当前原文主线动作、台词、转折和情绪收束。",
    "",
    "硬性规则：",
    "1. 每段仍然是独立 15 秒视频；每段至少 3 个分镜，必须使用分镜 1（0-5 秒）、分镜 2（5-10 秒）、分镜 3（10-15 秒）。",
    "2. 每个分镜必须包含：景别、运镜、主角、动作、台词、音效、光影、场景或场景关键词。",
    "3. 动作字段要继续细化为 0.0-2.0秒、2.0-4.0秒、4.0-5.0秒 这类可执行镜头动作，避免“围绕某段原文延展”这种空话。",
    "4. 台词说话人只能从已有人物中选择；禁止出现“翻飞间已”“沈砚浑身”这类原文片段当说话人。",
    "5. 可以参考小说原文提炼动作、情绪、台词意图和因果，但不要把整段原文直接复制进动作或场景字段。",
    "6. 保留所有关键台词和剧情转折，不要漏掉开头对白、冲突升级、关键道具、发现和情绪收束。",
    "7. 每段最后必须写“尾帧要求”和“本段尾帧描述”；除最后一段外，每段还必须写“下一段首帧描述”，用于生成下一段视频开头。",
    "8. 第 2 段及之后必须写“首帧承接上一段”，并逐项引用上一段尾帧中的位置、光影、人物姿态、视线方向、道具位置和镜头运动。",
    "9. 画风必须锁定，不要切换成其他风格，不要可读水印或 logo，不要血腥化。",
    "10. 末尾可以追加【人物一致性提示词】【场景一致性提示词】【关键道具提示词】【氛围关键词】等附录，但不要新增剧情。",
    "11. 禁止继续使用“原文推进 1”“当前动作推进”“围绕……延展”“推进原文中的关键事件”等粗稿占位表达；必须改写为可拍摄的镜头动作。",
    "",
    "必须遵循的输出模板：",
    `《${story.world.title || "项目标题"}》E01《异常开启》Seedance 2.0 优化分镜脚本`,
    "用途：适配即梦 / Seedance 2.0 视频模型，直接用于分段生成视频。",
    "格式：每段 15 秒，每段至少 3 个分镜，统一标注起止秒数。",
    `成片类型：${visualStyleLabel} AI 漫剧短剧。`,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "【整体统一设定】",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `画风选择：${visualStyleLabel}。`,
    "画风：写出所选画风的电影构图、布光、材质、色彩和短剧镜头语言。",
    "画风一致性：人物模型、场景模型、Image Prompt 和所有 15 秒视频提示词都必须沿用该画风。",
    "运镜：短剧感，平稳流畅，多用推镜、跟拍、特写切换、灯光闪烁。",
    "首尾帧连续：第 2 段及之后的开头承接上一段末帧；每段结尾必须提供“本段尾帧描述”，并为下一段提供“下一段首帧描述”。",
    "人物：列出核心人物，并用括号写清服装、道具、姿态或气质。",
    "禁忌：不要偏离所选画风，不要频繁换脸，不要血腥，不要低质量畸变，不要可读水印或 logo。",
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "【第 1 段 15 秒：段落标题】",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "对应原文段落：用一句话说明本段覆盖的原文范围。",
    "首帧承接上一段：第 1 段写“无，本段为开篇”；第 2 段及之后必须逐项引用上一段“本段尾帧描述”的画面位置、光影、人物姿态、视线方向、道具位置和镜头运动。",
    "",
    "分镜 1（0-5 秒）：景别变化 / 镜头目的",
    "景别：明确起止景别。",
    "运镜：明确镜头移动方式、方向和速度。",
    "主角：角色名（画面位置、状态）。",
    "动作：",
    "  0.0-2.0秒：可拍摄动作。",
    "  2.0-4.0秒：可拍摄动作。",
    "  4.0-5.0秒：可拍摄动作或台词触发。",
    "台词：角色（语气）：“台词”；无台词时写无。",
    "音效：按秒标注主要环境声、动作声或情绪声。",
    "光影：明确主光源、明暗对比、材质反光或氛围变化。",
    "场景关键词：具体空间、道具、天气、材质、可见细节。",
    "",
    "分镜 2（5-10 秒）：景别变化 / 镜头目的",
    "按同样字段和秒点展开。",
    "",
    "分镜 3（10-15 秒）：景别变化 / 段落收束",
    "按同样字段和秒点展开。",
    "尾帧要求：明确停在哪个画面、人物姿态、视线、光影和下一段衔接点。",
    "本段尾帧描述：明确最后 1 秒停在哪个画面，写清人物姿态、视线方向、道具位置、主光源、环境状态和镜头运动状态。",
    "下一段首帧描述：除最后一段可写“无，当前为最后一段”外，必须明确下一段 0 秒如何承接本段尾帧，包含位置、光影、人物姿态、视线方向、道具连续性和镜头运动延续。",
    "",
    "后续段落继续使用同一模板：【第 2 段 15 秒：段落标题】、【第 3 段 15 秒：段落标题】……",
    "末尾附录必须包含：【人物一致性提示词】【场景一致性提示词】【关键道具提示词】【氛围关键词】。",
    "",
    `项目标题：${story.world.title}`,
    `人物白名单：${characterNames.join("、") || "未提供"}`,
    sceneNames.length ? `场景参考：${sceneNames.join("、")}` : "",
    dialogueLines.length ? `关键台词参考：\n${dialogueLines.join("\n")}` : "",
    visualStylePrompt ? `\n所选画风细则：\n${visualStylePrompt}` : "",
    sourceReferenceText ? `\n小说原文参考：\n${trimPromptText(sourceReferenceText, 12000)}` : "",
    `\n当前粗分镜脚本：\n${input.currentScript.trim()}`
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSeedanceScriptQualityRepairPrompt(
  input: SeedanceScriptOptimizationInput,
  previousOutput: string
): string {
  return [
    "上一版输出没有达到导演级模板质量，请完全重写，不要只做局部润色。",
    "必须严格输出用户示例那种 Kimi K2.6 导演分镜稿结构：",
    "1. 必须有【整体统一设定】和【第 1 段 15 秒：段落标题】这类中文方括号标题。",
    "2. 每段必须写“对应原文段落”。",
    "3. 每段必须至少包含分镜 1（0-5 秒）、分镜 2（5-10 秒）、分镜 3（10-15 秒）。",
    "4. 每个分镜的动作必须拆成 0.0-2.0秒、2.0-4.0秒、4.0-5.0秒，或对应 5-10 / 10-15 秒内的子秒点。",
    "5. 必须写景别、运镜、主角、动作、台词、音效、光影、场景关键词、尾帧要求。",
    "6. 每段必须写“本段尾帧描述”；除最后一段外必须写“下一段首帧描述”；第 2 段及之后必须写“首帧承接上一段”。",
    "7. 末尾必须有【人物一致性提示词】【场景一致性提示词】【关键道具提示词】【氛围关键词】。",
    "8. 禁止出现“原文推进 1”“当前动作推进”“围绕……延展”“推进原文中的关键事件”等粗稿占位表达。",
    "",
    "不合格上一版输出：",
    trimPromptText(previousOutput, 8000),
    "",
    buildSeedanceScriptOptimizationPrompt(input)
  ].join("\n");
}

function isDirectorGradeSeedanceScript(script: string): boolean {
  const text = script.trim();
  if (!text) return false;
  if (!/Seedance\s*2\.0\s*优化分镜脚本/i.test(text)) return false;
  if (!/【\s*整体统一设定\s*】/.test(text)) return false;
  if (!/【\s*第\s*1\s*段\s*15\s*秒[：:]/.test(text)) return false;
  if (!/对应原文段落[：:]/.test(text)) return false;
  if (!/分镜\s*1\s*（\s*0-5\s*秒\s*）/.test(text)) return false;
  if (!/分镜\s*2\s*（\s*5-10\s*秒\s*）/.test(text)) return false;
  if (!/分镜\s*3\s*（\s*10-15\s*秒\s*）/.test(text)) return false;
  if (!/动作[：:]\s*\n\s*0\.0-2\.0秒/.test(text)) return false;
  if (!/尾帧要求[：:]/.test(text)) return false;
  if (!/本段尾帧描述[：:]/.test(text)) return false;
  if (!/下一段首帧描述[：:]/.test(text)) return false;
  if (/【\s*第\s*2\s*段\s*15\s*秒[：:]/.test(text) && !/首帧承接上一段[：:]/.test(text)) return false;
  if (!/【\s*人物一致性提示词\s*】/.test(text)) return false;
  if (!/【\s*场景一致性提示词\s*】/.test(text)) return false;
  if (!/【\s*关键道具提示词\s*】/.test(text)) return false;
  if (!/【\s*氛围关键词\s*】/.test(text)) return false;
  if (/(原文推进\s*\d|当前动作推进|围绕[“"「]?[^。\n]{0,80}延展|推进原文中的关键事件)/.test(text)) {
    return false;
  }
  return true;
}

function buildSeedanceScriptQualityError(script: string): string {
  const hasRoughPlaceholder = /(原文推进\s*\d|当前动作推进|围绕[“"「]?[^。\n]{0,80}延展|推进原文中的关键事件)/.test(script);
  const reason = hasRoughPlaceholder
    ? "仍包含粗稿占位表达"
    : "缺少导演级模板结构、子秒点动作拆解、尾帧/下一段首帧衔接描述或附录";
  return `Seedance script optimization did not meet director-grade template quality: ${reason}`;
}

function mediaPromptOptimizationTaskLabel(kind: MediaPromptOptimizationKind): string {
  if (kind === "characterImage") return "人物模型图提示词优化";
  if (kind === "sceneImage") return "场景模型图提示词优化";
  if (kind === "imagePromptImage") return "15 秒片段 Image Prompt 风格参考图提示词优化";
  return "15 秒视频提示词优化";
}

function sanitizeOptimizedMediaPrompt(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const fenced = trimmed.match(/^```(?:[a-z0-9_-]+)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1]?.trim() || trimmed)
    .replace(/^\s*(优化后的提示词|优化提示词|提示词)\s*[：:]\s*/i, "")
    .trim() || fallback;
}

function sanitizeOptimizedSeedanceScript(value: string, fallback: string): string {
  const trimmed = stripJsonFence(value.trim())
    .replace(/^\s*(优化后的分镜脚本|优化分镜脚本|分镜脚本)\s*[：:]\s*/i, "")
    .trim();
  if (!trimmed) return fallback;
  if (!/第\s*1\s*段\s*15\s*秒/.test(trimmed) || !/分镜\s*1\s*（?0-5\s*秒/.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function trimPromptText(value: string, maxLength: number): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 20)).trim()}\n...[已截断]`;
}

function resolveOpenAIMockMode(): boolean {
  return process.env.MOCK_PROVIDERS === "true" || process.env.OPENAI_MOCK === "true";
}

function resolveTextApiKey(model?: string): string | undefined {
  if (model && isKimiModel(model)) return process.env.MOONSHOT_API_KEY;
  if (model) return process.env.OPENAI_API_KEY;
  return process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY;
}

function resolveTextApiMode(modelOverride?: string): TextApiMode {
  const selectedModel = modelOverride ? normalizeTextModel(modelOverride) : "";
  if (isKimiModel(selectedModel)) return "chat";
  if (/^gpt-/i.test(selectedModel)) return "responses";
  if (process.env.OPENAI_API_MODE === "chat" || process.env.OPENAI_API_MODE === "responses") {
    return process.env.OPENAI_API_MODE;
  }
  const model = process.env.OPENAI_MODEL || "";
  const baseURL = process.env.OPENAI_BASE_URL || "";
  if (/kimi|moonshot/i.test(model) || /moonshot/i.test(baseURL)) return "chat";
  return "responses";
}

function resolveDefaultTextModel(_configuredApiMode?: TextApiMode): string {
  return MOONSHOT_MODEL;
}

function normalizeTextModel(model: string): string {
  const value = model.trim();
  if (/^kimi[\s_-]*k2[.,-]?6$/i.test(value)) return MOONSHOT_MODEL;
  if (/^gpt[\s_-]*5[.,-]?5$/i.test(value)) return OPENAI_MODEL;
  return value;
}

function resolveProviderModel(model: string): string {
  const selectedModel = normalizeTextModel(model);
  if (isKimiModel(selectedModel)) return process.env.MOONSHOT_MODEL || selectedModel;
  if (/^gpt-/i.test(selectedModel)) {
    const configuredModel = process.env.OPENAI_MODEL ? normalizeTextModel(process.env.OPENAI_MODEL) : "";
    return configuredModel && !isKimiModel(configuredModel) ? configuredModel : selectedModel;
  }
  return selectedModel;
}

function resolveTextBaseURL(model: string, configuredBaseURL?: string): string | undefined {
  if (isKimiModel(model)) {
    return process.env.MOONSHOT_BASE_URL || MOONSHOT_BASE_URL;
  }

  const baseURL = configuredBaseURL || process.env.OPENAI_BASE_URL || "";
  if (!baseURL || /moonshot/i.test(baseURL)) return undefined;
  return baseURL;
}

function buildMissingApiKeyMessage(model: string): string {
  if (isKimiModel(model)) {
    return "Missing MOONSHOT_API_KEY for Kimi text generation";
  }
  return `Missing OPENAI_API_KEY for ${model} text generation`;
}

function resolveMaxCompletionTokens(): number {
  const value = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 32000);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 32000;
}

function buildKimiChatOptions(model: string): Record<string, unknown> {
  if (!isKimiModel(model)) return {};
  return {
    thinking: { type: "disabled" }
  };
}

function buildChatResponseFormat(model: string): Record<string, unknown> {
  if (isKimiModel(model)) return { type: "json_object" };
  return {
    type: "json_schema",
    json_schema: {
      name: "story_state",
      strict: true,
      schema: STORY_STATE_JSON_SCHEMA
    }
  };
}

function buildChatTokenOptions(model: string, maxTokens: number): Record<string, unknown> {
  if (isKimiModel(model)) return { max_tokens: maxTokens };
  return { max_completion_tokens: maxTokens };
}

function isKimiModel(model: string): boolean {
  return /^kimi-/i.test(model);
}

function extractTextContent(content: unknown, operation: string): string {
  if (typeof content === "string" && content.trim()) return stripJsonFence(content.trim());
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
    if (text) return stripJsonFence(text);
  }
  throw new Error(`Text model returned empty content for ${operation}`);
}

function stripJsonFence(value: string): string {
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() || value;
}

function parseStoryStateJson(value: string, operation: string): StoryState {
  const normalized = stripJsonFence(value.trim());
  try {
    return JSON.parse(normalized) as StoryState;
  } catch (firstError) {
    const repaired = repairCommonJsonModelOutput(normalized);
    if (repaired !== normalized) {
      try {
        return JSON.parse(repaired) as StoryState;
      } catch {
        // Fall through to the original parse error so the reported position matches provider output.
      }
    }

    const message = firstError instanceof Error ? firstError.message : "invalid JSON";
    throw new Error(`Text model returned invalid JSON for ${operation}: ${message}`);
  }
}

export function normalizeGeneratedStoryStateForInput(story: StoryState, storyInput: StoryGenerationInput): StoryState {
  const importedSourceText =
    storyInput.sourceType === "novel" && storyInput.sourceText ? sanitizeImportedSourceText(storyInput.sourceText) : "";
  const characterNormalizedStory = ensureImportedSourceCharacters(story, storyInput, importedSourceText);
  const sourceDrivenSegmentCount = estimateRequiredSegmentCount(importedSourceText, 1);
  const requiredSegmentCount = estimateRequiredSegmentCount(importedSourceText, characterNormalizedStory.storyboard.length);
  const sourceWasRelevant = isImportedSourceStoryRelevant(characterNormalizedStory, importedSourceText);
  const sourceAnchoredStory = ensureImportedSourceStoryboardCoverage(
    characterNormalizedStory,
    storyInput,
    importedSourceText,
    sourceDrivenSegmentCount
  );
  const normalizedTargetSegmentCount = sourceWasRelevant ? requiredSegmentCount : sourceDrivenSegmentCount;
  const countNormalizedStory = normalizeImportedSourceSegmentCount(
    sourceAnchoredStory,
    storyInput,
    importedSourceText,
    normalizedTargetSegmentCount
  );
  const normalizedStory = ensureMinimumStoryboardSegments(
    countNormalizedStory,
    storyInput,
    importedSourceText,
    requiredSegmentCount
  );
  const dialogueNormalizedStory = ensureImportedSourceDialoguePlacement(normalizedStory, importedSourceText);

  if (
    isSegmentedSeedanceScript(
      dialogueNormalizedStory.seedanceScript,
      dialogueNormalizedStory.storyboard.length,
      requiredSegmentCount
    ) &&
    isImportedSourceStoryRelevant(dialogueNormalizedStory, importedSourceText)
  ) {
    return applyGenerationSettingsToStoryState(
      applyVisualStyleToStoryState({
        ...dialogueNormalizedStory,
        seedanceScript:
          storyInput.sourceType === "novel"
            ? sanitizeImportedSourceSeedanceScript(dialogueNormalizedStory.seedanceScript)
            : dialogueNormalizedStory.seedanceScript
      }, storyInput),
      storyInput
    );
  }

  return applyGenerationSettingsToStoryState(
    applyVisualStyleToStoryState({
      ...dialogueNormalizedStory,
      seedanceScript:
        storyInput.sourceType === "novel"
          ? sanitizeImportedSourceSeedanceScript(buildSegmentedSeedanceScript(dialogueNormalizedStory, storyInput))
          : buildSegmentedSeedanceScript(dialogueNormalizedStory, storyInput)
    }, storyInput),
    storyInput
  );
}

function applyVisualStyleToStoryState(story: StoryState, storyInput: StoryGenerationInput): StoryState {
  if (!storyInput.visualStyleId) return story;

  const visualStyleKeywords = getVisualStyleKeywords(storyInput.visualStyleId);
  const existingStyleKeywords = sanitizeExistingStyleKeywordsForSelection(story.world.styleKeywords || [], storyInput.visualStyleId);
  const appendStyle = (value: string | undefined, fallback: string) =>
    appendVisualStyleInstruction(value || fallback, storyInput.visualStyleId);
  const storyboard = story.storyboard.map((shot) => ({
    ...shot,
    imagePrompt: appendStyle(shot.imagePrompt, [story.world.title, shot.composition, shot.background].filter(Boolean).join("，")),
    videoPrompt: appendStyle(shot.videoPrompt, [shot.composition, shot.characterActions].filter(Boolean).join("，"))
  }));
  const shotPromptById = new Map(storyboard.map((shot) => [shot.id, shot]));
  const visualPrompts = alignVisualPrompts(storyboard, story.visualPrompts).map((prompt) => {
    const shot = shotPromptById.get(prompt.shotId);
    return {
      ...prompt,
      imagePrompt: appendStyle(prompt.imagePrompt, shot?.imagePrompt || story.world.title),
      videoPrompt: appendStyle(prompt.videoPrompt, shot?.videoPrompt || story.world.title)
    };
  });

  return {
    ...story,
    world: {
      ...story.world,
      styleKeywords: Array.from(new Set([...existingStyleKeywords, ...visualStyleKeywords])).filter(Boolean)
    },
    characters: story.characters.map((character) => ({
      ...character,
      consistencyPrompt: appendStyle(
        character.consistencyPrompt,
        [character.name, character.role, character.appearance, character.personality.join("，")].filter(Boolean).join("，")
      )
    })),
    storyboard,
    visualPrompts,
    seedanceScript: applyVisualStyleToSeedanceScript(story.seedanceScript, storyInput.visualStyleId)
  };
}

function applyGenerationSettingsToStoryState(story: StoryState, storyInput: StoryGenerationInput): StoryState {
  const next: StoryState = { ...story };
  const visualStyleId = storyInput.visualStyleId || story.visualStyleId;
  const promptOptimizerModel = storyInput.textModel || story.promptOptimizerModel || "kimi-k2.6";
  const sourceReferenceText =
    storyInput.sourceType === "novel" && storyInput.sourceText
      ? buildSourceReferenceText(storyInput.sourceText)
      : story.sourceReferenceText;
  if (visualStyleId) next.visualStyleId = visualStyleId;
  next.promptOptimizerModel = promptOptimizerModel;
  next.promptOptimizationEnabled = true;
  if (sourceReferenceText) {
    next.sourceReferenceText = sourceReferenceText;
    next.sourceReferenceLabel = storyInput.sourceFileName || story.sourceReferenceLabel || getImportedSourceLabel(sourceReferenceText);
  }
  return next;
}

function buildSourceReferenceText(sourceText: string): string {
  const cleaned = sanitizeImportedSourceText(sourceText).replace(/\n{3,}/g, "\n\n").trim();
  const maxChars = 12000;
  if (cleaned.length <= maxChars) return cleaned;
  const headChars = 8000;
  const tailChars = 3500;
  return [
    cleaned.slice(0, headChars).trim(),
    "\n\n[中间原文已压缩省略，优化提示词时仍以已生成分镜的当前片段为准]\n\n",
    cleaned.slice(-tailChars).trim()
  ].join("");
}

function sanitizeExistingStyleKeywordsForSelection(keywords: string[], visualStyleId?: string): string[] {
  const preset = getVisualStylePreset(visualStyleId) || getDefaultVisualStylePreset();
  if (preset.id === getDefaultVisualStylePreset().id) return keywords.filter(Boolean);
  const defaultStylePattern = /半写实国漫|冷蓝灰|强黑色线稿|纸张颗粒质感|漫画分层阴影|2D\s*漫画|二维插画/;
  return keywords.filter((keyword) => keyword && !defaultStylePattern.test(keyword));
}

function appendVisualStyleInstruction(value: string, visualStyleId?: string): string {
  const preset = getVisualStylePreset(visualStyleId) || getDefaultVisualStylePreset();
  const cleaned = removeConflictingDefaultStylePhrases(cleanText(value, ""));
  const suffix = buildVisualStylePromptSuffix(visualStyleId);
  const guardrail = buildVisualStyleGuardrail(visualStyleId);
  const hasSelectedStyle =
    cleaned.includes(`所选画风：${preset.label}`) || cleaned.includes(preset.label) || cleaned.includes(preset.prompt);
  const withStyle = hasSelectedStyle ? cleaned : [cleaned, suffix].filter(Boolean).join("，");
  if (withStyle.includes(`不要偏离“${preset.label}”`) || withStyle.includes(guardrail)) return withStyle;
  return [withStyle, guardrail].filter(Boolean).join("，");
}

function removeConflictingDefaultStylePhrases(value: string): string {
  return value
    .replace(/(?:，|,)?\s*2D\s*半写实国漫悬疑风/g, "")
    .replace(/(?:，|,)?\s*半写实国漫(?:角色|背景)?设定图/g, "")
    .replace(/(?:，|,)?\s*半写实国漫悬疑风/g, "")
    .replace(/(?:，|,)?\s*现代都市悬疑漫画风/g, "")
    .replace(/(?:，|,)?\s*强黑色线稿/g, "")
    .replace(/(?:，|,)?\s*清晰漫画轮廓线/g, "")
    .replace(/(?:，|,)?\s*赛璐璐分层阴影/g, "")
    .replace(/(?:，|,)?\s*漫画分层阴影/g, "")
    .replace(/(?:，|,)?\s*冷蓝灰(?:低饱和)?色调/g, "")
    .replace(/(?:，|,)?\s*纸张颗粒质感/g, "")
    .replace(/(?:，|,)?\s*不是真人照片/g, "")
    .replace(/(?:，|,)?\s*不是电影剧照/g, "")
    .replace(/(?:，|,)?\s*不是\s*3D(?:\s*CG|渲染)?/gi, "")
    .replace(/(?:，|,)?\s*不要真人照片风/g, "")
    .replace(/(?:，|,)?\s*不要\s*3D(?:\s*CG|渲染)?/gi, "")
    .replace(/[，,]{2,}/g, "，")
    .replace(/^，|，$/g, "")
    .trim();
}

function applyVisualStyleToSeedanceScript(script: string, visualStyleId?: string): string {
  const text = script.trim();
  if (!text) return text;

  const [selectionLine, styleLine, consistencyLine] = buildVisualStyleSeedanceLines(visualStyleId);
  const guardrailLine = `禁忌：${buildVisualStyleGuardrail(visualStyleId)}`;
  let next = text
    .replace(/^\s*画风选择[：:].*$/m, selectionLine)
    .replace(/^\s*画风[：:].*$/m, styleLine)
    .replace(/^\s*画风一致性[：:].*$/m, consistencyLine)
    .replace(/^\s*色调[：:].*$/m, "")
    .replace(/^\s*禁忌[：:].*$/m, guardrailLine)
    .replace(/\n{3,}/g, "\n\n");

  if (!/^\s*画风选择[：:]/m.test(next)) {
    next = insertAfterHeading(next, "整体统一设定", selectionLine);
  }
  if (!/^\s*画风[：:]/m.test(next)) {
    next = insertAfterLine(next, selectionLine, styleLine);
  }
  if (!/^\s*画风一致性[：:]/m.test(next)) {
    next = insertAfterLine(next, styleLine, consistencyLine);
  }
  if (!/^\s*禁忌[：:]/m.test(next)) {
    next = insertAfterLine(next, consistencyLine, guardrailLine);
  }

  return next.replace(/\n{3,}/g, "\n\n").trim();
}

function insertAfterHeading(text: string, heading: string, line: string): string {
  const pattern = new RegExp(`(^\\s*${heading}\\s*$)`, "m");
  if (pattern.test(text)) return text.replace(pattern, `$1\n${line}`);
  return `${line}\n${text}`;
}

function insertAfterLine(text: string, anchorLine: string, line: string): string {
  if (!text.includes(anchorLine)) return `${line}\n${text}`;
  return text.replace(anchorLine, `${anchorLine}\n${line}`);
}

function sanitizeImportedSourceSeedanceScript(script: string): string {
  return script
    .replace(/^\s*(故事灵感|世界观|剧情大纲)\s*[：:].*(?:\r?\n)?/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureImportedSourceStoryboardCoverage(
  story: StoryState,
  storyInput: StoryGenerationInput,
  sourceText: string,
  requiredSegmentCount: number
): StoryState {
  if (!sourceText.trim()) return story;
  if (isImportedSourceStoryRelevant(story, sourceText)) return story;

  return rebuildImportedSourceStoryboard(story, storyInput, sourceText, requiredSegmentCount);
}

function normalizeImportedSourceSegmentCount(
  story: StoryState,
  storyInput: StoryGenerationInput,
  sourceText: string,
  targetSegmentCount: number
): StoryState {
  if (!sourceText.trim() || story.storyboard.length === 0) return story;

  const currentCount = story.storyboard.length;
  const upperBound = Math.max(targetSegmentCount + 3, Math.ceil(targetSegmentCount * 1.35));
  const lowerBound = Math.max(1, Math.ceil(targetSegmentCount * 0.65));
  const looksLikeOldFixedCap = currentCount === 40 && targetSegmentCount !== 40;

  if (!looksLikeOldFixedCap && currentCount >= lowerBound && currentCount <= upperBound) return story;

  return rebuildImportedSourceStoryboard(story, storyInput, sourceText, targetSegmentCount);
}

function rebuildImportedSourceStoryboard(
  story: StoryState,
  storyInput: StoryGenerationInput,
  sourceText: string,
  segmentCount: number
): StoryState {
  const sourceSegments = getSourceSegmentBeatsForCount(sourceText, segmentCount);
  const mainCharacter = cleanText(story.characters[0]?.name, "主角");
  const title = deriveImportedSourceTitle(story.world.title, storyInput.inspiration, sourceText);
  const background = buildImportedSourceCoverageBackground(sourceSegments, story.world.background);
  const outline = buildImportedSourceCoverageOutline(sourceSegments, story.outline);
  const storyboard = sourceSegments.map((sourceBeat, index) => {
    const dialogues = extractImportedSourceDialogues(sourceBeat, mainCharacter);
    const narration = dialogues[0]?.narration || sourceBeat;
    const actors = inferSegmentCharacters(sourceBeat, story.characters.map((character) => character.name), mainCharacter, dialogues);
    const description = shortText(sourceBeat, `${title} 第 ${index + 1} 个关键剧情段`, 180);
    return {
      id: `shot-source-${index + 1}`,
      sceneId: `scene-source-${index + 1}`,
      order: index + 1,
      shotType: index % 3 === 0 ? "中景到近景" : index % 3 === 1 ? "近景" : "特写",
      cameraMovement: index % 3 === 0 ? "跟拍推进" : "缓慢推近",
      composition: shortText(narration, description, 180),
      characterActions: `${actors.join("、")}推进原文中的关键事件：${shortText(narration, description, 150)}`,
      expression: "警觉、压抑、克制",
      background: shortText(narration, description, 180),
      dialogue: dialogues.map((dialogue) => dialogue.formatted).join("\n"),
      imagePrompt: buildImagePrompt(title, description, actors.join("、"), storyInput.visualStyleId),
      videoPrompt: buildVideoPrompt(description, actors.join("、"), storyInput.visualStyleId)
    };
  });

  return {
    ...story,
    world: {
      ...story.world,
      title,
      background,
      timeline:
        sourceSegments.length > 0
          ? sourceSegments.slice(0, 8).map((beat, index) => `原文推进 ${index + 1}：${shortText(beat, "关键剧情", 36)}`)
          : story.world.timeline,
      rules: ["严格按导入原文推进剧情", "保留原文人物关系、场景和关键转折", "每个 15 秒段落只改编对应原文内容"]
    },
    outline,
    script: storyboard.map((shot, index) => ({
      id: `scene-source-${index + 1}`,
      title: `原文推进 ${index + 1}`,
      location: title,
      description: shot.composition,
      dialogues: extractImportedSourceDialogues(sourceSegments[index] || "", mainCharacter).map((dialogue) => ({
        character: dialogue.character,
        line: dialogue.line,
        emotion: inferDialogueEmotion(sourceSegments[index] || "")
      }))
    })),
    storyboard,
    visualPrompts: alignVisualPrompts(storyboard, []),
    seedanceScript: ""
  };
}

function ensureImportedSourceDialoguePlacement(story: StoryState, sourceText: string): StoryState {
  if (!sourceText.trim() || story.storyboard.length === 0) return story;

  const sourceSegments = getSourceSegmentBeatsForCount(sourceText, story.storyboard.length);
  const mainCharacter = cleanText(story.characters[0]?.name, "主角");
  const characterNames = story.characters.map((character) => character.name);
  let changed = false;

  const storyboard = story.storyboard.map((shot, index) => {
    const sourceBeat = sourceSegments[index] || "";
    const extractions = extractImportedSourceDialogues(sourceBeat, mainCharacter);
    if (extractions.length === 0) return shot;

    changed = true;
    const narration = shortText(extractions[0]?.narration || "", cleanText(shot.composition || shot.background, "当前段落"), 180);
    const actors = inferSegmentCharacters(sourceBeat, characterNames, mainCharacter, extractions);
    return {
      ...shot,
      composition: narration,
      characterActions: `${actors.join("、")}推进原文中的关键事件：${narration}`,
      background: narration,
      dialogue: extractions.map((extraction) => extraction.formatted).join("\n")
    };
  });

  if (!changed) return story;

  const script = story.script.map((scene, index) => {
    const sourceBeat = sourceSegments[index] || "";
    const extractions = extractImportedSourceDialogues(sourceBeat, mainCharacter);
    if (extractions.length === 0) return scene;
    return {
      ...scene,
      description: shortText(extractions[0]?.narration || "", scene.description, 180),
      dialogues: extractions.map((extraction) => ({
        character: extraction.character,
        line: extraction.line,
        emotion: inferDialogueEmotion(sourceBeat)
      }))
    };
  });

  return {
    ...story,
    script,
    storyboard,
    visualPrompts: alignVisualPrompts(storyboard, story.visualPrompts),
    seedanceScript: ""
  };
}

type ImportedSourceDialogueExtraction = {
  character: string;
  line: string;
  formatted: string;
  narration: string;
};

type TextSpan = {
  start: number;
  end: number;
};

type ImportedSourceDialogueCandidate = TextSpan & {
  character: string;
  line: string;
};

export function extractImportedSourceDialogue(
  sourceBeat: string,
  fallbackCharacter = "主角"
): ImportedSourceDialogueExtraction | undefined {
  return extractImportedSourceDialogues(sourceBeat, fallbackCharacter)[0];
}

export function extractImportedSourceDialogues(
  sourceBeat: string,
  fallbackCharacter = "主角"
): ImportedSourceDialogueExtraction[] {
  const candidates: ImportedSourceDialogueCandidate[] = [];
  const occupiedSpans: TextSpan[] = [];

  const labeledMatches = Array.from(
    sourceBeat.matchAll(/(?:台词|对白)[：:]\s*([^。\n]{1,180}(?:[。！？!?])?)/g)
  );
  for (const match of labeledMatches) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    occupiedSpans.push({ start, end });

    const rawLine = match[1]?.trim();
    if (!rawLine || /^无(?:台词)?[。.]?$/.test(rawLine)) continue;
    const line = stripDialogueQuotes(rawLine);
    const existingSpeaker = line.match(/^([\u4e00-\u9fa5]{2,8})[：:]\s*[“"‘']?(.+?)[”"’']?$/);
    const spokenLine = stripDialogueQuotes(existingSpeaker?.[2] || line);
    const character =
      normalizeDialogueSpeaker(existingSpeaker?.[1]) ||
      inferSelfIdentifiedDialogueSpeaker(spokenLine) ||
      fallbackCharacter;
    candidates.push({
      character,
      line: spokenLine,
      start,
      end
    });
  }

  const quoteMatches = Array.from(sourceBeat.matchAll(/[“"‘']([^”"’']{1,180})[”"’']/g));
  for (const match of quoteMatches) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (hasSpanOverlap({ start, end }, occupiedSpans)) continue;
    occupiedSpans.push({ start, end });

    const line = stripDialogueQuotes(match[1]?.trim() || "");
    if (!line) continue;
    const beforeQuote = sourceBeat.slice(0, start);
    const afterQuote = sourceBeat.slice(end);
    const character =
      inferSelfIdentifiedDialogueSpeaker(line) ||
      inferSourceDialogueSpeaker(beforeQuote, afterQuote, fallbackCharacter);
    candidates.push({
      character,
      line,
      start,
      end
    });
  }

  for (const monologue of extractStandaloneInnerMonologueCandidates(sourceBeat, occupiedSpans, fallbackCharacter)) {
    occupiedSpans.push({ start: monologue.start, end: monologue.end });
    candidates.push(monologue);
  }

  if (candidates.length === 0) return [];

  const narration = cleanDialogueNarration(
    removeTextSpans(sourceBeat, candidates),
    "角色短暂自语，镜头停留在反应与环境变化。"
  );

  return candidates
    .sort((left, right) => left.start - right.start)
    .filter((candidate) => candidate.line)
    .map((candidate) => ({
      character: candidate.character,
      line: candidate.line,
      formatted: `${candidate.character}：“${candidate.line}”`,
      narration
    }));
}

function extractStandaloneInnerMonologueCandidates(
  sourceBeat: string,
  occupiedSpans: TextSpan[],
  fallbackCharacter: string
): ImportedSourceDialogueCandidate[] {
  const candidates: ImportedSourceDialogueCandidate[] = [];
  const sentenceMatches = Array.from(sourceBeat.matchAll(/[^。！？!?]+[。！？!?]+/g));

  for (const match of sentenceMatches) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (hasSpanOverlap({ start, end }, occupiedSpans)) continue;

    const line = stripDialogueQuotes(match[0].trim());
    if (!isStandaloneInnerMonologueLine(line)) continue;

    candidates.push({
      character: inferStandaloneInnerMonologueSpeaker(sourceBeat, start, fallbackCharacter),
      line,
      start,
      end
    });
  }

  return candidates;
}

function isStandaloneInnerMonologueLine(value: string): boolean {
  const text = value.replace(/\s+/g, "");
  if (text.length < 2 || text.length > 36) return false;
  if (!/[？！?!]$/.test(text) && !/(?:…|……)$/.test(text)) return false;
  if (/[，,；;：:]/.test(text)) return false;
  if (/^(?:第|分镜|景别|运镜|动作|场景|光影|音效|台词)/.test(text)) return false;
  if (
    /(?:说道|问道|回答|喊道|开口|呻吟|震惊道|觉得|发觉|发现|怀疑|意识|开始|看去|望去|坐直|站起|走去|低头|抬头|回头|摸|抓|拍|皱)/.test(
      text
    )
  ) {
    return false;
  }

  if (
    /^(?:这是|那是|什么|怎么|为什么|哪里|哪儿|我|你|他|她|它|我们|你们|他们|不是|难道|好家伙|靠|嘶|嗯|喂|啊|哈|司机师傅|那个谁)/.test(
      text
    )
  ) {
    return true;
  }

  return /[？！?!]$/.test(text) && text.length <= 18;
}

function inferStandaloneInnerMonologueSpeaker(sourceBeat: string, sentenceStart: number, fallbackCharacter: string): string {
  const beforeText = sourceBeat.slice(Math.max(0, sentenceStart - 140), sentenceStart);
  const speakerMatches = Array.from(
    beforeText.matchAll(
      /([\u4e00-\u9fa5]{2,4})(?:[^。！？!?\n]{0,28})(?:缓缓睁开|迷茫|发觉|坐直|低头|抬头|想到|觉得|意识|心想|看|望|观察|打量|站起|走向|摸|抓|皱)/g
    )
  );
  for (const match of speakerMatches.reverse()) {
    const speaker = match[1]?.trim();
    if (speaker && isLikelyDialogueSpeaker(speaker)) return speaker;
  }
  return fallbackCharacter;
}

function removeTextSpans(value: string, spans: TextSpan[]): string {
  let next = value;
  for (const span of [...spans].sort((left, right) => right.start - left.start)) {
    next = `${next.slice(0, span.start)} ${next.slice(span.end)}`;
  }
  return next;
}

function hasSpanOverlap(span: TextSpan, spans: TextSpan[]): boolean {
  return spans.some((existing) => span.start < existing.end && existing.start < span.end);
}

function inferSourceDialogueSpeaker(beforeQuote: string, afterQuote: string, fallbackCharacter: string): string {
  const speechVerbs = "轻声道|轻声|低声|沉声|问道|说道|说|开口|喊道|回答|答道|打断|呻吟|震惊道|咧嘴|嘀咕|笑道|骂道|喃喃|画外音";
  const beforeColon = beforeQuote.match(/([\u4e00-\u9fa5]{2,8})[：:]\s*$/);
  const beforeColonSpeaker = normalizeDialogueSpeaker(beforeColon?.[1]);
  if (beforeColonSpeaker) return beforeColonSpeaker;

  const beforeClauseSpeaker = inferSpeakerFromPreviousClauses(beforeQuote, speechVerbs);
  if (beforeClauseSpeaker) return beforeClauseSpeaker;

  const afterSpeechSpeaker = inferSpeakerFromFollowingSpeechClause(afterQuote, speechVerbs);
  if (afterSpeechSpeaker) return afterSpeechSpeaker;

  const beforeActionSpeaker = inferSpeakerFromPrecedingActionClause(beforeQuote);
  if (beforeActionSpeaker) return beforeActionSpeaker;

  const afterActionSpeaker = inferSpeakerFromFollowingActionClause(afterQuote);
  if (afterActionSpeaker) return afterActionSpeaker;

  return fallbackCharacter;
}

function inferSelfIdentifiedDialogueSpeaker(line: string): string | undefined {
  const selfIntro = line.match(/^(?:我叫|我是)([\u4e00-\u9fa5]{2,4})(?=[，,。！？!?\s]|$)/);
  const selfIntroSpeaker = normalizeDialogueSpeaker(selfIntro?.[1]);
  if (selfIntroSpeaker) return selfIntroSpeaker;

  const nameIntro = line.match(/^([\u4e00-\u9fa5]{2,4})[，,][^。！？!?]{0,16}(?:人|岁)/);
  const nameIntroSpeaker = normalizeDialogueSpeaker(nameIntro?.[1]);
  if (nameIntroSpeaker) return nameIntroSpeaker;

  return undefined;
}

function inferSpeakerFromPreviousClauses(beforeQuote: string, speechVerbs: string): string | undefined {
  const clauses = beforeQuote
    .replace(/[，,\s]+$/, "")
    .split(/[。！？!?；;\n]/)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .slice(-3)
    .reverse();

  for (const clause of clauses) {
    const speaker = inferSpeakerFromSpeechClause(clause, speechVerbs);
    if (speaker) return speaker;
  }

  return undefined;
}

function inferSpeakerFromFollowingSpeechClause(afterQuote: string, speechVerbs: string): string | undefined {
  if (/^\s*\n/.test(afterQuote)) return undefined;
  const clause = afterQuote
    .replace(/^[，,。！？!?；;：:\s]+/, "")
    .split(/[。！？!?；;\n]/)[0]
    ?.trim();
  if (!clause) return undefined;
  if (!new RegExp(`(?:${speechVerbs})`).test(clause)) return undefined;

  const leading = extractLeadingSpeakerCandidate(clause);
  if (leading) return leading;

  const speakerWithVerb = clause.match(new RegExp(`^([\\u4e00-\\u9fa5]{2,4})(?:[^，。！？!?；;：:\\n]{0,14})?(?:${speechVerbs})`));
  const speaker = normalizeDialogueSpeaker(speakerWithVerb?.[1]);
  if (speaker) return speaker;

  return undefined;
}

function inferSpeakerFromFollowingActionClause(afterQuote: string): string | undefined {
  if (/^\s*\n/.test(afterQuote)) return undefined;
  const clause = afterQuote
    .replace(/^[，,。！？!?；;：:\s]+/, "")
    .split(/[。！？!?；;\n]/)[0]
    ?.trim();
  if (!clause) return undefined;

  return extractLeadingSpeakerCandidate(clause);
}

function inferSpeakerFromPrecedingActionClause(beforeQuote: string): string | undefined {
  const sameSentence = beforeQuote
    .split(/[。！？!?\n]/)
    .at(-1)
    ?.replace(/[，,：:\s]+$/, "")
    .trim();
  if (!sameSentence) return undefined;

  const clauses = sameSentence
    .split(/[，,]/)
    .map((clause) => clause.replace(/^[”"’'“‘]+/, "").trim())
    .filter(Boolean)
    .reverse();
  for (const clause of clauses) {
    const speaker = extractLeadingSpeakerCandidate(clause);
    if (speaker) return speaker;
  }

  const actionVerbs =
    "步步|紧逼|缓缓|猛然|忽然|突然|立刻|顿时|再次|抬头|低头|抬眼|回头|转身|站起|站了起来|坐直|看向|看着|看了看|问道|说道|开口|继续|皱眉|沉声|低声|大声|轻声|笑|侧身|避过|横削|直刺|欺身|抚过|缠绕|化解|旋身|劈向|躲闪|点头|摇头|抱头|走向|追问|回答|盯着|发现|发觉|意识到|伸手|抓住|离开|进入";
  const matches = Array.from(
    sameSentence.matchAll(new RegExp(`([\\u4e00-\\u9fa5]{2,4}?)(?:${actionVerbs})`, "g"))
  );

  for (const match of matches.reverse()) {
    const speaker = normalizeDialogueSpeaker(match[1]);
    if (speaker) return speaker;
  }

  return undefined;
}

function inferSpeakerFromSpeechClause(clause: string, speechVerbs: string): string | undefined {
  const normalized = clause.replace(/[，,：:\s]+$/, "");
  if (!new RegExp(`(?:${speechVerbs})$`).test(normalized)) return undefined;

  const leading = extractLeadingSpeakerCandidate(normalized);
  if (leading) return leading;

  const firstClause = normalized.split(/[，,]/)[0]?.trim() || normalized;
  return normalizeDialogueSpeaker(firstClause);
}

function extractLeadingSpeakerCandidate(clause: string): string | undefined {
  const text = clause.trim();
  const actionPrefix = /^(?:在|从|向|对|朝|把|将|轻声|低声|沉声|大声|回头|低头|抬头|开口|问道|说道|说|喊道|回答|答道|打断|呻吟|震惊道|震惊|咧嘴|笑道|骂道|喃喃|也|边|冲|突然|步步|紧逼|缓缓|浑身|左右|不确定|愣|点|摇|皱|看|摸|站|坐|勾头|察觉|发觉|觉得|发现|意识|一|，|,|。|！|？|!|\?|\s|$)/;
  for (const length of [2, 3, 4]) {
    const candidate = text.slice(0, length);
    const rest = text.slice(length);
    const speaker = normalizeDialogueSpeaker(candidate);
    if (speaker && actionPrefix.test(rest)) return speaker;
  }
  return undefined;
}

function isLikelyDialogueSpeaker(value: string): boolean {
  const text = normalizeImportedCharacterName(value);
  if (!/^[\u4e00-\u9fa5]{2,6}$/.test(text)) return false;
  if (IMPORTED_NAME_STOP_WORDS.has(text)) return false;
  if (/^(这是|什么|现在|后面|前方|二位|司机|师傅|小爷|那个|所以|看来|也是|这个|咱们|我们|你们|他们|明明|之前|怎么|不是|因为|这里|那里|确定)/.test(text)) {
    return false;
  }
  return true;
}

function normalizeDialogueSpeaker(value: string | undefined): string | undefined {
  const speaker = normalizeImportedCharacterName(value);
  return speaker && isLikelyDialogueSpeaker(speaker) ? speaker : undefined;
}

function inferSegmentCharacters(
  text: string,
  characterNames: string[],
  fallbackCharacter: string,
  dialogues: ImportedSourceDialogueExtraction[] = []
): string[] {
  const names = new Set<string>();
  for (const dialogue of dialogues) {
    if (dialogue.character && isLikelyDialogueSpeaker(dialogue.character)) names.add(dialogue.character);
  }
  for (const name of characterNames) {
    const cleaned = cleanText(name, "");
    if (cleaned && text.includes(cleaned)) names.add(cleaned);
  }

  if (names.size === 0 && fallbackCharacter) names.add(fallbackCharacter);
  return Array.from(names).slice(0, 4);
}

function cleanDialogueNarration(value: string, fallback: string): string {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/[：:]\s*$/, "")
    .replace(/^[，。！？!?、；;：:\s]+/, "")
    .replace(/[，、；;：:\s]+$/, "")
    .trim();
  if (cleaned) return ensurePeriod(cleaned);

  const withoutQuote = fallback.replace(/[“"‘'][^”"’']{1,140}[”"’']/g, "").trim();
  return ensurePeriod(withoutQuote || fallback);
}

function stripDialogueQuotes(value: string): string {
  return value
    .replace(/^[“"‘']+/, "")
    .replace(/[”"’']+$/, "")
    .trim();
}

function inferDialogueEmotion(sourceBeat: string): string {
  return /惊|恐|尖叫|痛|颤|急|怒|骂/.test(sourceBeat) ? "紧张" : "克制";
}

function deriveImportedSourceTitle(currentTitle: string | undefined, inspiration: string, sourceText: string): string {
  const current = cleanText(currentTitle, "");
  if (current && (sourceText.includes(current) || inspiration.includes(current))) return current;

  const importedLabel = inspiration
    .replace(/^(?:Imported source|文档\/小说导入|导入原文)[：:]\s*/i, "")
    .replace(/\.(?:txt|md|markdown|docx|json|csv|log)$/i, "")
    .replace(/\s+-\s+[^-]{1,20}$/, "")
    .trim();
  if (importedLabel) return shortText(importedLabel, "导入原文", 28);

  const firstLine = sourceText
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  return shortText(firstLine || "导入原文", "导入原文", 28);
}

function buildImportedSourceCoverageBackground(sourceSegments: string[], fallback: string): string {
  if (sourceSegments.length === 0) return cleanText(fallback, "根据导入原文改编。");
  return [
    "根据导入小说原文改编。",
    `开端：${shortText(sourceSegments[0], "原文开端", 180)}`,
    sourceSegments[1] ? `推进：${shortText(sourceSegments[1], "原文推进", 160)}` : "",
    sourceSegments[sourceSegments.length - 1] ? `阶段钩子：${shortText(sourceSegments[sourceSegments.length - 1], "原文后段", 160)}` : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function buildImportedSourceCoverageOutline(sourceSegments: string[], fallback: string): string {
  if (sourceSegments.length === 0) return cleanText(fallback, "按导入原文推进剧情。");
  const middleBeat = sourceSegments[Math.floor(sourceSegments.length / 2)];
  return [
    `起点：${shortText(sourceSegments[0], "原文开端", 170)}`,
    middleBeat ? `中段：${shortText(middleBeat, "原文中段", 170)}` : "",
    `收束：${shortText(sourceSegments[sourceSegments.length - 1], "原文结尾钩子", 170)}`
  ]
    .filter(Boolean)
    .join(" ");
}

function isImportedSourceStoryRelevant(story: StoryState, sourceText: string): boolean {
  if (!sourceText.trim()) return true;

  const anchors = extractImportedSourceRelevanceAnchors(sourceText, story.characters.map((character) => character.name));
  if (anchors.length === 0) return true;

  const generatedText = [
    story.world.title,
    story.world.background,
    story.outline,
    ...story.script.flatMap((scene) => [scene.title, scene.location, scene.description, ...scene.dialogues.map((dialogue) => dialogue.line)]),
    ...story.storyboard.flatMap((shot) => [
      shot.composition,
      shot.characterActions,
      shot.background,
      shot.dialogue,
      shot.imagePrompt,
      shot.videoPrompt
    ]),
    story.seedanceScript
  ].join("\n");

  const matched = anchors.filter((anchor) => generatedText.includes(anchor));
  return matched.length >= Math.min(3, anchors.length);
}

function extractImportedSourceRelevanceAnchors(sourceText: string, characterNames: string[]): string[] {
  const anchors = new Set<string>();
  for (const name of characterNames) {
    const cleaned = cleanText(name, "");
    if (cleaned.length >= 2 && !GENERIC_CHARACTER_NAMES.has(cleaned) && sourceText.includes(cleaned)) {
      anchors.add(cleaned);
    }
  }

  for (const match of sourceText.matchAll(/\d{1,2}:\d{2}|[\u4e00-\u9fa5]{2,8}(?:车|座|馆|楼|门|灯|钟|副本|系统|规则|观察者|驾驶座|大客车|档案馆|竞技场|仓库|小镇)/g)) {
    const token = match[0].trim();
    if (token.length >= 2 && !Array.from(IMPORTED_NAME_STOP_WORDS).some((word) => token.includes(word))) {
      anchors.add(token);
    }
    if (anchors.size >= 8) break;
  }

  return Array.from(anchors).slice(0, 8);
}

type ImportedSourceCharacterCandidate = {
  name: string;
  score: number;
  evidenceScore: number;
  firstIndex: number;
  contexts: string[];
};

function ensureImportedSourceCharacters(story: StoryState, storyInput: StoryGenerationInput, sourceText: string): StoryState {
  if (!sourceText.trim()) return story;

  const candidates = extractImportedSourceCharacterCandidates(sourceText);
  if (candidates.length === 0) return story;

  let changed = false;
  let normalizedStory = story;
  const aliasMap = inferImportedSourceCharacterAliasMap(sourceText);
  for (const [alias, canonicalName] of aliasMap) {
    if (sourceText.includes(alias) && sourceText.includes(canonicalName)) {
      normalizedStory = replaceCharacterNameReferences(normalizedStory, alias, canonicalName);
      changed = true;
    }
  }
  const candidateNames = new Set(candidates.map((candidate) => candidate.name));
  const candidateByName = new Map(candidates.map((candidate) => [candidate.name, candidate]));
  const sourceCharacters: StoryState["characters"] = [];
  const sourceCharacterNames = new Set<string>();
  for (const character of normalizedStory.characters) {
    const rawName = cleanText(character.name, "");
    const name = normalizeImportedCharacterName(aliasMap.get(rawName) || rawName);
    if (!name || isDiscardableImportedCharacterName(name)) {
      changed = true;
      continue;
    }
    if (!candidateNames.has(name) && !hasImportedCharacterEvidence(name, sourceText)) {
      changed = true;
      continue;
    }
    if (sourceCharacterNames.has(name)) {
      changed = true;
      continue;
    }
    const candidate = candidateByName.get(name);
    sourceCharacters.push(
      candidate
        ? buildImportedSourceCharacter(candidate, sourceCharacters.length, sourceText, candidates[0]?.name || name, character)
        : { ...character, name }
    );
    sourceCharacterNames.add(name);
    if (name !== rawName) {
      normalizedStory = replaceCharacterNameReferences(normalizedStory, rawName, name);
      changed = true;
    }
  }
  const characters = [...sourceCharacters];
  if (sourceCharacters.length !== story.characters.length) {
    normalizedStory = { ...normalizedStory, characters };
    changed = true;
  }
  const existingNames = new Set(characters.map((character) => cleanText(character.name, "")).filter(Boolean));
  const protagonistCandidate = candidates[0];

  if (characters.length === 0) {
    characters.push(buildImportedSourceCharacter(protagonistCandidate, 0, sourceText, protagonistCandidate.name));
    existingNames.add(protagonistCandidate.name);
    changed = true;
  } else if (isGenericCharacterName(characters[0].name) && protagonistCandidate && !existingNames.has(protagonistCandidate.name)) {
    const originalName = characters[0].name;
    characters[0] = buildImportedSourceCharacter(protagonistCandidate, 0, sourceText, protagonistCandidate.name, characters[0]);
    existingNames.delete(originalName);
    existingNames.add(protagonistCandidate.name);
    normalizedStory = replaceCharacterNameReferences(normalizedStory, originalName, protagonistCandidate.name);
    changed = true;
  }

  for (const candidate of candidates) {
    if (existingNames.has(candidate.name)) continue;
    if (characters.length >= MAX_IMPORTED_SOURCE_CHARACTERS) break;
    characters.push(buildImportedSourceCharacter(candidate, characters.length, sourceText, characters[0]?.name || protagonistCandidate.name));
    existingNames.add(candidate.name);
    changed = true;
  }

  if (!changed) return normalizedStory;

  return {
    ...normalizedStory,
    characters,
    seedanceScript: ""
  };
}

function extractImportedSourceCharacterCandidates(sourceText: string): ImportedSourceCharacterCandidate[] {
  const text = sourceText.replace(/\s+/g, " ");
  const byName = new Map<string, ImportedSourceCharacterCandidate>();
  const declaredSelfNamePattern = new RegExp(`\\u6211\\u53eb\\s*([${CJK_NAME_CHARS}]{2,3})${CHINESE_NAME_BOUNDARY}`);
  const declaredProtagonistPattern = new RegExp(
    `(?:\\u4e3b\\u89d2|\\u4e3b\\u4eba\\u516c|\\u6838\\u5fc3\\u4e3b\\u89d2)[\\uFF1A:\\s]*([${CJK_NAME_CHARS}]{2,3})${CHINESE_NAME_BOUNDARY}`
  );
  const declaredProtagonist = normalizeImportedCharacterName(
    text.match(declaredSelfNamePattern)?.[1] || text.match(declaredProtagonistPattern)?.[1]
  );

  const addCandidate = (
    rawName: string | undefined,
    score: number,
    index: number,
    options: { evidenceScore?: number; requireNameLike?: boolean } = {}
  ) => {
    const name = normalizeImportedCharacterName(rawName);
    if (!name) return;
    if (options.requireNameLike && !isLikelyChinesePersonName(name)) return;

    const context = collectContextAroundIndex(text, index, 56);
    const existing = byName.get(name);
    if (existing) {
      existing.score += score;
      existing.evidenceScore += options.evidenceScore || 0;
      existing.firstIndex = Math.min(existing.firstIndex, index);
      if (existing.contexts.length < 4) existing.contexts.push(context);
      return;
    }

    byName.set(name, {
      name,
      score,
      evidenceScore: options.evidenceScore || 0,
      firstIndex: index,
      contexts: [context]
    });
  };

  const patterns: Array<{ pattern: RegExp; score: number; evidenceScore: number; requireNameLike?: boolean }> = [
    { pattern: new RegExp(`\\u6211\\u53eb\\s*([${CJK_NAME_CHARS}]{2,4})${CHINESE_NAME_BOUNDARY}`, "g"), score: 140, evidenceScore: 5 },
    { pattern: new RegExp(`\\u6211\\u662f\\s*([${CJK_NAME_CHARS}]{2,4})${CHINESE_NAME_BOUNDARY}`, "g"), score: 120, evidenceScore: 5 },
    {
      pattern: new RegExp(
        `(?:\\u4e3b\\u89d2|\\u4e3b\\u4eba\\u516c|\\u6838\\u5fc3\\u4e3b\\u89d2)[\\uFF1A:\\s]*([${CJK_NAME_CHARS}]{2,4})${CHINESE_NAME_BOUNDARY}`,
        "g"
      ),
      score: 120,
      evidenceScore: 5
    },
    {
      pattern: new RegExp(
        `([${CJK_NAME_CHARS}]{2,4})[\\uFF0C,]\\s*(?:[${CJK_NAME_CHARS}]{1,8}\\u4eba)?[\\uFF0C,]?\\s*(?:\\u6211\\u4e5f\\u662f)?\\s*\\d{1,2}\\s*\\u5c81`,
        "g"
      ),
      score: 120,
      evidenceScore: 5
    },
    {
      pattern:
        /([\u4e00-\u9fa5]{2,3})(?:缓缓|猛然|忽然|立刻|顿时|再次|抬头|低头|抬眼|回头|转身|站起|站了起来|坐直|看向|看着|看了看|问道|说道|开口|继续|皱眉|沉声|笑|侧身|避过|横削|直刺|欺身|抚过|缠绕|化解|旋身|劈向|躲闪|步步|紧逼|点头|摇头|抱头|走向|追问|回答|盯着|发现|意识到|伸手|抓住|离开|进入)/g,
      score: 80,
      evidenceScore: 2,
      requireNameLike: true
    },
    {
      pattern: /([\u4e00-\u9fa5]{2,3})(?:在|进入|发现|看到|追查|逃出|醒来|打量|听见|注意到)/g,
      score: 50,
      evidenceScore: 1,
      requireNameLike: true
    }
  ];

  for (const { pattern, score, evidenceScore, requireNameLike } of patterns) {
    for (const match of text.matchAll(pattern)) {
      addCandidate(match[1], score, match.index || 0, { evidenceScore, requireNameLike });
    }
  }

  for (const dialogue of extractImportedSourceDialogues(sourceText, declaredProtagonist || "主角")) {
    if (dialogue.character && dialogue.character !== "主角") {
      addCandidate(dialogue.character, 90, text.indexOf(dialogue.line), { evidenceScore: 4, requireNameLike: true });
    }
  }

  for (const candidate of byName.values()) {
    candidate.score += countExactOccurrences(text, candidate.name) * 3;
  }

  const candidates = Array.from(byName.values());
  const fullNames = new Set(candidates.filter((candidate) => candidate.name.length === 3).map((candidate) => candidate.name));
  const mergedCandidates = candidates.filter((candidate) => {
    if (candidate.name.length !== 2) return true;
    return !Array.from(fullNames).some((fullName) => {
      const fullCandidate = byName.get(fullName);
      return fullName.endsWith(candidate.name) && (fullCandidate?.score || 0) >= candidate.score;
    });
  });

  const sortedCandidates = mergedCandidates.sort((left, right) => {
    const leftDeclared = declaredProtagonist && left.name === declaredProtagonist ? 1 : 0;
    const rightDeclared = declaredProtagonist && right.name === declaredProtagonist ? 1 : 0;
    return rightDeclared - leftDeclared || (!declaredProtagonist ? left.firstIndex - right.firstIndex : 0) || right.score - left.score || left.firstIndex - right.firstIndex;
  });
  const minimumScore = Math.max(70, (sortedCandidates[0]?.score || 0) * 0.08);

  return sortedCandidates
    .filter((candidate) => candidate.evidenceScore > 0 && candidate.score >= minimumScore)
    .slice(0, MAX_IMPORTED_SOURCE_CHARACTERS);
}

function normalizeImportedCharacterName(rawName: string | undefined): string {
  let name = rawName?.replace(/[^\u4e00-\u9fa5]/g, "").trim() || "";
  if (name.length === 3 && /^[叫是]/.test(name)) name = name.slice(1);
  name = stripTrailingImportedNameParticle(name);
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(name)) return "";
  if (isDiscardableImportedCharacterName(name)) return "";
  return name;
}

function stripTrailingImportedNameParticle(name: string): string {
  if (
    name.length === 3 &&
    IMPORTED_TRAILING_NAME_PARTICLES.has(name[2]) &&
    COMMON_CHINESE_SURNAME_CHARS.has(name[0]) &&
    !COMMON_CHINESE_COMPOUND_SURNAMES.some((surname) => name.startsWith(surname))
  ) {
    return name.slice(0, 2);
  }
  return name;
}

function inferImportedSourceCharacterAliasMap(sourceText: string): Map<string, string> {
  const aliases = Array.from(IMPORTED_DESCRIPTIVE_CHARACTER_LABELS).sort((left, right) => right.length - left.length);
  const map = new Map<string, string>();
  const sentences = sourceText
    .replace(/\s+/g, " ")
    .split(/[。！？!?\n]/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const quoteMatch = sentence.match(/[“"]([^”"]{1,120})[”"]/);
    const selfName = inferSelfIdentifiedDialogueSpeaker(quoteMatch?.[1] || "");
    if (!selfName) continue;

    const beforeQuote = quoteMatch?.index === undefined ? sentence : sentence.slice(0, quoteMatch.index);
    const alias = aliases.find((item) => beforeQuote.includes(item)) || extractImportedDescriptiveLabel(beforeQuote);
    if (alias && alias !== selfName) {
      map.set(alias, selfName);
    }
  }

  return map;
}

function isDiscardableImportedCharacterName(name: string | undefined): boolean {
  const text = cleanText(name, "");
  if (!text) return true;
  if (isGenericCharacterName(text)) return true;
  if (isDescriptiveImportedCharacterLabel(text)) return true;
  if (IMPORTED_DESCRIPTIVE_CHARACTER_LABELS.has(text)) return true;
  if (IMPORTED_ACTION_NAME_FRAGMENT.test(text)) return true;
  if (IMPORTED_NARRATIVE_FRAGMENT_PATTERN.test(text)) return true;
  if (/[了们没]/.test(text) || /^(我|你|他|她|它|这|那|和|与|跟|对|被|把|让)/.test(text) || text.endsWith("者")) return true;
  if (/(觉得|左右|此时|前排|发觉|勾头|开口|大声|低头|抬头|回头|看了|想到|分别|斜靠)/.test(text)) return true;
  if (IMPORTED_NAME_STOP_WORDS.has(text)) return true;
  if (Array.from(IMPORTED_NAME_STOP_WORDS).some((word) => text.includes(word))) return true;
  return false;
}

function hasImportedCharacterEvidence(name: string | undefined, sourceText: string): boolean {
  const text = cleanText(name, "");
  if (!text || isDiscardableImportedCharacterName(text)) return false;
  const escaped = escapeRegExp(text);
  return [
    new RegExp(`(?:我叫|我是)\\s*${escaped}${CHINESE_NAME_BOUNDARY}`),
    new RegExp(`${escaped}[\\uFF0C,][^。！？!?]{0,18}(?:人|岁)`),
    new RegExp(`(?:主角|主人公|核心主角)[\\uFF1A:\\s]*${escaped}${CHINESE_NAME_BOUNDARY}`),
    new RegExp(`${escaped}(?:缓缓|猛然|忽然|突然|立刻|顿时|再次|抬头|低头|抬眼|回头|转身|站起|站了起来|坐直|看向|看着|看了看|问道|说道|说|开口|继续|皱眉|沉声|低声|大声|笑|侧身|避过|横削|直刺|欺身|抚过|缠绕|化解|旋身|劈向|躲闪|步步|紧逼|点头|摇头|抱头|走向|追问|回答|盯着|发现|发觉|意识到|伸手|抓住|离开|进入)`),
    new RegExp(`[“"][^”"]{1,180}[”"]\\s*${escaped}(?:[^。！？!?]{0,16})?(?:问道|说道|说|开口|喊道|回答|答道|打断|呻吟|震惊道|笑道|骂道|喃喃)`),
    new RegExp(`${escaped}(?:[^。！？!?]{0,16})?(?:问道|说道|说|开口|喊道|回答|答道|打断|呻吟|震惊道|笑道|骂道|喃喃)[\\uFF1A:]?[“"]`)
  ].some((pattern) => pattern.test(sourceText));
}

function extractImportedDescriptiveLabel(text: string): string | undefined {
  const matches = Array.from(
    text.matchAll(new RegExp(`([\\u4e00-\\u9fa5]{0,4}(?:${IMPORTED_DESCRIPTIVE_LABEL_NOUNS}))`, "g"))
  )
    .map((match) => match[1])
    .filter((label): label is string => Boolean(label && isDescriptiveImportedCharacterLabel(label)));
  return matches.at(-1);
}

function isDescriptiveImportedCharacterLabel(name: string | undefined): boolean {
  const text = cleanText(name, "");
  if (!text) return false;
  if (IMPORTED_DESCRIPTIVE_CHARACTER_LABELS.has(text)) return true;
  return new RegExp(`^[\\u4e00-\\u9fa5]{0,4}(?:${IMPORTED_DESCRIPTIVE_LABEL_NOUNS})$`).test(text);
}

function isLikelyChinesePersonName(name: string | undefined): boolean {
  const text = cleanText(name, "");
  if (!/^[\u4e00-\u9fa5]{2,4}$/.test(text)) return false;
  if (isDiscardableImportedCharacterName(text)) return false;
  if (COMMON_CHINESE_COMPOUND_SURNAMES.some((surname) => text.startsWith(surname) && text.length > surname.length)) return true;
  return text.length <= 3 && COMMON_CHINESE_SURNAME_CHARS.has(text[0]);
}

function buildImportedSourceCharacter(
  candidate: ImportedSourceCharacterCandidate,
  index: number,
  sourceText: string,
  protagonistName: string,
  existing?: StoryState["characters"][number]
): StoryState["characters"][number] {
  const context = collectImportedCharacterContext(sourceText, candidate);
  const gender = inferImportedSourceGender(context);
  const age = inferImportedSourceAge(candidate.name, context);
  const relationshipToProtagonist =
    candidate.name === protagonistName ? "主角" : inferImportedSourceRelationship(candidate.name, protagonistName, context);
  const role =
    candidate.name === protagonistName
      ? "核心主角 / 异常事件亲历者"
      : inferImportedSourceRole(candidate.name, context, relationshipToProtagonist);
  const appearance = inferImportedSourceAppearance(context, candidate.name, index);
  const personality = index === 0 ? ["冷静", "警觉", "执着"] : inferImportedSourcePersonality(context);
  const speakingStyle = index === 0 ? "短句克制，先观察再判断。" : "根据原文语气保留差异化表达，避免与主角混同。";
  const consistencyPrompt = [
    candidate.name,
    gender,
    age,
    relationshipToProtagonist,
    role,
    appearance,
    shortText(context, `${candidate.name}来自导入小说原文`, 140),
    "同一角色保持同一张脸、发型、体型和服装气质，不要和其他人物混脸",
    "不要偏离项目所选画风"
  ]
    .filter(Boolean)
    .join("，");

  return {
    id: existing?.id || `char-source-${index + 1}`,
    name: candidate.name,
    role: existing && !isGenericCharacterName(existing.name) ? existing.role : role,
    age: existing?.age || age,
    gender: existing?.gender || gender,
    relationshipToProtagonist: existing?.relationshipToProtagonist || relationshipToProtagonist,
    personality: existing?.personality?.length ? existing.personality : personality,
    appearance: existing && !isGenericAppearance(existing.appearance) ? existing.appearance : appearance,
    speakingStyle: existing?.speakingStyle || speakingStyle,
    consistencyPrompt
  };
}

function collectImportedCharacterContext(sourceText: string, candidate: ImportedSourceCharacterCandidate): string {
  const matchedContexts = Array.from(sourceText.matchAll(new RegExp(`[^。！？!?\\n]{0,42}${escapeRegExp(candidate.name)}[^。！？!?\\n]{0,72}`, "g")))
    .slice(0, 8)
    .map((match) => match[0].replace(/\s+/g, " ").trim());
  return [...candidate.contexts, ...matchedContexts].filter(Boolean).join("。");
}

function inferImportedSourceGender(context: string): string | undefined {
  if (/(女性|女人|女子|女孩|少女|女儿|妹妹|姐姐|女主|她)/.test(context)) return "中国女性角色";
  if (/(男性|男人|男子|男孩|少年|哥哥|弟弟|男主|壮汉|壮硕|肌肉|他)/.test(context)) return "中国男性角色";
  return undefined;
}

function inferImportedSourceAge(name: string, context: string): string | undefined {
  const escapedName = escapeRegExp(name);
  const nearAge = context.match(new RegExp(`${escapedName}[^，。；、\\n]{0,18}(\\d{1,2}\\s*岁)|(\\d{1,2}\\s*岁)[^，。；、\\n]{0,18}${escapedName}`));
  return nearAge?.[1] || nearAge?.[2] || undefined;
}

function inferImportedSourceRelationship(name: string, protagonistName: string, context: string): string {
  if (name === protagonistName) return "主角";
  if (context.includes("同学")) return `${protagonistName}的同学 / 共同被卷入者`;
  if (context.includes("队友")) return `${protagonistName}的队友 / 共同被卷入者`;
  if (/妹妹/.test(context)) return `${protagonistName}的妹妹`;
  if (/姐姐/.test(context)) return `${protagonistName}的姐姐`;
  if (/哥哥/.test(context)) return `${protagonistName}的哥哥`;
  if (/弟弟/.test(context)) return `${protagonistName}的弟弟`;
  return `${protagonistName}的关键关联角色`;
}

function inferImportedSourceRole(name: string, context: string, relationship: string): string {
  if (/壮硕|壮汉|肌肉|强壮/.test(context)) return `${relationship} / 力量型幸存者`;
  if (/瘦弱|瘦|玩笑|小爷|话/.test(context)) return `${relationship} / 机敏观察者`;
  if (/黑色西装|西装|观察者/.test(context)) return `${relationship} / 神秘观察者`;
  if (/系统|规则|管理员/.test(context)) return `${relationship} / 规则提示者`;
  return `${relationship} / 推动剧情的核心人物`;
}

function inferImportedSourceAppearance(context: string, name: string, index: number): string {
  const hints = [
    context.match(/[^。！？!?]{0,24}(?:黑色西装|深色外套|校服|白色T恤|旧运动鞋|背着磨损书包)[^。！？!?]{0,28}/)?.[0],
    context.match(/[^。！？!?]{0,24}(?:瘦弱|壮硕|肌肉|高大|矮小|短发|长发|眼睛|脸型|鼻梁)[^。！？!?]{0,28}/)?.[0]
  ].filter(Boolean);
  if (hints.length > 0) return `${name}：${hints.join("，")}，保持项目所选画风的角色设定。`;
  return index === 0
    ? "成熟人物比例，深色服装，冷静警觉的眼神，处在异常事件中心的角色。"
    : "成熟人物比例，服装和体型需与主角区分，眼神与站姿体现原文角色功能。";
}

function inferImportedSourcePersonality(context: string): string[] {
  if (/玩笑|小爷|稀奇/.test(context)) return ["机敏", "外放", "用玩笑掩饰紧张"];
  if (/壮硕|沉声|双臂交叉|隐忍/.test(context)) return ["强势", "警觉", "压迫感"];
  if (/黑色西装|观察者|平静/.test(context)) return ["神秘", "冷静", "掌握规则"];
  return ["警觉", "克制", "掌握线索"];
}

function isGenericCharacterName(name: string | undefined): boolean {
  const text = cleanText(name, "");
  return GENERIC_CHARACTER_NAMES.has(text) || IMPORTED_DESCRIPTIVE_CHARACTER_LABELS.has(text) || IMPORTED_ACTION_NAME_FRAGMENT.test(text);
}

function isGenericAppearance(appearance: string | undefined): boolean {
  return !appearance || /成熟人物比例.*半写实国漫悬疑风角色|深色长外套/.test(appearance);
}

function replaceCharacterNameReferences(story: StoryState, oldName: string, newName: string): StoryState {
  if (!oldName || oldName === newName) return story;
  const replace = (value: string | undefined) => replaceText(value, oldName, newName);
  return {
    ...story,
    script: story.script.map((scene) => ({
      ...scene,
      title: replace(scene.title),
      location: replace(scene.location),
      description: replace(scene.description),
      dialogues: scene.dialogues.map((dialogue) => ({
        ...dialogue,
        character: dialogue.character === oldName ? newName : replace(dialogue.character),
        line: replace(dialogue.line)
      }))
    })),
    storyboard: story.storyboard.map((shot) => ({
      ...shot,
      shotType: replace(shot.shotType),
      cameraMovement: replace(shot.cameraMovement),
      composition: replace(shot.composition),
      characterActions: replace(shot.characterActions),
      expression: replace(shot.expression),
      background: replace(shot.background),
      dialogue: replace(shot.dialogue),
      imagePrompt: replace(shot.imagePrompt),
      videoPrompt: replace(shot.videoPrompt)
    })),
    visualPrompts: story.visualPrompts.map((prompt) => ({
      ...prompt,
      imagePrompt: replace(prompt.imagePrompt),
      videoPrompt: replace(prompt.videoPrompt)
    }))
  };
}

function replaceText(value: string | undefined, oldName: string, newName: string): string {
  if (!value) return "";
  return value.replace(new RegExp(escapeRegExp(oldName), "g"), newName);
}

function collectContextAroundIndex(text: string, index: number, radius: number): string {
  return text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius)).trim();
}

function countExactOccurrences(text: string, needle: string): number {
  if (!needle) return 0;
  return text.match(new RegExp(escapeRegExp(needle), "g"))?.length || 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSegmentedSeedanceScript(script: string, storyboardCount: number, requiredSegmentCount: number): boolean {
  const value = script.trim();
  if (!value) return false;
  const segmentCount = countSeedanceSegments(value);
  const hasSegmentHeader = /第\s*1\s*段\s*15\s*秒/.test(value);
  const hasLocalShotTimes =
    /分镜\s*1\s*[（(]\s*0\s*-\s*5\s*秒\s*[）)]/.test(value) &&
    /分镜\s*2\s*[（(]\s*5\s*-\s*10\s*秒\s*[）)]/.test(value) &&
    /分镜\s*3\s*[（(]\s*10\s*-\s*15\s*秒\s*[）)]/.test(value);
  const hasContinuousTimeline = /分镜\s*\d+\s*[（(]\s*(?:1[5-9]|[2-9]\d)\s*-\s*(?:2[0-9]|[3-9]\d)\s*秒\s*[）)]/.test(
    value
  );
  return (
    hasSegmentHeader &&
    hasLocalShotTimes &&
    !hasContinuousTimeline &&
    segmentCount >= Math.max(1, storyboardCount, requiredSegmentCount)
  );
}

function countSeedanceSegments(script: string): number {
  return script.match(/第\s*\d+\s*段\s*15\s*秒/g)?.length || 0;
}

function estimateRequiredSegmentCount(sourceText: string, currentStoryboardCount: number): number {
  if (!sourceText.trim()) return Math.max(1, currentStoryboardCount);
  const sourceDrivenCount = estimateSourceDrivenSegmentCount(sourceText);
  if (currentStoryboardCount <= 1) return sourceDrivenCount;

  const upperBound = Math.max(sourceDrivenCount + 3, Math.ceil(sourceDrivenCount * 1.35));
  const lowerBound = Math.max(1, Math.ceil(sourceDrivenCount * 0.65));
  const looksLikeOldFixedCap = currentStoryboardCount === 40 && sourceDrivenCount !== 40;
  if (looksLikeOldFixedCap || currentStoryboardCount > upperBound || currentStoryboardCount < lowerBound) {
    return sourceDrivenCount;
  }

  return clampSegmentCount(currentStoryboardCount);
}

function ensureMinimumStoryboardSegments(
  story: StoryState,
  storyInput: StoryGenerationInput,
  sourceText: string,
  requiredSegmentCount: number
): StoryState {
  if (story.storyboard.length >= requiredSegmentCount) {
    return {
      ...story,
      visualPrompts: alignVisualPrompts(story.storyboard, story.visualPrompts)
    };
  }

  const sourceSegments = getSourceSegmentBeatsForCount(sourceText, requiredSegmentCount);
  const mainCharacter = cleanText(story.characters[0]?.name, "主角");
  const title = cleanText(story.world.title, cleanText(storyInput.inspiration, "导入原文"));
  const script = [...story.script];
  const storyboard = [...story.storyboard];
  const originalStoryboard = story.storyboard.length > 0 ? story.storyboard : undefined;

  while (storyboard.length < requiredSegmentCount) {
    const index = storyboard.length;
    const baseShot = originalStoryboard?.[index % originalStoryboard.length];
    const sourceBeat = sourceSegments[index] || sourceSegments[sourceSegments.length - 1] || story.outline || story.world.background;
    const sceneId = `scene-source-${index + 1}`;
    const shotId = `shot-source-${index + 1}`;
    const sceneTitle = `原文推进 ${index + 1}`;
    const description = shortText(sourceBeat, `${title} 第 ${index + 1} 个关键剧情段`, 160);

    script.push({
      id: sceneId,
      title: sceneTitle,
      location: cleanText(baseShot?.background, title),
      description,
      dialogues: []
    });
    storyboard.push({
      id: shotId,
      sceneId,
      order: index + 1,
      shotType: cleanText(baseShot?.shotType, index % 3 === 0 ? "中景到近景" : index % 3 === 1 ? "近景" : "特写"),
      cameraMovement: cleanText(baseShot?.cameraMovement, index % 3 === 0 ? "跟拍推进" : "缓慢推近"),
      composition: description,
      characterActions: `${mainCharacter}经历原文中的关键事件：${description}`,
      expression: cleanText(baseShot?.expression, "警觉、压抑、克制"),
      background: cleanText(baseShot?.background, description),
      dialogue: "",
      imagePrompt: buildImagePrompt(title, description, mainCharacter, storyInput.visualStyleId),
      videoPrompt: buildVideoPrompt(description, mainCharacter, storyInput.visualStyleId)
    });
  }

  return {
    ...story,
    script,
    storyboard,
    visualPrompts: alignVisualPrompts(storyboard, story.visualPrompts)
  };
}

function extractSourceSegmentBeats(sourceText: string): string[] {
  const normalized = sourceText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const explicitShotLines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => /分镜\s*\d+/.test(line) && line.length > 8);
  if (explicitShotLines.length >= 4) {
    return selectRepresentativeItems(chunkTextItems(explicitShotLines, 3), MAX_IMPORTED_SOURCE_SEGMENTS).map((items) =>
      items.join(" ")
    );
  }

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 8 || /[“"][^”"]{1,180}[”"]/.test(paragraph));
  if (paragraphs.length >= 2) return selectRepresentativeItems(paragraphs, MAX_IMPORTED_SOURCE_SEGMENTS);

  const sentences = splitNarrativeSentences(normalized).filter((sentence) => sentence.length >= 12);
  if (sentences.length === 0) return [shortText(normalized, "导入原文", 220)];
  return selectRepresentativeItems(
    chunkTextItems(sentences, 3).map((items) => items.join("")),
    MAX_IMPORTED_SOURCE_SEGMENTS
  );
}

function splitNarrativeSentences(value: string): string[] {
  const sentences: string[] = [];
  const quoteStack: string[] = [];
  let buffer = "";
  const matchingQuote: Record<string, string> = {
    "“": "”",
    "‘": "’",
    "\"": "\"",
    "'": "'"
  };

  for (const char of value.replace(/\r\n/g, "\n")) {
    buffer += char;

    if (char === "“" || char === "‘") {
      quoteStack.push(matchingQuote[char]);
      continue;
    }

    if (char === "\"" || char === "'") {
      if (quoteStack.at(-1) === char) quoteStack.pop();
      else quoteStack.push(char);
      continue;
    }

    if (quoteStack.at(-1) === char) {
      quoteStack.pop();
      continue;
    }

    if (/[。！？!?]/.test(char) && quoteStack.length === 0) {
      const sentence = buffer.replace(/\s+/g, " ").trim();
      if (sentence) sentences.push(sentence);
      buffer = "";
    }
  }

  const tail = buffer.replace(/\s+/g, " ").trim();
  if (tail) sentences.push(tail);
  return sentences;
}

function getSourceSegmentBeatsForCount(sourceText: string, segmentCount: number): string[] {
  return groupContiguousItemsIntoCount(extractSourceSegmentBeats(sourceText), clampSegmentCount(segmentCount));
}

function estimateSourceDrivenSegmentCount(sourceText: string): number {
  const normalized = sourceText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return 1;

  const explicitSegmentCount = countSeedanceSegments(normalized);
  if (explicitSegmentCount > 0) return clampSegmentCount(explicitSegmentCount);

  const explicitShotCount = normalized
    .split(/\n+/)
    .filter((line) => /分镜\s*\d+/.test(line) && line.trim().length > 8).length;
  if (explicitShotCount >= 4) return clampSegmentCount(Math.ceil(explicitShotCount / 3));

  const sourceLength = normalized.replace(/\s+/g, "").length;
  const lengthBasedSegments = Math.ceil(sourceLength / SOURCE_CHARS_PER_SEGMENT);
  const minimumSegments = sourceLength < 700 ? 1 : sourceLength < 1600 ? 2 : 3;
  const chapterCount = countImportedSourceChapters(normalized);
  const chapterBasedSegments = chapterCount >= 2 ? chapterCount * 2 : 0;
  const paragraphCount = normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length >= 8 || /[“"][^”"]{1,180}[”"]/.test(paragraph)).length;
  const paragraphBasedSegments =
    paragraphCount >= 8 ? Math.ceil(paragraphCount / 4) : paragraphCount >= 2 ? Math.ceil(paragraphCount / 3) : 0;
  const sentenceCount = splitNarrativeSentences(normalized).filter((sentence) => sentence.length >= 8).length;
  const sentenceBasedSegments = sentenceCount >= 6 ? Math.ceil(sentenceCount / 6) : 0;
  const dialogueBasedSegments = Math.ceil(countImportedSourceDialogues(normalized) / 3);

  return clampSegmentCount(
    Math.max(
      minimumSegments,
      lengthBasedSegments,
      chapterBasedSegments,
      paragraphBasedSegments,
      sentenceBasedSegments,
      dialogueBasedSegments,
      1
    )
  );
}

function countImportedSourceDialogues(sourceText: string): number {
  const occupiedSpans: TextSpan[] = [];
  const quotedMatches = Array.from(sourceText.matchAll(/[“"‘'][^”"’']{1,180}[”"’']/g));
  for (const match of quotedMatches) {
    const start = match.index ?? 0;
    occupiedSpans.push({ start, end: start + match[0].length });
  }

  const labeledMatches = Array.from(sourceText.matchAll(/(?:台词|对白)[：:]\s*[^。\n]{1,180}/g));
  for (const match of labeledMatches) {
    const start = match.index ?? 0;
    const span = { start, end: start + match[0].length };
    if (!hasSpanOverlap(span, occupiedSpans)) occupiedSpans.push(span);
  }

  const standaloneCount = extractStandaloneInnerMonologueCandidates(sourceText, occupiedSpans, "主角").length;
  return occupiedSpans.length + standaloneCount;
}

function countImportedSourceChapters(sourceText: string): number {
  return (
    sourceText.match(
      /(?:^|\n)\s*(?:第\s*[一二三四五六七八九十百千万\d]+\s*[章节卷]|第\s*\d+\s*章|chapter\s+\d+)/gi
    )?.length || 0
  );
}

function chunkTextItems(items: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function selectRepresentativeItems<T>(items: T[], maxItems: number): T[] {
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

function groupContiguousItemsIntoCount(items: string[], targetCount: number): string[] {
  if (items.length === 0) return [];
  const count = Math.max(1, Math.min(targetCount, items.length));
  const grouped: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * items.length) / count);
    const end = Math.floor(((index + 1) * items.length) / count);
    const slice = items.slice(start, Math.max(start + 1, end));
    grouped.push(slice.join("\n"));
  }

  return grouped;
}

function clampSegmentCount(value: number): number {
  return Math.max(1, Math.min(MAX_IMPORTED_SOURCE_SEGMENTS, value));
}

function alignVisualPrompts(storyboard: StoryState["storyboard"], visualPrompts: StoryState["visualPrompts"]): StoryState["visualPrompts"] {
  const promptByShotId = new Map(visualPrompts.map((prompt) => [prompt.shotId, prompt]));
  return storyboard.map((shot) => {
    const existing = promptByShotId.get(shot.id);
    if (existing) return existing;
    return {
      id: `prompt-${shot.id}`,
      shotId: shot.id,
      imagePrompt: shot.imagePrompt,
      videoPrompt: shot.videoPrompt
    };
  });
}

function buildImagePrompt(title: string, description: string, mainCharacter: string, visualStyleId?: string): string {
  return appendVisualStyleInstruction(`${title}，${description}，${mainCharacter}`, visualStyleId);
}

function buildVideoPrompt(description: string, mainCharacter: string, visualStyleId?: string): string {
  return appendVisualStyleInstruction(`15秒短剧片段，${description}，${mainCharacter}完成当前关键剧情动作，镜头平稳推进`, visualStyleId);
}

function buildSegmentedSeedanceScript(story: StoryState, storyInput: StoryGenerationInput): string {
  const title = cleanText(story.world.title, "未命名项目");
  const mainCharacter = cleanText(story.characters[0]?.name, "主角");
  const characterNames = story.characters.map((character) => cleanText(character.name, "")).filter(Boolean);
  const sceneById = new Map(story.script.map((scene) => [scene.id, scene]));
  const shots = story.storyboard.length > 0 ? story.storyboard : [];
  const preset = getVisualStylePreset(storyInput.visualStyleId) || getDefaultVisualStylePreset();
  const visualStyleLines = buildVisualStyleSeedanceLines(storyInput.visualStyleId);

  const header = [
    `《${title}》E01《异常开启》Seedance 2.0 分镜脚本`,
    "用途：适配即梦 / Seedance 2.0 视频模型，直接用于分段生成视频。",
    "格式：每段 15 秒，每段至少 3 个分镜，统一标注起止秒数。",
    `成片类型：${preset.label} AI 漫剧短剧。`,
    "",
    "整体统一设定",
    ...visualStyleLines,
    "运镜：短剧感，平稳流畅，少用剧烈旋转，多用推镜、跟拍、特写切换、灯光闪烁。",
    "首尾帧连续：第 2 段及之后的开头承接上一段末帧的位置、光影、人物姿态、视线方向和镜头运动；每段结尾保留可衔接下一段首帧的尾帧。",
    `人物：${characterNames.join("，") || mainCharacter}。`,
    ...(storyInput.sourceType === "novel"
      ? []
      : [
          `故事灵感：${cleanText(storyInput.inspiration, title)}`,
          `世界观：${cleanText(story.world.background, "围绕核心悬疑事件展开的现代都市异常空间。")}`,
          `剧情大纲：${cleanText(story.outline, "主角发现异常，进入关键空间，并触发下一阶段规则。")}`
        ]),
    `禁忌：${buildVisualStyleGuardrail(storyInput.visualStyleId)}`,
    ""
  ];

  if (shots.length === 0) {
    return [
      ...header,
      "第 1 段 15 秒：异常出现",
      ...buildSegmentShotLines({
        title: "异常出现",
        mainCharacter,
        shotType: "全景到中景",
        cameraMovement: "缓慢推镜",
        characterActions: `${mainCharacter}发现异常并停下脚步。`,
        expression: "警觉、压抑",
        background: cleanText(story.world.background, "异常空间内部。"),
        dialogue: `${mainCharacter}：“这里不对劲。”`,
        composition: "角色处在画面视觉中心，环境异常逐步显现。",
        visualStyleId: storyInput.visualStyleId
      })
    ].join("\n");
  }

  return [
    ...header,
    ...shots.flatMap((shot, index) => {
      const scene = sceneById.get(shot.sceneId);
      const segmentTitle = cleanText(scene?.title, shortText(shot.composition || shot.background, `片段 ${index + 1}`));
      const segmentCharacters = inferSegmentCharacters(
        [shot.composition, shot.characterActions, shot.background, shot.dialogue].join(" "),
        characterNames,
        mainCharacter
      ).join("、");
      return [
        `第 ${index + 1} 段 15 秒：${segmentTitle}`,
        ...buildSegmentShotLines({
          title: segmentTitle,
          mainCharacter: segmentCharacters,
          shotType: cleanText(shot.shotType, "中景到近景"),
          cameraMovement: cleanText(shot.cameraMovement, "平稳推镜"),
          characterActions: cleanText(shot.characterActions, `${mainCharacter}推进当前事件。`),
          expression: cleanText(shot.expression, "警觉、克制"),
          background: cleanText(shot.background, story.world.background),
          dialogue: shot.dialogue || "",
          composition: cleanText(shot.composition, segmentTitle),
          visualStyleId: storyInput.visualStyleId
        })
      ];
    })
  ].join("\n");
}

function buildSegmentShotLines(input: {
  title: string;
  mainCharacter: string;
  shotType: string;
  cameraMovement: string;
  characterActions: string;
  expression: string;
  background: string;
  dialogue: string;
  composition: string;
  visualStyleId?: string;
}): string[] {
  const segmentFocus = shortText(input.composition || input.characterActions || input.title, input.title);
  const segmentExpression = cleanText(input.expression, "警觉、克制");
  const dialogueLines = splitSeedanceDialogueLines(input.dialogue, input.mainCharacter);
  const preset = getVisualStylePreset(input.visualStyleId) || getDefaultVisualStylePreset();
  const lightLine = `光影：遵循“${preset.label}”画风的色彩、光影、材质和阴影要求，突出当前剧情重点。`;
  return [
    `分镜 1（0-5 秒）：${input.shotType} / ${shortText(input.title, "当前段落")}`,
    `景别：${input.shotType}。`,
    `运镜：${input.cameraMovement}。`,
    `主角：${input.mainCharacter}。`,
    `动作：${ensurePeriod(input.characterActions)}`,
    `台词：${dialogueLines[0] || "无。"}`,
    "音效：低频环境声，细微电流声，远处空间回响。",
    lightLine,
    `场景：${ensurePeriod(input.background)}`,
    "",
    "分镜 2（5-10 秒）：近景 / 当前动作推进",
    "景别：近景。",
    "运镜：镜头跟随当前动作与环境反应推进。",
    `主角：${input.mainCharacter}。`,
    `动作：围绕“${segmentFocus}”延展人物动作与环境反应，保持与原文段落一致。`,
    `台词：${dialogueLines[1] || "无。"}`,
    "音效：环境声短暂压低，保留当前场景中的主要声响。",
    lightLine,
    `场景：${ensurePeriod(input.background)}`,
    "",
    "分镜 3（10-15 秒）：特写 / 段落收束",
    "景别：特写。",
    "运镜：从角色反应切到当前段落结果，保持镜头方向和动作连续，停在可衔接下一段首帧的尾帧。",
    `主角：${input.mainCharacter}。`,
    `动作：${segmentExpression}，围绕“${segmentFocus}”完成当前段落的情绪收束。`,
    `台词：${dialogueLines.slice(2).join("；") || "无。"}`,
    "音效：环境声保持连续，最后一秒不要静音切断，保留可接下一段的环境声尾音。",
    `光影：延续“${preset.label}”画风的光影逻辑，最后一秒停在角色或关键动作的连续尾帧，不使用黑场或闪白。`,
    `场景：${ensurePeriod(input.background)}`,
    ""
  ];
}

function formatDialogue(dialogue: string | undefined, character: string): string {
  const text = cleanText(dialogue, "");
  if (!text || text === "无") return "无。";
  if (text.includes("：") || text.includes(":") || text.includes("“")) return ensurePeriod(text);
  return `${character}：“${text}”`;
}

function splitSeedanceDialogueLines(dialogue: string | undefined, character: string): string[] {
  const text = dialogue?.trim();
  if (!text || text === "无" || text === "无。") return [];
  return text
    .split(/\n+|(?<=”)\s*[；;]\s*(?=[\u4e00-\u9fa5]{2,6}[：:])/)
    .map((line) => formatDialogue(line.trim(), character))
    .filter((line) => line && line !== "无。");
}

function cleanText(value: string | undefined, fallback: string): string {
  const text = value?.replace(/\s+/g, " ").trim();
  return text || fallback;
}

function shortText(value: string, fallback: string, maxLength = 26): string {
  const text = cleanText(value, fallback);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function ensurePeriod(value: string): string {
  const text = cleanText(value, "");
  if (!text) return "无。";
  return /[。！？.!?”"']$/.test(text) ? text : `${text}。`;
}

function repairCommonJsonModelOutput(value: string): string {
  return extractJsonObject(value)
    .replace(/^\uFEFF/, "")
    .replace(/("[^"\\]*(?:\\.[^"\\]*)*")\s*：/g, "$1:")
    .replace(/,\s*([}\]])/g, "$1");
}

function extractJsonObject(value: string): string {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end <= start) return value;
  return value.slice(start, end + 1);
}

export function sanitizeImportedSourceText(sourceText: string): string {
  return sourceText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => stripInlineAuthorReaderNotes(line).trimEnd())
    .filter((line) => !isAuthorReaderAsideLine(line))
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function getImportedSourceLabel(sourceText: string, fallback = "导入原文"): string {
  const cleaned = sanitizeImportedSourceText(sourceText);
  const label = cleaned
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !isAuthorReaderAsideLine(line));
  return shortText(label || fallback, fallback, 28);
}

export function estimateImportedSourceSegmentCount(sourceText: string, currentStoryboardCount = 1): number {
  return estimateRequiredSegmentCount(sanitizeImportedSourceText(sourceText), currentStoryboardCount);
}

export function getImportedSourceSegmentBeats(sourceText: string, segmentCount: number): string[] {
  return getSourceSegmentBeatsForCount(sanitizeImportedSourceText(sourceText), segmentCount);
}

function buildImportedSourcePromptText(sourceText: string): string {
  const cleaned = sanitizeImportedSourceText(sourceText);
  if (cleaned.length <= MAX_IMPORTED_PROMPT_CHARS) return cleaned;

  const headLength = 14000;
  const middleLength = 8000;
  const tailLength = 14000;
  const omittedLength = Math.max(0, cleaned.length - headLength - middleLength - tailLength);
  const middleStart = Math.max(headLength, Math.floor((cleaned.length - middleLength) / 2));
  return [
    cleaned.slice(0, headLength).trim(),
    "",
    `【中间原文过长，已省略 ${omittedLength} 字。后处理仍会按全文抽取所有关键段。】`,
    "",
    cleaned.slice(middleStart, middleStart + middleLength).trim(),
    "",
    "【接续至原文后段】",
    "",
    cleaned.slice(-tailLength).trim()
  ].join("\n");
}

function stripInlineAuthorReaderNotes(line: string): string {
  return line.replace(
    /[（(][^（）()\n]{0,240}(?:作者|读者|亲了你|么么哒|求收藏|求推荐|求月票|求票|打赏|评论区|催更)[^（）()\n]{0,240}[）)]/g,
    ""
  );
}

function isAuthorReaderAsideLine(line: string): boolean {
  const value = line.trim();
  if (!value) return false;
  const hasAsideKeyword = /作者|读者|亲了你|么么哒|求收藏|求推荐|求月票|求票|打赏|评论区|催更/.test(value);
  if (!hasAsideKeyword) return false;
  if (/^[（(【\[][\s\S]{0,260}[）)】\]]$/.test(value)) return true;
  return /^(作者|读者)[：:]/.test(value);
}

function buildStoryGenerationPrompt(storyInput: StoryGenerationInput, importedSourceText: string): string {
  const visualStyleInstruction = buildVisualStyleInstruction(storyInput.visualStyleId);
  if (storyInput.sourceType === "novel" && importedSourceText) {
    return [
      "Generate a structured AI comic story state directly from the imported novel/document source below.",
      "The user is intentionally skipping separate story inspiration, worldbuilding, and outline inputs.",
      "Analyze the source text and derive: world setting, core characters, episode outline, script scenes, storyboard, visual prompts, and a complete Seedance 2.0 segmented storyboard script.",
      "Do not copy raw novel sentences into styleKeywords, consistencyPrompt, scene descriptions, imagePrompt, videoPrompt, or scene-model/image-prompt fields. Rewrite them as concise analyzed visual prompt results: identity traits, scene nouns, atmosphere, light, color, composition, materials, and camera language.",
      "Direct quotes and original action prose may appear only in dialogue/script fields when needed. Visual prompt fields must not contain source excerpts such as character action sentences, dialogue, or narration fragments.",
      visualStyleInstruction,
      SEEDANCE_SEGMENTED_SCRIPT_CONTRACT,
      "If the source text is long, analyze all imported content and compress it into enough 15-second segments to preserve the complete main storyline, original tone, relationships, names, major conflict, key turns, discoveries, and ending hook.",
      "Character extraction rule: preserve explicit gender, age, family relations, and role labels from the source. Example: 妹妹林夏 means 林夏 is female and is the protagonist's younger sister. Put those facts into gender, relationshipToProtagonist, role, appearance, and consistencyPrompt.",
      "Do not treat action phrases, camera/action fragments, or sentence fragments as character names.",
      "If a temporary descriptive label later self-identifies with a real name in dialogue, merge the label into the real name. For example, a line shaped like “I am NAME” or “NAME, from PLACE, AGE years old” means the character should be NAME, not the previous descriptive label.",
      "Character image prompt rule: consistencyPrompt must be concrete enough for a character model sheet and must include identity constraints that prevent gender drift or face drift.",
      "Do not summarize only. Convert the source into production-ready short-drama comic material.",
      "",
      `导入文件：${storyInput.sourceFileName || "直接粘贴文本"}`,
      `导入入口标记：${storyInput.inspiration}`,
      "",
      "小说/文档原文：",
      importedSourceText
    ].join("\n");
  }

  return [
    "Generate a structured AI comic story state from the confirmed creator brief below.",
    visualStyleInstruction,
    `故事灵感：${storyInput.inspiration}`,
    `世界观标题：${storyInput.worldTitle || "未填写，请基于故事灵感生成"}`,
    `世界观设定：${storyInput.worldBackground || "未填写，请基于故事灵感生成"}`,
    `剧情大纲：${storyInput.outline || "未填写，请基于故事灵感生成"}`,
    "角色提取规则：必须保留故事灵感、世界观和剧情大纲里的性别、年龄、家庭关系和角色定位。例如“妹妹林夏”必须生成女性角色，relationshipToProtagonist 写“主角的妹妹”，人物一致性 Prompt 也必须写明女性、妹妹、不是男性角色。",
    "人物一致性 Prompt 规则：必须具体到年龄/年龄段、性别、亲属关系、面部特征、发型、服装、体型、气质，并加入防止性别漂移和换脸的约束。",
    SEEDANCE_SEGMENTED_SCRIPT_CONTRACT,
    "The confirmed brief is the source of truth. Preserve its core setting, plot direction, tone, and character logic."
  ].join("\n");
}
