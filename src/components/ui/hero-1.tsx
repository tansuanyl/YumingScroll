import * as React from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, KeyRound, Loader2, Paperclip, Sparkles } from "lucide-react";
import type { TextModelSelection } from "../../lib/apiClient";
import { PROVIDER_CONFIGURATION_GUIDE_URL, type ProviderReadiness } from "../../lib/providerReadiness";
import { SOURCE_IMPORT_ACCEPT } from "../../lib/sourceImportFile";
import { BrandMark } from "../BrandMark";
import { LanguageSwitcher } from "../LanguageSwitcher";
import { useI18n } from "../../i18n/I18nProvider";

type Hero1Props = {
  isLoading?: boolean;
  errorMessage?: string | null;
  currentProjectTitle?: string;
  selectedTextModel: TextModelSelection;
  providerReadiness?: ProviderReadiness | null;
  onTextModelChange: (model: TextModelSelection) => void;
  onOpenWorkbench?: () => void;
  onSubmit: (prompt: string) => void;
  onImportSourceFile?: (file: File) => void;
};

const textModelOptions: Array<{ value: TextModelSelection; label: string; sub: string }> = [
  { value: "gpt-5.5", label: "GPT-5.5", sub: "Quality / OpenAI" },
  { value: "kimi-k2.6", label: "Kimi K2.6", sub: "Cost / Moonshot" }
];

