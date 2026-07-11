import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Cpu, Download, ImageIcon, Maximize2, Palette, Ratio, Sparkles, Wand2, X } from "lucide-react";
import type { MediaAsset } from "@/types/domain";
import { useI18n } from "../../i18n/I18nProvider";

type GenerationKind = "character" | "scene" | "imagePrompt";

type AIImageGenerationPanelProps = {
  kind: GenerationKind;
  title: string;
  description: string;
  status: string;
  promptLabel: string;
  prompt: string;
  promptPlaceholder?: string;
  promptReadOnly?: boolean;
  helperText?: string;
  keywords?: string[];
  candidates: MediaAsset[];
  confirmedImageId?: string;
  aspectRatio?: string;
  isLoading?: boolean;
  loadingProgress?: number;
  error?: string;
  generationCostLabel?: string;
  getDownloadUrl?: (asset: MediaAsset) => string;
  onPromptChange?: (value: string) => void;
  onPromptBlur?: (value: string) => void;
  onAspectRatioChange?: (value: string) => void;
  onGenerate: () => void;
  onCancel?: () => void;
  onConfirm: (assetId: string) => void;
};

const aspectRatioOptions = [
  { value: "2:3", characterLabel: "2:3 角色设定", sceneLabel: "2:3 竖构图" },
  { value: "3:4", characterLabel: "3:4 人物立绘", sceneLabel: "3:4 竖版场景" },
  { value: "1:1", characterLabel: "1:1 方形头像", sceneLabel: "1:1 方形场景" },
  { value: "4:3", characterLabel: "4:3 半身构图", sceneLabel: "4:3 场景基底" },
  { value: "16:9", characterLabel: "16:9 横版群像", sceneLabel: "16:9 场景基底" },
  { value: "9:16", characterLabel: "9:16 竖屏全身", sceneLabel: "9:16 竖屏场景" },
  { value: "21:9", characterLabel: "21:9 超宽横版", sceneLabel: "21:9 超宽场景" },
  { value: "9:21", characterLabel: "9:21 超高竖版", sceneLabel: "9:21 超高竖屏" }
];

