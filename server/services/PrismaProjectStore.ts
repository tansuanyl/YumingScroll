import {
  Prisma,
  PrismaClient,
  type CharacterModel as CharacterModelRow,
  type MediaAsset as MediaAssetRow,
  type Project as ProjectRow,
  type SceneModel as SceneModelRow,
  type VideoFlow as VideoFlowRow,
  type WorkflowEdge as WorkflowEdgeRow
} from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../env";
import type { CharacterModel, MediaAsset, Project, ProjectSummary, SceneModel, VideoFlow, WorkflowEdge } from "../../src/types/domain";
import { sanitizeCharacterModelPromptOutput, sanitizeProjectCharacterModelPrompts } from "../../src/data/demoProject";
import { removeProjectAsset } from "../../src/lib/projectAssets";
import type { GenerationJobRecord, ProjectStore } from "./ProjectStore";
import { mergeProjectMediaForSave } from "./ProjectMediaMerge";
import { syncProjectWithSeedanceSegments } from "./ProjectDerivation";
import {
  applyWorkflowEdgeMutationToVideoFlows,
  applyWorkflowEdgesToVideoFlows,
  createWorkflowEdgeId,
  normalizeProjectWorkflowEdgesForSave,
  normalizeProjectWorkflowEdges
} from "./WorkflowEdges";

type PrismaTransaction = Prisma.TransactionClient;
type ProjectWithWorkflowRows = ProjectRow & {
  characterModelRows: CharacterModelRow[];
  sceneModelRows: SceneModelRow[];
  videoFlowRows: VideoFlowRow[];
  workflowEdgeRows: WorkflowEdgeRow[];
  mediaAssets: MediaAssetRow[];
};

const projectInclude = {
  characterModelRows: { orderBy: { sortOrder: "asc" } },
  sceneModelRows: { orderBy: { sortOrder: "asc" } },
  videoFlowRows: { orderBy: { sortOrder: "asc" } },
  workflowEdgeRows: { orderBy: { sortOrder: "asc" } },
  mediaAssets: { orderBy: { createdAt: "asc" } }
} satisfies Prisma.ProjectInclude;

const globalForPrisma = globalThis as unknown as {
  prismaProjectStoreClient?: PrismaClient;
};

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prismaProjectStoreClient) {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required to use PrismaProjectStore");
    }
    const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
    globalForPrisma.prismaProjectStoreClient = new PrismaClient({ adapter });
  }
  return globalForPrisma.prismaProjectStoreClient;
}

