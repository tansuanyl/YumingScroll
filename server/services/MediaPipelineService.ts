import type { Project, MediaAsset, VideoAspectRatio } from "../../src/types/domain";
import { getDefaultVisualStylePreset, getVisualStylePreset } from "../../src/data/visualStylePresets";
import { isGenerationRequestCurrent } from "../../src/lib/generationCancellation";
import { withImagePromptLibrary } from "../../src/lib/promptLibraryGuidance";
import { sanitizeImagePromptSourceText } from "../../src/lib/imagePromptSourceText";
import type {
  MediaPromptOptimizationKind,
  OpenAITextProvider,
  TextModelSelection
} from "../providers/OpenAITextProvider";
import type { MediaJob } from "../providers/SeedanceMediaProvider";
import type { SeedanceMediaProvider } from "../providers/SeedanceMediaProvider";
import { AssetStorageService } from "./AssetStorageService";
import type { GenerationJobRecord, ProjectStore } from "./ProjectStore";
import { applyCharacterReferenceSafetyOverlay } from "./VideoReferenceImageSafety";
import { FfmpegVideoFrameExtractor, type VideoFrameExtractor } from "./VideoFrameExtractionService";

type CharacterImageRequest = {
  projectId: string;
  characterModelId: string;
  imageAspectRatio?: string;
  generationRequestId?: string;
};

type SceneImageRequest = {
  projectId: string;
  sceneModelId: string;
  imageAspectRatio?: string;
  generationRequestId?: string;
};

type ImagePromptImageRequest = {
  projectId: string;
  flowId: string;
  prompt: string;
  imageAspectRatio?: string;
  generationRequestId?: string;
};

type VideoRequest = {
  projectId: string;
  flowId: string;
  characterModelId?: string;
  sceneModelId?: string;
  characterModelIds?: string[];
  activeCharacterModelIds?: string[];
  sceneModelIds?: string[];
  styleReferenceImageUrl?: string;
  prompt: string;
  aspectRatio: VideoAspectRatio;
  durationSeconds: 15;
  generationRequestId?: string;
};

type RefreshPendingVideoJobsOptions = {
  minRefreshIntervalMs?: number;
};

type ContinuityFrameReference = {
  sourceFlowId: string;
  sourceVideoAssetId: string;
  asset: MediaAsset;
};

type MediaPromptOptimizer = Pick<OpenAITextProvider, "optimizeMediaPrompt">;

type PromptOptimizationResult = {
  prompt: string;
  sourcePrompt: string;
  optimized: boolean;
  model?: TextModelSelection;
  visualStyleLabel?: string;
  error?: string;
};

export class MediaPipelineService {
  private readonly pendingJobRefreshInFlight = new Set<string>();
  private readonly pendingJobLastRefreshAt = new Map<string, number>();

  constructor(
    private readonly store: ProjectStore,
    private readonly provider: SeedanceMediaProvider,
    private readonly assetStorage: AssetStorageService = new AssetStorageService(),
    private readonly videoFrameExtractor: VideoFrameExtractor = new FfmpegVideoFrameExtractor(),
    private readonly promptOptimizer?: MediaPromptOptimizer
  ) {}

  async generateCharacterImage(input: CharacterImageRequest): Promise<Project> {
    const project = await this.requireProject(input.projectId);
    const model = findProjectItem(project.characterModels, input.characterModelId);
    if (!model) throw new Error("Character model not found");

    model.status = "generating";
    model.generationRequestId = input.generationRequestId;
    model.imageAspectRatio = input.imageAspectRatio || model.imageAspectRatio || "3:4";
    const optimizedPrompt = await this.optimizePromptForMedia(project, "characterImage", model.consistencyPrompt);
    const job = await this.provider.generateCharacterImage({
      kind: "character",
      prompt: optimizedPrompt.prompt,
      imageAspectRatio: model.imageAspectRatio
    });
    const resultProject = input.generationRequestId ? await this.requireProject(input.projectId) : project;
    const resultModel = input.generationRequestId
      ? findProjectItem(resultProject.characterModels, input.characterModelId)
      : model;
    if (!resultModel) return resultProject;
    if (!isGenerationRequestCurrent(resultModel.generationRequestId, input.generationRequestId)) return resultProject;
    await this.recordGenerationJob({
      job,
      projectId: resultProject.id,
      targetType: "character",
      targetId: resultModel.id,
      model: this.provider.status().imageModel,
      requestPayload: {
        kind: "character",
        ...buildPromptOptimizationRequestPayload(optimizedPrompt),
        imageAspectRatio: resultModel.imageAspectRatio,
        generationRequestId: input.generationRequestId
      }
    });
    const assets = await this.persistJobAssets(resultProject.id, job.assets || (job.asset ? [job.asset] : []));
    if (assets.length > 0) {
      resultModel.candidateImages = assets.slice(0, 3);
      resultModel.confirmedImageId = undefined;
      resultProject.assets = upsertAssets(resultProject.assets, assets);
    }
    resultModel.status = job.status === "failed" ? "failed" : job.status === "ready" ? "ready" : "generating";
    resultModel.error = job.error;
    if (resultModel.status !== "generating") resultModel.generationRequestId = undefined;
    return this.store.save(resultProject);
  }

  async generateSceneImage(input: SceneImageRequest): Promise<Project> {
    const project = await this.requireProject(input.projectId);
    const model = findProjectItem(project.sceneModels, input.sceneModelId);
    if (!model) throw new Error("Scene model not found");

    model.status = "generating";
    model.generationRequestId = input.generationRequestId;
    model.imageAspectRatio = input.imageAspectRatio || model.imageAspectRatio || "16:9";
    const scenePromptSource = sanitizeSceneReferencePrompt(
      model.generationPrompt?.trim() || `${model.description}. ${model.visualKeywords.join(", ")}`,
      project.characterModels.map((character) => character.name)
    );
    const prompt = buildNoCharacterScenePrompt(
      scenePromptSource,
      project.characterModels.map((character) => character.name),
      model.imageAspectRatio
    );
    const optimizedPrompt = await this.optimizePromptForMedia(project, "sceneImage", prompt);
    const job = await this.provider.generateSceneImage({
      kind: "scene",
      prompt: optimizedPrompt.prompt,
      imageAspectRatio: model.imageAspectRatio
    });
    const resultProject = input.generationRequestId ? await this.requireProject(input.projectId) : project;
    const resultModel = input.generationRequestId
      ? findProjectItem(resultProject.sceneModels, input.sceneModelId)
      : model;
    if (!resultModel) return resultProject;
    if (!isGenerationRequestCurrent(resultModel.generationRequestId, input.generationRequestId)) return resultProject;
    await this.recordGenerationJob({
      job,
      projectId: resultProject.id,
      targetType: "scene",
      targetId: resultModel.id,
      model: this.provider.status().imageModel,
      requestPayload: {
        kind: "scene",
        ...buildPromptOptimizationRequestPayload(optimizedPrompt),
        imageAspectRatio: resultModel.imageAspectRatio,
        generationRequestId: input.generationRequestId
      }
    });
    const assets = await this.persistJobAssets(resultProject.id, job.assets || (job.asset ? [job.asset] : []));
    if (assets.length > 0) {
      resultModel.candidateImages = assets.slice(0, 3);
      resultModel.confirmedImageId = undefined;
      resultProject.assets = upsertAssets(resultProject.assets, assets);
    }
    resultModel.status = job.status === "failed" ? "failed" : job.status === "ready" ? "ready" : "generating";
    resultModel.error = job.error;
    if (resultModel.status !== "generating") resultModel.generationRequestId = undefined;
    return this.store.save(resultProject);
  }

