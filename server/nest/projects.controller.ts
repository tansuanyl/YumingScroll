import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Res
} from "@nestjs/common";
import type { Response } from "express";
import { createDemoProject } from "../../src/data/demoProject";
import { findProjectAsset } from "../../src/lib/projectAssets";
import type { MediaAsset, Project, WorkflowEdge } from "../../src/types/domain";
import { workflowEdgeSchema } from "../schemas";
import { AssetStorageService } from "../services/AssetStorageService";
import type { AuthUserRecord } from "../services/AuthService";
import { canAccessProject } from "../services/AccessControl";
import { invalidateVideoOutputsForChangedSeedanceScript } from "../services/ProjectVideoInvalidation";
import { MediaPipelineService } from "../services/MediaPipelineService";
import type { ProjectStore } from "../services/ProjectStore";
import { createWorkflowEdgeId } from "../services/WorkflowEdges";
import { CurrentUser } from "./auth.decorators";
import { PROJECT_STORE } from "./tokens";

@Controller("api/projects")
export class ProjectsController {
  constructor(
    @Inject(PROJECT_STORE) private readonly store: ProjectStore,
    @Inject(AssetStorageService)
    private readonly assetStorage: AssetStorageService,
    @Inject(MediaPipelineService)
    private readonly media: MediaPipelineService
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUserRecord) {
    const summaries = await this.store.listSummaries();
    if (user.role === "admin") return summaries;
    return summaries.filter((project) => project.ownerUserId === user.id);
  }

  @Post()
  async create(@CurrentUser() user: AuthUserRecord, @Body() body: Partial<Project>) {
    const project = createDemoProject({
      title: body.title || undefined,
      inspiration: body.inspiration || undefined
    });
    return this.store.save({ ...project, ownerUserId: user.id });
  }

  @Get(":id/generation-jobs")
  async generationJobs(@CurrentUser() user: AuthUserRecord, @Param("id") id: string) {
    await this.requireProject(id, user);
    return this.store.listGenerationJobs(id);
  }

  @Get(":id/workflow-edges")
  async workflowEdges(@CurrentUser() user: AuthUserRecord, @Param("id") id: string) {
    await this.requireProject(id, user);
    return this.store.listWorkflowEdges(id);
  }

  @Get(":id/assets/:assetId/download")
  async downloadAsset(
    @CurrentUser() user: AuthUserRecord,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
    @Res() res: Response
  ) {
    const project = await this.requireProject(id, user);
    const asset = findProjectAsset(project, assetId);
    if (!asset?.url) throw new NotFoundException("Asset not found");

    const payload = await this.assetStorage.loadAsset(asset);
    const filename = buildAssetFilename(project, asset, payload.contentType);
    res.setHeader("content-type", payload.contentType);
    res.setHeader("content-length", payload.body.length);
    res.setHeader("content-disposition", buildAttachmentDisposition(filename));
    res.send(payload.body);
  }

  @Get(":id/assets/:assetId/file")
  async viewAsset(
    @CurrentUser() user: AuthUserRecord,
    @Param("id") id: string,
    @Param("assetId") assetId: string,
    @Res() res: Response
  ) {
    const project = await this.requireProject(id, user);
    const asset = findProjectAsset(project, assetId);
    if (!asset?.url) throw new NotFoundException("Asset not found");

    const payload = await this.assetStorage.loadAsset(asset);
    res.setHeader("content-type", payload.contentType);
    res.setHeader("content-length", payload.body.length);
    res.setHeader("cache-control", "private, max-age=3600");
    res.send(payload.body);
  }

  @Get(":id")
  async get(@CurrentUser() user: AuthUserRecord, @Param("id") id: string) {
    const project = await this.requireProject(id, user);
    return this.media.refreshPendingVideoJobs(project.id);
  }

  @Post(":id/workflow-edges")
  async createWorkflowEdge(@CurrentUser() user: AuthUserRecord, @Param("id") id: string, @Body() body: unknown) {
    const project = await this.requireProject(id, user);
    const input = workflowEdgeSchema.parse(body);
    const missingReference = validateWorkflowEdgeReferences(project, input);
    if (missingReference) throw new BadRequestException(missingReference);

    const edge: WorkflowEdge = {
      ...input,
      id: input.id || createWorkflowEdgeId(project.id, input),
      targetType: "videoFlow"
    };
    return this.store.saveWorkflowEdge(project.id, edge);
  }