export class PrismaProjectStore implements ProjectStore {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async list(): Promise<Project[]> {
    const rows = await this.prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: projectInclude
    });
    return rows.map(toProject);
  }

  async listSummaries(): Promise<ProjectSummary[]> {
    const rows = await this.prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        inspiration: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      inspiration: row.inspiration,
      status: row.status as ProjectSummary["status"],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async get(id: string): Promise<Project | undefined> {
    const row = await this.prisma.project.findUnique({ where: { id }, include: projectInclude });
    return row ? toProject(row) : undefined;
  }

  async save(project: Project): Promise<Project> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existingRow = await tx.project.findUnique({
        where: { id: project.id },
        include: projectInclude
      });
      const existingProject = existingRow ? toProject(existingRow) : undefined;
      const normalizedProject = normalizeProjectRelationIds(
        syncProjectWithSeedanceSegments(
          sanitizeProjectCharacterModelPrompts(
            mergeProjectMediaForSave(project, existingProject)
          )
        )
      );
      const workflowEdges = normalizeProjectWorkflowEdgesForSave(normalizedProject, existingProject);
      const projectForSave = {
        ...normalizedProject,
        videoFlows: applyWorkflowEdgesToVideoFlows(normalizedProject.videoFlows, workflowEdges),
        workflowEdges
      };
      const saved = await tx.project.upsert({
        where: { id: projectForSave.id },
        create: {
          id: projectForSave.id,
          title: projectForSave.title,
          inspiration: projectForSave.inspiration,
          status: projectForSave.status,
          storyState: toJson(projectForSave.storyState),
          characterModels: toJson(projectForSave.characterModels),
          sceneModels: toJson(projectForSave.sceneModels),
          videoFlows: toJson(projectForSave.videoFlows),
          assets: toJson(projectForSave.assets),
          createdAt: parseDate(projectForSave.createdAt) ?? new Date()
        },
        update: {
          title: projectForSave.title,
          inspiration: projectForSave.inspiration,
          status: projectForSave.status,
          storyState: toJson(projectForSave.storyState),
          characterModels: toJson(projectForSave.characterModels),
          sceneModels: toJson(projectForSave.sceneModels),
          videoFlows: toJson(projectForSave.videoFlows),
          assets: toJson(projectForSave.assets)
        }
      });

      await replaceMediaAssets(tx, projectForSave.id, projectForSave.assets);
      await replaceCharacterModels(tx, projectForSave.id, projectForSave.characterModels);
      await replaceSceneModels(tx, projectForSave.id, projectForSave.sceneModels);
      await replaceVideoFlows(tx, projectForSave.id, projectForSave.videoFlows);
      await replaceWorkflowEdges(tx, projectForSave.id, workflowEdges);

      return tx.project.findUniqueOrThrow({
        where: { id: saved.id },
        include: projectInclude
      });
    });

    return toProject(row);
  }

  async listGenerationJobs(projectId: string): Promise<GenerationJobRecord[]> {
    const rows = await this.prisma.generationJob.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" }
    });
    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      targetType: row.targetType as GenerationJobRecord["targetType"],
      targetId: row.targetId,
      provider: row.provider,
      model: row.model,
      status: row.status as GenerationJobRecord["status"],
      requestPayload: row.requestPayload,
      resultPayload: row.resultPayload ?? undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  async getGenerationJob(id: string): Promise<GenerationJobRecord | undefined> {
    const row = await this.prisma.generationJob.findUnique({ where: { id } });
    if (!row) return undefined;
    return {
      id: row.id,
      projectId: row.projectId,
      targetType: row.targetType as GenerationJobRecord["targetType"],
      targetId: row.targetId,
      provider: row.provider,
      model: row.model,
      status: row.status as GenerationJobRecord["status"],
      requestPayload: row.requestPayload,
      resultPayload: row.resultPayload ?? undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  async saveGenerationJob(job: GenerationJobRecord): Promise<GenerationJobRecord> {
    const row = await this.prisma.generationJob.upsert({
      where: { id: job.id },
      create: {
        id: job.id,
        projectId: job.projectId,
        targetType: job.targetType,
        targetId: job.targetId,
        provider: job.provider,
        model: job.model,
        status: job.status,
        requestPayload: toJson(job.requestPayload),
        resultPayload: job.resultPayload === undefined ? undefined : toJson(job.resultPayload),
        error: job.error ?? null,
        createdAt: parseDate(job.createdAt) ?? new Date()
      },
      update: {
        status: job.status,
        requestPayload: toJson(job.requestPayload),
        resultPayload: job.resultPayload === undefined ? undefined : toJson(job.resultPayload),
        error: job.error ?? null
      }
    });

    return {
      id: row.id,
      projectId: row.projectId,
      targetType: row.targetType as GenerationJobRecord["targetType"],
      targetId: row.targetId,
      provider: row.provider,
      model: row.model,
      status: row.status as GenerationJobRecord["status"],
      requestPayload: row.requestPayload,
      resultPayload: row.resultPayload ?? undefined,
      error: row.error ?? undefined,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  async listWorkflowEdges(projectId: string): Promise<WorkflowEdge[]> {
    const rows = await this.prisma.workflowEdge.findMany({
      where: { projectId },
      orderBy: { sortOrder: "asc" }
    });
    return rows.map(toWorkflowEdge);
  }

  async getWorkflowEdge(projectId: string, edgeId: string): Promise<WorkflowEdge | undefined> {
    const row = await this.prisma.workflowEdge.findFirst({
      where: { id: edgeId, projectId }
    });
    return row ? toWorkflowEdge(row) : undefined;
  }

  async saveWorkflowEdge(projectId: string, edge: WorkflowEdge): Promise<WorkflowEdge> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true } });
      const existing = await tx.workflowEdge.findFirst({ where: { id: edge.id, projectId } });
      const sortOrder = existing?.sortOrder ?? (await tx.workflowEdge.count({ where: { projectId } }));

      const saved = await tx.workflowEdge.upsert({
        where: { id: edge.id },
        create: {
          id: edge.id,
          projectId,
          sourceType: edge.sourceType,
          sourceId: edge.sourceId,
          sourcePort: edge.sourcePort,
          targetType: edge.targetType,
          targetId: edge.targetId,
          targetPort: edge.targetPort,
          kind: edge.kind,
          sortOrder,
          metadata: edge.metadata === undefined ? undefined : toJson(edge.metadata),
          createdAt: parseDate(edge.createdAt) ?? new Date()
        },
        update: {
          sourceType: edge.sourceType,
          sourceId: edge.sourceId,
          sourcePort: edge.sourcePort,
          targetType: edge.targetType,
          targetId: edge.targetId,
          targetPort: edge.targetPort,
          kind: edge.kind,
          metadata: edge.metadata === undefined ? undefined : toJson(edge.metadata)
        }
      });

      await syncVideoFlowSelectionForEdge(tx, projectId, edge, "connect");
      return saved;
    });

    return toWorkflowEdge(row);
  }

  async deleteWorkflowEdge(projectId: string, edgeId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.workflowEdge.findFirst({ where: { id: edgeId, projectId } });
      if (!row) return false;

      const edge = toWorkflowEdge(row);
      await tx.workflowEdge.delete({ where: { id: edgeId } });
      await syncVideoFlowSelectionForEdge(tx, projectId, edge, "disconnect");
      return true;
    });
  }

  async deleteProjectAsset(projectId: string, assetId: string): Promise<Project | undefined> {
    const row = await this.prisma.$transaction(async (tx) => {
      const existingRow = await tx.project.findUnique({
        where: { id: projectId },
        include: projectInclude
      });
      if (!existingRow) return undefined;

      const existingProject = toProject(existingRow);
      const { project: projectWithoutAsset, asset } = removeProjectAsset(existingProject, assetId);
      if (!asset) return undefined;

      const normalizedProject = normalizeProjectRelationIds(
        syncProjectWithSeedanceSegments(sanitizeProjectCharacterModelPrompts(projectWithoutAsset))
      );
      const workflowEdges = normalizeProjectWorkflowEdgesForSave(normalizedProject, existingProject);
      const projectForSave = {
        ...normalizedProject,
        videoFlows: applyWorkflowEdgesToVideoFlows(normalizedProject.videoFlows, workflowEdges),
        workflowEdges
      };

      await tx.project.update({
        where: { id: projectForSave.id },
        data: {
          title: projectForSave.title,
          inspiration: projectForSave.inspiration,
          status: projectForSave.status,
          storyState: toJson(projectForSave.storyState),
          characterModels: toJson(projectForSave.characterModels),
          sceneModels: toJson(projectForSave.sceneModels),
          videoFlows: toJson(projectForSave.videoFlows),
          assets: toJson(projectForSave.assets)
        }
      });

      await replaceMediaAssets(tx, projectForSave.id, projectForSave.assets);
      await replaceCharacterModels(tx, projectForSave.id, projectForSave.characterModels);
      await replaceSceneModels(tx, projectForSave.id, projectForSave.sceneModels);
      await replaceVideoFlows(tx, projectForSave.id, projectForSave.videoFlows);
      await replaceWorkflowEdges(tx, projectForSave.id, workflowEdges);

      return tx.project.findUniqueOrThrow({
        where: { id: projectForSave.id },
        include: projectInclude
      });
    });

    return row ? toProject(row) : undefined;
  }
}

