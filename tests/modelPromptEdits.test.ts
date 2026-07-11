import { describe, expect, it } from "vitest";
import { updateCharacterConsistencyPrompt } from "../src/lib/modelPromptEdits";
import type { Project } from "../src/types/domain";

function createProject(): Project {
  return {
    id: "project-1",
    title: "Test Project",
    inspiration: "",
    status: "models-ready",
    storyState: {
      world: {
        title: "",
        background: "",
        rules: [],
        factions: [],
        timeline: [],
        styleKeywords: []
      },
      characters: [],
      outline: "",
      script: [],
      storyboard: [],
      visualPrompts: [],
      seedanceScript: ""
    },
    characterModels: [
      {
        id: "character-1",
        characterId: "profile-1",
        name: "陈策",
        description: "核心主角",
        consistencyPrompt: "旧人物 Prompt",
        imageAspectRatio: "3:4",
        candidateImages: [
          {
            id: "asset-1",
            type: "image",
            url: "https://example.com/asset-1.png",
            provider: "mock",
            prompt: "旧人物 Prompt",
            createdAt: "2026-05-15T00:00:00.000Z"
          }
        ],
        confirmedImageId: "asset-1",
        status: "failed",
        error: "Previous failure"
      },
      {
        id: "character-2",
        characterId: "profile-2",
        name: "顾帅",
        description: "配角",
        consistencyPrompt: "顾帅 Prompt",
        candidateImages: [],
        status: "ready"
      }
    ],
    sceneModels: [],
    videoFlows: [],
    workflowEdges: [],
    assets: [],
    createdAt: "2026-05-15T00:00:00.000Z",
    updatedAt: "2026-05-15T00:00:00.000Z"
  };
}

describe("updateCharacterConsistencyPrompt", () => {
  it("updates only the target character prompt and resets editable prompt state", () => {
    const project = createProject();

    const next = updateCharacterConsistencyPrompt(project, "character-1", "新人物 Prompt");

    expect(next.characterModels[0]).toMatchObject({
      consistencyPrompt: "新人物 Prompt",
      status: "idle",
      error: undefined
    });
    expect(next.characterModels[0].candidateImages).toEqual(project.characterModels[0].candidateImages);
    expect(next.characterModels[0].confirmedImageId).toBe("asset-1");
    expect(next.characterModels[1]).toBe(project.characterModels[1]);
  });

  it("keeps generating models generating while editing their prompt", () => {
    const project = createProject();
    project.characterModels[0].status = "generating";

    const next = updateCharacterConsistencyPrompt(project, "character-1", "生成中的 Prompt");

    expect(next.characterModels[0].status).toBe("generating");
    expect(next.characterModels[0].consistencyPrompt).toBe("生成中的 Prompt");
  });
});
