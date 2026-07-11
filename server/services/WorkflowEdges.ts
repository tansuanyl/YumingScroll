import type { CharacterModel, SceneModel, VideoFlow, WorkflowEdge } from "../../src/types/domain";

type ProjectWithOptionalEdges = {
  id: string;
  characterModels?: CharacterModel[];
  sceneModels?: SceneModel[];
  videoFlows: VideoFlow[];
  workflowEdges?: WorkflowEdge[];
  updatedAt?: string;
};

export function normalizeProjectWorkflowEdges(project: ProjectWithOptionalEdges): WorkflowEdge[] {
  return normalizeWorkflowEdges(project.id, project.videoFlows, project.workflowEdges);
}

export function normalizeProjectWorkflowEdgesForSave(
  incoming: ProjectWithOptionalEdges,
  existing?: ProjectWithOptionalEdges
): WorkflowEdge[] {
  if (!existing) {
    return normalizeProjectWorkflowEdges(incoming);
  }

  const incomingGeneratedEdges = deriveGeneratedWorkflowEdges(incoming.id, incoming.videoFlows);
  const incomingGeneratedIds = new Set(incomingGeneratedEdges.map((edge) => edge.id));
  const existingGeneratedIds = new Set(deriveGeneratedWorkflowEdges(existing.id, existing.videoFlows).map((edge) => edge.id));
  const incomingExplicitEdges = (incoming.workflowEdges || []).filter(
    (edge) =>
      isExplicitWorkflowConnectionEdge(edge) ||
      (!incomingGeneratedIds.has(edge.id) && !isGeneratedWorkflowEdgeShape(incoming.id, incoming.videoFlows, edge))
  );
  const preservedExistingEdges = (existing.workflowEdges || []).filter(
    (edge) =>
      (isExplicitWorkflowConnectionEdge(edge) ||
        (!existingGeneratedIds.has(edge.id) && !isGeneratedWorkflowEdgeShape(existing.id, existing.videoFlows, edge))) &&
      isWorkflowEdgeReferenceValid(incoming, edge)
  );
  const byId = new Map<string, WorkflowEdge>();

  for (const edge of incomingGeneratedEdges) byId.set(edge.id, edge);
  for (const edge of preservedExistingEdges) byId.set(edge.id, edge);
  for (const edge of incomingExplicitEdges) byId.set(edge.id, edge);
  return Array.from(byId.values());
}

export function normalizeWorkflowEdges(
  projectId: string,
  videoFlows: VideoFlow[],
  explicitEdges: WorkflowEdge[] = []
): WorkflowEdge[] {
  const generatedEdges = deriveGeneratedWorkflowEdges(projectId, videoFlows);
  const generatedEdgeIds = new Set(generatedEdges.map((edge) => edge.id));
  const byId = new Map<string, WorkflowEdge>();

  for (const edge of generatedEdges) {
    byId.set(edge.id, edge);
  }
  for (const edge of explicitEdges) {
    if (!generatedEdgeIds.has(edge.id) && isGeneratedWorkflowEdgeShape(projectId, videoFlows, edge)) continue;
    byId.set(edge.id, edge);
  }

  return Array.from(byId.values());
}

function deriveGeneratedWorkflowEdges(projectId: string, videoFlows: VideoFlow[]): WorkflowEdge[] {
  return videoFlows.flatMap((flow, flowIndex) => deriveWorkflowEdgesForFlow(projectId, flow, flowIndex));
}

