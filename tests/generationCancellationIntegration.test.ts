import express from "express";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { MediaAsset, StoryState } from "../src/types/domain";
import { createDemoProject } from "../src/data/demoProject";
import {
  cancelCharacterImageGeneration,
  cancelTextGeneration,
  startCharacterImageGeneration,
  startTextGeneration
} from "../src/lib/generationCancellation";
import { createTextRouter } from "../server/routes/text";
import type { MediaJob, SeedanceMediaProvider } from "../server/providers/SeedanceMediaProvider";
import { MediaPipelineService } from "../server/services/MediaPipelineService";
import { ProjectStore } from "../server/services/ProjectStore";
import type { TextPipelineService } from "../server/services/TextPipelineService";

describe("generation cancellation integration", () => {
  it("does not save a late character image batch after the matching request is cancelled", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-cancel-image-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const initialProject = createDemoProject();
      const modelId = initialProject.characterModels[0].id;
      const project = await store.save(startCharacterImageGeneration(initialProject, modelId, "image-request-1", "3:4"));
      const lateAssets = [makeImageAsset("late-image-1", "late-job-1")];
      const provider = {
        status: () => ({
          provider: "generic",
          mode: "mock",
          baseUrl: "",
          imageModel: "mock-image",
          videoModel: "mock-video",
          imageApi: "seedream",
          videoApi: "seedance"
        }),
        generateCharacterImage: async (): Promise<MediaJob> => {
          const latest = await store.get(project.id);
          if (!latest) throw new Error("Project not found");
          await store.save(cancelCharacterImageGeneration(latest, modelId, "image-request-1"));
          return { jobId: "late-job-1", status: "ready", assets: lateAssets };
        },
        generateSceneImage: async (): Promise<MediaJob> => ({ jobId: "unused", status: "ready", assets: [] }),
        generateVideo: async (): Promise<MediaJob> => ({ jobId: "unused", status: "ready" }),
        getJob: async (jobId: string): Promise<MediaJob> => ({ jobId, status: "ready" })
      } as unknown as SeedanceMediaProvider;
      const service = new MediaPipelineService(store, provider, {
        persistAsset: async (_projectId: string, asset: MediaAsset) => asset,
        persistAssets: async (_projectId: string, assets: MediaAsset[]) => assets
      } as never);

      const next = await service.generateCharacterImage({
        projectId: project.id,
        characterModelId: modelId,
        generationRequestId: "image-request-1"
      });

      expect(next.characterModels[0].status).toBe("idle");
      expect(next.characterModels[0].candidateImages).toEqual([]);
      expect(next.assets.find((asset) => asset.id === "late-image-1")).toBeUndefined();
      await expect(store.listGenerationJobs(project.id)).resolves.toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not overwrite a project with a late storyboard script result after cancellation", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-cancel-story-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const originalProject = createDemoProject({ inspiration: "Original story" });
      const project = await store.save(startTextGeneration(originalProject, "text-request-1"));
      const replacementStory: StoryState = {
        ...createDemoProject({ inspiration: "Replacement story" }).storyState,
        world: {
          ...createDemoProject({ inspiration: "Replacement story" }).storyState.world,
          title: "Replacement Should Not Save"
        }
      };
      const fakeText = {
        status: () => ({ provider: "openai", mode: "mock", model: "fake" }),
        generateStory: async () => {
          const latest = await store.get(project.id);
          if (!latest) throw new Error("Project not found");
          await store.save(cancelTextGeneration(latest, "text-request-1"));
          return replacementStory;
        },
        regenerateSection: async () => ({}),
        reviseSeedanceScript: async () => replacementStory.seedanceScript
      } as unknown as TextPipelineService;
      const app = express();
      app.use(express.json());
      app.use("/api/text", createTextRouter(store, fakeText));
      const server = app.listen(0);
      try {
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Test server did not start");
        const response = await fetch(`http://127.0.0.1:${address.port}/api/text/generate-story`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            generationRequestId: "text-request-1",
            inspiration: "Replacement request"
          })
        });
        expect(response.ok).toBe(true);
        const updated = await response.json();
        expect(updated.textGenerationRequestId).toBeUndefined();
        expect(updated.storyState.world.title).not.toBe("Replacement Should Not Save");
        expect(updated.status).toBe(originalProject.status);
      } finally {
        await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function makeImageAsset(id: string, jobId: string): MediaAsset {
  return {
    id,
    type: "image",
    url: `https://example.test/${id}.png`,
    provider: "mock",
    prompt: "late result",
    jobId,
    createdAt: new Date().toISOString()
  };
}
