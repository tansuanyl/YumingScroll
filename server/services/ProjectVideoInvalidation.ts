import type { Project, VideoFlow } from "../../src/types/domain";
import { syncProjectWithSeedanceSegments } from "./ProjectDerivation";

export function invalidateVideoOutputsForChangedSeedanceScript(project: Project, existing: Project): Project {
  const syncedProject = syncProjectWithSeedanceSegments(project);
  if (normalizeScript(project.storyState.seedanceScript) === normalizeScript(existing.storyState.seedanceScript)) {
    return syncedProject;
  }

  return {
    ...syncedProject,
    status: "text-ready",
    videoFlows: syncedProject.videoFlows.map(clearVideoOutputForScriptChange)
  };
}

export function clearVideoOutputForScriptChange(flow: VideoFlow): VideoFlow {
  return {
    ...flow,
    videoAssetId: undefined,
    pendingVideoJobId: undefined,
    firstFrameImageAssetId: undefined,
    lastFrameImageAssetId: undefined,
    status: flow.status === "failed" ? "failed" : "idle",
    nodes: {
      ...flow.nodes,
      videoNode: { ...flow.nodes.videoNode, status: "idle", stale: true, error: undefined },
      previewNode: { ...flow.nodes.previewNode, status: "idle", stale: true, error: undefined }
    }
  };
}

function normalizeScript(script: string | undefined): string {
  return (script || "").replace(/\r\n/g, "\n").trim();
}
