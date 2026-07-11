import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/data/demoProject";
import { findProjectAsset, removeProjectAsset } from "../src/lib/projectAssets";
import type { MediaAsset } from "../src/types/domain";

function imageAsset(id: string): MediaAsset {
  return {
    id,
    type: "image",
    url: `/media/${id}.png`,
    provider: "mock",
    prompt: `prompt ${id}`,
    createdAt: "2026-05-20T00:00:00.000Z"
  };
}

function videoAsset(id: string): MediaAsset {
  return {
    id,
    type: "video",
    url: `/media/${id}.mp4`,
    provider: "mock",
    prompt: `prompt ${id}`,
    createdAt: "2026-05-20T00:00:00.000Z"
  };
}

describe("project asset deletion", () => {
  it("removes a confirmed character image from assets and model references", () => {
    const project = createDemoProject();
    const confirmed = imageAsset("asset-character-confirmed");
    const other = imageAsset("asset-character-other");
    project.assets = [confirmed, other];
    project.characterModels[0].candidateImages = [confirmed, other];
    project.characterModels[0].confirmedImageId = confirmed.id;
    project.characterModels[0].status = "ready";

    const { project: next, asset } = removeProjectAsset(project, confirmed.id);

    expect(asset?.id).toBe(confirmed.id);
    expect(next.assets.map((item) => item.id)).toEqual([other.id]);
    expect(next.characterModels[0].candidateImages.map((item) => item.id)).toEqual([other.id]);
    expect(next.characterModels[0].confirmedImageId).toBeUndefined();
    expect(next.characterModels[0].status).toBe("idle");
  });

  it("removes candidate-only images even when they are missing from project assets", () => {
    const project = createDemoProject();
    const candidate = imageAsset("asset-candidate-only");
    project.assets = [];
    project.sceneModels[0].candidateImages = [candidate];

    expect(findProjectAsset(project, candidate.id)?.id).toBe(candidate.id);

    const { project: next, asset } = removeProjectAsset(project, candidate.id);

    expect(asset?.id).toBe(candidate.id);
    expect(next.sceneModels[0].candidateImages).toEqual([]);
  });

  it("clears generated video state when deleting a video asset", () => {
    const project = createDemoProject();
    const video = videoAsset("asset-video-ready");
    project.assets = [video];
    project.videoFlows[0] = {
      ...project.videoFlows[0],
      videoAssetId: video.id,
      firstFrameImageAssetId: "asset-first-frame",
      lastFrameImageAssetId: "asset-last-frame",
      status: "ready",
      nodes: {
        ...project.videoFlows[0].nodes,
        videoNode: { ...project.videoFlows[0].nodes.videoNode, status: "ready" },
        previewNode: { ...project.videoFlows[0].nodes.previewNode, status: "ready" }
      }
    };

    const { project: next } = removeProjectAsset(project, video.id);

    expect(next.assets).toEqual([]);
    expect(next.videoFlows[0].videoAssetId).toBeUndefined();
    expect(next.videoFlows[0].firstFrameImageAssetId).toBeUndefined();
    expect(next.videoFlows[0].lastFrameImageAssetId).toBeUndefined();
    expect(next.videoFlows[0].status).toBe("idle");
    expect(next.videoFlows[0].nodes.videoNode).toMatchObject({ status: "idle", stale: true });
    expect(next.videoFlows[0].nodes.previewNode).toMatchObject({ status: "idle", stale: true });
  });
});
