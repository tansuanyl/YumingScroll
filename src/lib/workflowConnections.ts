import type { CharacterModel, MediaAsset, Project, SceneModel, StoryboardShot, VideoFlow, VisualPrompt, WorkflowEdge } from "../types/domain";

export type WorkflowSourceKind = "character" | "scene" | "imagePrompt" | "script";
export type WorkflowInputKind = "character" | "scene" | "imagePrompt" | "script";
export type WorkflowModelKind = "character" | "scene";
export type WorkflowSegmentSourceKind = Extract<WorkflowSourceKind, "imagePrompt" | "script">;

export type WorkflowConnectionInput = {
  fromFlowId?: string;
  sourceId?: string;
  toFlowId: string;
  sourceKind: WorkflowSourceKind;
  inputKind: WorkflowInputKind;
};

export type WorkflowConnection = WorkflowConnectionInput & {
  id: string;
  edgeIds: string[];
};

export type WorkflowEdgeInput = Omit<WorkflowEdge, "id" | "createdAt" | "updatedAt"> & {
  id?: string;
};

const expectedInputBySource: Record<WorkflowSourceKind, WorkflowInputKind> = {
  character: "character",
  scene: "scene",
  imagePrompt: "imagePrompt",
  script: "script"
};

export function createWorkflowEdgesForConnection(project: Project, input: WorkflowConnectionInput): WorkflowEdgeInput[] {
  if (expectedInputBySource[input.sourceKind] !== input.inputKind) return [];
  const targetFlow = project.videoFlows.find((flow) => flow.id === input.toFlowId);
  if (!targetFlow) return [];

  if (input.sourceKind === "character") {
    const sourceIds = input.sourceId
      ? [input.sourceId]
      : getSourceFlow(project, input.fromFlowId)
        ? getSelectedCharacterIds(getSourceFlow(project, input.fromFlowId) as VideoFlow)
        : [];
    return sourceIds
      .filter((sourceId) => project.characterModels.some((model) => model.id === sourceId))
      .map((sourceId) => ({
      sourceType: "characterModel",
      sourceId,
      sourcePort: "output",
      targetType: "videoFlow",
      targetId: targetFlow.id,
      targetPort: "character",
      kind: "character-reference",
      metadata: createMetadata(input, sourceId)
    }));
  }

  if (input.sourceKind === "scene") {
    const sourceIds = input.sourceId
      ? [input.sourceId]
      : getSourceFlow(project, input.fromFlowId)
        ? getSelectedSceneIds(getSourceFlow(project, input.fromFlowId) as VideoFlow)
        : [];
    return sourceIds
      .filter((sourceId) => project.sceneModels.some((model) => model.id === sourceId))
      .map((sourceId) => ({
      sourceType: "sceneModel",
      sourceId,
      sourcePort: "output",
      targetType: "videoFlow",
      targetId: targetFlow.id,
      targetPort: "scene",
      kind: "scene-reference",
      metadata: createMetadata(input, sourceId)
    }));
  }

  const sourceFlow = getSourceFlow(project, input.fromFlowId);
  if (!sourceFlow) return [];
  const metadata = createMetadata(input, sourceFlow.id);

  if (input.sourceKind === "imagePrompt") {
    return [
      {
        sourceType: "imagePrompt",
        sourceId: sourceFlow.id,
        sourcePort: "output",
        targetType: "videoFlow",
        targetId: targetFlow.id,
        targetPort: "imagePrompt",
        kind: "image-prompt",
        metadata
      }
    ];
  }

  return [
    {
      sourceType: "script",
      sourceId: sourceFlow.shotId,
      sourcePort: "output",
      targetType: "videoFlow",
      targetId: targetFlow.id,
      targetPort: "script",
      kind: "script",
      metadata
    }
  ];
}

