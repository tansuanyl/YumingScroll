export const visualStylePresets = [
  {
    id: "suspense-guoman",
    thumbnail: "/style-thumbnails/custom/suspense-guoman.jpg",
    label: "悬疑国漫",
    sub: "冷蓝灰 / 强线稿",
    prompt: "半写实国漫悬疑风，成熟人物比例，冷蓝灰低饱和色调，强黑色线稿，纸张颗粒质感，漫画分层阴影，暗部压深，异常线索用少量高亮色。",
    accent: "#22d3ee",
    ink: "#a78bfa",
    preview: "grid"
  },
  {
    id: "cinematic-real",
    thumbnail: "/style-thumbnails/custom/cinematic-real.jpg",
    label: "写实剧照",
    sub: "电影感 / 克制光影",
    prompt: "写实剧照质感，电影构图，真实布光，浅景深，皮肤与材质细节克制，色调低饱和，保持短剧镜头语言，不要过度商业海报感。",
    accent: "#f59e0b",
    ink: "#64748b",
    preview: "spotlight"
  },
  {
    id: "gritty-comic",
    thumbnail: "/style-thumbnails/custom/gritty-comic.jpg",
    label: "粗粝漫画",
    sub: "颗粒 / 厚重笔触",
    prompt: "粗粝写实漫画风，厚重线稿，纸面颗粒，刮擦纹理，人物五官有生活感，暗部层次重，适合悬疑、惊悚、犯罪题材。",
    accent: "#ef4444",
    ink: "#f97316",
    preview: "grain"
  },
  {
    id: "noir-manga",
    thumbnail: "/style-thumbnails/custom/noir-manga.jpg",
    label: "黑白硬线漫画",
    sub: "高反差 / 阴影切割",
    prompt: "高反差黑白漫画，硬朗轮廓线，大面积黑影切割，网点和排线质感，镜头压迫感强，局部只允许极少强调色。",
    accent: "#f8fafc",
    ink: "#0f172a",
    preview: "noir"
  },
  {
    id: "urban-anime",
    thumbnail: "/style-thumbnails/custom/urban-anime.jpg",
    label: "都市动画",
    sub: "清晰色块 / 夜景",
    prompt: "现代都市动画风，清晰色块，干净线稿，夜景霓虹反射，人物表情明确但不过度幼态，适合都市怪谈和悬疑短剧。",
    accent: "#38bdf8",
    ink: "#fb7185",
    preview: "neon"
  },
  {
    id: "ink-wuxia",
    thumbnail: "/style-thumbnails/custom/ink-wuxia.jpg",
    label: "水墨武侠",
    sub: "留白 / 墨色层次",
    prompt: "水墨武侠视觉，宣纸肌理，墨色层次，克制留白，人物衣袂和环境雾气有流动感，镜头保持东方悬疑气质。",
    accent: "#d6d3d1",
    ink: "#14b8a6",
    preview: "ink"
  },
  {
    id: "soft-shojo",
    thumbnail: "/style-thumbnails/custom/soft-shojo.jpg",
    label: "柔光漫感",
    sub: "细腻 / 情绪氛围",
    prompt: "柔光漫画风，细腻面部表情，轻颗粒，低对比暖冷混合光，情绪氛围明确，但不要幼态化、不要过甜少女滤镜。",
    accent: "#f9a8d4",
    ink: "#c084fc",
    preview: "soft"
  },
  {
    id: "cyber-comic",
    thumbnail: "/style-thumbnails/custom/cyber-comic.jpg",
    label: "赛博霓虹",
    sub: "电子光 / 高密度",
    prompt: "赛博漫画风，霓虹边缘光，电子界面反射，高密度城市细节，冷暖撞色，人物仍保持清晰漫画轮廓，不要变成游戏 CG。",
    accent: "#2dd4bf",
    ink: "#8b5cf6",
    preview: "circuit"
  },
  {
    id: "heroic-comic",
    thumbnail: "/style-thumbnails/custom/heroic-comic.jpg",
    label: "美式英雄",
    sub: "力量感 / 动态构图",
    prompt: "美式英雄漫画风，强透视，肌肉与服装结构清晰，动态构图，重色块阴影，适合动作冲突和高张力场面。",
    accent: "#60a5fa",
    ink: "#dc2626",
    preview: "burst"
  },
  {
    id: "stylized-3d",
    thumbnail: "/style-thumbnails/custom/stylized-3d.jpg",
    label: "卡通 3D",
    sub: "体块 / 柔和材质",
    prompt: "风格化卡通 3D 渲染，清晰体块，柔和材质，灯光干净，人物比例成熟，避免低幼玩具感和廉价游戏建模。",
    accent: "#34d399",
    ink: "#fbbf24",
    preview: "clay"
  },
  {
    id: "minimal-line",
    thumbnail: "/style-thumbnails/custom/minimal-line.jpg",
    label: "极简线稿",
    sub: "少色 / 留白",
    prompt: "极简线稿漫画，少色块，画面干净，空间留白明确，用构图和人物姿态推动悬念，避免复杂背景噪音。",
    accent: "#e5e7eb",
    ink: "#94a3b8",
    preview: "line"
  },
  {
    id: "retro-film",
    thumbnail: "/style-thumbnails/custom/retro-film.jpg",
    label: "复古胶片",
    sub: "旧电影 / 暖暗部",
    prompt: "复古胶片质感，轻微颗粒，低对比暖暗部，旧照片色偏，镜头有年代感，适合记忆、失踪、档案类悬疑叙事。",
    accent: "#fde68a",
    ink: "#92400e",
    preview: "film"
  }
] as const;

