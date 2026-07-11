import { Router } from "express";
import { createDemoProject } from "../../src/data/demoProject";
import { findProjectAsset } from "../../src/lib/projectAssets";
import type { MediaAsset, Project, WorkflowEdge } from "../../src/types/domain";
import { workflowEdgeSchema } from "../schemas";
import { AssetStorageService } from "../services/AssetStorageService";
import type { ProjectStore } from "../services/ProjectStore";
import { invalidateVideoOutputsForChangedSeedanceScript } from "../services/ProjectVideoInvalidation";
import { createWorkflowEdgeId } from "../services/WorkflowEdges";

export function createProjectRouter(store: ProjectStore, assetStorage: AssetStorageService = new AssetStorageService()): Router {
  const router = Router();

  router.get("/", async (_req, res, next) => {
    try {
      res.json(await store.list());
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const body = req.body as Partial<Project>;
      const project = createDemoProject({
        title: body.title || undefined,
        inspiration: body.inspiration || undefined
      });
      res.status(201).json(await store.save(project));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const project = await store.get(req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(project);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/generation-jobs", async (req, res, next) => {
    try {
      const project = await store.get(req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(await store.listGenerationJobs(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/workflow-edges", async (req, res, next) => {
    try {
      const project = await store.get(req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json(await store.listWorkflowEdges(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/assets/:assetId/download", async (req, res, next) => {
    try {
      const project = await store.get(req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const asset = findProjectAsset(project, req.params.assetId);
      if (!asset?.url) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }

      const payload = await loadAssetPayload(asset.url);
      const filename = buildAssetFilename(project, asset, payload.contentType);
      res.setHeader("content-type", payload.contentType);
      res.setHeader("content-length", payload.body.length);
      res.setHeader("content-disposition", buildAttachmentDisposition(filename));
      res.send(payload.body);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/workflow-edges", async (req, res, next) => {
    try {
      const project = await store.get(req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const input = workflowEdgeSchema.parse(req.body);
      const missingReference = validateWorkflowEdgeReferences(project, input);
      if (missingReference) {
        res.status(400).json({ error: missingReference });
        return;
      }

      const edge: WorkflowEdge = {
        ...input,
        id: input.id || createWorkflowEdgeId(project.id, input),
        targetType: "videoFlow"
      };
      res.status(201).json(await store.saveWorkflowEdge(project.id, edge));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/workflow-edges/:edgeId", async (req, res, next) => {
    try {
      const deleted = await store.deleteWorkflowEdge(req.params.id, req.params.edgeId);
      if (!deleted) {
        res.status(404).json({ error: "Workflow edge not found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/assets/:assetId", async (req, res, next) => {
    try {
      const project = await store.get(req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const asset = findProjectAsset(project, req.params.assetId);
      if (!asset) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }

      const nextProject = await store.deleteProjectAsset(project.id, asset.id);
      if (!nextProject) {
        res.status(404).json({ error: "Asset not found" });
        return;
      }
      assetStorage.deleteAsset(asset).catch((error) => console.warn("Stored asset cleanup failed", error));
      res.json(nextProject);
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id", async (req, res, next) => {
    try {
      const project = req.body as Project;
      if (project.id !== req.params.id) {
        res.status(400).json({ error: "Project id mismatch" });
        return;
      }
      const existing = await store.get(project.id);
      res.json(await store.save(existing ? invalidateVideoOutputsForChangedSeedanceScript(project, existing) : project));
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/export", async (req, res, next) => {
    try {
      const project = await store.get(req.params.id);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      res.json({
        exportedAt: new Date().toISOString(),
        projectId: project.id,
        title: project.title,
        assets: project.assets,
        videoFlows: project.videoFlows
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function validateWorkflowEdgeReferences(project: Project, edge: Omit<WorkflowEdge, "id"> & { id?: string }): string | undefined {
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

async function loadAssetPayload(url: string): Promise<{ body: Buffer; contentType: string }> {
  if (url.startsWith("data:")) return loadDataUrlPayload(url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Asset download failed: ${response.status}`);
  }
  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream"
  };
}

function loadDataUrlPayload(url: string): { body: Buffer; contentType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!match) throw new Error("Invalid data URL asset");
  const contentType = match[1] || "application/octet-stream";
  const encoded = match[3] || "";
  return {
    body: match[2] ? Buffer.from(encoded, "base64") : Buffer.from(decodeURIComponent(encoded)),
    contentType
  };
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