  async generateImagePromptImage(input: ImagePromptImageRequest): Promise<Project> {
    const project = await this.requireProject(input.projectId);
    const flow = findProjectItem(project.videoFlows, input.flowId);
    if (!flow) throw new Error("Video flow not found");

    const imageAspectRatio = input.imageAspectRatio || flow.nodes.promptNode.imageAspectRatio || flow.aspectRatio || "9:16";
    const selectedCharacters = getSelectedCharacterIds(flow)
      .map((id) => findProjectItem(project.characterModels, id))
      .filter((character): character is Project["characterModels"][number] => Boolean(character));
    const missingCharacterReferences = selectedCharacters
      .filter((character) => !getCharacterReferenceImageAsset(project, character))
      .map((character) => character.name);
    if (missingCharacterReferences.length > 0) {
      throw new Error(buildMissingImagePromptCharacterReferenceError(missingCharacterReferences));
    }
    const characterReferenceAssets = selectedCharacters
      .map((character) => getCharacterReferenceImageAsset(project, character))
      .filter((asset): asset is MediaAsset => Boolean(asset));
    const characterReferenceImageUrls = await this.prepareVideoReferenceImageUrls(characterReferenceAssets);
    const characterReferenceNotes = selectedCharacters.map((character) => buildCharacterVideoReferenceNote(character));
    flow.nodes.promptNode = {
      ...flow.nodes.promptNode,
      status: "generating",
      stale: false,
      error: undefined,
      candidateImages: [],
      confirmedImageId: undefined,
      imageAspectRatio,
      generationRequestId: input.generationRequestId
    };
    flow.imagePromptImageUrl = undefined;
    flow.imagePromptImageName = undefined;
    const prompt = withImagePromptLibrary(buildImagePromptReferencePrompt(input.prompt, imageAspectRatio, selectedCharacters));
    const optimizedPrompt = await this.optimizePromptForMedia(project, "imagePromptImage", prompt);
    const job = await this.provider.generateSceneImage({
      kind: "scene",
      prompt: optimizedPrompt.prompt,
      imageAspectRatio,
      referenceImageUrls: characterReferenceImageUrls,
      referenceImageNotes: characterReferenceNotes
    });
    const resultProject = input.generationRequestId ? await this.requireProject(input.projectId) : project;
    const resultFlow = input.generationRequestId
      ? findProjectItem(resultProject.videoFlows, input.flowId)
      : flow;
    if (!resultFlow) return resultProject;
    if (!isGenerationRequestCurrent(resultFlow.nodes.promptNode.generationRequestId, input.generationRequestId)) {
      return resultProject;
    }
    await this.recordGenerationJob({
      job,
      projectId: resultProject.id,
      targetType: "imagePrompt",
      targetId: resultFlow.id,
      model: this.provider.status().imageModel,
      requestPayload: {
        kind: "imagePrompt",
        ...buildPromptOptimizationRequestPayload(optimizedPrompt),
        imageAspectRatio,
        selectedCharacterModelIds: selectedCharacters.map((character) => character.id),
        characterReferenceImageUrls: characterReferenceAssets.map((asset) => asset.url),
        referenceImageNotes: characterReferenceNotes,
        generationRequestId: input.generationRequestId
      }
    });

    const assets = await this.persistJobAssets(resultProject.id, job.assets || (job.asset ? [job.asset] : []));
    if (assets.length > 0) {
      resultFlow.nodes.promptNode.candidateImages = assets.slice(0, 3);
      resultProject.assets = upsertAssets(resultProject.assets, assets);
    }
    resultFlow.nodes.promptNode.status = job.status === "failed" ? "failed" : job.status === "ready" ? "ready" : "generating";
    resultFlow.nodes.promptNode.error = job.error;
    if (resultFlow.nodes.promptNode.status !== "generating") {
      resultFlow.nodes.promptNode.generationRequestId = undefined;
    }
    resultFlow.nodes.videoNode.stale = true;
    resultFlow.nodes.previewNode.stale = true;
    resultFlow.videoAssetId = undefined;
    resultFlow.pendingVideoJobId = undefined;
    resultFlow.firstFrameImageAssetId = undefined;
    resultFlow.lastFrameImageAssetId = undefined;
    if (resultFlow.status === "ready") resultFlow.status = "idle";

    return this.store.save(resultProject);
  }