export function AIImageGenerationPanel({
  kind,
  title,
  description,
  status,
  promptLabel,
  prompt,
  promptPlaceholder,
  promptReadOnly = false,
  helperText,
  keywords = [],
  candidates,
  confirmedImageId,
  aspectRatio,
  isLoading = false,
  loadingProgress,
  error,
  generationCostLabel,
  getDownloadUrl,
  onPromptChange,
  onPromptBlur,
  onAspectRatioChange,
  onGenerate,
  onCancel,
  onConfirm
}: AIImageGenerationPanelProps) {
  const { t } = useI18n();
  const hasCandidates = candidates.length > 0;
  const accent = kind === "character" ? "from-fuchsia-500 to-violet-500" : "from-cyan-500 to-blue-500";
  const [progress, setProgress] = useState(0);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const displayedProgress = loadingProgress ?? progress;
  const loadingText =
    kind === "character"
      ? t("正在创建人物模型...")
      : kind === "imagePrompt"
        ? t("正在创建 Image Prompt 参考图...")
        : t("正在创建场景模型...");
  const selectedAspectRatio = aspectRatio || (kind === "character" ? "3:4" : "16:9");
  const badgeLabel = kind === "character" ? t("人物模型图") : kind === "imagePrompt" ? t("Image Prompt 图") : t("场景模型图");

  useEffect(() => {
    if (!isLoading) {
      setProgress(0);
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => Math.min(92, current + 2.4));
    }, 120);

    return () => window.clearInterval(timer);
  }, [isLoading]);

  useEffect(() => {
    if (!previewAsset) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreviewAsset(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewAsset]);

  useEffect(() => {
    if (previewAsset && !candidates.some((asset) => asset.id === previewAsset.id)) {
      setPreviewAsset(null);
    }
  }, [candidates, previewAsset]);

  const previewAssetIndex = previewAsset ? candidates.findIndex((asset) => asset.id === previewAsset.id) : -1;
  const previewSelected = previewAsset ? previewAsset.id === confirmedImageId : false;

  return (
    <>
    <article className="ai-gen-panel overflow-visible rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-[0_10px_34px_rgba(24,20,16,0.12)]">
      <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
              {badgeLabel}
            </span>
            <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">{t(status)}</span>
          </div>
          <h2 className="m-0 text-xl font-semibold text-zinc-950">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">{description}</p>
        </div>
        {confirmedImageId ? <CheckCircle2 className="mt-1 size-5 shrink-0 text-emerald-600" /> : <ImageIcon className="mt-1 size-5 shrink-0 text-zinc-400" />}
      </div>

      <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(320px,1.08fr)]">
        <div
          className="flex min-w-0 flex-col gap-4"
        >
          <div className="rounded-xl bg-zinc-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-600">
                <Wand2 className="size-4" />
                <span>{promptLabel}</span>
              </div>
              <span className="text-xs text-zinc-400">Seedance 2.0</span>
            </div>
            <textarea
              value={prompt}
              readOnly={promptReadOnly}
              onChange={(event) => onPromptChange?.(event.target.value)}
              onBlur={(event) => onPromptBlur?.(event.target.value)}
              placeholder={promptPlaceholder}
              className="min-h-[132px] w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-3 text-sm leading-6 text-zinc-900 outline-none transition focus:border-zinc-900 read-only:bg-zinc-100"
            />
            {helperText && <p className="mt-2 text-xs leading-5 text-zinc-500">{helperText}</p>}
          </div>

          {keywords.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {keywords.map((keyword) => (
                <span key={keyword} className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-500">
                  {keyword}
                </span>
              ))}
            </div>
          )}

          <div className="grid gap-2 rounded-xl bg-zinc-50 p-3">
            <SettingRow icon={<Cpu className="size-4" />} label={t("生成模型")} value="Seedance 2.0 Image" />
            <SettingRow icon={<ImageIcon className="size-4" />} label={t("候选数量")} value={t("一次生成 3 张")} />
            <SettingSelect
              icon={<Ratio className="size-4" />}
              label={t("画幅建议")}
              value={selectedAspectRatio}
              options={aspectRatioOptions.map((option) => ({
                value: option.value,
                label: t(kind === "character" ? option.characterLabel : option.sceneLabel)
              }))}
              onChange={onAspectRatioChange}
            />
            <SettingRow icon={<Palette className="size-4" />} label={t("风格锁定")} value={t("2D 半写实国漫")} />
          </div>

          <button
            type="button"
            disabled={isLoading && !onCancel}
            onClick={isLoading ? onCancel : onGenerate}
            className={
              isLoading
                ? "flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-70"
                : `flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r ${accent} text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-70`
            }
          >
            {isLoading ? <X className="size-4" /> : <Sparkles className="size-4" />}
            {isLoading ? t("取消生成") : `${t("生成 3 张候选图")}${generationCostLabel ? ` · ${generationCostLabel}` : ""}`}
          </button>
        </div>

        <div className="min-w-0 rounded-xl bg-zinc-50 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="m-0 text-sm font-semibold text-zinc-900">{t("候选图选择")}</h3>
              <p className="mt-1 text-xs text-zinc-500">{t("选择一张作为后续视频生成的确认模型图。")}</p>
            </div>
          </div>

          {isLoading && (
            <GenerationLoadingState text={loadingText} progress={displayedProgress} />
          )}

          {!isLoading && !hasCandidates && (
            <div className="grid min-h-[260px] place-items-center rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center">
              <div>
                <ImageIcon className="mx-auto size-9 text-zinc-300" />
                <p className="mt-3 text-sm font-medium text-zinc-700">{t("还没有候选图")}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">{t("确认 Prompt 后点击生成，系统会一次返回 3 张可选图片。")}</p>
              </div>
            </div>
          )}

          {!isLoading && hasCandidates && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {candidates.map((asset, index) => {
                const selected = asset.id === confirmedImageId;
                return (
                  <div
                    key={asset.id}
                    className={`group overflow-hidden rounded-xl border bg-white text-left transition ${
                      selected ? "border-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.18)]" : "border-zinc-200 hover:border-zinc-400"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewAsset(asset)}
                      className="candidate-image-preview-button relative aspect-[3/4] bg-zinc-100"
                      aria-label={t("查看 {title} 方案 {index} 大图", { title, index: index + 1 })}
                    >
                      <img src={asset.url} alt={`${title} candidate ${index + 1}`} className="size-full object-cover" />
                      <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs font-medium text-white">
                        {t("方案 {index}", { index: index + 1 })}
                      </span>
                      <span className="candidate-image-preview-hint">
                        <Maximize2 className="size-3.5" />
                        {t("查看大图")}
                      </span>
                    </button>
                    <div className="grid gap-2 p-3">
                      <button
                        type="button"
                        onClick={() => onConfirm(asset.id)}
                        className="flex h-9 items-center justify-between gap-2 rounded-lg bg-zinc-100 px-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-200"
                      >
                        <span>{selected ? t("已确认") : t("确认这张")}</span>
                        {selected && <CheckCircle2 className="size-4 text-emerald-600" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewAsset(asset)}
                        className="flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
                      >
                        <Maximize2 className="size-4" />
                        {t("查看大图")}
                      </button>
                      {getDownloadUrl && (
                        <a
                          href={getDownloadUrl(asset)}
                          className="flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
                        >
                          <Download className="size-4" />
                          {t("存到本地")}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && status === "failed" && (
            <div title={error} className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">
              <AlertCircle className="size-4" />
              <span className="min-w-0 break-words">
                {error ? t(error) : t("生成失败，请检查图片模型配置后重试。")}
              </span>
            </div>
          )}
        </div>
      </div>
    </article>

    {previewAsset && (
      <div className="image-preview-backdrop" onClick={() => setPreviewAsset(null)}>
        <section
          className="image-preview-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={t("{title} 方案 {index} 大图预览", { title, index: previewAssetIndex + 1 })}
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <span>{kind === "character" ? t("人物模型大图") : kind === "imagePrompt" ? t("Image Prompt 大图") : t("场景模型大图")}</span>
              <h3>{title} · {t("方案 {index}", { index: previewAssetIndex + 1 })}</h3>
            </div>
            <button type="button" onClick={() => setPreviewAsset(null)} aria-label={t("关闭大图预览")}>
              <X size={18} />
            </button>
          </header>
          <div className="image-preview-frame">
            <img src={previewAsset.url} alt={t("{title} 方案 {index} 大图", { title, index: previewAssetIndex + 1 })} />
          </div>
          <footer>
            <button
              type="button"
              disabled={previewSelected}
              onClick={() => {
                onConfirm(previewAsset.id);
                setPreviewAsset(null);
              }}
            >
              {previewSelected ? t("已确认这张") : t("确认这张")}
            </button>
            {getDownloadUrl && (
              <a href={getDownloadUrl(previewAsset)}>
                <Download className="size-4" />
                {t("存到本地")}
              </a>
            )}
          </footer>
        </section>
      </div>
    )}
    </>
  );
}

function GenerationLoadingState({ text, progress }: { text: string; progress: number }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-[300px] place-items-center rounded-xl border border-zinc-200 bg-white px-8 py-10">
      <div className="w-full max-w-[360px] text-center">
        <div className="mx-auto mb-6 size-20 rounded-full border-[6px] border-zinc-100 border-t-fuchsia-500 border-r-violet-500 animate-spin" />
        <p className="text-base font-medium text-zinc-800">{text}</p>
        <p className="mt-2 text-sm text-zinc-500">{t("通常需要 10–15 秒")}</p>
        <div className="relative mt-6 h-2 overflow-hidden rounded-full bg-zinc-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-violet-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
          <div className="generation-progress-sweep" />
        </div>
      </div>
    </div>
  );
}

function SettingRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <span>{label}</span>
      </div>
      <span className="text-right font-medium text-zinc-800">{value}</span>
    </div>
  );
}

function SettingSelect({
  icon,
  label,
  value,
  options,
  onChange
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value) || options[0];

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <div className="flex items-center gap-2 text-zinc-500">
        {icon}
        <span>{label}</span>
      </div>
      <div className="relative min-w-[176px]">
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white px-2 text-sm font-medium text-zinc-800 outline-none transition hover:border-zinc-400 focus:border-zinc-900"
        >
          <span className="truncate">{selectedOption?.label}</span>
          <span className={`text-zinc-400 transition ${open ? "rotate-180" : ""}`}>⌄</span>
        </button>

        {open && (
          <div className="absolute bottom-[calc(100%+6px)] right-0 z-[80] max-h-[260px] w-full overflow-y-auto rounded-xl border border-white/12 bg-[#20182b] shadow-2xl">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange?.(option.value);
                    setOpen(false);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm transition ${
                    selected ? "bg-violet-600 text-white" : "bg-[#20182b] text-white hover:bg-[#30243f]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
