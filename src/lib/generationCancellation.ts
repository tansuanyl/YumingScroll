import type { Project, VideoFlow } from "../types/domain";

export function createGenerationRequestId(kind: string, targetId: string): string {
  const safeKind = sanitizeRequestIdPart(kind);
  const safeTarget = sanitizeRequestIdPart(targetId).slice(0, 48);
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${safeKind}-${safeTarget}-${Date.now().toString(36)}-${randomPart}`;
}

export function isGenerationRequestCurrent(currentRequestId: string | undefined, expectedRequestId?: string): boolean {
  if (!expectedRequestId) return true;
  return currentRequestId === expectedRequestId;
}

export function startTextGeneration(project: Project, generationRequestId: string): Project {
  return {
    ...project,
    textGenerationRequestId: generationRequestId,
    storyState: {
      ...project.storyState,
      textGenerationRequestId: generationRequestId
    }
  };
}

export function cancelTextGeneration(project: Project, generationRequestId?: string): Project {
  if (!isGenerationRequestCurrent(getTextGenerationRequestId(project), generationRequestId)) return project;
  return {
    ...project,
    textGenerationRequestId: undefined,
    storyState: {
      ...project.storyState,
      textGenerationRequestId: undefined
    }
  };
}

export function getTextGenerationRequestId(project: Project): string | undefined {
  return project.textGenerationRequestId || project.storyState.textGenerationRequestId;
}

export function startCharacterImageGeneration(
  project: Project,
  modelId: string,
  generationRequestId: string,
  imageAspectRatio?: string
): Project {
  return {
    ...project,
    characterModels: project.characterModels.map((model) =>
      model.id === modelId
        ? {
            ...model,
            candidateImages: [],
            confirmedImageId: undefined,
            status: "generating" as const,
            error: undefined,
            generationRequestId,
            imageAspectRatio: imageAspectRatio || model.imageAspectRatio || "3:4"
          }
        : model
    )
  };
}

export function cancelCharacterImageGeneration(project: Project, modelId: string, generationRequestId?: string): Project {
  return {
    ...project,
    characterModels: project.characterModels.map((model) => {
      if (model.id !== modelId || !isGenerationRequestCurrent(model.generationRequestId, generationRequestId)) return model;
      return {
        ...model,
        candidateImages: [],
        confirmedImageId: undefined,
        status: "idle" as const,
        error: undefined,
        generationRequestId: undefined
      };
    })
  };
}

export function startSceneImageGeneration(
  project: Project,
  modelId: string,
  generationRequestId: string,
  imageAspectRatio?: string
): Project {
  return {
    ...project,
    sceneModels: project.sceneModels.map((model) =>
      model.id === modelId
        ? {
            ...model,
            candidateImages: [],
            confirmedImageId: undefined,
            status: "generating" as const,
            error: undefined,
            generationRequestId,
            imageAspectRatio: imageAspectRatio || model.imageAspectRatio || "16:9"
          }
        : model
    )
  };
}

export function cancelSceneImageGeneration(project: Project, modelId: string, generationRequestId?: string): Project {
  return {
    ...project,
    sceneModels: project.sceneModels.map((model) => {
      if (model.id !== modelId || !isGenerationRequestCurrent(model.generationRequestId, generationRequestId)) return model;
      return {
        ...model,
        candidateImages: [],
        confirmedImageId: undefined,
        status: "idle" as const,
        error: undefined,
        generationRequestId: undefined
      };
    })
  };
}

export function startImagePromptReferenceGeneration(
  project: Project,
  flowId: string,
  generationRequestId: string,
  imageAspectRatio: string
): Project {
  return withUpdatedFlow(project, flowId, (flow) => ({
    ...flow,
    imagePromptImageUrl: undefined,
    imagePromptImageName: undefined,
    videoAssetId: undefined,
    pendingVideoJobId: undefined,
    status: flow.status === "ready" ? "idle" : flow.status,
    nodes: {
      ...flow.nodes,
      promptNode: {
        ...flow.nodes.promptNode,
        status: "generating" as const,
        stale: false,
        error: undefined,
        candidateImages: [],
        confirmedImageId: undefined,
        imageAspectRatio,
        generationRequestId
      },
      videoNode: { ...flow.nodes.videoNode, status: "idle" as const, stale: true, error: undefined },
      previewNode: { ...flow.nodes.previewNode, status: "idle" as const, stale: true, error: undefined }
    }
  }));
}

export function cancelImagePromptReferenceGeneration(project: Project, flowId: string, generationRequestId?: string): Project {
  return withUpdatedFlow(project, flowId, (flow) => {
    if (!isGenerationRequestCurrent(flow.nodes.promptNode.generationRequestId, generationRequestId)) return flow;
    return {
      ...flow,
      imagePromptImageUrl: undefined,
      imagePromptImageName: undefined,
      pendingVideoJobId: undefined,
      nodes: {
        ...flow.nodes,
        promptNode: {
          ...flow.nodes.promptNode,
          status: "idle" as const,
          error: undefined,
          candidateImages: [],
          confirmedImageId: undefined,
          generationRequestId: undefined
        }
      }
    };
  });
}

export function startVideoGeneration(project: Project, flowId: string, generationRequestId: string): Project {
  return withUpdatedFlow(project, flowId, (flow) => ({
    ...flow,
    status: "generating",
    error: undefined,
    videoAssetId: undefined,
    pendingVideoJobId: undefined,
    firstFrameImageAssetId: undefined,
    lastFrameImageAssetId: undefined,
    generationRequestId,
    nodes: {
      ...flow.nodes,
      videoNode: {
        ...flow.nodes.videoNode,
        status: "generating" as const,
        stale: false,
        error: undefined,
        generationRequestId
      },
      previewNode: { ...flow.nodes.previewNode, status: "idle" as const, stale: false, error: undefined }
    }
  }));
}

export function cancelVideoGeneration(project: Project, flowId: string, generationRequestId?: string): Project {
  return withUpdatedFlow(project, flowId, (flow) => {
    if (!isGenerationRequestCurrent(flow.generationRequestId, generationRequestId)) return flow;
    return {
      ...flow,
      status: "idle" as const,
      error: undefined,
      pendingVideoJobId: undefined,
      generationRequestId: undefined,
      nodes: {
        ...flow.nodes,
        videoNode: {
          ...flow.nodes.videoNode,
          status: "idle" as const,
          error: undefined,
          generationRequestId: undefined
        },
        previewNode: {
          ...flow.nodes.previewNode,
          status: "idle" as const,
          error: undefined
        }
      }
    };
  });
}

function withUpdatedFlow(project: Project, flowId: string, update: (flow: VideoFlow) => VideoFlow): Project {
  return {
    ...project,
    videoFlows: project.videoFlows.map((flow) => (flow.id === flowId ? update(flow) : flow))
  };
}

function sanitizeRequestIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "generation";
}