  async generateVideo(input: VideoRequest): Promise<Project> {
    const project = await this.requireProject(input.projectId);
    const flow = findProjectItem(project.videoFlows, input.flowId);
    if (!flow) throw new Error("Video flow not found");
    const requestedCharacterModelIds = normalizeIds(input.characterModelIds, input.characterModelId);
    const requestedSceneModelIds = normalizeIds(input.sceneModelIds, input.sceneModelId);
    const characters = requestedCharacterModelIds.map((id) => findProjectItem(project.characterModels, id));
    const scenes = requestedSceneModelIds.map((id) => findProjectItem(project.sceneModels, id));
    if (characters.some((item) => !item)) throw new Error("Character model not found");
    if (scenes.some((item) => !item)) throw new Error("Scene model not found");
    const characterModelIds = characters.map((character) => character?.id).filter((id): id is string => Boolean(id));
    const sceneModelIds = scenes.map((scene) => scene?.id).filter((id): id is string => Boolean(id));
    const activeCharacterIds = normalizeIds(input.activeCharacterModelIds, undefined);
    const activeCharacters = activeCharacterIds.length > 0
      ? activeCharacterIds.map((id) => findProjectItem(project.characterModels, id)).filter((item): item is Project["characterModels"][number] => Boolean(item))
      : characters.filter((item): item is Project["characterModels"][number] => Boolean(item));
    const activeCharacterIdSet = new Set(activeCharacters.map((character) => character.id));
    const videoCharacters = characters.filter((character): character is Project["characterModels"][number] =>
      Boolean(character && (activeCharacterIdSet.size === 0 || activeCharacterIdSet.has(character.id)))
    );

    flow.status = "generating";
    flow.selectedCharacterModelId = characterModelIds[0];
    flow.selectedSceneModelId = sceneModelIds[0];
    flow.selectedCharacterModelIds = characterModelIds;
    flow.selectedSceneModelIds = sceneModelIds;
    flow.aspectRatio = input.aspectRatio;
    flow.generationRequestId = input.generationRequestId;
    flow.lastFrameImageAssetId = undefined;
    flow.nodes.characterNode.status = characters.every((item) => item?.confirmedImageId) ? "ready" : "idle";
    flow.nodes.sceneNode.status = scenes.every((item) => item?.confirmedImageId) ? "ready" : "idle";
    flow.nodes.promptNode.status = getImagePromptReferenceUrl(project, flow) ? "ready" : flow.nodes.promptNode.status || "idle";
    flow.nodes.videoNode.status = "generating";
    flow.nodes.videoNode.generationRequestId = input.generationRequestId;
    flow.nodes.previewNode.status = "idle";

    const characterReferenceAssets = videoCharacters
      .map((character) => getCharacterReferenceImageAsset(project, character))
      .filter((asset): asset is MediaAsset => Boolean(asset));
    const sceneReferenceAssets = scenes
      .map((scene) => scene ? getSceneReferenceImageAsset(project, scene) : undefined)
      .filter((asset): asset is MediaAsset => Boolean(asset));
    const flowStyleReferenceAsset = getImagePromptReferenceAsset(project, flow);
    const styleReferenceAsset = input.styleReferenceImageUrl
      ? findReferenceAssetByUrl(project, input.styleReferenceImageUrl, flow.nodes.promptNode.candidateImages)
      : flowStyleReferenceAsset;
    const styleReferenceImageUrl =
      input.styleReferenceImageUrl || flowStyleReferenceAsset?.url || getImagePromptReferenceUrl(project, flow);
    const continuityFrameReference = await this.resolvePreviousVideoTailFrameReference(project, flow);
    applyContinuityFrameReference(project, flow, continuityFrameReference);
    const characterImageUrls = characterReferenceAssets.map((asset) => asset.url);
    const sceneImageUrls = sceneReferenceAssets.map((asset) => asset.url);
    const referenceImageNotes = [
      ...(continuityFrameReference ? [buildFirstFrameContinuityReferenceNote(project, continuityFrameReference)] : []),
      ...videoCharacters.map((character) => buildCharacterVideoReferenceNote(character)),
      ...scenes.map((scene) => buildSceneVideoReferenceNote(scene!)),
      ...(styleReferenceImageUrl ? [buildStyleVideoReferenceNote(project, flow)] : [])
    ];
    const missingCharacters = characters
      .filter((character): character is Project["characterModels"][number] => Boolean(character && !getCharacterReferenceImageAsset(project, character)))
      .map((character) => character.name);
    const missingScenes = scenes
      .filter((scene): scene is Project["sceneModels"][number] => Boolean(scene && !getSceneReferenceImageAsset(project, scene)))
      .map((scene) => scene.name);
    if (missingCharacters.length > 0 || missingScenes.length > 0) {
      const error = buildMissingConfirmedReferenceError(missingCharacters, missingScenes);
      flow.status = "failed";
      flow.nodes.videoNode.status = "failed";
      flow.nodes.videoNode.error = error;
      flow.nodes.previewNode.status = "idle";
      flow.error = error;
      return this.store.save(project);
    }
    const providerCharacterImageUrls = await this.prepareVideoCharacterReferenceImageUrls(characterReferenceAssets);
    const providerSceneImageUrls = await this.prepareVideoReferenceImageUrls(sceneReferenceAssets);
    const providerStyleReferenceImageUrl = await this.prepareVideoReferenceImageUrl(
      styleReferenceAsset,
      styleReferenceImageUrl
    );
    const providerFirstFrameImageUrl = await this.prepareVideoReferenceImageUrl(continuityFrameReference?.asset);
    const optimizedPrompt = await this.optimizePromptForMedia(project, "video", input.prompt);
    let job: MediaJob;
    try {
      job = await this.provider.generateVideo({
        prompt: optimizedPrompt.prompt,
        firstFrameImageUrl: providerFirstFrameImageUrl,
        characterImageUrls: providerCharacterImageUrls,
        sceneImageUrls: providerSceneImageUrls,
        styleReferenceImageUrl: providerStyleReferenceImageUrl,
        referenceImageNotes,
        durationSeconds: input.durationSeconds,
        aspectRatio: input.aspectRatio
      });
    } catch (error) {
      const failedProject = input.generationRequestId ? await this.requireProject(input.projectId) : project;
      const failedFlow = input.generationRequestId
        ? findProjectItem(failedProject.videoFlows, input.flowId)
        : flow;
      if (!failedFlow) throw error;
      if (
        input.generationRequestId
        && failedFlow.generationRequestId
        && !isGenerationRequestCurrent(failedFlow.generationRequestId, input.generationRequestId)
      ) {
        return failedProject;
      }
      const message = error instanceof Error ? error.message : "视频生成失败";
      applyContinuityFrameReference(failedProject, failedFlow, continuityFrameReference);
      failedFlow.status = "failed";
      failedFlow.selectedCharacterModelId = characterModelIds[0];
      failedFlow.selectedSceneModelId = sceneModelIds[0];
      failedFlow.selectedCharacterModelIds = characterModelIds;
      failedFlow.selectedSceneModelIds = sceneModelIds;
      failedFlow.aspectRatio = input.aspectRatio;
      failedFlow.pendingVideoJobId = undefined;
      failedFlow.generationRequestId = undefined;
      failedFlow.nodes.videoNode.status = "failed";
      failedFlow.nodes.videoNode.error = message;
      failedFlow.nodes.videoNode.generationRequestId = undefined;
      failedFlow.nodes.previewNode.status = "idle";
      failedFlow.error = message;
      await this.store.save(failedProject);
      throw error instanceof Error ? error : new Error(message);
    }
    const resultProject = input.generationRequestId ? await this.requireProject(input.projectId) : project;
    const resultFlow = input.generationRequestId
      ? findProjectItem(resultProject.videoFlows, input.flowId)
      : flow;
    if (!resultFlow) return resultProject;
    if (!isGenerationRequestCurrent(resultFlow.generationRequestId, input.generationRequestId)) return resultProject;
    applyContinuityFrameReference(resultProject, resultFlow, continuityFrameReference);
    resultFlow.status = "generating";
    resultFlow.selectedCharacterModelId = characterModelIds[0];
    resultFlow.selectedSceneModelId = sceneModelIds[0];
    resultFlow.selectedCharacterModelIds = characterModelIds;
    resultFlow.selectedSceneModelIds = sceneModelIds;
    resultFlow.aspectRatio = input.aspectRatio;
    resultFlow.generationRequestId = input.generationRequestId;
    resultFlow.lastFrameImageAssetId = undefined;
    resultFlow.nodes.characterNode.status = characters.every((item) => item?.confirmedImageId) ? "ready" : "idle";
    resultFlow.nodes.sceneNode.status = scenes.every((item) => item?.confirmedImageId) ? "ready" : "idle";
    resultFlow.nodes.promptNode.status = getImagePromptReferenceUrl(resultProject, resultFlow)
      ? "ready"
      : resultFlow.nodes.promptNode.status || "idle";
    resultFlow.nodes.videoNode.status = "generating";
    resultFlow.nodes.videoNode.generationRequestId = input.generationRequestId;
    resultFlow.nodes.previewNode.status = "idle";
    await this.recordGenerationJob({
      job,
      projectId: resultProject.id,
      targetType: "video",
      targetId: resultFlow.id,
      model: this.provider.status().videoModel,
      requestPayload: {
        ...buildPromptOptimizationRequestPayload(optimizedPrompt),
        firstFrameImageAssetId: continuityFrameReference?.asset.id,
        previousVideoFlowId: continuityFrameReference?.sourceFlowId,
        previousVideoAssetId: continuityFrameReference?.sourceVideoAssetId,
        firstFrameImageUrl: continuityFrameReference?.asset.url,
        characterImageUrls,
        characterReferenceSafety: providerCharacterImageUrls.length > 0 ? "eye-mist-overlay" : undefined,
        sceneImageUrls,
        styleReferenceImageUrl,
        referenceImageNotes,
        activeCharacterModelIds: activeCharacters.map((character) => character.id),
        durationSeconds: input.durationSeconds,
        aspectRatio: input.aspectRatio,
        generationRequestId: input.generationRequestId
      }
    });

    if (job.asset) {
      const asset = await this.persistJobAsset(resultProject.id, job.asset);
      resultProject.assets = upsertAsset(resultProject.assets, asset);
      resultFlow.videoAssetId = asset.id;
      resultFlow.pendingVideoJobId = undefined;
    } else if (job.jobId) {
      resultFlow.pendingVideoJobId = job.jobId;
    }
    resultFlow.status = job.status === "failed" ? "failed" : job.status === "ready" ? "ready" : "generating";
    resultFlow.nodes.videoNode.status = resultFlow.status;
    resultFlow.nodes.previewNode.status = resultFlow.status === "ready" ? "ready" : "idle";
    resultFlow.nodes.videoNode.error = job.error;
    resultFlow.error = job.error;
    if (resultFlow.status !== "generating") {
      resultFlow.generationRequestId = undefined;
      resultFlow.nodes.videoNode.generationRequestId = undefined;
    }
    if (resultFlow.status === "ready") {
      resultProject.status = "video-ready";
    }

    return this.store.save(resultProject);
  }

