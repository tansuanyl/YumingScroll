import type { CharacterModel, MediaAsset, Project, SceneModel, StoryboardShot, VideoFlow } from "../types/domain";

export type GalleryImageItem = {
  id: string;
  asset: MediaAsset;
  title: string;
  subtitle: string;
};

export type GalleryVideoItem = {
  id: string;
  asset: MediaAsset;
  flow: VideoFlow;
  index: number;
  shot?: StoryboardShot;
};

export type ProjectGallerySections = {
  characterImages: GalleryImageItem[];
  sceneImages: GalleryImageItem[];
  styleImages: GalleryImageItem[];
  historyImages: GalleryImageItem[];
  archivedCharacterImages: GalleryImageItem[];
  archivedSceneImages: GalleryImageItem[];
  archivedStyleImages: GalleryImageItem[];
  uncategorizedImages: GalleryImageItem[];
  videos: GalleryVideoItem[];
};

export type ProjectGalleryGroup = {
  project: Project;
  sections: ProjectGallerySections;
  totalAssets: number;
  isActive: boolean;
};

type StoredImageCategory = "character" | "scene" | "style" | "uncategorized";

export function getProjectGalleryGroups(projects: Project[], activeProjectId?: string): ProjectGalleryGroup[] {
  return projects
    .map((project) => {
      const sections = getProjectGallerySections(project);
      return {
        project,
        sections,
        totalAssets: countGalleryAssets(sections),
        isActive: project.id === activeProjectId
      };
    })
    .sort((left, right) => {
      if (left.isActive !== right.isActive) return left.isActive ? -1 : 1;
      return getTime(right.project.updatedAt) - getTime(left.project.updatedAt);
    });
}

export function getProjectGallerySections(project: Project): ProjectGallerySections {
  const assetsById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const seenCharacterAssets = new Set<string>();
  const seenSceneAssets = new Set<string>();
  const seenStyleAssets = new Set<string>();
  const seenHistoryAssets = new Set<string>();
  const referencedImageIds = new Set<string>();

  const characterImages = project.characterModels.flatMap((model) => {
    const asset = findConfirmedImage(model.confirmedImageId, model.candidateImages, assetsById);
    if (!asset || seenCharacterAssets.has(asset.id)) return [];
    seenCharacterAssets.add(asset.id);
    referencedImageIds.add(asset.id);
    return [
      {
        id: `${model.id}:${asset.id}`,
        asset,
        title: model.name,
        subtitle: "人物图片"
      }
    ];
  });

  const sceneImages = project.sceneModels.flatMap((model) => {
    const asset = findConfirmedImage(model.confirmedImageId, model.candidateImages, assetsById);
    if (!asset || seenSceneAssets.has(asset.id)) return [];
    seenSceneAssets.add(asset.id);
    referencedImageIds.add(asset.id);
    return [
      {
        id: `${model.id}:${asset.id}`,
        asset,
        title: model.name,
        subtitle: "场景图片"
      }
    ];
  });

  const historyImages: GalleryImageItem[] = [];

  for (const model of project.characterModels) {
    model.candidateImages.forEach((candidate, index) => {
      const asset = resolveImageAsset(candidate, assetsById);
      if (!asset) return;
      referencedImageIds.add(asset.id);
      if (asset.id === model.confirmedImageId || seenHistoryAssets.has(asset.id)) return;
      seenHistoryAssets.add(asset.id);
      historyImages.push({
        id: `${model.id}:candidate:${asset.id}`,
        asset,
        title: `${model.name} · 方案 ${index + 1}`,
        subtitle: "人物候选图"
      });
    });
  }

  for (const model of project.sceneModels) {
    model.candidateImages.forEach((candidate, index) => {
      const asset = resolveImageAsset(candidate, assetsById);
      if (!asset) return;
      referencedImageIds.add(asset.id);
      if (asset.id === model.confirmedImageId || seenHistoryAssets.has(asset.id)) return;
      seenHistoryAssets.add(asset.id);
      historyImages.push({
        id: `${model.id}:candidate:${asset.id}`,
        asset,
        title: `${model.name} · 方案 ${index + 1}`,
        subtitle: "场景候选图"
      });
    });
  }

  const styleImages = project.videoFlows.flatMap((flow, index) => {
    const asset = findConfirmedImage(flow.nodes.promptNode.confirmedImageId, flow.nodes.promptNode.candidateImages || [], assetsById);
    if (!asset || seenStyleAssets.has(asset.id)) return [];
    seenStyleAssets.add(asset.id);
    referencedImageIds.add(asset.id);
    const shot = project.storyState.storyboard.find((item) => item.id === flow.shotId);
    return [
      {
        id: `${flow.id}:style:${asset.id}`,
        asset,
        title: shot?.shotType ? `第 ${index + 1} 段 · ${shot.shotType}` : `第 ${index + 1} 段风格图`,
        subtitle: "风格参考图"
      }
    ];
  });

  for (const flow of project.videoFlows) {
    const shotIndex = project.storyState.storyboard.findIndex((item) => item.id === flow.shotId);
    flow.nodes.promptNode.candidateImages?.forEach((candidate, index) => {
      const asset = resolveImageAsset(candidate, assetsById);
      if (!asset) return;
      referencedImageIds.add(asset.id);
      if (asset.id === flow.nodes.promptNode.confirmedImageId || seenHistoryAssets.has(asset.id)) return;
      seenHistoryAssets.add(asset.id);
      historyImages.push({
        id: `${flow.id}:prompt-candidate:${asset.id}`,
        asset,
        title: `第 ${shotIndex >= 0 ? shotIndex + 1 : index + 1} 段 · 方案 ${index + 1}`,
        subtitle: "风格候选图"
      });
    });
  }

  const videoAssetIds = new Set(project.videoFlows.flatMap((flow) => (flow.videoAssetId ? [flow.videoAssetId] : [])));
  const storedImageGroups: Record<StoredImageCategory, GalleryImageItem[]> = {
    character: [],
    scene: [],
    style: [],
    uncategorized: []
  };

  project.assets
    .filter((asset) => asset.type === "image" && !referencedImageIds.has(asset.id) && !videoAssetIds.has(asset.id))
    .forEach((asset, index) => {
      const classification = classifyStoredImage(asset);
      storedImageGroups[classification.category].push({
        id: `stored:${asset.id}`,
        asset,
        title: titleFromPrompt(asset.prompt, index),
        subtitle: classification.subtitle
      });
    });

  return {
    characterImages,
    sceneImages,
    styleImages,
    historyImages: sortGalleryItems(historyImages),
    archivedCharacterImages: sortGalleryItems(storedImageGroups.character),
    archivedSceneImages: sortGalleryItems(storedImageGroups.scene),
    archivedStyleImages: sortGalleryItems(storedImageGroups.style),
    uncategorizedImages: sortGalleryItems(storedImageGroups.uncategorized),
    videos: project.videoFlows.flatMap((flow, index) => {
      const asset = flow.videoAssetId ? assetsById.get(flow.videoAssetId) : undefined;
      if (!asset || asset.type !== "video") return [];
      const shot = project.storyState.storyboard.find((item) => item.id === flow.shotId);
      return [{ id: `${flow.id}:${asset.id}`, asset, flow, index, shot }];
    })
  };
}

