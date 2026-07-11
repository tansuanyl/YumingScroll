import { z } from "zod";

export const textModelSchema = z.enum(["gpt-5.5", "kimi-k2.6"]);
export const videoAspectRatioSchema = z.enum(["9:16", "16:9", "9:21", "21:9"]);

export const generateStorySchema = z.object({
  projectId: z.string().optional(),
  generationRequestId: z.string().min(1).optional(),
  inspiration: z.string().min(1),
  worldTitle: z.string().optional(),
  worldBackground: z.string().optional(),
  outline: z.string().optional(),
  visualStyleId: z.string().min(1).max(64).optional(),
  textModel: textModelSchema.optional()
});

export const importSourceSchema = z.object({
  projectId: z.string().min(1),
  generationRequestId: z.string().min(1).optional(),
  sourceText: z.string().optional(),
  sourceFile: z
    .object({
      fileName: z.string().min(1),
      mimeType: z.string().optional(),
      base64: z.string().min(1)
    })
    .optional(),
  visualStyleId: z.string().min(1).max(64).optional(),
  textModel: textModelSchema.optional()
}).superRefine((value, ctx) => {
  if (!value.sourceText?.trim() && !value.sourceFile) {
    ctx.addIssue({
      code: "custom",
      message: "Paste source text or upload a document file"
    });
  }
});

export const regenerateSectionSchema = z.object({
  section: z.string().min(1),
  inspiration: z.string().min(1),
  textModel: textModelSchema.optional()
});

export const reviseSeedanceScriptSchema = z.object({
  projectId: z.string().min(1),
  currentScript: z.string().min(1),
  revisionPrompt: z.string().min(1),
  storyContext: z.string().optional(),
  textModel: textModelSchema.optional()
});

export const visualPromptsSchema = z.object({
  inspiration: z.string().min(1),
  textModel: textModelSchema.optional()
});

export const workflowEdgeSchema = z.object({
  id: z.string().min(1).optional(),
  sourceType: z.enum(["characterModel", "sceneModel", "imagePrompt", "script", "videoFlow"]),
  sourceId: z.string().min(1),
  sourcePort: z.string().min(1).default("output"),
  targetType: z.literal("videoFlow").default("videoFlow"),
  targetId: z.string().min(1),
  targetPort: z.enum(["character", "scene", "imagePrompt", "script"]),
  kind: z.enum(["character-reference", "scene-reference", "image-prompt", "script"]),
  metadata: z.record(z.string(), z.unknown()).optional()
}).superRefine((value, ctx) => {
  const valid =
    (value.sourceType === "characterModel" && value.targetPort === "character" && value.kind === "character-reference") ||
    (value.sourceType === "sceneModel" && value.targetPort === "scene" && value.kind === "scene-reference") ||
    (value.sourceType === "imagePrompt" && value.targetPort === "imagePrompt" && value.kind === "image-prompt") ||
    (value.sourceType === "script" && value.targetPort === "script" && value.kind === "script");

  if (!valid) {
    ctx.addIssue({
      code: "custom",
      message: "Workflow edge source, target port, and kind are incompatible"
    });
  }
});

export const characterImageSchema = z.object({
  projectId: z.string().min(1),
  characterModelId: z.string().min(1),
  imageAspectRatio: z.string().optional(),
  generationRequestId: z.string().min(1).optional()
});

export const sceneImageSchema = z.object({
  projectId: z.string().min(1),
  sceneModelId: z.string().min(1),
  imageAspectRatio: z.string().optional(),
  generationRequestId: z.string().min(1).optional()
});

export const imagePromptImageSchema = z.object({
  projectId: z.string().min(1),
  flowId: z.string().min(1),
  prompt: z.string().min(1),
  imageAspectRatio: z.string().optional(),
  generationRequestId: z.string().min(1).optional()
});

export const videoSchema = z.object({
  projectId: z.string().min(1),
  flowId: z.string().min(1),
  generationRequestId: z.string().min(1).optional(),
  characterModelId: z.string().min(1).optional(),
  sceneModelId: z.string().min(1).optional(),
  characterModelIds: z.array(z.string().min(1)).optional(),
  activeCharacterModelIds: z.array(z.string().min(1)).optional(),
  sceneModelIds: z.array(z.string().min(1)).optional(),
  styleReferenceImageUrl: z.string().optional(),
  prompt: z.string().min(1),
  aspectRatio: videoAspectRatioSchema,
  durationSeconds: z.literal(15)
}).superRefine((value, ctx) => {
  if (!value.characterModelId && (!value.characterModelIds || value.characterModelIds.length === 0)) {
    ctx.addIssue({ code: "custom", path: ["characterModelIds"], message: "At least one character model is required" });
  }
  if (!value.sceneModelId && (!value.sceneModelIds || value.sceneModelIds.length === 0)) {
    ctx.addIssue({ code: "custom", path: ["sceneModelIds"], message: "At least one scene model is required" });
  }
});