  @Delete(":id/workflow-edges/:edgeId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkflowEdge(@CurrentUser() user: AuthUserRecord, @Param("id") id: string, @Param("edgeId") edgeId: string) {
    await this.requireProject(id, user);
    const deleted = await this.store.deleteWorkflowEdge(id, edgeId);
    if (!deleted) throw new NotFoundException("Workflow edge not found");
  }

  @Delete(":id/assets/:assetId")
  async deleteAsset(@CurrentUser() user: AuthUserRecord, @Param("id") id: string, @Param("assetId") assetId: string) {
    const project = await this.requireProject(id, user);
    const asset = findProjectAsset(project, assetId);
    if (!asset) throw new NotFoundException("Asset not found");

    const nextProject = await this.store.deleteProjectAsset(project.id, asset.id);
    if (!nextProject) throw new NotFoundException("Asset not found");
    this.assetStorage.deleteAsset(asset).catch((error) => console.warn("Stored asset cleanup failed", error));
    return nextProject;
  }

  @Put(":id")
  async save(@CurrentUser() user: AuthUserRecord, @Param("id") id: string, @Body() project: Project) {
    if (project.id !== id) throw new BadRequestException("Project id mismatch");
    const existing = await this.requireProject(id, user);
    const ownerUserId = user.role === "admin" ? project.ownerUserId || existing.ownerUserId : user.id;
    const sanitizedProject = invalidateVideoOutputsForChangedSeedanceScript({ ...project, ownerUserId }, existing);
    return this.store.save(sanitizedProject);
  }

  @Post(":id/export")
  async export(@CurrentUser() user: AuthUserRecord, @Param("id") id: string) {
    const project = await this.requireProject(id, user);
    return {
      exportedAt: new Date().toISOString(),
      projectId: project.id,
      title: project.title,
      assets: project.assets,
      videoFlows: project.videoFlows
    };
  }

  private async requireProject(id: string, user: AuthUserRecord): Promise<Project> {
    const project = await this.store.get(id);
    if (!project) throw new NotFoundException("Project not found");
    if (!canAccessProject(user, project)) throw new ForbiddenException("Project is not available for this account");
    return project;
  }
}

function validateWorkflowEdgeReferences(
  project: Project,
  edge: Omit<WorkflowEdge, "id"> & { id?: string }
): string | undefined {
  if (!project.videoFlows.some((flow) => flow.id === edge.targetId)) {
    return "Target video flow not found";
  }
  if (edge.sourceType === "characterModel" && !project.characterModels.some((model) => model.id === edge.sourceId)) {
    return "Source character model not found";
  }
  if (edge.sourceType === "sceneModel" && !project.sceneModels.some((model) => model.id === edge.sourceId)) {
    return "Source scene model not found";
  }
  if (edge.sourceType === "script" && !project.videoFlows.some((flow) => flow.shotId === edge.sourceId)) {
    return "Source script shot not found";
  }
  return undefined;
}

function buildAssetFilename(project: Project, asset: MediaAsset, contentType: string): string {
  const extension = inferAssetExtension(asset, contentType);
  return `${sanitizeFilePart(project.title || "ai-comic")}-${asset.type}-${sanitizeFilePart(asset.id)}${extension}`;
}

function inferAssetExtension(asset: MediaAsset, contentType: string): string {
  const fromUrl = extensionFromUrl(asset.url);
  if (fromUrl) return fromUrl;
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("mp4")) return ".mp4";
  return asset.type === "video" ? ".mp4" : ".png";
}

function extensionFromUrl(url: string): string | undefined {
  try {
    const pathname = new URL(url).pathname;
    const match = /\.(png|jpe?g|webp|gif|mp4|mov|webm)$/i.exec(pathname);
    return match?.[0].toLowerCase();
  } catch {
    return undefined;
  }
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "-").trim().slice(0, 80) || "asset";
}

function buildAttachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]+/g, "_").replace(/"/g, "");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
