import { describe, expect, it } from "vitest";
import {
  buildStyleVideoReferenceNote,
  buildVideoPrompt,
  formatStoryboardShot,
  hasRecoveredVideoGenerationResult,
  isRecoverableVideoGenerationRequestError,
  isVideoGenerationCancellable
} from "../src/components/VideoFlowMap";
import { createDemoProject } from "../src/data/demoProject";
import { startVideoGeneration } from "../src/lib/generationCancellation";
import type { StoryState, StoryboardShot, VideoFlow } from "../src/types/domain";

describe("Seedance video prompt continuity", () => {
  it("recognizes disconnected video requests as recoverable while waiting for backend state", () => {
    const project = createDemoProject();
    const flowId = project.videoFlows[0].id;
    const pendingProject = startVideoGeneration(project, flowId, "video-request-1");
    const submittedProject = {
      ...pendingProject,
      videoFlows: pendingProject.videoFlows.map((flow) =>
        flow.id === flowId ? { ...flow, pendingVideoJobId: "video-job-1" } : flow
      )
    };
    const otherRequestProject = startVideoGeneration(project, flowId, "video-request-2");

    expect(isRecoverableVideoGenerationRequestError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRecoverableVideoGenerationRequestError(new Error("Video flow not found"))).toBe(false);
    expect(hasRecoveredVideoGenerationResult(pendingProject, flowId, "video-request-1")).toBe(false);
    expect(hasRecoveredVideoGenerationResult(submittedProject, flowId, "video-request-1")).toBe(true);
    expect(hasRecoveredVideoGenerationResult(otherRequestProject, flowId, "video-request-1")).toBe(false);
  });

  it("only shows video cancellation when the selected flow is actually generating", () => {
    const project = createDemoProject();
    const idleFlow = project.videoFlows[0];
    const generatingProject = startVideoGeneration(project, idleFlow.id, "video-request-1");
    const generatingFlow = generatingProject.videoFlows[0];

    expect(isVideoGenerationCancellable(idleFlow)).toBe(false);
    expect(isVideoGenerationCancellable(generatingFlow)).toBe(true);
    expect(isVideoGenerationCancellable({
      ...idleFlow,
      pendingVideoJobId: "video-job-1"
    })).toBe(true);
  });

  it("links adjacent 15-second segments with first and last frame continuity", () => {
    const prompt = buildVideoPrompt(
      [
        "第 2 段 15 秒：车厢中段推进",
        "分镜 3（10-15 秒）：特写 / 段落收束",
        "运镜：从角色反应切到当前段落结果，再快速切黑或转场。",
        "动作：陈策转身看向车厢后方。",
        "场景：昏暗大客车车厢。"
      ].join("\n"),
      "半写实国漫悬疑风，冷蓝灰色调",
      {
        segmentIndex: 1,
        previousSegmentScript: "第 1 段 15 秒：结尾停在陈策坐直、路灯扫过侧脸的画面。",
        nextSegmentScript: "第 3 段 15 秒：开头承接陈策抱头，镜头继续向车厢前方推进。"
      }
    );

    expect(prompt).toContain("首尾帧连续");
    expect(prompt).toContain("上一段末帧");
    expect(prompt).toContain("下一段首帧");
    expect(prompt).toContain("第 2 段");
    expect(prompt).not.toContain("切黑");
    expect(prompt).not.toContain("黑屏");
    expect(prompt).not.toContain("眨眼");
  });

  it("adds project-level character and style locks for consistent generated videos", () => {
    const prompt = buildVideoPrompt(
      "第 1 段 15 秒：陈策在深夜大客车中醒来。",
      "成片类型：2D 半写实国漫悬疑短剧。禁忌：不要真人照片风，不要 3D。",
      { segmentIndex: 0 },
      {
        referenceImageNotes: [
          "人物模型图：陈策。固定脸型、短黑发、灰色外套。",
          "场景模型图：深夜大客车车厢。",
          "风格参考图：2D 半写实国漫悬疑风。"
        ],
        characterLockPrompts: ["陈策：固定短黑发、灰色外套、年轻男性比例。"]
      }
    );

    expect(prompt).toContain("@Image1 = 人物模型图：陈策");
    expect(prompt).toContain("陈策：固定短黑发");
    expect(prompt).toContain("同一项目所有 15 秒片段必须保持同一套人物模型和画风");
    expect(prompt).toContain("不要真人照片风");
    expect(prompt).toContain("不要 3D");
  });

  it("keeps the current 15-second script above references and blocks inactive roster characters", () => {
    const prompt = buildVideoPrompt(
      [
        "整体统一设定",
        "人物：陈策，顾帅，谭一峰。",
        "",
        "第 1 段 15 秒：惊醒",
        "分镜 1（0-5 秒）：特写 / 惊醒",
        "主角：陈策。",
        "动作：陈策缓缓睁眼，瞳孔收缩适应黑暗，迷茫转动眼球打量四周。",
        "场景：大客车内部，后门第一排座椅，窗外微弱光线间歇扫过。",
        "",
        "分镜 2（5-10 秒）：近景 / 当前动作推进",
        "主角：陈策。",
        "动作：陈策坐直身体，抬眼望向车厢前排模糊人影。"
      ].join("\n"),
      "半写实国漫悬疑风，冷蓝灰色调",
      { segmentIndex: 0 },
      {
        activeCharacterNames: ["陈策"],
        referenceImageNotes: [
          "人物模型图：陈策。固定脸型、短黑发、灰色外套。",
          "人物模型图：谭一峰。壮硕男性，短发，黑色外套。"
        ],
        characterLockPrompts: [
          "陈策：固定短黑发、灰色外套、年轻男性比例。",
          "谭一峰：壮硕男性，短发，黑色外套。"
        ]
      }
    );

    expect(prompt.indexOf("当前 15 秒唯一剧情脚本")).toBeLessThan(prompt.indexOf("参考图规则"));
    expect(prompt).toContain("本段实际出镜人物：陈策");
    expect(prompt).toContain("未在本段实际出镜人物中的角色不得出镜");
    expect(prompt).toContain("参考图只锁定身份、人物外观、场景结构和画风，不提供本段动作、镜头或剧情");
  });

  it("does not recycle previous video prompts as style reference directions", () => {
    const storyState = {
      world: { styleKeywords: ["半写实国漫", "冷蓝灰悬疑"] }
    } as StoryState;
    const staleFlow = {
      imagePrompt: "",
      prompt: [
        "上一次完整视频请求。",
        "第 11 段 15 秒：不应该进入 SB01。",
        "台词：顾帅：“玩儿呢？小爷藏鞋垫里的100块救命钱都没了？”"
      ].join("\n")
    } as VideoFlow;

    const note = buildStyleVideoReferenceNote(storyState, staleFlow);

    expect(note).toContain("风格参考图");
    expect(note).not.toContain("第 11 段");
    expect(note).not.toContain("藏鞋垫");
    expect(note).not.toContain("上一次完整视频请求");
  });

  it("extracts the Seedance segment from the storyboard id instead of stale flow order", () => {
    const seedanceScript = [
      "整体统一设定",
      "人物：陈策，顾帅，谭一峰。",
      "",
      "第 1 段 15 秒：惊醒",
      "分镜 1（0-5 秒）：",
      "主角：陈策。",
      "台词：陈策：“这是……大客车？”",
      "",
      "第 11 段 15 秒：物品消失",
      "分镜 1（0-5 秒）：",
      "主角：顾帅。",
      "台词：顾帅：“玩儿呢？小爷藏鞋垫里的100块救命钱都没了？”"
    ].join("\n");
    const shot = { id: "SB01", shotType: "惊醒" } as StoryboardShot;
    const flow = { shotId: "SB01" } as VideoFlow;

    const segment = formatStoryboardShot(shot, flow, 10, seedanceScript);

    expect(segment).toContain("第 1 段 15 秒：惊醒");
    expect(segment).toContain("这是……大客车");
    expect(segment).not.toContain("第 11 段");
    expect(segment).not.toContain("藏鞋垫");
  });

  it("extracts Kimi-optimized bracketed Seedance segment headings", () => {
    const seedanceScript = [
      "《破庙的残阳》E01《异常开启》Seedance 2.0 优化分镜脚本",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "【整体统一设定】",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "画风选择：写实剧照。",
      "人物：沈砚，苏衍。",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "【第 1 段 15 秒：对峙与试探】",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "分镜 1（0-5 秒）：全景 → 中景 / 建立场景与对峙关系",
      "台词：沈砚：“把《青岚诀》交出来，我饶你不死。”",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "【第 2 段 15 秒：缠斗与试探】",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "分镜 1（0-5 秒）：中景 / 缠斗动作推进",
      "动作：0.0-2.0秒：沈砚招式狠厉，素铁剑直取要害；苏衍留有余地，软剑缠绕化解。",
      "台词：沈砚：“何必挣扎？”",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "【第 3 段 15 秒：真相与震撼】",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "分镜 1（0-5 秒）：特写 → 近景 / 遗书揭示",
      "台词：苏衍：“师父临终前说，你体内戾气过重，若得剑谱必走火入魔。”"
    ].join("\n");
    const shot = { id: "SB02", shotType: "粗略近景" } as StoryboardShot;
    const flow = { shotId: "SB02", cameraMovement: "粗略推进", actionDescription: "旧动作" } as VideoFlow;

    const segment = formatStoryboardShot(shot, flow, 1, seedanceScript);

    expect(segment).toContain("【整体统一设定】");
    expect(segment).toContain("【第 2 段 15 秒：缠斗与试探】");
    expect(segment).toContain("0.0-2.0秒：沈砚招式狠厉");
    expect(segment).toContain("沈砚：“何必挣扎？”");
    expect(segment).not.toContain("第 1 段 15 秒：对峙与试探");
    expect(segment).not.toContain("第 3 段 15 秒：真相与震撼");
    expect(segment).not.toContain("旧动作");
  });

  it("does not leak next segment story or dialogue through continuity hints", () => {
    const prompt = buildVideoPrompt(
      [
        "第 1 段 15 秒：惊醒",
        "分镜 1（0-5 秒）：",
        "主角：陈策。",
        "台词：陈策：“这是……大客车？”"
      ].join("\n"),
      "半写实国漫悬疑风",
      {
        segmentIndex: 0,
        nextSegmentScript: [
          "第 11 段 15 秒：物品消失",
          "分镜 1（0-5 秒）：",
          "主角：顾帅。",
          "台词：顾帅：“玩儿呢？小爷藏鞋垫里的100块救命钱都没了？”"
        ].join("\n")
      }
    );

    expect(prompt).toContain("下一段首帧");
    expect(prompt).toContain("不要提前生成下一段剧情或台词");
    expect(prompt).not.toContain("第 11 段");
    expect(prompt).not.toContain("藏鞋垫");
  });
});
