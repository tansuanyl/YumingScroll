import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  estimateImportedSourceSegmentCount,
  normalizeGeneratedStoryStateForInput,
  OpenAITextProvider
} from "../server/providers/OpenAITextProvider";
import { SeedanceMediaProvider } from "../server/providers/SeedanceMediaProvider";
import { MediaPipelineService } from "../server/services/MediaPipelineService";
import { ProjectStore } from "../server/services/ProjectStore";
import { TextPipelineService } from "../server/services/TextPipelineService";
import { createDemoProject, deriveSceneModelsFromStory } from "../src/data/demoProject";
import { createTextRouter } from "../server/routes/text";
import { createProjectRouter } from "../server/routes/projects";
import express from "express";
import type { StoryState } from "../src/types/domain";

describe("pipeline services", () => {
  it("generates story structure in explicit mock mode", async () => {
    const text = new TextPipelineService(new OpenAITextProvider({ mock: true }));

    const story = await text.generateStory({
      inspiration: "古风权谋下的宿敌恋爱",
      worldTitle: "雨幕新东京",
      worldBackground: "未来城市被企业网络和地下黑市共同控制。",
      outline: "两名宿敌在追逃中发现彼此被同一份档案操控。"
    });

    expect(story.world.title).toBe("雨幕新东京");
    expect(story.world.background).toBe("未来城市被企业网络和地下黑市共同控制。");
    expect(story.outline).toBe("两名宿敌在追逃中发现彼此被同一份档案操控。");
    expect(story.characters.length).toBeGreaterThan(0);
    expect(story.script.length).toBeGreaterThan(0);
    expect(story.storyboard.length).toBeGreaterThan(0);
    expect(story.visualPrompts.length).toBeGreaterThan(0);
    expect(story.seedanceScript).toContain("Seedance 2.0");
    expect(story.seedanceScript).toContain("每段 15 秒");
    expect(story.seedanceScript).toContain("分镜 1（0-5 秒）");
  });

  it("keeps imported source content when text generation times out and uses fallback", async () => {
    const hangingProvider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: () => new Promise<StoryState>(() => {}),
      regenerateSection: async () => ({}),
      reviseSeedanceScript: async () => ""
    } as unknown as OpenAITextProvider;
    const text = new TextPipelineService(hangingProvider, {
      requestTimeoutMs: 1,
      fallbackToMockOnTimeout: true
    });
    const sourceText = [
      "陈策在深夜23:51的大客车座椅上醒来，窗外路灯扫过他的侧脸，车厢里只有谭一峰和顾帅两道人影。",
      "谭一峰走到驾驶座前，发现无人驾驶的大客车仍在加速，空驾驶位上的绿色电子钟停在23:51。",
      "顾帅翻找口袋发现所有随身物品消失，三人意识到这辆车不是普通交通工具，而是一场死亡副本的入口。"
    ].join("\n\n");

    const story = await text.generateStory({
      inspiration: "Imported source: 我在死亡副本编写逃生代码 - 毛栗子大王.txt",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });

    expect(story.world.background).toContain("大客车");
    expect(story.outline).toContain("死亡副本");
    expect(story.characters.map((character) => character.name)).toContain("陈策");
    expect(story.seedanceScript).toContain("陈策");
    expect(story.seedanceScript).toContain("谭一峰");
    expect(story.seedanceScript).toContain("顾帅");
    expect(story.seedanceScript).toContain("23:51");
    expect(story.seedanceScript).not.toContain("第十三层档案馆");
    expect(story.seedanceScript).not.toContain("规则已启动");
  });

  it("keeps direct speech in dialogue fields when imported-source fallback is used", async () => {
    const hangingProvider = {
      isMock: () => false,
      model: () => "kimi-k2.6",
      generateStory: () => new Promise<StoryState>(() => {}),
      regenerateSection: async () => ({}),
      reviseSeedanceScript: async () => ""
    } as unknown as OpenAITextProvider;
    const text = new TextPipelineService(hangingProvider, {
      requestTimeoutMs: 1,
      fallbackToMockOnTimeout: true
    });
    const sourceText = [
      "这一念头刚出现，陈策就发觉周围的环境好像变亮了一些。",
      "“表演？什么表演？刚才为什么不说？”谭一峰在两人身后开口问道。",
      "黑衣男子破天荒的没有第一时间说话，过了两秒方才回答：“先活下来，再问原因。”"
    ].join("\n\n");

    const story = await text.generateStory({
      inspiration: "Imported source: 一阵不好的感觉在陈策胸腔酝酿。",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });

    expect(story.storyboard.map((shot) => shot.dialogue).join("\n")).toContain("谭一峰：“表演？什么表演？刚才为什么不说？”");
    expect(story.seedanceScript).toContain("台词：谭一峰：“表演？什么表演？刚才为什么不说？”");
    expect(story.seedanceScript).not.toContain("台词：谭一峰：“表演？什么表演？刚才为什么不说？”。");
    expect(story.seedanceScript).not.toContain("动作：陈策经历原文中的关键推进：“表演？什么表演？刚才为什么不说？”");
    expect(story.seedanceScript).not.toContain("场景：大客车：“表演？什么表演？刚才为什么不说？”");
  });

  it("rebuilds imported-source storyboards when model output is unrelated to the source", () => {
    const unrelated = createDemoProject({ inspiration: "第十三层档案馆" }).storyState;
    const sourceText = [
      "陈策在深夜23:51的大客车座椅上醒来，窗外路灯扫过他的侧脸。",
      "谭一峰查看空驾驶座，顾帅发现口袋里的钱和手机全部消失。",
      "三人意识到这辆大客车正在把他们送进死亡副本。"
    ].join("\n\n");

    const story = normalizeGeneratedStoryStateForInput(unrelated, {
      inspiration: "Imported source: 我在死亡副本编写逃生代码 - 毛栗子大王.txt",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });

    expect(story.seedanceScript).toContain("陈策");
    expect(story.seedanceScript).toContain("大客车");
    expect(story.seedanceScript).toContain("死亡副本");
    expect(story.seedanceScript).not.toContain("第十三层档案馆");
    expect(story.seedanceScript).not.toContain("台词：系统");
    expect(story.seedanceScript).not.toContain("规则已启动");
  });

  it("keeps direct speech in dialogue fields when rebuilding imported-source storyboards", () => {
    const unrelated = {
      ...createDemoProject({ inspiration: "第十三层档案馆" }).storyState,
      script: [],
      storyboard: [],
      visualPrompts: [],
      seedanceScript: ""
    };
    const sourceText = [
      "这一念头刚出现，陈策就发觉周围的环境好像变亮了一些。",
      "“表演？什么表演？刚才为什么不说？”谭一峰在两人身后开口问道。",
      "黑衣男子破天荒的没有第一时间说话，过了两秒方才回答：“先活下来，再问原因。”"
    ].join("\n\n");

    const story = normalizeGeneratedStoryStateForInput(unrelated, {
      inspiration: "Imported source: 一阵不好的感觉在陈策胸腔酝酿。",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });

    expect(story.storyboard.map((shot) => shot.dialogue).join("\n")).toContain("谭一峰：“表演？什么表演？刚才为什么不说？”");
    expect(story.seedanceScript).toContain("台词：谭一峰：“表演？什么表演？刚才为什么不说？”");
    expect(story.seedanceScript).not.toContain("台词：谭一峰：“表演？什么表演？刚才为什么不说？”。");
    expect(story.seedanceScript).not.toContain("动作：陈策经历原文中的关键事件：“表演？什么表演？刚才为什么不说？”");
    expect(story.seedanceScript).not.toContain("场景：“表演？什么表演？刚才为什么不说？”");
  });

  it("treats standalone inner monologue as dialogue and removes it from action and scene fields", () => {
    const sourceText = [
      "一阵剧烈的颠簸袭来，陈策缓缓睁开了双眼，迷茫的打量着四周。",
      "这是……大客车？",
      "陈策发觉自己此刻正斜靠在大客车后门第一排的座椅上。陈策坐直身体，抬眼望去，前方有两道身影分别坐在大客车的前排左右，只是灯光昏暗，看不清楚。"
    ].join("\n\n");

    const story = normalizeGeneratedStoryStateForInput(createDemoProject({ inspiration: "第十三层档案馆" }).storyState, {
      inspiration: "Imported source: 这是……大客车？",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });

    expect(story.seedanceScript).toContain("台词：陈策：“这是……大客车？”");
    const actionAndSceneLines = story.seedanceScript
      .split("\n")
      .filter((line) => /^(动作|场景)：/.test(line))
      .join("\n");
    expect(actionAndSceneLines).not.toContain("这是……大客车？");
  });

  it("does not keep a fixed 40 segment count for short imported source text", () => {
    const sourceText = [
      "陈策在深夜23:51的大客车座椅上醒来，窗外路灯扫过他的侧脸。",
      "谭一峰查看空驾驶座，顾帅发现口袋里的钱和手机全部消失。",
      "三人意识到这辆大客车正在把他们送进死亡副本。"
    ].join("\n\n");

    const estimatedCount = estimateImportedSourceSegmentCount(sourceText, 40);
    const story = normalizeGeneratedStoryStateForInput(createDemoProject({ inspiration: "第十三层档案馆" }).storyState, {
      inspiration: "Imported source: 我在死亡副本编写逃生代码 - 毛栗子大王.txt",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });

    expect(estimatedCount).toBeLessThan(10);
    expect(story.storyboard.length).toBeLessThan(10);
    expect(story.storyboard.length).toBeGreaterThanOrEqual(estimatedCount);
    expect(story.storyboard.length).not.toBe(40);
    expect(story.seedanceScript).toContain("大客车");
  });

  it("caps very long imported source text to a manageable synchronous segment count", () => {
    const sourceText = Array.from(
      { length: 260 },
      (_, index) => `第${index + 1}章\n陈策在异常空间追查第 ${index + 1} 个线索，发现大客车和第十三层档案馆之间的联系。`
    ).join("\n\n");

    expect(estimateImportedSourceSegmentCount(sourceText, 1)).toBe(40);
  });

  it("keeps continuous novel coverage and assigns quoted dialogue into Seedance dialogue lines", () => {
    const sourceText = [
      "一阵剧烈的颠簸袭来，陈策缓缓睁开了双眼，迷茫的打量着四周。",
      "这是……大客车？",
      "陈策发觉自己此刻正斜靠在大客车后门第一排的座椅上。",
      "“这是怎么回事？我记得我明明……”",
      "想到这里，剧烈的头痛打断了思考，疼的陈策倒吸了一口凉气。",
      "“嘶……”陈策低头按着太阳穴，过了好一会才觉得疼痛有所缓解。",
      "“喂，后面那两位，现在是什么情况？”",
      "大客车前排右侧的人此时也站了起来，“我这是在哪儿？我记得我之前还在……我靠……”",
      "“我这脑仁儿疼的跟要炸了似的……”瘦弱男子呻吟道。",
      "陈策觉得发现了Bug，开始怀疑自己是不是在做梦？",
      "陈策向前方大声喊道，“司机师傅，我们这是要去哪？”",
      "壮汉勾头一看，接着吃惊的张大了嘴巴，回头大声喊道，“他……他妈的见鬼了，这没人！”",
      "瘦弱男子左右看了看说道，“那咱们怎么下车？”",
      "瘦弱男子也开口道，“我是顾帅，北京人，25岁。”",
      "壮汉愣了愣，冲他点了点头，“谭一峰，山东人，我也是25岁。”",
      "顾帅突然察觉到了什么，左右看了看窗外，不确定的说道，“二位，是我的错觉还是车速正在变快？”",
      "“玩儿呢？小爷藏鞋垫里的100块救命钱都没了？”顾帅震惊道。",
      "谭一峰开口说道，“看来咱们现在没办法联系到外面了，那么就两个选择，要么让车停下，要么我们下车，先下车再弄清楚怎么回事。”",
      "“那个谁……你后面那个人呢？？”",
      "隔着一整个车厢，伴随着快速明暗交替的路灯，最后一排哪还有半个人的影子！"
    ].join("\n\n");

    const story = normalizeGeneratedStoryStateForInput(createDemoProject({ inspiration: "第十三层档案馆" }).storyState, {
      inspiration: "Imported source: 这是……大客车？",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });

    const dialogueLines = story.seedanceScript
      .split("\n")
      .filter((line) => line.startsWith("台词：") && !line.includes("台词：无"));

    expect(story.storyboard.length).toBeGreaterThan(4);
    expect(dialogueLines.length).toBeGreaterThanOrEqual(8);
    expect(story.seedanceScript).toContain("台词：陈策：“司机师傅，我们这是要去哪？”");
    expect(story.seedanceScript).toContain("台词：顾帅：“我是顾帅，北京人，25岁。”");
    expect(story.seedanceScript).toContain("台词：谭一峰：“谭一峰，山东人，我也是25岁。”");
    expect(story.seedanceScript).toContain("台词：顾帅：“玩儿呢？小爷藏鞋垫里的100块救命钱都没了？”");
    expect(story.seedanceScript).toContain("最后一排哪还有半个人的影子");
    expect(story.seedanceScript).not.toContain("台词：陈策：“我是顾帅，北京人，25岁。”");
    expect(story.seedanceScript).not.toContain("动作：陈策经历原文中的关键事件：“我是顾帅，北京人，25岁。”");
    expect(story.seedanceScript).not.toContain("场景：“我是顾帅，北京人，25岁。”");
  });

  it("does not create character models from action phrases and merges self-introduced aliases", () => {
    const sourceText = [
      "陈策发觉自己此刻正斜靠在大客车后门第一排的座椅上。陈策坐直身体，抬眼望去，前方有两道身影分别坐在大客车的前排左右，只是灯光昏暗，看不清楚。",
      "瘦弱男子也开口道，“我是顾帅，北京人，25岁。”",
      "壮汉愣了愣，冲他点了点头，“谭一峰，山东人，我也是25岁。”"
    ].join("\n\n");
    const modelOutput = {
      ...createDemoProject({ inspiration: "这是……大客车？" }).storyState,
      characters: [
        {
          id: "char-bad-1",
          name: "正斜靠",
          role: "误识别人物",
          personality: [],
          appearance: "误识别",
          speakingStyle: "",
          consistencyPrompt: ""
        },
        {
          id: "char-bad-2",
          name: "分别坐",
          role: "误识别人物",
          personality: [],
          appearance: "误识别",
          speakingStyle: "",
          consistencyPrompt: ""
        },
        {
          id: "char-alias-1",
          name: "壮汉",
          role: "临时称谓",
          personality: [],
          appearance: "体型壮硕",
          speakingStyle: "",
          consistencyPrompt: ""
        },
        {
          id: "char-alias-2",
          name: "瘦弱男子",
          role: "临时称谓",
          personality: [],
          appearance: "瘦弱",
          speakingStyle: "",
          consistencyPrompt: ""
        }
      ],
      seedanceScript: ""
    };

    const story = normalizeGeneratedStoryStateForInput(modelOutput, {
      inspiration: "Imported source: 这是……大客车？",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });
    const names = story.characters.map((character) => character.name);

    expect(names).toEqual(expect.arrayContaining(["陈策", "顾帅", "谭一峰"]));
    expect(names).not.toContain("正斜靠");
    expect(names).not.toContain("分别坐");
    expect(names).not.toContain("壮汉");
    expect(names).not.toContain("瘦弱男子");
  });

  it("normalizes trailing narration characters in wuxia names imported from novel text", () => {
    const sourceText = [
      "苏衍嗤笑一声，指尖抚过腰间软剑，衣袂翻飞间已欺身而上：“沈师兄，你我同门三年，竟为一本剑谱反目？”软剑如灵蛇出洞，直刺沈砚心口，寒光映得破庙梁柱泛白。",
      "沈砚侧身避过，素铁剑横削而出，两剑相撞发出刺耳铮鸣，火星溅在他染尘的衣袖上。",
      "他招式狠厉，招招直取要害，苏衍却始终留有余地，软剑缠绕间数次化解致命攻击。缠斗中，沈砚一记旋身剑劈向苏衍左肩，苏衍躲闪不及，肩头被划开一道血口，软剑险些脱手。"
    ].join("\n\n");
    const modelOutput = {
      ...createDemoProject({ inspiration: "破庙同门夺剑谱" }).storyState,
      characters: [
        {
          id: "char-shen-yan",
          name: "沈砚",
          role: "同门师兄",
          personality: [],
          appearance: "素铁剑客",
          speakingStyle: "",
          consistencyPrompt: ""
        },
        {
          id: "char-su-yan-chi",
          name: "苏衍嗤",
          role: "误把动作字并入姓名",
          personality: [],
          appearance: "软剑剑客",
          speakingStyle: "",
          consistencyPrompt: ""
        },
        {
          id: "char-su-yan-que",
          name: "苏衍却",
          role: "误把转折副词并入姓名",
          personality: [],
          appearance: "软剑剑客",
          speakingStyle: "",
          consistencyPrompt: ""
        }
      ],
      seedanceScript: ""
    };

    const story = normalizeGeneratedStoryStateForInput(modelOutput, {
      inspiration: "Imported source: 破庙同门夺剑谱",
      sourceType: "novel",
      sourceText,
      visualStyleId: "ink-wuxia",
      textModel: "kimi-k2.6"
    });
    const names = story.characters.map((character) => character.name);

    expect(names).toEqual(expect.arrayContaining(["沈砚", "苏衍"]));
    expect(names).not.toContain("苏衍嗤");
    expect(names).not.toContain("苏衍却");
    expect(story.seedanceScript).toContain("人物：沈砚，苏衍。");
    expect(story.seedanceScript).not.toContain("人物：沈砚，苏衍嗤，苏衍却");
  });

  it("uses self-introduction as the canonical character name for descriptive labels", () => {
    const sourceText = [
      "高个男人扶住摇晃的车门，压低声音说道，“我叫陆沉，刑警。”",
      "短发女人看向他，快速回答：“我是赵敏，记者，刚才也在车上醒来。”",
      "陆沉和赵敏同时看向车厢深处，灯光忽明忽暗。"
    ].join("\n\n");
    const modelOutput = {
      ...createDemoProject({ inspiration: "深夜大客车" }).storyState,
      characters: [
        {
          id: "char-label-1",
          name: "高个男人",
          role: "临时称谓",
          personality: [],
          appearance: "高个子男性",
          speakingStyle: "",
          consistencyPrompt: ""
        },
        {
          id: "char-label-2",
          name: "短发女人",
          role: "临时称谓",
          personality: [],
          appearance: "短发女性",
          speakingStyle: "",
          consistencyPrompt: ""
        }
      ],
      seedanceScript: ""
    };

    const story = normalizeGeneratedStoryStateForInput(modelOutput, {
      inspiration: "Imported source: 深夜大客车",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });
    const names = story.characters.map((character) => character.name);

    expect(names).toEqual(expect.arrayContaining(["陆沉", "赵敏"]));
    expect(names).not.toContain("高个男人");
    expect(names).not.toContain("短发女人");
  });

  it("rejects source substrings that look like actions or sentence fragments instead of names", () => {
    const sourceText = [
      "林夏猛然回头看向走廊，发现窗外的灯牌正在闪烁。",
      "林夏抬眼望去，前方两道影子分别坐在左右两侧。",
      "周明站起身说道：“别动，先听声音。”"
    ].join("\n\n");
    const modelOutput = {
      ...createDemoProject({ inspiration: "走廊异响" }).storyState,
      characters: [
        {
          id: "char-fragment-1",
          name: "猛然回",
          role: "误识别人物",
          personality: [],
          appearance: "误识别",
          speakingStyle: "",
          consistencyPrompt: ""
        },
        {
          id: "char-fragment-2",
          name: "抬眼望",
          role: "误识别人物",
          personality: [],
          appearance: "误识别",
          speakingStyle: "",
          consistencyPrompt: ""
        },
        {
          id: "char-fragment-3",
          name: "分别坐",
          role: "误识别人物",
          personality: [],
          appearance: "误识别",
          speakingStyle: "",
          consistencyPrompt: ""
        }
      ],
      seedanceScript: ""
    };

    const story = normalizeGeneratedStoryStateForInput(modelOutput, {
      inspiration: "Imported source: 走廊异响",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });
    const names = story.characters.map((character) => character.name);

    expect(names).toEqual(expect.arrayContaining(["林夏", "周明"]));
    expect(names).not.toContain("猛然回");
    expect(names).not.toContain("抬眼望");
    expect(names).not.toContain("分别坐");
  });

  it("derives scene model prompts from text creation as empty environment references", () => {
    const base = createDemoProject().storyState;
    const storyState: StoryState = {
      ...base,
      characters: [
        {
          id: "char-lin-che",
          name: "林彻",
          role: "前刑警",
          personality: ["冷静"],
          appearance: "深灰长风衣",
          speakingStyle: "短句",
          consistencyPrompt: "林彻，35岁中国男性"
        },
        {
          id: "char-bai-jing",
          name: "白井",
          role: "档案馆引路人",
          personality: ["神秘"],
          appearance: "白色制服",
          speakingStyle: "冷淡",
          consistencyPrompt: "白井，神秘馆员"
        }
      ],
      script: [
        {
          id: "scene-archive-hall",
          title: "档案馆大厅",
          location: "第十三层档案馆大厅",
          description: "林彻步入庞大的档案馆大厅，白井从柜架间走出，无数档案柜延伸至看不见的穹顶，冷白灯光照亮悬浮纸页。",
          dialogues: []
        }
      ]
    };

    const [sceneModel] = deriveSceneModelsFromStory(storyState);

    expect(sceneModel.generationPrompt).toContain("S01 档案馆大厅");
    expect(sceneModel.generationPrompt).toContain("空场景");
    expect(sceneModel.generationPrompt).toContain("不要人物");
    expect(sceneModel.generationPrompt).toContain("无数档案柜延伸至看不见的穹顶");
    expect(sceneModel.generationPrompt).toContain("不要偏离项目所选画风");
    expect(sceneModel.generationPrompt).toContain("--ar 9:16");
    expect(sceneModel.generationPrompt).not.toContain("林彻");
    expect(sceneModel.generationPrompt).not.toContain("白井");
  });

  it("derives scene model prompts without leaking novel action or dialogue", () => {
    const base = createDemoProject().storyState;
    const storyState: StoryState = {
      ...base,
      world: {
        ...base.world,
        styleKeywords: ["悬疑国漫", "冷蓝灰", "强线稿", "半写实国漫悬疑风"],
        background: "破庙的残阳被风卷得支离破碎，沈砚握着剑尖斜指地面，苏衍指尖抚过腰间软剑，衣袂翻飞间欺身而上。"
      },
      characters: [
        {
          id: "char-shen-yan",
          name: "沈砚",
          role: "师兄",
          personality: ["狠厉"],
          appearance: "黑衣剑客",
          speakingStyle: "短句",
          consistencyPrompt: "黑色凌乱短发"
        },
        {
          id: "char-su-yan",
          name: "苏衍",
          role: "同门",
          personality: ["克制"],
          appearance: "白衣剑客",
          speakingStyle: "克制",
          consistencyPrompt: "白衣软剑"
        }
      ],
      script: [
        {
          id: "scene-ruined-temple",
          title: "原文推进 1",
          location: "破庙",
          description:
            "破庙的残阳被风卷得支离破碎，沈砚握着剑尖斜指地面，周身气息紧绷，剑穗上的玉珠随着呼吸轻颤，苏衍指尖抚过腰间软剑，衣袂翻飞间已欺身而上：“沈师兄，你我同门三年，竟为一本剑谱反目？”软剑如灵蛇出洞，寒光映得破庙梁柱泛白，素铁剑横削而出，两剑相撞发出刺耳铮鸣，缠斗中，肩头被划开一道血口。",
          dialogues: []
        }
      ]
    };

    const [sceneModel] = deriveSceneModelsFromStory(storyState);

    expect(sceneModel.generationPrompt).toContain("破庙");
    expect(sceneModel.generationPrompt).toContain("悬疑国漫");
    expect(sceneModel.generationPrompt).toContain("冷蓝灰");
    expect(sceneModel.generationPrompt).toContain("空场景");
    expect(sceneModel.generationPrompt).not.toContain("核心设定");
    expect(sceneModel.generationPrompt).not.toContain("中文生成提示词");
    expect(sceneModel.generationPrompt).not.toContain("沈砚");
    expect(sceneModel.generationPrompt).not.toContain("苏衍");
    expect(sceneModel.generationPrompt).not.toContain("沈师兄");
    expect(sceneModel.generationPrompt).not.toContain("软剑如灵蛇");
    expect(sceneModel.generationPrompt).not.toContain("素铁剑横削而出");
    expect(sceneModel.generationPrompt).not.toContain("缠斗中");
    expect(sceneModel.generationPrompt).not.toContain("肩头");
  });

  it("revises Seedance script from a targeted prompt in mock mode", async () => {
    const text = new TextPipelineService(new OpenAITextProvider({ mock: true }));

    const revisedScript = await text.reviseSeedanceScript({
      currentScript: "Seedance 2.0 分镜脚本\n第 1 段 15 秒：雨夜追逃",
      revisionPrompt: "加强第 1 段的悬疑感，减少旁白，增加灯光闪烁。",
      storyContext: "赛博朋克悬疑恋爱短剧"
    });

    expect(revisedScript).toContain("Seedance 2.0 分镜脚本");
    expect(revisedScript).toContain("加强第 1 段的悬疑感");
  });

  it("generates character, scene, and 15 second video jobs in mock mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = await store.save(createDemoProject());
      const service = new MediaPipelineService(store, new SeedanceMediaProvider({ mock: true }));

      const characterProject = await service.generateCharacterImage({
        projectId: project.id,
        characterModelId: project.characterModels[0].id
      });
      expect(characterProject.characterModels[0].candidateImages).toHaveLength(3);
      const firstCharacterBatchIds = characterProject.characterModels[0].candidateImages.map((asset) => asset.id);

      const regeneratedCharacterProject = await service.generateCharacterImage({
        projectId: project.id,
        characterModelId: project.characterModels[0].id
      });
      expect(regeneratedCharacterProject.characterModels[0].candidateImages).toHaveLength(3);
      expect(regeneratedCharacterProject.characterModels[0].candidateImages.map((asset) => asset.id)).not.toEqual(
        firstCharacterBatchIds
      );

      const sceneProject = await service.generateSceneImage({
        projectId: project.id,
        sceneModelId: project.sceneModels[0].id
      });
      expect(sceneProject.sceneModels[0].candidateImages).toHaveLength(3);
      const firstSceneBatchIds = sceneProject.sceneModels[0].candidateImages.map((asset) => asset.id);

      const regeneratedSceneProject = await service.generateSceneImage({
        projectId: project.id,
        sceneModelId: project.sceneModels[0].id
      });
      expect(regeneratedSceneProject.sceneModels[0].candidateImages).toHaveLength(3);
      expect(regeneratedSceneProject.sceneModels[0].candidateImages.map((asset) => asset.id)).not.toEqual(firstSceneBatchIds);

      const readyProject = await store.get(project.id);
      if (!readyProject) throw new Error("Project not found");
      readyProject.characterModels[0].confirmedImageId = regeneratedCharacterProject.characterModels[0].candidateImages[0].id;
      readyProject.characterModels[1].confirmedImageId = regeneratedCharacterProject.characterModels[0].candidateImages[1].id;
      readyProject.sceneModels[0].confirmedImageId = regeneratedSceneProject.sceneModels[0].candidateImages[0].id;
      await store.save(readyProject);

      const videoProject = await service.generateVideo({
        projectId: project.id,
        flowId: project.videoFlows[0].id,
        characterModelIds: [project.characterModels[0].id, project.characterModels[1].id],
        sceneModelIds: [project.sceneModels[0].id],
        prompt: project.videoFlows[0].prompt,
        aspectRatio: "9:16",
        durationSeconds: 15
      });
      const flow = videoProject.videoFlows[0];
      expect(flow.durationSeconds).toBe(15);
      expect(flow.status).toBe("ready");
      expect(flow.videoAssetId).toBeTruthy();
      expect(flow.selectedCharacterModelIds).toEqual([project.characterModels[0].id, project.characterModels[1].id]);
      expect(flow.selectedSceneModelIds).toEqual([project.sceneModels[0].id]);

      const generationJobs = await store.listGenerationJobs(project.id);
      expect(generationJobs).toHaveLength(5);
      expect(generationJobs.map((job) => job.targetType).sort()).toEqual([
        "character",
        "character",
        "scene",
        "scene",
        "video"
      ]);
      expect(generationJobs.every((job) => job.provider === "seedance")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("accepts legacy unnamespaced media ids after project relation ids are namespaced", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-legacy-ids-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const legacyCharacterId = project.characterModels[0].id;
      const legacySceneId = project.sceneModels[0].id;
      const legacyFlowId = project.videoFlows[0].id;
      project.characterModels[0].id = `${project.id}:characterModel:${legacyCharacterId}`;
      project.sceneModels[0].id = `${project.id}:sceneModel:${legacySceneId}`;
      project.videoFlows[0].id = `${project.id}:videoFlow:${legacyFlowId}`;
      const savedProject = await store.save(project);
      const service = new MediaPipelineService(store, new SeedanceMediaProvider({ mock: true }));

      const characterProject = await service.generateCharacterImage({
        projectId: savedProject.id,
        characterModelId: legacyCharacterId
      });
      expect(characterProject.characterModels[0].candidateImages).toHaveLength(3);

      const sceneProject = await service.generateSceneImage({
        projectId: savedProject.id,
        sceneModelId: legacySceneId
      });
      expect(sceneProject.sceneModels[0].candidateImages).toHaveLength(3);

      const readyProject = await store.get(savedProject.id);
      if (!readyProject) throw new Error("Project not found");
      readyProject.characterModels[0].confirmedImageId = characterProject.characterModels[0].candidateImages[0].id;
      readyProject.sceneModels[0].confirmedImageId = sceneProject.sceneModels[0].candidateImages[0].id;
      await store.save(readyProject);

      const videoProject = await service.generateVideo({
        projectId: savedProject.id,
        flowId: legacyFlowId,
        characterModelIds: [legacyCharacterId],
        sceneModelIds: [legacySceneId],
        prompt: savedProject.videoFlows[0].prompt,
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      expect(videoProject.videoFlows[0].status).toBe("ready");
      expect(videoProject.videoFlows[0].selectedCharacterModelIds).toEqual([
        `${project.id}:characterModel:${legacyCharacterId}`
      ]);
      expect(videoProject.videoFlows[0].selectedSceneModelIds).toEqual([`${project.id}:sceneModel:${legacySceneId}`]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("sends scene image generation prompts as no-character environment prompts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-scene-no-character-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      project.characterModels[0].name = "林彻";
      project.characterModels[1].name = "白井";
      project.sceneModels[0].generationPrompt = "旧电梯内部，林彻站在红色 13 层按钮前，白井站在门外。";
      const savedProject = await store.save(project);
      let capturedPrompt = "";
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "mock",
          baseUrl: "mock",
          imageModel: "doubao-seedance-2-0-260128",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateSceneImage: async (input: { prompt: string }) => {
          capturedPrompt = input.prompt;
          return {
            jobId: "scene-job",
            status: "ready" as const,
            assets: [
              {
                id: "asset-scene",
                type: "image" as const,
                url: "https://example.com/scene.png",
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              }
            ]
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      await service.generateSceneImage({
        projectId: savedProject.id,
        sceneModelId: savedProject.sceneModels[0].id
      });

      expect(capturedPrompt).toContain("空场景");
      expect(capturedPrompt).toContain("不得出现人物");
      expect(capturedPrompt).toContain("旧电梯内部");
      expect(capturedPrompt).toContain("--ar 9:16");
      expect(capturedPrompt).not.toContain("林彻");
      expect(capturedPrompt).not.toContain("白井");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("cleans old scene model prompts before sending scene image generation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-scene-old-prompt-clean-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      project.characterModels[0].name = "沈砚";
      project.characterModels[1].name = "苏衍";
      project.sceneModels[0].generationPrompt = [
        "S01 原文推进 1",
        "核心设定",
        "破庙的残阳被风卷得支离破碎，沈砚握着剑尖斜指地面，苏衍指尖抚过腰间软剑，衣袂翻飞间已欺身而上。",
        "",
        "中文生成提示词",
        "破庙，沈砚：“把《青岚诀》交出来，我饶你不死”，苏衍：“沈师兄，你我同门三年，竟为一本剑谱反目？”，软剑如灵蛇出洞，寒光映得破庙梁柱泛白，素铁剑横削而出，两剑相撞发出刺耳铮鸣，缠斗中，肩头被划开一道血口，项目统一画风：悬疑国漫，冷蓝灰，强线稿，空场景，不要人物，--ar 9:16"
      ].join("\n");
      const savedProject = await store.save(project);
      let capturedPrompt = "";
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "mock",
          baseUrl: "mock",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateSceneImage: async (input: { prompt: string }) => {
          capturedPrompt = input.prompt;
          return {
            jobId: "scene-old-prompt-clean-job",
            status: "ready" as const,
            assets: [
              {
                id: "asset-scene-old-prompt-clean",
                type: "image" as const,
                url: "https://example.com/scene-old-prompt-clean.png",
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              }
            ]
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      await service.generateSceneImage({
        projectId: savedProject.id,
        sceneModelId: savedProject.sceneModels[0].id,
        imageAspectRatio: "9:16"
      });

      expect(capturedPrompt).toContain("破庙");
      expect(capturedPrompt).toContain("空场景");
      expect(capturedPrompt).not.toContain("核心设定");
      expect(capturedPrompt).not.toContain("中文生成提示词");
      expect(capturedPrompt).not.toContain("沈砚");
      expect(capturedPrompt).not.toContain("苏衍");
      expect(capturedPrompt).not.toContain("沈师兄");
      expect(capturedPrompt).not.toContain("软剑如灵蛇");
      expect(capturedPrompt).not.toContain("素铁剑横削而出");
      expect(capturedPrompt).not.toContain("缠斗中");
      expect(capturedPrompt).not.toContain("肩头");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("optimizes character, scene, image-prompt, and video prompts before provider generation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-media-prompt-optimizer-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      project.storyState.visualStyleId = "ink-wuxia";
      project.storyState.promptOptimizerModel = "gpt-5.5";
      project.storyState.promptOptimizationEnabled = true;
      project.storyState.sourceReferenceText = "“何必挣扎？”沈砚步步紧逼，剑尖抵住苏衍咽喉。";
      project.storyState.sourceReferenceLabel = "青岚诀节选";
      project.videoFlows[0].selectedCharacterModelIds = [project.characterModels[0].id];
      project.videoFlows[0].selectedSceneModelIds = [project.sceneModels[0].id];
      const savedProject = await store.save(project);
      const optimizerCalls: Array<{
        kind: string;
        prompt: string;
        visualStyleLabel?: string;
        sourceReferenceText?: string;
        textModel?: string;
      }> = [];
      const providerPrompts: string[] = [];
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "mock",
          baseUrl: "mock",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateCharacterImage: async (input: { prompt: string }) => {
          providerPrompts.push(input.prompt);
          return {
            jobId: "optimized-character-job",
            status: "ready" as const,
            assets: [
              {
                id: "asset-optimized-character",
                type: "image" as const,
                url: "https://example.com/character.png",
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              }
            ]
          };
        },
        generateSceneImage: async (input: { prompt: string }) => {
          providerPrompts.push(input.prompt);
          const assetId = providerPrompts.length === 2 ? "asset-optimized-scene" : "asset-optimized-image-prompt";
          return {
            jobId: `${assetId}-job`,
            status: "ready" as const,
            assets: [
              {
                id: assetId,
                type: "image" as const,
                url: `https://example.com/${assetId}.png`,
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              }
            ]
          };
        },
        generateVideo: async (input: { prompt: string }) => {
          providerPrompts.push(input.prompt);
          return {
            jobId: "optimized-video-job",
            status: "generating" as const
          };
        }
      } as unknown as SeedanceMediaProvider;
      const optimizer = {
        optimizeMediaPrompt: async (input: {
          kind: string;
          prompt: string;
          visualStyleLabel?: string;
          sourceReferenceText?: string;
          textModel?: string;
        }) => {
          optimizerCalls.push(input);
          return `OPTIMIZED ${input.kind}: ${input.prompt}`;
        }
      };
      const service = new MediaPipelineService(store, provider, undefined, undefined, optimizer as any);

      await service.generateCharacterImage({
        projectId: savedProject.id,
        characterModelId: savedProject.characterModels[0].id
      });
      await service.generateSceneImage({
        projectId: savedProject.id,
        sceneModelId: savedProject.sceneModels[0].id
      });
      const referenceProject = await store.get(savedProject.id);
      expect(referenceProject).toBeTruthy();
      const characterReferenceId = referenceProject!.characterModels[0].candidateImages[0]?.id;
      const sceneReferenceId = referenceProject!.sceneModels[0].candidateImages[0]?.id;
      expect(characterReferenceId).toBeTruthy();
      expect(sceneReferenceId).toBeTruthy();
      referenceProject!.characterModels[0].confirmedImageId = characterReferenceId;
      referenceProject!.sceneModels[0].confirmedImageId = sceneReferenceId;
      referenceProject!.videoFlows[0].selectedCharacterModelIds = [referenceProject!.characterModels[0].id];
      referenceProject!.videoFlows[0].selectedSceneModelIds = [referenceProject!.sceneModels[0].id];
      await store.save(referenceProject!);
      await service.generateImagePromptImage({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        prompt: savedProject.videoFlows[0].imagePrompt || "当前段落风格参考图"
      });
      const readyProject = await store.get(savedProject.id);
      expect(readyProject).toBeTruthy();
      readyProject!.videoFlows[0].selectedCharacterModelIds = [readyProject!.characterModels[0].id];
      readyProject!.videoFlows[0].selectedSceneModelIds = [readyProject!.sceneModels[0].id];
      await store.save(readyProject!);
      await service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        characterModelIds: [savedProject.characterModels[0].id],
        activeCharacterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: "第 1 段 15 秒视频提示词",
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      expect(optimizerCalls.map((call) => call.kind)).toEqual([
        "characterImage",
        "sceneImage",
        "imagePromptImage",
        "video"
      ]);
      expect(optimizerCalls.every((call) => call.visualStyleLabel === "水墨武侠")).toBe(true);
      expect(optimizerCalls.every((call) => call.textModel === "gpt-5.5")).toBe(true);
      expect(optimizerCalls.every((call) => call.sourceReferenceText?.includes("何必挣扎"))).toBe(true);
      expect(optimizerCalls.every((call) => call.sourceReferenceText?.includes("青岚诀节选"))).toBe(true);
      expect(providerPrompts).toHaveLength(4);
      expect(providerPrompts.every((prompt) => prompt.startsWith("OPTIMIZED "))).toBe(true);
      const jobs = await store.listGenerationJobs(savedProject.id);
      expect(jobs.some((job) => job.requestPayload && JSON.stringify(job.requestPayload).includes("sourcePrompt"))).toBe(true);
      expect(jobs.some((job) => job.requestPayload && JSON.stringify(job.requestPayload).includes("gpt-5.5"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps current segment dialogue when video prompt optimization drops it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-video-dialogue-guard-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const characterAsset = {
        id: "asset-dialogue-character",
        type: "image" as const,
        url: "https://example.com/dialogue-character.png",
        provider: "seedance" as const,
        prompt: "character",
        createdAt: new Date().toISOString()
      };
      const sceneAsset = {
        id: "asset-dialogue-scene",
        type: "image" as const,
        url: "https://example.com/dialogue-scene.png",
        provider: "seedance" as const,
        prompt: "scene",
        createdAt: new Date().toISOString()
      };
      project.assets = [characterAsset, sceneAsset];
      project.characterModels[0].confirmedImageId = characterAsset.id;
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      project.storyState.promptOptimizerModel = "kimi-k2.6";
      const savedProject = await store.save(project);
      let capturedPrompt = "";
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "mock",
          baseUrl: "mock",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateVideo: async (input: { prompt: string }) => {
          capturedPrompt = input.prompt;
          return {
            jobId: "dialogue-guard-video-job",
            status: "generating" as const
          };
        }
      } as unknown as SeedanceMediaProvider;
      const optimizer = {
        optimizeMediaPrompt: async () => "优化后的视频提示词：只保留动作、景别、光影和镜头连续性。"
      };
      const service = new MediaPipelineService(store, provider, undefined, undefined, optimizer as any);

      await service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        characterModelIds: [savedProject.characterModels[0].id],
        activeCharacterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: [
          "第 1 段 15 秒：雨夜芯片出现",
          "分镜 1（0-5 秒）：全景 / 新东京下层区雨夜街道",
          "台词：旁白：“那一晚，我捡到了不该存在的记忆。”",
          "分镜 3（10-15 秒）：中近景 / 黑伞入画",
          "台词：越铭：“把芯片交给我。现在。”"
        ].join("\n"),
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      expect(capturedPrompt).toContain("原始台词锁定");
      expect(capturedPrompt).toContain("台词：旁白：“那一晚，我捡到了不该存在的记忆。”");
      expect(capturedPrompt).toContain("台词：越铭：“把芯片交给我。现在。”");
      const [job] = await store.listGenerationJobs(savedProject.id);
      expect(JSON.stringify(job.requestPayload)).toContain("原始台词锁定");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("falls back to the original media prompt when prompt optimization fails", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-media-prompt-optimizer-fallback-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      project.storyState.promptOptimizerModel = "kimi-k2.6";
      const savedProject = await store.save(project);
      let capturedPrompt = "";
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "mock",
          baseUrl: "mock",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateSceneImage: async (input: { prompt: string }) => {
          capturedPrompt = input.prompt;
          return {
            jobId: "optimizer-fallback-scene-job",
            status: "ready" as const,
            assets: [
              {
                id: "asset-optimizer-fallback-scene",
                type: "image" as const,
                url: "https://example.com/fallback-scene.png",
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              }
            ]
          };
        }
      } as unknown as SeedanceMediaProvider;
      const optimizer = {
        optimizeMediaPrompt: async () => {
          throw new Error("optimizer unavailable");
        }
      };
      const service = new MediaPipelineService(store, provider, undefined, undefined, optimizer as any);

      await service.generateSceneImage({
        projectId: savedProject.id,
        sceneModelId: savedProject.sceneModels[0].id
      });

      expect(capturedPrompt).not.toContain("OPTIMIZED");
      const jobs = await store.listGenerationJobs(savedProject.id);
      expect(JSON.stringify(jobs[0].requestPayload)).toContain("optimizer unavailable");
      expect(JSON.stringify(jobs[0].requestPayload)).toContain("kimi-k2.6");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generates image prompt reference candidates on the video flow prompt node", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-image-prompt-reference-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = await store.save(createDemoProject());
      let capturedPrompt = "";
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "mock",
          baseUrl: "mock",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateSceneImage: async (input: { prompt: string }) => {
          capturedPrompt = input.prompt;
          return {
            jobId: "image-prompt-job",
            status: "ready" as const,
            assets: [
              {
                id: "asset-image-prompt-1",
                type: "image" as const,
                url: "https://example.com/image-prompt-1.png",
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              },
              {
                id: "asset-image-prompt-2",
                type: "image" as const,
                url: "https://example.com/image-prompt-2.png",
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              },
              {
                id: "asset-image-prompt-3",
                type: "image" as const,
                url: "https://example.com/image-prompt-3.png",
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              }
            ]
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      const next = await service.generateImagePromptImage({
        projectId: project.id,
        flowId: project.videoFlows[0].id,
        prompt: "全局统一场景风格，冷蓝灰悬疑国漫，纸张颗粒质感",
        imageAspectRatio: "9:16"
      });

      const promptNode = next.videoFlows[0].nodes.promptNode;
      expect(promptNode.status).toBe("ready");
      expect(promptNode.imageAspectRatio).toBe("9:16");
      expect(promptNode.candidateImages).toHaveLength(3);
      expect(promptNode.confirmedImageId).toBeUndefined();
      expect(next.videoFlows[0].imagePromptImageUrl).toBeUndefined();
      expect(next.videoFlows[0].nodes.videoNode.stale).toBe(true);
      expect(await store.listGenerationJobs(project.id)).toHaveLength(1);
      expect((await store.listGenerationJobs(project.id))[0].targetType).toBe("imagePrompt");
      expect(capturedPrompt).toContain("15 秒片段 Image Prompt");
      expect(capturedPrompt).toContain("本段核心画面");
      expect(capturedPrompt).toContain("连续性");
      expect(capturedPrompt).toContain("只生成当前片段风格参考图");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("strips scene-model story text sections from image prompt reference prompts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-image-prompt-style-clean-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = await store.save(createDemoProject());
      let capturedPrompt = "";
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "mock",
          baseUrl: "mock",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateSceneImage: async (input: { prompt: string }) => {
          capturedPrompt = input.prompt;
          return {
            jobId: "image-prompt-clean-style-job",
            status: "ready" as const,
            assets: [
              {
                id: "asset-image-prompt-clean-style-1",
                type: "image" as const,
                url: "https://example.com/image-prompt-clean-style-1.png",
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              }
            ]
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);
      const pollutedPrompt = [
        "全局统一—场景风格",
        "项目统一场景画风：悬疑国漫，冷蓝灰，强线稿，半写实国漫悬疑风。",
        "",
        "S01 原文推进 1",
        "核心设定",
        "破庙的残阳被风卷得支离破碎，沈砚握着，剑尖斜指地面，苏衍欺身而上。只作为场景模型图和后续视频背景参考，不包含任何人物。",
        "",
        "中文生成提示词",
        "破庙的残阳被风卷得支离破碎，沈砚握着，根据导入小说原文改编，开端：破庙的残阳被风卷得支离破碎，剑尖斜指地面，“把《青岚诀》交出来，我饶你不死”，苏衍：“沈师兄，你我同门三年，竟为一本剑谱反目？”，素铁剑横削而出，两剑相撞发出刺耳铮鸣，缠斗中，肩头被划开一道血口，“何必挣扎”。"
      ].join("\n");

      await service.generateImagePromptImage({
        projectId: project.id,
        flowId: project.videoFlows[0].id,
        prompt: pollutedPrompt,
        imageAspectRatio: "9:16"
      });

      expect(capturedPrompt).toContain("悬疑国漫");
      expect(capturedPrompt).toContain("冷蓝灰");
      expect(capturedPrompt).not.toContain("中文生成提示词");
      expect(capturedPrompt).not.toContain("核心设定");
      expect(capturedPrompt).not.toContain("根据导入小说原文改编");
      expect(capturedPrompt).not.toContain("把《青岚诀》交出来");
      expect(capturedPrompt).not.toContain("沈师兄");
      expect(capturedPrompt).not.toContain("素铁剑横削而出");
      expect(capturedPrompt).not.toContain("缠斗中");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes selected confirmed character model references into image prompt generation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-image-prompt-character-reference-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const characterAsset = {
        id: "asset-character-shenyan",
        type: "image" as const,
        url: "https://example.com/shenyan-character.png",
        provider: "seedance" as const,
        prompt: "沈砚人物模型图，黑色凌乱短发，黑色武侠衣袍",
        createdAt: new Date().toISOString()
      };
      project.characterModels[0] = {
        ...project.characterModels[0],
        name: "沈砚",
        description: "黑衣剑客，冷峻克制",
        consistencyPrompt: "黑色凌乱短发，额前碎发，黑色武侠衣袍，成熟男性比例",
        candidateImages: [characterAsset],
        confirmedImageId: characterAsset.id
      };
      project.videoFlows[0] = {
        ...project.videoFlows[0],
        selectedCharacterModelId: project.characterModels[0].id,
        selectedCharacterModelIds: [project.characterModels[0].id]
      };
      project.assets = [characterAsset];
      const savedProject = await store.save(project);
      let capturedInput: { prompt: string; referenceImageUrls?: string[]; referenceImageNotes?: string[] } | undefined;
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "mock",
          baseUrl: "mock",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateSceneImage: async (input: { prompt: string; referenceImageUrls?: string[]; referenceImageNotes?: string[] }) => {
          capturedInput = input;
          return {
            jobId: "image-prompt-character-ref-job",
            status: "ready" as const,
            assets: [
              {
                id: "asset-image-prompt-character-ref-1",
                type: "image" as const,
                url: "https://example.com/image-prompt-character-ref-1.png",
                provider: "seedance" as const,
                prompt: input.prompt,
                createdAt: new Date().toISOString()
              }
            ]
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      await service.generateImagePromptImage({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        prompt: "破庙残阳，沈砚握剑，水墨武侠风格",
        imageAspectRatio: "9:16"
      });

      expect(capturedInput?.referenceImageUrls).toEqual([characterAsset.url]);
      expect(capturedInput?.referenceImageNotes?.join("\n")).toContain("人物模型图：沈砚");
      expect(capturedInput?.prompt).toContain("人物一致性锁定");
      expect(capturedInput?.prompt).toContain("沈砚");
      expect(capturedInput?.prompt).toContain("黑色凌乱短发");
      expect(capturedInput?.prompt).toContain("不得生成新的未选人物");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("marks the video flow failed when selected references are not confirmed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-missing-confirmed-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = await store.save(createDemoProject());
      const service = new MediaPipelineService(store, new SeedanceMediaProvider({ mock: true }));

      const next = await service.generateVideo({
        projectId: project.id,
        flowId: project.videoFlows[0].id,
        characterModelIds: [project.characterModels[0].id],
        sceneModelIds: [project.sceneModels[0].id],
        prompt: project.videoFlows[0].prompt,
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      expect(next.videoFlows[0].status).toBe("failed");
      expect(next.videoFlows[0].nodes.videoNode.status).toBe("failed");
      expect(next.videoFlows[0].error).toContain("confirmed");
      expect(next.videoFlows[0].error).toContain(project.characterModels[0].name);
      expect(next.videoFlows[0].error).toContain(project.sceneModels[0].name);
      expect(next.videoFlows[0].error).toContain("确认这张");
      expect(await store.listGenerationJobs(project.id)).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("saves the video flow as failed when the provider rejects connected reference images", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-rejected-video-references-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const characterAsset = {
        id: "asset-character-rejected",
        type: "image" as const,
        url: "https://example.com/character.png",
        provider: "seedance" as const,
        prompt: "character",
        createdAt: new Date().toISOString()
      };
      const sceneAsset = {
        id: "asset-scene-rejected",
        type: "image" as const,
        url: "https://example.com/scene.png",
        provider: "seedance" as const,
        prompt: "scene",
        createdAt: new Date().toISOString()
      };
      project.assets = [characterAsset, sceneAsset];
      project.characterModels[0].confirmedImageId = characterAsset.id;
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      const savedProject = await store.save(project);
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "live",
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateVideo: async () => {
          throw new Error("参考图被视频服务安全审核拒绝");
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      await expect(service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        characterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: "当前 15 秒分镜",
        aspectRatio: "9:16",
        durationSeconds: 15,
        generationRequestId: "video-request-rejected"
      })).rejects.toThrow("参考图被视频服务安全审核拒绝");

      const persisted = await store.get(savedProject.id);
      expect(persisted?.videoFlows[0].status).toBe("failed");
      expect(persisted?.videoFlows[0].nodes.videoNode.status).toBe("failed");
      expect(persisted?.videoFlows[0].error).toContain("参考图被视频服务安全审核拒绝");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes named character, scene, and style reference notes into video generation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-video-reference-notes-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      project.characterModels[0].name = "陈策";
      project.characterModels[0].description = "核心主角 / 深夜大客车乘客";
      project.characterModels[0].consistencyPrompt = "25岁中国男性，短黑发，灰色外套，疲惫警觉";
      project.sceneModels[0].name = "深夜大客车车厢";
      project.sceneModels[0].description = "23:51 的昏暗大客车内部，冷蓝灰灯光";
      const characterAsset = {
        id: "asset-character-chen-ce",
        type: "image" as const,
        url: "https://example.com/chen-ce.png",
        provider: "seedance" as const,
        prompt: "character",
        createdAt: new Date().toISOString()
      };
      const sceneAsset = {
        id: "asset-scene-bus",
        type: "image" as const,
        url: "https://example.com/bus.png",
        provider: "seedance" as const,
        prompt: "scene",
        createdAt: new Date().toISOString()
      };
      const styleAsset = {
        id: "asset-style-bus",
        type: "image" as const,
        url: "https://example.com/style.png",
        provider: "seedance" as const,
        prompt: "style",
        createdAt: new Date().toISOString()
      };
      project.assets = [characterAsset, sceneAsset, styleAsset];
      project.characterModels[0].confirmedImageId = characterAsset.id;
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      project.videoFlows[0].nodes.promptNode.confirmedImageId = styleAsset.id;
      project.videoFlows[0].prompt =
        "旧视频请求污染：第 11 段 15 秒，台词：顾帅：“玩儿呢？小爷藏鞋垫里的100块救命钱都没了？”";
      const savedProject = await store.save(project);
      let capturedInput: unknown;
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "live",
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateVideo: async (input: unknown) => {
          capturedInput = input;
          return {
            jobId: "video-reference-notes",
            status: "ready" as const,
            asset: {
              id: "asset-video-reference-notes",
              type: "video" as const,
              url: "https://example.com/video.mp4",
              provider: "seedance",
              prompt: "video",
              jobId: "video-reference-notes",
              createdAt: new Date().toISOString()
            }
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      await service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        characterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: "当前 15 秒分镜",
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      const captured = capturedInput as {
        characterImageUrls?: string[];
        sceneImageUrls?: string[];
        styleReferenceImageUrl?: string;
        referenceImageNotes?: string[];
      };
      expect(captured.characterImageUrls).toEqual([characterAsset.url]);
      expect(captured.sceneImageUrls).toEqual([sceneAsset.url]);
      expect(captured.styleReferenceImageUrl).toBe(styleAsset.url);
      const referenceImageNotes = (capturedInput as { referenceImageNotes?: string[] }).referenceImageNotes || [];
      expect(referenceImageNotes[0]).toContain("人物模型图：陈策");
      expect(referenceImageNotes[0]).toContain("短黑发");
      expect(referenceImageNotes[1]).toContain("场景模型图：深夜大客车车厢");
      expect(referenceImageNotes[2]).toContain("风格参考图");
      expect(referenceImageNotes[2]).not.toContain("第 11 段");
      expect(referenceImageNotes[2]).not.toContain("藏鞋垫");
      expect(referenceImageNotes).toHaveLength(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses the confirmed node images even when they are only stored on candidate nodes", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-confirmed-node-reference-images-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const characterAsset = {
        id: "asset-character-node-only",
        type: "image" as const,
        url: "https://example.com/node-character.png",
        provider: "seedance" as const,
        prompt: "character",
        createdAt: new Date().toISOString()
      };
      const sceneAsset = {
        id: "asset-scene-node-only",
        type: "image" as const,
        url: "https://example.com/node-scene.png",
        provider: "seedance" as const,
        prompt: "scene",
        createdAt: new Date().toISOString()
      };
      const styleAsset = {
        id: "asset-style-node-only",
        type: "image" as const,
        url: "https://example.com/node-style.png",
        provider: "seedance" as const,
        prompt: "style",
        createdAt: new Date().toISOString()
      };
      project.assets = [];
      project.characterModels[0].candidateImages = [characterAsset];
      project.characterModels[0].confirmedImageId = characterAsset.id;
      project.sceneModels[0].candidateImages = [sceneAsset];
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      project.videoFlows[0].nodes.promptNode.candidateImages = [styleAsset];
      project.videoFlows[0].nodes.promptNode.confirmedImageId = styleAsset.id;
      project.videoFlows[0].imagePromptImageUrl = styleAsset.url;
      const savedProject = await store.save(project);
      let capturedInput: unknown;
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "live",
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateVideo: async (input: unknown) => {
          capturedInput = input;
          return {
            jobId: "video-node-reference-images",
            status: "queued" as const
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      const next = await service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        characterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: "当前 15 秒分镜",
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      const captured = capturedInput as {
        characterImageUrls?: string[];
        sceneImageUrls?: string[];
        styleReferenceImageUrl?: string;
      };
      expect(next.videoFlows[0].status).toBe("generating");
      expect(captured.characterImageUrls).toEqual([characterAsset.url]);
      expect(captured.sceneImageUrls).toEqual([sceneAsset.url]);
      expect(captured.styleReferenceImageUrl).toBe(styleAsset.url);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("converts stored local reference images to data URLs for video generation without persisting base64 payloads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-local-video-references-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const localAssetUrl = (assetId: string) => `/api/projects/${project.id}/assets/${assetId}/file`;
      const characterAsset = {
        id: "asset-character-local",
        type: "image" as const,
        url: localAssetUrl("asset-character-local"),
        storageKey: `${project.id}/asset-character-local.jpg`,
        provider: "seedance" as const,
        prompt: "character",
        createdAt: new Date().toISOString()
      };
      const sceneAsset = {
        id: "asset-scene-local",
        type: "image" as const,
        url: localAssetUrl("asset-scene-local"),
        storageKey: `${project.id}/asset-scene-local.jpg`,
        provider: "seedance" as const,
        prompt: "scene",
        createdAt: new Date().toISOString()
      };
      const styleAsset = {
        id: "asset-style-local",
        type: "image" as const,
        url: localAssetUrl("asset-style-local"),
        storageKey: `${project.id}/asset-style-local.jpg`,
        provider: "seedance" as const,
        prompt: "style",
        createdAt: new Date().toISOString()
      };
      project.assets = [characterAsset, sceneAsset, styleAsset];
      project.characterModels[0].confirmedImageId = characterAsset.id;
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      project.videoFlows[0].nodes.promptNode.candidateImages = [styleAsset];
      project.videoFlows[0].nodes.promptNode.confirmedImageId = styleAsset.id;
      const savedProject = await store.save(project);
      const loadedAssetIds: string[] = [];
      const assetStorage = {
        persistAsset: async (_projectId: string, asset: unknown) => asset,
        persistAssets: async (_projectId: string, assets: unknown[]) => assets,
        loadAsset: async (asset: { id: string }) => {
          loadedAssetIds.push(asset.id);
          return {
            body: Buffer.from(`${asset.id}-binary`),
            contentType: "image/jpeg"
          };
        }
      } as any;
      let capturedInput: any;
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "live",
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateVideo: async (input: unknown) => {
          capturedInput = input;
          return {
            jobId: "video-local-reference-images",
            status: "ready" as const,
            asset: {
              id: "asset-video-local-reference-images",
              type: "video" as const,
              url: "https://example.com/video.mp4",
              provider: "seedance",
              prompt: "video",
              jobId: "video-local-reference-images",
              createdAt: new Date().toISOString()
            }
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider, assetStorage);

      await service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        characterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: "当前 15 秒分镜",
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      expect(capturedInput.characterImageUrls[0]).toMatch(/^data:image\/jpeg;base64,/);
      expect(capturedInput.sceneImageUrls[0]).toMatch(/^data:image\/jpeg;base64,/);
      expect(capturedInput.styleReferenceImageUrl).toMatch(/^data:image\/jpeg;base64,/);
      expect(Buffer.from(capturedInput.characterImageUrls[0].split(",")[1], "base64").toString()).toBe(
        "asset-character-local-binary"
      );
      expect(loadedAssetIds).toEqual([characterAsset.id, sceneAsset.id, styleAsset.id]);
      const [job] = await store.listGenerationJobs(savedProject.id);
      expect(JSON.stringify(job.requestPayload)).toContain(characterAsset.url);
      expect(JSON.stringify(job.requestPayload)).not.toContain("data:image");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses the previous ready video tail frame as the next segment first-frame reference", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-continuity-frame-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const characterAsset = {
        id: "asset-character-continuity",
        type: "image" as const,
        url: "https://example.com/character.png",
        provider: "seedance" as const,
        prompt: "character",
        createdAt: new Date().toISOString()
      };
      const sceneAsset = {
        id: "asset-scene-continuity",
        type: "image" as const,
        url: "https://example.com/scene.png",
        provider: "seedance" as const,
        prompt: "scene",
        createdAt: new Date().toISOString()
      };
      const previousVideoAsset = {
        id: "asset-video-segment-1",
        type: "video" as const,
        url: "/api/projects/project-continuity/assets/asset-video-segment-1/file",
        storageKey: "project-continuity/asset-video-segment-1.mp4",
        provider: "seedance" as const,
        prompt: "segment 1 video",
        createdAt: new Date().toISOString()
      };
      project.assets = [characterAsset, sceneAsset, previousVideoAsset];
      project.characterModels[0].confirmedImageId = characterAsset.id;
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      project.videoFlows[0].status = "ready";
      project.videoFlows[0].videoAssetId = previousVideoAsset.id;
      const savedProject = await store.save(project);
      const loadedAssetIds: string[] = [];
      const assetStorage = {
        persistAsset: async (projectId: string, asset: any) => ({
          ...asset,
          storageKey: `${projectId}/${asset.id}.png`,
          url: `/api/projects/${projectId}/assets/${asset.id}/file`
        }),
        persistAssets: async (_projectId: string, assets: unknown[]) => assets,
        loadAsset: async (asset: { id: string; type: string }) => {
          loadedAssetIds.push(asset.id);
          if (asset.type === "video") return { body: Buffer.from("mp4-binary"), contentType: "video/mp4" };
          return { body: Buffer.from("tail-frame-png"), contentType: "image/png" };
        }
      } as any;
      const frameExtractor = {
        extractLastFrame: async () => ({ body: Buffer.from("tail-frame-png"), contentType: "image/png" })
      };
      let capturedInput: any;
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "live",
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateVideo: async (input: unknown) => {
          capturedInput = input;
          return {
            jobId: "video-continuity-frame",
            status: "ready" as const,
            asset: {
              id: "asset-video-segment-2",
              type: "video" as const,
              url: "https://example.com/segment-2.mp4",
              provider: "seedance",
              prompt: "segment 2 video",
              jobId: "video-continuity-frame",
              createdAt: new Date().toISOString()
            }
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider, assetStorage, frameExtractor as any);

      const next = await service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[1].id,
        characterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: "当前 15 秒分镜",
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      expect(capturedInput.firstFrameImageUrl).toMatch(/^data:image\/png;base64,/);
      expect(Buffer.from(capturedInput.firstFrameImageUrl.split(",")[1], "base64").toString()).toBe("tail-frame-png");
      expect(capturedInput.referenceImageNotes[0]).toContain("上一段视频尾帧");
      expect(next.videoFlows[0].lastFrameImageAssetId).toBeTruthy();
      expect(next.videoFlows[1].firstFrameImageAssetId).toBe(next.videoFlows[0].lastFrameImageAssetId);
      expect(loadedAssetIds).toContain(previousVideoAsset.id);
      const [job] = await store.listGenerationJobs(savedProject.id);
      expect(JSON.stringify(job.requestPayload)).toContain(previousVideoAsset.id);
      expect(JSON.stringify(job.requestPayload)).not.toContain("data:image");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses only active segment character references while preserving all selected flow connections", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-active-video-characters-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      project.characterModels[0].name = "陈策";
      project.characterModels[0].description = "核心主角 / 深夜大客车乘客";
      project.characterModels[0].consistencyPrompt = "25岁中国男性，短黑发，灰色外套，疲惫警觉";
      project.characterModels[1].name = "谭一峰";
      project.characterModels[1].description = "壮硕男性 / 车厢前排乘客";
      project.characterModels[1].consistencyPrompt = "25岁中国男性，壮硕体型，短发，黑色外套";
      const chenAsset = {
        id: "asset-character-chen-ce",
        type: "image" as const,
        url: "https://example.com/chen-ce.png",
        provider: "seedance" as const,
        prompt: "character chen",
        createdAt: new Date().toISOString()
      };
      const tanAsset = {
        id: "asset-character-tan-yifeng",
        type: "image" as const,
        url: "https://example.com/tan-yifeng.png",
        provider: "seedance" as const,
        prompt: "character tan",
        createdAt: new Date().toISOString()
      };
      const sceneAsset = {
        id: "asset-scene-bus",
        type: "image" as const,
        url: "https://example.com/bus.png",
        provider: "seedance" as const,
        prompt: "scene",
        createdAt: new Date().toISOString()
      };
      project.assets = [chenAsset, tanAsset, sceneAsset];
      project.characterModels[0].confirmedImageId = chenAsset.id;
      project.characterModels[1].confirmedImageId = tanAsset.id;
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      const savedProject = await store.save(project);
      let capturedInput: any;
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "live",
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateVideo: async (input: unknown) => {
          capturedInput = input;
          return {
            jobId: "video-active-character-filter",
            status: "ready" as const,
            asset: {
              id: "asset-video-active-character-filter",
              type: "video" as const,
              url: "https://example.com/video.mp4",
              provider: "seedance",
              prompt: "video",
              jobId: "video-active-character-filter",
              createdAt: new Date().toISOString()
            }
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      const next = await service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        characterModelIds: [savedProject.characterModels[0].id, savedProject.characterModels[1].id],
        activeCharacterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: "当前 15 秒只出现陈策，谭一峰下一段才出现。",
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      expect(capturedInput.characterImageUrls).toEqual(["https://example.com/chen-ce.png"]);
      expect(capturedInput.referenceImageNotes.join("\n")).toContain("人物模型图：陈策");
      expect(capturedInput.referenceImageNotes.join("\n")).not.toContain("人物模型图：谭一峰");
      expect(next.videoFlows[0].selectedCharacterModelIds).toEqual([
        savedProject.characterModels[0].id,
        savedProject.characterModels[1].id
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not save the full generated video prompt back onto the flow source prompt", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-no-video-prompt-backwrite-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const characterAsset = {
        id: "asset-character-confirmed",
        type: "image" as const,
        url: "https://example.com/character.png",
        provider: "seedance" as const,
        prompt: "character",
        createdAt: new Date().toISOString()
      };
      const sceneAsset = {
        id: "asset-scene-confirmed",
        type: "image" as const,
        url: "https://example.com/scene.png",
        provider: "seedance" as const,
        prompt: "scene",
        createdAt: new Date().toISOString()
      };
      project.assets = [characterAsset, sceneAsset];
      project.characterModels[0].confirmedImageId = characterAsset.id;
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      project.videoFlows[0].prompt = "干净的当前片段画面描述";
      const savedProject = await store.save(project);
      const service = new MediaPipelineService(store, new SeedanceMediaProvider({ mock: true }));

      const next = await service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        characterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: "完整视频请求：当前 15 秒唯一剧情脚本。第 11 段 15 秒：不应回写到 flow.prompt。",
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      expect(next.videoFlows[0].prompt).toBe("干净的当前片段画面描述");
      expect(next.videoFlows[0].prompt).not.toContain("第 11 段");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("syncs a pending video job into the video flow when Ark returns the final asset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-video-refresh-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const characterAsset = {
        id: "asset-character-confirmed",
        type: "image" as const,
        url: "https://example.com/character.png",
        provider: "seedance" as const,
        prompt: "character",
        createdAt: new Date().toISOString()
      };
      const sceneAsset = {
        id: "asset-scene-confirmed",
        type: "image" as const,
        url: "https://example.com/scene.png",
        provider: "seedance" as const,
        prompt: "scene",
        createdAt: new Date().toISOString()
      };
      project.assets = [characterAsset, sceneAsset];
      project.characterModels[0].confirmedImageId = characterAsset.id;
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      const savedProject = await store.save(project);
      const videoAsset = {
        id: "asset-video-final",
        type: "video" as const,
        url: "https://example.com/final.mp4",
        provider: "seedance",
        prompt: "video",
        jobId: "video-job-1",
        createdAt: new Date().toISOString()
      };
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "live",
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateVideo: async () => ({
          jobId: "video-job-1",
          status: "generating" as const,
          error: "Ark video task is still running"
        }),
        getJob: async () => ({
          jobId: "video-job-1",
          status: "ready" as const,
          asset: videoAsset
        })
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      const generatingProject = await service.generateVideo({
        projectId: savedProject.id,
        flowId: savedProject.videoFlows[0].id,
        characterModelIds: [savedProject.characterModels[0].id],
        sceneModelIds: [savedProject.sceneModels[0].id],
        prompt: savedProject.videoFlows[0].prompt,
        aspectRatio: "9:16",
        durationSeconds: 15
      });
      expect(generatingProject.videoFlows[0].status).toBe("generating");
      expect(generatingProject.videoFlows[0].pendingVideoJobId).toBe("video-job-1");

      const liveJob = await service.getJob("video-job-1");
      const refreshedProject = await store.get(savedProject.id);

      expect(liveJob.status).toBe("ready");
      expect(refreshedProject?.videoFlows[0].status).toBe("ready");
      expect(refreshedProject?.videoFlows[0].pendingVideoJobId).toBeUndefined();
      expect(refreshedProject?.videoFlows[0].videoAssetId).toBe(videoAsset.id);
      expect(refreshedProject?.assets.some((asset) => asset.id === videoAsset.id)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refreshes pending video jobs for a project without requiring the browser poller", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-pipeline-video-refresh-project-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      project.videoFlows[1].status = "generating";
      project.videoFlows[1].pendingVideoJobId = "video-job-2";
      project.videoFlows[1].nodes.videoNode.status = "generating";
      const savedProject = await store.save(project);
      await store.saveGenerationJob({
        id: "video-job-2",
        projectId: savedProject.id,
        targetType: "video",
        targetId: savedProject.videoFlows[1].id,
        provider: "seedance",
        model: "doubao-seedance-2-0-260128",
        status: "generating",
        requestPayload: { prompt: "segment 2" },
        resultPayload: { jobId: "video-job-2", status: "generating" }
      });
      const videoAsset = {
        id: "asset-video-2",
        type: "video" as const,
        url: "https://example.com/segment-2.mp4",
        provider: "seedance",
        prompt: "segment 2",
        jobId: "video-job-2",
        createdAt: new Date().toISOString()
      };
      let statusChecks = 0;
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "live",
          baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          imageModel: "doubao-seedream-4-0-250828",
          videoModel: "doubao-seedance-2-0-260128",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        getJob: async () => {
          statusChecks += 1;
          return {
            jobId: "video-job-2",
            status: "ready" as const,
            asset: videoAsset
          };
        }
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider);

      const refreshedProject = await service.refreshPendingVideoJobs(savedProject.id);

      expect(statusChecks).toBe(1);
      expect(refreshedProject.videoFlows[1].status).toBe("ready");
      expect(refreshedProject.videoFlows[1].pendingVideoJobId).toBeUndefined();
      expect(refreshedProject.videoFlows[1].videoAssetId).toBe(videoAsset.id);
      expect(refreshedProject.assets.some((asset) => asset.id === videoAsset.id)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("downloads a project media asset through a local project route", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-project-asset-download-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      project.assets = [
        {
          id: "asset-download-image",
          type: "image",
          url: "https://example.com/generated.png",
          provider: "seedance",
          prompt: "download test",
          jobId: "job-download-image",
          createdAt: new Date().toISOString()
        }
      ];
      await store.save(project);
      const app = express();
      app.use("/api/projects", createProjectRouter(store));
      const server = app.listen(0);
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () =>
        new Response("image-bytes", {
          status: 200,
          headers: { "content-type": "image/png" }
        })) as typeof fetch;

      try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not start");
        const response = await originalFetch(
          `http://127.0.0.1:${address.port}/api/projects/${project.id}/assets/asset-download-image/download`
        );

        expect(response.ok).toBe(true);
        expect(response.headers.get("content-type")).toContain("image/png");
        expect(response.headers.get("content-disposition")).toContain("attachment");
        expect(await response.text()).toBe("image-bytes");
      } finally {
        globalThis.fetch = originalFetch;
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refreshes character and scene model prompts when text creation is regenerated", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-text-route-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const previousProject = createDemoProject();
      previousProject.storyState.seedanceScript = "旧分镜脚本：上一轮幽灵内容，不应进入下一次生成。";
      const project = await store.save(previousProject);
      const storyState = createDemoProject().storyState;
      const regeneratedStory: StoryState = {
        ...storyState,
        world: {
          ...storyState.world,
          title: "第十三层档案馆",
          background: "旧警局档案楼里出现不存在的第十三层。"
        },
        characters: [
          {
            id: "char-lin-che",
            name: "林彻",
            role: "前刑警",
            personality: ["冷静", "危险", "执拗"],
            appearance: "35 岁中国男性，深灰长风衣，黑色内搭，中短分层黑发。",
            speakingStyle: "短句，压低声音，先观察再回应。",
            consistencyPrompt: "林彻，35岁中国男性，前刑警，深灰长风衣，黑色内搭，中短分层黑发，冷静危险眼神"
          }
        ],
        script: [
          {
            id: "scene-elevator",
            title: "电梯异常",
            location: "旧警局档案楼电梯",
            description: "旧电梯冷光闪烁，隐藏的红色 13 层按钮慢慢亮起。",
            dialogues: []
          }
        ],
        storyboard: [
          {
            id: "shot-elevator",
            sceneId: "scene-elevator",
            order: 1,
            shotType: "近景",
            cameraMovement: "缓慢推近按钮面板",
            composition: "红色 13 按钮占据画面中心",
            characterActions: "林彻抬头看向跳动的楼层显示",
            expression: "警觉",
            background: "旧警局档案楼电梯",
            imagePrompt: "旧电梯内部，红色13层按钮亮起，冷蓝灰悬疑国漫风",
            videoPrompt: "15秒，旧电梯冷光闪烁，红色13层按钮亮起，林彻警觉抬头"
          }
        ],
        visualPrompts: [
          {
            id: "prompt-elevator",
            shotId: "shot-elevator",
            imagePrompt: "旧电梯内部，红色13层按钮亮起，冷蓝灰悬疑国漫风",
            videoPrompt: "15秒，旧电梯冷光闪烁，红色13层按钮亮起，林彻警觉抬头"
          }
        ],
        seedanceScript: `《第十三层档案馆》E01《电梯异常》Seedance 2.0 分镜脚本
用途：适配即梦 / Seedance 2.0 视频模型，直接用于分段生成视频。
格式：每段 15 秒，每段至少 3 个分镜，统一标注起止秒数。

整体统一设定
画风：冷蓝灰悬疑国漫风。
人物：林彻，35 岁中国男性，前刑警，深灰长风衣。

第 1 段 15 秒：电梯异常
分镜 1（0-5 秒）：近景 / 红色 13 层按钮亮起
景别：近景。
运镜：缓慢推近按钮面板。
动作：林彻抬头看向跳动的楼层显示。
台词：无。
场景：旧警局档案楼电梯。`
      };
      let capturedGenerateInput: unknown;
      const fakeText = {
        status: () => ({ provider: "openai", mode: "mock", model: "fake" }),
        generateStory: async (input: unknown) => {
          capturedGenerateInput = input;
          return regeneratedStory;
        },
        regenerateSection: async () => ({}),
        reviseSeedanceScript: async () => regeneratedStory.seedanceScript
      } as unknown as TextPipelineService;
      const app = express();
      app.use(express.json());
      app.use("/api/text", createTextRouter(store, fakeText));
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not start");
        const response = await fetch(`http://127.0.0.1:${address.port}/api/text/generate-story`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: project.id, inspiration: "第十三层档案馆" })
        });
        expect(response.ok).toBe(true);
        const updated = await response.json();
        expect(JSON.stringify(capturedGenerateInput)).not.toContain("上一轮幽灵内容");
        expect(updated.storyState.seedanceScript).toBe(regeneratedStory.seedanceScript);
        expect(updated.storyState.seedanceScript).not.toContain("上一轮幽灵内容");
        expect(updated.title).toBe("第十三层档案馆");
        expect(updated.characterModels).toHaveLength(1);
        expect(updated.characterModels[0].name).toBe("林彻");
        expect(updated.characterModels[0].consistencyPrompt).toContain("角色 1：林彻");
        expect(updated.characterModels[0].consistencyPrompt).toContain("定位：前刑警。");
        expect(updated.characterModels[0].consistencyPrompt).toContain("中文提示词");
        expect(updated.characterModels[0].consistencyPrompt).toContain("前刑警");
        expect(updated.characterModels[0].consistencyPrompt).toContain("角色定妆图");
        expect(updated.characterModels[0].consistencyPrompt).toContain("人物三视图");
        expect(updated.characterModels[0].consistencyPrompt).toContain("正面、侧面、背面");
        expect(updated.characterModels[0].consistencyPrompt).toContain("高质量角色设定图");
        expect(updated.characterModels[0].consistencyPrompt).toContain("不要偏离项目所选画风");
        expect(updated.characterModels[0].consistencyPrompt).toContain("--ar 2:3");
        expect(updated.characterModels[0].candidateImages).toEqual([]);
        expect(updated.sceneModels).toHaveLength(1);
        expect(updated.sceneModels[0].name).toBe("电梯异常");
        expect(updated.sceneModels[0].generationPrompt).toContain("红色 13 层按钮");
        expect(updated.videoFlows).toHaveLength(1);
        expect(updated.videoFlows[0].prompt).toBe(regeneratedStory.storyboard[0].videoPrompt);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("imports long-form source text and generates the downstream comic project structure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-source-import-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = await store.save(createDemoProject());
      const storyState = createDemoProject({ inspiration: "不存在楼层档案馆小说原文" }).storyState;
      let capturedInput: any;
      const fakeText = {
        status: () => ({ provider: "openai", mode: "mock", model: "fake" }),
        generateStory: async (input: any) => {
          capturedInput = input;
          return storyState;
        },
        regenerateSection: async () => ({}),
        reviseSeedanceScript: async () => storyState.seedanceScript
      } as unknown as TextPipelineService;
      const app = express();
      app.use(express.json({ limit: "10mb" }));
      app.use("/api/text", createTextRouter(store, fakeText));
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not start");
        const response = await fetch(`http://127.0.0.1:${address.port}/api/text/import-source`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            sourceText:
              "（作者亲了你一口并给出一个提示：初始考验在大客车，很快就能出去啦。么么哒！）\n\n林彻在旧警局电梯里看到不存在的第十三层。门打开后，他走进一座被照片和纸页占满的档案馆。"
          })
        });
        expect(response.ok).toBe(true);
        const updated = await response.json();
        expect(capturedInput.sourceType).toBe("novel");
        expect(capturedInput.sourceText).toContain("不存在的第十三层");
        expect(capturedInput.sourceText).not.toContain("作者亲了你一口");
        expect(capturedInput.sourceText).not.toContain("么么哒");
        expect(capturedInput.inspiration).toContain("文档/小说导入");
        expect(capturedInput.inspiration).not.toContain("作者亲了你一口");
        expect(updated.title).toBe(storyState.world.title);
        expect(updated.status).toBe("text-ready");
        expect(updated.storyState.seedanceScript).toContain("Seedance 2.0");
        expect(updated.characterModels.length).toBeGreaterThan(0);
        expect(updated.sceneModels.length).toBeGreaterThan(0);
        expect(updated.videoFlows.length).toBeGreaterThan(0);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
