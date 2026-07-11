import { describe, expect, it } from "vitest";
import { createDemoProject } from "../src/data/demoProject";
import { generateStoryInNewHomeProject, importSourceInNewHomeProject } from "../src/lib/homeProjectGeneration";
import type { Project } from "../src/types/domain";

describe("home project generation", () => {
  it("creates a new project before generating story text", async () => {
    const currentProject = createDemoProject({ id: "project-current" });
    const draftProject = createDemoProject({ id: "project-new-draft", inspiration: "武侠破庙" });
    const generatedProject = { ...draftProject, status: "text-ready" as const };
    const calls: string[] = [];

    const result = await generateStoryInNewHomeProject(
      {
        createProject: async (input: { title?: string; inspiration?: string }) => {
          calls.push(`create:${input.inspiration}`);
          return draftProject;
        },
        generateStory: async (projectId: string) => {
          calls.push(`generate:${projectId}`);
          return generatedProject as Project;
        }
      },
      {
        currentProjectId: currentProject.id,
        prompt: "武侠破庙",
        textModel: "gpt-5.5"
      }
    );

    expect(result.draftProject.id).toBe(draftProject.id);
    expect(result.generatedProject.id).toBe(draftProject.id);
    expect(calls).toEqual(["create:武侠破庙", "generate:project-new-draft"]);
    expect(calls).not.toContain(`generate:${currentProject.id}`);
  });

  it("creates a new project before importing a source file from the home page", async () => {
    const draftProject = createDemoProject({ id: "project-source-draft", inspiration: "novel.txt" });
    const importedProject = { ...draftProject, status: "text-ready" as const };
    const calls: string[] = [];

    const result = await importSourceInNewHomeProject(
      {
        createProject: async (input: { title?: string; inspiration?: string }) => {
          calls.push(`create:${input.inspiration}`);
          return draftProject;
        },
        importSource: async (projectId: string, input: { sourceFile?: { fileName: string; base64: string } }) => {
          calls.push(`import:${projectId}:${input.sourceFile?.fileName}`);
          return importedProject as Project;
        }
      },
      {
        sourceFile: {
          fileName: "novel.txt",
          mimeType: "text/plain",
          base64: "5bCP6K+05q2j5paH"
        },
        textModel: "kimi-k2.6"
      }
    );

    expect(result.draftProject.id).toBe(draftProject.id);
    expect(result.generatedProject.id).toBe(draftProject.id);
    expect(calls).toEqual(["create:novel.txt", "import:project-source-draft:novel.txt"]);
  });
});
