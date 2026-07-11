import { describe, expect, it } from "vitest";
import { invalidateVideoOutputsForChangedSeedanceScript } from "../server/services/ProjectVideoInvalidation";
import { createDemoProject } from "../src/data/demoProject";

describe("project video invalidation", () => {
  it("clears stale generated videos when the Seedance script changes", () => {
    const existing = createDemoProject();
    existing.storyState.seedanceScript = "第 1 段 15 秒：旧脚本";
    existing.videoFlows[0] = {
      ...existing.videoFlows[0],
      videoAssetId: "asset-old-video",
      pendingVideoJobId: "job-old-video",
      status: "ready",
      nodes: {
        ...existing.videoFlows[0].nodes,
        videoNode: { ...existing.videoFlows[0].nodes.videoNode, status: "ready", stale: false },
        previewNode: { ...existing.videoFlows[0].nodes.previewNode, status: "ready", stale: false }
      }
    };

    const incoming = {
      ...existing,
      storyState: {
        ...existing.storyState,
        seedanceScript: "第 1 段 15 秒：新脚本"
      }
    };

    const sanitized = invalidateVideoOutputsForChangedSeedanceScript(incoming, existing);

    expect(sanitized.videoFlows[0].videoAssetId).toBeUndefined();
    expect(sanitized.videoFlows[0].pendingVideoJobId).toBeUndefined();
    expect(sanitized.videoFlows[0].status).toBe("idle");
    expect(sanitized.videoFlows[0].nodes.videoNode.status).toBe("idle");
    expect(sanitized.videoFlows[0].nodes.videoNode.stale).toBe(true);
    expect(sanitized.videoFlows[0].nodes.previewNode.status).toBe("idle");
    expect(sanitized.videoFlows[0].nodes.previewNode.stale).toBe(true);
  });

  it("keeps ready videos when the Seedance script is unchanged", () => {
    const existing = createDemoProject();
    existing.storyState.seedanceScript = "第 1 段 15 秒：相同脚本";
    existing.videoFlows[0] = {
      ...existing.videoFlows[0],
      videoAssetId: "asset-current-video",
      status: "ready",
      nodes: {
        ...existing.videoFlows[0].nodes,
        videoNode: { ...existing.videoFlows[0].nodes.videoNode, status: "ready", stale: false }
      }
    };

    const sanitized = invalidateVideoOutputsForChangedSeedanceScript({ ...existing }, existing);

    expect(sanitized.videoFlows[0].videoAssetId).toBe("asset-current-video");
    expect(sanitized.videoFlows[0].nodes.videoNode.status).toBe("ready");
    expect(sanitized.videoFlows[0].nodes.videoNode.stale).toBe(false);
  });
});
