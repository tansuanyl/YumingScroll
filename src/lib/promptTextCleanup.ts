const sectionLeakPattern =
  /(?:小说\/文档原文|导入小说原文|根据导入小说原文改编|原文推进|原文|开端[：:]|台词[：:]|对白[：:]|动作[：:]|分镜\s*\d|核心设定|中文生成提示词)/;

const narrativeActionPattern =
  /(?:握着|握住|斜指|紧绷|呼吸|轻颤|指尖|抚过|腰间|衣袂|欺身|直刺|侧身|避过|横削|相撞|铮鸣|火星|溅在|招式|取要害|缠绕|化解|缠斗|旋身|劈向|躲闪|划开|血口|脱手|嗤笑|笑一声|一记|反目|挣扎|交出来|饶你不死|师兄|剑谱|剑尖|软剑|素铁剑|肩头|左肩|右肩|步步紧逼|说完|说道|说着|问道|喊道|低声|看着|盯着|望着|听见|听到|想起|转身|后退|冲向|跑向|伸手|抬眼|回头|走进|走出)/;

const visualStyleTermPattern =
  /(?:画风|国漫|漫画|水墨|武侠|悬疑|半写实|写实|线稿|色调|低饱和|冷蓝灰|冷灰|残阳|破庙|梁柱|尘雾|寒光|空间|透视|构图|光影|氛围|背景|场景|道具|材质|镜头|纸张|颗粒|阴影|高细节|概念图|赛博朋克|霓虹|胶片|厚涂|黑白|硬线)/;

export function splitPromptFragments(value: string | undefined): string[] {
  return (value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[“”"「」『』《》]/g, "。")
    .split(/[\n，,。；;！!？?：:、]\s*/)
    .map((fragment) => fragment.trim())
    .filter(Boolean);
}

export function isLikelyOriginalProseFragment(fragment: string | undefined): boolean {
  const value = (fragment || "").trim();
  if (!value) return true;
  if (sectionLeakPattern.test(value)) return true;
  if (/^例如$/.test(value)) return true;
  if (narrativeActionPattern.test(value)) return true;
  if (value.length > 14 && /被[^，。；;]{1,16}得/.test(value)) return true;
  if (value.length > 20 && /(?:他|她|我|你|其|对方|两人|众人)[^，。；;]{0,24}(?:的|了|着|把|被|向|从|在)/.test(value)) return true;
  if (value.length > 34 && !visualStyleTermPattern.test(value) && /(?:的|了|着|把|被|向|从|在).*(?:的|了|着|上|下|里|中)/.test(value)) return true;
  return false;
}

export function removeOriginalProseFragments(
  value: string | undefined,
  options: { joiner?: string; blockedTerms?: string[]; maxFragments?: number } = {}
): string {
  const blockedTerms = (options.blockedTerms || []).filter(Boolean);
  const blockedPattern = blockedTerms.length > 0 ? new RegExp(blockedTerms.map(escapePromptRegExp).join("|")) : undefined;
  const fragments = splitPromptFragments(value)
    .filter((fragment) => !blockedPattern?.test(fragment))
    .filter((fragment) => !isLikelyOriginalProseFragment(fragment));

  return uniqueText(fragments).slice(0, options.maxFragments ?? fragments.length).join(options.joiner ?? "，");
}

export function sanitizeVisualStyleKeywords(keywords: string[], fallback: string[] = ["现代都市悬疑"]): string[] {
  const fragments = keywords
    .flatMap((keyword) => splitPromptFragments(keyword))
    .filter((fragment) => !isLikelyOriginalProseFragment(fragment))
    .filter((fragment) => fragment.length <= 28 || visualStyleTermPattern.test(fragment));

  const cleaned = uniqueText(fragments).slice(0, 18);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function escapePromptRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueText(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