async function replaceWorkflowEdges(tx: PrismaTransaction, projectId: string, edges: WorkflowEdge[]) {
  await tx.workflowEdge.deleteMany({ where: { projectId } });
  if (edges.length === 0) return;

  await tx.workflowEdge.createMany({
    data: edges.map((edge, index) => ({
      id: edge.id,
      projectId,
      sourceType: edge.sourceType,
      sourceId: edge.sourceId,
      sourcePort: edge.sourcePort,
      targetType: edge.targetType,
      targetId: edge.targetId,
      targetPort: edge.targetPort,
      kind: edge.kind,
      sortOrder: index,
      metadata: edge.metadata === undefined ? undefined : toJson(edge.metadata),
      createdAt: parseDate(edge.createdAt) ?? new Date()
    }))
  });
}

async function syncVideoFlowSelectionForEdge(
  tx: PrismaTransaction,
  projectId: string,
  edge: WorkflowEdge,
  action: "connect" | "disconnect"
) {
  if (edge.targetType !== "videoFlow") return;
  const flowRow = await tx.videoFlow.findFirst({ where: { id: edge.targetId, projectId } });
  if (!flowRow) return;

  const [nextFlow] = applyWorkflowEdgeMutationToVideoFlows([toVideoFlow(flowRow)], edge, action);
  await tx.videoFlow.update({
    where: { id: flowRow.id },
    data: {
      selectedCharacterModelId: nextFlow.selectedCharacterModelId,
      selectedSceneModelId: nextFlow.selectedSceneModelId,
      selectedCharacterModelIds: toJson(nextFlow.selectedCharacterModelIds ?? []),
      selectedSceneModelIds: toJson(nextFlow.selectedSceneModelIds ?? [])
    }
  });
  await syncProjectVideoFlowSnapshot(tx, projectId);
}