export function applyWorkflowEdgesToVideoFlows(videoFlows: VideoFlow[], edges: WorkflowEdge[]): VideoFlow[] {
  return videoFlows.map((flow) => {
    const flowEdges = edges.filter((edge) => edge.targetType === "videoFlow" && edge.targetId === flow.id);
    const characterIds = flowEdges
      .filter((edge) => edge.sourceType === "characterModel" && edge.targetPort === "character")
      .map((edge) => edge.sourceId);
    const sceneIds = flowEdges
      .filter((edge) => edge.sourceType === "sceneModel" && edge.targetPort === "scene")
      .map((edge) => edge.sourceId);

    return {
      ...flow,
      selectedCharacterModelIds: characterIds.length > 0 ? Array.from(new Set(characterIds)) : flow.selectedCharacterModelIds,
      selectedCharacterModelId: characterIds[0] || flow.selectedCharacterModelId,
      selectedSceneModelIds: sceneIds.length > 0 ? Array.from(new Set(sceneIds)) : flow.selectedSceneModelIds,
      selectedSceneModelId: sceneIds[0] || flow.selectedSceneModelId
    };
  });
}

export function createWorkflowEdgeId(projectId: string, edge: Pick<WorkflowEdge, "kind" | "sourceId" | "targetId">): string {
  return stableEdgeId(projectId, edge.kind, edge.sourceId, edge.targetId);
}

export function upsertWorkflowEdge(edges: WorkflowEdge[], edge: WorkflowEdge): WorkflowEdge[] {
  const now = new Date().toISOString();
  const existing = edges.find((item) => item.id === edge.id);
  return [...edges.filter((item) => item.id !== edge.id), {
    ...edge,
    createdAt: existing?.createdAt || edge.createdAt || now,
    updatedAt: now
  }];
}

export function deleteWorkflowEdge(edges: WorkflowEdge[], edgeId: string): WorkflowEdge[] {
  return edges.filter((edge) => edge.id !== edgeId);
}

export function applyWorkflowEdgeMutationToVideoFlows(
  videoFlows: VideoFlow[],
  edge: WorkflowEdge,
  action: "connect" | "disconnect"
): VideoFlow[] {
  if (edge.targetType !== "videoFlow") return videoFlows;

  return videoFlows.map((flow) => {
    if (flow.id !== edge.targetId) return flow;
    if (edge.sourceType === "characterModel" && edge.targetPort === "character") {
      const ids = mutateIds(
        flow.selectedCharacterModelIds || (flow.selectedCharacterModelId ? [flow.selectedCharacterModelId] : []),
        edge.sourceId,
        action
      );
      return {
        ...flow,
        selectedCharacterModelIds: ids,
        selectedCharacterModelId: ids[0]
      };
    }

    if (edge.sourceType === "sceneModel" && edge.targetPort === "scene") {
      const ids = mutateIds(
        flow.selectedSceneModelIds || (flow.selectedSceneModelId ? [flow.selectedSceneModelId] : []),
        edge.sourceId,
        action
      );
      return {
        ...flow,
        selectedSceneModelIds: ids,
        selectedSceneModelId: ids[0]
      };
    }

    return flow;
  });
}

function deriveWorkflowEdgesForFlow(projectId: string, flow: VideoFlow, flowIndex: number): WorkflowEdge[] {
  const edges: WorkflowEdge[] = [];
  const characterIds = uniqueIds(flow.selectedCharacterModelIds || (flow.selectedCharacterModelId ? [flow.selectedCharacterModelId] : []));
  const sceneIds = uniqueIds(flow.selectedSceneModelIds || (flow.selectedSceneModelId ? [flow.selectedSceneModelId] : []));

  characterIds.forEach((characterModelId, index) => {
    edges.push({
      id: stableEdgeId(projectId, "character", characterModelId, flow.id),
      sourceType: "characterModel",
      sourceId: characterModelId,
      sourcePort: "output",
      targetType: "videoFlow",
      targetId: flow.id,
      targetPort: "character",
      kind: "character-reference",
      metadata: { flowIndex, index }
    });
  });

  sceneIds.forEach((sceneModelId, index) => {
    edges.push({
      id: stableEdgeId(projectId, "scene", sceneModelId, flow.id),
      sourceType: "sceneModel",
      sourceId: sceneModelId,
      sourcePort: "output",
      targetType: "videoFlow",
      targetId: flow.id,
      targetPort: "scene",
      kind: "scene-reference",
      metadata: { flowIndex, index }
    });
  });

  if (flow.imagePrompt || flow.imagePromptImageUrl) {
    edges.push({
      id: stableEdgeId(projectId, "image-prompt", `${flow.id}:imagePrompt`, flow.id),
      sourceType: "imagePrompt",
      sourceId: `${flow.id}:imagePrompt`,
      sourcePort: "output",
      targetType: "videoFlow",
      targetId: flow.id,
      targetPort: "imagePrompt",
      kind: "image-prompt",
      metadata: {
        flowIndex,
        imagePromptImageName: flow.imagePromptImageName,
        hasReferenceImage: Boolean(flow.imagePromptImageUrl)
      }
    });
  }

  edges.push({
    id: stableEdgeId(projectId, "script", flow.shotId, flow.id),
    sourceType: "script",
    sourceId: flow.shotId,
    sourcePort: "output",
    targetType: "videoFlow",
    targetId: flow.id,
    targetPort: "script",
    kind: "script",
    metadata: { flowIndex }
  });

  return edges;
}

