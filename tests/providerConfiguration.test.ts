import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAITextProvider } from "../server/providers/OpenAITextProvider";
import { SeedanceMediaProvider } from "../server/providers/SeedanceMediaProvider";
import { TextPipelineService } from "../server/services/TextPipelineService";

describe("provider configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports text generation as unconfigured when server keys are absent", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("OPENAI_MOCK", "false");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("MOONSHOT_API_KEY", "");

    const provider = new OpenAITextProvider();
    const service = new TextPipelineService(provider, { fallbackToMockOnTimeout: false });

    expect(provider.isMock()).toBe(false);
    expect(service.status()).toMatchObject({
      mode: "unconfigured",
      configured: false,
      configuredModels: [],
      configurationSource: "missing"
    });
    await expect(provider.generateStory("test story")).rejects.toThrow("Missing MOONSHOT_API_KEY");
  });

  it("reports only text models backed by server-side keys", () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("OPENAI_MOCK", "false");
    vi.stubEnv("OPENAI_API_KEY", "unit-test-openai-key");
    vi.stubEnv("MOONSHOT_API_KEY", "");

    const service = new TextPipelineService(new OpenAITextProvider());

    expect(service.status()).toMatchObject({
      mode: "live",
      configured: true,
      configuredModels: ["gpt-5.5"],
      configurationSource: "server-env"
    });
  });

  it("reports media generation as unconfigured when its server key is absent", async () => {
    vi.stubEnv("MOCK_PROVIDERS", "false");
    vi.stubEnv("SEEDANCE_MOCK", "false");
    vi.stubEnv("SEEDANCE_API_KEY", "");

    const provider = new SeedanceMediaProvider();

    expect(provider.isMock()).toBe(false);
    expect(provider.status()).toMatchObject({
      mode: "unconfigured",
      configured: false,
      configurationSource: "missing"
    });
    await expect(
      provider.generateSceneImage({
        kind: "scene",
        prompt: "empty studio",
        imageAspectRatio: "16:9"
      })
    ).rejects.toThrow("SEEDANCE_API_KEY is not configured");
  });

  it("uses samples only when Mock mode is explicitly enabled", () => {
    vi.stubEnv("MOCK_PROVIDERS", "true");
    vi.stubEnv("OPENAI_MOCK", "false");
    vi.stubEnv("SEEDANCE_MOCK", "false");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("MOONSHOT_API_KEY", "");
    vi.stubEnv("SEEDANCE_API_KEY", "");

    const text = new TextPipelineService(new OpenAITextProvider());
    const media = new SeedanceMediaProvider({ mockImageDelayMs: 0 });

    expect(text.status()).toMatchObject({
      mode: "mock",
      configured: true,
      configurationSource: "mock"
    });
    expect(media.status()).toMatchObject({
      mode: "mock",
      configured: true,
      configurationSource: "mock"
    });
  });
});
