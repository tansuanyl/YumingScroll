import { Router } from "express";
import mammoth from "mammoth";
import { extname } from "node:path";
import {
  generateStorySchema,
  importSourceSchema,
  regenerateSectionSchema,
  reviseSeedanceScriptSchema,
  visualPromptsSchema
} from "../schemas";
import type { ProjectStore } from "../services/ProjectStore";
import type { TextPipelineService } from "../services/TextPipelineService";
import { deriveCharacterModels, deriveSceneModels, deriveVideoFlows } from "../services/ProjectDerivation";
import { invalidateVideoOutputsForChangedSeedanceScript } from "../services/ProjectVideoInvalidation";
import type { StoryState } from "../../src/types/domain";
import { getImportedSourceLabel, sanitizeImportedSourceText } from "../providers/OpenAITextProvider";
import { getTextGenerationRequestId, isGenerationRequestCurrent } from "../../src/lib/generationCancellation";

export function createTextRouter(store: ProjectStore, text: TextPipelineService): Router {
  const router = Router();

  router.get("/provider-status", (_req, res) => {
    res.json(text.status());
  });

  router.post("/generate-story", async (req, res, next) => {
    try {
      const input = generateStorySchema.parse(req.body);
      const storyState = await text.generateStory({
        inspiration: input.inspiration,
        worldTitle: input.worldTitle,
        worldBackground: input.worldBackground,
        outline: input.outline,
        visualStyleId: input.visualStyleId,
        textModel: input.textModel
      });
      if (input.projectId) {
        const project = await store.get(input.projectId);
        if (!project) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        if (!isGenerationRequestCurrent(getTextGenerationRequestId(project), input.generationRequestId)) {
          res.json(project);
          return;
        }
        project.title = deriveProjectTitle(storyState, input.worldTitle || input.inspiration || project.title);
        project.inspiration = input.inspiration;
        project.storyState = storyState;
        project.characterModels = deriveCharacterModels(storyState);
        project.sceneModels = deriveSceneModels(storyState);
        project.videoFlows = deriveVideoFlows(storyState);
        project.status = "text-ready";
        project.textGenerationRequestId = undefined;
        project.storyState.textGenerationRequestId = undefined;
        res.json(await store.save(project));
        return;
      }
      res.json(storyState);
    } catch (error) {
      next(error);
    }
  });

  router.post("/import-source", async (req, res, next) => {
    try {
      const input = importSourceSchema.parse(req.body);
      const project = await store.get(input.projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const extractedFileText = input.sourceFile ? await extractUploadedSourceText(input.sourceFile) : "";
      const sourceText = [input.sourceText?.trim(), extractedFileText].filter(Boolean).join("\n\n").trim();
      const cleanedSourceText = sanitizeImportedSourceText(sourceText);
      if (cleanedSourceText.length < 20) {
        res.status(400).json({ error: "导入内容太短，请粘贴更完整的小说文本或上传 txt/md/docx 文件。" });
        return;
      }

      const sourceFileName = input.sourceFile?.fileName;
      const inspiration = `文档/小说导入：${sourceFileName || getImportedSourceLabel(cleanedSourceText)}`;
      const storyState = await text.generateStory({
        inspiration,
        sourceType: "novel",
        sourceText: cleanedSourceText,
        sourceFileName,
        visualStyleId: input.visualStyleId,
        textModel: input.textModel
      });

      const latestProject = await store.get(input.projectId);
      if (!latestProject) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      if (!isGenerationRequestCurrent(getTextGenerationRequestId(latestProject), input.generationRequestId)) {
        res.json(latestProject);
        return;
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
      res.json(await store.save(latestProject));
    } catch (error) {
      next(error);
    }
  });

  router.post("/regenerate-section", async (req, res, next) => {
    try {
      const input = regenerateSectionSchema.parse(req.body);
      res.json(await text.regenerateSection(input.section, input.inspiration, input.textModel));
    } catch (error) {
      next(error);
    }
  });

  router.post("/revise-seedance-script", async (req, res, next) => {
    try {
      const input = reviseSeedanceScriptSchema.parse(req.body);
      const project = await store.get(input.projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const revisedScript = await text.reviseSeedanceScript({
        currentScript: input.currentScript,
        revisionPrompt: input.revisionPrompt,
        storyContext: input.storyContext,
        textModel: input.textModel
      });

      const nextProject = invalidateVideoOutputsForChangedSeedanceScript(
        {
          ...project,
          storyState: {
            ...project.storyState,
            seedanceScript: revisedScript
          },
          status: "text-ready"
        },
        project
      );
      res.json(await store.save(nextProject));
    } catch (error) {
      next(error);
    }
  });

  router.post("/generate-visual-prompts", async (req, res, next) => {
    try {
      const input = visualPromptsSchema.parse(req.body);
      const story = await text.generateStory({ inspiration: input.inspiration, textModel: input.textModel });
      res.json(story.visualPrompts);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function deriveProjectTitle(storyState: StoryState, fallback: string): string {
  const title = storyState.world.title?.trim();
  if (title) return title;
  return fallback.trim().slice(0, 24) || "未命名项目";
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

  throw new Error("暂不支持该文档格式。请上传 txt、md、csv、json、docx，或直接粘贴小说文本。");
}
