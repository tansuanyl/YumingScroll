import { MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";
import { AppModule } from "../server/app.module";

describe("no-account application mode", () => {
  it("registers only workspace and provider controllers", () => {
    const controllers = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, AppModule) || []) as Array<{
      name: string;
    }>;

    expect(controllers.map((controller) => controller.name)).toEqual([
      "HealthController",
      "ProjectsController",
      "TextController",
      "MediaController"
    ]);
    expect(controllers.some((controller) => /Auth|Billing|Admin/.test(controller.name))).toBe(false);
  });

  it("does not install a global authentication guard", () => {
    const providers = (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) || []) as Array<unknown>;
    const serializedProviders = providers.map((provider) =>
      typeof provider === "function" ? provider.name : JSON.stringify(provider)
    );

    expect(serializedProviders.join(" ")).not.toMatch(/APP_GUARD|SessionAuthGuard|AuthService/);
  });
});
