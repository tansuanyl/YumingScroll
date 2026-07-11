import { describe, expect, it } from "vitest";
import { mergeProjectMediaForSave } from "../server/services/ProjectMediaMerge";
import { createDemoProject } from "../src/data/demoProject";
import type { MediaAsset } from "../src/types/domain";

function imageAsset(id: string): MediaAsset {
  return {
    id,
    type: "image",
    url: `/api/projects/project-1/assets/${id}/file`,
    storageKey: `project-1/${id}.png`,
    provider: "mock",
    prompt: id,
    createdAt: "2026-05-16T00:00:00.000Z"
  };
}

function videoAsset(id: string): MediaAsset {
  return {
    id,
    type: "video",
    url: `/api/projects/project-1/assets/${id}/file`,
    storageKey: `project-1/${id}.mp4`,
    provider: "mock",
    prompt: id,
    createdAt: "2026-05-16T00:00:00.000Z"
  };
}

describe("project media merge for save", () => {
  it("keeps existing gallery media when a stale project save omits it", () => {
    const existing = createDemoProject();
    const character = imageAsset("asset-character");
    const scene = imageAsset("asset-scene");
    const video = videoAsset("asset-video");

    existing.assets = [character, scene, video];
    existing.characterModels[0].candidateImages = [character];
    existing.characterModels[0].confirmedImageId = character.id;
    existing.sceneModels[0].candidateImages = [scene];
    existing.sceneModels[0].confirmedImageId = scene.id;
    existing.videoFlows[0].videoAssetId = video.id;
    existing.videoFlows[0].status = "ready";
    existing.videoFlows[0].nodes.videoNode.status = "ready";
    existing.videoFlows[0].nodes.previewNode.status = "ready";

    const incoming = createDemoProject();
    incoming.id = existing.id;
    incoming.assets = [];
    incoming.characterModels[0].candidateImages = [];
    incoming.characterModels[0].confirmedImageId = undefined;
    incoming.sceneModels[0].candidateImages = [];
    incoming.sceneModels[0].confirmedImageId = undefined;
    incoming.videoFlows[0].videoAssetId = undefined;
    incoming.videoFlows[0].status = "idle";

    const merged = mergeProjectMediaForSave(incoming, existing);

    expect(merged.assets.map((asset) => asset.id)).toEqual([character.id, scene.id, video.id]);
    expect(merged.characterModels[0].confirmedImageId).toBe(character.id);
    expect(merged.sceneModels[0].confirmedImageId).toBe(scene.id);
    expect(merged.videoFlows[0].videoAssetId).toBe(video.id);
    expect(merged.videoFlows[0].status).toBe("ready");
  });

  it("allows intentional regeneration clears to replace old model images", () => {
    const existing = createDemoProject();
    const character = imageAsset("asset-character");
    existing.assets = [character];
    existing.characterModels[0].candidateImages = [character];
    existing.characterModels[0].confirmedImageId = character.id;

    const incoming = createDemoProject();
    incoming.id = existing.id;
    incoming.characterModels[0].candidateImages = [];
    incoming.characterModels[0].confirmedImageId = undefined;
    incoming.characterModels[0].status = "generating";

    const merged = mergeProjectMediaForSave(incoming, existing);

    expect(merged.characterModels[0].candidateImages).toEqual([]);
    expect(merged.characterModels[0].confirmedImageId).toBeUndefined();
    expect(merged.assets.map((asset) => asset.id)).toEqual([character.id]);
  });

  it("allows intentional video invalidation to clear the ready video reference", () => {
    const existing = createDemoProject();
    const video = videoAsset("asset-video");
    existing.assets = [video];
    existing.videoFlows[0].videoAssetId = video.id;
    existing.videoFlows[0].status = "ready";

    const incoming = createDemoProject();
    incoming.id = existing.id;
    incoming.videoFlows[0].videoAssetId = undefined;
    incoming.videoFlows[0].status = "idle";
    incoming.videoFlows[0].nodes.videoNode.stale = true;
    incoming.videoFlows[0].nodes.previewNode.stale = true;

    const merged = mergeProjectMediaForSave(incoming, existing);

    expect(merged.videoFlows[0].videoAssetId).toBeUndefined();
    expect(merged.assets.map((asset) => asset.id)).toEqual([video.id]);
  });
});