  async getJob(jobId: string) {
    const persisted = await this.store.getGenerationJob(jobId);
    const live = await this.provider.getJob(jobId);
    if (!persisted) return live;
    if (live.asset) {
      live.asset = await this.persistJobAsset(persisted.projectId, live.asset);
    }
    if (live.assets?.length) {
      live.assets = await this.persistJobAssets(persisted.projectId, live.assets);
    }

    await this.store.saveGenerationJob({
      ...persisted,
      status: live.status,
      resultPayload: buildResultPayload(live),
      error: live.error
    });
    if (persisted.targetType === "video") {
      await this.syncVideoFlowFromJob(persisted.projectId, persisted.targetId, live);
    }
    return live;
  }

  async refreshPendingVideoJobs(projectId: string, options: RefreshPendingVideoJobsOptions = {}): Promise<Project> {
    const project = await this.requireProject(projectId);
    const pendingJobIds = Array.from(
      new Set(
        project.videoFlows
          .filter((flow) => flow.status === "generating" && flow.pendingVideoJobId)
          .map((flow) => flow.pendingVideoJobId!)
      )
    );
    const minRefreshIntervalMs =
      options.minRefreshIntervalMs ?? Number(process.env.PENDING_VIDEO_JOB_REFRESH_INTERVAL_MS ?? 15000);

    for (const jobId of pendingJobIds) {
      await this.refreshPendingVideoJobIfDue(jobId, minRefreshIntervalMs);
    }

    return (await this.store.get(projectId)) ?? project;
  }

  status() {
    return this.provider.status();
  }

  private async requireProject(projectId: string): Promise<Project> {
    const project = await this.store.get(projectId);
    if (!project) throw new Error("Project not found");
    return project;
  }

  private async optimizePromptForMedia(
    project: Project,
    kind: MediaPromptOptimizationKind,
    prompt: string
  ): Promise<PromptOptimizationResult> {
    const sourcePrompt = prompt.trim();
    if (!sourcePrompt || project.storyState.promptOptimizationEnabled === false || !this.promptOptimizer) {
      return { prompt: sourcePrompt, sourcePrompt, optimized: false };
    }

    const visualStyle = resolveProjectVisualStyle(project);
    const model = resolvePromptOptimizerModel(project.storyState.promptOptimizerModel);

    try {
      const optimized = await this.promptOptimizer.optimizeMediaPrompt({
        prompt: sourcePrompt,
        kind,
        visualStyleLabel: visualStyle.label,
        visualStylePrompt: visualStyle.prompt,
        storyContext: buildMediaPromptOptimizationContext(project),
        sourceReferenceText: buildMediaPromptSourceReference(project),
        textModel: model
      });
      const optimizedPrompt = preserveVideoDialogueLines(
        kind,
        sourcePrompt,
        optimized.trim() || sourcePrompt
      );
      return {
        prompt: optimizedPrompt,
        sourcePrompt,
        optimized: optimizedPrompt !== sourcePrompt,
        model,
        visualStyleLabel: visualStyle.label
      };
    } catch (error) {
      return {
        prompt: sourcePrompt,
        sourcePrompt,
        optimized: false,
        model,
        visualStyleLabel: visualStyle.label,
        error: error instanceof Error ? error.message : "Prompt optimization failed"
      };
    }
  }

