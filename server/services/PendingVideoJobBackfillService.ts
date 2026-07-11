import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { MediaPipelineService } from "./MediaPipelineService";
import type { ProjectStore } from "./ProjectStore";
import { PROJECT_STORE } from "../nest/tokens";

@Injectable()
export class PendingVideoJobBackfillService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(PROJECT_STORE) private readonly store: ProjectStore,
    @Inject(MediaPipelineService) private readonly media: MediaPipelineService
  ) {}

  onModuleInit() {
    if (process.env.PENDING_VIDEO_JOB_BACKFILL === "false") return;
    const intervalMs = getSweepIntervalMs();
    this.timer = setInterval(() => {
      void this.sweep(intervalMs);
    }, intervalMs);
    this.timer.unref?.();
    void this.sweep(intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep(intervalMs: number): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const projects = await this.store.list();
      for (const project of projects) {
        if (!project.videoFlows.some((flow) => flow.status === "generating" && flow.pendingVideoJobId)) continue;
        await this.media.refreshPendingVideoJobs(project.id, {
          minRefreshIntervalMs: Math.max(5000, Math.floor(intervalMs / 2))
        });
      }
    } catch (error) {
      console.warn(
        "[pending-video-backfill] refresh failed",
        error instanceof Error ? error.message : "unknown error"
      );
    } finally {
      this.running = false;
    }
  }
}

function getSweepIntervalMs(): number {
  const value = Number(process.env.PENDING_VIDEO_JOB_SWEEP_INTERVAL_MS ?? 30000);
  if (!Number.isFinite(value) || value < 5000) return 30000;
  return value;
}