export function deriveWorkflowConnectionsFromEdges(project: Project): WorkflowConnection[] {
  const byId = new Map<string, WorkflowConnection>();
  for (const edge of project.workflowEdges) {
    const sourceKind = getSourceKind(edge);
    if (!sourceKind) continue;
    const fromFlowId = getSourceFlowId(project, edge, sourceKind);
    if (!fromFlowId && sourceKind !== "character" && sourceKind !== "scene") continue;
    if (
      sourceKind !== "character" &&
      sourceKind !== "scene" &&
      fromFlowId === edge.targetId &&
      typeof edge.metadata?.fromFlowId !== "string"
    ) {
      continue;
    }
    const sourceKey = sourceKind === "character" || sourceKind === "scene" ? edge.sourceId : fromFlowId;
    if (!sourceKey) continue;
    const id = createConnectionId(sourceKey, edge.targetId, sourceKind);
    const existing = byId.get(id);
    if (existing) {
      byId.set(id, {
        ...existing,
        edgeIds: Array.from(new Set([...existing.edgeIds, edge.id]))
      });
      continue;
    }
    byId.set(id, {
      id,
      fromFlowId,
      sourceId: edge.sourceId,
      toFlowId: edge.targetId,
      sourceKind,
      inputKind: edge.targetPort,
      edgeIds: [edge.id]
    });
  }
  return Array.from(byId.values());
}

export function applyWorkflowConnectionToProject(project: Project, input: WorkflowConnectionInput): Project {
  const targetFlow = project.videoFlows.find((flow) => flow.id === input.toFlowId);
  if (!targetFlow) return project;
  const sourceFlow = getSourceFlow(project, input.fromFlowId);

  return {
    ...project,
    videoFlows: project.videoFlows.map((flow) =>
      flow.id === targetFlow.id ? applyConnectionToFlow(sourceFlow, flow, input.sourceKind, input.sourceId) : flow
    ),
    updatedAt: new Date().toISOString()
  };
}

export function createWorkflowModelSource(
  project: Project,
  kind: WorkflowModelKind,
  input: { id?: string; name?: string; description?: string; now?: string } = {}
): Project {
  const now = input.now || new Date().toISOString();
  const id = input.id || createManualModelId(project, kind);
  const name = normalizeModelName(kind, input.name);
  const description = input.description?.trim() || (kind === "character" ? "手动新增的人物模型框体。" : "手动新增的场景模型框体。");

  if (kind === "character") {
    if (project.characterModels.some((model) => model.id === id)) return project;
    const model: CharacterModel = {
      id,
      characterId: id,
      name,
      description,
      consistencyPrompt: `${name}，角色定妆图，同一角色保持同一张脸、发型、体型和服装气质，不要和其他人物混脸。`,
      imageAspectRatio: "3:4",
      candidateImages: [],
      status: "idle"
    };

    return {
      ...project,
      characterModels: [...project.characterModels, model],
      updatedAt: now
    };
  }

  if (project.sceneModels.some((model) => model.id === id)) return project;
  const model: SceneModel = {
    id,
    name,
    description,
    visualKeywords: [name],
    generationPrompt: [
      `场景空间：${name}`,
      `空间与氛围：${description}`,
      "空场景，空间结构清楚，透视稳定，不要人物，不要角色，不要人影，不要可读文字，不要logo，不要水印。"
    ].join("\n"),
    imageAspectRatio: "9:16",
    candidateImages: [],
    status: "idle"
  };

  return {
    ...project,
    sceneModels: [...project.sceneModels, model],
    updatedAt: now
  };
}

