import { Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import type { Project } from "../../src/types/domain";
import { characterImageSchema, imagePromptImageSchema, sceneImageSchema, videoSchema } from "../schemas";
import { canAccessProject } from "../services/AccessControl";
import { AuthService, GENERATION_COIN_COSTS, type AuthUserRecord } from "../services/AuthService";
import { MediaPipelineService } from "../services/MediaPipelineService";
import type { ProjectStore } from "../services/ProjectStore";
import { CurrentUser } from "./auth.decorators";
import { PROJECT_STORE } from "./tokens";

@Controller("api/media")
export class MediaController {
  constructor(
    @Inject(MediaPipelineService) private readonly media: MediaPipelineService,
    @Inject(PROJECT_STORE) private readonly store: ProjectStore,
    @Inject(AuthService) private readonly auth: AuthService
  ) {}

  @Get("provider-status")
  providerStatus() {
    return this.media.status();
  }

  @Post("generate-character-image")
  async generateCharacterImage(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    const input = characterImageSchema.parse(body);
    await this.requireProject(input.projectId, user);
    return this.runMediaAction(user, input.projectId, "media.generateCharacterImage", () =>
      this.media.generateCharacterImage(input)
    );
  }

  @Post("generate-scene-image")
  async generateSceneImage(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    const input = sceneImageSchema.parse(body);
    await this.requireProject(input.projectId, user);
    return this.runMediaAction(user, input.projectId, "media.generateSceneImage", () =>
      this.media.generateSceneImage(input)
    );
  }

  @Post("generate-image-prompt-image")
  async generateImagePromptImage(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    const input = imagePromptImageSchema.parse(body);
    await this.requireProject(input.projectId, user);
    return this.runMediaAction(user, input.projectId, "media.generateImagePromptImage", () =>
      this.media.generateImagePromptImage(input)
    );
  }

  @Post("generate-video")
  async generateVideo(@CurrentUser() user: AuthUserRecord, @Body() body: unknown) {
    const input = videoSchema.parse(body);
    await this.requireProject(input.projectId, user);
    return this.runMediaAction(user, input.projectId, "media.generateVideo", () => this.media.generateVideo(input));
  }

  @Get("jobs/:jobId")
  async getJob(@CurrentUser() user: AuthUserRecord, @Param("jobId") jobId: string) {
    const job = await this.store.getGenerationJob(jobId);
    if (!job) throw new NotFoundException("Generation job not found");
    await this.requireProject(job.projectId, user);
    return this.media.getJob(jobId);
  }

  private async requireProject(id: string, user: AuthUserRecord): Promise<Project> {
    const project = await this.store.get(id);
    if (!project) throw new NotFoundException("Project not found");
    if (!canAccessProject(user, project)) throw new ForbiddenException("Project is not available for this account");
    return project;
  }

  private async runMediaAction<T>(
    user: AuthUserRecord,
    projectId: string,
    action: string,
    run: () => Promise<T>
  ): Promise<T> {
    const charge = await this.auth.chargeForAction({
      userId: user.id,
      projectId,
      action,
      cost: action === "media.generateVideo" ? GENERATION_COIN_COSTS.video : GENERATION_COIN_COSTS.image
    });
    await this.auth.recordUsage({ userId: user.id, projectId, action, status: "started" });
    try {
      const result = await run();
      await this.auth.recordUsage({ userId: user.id, projectId, action, status: "ready" });
      return result;
    } catch (error) {
      await this.auth.refundCharge(charge, error instanceof Error ? error.message : "media generation failed");
      await this.auth.recordUsage({
        userId: user.id,
        projectId,
        action,
        status: "failed",
        metadata: { error: error instanceof Error ? error.message : "unknown" }
      });
      throw error;
    }
  }
}
