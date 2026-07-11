import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/data/demoProject";
import {
  applyWorkflowConnectionToProject,
  createWorkflowModelSource,
  createWorkflowModelSourceFromGalleryAsset,
  createWorkflowVideoSegment,
  createWorkflowEdgesForConnection,
  deleteWorkflowModelSource,
  deriveWorkflowConnectionsFromEdges,
  disconnectWorkflowModelFromFlow,
  disconnectWorkflowSegmentSourceFromFlow,
  updateWorkflowModelName
} from "../src/lib/workflowConnections";

describe("workflow connection helpers", () => {
  it("builds a model edge for a concrete model source node", () => {
    const project = createDemoProject();

    const edges = createWorkflowEdgesForConnection(project, {
      sourceId: project.characterModels[0].id,
      toFlowId: project.videoFlows[1].id,
      sourceKind: "character",
      inputKind: "character"
    });

    expect(edges).toHaveLength(1);
    expect(edges[0]?.sourceId).toBe(project.characterModels[0].id);
    expect(edges[0]).toMatchObject({
      sourceType: "characterModel",
      sourcePort: "output",
      targetType: "videoFlow",
      targetId: project.videoFlows[1].id,
      targetPort: "character",
      kind: "character-reference",
      metadata: { sourceKind: "character", sourceNodeId: project.characterModels[0].id }
    });
  });

  it("derives visual connections from persisted workflow edges", () => {
    const project = createDemoProject();
    const sourceFlow = {
      ...project.videoFlows[0],
      selectedCharacterModelIds: [project.characterModels[0].id]
    };
    const edge = {
      id: "edge-1",
      sourceType: "characterModel" as const,
      sourceId: project.characterModels[0].id,
      sourcePort: "output",
      targetType: "videoFlow" as const,
      targetId: project.videoFlows[1].id,
      targetPort: "character" as const,
      kind: "character-reference" as const,
      metadata: { fromFlowId: sourceFlow.id, sourceKind: "character" }
    };

    const connections = deriveWorkflowConnectionsFromEdges({
      ...project,
      videoFlows: [sourceFlow, project.videoFlows[1]],
      workflowEdges: [edge]
    });

    expect(connections).toEqual([
      {
        id: `${project.characterModels[0].id}:${project.videoFlows[1].id}:character`,
        sourceId: project.characterModels[0].id,
        fromFlowId: sourceFlow.id,
        toFlowId: project.videoFlows[1].id,
        sourceKind: "character",
        inputKind: "character",
        edgeIds: ["edge-1"]
      }
    ]);
  });

  it("does not show generated self edges as user-created canvas connections", () => {
    const project = createDemoProject();
    const selfEdge = {
      id: "edge-self-script",
      sourceType: "script" as const,
      sourceId: project.videoFlows[0].shotId,
      sourcePort: "output",
      targetType: "videoFlow" as const,
      targetId: project.videoFlows[0].id,
      targetPort: "script" as const,
      kind: "script" as const,
      metadata: { flowIndex: 0 }
    };

    expect(deriveWorkflowConnectionsFromEdges({ ...project, workflowEdges: [selfEdge] })).toEqual([]);
  });

  it("shows manually connected same-segment script edges", () => {
    const project = createDemoProject();
    const selfEdge = {
      id: `edge:${project.id}:script:${project.videoFlows[0].shotId}:to:${project.videoFlows[0].id}`,
      sourceType: "script" as const,
      sourceId: project.videoFlows[0].shotId,
      sourcePort: "output",
      targetType: "videoFlow" as const,
      targetId: project.videoFlows[0].id,
      targetPort: "script" as const,
      kind: "script" as const,
      metadata: {
        fromFlowId: project.videoFlows[0].id,
        sourceKind: "script",
        sourceNodeId: project.videoFlows[0].id
      }
    };

    expect(deriveWorkflowConnectionsFromEdges({ ...project, workflowEdges: [selfEdge] })).toEqual([
      {
        id: `${project.videoFlows[0].id}:${project.videoFlows[0].id}:script`,
        fromFlowId: project.videoFlows[0].id,
        sourceId: project.videoFlows[0].shotId,
        toFlowId: project.videoFlows[0].id,
        sourceKind: "script",
        inputKind: "script",
        edgeIds: [selfEdge.id]
      }
    ]);
  });

  it("keeps model-to-video connections even when the target flow already references the model", () => {
    const project = createDemoProject();
    const targetFlow = {
      ...project.videoFlows[0],
      selectedCharacterModelIds: [project.characterModels[0].id],
      selectedCharacterModelId: project.characterModels[0].id
    };
    const edge = {
      id: "edge-character-1",
      sourceType: "characterModel" as const,
      sourceId: project.characterModels[0].id,
      sourcePort: "output",
      targetType: "videoFlow" as const,
      targetId: targetFlow.id,
      targetPort: "character" as const,
      kind: "character-reference" as const,
      metadata: { sourceKind: "character", sourceNodeId: project.characterModels[0].id }
    };

    const connections = deriveWorkflowConnectionsFromEdges({
      ...project,
      videoFlows: [targetFlow, project.videoFlows[1]],
      workflowEdges: [edge]
    });

    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      id: `${project.characterModels[0].id}:${targetFlow.id}:character`,
      sourceId: project.characterModels[0].id,
      toFlowId: targetFlow.id,
      sourceKind: "character",
      inputKind: "character"
    });
  });

  it("copies connected source values onto the target flow for preview and generation", () => {
    const project = createDemoProject();
    const sourceFlow = {
      ...project.videoFlows[0],
      selectedSceneModelIds: [project.sceneModels[0].id],
      imagePrompt: "source image prompt",
      prompt: "source video prompt",
      actionDescription: "source action"
    };
    const nextProject = {
      ...project,
      videoFlows: [sourceFlow, project.videoFlows[1]]
    };

    const connected = applyWorkflowConnectionToProject(nextProject, {
      fromFlowId: sourceFlow.id,
      toFlowId: project.videoFlows[1].id,
      sourceKind: "script",
      inputKind: "script"
    });

    const targetFlow = connected.videoFlows[1];
    expect(targetFlow.prompt).toBe("source video prompt");
    expect(targetFlow.actionDescription).toBe("source action");
    expect(targetFlow.nodes.videoNode.stale).toBe(true);
    expect(targetFlow.videoAssetId).toBeUndefined();
  });

  it("resets an in-flight target video when a connection changes its inputs", () => {
    const project = createDemoProject();
    const sourceFlow = {
      ...project.videoFlows[0],
      prompt: "source video prompt",
      actionDescription: "source action"
    };
    const targetFlow = {
      ...project.videoFlows[1],
      status: "generating" as const,
      pendingVideoJobId: "job-old-video",
      generationRequestId: "request-old-video",
      videoAssetId: "asset-old-video",
      nodes: {
        ...project.videoFlows[1].nodes,
        videoNode: {
          ...project.videoFlows[1].nodes.videoNode,
          status: "generating" as const,
          generationRequestId: "request-old-video"
        }
      }
    };

    const connected = applyWorkflowConnectionToProject(
      {
        ...project,
        videoFlows: [sourceFlow, targetFlow]
      },
      {
        fromFlowId: sourceFlow.id,
        toFlowId: targetFlow.id,
        sourceKind: "script",
        inputKind: "script"
      }
    );

    const nextTargetFlow = connected.videoFlows[1];
    expect(nextTargetFlow.status).toBe("idle");
    expect(nextTargetFlow.pendingVideoJobId).toBeUndefined();
    expect(nextTargetFlow.generationRequestId).toBeUndefined();
    expect(nextTargetFlow.videoAssetId).toBeUndefined();
    expect(nextTargetFlow.nodes.videoNode).toMatchObject({
      status: "idle",
      stale: true,
      generationRequestId: undefined
    });
  });

  it("disconnects a model source from one 15 second segment", () => {
    const project = createDemoProject();
    const connected = applyWorkflowConnectionToProject(
      {
        ...project,
        workflowEdges: [
          {
            id: "edge-character-1",
            sourceType: "characterModel",
            sourceId: project.characterModels[0].id,
            sourcePort: "output",
            targetType: "videoFlow",
            targetId: project.videoFlows[0].id,
            targetPort: "character",
            kind: "character-reference"
          }
        ]
      },
      {
        sourceId: project.characterModels[0].id,
        sourceKind: "character",
        toFlowId: project.videoFlows[0].id,
        inputKind: "character"
      }
    );

    const next = disconnectWorkflowModelFromFlow(connected, "character", project.characterModels[0].id, project.videoFlows[0].id);

    expect(next.workflowEdges).toHaveLength(0);
    expect(next.videoFlows[0].selectedCharacterModelIds).toEqual([]);
    expect(next.videoFlows[0].selectedCharacterModelId).toBeUndefined();
    expect(next.videoFlows[0].nodes.videoNode.stale).toBe(true);
  });

  it("disconnects a script source and restores the target segment script fields", () => {
    const project = createDemoProject();
    const sourceFlow = {
      ...project.videoFlows[0],
      prompt: "source script prompt",
      actionDescription: "source action"
    };
    const targetFlow = {
      ...project.videoFlows[1],
      prompt: "source script prompt",
      actionDescription: "source action",
      videoAssetId: "asset-video-old",
      status: "ready" as const,
      nodes: {
        ...project.videoFlows[1].nodes,
        videoNode: { ...project.videoFlows[1].nodes.videoNode, status: "ready" as const },
        previewNode: { ...project.videoFlows[1].nodes.previewNode, status: "ready" as const }
      }
    };
    const connected = {
      ...project,
      videoFlows: [sourceFlow, targetFlow],
      workflowEdges: [
        {
          id: "edge-script-1-to-2",
          sourceType: "script" as const,
          sourceId: sourceFlow.shotId,
          sourcePort: "output",
          targetType: "videoFlow" as const,
          targetId: targetFlow.id,
          targetPort: "script" as const,
          kind: "script" as const,
          metadata: { fromFlowId: sourceFlow.id, sourceKind: "script" }
        }
      ]
    };

    const next = disconnectWorkflowSegmentSourceFromFlow(connected, "script", sourceFlow.id, targetFlow.id);

    expect(next.workflowEdges).toEqual([]);
    expect(next.videoFlows[1].prompt).toBe(project.storyState.storyboard[1].videoPrompt);
    expect(next.videoFlows[1].actionDescription).toBe(project.storyState.storyboard[1].characterActions);
    expect(next.videoFlows[1].videoAssetId).toBeUndefined();
    expect(next.videoFlows[1].nodes.videoNode.stale).toBe(true);
  });

  it("disconnects an image prompt source and removes copied reference image fields", () => {
    const project = createDemoProject();
    const sourceFlow = {
      ...project.videoFlows[0],
      imagePrompt: "source image prompt",
      imagePromptImageUrl: "https://example.com/source-style.png",
      imagePromptImageName: "source style"
    };
    const targetFlow = {
      ...project.videoFlows[1],
      imagePrompt: "source image prompt",
      imagePromptImageUrl: "https://example.com/source-style.png",
      imagePromptImageName: "source style"
    };
    const connected = {
      ...project,
      videoFlows: [sourceFlow, targetFlow],
      workflowEdges: [
        {
          id: "edge-image-prompt-1-to-2",
          sourceType: "imagePrompt" as const,
          sourceId: sourceFlow.id,
          sourcePort: "output",
          targetType: "videoFlow" as const,
          targetId: targetFlow.id,
          targetPort: "imagePrompt" as const,
          kind: "image-prompt" as const,
          metadata: { fromFlowId: sourceFlow.id, sourceKind: "imagePrompt" }
        }
      ]
    };

    const next = disconnectWorkflowSegmentSourceFromFlow(connected, "imagePrompt", sourceFlow.id, targetFlow.id);

    expect(next.workflowEdges).toEqual([]);
    expect(next.videoFlows[1].imagePrompt).toBe(project.storyState.storyboard[1].imagePrompt);
    expect(next.videoFlows[1].imagePromptImageUrl).toBeUndefined();
    expect(next.videoFlows[1].imagePromptImageName).toBeUndefined();
    expect(next.videoFlows[1].nodes.videoNode.stale).toBe(true);
  });

  it("deletes a model source and removes all of its segment connections", () => {
    const project = createDemoProject();
    const targetModelId = project.sceneModels[0].id;
    const connected = {
      ...project,
      sceneModels: project.sceneModels,
      videoFlows: project.videoFlows.map((flow) => ({
        ...flow,
        selectedSceneModelId: targetModelId,
        selectedSceneModelIds: [targetModelId]
      })),
      workflowEdges: project.videoFlows.map((flow, index) => ({
        id: `edge-scene-${index}`,
        sourceType: "sceneModel" as const,
        sourceId: targetModelId,
        sourcePort: "output",
        targetType: "videoFlow" as const,
        targetId: flow.id,
        targetPort: "scene" as const,
        kind: "scene-reference" as const
      }))
    };

    const next = deleteWorkflowModelSource(connected, "scene", targetModelId);

    expect(next.sceneModels.some((model) => model.id === targetModelId)).toBe(false);
    expect(next.workflowEdges).toEqual([]);
    expect(next.videoFlows.every((flow) => flow.selectedSceneModelIds?.length === 0)).toBe(true);
  });

  it("creates and renames manual model source nodes", () => {
    const project = createDemoProject();
    const created = createWorkflowModelSource(project, "character", {
      id: "manual-character-1",
      name: "新人物"
    });
    const renamed = updateWorkflowModelName(created, "character", "manual-character-1", "苏衍");

    expect(created.characterModels.at(-1)).toMatchObject({
      id: "manual-character-1",
      characterId: "manual-character-1",
      name: "新人物",
      status: "idle"
    });
    expect(renamed.characterModels.at(-1)?.name).toBe("苏衍");
  });

  it("creates ready model source nodes from gallery images", () => {
    const project = createDemoProject();
    const galleryAsset = {
      id: "asset-gallery-person",
      type: "image" as const,
      url: "https://example.test/person.png",
      provider: "seedance" as const,
      prompt: "Gallery 人物定妆图，黑发长风衣",
      jobId: "job-gallery-person",
      createdAt: "2026-05-20T00:00:00.000Z"
    };

    const characterProject = createWorkflowModelSourceFromGalleryAsset(project, "character", {
      asset: galleryAsset,
      title: "苏衍 · 方案 1",
      now: "2026-05-20T00:00:00.000Z"
    });
    const character = characterProject.characterModels.at(-1);

    expect(characterProject.assets.some((asset) => asset.id === galleryAsset.id)).toBe(true);
    expect(character).toMatchObject({
      name: "苏衍",
      confirmedImageId: galleryAsset.id,
      candidateImages: [galleryAsset],
      status: "ready"
    });

    const sceneProject = createWorkflowModelSourceFromGalleryAsset(project, "scene", {
      asset: galleryAsset,
      title: "雨夜车站",
      now: "2026-05-20T00:00:00.000Z"
    });
    expect(sceneProject.sceneModels.at(-1)).toMatchObject({
      name: "雨夜车站",
      confirmedImageId: galleryAsset.id,
      candidateImages: [galleryAsset],
      status: "ready"
    });
  });

  it("creates a manual 15 second video segment with matching story data", () => {
    const project = createDemoProject({ id: "project-test" });
    const next = createWorkflowVideoSegment(project, {
      now: "2026-05-19T00:00:00.000Z"
    });
    const flow = next.videoFlows.at(-1);
    const shot = next.storyState.storyboard.at(-1);
    const visualPrompt = next.storyState.visualPrompts.at(-1);

    expect(next.videoFlows).toHaveLength(project.videoFlows.length + 1);
    expect(next.storyState.storyboard).toHaveLength(project.storyState.storyboard.length + 1);
    expect(flow).toMatchObject({
      id: "project-test:videoFlow:manual-video-segment-3",
      shotId: "manual-shot-3",
      durationSeconds: 15,
      aspectRatio: "9:16",
      status: "idle"
    });
    expect(flow?.nodes.videoNode).toMatchObject({ id: "node-video-manual-shot-3", status: "idle" });
    expect(shot).toMatchObject({
      id: "manual-shot-3",
      order: 3,
      shotType: "新建 15s 视频片段"
    });
    expect(visualPrompt).toMatchObject({
      id: "prompt-manual-shot-3",
      shotId: "manual-shot-3",
      imagePrompt: shot?.imagePrompt,
      videoPrompt: shot?.videoPrompt
    });
    expect(next.storyState.seedanceScript).toBe(project.storyState.seedanceScript);
    expect(next.updatedAt).toBe("2026-05-19T00:00:00.000Z");
  });
});
