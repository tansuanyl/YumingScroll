import { spawn } from "node:child_process";
import {
  withCharacterModelPromptLibrary,
  withSceneModelPromptLibrary,
  withVideoPromptLibrary
} from "../../src/lib/promptLibraryGuidance";
import type { MediaAsset, VideoAspectRatio } from "../../src/types/domain";

export type MediaJob = {
  jobId: string;
  status: "queued" | "generating" | "ready" | "failed";
  asset?: MediaAsset;
  assets?: MediaAsset[];
  error?: string;
};

type SeedanceOptions = {
  mock?: boolean;
  mockImageDelayMs?: number;
};

type ImageInput = {
  prompt: string;
  kind: "character" | "scene";
  imageAspectRatio?: string;
  referenceImageUrls?: string[];
  referenceImageNotes?: string[];
};

type VideoInput = {
  prompt: string;
  firstFrameImageUrl?: string;
  characterImageUrl?: string;
  sceneImageUrl?: string;
  characterImageUrls?: string[];
  sceneImageUrls?: string[];
  styleReferenceImageUrl?: string;
  referenceImageNotes?: string[];
  durationSeconds: 15;
  aspectRatio: VideoAspectRatio;
};

type MediaProviderStatus = {
  provider: "ark" | "fal" | "generic";
  mode: "mock" | "live" | "unconfigured";
  configured: boolean;
  configurationSource: "mock" | "server-env" | "missing";
  baseUrl: string;
  imageModel: string;
  videoModel: string;
  imageApi: "seedream";
  videoApi: "seedance";
};

type SimpleHttpResponse = {
  ok: boolean;
  status: number;
  text: string;
};

type FalFile = {
  url?: string;
  content_type?: string;
  file_name?: string;
};

type FalImageResponse = {
  images?: FalFile[];
  image?: FalFile;
  url?: string;
  seed?: number;
  request_id?: string;
  requestId?: string;
};

type FalVideoResponse = {
  video?: FalFile;
  videos?: FalFile[];
  url?: string;
  seed?: number;
  request_id?: string;
  requestId?: string;
};

type ArkImageResponse = {
  id?: string;
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
  }>;
  images?: Array<string | { url?: string; b64_json?: string }>;
  error?: {
    message?: string;
    code?: string;
  };
};

type ArkVideoTaskResponse = {
  id: string;
  model?: string;
  status?: string;
  content?:
    | {
        video_url?: string;
        file_url?: string | null;
        url?: string;
        last_frame_url?: string;
      }
    | Array<{
        video_url?: string;
        file_url?: string | null;
        url?: string;
        type?: string;
      }>;
  error?: {
    message?: string;
    code?: string;
  } | null;
};