const Hero1 = ({
  isLoading = false,
  errorMessage = null,
  currentProjectTitle,
  selectedTextModel,
  providerReadiness,
  onTextModelChange,
  onOpenWorkbench,
  onSubmit,
  onImportSourceFile
}: Hero1Props) => {
  const { t } = useI18n();
  const [prompt, setPrompt] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const sourceFileInputRef = React.useRef<HTMLInputElement>(null);
  const generationBlocked = providerReadiness?.blockTextGeneration === true;
  const ProviderIcon =
    providerReadiness?.tone === "ready"
      ? CheckCircle2
      : providerReadiness?.tone === "blocked"
        ? KeyRound
        : AlertTriangle;
  const suggestions = [
    t("悬疑短剧：失踪刑警进入不存在的第十三层档案馆"),
    t("赛博朋克恋爱：雨夜芯片唤醒两人的共同记忆"),
    t("都市怪谈：深夜末班车出现不存在的第七名乘客"),
    t("国漫悬疑：旧警局档案楼里的红色 13 按钮"),
    t("双男主追逃：宿敌在副本中发现被删除的过去")
  ];

  function submit(nextPrompt = prompt) {
    const value = nextPrompt.trim();
    if (!value || isLoading || generationBlocked) return;
    onSubmit(value);
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0c0414] text-white">
      <div className="absolute inset-0 z-0">
        <div className="absolute left-[-16rem] top-[12rem] h-[30rem] w-[30rem] rounded-full bg-fuchsia-600/20 blur-[7rem]" />
        <div className="absolute right-[-18rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-blue-400/20 blur-[7rem]" />
        <div className="absolute bottom-[-20rem] left-[28%] h-[38rem] w-[38rem] rounded-full bg-violet-500/20 blur-[8rem]" />
        <div className="absolute right-[-28rem] top-[-42rem] flex rotate-[-20deg] skew-x-[-40deg] gap-[10rem] opacity-45 blur-[4rem]">
          <div className="h-[30rem] w-[10rem] bg-gradient-to-r from-white to-blue-300" />
          <div className="h-[30rem] w-[10rem] bg-gradient-to-r from-white to-blue-300" />
          <div className="h-[30rem] w-[10rem] bg-gradient-to-r from-white to-blue-300" />
        </div>
      </div>

      <header className="relative z-30 flex items-center justify-between gap-4 p-6">
        <BrandMark className="hero-brand-mark" />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onOpenWorkbench ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              onClick={onOpenWorkbench}
              aria-label={currentProjectTitle ? t("进入当前项目文本创作工作台") : t("进入文本创作工作台")}
            >
              <FileText className="size-4" />
              <span>{t("文本创作工作台")}</span>
            </button>
          ) : null}
          <LanguageSwitcher className="hero-language-switcher" />
          <button
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-gray-200"
            onClick={() => inputRef.current?.focus()}
          >
            {t("开始创作")}
          </button>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-14 text-center">
        <div className="mx-auto w-full max-w-4xl space-y-7">
          <div className="flex justify-center">
            <div className="w-fit rounded-full bg-[#1c1528] px-4 py-2 text-xs text-white/80 ring-1 ring-white/10">
              {t("从一个想法开始，生成文本、模型图和视频 Flow Map")}
            </div>
          </div>

          <h1 className="text-4xl font-bold leading-tight sm:text-6xl">
            {t("输入你的漫剧初想法")}
            <br />
            {t("让 AI 生成第一版创作工作台")}
          </h1>

          <p className="mx-auto max-w-2xl text-base leading-7 text-white/68">
            {t("描述题材、人物关系、核心悬念或画面风格。系统会先进入文本创作页，生成世界观、剧情大纲、分镜和 Seedance 2.0 分镜脚本。")}
          </p>

          {providerReadiness ? (
            <div
              role={providerReadiness.tone === "blocked" ? "alert" : "status"}
              className={[
                "mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-lg border px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between",
                providerReadiness.tone === "blocked"
                  ? "border-red-400/40 bg-red-500/12 text-red-50"
                  : providerReadiness.tone === "warning"
                    ? "border-amber-300/35 bg-amber-400/10 text-amber-50"
                    : "border-emerald-300/30 bg-emerald-400/10 text-emerald-50"
              ].join(" ")}
            >
              <div className="flex min-w-0 gap-3">
                <ProviderIcon className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0">
                  <strong className="block text-sm leading-5">{providerReadiness.title}</strong>
                  <p className="mt-1 text-xs leading-5 text-current/75">{providerReadiness.detail}</p>
                </div>
              </div>
              <a
                className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-current underline decoration-current/35 underline-offset-4 hover:decoration-current"
                href={PROVIDER_CONFIGURATION_GUIDE_URL}
                target="_blank"
                rel="noreferrer"
              >
                {t("配置指南")}
                <ExternalLink className="size-3.5" />
              </a>
            </div>
          ) : null}

          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-center rounded-full bg-[#1c1528] p-3 shadow-[0_18px_60px_rgba(0,0,0,0.35)] ring-1 ring-white/10">
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full text-gray-400 transition hover:bg-[#2a1f3d]"
                disabled={isLoading || generationBlocked}
                onClick={() => sourceFileInputRef.current?.click()}
                aria-label={t("导入小说或文本文件")}
              >
                <Paperclip className="size-5" />
              </button>
              <input
                ref={sourceFileInputRef}
                type="file"
                className="hidden"
                accept={SOURCE_IMPORT_ACCEPT}
                disabled={isLoading || generationBlocked}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) onImportSourceFile?.(file);
                  event.currentTarget.value = "";
                }}
              />
              <button
                type="button"
                className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-purple-500 px-3 text-xs font-semibold text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-70"
                onClick={() => submit()}
                disabled={isLoading || generationBlocked}
                aria-label={generationBlocked ? t("请先配置所选文本模型 API Key") : t("生成初版文本")}
              >
                {isLoading ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : generationBlocked ? (
                  <KeyRound className="size-5" />
                ) : (
                  <Sparkles className="size-5" />
                )}
                <span className="hidden sm:inline">
                  {isLoading ? t("生成中") : generationBlocked ? t("请先配置 API") : t("生成初版")}
                </span>
              </button>
              <input
                ref={inputRef}
                type="text"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                }}
                disabled={isLoading}
                placeholder={t("例如：第十三层档案馆，前刑警寻找失踪妹妹，进入不存在的楼层")}
                className="min-w-0 flex-1 bg-transparent pl-4 text-sm text-gray-200 outline-none placeholder:text-gray-500 sm:text-base"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">Text Model</span>
              {textModelOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onTextModelChange(option.value)}
                  className={[
                    "grid min-w-32 rounded-full px-4 py-2 text-left text-xs transition ring-1",
                    selectedTextModel === option.value
                      ? "bg-white text-black ring-white"
                      : "bg-[#1c1528] text-white/78 ring-white/10 hover:bg-[#2a1f3d]"
                  ].join(" ")}
                >
                  <strong className="text-sm leading-5">{option.label}</strong>
                  <small className={selectedTextModel === option.value ? "text-black/55" : "text-white/45"}>
                    {t(option.sub)}
                  </small>
                </button>
              ))}
            </div>
            {isLoading && (
              <div className="mt-5 rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                <div className="mx-auto mb-3 size-12 rounded-full border-4 border-white/10 border-t-fuchsia-400 border-r-violet-400 animate-spin" />
                <p className="text-sm font-medium text-white/85">{t("正在生成初版文本创作内容...")}</p>
                <p className="mt-1 text-xs text-white/50">{t("完成后会自动进入文本创作页。")}</p>
                <div className="relative mx-auto mt-4 h-1.5 max-w-sm overflow-hidden rounded-full bg-white/15">
                  <div className="generation-progress-sweep" />
                </div>
              </div>
            )}
            {!isLoading && errorMessage && (
              <div className="mt-5 rounded-2xl border border-red-400/35 bg-red-500/10 px-4 py-3 text-left text-sm leading-6 text-red-100">
                {errorMessage}
              </div>
            )}
          </div>

          <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-2 pt-5">
            {suggestions.map((item) => (
              <button
                key={item}
                type="button"
                className="rounded-full bg-[#1c1528] px-4 py-2 text-sm text-white/82 transition hover:bg-[#2a1f3d]"
                disabled={isLoading}
                onClick={() => {
                  setPrompt(item);
                  submit(item);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export { Hero1 };
