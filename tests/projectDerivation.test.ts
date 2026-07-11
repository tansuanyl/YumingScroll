import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/data/demoProject";
import { deriveVideoFlows, syncProjectWithSeedanceSegments, syncStoryStateWithSeedanceSegments } from "../server/services/ProjectDerivation";
import { invalidateVideoOutputsForChangedSeedanceScript } from "../server/services/ProjectVideoInvalidation";
import { ProjectStore } from "../server/services/ProjectStore";

describe("project derivation", () => {
  it("adds storyboard and video flow entries for extra Seedance 15 second segments", () => {
    const project = createDemoProject();
    const projectWithThirdScriptSegment = {
      ...project,
      storyState: {
        ...project.storyState,
        seedanceScript: `${project.storyState.seedanceScript}

第 3 段 15 秒：无人机雨幕追击
分镜 1（0-5 秒）：中景 / 林澈冲进小巷
景别：中景。
运镜：手持跟拍林澈冲入狭窄雨巷。
主角：林澈，越铭。
动作：林澈回头确认越铭跟上，无人机红点扫过墙面。
台词：林澈：“它们追上来了。”
光影：红色扫描光切过冷蓝雨幕。
场景：新东京下层区小巷。`
      }
    };

    const storyState = syncStoryStateWithSeedanceSegments(projectWithThirdScriptSegment.storyState);
    expect(storyState.storyboard).toHaveLength(3);
    expect(storyState.visualPrompts).toHaveLength(3);
    expect(storyState.storyboard[2]).toMatchObject({
      id: "shot-seedance-segment-3",
      shotType: "中景。",
      cameraMovement: "手持跟拍林澈冲入狭窄雨巷。",
      background: "新东京下层区小巷。",
      dialogue: "林澈：“它们追上来了。”"
    });

    const syncedProject = syncProjectWithSeedanceSegments(projectWithThirdScriptSegment);
    expect(syncedProject.videoFlows).toHaveLength(3);
    expect(syncedProject.videoFlows[0]).toBe(project.videoFlows[0]);
    expect(syncedProject.videoFlows[2]).toMatchObject({
      id: "flow-shot-seedance-segment-3",
      shotId: "shot-seedance-segment-3",
      durationSeconds: 15,
      aspectRatio: "9:16",
      prompt: expect.stringContaining("第 3 段 15 秒")
    });

    expect(deriveVideoFlows(projectWithThirdScriptSegment.storyState)).toHaveLength(3);
  });

  it("does not rewrite optimized Seedance scripts when storyboard has more video segments", () => {
    const project = createDemoProject();
    const originalScript = project.storyState.seedanceScript;
    const thirdShot = {
      ...project.storyState.storyboard[1],
      id: "shot-extra-flow-3",
      sceneId: "scene-extra-flow-3",
      order: 3,
      shotType: "近景",
      composition: "越铭挡住扫来的无人机红光",
      characterActions: "越铭抬手挡住红色锁定光，示意林澈继续跑。",
      background: "霓虹雨巷入口",
      videoPrompt: "越铭挡住扫来的无人机红光。"
    };
    const storyState = syncStoryStateWithSeedanceSegments({
      ...project.storyState,
      storyboard: [...project.storyState.storyboard, thirdShot],
      visualPrompts: project.storyState.visualPrompts
    });

    expect(storyState.storyboard).toHaveLength(3);
    expect(storyState.seedanceScript).toBe(originalScript);
  });

  it("normalizes mismatched stored projects on read", async () => {
    const dir = await mkdtemp(join(tmpdir(), "comic-flow-sync-"));
    try {
      const store = new ProjectStore(join(dir, "projects.json"));
      const project = createDemoProject();
      await store.save({
        ...project,
        storyState: {
          ...project.storyState,
          seedanceScript: `${project.storyState.seedanceScript}

第 3 段 15 秒：追踪无人机逼近
分镜 1（0-5 秒）：大全景 / 雨夜街区上空
景别：大全景。
运镜：镜头从广告屏后拉远。
动作：无人机群从高处压下，林澈和越铭转身奔跑。
台词：无。
场景：新东京下层区霓虹街道。`
        },
        videoFlows: project.videoFlows
      });

      const saved = await store.get(project.id);
      expect(saved?.storyState.storyboard).toHaveLength(3);
      expect(saved?.videoFlows).toHaveLength(3);
      expect(countSeedanceSegments(saved?.storyState.seedanceScript || "")).toBe(3);
      expect(saved?.workflowEdges.some((edge) => edge.sourceId === "shot-seedance-segment-3")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("syncs added script segments when a Seedance revision changes the script", () => {
    const project = createDemoProject({
      videoFlows: createDemoProject().videoFlows.map((flow, index) =>
        index === 0
          ? {
              ...flow,
              videoAssetId: "asset-old-video",
              status: "ready",
              nodes: {
                ...flow.nodes,
                videoNode: { ...flow.nodes.videoNode, status: "ready" },
                previewNode: { ...flow.nodes.previewNode, status: "ready" }
              }
            }
          : flow
      )
    });
    const revised = invalidateVideoOutputsForChangedSeedanceScript(
      {
        ...project,
        storyState: {
          ...project.storyState,
          seedanceScript: `${project.storyState.seedanceScript}

第 3 段 15s：越铭挡住追击
分镜 1（0-5 秒）：近景 / 越铭抬手
景别：近景。
运镜：快速推近越铭抬起的手。
动作：越铭挡住扫来的红色锁定光，示意林澈继续跑。
台词：越铭：“别回头。”
场景：霓虹雨巷入口。`
        }
      },
      project
    );

    expect(revised.storyState.storyboard).toHaveLength(3);
    expect(revised.videoFlows).toHaveLength(3);
    expect(revised.videoFlows[0]).toMatchObject({
      videoAssetId: undefined,
      status: "idle",
      nodes: {
        videoNode: { stale: true },
        previewNode: { stale: true }
      }
    });
    expect(revised.videoFlows[2].shotId).toBe("shot-seedance-segment-3");
  });
});

function countSeedanceSegments(script: string): number {
  return script.match(/第\s*\d+\s*段\s*15\s*(?:秒|s)/g)?.length || 0;
}