export function createWorkflowModelSourceFromGalleryAsset(
  project: Project,
  kind: WorkflowModelKind,
  input: { asset: MediaAsset; id?: string; name?: string; title?: string; description?: string; now?: string }
): Project {
  if (input.asset.type !== "image") return project;

  const alreadyUsed =
    kind === "character"
      ? project.characterModels.some((model) => model.confirmedImageId === input.asset.id)
      : project.sceneModels.some((model) => model.confirmedImageId === input.asset.id);
  if (alreadyUsed) return project;

  const now = input.now || new Date().toISOString();
  const id = input.id || createManualModelId(project, kind);
  if (kind === "character" && project.characterModels.some((model) => model.id === id)) return project;
  if (kind === "scene" && project.sceneModels.some((model) => model.id === id)) return project;

  const name = normalizeModelName(kind, input.name || normalizeGalleryModelName(input.title, kind));
  const description =
    input.description?.trim() ||
    (kind === "character" ? `来自 Gallery 图片「${name}」的人物模型框体。` : `来自 Gallery 图片「${name}」的场景模型框体。`);
  const assets = ensureGalleryAsset(project.assets, input.asset);

  if (kind === "character") {
    const model: CharacterModel = {
      id,
      characterId: id,
      name,
      description,
      consistencyPrompt: [
        `${name}，角色定妆图。`,
        input.asset.prompt || input.title || "",
        "以当前 Gallery 图片为已确认人物参考，同一角色保持同一张脸、发型、体型和服装气质，不要和其他人物混脸。"
      ]
        .filter(Boolean)
        .join("\n"),
      imageAspectRatio: "3:4",
      candidateImages: [input.asset],
      confirmedImageId: input.asset.id,
      status: "ready"
    };

    return {
      ...project,
      assets,
      characterModels: [...project.characterModels, model],
      updatedAt: now
    };
  }

  const model: SceneModel = {
    id,
    name,
    description,
    visualKeywords: [name],
    generationPrompt: [
      `场景空间：${name}`,
      `Gallery 图片参考：${input.asset.prompt || input.title || name}`,
      "按当前 Gallery 图片延展同一场景空间，保持空间结构、光影、色调和镜头质感一致。空场景，不要人物，不要角色，不要人影，不要可读文字，不要logo，不要水印。"
    ].join("\n"),
    imageAspectRatio: "9:16",
    candidateImages: [input.asset],
    confirmedImageId: input.asset.id,
    status: "ready"
  };

  return {
    ...project,
    assets,
    sceneModels: [...project.sceneModels, model],
    updatedAt: now
  };
}

export function createWorkflowVideoSegment(
  project: Project,
  input: { id?: string; shotId?: string; title?: string; now?: string } = {}
): Project {
  const now = input.now || new Date().toISOString();
  const shotId = input.shotId || createManualShotId(project);
  const flowId = input.id || createManualVideoFlowId(project);
  if (project.videoFlows.some((flow) => flow.id === flowId) || project.storyState.storyboard.some((shot) => shot.id === shotId)) {
    return project;
  }

  const title = normalizeVideoSegmentTitle(input.title);
  const shot = createManualStoryboardShot(project, shotId, title);
  const visualPrompt = createManualVisualPrompt(project, shot);
  const flow = createVideoFlowFromStoryboardShot(flowId, shot);

  return {
    ...project,
    storyState: {
      ...project.storyState,
      storyboard: [...project.storyState.storyboard, shot],
      visualPrompts: [...(project.storyState.visualPrompts || []), visualPrompt]
    },
    videoFlows: [...project.videoFlows, flow],
    updatedAt: now
  };
}

export function updateWorkflowModelName(project: Project, kind: WorkflowModelKind, modelId: string, name: string): Project {
  const nextName = normalizeModelName(kind, name);
  const now = new Date().toISOString();

  if (kind === "character") {
    let changed = false;
    const characterModels = project.characterModels.map((model) => {
      if (model.id !== modelId) return model;
      changed = changed || model.name !== nextName;
      return { ...model, name: nextName };
    });
    return changed ? { ...project, characterModels, updatedAt: now } : project;
  }

  let changed = false;
  const sceneModels = project.sceneModels.map((model) => {
    if (model.id !== modelId) return model;
    changed = changed || model.name !== nextName;
    return {
      ...model,
      name: nextName,
      visualKeywords: model.visualKeywords.length > 0 ? model.visualKeywords : [nextName]
    };
  });
  return changed ? { ...project, sceneModels, updatedAt: now } : project;
}