function countGalleryAssets(sections: ProjectGallerySections): number {
  return (
    sections.characterImages.length +
    sections.sceneImages.length +
    sections.styleImages.length +
    sections.historyImages.length +
    sections.archivedCharacterImages.length +
    sections.archivedSceneImages.length +
    sections.archivedStyleImages.length +
    sections.uncategorizedImages.length +
    sections.videos.length
  );
}

function titleFromPrompt(prompt: string | undefined, index: number): string {
  const normalized = (prompt || "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 36) : `保存图片 ${index + 1}`;
}

function findConfirmedImage(
  confirmedImageId: string | undefined,
  candidateImages: CharacterModel["candidateImages"] | SceneModel["candidateImages"],
  assetsById: Map<string, MediaAsset>
) {
  if (!confirmedImageId) return undefined;
  const asset = assetsById.get(confirmedImageId) || candidateImages.find((item) => item.id === confirmedImageId);
  return asset?.type === "image" ? asset : undefined;
}

function resolveImageAsset(candidate: MediaAsset, assetsById: Map<string, MediaAsset>): MediaAsset | undefined {
  const asset = assetsById.get(candidate.id) || candidate;
  return asset.type === "image" ? asset : undefined;
}

function classifyStoredImage(asset: MediaAsset): { category: StoredImageCategory; subtitle: string } {
  const prompt = asset.prompt || "";
  if (
    /角色\s*\d*|人物|character|heroine|hero\b|male lead|female lead|protagonist|portrait|expression|hair|coat|raincoat|iris|定妆|模型图|主角\/观察者|同车求生者|执行者/i.test(
      prompt
    )
  ) {
    return { category: "character", subtitle: "历史人物图" };
  }
  if (/场景|空场景|scene|location|background|地点|背景|空间|车内|车外|客车|公交|道路|街道|公路|站台|后门|窗外|夜行/i.test(prompt)) {
    return { category: "scene", subtitle: "历史场景图" };
  }
  if (/image prompt|风格|style|visual|分镜|镜头|shot|国漫|漫画|设定图|参考图/i.test(prompt)) {
    return { category: "style", subtitle: "历史风格图" };
  }
  return { category: "uncategorized", subtitle: "未识别图片" };
}

function sortGalleryItems(items: GalleryImageItem[]): GalleryImageItem[] {
  return [...items].sort((left, right) => getTime(right.asset.createdAt) - getTime(left.asset.createdAt));
}

function getTime(value: string | undefined): number {
  const time = value ? Date.parse(value) : 0;
  return Number.isFinite(time) ? time : 0;
}
