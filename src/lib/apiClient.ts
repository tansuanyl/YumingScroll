import type { MediaAsset, Project, ProjectSummary, VideoAspectRatio, WorkflowEdge } from "../types/domain";
import type { VisualStylePresetId } from "../data/visualStylePresets";

const jsonHeaders = { "content-type": "application/json" };
const apiBaseUrl = resolveApiBaseUrl();
const TEXT_GENERATION_TIMEOUT_MS = 420_000;
const TEXT_IMPORT_TIMEOUT_MS = 900_000;

export type TextModelSelection = "gpt-5.5" | "kimi-k2.6";
export type ProviderMode = "mock" | "live" | "unconfigured";

export type TextProviderStatus = {
  provider: "openai";
  mode: ProviderMode;
  configured: boolean;
  configuredModels: TextModelSelection[];
  configurationSource: "mock" | "server-env" | "missing";
  model: string;
  availableModels: TextModelSelection[];
  requestTimeoutMs: number;
  fallbackToMockOnTimeout: boolean;
};

export type MediaProviderStatus = {
  provider: "ark" | "fal" | "generic";
  mode: ProviderMode;
  configured: boolean;
  configurationSource: "mock" | "server-env" | "missing";
  baseUrl: string;
  imageModel: string;
  videoModel: string;
  imageApi: "seedream";
  videoApi: "seedance";
};

function resolveApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL || readViteApiBaseUrl();
  if (configuredUrl) {
    const normalizedUrl = configuredUrl.replace(/\/$/, "");
    if (typeof window !== "undefined" && shouldUseSameOriginApiProxy(normalizedUrl, window.location)) {
      return "";
    }
    return normalizedUrl;
  }

  if (
    typeof window !== "undefined" &&
    (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") &&
    window.location.port === "5173"
  ) {
    return "http://127.0.0.1:8787";
  }

  return "";
}

export function shouldUseSameOriginApiProxy(
  configuredUrl: string,
  pageLocation: Pick<Location, "hostname" | "protocol" | "origin">
): boolean {
  try {
    const apiUrl = new URL(configuredUrl, pageLocation.origin);
    const pageIsLocal = isLocalHost(pageLocation.hostname);
    if (!pageIsLocal && isLocalHost(apiUrl.hostname)) return true;
    if (pageLocation.protocol === "https:" && apiUrl.protocol === "http:") return true;
  } catch {
    return false;
  }
  return false;
}

function isLocalHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "0.0.0.0";
}

function readViteApiBaseUrl(): string | undefined {
  return (import.meta as ImportMeta & { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL;
}

type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
  timeoutMessage?: string;
};

type GenerationRequestOptions = {
  signal?: AbortSignal;
  generationRequestId?: string;
};

type ApiRequestError = Error & {
  responseStatus?: number;
  recoverableAfterTimeout?: boolean;
};

async function request<T>(url: string, options?: ApiRequestInit): Promise<T> {
  const { timeoutMs, timeoutMessage, signal, ...fetchOptions } = options || {};
  const controller = timeoutMs || signal ? new AbortController() : undefined;
  const abortFromInputSignal = () => controller?.abort();
  if (signal) {
    if (signal.aborted) {
      controller?.abort();
    } else {
      signal.addEventListener("abort", abortFromInputSignal, { once: true });
    }
  }
  const timeout = timeoutMs
    ? globalThis.setTimeout(() => controller?.abort(), timeoutMs)
    : undefined;

  try {
    const response = await fetch(`${apiBaseUrl}${url}`, {
      ...fetchOptions,
      signal: controller?.signal
    });
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) {
      const responseError = new Error(payload.error || `Request failed: ${response.status}`) as ApiRequestError;
      responseError.name = "ApiResponseError";
      responseError.responseStatus = response.status;
      responseError.recoverableAfterTimeout = isRecoverableProxyResponseError(response.status, responseError.message);
      if (timeoutMessage && isGatewayTimeoutStatus(response.status)) {
        throw createTimeoutError(timeoutMessage, true);
      }
      throw responseError;
    }
    return payload as T;
  } catch (error) {
    if (isAbortError(error)) {
      throw createTimeoutError(timeoutMessage || (timeoutMs ? `Request timed out after ${timeoutMs}ms` : "请求超时，请稍后重试。"), true);
    }
    if (isTimeoutLikeError(error)) {
      throw createTimeoutError(
        timeoutMessage || (timeoutMs ? `Request timed out after ${timeoutMs}ms` : "请求超时，请稍后重试。"),
        isRecoverableTimeoutLikeError(error)
      );
    }
    throw error;
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromInputSignal);
  }
}

function isAbortError(error: unknown): boolean {
  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError";
}

function isTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /APIConnectionTimeoutError|APIConnectionError|timed out|timeout|socket hang up|socket closed|fetch failed|network|getaddrinfo|ECONNRESET|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|UND_ERR_HEADERS_TIMEOUT|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT/i.test(
    `${error.name} ${error.message}`
  );
}

function isGatewayTimeoutStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function createTimeoutError(message: string, recoverableAfterTimeout: boolean): Error {
  const error = new Error(message) as ApiRequestError;
  error.name = "ApiTimeoutError";
  error.recoverableAfterTimeout = recoverableAfterTimeout;
  return error;
}

function isRecoverableTimeoutLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const requestError = error as ApiRequestError;
  if (requestError.recoverableAfterTimeout) return true;
  if (typeof requestError.responseStatus === "number") return false;
  return true;
}

function isRecoverableProxyResponseError(status: number, message: string): boolean {
  if (status === 504) return true;
  if (status === 502) {
    return /API proxy|gateway|网关|timed out|timeout|socket hang up|socket closed|getaddrinfo|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT/i.test(
      message
    );
  }
  return false;
}

export const apiClient = {
  health: () => request<{ ok: boolean }>("/api/health"),
  listProjects: () => request<ProjectSummary[]>("/api/projects"),
  getProject: (projectId: string) => request<Project>(`/api/projects/${projectId}`),
  createProject: (input: { title?: string; inspiration?: string }) =>
    request<Project>("/api/projects", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    }),
  saveProject: (project: Project) =>
    request<Project>(`/api/projects/${project.id}`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(project)
    }),
  createWorkflowEdge: (projectId: string, edge: Omit<WorkflowEdge, "id" | "createdAt" | "updatedAt"> & { id?: string }) =>
    request<WorkflowEdge>(`/api/projects/${projectId}/workflow-edges`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(edge)
    }),
  deleteWorkflowEdge: (projectId: string, edgeId: string) =>
    request<Record<string, never>>(`/api/projects/${projectId}/workflow-edges/${edgeId}`, {
      method: "DELETE"
    }),
  deleteProjectAsset: (projectId: string, assetId: string) =>
    request<Project>(`/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}`, {
      method: "DELETE"
    }),
  generateStory: (
    projectId: string,
    input: {
      inspiration: string;
      worldTitle?: string;
      worldBackground?: string;
      outline?: string;
      visualStyleId?: VisualStylePresetId;
      textModel?: TextModelSelection;
    },
    options: GenerationRequestOptions = {}
  ) =>
    request<Project>("/api/text/generate-story", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ projectId, ...input, generationRequestId: options.generationRequestId }),
      signal: options.signal,
      timeoutMs: TEXT_GENERATION_TIMEOUT_MS,
      timeoutMessage: "文本生成等待时间过长。请刷新后重试，或先进入当前项目继续编辑。"
    }),
  importSource: (
    projectId: string,
    input: {
      sourceText?: string;
      sourceFile?: {
        fileName: string;
        mimeType?: string;
        base64: string;
      };
      visualStyleId?: VisualStylePresetId;
      textModel?: TextModelSelection;
    },
    options: GenerationRequestOptions = {}
  ) =>
    request<Project>("/api/text/import-source", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ projectId, ...input, generationRequestId: options.generationRequestId }),
      signal: options.signal,
      timeoutMs: TEXT_IMPORT_TIMEOUT_MS,
      timeoutMessage: "长篇小说导入等待时间过长。请稍后刷新项目；如果仍没有结果，请拆分章节，或先导入关键章节生成第一版。"
    }),
  regenerateSection: (section: string, inspiration: string, textModel?: TextModelSelection) =>
    request<unknown>("/api/text/regenerate-section", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ section, inspiration, textModel })
    }),
  reviseSeedanceScript: (input: {
    projectId: string;
    currentScript: string;
    revisionPrompt: string;
    storyContext?: string;
    textModel?: TextModelSelection;
  }) =>
    request<Project>("/api/text/revise-seedance-script", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    }),
  textProviderStatus: () => request<TextProviderStatus>("/api/text/provider-status"),
  mediaProviderStatus: () =>
    request<MediaProviderStatus>("/api/media/provider-status"),
  generateCharacterImage: (
    projectId: string,
    characterModelId: string,
    imageAspectRatio?: string,
    options: GenerationRequestOptions = {}
  ) =>
    request<Project>("/api/media/generate-character-image", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ projectId, characterModelId, imageAspectRatio, generationRequestId: options.generationRequestId }),
      signal: options.signal
    }),
  generateSceneImage: (
    projectId: string,
    sceneModelId: string,
    imageAspectRatio?: string,
    options: GenerationRequestOptions = {}
  ) =>
    request<Project>("/api/media/generate-scene-image", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ projectId, sceneModelId, imageAspectRatio, generationRequestId: options.generationRequestId }),
      signal: options.signal
    }),
  generateImagePromptImage: (
    projectId: string,
    flowId: string,
    prompt: string,
    imageAspectRatio?: string,
    options: GenerationRequestOptions = {}
  ) =>
    request<Project>("/api/media/generate-image-prompt-image", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ projectId, flowId, prompt, imageAspectRatio, generationRequestId: options.generationRequestId }),
      signal: options.signal
    }),
  generateVideo: (input: {
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
  }, options: GenerationRequestOptions = {}) =>
    request<Project>("/api/media/generate-video", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ ...input, generationRequestId: options.generationRequestId }),
      signal: options.signal
    }),
  getMediaJob: (jobId: string) =>
    request<{
      jobId: string;
      status: "queued" | "generating" | "ready" | "failed";
      asset?: MediaAsset;
      assets?: MediaAsset[];
      error?: string;
    }>(`/api/media/jobs/${encodeURIComponent(jobId)}`),
  assetFileUrl: (projectId: string, assetId: string) =>
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/file`,
  assetDownloadUrl: (projectId: string, assetId: string) =>
    `${apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/download`
};
