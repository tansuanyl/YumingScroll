import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Post } from "@nestjs/common";
import mammoth from "mammoth";
import { extname } from "node:path";
import type { Project, StoryState } from "../../src/types/domain";
import {
  generateStorySchema,
  importSourceSchema,
  regenerateSectionSchema,
  reviseSeedanceScriptSchema,
  visualPromptsSchema
} from "../schemas";
import { deriveCharacterModels, deriveSceneModels, deriveVideoFlows } from "../services/ProjectDerivation";
import { invalidateVideoOutputsForChangedSeedanceScript } from "../services/ProjectVideoInvalidation";
import type { ProjectStore } from "../services/ProjectStore";
import { TextPipelineService } from "../services/TextPipelineService";
import { getImportedSourceLabel, sanitizeImportedSourceText } from "../providers/OpenAITextProvider";
import { getTextGenerationRequestId, isGenerationRequestCurrent } from "../../src/lib/generationCancellation";
import { PROJECT_STORE } from "./tokens";

@Controller("api/text")
export class TextController {
  constructor(
    @Inject(PROJECT_STORE) private readonly store: ProjectStore,
    @Inject(TextPipelineService)
    private readonly text: TextPipelineService
  ) {}

  @Get("provider-status")
  providerStatus() {
    return this.text.status();
  }

  @Post("generate-story")
  async generateStory(@Body() body: unknown) {
    const input = generateStorySchema.parse(body);
    const project = input.projectId ? await this.requireProject(input.projectId) : undefined;

    try {
      const storyState = await this.text.generateStory({
        inspiration: input.inspiration,
        worldTitle: input.worldTitle,
        worldBackground: input.worldBackground,
        outline: input.outline,
        visualStyleId: input.visualStyleId,
        textModel: input.textModel
      });

      if (!project) {
        return storyState;
      }

      const latestProject = await this.requireProject(project.id);
      if (!isGenerationRequestCurrent(getTextGenerationRequestId(latestProject), input.generationRequestId)) {
        return latestProject;
      }

      latestProject.title = deriveProjectTitle(storyState, input.worldTitle || input.inspiration || latestProject.title);
      latestProject.inspiration = input.inspiration;
      latestProject.storyState = storyState;
      latestProject.characterModels = deriveCharacterModels(storyState);
      latestProject.sceneModels = deriveSceneModels(storyState);
      latestProject.videoFlows = deriveVideoFlows(storyState);
      latestProject.status = "text-ready";
      latestProject.textGenerationRequestId = undefined;
      latestProject.storyState.textGenerationRequestId = undefined;
      return this.store.save(latestProject);
    } catch (error) {
      throw error;
    }
  }

  @Post("import-source")
  async importSource(@Body() body: unknown) {
    const input = importSourceSchema.parse(body);
    const project = await this.requireProject(input.projectId);

    const extractedFileText = input.sourceFile ? await extractUploadedSourceText(input.sourceFile) : "";
    const sourceText = [input.sourceText?.trim(), extractedFileText].filter(Boolean).join("\n\n").trim();
    const cleanedSourceText = sanitizeImportedSourceText(sourceText);
    if (cleanedSourceText.length < 20) {
      throw new BadRequestException("Imported content is too short. Paste a fuller novel text or upload txt/md/docx.");
    }

    const sourceFileName = input.sourceFile?.fileName;
    const sourceLabel = sourceFileName || getImportedSourceLabel(cleanedSourceText);
    const inspiration = `Imported source: ${sourceLabel}`;

    try {
      const storyState = await this.text.generateStory({
        inspiration,
        sourceType: "novel",
        sourceText: cleanedSourceText,
        sourceFileName,
        visualStyleId: input.visualStyleId,
        textModel: input.textModel
      });

      const latestProject = await this.requireProject(project.id);
      if (!isGenerationRequestCurrent(getTextGenerationRequestId(latestProject), input.generationRequestId)) {
        return latestProject;
      }

      latestProject.title = deriveProjectTitle(storyState, sourceFileName || storyState.world.title || latestProject.title);
      latestProject.inspiration = inspiration;
      latestProject.storyState = storyState;
      latestProject.characterModels = deriveCharacterModels(storyState);
      latestProject.sceneModels = deriveSceneModels(storyState);
      latestProject.videoFlows = deriveVideoFlows(storyState);
      latestProject.status = "text-ready";
      latestProject.textGenerationRequestId = undefined;
      latestProject.storyState.textGenerationRequestId = undefined;
      return this.store.save(latestProject);
    } catch (error) {
      throw error;
    }
  }

  @Post("regenerate-section")
  regenerateSection(@Body() body: unknown) {
    const input = regenerateSectionSchema.parse(body);
    return this.text.regenerateSection(input.section, input.inspiration, input.textModel);
  }

  @Post("revise-seedance-script")
  async reviseSeedanceScript(@Body() body: unknown) {
    const input = reviseSeedanceScriptSchema.parse(body);
    const project = await this.requireProject(input.projectId);

    const revisedScript = await this.text.reviseSeedanceScript({
      currentScript: input.currentScript,
      revisionPrompt: input.revisionPrompt,
      storyContext: input.storyContext,
      textModel: input.textModel
    });

    const nextProject = {
      ...project,
      storyState: {
        ...project.storyState,
        seedanceScript: revisedScript
      },
      status: "text-ready" as const
    };
    const sanitizedProject = invalidateVideoOutputsForChangedSeedanceScript(nextProject, project);
    return this.store.save(sanitizedProject);
  }

  @Post("generate-visual-prompts")
  async generateVisualPrompts(@Body() body: unknown) {
    const input = visualPromptsSchema.parse(body);
    const story = await this.text.generateStory({ inspiration: input.inspiration, textModel: input.textModel });
    return story.visualPrompts;
  }

  private async requireProject(id: string): Promise<Project> {
    const project = await this.store.get(id);
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}

function deriveProjectTitle(storyState: StoryState, fallback: string): string {
  const title = storyState.world.title?.trim();
  if (title) return title;
  return fallback.trim().slice(0, 24) || "Untitled project";
}

async function extractUploadedSourceText(file: { fileName: string; mimeType?: string; base64: string }): Promise<string> {
  const buffer = Buffer.from(file.base64, "base64");
  const extension = extname(file.fileName).toLowerCase();
  const mimeType = file.mimeType || "";

  if (extension === ".docx" || mimeType.includes("wordprocessingml.document")) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.trim();
  }

  if ([".txt", ".md", ".markdown", ".csv", ".json", ".log"].includes(extension) || mimeType.startsWith("text/")) {
    return buffer.toString("utf8").trim();
  }

  throw new BadRequestException("Unsupported document format. Upload txt, md, csv, json, docx, or paste novel text.");
}
