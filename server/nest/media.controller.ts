import { Body, Controller, Get, Inject, NotFoundException, Param, Post } from "@nestjs/common";
import type { Project } from "../../src/types/domain";
import { characterImageSchema, imagePromptImageSchema, sceneImageSchema, videoSchema } from "../schemas";
import { MediaPipelineService } from "../services/MediaPipelineService";
import type { ProjectStore } from "../services/ProjectStore";
import { PROJECT_STORE } from "./tokens";

@Controller("api/media")
export class MediaController {
  constructor(
    @Inject(MediaPipelineService) private readonly media: MediaPipelineService,
    @Inject(PROJECT_STORE) private readonly store: ProjectStore
  ) {}

  @Get("provider-status")
  providerStatus() {
    return this.media.status();
  }

  @Post("generate-character-image")
  async generateCharacterImage(@Body() body: unknown) {
    const input = characterImageSchema.parse(body);
    await this.requireProject(input.projectId);
    return this.media.generateCharacterImage(input);
  }

  @Post("generate-scene-image")
  async generateSceneImage(@Body() body: unknown) {
    const input = sceneImageSchema.parse(body);
    await this.requireProject(input.projectId);
    return this.media.generateSceneImage(input);
  }

  @Post("generate-image-prompt-image")
  async generateImagePromptImage(@Body() body: unknown) {
    const input = imagePromptImageSchema.parse(body);
    await this.requireProject(input.projectId);
    return this.media.generateImagePromptImage(input);
  }

  @Post("generate-video")
  async generateVideo(@Body() body: unknown) {
    const input = videoSchema.parse(body);
    await this.requireProject(input.projectId);
    return this.media.generateVideo(input);
  }

  @Get("jobs/:jobId")
  async getJob(@Param("jobId") jobId: string) {
    const job = await this.store.getGenerationJob(jobId);
    if (!job) throw new NotFoundException("Generation job not found");
    await this.requireProject(job.projectId);
    return this.media.getJob(jobId);
  }

  private async requireProject(id: string): Promise<Project> {
    const project = await this.store.get(id);
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }
}