export function disconnectWorkflowModelFromFlow(
  project: Project,
  kind: WorkflowModelKind,
  modelId: string,
  flowId: string
): Project {
  const sourceType = getModelSourceType(kind);
  const targetPort = getModelTargetPort(kind);
  let removedEdge = false;
  const workflowEdges = project.workflowEdges.filter((edge) => {
    const matches =
      edge.sourceType === sourceType &&
      edge.sourceId === modelId &&
      edge.targetId === flowId &&
      edge.targetPort === targetPort;
    removedEdge = removedEdge || matches;
    return !matches;
  });
  let changedFlow = false;
  const videoFlows = project.videoFlows.map((flow) => {
    if (flow.id !== flowId) return flow;
    const result = removeModelFromFlowSelection(flow, kind, modelId);
    changedFlow = changedFlow || result.changed;
    return result.changed || removedEdge ? markFlowStale(result.flow) : flow;
  });

  return removedEdge || changedFlow
    ? {
        ...project,
        workflowEdges,
        videoFlows,
        updatedAt: new Date().toISOString()
      }
    : project;
}

export function disconnectWorkflowSegmentSourceFromFlow(
  project: Project,
  sourceKind: WorkflowSegmentSourceKind,
  fromFlowId: string,
  flowId: string
): Project {
  const sourceFlow = getSourceFlow(project, fromFlowId);
  const targetFlow = getSourceFlow(project, flowId);
  if (!sourceFlow || !targetFlow) return project;

  const sourceType = sourceKind === "imagePrompt" ? "imagePrompt" : "script";
  const targetPort = sourceKind === "imagePrompt" ? "imagePrompt" : "script";
  const kind = sourceKind === "imagePrompt" ? "image-prompt" : "script";
  let removedEdge = false;
  const workflowEdges = project.workflowEdges.filter((edge) => {
    const matches =
      edge.sourceType === sourceType &&
      edge.targetId === flowId &&
      edge.targetPort === targetPort &&
      edge.kind === kind &&
      getSourceFlowId(project, edge, sourceKind) === fromFlowId;
    removedEdge = removedEdge || matches;
    return !matches;
  });
  if (!removedEdge) return project;

  const videoFlows = project.videoFlows.map((flow) => {
    if (flow.id !== flowId) return flow;
    const restored = restoreSegmentSourceDefaults(project, sourceFlow, flow, sourceKind);
    return markFlowStale(restored);
  });

  return {
    ...project,
    workflowEdges,
    videoFlows,
    updatedAt: new Date().toISOString()
  };
}

export function deleteWorkflowModelSource(project: Project, kind: WorkflowModelKind, modelId: string): Project {
  const sourceType = getModelSourceType(kind);
  const targetPort = getModelTargetPort(kind);
  const removedFlowIds = new Set<string>();
  const workflowEdges = project.workflowEdges.filter((edge) => {
    const matches = edge.sourceType === sourceType && edge.sourceId === modelId && edge.targetPort === targetPort;
    if (matches) removedFlowIds.add(edge.targetId);
    return !matches;
  });
  const beforeModelCount = kind === "character" ? project.characterModels.length : project.sceneModels.length;
  const characterModels = kind === "character" ? project.characterModels.filter((model) => model.id !== modelId) : project.characterModels;
  const sceneModels = kind === "scene" ? project.sceneModels.filter((model) => model.id !== modelId) : project.sceneModels;
  const removedModel = (kind === "character" ? characterModels.length : sceneModels.length) !== beforeModelCount;
  let changedFlow = false;
  const videoFlows = project.videoFlows.map((flow) => {
    const result = removeModelFromFlowSelection(flow, kind, modelId);
    changedFlow = changedFlow || result.changed;
    return result.changed || removedFlowIds.has(flow.id) ? markFlowStale(result.flow) : flow;
  });

  return removedModel || removedFlowIds.size > 0 || changedFlow
    ? {
        ...project,
        characterModels,
        sceneModels,
        workflowEdges,
        videoFlows,
        updatedAt: new Date().toISOString()
      }
    : project;
}