  private async refreshPendingVideoJobIfDue(jobId: string, minRefreshIntervalMs: number): Promise<void> {
    if (this.pendingJobRefreshInFlight.has(jobId)) return;
    const now = Date.now();
    const lastRefreshAt = this.pendingJobLastRefreshAt.get(jobId) ?? 0;
    if (minRefreshIntervalMs > 0 && now - lastRefreshAt < minRefreshIntervalMs) return;

    this.pendingJobRefreshInFlight.add(jobId);
    this.pendingJobLastRefreshAt.set(jobId, now);
    try {
      await this.getJob(jobId);
    } catch (error) {
      const persisted = await this.store.getGenerationJob(jobId);
      if (persisted) {
        await this.store.saveGenerationJob({
          ...persisted,
          error: error instanceof Error ? error.message : "Video job status refresh failed"
        });
      }
    } finally {
      this.pendingJobRefreshInFlight.delete(jobId);
    }
  }

  private async recordGenerationJob(input: {
    job: MediaJob;
    projectId: string;
    targetType: GenerationJobRecord["targetType"];
    targetId: string;
    model: string;
    requestPayload: unknown;
  }): Promise<void> {
    await this.store.saveGenerationJob({
      id: input.job.jobId,
      projectId: input.projectId,
      targetType: input.targetType,
      targetId: input.targetId,
      provider: "seedance",
      model: input.model,
      status: input.job.status,
      requestPayload: input.requestPayload,
      resultPayload: buildResultPayload(input.job),
      error: input.job.error
    });
  }

  private persistJobAsset(projectId: string, asset: MediaAsset): Promise<MediaAsset> {
    return this.assetStorage.persistAsset(projectId, asset).catch(() => asset);
  }

  private persistJobAssets(projectId: string, assets: MediaAsset[]): Promise<MediaAsset[]> {
    return this.assetStorage.persistAssets(projectId, assets);
  }

  private async prepareVideoReferenceImageUrls(assets: MediaAsset[]): Promise<string[]> {
    const urls = await Promise.all(assets.map((asset) => this.prepareVideoReferenceImageUrl(asset)));
    return urls.filter((url): url is string => Boolean(url));
  }

  private async prepareVideoCharacterReferenceImageUrls(assets: MediaAsset[]): Promise<string[]> {
    const urls = await Promise.all(assets.map((asset) => this.prepareVideoReferenceImageUrl(asset, undefined, "character")));
    return urls.filter((url): url is string => Boolean(url));
  }

  private async prepareVideoReferenceImageUrl(
    asset: MediaAsset | undefined,
    fallbackUrl?: string,
    kind: "character" | "generic" = "generic"
  ): Promise<string | undefined> {
    const sourceUrl = fallbackUrl?.trim() || asset?.url.trim();
    if (!sourceUrl) return undefined;
    if (isDataImageUrl(sourceUrl) && kind !== "character") return sourceUrl;
    if (!asset) {
      if (isProviderReadableHttpUrl(sourceUrl)) return sourceUrl;
      throw new Error(`Video reference image is local but missing a stored asset: ${sourceUrl}`);
    }
    if (!asset.storageKey && isProviderReadableHttpUrl(sourceUrl) && kind !== "character") return sourceUrl;

    try {
      const payload = await this.assetStorage.loadAsset(asset);
      const preparedPayload = kind === "character" ? await applyCharacterReferenceSafetyOverlay(payload).catch(() => payload) : payload;
      const contentType = preparedPayload.contentType || "image/png";
      if (!contentType.startsWith("image/")) {
        throw new Error(`unsupported content type ${contentType}`);
      }
      return `data:${contentType};base64,${preparedPayload.body.toString("base64")}`;
    } catch (error) {
      if (kind === "character" && !asset.storageKey && isProviderReadableHttpUrl(sourceUrl)) {
        return sourceUrl;
      }
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Failed to prepare ${kind === "character" ? "safe character " : ""}video reference image ${asset.id} for Seedance: ${message}`);
    }
  }

  private async resolvePreviousVideoTailFrameReference(
    project: Project,
    flow: Project["videoFlows"][number]
  ): Promise<ContinuityFrameReference | undefined> {
    const flowIndex = project.videoFlows.findIndex((item) => item.id === flow.id);
    if (flowIndex <= 0) return undefined;

    const previousFlow = project.videoFlows[flowIndex - 1];
    if (previousFlow.status !== "ready" || !previousFlow.videoAssetId) return undefined;

    const cachedFrameAsset = previousFlow.lastFrameImageAssetId
      ? project.assets.find((asset) => asset.id === previousFlow.lastFrameImageAssetId && asset.type === "image")
      : undefined;
    if (cachedFrameAsset) {
      return {
        sourceFlowId: previousFlow.id,
        sourceVideoAssetId: previousFlow.videoAssetId,
        asset: cachedFrameAsset
      };
    }

    const previousVideoAsset = project.assets.find(
      (asset) => asset.id === previousFlow.videoAssetId && asset.type === "video"
    );
    if (!previousVideoAsset) return undefined;

    try {
      const videoPayload = await this.assetStorage.loadAsset(previousVideoAsset);
      const framePayload = await this.videoFrameExtractor.extractLastFrame({
        asset: previousVideoAsset,
        body: videoPayload.body,
        contentType: videoPayload.contentType
      });
      const frameAsset = await this.persistJobAsset(
        project.id,
        buildContinuityFrameAsset(project, previousFlow, previousVideoAsset, framePayload)
      );

      return {
        sourceFlowId: previousFlow.id,
        sourceVideoAssetId: previousVideoAsset.id,
        asset: frameAsset
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to extract previous video tail frame for ${previousFlow.id}: ${message}`);
      return undefined;
    }
  }

  private async syncVideoFlowFromJob(projectId: string, flowId: string, job: MediaJob): Promise<void> {
    const project = await this.store.get(projectId);
    const flow = project?.videoFlows.find((item) => item.id === flowId);
    if (!project || !flow) return;
    if (job.jobId && flow.pendingVideoJobId !== job.jobId) return;

    if (job.status === "ready" && job.asset) {
      project.assets = upsertAsset(project.assets, job.asset);
      flow.videoAssetId = job.asset.id;
      flow.pendingVideoJobId = undefined;
      flow.generationRequestId = undefined;
      flow.status = "ready";
      flow.error = undefined;
      flow.nodes.videoNode.status = "ready";
      flow.nodes.videoNode.error = undefined;
      flow.nodes.videoNode.stale = false;
      flow.nodes.videoNode.generationRequestId = undefined;
      flow.nodes.previewNode.status = "ready";
      flow.nodes.previewNode.error = undefined;
      flow.nodes.previewNode.stale = false;
      project.status = "video-ready";
      await this.store.save(project);
      return;
    }

    if (job.status === "failed") {
      flow.pendingVideoJobId = undefined;
      flow.generationRequestId = undefined;
      flow.status = "failed";
      flow.error = job.error || "Video generation failed";
      flow.nodes.videoNode.status = "failed";
      flow.nodes.videoNode.error = flow.error;
      flow.nodes.videoNode.generationRequestId = undefined;
      flow.nodes.previewNode.status = "idle";
      await this.store.save(project);
      return;
    }

    flow.pendingVideoJobId = job.jobId || flow.pendingVideoJobId;
    flow.status = "generating";
    flow.error = job.error;
    flow.nodes.videoNode.status = "generating";
    flow.nodes.videoNode.error = job.error;
    flow.nodes.previewNode.status = "idle";
    await this.store.save(project);
  }
}

