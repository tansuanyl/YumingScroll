import { BookOpen, Check, Lightbulb, ListChecks, Palette, Save, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { visualStylePresets, type VisualStylePresetId } from "../data/visualStylePresets";
import { apiClient, type TextModelSelection } from "../lib/apiClient";
import {
  cancelTextGeneration,
  createGenerationRequestId,
  startTextGeneration
} from "../lib/generationCancellation";
import { SOURCE_IMPORT_ACCEPT, SOURCE_IMPORT_MAX_FILE_BYTES, buildSourceFilePayload } from "../lib/sourceImportFile";
import type { Project } from "../types/domain";

type InputSection = "inspiration" | "world" | "outline";
type TextCreationMode = "brief" | "source";

type TextCreationProps = {
  project: Project;
  onProjectChange: (project: Project) => void;
  onSave: (project: Project, message?: string) => Promise<void>;
  onAssistantMessage: (message: string) => void;
};

const QUICK_GENERATION_RECOVERY_MS = 6_000;
const LONG_GENERATION_RECOVERY_MS = 12 * 60 * 1000;
const GENERATION_RECOVERY_POLL_MS = 5_000;

export const briefInputSections: Array<{
  key: InputSection;
  code: string;
  label: string;
  sub: string;
  placeholder: string;
  icon: typeof Lightbulb;
}> = [
  {
    key: "inspiration",
    code: "B01",
    label: "故事灵感",
    sub: "题材、主角关系、核心悬念",
    placeholder: "例如：悬疑短剧，失踪刑警进入不存在的第十三层档案馆",
    icon: Lightbulb
  },
  {
    key: "world",
    code: "W01",
    label: "世界观",
    sub: "时代、规则、空间与异常机制",
    placeholder: "例如：旧警局档案楼只有十二层，但深夜电梯会出现红色 13 按钮",
    icon: BookOpen
  },
  {
    key: "outline",
    code: "O01",
    label: "剧情大纲",
    sub: "第一集推进、转折与结尾钩子",
    placeholder: "例如：林彻进入第十三层，发现妹妹照片和第一份黑色档案",
    icon: ListChecks
  }
];

const textModelOptions: Array<{ value: TextModelSelection; label: string; sub: string }> = [
  { value: "kimi-k2.6", label: "Kimi K2.6", sub: "成本优先 / Moonshot" },
  { value: "gpt-5.5", label: "GPT-5.5", sub: "质量优先 / OpenAI" }
];

export function TextCreation({
  project,
  onProjectChange,
  onSave,
  onAssistantMessage
}: TextCreationProps) {
  const [draft, setDraft] = useState(project);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<TextCreationMode>("brief");
  const [textModel, setTextModel] = useState<TextModelSelection>("kimi-k2.6");
  const [visualStyleId, setVisualStyleId] = useState<VisualStylePresetId>("suspense-guoman");
  const [failedStyleImages, setFailedStyleImages] = useState<Record<string, boolean>>({});
  const [activeModal, setActiveModal] = useState<InputSection | null>(null);
  const [modalValue, setModalValue] = useState("");
  const [modalTitle, setModalTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [generationDetail, setGenerationDetail] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const generationControllerRef = useRef<AbortController | null>(null);
  const generationRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDraft(project);
  }, [project]);

  useEffect(() => {
    setTextModel(project.storyState.promptOptimizerModel === "gpt-5.5" ? "gpt-5.5" : "kimi-k2.6");
    const savedStyle = visualStylePresets.find((item) => item.id === project.storyState.visualStyleId);
    if (savedStyle) setVisualStyleId(savedStyle.id);
  }, [project.id]);

  useEffect(() => {
    if (!generationStartedAt) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - generationStartedAt) / 1000)));
    };
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [generationStartedAt]);

  const canGenerateFromBrief =
    draft.inspiration.trim().length > 0 &&
    draft.storyState.world.title.trim().length > 0 &&
    draft.storyState.world.background.trim().length > 0 &&
    draft.storyState.outline.trim().length > 0;
  const canGenerateFromSource = sourceText.trim().length > 0 || Boolean(sourceFile);
  const activeMeta = activeModal ? briefInputSections.find((item) => item.key === activeModal) : null;
  const activeTextModel = textModelOptions.find((item) => item.value === textModel) || textModelOptions[0];
  const activeVisualStyle =
    visualStylePresets.find((item) => item.id === visualStyleId) || visualStylePresets[0];
  const sourceInputCharacters = sourceText.trim().length;
  const sourceFileSizeMb = sourceFile ? sourceFile.size / 1024 / 1024 : 0;
  const isLongSourceInput = mode === "source" && (sourceInputCharacters >= 12000 || sourceFileSizeMb >= 0.5);

  function updateProject(next: Project) {
    setDraft(next);
    onProjectChange(next);
  }

  function selectTextModel(nextModel: TextModelSelection) {
    setTextModel(nextModel);
    updateProject({
      ...draft,
      storyState: {
        ...draft.storyState,
        promptOptimizerModel: nextModel,
        promptOptimizationEnabled: true
      }
    });
  }

  function selectVisualStyle(nextVisualStyleId: VisualStylePresetId) {
    setVisualStyleId(nextVisualStyleId);
    updateProject({
      ...draft,
      storyState: {
        ...draft.storyState,
        visualStyleId: nextVisualStyleId,
        promptOptimizationEnabled: true
      }
    });
  }

  function beginGeneration(detail: string, startedAt = Date.now()) {
    setBusy(true);
    setGenerationStartedAt(startedAt);
    setElapsedSeconds(0);
    setGenerationDetail(detail);
    setGenerationError(null);
  }

  function finishGeneration(generationRequestId?: string) {
    if (generationRequestId && generationRequestIdRef.current !== generationRequestId) return;
    generationControllerRef.current = null;
    generationRequestIdRef.current = null;
    setBusy(false);
    setGenerationStartedAt(null);
    setGenerationDetail("");
  }

  async function recoverCompletedGeneratedProject(
    projectId: string,
    startedAt: number,
    message: string,
    options: { signal?: AbortSignal; maxWaitMs?: number; waitingDetail?: string } = {}
  ): Promise<boolean> {
    const maxWaitMs = options.maxWaitMs ?? QUICK_GENERATION_RECOVERY_MS;
    const deadline = Date.now() + maxWaitMs;
    let attempt = 0;
    if (options.waitingDetail) setGenerationDetail(options.waitingDetail);

    while (attempt === 0 || Date.now() < deadline) {
      if (options.signal?.aborted) return false;
      if (attempt > 0) {
        await new Promise((resolve) =>
          window.setTimeout(resolve, Math.min(GENERATION_RECOVERY_POLL_MS, Math.max(1000, deadline - Date.now())))
        );
      }
      attempt += 1;

      const latestProject = await apiClient.getProject(projectId).catch(() => null);
      if (!latestProject) continue;

      const updatedAt = Date.parse(latestProject.updatedAt);
      const hasFreshGeneratedText =
        latestProject.status === "text-ready" &&
        latestProject.storyState.seedanceScript.trim().length > 0 &&
        latestProject.storyState.storyboard.length > 0 &&
        (Number.isNaN(updatedAt) || updatedAt >= startedAt - 2000);

      if (!hasFreshGeneratedText) continue;

      setDraft(latestProject);
      onProjectChange(latestProject);
      setGenerationError(null);
      onAssistantMessage(message);
      return true;
    }

    return false;
  }

  async function showGenerationFailure(project: Project, generationRequestId: string, message: string) {
    const nextProject = cancelTextGeneration(project, generationRequestId);
    updateProject(nextProject);
    setGenerationError(message);
    onAssistantMessage(message);
    await apiClient.saveProject(nextProject).catch(() => undefined);
  }

  function getGenerationErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error ? error.message : fallback;
  }

  function isLongRunningGenerationError(message: string): boolean {
    return /504|502|503|gateway|timed out|timeout|socket hang up|socket closed|fetch failed|network|getaddrinfo|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|等待时间过长|请求超时|网关超时/i.test(
      message
    );
  }

  async function recoverAfterGenerationError(
    projectId: string,
    startedAt: number,
    errorMessage: string,
    recoveredMessage: string,
    controller: AbortController
  ): Promise<boolean> {
    if (!isLongRunningGenerationError(errorMessage)) {
      return recoverCompletedGeneratedProject(projectId, startedAt, recoveredMessage, { signal: controller.signal });
    }

    const waitingDetail =
      "请求被网关超时截断，但后端可能仍在生成并保存结果。正在持续检查项目结果，你也可以点“取消生成”停止等待。";
    onAssistantMessage(waitingDetail);
    return recoverCompletedGeneratedProject(projectId, startedAt, recoveredMessage, {
      signal: controller.signal,
      maxWaitMs: LONG_GENERATION_RECOVERY_MS,
      waitingDetail
    });
  }

  function getSectionBody(key: InputSection): string {
    if (key === "inspiration") return draft.inspiration;
    if (key === "world") return draft.storyState.world.background;
    return draft.storyState.outline;
  }

  function getSectionStatus(key: InputSection): "ready" | "idle" {
    if (key === "inspiration") return draft.inspiration.trim() ? "ready" : "idle";
    if (key === "world") return draft.storyState.world.background.trim() ? "ready" : "idle";
    return draft.storyState.outline.trim() ? "ready" : "idle";
  }

  function openModal(key: InputSection) {
    setActiveModal(key);
    setModalTitle(key === "world" ? draft.storyState.world.title : "");
    setModalValue(getSectionBody(key));
  }

  function closeModal() {
    setActiveModal(null);
    setModalValue("");
    setModalTitle("");
  }

  function applyModalInput() {
    if (!activeModal) return;
    const value = modalValue.trim();
    if (!value) return;

    const next =
      activeModal === "inspiration"
        ? { ...draft, inspiration: value }
        : activeModal === "world"
          ? {
              ...draft,
              storyState: {
                ...draft.storyState,
                world: {
                  ...draft.storyState.world,
                  title: modalTitle.trim() || value.split(/\r?\n/)[0].slice(0, 24),
                  background: value
                }
              }
            }
          : {
              ...draft,
              storyState: { ...draft.storyState, outline: value }
            };

    updateProject(next);
    onAssistantMessage(`${activeMeta?.label || "输入"}已保存到当前项目。`);
    closeModal();
  }

  async function generateStory() {
    const generationRequestId = createGenerationRequestId("storyboard-script", draft.id);
    const controller = new AbortController();
    const startedAt = Date.now();
    generationControllerRef.current = controller;
    generationRequestIdRef.current = generationRequestId;
    const generatingDraft = startTextGeneration(draft, generationRequestId);
    updateProject(generatingDraft);
    beginGeneration(`${activeTextModel.label} 正在生成角色、剧本、分镜和 Seedance 2.0 分镜脚本...`, startedAt);
    onAssistantMessage(`已确认故事灵感、世界观和剧情大纲。${activeTextModel.label} 正在生成角色、剧本、分镜和 Seedance 2.0 分镜脚本...`);
    let textRequestSubmitted = false;
    try {
      const syncedProject = await apiClient.saveProject(generatingDraft);
      if (controller.signal.aborted) return;
      updateProject(syncedProject);
      textRequestSubmitted = true;
      const next = await apiClient.generateStory(generatingDraft.id, {
        inspiration: generatingDraft.inspiration,
        worldTitle: generatingDraft.storyState.world.title,
        worldBackground: generatingDraft.storyState.world.background,
        outline: generatingDraft.storyState.outline,
        visualStyleId,
        textModel
      }, {
        signal: controller.signal,
        generationRequestId
      });
      if (controller.signal.aborted) return;
      setDraft(next);
      onProjectChange(next);
      onAssistantMessage("文本生成完成。大模型已基于无现成小说模式的三项输入生成结构化结果。");
    } catch (error) {
      if (controller.signal.aborted) return;
      const errorMessage = getGenerationErrorMessage(error, "文本生成失败");
      const recovered = textRequestSubmitted
        ? await recoverAfterGenerationError(
            generatingDraft.id,
            startedAt,
            errorMessage,
            "后端已完成文本生成，已恢复到当前文本工作台。",
            controller
          )
        : false;
      if (recovered) return;
      await showGenerationFailure(generatingDraft, generationRequestId, errorMessage);
    } finally {
      finishGeneration(generationRequestId);
    }
  }

  async function importSource() {
    if (!sourceText.trim() && !sourceFile) return;
    const sourceSizeLabel = sourceFile
      ? `${sourceFile.name}，约 ${sourceFileSizeMb.toFixed(1)} MB`
      : `${sourceInputCharacters.toLocaleString()} 字正文`;
    const generationRequestId = createGenerationRequestId("storyboard-source", draft.id);
    const controller = new AbortController();
    const startedAt = Date.now();
    generationControllerRef.current = controller;
    generationRequestIdRef.current = generationRequestId;
    const generatingDraft = startTextGeneration(draft, generationRequestId);
    updateProject(generatingDraft);
    beginGeneration(`${activeTextModel.label} 正在读取导入内容...`, startedAt);
    onAssistantMessage(`${activeTextModel.label} 正在读取导入的小说/文档，并直接生成后续剧本、分镜和 Seedance 2.0 分镜脚本...`);
    let textRequestSubmitted = false;
    try {
      const syncedProject = await apiClient.saveProject(generatingDraft);
      if (controller.signal.aborted) return;
      updateProject(syncedProject);
      const uploadedFile = sourceFile ? await buildSourceFilePayload(sourceFile) : undefined;
      if (controller.signal.aborted) return;
      setGenerationDetail(
        `${activeTextModel.label} 已提交 ${sourceSizeLabel}。正在清洗作者互动、提取人物并压缩生成 15 秒分段分镜，长篇会优先稳定产出第一版。`
      );
      textRequestSubmitted = true;
      const next = await apiClient.importSource(generatingDraft.id, {
        sourceText: sourceText.trim() || undefined,
        sourceFile: uploadedFile,
        visualStyleId,
        textModel
      }, {
        signal: controller.signal,
        generationRequestId
      });
      if (controller.signal.aborted) return;
      setDraft(next);
      onProjectChange(next);
      setSourceText("");
      setSourceFile(null);
      onAssistantMessage(`小说/文档导入完成。${activeTextModel.label} 已基于原文生成后续剧本、分镜和 Seedance 2.0 分镜脚本。`);
    } catch (error) {
      if (controller.signal.aborted) return;
      const errorMessage = getGenerationErrorMessage(error, "小说/文档导入生成失败");
      const recovered = textRequestSubmitted
        ? await recoverAfterGenerationError(
            generatingDraft.id,
            startedAt,
            errorMessage,
            "后端已完成小说/文档导入，已恢复到当前文本工作台。",
            controller
          )
        : false;
      if (recovered) return;
      await showGenerationFailure(generatingDraft, generationRequestId, errorMessage);
    } finally {
      finishGeneration(generationRequestId);
    }
  }

  async function cancelGeneration() {
    const generationRequestId = generationRequestIdRef.current || undefined;
    generationControllerRef.current?.abort();
    const nextProject = cancelTextGeneration(draft, generationRequestId);
    updateProject(nextProject);
    finishGeneration(generationRequestId);
    try {
      const savedProject = await apiClient.saveProject(nextProject);
      updateProject(savedProject);
    } catch {
      // Keep local cancellation visible if persistence has a transient failure.
    }
    onAssistantMessage("分镜脚本生成已取消。");
  }

  function generateFromCurrentMode() {
    if (busy) {
      void cancelGeneration();
      return;
    }
    if (mode === "source") {
      void importSource();
      return;
    }
    void generateStory();
  }

  return (
    <section className="page text-creation-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">文本创作 / 双模型</span>
          <h1>文本制作工作台</h1>
          <p>先选择输入模式，再生成可编辑的 Seedance 2.0 分镜脚本。</p>
        </div>
        <div className="action-row">
          <button type="button" className="secondary-button" onClick={() => void onSave(draft, "文本修改已保存。")}>
            <Save size={17} />
            保存
          </button>
        </div>
      </header>

      <div className="text-mode-switch-row">
        <div className="text-mode-switch" aria-label="文本创作模式">
          <button type="button" className={mode === "brief" ? "active" : ""} onClick={() => setMode("brief")}>
            无现成小说模式
          </button>
          <button type="button" className={mode === "source" ? "active" : ""} onClick={() => setMode("source")}>
            已有小说模式
          </button>
        </div>
        <div className="text-model-switch" aria-label="文本与 Prompt 优化模型">
          <span className="text-model-label">文本 / Prompt 优化模型</span>
          {textModelOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              className={textModel === option.value ? "active" : ""}
              onClick={() => selectTextModel(option.value)}
              disabled={busy}
            >
              <strong>{option.label}</strong>
              <small>{option.sub}</small>
            </button>
          ))}
        </div>
      </div>

      <section className="visual-style-panel" aria-label="画面风格选择">
        <div className="visual-style-heading">
          <div>
            <span>
              <Palette size={15} />
              画面风格
            </span>
            <strong>{activeVisualStyle.label}</strong>
          </div>
          <p>锁定本次文本生成的视觉基调，后续人物模型、场景模型、分镜和视频 Prompt 会沿用这个方向。</p>
        </div>
        <div className="visual-style-grid">
          {visualStylePresets.map((option) => {
            const active = option.id === visualStyleId;
            const hasThumbnail = Boolean(option.thumbnail && !failedStyleImages[option.id]);
            return (
              <button
                type="button"
                key={option.id}
                className={`visual-style-card preview-${option.preview}${hasThumbnail ? " has-thumbnail" : ""}${
                  active ? " active" : ""
                }`}
                style={
                  {
                    "--style-accent": option.accent,
                    "--style-ink": option.ink
                  } as CSSProperties
                }
                onClick={() => selectVisualStyle(option.id)}
                disabled={busy}
                aria-pressed={active}
              >
                <span className={`visual-style-thumb${hasThumbnail ? " has-image" : ""}`} aria-hidden="true">
                  {hasThumbnail ? (
                    <img
                      src={option.thumbnail}
                      alt=""
                      loading={active ? "eager" : "lazy"}
                      decoding="async"
                      width={180}
                      height={120}
                      onError={() =>
                        setFailedStyleImages((current) => ({
                          ...current,
                          [option.id]: true
                        }))
                      }
                    />
                  ) : (
                    <>
                      <i />
                      <b />
                    </>
                  )}
                </span>
                <span className="visual-style-copy">
                  <strong>{option.label}</strong>
                  <small>{option.sub}</small>
                </span>
                {active ? (
                  <em aria-label="已选择">
                    <Check size={14} />
                  </em>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <div className="text-creation-layout">
        {mode === "brief" ? (
          <section className="brief-node-grid" aria-label="无现成小说模式输入项">
            {briefInputSections.map((item) => {
              const Icon = item.icon;
              const status = getSectionStatus(item.key);
              const body = getSectionBody(item.key);
              return (
                <button
                  type="button"
                  className={`brief-node-card status-${status}`}
                  key={item.key}
                  onClick={() => openModal(item.key)}
                >
                  <header>
                    <div>
                      <strong>{item.label}</strong>
                      <small>{item.sub}</small>
                    </div>
                    <span>{item.code}</span>
                  </header>
                  <div className="brief-node-preview">
                    <Icon size={26} />
                    <p>{body || item.placeholder}</p>
                  </div>
                  <em>{status === "ready" ? "ready" : "idle"}</em>
                </button>
              );
            })}
          </section>
        ) : (
          <article className="content-card source-import-card source-mode-panel">
            <div className="source-import-heading">
              <div>
                <label>小说 / 文档导入</label>
                <p>上传文档文件，或直接粘贴小说正文。系统会从原文中提取世界观、角色和剧情推进，并生成后续剧本与 Seedance 分镜脚本。</p>
              </div>
              <span>{activeTextModel.label}</span>
            </div>
            <div className="source-import-actions">
              <label className="source-file-button">
                <Upload size={16} />
                上传文档
                <input
                  type="file"
                  accept={SOURCE_IMPORT_ACCEPT}
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    if (file && file.size > SOURCE_IMPORT_MAX_FILE_BYTES) {
                      onAssistantMessage("文档超过 8MB，请拆分后上传，或先粘贴关键章节文本。");
                      event.currentTarget.value = "";
                      return;
                    }
                    setSourceFile(file);
                  }}
                />
              </label>
              <span>{sourceFile ? sourceFile.name : "支持 txt / md / docx，也可直接粘贴正文"}</span>
            </div>
            <textarea
              className="source-import-textarea source-novel-textarea"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder="在这里粘贴小说正文、章节内容或完整故事文本。"
            />
          </article>
        )}

        <article className="content-card script-generation-card">
          <div className="script-generation-header">
            <div>
              <label>Seedance 2.0 分镜脚本</label>
              <p>这是两种模式生成后的统一输出区。你可以直接编辑，再进入 Flow Map 生成视频。</p>
            </div>
            <button
              type="button"
              className={busy ? "danger-button" : "primary-button"}
              disabled={!busy && (mode === "brief" ? !canGenerateFromBrief : !canGenerateFromSource)}
              onClick={generateFromCurrentMode}
            >
              {busy ? <X size={17} /> : <Sparkles size={17} />}
              {busy
                ? "取消生成"
                : mode === "brief"
                  ? "生成 Seedance 分镜脚本"
                  : "用小说生成分镜脚本"}
            </button>
          </div>
          {busy && generationStartedAt ? (
            <div className="text-generation-progress" role="status" aria-live="polite">
              <div>
                <strong>{generationDetail || "正在生成文本内容..."}</strong>
                <span>{formatElapsedSeconds(elapsedSeconds)}</span>
              </div>
              <p>{buildGenerationHint(mode, activeTextModel.label, elapsedSeconds)}</p>
            </div>
          ) : generationError ? (
            <div className="text-generation-progress text-generation-progress-error" role="alert">
              <div>
                <strong>{generationError}</strong>
                <span>failed</span>
              </div>
              <p>这次生成没有写入分镜脚本。请保留当前小说正文后重试；如果后端稍后完成，刷新项目会自动显示已保存结果。</p>
            </div>
          ) : mode === "source" && canGenerateFromSource ? (
            <div className={`text-generation-progress text-generation-progress-idle${isLongSourceInput ? " is-long" : ""}`}>
              <div>
                <strong>{isLongSourceInput ? "长篇导入会比普通文本更久" : "准备好后可开始生成"}</strong>
                <span>{sourceFile ? `${sourceFileSizeMb.toFixed(1)} MB` : `${sourceInputCharacters.toLocaleString()} 字`}</span>
              </div>
              <p>
                {isLongSourceInput
                  ? "系统会把长篇压缩成可编辑的 15 秒片段第一版；需要更细时可拆分章节继续导入。"
                  : "系统会基于导入内容直接生成世界观、人物、分镜和 Seedance 2.0 分镜脚本。"}
              </p>
            </div>
          ) : null}
          <textarea
            className="script-textarea script-output-textarea"
            value={draft.storyState.seedanceScript}
            onChange={(event) =>
              updateProject({
                ...draft,
                storyState: { ...draft.storyState, seedanceScript: event.target.value }
              })
            }
            placeholder="生成后会在这里显示 Seedance 2.0 分镜脚本。也可以手动粘贴或修改。"
          />
        </article>

      </div>

      {activeModal && activeMeta ? (
        <div className="text-input-modal-backdrop" onClick={closeModal}>
          <section
            className="text-input-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="text-input-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>{activeMeta.code}</span>
                <h2 id="text-input-modal-title">{activeMeta.label}</h2>
                <p>{activeMeta.sub}</p>
              </div>
              <button type="button" className="workflow-dialog-close" onClick={closeModal} aria-label="关闭输入弹窗">
                <X size={18} />
              </button>
            </header>
            {activeModal === "world" ? (
              <input
                value={modalTitle}
                onChange={(event) => setModalTitle(event.target.value)}
                placeholder="世界观标题，例如：第十三层档案馆"
              />
            ) : null}
            <textarea
              value={modalValue}
              onChange={(event) => setModalValue(event.target.value)}
              placeholder={activeMeta.placeholder}
              autoFocus
            />
            <div className="text-input-modal-actions">
              <button type="button" className="secondary-button" onClick={closeModal}>
                取消
              </button>
              <button type="button" className="primary-button" disabled={busy || !modalValue.trim()} onClick={applyModalInput}>
                <Sparkles size={17} />
                保存输入
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function formatElapsedSeconds(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function buildGenerationHint(mode: TextCreationMode, modelLabel: string, seconds: number): string {
  if (mode !== "source") {
    return "正在等待模型返回结构化 JSON。完成后会自动刷新文本结果。";
  }

  if (seconds >= 360) {
    return `${modelLabel} 长篇处理已经超过 6 分钟，系统仍在等待模型或后端兜底结果；如果最终超时，会给出明确错误提示。`;
  }

  if (seconds >= 180) {
    return `${modelLabel} 仍在分析长文本。完整小说会先清洗作者互动、抽取人物和关键剧情，再生成 15 秒分段。`;
  }

  if (seconds >= 60) {
    return "长篇小说生成不是卡死，通常会持续数分钟；请不要重复点击或刷新页面。";
  }

  return "请求已提交，页面保持打开即可；国内网络环境下长文本模型调用可能需要等待一段时间。";
}
