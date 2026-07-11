import type { Project } from "../types/domain";

export function updateCharacterConsistencyPrompt(project: Project, modelId: string, consistencyPrompt: string): Project {
  return {
    ...project,
    characterModels: project.characterModels.map((model) => {
      if (model.id !== modelId) return model;

      return {
        ...model,
        consistencyPrompt,
        status: model.status === "generating" ? model.status : "idle",
        error: undefined
      };
    })
  };
}
