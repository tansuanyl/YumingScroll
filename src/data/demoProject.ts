import type { Project, StoryState } from "../types/domain";
import { isLikelyOriginalProseFragment, sanitizeVisualStyleKeywords } from "../lib/promptTextCleanup";

const now = () => new Date().toISOString();

export function createDemoProject(overrides: Partial<Project> = {}): Project {
  const createdAt = now();
  const inspiration = overrides.inspiration || "赛博朋克背景下的悬疑恋爱漫剧";

  const project: Project = {
    id: overrides.id || `project-${Date.now()}`,
    title: overrides.title || "霓虹雨夜的芯片恋人",
    inspiration,
    status: overrides.status || "draft",
    storyState: {
      world: {
        title: "雨幕新东京",
        background:
          "近未来都市被企业网络和地下黑市共同控制，失忆少女在雨夜捡到一枚储存禁忌记忆的破损芯片。",
        rules: ["记忆可以被交易", "企业 AI 会追踪非法芯片", "夜城下层区存在反监控盲点"],
        factions: ["星环财团", "下层区修理师联盟", "记忆走私者"],
        timeline: ["芯片失窃", "女主捡到芯片", "男主奉命回收", "二人发现共同记忆"],
        styleKeywords: ["赛博朋克", "雨夜", "霓虹", "悬疑恋爱", "电影感"]
      },
      characters: [
        {
          id: "char-lin",
          name: "林澈",
          role: "女主角 / 失忆数据修复师",
          personality: ["冷静", "敏感", "防备心强"],
          appearance: "银灰短发，透明雨衣，耳后有蓝色接口纹路，常拿一枚破损芯片。",
          speakingStyle: "句子短，语气克制，情绪激动时会突然沉默。",
          consistencyPrompt:
            "silver short hair, translucent raincoat, blue interface mark behind ear, cyberpunk heroine, calm guarded expression"
        },
        {
          id: "char-yue",
          name: "越铭",
          role: "男主角 / 企业追踪员",
          personality: ["冷淡", "矛盾", "保护欲强"],
          appearance: "黑发，长风衣，黑伞，左眼有微弱机械虹膜光。",
          speakingStyle: "礼貌但疏离，常用命令式短句掩盖关心。",
          consistencyPrompt:
            "black hair, long dark coat, black umbrella, subtle mechanical iris glow, cyberpunk male lead, restrained"
        }
      ],
      outline:
        "林澈在雨夜捡到一枚破损芯片，越铭奉命回收。二人在追逃中发现芯片里藏着被企业删除的共同过去。",
      script: [
        {
          id: "scene-1",
          title: "雨夜街头",
          location: "新东京下层区",
          description: "霓虹灯在积水中碎裂成光斑，林澈握着芯片站在街边。",
          dialogues: [
            { character: "林澈", line: "如果这不是我的记忆，为什么它会让我心痛？", emotion: "困惑" },
            { character: "越铭", line: "把芯片交给我。现在。", emotion: "压抑" }
          ]
        }
      ],
      storyboard: [
        {
          id: "shot-1",
          sceneId: "scene-1",
          order: 1,
          shotType: "远景",
          cameraMovement: "缓慢推进",
          composition: "雨夜街道中央，女主背影在霓虹倒影中显得孤独。",
          characterActions: "林澈低头看向掌心芯片。",
          expression: "紧张，不安",
          background: "新东京下层区霓虹街道，暴雨，水坑反光",
          dialogue: "那一晚，我捡到了改变命运的芯片。",
          imagePrompt:
            "wide shot, rainy cyberpunk lower city street, neon reflections in puddles, young woman holding broken glowing chip, cinematic manga panel",
          videoPrompt:
            "15 second cinematic cyberpunk shot, slow push-in through rain toward heroine holding a broken glowing chip, neon reflections, suspenseful romance mood"
        },
        {
          id: "shot-2",
          sceneId: "scene-1",
          order: 2,
          shotType: "中近景",
          cameraMovement: "横移到男主入画",
          composition: "黑伞从画面右侧切入，男主站在雨幕边缘。",
          characterActions: "越铭抬眼看向林澈。",
          expression: "冷淡，压抑",
          background: "雨幕与广告屏光影",
          dialogue: "把芯片交给我。现在。",
          imagePrompt:
            "medium close shot, cyberpunk man with black umbrella enters rainy neon street, mechanical iris glow, tense manga drama",
          videoPrompt:
            "15 second lateral camera move, black umbrella enters frame, male lead raises his eyes under neon rain, tense restrained emotion"
        }
      ],
      visualPrompts: [
        {
          id: "prompt-1",
          shotId: "shot-1",
          imagePrompt:
            "wide shot, rainy cyberpunk lower city street, neon reflections in puddles, young woman holding broken glowing chip, cinematic manga panel",
          videoPrompt:
            "15 second cinematic cyberpunk shot, slow push-in through rain toward heroine holding a broken glowing chip, neon reflections, suspenseful romance mood"
        },
        {
          id: "prompt-2",
          shotId: "shot-2",
          imagePrompt:
            "medium close shot, cyberpunk man with black umbrella enters rainy neon street, mechanical iris glow, tense manga drama",
          videoPrompt:
            "15 second lateral camera move, black umbrella enters frame, male lead raises his eyes under neon rain, tense restrained emotion"
        }
      ],
      seedanceScript: `《霓虹雨夜的芯片恋人》E01《雨夜芯片》Seedance 2.0 分镜脚本
用途：适配即梦 / Seedance 2.0 视频模型，直接用于分段生成视频。
格式：每段 15 秒，每段至少 3 个分镜，统一标注起止秒数。
成片类型：2D 半写实国漫悬疑恋爱短剧。

整体统一设定
画风：半写实国漫悬疑风，强黑色线稿，成熟人物比例，冷蓝灰色调，纸张颗粒质感，漫画分层阴影。
色调：低饱和冷蓝灰，霓虹蓝紫和芯片微光作为强调色。
运镜：短剧感，平稳流畅，多用推镜、跟拍、特写切换、灯光闪烁。
人物：林澈，失忆数据修复师，银灰短发，透明雨衣，眼神冷静防备。越铭，企业追踪员，黑发长风衣，黑伞，左眼有机械虹膜光。
禁忌：不要真人照片风，不要 3D，不要血腥，不要过度二次元幼态，不要让角色频繁换脸。

第 1 段 15 秒：雨夜芯片出现
分镜 1（0-5 秒）：全景 / 新东京下层区雨夜街道
景别：全景。
运镜：镜头从积水地面缓慢抬起，推向站在街边的林澈。
主角：林澈。
动作：林澈低头看着掌心破损芯片，雨水沿透明雨衣滑落。
台词：旁白：“那一晚，我捡到了不该存在的记忆。”
音效：雨声，远处广告屏电流声。
光影：冷蓝灰雨夜，霓虹倒影在水坑里碎裂。
场景：新东京下层区霓虹街道。

分镜 2（5-10 秒）：特写 / 破损芯片亮起
景别：特写。
运镜：缓慢推近林澈掌心。
主角：林澈的手，破损芯片。
动作：芯片裂缝里透出微弱蓝光，像心跳一样闪烁。
台词：无。
音效：细微电子脉冲声。
光影：芯片蓝光映在手指和雨滴上。
场景：雨夜街边。

分镜 3（10-15 秒）：中近景 / 黑伞入画
景别：中近景。
运镜：镜头从芯片横移到右侧，黑伞切入画面。
主角：越铭，林澈。
动作：越铭撑伞站在雨幕边缘，抬眼看向林澈。
台词：越铭：“把芯片交给我。现在。”
音效：雨声压低，脚步声靠近。
光影：黑伞遮住半张脸，机械虹膜有微弱光。
场景：霓虹广告屏下的雨夜街道。

第 2 段 15 秒：追踪者靠近
分镜 1（0-5 秒）：中景 / 林澈后退
景别：中景。
运镜：跟拍林澈向后退半步。
主角：林澈，越铭。
动作：林澈把芯片握紧，越铭没有逼近，只停在雨幕里。
台词：林澈：“你是谁？”
音效：雨滴打在伞面上，低频城市噪音。
光影：冷蓝灰光下两人被霓虹分割成明暗两侧。
场景：下层区街道。

分镜 2（5-10 秒）：近景 / 越铭眼睛
景别：近景。
运镜：快速切到越铭左眼，微微推近。
主角：越铭。
动作：机械虹膜扫描芯片蓝光，眼神克制。
台词：越铭：“它会害死你。”
音效：扫描提示音，电流声。
光影：左眼机械光短暂闪烁。
场景：雨幕背景虚化。

分镜 3（10-15 秒）：大全景 / 追踪无人机出现
景别：大全景。
运镜：镜头拉远，展示两人上方广告屏后飞出无人机。
主角：林澈，越铭，追踪无人机。
动作：无人机红点锁定林澈，越铭突然伸手挡住她。
台词：越铭：“跑。”
音效：无人机启动声，警报短促响起。
光影：红色锁定光扫过雨夜。
场景：新东京下层区霓虹街道。`
    },
    characterModels: [
      {
        id: "model-char-lin",
        characterId: "char-lin",
        name: "林澈",
        description: "女主角主模型图",
        consistencyPrompt:
          "silver short hair, translucent raincoat, blue interface mark behind ear, cyberpunk heroine, calm guarded expression",
        imageAspectRatio: "3:4",
        candidateImages: [],
        status: "idle"
      },
      {
        id: "model-char-yue",
        characterId: "char-yue",
        name: "越铭",
        description: "男主角主模型图",
        consistencyPrompt:
          "black hair, long dark coat, black umbrella, subtle mechanical iris glow, cyberpunk male lead, restrained",
        imageAspectRatio: "3:4",
        candidateImages: [],
        status: "idle"
      }
    ],
    sceneModels: [
      {
        id: "scene-model-rain-street",
        name: "雨夜街头",
        description: "新东京下层区霓虹雨夜街道，水坑反射广告屏和车灯。",
        visualKeywords: ["雨夜", "霓虹", "水坑反光", "下层区", "赛博朋克"],
        generationPrompt:
          "新东京下层区霓虹雨夜街道，暴雨，湿润路面和水坑反光，远处广告屏发出蓝紫光，电影感赛博朋克场景模型图，适合作为视频背景参考",
        imageAspectRatio: "16:9",
        candidateImages: [],
        status: "idle"
      }
    ],
    videoFlows: [
      {
        id: "flow-shot-1",
        shotId: "shot-1",
        nodes: {
          characterNode: { id: "node-character-1", type: "character", status: "idle" },
          sceneNode: { id: "node-scene-1", type: "scene", status: "idle" },
          promptNode: { id: "node-prompt-1", type: "prompt", status: "ready" },
          videoNode: { id: "node-video-1", type: "video", status: "idle" },
          previewNode: { id: "node-preview-1", type: "preview", status: "idle" }
        },
        prompt:
          "15 second cinematic cyberpunk shot, slow push-in through rain toward heroine holding a broken glowing chip, neon reflections, suspenseful romance mood",
        selectedCharacterModelIds: [],
        selectedSceneModelIds: [],
        imagePrompt:
          "wide shot, rainy cyberpunk lower city street, neon reflections in puddles, young woman holding broken glowing chip, cinematic manga panel",
        actionDescription: "林澈低头看向掌心芯片，雨水顺着透明雨衣滑落。",
        emotion: "孤独，紧张，命运感",
        cameraMovement: "缓慢推进",
        durationSeconds: 15,
        aspectRatio: "9:16",
        status: "idle"
      },
      {
        id: "flow-shot-2",
        shotId: "shot-2",
        nodes: {
          characterNode: { id: "node-character-2", type: "character", status: "idle" },
          sceneNode: { id: "node-scene-2", type: "scene", status: "idle" },
          promptNode: { id: "node-prompt-2", type: "prompt", status: "ready" },
          videoNode: { id: "node-video-2", type: "video", status: "idle" },
          previewNode: { id: "node-preview-2", type: "preview", status: "idle" }
        },
        prompt:
          "15 second lateral camera move, black umbrella enters frame, male lead raises his eyes under neon rain, tense restrained emotion",
        selectedCharacterModelIds: [],
        selectedSceneModelIds: [],
        imagePrompt:
          "medium close shot, cyberpunk man with black umbrella enters rainy neon street, mechanical iris glow, tense manga drama",
        actionDescription: "越铭撑着黑伞从雨幕边缘入画，抬眼看向林澈。",
        emotion: "冷淡，压抑，危险的关心",
        cameraMovement: "横移到男主入画",
        durationSeconds: 15,
        aspectRatio: "9:16",
        status: "idle"
      }
    ],
    workflowEdges: [],
    assets: [],
    createdAt,
    updatedAt: createdAt
  };

  return {
    ...project,
    ...overrides,
    storyState: overrides.storyState || project.storyState,
    characterModels: overrides.characterModels || project.characterModels,
    sceneModels: overrides.sceneModels || deriveSceneModelsFromStory(overrides.storyState || project.storyState),
    videoFlows: overrides.videoFlows || project.videoFlows,
    workflowEdges: overrides.workflowEdges || project.workflowEdges,
    assets: overrides.assets || project.assets
  };
}