function isWorkflowEdgeReferenceValid(project: ProjectWithOptionalEdges, edge: WorkflowEdge): boolean {
  if (edge.targetType !== "videoFlow") return false;
  if (!project.videoFlows.some((flow) => flow.id === edge.targetId)) return false;

  if (edge.sourceType === "characterModel") {
    return Boolean(project.characterModels?.some((model) => model.id === edge.sourceId));
  }
  if (edge.sourceType === "sceneModel") {
    return Boolean(project.sceneModels?.some((model) => model.id === edge.sourceId));
  }
  if (edge.sourceType === "imagePrompt") {
    return project.videoFlows.some((flow) => flow.id === edge.sourceId || `${flow.id}:imagePrompt` === edge.sourceId);
  }
  if (edge.sourceType === "script") {
    return project.videoFlows.some((flow) => flow.shotId === edge.sourceId);
  }

  return false;
}

function isGeneratedWorkflowEdgeShape(projectId: string, videoFlows: VideoFlow[], edge: WorkflowEdge): boolean {
  const targetFlow = videoFlows.find((flow) => flow.id === edge.targetId);
  if (!targetFlow) return false;

  if (edge.sourceType === "characterModel" && edge.targetPort === "character") {
    return edge.id === stableEdgeId(projectId, "character", edge.sourceId, edge.targetId);
  }
  if (edge.sourceType === "sceneModel" && edge.targetPort === "scene") {
    return edge.id === stableEdgeId(projectId, "scene", edge.sourceId, edge.targetId);
  }
  if (edge.sourceType === "imagePrompt" && edge.targetPort === "imagePrompt") {
    return (
      edge.sourceId === `${targetFlow.id}:imagePrompt` &&
      edge.id === stableEdgeId(projectId, "image-prompt", edge.sourceId, edge.targetId)
    );
  }
  if (edge.sourceType === "script" && edge.targetPort === "script") {
    return edge.sourceId === targetFlow.shotId && edge.id === stableEdgeId(projectId, "script", edge.sourceId, edge.targetId);
  }

  return false;
}

function isExplicitWorkflowConnectionEdge(edge: WorkflowEdge): boolean {
  return (
    edge.metadata?.sourceKind === "character" ||
    edge.metadata?.sourceKind === "scene" ||
    edge.metadata?.sourceKind === "imagePrompt" ||
    edge.metadata?.sourceKind === "script"
  );
}

function stableEdgeId(projectId: string, kind: string, sourceId: string, targetId: string): string {
  return `edge:${projectId}:${kind}:${sourceId}:to:${targetId}`;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter((id) => id.trim().length > 0)));
}

function mutateIds(ids: string[], id: string, action: "connect" | "disconnect"): string[] {
  const existing = uniqueIds(ids);
  if (action === "disconnect") return existing.filter((item) => item !== id);
  return uniqueIds([...existing, id]);
}
