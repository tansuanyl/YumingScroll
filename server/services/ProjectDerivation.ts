import type { Project, StoryState, StoryboardShot, VideoFlow, VisualPrompt } from "../../src/types/domain";
import { deriveCharacterModelsFromStory, deriveSceneModelsFromStory } from "../../src/data/demoProject";

export const deriveCharacterModels = deriveCharacterModelsFromStory;

export const deriveSceneModels = deriveSceneModelsFromStory;

export function deriveVideoFlows(storyState: StoryState): VideoFlow[] {
  return syncStoryStateWithSeedanceSegments(storyState).storyboard.map((shot) => createFlowFromShot(shot));
}

export function syncProjectWithSeedanceSegments(project: Project): Project {
  const storyState = syncStoryStateWithSeedanceSegments(project.storyState);
  const existingShotIds = new Set(project.videoFlows.map((flow) => flow.shotId));
  const existingFlowIds = new Set(project.videoFlows.map((flow) => flow.id));
  const videoFlows = [...project.videoFlows];

  for (const shot of storyState.storyboard) {
    if (existingShotIds.has(shot.id)) continue;
    const flow = createFlowFromShot(shot, existingFlowIds);
    existingShotIds.add(shot.id);
    existingFlowIds.add(flow.id);
    videoFlows.push(flow);
  }

  if (storyState === project.storyState && videoFlows.length === project.videoFlows.length) return project;
  return {
    ...project,
    storyState,
    videoFlows
  };
}

export function syncStoryStateWithSeedanceSegments(storyState: StoryState): StoryState {
  const segments = extractSeedanceSegments(storyState.seedanceScript);
  const storyboard = [...storyState.storyboard];
  const script = [...storyState.script];
  const existingShotIds = new Set(storyboard.map((shot) => shot.id));
  const existingSceneIds = new Set(script.map((scene) => scene.id));
  let changed = false;

  for (let index = storyboard.length; index < segments.length; index += 1) {
    const segment = segments[index];
    const sceneId = createUniqueId(existingSceneIds, `scene-seedance-segment-${segment.number || index + 1}`);
    const shotId = createUniqueId(existingShotIds, `shot-seedance-segment-${segment.number || index + 1}`);
    const shot = createStoryboardShotFromSeedanceSegment(storyState, segment, index, shotId, sceneId);
    const sceneDescription = compactSegmentText(segment.body || segment.raw, 180) || shot.composition;

    script.push({
      id: sceneId,
      title: segment.title || `第 ${index + 1} 段 15 秒`,
      location: shot.background,
      description: sceneDescription,
      dialogues: shot.dialogue && shot.dialogue !== "无" ? [{ character: "角色", line: shot.dialogue, emotion: shot.expression }] : []
    });
    storyboard.push(shot);
    changed = true;
  }

  const visualPrompts = alignVisualPrompts(storyboard, storyState.visualPrompts);
  const visualPromptsChanged =
    visualPrompts.length !== storyState.visualPrompts.length ||
    visualPrompts.some((prompt, index) => prompt !== storyState.visualPrompts[index]);

  if (!changed && !visualPromptsChanged) return storyState;
  return {
    ...storyState,
    script,
    storyboard,
    visualPrompts
  };
}

function createFlowFromShot(shot: StoryboardShot, existingFlowIds?: Set<string>): VideoFlow {
  const id = existingFlowIds ? createUniqueId(existingFlowIds, `flow-${shot.id}`) : `flow-${shot.id}`;
  return {
    id,
    shotId: shot.id,
    nodes: {
      characterNode: { id: `node-character-${shot.id}`, type: "character", status: "idle" },
      sceneNode: { id: `node-scene-${shot.id}`, type: "scene", status: "idle" },
      promptNode: { id: `node-prompt-${shot.id}`, type: "prompt", status: "ready" },
      videoNode: { id: `node-video-${shot.id}`, type: "video", status: "idle" },
      previewNode: { id: `node-preview-${shot.id}`, type: "preview", status: "idle" }
    },
    prompt: shot.videoPrompt,
    imagePrompt: shot.imagePrompt,
    selectedCharacterModelIds: [],
    selectedSceneModelIds: [],
    actionDescription: shot.characterActions,
    emotion: shot.expression,
    cameraMovement: shot.cameraMovement,
    durationSeconds: 15,
    aspectRatio: "9:16",
    status: "idle"
  };
}

type SeedanceSegment = {
  number: number;
  title: string;
  heading: string;
  body: string;
  raw: string;
  start: number;
};

