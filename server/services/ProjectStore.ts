import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Project, ProjectSummary, WorkflowEdge } from "../../src/types/domain";
import { sanitizeProjectCharacterModelPrompts } from "../../src/data/demoProject";
import { removeProjectAsset } from "../../src/lib/projectAssets";
import { mergeProjectMediaForSave } from "./ProjectMediaMerge";
import { syncProjectWithSeedanceSegments } from "./ProjectDerivation";
import {
  applyWorkflowEdgesToVideoFlows,
  applyWorkflowEdgeMutationToVideoFlows,
  deleteWorkflowEdge,
  normalizeProjectWorkflowEdgesForSave,
  normalizeProjectWorkflowEdges,
  upsertWorkflowEdge
} from "./WorkflowEdges";

export type GenerationJobRecord = {
  id: string;
  projectId: string;
  targetType: "character" | "scene" | "imagePrompt" | "video";
  targetId: string;
  provider: string;
  model: string;
  status: "queued" | "generating" | "ready" | "failed";
  requestPayload: unknown;
  resultPayload?: unknown;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
};

export interface ProjectStore {
  list(): Promise<Project[]>;
  listSummaries(): Promise<ProjectSummary[]>;
  get(id: string): Promise<Project | undefined>;
  save(project: Project): Promise<Project>;
  listGenerationJobs(projectId: string): Promise<GenerationJobRecord[]>;
  getGenerationJob(id: string): Promise<GenerationJobRecord | undefined>;
  saveGenerationJob(job: GenerationJobRecord): Promise<GenerationJobRecord>;
  listWorkflowEdges(projectId: string): Promise<WorkflowEdge[]>;
  getWorkflowEdge(projectId: string, edgeId: string): Promise<WorkflowEdge | undefined>;
  saveWorkflowEdge(projectId: string, edge: WorkflowEdge): Promise<WorkflowEdge>;
  deleteWorkflowEdge(projectId: string, edgeId: string): Promise<boolean>;
  deleteProjectAsset(projectId: string, assetId: string): Promise<Project | undefined>;
}

export class JsonProjectStore implements ProjectStore {
  private readonly generationJobs = new Map<string, GenerationJobRecord>();

  constructor(private readonly filePath: string) {}

  async list(): Promise<Project[]> {
    const projects = await this.readAll();
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async listSummaries(): Promise<ProjectSummary[]> {
    const projects = await this.list();
    return projects.map(toProjectSummary);
  }

  async get(id: string): Promise<Project | undefined> {
    const projects = await this.readAll();
    return projects.find((project) => project.id === id);
  }

  async save(project: Project): Promise<Project> {
    const projects = await this.readAll();
    const existingProject = projects.find((item) => item.id === project.id);
    const projectForSave = syncProjectWithSeedanceSegments(
      sanitizeProjectCharacterModelPrompts(mergeProjectMediaForSave(project, existingProject))
    );
    const workflowEdges = normalizeProjectWorkflowEdgesForSave(projectForSave, existingProject);
    const nextProject = {
      ...projectForSave,
      videoFlows: applyWorkflowEdgesToVideoFlows(projectForSave.videoFlows, workflowEdges),
      workflowEdges,
      updatedAt: new Date().toISOString()
    };
    const index = projects.findIndex((item) => item.id === project.id);
    if (index >= 0) {
      projects[index] = nextProject;
    } else {
      projects.push(nextProject);
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(projects, null, 2), "utf8");
    return nextProject;
  }

  async listGenerationJobs(projectId: string): Promise<GenerationJobRecord[]> {
    return Array.from(this.generationJobs.values())
      .filter((job) => job.projectId === projectId)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  async getGenerationJob(id: string): Promise<GenerationJobRecord | undefined> {
    return this.generationJobs.get(id);
  }

  async saveGenerationJob(job: GenerationJobRecord): Promise<GenerationJobRecord> {
    const now = new Date().toISOString();
    const existing = this.generationJobs.get(job.id);
    const nextJob = {
      ...job,
      createdAt: existing?.createdAt || job.createdAt || now,
      updatedAt: now
    };
    this.generationJobs.set(job.id, nextJob);
    return nextJob;
  }

  async listWorkflowEdges(projectId: string): Promise<WorkflowEdge[]> {
    const project = await this.get(projectId);
    return project?.workflowEdges || [];
  }

  async getWorkflowEdge(projectId: string, edgeId: string): Promise<WorkflowEdge | undefined> {
    const edges = await this.listWorkflowEdges(projectId);
    return edges.find((edge) => edge.id === edgeId);
  }

  async saveWorkflowEdge(projectId: string, edge: WorkflowEdge): Promise<WorkflowEdge> {
    const projects = await this.readAll();
    const index = projects.findIndex((project) => project.id === projectId);
    if (index < 0) throw new Error("Project not found");

    const project = projects[index];
    const nextEdges = upsertWorkflowEdge(project.workflowEdges || [], edge);
    const nextProject = {
      ...project,
      videoFlows: applyWorkflowEdgeMutationToVideoFlows(project.videoFlows, edge, "connect"),
      workflowEdges: nextEdges,
      updatedAt: new Date().toISOString()
    };
    projects[index] = nextProject;
    await this.writeAll(projects);
    return nextEdges.find((item) => item.id === edge.id)!;
  }

  async deleteWorkflowEdge(projectId: string, edgeId: string): Promise<boolean> {
    const projects = await this.readAll();
    const index = projects.findIndex((project) => project.id === projectId);
    if (index < 0) return false;

    const project = projects[index];
    const edge = (project.workflowEdges || []).find((item) => item.id === edgeId);
    if (!edge) return false;

    projects[index] = {
      ...project,
      videoFlows: applyWorkflowEdgeMutationToVideoFlows(project.videoFlows, edge, "disconnect"),
      workflowEdges: deleteWorkflowEdge(project.workflowEdges || [], edgeId),
      updatedAt: new Date().toISOString()
    };
    await this.writeAll(projects);
    return true;
  }

  async deleteProjectAsset(projectId: string, assetId: string): Promise<Project | undefined> {
    const projects = await this.readAll();
    const index = projects.findIndex((project) => project.id === projectId);
    if (index < 0) return undefined;

    const { project: nextProject, asset } = removeProjectAsset(projects[index], assetId);
    if (!asset) return undefined;

    projects[index] = nextProject;
    await this.writeAll(projects);
    return nextProject;
  }

  private async readAll(): Promise<Project[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return (JSON.parse(raw) as Project[]).map(normalizeProjectForRead);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return [];
      throw error;
    }
  }

  private async writeAll(projects: Project[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(projects, null, 2), "utf8");
  }
}

export const ProjectStore = JsonProjectStore;

function normalizeProjectForRead(project: Project): Project {
  const normalizedProject = syncProjectWithSeedanceSegments(sanitizeProjectCharacterModelPrompts(project));
  const workflowEdges = normalizeProjectWorkflowEdges(normalizedProject);
  return {
    ...normalizedProject,
    videoFlows: applyWorkflowEdgesToVideoFlows(normalizedProject.videoFlows, workflowEdges),
    workflowEdges
  };
}

function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    title: project.title,
    inspiration: project.inspiration,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}
