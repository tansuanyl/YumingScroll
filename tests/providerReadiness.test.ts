import { describe, expect, it } from "vitest";
import type { MediaProviderStatus, TextProviderStatus } from "../src/lib/apiClient";
import { getProviderReadiness } from "../src/lib/providerReadiness";

const liveTextStatus: TextProviderStatus = {
  provider: "openai",
  mode: "live",
  configured: true,
  configuredModels: ["gpt-5.5", "kimi-k2.6"],
  configurationSource: "server-env",
  model: "gpt-5.5",
  availableModels: ["gpt-5.5", "kimi-k2.6"],
  requestTimeoutMs: 420_000,
  fallbackToMockOnTimeout: false
};

const liveMediaStatus: MediaProviderStatus = {
  provider: "ark",
  mode: "live",
  configured: true,
  configurationSource: "server-env",
  baseUrl: "https://example.invalid",
  imageModel: "image-model",
  videoModel: "video-model",
  imageApi: "seedream",
  videoApi: "seedance"
};

describe("getProviderReadiness", () => {
  it("blocks generation when the selected text model is not configured", () => {
    const readiness = getProviderReadiness(
      {
        text: { ...liveTextStatus, configuredModels: ["kimi-k2.6"] },
        media: liveMediaStatus
      },
      "gpt-5.5"
    );

    expect(readiness).toMatchObject({
      tone: "blocked",
      blockTextGeneration: true
    });
    expect(readiness?.detail).toContain("所选文本模型");
  });

  it("warns that mock output does not represent generation quality", () => {
    const readiness = getProviderReadiness(
      {
        text: {
          ...liveTextStatus,
          mode: "mock",
          configurationSource: "mock"
        },
        media: liveMediaStatus
      },
      "gpt-5.5"
    );

    expect(readiness).toMatchObject({
      tone: "warning",
      blockTextGeneration: false
    });
    expect(readiness?.detail).toContain("不代表真实模型效果");
  });

  it("warns when text is live but media generation is unconfigured", () => {
    const readiness = getProviderReadiness(
      {
        text: liveTextStatus,
        media: {
          ...liveMediaStatus,
          mode: "unconfigured",
          configured: false,
          configurationSource: "missing"
        }
      },
      "gpt-5.5"
    );

    expect(readiness).toMatchObject({
      tone: "warning",
      blockTextGeneration: false
    });
    expect(readiness?.detail).toContain("媒体 Provider Key");
  });

  it("reports ready only when text and media providers are live", () => {
    expect(
      getProviderReadiness(
        {
          text: liveTextStatus,
          media: liveMediaStatus
        },
        "gpt-5.5"
      )
    ).toMatchObject({
      tone: "ready",
      blockTextGeneration: false
    });
  });
});
