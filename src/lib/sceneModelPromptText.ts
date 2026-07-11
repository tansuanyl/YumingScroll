import { isLikelyOriginalProseFragment, splitPromptFragments } from "./promptTextCleanup";

const sceneStoryLeakTerms = [
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
  "人影",
  "人群",
  "师兄",
  "师父",
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
];

export function sanitizeSceneModelPromptText(
  value: string | undefined,
  characterNames: string[] = [],
  fallback = "纯环境空间、关键道具、光影、天气和氛围"
): string {
  const blockedTerms = [...characterNames, ...sceneStoryLeakTerms].filter(Boolean);
  const blockedPattern = blockedTerms.length > 0 ? new RegExp(blockedTerms.map(escapeRegExp).join("|")) : undefined;
  const fragments = splitPromptFragments(value)
    .filter((fragment) => fragment && !blockedPattern?.test(fragment))
    .filter((fragment) => !isLikelyOriginalProseFragment(fragment))
    .filter((fragment) => !/^\s*S\d{1,3}\s*/i.test(fragment));

  return Array.from(new Set(fragments)).slice(0, 10).join("，") || fallback;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
