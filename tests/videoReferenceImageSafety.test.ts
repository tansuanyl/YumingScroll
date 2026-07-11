import sharp from "sharp";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/data/demoProject";
import type { MediaAsset } from "../src/types/domain";
import type { MediaJob, SeedanceMediaProvider } from "../server/providers/SeedanceMediaProvider";
import { MediaPipelineService } from "../server/services/MediaPipelineService";
import { ProjectStore } from "../server/services/ProjectStore";
import { applyCharacterReferenceSafetyOverlay } from "../server/services/VideoReferenceImageSafety";

describe("video reference image safety", () => {
  it("adds a lightweight eye mist overlay to character reference images", async () => {
    const payload = {
      body: Buffer.from(characterSheetSvg(960, 1280)),
      contentType: "image/svg+xml"
    };

    const processed = await applyCharacterReferenceSafetyOverlay(payload);
    const metadata = await sharp(processed.body).metadata();
    const eyePixel = await sharp(processed.body)
      .extract({ left: 160, top: 145, width: 1, height: 1 })
      .raw()
      .toBuffer();
    const clearPixel = await sharp(processed.body)
      .extract({ left: 160, top: 500, width: 1, height: 1 })
      .raw()
      .toBuffer();

    expect(processed.contentType).toBe("image/png");
    expect(metadata.width).toBe(960);
    expect(metadata.height).toBe(1280);
    expect(Array.from(eyePixel)).not.toEqual(Array.from(clearPixel));
  });

  it("sends safety-processed character references to video generation without changing scene references", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-safe-reference-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      const characterAsset = makeImageAsset("asset-character-safe", "character-sheet");
      const sceneAsset = makeImageAsset("asset-scene", "scene-sheet");
      project.characterModels[0].candidateImages = [characterAsset];
      project.characterModels[0].confirmedImageId = characterAsset.id;
      project.sceneModels[0].candidateImages = [sceneAsset];
      project.sceneModels[0].confirmedImageId = sceneAsset.id;
      project.assets = [characterAsset, sceneAsset];
      await store.save(project);

      let capturedCharacterUrls: string[] = [];
      let capturedSceneUrls: string[] = [];
      const provider = {
        status: () => ({
          provider: "ark",
          mode: "live",
          baseUrl: "https://ark.example.test",
          imageModel: "seedream",
          videoModel: "seedance",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateCharacterImage: async (): Promise<MediaJob> => ({ jobId: "unused", status: "ready", assets: [] }),
        generateSceneImage: async (): Promise<MediaJob> => ({ jobId: "unused", status: "ready", assets: [] }),
        generateVideo: async (input: Parameters<SeedanceMediaProvider["generateVideo"]>[0]): Promise<MediaJob> => {
          capturedCharacterUrls = input.characterImageUrls || [];
          capturedSceneUrls = input.sceneImageUrls || [];
          return {
            jobId: "video-job-safe-reference",
            status: "ready",
            asset: {
              id: "asset-video-safe-reference",
              type: "video",
              url: "https://example.test/video.mp4",
              provider: "seedance",
              prompt: input.prompt,
              jobId: "video-job-safe-reference",
              createdAt: new Date().toISOString()
            }
          };
        },
        getJob: async (jobId: string): Promise<MediaJob> => ({ jobId, status: "ready" })
      } as unknown as SeedanceMediaProvider;

      const service = new MediaPipelineService(store, provider, {
        persistAsset: async (_projectId: string, asset: MediaAsset) => asset,
        persistAssets: async (_projectId: string, assets: MediaAsset[]) => assets,
        loadAsset: async (asset: MediaAsset) => ({
          body: Buffer.from(asset.id === characterAsset.id ? characterSheetSvg(960, 1280) : sceneSvg(960, 540)),
          contentType: "image/svg+xml"
        })
      } as never);

      await service.generateVideo({
        projectId: project.id,
        flowId: project.videoFlows[0].id,
        characterModelIds: [project.characterModels[0].id],
        sceneModelIds: [project.sceneModels[0].id],
        prompt: "Current 15 second segment",
        aspectRatio: "9:16",
        durationSeconds: 15
      });

      expect(capturedCharacterUrls).toHaveLength(1);
      expect(capturedCharacterUrls[0]).toMatch(/^data:image\/png;base64,/);
      expect(capturedSceneUrls).toEqual([sceneAsset.url]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function makeImageAsset(id: string, label: string): MediaAsset {
  return {
    id,
    type: "image",
    url: `data:image/svg+xml;base64,${Buffer.from(label === "character-sheet" ? characterSheetSvg(960, 1280) : sceneSvg(960, 540)).toString("base64")}`,
    provider: "seedance",
    prompt: label,
    jobId: `job-${id}`,
    createdAt: new Date().toISOString()
  };
}

function characterSheetSvg(width: number, height: number): string {
  const third = width / 3;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#f7f7f2"/>
    ${[0, 1, 2]
      .map((index) => {
        const center = third * index + third / 2;
        return `<g>
          <ellipse cx="${center}" cy="${height * 0.14}" rx="${third * 0.18}" ry="${height * 0.055}" fill="#c9b09e"/>
          <circle cx="${center - third * 0.055}" cy="${height * 0.113}" r="8" fill="#111827"/>
          <circle cx="${center + third * 0.055}" cy="${height * 0.113}" r="8" fill="#111827"/>
          <rect x="${center - third * 0.16}" y="${height * 0.22}" width="${third * 0.32}" height="${height * 0.56}" fill="#334155"/>
        </g>`;
      })
      .join("")}
  </svg>`;
}

function sceneSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="#0f172a"/>
    <rect x="120" y="160" width="720" height="260" fill="#334155"/>
  </svg>`;
}