export function deriveCharacterModelsFromStory(storyState: StoryState): Project["characterModels"] {
  return storyState.characters.map((character, index) => ({
    id: `model-character-${slug(character.id || character.name || String(index + 1), index)}`,
    characterId: character.id,
    name: character.name,
    description: `${character.role}：${character.appearance}`,
    consistencyPrompt: formatCharacterModelPrompt(storyState, index),
    imageAspectRatio: "3:4",
    candidateImages: [],
    status: "idle"
  }));
}

export function formatCharacterModelPrompt(storyState: StoryState, index: number): string {
  const character = storyState.characters[index];
  if (!character) return "";
  const identityHints = inferCharacterIdentityHints(storyState, index);
  const identityText = identityHints.join("，");
  const role = sanitizeCharacterModelPromptText(character.role, { allowNonVisual: true, maxFragments: 4 });
  const personalityText = sanitizeCharacterModelPromptText(character.personality.join("，"), { allowNonVisual: true, maxFragments: 8 });
  const appearance = sanitizeCharacterModelPromptText(character.appearance, { maxFragments: 8 });
  const consistencyPrompt = sanitizeCharacterModelPromptText(character.consistencyPrompt, { maxFragments: 8 });
  const position = [
    role,
    identityText,
    personalityText,
    appearance,
    consistencyPrompt
  ]
    .filter(Boolean)
    .join("。");
  const worldStyle = storyState.world.styleKeywords.length > 0 ? storyState.world.styleKeywords.join("，") : "现代都市悬疑";
  const chinesePrompt = [
    character.name,
    identityText,
    role,
    appearance,
    personalityText,
    consistencyPrompt,
    "双手自然下垂，不拿任何东西",
    "角色定妆图",
    "同一角色人物三视图设定表",
    "同一张图片内横向排列正面、侧面、背面三个全身视图",
    "完整全身角色设定图，从头到脚完整入画，不裁切",
    "纯白或浅灰干净背景，无遮挡无场景道具",
    `项目统一画风：${worldStyle}`,
    "成熟人物比例",
    "高质量角色设定图",
    "清晰展示脸型、五官比例、发型、体型、服装和配色",
    "不要偏离项目所选画风",
    "不要换脸，不要低质量畸变，不要多余人物，不要可读文字，不要logo，不要水印",
    "--ar 2:3"
  ]
    .filter(Boolean)
    .join("，");

  return [`角色 ${index + 1}：${character.name}`, `定位：${position}`, "", "中文提示词", chinesePrompt].join("\n");
}

