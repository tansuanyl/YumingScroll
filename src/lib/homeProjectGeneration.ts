import type { Project } from "../types/domain";
import type { TextModelSelection } from "./apiClient";

type HomeProjectGenerationApi = {
  createProject: (input: { title?: string; inspiration?: string }) => Promise<Project>;
  generateStory: (
    projectId: string,
    input: { inspiration: string; textModel?: TextModelSelection },
    options?: { signal?: AbortSignal; generationRequestId?: string }
  ) => Promise<Project>;
};

type HomeSourceImportApi = {
  createProject: (input: { title?: string; inspiration?: string }) => Promise<Project>;
  importSource: (
    projectId: string,
    input: {
      sourceText?: string;
      sourceFile?: {
        fileName: string;
        mimeType?: string;
        base64: string;
      };
      textModel?: TextModelSelection;
    },
    options?: { signal?: AbortSignal; generationRequestId?: string }
  ) => Promise<Project>;
};

type GenerateStoryInNewHomeProjectInput = {
  currentProjectId?: string;
  prompt: string;
  textModel?: TextModelSelection;
  signal?: AbortSignal;
  generationRequestId?: string;
};

type GenerateStoryInNewHomeProjectCallbacks = {
  onDraftProject?: (project: Project) => void;
};

type ImportSourceInNewHomeProjectInput = {
  sourceText?: string;
  sourceFile?: {
    fileName: string;
    mimeType?: string;
    base64: string;
  };
  textModel?: TextModelSelection;
  signal?: AbortSignal;
  generationRequestId?: string;
};

export async function generateStoryInNewHomeProject(
  api: HomeProjectGenerationApi,
  input: GenerateStoryInNewHomeProjectInput,
  callbacks: GenerateStoryInNewHomeProjectCallbacks = {}
): Promise<{ draftProject: Project; generatedProject: Project }> {
  const draftProject = await api.createProject(buildHomeProjectDraftInput(input.prompt));
  callbacks.onDraftProject?.(draftProject);
  const generatedProject = await api.generateStory(
    draftProject.id,
    {
      inspiration: input.prompt,
      textModel: input.textModel
    },
    {
      signal: input.signal,
      generationRequestId: input.generationRequestId
    }
  );

  return { draftProject, generatedProject };
}

export async function importSourceInNewHomeProject(
  api: HomeSourceImportApi,
  input: ImportSourceInNewHomeProjectInput,
  callbacks: GenerateStoryInNewHomeProjectCallbacks = {}
): Promise<{ draftProject: Project; generatedProject: Project }> {
  const sourceLabel = input.sourceFile?.fileName || input.sourceText?.replace(/\s+/g, " ").trim().slice(0, 48) || "导入原文";
  const draftProject = await api.createProject(buildHomeProjectDraftInput(sourceLabel));
  callbacks.onDraftProject?.(draftProject);
  const generatedProject = await api.importSource(
    draftProject.id,
    {
      sourceText: input.sourceText,
      sourceFile: input.sourceFile,
      textModel: input.textModel
    },
    {
      signal: input.signal,
      generationRequestId: input.generationRequestId
    }
  );

  return { draftProject, generatedProject };
}

export function buildHomeProjectDraftInput(prompt: string): { title: string; inspiration: string } {
  const normalizedPrompt = prompt.replace(/\s+/g, " ").trim();
  const titleSeed = normalizedPrompt.slice(0, 24) || "新项目";
  return {
    title: titleSeed,
    inspiration: normalizedPrompt
  };
}
