import { isLikelyOriginalProseFragment, splitPromptFragments } from "./promptTextCleanup";

type ImagePromptSceneSource = {
  name: string;
  description?: string;
  visualKeywords?: string[];
};

type SanitizeImagePromptSourceOptions = {
  maxLength?: number;
  fallback?: string;
};

const sceneModelSectionPattern = /(^|\n)\s*(核心设定|中文生成提示词)\s*(\n|$)/;
const generatedSceneHeadingPattern = /^S\d{2}\s+.*(原文推进|核心设定|中文生成提示词)/;
const storyLeakMarkers = [
  "根据导入小说原文改编",
  "原文推进",
  "开端：",
  "台词：",
  "动作：",
  "分镜 1",
  "分镜1",
];

const fragmentStoryLeakMarkers = [
  "沈砚握着",
  "苏衍嗤笑",
  "指尖抚过",
  "沈砚侧身",
  "火星溅在"
];

export function sanitizeImagePromptSourceText(
  value: string | undefined,
  options: SanitizeImagePromptSourceOptions = {}
): string {
  const maxLength = options.maxLength ?? 1800;
  const fallback = options.fallback ?? "";
  const normalized = normalizePromptWhitespace(value || "");
  const cleanedBlocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !isGeneratedSceneModelBlock(block))
    .map(removeStoryLeakFragments)
    .map((block) => block.trim())
    .filter(Boolean);
  const cleaned = normalizePromptWhitespace(cleanedBlocks.join("\n\n") || fallback);
  return limitPromptLength(cleaned, maxLength);
}

export function buildSceneImagePromptSourceText(scene: ImagePromptSceneSource): string {
  const description = sanitizeImagePromptSourceText(scene.description, { maxLength: 220 });
  const keywords = (scene.visualKeywords || [])
    .map((keyword) => sanitizeImagePromptSourceText(keyword, { maxLength: 36 }))
    .filter(Boolean)
    .slice(0, 10);

  return [
    `场景模型参考：${scene.name}`,
    description ? `空间与氛围：${description}` : "",
    keywords.length ? `场景关键词：${keywords.join("、")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function isGeneratedSceneModelBlock(block: string): boolean {
  const trimmed = block.trim();
  return sceneModelSectionPattern.test(trimmed)
    || generatedSceneHeadingPattern.test(trimmed)
    || storyLeakMarkers.some((marker) => trimmed.includes(marker));
}

function removeStoryLeakFragments(block: string): string {
  return splitPromptFragments(block)
    .filter((fragment) => !storyLeakMarkers.some((marker) => fragment.includes(marker)))
    .filter((fragment) => !fragmentStoryLeakMarkers.some((marker) => fragment.includes(marker)))
    .filter((fragment) => !isLikelyOriginalProseFragment(fragment))
    .join("，");
}

function normalizePromptWhitespace(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function limitPromptLength(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}