function restoreSegmentSourceDefaults(
  project: Project,
  sourceFlow: VideoFlow,
  targetFlow: VideoFlow,
  sourceKind: WorkflowSegmentSourceKind
): VideoFlow {
  const targetShot = project.storyState.storyboard.find((shot) => shot.id === targetFlow.shotId);

  if (sourceKind === "imagePrompt") {
    const nextFlow = { ...targetFlow };
    if (targetFlow.imagePrompt === sourceFlow.imagePrompt) {
      nextFlow.imagePrompt = targetShot?.imagePrompt || "";
    }
    if (sourceFlow.imagePromptImageUrl && targetFlow.imagePromptImageUrl === sourceFlow.imagePromptImageUrl) {
      nextFlow.imagePromptImageUrl = undefined;
      nextFlow.imagePromptImageName = undefined;
    }
    return nextFlow;
  }

  const nextFlow = { ...targetFlow };
  if (targetFlow.prompt === sourceFlow.prompt) {
    nextFlow.prompt = targetShot?.videoPrompt || targetFlow.prompt;
  }
  if (targetFlow.actionDescription === sourceFlow.actionDescription) {
    nextFlow.actionDescription = targetShot?.characterActions || targetFlow.actionDescription;
  }
  return nextFlow;
}

function applyConnectionToFlow(
  sourceFlow: VideoFlow | undefined,
  targetFlow: VideoFlow,
  sourceKind: WorkflowSourceKind,
  sourceId?: string
): VideoFlow {
  if (sourceKind === "character") {
    const ids = sourceId ? appendUnique(getSelectedCharacterIds(targetFlow), sourceId) : sourceFlow ? getSelectedCharacterIds(sourceFlow) : [];
    return markFlowStale({
      ...targetFlow,
      selectedCharacterModelId: ids[0],
      selectedCharacterModelIds: ids
    });
  }

  if (sourceKind === "scene") {
    const ids = sourceId ? appendUnique(getSelectedSceneIds(targetFlow), sourceId) : sourceFlow ? getSelectedSceneIds(sourceFlow) : [];
    return markFlowStale({
      ...targetFlow,
      selectedSceneModelId: ids[0],
      selectedSceneModelIds: ids
    });
  }

  if (sourceKind === "imagePrompt") {
    if (!sourceFlow) return targetFlow;
    return markFlowStale({
      ...targetFlow,
      imagePrompt: sourceFlow.imagePrompt,
      imagePromptImageUrl: sourceFlow.imagePromptImageUrl,
      imagePromptImageName: sourceFlow.imagePromptImageName
    });
  }

  if (!sourceFlow) return targetFlow;
  return markFlowStale({
    ...targetFlow,
    prompt: sourceFlow.prompt,
    actionDescription: sourceFlow.actionDescription
  });
}

function markFlowStale(flow: VideoFlow): VideoFlow {
  return {
    ...flow,
    status: "idle",
    error: undefined,
    generationRequestId: undefined,
    nodes: {
      ...flow.nodes,
      videoNode: { ...flow.nodes.videoNode, stale: true, status: "idle", error: undefined, generationRequestId: undefined },
      previewNode: { ...flow.nodes.previewNode, stale: true, status: "idle", error: undefined }
    },
    videoAssetId: undefined,
    pendingVideoJobId: undefined,
    firstFrameImageAssetId: undefined,
    lastFrameImageAssetId: undefined
  };
}

function removeModelFromFlowSelection(flow: VideoFlow, kind: WorkflowModelKind, modelId: string): { flow: VideoFlow; changed: boolean } {
  if (kind === "character") {
    const previous = getSelectedCharacterIds(flow);
    const ids = removeId(previous, modelId);
    const changed = previous.length !== ids.length || flow.selectedCharacterModelId === modelId;
    return {
      changed,
      flow: changed
        ? {
            ...flow,
            selectedCharacterModelId: ids[0],
            selectedCharacterModelIds: ids
          }
        : flow
    };
  }

  const previous = getSelectedSceneIds(flow);
  const ids = removeId(previous, modelId);
  const changed = previous.length !== ids.length || flow.selectedSceneModelId === modelId;
  return {
    changed,
    flow: changed
      ? {
          ...flow,
          selectedSceneModelId: ids[0],
          selectedSceneModelIds: ids
        }
      : flow
  };
}

