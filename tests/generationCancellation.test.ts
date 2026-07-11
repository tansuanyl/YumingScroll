import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/data/demoProject";
import {
  cancelCharacterImageGeneration,
  cancelImagePromptReferenceGeneration,
  cancelTextGeneration,
  cancelVideoGeneration,
  startCharacterImageGeneration,
  startImagePromptReferenceGeneration,
  startTextGeneration,
  startVideoGeneration
} from "../src/lib/generationCancellation";

describe("generation cancellation state helpers", () => {
  it("marks character image generation with a request id and cancels only the matching request", () => {
    const project = createDemoProject();
    const modelId = project.characterModels[0].id;

    const started = startCharacterImageGeneration(project, modelId, "character-request-1", "3:4");
    expect(started.characterModels[0]).toMatchObject({
      status: "generating",
      generationRequestId: "character-request-1",
      candidateImages: [],
      confirmedImageId: undefined,
      error: undefined,
      imageAspectRatio: "3:4"
    });

    const ignored = cancelCharacterImageGeneration(started, modelId, "other-request");
    expect(ignored.characterModels[0].status).toBe("generating");
    expect(ignored.characterModels[0].generationRequestId).toBe("character-request-1");

    const cancelled = cancelCharacterImageGeneration(started, modelId, "character-request-1");
    expect(cancelled.characterModels[0]).toMatchObject({
      status: "idle",
      generationRequestId: undefined,
      candidateImages: [],
      confirmedImageId: undefined,
      error: undefined
    });
  });

  it("clears cancellable image prompt and video generation without leaving pending jobs", () => {
    const project = createDemoProject();
    const flowId = project.videoFlows[0].id;

    const imagePromptStarted = startImagePromptReferenceGeneration(project, flowId, "image-prompt-request-1", "9:16");
    expect(imagePromptStarted.videoFlows[0].nodes.promptNode).toMatchObject({
      status: "generating",
      generationRequestId: "image-prompt-request-1",
      candidateImages: [],
      confirmedImageId: undefined,
      error: undefined,
      imageAspectRatio: "9:16"
    });

    const imagePromptCancelled = cancelImagePromptReferenceGeneration(
      imagePromptStarted,
      flowId,
      "image-prompt-request-1"
    );
    expect(imagePromptCancelled.videoFlows[0].nodes.promptNode).toMatchObject({
      status: "idle",
      generationRequestId: undefined,
      candidateImages: [],
      confirmedImageId: undefined,
      error: undefined
    });
    expect(imagePromptCancelled.videoFlows[0].pendingVideoJobId).toBeUndefined();

    const videoStarted = startVideoGeneration(project, flowId, "video-request-1");
    expect(videoStarted.videoFlows[0]).toMatchObject({
      status: "generating",
      generationRequestId: "video-request-1",
      pendingVideoJobId: undefined,
      videoAssetId: undefined,
      error: undefined
    });
    expect(videoStarted.videoFlows[0].nodes.videoNode.generationRequestId).toBe("video-request-1");

    const videoCancelled = cancelVideoGeneration(videoStarted, flowId, "video-request-1");
    expect(videoCancelled.videoFlows[0]).toMatchObject({
      status: "idle",
      generationRequestId: undefined,
      pendingVideoJobId: undefined,
      error: undefined
    });
    expect(videoCancelled.videoFlows[0].nodes.videoNode).toMatchObject({
      status: "idle",
      generationRequestId: undefined,
      error: undefined
    });
  });

  it("tracks storyboard script generation on the project so late text results can be discarded", () => {
    const project = createDemoProject();
    const started = startTextGeneration(project, "text-request-1");
    expect(started.textGenerationRequestId).toBe("text-request-1");

    const ignored = cancelTextGeneration(started, "other-request");
    expect(ignored.textGenerationRequestId).toBe("text-request-1");

    const cancelled = cancelTextGeneration(started, "text-request-1");
    expect(cancelled.textGenerationRequestId).toBeUndefined();
  });
});
