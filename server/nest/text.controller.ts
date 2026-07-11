import { BadRequestException, Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Post } from "@nestjs/common";
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
import type { AuthUserRecord, CoinChargeResult } from "../services/AuthService";
import { AuthService, GENERATION_COIN_COSTS } from "../services/AuthService";
import { canAccessProject } from "../services/AccessControl";
import { invalidateVideoOutputsForChangedSeedanceScript } from "../services/ProjectVideoInvalidation";
import type { ProjectStore } from "../services/ProjectStore";
import { TextPipelineService } from "../services/TextPipelineService";
import {
  estimateImportedSourceSegmentCount,
  getImportedSourceLabel,
  sanitizeImportedSourceText
} from "../providers/OpenAITextProvider";
import { getTextGenerationRequestId, isGenerationRequestCurrent } from "../../src/lib/generationCancellation";
import { CurrentUser } from "./auth.decorators";
import { PROJECT_STORE } from "./tokens";

@Controller("api/text")
export class TextController {
  constructor(
    @Inject(PROJECT_STORE) private readonly store: ProjectStore,
    @Inject(TextPipelineService)
    private readonly text: TextPipelineService,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  @Get("provider-status")
  providerStatus() {
    return this.text.status();
  }

  @Post("generate-story")
  async generateStory(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    const input = generateStorySchema.parse(body);
    const project = input.projectId ? await this.requireProject(input.projectId, user) : undefined;
    const charge = await this.auth.chargeForAction({
      userId: user.id,
      projectId: input.projectId,
      action: "text.generateStory",
      cost: GENERATION_COIN_COSTS.text,
      metadata: { model: input.textModel }
    });
    await this.auth.recordUsage({
      userId: user.id,
      projectId: input.projectId,
      action: "text.generateStory",
      model: input.textModel,
      status: "started"
    });

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
        await this.auth.recordUsage({
          userId: user.id,
          action: "text.generateStory",
          model: input.textModel,
          status: "ready"
        });
        return storyState;
      }

      const latestProject = await this.requireProject(project.id, user);
      if (!isGenerationRequestCurrent(getTextGenerationRequestId(latestProject), input.generationRequestId)) {
        await this.auth.refundCharge(charge, "text generation cancelled");
        await this.auth.recordUsage({
          userId: user.id,
          projectId: latestProject.id,
          action: "text.generateStory",
          model: input.textModel,
          status: "ready",
          metadata: { cancelled: true }
        });
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
      const saved = await this.store.save(latestProject);
      await this.auth.recordUsage({
        userId: user.id,
        projectId: latestProject.id,
        action: "text.generateStory",
        model: input.textModel,
        status: "ready"
      });
      return saved;
    } catch (error) {
      await this.refundChargeForError(charge, error);
      await this.auth.recordUsage({
        userId: user.id,
        projectId: input.projectId,
        action: "text.generateStory",
        model: input.textModel,
        status: "failed",
        metadata: { error: error instanceof Error ? error.message : "unknown" }
      });
      throw error;
    }
  }

  @Post("import-source")
  async importSource(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    const startedAt = Date.now();
    const input = importSourceSchema.parse(body);
    const project = await this.requireProject(input.projectId, user);

    const extractedFileText = input.sourceFile ? await extractUploadedSourceText(input.sourceFile) : "";
    const sourceText = [input.sourceText?.trim(), extractedFileText].filter(Boolean).join("\n\n").trim();
    const cleanedSourceText = sanitizeImportedSourceText(sourceText);
    if (cleanedSourceText.length < 20) {
      throw new BadRequestException("Imported content is too short. Paste a fuller novel text or upload txt/md/docx.");
    }

    const charge = await this.auth.chargeForAction({
      userId: user.id,
      projectId: input.projectId,
      action: "text.importSource",
      cost: GENERATION_COIN_COSTS.text,
      metadata: { model: input.textModel }
    });

    const sourceFileName = input.sourceFile?.fileName;
    const expectedSegmentCount = estimateImportedSourceSegmentCount(cleanedSourceText, 1);
    const sourceLabel = sourceFileName || getImportedSourceLabel(cleanedSourceText);
    const inspiration = `Imported source: ${sourceLabel}`;
    await this.auth.recordUsage({
      userId: user.id,
      projectId: project.id,
      action: "text.importSource",
      model: input.textModel,
      status: "started",
      metadata: {
        rawChars: sourceText.length,
        cleanedChars: cleanedSourceText.length,
        expected15sSegments: expectedSegmentCount
      }
    });

    try {
      const storyState = await this.text.generateStory({
        inspiration,
        sourceType: "novel",
        sourceText: cleanedSourceText,
        sourceFileName,
        visualStyleId: input.visualStyleId,
        textModel: input.textModel
      });

      const latestProject = await this.requireProject(project.id, user);
      if (!isGenerationRequestCurrent(getTextGenerationRequestId(latestProject), input.generationRequestId)) {
        await this.auth.refundCharge(charge, "source import cancelled");
        await this.auth.recordUsage({
          userId: user.id,
          projectId: latestProject.id,
          action: "text.importSource",
          model: input.textModel,
          status: "ready",
          metadata: {
            cancelled: true,
            rawChars: sourceText.length,
            cleanedChars: cleanedSourceText.length,
            expected15sSegments: expectedSegmentCount,
            durationMs: Date.now() - startedAt
          }
        });
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
      const saved = await this.store.save(latestProject);
      await this.auth.recordUsage({
        userId: user.id,
        projectId: latestProject.id,
        action: "text.importSource",
        model: input.textModel,
        status: "ready",
        metadata: {
          rawChars: sourceText.length,
          cleanedChars: cleanedSourceText.length,
          expected15sSegments: expectedSegmentCount,
          generated15sSegments: storyState.storyboard.length,
          durationMs: Date.now() - startedAt
        }
      });
      return saved;
    } catch (error) {
      await this.refundChargeForError(charge, error);
      await this.auth.recordUsage({
        userId: user.id,
        projectId: project.id,
        action: "text.importSource",
        model: input.textModel,
        status: "failed",
        metadata: { error: error instanceof Error ? error.message : "unknown", durationMs: Date.now() - startedAt }
      });
      throw error;
    }
  }

  @Post("regenerate-section")
  regenerateSection(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    const input = regenerateSectionSchema.parse(body);
    void this.auth.recordUsage({
      userId: user.id,
      action: "text.regenerateSection",
      model: input.textModel,
      status: "started",
      metadata: { section: input.section }
    });
    return this.text.regenerateSection(input.section, input.inspiration, input.textModel);
  }

  @Post("revise-seedance-script")
  async reviseSeedanceScript(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    const input = reviseSeedanceScriptSchema.parse(body);
    const project = await this.requireProject(input.projectId, user);

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
  async generateVisualPrompts(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    const input = visualPromptsSchema.parse(body);
    void this.auth.recordUsage({
      userId: user.id,
      action: "text.generateVisualPrompts",
      model: input.textModel,
      status: "started"
    });
    const story = await this.text.generateStory({ inspiration: input.inspiration, textModel: input.textModel });
    return story.visualPrompts;
  }

  private async requireProject(id: string, user: AuthUserRecord): Promise<Project> {
    const project = await this.store.get(id);
    if (!project) throw new NotFoundException("Project not found");
    if (!canAccessProject(user, project)) throw new ForbiddenException("Project is not available for this account");
    return project;
  }

  private async refundChargeForError(charge: CoinChargeResult, error: unknown): Promise<void> {
    await this.auth.refundCharge(charge, error instanceof Error ? error.message : "generation failed");
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