function getModelSourceType(kind: WorkflowModelKind): WorkflowEdge["sourceType"] {
  return kind === "character" ? "characterModel" : "sceneModel";
}

function getModelTargetPort(kind: WorkflowModelKind): WorkflowEdge["targetPort"] {
  return kind === "character" ? "character" : "scene";
}

function getSourceKind(edge: WorkflowEdge): WorkflowSourceKind | undefined {
  if (edge.sourceType === "characterModel" && edge.targetPort === "character" && edge.kind === "character-reference") {
    return "character";
  }
  if (edge.sourceType === "sceneModel" && edge.targetPort === "scene" && edge.kind === "scene-reference") {
    return "scene";
  }
  if (edge.sourceType === "imagePrompt" && edge.targetPort === "imagePrompt" && edge.kind === "image-prompt") {
    return "imagePrompt";
  }
  if (edge.sourceType === "script" && edge.targetPort === "script" && edge.kind === "script") {
    return "script";
  }
  return undefined;
}

function getSourceFlowId(project: Project, edge: WorkflowEdge, sourceKind: WorkflowSourceKind): string | undefined {
  const metadataFlowId = typeof edge.metadata?.fromFlowId === "string" ? edge.metadata.fromFlowId : undefined;
  if (metadataFlowId && project.videoFlows.some((flow) => flow.id === metadataFlowId)) return metadataFlowId;

  if (sourceKind === "character") {
    return project.videoFlows.find((flow) => getSelectedCharacterIds(flow).includes(edge.sourceId))?.id;
  }
  if (sourceKind === "scene") {
    return project.videoFlows.find((flow) => getSelectedSceneIds(flow).includes(edge.sourceId))?.id;
  }
  if (sourceKind === "imagePrompt") {
    return project.videoFlows.find((flow) => flow.id === edge.sourceId || flow.shotId === edge.sourceId)?.id;
  }
  return project.videoFlows.find((flow) => flow.shotId === edge.sourceId)?.id;
}

function createConnectionId(sourceKey: string, toFlowId: string, sourceKind: WorkflowSourceKind) {
  return `${sourceKey}:${toFlowId}:${sourceKind}`;
}

function createMetadata(input: WorkflowConnectionInput, sourceNodeId: string) {
  return {
    ...(input.fromFlowId ? { fromFlowId: input.fromFlowId } : {}),
    sourceKind: input.sourceKind,
    sourceNodeId
  };
}

function getSourceFlow(project: Project, fromFlowId?: string): VideoFlow | undefined {
  return fromFlowId ? project.videoFlows.find((flow) => flow.id === fromFlowId) : undefined;
}

function appendUnique(ids: string[], id: string): string[] {
  return Array.from(new Set([...ids, id]));
}

function removeId(ids: string[], id: string): string[] {
  return ids.filter((item) => item !== id);
}

function createVideoFlowFromStoryboardShot(flowId: string, shot: StoryboardShot): VideoFlow {
  return {
    id: flowId,
    shotId: shot.id,
    nodes: {
      characterNode: { id: `node-character-${shot.id}`, type: "character", status: "idle" },
      sceneNode: { id: `node-scene-${shot.id}`, type: "scene", status: "idle" },
      promptNode: { id: `node-prompt-${shot.id}`, type: "prompt", status: "ready" },
      videoNode: { id: `node-video-${shot.id}`, type: "video", status: "idle" },
      previewNode: { id: `node-preview-${shot.id}`, type: "preview", status: "idle" }
    },
    prompt: shot.videoPrompt,
    imagePrompt: shot.imagePrompt,
    selectedCharacterModelIds: [],
    selectedSceneModelIds: [],
    actionDescription: shot.characterActions,
    emotion: shot.expression,
    cameraMovement: shot.cameraMovement,
    durationSeconds: 15,
    aspectRatio: "9:16",
    status: "idle"
  };
}

