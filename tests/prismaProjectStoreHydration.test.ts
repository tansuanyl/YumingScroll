import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/data/demoProject";
import { getProjectGallerySections } from "../src/lib/projectGallery";
import { mergeProjectSnapshotForRead } from "../server/services/PrismaProjectStore";
import type { MediaAsset } from "../src/types/domain";

function imageAsset(id: string): MediaAsset {
  return {
    id,
    type: "image",
    url: `/media/${id}.png`,
    provider: "mock",
    prompt: `prompt ${id}`,
    createdAt: "2026-05-16T00:00:00.000Z"
  };
}

function videoAsset(id: string): MediaAsset {
  return {
    id,
    type: "video",
    url: `/media/${id}.mp4`,
    provider: "mock",
    prompt: `prompt ${id}`,
    createdAt: "2026-05-16T00:00:00.000Z"
  };
}

describe("PrismaProjectStore project hydration", () => {
  it("keeps gallery assets from the Project JSON snapshot when split rows are stale", () => {
    const snapshot = createDemoProject();
    const character = imageAsset("asset-character-confirmed");
    const scene = imageAsset("asset-scene-confirmed");
    const video = videoAsset("asset-video-ready");

    snapshot.assets = [character, scene, video];
    snapshot.characterModels[0].candidateImages = [character];
    snapshot.characterModels[0].confirmedImageId = character.id;
    snapshot.sceneModels[0].candidateImages = [scene];
    snapshot.sceneModels[0].confirmedImageId = scene.id;
    snapshot.videoFlows[0].videoAssetId = video.id;
    snapshot.videoFlows[0].status = "ready";

    const staleCharacterRows = snapshot.characterModels.map((model) => ({
      ...model,
      candidateImages: [],
      confirmedImageId: undefined
    }));
    const staleSceneRows = snapshot.sceneModels.map((model) => ({
      ...model,
      candidateImages: [],
      confirmedImageId: undefined
    }));
    const staleVideoRows = snapshot.videoFlows.map((flow) => ({
      ...flow,
      videoAssetId: undefined,
      status: flow.status === "ready" ? "idle" : flow.status
    }));

    const hydrated = mergeProjectSnapshotForRead({
      snapshotCharacterModels: snapshot.characterModels,
      rowCharacterModels: staleCharacterRows,
      snapshotSceneModels: snapshot.sceneModels,
      rowSceneModels: staleSceneRows,
      snapshotVideoFlows: snapshot.videoFlows,
      rowVideoFlows: staleVideoRows,
      snapshotAssets: snapshot.assets,
      rowAssets: []
    });

    const gallery = getProjectGallerySections({ ...snapshot, ...hydrated });

    expect(gallery.characterImages.map((item) => item.asset.id)).toEqual([character.id]);
    expect(gallery.sceneImages.map((item) => item.asset.id)).toEqual([scene.id]);
    expect(gallery.videos.map((item) => item.asset.id)).toEqual([video.id]);
  });

  it("keeps Flow Map node positions from the Project JSON snapshot when split rows are stale", () => {
    const snapshot = createDemoProject();
    snapshot.characterModels[0].flowMapOffset = { x: 24, y: -18 };
    snapshot.sceneModels[0].flowMapOffset = { x: -32, y: 45 };
    snapshot.videoFlows[0].flowMapOffsets = {
      imagePrompt: { x: 120, y: 80 },
      script: { x: 96, y: -64 },
      video: { x: -40, y: 16 }
    };

    const staleCharacterRows = snapshot.characterModels.map((model) => ({
      ...model,
      flowMapOffset: undefined
    }));
    const staleSceneRows = snapshot.sceneModels.map((model) => ({
      ...model,
      flowMapOffset: undefined
    }));
    const staleVideoRows = snapshot.videoFlows.map((flow) => ({
      ...flow,
      flowMapOffsets: undefined
    }));

    const hydrated = mergeProjectSnapshotForRead({
      snapshotCharacterModels: snapshot.characterModels,
      rowCharacterModels: staleCharacterRows,
      snapshotSceneModels: snapshot.sceneModels,
      rowSceneModels: staleSceneRows,
      snapshotVideoFlows: snapshot.videoFlows,
      rowVideoFlows: staleVideoRows,
      snapshotAssets: snapshot.assets,
      rowAssets: []
    });

    expect(hydrated.characterModels[0].flowMapOffset).toEqual({ x: 24, y: -18 });
    expect(hydrated.sceneModels[0].flowMapOffset).toEqual({ x: -32, y: 45 });
    expect(hydrated.videoFlows[0].flowMapOffsets).toEqual({
      imagePrompt: { x: 120, y: 80 },
      script: { x: 96, y: -64 },
      video: { x: -40, y: 16 }
    });
  });
});