const CHARACTER_MODEL_VISUAL_TERMS =
  /(?:男性|女性|男主|女主|少年|少女|青年|中年|老人|年龄|岁|脸|脸型|五官|眼|眉|鼻|唇|牙|皮肤|肤色|头发|发型|短发|长发|黑发|白发|银发|发色|身材|体型|身高|高大|瘦|壮|胖|比例|肩|手|腿|疤|痣|胡|眼镜|服|衣|外套|衬衫|马甲|裙|裤|鞋|帽|雨衣|制服|校服|工装|配色|色调|轮廓|线稿|气质|神情|眼神|表情|姿态|站姿|角色|主角|妹妹|姐姐|哥哥|弟弟)/;

const IMPORTED_SOURCE_PROSE_MARKERS =
  /(?:看看|看着|望着|盯着|听见|听到|想到|开始|保持着|反正|不如|打发时间|聊聊天|十几个小时|几个小时|女孩儿|美女|特有的柔美|不错嘛|所选画风的角色设定|说道|说着|问道|回答|喊道|笑道|低声说|压低声音|台词|对白|原文|章节|作者)/;

function sanitizeCharacterModelPromptText(
  value: string | undefined,
  options: { allowNonVisual?: boolean; maxFragments?: number } = {}
): string {
  const fragments = splitCharacterModelPromptFragments(value)
    .map((fragment) => normalizeCharacterModelPromptFragment(fragment, { stripLeadingLabel: true }))
    .filter(Boolean)
    .filter((fragment) => !looksLikeImportedSourceProse(fragment))
    .filter((fragment) => options.allowNonVisual || CHARACTER_MODEL_VISUAL_TERMS.test(fragment))
    .slice(0, options.maxFragments ?? 8);

  return uniqueText(fragments).join("，");
}