async function syncProjectVideoFlowSnapshot(tx: PrismaTransaction, projectId: string) {
  const flowRows = await tx.videoFlow.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" }
  });
  await tx.project.update({
    where: { id: projectId },
    data: {
      videoFlows: toJson(flowRows.map(toVideoFlow))
    }
  });
}

async function replaceCharacterModels(tx: PrismaTransaction, projectId: string, models: CharacterModel[]) {
  await tx.characterModel.deleteMany({ where: { projectId } });
  if (models.length === 0) return;

  await tx.characterModel.createMany({
    data: models.map((model, index) => ({
      id: model.id,
      projectId,
      characterId: model.characterId,
      name: model.name,
      description: model.description,
      consistencyPrompt: model.consistencyPrompt,
      sortOrder: index,
      imageAspectRatio: model.imageAspectRatio,
      candidateImages: toJson(model.candidateImages),
      confirmedImageId: model.confirmedImageId,
      status: model.status,
      error: model.error
    }))
  });
}

async function replaceSceneModels(tx: PrismaTransaction, projectId: string, models: SceneModel[]) {
  await tx.sceneModel.deleteMany({ where: { projectId } });
  if (models.length === 0) return;

  await tx.sceneModel.createMany({
    data: models.map((model, index) => ({
      id: model.id,
      projectId,
      name: model.name,
      description: model.description,
      sortOrder: index,
      visualKeywords: toJson(model.visualKeywords),
      generationPrompt: model.generationPrompt,
      imageAspectRatio: model.imageAspectRatio,
      candidateImages: toJson(model.candidateImages),
      confirmedImageId: model.confirmedImageId,
      status: model.status,
      error: model.error
    }))
  });
}

async function replaceVideoFlows(tx: PrismaTransaction, projectId: string, flows: VideoFlow[]) {
  await tx.videoFlow.deleteMany({ where: { projectId } });
  if (flows.length === 0) return;

  await tx.videoFlow.createMany({
    data: flows.map((flow, index) => ({
      id: flow.id,
      projectId,
      shotId: flow.shotId,
      sortOrder: index,
      nodes: toJson(flow.nodes),
      selectedCharacterModelId: flow.selectedCharacterModelId,
      selectedSceneModelId: flow.selectedSceneModelId,
      selectedCharacterModelIds: toJson(flow.selectedCharacterModelIds ?? []),
      selectedSceneModelIds: toJson(flow.selectedSceneModelIds ?? []),
      imagePrompt: flow.imagePrompt,
      imagePromptImageUrl: flow.imagePromptImageUrl,
      imagePromptImageName: flow.imagePromptImageName,
      prompt: flow.prompt,
      actionDescription: flow.actionDescription,
      emotion: flow.emotion,
      cameraMovement: flow.cameraMovement,
      durationSeconds: flow.durationSeconds,
      aspectRatio: flow.aspectRatio,
      videoAssetId: flow.videoAssetId,
      pendingVideoJobId: flow.pendingVideoJobId,
      status: flow.status,
      error: flow.error
    }))
  });
}

