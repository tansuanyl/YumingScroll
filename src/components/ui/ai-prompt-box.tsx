import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUp, Paperclip, Square, X, Mic, Globe, BrainCog, FolderCode, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "../../i18n/I18nProvider";

const cn = (...classes: Array<string | undefined | null | false>) => classes.filter(Boolean).join(" ");

type PromptMode = "search" | "think" | "canvas" | null;

type PromptInputBoxProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  onSend?: (message: string, files?: File[]) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  minHeight?: number;
  maxHeight?: number;
  clearOnSend?: boolean;
  submitTooltip?: string;
  submitLabel?: string;
  attachTooltip?: string;
};

export const PromptInputBox = React.forwardRef<HTMLDivElement, PromptInputBoxProps>(
  (
    {
      value,
      onValueChange,
      onSend = () => {},
      isLoading = false,
      placeholder,
      className,
      disabled = false,
      minHeight = 76,
      maxHeight = 420,
      clearOnSend = true,
      submitLabel,
      submitTooltip,
      attachTooltip
    },
    ref
  ) => {
    const { t } = useI18n();
    const [internalValue, setInternalValue] = React.useState(value || "");
    const [files, setFiles] = React.useState<File[]>([]);
    const [filePreview, setFilePreview] = React.useState<string | null>(null);
    const [selectedImage, setSelectedImage] = React.useState<string | null>(null);
    const [mode, setMode] = React.useState<PromptMode>(null);
    const uploadInputRef = React.useRef<HTMLInputElement>(null);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const currentValue = value ?? internalValue;
    const locked = disabled || isLoading;
    const resolvedPlaceholder = placeholder || t("输入提示词...");
    const resolvedSubmitTooltip = submitTooltip || t("发送给大模型");
    const resolvedAttachTooltip = attachTooltip || t("上传图片");

    const resizeTextarea = React.useCallback(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = "auto";
      const nextHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = `${nextHeight}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [maxHeight, minHeight]);

    React.useLayoutEffect(() => {
      resizeTextarea();
    }, [currentValue, resizeTextarea]);

    function updateValue(nextValue: string) {
      setInternalValue(nextValue);
      onValueChange?.(nextValue);
    }

    function processFile(file: File) {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 10 * 1024 * 1024) return;
      setFiles([file]);
      const reader = new FileReader();
      reader.onload = (event) => setFilePreview(event.target?.result as string);
      reader.readAsDataURL(file);
    }

    function submit() {
      if (!currentValue.trim() && files.length === 0) return;
      const prefix = mode === "search" ? "[Search] " : mode === "think" ? "[Think] " : mode === "canvas" ? "[Canvas] " : "";
      onSend(`${prefix}${currentValue}`.trim(), files);
      if (clearOnSend) updateValue("");
      setFiles([]);
      setFilePreview(null);
    }

    function toggleMode(nextMode: Exclude<PromptMode, null>) {
      setMode((current) => (current === nextMode ? null : nextMode));
    }

    function handleDrop(event: React.DragEvent<HTMLDivElement>) {
      event.preventDefault();
      const imageFile = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
      if (imageFile) processFile(imageFile);
    }

    const hasContent = currentValue.trim().length > 0 || files.length > 0;

    return (
      <TooltipPrimitive.Provider>
        <div
          ref={ref}
          className={cn(
            "w-full rounded-3xl border border-[#3f3f46] bg-[#1f2023] p-2 text-gray-100 shadow-[0_10px_32px_rgba(0,0,0,0.22)] transition-all",
            isLoading && "border-red-500/70",
            locked && "opacity-80",
            className
          )}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          {filePreview && (
            <div className="flex pb-2">
              <button
                type="button"
                className="group relative size-16 overflow-hidden rounded-xl"
                onClick={() => setSelectedImage(filePreview)}
              >
                <img src={filePreview} alt={t("上传图片预览")} className="size-full object-cover" />
                <span
                  className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/70"
                  onClick={(event) => {
                    event.stopPropagation();
                    setFiles([]);
                    setFilePreview(null);
                  }}
                >
                  <X className="size-3 text-white" />
                </span>
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={currentValue}
            disabled={locked}
            placeholder={
              mode === "search"
                ? t("联网搜索式提示词...")
                : mode === "think"
                  ? t("深度推理式提示词...")
                  : mode === "canvas"
                    ? t("画布创作式提示词...")
                    : resolvedPlaceholder
            }
            onChange={(event) => {
              updateValue(event.target.value);
              requestAnimationFrame(resizeTextarea);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            className="w-full resize-none border-0 bg-transparent px-3 py-2.5 text-base leading-7 text-gray-100 outline-none placeholder:text-gray-400 disabled:cursor-not-allowed"
            style={{ minHeight, maxHeight }}
            rows={1}
          />

          <div className="flex items-center justify-between gap-2 pt-2">
            <div className="flex min-w-0 items-center gap-1">
              <TooltipButton label={resolvedAttachTooltip}>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-full text-gray-400 transition-colors hover:bg-gray-600/30 hover:text-gray-200 disabled:cursor-not-allowed"
                  disabled={locked}
                  onClick={() => uploadInputRef.current?.click()}
                >
                  <Paperclip className="size-5" />
                  <input
                    ref={uploadInputRef}
                    type="file"
                    className="hidden"
                    accept="image/*"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) processFile(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </button>
              </TooltipButton>

              <ModeButton active={mode === "search"} label="Search" onClick={() => toggleMode("search")}>
                <Globe className="size-4" />
              </ModeButton>
              <ModeButton active={mode === "think"} label="Think" tone="purple" onClick={() => toggleMode("think")}>
                <BrainCog className="size-4" />
              </ModeButton>
              <ModeButton active={mode === "canvas"} label="Canvas" tone="orange" onClick={() => toggleMode("canvas")}>
                <FolderCode className="size-4" />
              </ModeButton>
            </div>

            <TooltipButton label={isLoading ? t("停止生成") : hasContent ? resolvedSubmitTooltip : t("语音输入")}>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  submitLabel ? "w-auto rounded-lg px-3 text-sm font-bold" : "size-8 rounded-full",
                  submitLabel
                    ? "bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-[0_10px_28px_rgba(168,85,247,0.28)] hover:from-fuchsia-600 hover:to-violet-600"
                    : hasContent
                      ? "bg-white text-[#1f2023] hover:bg-white/80"
                      : "bg-transparent text-gray-400 hover:bg-gray-600/30"
                )}
                disabled={locked && !hasContent}
                onClick={submit}
              >
                {isLoading ? (
                  <Square className="size-4 fill-current" />
                ) : submitLabel ? (
                  <Sparkles className="size-4" />
                ) : hasContent ? (
                  <ArrowUp className="size-4" />
                ) : (
                  <Mic className="size-5" />
                )}
                {submitLabel && <span>{submitLabel}</span>}
              </button>
            </TooltipButton>
          </div>
        </div>

        <ImageDialog imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
      </TooltipPrimitive.Provider>
    );
  }
);

PromptInputBox.displayName = "PromptInputBox";

function TooltipButton({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Content
        sideOffset={6}
        className="z-50 rounded-md border border-[#333] bg-[#1f2023] px-3 py-1.5 text-sm text-white shadow-md"
      >
        {label}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Root>
  );
}

function ModeButton({
  active,
  label,
  tone = "blue",
  onClick,
  children
}: {
  active: boolean;
  label: string;
  tone?: "blue" | "purple" | "orange";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeClass =
    tone === "purple"
      ? "border-[#8b5cf6] bg-[#8b5cf6]/15 text-[#a78bfa]"
      : tone === "orange"
        ? "border-[#f97316] bg-[#f97316]/15 text-[#fb923c]"
        : "border-[#1eaedb] bg-[#1eaedb]/15 text-[#38bdf8]";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-1 overflow-hidden rounded-full border px-2 text-gray-400 transition-all hover:text-gray-200",
        active ? activeClass : "border-transparent bg-transparent"
      )}
    >
      <motion.span animate={{ rotate: active ? 360 : 0, scale: active ? 1.08 : 1 }} transition={{ type: "spring", stiffness: 260, damping: 25 }}>
        {children}
      </motion.span>
      <AnimatePresence>
        {active && (
          <motion.span
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="overflow-hidden whitespace-nowrap text-xs"
          >
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

function ImageDialog({ imageUrl, onClose }: { imageUrl: string | null; onClose: () => void }) {
  const { t } = useI18n();
  if (!imageUrl) return null;

  return (
    <DialogPrimitive.Root open={!!imageUrl} onOpenChange={onClose}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[#1f2023] p-0 shadow-xl">
          <DialogPrimitive.Title className="sr-only">{t("图片预览")}</DialogPrimitive.Title>
          <img src={imageUrl} alt={t("完整图片预览")} className="max-h-[80vh] w-full rounded-2xl object-contain" />
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full bg-[#2e3033]/80 p-2 hover:bg-[#2e3033]">
            <X className="size-5 text-gray-200" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