const timestamp = () => new Date().toISOString();
const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function mockImage(prompt: string, label: string, index: number): MediaAsset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1280" viewBox="0 0 960 1280">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#111827"/>
        <stop offset="0.5" stop-color="#6d28d9"/>
        <stop offset="1" stop-color="#f97316"/>
      </linearGradient>
    </defs>
    <rect width="960" height="1280" fill="url(#g)"/>
    <rect x="80" y="90" width="800" height="1100" rx="28" fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.35)" stroke-width="3"/>
    <text x="110" y="180" fill="#fff" font-family="Arial" font-size="54" font-weight="700">${label} ${index}</text>
    <text x="110" y="260" fill="#fef3c7" font-family="Arial" font-size="30">Seedance mock image</text>
    <foreignObject x="110" y="330" width="740" height="720">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font-family:Arial;font-size:34px;line-height:1.35">${prompt}</div>
    </foreignObject>
  </svg>`;
  const encoded = Buffer.from(svg).toString("base64");
  return {
    id: makeId("asset-image"),
    type: "image",
    url: `data:image/svg+xml;base64,${encoded}`,
    provider: "mock",
    prompt,
    jobId: makeId(`job-image-${index}`),
    createdAt: timestamp()
  };
}

function mockImageSet(prompt: string, label: string): MediaAsset[] {
  return [1, 2, 3].map((index) => mockImage(prompt, label, index));
}

function mockVideo(prompt: string): MediaAsset {
  return {
    id: makeId("asset-video"),
    type: "video",
    url: "",
    provider: "mock",
    prompt,
    jobId: makeId("job-video"),
    createdAt: timestamp()
  };
}

export class SeedanceMediaProvider {
  private readonly mock: boolean;
  private readonly mockImageDelayMs: number;

  constructor(options: SeedanceOptions = {}) {
    this.mock = options.mock ?? resolveSeedanceMockMode();
    this.mockImageDelayMs =
      options.mockImageDelayMs ??
      (process.env.NODE_ENV === "test" ? 0 : Number(process.env.MOCK_IMAGE_DELAY_MS ?? 3500));
  }

  isMock(): boolean {
    return this.mock;
  }

  status(): MediaProviderStatus {
    const configured = this.mock || Boolean(process.env.SEEDANCE_API_KEY);

    return {
      provider: this.providerKind(),
      mode: this.mock ? "mock" : configured ? "live" : "unconfigured",
      configured,
      configurationSource: this.mock ? "mock" : configured ? "server-env" : "missing",
      baseUrl: this.baseUrl(),
      imageModel: this.imageModel(),
      videoModel: this.videoModel(),
      imageApi: "seedream",
      videoApi: "seedance"
    };
  }

  async generateCharacterImage(input: ImageInput): Promise<MediaJob> {
    if (this.mock) {
      await this.waitForMockImageDelay();
      const assets = mockImageSet(input.prompt, "Character Model");
      return { jobId: makeId("job-character-batch"), status: "ready", assets };
    }
    return this.createImageGeneration(input.prompt, input.imageAspectRatio, input.kind, input.referenceImageUrls);
  }

  async generateSceneImage(input: ImageInput): Promise<MediaJob> {
    if (this.mock) {
      await this.waitForMockImageDelay();
      const assets = mockImageSet(input.prompt, "Scene Model");
      return { jobId: makeId("job-scene-batch"), status: "ready", assets };
    }
    return this.createImageGeneration(input.prompt, input.imageAspectRatio, input.kind, input.referenceImageUrls);
  }

  async generateVideo(input: VideoInput): Promise<MediaJob> {
    if (this.mock) {
      const asset = mockVideo(input.prompt);
      return { jobId: asset.jobId!, status: "ready", asset };
    }
    return this.createVideoGeneration(input);
  }

  async getJob(jobId: string): Promise<MediaJob> {
    if (this.mock) return { jobId, status: "ready" };
    if (this.providerKind() === "fal") return this.getFalJob(jobId);
    if (this.providerKind() === "ark") {
      const task = await this.getArkVideoTask(jobId);
      return normalizeArkVideoTask(task, withReferenceHints("", 0));
    }
    return this.getGenericJob(jobId);
  }

  private async createImageGeneration(
    prompt: string,
    imageAspectRatio?: string,
    kind?: ImageInput["kind"],
    referenceImageUrls: string[] = []
  ): Promise<MediaJob> {
    if (this.providerKind() === "ark") {
      if (kind === "character") return this.createArkCharacterImageGeneration(prompt, imageAspectRatio);
      return this.createArkImageGeneration(prompt, imageAspectRatio, referenceImageUrls);
    }

    if (this.providerKind() === "fal") {
      const response = await this.callFalModel<FalImageResponse>(this.imageModel(), {
        prompt,
        image_size: toFalImageSize(imageAspectRatio) || process.env.SEEDANCE_IMAGE_SIZE || "portrait_4_3",
        num_images: 3,
        max_images: 1,
        sync_mode: false,
        enable_safety_checker: true,
        enhance_prompt_mode: process.env.SEEDANCE_IMAGE_ENHANCE_MODE || "standard"
      });
      const assets = normalizeFalImageAssets(response, prompt);
      if (assets.length === 0) throw new Error("Seedream response did not include image URLs");
      return {
        jobId: response.request_id || response.requestId || makeId("job-seedream"),
        status: "ready",
        assets: assets.slice(0, 3)
      };
    }

    return this.createSeedanceJob("/images/generations", {
      model: this.imageModel(),
      prompt,
      aspect_ratio: imageAspectRatio,
      num_images: 3
    });
  }

  private async createArkCharacterImageGeneration(prompt: string, imageAspectRatio?: string): Promise<MediaJob> {
    const candidatePrompts = [1, 2, 3].map((index) => withCharacterTurnaroundCandidatePrompt(prompt, index));
    return this.createArkImageCandidateBatch(
      candidatePrompts,
      imageAspectRatio,
      "job-ark-character-turnaround-batch",
      "character turnaround images"
    );
  }

  private async createArkImageGeneration(prompt: string, imageAspectRatio?: string, referenceImageUrls: string[] = []): Promise<MediaJob> {
    const candidatePrompts = [1, 2, 3].map((index) => withSceneOrStyleCandidatePrompt(prompt, index));
    return this.createArkImageCandidateBatch(
      candidatePrompts,
      imageAspectRatio,
      "job-ark-image-candidate-batch",
      "image candidates",
      referenceImageUrls
    );
  }

  private async createArkImageCandidateBatch(
    candidatePrompts: string[],
    imageAspectRatio: string | undefined,
    jobPrefix: string,
    label: string,
    referenceImageUrls: string[] = []
  ): Promise<MediaJob> {
    const images = uniqueReferenceImages(referenceImageUrls.map((url) => ({ url })))
      .map((item) => item.url)
      .filter(isRemoteOrDataImageUrl);
    const requestCandidate = (candidatePrompt: string) =>
      this.callArk<ArkImageResponse>("/images/generations", {
        model: this.imageModel(),
        prompt: candidatePrompt,
        size: toArkImageSize(imageAspectRatio) || process.env.SEEDANCE_IMAGE_SIZE || "1728x2304",
        n: 1,
        stream: false,
        response_format: "url",
        watermark: false,
        ...(images.length > 0 ? { image: images } : {})
      });

    const settledResponses = await Promise.allSettled(candidatePrompts.map((candidatePrompt) => requestCandidate(candidatePrompt)));
    const responses: ArkImageResponse[] = [];
    const failureMessages: string[] = [];
    settledResponses.forEach((result, index) => {
      if (result.status === "fulfilled") {
        responses[index] = result.value;
      } else {
        failureMessages.push(formatRequestFailure(`candidate ${index + 1}`, result.reason));
      }
    });

    for (let index = 0; index < candidatePrompts.length && responses.filter(Boolean).length < 3; index += 1) {
      if (responses[index]) continue;
      try {
        responses[index] = await requestCandidate(candidatePrompts[index]);
      } catch (error) {
        failureMessages.push(formatRequestFailure(`candidate ${index + 1} retry`, error));
      }
    }

    const assets = responses.flatMap((response, index) => normalizeArkImageAssets(response, candidatePrompts[index])).slice(0, 3);
    if (assets.length < 3) {
      const message = responses.find((response) => response.error?.message)?.error?.message;
      throw new Error(
        message ||
          [
            `Ark Seedream response returned ${assets.length}/3 ${label}.`,
            failureMessages.length > 0 ? failureMessages.join("; ") : undefined
          ]
            .filter(Boolean)
            .join(" ")
      );
    }
    return {
      jobId: makeId(jobPrefix),
      status: "ready",
      assets
    };
  }

  private async createVideoGeneration(input: VideoInput): Promise<MediaJob> {
    const characterUrls = input.characterImageUrls || (input.characterImageUrl ? [input.characterImageUrl] : []);
    const sceneUrls = input.sceneImageUrls || (input.sceneImageUrl ? [input.sceneImageUrl] : []);
    let noteIndex = 0;
    const referenceInputs: Array<{ url?: string; note?: string }> = [];
    if (input.firstFrameImageUrl) {
      referenceInputs.push({ url: input.firstFrameImageUrl, note: input.referenceImageNotes?.[noteIndex] });
      noteIndex += 1;
    }
    for (const url of characterUrls) {
      referenceInputs.push({ url, note: input.referenceImageNotes?.[noteIndex] });
      noteIndex += 1;
    }
    for (const url of sceneUrls) {
      referenceInputs.push({ url, note: input.referenceImageNotes?.[noteIndex] });
      noteIndex += 1;
    }
    if (input.styleReferenceImageUrl) {
      referenceInputs.push({ url: input.styleReferenceImageUrl, note: input.referenceImageNotes?.[noteIndex] });
    }
    const referenceImages = uniqueReferenceImages(referenceInputs).slice(0, 9);
    const imageUrls = referenceImages.map((item) => item.url);
    const referenceImageNotes = referenceImages.map((item) => item.note).filter((note): note is string => Boolean(note));

    if (this.providerKind() === "fal") {
      const prompt = withReferenceHints(input.prompt, referenceImageNotes.length ? referenceImageNotes : imageUrls.length);
      const response = await this.callFalModel<FalVideoResponse>(this.videoModel(), {
        prompt,
        image_urls: imageUrls,
        resolution: process.env.SEEDANCE_VIDEO_RESOLUTION || "720p",
        duration: String(input.durationSeconds),
        aspect_ratio: input.aspectRatio,
        generate_audio: process.env.SEEDANCE_GENERATE_AUDIO !== "false"
      });
      const asset = normalizeFalVideoAsset(response, prompt);
      if (!asset) throw new Error("Seedance response did not include a video URL");
      return {
        jobId: response.request_id || response.requestId || asset.jobId || makeId("job-seedance"),
        status: "ready",
        asset
      };
    }

    if (this.providerKind() === "ark") {
      return this.createArkVideoGeneration(input, referenceImages);
    }

    const prompt = withReferenceHints(input.prompt, referenceImageNotes.length ? referenceImageNotes : imageUrls.length);
    return this.createSeedanceJob("/videos/generations", {
      model: this.videoModel(),
      prompt,
      first_frame_image_url: input.firstFrameImageUrl,
      character_image_urls: characterUrls,
      scene_image_urls: sceneUrls,
      style_reference_image_url: input.styleReferenceImageUrl,
      reference_image_notes: referenceImageNotes,
      duration_seconds: input.durationSeconds,
      aspect_ratio: input.aspectRatio
    });
  }

  private async createArkVideoGeneration(
    input: VideoInput,
    referenceImages: Array<{ url: string; note?: string }>
  ): Promise<MediaJob> {
    const remoteReferenceImages = referenceImages.filter((item) => isRemoteOrDataImageUrl(item.url));
    const remoteImageUrls = remoteReferenceImages.map((item) => item.url);
    const remoteReferenceNotes = remoteReferenceImages
      .map((item) => item.note)
      .filter((note): note is string => Boolean(note));
    const prompt = withReferenceHints(input.prompt, remoteReferenceNotes.length ? remoteReferenceNotes : remoteImageUrls.length);
    const body: Record<string, unknown> = {
      model: this.videoModel(),
      content: [
        { type: "text", text: prompt },
        ...remoteImageUrls.map((url) => ({
          type: "image_url",
          image_url: { url },
          role: "reference_image"
        }))
      ],
      ratio: input.aspectRatio,
      duration: input.durationSeconds,
      generate_audio: process.env.SEEDANCE_GENERATE_AUDIO !== "false",
      watermark: false
    };
    const arkResolution = optionalEnvValue(process.env.SEEDANCE_ARK_VIDEO_RESOLUTION);
    if (arkResolution) body.resolution = arkResolution;
    try {
      const response = await this.callArk<ArkVideoTaskResponse>("/contents/generations/tasks", body);
      return this.pollArkVideoTask(response.id, prompt);
    } catch (error) {
      if (remoteImageUrls.length === 0 || !isArkInputImageModerationError(error)) throw error;
      if (hasCharacterReference(remoteReferenceNotes)) {
        throw new Error(buildReferenceImageModerationError(remoteReferenceNotes, error));
      }
      if (!allowArkTextOnlyReferenceFallback()) {
        throw new Error(buildReferenceImageModerationError(remoteReferenceNotes, error));
      }
      const fallbackReferences =
        remoteReferenceNotes.length > 0
          ? remoteReferenceNotes
          : remoteImageUrls.map(
              (_, index) =>
                `Reference image ${index + 1} was omitted by provider safety review; rely on the text prompt for identity, scene, and style continuity.`
            );
      const fallbackPrompt = withTextOnlyReferenceHints(input.prompt, fallbackReferences);
      const fallbackBody: Record<string, unknown> = {
        ...body,
        content: [{ type: "text", text: fallbackPrompt }]
      };
      const response = await this.callArk<ArkVideoTaskResponse>("/contents/generations/tasks", fallbackBody);
      return this.pollArkVideoTask(response.id, fallbackPrompt);
    }
  }

  private async callFalModel<T>(model: string, body: Record<string, unknown>): Promise<T> {
    const baseUrl = this.requireBaseUrl();
    const response = await fetch(`${baseUrl}/${model.replace(/^\/+/, "")}`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Seedance/fal request failed: ${response.status}${detail ? ` ${detail.slice(0, 400)}` : ""}`);
    }
    return (await response.json()) as T;
  }

  private async callArk<T>(path: string, body?: Record<string, unknown>, method: "GET" | "POST" = "POST"): Promise<T> {
    const baseUrl = this.requireBaseUrl();
    const response = await requestJsonEndpoint(`${baseUrl}${path}`, {
      method,
      headers: { ...this.headers(), "content-type": "application/json" },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined
    });
    const payload = parseJsonPayload(response.text);
    if (!response.ok) {
      const message = payload?.error?.message || JSON.stringify(payload).slice(0, 400);
      throw new Error(`Ark media request failed: ${response.status}${message ? ` ${message}` : ""}`);
    }
    return payload as T;
  }

  private async getFalJob(jobId: string): Promise<MediaJob> {
    return {
      jobId,
      status: "ready"
    };
  }

  private async getGenericJob(jobId: string): Promise<MediaJob> {
    const baseUrl = this.requireBaseUrl();
    const response = await fetch(`${baseUrl}/jobs/${jobId}`, {
      headers: this.headers()
    });
    if (!response.ok) throw new Error(`Seedance job status failed: ${response.status}`);
    return (await response.json()) as MediaJob;
  }

  private async pollArkVideoTask(jobId: string, prompt: string): Promise<MediaJob> {
    const timeoutMs = Number(process.env.SEEDANCE_VIDEO_SYNC_TIMEOUT_MS ?? 180000);
    const intervalMs = Number(process.env.SEEDANCE_VIDEO_POLL_INTERVAL_MS ?? 5000);
    const deadline = Date.now() + timeoutMs;
    let lastTask: ArkVideoTaskResponse | undefined;

    while (Date.now() <= deadline) {
      lastTask = await this.getArkVideoTask(jobId);
      const job = normalizeArkVideoTask(lastTask, prompt);
      if (job.status === "ready" || job.status === "failed") return job;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    return {
      jobId,
      status: "generating",
      error: lastTask?.status ? `Ark video task is still ${lastTask.status}` : "Ark video task is still running"
    };
  }

  private getArkVideoTask(jobId: string): Promise<ArkVideoTaskResponse> {
    return this.callArk<ArkVideoTaskResponse>(`/contents/generations/tasks/${encodeURIComponent(jobId)}`, undefined, "GET");
  }

  private async createSeedanceJob(path: string, body: Record<string, unknown>): Promise<MediaJob> {
    const baseUrl = this.requireBaseUrl();
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Seedance request failed: ${response.status}`);
    return (await response.json()) as MediaJob;
  }

  private requireBaseUrl(): string {
    return this.baseUrl();
  }

  private baseUrl(): string {
    return (process.env.SEEDANCE_BASE_URL || "https://fal.run").replace(/\/$/, "");
  }

  private imageModel(): string {
    if (this.providerKind() === "ark") return process.env.SEEDANCE_IMAGE_MODEL || "doubao-seedream-4-0-250828";
    return process.env.SEEDANCE_IMAGE_MODEL || "fal-ai/bytedance/seedream/v4/text-to-image";
  }

  private videoModel(): string {
    if (this.providerKind() === "ark") return process.env.SEEDANCE_VIDEO_MODEL || "doubao-seedance-2-0-260128";
    return process.env.SEEDANCE_VIDEO_MODEL || "bytedance/seedance-2.0/reference-to-video";
  }

  private providerKind(): "ark" | "fal" | "generic" {
    const provider = process.env.SEEDANCE_PROVIDER?.toLowerCase();
    if (provider === "ark") return "ark";
    if (provider === "generic") return "generic";
    if (provider === "fal") return "fal";
    if (this.baseUrl().includes("ark.cn-beijing.volces.com")) return "ark";
    return this.baseUrl().includes("fal.run") ? "fal" : "generic";
  }

  private headers(): Record<string, string> {
    if (!process.env.SEEDANCE_API_KEY) throw new Error("SEEDANCE_API_KEY is not configured");
    const scheme = process.env.SEEDANCE_AUTH_SCHEME || (this.providerKind() === "fal" ? "Key" : "Bearer");
    return { authorization: `${scheme} ${process.env.SEEDANCE_API_KEY}` };
  }

  private async waitForMockImageDelay(): Promise<void> {
    if (this.mockImageDelayMs <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, this.mockImageDelayMs));
  }
}

async function requestJsonEndpoint(
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string }
): Promise<SimpleHttpResponse> {
  const timeoutSec = Number(process.env.SEEDANCE_HTTP_TIMEOUT_SEC ?? 120);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(timeoutSec, 1) * 1000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal
    });
    return {
      ok: response.ok,
      status: response.status,
      text: await response.text()
    };
  } catch (error) {
    if (process.platform === "win32" && isNetworkRequestFailure(error)) {
      return requestJsonEndpointViaPowerShell(url, init);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonPayload(text: string): any {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

function isNetworkRequestFailure(error: unknown): boolean {
  const maybeError = error as { message?: string; cause?: { code?: string; message?: string } };
  const message = `${maybeError?.message || ""} ${maybeError?.cause?.message || ""}`;
  const code = maybeError?.cause?.code || "";
  return /fetch failed|timeout|network|socket/i.test(message) || /UND_ERR|ETIMEDOUT|ECONNRESET|ENETUNREACH/i.test(code);
}

function requestJsonEndpointViaPowerShell(
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: string }
): Promise<SimpleHttpResponse> {
  const timeoutSec = Number(process.env.SEEDANCE_HTTP_TIMEOUT_SEC ?? 120);
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$inputJson = [Console]::In.ReadToEnd()
$req = $inputJson | ConvertFrom-Json
$headers = @{}
if ($req.headers) {
  $req.headers.PSObject.Properties | ForEach-Object {
    if ($_.Name -ne 'content-type') {
      $headers[$_.Name] = [string]$_.Value
    }
  }
}
try {
  $params = @{
    Uri = [string]$req.url
    Method = [string]$req.method
    Headers = $headers
    TimeoutSec = ${timeoutSec}
    UseBasicParsing = $true
  }
  if ([string]$req.method -ne 'GET') {
    $params['ContentType'] = 'application/json; charset=utf-8'
    $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes([string]$req.body)
  }
  $response = Invoke-WebRequest @params
  $out = @{ ok = $true; status = [int]$response.StatusCode; text = [string]$response.Content }
} catch {
  $status = 0
  $text = $_.Exception.Message
  if ($_.Exception.Response) {
    try { $status = [int]$_.Exception.Response.StatusCode.value__ } catch {}
    try {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
      }
    } catch {}
  }
  $out = @{ ok = $false; status = $status; text = [string]$text }
}
$out | ConvertTo-Json -Compress -Depth 20
`;

  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      stdio: ["pipe", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Ark PowerShell fallback timed out"));
    }, Math.max(timeoutSec + 20, 30) * 1000);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const output = Buffer.concat(stdout).toString("utf8").trim();
      const errorOutput = Buffer.concat(stderr).toString("utf8").trim();
      if (code !== 0) {
        reject(new Error(errorOutput || `PowerShell exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(output) as SimpleHttpResponse;
        resolve(parsed);
      } catch {
        reject(new Error(`Could not parse PowerShell response: ${output || errorOutput}`));
      }
    });

    child.stdin.end(
      JSON.stringify({
        url,
        method: init.method,
        headers: init.headers,
        body: init.body || ""
      }),
      "utf8"
    );
  });
}

function formatRequestFailure(label: string, error: unknown): string {
  if (error instanceof Error) return `${label}: ${error.message}`;
  return `${label}: ${String(error)}`;
}

function resolveSeedanceMockMode(): boolean {
  return process.env.MOCK_PROVIDERS === "true" || process.env.SEEDANCE_MOCK === "true";
}

function normalizeFalImageAssets(response: FalImageResponse, prompt: string): MediaAsset[] {
  const files = [
    ...(response.images || []),
    ...(response.image ? [response.image] : []),
    ...(response.url ? [{ url: response.url }] : [])
  ];
  return files
    .filter((file): file is Required<Pick<FalFile, "url">> & FalFile => Boolean(file.url))
    .slice(0, 3)
    .map((file, index) => ({
      id: makeId(`asset-seedream-image-${index + 1}`),
      type: "image",
      url: file.url,
      provider: "seedance",
      prompt,
      jobId: response.request_id || response.requestId || makeId("job-seedream"),
      createdAt: timestamp()
    }));
}

function normalizeArkImageAssets(response: ArkImageResponse, prompt: string): MediaAsset[] {
  const files = [
    ...(response.data || []),
    ...(response.images || []).map((image) => (typeof image === "string" ? { url: image } : image))
  ];

  return files
    .map((file) => {
      if (file.url) return file.url;
      if (file.b64_json) return `data:image/png;base64,${file.b64_json}`;
      return undefined;
    })
    .filter((url): url is string => Boolean(url))
    .slice(0, 3)
    .map((url, index) => ({
      id: makeId(`asset-ark-seedream-image-${index + 1}`),
      type: "image",
      url,
      provider: "seedance",
      prompt,
      jobId: response.id || makeId("job-ark-seedream"),
      createdAt: timestamp()
    }));
}

function normalizeFalVideoAsset(response: FalVideoResponse, prompt: string): MediaAsset | undefined {
  const file = response.video || response.videos?.[0] || (response.url ? { url: response.url } : undefined);
  if (!file?.url) return undefined;
  return {
    id: makeId("asset-seedance-video"),
    type: "video",
    url: file.url,
    provider: "seedance",
    prompt,
    jobId: response.request_id || response.requestId || makeId("job-seedance"),
    createdAt: timestamp()
  };
}

function normalizeArkVideoTask(task: ArkVideoTaskResponse, prompt: string): MediaJob {
  const status = normalizeArkTaskStatus(task.status);
  const url = extractArkVideoUrl(task);
  const error = task.error?.message;

  if (status === "ready" && url) {
    return {
      jobId: task.id,
      status: "ready",
      asset: {
        id: stableAssetId("asset-ark-seedance-video", task.id),
        type: "video",
        url,
        provider: "seedance",
        prompt,
        jobId: task.id,
        createdAt: timestamp()
      }
    };
  }

  return {
    jobId: task.id,
    status: status === "ready" && !url ? "generating" : status,
    error
  };
}

function normalizeArkTaskStatus(status?: string): MediaJob["status"] {
  switch (status) {
    case "succeeded":
    case "completed":
      return "ready";
    case "failed":
    case "cancelled":
    case "expired":
      return "failed";
    case "queued":
    case "pending":
      return "queued";
    case "running":
    case "processing":
    default:
      return "generating";
  }
}

function extractArkVideoUrl(task: ArkVideoTaskResponse): string | undefined {
  const content = task.content;
  if (!content) return undefined;
  if (Array.isArray(content)) {
    const file = content.find((item) => item.video_url || item.file_url || item.url);
    return file?.video_url || file?.file_url || file?.url || undefined;
  }
  return content.video_url || content.file_url || content.url || undefined;
}

function uniqueUrls(urls: Array<string | undefined>): string[] {
  return Array.from(new Set(urls.filter((url): url is string => Boolean(url?.trim()))));
}

function uniqueReferenceImages(
  inputs: Array<{ url?: string; note?: string }>
): Array<{ url: string; note?: string }> {
  const seen = new Set<string>();
  const result: Array<{ url: string; note?: string }> = [];
  for (const input of inputs) {
    const url = input.url?.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push({ url, note: input.note?.trim() || undefined });
  }
  return result;
}

function isRemoteOrDataImageUrl(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^data:image\//i.test(url);
}

function optionalEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isArkInputImageModerationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /input image/i.test(message) && /real person/i.test(message);
}

function allowArkTextOnlyReferenceFallback(): boolean {
  return process.env.SEEDANCE_ALLOW_TEXT_ONLY_REFERENCE_FALLBACK === "true";
}

function hasCharacterReference(referenceNotes: string[]): boolean {
  return referenceNotes.some((note) => /人物模型图|character/i.test(note));
}

function buildReferenceImageModerationError(referenceNotes: string[], error: unknown): string {
  const target = hasCharacterReference(referenceNotes) ? "人物模型参考图" : "参考图";
  const providerMessage = error instanceof Error ? error.message : String(error);
  return [
    `视频生成已中止：${target}被视频服务安全审核拒绝，可能被判定为真人照片或不可用输入。`,
    "系统不会再自动删除参考图继续生成，避免生成出与已连接人物模型不一致的视频。",
    hasCharacterReference(referenceNotes)
      ? "系统已经优先使用眼部轻雾化的人物参考图；如果仍被拒，请重新生成/更换更明确的虚构角色概念设定图，降低真人照片感后再生成视频。"
      : "请重新生成/更换更明确的非真人化参考图后再生成视频。",
    `Provider error: ${providerMessage}`
  ].join(" ");
}

function stableAssetId(prefix: string, rawId: string): string {
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return `${prefix}-${safeId || "job"}`;
}

function withReferenceHints(prompt: string, references: number | string[]): string {
  const promptWithLibrary = withVideoPromptLibrary(prompt);
  const notes =
    typeof references === "number"
      ? Array.from({ length: references }, (_, index) => `参考图 ${index + 1}`)
      : references.map((note) => note.trim()).filter(Boolean);
  if (notes.length === 0) return promptWithLibrary;
  const referenceMap = notes.map((note, index) => `@Image${index + 1} = ${note}`).join("\n");
  return `${promptWithLibrary}

参考图映射（必须按这个顺序理解，不要把人物、场景和风格参考互相混用）：
${referenceMap}

一致性硬性规则：
0. 当前片段文字脚本优先级最高仅用于剧情、动作、景别、场景、台词和出镜人物名单；人物外观必须以人物模型图为最高优先级，不得被文字描述重新设计。未在当前片段脚本中写明出镜的角色不要出现。
0a. 如果 @Image 中包含“首帧连续参考图”，它只约束当前段 0 秒开头：承接上一段尾帧的人物位置、姿态、视线方向、镜头方向、光影和场景空间；随后继续执行当前片段脚本，不要重复上一段剧情或台词。
1. 人物模型图是该角色唯一外观基准，用于锁定同一角色身份、脸型、五官比例、发型、年龄、体型、服装、配色和线稿；不要重新设计人物，不要换脸，不要根据文字描述另画一个相似角色。
2. 场景模型图用于锁定空间结构、光源方向、座位/道具/入口出口位置，不要把场景改成另一处空间。
3. 风格参考图用于锁定项目所选画风、色彩、线稿/材质、光影和构图语言，不要自行改成其他画风。
4. 禁止换脸、角色年龄漂移、廉价游戏过场、油腻皮肤质感和风格突变；相邻 15 秒片段必须像同一个项目连续剪辑出来。`;
}

function withTextOnlyReferenceHints(prompt: string, references: string[]): string {
  const promptWithLibrary = withVideoPromptLibrary(prompt);
  const notes = references.map((note) => note.trim()).filter(Boolean);
  const referenceMap = notes.map((note, index) => `Text reference ${index + 1}: ${note}`).join("\n");
  return `${promptWithLibrary}

Reference images were blocked by provider safety review, so this retry does not include image_url inputs. Treat the following entries as text-only continuity constraints and do not wait for uploaded images.
${referenceMap || "Use the current segment script, existing character descriptions, scene descriptions, style summary, and continuity instructions only."}

Text-only consistency rules:
1. Keep the current 15-second script as the highest priority and only generate the characters, actions, dialogue, scene, and camera moves written in this segment.
2. Preserve character identity from the text constraints: face shape, hairstyle, age, body type, clothing, line style, and color palette must stay consistent across adjacent segments.
3. Preserve scene structure and lighting from the text constraints; do not redesign the location or move key props unless the current script says so.
4. Preserve the selected visual style and avoid face swaps, photoreal human likeness drift, low-quality distortions, black-frame endings, or abrupt style changes.`;
}

const characterTurnaroundVariants = [
  {
    title: "标准定妆版",
    note: "轮廓干净克制，服装剪裁贴合剧本设定，适合作为默认角色基准。"
  },
  {
    title: "轮廓强化版",
    note: "在不改变性别、年龄、身份和核心服装的前提下，强化外套肩线、领口、袖口、鞋靴、发丝分层和材质细节。"
  },
  {
    title: "悬疑质感版",
    note: "在不改变角色身份、服装结构和项目所选画风的前提下，强化悬疑质感、局部异常线索和细节层次。"
  }
];

const sceneOrStyleVariants = [
  {
    title: "空间结构版",
    note: "优先展示完整空间结构、主透视线、入口出口、关键道具位置和可用于视频构图的环境关系。"
  },
  {
    title: "光影氛围版",
    note: "优先强化光源方向、冷暖对比、阴影层次、空气灰尘、雨雾或异常光效，构图与第 1 张明显不同。"
  },
  {
    title: "镜头调度版",
    note: "优先体现更强短剧镜头感，使用不同机位、景别和画面纵深，保证不是第 1、2 张的轻微改色版本。"
  }
];

function withCharacterTurnaroundCandidatePrompt(prompt: string, index: number): string {
  const variant = characterTurnaroundVariants[index - 1] || characterTurnaroundVariants[0];
  const promptWithLibrary = withCharacterModelPromptLibrary(prompt);
  return `${promptWithLibrary}

候选方案 ${index}：${variant.title}
方案差异要求：${variant.note}
每一张候选图都必须是一张完整的人物三视图设定表。
同一名角色必须在同一张图片内出现三次，横向排列为：正面、侧面、背面。
三个视图必须保持完全相同的脸型、发型、服装、身高比例、配色和线稿风格。
这是虚构角色的影视概念设定图，不是真人照片、真实演员写真或可识别真人肖像。
即使项目选择写实剧照风，也必须保留轻微绘制感、概念美术质感、干净边缘和非真人化皮肤处理，避免被误判为真实人物照片。
正面和侧面视图的眼部位置需要覆盖极薄的半透明雾化光带，像轻雾码一样弱化瞳孔细节；雾化带要轻薄，不遮挡脸型、发型和五官比例识别。
使用纯白或浅灰干净背景，角色完整全身入画，从头到脚不能裁切，不能只画半身或单人肖像。
不要把正面、侧面、背面拆分成三张候选图；不要只生成单个角度；不要生成场景海报或电影截图。
这是第 ${index} 张候选三视图，必须和另外两张候选图有可见差异，但构图必须仍然是一张完整三视图设定表。`;
}

function withSceneOrStyleCandidatePrompt(prompt: string, index: number): string {
  const variant = sceneOrStyleVariants[index - 1] || sceneOrStyleVariants[0];
  const promptWithLibrary = withSceneModelPromptLibrary(prompt);
  return `${promptWithLibrary}

候选方案 ${index}：${variant.title}
方案差异要求：${variant.note}
这是用于用户选择的第 ${index} 张候选图。必须保持同一世界观、同一画风和同一场景核心设定，但需要在构图、机位、光影重点或空间层次上和另外两张候选图有明显区别。
禁止只生成同一张图的轻微色彩变化；禁止重复同一机位；禁止加入人物、文字、logo、水印或无关物体。`;
}

function toFalImageSize(imageAspectRatio?: string): string | undefined {
  switch (imageAspectRatio) {
    case "1:1":
      return "square_hd";
    case "2:3":
      return "portrait_4_3";
    case "3:4":
      return "portrait_4_3";
    case "4:3":
      return "landscape_4_3";
    case "16:9":
      return "landscape_16_9";
    case "9:16":
      return "portrait_16_9";
    case "21:9":
      return "landscape_21_9";
    case "9:21":
      return "portrait_21_9";
    default:
      return undefined;
  }
}

function toArkImageSize(imageAspectRatio?: string): string | undefined {
  switch (imageAspectRatio) {
    case "1:1":
      return "2048x2048";
    case "2:3":
      return "1728x2592";
    case "3:4":
      return "1728x2304";
    case "4:3":
      return "2304x1728";
    case "16:9":
      return "2560x1440";
    case "9:16":
      return "1440x2560";
    case "21:9":
      return "2520x1080";
    case "9:21":
      return "1080x2520";
    default:
      return undefined;
  }
}
