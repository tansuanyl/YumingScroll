import type { CharacterModel, MediaAsset, Project, SceneModel, VideoFlow } from "../../src/types/domain";

export function mergeProjectMediaForSave(incoming: Project, existing?: Project): Project {
  if (!existing) return incoming;

  return {
    ...incoming,
    assets: mergeAssets(existing.assets, incoming.assets),
    characterModels: incoming.characterModels.map((model) =>
      mergeCharacterModelMedia(model, findCompatible(existing.characterModels, model.id))
    ),
    sceneModels: incoming.sceneModels.map((model) =>
      mergeSceneModelMedia(model, findCompatible(existing.sceneModels, model.id))
    ),
    videoFlows: incoming.videoFlows.map((flow) => mergeVideoFlowMedia(flow, findCompatible(existing.videoFlows, flow.id)))
  };
}

function mergeCharacterModelMedia(model: CharacterModel, existing?: CharacterModel): CharacterModel {
  if (!existing || model.status === "generating") return model;
  return {
    ...model,
    candidateImages: model.candidateImages.length > 0 ? model.candidateImages : existing.candidateImages,
    confirmedImageId: model.confirmedImageId ?? existing.confirmedImageId
  };
}

function mergeSceneModelMedia(model: SceneModel, existing?: SceneModel): SceneModel {
  if (!existing || model.status === "generating") return model;
  return {
    ...model,
    candidateImages: model.candidateImages.length > 0 ? model.candidateImages : existing.candidateImages,
    confirmedImageId: model.confirmedImageId ?? existing.confirmedImageId
  };
}

function mergeVideoFlowMedia(flow: VideoFlow, existing?: VideoFlow): VideoFlow {
  if (!existing) return flow;

  const promptNode =
    flow.nodes.promptNode.status === "generating"
      ? flow.nodes.promptNode
      : {
          ...flow.nodes.promptNode,
          candidateImages:
            flow.nodes.promptNode.candidateImages && flow.nodes.promptNode.candidateImages.length > 0
              ? flow.nodes.promptNode.candidateImages
              : existing.nodes.promptNode.candidateImages,
          confirmedImageId: flow.nodes.promptNode.confirmedImageId ?? existing.nodes.promptNode.confirmedImageId
        };

  if (shouldAcceptClearedVideoOutput(flow) || flow.videoAssetId || !existing.videoAssetId) {
    return {
      ...flow,
      nodes: {
        ...flow.nodes,
        promptNode
      }
    };
  }

  return {
    ...flow,
    videoAssetId: existing.videoAssetId,
    firstFrameImageAssetId: flow.firstFrameImageAssetId ?? existing.firstFrameImageAssetId,
    lastFrameImageAssetId: flow.lastFrameImageAssetId ?? existing.lastFrameImageAssetId,
    status: existing.status === "ready" ? existing.status : flow.status,
    nodes: {
      ...flow.nodes,
      promptNode,
      videoNode: existing.nodes.videoNode.status === "ready" ? existing.nodes.videoNode : flow.nodes.videoNode,
      previewNode: existing.nodes.previewNode.status === "ready" ? existing.nodes.previewNode : flow.nodes.previewNode
    }
  };
}

function shouldAcceptClearedVideoOutput(flow: VideoFlow): boolean {
  return (
    flow.status === "generating" ||
    Boolean(flow.pendingVideoJobId) ||
    flow.nodes.videoNode.status === "generating" ||
    flow.nodes.videoNode.stale === true ||
    flow.nodes.previewNode.stale === true
  );
}

function mergeAssets(existingAssets: MediaAsset[], incomingAssets: MediaAsset[]): MediaAsset[] {
  const byId = new Map<string, MediaAsset>();
  for (const asset of existingAssets) byId.set(asset.id, asset);
  for (const asset of incomingAssets) {
    const existing = byId.get(asset.id);
    byId.set(asset.id, chooseAsset(existing, asset));
  }
  return Array.from(byId.values());
}

function chooseAsset(existing: MediaAsset | undefined, incoming: MediaAsset): MediaAsset {
  if (!existing) return incoming;
  if (existing.storageKey && !incoming.storageKey) return existing;
  return incoming;
}

function findCompatible<T extends { id: string }>(items: T[], id: string): T | undefined {
  return items.find((item) => areCompatibleIds(item.id, id));
}

function areCompatibleIds(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.endsWith(`:${right}`) || right.endsWith(`:${left}`)) return true;
  return left.split(":").at(-1) === right.split(":").at(-1);
}
