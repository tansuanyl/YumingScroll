import { afterEach, describe, expect, it, vi } from "vitest";
import { SeedanceMediaProvider } from "../server/providers/SeedanceMediaProvider";

describe("SeedanceMediaProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends character image requests as three complete turnaround sheet candidates", async () => {
    vi.stubEnv("SEEDANCE_MOCK", "false");
    vi.stubEnv("SEEDANCE_PROVIDER", "ark");
    vi.stubEnv("SEEDANCE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3");
    vi.stubEnv("SEEDANCE_API_KEY", "unit-test-provider-key");
    vi.stubEnv("SEEDANCE_IMAGE_MODEL", "doubao-seedance-2-0-260128");

    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body));
        requestBodies.push(requestBody);
        const index = requestBodies.length;
        return new Response(
          JSON.stringify({
            id: "image-job-test",
            data: [{ url: `https://example.com/turnaround-${index}.png` }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) satisfies typeof fetch
    );

    const provider = new SeedanceMediaProvider({ mock: false });
    const result = await provider.generateCharacterImage({
      kind: "character",
      prompt: "林彻，角色定妆图，人物三视图，正面、侧面、背面同屏排列",
      imageAspectRatio: "9:16"
    });

    expect(result.assets).toHaveLength(3);
    expect(requestBodies).toHaveLength(3);
    for (const requestBody of requestBodies) {
      expect(requestBody.n).toBe(1);
      expect(requestBody.prompt).toContain("角色设计三视图，纯白色背景");
      expect(requestBody.prompt).toContain("风格基调");
      expect(requestBody.prompt).toContain("每一张候选图都必须是一张完整的人物三视图设定表");
      expect(requestBody.prompt).toContain("方案差异要求");
      expect(requestBody.prompt).toContain("不要把正面、侧面、背面拆分成三张候选图");
      expect(requestBody.prompt).not.toContain("Generate exactly 3 distinct candidate images");
      expect(requestBody).not.toHaveProperty("sequential_image_generation");
      expect(requestBody).not.toHaveProperty("seed");
      expect(requestBody).not.toHaveProperty("temperature");
    }
    expect(requestBodies.map((body) => body.prompt)).toEqual([
      expect.stringContaining("候选方案 1：标准定妆版"),
      expect.stringContaining("候选方案 2：轮廓强化版"),
      expect.stringContaining("候选方案 3：悬疑质感版")
    ]);
  });

  it("sends scene image candidates as independent one-image requests", async () => {
    vi.stubEnv("SEEDANCE_MOCK", "false");
    vi.stubEnv("SEEDANCE_PROVIDER", "ark");
    vi.stubEnv("SEEDANCE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3");
    vi.stubEnv("SEEDANCE_API_KEY", "unit-test-provider-key");
    vi.stubEnv("SEEDANCE_IMAGE_MODEL", "doubao-seedance-2-0-260128");

    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body));
        requestBodies.push(requestBody);
        const index = requestBodies.length;
        return new Response(
          JSON.stringify({
            id: "scene-job-test",
            data: [{ url: `https://example.com/scene-${index}.png` }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) satisfies typeof fetch
    );

    const provider = new SeedanceMediaProvider({ mock: false });
    const result = await provider.generateSceneImage({
      kind: "scene",
      prompt: "旧警局档案楼电梯，空场景，不要人物",
      imageAspectRatio: "16:9"
    });

    expect(result.assets).toHaveLength(3);
    expect(requestBodies).toHaveLength(3);
    for (const requestBody of requestBodies) {
      expect(requestBody.n).toBe(1);
      expect(requestBody.prompt).toContain("场景模型图");
      expect(requestBody.prompt).toContain("空间结构");
      expect(requestBody.prompt).toContain("视觉重点");
      expect(requestBody.prompt).toContain("方案差异要求");
      expect(requestBody.prompt).toContain("禁止只生成同一张图的轻微色彩变化");
      expect(requestBody).not.toHaveProperty("sequential_image_generation");
      expect(requestBody).not.toHaveProperty("seed");
      expect(requestBody).not.toHaveProperty("temperature");
    }
    expect(requestBodies.map((body) => body.prompt)).toEqual([
      expect.stringContaining("候选方案 1：空间结构版"),
      expect.stringContaining("候选方案 2：光影氛围版"),
      expect.stringContaining("候选方案 3：镜头调度版")
    ]);
  });

  it("passes reference images into Ark Seedream image candidate requests", async () => {
    vi.stubEnv("SEEDANCE_MOCK", "false");
    vi.stubEnv("SEEDANCE_PROVIDER", "ark");
    vi.stubEnv("SEEDANCE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3");
    vi.stubEnv("SEEDANCE_API_KEY", "unit-test-provider-key");
    vi.stubEnv("SEEDANCE_IMAGE_MODEL", "doubao-seedream-4-0-250828");

    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const requestBody = JSON.parse(String(init?.body));
        requestBodies.push(requestBody);
        const index = requestBodies.length;
        return new Response(
          JSON.stringify({
            id: "image-job-reference-test",
            data: [{ url: `https://example.com/reference-${index}.png` }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }) satisfies typeof fetch
    );

    const provider = new SeedanceMediaProvider({ mock: false });
    await provider.generateSceneImage({
      kind: "scene",
      prompt: "破庙残阳，水墨武侠风格，沿用已选人物模型",
      imageAspectRatio: "9:16",
      referenceImageUrls: ["https://example.com/shenyan-character.png"]
    } as Parameters<SeedanceMediaProvider["generateSceneImage"]>[0] & { referenceImageUrls: string[] });

    expect(requestBodies).toHaveLength(3);
    for (const requestBody of requestBodies) {
      expect(requestBody.image).toEqual(["https://example.com/shenyan-character.png"]);
    }
  });

  it("omits the generic video resolution for Ark Seedance 2.0 task requests", async () => {
    vi.stubEnv("SEEDANCE_MOCK", "false");
    vi.stubEnv("SEEDANCE_PROVIDER", "ark");
    vi.stubEnv("SEEDANCE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3");
    vi.stubEnv("SEEDANCE_API_KEY", "unit-test-provider-key");
    vi.stubEnv("SEEDANCE_VIDEO_MODEL", "doubao-seedance-2-0-260128");
    vi.stubEnv("SEEDANCE_VIDEO_RESOLUTION", "10180p");
    vi.stubEnv("SEEDANCE_VIDEO_SYNC_TIMEOUT_MS", "10");
    vi.stubEnv("SEEDANCE_VIDEO_POLL_INTERVAL_MS", "1");

    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) requestBodies.push(JSON.parse(String(init.body)));
        if (String(url).includes("/contents/generations/tasks/")) {
          return new Response(
            JSON.stringify({
              id: "video-task-test",
              status: "succeeded",
              content: { video_url: "https://example.com/video.mp4" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ id: "video-task-test", status: "queued" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }) satisfies typeof fetch
    );

    const provider = new SeedanceMediaProvider({ mock: false });
    const result = await provider.generateVideo({
      prompt: "A 15 second suspense sequence",
      characterImageUrls: ["https://example.com/character.png"],
      sceneImageUrls: ["https://example.com/scene.png"],
      durationSeconds: 15,
      aspectRatio: "21:9"
    });

    expect(result.status).toBe("ready");
    expect(requestBodies[0]).not.toHaveProperty("resolution");
    expect(requestBodies[0]?.ratio).toBe("21:9");
  });

  it("labels Ark video reference images so Seedance knows which image controls identity and style", async () => {
    vi.stubEnv("SEEDANCE_MOCK", "false");
    vi.stubEnv("SEEDANCE_PROVIDER", "ark");
    vi.stubEnv("SEEDANCE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3");
    vi.stubEnv("SEEDANCE_API_KEY", "unit-test-provider-key");
    vi.stubEnv("SEEDANCE_VIDEO_MODEL", "doubao-seedance-2-0-260128");
    vi.stubEnv("SEEDANCE_VIDEO_SYNC_TIMEOUT_MS", "10");
    vi.stubEnv("SEEDANCE_VIDEO_POLL_INTERVAL_MS", "1");
    vi.stubEnv("SEEDANCE_ALLOW_TEXT_ONLY_REFERENCE_FALLBACK", "true");

    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) requestBodies.push(JSON.parse(String(init.body)));
        if (String(url).includes("/contents/generations/tasks/")) {
          return new Response(
            JSON.stringify({
              id: "video-task-reference-test",
              status: "succeeded",
              content: { video_url: "https://example.com/video.mp4" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ id: "video-task-reference-test", status: "queued" }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }) satisfies typeof fetch
    );

    const provider = new SeedanceMediaProvider({ mock: false });
    await provider.generateVideo({
      prompt: "Current segment script",
      characterImageUrls: ["https://example.com/character.png"],
      sceneImageUrls: ["https://example.com/scene.png"],
      styleReferenceImageUrl: "https://example.com/style.png",
      referenceImageNotes: [
        "人物模型图：陈策。固定脸型、短黑发、灰色外套。",
        "场景模型图：深夜大客车车厢。",
        "风格参考图：2D 半写实国漫悬疑风。"
      ],
      durationSeconds: 15,
      aspectRatio: "9:16"
    } as Parameters<SeedanceMediaProvider["generateVideo"]>[0] & { referenceImageNotes: string[] });

    const body = requestBodies[0];
    const text = ((body.content as Array<{ type: string; text?: string }>)[0]?.text || "");
    expect(text).toContain("@Image1 = 人物模型图：陈策");
    expect(text).toContain("@Image2 = 场景模型图：深夜大客车车厢");
    expect(text).toContain("@Image3 = 风格参考图：2D 半写实国漫悬疑风");
    expect(text).toContain("当前片段文字脚本优先级最高");
    expect(text).toContain("不要重新设计人物");
    expect(text).toContain("唯一外观基准");
    expect(body.content).toHaveLength(4);
    expect(body.content).toEqual([
      expect.objectContaining({ type: "text" }),
      expect.objectContaining({ image_url: { url: "https://example.com/character.png" } }),
      expect.objectContaining({ image_url: { url: "https://example.com/scene.png" } }),
      expect.objectContaining({ image_url: { url: "https://example.com/style.png" } })
    ]);
  });

  it("stops Ark video generation when moderation blocks connected reference images", async () => {
    vi.stubEnv("SEEDANCE_MOCK", "false");
    vi.stubEnv("SEEDANCE_PROVIDER", "ark");
    vi.stubEnv("SEEDANCE_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3");
    vi.stubEnv("SEEDANCE_API_KEY", "unit-test-provider-key");
    vi.stubEnv("SEEDANCE_VIDEO_MODEL", "doubao-seedance-2-0-260128");
    vi.stubEnv("SEEDANCE_VIDEO_SYNC_TIMEOUT_MS", "10");
    vi.stubEnv("SEEDANCE_VIDEO_POLL_INTERVAL_MS", "1");

    const taskBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        if (init?.body) {
          const body = JSON.parse(String(init.body));
          taskBodies.push(body);
          if (taskBodies.length === 1) {
            return new Response(
              JSON.stringify({
                error: {
                  message: "The request failed because the input image may contain real person. Request id: blocked"
                }
              }),
              { status: 400, headers: { "content-type": "application/json" } }
            );
          }
          return new Response(JSON.stringify({ id: "video-task-text-fallback", status: "queued" }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }
        if (String(url).includes("/contents/generations/tasks/")) {
          return new Response(
            JSON.stringify({
              id: "video-task-text-fallback",
              status: "succeeded",
              content: { video_url: "https://example.com/text-fallback.mp4" }
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          );
        }
        throw new Error(`Unexpected request ${String(url)}`);
      }) satisfies typeof fetch
    );

    const provider = new SeedanceMediaProvider({ mock: false });
    await expect(provider.generateVideo({
      prompt: "Current segment script",
      characterImageUrls: ["https://example.com/character.png"],
      sceneImageUrls: ["https://example.com/scene.png"],
      referenceImageNotes: ["Character reference note", "Scene reference note"],
      durationSeconds: 15,
      aspectRatio: "9:16"
    } as Parameters<SeedanceMediaProvider["generateVideo"]>[0] & { referenceImageNotes: string[] })).rejects.toThrow(
      "参考图被视频服务安全审核拒绝"
    );

    expect(taskBodies).toHaveLength(1);
    expect(taskBodies[0].content).toEqual([
      expect.objectContaining({ type: "text" }),
      expect.objectContaining({ image_url: { url: "https://example.com/character.png" } }),
      expect.objectContaining({ image_url: { url: "https://example.com/scene.png" } })
    ]);
  });
});
