import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/data/demoProject";
import { normalizeProjectVideoFlows } from "../src/lib/projectFlowSync";

describe("project Flow Map sync", () => {
  it("creates Flow Map video segments from Seedance script segment count", () => {
    const project = createDemoProject();
    const synced = normalizeProjectVideoFlows({
      ...project,
      storyState: {
        ...project.storyState,
        seedanceScript: `${project.storyState.seedanceScript}

第 3 段 15 秒：无人机雨幕追击
分镜 1（0-5 秒）：中景 / 林澈冲进小巷
景别：中景。
运镜：手持跟拍林澈冲入狭窄雨巷。
动作：林澈回头确认越铭跟上，无人机红点扫过墙面。
台词：林澈：“它们追上来了。”
场景：新东京下层区小巷。`
      },
      videoFlows: project.videoFlows
    });

    expect(countSeedanceSegments(synced.storyState.seedanceScript)).toBe(3);
    expect(synced.storyState.storyboard).toHaveLength(3);
    expect(synced.videoFlows).toHaveLength(3);
    expect(synced.videoFlows[2]).toMatchObject({
      id: "flow-shot-seedance-segment-3",
      shotId: "shot-seedance-segment-3",
      prompt: expect.stringContaining("第 3 段 15 秒")
    });
  });
});

function countSeedanceSegments(script: string): number {
  return script.match(/第\s*\d+\s*段\s*15\s*(?:秒|s)/g)?.length || 0;
}