export type VisualStylePreset = (typeof visualStylePresets)[number];
export type VisualStylePresetId = VisualStylePreset["id"];

export function getVisualStylePreset(id?: string): VisualStylePreset | undefined {
  return visualStylePresets.find((preset) => preset.id === id);
}

export function getDefaultVisualStylePreset(): VisualStylePreset {
  return visualStylePresets[0];
}

export function buildVisualStyleInstruction(id?: string): string {
  const preset = getVisualStylePreset(id) || getDefaultVisualStylePreset();
  return [
    `画面风格选择：${preset.label}`,
    `视觉约束：${preset.prompt}`,
    "该风格只能影响画风、镜头语言和视觉提示词，不能改变用户输入的剧情、人物姓名、关系、台词、因果和事件顺序。"
  ].join("\n");
}

export function buildVisualStylePromptSuffix(id?: string): string {
  const preset = getVisualStylePreset(id) || getDefaultVisualStylePreset();
  return `所选画风：${preset.label}。视觉提示词：${preset.prompt}同一项目内所有人物、场景、图片和视频提示词必须保持该画风一致，不得切换到其他画风。`;
}

export function buildVisualStyleGuardrail(id?: string): string {
  const preset = getVisualStylePreset(id) || getDefaultVisualStylePreset();
  return `不要偏离“${preset.label}”画风，不要让角色频繁换脸，不要血腥，不要低质量畸变，不要可读水印或 logo。`;
}

export function buildVisualStyleSeedanceLines(id?: string): string[] {
  const preset = getVisualStylePreset(id) || getDefaultVisualStylePreset();
  return [
    `画风选择：${preset.label}。`,
    `画风：${preset.prompt}`,
    "画风一致性：人物模型、场景模型、Image Prompt 和所有 15 秒视频提示词都必须沿用该画风，不得在同一项目内切换画风。"
  ];
}

export function getVisualStyleKeywords(id?: string): string[] {
  const preset = getVisualStylePreset(id) || getDefaultVisualStylePreset();
  const chunks = preset.prompt
    .split(/[，。；、]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !/^不/.test(part) && !/^避免/.test(part));
  const subChunks = preset.sub
    .split(/[\/，、]/)
    .map((part) => part.trim())
    .filter(Boolean);

  return Array.from(new Set([preset.label, ...subChunks, ...chunks]));
}