function buildPromptOptimizationRequestPayload(result: PromptOptimizationResult): Record<string, unknown> {
  return {
    prompt: result.prompt,
    ...(result.optimized ? { sourcePrompt: result.sourcePrompt } : {}),
    ...(result.model ? { promptOptimizerModel: result.model } : {}),
    ...(result.visualStyleLabel ? { promptOptimizerVisualStyle: result.visualStyleLabel } : {}),
    ...(result.error ? { promptOptimizationError: result.error } : {})
  };
}

function resolveProjectVisualStyle(project: Project): { label: string; prompt: string } {
  const preset = getVisualStylePreset(project.storyState.visualStyleId);
  if (preset) return { label: preset.label, prompt: preset.prompt };

  const styleKeywords = project.storyState.world.styleKeywords || [];
  const styleLabel = styleKeywords.find((keyword) => keyword.trim())?.trim();
  if (styleLabel) {
    return {
      label: styleLabel,
      prompt: styleKeywords.filter(Boolean).join("，")
    };
  }

  const fallback = getDefaultVisualStylePreset();
  return { label: fallback.label, prompt: fallback.prompt };
}

function resolvePromptOptimizerModel(model: TextModelSelection | undefined): TextModelSelection {
  return model === "gpt-5.5" ? "gpt-5.5" : "kimi-k2.6";
}

function preserveVideoDialogueLines(
  kind: MediaPromptOptimizationKind,
  sourcePrompt: string,
  optimizedPrompt: string
): string {
  if (kind !== "video") return optimizedPrompt;
  const missingDialogueLines = extractVideoDialogueLines(sourcePrompt).filter(
    (line) => !containsEquivalentDialogue(optimizedPrompt, line)
  );
  if (missingDialogueLines.length === 0) return optimizedPrompt;

  return [
    optimizedPrompt.trim(),
    "",
    "原始台词锁定（必须保留在当前 15 秒视频中，不要改写、删减或挪到其他片段）：",
    ...missingDialogueLines
  ].join("\n");
}

function extractVideoDialogueLines(value: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^(台词|对白)\s*[：:]/.test(line)) continue;
    const dialogue = line.replace(/^(台词|对白)\s*[：:]\s*/, "").trim();
    if (!dialogue || /^无[。.]?$/.test(dialogue) || /^无台词/.test(dialogue)) continue;
    const key = normalizeDialogueForMatch(line);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

function containsEquivalentDialogue(value: string, dialogueLine: string): boolean {
  const normalizedPrompt = normalizeDialogueForMatch(value);
  const normalizedLine = normalizeDialogueForMatch(dialogueLine);
  return Boolean(normalizedLine && normalizedPrompt.includes(normalizedLine));
}

