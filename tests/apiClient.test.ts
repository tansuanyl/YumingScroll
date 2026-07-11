import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowEdge } from "../src/types/domain";

describe("apiClient workflow edges", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and deletes workflow edges through project routes", async () => {
    const { apiClient } = await import("../src/lib/apiClient");
    const edgeInput = {
      sourceType: "characterModel",
      sourceId: "model-character-lin",
      sourcePort: "output",
      targetType: "videoFlow",
      targetId: "flow-shot-1",
      targetPort: "character",
      kind: "character-reference",
      metadata: { fromFlowId: "flow-shot-2" }
    } satisfies Omit<WorkflowEdge, "id" | "createdAt" | "updatedAt">;
    const createdEdge: WorkflowEdge = { ...edgeInput, id: "edge-1" };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse(createdEdge, 201))
      .mockResolvedValueOnce(emptyResponse(204));

    await expect(apiClient.createWorkflowEdge("project-1", edgeInput)).resolves.toEqual(createdEdge);
    await expect(apiClient.deleteWorkflowEdge("project-1", "edge-1")).resolves.toEqual({});

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/projects/project-1/workflow-edges",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(edgeInput)
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/projects/project-1/workflow-edges/edge-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("shows the generate-story timeout copy for timeout-like backend errors", async () => {
    const { apiClient } = await import("../src/lib/apiClient");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: "Request timed out." }, 500));

    await expect(apiClient.generateStory("project-1", { inspiration: "timeout case" })).rejects.toThrow(
      "文本生成等待时间过长"
    );
  });

  it("shows the generate-story retry copy when the API proxy reports a socket hang up", async () => {
    const { apiClient } = await import("../src/lib/apiClient");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: "socket hang up" }, 502));

    await expect(apiClient.generateStory("project-1", { inspiration: "socket reset case" })).rejects.toThrow(
      "文本生成等待时间过长"
    );
  });

  it("shows the generate-story retry copy when the API proxy reports DNS resolution failure", async () => {
    const { apiClient } = await import("../src/lib/apiClient");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: "getaddrinfo EAI_AGAIN api" }, 502));

    await expect(apiClient.generateStory("project-1", { inspiration: "dns case" })).rejects.toThrow(
      "文本生成等待时间过长"
    );
  });

  it("shows the generate-story retry copy when fetch is reset before a response arrives", async () => {
    const { apiClient } = await import("../src/lib/apiClient");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
      Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })
    );

    await expect(apiClient.generateStory("project-1", { inspiration: "socket reset case" })).rejects.toThrow(
      "文本生成等待时间过长"
    );
  });

  it("shows the import-source timeout copy for long novel imports", async () => {
    const { apiClient } = await import("../src/lib/apiClient");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ error: "Request timed out." }, 500));

    await expect(apiClient.importSource("project-1", { sourceText: "很长的小说正文".repeat(20) })).rejects.toThrow(
      "长篇小说导入等待时间过长"
    );
  });

  it("shows the import-source timeout copy when the gateway returns 504 without JSON", async () => {
    const { apiClient } = await import("../src/lib/apiClient");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<html>Gateway Timeout</html>", { status: 504 }));

    await expect(apiClient.importSource("project-1", { sourceText: "很长的小说正文".repeat(20) })).rejects.toThrow(
      "长篇小说导入等待时间过长"
    );
  });

  it("sends the selected text model with story generation requests", async () => {
    const { apiClient } = await import("../src/lib/apiClient");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ id: "project-1" }));

    await apiClient.generateStory("project-1", {
      inspiration: "model choice",
      textModel: "gpt-5.5"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/text/generate-story",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          projectId: "project-1",
          inspiration: "model choice",
          textModel: "gpt-5.5"
        })
      })
    );
  });

  it("sends the selected visual style with story generation requests", async () => {
    const { apiClient } = await import("../src/lib/apiClient");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(jsonResponse({ id: "project-1" }));

    await apiClient.generateStory("project-1", {
      inspiration: "style choice",
      textModel: "kimi-k2.6",
      visualStyleId: "suspense-guoman"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/text/generate-story",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          projectId: "project-1",
          inspiration: "style choice",
          textModel: "kimi-k2.6",
          visualStyleId: "suspense-guoman"
        })
      })
    );
  });

  it("builds backend asset preview and download URLs", async () => {
    const { apiClient } = await import("../src/lib/apiClient");

    expect(apiClient.assetFileUrl("project 1", "asset/image")).toBe("/api/projects/project%201/assets/asset%2Fimage/file");
    expect(apiClient.assetDownloadUrl("project 1", "asset/image")).toBe(
      "/api/projects/project%201/assets/asset%2Fimage/download"
    );
  });

  it("falls back to the same-origin API proxy when deployed with a local API URL", async () => {
    const { shouldUseSameOriginApiProxy } = await import("../src/lib/apiClient");

    expect(
      shouldUseSameOriginApiProxy("http://127.0.0.1:8787", {
        hostname: "comic.example.com",
        origin: "https://comic.example.com",
        protocol: "https:"
      })
    ).toBe(true);
    expect(
      shouldUseSameOriginApiProxy("http://127.0.0.1:8787", {
        hostname: "127.0.0.1",
        origin: "http://127.0.0.1:5173",
        protocol: "http:"
      })
    ).toBe(false);
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload)
  } as Response;
}

function emptyResponse(status = 204): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error("No body"))
  } as Response;
}
