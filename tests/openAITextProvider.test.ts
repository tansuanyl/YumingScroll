import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAITextProvider } from "../server/providers/OpenAITextProvider";
import { createDemoProject, deriveCharacterModelsFromStory, deriveSceneModelsFromStory } from "../src/data/demoProject";

describe("OpenAITextProvider chat mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses Kimi K2.6 through OpenAI-compatible chat completions", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      maxCompletionTokens: 1234,
      client: { chat: { completions: { create } } } as any
    });

    const generated = await provider.generateStory("test story");
    expect(generated).toMatchObject(storyState);
    expect(generated.promptOptimizerModel).toBe("kimi-k2.6");
    expect(generated.promptOptimizationEnabled).toBe(true);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "kimi-k2.6",
        max_tokens: 1234,
        thinking: { type: "disabled" },
        response_format: expect.objectContaining({
          type: "json_object"
        })
      })
    );
  });

  it("optimizes media prompts with the selected model and visual style contract", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "优化后的提示词：水墨武侠镜头，0-5 秒推进，5-10 秒对峙，10-15 秒尾帧衔接。" } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    const optimized = await provider.optimizeMediaPrompt({
      prompt: "原始 15 秒视频提示词",
      kind: "video",
      visualStyleLabel: "水墨武侠",
      visualStylePrompt: "宣纸肌理，墨色层次，克制留白。",
      storyContext: "人物：苏衍、沈砚",
      sourceReferenceText: "“何必挣扎？”沈砚步步紧逼，剑尖抵住苏衍咽喉。",
      textModel: "kimi-k2.6"
    });

    expect(optimized).toBe("水墨武侠镜头，0-5 秒推进，5-10 秒对峙，10-15 秒尾帧衔接。");
    const request = create.mock.calls[0]?.[0];
    const promptText = request.messages.map((message: { content: string }) => message.content).join("\n");
    expect(request.model).toBe("kimi-k2.6");
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(promptText).toContain("我将严格遵循水墨武侠画风");
    expect(promptText).toContain("15 秒分段要求");
    expect(promptText).toContain("并参考小说原文");
    expect(promptText).toContain("小说原文参考");
    expect(promptText).toContain("何必挣扎");
    expect(promptText).toContain("贴合即梦 / Seedance 2.0 生成需求");
    expect(promptText).toContain("不要把小说原文或整段剧情台词塞入人物定妆提示词");
    expect(promptText).toContain("原始 15 秒视频提示词");
  });

  it("optimizes full Seedance scripts with director-level shot requirements", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const create = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: [
              "优化后的分镜脚本：",
              "《破庙的残阳》E01《异常开启》Seedance 2.0 优化分镜脚本",
              "【整体统一设定】",
              "画风选择：写实剧照。",
              "人物：沈砚（深色衣袍，素铁剑），苏衍（浅色衣袍，软剑）。",
              "【第 1 段 15 秒：对峙与试探】",
              "对应原文段落：从沈砚索要剑谱到苏衍出手。",
              "分镜 1（0-5 秒）：全景 → 中景 / 建立场景",
              "景别：破庙全景。",
              "运镜：缓慢推镜。",
              "主角：沈砚、苏衍。",
              "动作：",
              "  0.0-2.0秒：残阳照进破庙，沈砚握剑对峙苏衍。",
              "  2.0-4.0秒：沈砚抬眼，剑尖斜指地面。",
              "  4.0-5.0秒：沈砚开口索要剑谱。",
              "台词：沈砚（冷冽）：\"把《青岚诀》交出来，我饶你不死。\"",
              "音效：风声，木梁吱呀。",
              "光影：侧逆光，残阳破碎。",
              "场景关键词：破庙、残阳、尘埃。",
              "分镜 2（5-10 秒）：中近景 → 近景 / 苏衍出手",
              "景别：中近景。",
              "运镜：横移跟拍。",
              "主角：苏衍、沈砚。",
              "动作：",
              "  5.0-6.5秒：苏衍嗤笑，手指抚过软剑。",
              "  6.5-8.0秒：苏衍欺身而上。",
              "  8.0-10.0秒：软剑寒光逼近沈砚。",
              "台词：苏衍（讽刺）：\"沈师兄，你我同门三年，竟为一本剑谱反目？\"",
              "音效：软剑出鞘声。",
              "光影：剑光映亮梁柱。",
              "场景关键词：软剑、衣袂、破庙梁柱。",
              "分镜 3（10-15 秒）：近景 → 特写 / 双剑交击",
              "景别：近景到特写。",
              "运镜：快速切换。",
              "主角：沈砚、苏衍。",
              "动作：",
              "  10.0-12.0秒：沈砚侧身避过。",
              "  12.0-14.0秒：双剑相撞，火星溅落。",
              "  14.0-15.0秒：苏衍眼神特写，保留试探意味。",
              "台词：无。",
              "音效：双剑铮鸣。",
              "光影：火星短暂照亮衣袖。",
              "场景关键词：双剑、火星、残阳。",
              "尾帧要求：停在苏衍眼神特写，可衔接下一段。",
              "本段尾帧描述：第 14.0-15.0 秒停在苏衍眼神特写，沈砚的素铁剑仍在画面边缘，残阳与火星余光同时落在两人面部。",
              "下一段首帧描述：下一段 0 秒从同一苏衍眼神特写拉开，承接残阳方向、剑身位置、两人站位和未散尽的火星余光。",
              "【人物一致性提示词】",
              "沈砚：古风男子，深色衣袍，素铁剑。",
              "【场景一致性提示词】",
              "破庙：残破古庙，残阳斜照。",
              "【关键道具提示词】",
              "素铁剑：古朴长剑。",
              "【氛围关键词】",
              "武侠、古风、同门、试探。"
            ].join("\n")
          }
        }
      ]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    const optimized = await provider.optimizeSeedanceScript({
      currentScript:
        "《破庙的残阳》E01《异常开启》Seedance 2.0 分镜脚本\n第 1 段 15 秒：原文推进 1\n分镜 1（0-5 秒）：中景 / 原文推进",
      story: createDemoProject().storyState,
      visualStyleLabel: "写实剧照",
      visualStylePrompt: "写实剧照质感，电影构图，真实布光。",
      sourceReferenceText: "“何必挣扎？”沈砚步步紧逼，剑尖抵住苏衍咽喉。",
      textModel: "kimi-k2.6"
    });

    expect(optimized).toContain("Seedance 2.0 优化分镜脚本");
    expect(optimized).not.toContain("优化后的分镜脚本：");
    const request = create.mock.calls[0]?.[0];
    const promptText = request.messages.map((message: { content: string }) => message.content).join("\n");
    expect(request.model).toBe("kimi-k2.6");
    expect(request.thinking).toEqual({ type: "disabled" });
    expect(promptText).toContain("我将严格遵循写实剧照画风");
    expect(promptText).toContain("质量参考用户手动用 Kimi K2.6 得到的版本");
    expect(promptText).toContain("如果当前粗分镜段数不足、剧情压缩、台词遗漏或动作过粗，必须根据小说原文重新拆分或增加 15 秒段落");
    expect(promptText).toContain("【第 1 段 15 秒：段落标题】");
    expect(promptText).toContain("对应原文段落");
    expect(promptText).toContain("动作：\n  0.0-2.0秒");
    expect(promptText).toContain("本段尾帧描述");
    expect(promptText).toContain("下一段首帧描述");
    expect(promptText).toContain("首帧承接上一段");
    expect(promptText).toContain("禁止继续使用“原文推进 1”“当前动作推进”“围绕……延展”");
    expect(promptText).toContain("动作字段要继续细化为 0.0-2.0秒");
    expect(promptText).toContain("禁止出现“翻飞间已”“沈砚浑身”这类原文片段当说话人");
    expect(promptText).toContain("小说原文参考");
    expect(promptText).toContain("何必挣扎");
    expect(promptText).toContain("当前粗分镜脚本");
  });

  it("retries Seedance script optimization when the first model output is not director-grade", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const weakScript =
      "《破庙的残阳》E01《异常开启》Seedance 2.0 优化分镜脚本\n第 1 段 15 秒：原文推进 1\n分镜 1（0-5 秒）：中景 / 原文推进\n景别：中景。";
    const directorScript = [
      "《破庙的残阳》E01《异常开启》Seedance 2.0 优化分镜脚本",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "【整体统一设定】",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "画风选择：写实剧照。",
      "人物：苏衍（白衣/浅色衣袍，腰间软剑，姿态从容），沈砚（深色衣袍，素铁剑，气息冷冽）。",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "【第 1 段 15 秒：对峙与试探】",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "对应原文段落：从沈砚索要剑谱到苏衍出手试探。",
      "分镜 1（0-5 秒）：全景 → 中景 / 建立场景与对峙关系",
      "景别：破庙全景，缓慢推至双人中景。",
      "运镜：缓慢推镜。",
      "主角：沈砚（画面右侧）、苏衍（画面左侧）。",
      "动作：",
      "  0.0-2.0秒：破庙残阳被风卷动，光影在梁柱间摇曳。",
      "  2.0-4.0秒：沈砚抬眼看向苏衍，眼神冷冽。",
      "  4.0-5.0秒：沈砚开口，剑穗玉珠轻颤。",
      "台词：沈砚（冷冽声线）：\"把《青岚诀》交出来，我饶你不死。\"",
      "音效：低频风声，木梁吱呀声。",
      "光影：侧逆光，破窗残阳形成破碎光斑。",
      "场景关键词：破败古庙、残阳斜照、风卷尘埃。",
      "",
      "分镜 2（5-10 秒）：中近景 → 近景 / 苏衍反击与出手",
      "景别：苏衍中近景，推至出手瞬间的近景。",
      "运镜：镜头跟随苏衍横移。",
      "主角：苏衍（主）、沈砚（反应在画面边缘）。",
      "动作：",
      "  5.0-6.5秒：苏衍嗤笑，指尖抚过腰间软剑。",
      "  6.5-8.0秒：苏衍欺身而上，软剑出鞘直刺沈砚心口。",
      "  8.0-10.0秒：寒光映亮苏衍面部，沈砚侧身反应。",
      "台词：苏衍（带笑意）：\"沈师兄，你我同门三年，竟为一本剑谱反目？\"",
      "音效：软剑出鞘声，剑锋破空声。",
      "光影：软剑寒光形成动态反光。",
      "场景关键词：软剑寒光、衣袂翻飞、破庙梁柱泛白。",
      "",
      "分镜 3（10-15 秒）：近景 → 特写 / 双剑交击与情绪收束",
      "景别：双剑交击近景，收束于苏衍眼神特写。",
      "运镜：快速切换。",
      "主角：沈砚、苏衍。",
      "动作：",
      "  10.0-12.0秒：沈砚侧身避过，素铁剑横削而出。",
      "  12.0-14.0秒：双剑相撞，火星溅在沈砚染尘衣袖上。",
      "  14.0-15.0秒：苏衍眼神从容中带试探，嘴角微扬。",
      "台词：无。",
      "音效：双剑铮鸣，火星溅落声。",
      "光影：火星短暂照亮衣袖尘埃。",
      "场景关键词：双剑交击、火星、破庙残阳。",
      "尾帧要求：停在苏衍眼神特写，可衔接下一段缠斗。",
      "本段尾帧描述：第 14.0-15.0 秒停在苏衍眼神特写，沈砚素铁剑横在前景，破庙残阳和火星余光保持同一方向。",
      "下一段首帧描述：下一段 0 秒从这一定格拉开至双人中景，延续苏衍眼神、沈砚剑身位置、残阳方向和地面尘埃。",
      "",
      "【人物一致性提示词】",
      "沈砚：古风男子，深色衣袍，束发，写实剧照质感。",
      "【场景一致性提示词】",
      "破庙：残破古庙，断裂梁柱，残阳斜照。",
      "【关键道具提示词】",
      "素铁剑：古朴长剑，写实金属质感。",
      "【氛围关键词】",
      "武侠、古风、同门、试探、误会、写实剧照。"
    ].join("\n");
    const create = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: weakScript } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: directorScript } }] });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    const optimized = await provider.optimizeSeedanceScript({
      currentScript:
        "《破庙的残阳》E01《异常开启》Seedance 2.0 分镜脚本\n第 1 段 15 秒：原文推进 1\n分镜 1（0-5 秒）：中景 / 原文推进",
      story: createDemoProject().storyState,
      visualStyleLabel: "写实剧照",
      visualStylePrompt: "写实剧照质感，电影构图，真实布光。",
      sourceReferenceText: "“何必挣扎？”沈砚步步紧逼，剑尖抵住苏衍咽喉。",
      textModel: "kimi-k2.6"
    });

    expect(optimized).toBe(directorScript);
    expect(create).toHaveBeenCalledTimes(2);
    const retryPromptText = create.mock.calls[1]?.[0].messages.map((message: { content: string }) => message.content).join("\n");
    expect(retryPromptText).toContain("上一版输出没有达到导演级模板质量");
    expect(retryPromptText).toContain("不合格上一版输出");
    expect(retryPromptText).toContain("动作：\n  0.0-2.0秒");
    expect(retryPromptText).toContain("本段尾帧描述");
    expect(retryPromptText).toContain("下一段首帧描述");
  });

  it("requires Seedance scripts to describe the tail frame and the next opening frame", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const baseDirectorScript = [
      "《破庙的残阳》E01《异常开启》Seedance 2.0 优化分镜脚本",
      "【整体统一设定】",
      "画风选择：写实剧照。",
      "人物：苏衍（浅色衣袍，腰间软剑），沈砚（深色衣袍，素铁剑）。",
      "【第 1 段 15 秒：对峙与试探】",
      "对应原文段落：从沈砚索要剑谱到苏衍出手试探。",
      "分镜 1（0-5 秒）：全景 → 中景 / 建立场景与对峙关系",
      "景别：破庙全景，缓慢推至双人中景。",
      "运镜：缓慢推镜。",
      "主角：沈砚、苏衍。",
      "动作：",
      "  0.0-2.0秒：破庙残阳被风卷动，光影在梁柱间摇曳。",
      "  2.0-4.0秒：沈砚抬眼看向苏衍，眼神冷冽。",
      "  4.0-5.0秒：沈砚开口，剑穗玉珠轻颤。",
      "台词：沈砚（冷冽声线）：\"把《青岚诀》交出来，我饶你不死。\"",
      "音效：低频风声，木梁吱呀声。",
      "光影：侧逆光，破窗残阳形成破碎光斑。",
      "场景关键词：破败古庙、残阳斜照、风卷尘埃。",
      "分镜 2（5-10 秒）：中近景 → 近景 / 苏衍出手",
      "景别：苏衍中近景，推至出手瞬间的近景。",
      "运镜：镜头跟随苏衍横移。",
      "主角：苏衍、沈砚。",
      "动作：",
      "  5.0-6.5秒：苏衍嗤笑，指尖抚过腰间软剑。",
      "  6.5-8.0秒：苏衍欺身而上，软剑出鞘直刺沈砚心口。",
      "  8.0-10.0秒：寒光映亮苏衍面部，沈砚侧身反应。",
      "台词：苏衍（带笑意）：\"沈师兄，你我同门三年，竟为一本剑谱反目？\"",
      "音效：软剑出鞘声，剑锋破空声。",
      "光影：软剑寒光形成动态反光。",
      "场景关键词：软剑寒光、衣袂翻飞、破庙梁柱泛白。",
      "分镜 3（10-15 秒）：近景 → 特写 / 双剑交击",
      "景别：双剑交击近景，收束于苏衍眼神特写。",
      "运镜：快速切换。",
      "主角：沈砚、苏衍。",
      "动作：",
      "  10.0-12.0秒：沈砚侧身避过，素铁剑横削而出。",
      "  12.0-14.0秒：双剑相撞，火星溅在沈砚染尘衣袖上。",
      "  14.0-15.0秒：苏衍眼神从容中带试探，嘴角微扬。",
      "台词：无。",
      "音效：双剑铮鸣，火星溅落声。",
      "光影：火星短暂照亮衣袖尘埃。",
      "场景关键词：双剑交击、火星、破庙残阳。",
      "尾帧要求：停在苏衍眼神特写，可衔接下一段缠斗。",
      "【人物一致性提示词】",
      "沈砚：古风男子，深色衣袍，束发，写实剧照质感。",
      "【场景一致性提示词】",
      "破庙：残破古庙，断裂梁柱，残阳斜照。",
      "【关键道具提示词】",
      "素铁剑：古朴长剑，写实金属质感。",
      "【氛围关键词】",
      "武侠、古风、同门、试探、误会、写实剧照。"
    ].join("\n");
    const repairedScript = baseDirectorScript.replace(
      "尾帧要求：停在苏衍眼神特写，可衔接下一段缠斗。",
      [
        "尾帧要求：停在苏衍眼神特写，可衔接下一段缠斗。",
        "本段尾帧描述：第 14.0-15.0 秒停在苏衍眼神特写，沈砚素铁剑横在前景，残阳和火星余光保持同一方向。",
        "下一段首帧描述：下一段 0 秒从这一定格拉开至双人中景，延续苏衍眼神、沈砚剑身位置、残阳方向和地面尘埃。"
      ].join("\n")
    );
    const create = vi.fn()
      .mockResolvedValueOnce({ choices: [{ message: { content: baseDirectorScript } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: repairedScript } }] });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    const optimized = await provider.optimizeSeedanceScript({
      currentScript: "《破庙的残阳》E01《异常开启》Seedance 2.0 分镜脚本",
      story: createDemoProject().storyState,
      visualStyleLabel: "写实剧照",
      visualStylePrompt: "写实剧照质感，电影构图，真实布光。",
      sourceReferenceText: "沈砚握着素铁剑，剑尖斜指地面。",
      textModel: "kimi-k2.6"
    });

    expect(optimized).toBe(repairedScript);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("instructs novel imports to create reusable 15-second Seedance segments", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    const generated = await provider.generateStory({
      inspiration: "导入小说文本",
      sourceType: "novel",
      sourceText: "陈策在深夜大客车中醒来，发现驾驶座空无一人。",
      textModel: "kimi-k2.6"
    });

    expect(generated.sourceReferenceText).toContain("陈策在深夜大客车中醒来");
    expect(generated.sourceReferenceLabel).toBeTruthy();
    const request = create.mock.calls[0]?.[0];
    const promptText = request.messages.map((message: { content: string }) => message.content).join("\n");

    expect(promptText).toContain("第 1 段 15 秒");
    expect(promptText).toContain("分镜 1（0-5 秒）");
    expect(promptText).toContain("分镜 3（10-15 秒）");
    expect(promptText).toContain("每段内部秒数都从 0-5、5-10、10-15 重新开始");
    expect(promptText).toContain("不要输出从 0 到 75 秒的连续总时间轴");
    expect(promptText).toContain("storyboard 数组中每个对象都代表一个 15 秒视频段");
    expect(promptText).toContain("根据小说全文的叙事节拍动态决定 15 秒片段数量");
    expect(promptText).toContain("必须覆盖导入原文中的完整主线内容");
    expect(promptText).toContain("首尾帧连续");
    expect(promptText).toContain("不要默认切黑、黑屏、眨眼或闪白转场");
    expect(promptText).toContain("Seedance 2.0 优化分镜脚本");
    expect(promptText).toContain("【整体统一设定】");
    expect(promptText).toContain("对应原文段落");
    expect(promptText).toContain("本段尾帧描述");
    expect(promptText).toContain("下一段首帧描述");
    expect(promptText).toContain("首帧承接上一段");
    expect(promptText).toContain("禁止使用“原文推进 1”“当前动作推进”“围绕……延展”");
    expect(promptText).not.toContain("choose the first visually strong episode arc");
  });

  it("injects the built-in visual prompt framework without external source content", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    await provider.generateStory({
      inspiration: "导入小说文本",
      sourceType: "novel",
      sourceText: "陈策在深夜大客车中醒来，发现驾驶座空无一人。",
      textModel: "kimi-k2.6"
    });

    const request = create.mock.calls[0]?.[0];
    const promptText = request.messages.map((message: { content: string }) => message.content).join("\n");

    expect(promptText).toContain("项目内置视觉提示框架");
    expect(promptText).toContain("角色三视图");
    expect(promptText).toContain("场景模型图");
    expect(promptText).toContain("15 秒片段 Image Prompt");
    expect(promptText).toContain("15 秒视频首尾帧连续");
    expect(promptText).toContain("不得添加用户原文没有的人物、地点、道具、事件或关系");
    expect(promptText).not.toContain("my.feishu.cn");
    expect(promptText).not.toContain("映悦");
  });

  it("adds the selected visual style preset to story generation prompts", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    await provider.generateStory({
      inspiration: "深夜大客车悬疑短剧",
      worldTitle: "午夜末班车",
      worldBackground: "无人驾驶的大客车在深夜公路上加速。",
      outline: "三名乘客醒来后发现最后一排乘客消失。",
      visualStyleId: "noir-manga",
      textModel: "kimi-k2.6"
    });

    const request = create.mock.calls[0]?.[0];
    const promptText = request.messages.map((message: { content: string }) => message.content).join("\n");

    expect(promptText).toContain("画面风格选择：黑白硬线漫画");
    expect(promptText).toContain("高反差黑白");
    expect(promptText).toContain("该风格只能影响画风、镜头语言和视觉提示词");
  });

  it("applies the selected visual style to story state prompts after generation", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    const generated = await provider.generateStory({
      inspiration: "深夜大客车悬疑短剧",
      visualStyleId: "noir-manga",
      textModel: "kimi-k2.6"
    });

    expect(generated.visualStyleId).toBe("noir-manga");
    expect(generated.promptOptimizerModel).toBe("kimi-k2.6");
    expect(generated.promptOptimizationEnabled).toBe(true);
    expect(generated.world.styleKeywords).toContain("黑白硬线漫画");
    expect(generated.world.styleKeywords).toContain("高反差黑白漫画");
    expect(generated.world.styleKeywords).not.toContain("冷蓝灰色调");
    expect(generated.characters[0]?.consistencyPrompt).toContain("所选画风：黑白硬线漫画");
    expect(generated.characters[0]?.consistencyPrompt).toContain("高反差黑白漫画");
    expect(generated.storyboard[0]?.imagePrompt).toContain("所选画风：黑白硬线漫画");
    expect(generated.storyboard[0]?.videoPrompt).toContain("所选画风：黑白硬线漫画");
    expect(generated.visualPrompts[0]?.imagePrompt).toContain("所选画风：黑白硬线漫画");
    expect(generated.seedanceScript).toContain("画风选择：黑白硬线漫画");
    expect(generated.seedanceScript).toContain("高反差黑白漫画");
    expect(generated.seedanceScript).not.toContain("不要 3D");

    expect(deriveCharacterModelsFromStory(generated)[0]?.consistencyPrompt).toContain("高反差黑白漫画");
    expect(deriveSceneModelsFromStory(generated)[0]?.generationPrompt).toContain("高反差黑白漫画");
  });

  it("expands undersized novel imports into enough 15-second segments to cover the source beats", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = {
      ...createDemoProject().storyState,
      seedanceScript:
        "分镜 1（0-5 秒）：极端特写。\n分镜 2（5-10 秒）：中景。\n分镜 13（60-75 秒）：急速推轨长镜头。"
    };
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });
    const sourceText = Array.from(
      { length: 13 },
      (_, index) => `分镜 ${index + 1}（${index * 5}-${(index + 1) * 5} 秒）：第 ${index + 1} 个关键剧情事件。`
    ).join("\n\n");

    const generated = await provider.generateStory({
      inspiration: "深夜大客车异常事件",
      sourceType: "novel",
      sourceText,
      textModel: "kimi-k2.6"
    });

    expect(generated.storyboard.length).toBeGreaterThanOrEqual(5);
    expect(generated.visualPrompts).toHaveLength(generated.storyboard.length);
    expect(generated.seedanceScript).toContain("每段 15 秒");
    expect(generated.seedanceScript).toContain("第 1 段 15 秒");
    expect(generated.seedanceScript).toContain("第 5 段 15 秒");
    expect(generated.seedanceScript).toContain("分镜 1（0-5 秒）");
    expect(generated.seedanceScript).toContain("分镜 2（5-10 秒）");
    expect(generated.seedanceScript).toContain("分镜 3（10-15 秒）");
    expect(generated.seedanceScript).toContain("首尾帧连续");
    expect(generated.seedanceScript).not.toContain("故事灵感：");
    expect(generated.seedanceScript).not.toContain("世界观：");
    expect(generated.seedanceScript).not.toContain("剧情大纲：");
    expect(generated.seedanceScript).not.toContain("分镜 13（60-75 秒）");
    expect(generated.seedanceScript).not.toContain("规则已启动");
    expect(generated.seedanceScript).not.toContain("切黑或转场");
  });

  it("preserves opening quoted dialogue from imported novel excerpts", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    const generated = await provider.generateStory({
      inspiration: "武侠同门反目片段",
      sourceType: "novel",
      sourceText: [
        "“何必挣扎？”沈砚步步紧逼，剑尖抵住苏衍咽喉，“师父偏心，凭什么把剑谱传你？”苏衍却突然笑了，缓缓抬手，并未去挡剑尖，反而从怀中取出一本泛黄的册子，扔在沈砚面前。",
        "沈砚低头去看，册子上根本不是《青岚诀》，而是师父的遗书。“师父临终前说，你体内戾气过重，若得剑谱必走火入魔。”苏衍轻声道，“我故意引你动手，就是要看看，你是否真的忘了同门情分。”沈砚浑身一震，剑尖微微颤抖，才发现苏衍肩头的伤口刻意避开了要害，方才的缠斗，竟是对方在试探自己。"
      ].join("\n"),
      textModel: "kimi-k2.6"
    });

    expect(generated.storyboard[0]?.dialogue).toContain("沈砚：“何必挣扎？”");
    expect(generated.storyboard[0]?.dialogue).toContain("沈砚：“师父偏心，凭什么把剑谱传你？”");
    expect(generated.seedanceScript).toContain("台词：沈砚：“何必挣扎？”");
    expect(generated.seedanceScript).toContain("台词：沈砚：“师父偏心，凭什么把剑谱传你？”");
    expect(generated.seedanceScript).toContain("苏衍：“师父临终前说，你体内戾气过重，若得剑谱必走火入魔。”");
  });

  it("repairs generic imported novel characters from explicit source names", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const demoStory = createDemoProject().storyState;
    const genericCharacter = {
      ...demoStory.characters[0],
      id: "char-fallback-1",
      name: "主角",
      role: "核心主角 / 事件调查者",
      relationshipToProtagonist: "主角",
      appearance: "成熟人物比例，深色长外套，冷静警觉的眼神，半写实国漫悬疑风角色。",
      consistencyPrompt: "主角，角色定妆图"
    };
    const storyState = {
      ...demoStory,
      characters: [genericCharacter],
      storyboard: demoStory.storyboard.map((shot) => ({
        ...shot,
        characterActions: "主角发现异常并停下脚步。",
        imagePrompt: "主角，大客车异常事件，半写实国漫",
        videoPrompt: "主角推进当前关键事件"
      })),
      seedanceScript: "第 1 段 15 秒：异常出现\n分镜 1（0-5 秒）：主角发现异常。"
    };
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    const generated = await provider.generateStory({
      inspiration: "我在死亡副本编写逃生代码",
      sourceType: "novel",
      sourceText: [
        "一阵剧烈的颠簸袭来，陈策缓缓睁开了双眼。",
        "我叫陈策，南京人，25岁。",
        "我是顾帅，北京人，25岁。顾帅说道：这车还是自动驾驶的嘿。",
        "谭一峰，山东人，我也是25岁。谭一峰问道：驾驶座怎么没人？",
        "陈策看向黑暗车厢，顾帅看向窗外，谭一峰站起身向驾驶座走去。"
      ].join("\n"),
      textModel: "kimi-k2.6"
    });

    const names = generated.characters.map((character) => character.name);
    expect(names[0]).toBe("陈策");
    expect(names).toEqual(expect.arrayContaining(["顾帅", "谭一峰"]));
    expect(generated.characters).toHaveLength(3);
    expect(generated.storyboard[0]?.characterActions).toContain("陈策");
    expect(generated.seedanceScript).toContain("人物：陈策");
    expect(generated.seedanceScript).not.toContain("人物：主角");
    expect(generated.seedanceScript).not.toContain("台词：系统");
    expect(generated.seedanceScript).not.toContain("规则已启动");
  });

  it("removes author-reader interaction notes from imported novel prompts", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    await provider.generateStory({
      inspiration: "导入小说文本",
      sourceType: "novel",
      sourceText: [
        "第1卷 第1章 入戏",
        "",
        "（作者亲了你一口并给出一个提示：初始考验在大客车，很快就能出去啦。么么哒！）",
        "",
        "一阵剧烈的颠簸袭来，陈策缓缓睁开了双眼，迷茫地打量着四周。"
      ].join("\n"),
      textModel: "kimi-k2.6"
    });

    const request = create.mock.calls[0]?.[0];
    const promptText = request.messages.map((message: { content: string }) => message.content).join("\n");

    expect(promptText).toContain("陈策缓缓睁开了双眼");
    expect(promptText).not.toContain("作者亲了你一口");
    expect(promptText).not.toContain("么么哒");
  });

  it("keeps late chapters represented when imported novel text is longer than the model prompt window", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });
    const chapters = Array.from({ length: 80 }, (_, index) => {
      const chapter = index + 1;
      const marker = chapter === 80 ? "最终逃出大客车并看见第十三层档案馆入口" : `第 ${chapter} 个关键追查节点`;
      return `第${chapter}章\n${marker}。${"陈策在异常空间里追查线索。".repeat(35)}`;
    });

    const generated = await provider.generateStory({
      inspiration: "十九章悬疑小说全文",
      sourceType: "novel",
      sourceText: chapters.join("\n\n"),
      textModel: "kimi-k2.6"
    });

    expect(generated.storyboard.length).toBeGreaterThan(3);
    expect(generated.seedanceScript).toContain("最终逃出大客车");
  });

  it("uses the explicit Moonshot model setting for Kimi generation", async () => {
    vi.stubEnv("OPENAI_API_MODE", "");
    vi.stubEnv("OPENAI_MODEL", "gpt-5.5");
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    vi.stubEnv("MOONSHOT_BASE_URL", "https://api.moonshot.cn/v1");
    const storyState = createDemoProject().storyState;
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      maxCompletionTokens: 2048,
      client: { chat: { completions: { create } } } as any
    });

    expect(provider.model()).toBe("kimi-k2.6");
    const generated = await provider.generateStory("test story");
    expect(generated).toMatchObject(storyState);
    expect(generated.promptOptimizerModel).toBe("kimi-k2.6");
    expect(generated.promptOptimizationEnabled).toBe(true);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "kimi-k2.6",
        max_tokens: 2048,
        response_format: { type: "json_object" }
      })
    );
  });

  it("repairs common Kimi JSON punctuation before parsing story output", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const kimiJson = JSON.stringify(storyState).replace('"world":', '"world"：').replace(/,"outline":/, ',"outline":');
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: kimiJson } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    const generated = await provider.generateStory("test story");
    expect(generated).toMatchObject(storyState);
    expect(generated.promptOptimizerModel).toBe("kimi-k2.6");
    expect(generated.promptOptimizationEnabled).toBe(true);
  });

  it("revises Seedance scripts through chat completions in chat mode", async () => {
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6");
    const create = vi.fn().mockResolvedValue({
      choices: [{ message: { content: "revised script" } }]
    });
    const provider = new OpenAITextProvider({
      mock: false,
      apiMode: "chat",
      client: { chat: { completions: { create } } } as any
    });

    await expect(
      provider.reviseSeedanceScript({
        currentScript: "current script",
        revisionPrompt: "make it faster"
      })
    ).resolves.toBe("revised script");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "kimi-k2.6",
        thinking: { type: "disabled" },
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user" })
        ])
      })
    );
  });

  it("allows a request to choose GPT-5.5 through the Responses API", async () => {
    vi.stubEnv("OPENAI_API_MODE", "chat");
    vi.stubEnv("OPENAI_MODEL", "kimi-k2.6");
    const storyState = createDemoProject().storyState;
    const chatCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(storyState) } }]
    });
    const responsesCreate = vi.fn().mockResolvedValue({
      output_text: JSON.stringify(storyState)
    });
    const provider = new OpenAITextProvider({
      mock: false,
      client: {
        chat: { completions: { create: chatCreate } },
        responses: { create: responsesCreate }
      } as any
    });

    const generated = await provider.generateStory({ inspiration: "test story", textModel: "gpt-5.5" } as any);
    expect(generated).toMatchObject(storyState);
    expect(generated.promptOptimizerModel).toBe("gpt-5.5");
    expect(generated.promptOptimizationEnabled).toBe(true);

    expect(responsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.5",
        text: expect.objectContaining({
          format: expect.objectContaining({ type: "json_schema" })
        })
      })
    );
    expect(chatCreate).not.toHaveBeenCalled();
  });

  it("keeps OpenAI and Moonshot model settings separate", () => {
    vi.stubEnv("OPENAI_MODEL", "gpt-5.5");
    vi.stubEnv("MOONSHOT_MODEL", "kimi-k2.6-custom");
    const provider = new OpenAITextProvider({ mock: true });

    expect(provider.model("gpt-5.5")).toBe("gpt-5.5");
    expect(provider.model("kimi-k2.6")).toBe("kimi-k2.6-custom");
  });
});
