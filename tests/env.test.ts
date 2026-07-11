import { describe, expect, it } from "vitest";

describe("server environment", () => {
  it("loads validated runtime defaults", async () => {
    const { env } = await import("../server/env");

    expect(env.PORT).toBeGreaterThan(0);
    expect(env.WEB_ORIGIN).toMatch(/^https?:\/\//);
    expect(env.OPENAI_MODEL).toBeTruthy();
    expect(env.MOONSHOT_MODEL).toBeTruthy();
    expect(env.MOONSHOT_BASE_URL).toMatch(/^https?:\/\//);
    expect(env.SEEDANCE_PROVIDER).toBe("ark");
    expect(env.SEEDANCE_VIDEO_MODEL).toBeTruthy();
  });

  it("detects provider keys placed in public client environment variables", async () => {
    const { findPublicProviderKeyEnvVars } = await import("../server/env");

    expect(
      findPublicProviderKeyEnvVars({
        OPENAI_API_KEY: "unit-test-server-key",
        NEXT_PUBLIC_API_BASE_URL: "https://api.example.com",
        NEXT_PUBLIC_OPENAI_API_KEY: "unit-test-public-key",
        VITE_MOONSHOT_TOKEN: "unit-test-vite-key",
        NEXT_PUBLIC_SEEDANCE_API_KEY: "unit-test-media-key"
      })
    ).toEqual(["NEXT_PUBLIC_OPENAI_API_KEY", "VITE_MOONSHOT_TOKEN", "NEXT_PUBLIC_SEEDANCE_API_KEY"]);
  });

  it("ignores empty public OpenAI key placeholders", async () => {
    const { findPublicProviderKeyEnvVars } = await import("../server/env");

    expect(
      findPublicProviderKeyEnvVars({
        NEXT_PUBLIC_OPENAI_API_KEY: "",
        NEXT_PUBLIC_OPENAI_TOKEN: "undefined",
        VITE_OPENAI_API_KEY: "none"
      })
    ).toEqual([]);
  });
});