function createManualStoryboardShot(project: Project, shotId: string, title: string): StoryboardShot {
  const nextOrder = Math.max(0, ...project.storyState.storyboard.map((shot) => shot.order || 0)) + 1;
  const imagePrompt = `${title}，当前片段风格参考图，明确实际出镜人物、场景空间、镜头构图、光影色调和结尾衔接。`;
  const videoPrompt = `15秒视频片段，${title}，请补充当前片段的角色动作、镜头运动、情绪变化、场景信息和最后一秒衔接状态。`;

  return {
    id: shotId,
    sceneId: `manual-scene-${shotId}`,
    order: nextOrder,
    shotType: title,
    cameraMovement: "平稳推进",
    composition: "请补充当前片段的核心构图、镜头景别和画面信息。",
    characterActions: "请补充当前片段的角色动作和剧情推进。",
    expression: "等待补充情绪变化",
    background: "按当前片段已连接场景模型。",
    dialogue: "",
    imagePrompt,
    videoPrompt
  };
}

function createManualVisualPrompt(project: Project, shot: StoryboardShot): VisualPrompt {
  const existing = new Set((project.storyState.visualPrompts || []).map((prompt) => prompt.id));
  const baseId = `prompt-${shot.id}`;
  let id = baseId;
  let index = 2;
  while (existing.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }

  return {
    id,
    shotId: shot.id,
    imagePrompt: shot.imagePrompt,
    videoPrompt: shot.videoPrompt
  };
}

function createManualVideoFlowId(project: Project): string {
  const existing = new Set(project.videoFlows.map((flow) => flow.id));
  const prefix = `${project.id}:videoFlow:manual-video-segment`;
  let index = project.videoFlows.length + 1;
  let id = `${prefix}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}

function createManualShotId(project: Project): string {
  const existing = new Set([
    ...project.storyState.storyboard.map((shot) => shot.id),
    ...project.videoFlows.map((flow) => flow.shotId)
  ]);
  const prefix = "manual-shot";
  let index = project.videoFlows.length + 1;
  let id = `${prefix}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}

function normalizeVideoSegmentTitle(title: string | undefined): string {
  return title?.trim() || "新建 15s 视频片段";
}

function normalizeGalleryModelName(title: string | undefined, kind: WorkflowModelKind): string {
  const cleaned = (title || "")
    .replace(/第\s*\d+\s*段.*/g, "")
    .split("·")[0]
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || (kind === "character" ? "Gallery 人物模型" : "Gallery 场景模型");
}

function ensureGalleryAsset(assets: MediaAsset[], asset: MediaAsset): MediaAsset[] {
  const existing = assets.find((item) => item.id === asset.id);
  if (!existing) return [...assets, asset];
  if (!existing.storageKey && asset.storageKey) {
    return assets.map((item) => (item.id === asset.id ? { ...asset, createdAt: asset.createdAt || item.createdAt } : item));
  }
  return assets;
}

function createManualModelId(project: Project, kind: WorkflowModelKind): string {
  const existing = new Set((kind === "character" ? project.characterModels : project.sceneModels).map((model) => model.id));
  const prefix = kind === "character" ? "manual-character" : "manual-scene";
  let index = existing.size + 1;
  let id = `${prefix}-${index}`;
  while (existing.has(id)) {
    index += 1;
    id = `${prefix}-${index}`;
  }
  return id;
}

function normalizeModelName(kind: WorkflowModelKind, name: string | undefined): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return kind === "character" ? "未命名人物模型" : "未命名场景模型";
}

function getSelectedCharacterIds(flow: VideoFlow): string[] {
  return flow.selectedCharacterModelIds?.length
    ? flow.selectedCharacterModelIds
    : flow.selectedCharacterModelId
      ? [flow.selectedCharacterModelId]
      : [];
}

function getSelectedSceneIds(flow: VideoFlow): string[] {
  return flow.selectedSceneModelIds?.length
    ? flow.selectedSceneModelIds
    : flow.selectedSceneModelId
      ? [flow.selectedSceneModelId]
      : [];
}
