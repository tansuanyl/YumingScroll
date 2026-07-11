import type { MediaProviderStatus, TextModelSelection, TextProviderStatus } from "./apiClient";

export const PROVIDER_CONFIGURATION_GUIDE_URL =
  "https://github.com/tansuanyl/YumingScroll#配置真实-ai-服务";

export type ProviderStatusSnapshot = {
  text: TextProviderStatus;
  media: MediaProviderStatus;
};

export type ProviderReadiness = {
  tone: "ready" | "warning" | "blocked";
  title: string;
  detail: string;
  blockTextGeneration: boolean;
};

const MODEL_LABELS: Record<TextModelSelection, string> = {
  "gpt-5.5": "GPT-5.5",
  "kimi-k2.6": "Kimi K2.6"
};

export function getProviderReadiness(
  snapshot: ProviderStatusSnapshot | null,
  selectedModel: TextModelSelection
): ProviderReadiness | null {
  if (!snapshot) return null;

  const selectedTextModelReady =
    snapshot.text.mode === "mock" ||
    (snapshot.text.mode === "live" && snapshot.text.configuredModels.includes(selectedModel));

  if (!selectedTextModelReady) {
    return {
      tone: "blocked",
      title: `${MODEL_LABELS[selectedModel]} 尚未配置`,
      detail: "请先在服务端配置所选文本模型的 Provider Key 并重启 API。密钥不应填写在浏览器或任何公开环境变量中。",
      blockTextGeneration: true
    };
  }

  if (snapshot.text.mode === "mock" || snapshot.media.mode === "mock") {
    return {
      tone: "warning",
      title: "当前为 Mock 演示模式",
      detail: "Mock 输出只用于验证界面和工作流，不代表真实模型效果。评估生成质量前，请关闭 Mock 并配置文本与媒体 Provider API Key。",
      blockTextGeneration: false
    };
  }

  if (snapshot.media.mode !== "live") {
    return {
      tone: "warning",
      title: "图片与视频 Provider 尚未配置",
      detail: "文本生成已经可用，但后续图片和视频会无法生成。请先在服务端配置媒体 Provider Key 并重启 API。",
      blockTextGeneration: false
    };
  }

  return {
    tone: "ready",
    title: "真实 AI Provider 已就绪",
    detail: "文本、图片和视频生成将调用服务端 Provider；API Key 只保存在服务端环境变量中。",
    blockTextGeneration: false
  };
}