async function replaceMediaAssets(tx: PrismaTransaction, projectId: string, assets: MediaAsset[]) {
  await tx.mediaAsset.deleteMany({ where: { projectId } });
  if (assets.length === 0) return;

  await tx.mediaAsset.createMany({
    data: assets.map((asset) => ({
      id: asset.id,
      projectId,
      type: asset.type,
      url: asset.url,
      storageKey: asset.storageKey,
      provider: asset.provider,
      prompt: asset.prompt,
      jobId: asset.jobId,
      createdAt: parseDate(asset.createdAt) ?? new Date()
    }))
  });
}

export function mergeProjectSnapshotForRead(input: {
  snapshotCharacterModels: CharacterModel[];
  rowCharacterModels: CharacterModel[];
  snapshotSceneModels: SceneModel[];
  rowSceneModels: SceneModel[];
  snapshotVideoFlows: VideoFlow[];
  rowVideoFlows: VideoFlow[];
  snapshotAssets: MediaAsset[];
  rowAssets: MediaAsset[];
}) {
  return {
    characterModels: mergeCharacterModelsForRead(input.rowCharacterModels, input.snapshotCharacterModels),
    sceneModels: mergeSceneModelsForRead(input.rowSceneModels, input.snapshotSceneModels),
    videoFlows: mergeVideoFlowsForRead(input.rowVideoFlows, input.snapshotVideoFlows),
    assets: mergeAssetsForRead(input.snapshotAssets, input.rowAssets)
  };
}

