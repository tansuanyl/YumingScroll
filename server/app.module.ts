import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env";
import { AdminUsersController } from "./nest/admin-users.controller";
import { AuthController } from "./nest/auth.controller";
import { BillingController } from "./nest/billing.controller";
import { SessionAuthGuard } from "./nest/auth.guard";
import { MediaController } from "./nest/media.controller";
import { HealthController } from "./nest/health.controller";
import { ProjectsController } from "./nest/projects.controller";
import { TextController } from "./nest/text.controller";
import { PROJECT_STORE } from "./nest/tokens";
import { OpenAITextProvider } from "./providers/OpenAITextProvider";
import { SeedanceMediaProvider } from "./providers/SeedanceMediaProvider";
import { AssetStorageService } from "./services/AssetStorageService";
import { AuthService } from "./services/AuthService";
import { EmailService } from "./services/EmailService";
import { MediaPipelineService } from "./services/MediaPipelineService";
import { PendingVideoJobBackfillService } from "./services/PendingVideoJobBackfillService";
import { JsonProjectStore } from "./services/ProjectStore";
import { PrismaProjectStore } from "./services/PrismaProjectStore";
import { TextPipelineService } from "./services/TextPipelineService";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

@Module({
  controllers: [HealthController, AuthController, BillingController, AdminUsersController, ProjectsController, TextController, MediaController],
  providers: [
    EmailService,
    AuthService,
    {
      provide: APP_GUARD,
      useClass: SessionAuthGuard
    },
    {
      provide: PROJECT_STORE,
      useFactory: () =>
        env.DATABASE_URL ? new PrismaProjectStore() : new JsonProjectStore(join(__dirname, "storage", "projects.json"))
    },
    {
      provide: OpenAITextProvider,
      useFactory: () => new OpenAITextProvider()
    },
    {
      provide: TextPipelineService,
      useFactory: (provider: OpenAITextProvider) => new TextPipelineService(provider),
      inject: [OpenAITextProvider]
    },
    {
      provide: SeedanceMediaProvider,
      useFactory: () => new SeedanceMediaProvider()
    },
    AssetStorageService,
    {
      provide: MediaPipelineService,
      useFactory: (
        store,
        provider: SeedanceMediaProvider,
        storage: AssetStorageService,
        textProvider: OpenAITextProvider
      ) => new MediaPipelineService(store, provider, storage, undefined, textProvider),
      inject: [PROJECT_STORE, SeedanceMediaProvider, AssetStorageService, OpenAITextProvider]
    },
    PendingVideoJobBackfillService
  ]
})
export class AppModule {}
