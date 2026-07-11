import { Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { apiClient } from "../lib/apiClient";
import {
  cancelCharacterImageGeneration,
  createGenerationRequestId
} from "../lib/generationCancellation";
import { updateCharacterConsistencyPrompt } from "../lib/modelPromptEdits";
import type { Project } from "../types/domain";
import { AIImageGenerationPanel } from "./ui/ai-gen";

type CharacterModelsProps = {
  project: Project;
  onProjectChange: (project: Project) => void;
  onSave: (project: Project, message?: string) => Promise<void>;
  onAssistantMessage: (message: string) => void;
  generationCostLabel: string;
  onBillingChange: () => void;
};

export function CharacterModels({
  project,
  onProjectChange,
  onSave,
  onAssistantMessage,
  generationCostLabel,
  onBillingChange
}: CharacterModelsProps) {
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

  async function generate(characterModelId: string) {
    const currentProject = projectRef.current;
    const targetModel = currentProject.characterModels.find((model) => model.id === characterModelId);
    const imageAspectRatio = targetModel?.imageAspectRatio || "3:4";
    const generationRequestId = createGenerationRequestId("character-image", characterModelId);
    const controller = new AbortController();
    generationControllers.current[characterModelId] = controller;
    generationRequestIds.current[characterModelId] = generationRequestId;
    setBusyId(characterModelId);
    startImageProgress(characterModelId);
    const clearedProject: Project = {
      ...currentProject,
      characterModels: currentProject.characterModels.map((model) =>
        model.id === characterModelId
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
    onAssistantMessage("Seedance 2.0 正在生成人物模型候选图...");
    try {
      const syncedProject = await apiClient.saveProject(clearedProject);
      if (controller.signal.aborted) return;
      applyProject(syncedProject);
      const next = await apiClient.generateCharacterImage(currentProject.id, characterModelId, imageAspectRatio, {
        signal: controller.signal,
        generationRequestId
      });
      if (controller.signal.aborted) return;
      await finishImageProgress(characterModelId);
      applyProject(next);
      onAssistantMessage("人物模型候选图已生成。请选择一张作为主模型图。");
    } catch (error) {
      stopImageProgress(characterModelId);
      if (controller.signal.aborted) return;
      const latestProject = projectRef.current;
      applyProject({
        ...latestProject,
        characterModels: latestProject.characterModels.map((model) =>
          model.id === characterModelId
            ? {
                ...model,
                candidateImages: [],
                confirmedImageId: undefined,
                status: "failed" as const,
                error: error instanceof Error ? error.message : "Image generation failed",
                generationRequestId: undefined
              }
            : model
        )
      });
      onAssistantMessage(error instanceof Error ? error.message : "人物图生成失败");
    } finally {
      void onBillingChange();
      if (generationControllers.current[characterModelId] === controller) {
        delete generationControllers.current[characterModelId];
        delete generationRequestIds.current[characterModelId];
      }
      setBusyId((current) => (current === characterModelId ? null : current));
    }
  }

  async function cancelGenerate(characterModelId: string) {
    const requestId = generationRequestIds.current[characterModelId];
    generationControllers.current[characterModelId]?.abort();
    delete generationControllers.current[characterModelId];
    delete generationRequestIds.current[characterModelId];
    stopImageProgress(characterModelId);
    setBusyId((current) => (current === characterModelId ? null : current));
    const nextProject = cancelCharacterImageGeneration(projectRef.current, characterModelId, requestId);
    applyProject(nextProject);
    try {
      const savedProject = await apiClient.saveProject(nextProject);
      applyProject(savedProject);
    } catch {
      // Keep local cancellation visible if persistence has a transient failure.
    }
    onAssistantMessage("人物模型候选图生成已取消。");
  }

  function updateAspectRatio(modelId: string, imageAspectRatio: string) {
    onProjectChange({
      ...project,
      characterModels: project.characterModels.map((model) =>
        model.id === modelId ? { ...model, imageAspectRatio } : model
      )
    });
  }

  function updatePrompt(modelId: string, consistencyPrompt: string) {
    onProjectChange(updateCharacterConsistencyPrompt(project, modelId, consistencyPrompt));
  }

  async function savePrompt(modelId: string, consistencyPrompt: string) {
    const model = project.characterModels.find((item) => item.id === modelId);
    if (!model) return;
    await onSave(updateCharacterConsistencyPrompt(project, modelId, consistencyPrompt), `${model.name} 人物一致性 Prompt 已保存。`);
  }

  async function confirm(modelId: string, assetId: string) {
    const next = {
      ...project,
      characterModels: project.characterModels.map((model) =>
        model.id === modelId ? { ...model, confirmedImageId: assetId, status: "ready" as const } : model
      )
    };
    onProjectChange(next);
    await onSave(next, "人物主模型图已确认。");
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">人物模型 / Seedance 2.0</span>
          <h1>确认人物模型图片</h1>
          <p>每个角色先确认一张主模型图，后续视频镜头用它保持人物一致性。</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void onSave(project, "人物模型状态已保存。")}>
          <Save size={17} />
          保存
        </button>
      </header>

      <div className="generation-stack">
        {project.characterModels.map((model) => (
          <AIImageGenerationPanel
            key={model.id}
            kind="character"
            title={model.name}
            description={model.description}
            status={model.status}
            promptLabel="人物一致性 Prompt"
            prompt={model.consistencyPrompt}
            promptPlaceholder="补充人物外貌、年龄、性别、服装、体型、气质和防跑偏约束。"
            helperText="人物模型图会作为后续视频片段的人物参考图。这里可直接修改 Prompt，生成候选图时会使用最新内容。"
            candidates={model.candidateImages}
            confirmedImageId={model.confirmedImageId}
            aspectRatio={model.imageAspectRatio || "3:4"}
            isLoading={busyId === model.id}
            loadingProgress={progressById[model.id] || 0}
            error={model.error}
            generationCostLabel={generationCostLabel}
            getDownloadUrl={(asset) => apiClient.assetDownloadUrl(project.id, asset.id)}
            onPromptChange={(value) => updatePrompt(model.id, value)}
            onPromptBlur={(value) => void savePrompt(model.id, value)}
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