function toProject(row: ProjectRow | ProjectWithWorkflowRows): Project {
  const snapshotCharacterModels = asArray<CharacterModel>(row.characterModels);
  const snapshotSceneModels = asArray<SceneModel>(row.sceneModels);
  const snapshotVideoFlows = asArray<VideoFlow>(row.videoFlows);
  const snapshotAssets = asArray<MediaAsset>(row.assets);
  const rowCharacterModels =
    "characterModelRows" in row && row.characterModelRows.length > 0 ? row.characterModelRows.map(toCharacterModel) : [];
  const rowSceneModels =
    "sceneModelRows" in row && row.sceneModelRows.length > 0 ? row.sceneModelRows.map(toSceneModel) : [];
  const rowVideoFlows = "videoFlowRows" in row && row.videoFlowRows.length > 0 ? row.videoFlowRows.map(toVideoFlow) : [];
  const rowAssets = "mediaAssets" in row && row.mediaAssets.length > 0 ? row.mediaAssets.map(toMediaAsset) : [];
  const hydrated = mergeProjectSnapshotForRead({
    snapshotCharacterModels,
    rowCharacterModels,
    snapshotSceneModels,
    rowSceneModels,
    snapshotVideoFlows,
    rowVideoFlows,
    snapshotAssets,
    rowAssets
  });
  const workflowEdges =
    "workflowEdgeRows" in row && row.workflowEdgeRows.length > 0
      ? row.workflowEdgeRows.map(toWorkflowEdge)
      : [];
  const project = syncProjectWithSeedanceSegments({
    id: row.id,
    title: row.title,
    inspiration: row.inspiration,
    status: row.status as Project["status"],
    storyState: row.storyState as Project["storyState"],
    characterModels: hydrated.characterModels,
    sceneModels: hydrated.sceneModels,
    videoFlows: hydrated.videoFlows,
    workflowEdges,
    assets: hydrated.assets,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
  const normalizedWorkflowEdges = normalizeProjectWorkflowEdges(project);

  return {
    ...project,
    videoFlows: applyWorkflowEdgesToVideoFlows(project.videoFlows, normalizedWorkflowEdges),
    workflowEdges: normalizedWorkflowEdges
  };
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function mergeCharacterModelsForRead(rows: CharacterModel[], snapshots: CharacterModel[]): CharacterModel[] {
  return mergeRowsWithSnapshots(rows, snapshots, (row, snapshot) => ({
    ...row,
    candidateImages: row.candidateImages.length > 0 ? row.candidateImages : snapshot.candidateImages,
    confirmedImageId: row.confirmedImageId ?? snapshot.confirmedImageId,
    generationRequestId: row.generationRequestId ?? snapshot.generationRequestId,
    flowMapOffset: row.flowMapOffset ?? snapshot.flowMapOffset
  })).map(sanitizeCharacterModelForRead);
}

function sanitizeCharacterModelForRead(model: CharacterModel): CharacterModel {
  const consistencyPrompt = sanitizeCharacterModelPromptOutput(model.consistencyPrompt);
  return consistencyPrompt === model.consistencyPrompt ? model : { ...model, consistencyPrompt };
}

function mergeSceneModelsForRead(rows: SceneModel[], snapshots: SceneModel[]): SceneModel[] {
  return mergeRowsWithSnapshots(rows, snapshots, (row, snapshot) => ({
    ...row,
    candidateImages: row.candidateImages.length > 0 ? row.candidateImages : snapshot.candidateImages,
    confirmedImageId: row.confirmedImageId ?? snapshot.confirmedImageId,
    generationRequestId: row.generationRequestId ?? snapshot.generationRequestId,
    flowMapOffset: row.flowMapOffset ?? snapshot.flowMapOffset
  }));
}

function mergeVideoFlowsForRead(rows: VideoFlow[], snapshots: VideoFlow[]): VideoFlow[] {
  return mergeRowsWithSnapshots(rows, snapshots, (row, snapshot) => {
    const recoveredVideoAssetId = row.videoAssetId ?? snapshot.videoAssetId;
    return {
      ...row,
      videoAssetId: recoveredVideoAssetId,
      pendingVideoJobId: row.pendingVideoJobId ?? snapshot.pendingVideoJobId,
      firstFrameImageAssetId: row.firstFrameImageAssetId ?? snapshot.firstFrameImageAssetId,
      lastFrameImageAssetId: row.lastFrameImageAssetId ?? snapshot.lastFrameImageAssetId,
      generationRequestId: row.generationRequestId ?? snapshot.generationRequestId,
      flowMapOffsets: row.flowMapOffsets ?? snapshot.flowMapOffsets,
      status: !row.videoAssetId && snapshot.videoAssetId ? snapshot.status : row.status,
      nodes: mergeVideoFlowNodesForRead(row.nodes, snapshot.nodes)
    };
  });
}

function mergeRowsWithSnapshots<T extends { id: string }>(
  rows: T[],
  snapshots: T[],
  merge: (row: T, snapshot: T) => T
): T[] {
  if (rows.length === 0) return snapshots;
  const usedSnapshotIds = new Set<string>();
  const mergedRows = rows.map((row) => {
    const snapshot = findSnapshotByCompatibleId(snapshots, row.id);
    if (!snapshot) return row;
    usedSnapshotIds.add(snapshot.id);
    return merge(row, snapshot);
  });
  return [
    ...mergedRows,
    ...snapshots.filter((snapshot) => !usedSnapshotIds.has(snapshot.id) && !rows.some((row) => areCompatibleIds(row.id, snapshot.id)))
  ];
}

function mergeVideoFlowNodesForRead(row: VideoFlow["nodes"], snapshot: VideoFlow["nodes"]): VideoFlow["nodes"] {
  return {
    characterNode: row.characterNode,
    sceneNode: row.sceneNode,
    promptNode: {
      ...row.promptNode,
      candidateImages:
        row.promptNode.candidateImages && row.promptNode.candidateImages.length > 0
          ? row.promptNode.candidateImages
          : snapshot.promptNode.candidateImages,
      confirmedImageId: row.promptNode.confirmedImageId ?? snapshot.promptNode.confirmedImageId
    },
    videoNode: !isReadyNode(row.videoNode) && isReadyNode(snapshot.videoNode) ? snapshot.videoNode : row.videoNode,
    previewNode: !isReadyNode(row.previewNode) && isReadyNode(snapshot.previewNode) ? snapshot.previewNode : row.previewNode
  };
}

function isReadyNode(node: VideoFlow["nodes"][keyof VideoFlow["nodes"]]): boolean {
  return node.status === "ready";
}

function mergeAssetsForRead(snapshotAssets: MediaAsset[], rowAssets: MediaAsset[]): MediaAsset[] {
  const byId = new Map<string, MediaAsset>();
  for (const asset of snapshotAssets) byId.set(asset.id, asset);
  for (const asset of rowAssets) byId.set(asset.id, asset);
  return Array.from(byId.values());
}

function findSnapshotByCompatibleId<T extends { id: string }>(snapshots: T[], id: string): T | undefined {
  return snapshots.find((snapshot) => areCompatibleIds(snapshot.id, id));
}

function areCompatibleIds(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.endsWith(`:${right}`) || right.endsWith(`:${left}`)) return true;
  return left.split(":").at(-1) === right.split(":").at(-1);
}

function toWorkflowEdge(row: WorkflowEdgeRow): WorkflowEdge {
  return {
    id: row.id,
    sourceType: row.sourceType as WorkflowEdge["sourceType"],
    sourceId: row.sourceId,
    sourcePort: row.sourcePort,
    targetType: row.targetType as WorkflowEdge["targetType"],
    targetId: row.targetId,
    targetPort: row.targetPort as WorkflowEdge["targetPort"],
    kind: row.kind as WorkflowEdge["kind"],
    metadata: row.metadata ? (row.metadata as Record<string, unknown>) : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toMediaAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    type: row.type as MediaAsset["type"],
    url: row.url,
    storageKey: row.storageKey ?? undefined,
    provider: row.provider as MediaAsset["provider"],
    prompt: row.prompt,
    jobId: row.jobId ?? undefined,
    createdAt: row.createdAt.toISOString()
  };
}

function toCharacterModel(row: CharacterModelRow): CharacterModel {
  return {
    id: row.id,
    characterId: row.characterId,
    name: row.name,
    description: row.description,
    consistencyPrompt: row.consistencyPrompt,
    imageAspectRatio: row.imageAspectRatio ?? undefined,
    candidateImages: row.candidateImages as MediaAsset[],
    confirmedImageId: row.confirmedImageId ?? undefined,
    status: row.status as CharacterModel["status"],
    error: row.error ?? undefined
  };
}

function toSceneModel(row: SceneModelRow): SceneModel {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visualKeywords: row.visualKeywords as string[],
    generationPrompt: row.generationPrompt ?? undefined,
    imageAspectRatio: row.imageAspectRatio ?? undefined,
    candidateImages: row.candidateImages as MediaAsset[],
    confirmedImageId: row.confirmedImageId ?? undefined,
    status: row.status as SceneModel["status"],
    error: row.error ?? undefined
  };
}

function toVideoFlow(row: VideoFlowRow): VideoFlow {
  return {
    id: row.id,
    shotId: row.shotId,
    nodes: row.nodes as VideoFlow["nodes"],
    selectedCharacterModelId: row.selectedCharacterModelId ?? undefined,
    selectedSceneModelId: row.selectedSceneModelId ?? undefined,
    selectedCharacterModelIds: row.selectedCharacterModelIds as string[],
    selectedSceneModelIds: row.selectedSceneModelIds as string[],
    imagePrompt: row.imagePrompt ?? undefined,
    imagePromptImageUrl: row.imagePromptImageUrl ?? undefined,
    imagePromptImageName: row.imagePromptImageName ?? undefined,
    prompt: row.prompt,
    actionDescription: row.actionDescription,
    emotion: row.emotion,
    cameraMovement: row.cameraMovement,
    durationSeconds: row.durationSeconds as 15,
    aspectRatio: row.aspectRatio as VideoFlow["aspectRatio"],
    videoAssetId: row.videoAssetId ?? undefined,
    pendingVideoJobId: row.pendingVideoJobId ?? undefined,
    status: row.status as VideoFlow["status"],
    error: row.error ?? undefined
  };
}

function normalizeProjectRelationIds(project: Project): Project {
  const characterIdMap = createRelationIdMap(
    project.id,
    "characterModel",
    project.characterModels.map((model) => model.id)
  );
  const sceneIdMap = createRelationIdMap(
    project.id,
    "sceneModel",
    project.sceneModels.map((model) => model.id)
  );
  const flowIdMap = createRelationIdMap(
    project.id,
    "videoFlow",
    project.videoFlows.map((flow) => flow.id)
  );

  const characterModels = project.characterModels.map((model) => ({
    ...model,
    id: characterIdMap.get(model.id) || model.id
  }));
  const sceneModels = project.sceneModels.map((model) => ({
    ...model,
    id: sceneIdMap.get(model.id) || model.id
  }));
  const videoFlows = project.videoFlows.map((flow) => {
    const nextFlowId = flowIdMap.get(flow.id) || flow.id;
    return {
      ...flow,
      id: nextFlowId,
      selectedCharacterModelId: mapOptionalRelationId(characterIdMap, flow.selectedCharacterModelId),
      selectedSceneModelId: mapOptionalRelationId(sceneIdMap, flow.selectedSceneModelId),
      selectedCharacterModelIds: mapRelationIds(characterIdMap, flow.selectedCharacterModelIds),
      selectedSceneModelIds: mapRelationIds(sceneIdMap, flow.selectedSceneModelIds)
    };
  });
  const workflowEdges = project.workflowEdges.map((edge) => {
    const sourceId = mapWorkflowSourceId(edge, characterIdMap, sceneIdMap, flowIdMap);
    const targetId = flowIdMap.get(edge.targetId) || edge.targetId;
    const nextEdge = {
      ...edge,
      sourceId,
      targetId
    };
    return {
      ...nextEdge,
      id: createWorkflowEdgeId(project.id, nextEdge)
    };
  });

  return {
    ...project,
    characterModels,
    sceneModels,
    videoFlows,
    workflowEdges
  };
}

function createRelationIdMap(projectId: string, kind: string, ids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const seen = new Map<string, number>();

  ids.forEach((id, index) => {
    const baseId = namespaceRelationId(projectId, kind, id);
    const count = seen.get(baseId) || 0;
    seen.set(baseId, count + 1);
    map.set(id, count === 0 ? baseId : `${baseId}:${index + 1}`);
  });

  return map;
}

function namespaceRelationId(projectId: string, kind: string, id: string): string {
  const prefix = `${projectId}:${kind}:`;
  return id.startsWith(prefix) ? id : `${prefix}${id}`;
}

function mapOptionalRelationId(map: Map<string, string>, id: string | undefined): string | undefined {
  if (!id) return undefined;
  return map.get(id) || id;
}

function mapRelationIds(map: Map<string, string>, ids: string[] | undefined): string[] | undefined {
  if (!ids) return undefined;
  return ids.map((id) => map.get(id) || id);
}

function mapWorkflowSourceId(
  edge: WorkflowEdge,
  characterIdMap: Map<string, string>,
  sceneIdMap: Map<string, string>,
  flowIdMap: Map<string, string>
): string {
  if (edge.sourceType === "characterModel") return characterIdMap.get(edge.sourceId) || edge.sourceId;
  if (edge.sourceType === "sceneModel") return sceneIdMap.get(edge.sourceId) || edge.sourceId;
  if (edge.sourceType === "imagePrompt") {
    const [flowId, suffix] = edge.sourceId.split(":imagePrompt");
    const nextFlowId = flowIdMap.get(flowId) || flowId;
    return `${nextFlowId}:imagePrompt${suffix || ""}`;
  }
  return edge.sourceId;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
