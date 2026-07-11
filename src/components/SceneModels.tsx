import { Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../lib/apiClient";
import {
  cancelSceneImageGeneration,
  createGenerationRequestId
} from "../lib/generationCancellation";
import { sanitizeSceneModelPromptText } from "../lib/sceneModelPromptText";
import type { Project } from "../types/domain";
import { AIImageGenerationPanel } from "./ui/ai-gen";
import { useI18n } from "../i18n/I18nProvider";

type SceneModelsProps = {
  project: Project;
  onProjectChange: (project: Project) => void;
  onSave: (project: Project, message?: string) => Promise<void>;
  onAssistantMessage: (message: string) => void;
};

export function SceneModels({
  project,
  onProjectChange,
  onSave,
  onAssistantMessage
}: SceneModelsProps) {
  const { t } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progressById, setProgressById] = useState<Record<string, number>>({});
  const progressTimers = useRef<Record<string, number>>({});
  const projectRef = useRef(project);
  const generationControllers = useRef<Record<string, AbortController>>({});
  const generationRequestIds = useRef<Record<string, string>>({});

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  function applyProject(nextProject: Project) {
    projectRef.current = nextProject;
    onProjectChange(nextProject);
  }

  function updateScenePrompt(sceneModelId: string, generationPrompt: string) {
    const nextProject: Project = {
      ...project,
      sceneModels: project.sceneModels.map((model) =>
        model.id === sceneModelId ? { ...model, generationPrompt } : model
      )
    };
    onProjectChange(nextProject);
  }

  function updateAspectRatio(sceneModelId: string, imageAspectRatio: string) {
    onProjectChange({
      ...project,
      sceneModels: project.sceneModels.map((model) =>
        model.id === sceneModelId ? { ...model, imageAspectRatio } : model
      )
    });
  }

  async function generate(sceneModelId: string) {
    const currentProject = projectRef.current;
    const targetModel = currentProject.sceneModels.find((model) => model.id === sceneModelId);
    const imageAspectRatio = targetModel?.imageAspectRatio || "16:9";
    const generationRequestId = createGenerationRequestId("scene-image", sceneModelId);
    const controller = new AbortController();
    generationControllers.current[sceneModelId] = controller;
    generationRequestIds.current[sceneModelId] = generationRequestId;
    setBusyId(sceneModelId);
    startImageProgress(sceneModelId);
    const clearedProject: Project = {
      ...currentProject,
      sceneModels: currentProject.sceneModels.map((model) =>
        model.id === sceneModelId
          ? {
              ...model,
              candidateImages: [],
              confirmedImageId: undefined,
              status: "generating" as const,
              error: undefined,
              imageAspectRatio,
              generationRequestId
            }
          : model
      )
    };
    applyProject(clearedProject);
    onAssistantMessage(t("Seedance 2.0 正在生成场景模型候选图..."));
    try {
      const syncedProject = await apiClient.saveProject(clearedProject);
      if (controller.signal.aborted) return;
      applyProject(syncedProject);
      const next = await apiClient.generateSceneImage(currentProject.id, sceneModelId, imageAspectRatio, {
        signal: controller.signal,
        generationRequestId
      });
      if (controller.signal.aborted) return;
      await finishImageProgress(sceneModelId);
      applyProject(next);
      onAssistantMessage(t("场景模型候选图已生成。请选择一张作为主场景图。"));
    } catch (error) {
      stopImageProgress(sceneModelId);
      if (controller.signal.aborted) return;
      const message = t(error instanceof Error ? error.message : "场景图生成失败");
      const latestProject = projectRef.current;
      applyProject({
        ...latestProject,
        sceneModels: latestProject.sceneModels.map((model) =>
          model.id === sceneModelId
            ? {
                ...model,
                candidateImages: [],
                confirmedImageId: undefined,
                status: "failed" as const,
                error: message,
                generationRequestId: undefined
              }
            : model
        )
      });
      onAssistantMessage(message);
    } finally {
      if (generationControllers.current[sceneModelId] === controller) {
        delete generationControllers.current[sceneModelId];
        delete generationRequestIds.current[sceneModelId];
      }
      setBusyId((current) => (current === sceneModelId ? null : current));
    }
  }

  async function cancelGenerate(sceneModelId: string) {
    const requestId = generationRequestIds.current[sceneModelId];
    generationControllers.current[sceneModelId]?.abort();
    delete generationControllers.current[sceneModelId];
    delete generationRequestIds.current[sceneModelId];
    stopImageProgress(sceneModelId);
    setBusyId((current) => (current === sceneModelId ? null : current));
    const nextProject = cancelSceneImageGeneration(projectRef.current, sceneModelId, requestId);
    applyProject(nextProject);
    try {
      const savedProject = await apiClient.saveProject(nextProject);
      applyProject(savedProject);
    } catch {
      // Keep local cancellation visible if persistence has a transient failure.
    }
    onAssistantMessage(t("场景模型候选图生成已取消。"));
  }

  async function confirm(modelId: string, assetId: string) {
    const next = {
      ...project,
      sceneModels: project.sceneModels.map((model) =>
        model.id === modelId ? { ...model, confirmedImageId: assetId, status: "ready" as const } : model
      )
    };
    onProjectChange(next);
    await onSave(next, t("场景主模型图已确认。"));
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">{t("场景模型 / Seedance 2.0")}</span>
          <h1>{t("确认场景模型图片")}</h1>
          <p>{t("先确认场景基底，再把它和人物模型图一起送入 15 秒视频生成。")}</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void onSave(project, t("场景模型状态已保存。"))}>
          <Save size={17} />
          {t("保存")}
        </button>
      </header>

      <div className="generation-stack">
        {project.sceneModels.map((model) => (
          <AIImageGenerationPanel
            key={model.id}
            kind="scene"
            title={model.name}
            description={model.description}
            status={model.status}
            promptLabel={t("场景图生成 Prompt")}
            prompt={sanitizeSceneModelPromptText(
              model.generationPrompt || "",
              project.characterModels.map((character) => character.name),
              model.description || model.name
            )}
            promptPlaceholder={t("描述你希望生成的场景模型图，例如场景空间、光线、色彩、构图、画风、镜头质感。")}
            helperText={t("Seedance 生成场景候选图时会优先使用这里的 Prompt。")}
            keywords={model.visualKeywords}
            candidates={model.candidateImages}
            confirmedImageId={model.confirmedImageId}
            aspectRatio={model.imageAspectRatio || "16:9"}
            isLoading={busyId === model.id}
            loadingProgress={progressById[model.id] || 0}
            error={model.error}
            getDownloadUrl={(asset) => apiClient.assetDownloadUrl(project.id, asset.id)}
            onPromptChange={(value) => updateScenePrompt(model.id, value)}
            onAspectRatioChange={(value) => updateAspectRatio(model.id, value)}
            onGenerate={() => void generate(model.id)}
            onCancel={() => void cancelGenerate(model.id)}
            onConfirm={(assetId) => void confirm(model.id, assetId)}
          />
        ))}
      </div>
    </section>
  );
  function startImageProgress(modelId: string) {
    stopImageProgress(modelId, false);
    const startedAt = Date.now();
    setProgressById((current) => ({ ...current, [modelId]: 2 }));
    progressTimers.current[modelId] = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const expectedMs = 15000;
      const base = Math.min(88, (elapsed / expectedMs) * 88);
      const slowTail = elapsed > expectedMs ? Math.min(8, ((elapsed - expectedMs) / expectedMs) * 8) : 0;
      setProgressById((current) => ({
        ...current,
        [modelId]: Math.max(current[modelId] || 0, Math.min(96, base + slowTail))
      }));
    }, 180);
  }

  async function finishImageProgress(modelId: string) {
    stopImageProgress(modelId, false);
    setProgressById((current) => ({ ...current, [modelId]: 100 }));
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    setProgressById((current) => {
      const next = { ...current };
      delete next[modelId];
      return next;
    });
  }

  function stopImageProgress(modelId: string, clear = true) {
    const timer = progressTimers.current[modelId];
    if (timer) {
      window.clearInterval(timer);
      delete progressTimers.current[modelId];
    }
    if (clear) {
      setProgressById((current) => {
        const next = { ...current };
        delete next[modelId];
        return next;
      });
    }
  }
}
