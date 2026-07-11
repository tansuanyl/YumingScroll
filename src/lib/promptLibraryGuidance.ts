import { visualPromptLibrary } from "../data/promptLibrary";

type PromptTemplateId =
  | "character-turnaround"
  | "scene-model"
  | "image-prompt-frame"
  | "video-continuity";

function templateById(id: PromptTemplateId): string {
  return visualPromptLibrary.templates.find((template) => template.id === id)?.template || "";
}

function sectionItems(sectionId: string): string {
  const section = visualPromptLibrary.sections.find((item) => item.id === sectionId);
  if (!section) return "";
  return section.entries
    .map((entry) => `${entry.name}：${entry.items.join("；")}`)
    .join("\n");
}

export function buildStoryPromptLibraryGuidance(): string {
  return [
    "项目内置视觉提示框架使用规则：",
    `框架：${visualPromptLibrary.source.name}。`,
    "该框架只定义视觉资产的描述结构、风格约束和一致性约束，不提供故事素材。",
    "不得添加用户原文没有的人物、地点、道具、事件或关系。",
    "",
    "人物 consistencyPrompt 生成规则：",
    "必须参考“角色三视图”方法，写清角色身份、外貌特征细节、服装风格、风格基调和防漂移约束。",
    "根据原文填写面部、气质、体型、发型和画面风格，不要为了套用描述框架而改变人物。",
    `面部描述维度：\n${sectionItems("facial-features")}`,
    `气质描述维度：\n${sectionItems("temperament")}`,
    `体型描述维度：\n${sectionItems("body")}`,
    `发型描述维度：\n${sectionItems("hair")}`,
    `画面风格维度：\n${sectionItems("style-keywords")}`,
    "",
    "场景模型图生成规则：",
    "scene/location/background/imagePrompt 中的场景描述要参考“场景模型图”模板，写清空间结构、关键物件、光源方向、材质和氛围。场景模型图不要混入无关人物。",
    `场景模型图模板：\n${templateById("scene-model")}`,
    "",
    "15 秒片段 Image Prompt 生成规则：",
    "storyboard[].imagePrompt 和 visualPrompts[].imagePrompt 要参考“15 秒片段 Image Prompt”模板，明确本段核心画面、实际出镜人物、场景、镜头构图、光影色调和连续性。",
    `15 秒片段 Image Prompt 模板：\n${templateById("image-prompt-frame")}`,
    "",
    "15 秒视频 Prompt 生成规则：",
    "storyboard[].videoPrompt 和 visualPrompts[].videoPrompt 要参考“15 秒视频首尾帧连续”模板，只描述当前 15 秒内容，保留相邻片段首尾帧连续，不要提前生成后续剧情。",
    `15 秒视频首尾帧连续模板：\n${templateById("video-continuity")}`,
    "",
    "输出边界：提示框架可以影响人物模型、场景模型、Image Prompt 和视频 Prompt 的写法，但不能覆盖用户导入小说的剧情、人物姓名、台词、因果和顺序。"
  ].join("\n");
}

export function withCharacterModelPromptLibrary(rawPrompt: string): string {
  if (rawPrompt.includes("本地提示词库模板：角色设计三视图")) return rawPrompt;
  return [
    "本地提示词库模板：角色设计三视图，纯白色背景。",
    "结构要求：角色类型、外貌细节、服饰、风格基调、一致性要求、禁忌。",
    "当前角色输入：",
    rawPrompt,
    "生成要求：把当前角色输入填入模板结构，只生成角色设定图，不要绘制模板占位符、说明文字、logo 或水印。"
  ].join("\n");
}

export function withSceneModelPromptLibrary(rawPrompt: string): string {
  if (rawPrompt.includes("本地提示词库模板：场景模型图")) return rawPrompt;
  return [
    "本地提示词库模板：场景模型图。",
    "结构要求：空间结构、视觉重点、风格基调、用途、禁忌。",
    "当前场景输入：",
    rawPrompt,
    "生成要求：只生成可复用空间资产，重点锁定空间结构、关键物件、光源方向、材质和氛围，不要绘制人物、文字说明、logo 或水印。"
  ].join("\n");
}

export function withImagePromptLibrary(rawPrompt: string): string {
  if (rawPrompt.includes("本地提示词库模板：15 秒片段 Image Prompt")) return rawPrompt;
  return [
    "本地提示词库模板：15 秒片段 Image Prompt。",
    "结构要求：本段核心画面、实际出镜人物、场景、镜头构图、光影色调、连续性、禁忌。",
    "当前片段画面输入：",
    rawPrompt,
    "生成要求：只生成当前片段风格参考图，不提前生成后续剧情，不改变已确认人物模型和场景模型。"
  ].join("\n");
}

export function withVideoPromptLibrary(rawPrompt: string): string {
  if (rawPrompt.includes("本地提示词库模板：15 秒视频首尾帧连续")) return rawPrompt;
  return [
    "本地提示词库模板：15 秒视频首尾帧连续。",
    "规则：只生成当前 15 秒剧情；参考图只锁定身份、场景结构和画风；相邻片段使用首尾帧连续，不默认黑屏、眨眼或闪白。",
    "当前视频输入：",
    rawPrompt
  ].join("\n");
}
