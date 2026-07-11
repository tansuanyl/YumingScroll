import { describe, expect, it } from "vitest";
import { videoAspectRatioSchema, videoSchema } from "../server/schemas";

describe("video aspect ratio validation", () => {
  it("accepts all final video production ratios", () => {
    expect(videoAspectRatioSchema.options).toEqual(["9:16", "16:9", "9:21", "21:9"]);
    for (const aspectRatio of videoAspectRatioSchema.options) {
      expect(videoAspectRatioSchema.parse(aspectRatio)).toBe(aspectRatio);
    }
  });

  it("allows ultra-wide and ultra-tall ratios in video generation requests", () => {
    expect(() =>
      videoSchema.parse({
        projectId: "project-1",
        flowId: "flow-1",
        characterModelIds: ["character-1"],
        sceneModelIds: ["scene-1"],
        prompt: "15s video prompt",
        aspectRatio: "9:21",
        durationSeconds: 15
      })
    ).not.toThrow();
  });
});