function extractSeedanceSegments(seedanceScript: string): SeedanceSegment[] {
  const script = seedanceScript.replace(/\r\n/g, "\n");
  const headings = [
    ...Array.from(script.matchAll(/^(?:【\s*)?第\s*(\d+)\s*段\s*15\s*(?:秒|s)\s*[：:]?\s*([^】\n]*)?(?:】\s*)?$/gim)).map(
      (match) => ({
        start: match.index || 0,
        heading: match[0],
        number: Number(match[1]),
        title: cleanHeadingTitle(match[2] || "")
      })
    ),
    ...Array.from(script.matchAll(/^【\s*(\d+)\s*[-－—]\s*(\d+)\s*秒\s*([^】\n]*)?】\s*$/gim)).map((match) => ({
      start: match.index || 0,
      heading: match[0],
      number: Math.floor(Number(match[1]) / 15) + 1,
      title: cleanHeadingTitle(match[3] || "")
    }))
  ].sort((left, right) => left.start - right.start);

  return headings.map((heading, index) => {
    const next = headings[index + 1];
    const end = next ? next.start : script.length;
    const raw = script.slice(heading.start, end).trim();
    const body = script.slice(heading.start + heading.heading.length, end).trim();
    return {
      ...heading,
      title: heading.title || `第 ${heading.number || index + 1} 段 15 秒`,
      body,
      raw
    };
  });
}

function createStoryboardShotFromSeedanceSegment(
  storyState: StoryState,
  segment: SeedanceSegment,
  index: number,
  shotId: string,
  sceneId: string
): StoryboardShot {
  const firstShotTitle = extractFirstShotTitle(segment.raw);
  const shotType = cleanText(extractField(segment.raw, ["景别"]) || firstShotTitle || segment.title, "中景");
  const cameraMovement = cleanText(extractField(segment.raw, ["运镜", "镜头运动"]) || "", "按 Seedance 分镜脚本平稳推进");
  const background = cleanText(extractField(segment.raw, ["场景", "地点", "空间"]) || storyState.script[index]?.location || "", segment.title);
  const actionDescription = cleanText(
    extractField(segment.raw, ["动作", "人物动作", "角色动作"]) || compactSegmentText(segment.body, 220),
    "按 Seedance 分镜脚本执行当前 15 秒剧情动作"
  );
  const expression = cleanText(extractField(segment.raw, ["表情", "情绪"]) || "", "按当前剧情保持连续情绪");
  const dialogue = normalizeDialogue(extractField(segment.raw, ["台词", "对白"]));
  const composition = cleanText(firstShotTitle || extractField(segment.raw, ["构图", "画面"]) || compactSegmentText(segment.body, 160), segment.title);
  const imagePrompt = [segment.title, shotType, composition, background, storyState.world.styleKeywords.join("，")]
    .filter(Boolean)
    .join("，");
  const videoPrompt = segment.raw || `15 秒视频片段，${segment.title}，${actionDescription}，${cameraMovement}`;

  return {
    id: shotId,
    sceneId,
    order: index + 1,
    shotType,
    cameraMovement,
    composition,
    characterActions: actionDescription,
    expression,
    background,
    dialogue,
    imagePrompt,
    videoPrompt
  };
}

function alignVisualPrompts(storyboard: StoryboardShot[], visualPrompts: VisualPrompt[]): VisualPrompt[] {
  const promptByShotId = new Map(visualPrompts.map((prompt) => [prompt.shotId, prompt]));
  return storyboard.map((shot) => {
    const existing = promptByShotId.get(shot.id);
    if (existing) return existing;
    return {
      id: `prompt-${shot.id}`,
      shotId: shot.id,
      imagePrompt: shot.imagePrompt,
      videoPrompt: shot.videoPrompt
    };
  });
}

function extractFirstShotTitle(value: string): string {
  const match = /^分镜\s*1\s*[（(][^）)]*[）)]\s*[：:]\s*(.+)$/m.exec(value);
  return cleanHeadingTitle(match?.[1] || "");
}

function extractField(value: string, labels: string[]): string {
  for (const label of labels) {
    const match = new RegExp(`^${label}[：:]\\s*(.+)$`, "m").exec(value);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function normalizeDialogue(value: string): string {
  const cleaned = cleanText(value || "", "");
  if (!cleaned || cleaned === "无" || cleaned.toLowerCase() === "none") return "";
  return cleaned;
}

function compactSegmentText(value: string, maxLength: number): string {
  const compacted = value
    .replace(/^第\s*\d+\s*段\s*15\s*(?:秒|s).*$/gim, "")
    .replace(/^【\s*\d+\s*[-－—]\s*\d+\s*秒.*】\s*$/gim, "")
    .replace(/\s+/g, " ")
    .trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function cleanHeadingTitle(value: string): string {
  return cleanText(value.replace(/^[:：\s]+/, "").replace(/[】\s]+$/g, ""), "");
}

function cleanText(value: string | undefined, fallback: string): string {
  const cleaned = (value || "").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function createUniqueId(existing: Set<string>, baseId: string): string {
  let id = baseId;
  let index = 2;
  while (existing.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  existing.add(id);
  return id;
}