function splitCharacterModelPromptFragments(value: string | undefined): string[] {
  return (value || "")
    .replace(/\r?\n+/g, "，")
    .split(/[，,。；;！!？?]+/)
    .map((fragment) => fragment.trim());
}

function normalizeCharacterModelPromptFragment(fragment: string, options: { stripLeadingLabel?: boolean } = {}): string {
  const withoutLabel = options.stripLeadingLabel === false ? fragment : fragment.replace(/^[\u4e00-\u9fa5A-Za-z0-9_-]{1,16}[：:]\s*/, "");
  return withoutLabel
    .replace(/[“”"「」『』]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeImportedSourceProse(fragment: string): boolean {
  if (!fragment) return true;
  if (isLikelyOriginalProseFragment(fragment)) return true;
  if (IMPORTED_SOURCE_PROSE_MARKERS.test(fragment)) return true;
  if (/^[\u4e00-\u9fa5A-Za-z0-9_-]{1,16}[：:]/.test(fragment) && /[“”"「」『』]/.test(fragment)) return true;
  if (fragment.length > 70 && /(?:他|她|我|你|了|着|会|要|把|向|从|在|里|上|下)/.test(fragment)) return true;
  return false;
}

export function sanitizeProjectCharacterModelPrompts(project: Project): Project {
  const characterModels = project.characterModels.map((model) => {
    const consistencyPrompt = sanitizeCharacterModelPromptOutput(model.consistencyPrompt);
    return consistencyPrompt === model.consistencyPrompt ? model : { ...model, consistencyPrompt };
  });

  return {
    ...project,
    characterModels
  };
}

export function sanitizeCharacterModelPromptOutput(prompt: string): string {
  const cleaned = prompt
    .split(/\r?\n/)
    .map((line) => sanitizeCharacterModelPromptLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || prompt.trim();
}

function sanitizeCharacterModelPromptLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (/^角色\s+\d+\s*[：:]/.test(trimmed) || trimmed === "中文提示词") return trimmed;

  const position = trimmed.match(/^(定位[：:])(.+)$/);
  if (position) {
    const cleanedPosition = stripImportedSourceProseFragments(position[2], "。");
    return cleanedPosition ? `${position[1]}${cleanedPosition}` : "";
  }

  return stripImportedSourceProseFragments(trimmed, "，");
}

function stripImportedSourceProseFragments(value: string, joiner: string): string {
  const fragments = splitCharacterModelPromptFragments(value)
    .map((fragment) => normalizeCharacterModelPromptFragment(fragment, { stripLeadingLabel: false }))
    .filter(Boolean)
    .filter((fragment) => !looksLikeImportedSourceProse(fragment));

  return uniqueText(fragments).join(joiner);
}

function inferCharacterIdentityHints(storyState: StoryState, index: number): string[] {
  const character = storyState.characters[index];
  if (!character) return [];

  const storyContext = collectStoryContext(storyState);
  const nearCharacterContext = collectNearCharacterContext(storyContext, character.name);
  const localContext = [
    sanitizeCharacterModelPromptText(character.role, { allowNonVisual: true, maxFragments: 4 }),
    character.gender,
    character.age,
    character.relationshipToProtagonist,
    sanitizeCharacterModelPromptText(character.appearance, { allowNonVisual: true, maxFragments: 8 }),
    sanitizeCharacterModelPromptText(character.consistencyPrompt, { maxFragments: 8 }),
    sanitizeCharacterModelPromptText(character.personality.join("，"), { allowNonVisual: true, maxFragments: 8 }),
    sanitizeCharacterModelPromptText(nearCharacterContext, { allowNonVisual: true, maxFragments: 8 })
  ]
    .filter(Boolean)
    .join("。");

  const protagonistName = storyState.characters[0]?.name || "主角";
  const relationship = normalizeRelationshipHint(character.relationshipToProtagonist, character.name, protagonistName, localContext);
  const gender = normalizeGenderHint(character.gender, character.name, relationship, localContext);
  const age = character.age?.trim();
  const antiDrift = gender.includes("女性")
    ? "不是男性角色，不要男性化脸部和体型"
    : gender.includes("男性")
      ? "不是女性角色，不要女性化脸部和体型"
      : "";

  return uniqueText([gender, age, relationship, antiDrift]);
}

function collectStoryContext(storyState: StoryState): string {
  return [
    storyState.world.title,
    storyState.world.background,
    storyState.world.rules.join("。"),
    storyState.world.factions.join("。"),
    storyState.world.timeline.join("。"),
    storyState.outline,
    storyState.seedanceScript,
    ...storyState.script.flatMap((scene) => [
      scene.title,
      scene.location,
      scene.description,
      ...scene.dialogues.flatMap((dialogue) => [dialogue.character, dialogue.line, dialogue.emotion])
    ]),
    ...storyState.storyboard.flatMap((shot) => [
      shot.composition,
      shot.characterActions,
      shot.expression,
      shot.background,
      shot.dialogue || "",
      shot.imagePrompt,
      shot.videoPrompt
    ])
  ]
    .filter(Boolean)
    .join("。");
}

function collectNearCharacterContext(context: string, name: string): string {
  if (!name) return "";
  const chunks: string[] = [];
  let startIndex = 0;
  while (chunks.length < 12) {
    const index = context.indexOf(name, startIndex);
    if (index < 0) break;
    chunks.push(context.slice(Math.max(0, index - 24), Math.min(context.length, index + name.length + 32)));
    startIndex = index + name.length;
  }
  return chunks.join("。");
}

function normalizeRelationshipHint(
  explicitRelationship: string | undefined,
  characterName: string,
  protagonistName: string,
  context: string
): string {
  if (explicitRelationship?.trim() && explicitRelationship.trim() !== "未明确") return explicitRelationship.trim();
  if (!characterName) return "";
  if (characterName === protagonistName) return "";

  if (matchesFamilyRelationship(characterName, protagonistName, context, "妹妹")) return `${protagonistName}的妹妹`;
  if (matchesFamilyRelationship(characterName, protagonistName, context, "姐姐")) return `${protagonistName}的姐姐`;
  if (matchesFamilyRelationship(characterName, protagonistName, context, "弟弟")) return `${protagonistName}的弟弟`;
  if (matchesFamilyRelationship(characterName, protagonistName, context, "哥哥")) return `${protagonistName}的哥哥`;

  return "";
}

function matchesFamilyRelationship(characterName: string, protagonistName: string, context: string, relation: string): boolean {
  const escapedName = escapeRegExp(characterName);
  const escapedProtagonist = escapeRegExp(protagonistName);
  const relationBeforeName = new RegExp(`(?:${escapedProtagonist}|主角|他|她)?(?:的)?(?:失踪)?${relation}[^，。；、\\n]{0,6}${escapedName}`);
  const nameBeforeRelation = new RegExp(
    `${escapedName}(?:是|为|，|,|：|:|、|——|—)[^，。；、\\n]{0,12}(?:${escapedProtagonist}|主角)?(?:的)?(?:失踪)?${relation}`
  );
  return relationBeforeName.test(context) || nameBeforeRelation.test(context);
}

function normalizeGenderHint(
  explicitGender: string | undefined,
  characterName: string,
  relationship: string,
  context: string
): string {
  if (explicitGender?.trim() && explicitGender.trim() !== "未明确") return explicitGender.trim();
  if (["林夏"].includes(characterName)) return "中国女性角色";
  if (["林彻", "林澈", "越铭"].includes(characterName)) return "中国男性角色";
  if (/(妹妹|姐姐|母亲|妻子|女儿)/.test(relationship) || /(女性|女人|女子|女孩|少女|女主)/.test(context)) return "中国女性角色";
  if (/(哥哥|弟弟|父亲|丈夫|儿子)/.test(relationship) || /(男性|男人|男子|男孩|少年|男主)/.test(context)) return "中国男性角色";
  return "";
}

function uniqueText(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function deriveSceneModelsFromStory(storyState: StoryState): Project["sceneModels"] {
  const characterNames = storyState.characters.map((character) => character.name).filter(Boolean);
  const styleKeywords = sanitizeVisualStyleKeywords(storyState.world.styleKeywords, ["现代都市悬疑"]);
  return storyState.script.map((scene, index) => {
    const environmentDescription = sanitizeSceneEnvironmentText(scene.description, scene.location, characterNames);
    const worldAtmosphere = sanitizeSceneEnvironmentText(storyState.world.background, storyState.world.title, characterNames);
    const sceneCode = `S${String(index + 1).padStart(2, "0")}`;
    const sceneTitle = sanitizeSceneTitle(scene.title, scene.location);
    const generationPrompt = buildSceneGenerationPrompt({
      sceneCode,
      title: sceneTitle,
      location: scene.location,
      environmentDescription,
      worldAtmosphere,
      styleKeywords,
      aspectRatio: "9:16"
    });
    const visualKeywords = Array.from(
      new Set([scene.location, sceneTitle, environmentDescription, ...storyState.world.styleKeywords].filter(Boolean))
    );

    return {
      id: `model-scene-${slug(scene.id || scene.title || String(index + 1), index)}`,
      name: sceneTitle,
      description: `${scene.location}。${environmentDescription}`,
      visualKeywords,
      generationPrompt,
      imageAspectRatio: "9:16",
      candidateImages: [],
      status: "idle"
    };
  });
}

function buildSceneGenerationPrompt(input: {
  sceneCode: string;
  title: string;
  location: string;
  environmentDescription: string;
  worldAtmosphere: string;
  styleKeywords: string[];
  aspectRatio: string;
}): string {
  return [
    `${input.sceneCode} ${input.title}`,
    `场景空间：${input.location}`,
    `空间与氛围：${input.environmentDescription}`,
    input.worldAtmosphere ? `世界环境基调：${input.worldAtmosphere}` : "",
    `项目统一画风：${input.styleKeywords.join("，")}`,
    "空间结构清楚",
    "透视稳定",
    "高细节背景概念图",
    "空场景",
    "不要人物",
    "不要角色",
    "不要人影",
    "不要脸",
    "不要手",
    "不要身体剪影",
    "不要人群",
    "不要可读文字",
    "不要logo",
    "不要水印",
    "不要偏离项目所选画风",
    `--ar ${input.aspectRatio}`
  ]
    .filter(Boolean)
    .join("，");
}

function sanitizeSceneEnvironmentText(value: string, fallback: string, characterNames: string[]): string {
  const blockedTerms = [
    ...characterNames,
    "核心设定",
    "中文生成提示词",
    "原文",
    "原文推进",
    "根据导入小说",
    "开端",
    "分镜",
    "台词",
    "对白",
    "动作",
    "主角",
    "角色",
    "人物",
    "人",
    "别人",
    "他人",
    "人类",
    "人影",
    "乘客",
    "人群",
    "男人",
    "女人",
    "男子",
    "女子",
    "男孩",
    "女孩",
    "少女",
    "刑警",
    "妹妹",
    "哥哥",
    "姐姐",
    "弟弟",
    "师兄",
    "师父",
    "他",
    "她",
    "握",
    "斜指",
    "紧绷",
    "呼吸",
    "轻颤",
    "指尖",
    "抚过",
    "腰间",
    "衣袂",
    "欺身",
    "直刺",
    "侧身",
    "避过",
    "横削",
    "相撞",
    "铮鸣",
    "招式",
    "招招",
    "取要害",
    "缠绕",
    "化解",
    "缠斗",
    "旋身",
    "劈向",
    "躲闪",
    "肩头",
    "血口",
    "脱手",
    "反目",
    "挣扎",
    "软剑",
    "素铁剑"
  ].filter(Boolean);
  const blockedPattern = blockedTerms.length > 0 ? new RegExp(blockedTerms.map(escapeRegExp).join("|")) : undefined;
  const fragments = value
    .replace(/[“”"《》]/g, "。")
    .split(/[，,。；;！？!?：:\n]\s*/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment && !blockedPattern?.test(fragment))
    .filter((fragment) => !/^\s*S\d{1,3}\s*/i.test(fragment));

  return Array.from(new Set(fragments)).slice(0, 8).join("，") || `${fallback}的空间结构、关键道具、光影、天气与环境氛围`;
}

function sanitizeSceneTitle(title: string, fallback: string): string {
  const normalized = title.trim();
  if (!normalized || /原文|推进|分镜|片段|镜头/.test(normalized)) return fallback;
  return normalized;
}

function slug(value: string, index: number): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || String(index + 1);
}