function normalizeDialogueForMatch(value: string): string {
  return value
    .replace(/^(台词|对白)\s*[：:]\s*/gm, "")
    .replace(/[“”"「」『』（）()：:，,。.!！?？；;\s…]/g, "")
    .trim();
}

function buildMediaPromptOptimizationContext(project: Project): string {
  const story = project.storyState;
  return [
    `项目：${project.title || story.world.title}`,
    story.world.styleKeywords?.length ? `画风关键词：${story.world.styleKeywords.join("、")}` : "",
    story.characters?.length ? `人物：${story.characters.map((character) => character.name).join("、")}` : "",
    `15 秒分段数：${story.storyboard.length}`,
    story.outline ? `剧情概要：${trimForPromptContext(story.outline, 1200)}` : "",
    story.seedanceScript ? `Seedance 整体设定节选：${trimForPromptContext(story.seedanceScript, 1800)}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function buildMediaPromptSourceReference(project: Project): string | undefined {
  const sourceReferenceText = project.storyState.sourceReferenceText?.trim();
  if (!sourceReferenceText) return undefined;
  const label = project.storyState.sourceReferenceLabel?.trim();
  const text = trimForPromptContext(sourceReferenceText, 12000);
  return label ? `来源：${label}\n${text}` : text;
}

function trimForPromptContext(value: string, maxLength: number): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

function buildResultPayload(job: MediaJob) {
  return {
    jobId: job.jobId,
    status: job.status,
    assetId: job.asset?.id,
    assetIds: job.assets?.map((asset) => asset.id) ?? [],
    assetUrl: job.asset?.url,
    assetUrls: job.assets?.map((asset) => asset.url) ?? [],
    error: job.error
  };
}

function upsertAsset(assets: MediaAsset[], asset: MediaAsset): MediaAsset[] {
  const next = assets.filter((item) => {
    if (item.id === asset.id) return false;
    if (asset.jobId && item.jobId === asset.jobId && item.type === asset.type) return false;
    return true;
  });
  next.push(asset);
  return next;
}

function upsertAssets(assets: MediaAsset[], newAssets: MediaAsset[]): MediaAsset[] {
  return newAssets.reduce((next, asset) => upsertAsset(next, asset), assets);
}

function applyContinuityFrameReference(
  project: Project,
  flow: Project["videoFlows"][number],
  reference: ContinuityFrameReference | undefined
) {
  flow.firstFrameImageAssetId = reference?.asset.id;
  if (!reference) return;

  project.assets = upsertAsset(project.assets, reference.asset);
  const sourceFlow = project.videoFlows.find((item) => item.id === reference.sourceFlowId);
  if (sourceFlow) {
    sourceFlow.lastFrameImageAssetId = reference.asset.id;
  }
}

function buildContinuityFrameAsset(
  project: Project,
  sourceFlow: Project["videoFlows"][number],
  sourceVideoAsset: MediaAsset,
  framePayload: { body: Buffer; contentType: string }
): MediaAsset {
  const contentType = framePayload.contentType.startsWith("image/") ? framePayload.contentType : "image/png";
  return {
    id: buildContinuityFrameAssetId(sourceFlow.id, sourceVideoAsset.id),
    type: "image",
    url: `data:${contentType};base64,${framePayload.body.toString("base64")}`,
    provider: sourceVideoAsset.provider,
    prompt: `上一段视频尾帧，用作下一段视频首帧连续参考。项目：${project.title}；来源片段：${sourceFlow.shotId}。`,
    jobId: sourceVideoAsset.jobId,
    createdAt: new Date().toISOString()
  };
}

function buildContinuityFrameAssetId(flowId: string, videoAssetId: string): string {
  return `asset-continuity-tail-${sanitizeAssetIdPart(flowId)}-${sanitizeAssetIdPart(videoAssetId)}`.slice(0, 140);
}

function sanitizeAssetIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}

function buildFirstFrameContinuityReferenceNote(project: Project, reference: ContinuityFrameReference): string {
  const sourceFlow = project.videoFlows.find((flow) => flow.id === reference.sourceFlowId);
  const sourceIndex = sourceFlow ? project.videoFlows.findIndex((flow) => flow.id === sourceFlow.id) + 1 : undefined;
  const label = sourceIndex ? `第 ${sourceIndex} 段` : "上一段";
  return [
    `首帧连续参考图：上一段视频尾帧（${label}）。`,
    "当前段 0 秒开头必须承接这张图的人物位置、姿态、视线方向、镜头方向、光影和场景空间。",
    "只把它作为首帧衔接参考，不要重复上一段剧情或台词；随后严格执行当前 15 秒分镜。"
  ].join("");
}

function normalizeIds(ids: string[] | undefined, id: string | undefined): string[] {
  const next = ids?.length ? ids : id ? [id] : [];
  return Array.from(new Set(next));
}

function getSelectedCharacterIds(flow: Project["videoFlows"][number]): string[] {
  return normalizeIds(flow.selectedCharacterModelIds, flow.selectedCharacterModelId);
}

function findProjectItem<T extends { id: string }>(items: T[], requestedId: string): T | undefined {
  return items.find((item) => item.id === requestedId) || items.find((item) => isCompatibleRelationId(item.id, requestedId));
}

function isCompatibleRelationId(storedId: string, requestedId: string): boolean {
  if (!storedId || !requestedId) return false;
  if (storedId === requestedId) return true;
  if (storedId.endsWith(`:${requestedId}`)) return true;
  return storedId.split(":").at(-1) === requestedId;
}

function buildCharacterVideoReferenceNote(character: Project["characterModels"][number]): string {
  return [
    `人物模型图：${character.name}`,
    character.description ? `身份/用途：${character.description}` : undefined,
    character.consistencyPrompt ? `固定人物特征：${character.consistencyPrompt}` : undefined,
    "上传给视频模型的人物参考图会带有轻薄眼部雾化保护带；这只是安全处理，不是角色设定、道具或剧情效果，生成视频时不要保留这条雾化带。",
    "这张人物模型图是该角色唯一外观基准；必须锁定同一角色身份、脸型、五官比例、发型、年龄、体型、服装、配色和线稿；不要重新设计人物，不要换脸，不要根据文字描述另画一个相似角色。"
  ]
    .filter(Boolean)
    .join("。");
}

function buildSceneVideoReferenceNote(scene: Project["sceneModels"][number]): string {
  return [
    `场景模型图：${scene.name}`,
    scene.description ? `空间设定：${scene.description}` : undefined,
    scene.visualKeywords?.length ? `视觉关键词：${scene.visualKeywords.join("、")}` : undefined,
    "必须锁定空间结构、光源方向、座位/道具/入口出口位置和环境氛围。"
  ]
    .filter(Boolean)
    .join("。");
}

function buildStyleVideoReferenceNote(project: Project, flow: Project["videoFlows"][number]): string {
  const styleKeywords = project.storyState.world.styleKeywords?.length
    ? project.storyState.world.styleKeywords.join("、")
    : "项目所选画风";
  const imagePrompt = flow.imagePrompt;
  return [
    "风格参考图：当前片段/项目画风基准",
    `项目画风关键词：${styleKeywords}`,
    imagePrompt ? `画面方向：${imagePrompt}` : undefined,
    "必须锁定上述项目画风、色彩、线稿/材质、光影和构图语言；不要在视频生成时改成其他画风。"
  ]
    .filter(Boolean)
    .join("。");
}

function buildNoCharacterScenePrompt(rawPrompt: string, characterNames: string[], imageAspectRatio?: string): string {
  const sanitizedPrompt = syncSceneAspectRatio(sanitizePersonReferences(rawPrompt, characterNames), imageAspectRatio);
  return [
    sanitizedPrompt,
    "类型：场景模型图 / 环境设定图。",
    "画面必须是空场景：只出现环境、建筑、室内空间、关键道具、光影、天气和氛围。",
    "禁止：不得出现人物、角色、人影、背影、脸、手、身体、乘客、人群、剪影或任何类人形体；即使原 Prompt 包含人物动作，也只提取空间和道具，不绘制人物。"
  ]
    .filter(Boolean)
    .join("\n");
}

function buildImagePromptReferencePrompt(
  rawPrompt: string,
  imageAspectRatio: string,
  characters: Project["characterModels"] = []
): string {
  const stylePrompt = sanitizeImagePromptSourceText(rawPrompt, {
    maxLength: 1800,
    fallback: "项目统一场景风格，空间结构清楚，透视稳定，冷静克制的镜头质感。"
  });
  return [
    syncSceneAspectRatio(stylePrompt, imageAspectRatio),
    "类型：Image Prompt 风格参考图 / 视频画面风格基准图。",
    "用途：作为后续 Seedance 2.0 视频生成的风格参考图，强调整体画风、色调、线稿、空间氛围、镜头质感和构图方向。",
    buildImagePromptCharacterLockText(characters),
    "画面要求：生成一张完整可用的风格参考图，可以包含环境、光影、关键道具和空间氛围；避免文字说明排版，不要做成海报或UI界面。",
    "限制：不要可读文字，不要logo，不要水印，不要偏离项目所选画风。"
  ]
    .filter(Boolean)
    .join("\n");
}

function buildImagePromptCharacterLockText(characters: Project["characterModels"]): string {
  if (characters.length === 0) {
    return "人物约束：当前片段未连接已确认的人物模型图；本 Image Prompt 候选图只作为场景、色调、构图和镜头质感参考，不得生成新的未选人物、陌生脸、陌生发型或新角色设定。";
  }

  return [
    "人物一致性锁定：生成 Image Prompt 候选图时，必须把随请求传入的已确认人物模型图作为唯一人物外观来源。",
    ...characters.map((character, index) =>
      [
        `@Image${index + 1} 人物模型图：${character.name}`,
        character.description ? `身份/用途：${character.description}` : undefined,
        character.consistencyPrompt ? `固定人物特征：${character.consistencyPrompt}` : undefined
      ]
        .filter(Boolean)
        .join("。")
    ),
    "如画面中出现人物，只允许出现上述已选人物；必须保持参考图中的脸型、五官比例、发型、发色、年龄、体型、服装轮廓和配色。",
    "不得生成新的未选人物，不得把文字描述重新设计成相似但不同的角色，不得更换发型或发色，不得引入额外路人。"
  ].join("\n");
}

function getImagePromptReferenceUrl(project: Project, flow: Project["videoFlows"][number]): string | undefined {
  return getImagePromptReferenceAsset(project, flow)?.url || flow.imagePromptImageUrl;
}

function getImagePromptReferenceAsset(project: Project, flow: Project["videoFlows"][number]): MediaAsset | undefined {
  if (!flow.nodes.promptNode.confirmedImageId) return undefined;
  return getConfirmedAsset(project, flow.nodes.promptNode.confirmedImageId, flow.nodes.promptNode.candidateImages);
}

function getCharacterReferenceImageAsset(project: Project, character: Project["characterModels"][number]): MediaAsset | undefined {
  if (!character.confirmedImageId) return undefined;
  return getConfirmedAsset(project, character.confirmedImageId, character.candidateImages);
}

function getSceneReferenceImageAsset(project: Project, scene: Project["sceneModels"][number]): MediaAsset | undefined {
  if (!scene.confirmedImageId) return undefined;
  return getConfirmedAsset(project, scene.confirmedImageId, scene.candidateImages);
}

function buildMissingConfirmedReferenceError(characterNames: string[], sceneNames: string[]): string {
  const parts = [
    characterNames.length ? `人物：${characterNames.join("、")}` : "",
    sceneNames.length ? `场景：${sceneNames.join("、")}` : ""
  ].filter(Boolean);
  const target = parts.length ? parts.join("；") : "人物/场景模型";

  return `已连接的${target}还没有确认主图，不能生成视频。请打开对应模型节点，在候选图中点击“确认这张”。Selected character and scene models must have confirmed images before video generation.`;
}

function buildMissingImagePromptCharacterReferenceError(characterNames: string[]): string {
  return `已选人物模型还没有确认主图，不能生成 Image Prompt 候选图：${characterNames.join("、")}。请先确认人物模型图，再生成 Image Prompt，避免风格参考图生成新人物导致视频人物一致性漂移。`;
}

function getConfirmedAsset(project: Project, assetId: string, candidates: MediaAsset[] | undefined): MediaAsset | undefined {
  return project.assets.find((asset) => asset.id === assetId)
    || candidates?.find((asset) => asset.id === assetId);
}

function findReferenceAssetByUrl(project: Project, url: string | undefined, candidates: MediaAsset[] | undefined): MediaAsset | undefined {
  const normalizedUrl = url?.trim();
  if (!normalizedUrl) return undefined;
  return project.assets.find((asset) => asset.url === normalizedUrl)
    || candidates?.find((asset) => asset.url === normalizedUrl);
}

function isDataImageUrl(url: string): boolean {
  return /^data:image\//i.test(url);
}

function isProviderReadableHttpUrl(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
  } catch {
    return false;
  }
}

function syncSceneAspectRatio(prompt: string, imageAspectRatio?: string): string {
  if (!imageAspectRatio) return prompt;
  if (/--ar\s+\S+/i.test(prompt)) return prompt.replace(/--ar\s+\S+/i, `--ar ${imageAspectRatio}`);
  return `${prompt} --ar ${imageAspectRatio}`;
}

function sanitizePersonReferences(value: string, characterNames: string[]): string {
  const blockedTerms = [
    ...characterNames,
    "主角",
    "角色",
    "人物",
    "人",
    "别人",
    "他人",
    "人类",
    "人影",
    "乘客",
    "人群",
    "男人",
    "女人",
    "男子",
    "女子",
    "男孩",
    "女孩",
    "少女",
    "刑警",
    "妹妹",
    "哥哥",
    "姐姐",
    "弟弟",
    "他",
    "她"
  ].filter(Boolean);
  const blockedPattern = blockedTerms.length > 0 ? new RegExp(blockedTerms.map(escapeRegExp).join("|")) : undefined;
  const fragments = value
    .split(/[，,。；;！？!?]\s*/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment && !blockedPattern?.test(fragment));

  return fragments.join("，") || "纯环境空间、关键道具、光影、天气和氛围";
}

function sanitizeSceneReferencePrompt(value: string, characterNames: string[]): string {
  const blockedTerms = [
    ...characterNames,
    "核心设定",
    "中文生成提示词",
    "原文",
    "原文推进",
    "根据导入小说",
    "开端",
    "分镜",
    "台词",
    "对白",
    "动作",
    "主角",
    "角色",
    "人物",
    "人影",
    "人群",
    "男",
    "女",
    "他",
    "她",
    "师兄",
    "师父",
    "握",
    "斜指",
    "紧绷",
    "呼吸",
    "轻颤",
    "指尖",
    "抚过",
    "腰间",
    "衣袂",
    "欺身",
    "直刺",
    "侧身",
    "避过",
    "横削",
    "相撞",
    "铮鸣",
    "招式",
    "招招",
    "取要害",
    "缠绕",
    "化解",
    "缠斗",
    "旋身",
    "劈向",
    "躲闪",
    "肩头",
    "血口",
    "脱手",
    "反目",
    "挣扎",
    "软剑",
    "素铁剑"
  ].filter(Boolean);
  const blockedPattern = new RegExp(blockedTerms.map(escapeRegExp).join("|"));
  const fragments = value
    .replace(/[“”"《》]/g, "。")
    .split(/[，,。；;！？!?：:\n]\s*/)
    .map((fragment) => fragment.trim())
    .filter((fragment) => fragment && !blockedPattern.test(fragment))
    .filter((fragment) => !/^\s*S\d{1,3}\s*/i.test(fragment));

  return Array.from(new Set(fragments)).slice(0, 10).join("，") || "纯环境空间、关键道具、光影、天气和氛围";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
