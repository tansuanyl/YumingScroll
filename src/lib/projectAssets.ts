import type { MediaAsset, Project, VideoFlow } from "../types/domain";

export function removeProjectAsset(project: Project, assetId: string): { project: Project; asset?: MediaAsset } {
  const asset = findProjectAsset(project, assetId);
  const assetUrl = asset?.url;
  let changed = Boolean(asset);

  const characterModels = project.characterModels.map((model) => {
    const candidateImages = model.candidateImages.filter((candidate) => candidate.id !== assetId);
    const confirmedImageId = model.confirmedImageId === assetId ? undefined : model.confirmedImageId;
    const modelChanged = candidateImages.length !== model.candidateImages.length || confirmedImageId !== model.confirmedImageId;
    changed = changed || modelChanged;
    return modelChanged
      ? {
          ...model,
          candidateImages,
          confirmedImageId,
          status: confirmedImageId ? model.status : "idle",
          error: confirmedImageId ? model.error : undefined
        }
      : model;
  });

  const sceneModels = project.sceneModels.map((model) => {
    const candidateImages = model.candidateImages.filter((candidate) => candidate.id !== assetId);
    const confirmedImageId = model.confirmedImageId === assetId ? undefined : model.confirmedImageId;
    const modelChanged = candidateImages.length !== model.candidateImages.length || confirmedImageId !== model.confirmedImageId;
    changed = changed || modelChanged;
    return modelChanged
      ? {
          ...model,
          candidateImages,
          confirmedImageId,
          status: confirmedImageId ? model.status : "idle",
          error: confirmedImageId ? model.error : undefined
        }
      : model;
  });

  const videoFlows = project.videoFlows.map((flow) => {
    const nextFlow = removeAssetFromVideoFlow(flow, assetId, assetUrl);
    changed = changed || nextFlow !== flow;
    return nextFlow;
  });

  if (!changed) return { project };

  return {
    asset,
    project: {
      ...project,
      assets: project.assets.filter((item) => item.id !== assetId),
      characterModels,
      sceneModels,
      videoFlows,
      updatedAt: new Date().toISOString()
    }
  };
}

export function findProjectAsset(project: Project, assetId: string): MediaAsset | undefined {
  return (
    project.assets.find((item) => item.id === assetId) ||
    project.characterModels.flatMap((model) => model.candidateImages).find((item) => item.id === assetId) ||
    project.sceneModels.flatMap((model) => model.candidateImages).find((item) => item.id === assetId) ||
    project.videoFlows.flatMap((flow) => flow.nodes.promptNode.candidateImages || []).find((item) => item.id === assetId)
  );
}

function removeAssetFromVideoFlow(flow: VideoFlow, assetId: string, assetUrl?: string): VideoFlow {
  const candidateImages = (flow.nodes.promptNode.candidateImages || []).filter((candidate) => candidate.id !== assetId);
  const confirmedImageId = flow.nodes.promptNode.confirmedImageId === assetId ? undefined : flow.nodes.promptNode.confirmedImageId;
  const promptReferenceChanged =
    candidateImages.length !== (flow.nodes.promptNode.candidateImages || []).length ||
    confirmedImageId !== flow.nodes.promptNode.confirmedImageId ||
    Boolean(assetUrl && flow.imagePromptImageUrl === assetUrl);
  const videoAssetChanged = flow.videoAssetId === assetId;
  const frameAssetChanged = flow.firstFrameImageAssetId === assetId || flow.lastFrameImageAssetId === assetId;

  if (!promptReferenceChanged && !videoAssetChanged && !frameAssetChanged) return flow;

  return {
    ...flow,
    imagePromptImageUrl: assetUrl && flow.imagePromptImageUrl === assetUrl ? undefined : flow.imagePromptImageUrl,
    imagePromptImageName: assetUrl && flow.imagePromptImageUrl === assetUrl ? undefined : flow.imagePromptImageName,
    videoAssetId: videoAssetChanged ? undefined : flow.videoAssetId,
    firstFrameImageAssetId: flow.firstFrameImageAssetId === assetId || videoAssetChanged ? undefined : flow.firstFrameImageAssetId,
    lastFrameImageAssetId: flow.lastFrameImageAssetId === assetId || videoAssetChanged ? undefined : flow.lastFrameImageAssetId,
    status: videoAssetChanged ? "idle" : flow.status,
    error: videoAssetChanged ? undefined : flow.error,
    nodes: {
      ...flow.nodes,
      promptNode: {
        ...flow.nodes.promptNode,
        candidateImages,
        confirmedImageId,
        status: confirmedImageId ? flow.nodes.promptNode.status : "idle",
        error: confirmedImageId ? flow.nodes.promptNode.error : undefined,
        stale: promptReferenceChanged ? true : flow.nodes.promptNode.stale
      },
      videoNode: videoAssetChanged
        ? { ...flow.nodes.videoNode, status: "idle", stale: true, error: undefined, generationRequestId: undefined }
        : flow.nodes.videoNode,
      previewNode: videoAssetChanged
        ? { ...flow.nodes.previewNode, status: "idle", stale: true, error: undefined }
        : flow.nodes.previewNode
    },
    generationRequestId: videoAssetChanged ? undefined : flow.generationRequestId,
    pendingVideoJobId: videoAssetChanged ? undefined : flow.pendingVideoJobId
  };
}
