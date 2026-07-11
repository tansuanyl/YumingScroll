import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../server/services/ProjectStore";
import { createWorkflowEdgeId } from "../server/services/WorkflowEdges";
import { createDemoProject } from "../src/data/demoProject";

describe("ProjectStore", () => {
  it("creates, lists, reads, updates projects, and tracks generation jobs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-store-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      await store.save(project);

      expect(await store.list()).toHaveLength(1);
      expect((await store.listSummaries())[0].id).toBe(project.id);
      const loaded = await store.get(project.id);
      expect(loaded?.title).toBe(project.title);
      expect(loaded?.workflowEdges.filter((edge) => edge.kind === "image-prompt")).toHaveLength(2);
      expect(loaded?.workflowEdges.filter((edge) => edge.kind === "script")).toHaveLength(2);

      await store.save({ ...project, title: "New title" });
      expect((await store.get(project.id))?.title).toBe("New title");

      await store.saveGenerationJob({
        id: "job-test",
        projectId: project.id,
        targetType: "character",
        targetId: project.characterModels[0].id,
        provider: "seedance",
        model: "doubao-seedance-2-0-260128",
        status: "ready",
        requestPayload: { prompt: "test" },
        resultPayload: { assetIds: ["asset-test"] }
      });
      expect(await store.getGenerationJob("job-test")).toMatchObject({ status: "ready" });
      expect(await store.listGenerationJobs(project.id)).toHaveLength(1);

      const edge = {
        id: createWorkflowEdgeId(project.id, {
          kind: "character-reference" as const,
          sourceId: project.characterModels[0].id,
          targetId: project.videoFlows[0].id
        }),
        sourceType: "characterModel" as const,
        sourceId: project.characterModels[0].id,
        sourcePort: "output",
        targetType: "videoFlow" as const,
        targetId: project.videoFlows[0].id,
        targetPort: "character" as const,
        kind: "character-reference" as const
      };
      await store.saveWorkflowEdge(project.id, edge);
      const projectWithEdge = await store.get(project.id);
      expect(projectWithEdge?.workflowEdges.some((item) => item.id === edge.id)).toBe(true);
      expect(projectWithEdge?.videoFlows[0].selectedCharacterModelIds).toEqual([project.characterModels[0].id]);

      await store.deleteWorkflowEdge(project.id, edge.id);
      const projectWithoutEdge = await store.get(project.id);
      expect(projectWithoutEdge?.workflowEdges.some((item) => item.id === edge.id)).toBe(false);
      expect(projectWithoutEdge?.videoFlows[0].selectedCharacterModelIds).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("cleans imported novel prose from already saved character model prompts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-store-dirty-prompts-"));
    try {
      const filePath = join(dir, "projects.json");
      const project = createDemoProject();
      project.characterModels[0].consistencyPrompt =
        "角色 1：侯龙涛\n定位：男主。侯龙涛：“侯龙涛看看女孩儿的眼睛，保持项目所选画风的角色设定。” 女性特有的柔美，也不错嘛。\n\n中文提示词\n侯龙涛，黑发，深色外套，反正要飞十几个小时，不如和美女聊聊天打发时间，角色定妆图";
      await writeFile(filePath, JSON.stringify([project], null, 2), "utf8");

      const store = new ProjectStore(filePath);
      const loaded = await store.get(project.id);
      const prompt = loaded?.characterModels[0].consistencyPrompt || "";

      expect(prompt).toContain("侯龙涛");
      expect(prompt).toContain("黑发");
      expect(prompt).toContain("深色外套");
      expect(prompt).toContain("角色定妆图");
      expect(prompt).not.toContain("看看女孩儿的眼睛");
      expect(prompt).not.toContain("女性特有的柔美");
      expect(prompt).not.toContain("打发时间");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps newer explicit workflow connections when an older project snapshot is saved later", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-store-stale-edges-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject({ id: "project-stale-edges" });
      project.updatedAt = "2026-05-20T00:00:00.000Z";
      const savedBeforeConnection = await store.save(project);
      const edge = {
        id: "edge-script-cross-flow",
        sourceType: "script" as const,
        sourceId: savedBeforeConnection.videoFlows[0].shotId,
        sourcePort: "output",
        targetType: "videoFlow" as const,
        targetId: savedBeforeConnection.videoFlows[1].id,
        targetPort: "script" as const,
        kind: "script" as const,
        metadata: {
          fromFlowId: savedBeforeConnection.videoFlows[0].id,
          sourceKind: "script"
        }
      };
      await store.saveWorkflowEdge(savedBeforeConnection.id, edge);
      const savedAfterConnection = await store.get(savedBeforeConnection.id);
      expect(savedAfterConnection?.workflowEdges.some((item) => item.id === edge.id)).toBe(true);

      await store.save({
        ...savedBeforeConnection,
        title: "stale async generation save",
        workflowEdges: [],
        updatedAt: "2026-05-20T00:00:00.000Z"
      });

      const loaded = await store.get(savedBeforeConnection.id);
      expect(loaded?.title).toBe("stale async generation save");
      expect(loaded?.workflowEdges.some((item) => item.id === edge.id)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps manual same-segment script connections when their id matches the generated script edge", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-store-self-script-edge-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject({ id: "project-self-script-edge" });
      const savedBeforeConnection = await store.save(project);
      const sourceFlow = savedBeforeConnection.videoFlows[0];
      const edge = {
        id: createWorkflowEdgeId(savedBeforeConnection.id, {
          kind: "script" as const,
          sourceId: sourceFlow.shotId,
          targetId: sourceFlow.id
        }),
        sourceType: "script" as const,
        sourceId: sourceFlow.shotId,
        sourcePort: "output",
        targetType: "videoFlow" as const,
        targetId: sourceFlow.id,
        targetPort: "script" as const,
        kind: "script" as const,
        metadata: {
          fromFlowId: sourceFlow.id,
          sourceKind: "script",
          sourceNodeId: sourceFlow.id
        }
      };

      await store.saveWorkflowEdge(savedBeforeConnection.id, edge);
      const savedAfterConnection = await store.get(savedBeforeConnection.id);
      expect(savedAfterConnection?.workflowEdges.find((item) => item.id === edge.id)?.metadata).toMatchObject({
        fromFlowId: sourceFlow.id,
        sourceKind: "script"
      });

      await store.save({
        ...savedAfterConnection!,
        title: "manual self script connection still visible"
      });

      const loaded = await store.get(savedBeforeConnection.id);
      expect(loaded?.workflowEdges.find((item) => item.id === edge.id)?.metadata).toMatchObject({
        fromFlowId: sourceFlow.id,
        sourceKind: "script"
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps explicit workflow connections when a later whole-project save omits them", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-store-newer-save-edges-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject({ id: "project-newer-save-edges" });
      const savedBeforeConnection = await store.save(project);
      const edge = {
        id: "edge-image-prompt-cross-flow",
        sourceType: "imagePrompt" as const,
        sourceId: savedBeforeConnection.videoFlows[0].id,
        sourcePort: "output",
        targetType: "videoFlow" as const,
        targetId: savedBeforeConnection.videoFlows[1].id,
        targetPort: "imagePrompt" as const,
        kind: "image-prompt" as const,
        metadata: {
          fromFlowId: savedBeforeConnection.videoFlows[0].id,
          sourceKind: "imagePrompt"
        }
      };
      await store.saveWorkflowEdge(savedBeforeConnection.id, edge);
      const savedAfterConnection = await store.get(savedBeforeConnection.id);
      expect(savedAfterConnection?.workflowEdges.some((item) => item.id === edge.id)).toBe(true);

      await store.save({
        ...savedBeforeConnection,
        title: "late whole-project save without edges",
        workflowEdges: [],
        updatedAt: "2099-01-01T00:00:00.000Z"
      });

      const loaded = await store.get(savedBeforeConnection.id);
      expect(loaded?.title).toBe("late whole-project save without edges");
      expect(loaded?.workflowEdges.some((item) => item.id === edge.id)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("deletes gallery assets and keeps them removed across later saves", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-store-delete-asset-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject({ id: "project-delete-gallery-asset" });
      const asset = {
        id: "asset-gallery-delete",
        type: "image" as const,
        url: "/media/asset-gallery-delete.png",
        provider: "mock" as const,
        prompt: "delete me",
        createdAt: "2026-05-20T00:00:00.000Z"
      };
      project.assets = [asset];
      project.characterModels[0].candidateImages = [asset];
      project.characterModels[0].confirmedImageId = asset.id;
      project.characterModels[0].status = "ready";

      const saved = await store.save(project);
      const deleted = await store.deleteProjectAsset(saved.id, asset.id);

      expect(deleted?.assets.some((item) => item.id === asset.id)).toBe(false);
      expect(deleted?.characterModels[0].candidateImages).toEqual([]);
      expect(deleted?.characterModels[0].confirmedImageId).toBeUndefined();

      await store.save({ ...deleted!, title: "saved after gallery deletion" });
      const loaded = await store.get(saved.id);
      expect(loaded?.assets.some((item) => item.id === asset.id)).toBe(false);
      expect(loaded?.characterModels[0].candidateImages).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
