import { Download, Film, ImageIcon, Pencil, Plus, Save, ScrollText, Trash2, Unlink, User, Video, Wand2, X } from "lucide-react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent
} from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "../lib/apiClient";
import {
  cancelCharacterImageGeneration,
  cancelImagePromptReferenceGeneration,
  cancelSceneImageGeneration,
  cancelVideoGeneration,
  createGenerationRequestId,
  startCharacterImageGeneration,
  startImagePromptReferenceGeneration,
  startSceneImageGeneration,
  startVideoGeneration
} from "../lib/generationCancellation";
import { updateCharacterConsistencyPrompt } from "../lib/modelPromptEdits";
import { calculateWheelZoom } from "../lib/workflowViewport";
import { buildSceneImagePromptSourceText, sanitizeImagePromptSourceText } from "../lib/imagePromptSourceText";
import { sanitizeSceneModelPromptText } from "../lib/sceneModelPromptText";
import { sanitizeVisualStyleKeywords } from "../lib/promptTextCleanup";
import {
  applyWorkflowConnectionToProject,
  createWorkflowModelSource,
  createWorkflowVideoSegment,
  createWorkflowEdgesForConnection,
  deleteWorkflowModelSource,
  disconnectWorkflowModelFromFlow,
  disconnectWorkflowSegmentSourceFromFlow,
  updateWorkflowModelName,
  deriveWorkflowConnectionsFromEdges
} from "../lib/workflowConnections";
import type { WorkflowConnection, WorkflowInputKind, WorkflowModelKind, WorkflowSegmentSourceKind, WorkflowSourceKind } from "../lib/workflowConnections";
import type {
  CharacterModel,
  FlowMapNodeOffset,
  FlowMapSegmentNodeKind,
  FlowNode,
  GenerationStatus,
  Project,
  SceneModel,
  StoryState,
  StoryboardShot,
  VideoAspectRatio,
  VideoFlow,
  WorkflowEdge
} from "../types/domain";
import { AIImageGenerationPanel } from "./ui/ai-gen";

type VideoFlowMapProps = {
  project: Project;
  onProjectChange: (project: Project) => void;
  onSave: (project: Project, message?: string) => Promise<void>;
  onAssistantMessage: (message: string) => void;
};

type NodePosition = { x: number; y: number };
type ConnectionDrag = {
  fromFlowId?: string;
  sourceId?: string;
  sourceKind: WorkflowSourceKind;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};
type WorkflowContextMenu =
  | { kind: "canvas"; x: number; y: number; boardX: number; boardY: number }
  | { kind: "model"; x: number; y: number; modelKind: WorkflowModelKind; modelId: string }
  | { kind: "segmentSource"; x: number; y: number; sourceKind: WorkflowSegmentSourceKind; flowId: string };

const sourceMeta: Record<WorkflowSourceKind, { label: string; sub: string; icon: typeof User; input: WorkflowInputKind }> = {
  character: { label: "人物模型", sub: "角色一致性", icon: User, input: "character" },
  scene: { label: "场景模型", sub: "空间与气氛", icon: Film, input: "scene" },
  imagePrompt: { label: "Image Prompt", sub: "场景风格提示词", icon: ImageIcon, input: "imagePrompt" },
  script: { label: "分镜脚本", sub: "Seedance 2.0", icon: ScrollText, input: "script" }
};

const inputLabels: Record<WorkflowInputKind, string> = {
  character: "人物",
  scene: "场景",
  imagePrompt: "风格词",
  script: "脚本"
};

const videoInputOrder: WorkflowInputKind[] = ["character", "scene", "imagePrompt", "script"];
const videoAspectRatioOptions: Array<{ value: VideoAspectRatio; label: string }> = [
  { value: "9:16", label: "9:16 竖屏" },
  { value: "16:9", label: "16:9 横屏" },
  { value: "9:21", label: "9:21 超竖屏" },
  { value: "21:9", label: "21:9 超宽屏" }
];
const workflowDropHitRadius = 56;
const videoGenerationRecoveryMs = 5 * 60 * 1000;
const videoGenerationRecoveryPollMs = 5000;
const videoInputPortGeometry = {
  firstCenterY: 81,
  rowStepY: 42
};

const sourceCodePrefix: Record<WorkflowSourceKind, string> = {
  character: "P",
  scene: "S",
  imagePrompt: "IP",
  script: "SB"
};

const workflowLayout = {
  layoutVersion: "left-y-axis-v1",
  characterX: 80,
  sceneX: 400,
  modelGapY: 300,
  videoStartX: 1260,
  segmentGapX: 1120,
  videoOffsetY: -120,
  segmentSourceOffsetX: 440,
  imagePromptOffsetY: -660,
  scriptOffsetY: 320,
  minBoardWidth: 9600,
  minBoardHeight: 3600
};

const workflowZoomLimits = {
  min: 0.5,
  max: 1.8
};

const flowMapSegmentNodeKinds: FlowMapSegmentNodeKind[] = ["imagePrompt", "script", "video", "output"];

function collectPersistedNodePositions(project: Project): Record<string, NodePosition> {
  const positions: Record<string, NodePosition> = {};

  project.characterModels.forEach((model) => {
    const offset = readFlowMapOffset(model.flowMapOffset);
    if (offset) positions[`model:character:${model.id}`] = offset;
  });
  project.sceneModels.forEach((model) => {
    const offset = readFlowMapOffset(model.flowMapOffset);
    if (offset) positions[`model:scene:${model.id}`] = offset;
  });
  project.videoFlows.forEach((flow) => {
    flowMapSegmentNodeKinds.forEach((kind) => {
      const offset = readFlowMapOffset(flow.flowMapOffsets?.[kind]);
      if (offset) positions[`${flow.id}:${kind}`] = offset;
    });
  });

  return positions;
}

function withPersistedNodeOffset(project: Project, key: string, offset: NodePosition): Project {
  const normalizedOffset = normalizeFlowMapOffset(offset);
  const modelMatch = /^model:(character|scene):(.+)$/.exec(key);

  if (modelMatch) {
    const kind = modelMatch[1] as "character" | "scene";
    const modelId = modelMatch[2];

    if (kind === "character") {
      let changed = false;
      const characterModels = project.characterModels.map((model) => {
        if (model.id !== modelId) return model;
        if (sameNodePosition(model.flowMapOffset, normalizedOffset)) return model;
        changed = true;
        return { ...model, flowMapOffset: normalizedOffset };
      });
      return changed ? { ...project, characterModels } : project;
    }

    let changed = false;
    const sceneModels = project.sceneModels.map((model) => {
      if (model.id !== modelId) return model;
      if (sameNodePosition(model.flowMapOffset, normalizedOffset)) return model;
      changed = true;
      return { ...model, flowMapOffset: normalizedOffset };
    });
    return changed ? { ...project, sceneModels } : project;
  }

  const segmentNode = parseSegmentNodeKey(key);
  if (!segmentNode) return project;

  let changed = false;
  const videoFlows = project.videoFlows.map((flow) => {
    if (flow.id !== segmentNode.flowId) return flow;
    if (sameNodePosition(flow.flowMapOffsets?.[segmentNode.kind], normalizedOffset)) return flow;
    changed = true;
    return {
      ...flow,
      flowMapOffsets: {
        ...(flow.flowMapOffsets || {}),
        [segmentNode.kind]: normalizedOffset
      }
    };
  });

  return changed ? { ...project, videoFlows } : project;
}

function parseSegmentNodeKey(key: string): { flowId: string; kind: FlowMapSegmentNodeKind } | undefined {
  for (const kind of flowMapSegmentNodeKinds) {
    const suffix = `:${kind}`;
    if (!key.endsWith(suffix)) continue;
    const flowId = key.slice(0, -suffix.length);
    if (flowId) return { flowId, kind };
  }

  return undefined;
}

function readFlowMapOffset(value: unknown): NodePosition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const maybeOffset = value as Partial<NodePosition>;
  if (!Number.isFinite(maybeOffset.x) || !Number.isFinite(maybeOffset.y)) return undefined;
  return { x: maybeOffset.x as number, y: maybeOffset.y as number };
}

function normalizeFlowMapOffset(offset: NodePosition): FlowMapNodeOffset {
  return {
    x: Math.round(offset.x * 100) / 100,
    y: Math.round(offset.y * 100) / 100
  };
}

function sameNodePositions(left: Record<string, NodePosition>, right: Record<string, NodePosition>): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => sameNodePosition(left[key], right[key]));
}

function sameNodePosition(left: NodePosition | undefined, right: NodePosition | undefined): boolean {
  if (!left || !right) return left === right;
  return Math.abs(left.x - right.x) < 0.001 && Math.abs(left.y - right.y) < 0.001;
}

export function VideoFlowMap({
  project,
  onProjectChange,
  onSave,
  onAssistantMessage
}: VideoFlowMapProps) {
  const [flowId, setFlowId] = useState(project.videoFlows[0]?.id || "");
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>(() => collectPersistedNodePositions(project));
  const [inputPortCenters, setInputPortCenters] = useState<Record<string, NodePosition>>({});
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDrag | null>(null);
  const [scriptDialogFlowId, setScriptDialogFlowId] = useState<string | null>(null);
  const [modelDialog, setModelDialog] = useState<{ kind: "character" | "scene"; id: string } | null>(null);
  const [imagePromptDialogFlowId, setImagePromptDialogFlowId] = useState<string | null>(null);
  const [videoDialogFlowId, setVideoDialogFlowId] = useState<string | null>(null);
  const [videoProgressById, setVideoProgressById] = useState<Record<string, number>>({});
  const [modelProgressById, setModelProgressById] = useState<Record<string, number>>({});
  const [modelBusyId, setModelBusyId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [workflowZoom, setWorkflowZoom] = useState(1);
  const [contextMenu, setContextMenu] = useState<WorkflowContextMenu | null>(null);
  const [modelNameDrafts, setModelNameDrafts] = useState<Record<string, string>>({});

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const connectionDragPathRef = useRef<SVGPathElement | null>(null);
  const connectionDragRef = useRef<ConnectionDrag | null>(null);
  const nodeDragState = useRef({
    active: false,
    moved: false,
    key: "",
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    latestX: 0,
    latestY: 0
  });
  const panState = useRef({ active: false, moved: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const pendingZoomScrollRef = useRef<{ scrollLeft: number; scrollTop: number } | null>(null);
  const videoProgressTimers = useRef<Record<string, number>>({});
  const modelProgressTimers = useRef<Record<string, number>>({});
  const pollingVideoJobs = useRef<Set<string>>(new Set());
  const projectRef = useRef(project);
  const modelGenerationControllers = useRef<Record<string, AbortController>>({});
  const modelGenerationRequestIds = useRef<Record<string, string>>({});
  const videoGenerationControllers = useRef<Record<string, AbortController>>({});
  const videoGenerationRequestIds = useRef<Record<string, string>>({});
  const cancelledVideoJobs = useRef<Set<string>>(new Set());
  const centeredLayoutRef = useRef("");

  const flow = useMemo(
    () => project.videoFlows.find((item) => item.id === flowId) || project.videoFlows[0],
    [flowId, project.videoFlows]
  );
  const connections = useMemo(() => deriveWorkflowConnectionsFromEdges(project), [project]);

  const selectedCharacterModelIds = flow ? getSelectedCharacterIds(flow) : [];
  const selectedSceneModelIds = flow ? getSelectedSceneIds(flow) : [];
  const selectedShot = project.storyState.storyboard.find((shot) => shot.id === flow?.shotId);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (nodeDragState.current.active) return;
    const persistedPositions = collectPersistedNodePositions(project);
    setNodePositions((current) => (sameNodePositions(current, persistedPositions) ? current : persistedPositions));
  }, [project]);

  function applyProject(nextProject: Project) {
    projectRef.current = nextProject;
    onProjectChange(nextProject);
  }

  const layoutSignature = [
    workflowLayout.layoutVersion,
    project.id,
    project.characterModels.map((model) => model.id).join("|"),
    project.sceneModels.map((model) => model.id).join("|"),
    project.videoFlows.map((item) => item.id).join("|")
  ].join(":");

  const boardWidth = Math.max(
    workflowLayout.minBoardWidth,
    workflowLayout.videoStartX + Math.max(project.videoFlows.length - 1, 0) * workflowLayout.segmentGapX + 1900
  );
  const requiredModelRows = Math.max(project.characterModels.length, project.sceneModels.length, 1);
  const boardHeight = Math.max(workflowLayout.minBoardHeight, requiredModelRows * workflowLayout.modelGapY + 1800);
  const layoutAxisY = Math.floor(boardHeight / 2);

  useEffect(() => {
    return () => {
      Object.values(videoProgressTimers.current).forEach((timer) => window.clearInterval(timer));
      Object.values(modelProgressTimers.current).forEach((timer) => window.clearInterval(timer));
    };
  }, []);

  useEffect(() => {
    for (const item of project.videoFlows) {
      if (item.status !== "generating" || !item.pendingVideoJobId) continue;
      if (pollingVideoJobs.current.has(item.pendingVideoJobId)) continue;
      setVideoProgressById((current) => (current[item.id] ? current : { ...current, [item.id]: 96 }));
      void pollPendingVideoJob(item.id, item.pendingVideoJobId, project.id, true);
    }
  }, [
    project.id,
    project.videoFlows
      .map((item) => `${item.id}:${item.status}:${item.pendingVideoJobId || ""}:${item.videoAssetId || ""}`)
      .join("|")
  ]);

  useEffect(() => {
    if (centeredLayoutRef.current === layoutSignature) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const frame = window.requestAnimationFrame(() => {
      canvas.scrollLeft = 0;
      canvas.scrollTop = Math.max(0, layoutAxisY * workflowZoom - Math.floor(canvas.clientHeight * 0.52));
      centeredLayoutRef.current = layoutSignature;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [layoutAxisY, layoutSignature, workflowZoom]);

  useLayoutEffect(() => {
    const pendingScroll = pendingZoomScrollRef.current;
    const canvas = canvasRef.current;
    if (!pendingScroll || !canvas) return;

    canvas.scrollLeft = pendingScroll.scrollLeft;
    canvas.scrollTop = pendingScroll.scrollTop;
    pendingZoomScrollRef.current = null;
  }, [workflowZoom]);

  useEffect(() => {
    if (!scriptDialogFlowId && !modelDialog && !imagePromptDialogFlowId && !videoDialogFlowId && !contextMenu) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setScriptDialogFlowId(null);
      setModelDialog(null);
      setImagePromptDialogFlowId(null);
      setVideoDialogFlowId(null);
      setContextMenu(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [scriptDialogFlowId, modelDialog, imagePromptDialogFlowId, videoDialogFlowId, contextMenu]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    return () => window.removeEventListener("click", closeContextMenu);
  }, [contextMenu]);

  useLayoutEffect(() => {
    const measurePorts = () => {
      const board = boardRef.current;
      if (!board) return;

      const boardRect = board.getBoundingClientRect();
      const nextCenters: Record<string, NodePosition> = {};
      board.querySelectorAll<HTMLElement>("[data-workflow-input-port='true']").forEach((port) => {
        const targetFlowId = port.dataset.flowId;
        const inputKind = port.dataset.inputKind as WorkflowInputKind | undefined;
        if (!targetFlowId || !inputKind) return;

        const portRect = port.getBoundingClientRect();
        nextCenters[`${targetFlowId}:${inputKind}`] = {
          x: (portRect.left - boardRect.left + portRect.width / 2) / workflowZoom,
          y: (portRect.top - boardRect.top + portRect.height / 2) / workflowZoom
        };
      });

      setInputPortCenters((currentCenters) => (samePortCenters(currentCenters, nextCenters) ? currentCenters : nextCenters));
    };

    const frame = window.requestAnimationFrame(measurePorts);
    window.addEventListener("resize", measurePorts);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measurePorts);
    };
  }, [boardHeight, boardWidth, layoutSignature, nodePositions, workflowZoom]);

  if (!flow) {
    return <div className="empty-state">当前项目还没有可用 Flow。</div>;
  }

  function withUpdatedFlow(sourceProject: Project, targetFlowId: string, update: (targetFlow: VideoFlow) => VideoFlow): Project {
    return {
      ...sourceProject,
      videoFlows: sourceProject.videoFlows.map((item) => (item.id === targetFlowId ? update(item) : item))
    };
  }

  function markVideoGenerating(sourceProject: Project, targetFlowId: string, generationRequestId: string): Project {
    return startVideoGeneration(sourceProject, targetFlowId, generationRequestId);
  }

  function markVideoFailed(sourceProject: Project, targetFlowId: string, error: string): Project {
    return withUpdatedFlow(sourceProject, targetFlowId, (targetFlow) => ({
      ...targetFlow,
      status: "failed",
      error,
      generationRequestId: undefined,
      nodes: {
        ...targetFlow.nodes,
        videoNode: { ...targetFlow.nodes.videoNode, status: "failed", stale: false, error, generationRequestId: undefined },
        previewNode: { ...targetFlow.nodes.previewNode, status: "idle", stale: false }
      }
    }));
  }

  function selectFlow(nextFlowId: string) {
    setFlowId(nextFlowId);
  }

  function handleSegmentSourceClick(
    event: ReactMouseEvent<HTMLElement>,
    segmentFlow: VideoFlow,
    kind: Extract<WorkflowSourceKind, "imagePrompt" | "script">
  ) {
    event.stopPropagation();
    selectFlow(segmentFlow.id);
    if (nodeDragState.current.moved) {
      nodeDragState.current.moved = false;
      return;
    }
    if (kind === "script") setScriptDialogFlowId(segmentFlow.id);
    if (kind === "imagePrompt") setImagePromptDialogFlowId(segmentFlow.id);
  }

  function getBasePosition(segmentIndex: number, kind: WorkflowSourceKind | "video" | "output"): NodePosition {
    const videoX = workflowLayout.videoStartX + segmentIndex * workflowLayout.segmentGapX;
    const sourceX = videoX - workflowLayout.segmentSourceOffsetX;
    const videoY = layoutAxisY + workflowLayout.videoOffsetY;

    if (kind === "video") return { x: videoX, y: videoY };
    if (kind === "output") return { x: videoX + 760, y: videoY + 32 };
    if (kind === "imagePrompt") return { x: sourceX, y: videoY + workflowLayout.imagePromptOffsetY };
    if (kind === "script") return { x: sourceX, y: videoY + workflowLayout.scriptOffsetY };

    return { x: sourceX, y: videoY };
  }

  function getNodeKey(segmentFlowId: string, kind: WorkflowSourceKind | "video" | "output") {
    return `${segmentFlowId}:${kind}`;
  }

  function getModelNodeKey(kind: "character" | "scene", modelId: string) {
    return `model:${kind}:${modelId}`;
  }

  function getPositionForKey(key: string, base: NodePosition): NodePosition {
    const offset = nodePositions[key] || { x: 0, y: 0 };
    return { x: base.x + offset.x, y: base.y + offset.y };
  }

  function getModelBasePosition(kind: "character" | "scene", index: number): NodePosition {
    const models = kind === "character" ? project.characterModels : project.sceneModels;
    return getModelBasePositionForCount(kind, index, models.length, layoutAxisY);
  }

  function getModelBasePositionForCount(kind: "character" | "scene", index: number, count: number, axisY: number): NodePosition {
    const stackTop = axisY - ((Math.max(count, 1) - 1) * workflowLayout.modelGapY) / 2;
    return {
      x: kind === "character" ? workflowLayout.characterX : workflowLayout.sceneX,
      y: stackTop + index * workflowLayout.modelGapY
    };
  }

  function getModelNodePosition(kind: "character" | "scene", modelId: string, index: number): NodePosition {
    return getPositionForKey(getModelNodeKey(kind, modelId), getModelBasePosition(kind, index));
  }

  function getModelNodeStyle(kind: "character" | "scene", modelId: string, index: number): CSSProperties {
    const position = getModelNodePosition(kind, modelId, index);
    return { left: `${position.x}px`, top: `${position.y}px` };
  }

  function getModelPortCenter(kind: "character" | "scene", modelId: string): NodePosition {
    const models = kind === "character" ? project.characterModels : project.sceneModels;
    const index = models.findIndex((model) => model.id === modelId);
    if (index < 0) return { x: 0, y: 0 };
    const position = getModelNodePosition(kind, modelId, index);
    return { x: position.x + 219, y: position.y + 50 };
  }

  function getNodePosition(segmentFlowId: string, kind: WorkflowSourceKind | "video" | "output", index: number): NodePosition {
    const base = getBasePosition(index, kind);
    const offset = nodePositions[getNodeKey(segmentFlowId, kind)] || { x: 0, y: 0 };
    return { x: base.x + offset.x, y: base.y + offset.y };
  }

  function getNodeStyle(segmentFlowId: string, kind: WorkflowSourceKind | "video" | "output", index: number): CSSProperties {
    const position = getNodePosition(segmentFlowId, kind, index);
    return {
      left: `${position.x}px`,
      top: `${position.y}px`
    };
  }

  function getPortCenter(segmentFlowId: string, kind: WorkflowSourceKind | "video", index: number, side: "source" | WorkflowInputKind): NodePosition {
    const position = getNodePosition(segmentFlowId, kind, index);
    if (side === "source") {
      if (kind === "video") return { x: position.x + 286, y: position.y + 112 };
      return { x: position.x + 219, y: position.y + 50 };
    }
    const inputIndex = videoInputOrder.indexOf(side);
    const measuredInputCenter = inputPortCenters[`${segmentFlowId}:${side}`];
    if (measuredInputCenter) return measuredInputCenter;
    return {
      x: position.x,
      y: position.y + videoInputPortGeometry.firstCenterY + inputIndex * videoInputPortGeometry.rowStepY
    };
  }

  function clientToBoard(clientX: number, clientY: number): NodePosition {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: (clientX - rect.left) / workflowZoom, y: (clientY - rect.top) / workflowZoom };
  }

  function boardPath(start: NodePosition, end: NodePosition) {
    const control = Math.max(90, Math.abs(end.x - start.x) * 0.48);
    return `M ${start.x} ${start.y} C ${start.x + control} ${start.y}, ${end.x - control} ${end.y}, ${end.x} ${end.y}`;
  }

  function onCanvasPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    setContextMenu(null);
    const target = event.target as HTMLElement;
    if (target.closest(".workflow-node, .workflow-port, .flow-inspector-grid, .workflow-context-menu, input, textarea, select, button")) return;
    const el = canvasRef.current;
    if (!el) return;
    panState.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop
    };
    el.setPointerCapture(event.pointerId);
  }

  function onCanvasContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest(".workflow-node, .workflow-port, .flow-inspector-grid, .workflow-context-menu, input, textarea, select, button")) return;
    event.preventDefault();
    const point = clientToBoard(event.clientX, event.clientY);
    setContextMenu({ kind: "canvas", x: event.clientX, y: event.clientY, boardX: point.x, boardY: point.y });
  }

  function onCanvasPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = panState.current;
    const el = canvasRef.current;
    if (!state.active || !el) return;
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) state.moved = true;
    el.scrollLeft = state.scrollLeft - deltaX;
    el.scrollTop = state.scrollTop - deltaY;
  }

  function normalizeWheelDelta(event: ReactWheelEvent<HTMLDivElement>) {
    if (event.deltaMode === 1) return event.deltaY * 16;
    if (event.deltaMode === 2) return event.deltaY * event.currentTarget.clientHeight;
    return event.deltaY;
  }

  function onCanvasWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select")) return;

    const el = canvasRef.current;
    if (!el) return;

    event.preventDefault();
    const canvasRect = el.getBoundingClientRect();
    const clientX = event.clientX;
    const clientY = event.clientY;
    const deltaY = normalizeWheelDelta(event);
    const scrollLeft = el.scrollLeft;
    const scrollTop = el.scrollTop;

    setWorkflowZoom((currentScale) => {
      const next = calculateWheelZoom({
        currentScale,
        minScale: workflowZoomLimits.min,
        maxScale: workflowZoomLimits.max,
        deltaY,
        clientX,
        clientY,
        canvasRect,
        scrollLeft,
        scrollTop
      });

      if (Math.abs(next.scale - currentScale) < 0.001) return currentScale;

      pendingZoomScrollRef.current = {
        scrollLeft: next.scrollLeft,
        scrollTop: next.scrollTop
      };
      return next.scale;
    });
  }

  function endCanvasPan(event: ReactPointerEvent<HTMLDivElement>) {
    panState.current.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function startNodeDrag(event: ReactPointerEvent<HTMLElement>, segmentFlowId: string, kind: WorkflowSourceKind | "video" | "output") {
    const target = event.target as HTMLElement;
    if (target.closest(".workflow-port, .workflow-upload-trigger, button, input, textarea, select")) return;
    startNodeDragByKey(event, getNodeKey(segmentFlowId, kind));
  }

  function startNodeDragByKey(event: ReactPointerEvent<HTMLElement>, key: string) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".workflow-port, .workflow-upload-trigger, button, input, textarea, select")) return;
    const current = nodePositions[key] || { x: 0, y: 0 };
    event.preventDefault();
    event.stopPropagation();
    nodeDragState.current = {
      active: true,
      moved: false,
      key,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
      latestX: current.x,
      latestY: current.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveNode(event: ReactPointerEvent<HTMLElement>) {
    const state = nodeDragState.current;
    if (!state.active) return;
    if (Math.abs(event.clientX - state.startX) > 3 || Math.abs(event.clientY - state.startY) > 3) {
      state.moved = true;
    }
    const nextOffset = {
      x: state.originX + (event.clientX - state.startX) / workflowZoom,
      y: state.originY + (event.clientY - state.startY) / workflowZoom
    };
    state.latestX = nextOffset.x;
    state.latestY = nextOffset.y;
    setNodePositions((current) => ({
      ...current,
      [state.key]: nextOffset
    }));
  }

  function endNodeDrag(event: ReactPointerEvent<HTMLElement>) {
    const state = nodeDragState.current;
    const shouldPersist = state.active && state.moved && Boolean(state.key);
    const key = state.key;
    const finalOffset = normalizeFlowMapOffset({ x: state.latestX, y: state.latestY });
    state.active = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (shouldPersist) {
      setNodePositions((current) => ({ ...current, [key]: finalOffset }));
      void persistNodePosition(key, finalOffset);
    }
  }

  async function persistNodePosition(key: string, offset: NodePosition) {
    const nextProject = withPersistedNodeOffset(projectRef.current, key, offset);
    if (nextProject === projectRef.current) return;

    applyProject(nextProject);
    try {
      const savedProject = await apiClient.saveProject(nextProject);
      applyProject(savedProject);
    } catch (error) {
      onAssistantMessage(error instanceof Error ? error.message : "保存 Flow Map 框体位置失败");
    }
  }

  function draggableNodeProps(segmentFlowId: string, kind: WorkflowSourceKind | "video" | "output", onClickWithoutDrag?: () => void) {
    const key = getNodeKey(segmentFlowId, kind);
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startNodeDrag(event, segmentFlowId, kind),
      onPointerMove: moveNode,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        const shouldTriggerClick =
          nodeDragState.current.active && nodeDragState.current.key === key && !nodeDragState.current.moved;
        endNodeDrag(event);
        if (shouldTriggerClick) onClickWithoutDrag?.();
      },
      onPointerCancel: endNodeDrag
    };
  }

  function draggableNodePropsByKey(key: string, onClickWithoutDrag?: () => void) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLElement>) => startNodeDragByKey(event, key),
      onPointerMove: moveNode,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        const shouldTriggerClick =
          nodeDragState.current.active && nodeDragState.current.key === key && !nodeDragState.current.moved;
        endNodeDrag(event);
        if (shouldTriggerClick) onClickWithoutDrag?.();
      },
      onPointerCancel: endNodeDrag
    };
  }

  function startConnection(
    event: ReactPointerEvent<HTMLButtonElement>,
    input: { fromFlowId?: string; sourceId?: string; sourceKind: WorkflowSourceKind }
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const start = clientToBoard(event.clientX, event.clientY);
    const drag = {
      fromFlowId: input.fromFlowId,
      sourceId: input.sourceId,
      sourceKind: input.sourceKind,
      startX: start.x,
      startY: start.y,
      currentX: start.x,
      currentY: start.y
    };
    connectionDragRef.current = drag;
    setConnectionDrag(drag);
    updateConnectionDragPath(drag);
    window.addEventListener("pointermove", onConnectionMove);
    window.addEventListener("pointerup", onConnectionEnd, { once: true });
    window.addEventListener("pointercancel", onConnectionEnd, { once: true });
  }

  function onConnectionMove(event: PointerEvent) {
    const drag = connectionDragRef.current;
    if (!drag) return;
    const point = clientToBoard(event.clientX, event.clientY);
    const next = { ...drag, currentX: point.x, currentY: point.y };
    connectionDragRef.current = next;
    updateConnectionDragPath(next);
  }

  function onConnectionEnd(event: PointerEvent) {
    window.removeEventListener("pointermove", onConnectionMove);
    window.removeEventListener("pointerup", onConnectionEnd);
    window.removeEventListener("pointercancel", onConnectionEnd);
    const drag = connectionDragRef.current;
    connectionDragRef.current = null;
    setConnectionDrag(null);
    if (!drag) return;
    const expectedInputKind = sourceMeta[drag.sourceKind].input;
    const input = findWorkflowInputAtPoint(event.clientX, event.clientY, expectedInputKind);
    const toFlowId = input?.flowId;
    const inputKind = input?.inputKind;
    if (!toFlowId || !inputKind) return;
    if (inputKind !== expectedInputKind) {
      onAssistantMessage(`${sourceMeta[drag.sourceKind].label}只能连接到${inputLabels[expectedInputKind]}输入口。`);
      return;
    }
    void connectWorkflowNode(drag, toFlowId, inputKind);
  }

  function updateConnectionDragPath(drag: ConnectionDrag) {
    connectionDragPathRef.current?.setAttribute(
      "d",
      boardPath({ x: drag.startX, y: drag.startY }, { x: drag.currentX, y: drag.currentY })
    );
  }

  function findWorkflowInputAtPoint(
    clientX: number,
    clientY: number,
    expectedInputKind: WorkflowInputKind
  ): { flowId: string; inputKind: WorkflowInputKind } | undefined {
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    const direct = readWorkflowInput(target?.closest<HTMLElement>("[data-workflow-input]"));
    if (direct) return direct;

    let best: { flowId: string; inputKind: WorkflowInputKind; distance: number } | undefined;
    boardRef.current?.querySelectorAll<HTMLElement>("[data-workflow-input]").forEach((candidate) => {
      const input = readWorkflowInput(candidate);
      if (!input || input.inputKind !== expectedInputKind) return;
      const port = candidate.querySelector<HTMLElement>("[data-workflow-input-port='true']");
      const rect = (port || candidate).getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(clientX - centerX, clientY - centerY);
      if (distance > workflowDropHitRadius) return;
      if (!best || distance < best.distance) {
        best = { ...input, distance };
      }
    });

    return best;
  }

  function readWorkflowInput(element?: HTMLElement | null): { flowId: string; inputKind: WorkflowInputKind } | undefined {
    const flowId = element?.dataset.flowId;
    const inputKind = element?.dataset.inputKind as WorkflowInputKind | undefined;
    if (!flowId || !inputKind) return undefined;
    return { flowId, inputKind };
  }

  async function connectWorkflowNode(source: Pick<ConnectionDrag, "fromFlowId" | "sourceId" | "sourceKind">, toFlowId: string, inputKind: WorkflowInputKind) {
    const currentProject = projectRef.current;
    const sourceFlow = source.fromFlowId ? currentProject.videoFlows.find((item) => item.id === source.fromFlowId) : undefined;
    const targetFlow = currentProject.videoFlows.find((item) => item.id === toFlowId);
    const hasModelSource =
      source.sourceKind === "character"
        ? currentProject.characterModels.some((model) => model.id === source.sourceId)
        : source.sourceKind === "scene"
          ? currentProject.sceneModels.some((model) => model.id === source.sourceId)
          : false;
    if ((!sourceFlow && !hasModelSource) || !targetFlow) return;

    const edgeInputs = createWorkflowEdgesForConnection(currentProject, {
      fromFlowId: source.fromFlowId,
      sourceId: source.sourceId,
      toFlowId,
      sourceKind: source.sourceKind,
      inputKind
    });
    if (edgeInputs.length === 0) {
      onAssistantMessage(`${sourceMeta[source.sourceKind].label}节点还没有可复用的内容。`);
      return;
    }

    const previousProject = currentProject;
    const now = new Date().toISOString();
    const optimisticEdges: WorkflowEdge[] = edgeInputs.map((edge, index) => ({
      ...edge,
      id: edge.id || `local-${now}-${source.sourceKind}-${toFlowId}-${index}`,
      createdAt: now,
      updatedAt: now
    }));
    const optimisticProject = applyWorkflowConnectionToProject(
      {
        ...currentProject,
        workflowEdges: upsertWorkflowEdges(currentProject.workflowEdges, optimisticEdges)
      },
      {
        fromFlowId: source.fromFlowId,
        sourceId: source.sourceId,
        toFlowId,
        sourceKind: source.sourceKind,
        inputKind
      }
    );
    applyProject(optimisticProject);
    setFlowId(toFlowId);
    onAssistantMessage(`${sourceMeta[source.sourceKind].label} 已连接，正在后台保存。`);

    try {
      await Promise.all(edgeInputs.map((edge) => apiClient.createWorkflowEdge(currentProject.id, edge)));
      const latestProject = await apiClient.getProject(currentProject.id);
      const nextProject = applyWorkflowConnectionToProject(latestProject, {
        fromFlowId: source.fromFlowId,
        sourceId: source.sourceId,
        toFlowId,
        sourceKind: source.sourceKind,
        inputKind
      });
      const savedProject = await apiClient.saveProject(nextProject);
      if (projectRef.current === optimisticProject) {
        applyProject(savedProject);
        setFlowId(toFlowId);
      }
      onAssistantMessage(`${sourceMeta[source.sourceKind].label} 已连接到目标片段。`);
    } catch (error) {
      if (projectRef.current === optimisticProject) {
        applyProject(previousProject);
      }
      onAssistantMessage(error instanceof Error ? error.message : "connect workflow node failed");
    }
  }

  async function createManualModelSource(kind: WorkflowModelKind, boardPoint: NodePosition) {
    const id = `manual-${kind}-${Date.now()}`;
    const existingCount = kind === "character" ? projectRef.current.characterModels.length : projectRef.current.sceneModels.length;
    const nextCharacterCount = kind === "character" ? existingCount + 1 : projectRef.current.characterModels.length;
    const nextSceneCount = kind === "scene" ? existingCount + 1 : projectRef.current.sceneModels.length;
    const nextRequiredRows = Math.max(nextCharacterCount, nextSceneCount, 1);
    const nextBoardHeight = Math.max(workflowLayout.minBoardHeight, nextRequiredRows * workflowLayout.modelGapY + 1800);
    const nextAxisY = Math.floor(nextBoardHeight / 2);
    const base = getModelBasePositionForCount(kind, existingCount, existingCount + 1, nextAxisY);
    const nodeKey = getModelNodeKey(kind, id);
    const nextProject = createWorkflowModelSource(projectRef.current, kind, {
      id,
      name: kind === "character" ? "新人物模型" : "新场景模型"
    });
    if (nextProject === projectRef.current) return;
    const offset = {
      x: boardPoint.x - base.x,
      y: boardPoint.y - base.y
    };
    const positionedProject = withPersistedNodeOffset(nextProject, nodeKey, offset);

    setNodePositions((current) => ({
      ...current,
      [nodeKey]: normalizeFlowMapOffset(offset)
    }));
    setContextMenu(null);
    applyProject(positionedProject);
    setBusy(true);
    try {
      await onSave(positionedProject, kind === "character" ? "人物模型框体已新增。" : "场景模型框体已新增。");
    } catch (error) {
      onAssistantMessage(error instanceof Error ? error.message : "create workflow model failed");
    } finally {
      setBusy(false);
    }
  }

  async function createManualVideoSegment(boardPoint: NodePosition) {
    const currentProject = projectRef.current;
    const nextProject = createWorkflowVideoSegment(currentProject);
    if (nextProject === currentProject) return;

    const nextFlow = nextProject.videoFlows[nextProject.videoFlows.length - 1];
    if (!nextFlow) return;
    const nextIndex = nextProject.videoFlows.findIndex((item) => item.id === nextFlow.id);
    const base = getBasePosition(nextIndex, "video");
    const offset = {
      x: boardPoint.x - base.x,
      y: boardPoint.y - base.y
    };
    const positionedProject = ["video", "imagePrompt", "script"].reduce(
      (currentProject, kind) => withPersistedNodeOffset(currentProject, getNodeKey(nextFlow.id, kind as FlowMapSegmentNodeKind), offset),
      nextProject
    );
    setNodePositions((current) => ({
      ...current,
      [getNodeKey(nextFlow.id, "video")]: normalizeFlowMapOffset(offset),
      [getNodeKey(nextFlow.id, "imagePrompt")]: normalizeFlowMapOffset(offset),
      [getNodeKey(nextFlow.id, "script")]: normalizeFlowMapOffset(offset)
    }));
    setContextMenu(null);
    applyProject(positionedProject);
    setFlowId(nextFlow.id);
    setBusy(true);
    try {
      const savedProject = await apiClient.saveProject(positionedProject);
      const savedFlow = savedProject.videoFlows.find((item) => item.id === nextFlow.id || item.shotId === nextFlow.shotId);
      applyProject(savedProject);
      setFlowId(savedFlow?.id || nextFlow.id);
      onAssistantMessage("15s 视频片段框体已新增。");
    } catch (error) {
      onAssistantMessage(error instanceof Error ? error.message : "create workflow video segment failed");
    } finally {
      setBusy(false);
    }
  }

  async function commitModelName(kind: WorkflowModelKind, modelId: string, value: string) {
    const nodeKey = getModelNodeKey(kind, modelId);
    setModelNameDrafts((current) => {
      const next = { ...current };
      delete next[nodeKey];
      return next;
    });

    const currentProject = projectRef.current;
    const nextProject = updateWorkflowModelName(currentProject, kind, modelId, value);
    if (nextProject === currentProject) return;

    applyProject(nextProject);
    setBusy(true);
    try {
      await onSave(nextProject, "模型名称已保存。");
    } catch (error) {
      onAssistantMessage(error instanceof Error ? error.message : "rename workflow model failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectModelConnection(kind: WorkflowModelKind, modelId: string, flowId: string, edgeIds: string[] = []) {
    const currentProject = projectRef.current;
    const nextProject = disconnectWorkflowModelFromFlow(currentProject, kind, modelId, flowId);
    if (nextProject === currentProject) return;

    setContextMenu(null);
    applyProject(nextProject);
    setBusy(true);
    try {
      await deletePersistedWorkflowEdges(edgeIds);
      await onSave(nextProject, "模型与片段的连接已断开。");
    } catch (error) {
      onProjectChange(currentProject);
      onAssistantMessage(error instanceof Error ? error.message : "disconnect workflow model failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnectSegmentSourceConnection(
    sourceKind: WorkflowSegmentSourceKind,
    fromFlowId: string,
    toFlowId: string,
    edgeIds: string[] = []
  ) {
    const currentProject = projectRef.current;
    const nextProject = disconnectWorkflowSegmentSourceFromFlow(currentProject, sourceKind, fromFlowId, toFlowId);
    if (nextProject === currentProject) return;

    setContextMenu(null);
    applyProject(nextProject);
    setBusy(true);
    try {
      await deletePersistedWorkflowEdges(edgeIds);
      await onSave(nextProject, `${sourceMeta[sourceKind].label}与片段的连接已断开。`);
    } catch (error) {
      onProjectChange(currentProject);
      onAssistantMessage(error instanceof Error ? error.message : "disconnect workflow segment source failed");
    } finally {
      setBusy(false);
    }
  }

  async function deletePersistedWorkflowEdges(edgeIds: string[]) {
    const uniqueEdgeIds = Array.from(new Set(edgeIds.filter(Boolean)));
    await Promise.all(uniqueEdgeIds.map(async (edgeId) => {
      try {
        await apiClient.deleteWorkflowEdge(projectRef.current.id, edgeId);
      } catch (error) {
        if (!isApiNotFoundError(error)) throw error;
      }
    }));
  }

  async function deleteModelSource(kind: WorkflowModelKind, modelId: string) {
    const currentProject = projectRef.current;
    const model = kind === "character"
      ? currentProject.characterModels.find((item) => item.id === modelId)
      : currentProject.sceneModels.find((item) => item.id === modelId);
    if (!model) return;
    if (!window.confirm(`删除“${model.name}”框体？相关 15 秒片段连接会一并断开。`)) return;

    const nextProject = deleteWorkflowModelSource(currentProject, kind, modelId);
    if (nextProject === currentProject) return;

    const nodeKey = getModelNodeKey(kind, modelId);
    setNodePositions((current) => {
      const next = { ...current };
      delete next[nodeKey];
      return next;
    });
    setModelNameDrafts((current) => {
      const next = { ...current };
      delete next[nodeKey];
      return next;
    });
    if (modelDialog?.kind === kind && modelDialog.id === modelId) setModelDialog(null);
    setContextMenu(null);
    applyProject(nextProject);
    setBusy(true);
    try {
      await onSave(nextProject, kind === "character" ? "人物模型框体已删除。" : "场景模型框体已删除。");
    } catch (error) {
      onAssistantMessage(error instanceof Error ? error.message : "delete workflow model failed");
    } finally {
      setBusy(false);
    }
  }

  function handleModelContextMenu(event: ReactMouseEvent<HTMLElement>, kind: WorkflowModelKind, modelId: string) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button")) return;
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ kind: "model", x: event.clientX, y: event.clientY, modelKind: kind, modelId });
  }

  function handleSegmentSourceContextMenu(
    event: ReactMouseEvent<HTMLElement>,
    sourceKind: WorkflowSegmentSourceKind,
    flowId: string
  ) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button")) return;
    event.preventDefault();
    event.stopPropagation();
    selectFlow(flowId);
    setContextMenu({ kind: "segmentSource", x: event.clientX, y: event.clientY, sourceKind, flowId });
  }

  function getContextMenuStyle(): CSSProperties {
    if (!contextMenu) return {};
    const menuWidth = 260;
    const menuHeight = 320;
    const viewportWidth = window.innerWidth || menuWidth;
    const viewportHeight = window.innerHeight || menuHeight;
    return {
      left: `${Math.max(8, Math.min(contextMenu.x, viewportWidth - menuWidth - 8))}px`,
      top: `${Math.max(8, Math.min(contextMenu.y, viewportHeight - menuHeight - 8))}px`
    };
  }

  function renderContextMenu() {
    if (!contextMenu) return null;

    if (contextMenu.kind === "canvas") {
      return (
        <div
          className="workflow-context-menu"
          style={getContextMenuStyle()}
          role="menu"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <span className="workflow-context-menu-title">新增框体</span>
          <button type="button" role="menuitem" onClick={() => void createManualModelSource("character", { x: contextMenu.boardX, y: contextMenu.boardY })}>
            <Plus size={15} />
            新建人物模型框体
          </button>
          <button type="button" role="menuitem" onClick={() => void createManualModelSource("scene", { x: contextMenu.boardX, y: contextMenu.boardY })}>
            <Plus size={15} />
            新建场景模型框体
          </button>
          <button type="button" role="menuitem" onClick={() => void createManualVideoSegment({ x: contextMenu.boardX, y: contextMenu.boardY })}>
            <Video size={15} />
            新建 15s 视频片段框体
          </button>
        </div>
      );
    }

    if (contextMenu.kind === "segmentSource") {
      const sourceFlow = project.videoFlows.find((item) => item.id === contextMenu.flowId);
      const sourceIndex = project.videoFlows.findIndex((item) => item.id === contextMenu.flowId);
      const meta = sourceMeta[contextMenu.sourceKind];
      const title = `${sourceIndex >= 0 ? `第 ${sourceIndex + 1} 段 ` : ""}${meta.label}`;
      const linkedConnections = connections.filter(
        (connection) => connection.sourceKind === contextMenu.sourceKind && connection.fromFlowId === contextMenu.flowId
      );

      return (
        <div
          className="workflow-context-menu"
          style={getContextMenuStyle()}
          role="menu"
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <span className="workflow-context-menu-title">{title}</span>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setContextMenu(null);
              if (contextMenu.sourceKind === "script") setScriptDialogFlowId(contextMenu.flowId);
              if (contextMenu.sourceKind === "imagePrompt") setImagePromptDialogFlowId(contextMenu.flowId);
            }}
          >
            <Pencil size={15} />
            打开{meta.label}
          </button>
          {linkedConnections.length > 0 ? (
            linkedConnections.map((connection) => {
              const targetIndex = project.videoFlows.findIndex((item) => item.id === connection.toFlowId);
              const segmentLabel = targetIndex >= 0 ? `断开第 ${targetIndex + 1} 段 15s 视频连接` : "断开 15s 视频连接";
              return (
                <button
                  type="button"
                  role="menuitem"
                  key={connection.id}
                  onClick={() =>
                    void disconnectSegmentSourceConnection(
                      contextMenu.sourceKind,
                      contextMenu.flowId,
                      connection.toFlowId,
                      connection.edgeIds
                    )
                  }
                >
                  <Unlink size={15} />
                  {segmentLabel}
                </button>
              );
            })
          ) : (
            <span className="workflow-context-menu-empty">暂无 15s 视频连接</span>
          )}
          {!sourceFlow ? <span className="workflow-context-menu-empty">源片段已不存在</span> : null}
        </div>
      );
    }

    const model = contextMenu.modelKind === "character"
      ? project.characterModels.find((item) => item.id === contextMenu.modelId)
      : project.sceneModels.find((item) => item.id === contextMenu.modelId);
    const linkedConnections = connections.filter(
      (connection) => connection.sourceKind === contextMenu.modelKind && connection.sourceId === contextMenu.modelId
    );

    return (
      <div
        className="workflow-context-menu"
        style={getContextMenuStyle()}
        role="menu"
        onClick={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <span className="workflow-context-menu-title">{model?.name || "模型框体"}</span>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setContextMenu(null);
            setModelDialog({ kind: contextMenu.modelKind, id: contextMenu.modelId });
          }}
        >
          <Pencil size={15} />
          打开模型详情
        </button>
        {linkedConnections.length > 0 ? (
          linkedConnections.map((connection) => {
            const index = project.videoFlows.findIndex((item) => item.id === connection.toFlowId);
            const segmentLabel = index >= 0 ? `断开第 ${index + 1} 段 15s` : "断开片段连接";
            return (
              <button
                type="button"
                role="menuitem"
                key={connection.id}
                onClick={() =>
                  void disconnectModelConnection(
                    contextMenu.modelKind,
                    contextMenu.modelId,
                    connection.toFlowId,
                    connection.edgeIds
                  )
                }
              >
                <Unlink size={15} />
                {segmentLabel}
              </button>
            );
          })
        ) : (
          <span className="workflow-context-menu-empty">暂无片段连接</span>
        )}
        <button
          className="danger"
          type="button"
          role="menuitem"
          onClick={() => void deleteModelSource(contextMenu.modelKind, contextMenu.modelId)}
        >
          <Trash2 size={15} />
          删除框体
        </button>
      </div>
    );
  }

  function getConnectionPath(connection: WorkflowConnection) {
    const toIndex = project.videoFlows.findIndex((item) => item.id === connection.toFlowId);
    if (toIndex < 0) return "";
    const start = getConnectionStart(connection);
    const end = getPortCenter(connection.toFlowId, "video", toIndex, connection.inputKind);
    return boardPath(start, end);
  }

  function getConnectionStart(connection: WorkflowConnection): NodePosition {
    if ((connection.sourceKind === "character" || connection.sourceKind === "scene") && connection.sourceId) {
      return getModelPortCenter(connection.sourceKind, connection.sourceId);
    }
    if (!connection.fromFlowId) return { x: 0, y: 0 };
    const fromIndex = project.videoFlows.findIndex((item) => item.id === connection.fromFlowId);
    if (fromIndex < 0) return { x: 0, y: 0 };
    return getPortCenter(connection.fromFlowId, connection.sourceKind, fromIndex, "source");
  }

  function hasSourceConnection(sourceKind: WorkflowSourceKind, input: { sourceId?: string; fromFlowId?: string }) {
    return connections.some((connection) => {
      if (connection.sourceKind !== sourceKind) return false;
      if (input.sourceId) return connection.sourceId === input.sourceId;
      if (input.fromFlowId) return connection.fromFlowId === input.fromFlowId;
      return false;
    });
  }

  function hasInputConnection(targetFlowId: string, inputKind: WorkflowInputKind) {
    return connections.some((connection) => connection.toFlowId === targetFlowId && connection.inputKind === inputKind);
  }

  async function persistCurrent() {
    await onSave(project, "Flow Map 参数已保存。");
  }

  async function copyImagePromptText(text: string, label: string) {
    if (!text.trim()) {
      onAssistantMessage(`${label}暂无可复制内容。`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      onAssistantMessage(`${label}已复制。`);
    } catch {
      onAssistantMessage("复制失败，请手动选中文本复制。");
    }
  }

  function getImagePromptTextForFlow(segmentFlow: VideoFlow): string {
    const scenePrompts = getSelectedSceneIds(segmentFlow)
      .map((sceneId) => project.sceneModels.find((model) => model.id === sceneId))
      .filter((model): model is SceneModel => Boolean(model))
      .map((model) => buildSceneImagePromptSourceText(model))
      .filter((value): value is string => Boolean(value));

    if (scenePrompts.length > 0) return scenePrompts.join("\n\n");

    const shot = project.storyState.storyboard.find((item) => item.id === segmentFlow.shotId);
    return sanitizeImagePromptSourceText(segmentFlow.imagePrompt?.trim() || shot?.imagePrompt?.trim() || "", {
      maxLength: 900
    });
  }

  function getFullImagePromptTextForFlow(segmentFlow: VideoFlow): string {
    return [
      buildGlobalSceneStylePrompt(project.storyState, segmentFlow.aspectRatio || "9:16").fullPrompt,
      getImagePromptCharacterLockTextForFlow(segmentFlow),
      getImagePromptTextForFlow(segmentFlow)
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function getImagePromptCharacterLockTextForFlow(segmentFlow: VideoFlow): string {
    const characters = getSelectedCharacterIds(segmentFlow)
      .map((id) => project.characterModels.find((model) => model.id === id))
      .filter((model): model is CharacterModel => Boolean(model));
    if (characters.length === 0) {
      return "人物约束：当前片段未连接人物模型；Image Prompt 候选图只作为场景、色调、构图和镜头质感参考，不要生成新的未选人物。";
    }
    return [
      `人物模型参考：${characters.map((character) => character.name).join("、")}`,
      "生成 Image Prompt 候选图时必须沿用当前片段已选并确认的人物模型图；如画面出现人物，不得改变脸型、五官比例、发型、发色、体型、服装轮廓和配色，不得生成新人物或路人。"
    ].join("\n");
  }

  function getImagePromptReferenceUrl(segmentFlow: VideoFlow): string | undefined {
    if (segmentFlow.nodes.promptNode.confirmedImageId) {
      return project.assets.find((asset) => asset.id === segmentFlow.nodes.promptNode.confirmedImageId)?.url
        || segmentFlow.nodes.promptNode.candidateImages?.find((asset) => asset.id === segmentFlow.nodes.promptNode.confirmedImageId)?.url
        || segmentFlow.imagePromptImageUrl;
    }
    return segmentFlow.imagePromptImageUrl;
  }

  function getImagePromptCandidates(segmentFlow: VideoFlow) {
    return segmentFlow.nodes.promptNode.candidateImages || [];
  }

  function getImagePromptPreviewAsset(segmentFlow: VideoFlow) {
    const candidates = getImagePromptCandidates(segmentFlow);
    if (segmentFlow.nodes.promptNode.confirmedImageId) {
      return candidates.find((asset) => asset.id === segmentFlow.nodes.promptNode.confirmedImageId)
        || project.assets.find((asset) => asset.id === segmentFlow.nodes.promptNode.confirmedImageId);
    }

    return candidates[0];
  }

  function getImagePromptAspectRatio(segmentFlow: VideoFlow): string {
    return segmentFlow.nodes.promptNode.imageAspectRatio || segmentFlow.aspectRatio || "9:16";
  }

  function getImagePromptStatus(segmentFlow: VideoFlow): GenerationStatus {
    const node = segmentFlow.nodes.promptNode;
    const hasGeneratedImage = Boolean(node.confirmedImageId || node.candidateImages?.length || segmentFlow.imagePromptImageUrl);
    if (node.status === "ready" && !hasGeneratedImage) return "idle";
    return node.status;
  }

  async function generateVideo() {
    if (selectedCharacterModelIds.length === 0 || selectedSceneModelIds.length === 0) {
      const error = "请先至少选择一个人物模型和一个场景模型。";
      onProjectChange(markVideoFailed(project, flow.id, error));
      onAssistantMessage(error);
      return;
    }
    let controller: AbortController | undefined;
    let generationRequestId: string | undefined;
    try {
      const flowIndex = Math.max(0, project.videoFlows.findIndex((item) => item.id === flow.id));
      const segmentIndex = getSegmentIndexForStoryboardShot(selectedShot, flowIndex);
      const segmentScript = formatStoryboardShot(selectedShot, flow, flowIndex, project.storyState.seedanceScript);
      const previousSegmentScript =
        segmentIndex > 0 ? extractSeedanceSegmentScript(project.storyState.seedanceScript, segmentIndex - 1) : "";
      const nextSegmentScript = extractSeedanceSegmentScript(project.storyState.seedanceScript, segmentIndex + 1);
      const selectedCharacterModels = selectedCharacterModelIds
        .map((id) => project.characterModels.find((model) => model.id === id))
        .filter((model): model is CharacterModel => Boolean(model));
      const activeCharacterModels = getActiveCharacterModelsForSegment(segmentScript, selectedCharacterModels);
      const selectedSceneModels = selectedSceneModelIds
        .map((id) => project.sceneModels.find((model) => model.id === id))
        .filter((model): model is SceneModel => Boolean(model));
      const missingConfirmedReferences = buildMissingConfirmedReferenceMessage(selectedCharacterModels, selectedSceneModels);
      if (missingConfirmedReferences) {
        onProjectChange(markVideoFailed(project, flow.id, missingConfirmedReferences));
        onAssistantMessage(missingConfirmedReferences);
        return;
      }
      generationRequestId = createGenerationRequestId("video", flow.id);
      controller = new AbortController();
      videoGenerationControllers.current[flow.id] = controller;
      videoGenerationRequestIds.current[flow.id] = generationRequestId;
      const generatingProject = markVideoGenerating(project, flow.id, generationRequestId);
      startVideoProgress(flow.id);
      applyProject(generatingProject);
      setBusy(true);
      onAssistantMessage("Seedance 2.0 视频任务已开始，正在检查参考图并提交生成。");
      const syncedProject = await apiClient.saveProject(generatingProject);
      if (controller.signal.aborted) return;
      applyProject(syncedProject);
      const styleReferenceImageUrl = getImagePromptReferenceUrl(flow);
      const referenceImageNotes = [
        ...activeCharacterModels.map(buildCharacterVideoReferenceNote),
        ...selectedSceneModels.map(buildSceneVideoReferenceNote),
        ...(styleReferenceImageUrl ? [buildStyleVideoReferenceNote(project.storyState, flow)] : [])
      ];
      const stylePrompt = buildGlobalSceneStylePrompt(project.storyState, flow.aspectRatio || "9:16");
      const next = await apiClient.generateVideo({
        projectId: project.id,
        flowId: flow.id,
        characterModelIds: selectedCharacterModelIds,
        activeCharacterModelIds: activeCharacterModels.map((model) => model.id),
        sceneModelIds: selectedSceneModelIds,
        styleReferenceImageUrl,
        prompt: buildVideoPrompt(
          segmentScript,
          stylePrompt.fullPrompt,
          {
            segmentIndex,
            previousSegmentScript,
            nextSegmentScript
          },
          {
            activeCharacterNames: activeCharacterModels.map((model) => model.name),
            referenceImageNotes,
            characterLockPrompts: activeCharacterModels.map(buildCharacterLockPrompt),
            sceneLockPrompts: selectedSceneModels.map(buildSceneLockPrompt)
          }
        ),
        aspectRatio: flow.aspectRatio,
        durationSeconds: 15
      }, {
        signal: controller.signal,
        generationRequestId
      });
      if (controller.signal.aborted) return;
      applyProject(next);
      const nextFlow = next.videoFlows.find((item) => item.id === flow.id);
      if (nextFlow?.status === "ready") {
        await finishVideoProgress(flow.id);
        onAssistantMessage("15 秒视频任务已完成。Mock 模式会显示占位预览，真实模式会显示 Provider 返回素材。");
      } else if (nextFlow?.status === "failed") {
        stopVideoProgress(flow.id);
        onAssistantMessage(nextFlow.error || nextFlow.nodes.videoNode.error || "视频生成失败");
      } else {
        holdVideoProgress(flow.id);
        if (nextFlow?.pendingVideoJobId) {
          void pollPendingVideoJob(flow.id, nextFlow.pendingVideoJobId, project.id);
        }
        onAssistantMessage("Seedance 2.0 视频任务已提交，正在等待最终视频 URL。");
      }
    } catch (error) {
      if (controller?.signal.aborted) return;
      if (generationRequestId && isRecoverableVideoGenerationRequestError(error)) {
        const recoveredProject = await recoverSubmittedVideoGeneration(project.id, flow.id, generationRequestId, controller?.signal);
        if (controller?.signal.aborted) return;
        if (recoveredProject) {
          applyProject(recoveredProject);
          const recoveredFlow = recoveredProject.videoFlows.find((item) => item.id === flow.id);
          if (recoveredFlow?.status === "ready") {
            await finishVideoProgress(flow.id);
            onAssistantMessage("视频生成请求连接中断过一次，但后端已完成并回填结果。");
            return;
          }
          if (recoveredFlow?.status === "failed") {
            stopVideoProgress(flow.id);
            onAssistantMessage(recoveredFlow.error || recoveredFlow.nodes.videoNode.error || "视频生成失败");
            return;
          }
          holdVideoProgress(flow.id);
          if (recoveredFlow?.pendingVideoJobId) {
            void pollPendingVideoJob(flow.id, recoveredFlow.pendingVideoJobId, project.id);
          }
          onAssistantMessage("视频生成请求连接中断过一次，但后端任务已提交，系统会继续等待最终视频 URL。");
          return;
        }
      }

      stopVideoProgress(flow.id);
      const message = isRecoverableVideoGenerationRequestError(error)
        ? "视频生成请求连接中断，暂时无法确认后端任务状态。请稍后刷新项目，或重新点击生成。"
        : error instanceof Error ? error.message : "视频生成失败";
      applyProject(markVideoFailed(projectRef.current, flow.id, message));
      onAssistantMessage(message);
    } finally {
      if (controller && videoGenerationControllers.current[flow.id] === controller) {
        delete videoGenerationControllers.current[flow.id];
        delete videoGenerationRequestIds.current[flow.id];
      }
      setBusy(false);
    }
  }

  async function recoverSubmittedVideoGeneration(
    projectId: string,
    targetFlowId: string,
    generationRequestId: string,
    signal?: AbortSignal
  ): Promise<Project | undefined> {
    onAssistantMessage("视频生成请求连接中断，正在检查后端是否已经保存任务状态。");
    const deadline = Date.now() + videoGenerationRecoveryMs;

    while (!signal?.aborted && Date.now() < deadline) {
      await delay(videoGenerationRecoveryPollMs);
      if (signal?.aborted) return undefined;

      try {
        const latestProject = await apiClient.getProject(projectId);
        if (hasRecoveredVideoGenerationResult(latestProject, targetFlowId, generationRequestId)) {
          return latestProject;
        }
      } catch {
        // Keep polling through transient project-refresh failures after a disconnected video request.
      }
    }

    return undefined;
  }

  async function cancelVideoGenerationRequest(targetFlowId: string) {
    const latestProject = projectRef.current;
    const targetFlow = latestProject.videoFlows.find((item) => item.id === targetFlowId);
    const requestId = videoGenerationRequestIds.current[targetFlowId] || targetFlow?.generationRequestId;
    if (targetFlow?.pendingVideoJobId) {
      cancelledVideoJobs.current.add(targetFlow.pendingVideoJobId);
    }
    videoGenerationControllers.current[targetFlowId]?.abort();
    delete videoGenerationControllers.current[targetFlowId];
    delete videoGenerationRequestIds.current[targetFlowId];
    stopVideoProgress(targetFlowId);
    setBusy(false);
    const nextProject = cancelVideoGeneration(latestProject, targetFlowId, requestId);
    applyProject(nextProject);
    try {
      const savedProject = await apiClient.saveProject(nextProject);
      applyProject(savedProject);
    } catch {
      // Keep local cancellation visible if persistence has a transient failure.
    }
    onAssistantMessage("视频生成已取消。");
  }

  function startVideoProgress(targetFlowId: string) {
    stopVideoProgress(targetFlowId, false);
    const startedAt = Date.now();
    setVideoProgressById((current) => ({ ...current, [targetFlowId]: 3 }));
    videoProgressTimers.current[targetFlowId] = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const expectedMs = 180000;
      const base = Math.min(88, (elapsed / expectedMs) * 88);
      const slowTail = elapsed > expectedMs ? Math.min(8, ((elapsed - expectedMs) / expectedMs) * 8) : 0;
      setVideoProgressById((current) => ({
        ...current,
        [targetFlowId]: Math.max(current[targetFlowId] || 0, Math.min(96, base + slowTail))
      }));
    }, 500);
  }

  async function finishVideoProgress(targetFlowId: string) {
    stopVideoProgress(targetFlowId, false);
    setVideoProgressById((current) => ({ ...current, [targetFlowId]: 100 }));
    await new Promise((resolve) => window.setTimeout(resolve, 520));
    setVideoProgressById((current) => {
      const next = { ...current };
      delete next[targetFlowId];
      return next;
    });
  }

  async function pollPendingVideoJob(targetFlowId: string, jobId: string, projectId = project.id, quiet = false) {
    if (pollingVideoJobs.current.has(jobId)) return;
    pollingVideoJobs.current.add(jobId);
    let consecutiveErrors = 0;
    try {
      for (let attempt = 0; attempt < 720; attempt += 1) {
        if (cancelledVideoJobs.current.has(jobId)) return;
        await delay(5000);
        if (cancelledVideoJobs.current.has(jobId)) return;
        const currentFlow = projectRef.current.videoFlows.find((item) => item.id === targetFlowId);
        if (currentFlow?.pendingVideoJobId !== jobId) return;
        const refreshed = await refreshVideoJobAndProject(projectId, jobId);
        if (!refreshed) {
          consecutiveErrors += 1;
          if (!quiet && consecutiveErrors === 3) {
            onAssistantMessage("视频任务状态查询暂时不稳定，系统会继续自动轮询。");
          }
          continue;
        }

        consecutiveErrors = 0;
        applyProject(refreshed.project);
        const refreshedFlow = refreshed.project.videoFlows.find((item) => item.id === targetFlowId);
        if (refreshed.jobStatus === "ready" || refreshedFlow?.status === "ready") {
          await finishVideoProgress(targetFlowId);
          onAssistantMessage("Seedance 2.0 è§†é¢‘å·²ç”Ÿæˆå®Œæˆï¼Œé¢„è§ˆç´ æå·²å›žå¡«åˆ°å½“å‰ç‰‡æ®µã€‚");
        } else if (refreshed.jobStatus === "failed" || refreshedFlow?.status === "failed") {
          stopVideoProgress(targetFlowId);
          onAssistantMessage(refreshedFlow?.error || refreshed.jobError || "视频生成失败");
        }
        if (
          refreshed.jobStatus === "ready" ||
          refreshed.jobStatus === "failed" ||
          refreshedFlow?.status === "ready" ||
          refreshedFlow?.status === "failed"
        ) {
          return;
        }
      }
      onAssistantMessage("Seedance 2.0 视频任务仍在运行，系统会在页面停留期间持续自动刷新状态。");
    } catch (error) {
      onAssistantMessage(error instanceof Error ? error.message : "è§†é¢‘ä»»åŠ¡çŠ¶æ€æŸ¥è¯¢å¤±è´¥");
    } finally {
      pollingVideoJobs.current.delete(jobId);
    }
  }

  async function refreshVideoJobAndProject(
    projectId: string,
    jobId: string
  ): Promise<
    | {
        project: Project;
        jobStatus?: "queued" | "generating" | "ready" | "failed";
        jobError?: string;
      }
    | undefined
  > {
    try {
      const job = await apiClient.getMediaJob(jobId);
      const refreshedProject = await apiClient.getProject(projectId);
      return { project: refreshedProject, jobStatus: job.status, jobError: job.error };
    } catch {
      try {
        const refreshedProject = await apiClient.getProject(projectId);
        return { project: refreshedProject };
      } catch {
        return undefined;
      }
    }
  }

  function holdVideoProgress(targetFlowId: string) {
    stopVideoProgress(targetFlowId, false);
    setVideoProgressById((current) => ({ ...current, [targetFlowId]: Math.max(current[targetFlowId] || 0, 96) }));
  }

  function stopVideoProgress(targetFlowId: string, clear = true) {
    const timer = videoProgressTimers.current[targetFlowId];
    if (timer) {
      window.clearInterval(timer);
      delete videoProgressTimers.current[targetFlowId];
    }
    if (clear) {
      setVideoProgressById((current) => {
        const next = { ...current };
        delete next[targetFlowId];
        return next;
      });
    }
  }

  async function recoverLatestProjectIf(
    hasRecoveredResult: (latestProject: Project) => boolean,
    getMessage: (latestProject: Project) => string
  ): Promise<boolean> {
    try {
      const latestProject = await apiClient.getProject(project.id);
      if (!hasRecoveredResult(latestProject)) return false;
      applyProject(latestProject);
      onAssistantMessage(getMessage(latestProject));
      return true;
    } catch {
      return false;
    }
  }

  async function generateCharacterModel(modelId: string) {
    const currentProject = projectRef.current;
    const targetModel = currentProject.characterModels.find((model) => model.id === modelId);
    if (!targetModel || modelBusyId) return;

    const generationRequestId = createGenerationRequestId("flow-character-image", modelId);
    const controller = new AbortController();
    modelGenerationControllers.current[modelId] = controller;
    modelGenerationRequestIds.current[modelId] = generationRequestId;
    const imageAspectRatio = targetModel.imageAspectRatio || "3:4";
    const clearedProject = startCharacterImageGeneration(currentProject, modelId, generationRequestId, imageAspectRatio);

    startModelProgress(modelId);
    setModelBusyId(modelId);
    applyProject(clearedProject);
    onAssistantMessage(`${targetModel.name} 人物模型图正在生成，一次返回 3 张候选图。`);
    try {
      const syncedProject = await apiClient.saveProject(clearedProject);
      if (controller.signal.aborted) return;
      applyProject(syncedProject);
      const next = await apiClient.generateCharacterImage(currentProject.id, modelId, imageAspectRatio, {
        signal: controller.signal,
        generationRequestId
      });
      if (controller.signal.aborted) return;
      applyProject(next);
      await finishModelProgress(modelId);
      onAssistantMessage(`${targetModel.name} 人物模型候选图已生成。`);
    } catch (error) {
      stopModelProgress(modelId);
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "人物模型图生成失败";
      const recovered = await recoverLatestProjectIf(
        (latestProject) => {
          const latestModel = latestProject.characterModels.find((model) => model.id === modelId);
          return Boolean(latestModel?.candidateImages?.length);
        },
        (latestProject) => {
          const latestModel = latestProject.characterModels.find((model) => model.id === modelId);
          return `${latestModel?.name || targetModel.name} 人物模型候选图已从后端恢复，当前共 ${latestModel?.candidateImages?.length || 0} 张。`;
        }
      );
      if (recovered) return;
      applyProject({
        ...projectRef.current,
        characterModels: projectRef.current.characterModels.map((model) =>
          model.id === modelId ? { ...model, status: "failed", error: message, generationRequestId: undefined } : model
        )
      });
      onAssistantMessage(message);
    } finally {
      if (modelGenerationControllers.current[modelId] === controller) {
        delete modelGenerationControllers.current[modelId];
        delete modelGenerationRequestIds.current[modelId];
      }
      setModelBusyId((current) => (current === modelId ? null : current));
    }
  }

  async function generateSceneModel(modelId: string) {
    const currentProject = projectRef.current;
    const targetModel = currentProject.sceneModels.find((model) => model.id === modelId);
    if (!targetModel || modelBusyId) return;

    const generationRequestId = createGenerationRequestId("flow-scene-image", modelId);
    const controller = new AbortController();
    modelGenerationControllers.current[modelId] = controller;
    modelGenerationRequestIds.current[modelId] = generationRequestId;
    const imageAspectRatio = targetModel.imageAspectRatio || "16:9";
    const clearedProject = startSceneImageGeneration(currentProject, modelId, generationRequestId, imageAspectRatio);

    startModelProgress(modelId);
    setModelBusyId(modelId);
    applyProject(clearedProject);
    onAssistantMessage(`${targetModel.name} 场景模型图正在生成，一次返回 3 张候选图。`);
    try {
      const syncedProject = await apiClient.saveProject(clearedProject);
      if (controller.signal.aborted) return;
      applyProject(syncedProject);
      const next = await apiClient.generateSceneImage(currentProject.id, modelId, imageAspectRatio, {
        signal: controller.signal,
        generationRequestId
      });
      if (controller.signal.aborted) return;
      applyProject(next);
      await finishModelProgress(modelId);
      onAssistantMessage(`${targetModel.name} 场景模型候选图已生成。`);
    } catch (error) {
      stopModelProgress(modelId);
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "场景模型图生成失败";
      const recovered = await recoverLatestProjectIf(
        (latestProject) => {
          const latestModel = latestProject.sceneModels.find((model) => model.id === modelId);
          return Boolean(latestModel?.candidateImages?.length);
        },
        (latestProject) => {
          const latestModel = latestProject.sceneModels.find((model) => model.id === modelId);
          return `${latestModel?.name || targetModel.name} 场景模型候选图已从后端恢复，当前共 ${latestModel?.candidateImages?.length || 0} 张。`;
        }
      );
      if (recovered) return;
      applyProject({
        ...projectRef.current,
        sceneModels: projectRef.current.sceneModels.map((model) =>
          model.id === modelId ? { ...model, status: "failed", error: message, generationRequestId: undefined } : model
        )
      });
      onAssistantMessage(message);
    } finally {
      if (modelGenerationControllers.current[modelId] === controller) {
        delete modelGenerationControllers.current[modelId];
        delete modelGenerationRequestIds.current[modelId];
      }
      setModelBusyId((current) => (current === modelId ? null : current));
    }
  }

  async function generateImagePromptReference(flowId: string) {
    const currentProject = projectRef.current;
    const targetFlow = currentProject.videoFlows.find((item) => item.id === flowId);
    if (!targetFlow || modelBusyId) return;

    const busyId = getImagePromptBusyId(flowId);
    const prompt = getFullImagePromptTextForFlow(targetFlow);
    const imageAspectRatio = getImagePromptAspectRatio(targetFlow);
    const generationRequestId = createGenerationRequestId("flow-image-prompt", flowId);
    const controller = new AbortController();
    modelGenerationControllers.current[busyId] = controller;
    modelGenerationRequestIds.current[busyId] = generationRequestId;
    const clearedProject = startImagePromptReferenceGeneration(currentProject, flowId, generationRequestId, imageAspectRatio);

    startModelProgress(busyId);
    setModelBusyId(busyId);
    applyProject(clearedProject);
    onAssistantMessage("Image Prompt 风格参考图正在生成，一次返回 3 张候选图。");
    try {
      const syncedProject = await apiClient.saveProject(clearedProject);
      if (controller.signal.aborted) return;
      applyProject(syncedProject);
      const next = await apiClient.generateImagePromptImage(currentProject.id, flowId, prompt, imageAspectRatio, {
        signal: controller.signal,
        generationRequestId
      });
      if (controller.signal.aborted) return;
      applyProject(next);
      await finishModelProgress(busyId);
      onAssistantMessage("Image Prompt 风格参考候选图已生成。");
    } catch (error) {
      stopModelProgress(busyId);
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Image Prompt 图生成失败";
      const recovered = await recoverLatestProjectIf(
        (latestProject) => {
          const latestFlow = latestProject.videoFlows.find((flow) => flow.id === flowId);
          return Boolean(latestFlow?.nodes.promptNode.candidateImages?.length);
        },
        (latestProject) => {
          const latestFlow = latestProject.videoFlows.find((flow) => flow.id === flowId);
          return `Image Prompt 候选图已从后端恢复，当前共 ${latestFlow?.nodes.promptNode.candidateImages?.length || 0} 张。`;
        }
      );
      if (recovered) return;
      applyProject(
        withUpdatedFlow(projectRef.current, flowId, (segmentFlow) => ({
          ...segmentFlow,
          nodes: {
            ...segmentFlow.nodes,
            promptNode: {
              ...segmentFlow.nodes.promptNode,
              status: "failed",
              error: message,
              generationRequestId: undefined
            }
          }
        }))
      );
      onAssistantMessage(message);
    } finally {
      if (modelGenerationControllers.current[busyId] === controller) {
        delete modelGenerationControllers.current[busyId];
        delete modelGenerationRequestIds.current[busyId];
      }
      setModelBusyId((current) => (current === busyId ? null : current));
    }
  }

  async function cancelCharacterModelGeneration(modelId: string) {
    await cancelModelGeneration(modelId, (sourceProject, requestId) =>
      cancelCharacterImageGeneration(sourceProject, modelId, requestId)
    );
  }

  async function cancelSceneModelGeneration(modelId: string) {
    await cancelModelGeneration(modelId, (sourceProject, requestId) =>
      cancelSceneImageGeneration(sourceProject, modelId, requestId)
    );
  }

  async function cancelImagePromptReferenceGenerationRequest(flowId: string) {
    const busyId = getImagePromptBusyId(flowId);
    await cancelModelGeneration(busyId, (sourceProject, requestId) =>
      cancelImagePromptReferenceGeneration(sourceProject, flowId, requestId)
    );
  }

  async function cancelModelGeneration(
    busyKey: string,
    cancelProject: (sourceProject: Project, requestId?: string) => Project
  ) {
    const requestId = modelGenerationRequestIds.current[busyKey];
    modelGenerationControllers.current[busyKey]?.abort();
    delete modelGenerationControllers.current[busyKey];
    delete modelGenerationRequestIds.current[busyKey];
    stopModelProgress(busyKey);
    setModelBusyId((current) => (current === busyKey ? null : current));
    const nextProject = cancelProject(projectRef.current, requestId);
    applyProject(nextProject);
    try {
      const savedProject = await apiClient.saveProject(nextProject);
      applyProject(savedProject);
    } catch {
      // Keep local cancellation visible if persistence has a transient failure.
    }
    onAssistantMessage("候选图生成已取消。");
  }

  function updateCharacterAspectRatio(modelId: string, value: string) {
    onProjectChange({
      ...project,
      characterModels: project.characterModels.map((model) =>
        model.id === modelId ? { ...model, imageAspectRatio: value } : model
      )
    });
  }

  function updateCharacterPrompt(modelId: string, value: string) {
    onProjectChange(updateCharacterConsistencyPrompt(project, modelId, value));
  }

  async function saveCharacterPrompt(modelId: string, value: string) {
    const model = project.characterModels.find((item) => item.id === modelId);
    if (!model) return;
    await onSave(updateCharacterConsistencyPrompt(project, modelId, value), `${model.name} 人物一致性 Prompt 已保存。`);
  }

  function updateScenePrompt(modelId: string, value: string) {
    onProjectChange({
      ...project,
      sceneModels: project.sceneModels.map((model) =>
        model.id === modelId ? { ...model, generationPrompt: value, status: model.confirmedImageId ? "ready" : "idle" } : model
      )
    });
  }

  function updateSceneAspectRatio(modelId: string, value: string) {
    onProjectChange({
      ...project,
      sceneModels: project.sceneModels.map((model) =>
        model.id === modelId ? { ...model, imageAspectRatio: value } : model
      )
    });
  }

  function updateImagePromptText(flowId: string, value: string) {
    onProjectChange(
      withUpdatedFlow(project, flowId, (segmentFlow) => ({
        ...segmentFlow,
        imagePrompt: value,
        nodes: {
          ...segmentFlow.nodes,
          promptNode: {
            ...segmentFlow.nodes.promptNode,
            status: segmentFlow.nodes.promptNode.confirmedImageId ? "ready" : "idle",
            error: undefined
          },
          videoNode: { ...segmentFlow.nodes.videoNode, stale: true },
          previewNode: { ...segmentFlow.nodes.previewNode, stale: true }
        }
      }))
    );
  }

  function updateImagePromptAspectRatio(flowId: string, value: string) {
    onProjectChange(
      withUpdatedFlow(project, flowId, (segmentFlow) => ({
        ...segmentFlow,
        nodes: {
          ...segmentFlow.nodes,
          promptNode: { ...segmentFlow.nodes.promptNode, imageAspectRatio: value }
        }
      }))
    );
  }

  async function updateVideoAspectRatio(flowId: string, aspectRatio: VideoAspectRatio) {
    const currentProject = projectRef.current;
    const nextProject = withUpdatedFlow(currentProject, flowId, (segmentFlow) => {
      if (segmentFlow.aspectRatio === aspectRatio) return segmentFlow;
      return {
        ...segmentFlow,
        aspectRatio,
        status: segmentFlow.status === "ready" ? "idle" : segmentFlow.status,
        videoAssetId: undefined,
        pendingVideoJobId: undefined,
        firstFrameImageAssetId: undefined,
        lastFrameImageAssetId: undefined,
        nodes: {
          ...segmentFlow.nodes,
          videoNode: { ...segmentFlow.nodes.videoNode, stale: true, status: "idle", error: undefined },
          previewNode: { ...segmentFlow.nodes.previewNode, stale: true, status: "idle", error: undefined }
        }
      };
    });
    if (nextProject === currentProject) return;

    applyProject(nextProject);
    setFlowId(flowId);
    try {
      const savedProject = await apiClient.saveProject(nextProject);
      applyProject(savedProject);
      onAssistantMessage("视频生产比例已保存，当前片段需要重新生成。");
    } catch (error) {
      onAssistantMessage(error instanceof Error ? error.message : "update video aspect ratio failed");
    }
  }

  async function confirmCharacterModel(modelId: string, assetId: string) {
    const nextProject: Project = {
      ...project,
      characterModels: project.characterModels.map((model) =>
        model.id === modelId ? { ...model, confirmedImageId: assetId, status: "ready", error: undefined } : model
      )
    };
    onProjectChange(nextProject);
    await onSave(nextProject, "人物主模型图已确认。");
  }

  async function confirmSceneModel(modelId: string, assetId: string) {
    const nextProject: Project = {
      ...project,
      sceneModels: project.sceneModels.map((model) =>
        model.id === modelId ? { ...model, confirmedImageId: assetId, status: "ready", error: undefined } : model
      )
    };
    onProjectChange(nextProject);
    await onSave(nextProject, "场景主模型图已确认。");
  }

  async function confirmImagePromptReference(flowId: string, assetId: string) {
    const targetFlow = project.videoFlows.find((item) => item.id === flowId);
    const candidates = targetFlow ? getImagePromptCandidates(targetFlow) : [];
    const asset = candidates.find((item) => item.id === assetId) || project.assets.find((item) => item.id === assetId);
    const nextProject = withUpdatedFlow(project, flowId, (segmentFlow) => ({
      ...segmentFlow,
      imagePromptImageUrl: asset?.url,
      imagePromptImageName: asset ? "Image Prompt 参考图" : undefined,
      status: segmentFlow.status === "ready" ? "idle" : segmentFlow.status,
      videoAssetId: undefined,
      pendingVideoJobId: undefined,
      nodes: {
        ...segmentFlow.nodes,
        promptNode: { ...segmentFlow.nodes.promptNode, confirmedImageId: assetId, status: "ready", stale: false, error: undefined },
        videoNode: { ...segmentFlow.nodes.videoNode, stale: true, status: "idle", error: undefined },
        previewNode: { ...segmentFlow.nodes.previewNode, stale: true, status: "idle", error: undefined }
      }
    }));
    onProjectChange(nextProject);
    await onSave(nextProject, "Image Prompt 风格参考图已确认。");
  }

  function startModelProgress(modelId: string) {
    stopModelProgress(modelId, false);
    const startedAt = Date.now();
    setModelProgressById((current) => ({ ...current, [modelId]: 2 }));
    modelProgressTimers.current[modelId] = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const expectedMs = 15000;
      const base = Math.min(88, (elapsed / expectedMs) * 88);
      const slowTail = elapsed > expectedMs ? Math.min(8, ((elapsed - expectedMs) / expectedMs) * 8) : 0;
      setModelProgressById((current) => ({
        ...current,
        [modelId]: Math.max(current[modelId] || 0, Math.min(96, base + slowTail))
      }));
    }, 180);
  }

  async function finishModelProgress(modelId: string) {
    stopModelProgress(modelId, false);
    setModelProgressById((current) => ({ ...current, [modelId]: 100 }));
    await delay(420);
    setModelProgressById((current) => {
      const next = { ...current };
      delete next[modelId];
      return next;
    });
  }

  function stopModelProgress(modelId: string, clear = true) {
    const timer = modelProgressTimers.current[modelId];
    if (timer) {
      window.clearInterval(timer);
      delete modelProgressTimers.current[modelId];
    }
    if (clear) {
      setModelProgressById((current) => {
        const next = { ...current };
        delete next[modelId];
        return next;
      });
    }
  }

  function buildMissingConfirmedReferenceMessage(characterModels: CharacterModel[], sceneModels: SceneModel[]): string {
    const missingCharacters = characterModels.filter((model) => !model.confirmedImageId).map((model) => model.name);
    const missingScenes = sceneModels.filter((model) => !model.confirmedImageId).map((model) => model.name);
    if (missingCharacters.length === 0 && missingScenes.length === 0) return "";

    const parts = [
      missingCharacters.length ? `人物：${missingCharacters.join("、")}` : "",
      missingScenes.length ? `场景：${missingScenes.join("、")}` : ""
    ].filter(Boolean);

    return `已连接的${parts.join("；")}还没有确认主图。请打开对应模型节点，在候选图中点击“确认这张”后再生成视频。`;
  }

  function getConfirmableSourceStatus(
    status: GenerationStatus,
    hasConfirmedImage: boolean,
    hasCandidateImages: boolean
  ): { status: GenerationStatus; label?: string } {
    if (status === "ready" && !hasConfirmedImage && hasCandidateImages) {
      return { status: "idle", label: "待确认" };
    }
    return { status };
  }

  function renderStatus(node: Pick<FlowNode, "status" | "stale">, label?: string) {
    return <span className={`status ${node.status}`}>{node.stale ? "stale" : label || node.status}</span>;
  }

  function renderModelSourceNode(model: CharacterModel | SceneModel, index: number, kind: "character" | "scene") {
    const meta = sourceMeta[kind];
    const Icon = meta.icon;
    const nodeCode = `${sourceCodePrefix[kind]}${String(index + 1).padStart(2, "0")}`;
    const modelName = model.name || `${meta.label} ${index + 1}`;
    const previewAsset = getModelPreviewAsset(model);
    const statusLabel = model.confirmedImageId ? "已确认模型图" : "未确认模型图";
    const sourceStatus = getConfirmableSourceStatus(model.status, Boolean(model.confirmedImageId), model.candidateImages.length > 0);
    const nodeKey = getModelNodeKey(kind, model.id);
    const draftName = modelNameDrafts[nodeKey] ?? modelName;

    return (
      <article
        className={`workflow-node workflow-source-node workflow-model-image-node source-${kind}`}
        key={nodeKey}
        style={getModelNodeStyle(kind, model.id, index)}
        onKeyDown={(event) => {
          if ((event.target as HTMLElement).closest("input, textarea, select")) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          setModelDialog({ kind, id: model.id });
        }}
        onContextMenu={(event) => handleModelContextMenu(event, kind, model.id)}
        role="button"
        tabIndex={0}
        {...draggableNodePropsByKey(nodeKey, () => setModelDialog({ kind, id: model.id }))}
      >
        <header>
          <Icon size={16} />
          <div>
            <div className="workflow-model-title-row">
              <strong>{nodeCode}</strong>
              <input
                className="workflow-model-name-input"
                value={draftName}
                aria-label={`编辑${nodeCode}模型名称`}
                onChange={(event) => {
                  const value = event.target.value;
                  setModelNameDrafts((current) => ({ ...current, [nodeKey]: value }));
                }}
                onBlur={(event) => void commitModelName(kind, model.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setModelNameDrafts((current) => {
                      const next = { ...current };
                      delete next[nodeKey];
                      return next;
                    });
                    event.currentTarget.blur();
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              />
            </div>
            <span>{meta.label} · {meta.sub} · {statusLabel}</span>
          </div>
        </header>
        <span className="workflow-node-code">{nodeCode}</span>
        <div className={previewAsset ? "workflow-model-preview" : "workflow-model-preview empty"}>
          {previewAsset ? (
            <>
              <img src={previewAsset.url} alt={`${nodeCode} ${modelName} 模型图`} />
              <span>{model.confirmedImageId ? "已确认" : "候选图"}</span>
            </>
          ) : (
            <div>
              <ImageIcon size={22} />
              <strong>暂无模型图</strong>
            </div>
          )}
        </div>
        {renderStatus({ status: sourceStatus.status }, sourceStatus.label)}
        <button
          className={
            hasSourceConnection(kind, { sourceId: model.id })
              ? "workflow-port output-port connected"
              : "workflow-port output-port"
          }
          type="button"
          aria-label={`从${nodeCode} ${modelName}拖出连接`}
          onPointerDown={(event) => startConnection(event, { sourceId: model.id, sourceKind: kind })}
        />
      </article>
    );
  }

  function getModelPreviewAsset(model: CharacterModel | SceneModel) {
    if (model.confirmedImageId) {
      return model.candidateImages.find((asset) => asset.id === model.confirmedImageId) || project.assets.find((asset) => asset.id === model.confirmedImageId);
    }

    return model.candidateImages[0];
  }

  function getVideoAsset(segmentFlow: VideoFlow) {
    if (!segmentFlow.videoAssetId) return undefined;
    return project.assets.find((asset) => asset.id === segmentFlow.videoAssetId && asset.type === "video");
  }

  function renderSegmentSourceNode(segmentFlow: VideoFlow, index: number, kind: Extract<WorkflowSourceKind, "imagePrompt" | "script">) {
    const meta = sourceMeta[kind];
    const Icon = meta.icon;
    const shot = project.storyState.storyboard.find((item) => item.id === segmentFlow.shotId);
    const segmentNumber = String(index + 1).padStart(2, "0");
    const nodeCode = `${sourceCodePrefix[kind]}${segmentNumber}`;
    const nodeName = `${nodeCode} ${meta.label}`;
    const shotName = shot ? shot.shotType : `第${index + 1}段`;
    const statusNode = kind === "imagePrompt"
      ? { ...segmentFlow.nodes.promptNode, status: getImagePromptStatus(segmentFlow) }
      : segmentFlow.nodes.previewNode;
    const summary = kind === "script" ? shot?.composition || "等待分镜脚本" : "";
    const imagePromptPreviewAsset = kind === "imagePrompt" ? getImagePromptPreviewAsset(segmentFlow) : undefined;
    const imagePromptStatusLabel = segmentFlow.nodes.promptNode.confirmedImageId ? "已确认风格图" : imagePromptPreviewAsset ? "候选图" : "未生成风格图";
    const imagePromptSourceStatus = kind === "imagePrompt"
      ? getConfirmableSourceStatus(
          statusNode.status,
          Boolean(segmentFlow.nodes.promptNode.confirmedImageId || segmentFlow.imagePromptImageUrl),
          Boolean(segmentFlow.nodes.promptNode.candidateImages?.length)
        )
      : undefined;

    return (
      <article
        className={`workflow-node workflow-source-node ${kind === "imagePrompt" ? "workflow-model-image-node" : ""} source-${kind}`}
        key={`${segmentFlow.id}-${kind}`}
        style={getNodeStyle(segmentFlow.id, kind, index)}
        onClick={(event) => handleSegmentSourceClick(event, segmentFlow, kind)}
        onContextMenu={(event) => handleSegmentSourceContextMenu(event, kind, segmentFlow.id)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectFlow(segmentFlow.id);
          if (kind === "script") setScriptDialogFlowId(segmentFlow.id);
          if (kind === "imagePrompt") setImagePromptDialogFlowId(segmentFlow.id);
        }}
        role="button"
        tabIndex={0}
        {...draggableNodeProps(segmentFlow.id, kind)}
      >
        <header>
          <Icon size={16} />
          <div>
            <strong>{nodeName}</strong>
            <span>
              第{index + 1}段 · {shotName} · {meta.sub}
            </span>
          </div>
        </header>
        <span className="workflow-node-code">{nodeCode}</span>
        {kind === "imagePrompt" ? (
          <>
            <p>点击生成或选择一张视频风格参考图。确认后会作为当前片段的 Image Prompt 图片输入。</p>
            <div className={imagePromptPreviewAsset ? "workflow-model-preview" : "workflow-model-preview empty"}>
              {imagePromptPreviewAsset ? (
                <>
                  <img src={imagePromptPreviewAsset.url} alt={`${nodeName} 风格参考图`} />
                  <span>{imagePromptStatusLabel}</span>
                </>
              ) : (
                <div>
                  <ImageIcon size={22} />
                  <strong>暂无风格图</strong>
                </div>
              )}
            </div>
          </>
        ) : (
          <p>{summary}</p>
        )}
        {renderStatus(
          imagePromptSourceStatus ? { ...statusNode, status: imagePromptSourceStatus.status } : statusNode,
          imagePromptSourceStatus?.label
        )}
        <button
          className={
            hasSourceConnection(kind, { fromFlowId: segmentFlow.id })
              ? "workflow-port output-port connected"
              : "workflow-port output-port"
          }
          type="button"
          aria-label={`从${nodeName}拖出连接`}
          onPointerDown={(event) => startConnection(event, { fromFlowId: segmentFlow.id, sourceKind: kind })}
        />
      </article>
    );
  }

  function renderVideoNode(segmentFlow: VideoFlow, index: number) {
    const shot = project.storyState.storyboard.find((item) => item.id === segmentFlow.shotId);
    const isSelected = segmentFlow.id === flow.id;
    const progress = getVideoProgress(segmentFlow, videoProgressById[segmentFlow.id]);
    const showProgress = segmentFlow.status === "generating" || progress > 0;
    const videoError = segmentFlow.error || segmentFlow.nodes.videoNode.error;
    const isReady = segmentFlow.status === "ready";
    const nodeSummary = buildVideoNodeSummary(shot, segmentFlow, index);
    const nodeClassName = [
      "workflow-node",
      "workflow-video-node",
      `status-${segmentFlow.status}`,
      isSelected ? "selected" : ""
    ]
      .filter(Boolean)
      .join(" ");
    const selectVideoNode = () => {
      selectFlow(segmentFlow.id);
    };
    const openVideoPreview = () => {
      selectFlow(segmentFlow.id);
      if (isReady) setVideoDialogFlowId(segmentFlow.id);
    };

    return (
      <article
        className={nodeClassName}
        data-flow-id={segmentFlow.id}
        style={getNodeStyle(segmentFlow.id, "video", index)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          selectVideoNode();
        }}
        role="button"
        tabIndex={0}
        {...draggableNodeProps(segmentFlow.id, "video", selectVideoNode)}
      >
        <header>
          <Video size={18} />
          <div>
            <strong>第{index + 1}段 15s 视频</strong>
            <span>{shot ? shot.shotType : "Video Generation"}</span>
          </div>
          <label className="workflow-video-ratio-control" onClick={(event) => event.stopPropagation()}>
            <span>比例</span>
            <select
              value={segmentFlow.aspectRatio}
              aria-label={`第${index + 1}段视频生产比例`}
              disabled={segmentFlow.status === "generating" || Boolean(segmentFlow.pendingVideoJobId)}
              onChange={(event) => void updateVideoAspectRatio(segmentFlow.id, event.target.value as VideoAspectRatio)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {videoAspectRatioOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </header>
        <div className="workflow-input-list">
          {videoInputOrder.map((inputKind) => (
            <div
              className="workflow-input-row"
              data-workflow-input="true"
              data-flow-id={segmentFlow.id}
              data-input-kind={inputKind}
              key={inputKind}
            >
              <span
                className={
                  hasInputConnection(segmentFlow.id, inputKind)
                    ? "workflow-port input-port connected"
                    : "workflow-port input-port"
                }
                data-workflow-input-port="true"
                data-flow-id={segmentFlow.id}
                data-input-kind={inputKind}
              />
              <span>{inputLabels[inputKind]}</span>
            </div>
          ))}
        </div>
        <p className="workflow-video-summary">{nodeSummary}</p>
        {isReady ? (
          <button
            className="workflow-video-ready-chip"
            onClick={(event) => {
              event.stopPropagation();
              openVideoPreview();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            ready · 点击预览视频
          </button>
        ) : null}
        {showProgress ? (
          <div className="workflow-video-progress" aria-label={`视频生成进度 ${Math.round(progress)}%`}>
            <div className="workflow-video-progress-meta">
              <span>{segmentFlow.pendingVideoJobId ? "等待视频 URL" : "生成中"}</span>
              <strong>{Math.round(progress)}%</strong>
            </div>
            <div className="workflow-video-progress-track">
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
        {videoError && segmentFlow.status === "failed" ? <small className="workflow-video-error">{videoError}</small> : null}
        {renderStatus(segmentFlow.nodes.videoNode)}
      </article>
    );
  }

  function renderModelDialog() {
    if (!modelDialog) return null;

    if (modelDialog.kind === "character") {
      const model = project.characterModels.find((item) => item.id === modelDialog.id);
      if (!model) return null;

      return (
        <div className="workflow-model-dialog-backdrop" onClick={() => setModelDialog(null)}>
          <section
            className="workflow-model-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${model.name} 人物模型图生成`}
            onClick={(event) => event.stopPropagation()}
          >
            <button type="button" className="workflow-dialog-close workflow-model-close" onClick={() => setModelDialog(null)} aria-label="关闭人物模型弹窗">
              <X size={18} />
            </button>
            <AIImageGenerationPanel
              kind="character"
              title={model.name}
              description={model.description}
              status={model.status}
              promptLabel="人物一致性 Prompt"
              prompt={model.consistencyPrompt}
              promptPlaceholder="补充人物外貌、年龄、性别、服装、体型、气质和防跑偏约束。"
              helperText="人物模型图会作为后续视频片段的人物参考图。这里可直接修改 Prompt，生成候选图时会使用最新内容。"
              candidates={model.candidateImages}
              confirmedImageId={model.confirmedImageId}
              aspectRatio={model.imageAspectRatio || "3:4"}
              isLoading={modelBusyId === model.id}
              loadingProgress={modelProgressById[model.id] || 0}
              error={model.error}
              getDownloadUrl={(asset) => apiClient.assetDownloadUrl(project.id, asset.id)}
              onPromptChange={(value) => updateCharacterPrompt(model.id, value)}
              onPromptBlur={(value) => void saveCharacterPrompt(model.id, value)}
              onAspectRatioChange={(value) => updateCharacterAspectRatio(model.id, value)}
              onGenerate={() => void generateCharacterModel(model.id)}
              onCancel={() => void cancelCharacterModelGeneration(model.id)}
              onConfirm={(assetId) => void confirmCharacterModel(model.id, assetId)}
            />
          </section>
        </div>
      );
    }

    const model = project.sceneModels.find((item) => item.id === modelDialog.id);
    if (!model) return null;

    return (
      <div className="workflow-model-dialog-backdrop" onClick={() => setModelDialog(null)}>
        <section
          className="workflow-model-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`${model.name} 场景模型图生成`}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="workflow-dialog-close workflow-model-close" onClick={() => setModelDialog(null)} aria-label="关闭场景模型弹窗">
            <X size={18} />
          </button>
          <AIImageGenerationPanel
            kind="scene"
            title={model.name}
            description={model.description}
            status={model.status}
            promptLabel="场景图生成 Prompt"
            prompt={sanitizeSceneModelPromptText(
              model.generationPrompt || "",
              project.characterModels.map((character) => character.name),
              model.description || model.name
            )}
            promptPlaceholder="描述你希望生成的场景模型图，例如场景空间、光线、色彩、构图、画风、镜头质感。"
            helperText="Seedance 生成场景候选图时会优先使用这里的 Prompt。"
            keywords={model.visualKeywords}
            candidates={model.candidateImages}
            confirmedImageId={model.confirmedImageId}
            aspectRatio={model.imageAspectRatio || "16:9"}
            isLoading={modelBusyId === model.id}
            loadingProgress={modelProgressById[model.id] || 0}
            error={model.error}
            getDownloadUrl={(asset) => apiClient.assetDownloadUrl(project.id, asset.id)}
            onPromptChange={(value) => updateScenePrompt(model.id, value)}
            onAspectRatioChange={(value) => updateSceneAspectRatio(model.id, value)}
            onGenerate={() => void generateSceneModel(model.id)}
            onCancel={() => void cancelSceneModelGeneration(model.id)}
            onConfirm={(assetId) => void confirmSceneModel(model.id, assetId)}
          />
        </section>
      </div>
    );
  }

  function renderImagePromptDialog() {
    if (!imagePromptDialogFlowId) return null;
    const targetFlow = project.videoFlows.find((item) => item.id === imagePromptDialogFlowId);
    if (!targetFlow) return null;
    const index = project.videoFlows.findIndex((item) => item.id === targetFlow.id);
    const shot = project.storyState.storyboard.find((item) => item.id === targetFlow.shotId);
    const nodeCode = `IP${String(index + 1).padStart(2, "0")}`;
    const prompt = getFullImagePromptTextForFlow(targetFlow);
    const status = getImagePromptStatus(targetFlow);
    const candidates = getImagePromptCandidates(targetFlow);
    const busyId = getImagePromptBusyId(targetFlow.id);
    const selectedImagePromptCharacters = getSelectedCharacterIds(targetFlow)
      .map((id) => project.characterModels.find((model) => model.id === id))
      .filter((model): model is CharacterModel => Boolean(model));
    const keywords = [
      project.storyState.world.title,
      shot?.shotType,
      ...selectedImagePromptCharacters.map((model) => `已选人物模型：${model.name}`),
      ...(project.storyState.world.styleKeywords || [])
    ].filter((value): value is string => Boolean(value));

    return (
      <div className="workflow-model-dialog-backdrop" onClick={() => setImagePromptDialogFlowId(null)}>
        <section
          className="workflow-model-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={`${nodeCode} Image Prompt 图生成`}
          onClick={(event) => event.stopPropagation()}
        >
          <button type="button" className="workflow-dialog-close workflow-model-close" onClick={() => setImagePromptDialogFlowId(null)} aria-label="关闭 Image Prompt 弹窗">
            <X size={18} />
          </button>
          <AIImageGenerationPanel
            kind="imagePrompt"
            title={`${nodeCode} Image Prompt`}
            description="生成一张视频风格参考图，用于锁定当前片段的画风、色调、空间氛围、镜头质感和构图方向。"
            status={status}
            promptLabel="Image Prompt 生成 Prompt"
            prompt={prompt}
            promptPlaceholder="描述当前片段需要的画面风格、色调、场景气氛、镜头质感和构图方向。"
            helperText="Seedance 生成 Image Prompt 候选图时会使用这里的 Prompt，并自动带入当前片段已选且已确认的人物模型图，避免风格参考图生成新人物。确认后，该图片会作为当前视频片段的风格参考图传入视频生成。"
            keywords={keywords}
            candidates={candidates}
            confirmedImageId={targetFlow.nodes.promptNode.confirmedImageId}
            aspectRatio={getImagePromptAspectRatio(targetFlow)}
            isLoading={modelBusyId === busyId}
            loadingProgress={modelProgressById[busyId] || 0}
            error={targetFlow.nodes.promptNode.error}
            getDownloadUrl={(asset) => apiClient.assetDownloadUrl(project.id, asset.id)}
            onPromptChange={(value) => updateImagePromptText(targetFlow.id, value)}
            onAspectRatioChange={(value) => updateImagePromptAspectRatio(targetFlow.id, value)}
            onGenerate={() => void generateImagePromptReference(targetFlow.id)}
            onCancel={() => void cancelImagePromptReferenceGenerationRequest(targetFlow.id)}
            onConfirm={(assetId) => void confirmImagePromptReference(targetFlow.id, assetId)}
          />
        </section>
      </div>
    );
  }

  function renderVideoDialog() {
    if (!videoDialogFlowId) return null;
    const targetFlow = project.videoFlows.find((item) => item.id === videoDialogFlowId);
    if (!targetFlow) return null;

    const targetIndex = project.videoFlows.findIndex((item) => item.id === videoDialogFlowId);
    const shot = project.storyState.storyboard.find((item) => item.id === targetFlow.shotId);
    const videoAsset = getVideoAsset(targetFlow);
    const title = `第${targetIndex + 1}段 15s 视频`;
    const shotTitle = shot ? shot.shotType : "Video Generation";

    return (
      <div className="workflow-video-dialog-backdrop" onClick={() => setVideoDialogFlowId(null)}>
        <section
          className="workflow-video-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workflow-video-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <span className="eyebrow">Seedance 2.0 已生成视频</span>
              <h2 id="workflow-video-dialog-title">{title}</h2>
              <p>{shotTitle}</p>
            </div>
            <button type="button" className="workflow-dialog-close" onClick={() => setVideoDialogFlowId(null)} aria-label="关闭视频预览弹窗">
              <X size={18} />
            </button>
          </header>
          <div className="workflow-video-dialog-body">
            {videoAsset ? (
              <>
                <video src={videoAsset.url} controls playsInline preload="metadata" />
                <div className="workflow-video-dialog-actions">
                  <span>{videoAsset.provider || "Seedance 2.0"} · {videoAsset.createdAt ? new Date(videoAsset.createdAt).toLocaleString() : "已生成"}</span>
                  <a className="secondary-button" href={apiClient.assetDownloadUrl(project.id, videoAsset.id)}>
                    <Download size={16} />
                    存到本地
                  </a>
                </div>
              </>
            ) : (
              <div className="workflow-video-empty-preview">
                <Video size={32} />
                <strong>当前片段显示 ready，但没有找到视频素材</strong>
                <p>请重新生成这一段，或检查项目资产是否已正确回填到 videoAssetId。</p>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  function renderScriptDialog() {
    if (!scriptDialogFlowId) return null;
    const targetFlow = project.videoFlows.find((item) => item.id === scriptDialogFlowId);
    if (!targetFlow) return null;

    const targetIndex = project.videoFlows.findIndex((item) => item.id === scriptDialogFlowId);
    const shot = project.storyState.storyboard.find((item) => item.id === targetFlow.shotId);
    const title = `SB${String(targetIndex + 1).padStart(2, "0")} 分镜脚本`;
    const shotTitle = shot ? `第${targetIndex + 1}段 · ${shot.shotType}` : `第${targetIndex + 1}段`;
    const segmentScript = formatStoryboardShot(shot, targetFlow, targetIndex, project.storyState.seedanceScript);

    return (
      <div className="workflow-script-dialog-backdrop" onClick={() => setScriptDialogFlowId(null)}>
        <section
          className="workflow-script-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="workflow-script-dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header>
            <div>
              <span className="eyebrow">Seedance 2.0 分镜脚本</span>
              <h2 id="workflow-script-dialog-title">{title}</h2>
              <p>{shotTitle}</p>
            </div>
            <button type="button" className="workflow-dialog-close" onClick={() => setScriptDialogFlowId(null)} aria-label="关闭分镜脚本弹窗">
              <X size={18} />
            </button>
          </header>
          <div className="workflow-script-dialog-body">
            <article>
              <h3>当前片段完整分镜</h3>
              <pre>{segmentScript}</pre>
            </article>
          </div>
        </section>
      </div>
    );
  }

  const currentVideoCancellable = isVideoGenerationCancellable(flow);
  const currentVideoActionDisabled = busy && !currentVideoCancellable;

  return (
    <section className="page flow-page">
      <div className="workflow-shell">
        <div className="workflow-floating-actions">
          <select value={flow.id} onChange={(event) => selectFlow(event.target.value)} aria-label="选择视频片段">
            {project.videoFlows.map((item, index) => {
              const shot = project.storyState.storyboard.find((storyShot) => storyShot.id === item.shotId);
              return (
                <option key={item.id} value={item.id}>
                  第{index + 1}段 {shot ? shot.shotType : item.id}
                </option>
              );
            })}
          </select>
          <button className="secondary-button" onClick={() => void persistCurrent()}>
            <Save size={16} />
            保存
          </button>
          <button
            className={currentVideoCancellable ? "danger-button" : "primary-button"}
            onClick={() => void (currentVideoCancellable ? cancelVideoGenerationRequest(flow.id) : generateVideo())}
            disabled={currentVideoActionDisabled}
          >
            {currentVideoCancellable ? <X size={16} /> : <Wand2 size={16} />}
            {currentVideoCancellable ? "取消生成" : "生成当前 15 秒"}
          </button>
        </div>
        <div
          className="workflow-canvas"
          ref={canvasRef}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={endCanvasPan}
          onPointerCancel={endCanvasPan}
          onWheel={onCanvasWheel}
          onContextMenu={onCanvasContextMenu}
        >
          <div
            className="workflow-board-viewport"
            style={{ width: `${boardWidth * workflowZoom}px`, height: `${boardHeight * workflowZoom}px` }}
          >
            <div
              className="workflow-board"
              ref={boardRef}
              style={{
                width: `${boardWidth}px`,
                height: `${boardHeight}px`,
                transform: `scale(${workflowZoom})`
              }}
            >
            <svg className="workflow-connection-layer" width={boardWidth} height={boardHeight} aria-hidden="true">
              {connections.map((connection) => (
                <path key={connection.id} className={`workflow-connection connection-${connection.sourceKind}`} d={getConnectionPath(connection)} />
              ))}
              {connectionDrag ? (
                <path
                  ref={connectionDragPathRef}
                  className="workflow-connection dragging"
                  d={boardPath(
                    { x: connectionDrag.startX, y: connectionDrag.startY },
                    { x: connectionDrag.currentX, y: connectionDrag.currentY }
                  )}
                />
              ) : null}
            </svg>
            {project.characterModels.map((model, index) => renderModelSourceNode(model, index, "character"))}
            {project.sceneModels.map((model, index) => renderModelSourceNode(model, index, "scene"))}
            {project.videoFlows.map((segmentFlow, index) => (
              <div className="workflow-segment" key={segmentFlow.id}>
                {renderSegmentSourceNode(segmentFlow, index, "imagePrompt")}
                {renderSegmentSourceNode(segmentFlow, index, "script")}
                {renderVideoNode(segmentFlow, index)}
              </div>
            ))}
            </div>
          </div>
        </div>
      </div>
      {renderScriptDialog()}
      {renderModelDialog()}
      {renderImagePromptDialog()}
      {renderVideoDialog()}
      {renderContextMenu()}
    </section>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getImagePromptBusyId(flowId: string): string {
  return `image-prompt:${flowId}`;
}

function getSelectedCharacterIds(flow: VideoFlow): string[] {
  return flow.selectedCharacterModelIds?.length
    ? flow.selectedCharacterModelIds
    : flow.selectedCharacterModelId
      ? [flow.selectedCharacterModelId]
      : [];
}

function getSelectedSceneIds(flow: VideoFlow): string[] {
  return flow.selectedSceneModelIds?.length
    ? flow.selectedSceneModelIds
    : flow.selectedSceneModelId
      ? [flow.selectedSceneModelId]
      : [];
}

function getActiveCharacterModelsForSegment(segmentScript: string, selectedModels: CharacterModel[]): CharacterModel[] {
  if (selectedModels.length <= 1) return selectedModels;
  const segmentOnly = stripGlobalSettingsForActiveCharacters(segmentScript);
  const active = selectedModels.filter((model) => segmentOnly.includes(model.name));
  return active.length > 0 ? active : selectedModels;
}

function stripGlobalSettingsForActiveCharacters(segmentScript: string): string {
  const normalized = segmentScript.replace(/\r\n/g, "\n");
  const headingMatch = /^第\s*\d+\s*段\s*15\s*秒[：:].*$/m.exec(normalized);
  if (!headingMatch || typeof headingMatch.index !== "number") return normalized;
  return normalized.slice(headingMatch.index);
}

function buildVideoNodeSummary(shot: StoryboardShot | undefined, flow: VideoFlow, index: number): string {
  const cleanFlowPrompt = cleanVideoPrompt(flow.prompt);
  const primary = shot?.shotType || cleanFlowPrompt || flow.actionDescription || "待生成片段";
  const action = shot?.characterActions || flow.actionDescription || shot?.videoPrompt || "";
  const summary = action ? `第${index + 1}段：${primary}。${action}` : `第${index + 1}段：${primary}`;

  return compactPromptText(summary, 88);
}

export function formatStoryboardShot(shot: StoryboardShot | undefined, flow: VideoFlow, index: number, seedanceScript: string): string {
  const segmentIndex = getSegmentIndexForStoryboardShot(shot, index);
  const extractedScript = extractSeedanceSegmentScript(seedanceScript, segmentIndex);
  if (extractedScript) return extractedScript;

  const fallbackSettings = getDefaultSeedanceGlobalSettings();
  const cleanFlowPrompt = cleanVideoPrompt(flow.prompt);
  const segmentNumber = segmentIndex + 1;

  if (!shot) {
    return [
      fallbackSettings,
      "",
      `第 ${segmentNumber} 段 15 秒：未命名片段`,
      "分镜 1（0-5 秒）：",
      "景别：中景。",
      `运镜：${flow.cameraMovement || "平稳推进。"}。`,
      "主角：按当前片段已连接人物模型。",
      `动作：${flow.actionDescription || cleanFlowPrompt || "等待补充分镜动作。"}。`,
      "台词：无。",
      "音效：环境低频声。",
      "光影：遵循项目所选画风的光影和色彩要求。",
      "场景：按当前片段已连接场景模型。"
    ].join("\n");
  }

  return [
    fallbackSettings,
    "",
    `第 ${segmentNumber} 段 15 秒：${shot.shotType}`,
    "",
    "分镜 1（0-5 秒）：",
    `景别：${shot.shotType || "中景"}。`,
    `运镜：${shot.cameraMovement || flow.cameraMovement || "平稳推进"}。`,
    "主角：当前片段已连接人物模型。",
    `动作：${shot.characterActions || flow.actionDescription || "角色进入当前事件状态"}。`,
    `台词：${shot.dialogue || "无"}。`,
    "音效：环境声逐渐进入，保留悬疑短剧节奏。",
    "光影：遵循项目所选画风的光影和色彩要求。",
    `场景：${shot.background || "当前片段已连接场景模型"}。`,
    "",
    "分镜 2（5-10 秒）：",
    `景别：近景。`,
    `运镜：${shot.cameraMovement || flow.cameraMovement || "镜头缓慢推近关键细节"}。`,
    "主角：当前片段核心人物或关键物件。",
    `动作：${shot.composition || shot.videoPrompt || cleanFlowPrompt || "镜头聚焦推动剧情的信息点"}。`,
    "台词：无。",
    "音效：细微电流声、纸张声或环境回响。",
    "光影：局部强调关键区域，背景保持压暗。",
    `场景：${shot.background || "当前片段空间内部"}。`,
    "",
    "分镜 3（10-15 秒）：",
    "景别：特写。",
    "运镜：特写切换，轻微推近，保持动作方向连续并停在可衔接尾帧。",
    "主角：当前片段核心人物反应或关键视觉线索。",
    `动作：${shot.expression || flow.emotion || "角色表情或事件结果发生变化"}。`,
    `台词：${shot.dialogue || "无"}。`,
    "音效：低频悬疑声进入，结尾保留可接下一段的环境声尾音。",
    "光影：延续项目所选画风的光影逻辑，最后一秒保持可衔接尾帧，不使用黑场或闪白。",
    `场景：${shot.background || "当前片段结尾位置"}。`
  ].join("\n");
}

function getSegmentIndexForStoryboardShot(shot: StoryboardShot | undefined, fallbackIndex: number): number {
  const id = shot?.id || "";
  const match = /(?:^|[-_])(?:SB|shot|source)?0*(\d+)$/i.exec(id) || /(?:SB|shot|source)[-_]?0*(\d+)$/i.exec(id);
  if (!match) return fallbackIndex;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : fallbackIndex;
}

function extractSeedanceSegmentScript(seedanceScript: string, index: number): string {
  const normalizedScript = seedanceScript.trim().replace(/\r\n/g, "\n");
  if (!normalizedScript) return "";

  const globalSettings = extractSeedanceGlobalSettings(normalizedScript) || getDefaultSeedanceGlobalSettings();
  const segment = extractSeedanceSegment(normalizedScript, index);
  if (!segment) return "";

  return [globalSettings, segment].filter(Boolean).join("\n\n");
}

function getDefaultSeedanceGlobalSettings(): string {
  return [
    "整体统一设定",
    "画风：严格沿用文本创作页选择的项目统一画风。",
    "画风一致性：人物模型、场景模型、Image Prompt 和所有 15 秒视频提示词都必须沿用同一画风。",
    "运镜：短剧感，平稳流畅，少用剧烈旋转，多用推镜、跟拍、特写切换、灯光闪烁。",
    "人物：保持已确认人物模型一致，不频繁换脸，服装、发型、年龄和气质保持连续。",
    "禁忌：不要偏离项目所选画风，不要血腥，不要让角色频繁换脸。"
  ].join("\n");
}

function extractSeedanceGlobalSettings(seedanceScript: string): string {
  const globalHeading = /^(?:【\s*)?整体统一设定(?:\s*】)?\s*$/m.exec(seedanceScript);
  if (!globalHeading || typeof globalHeading.index !== "number") return "";

  const globalStart = globalHeading.index;
  const afterGlobal = seedanceScript.slice(globalStart);
  const nextSegment = afterGlobal.search(/\n(?:(?:【\s*)?第\s*\d+\s*段\s*15\s*(?:秒|s)[：:]|【\s*\d+\s*[-－—]\s*\d+\s*秒)/i);
  return (nextSegment >= 0 ? afterGlobal.slice(0, nextSegment) : afterGlobal).trim();
}

function extractSeedanceSegment(seedanceScript: string, index: number): string {
  const usesZeroBasedSegments = /^第\s*0\s*段\s*15\s*(?:秒|s)[：:]/im.test(seedanceScript);
  const segmentNumber = usesZeroBasedSegments ? index : index + 1;
  const numberedSegment = extractSeedanceSegmentByHeading(
    seedanceScript,
    new RegExp(`^(?:【\\s*)?第\\s*${segmentNumber}\\s*段\\s*15\\s*(?:秒|s)[：:].*(?:】\\s*)?$`, "im")
  );
  if (numberedSegment) return numberedSegment;

  const startSecond = index * 15;
  const endSecond = (index + 1) * 15;
  return extractSeedanceSegmentByHeading(
    seedanceScript,
    new RegExp(`^【\\s*${startSecond}\\s*[-－—]\\s*${endSecond}\\s*秒.*】\\s*$`, "m")
  );
}

function extractSeedanceSegmentByHeading(seedanceScript: string, headingPattern: RegExp): string {
  const match = headingPattern.exec(seedanceScript);
  if (!match || typeof match.index !== "number") return "";

  const segmentStart = match.index;
  const rest = seedanceScript.slice(segmentStart + match[0].length);
  const nextHeadingMatch = /\n(?:(?:【\s*)?第\s*\d+\s*段\s*15\s*(?:秒|s)[：:]|【\s*\d+\s*[-－—]\s*\d+\s*秒)/i.exec(rest);
  const segmentEnd = nextHeadingMatch ? segmentStart + match[0].length + nextHeadingMatch.index : seedanceScript.length;
  return seedanceScript.slice(segmentStart, segmentEnd).trim();
}

function buildGlobalSceneStylePrompt(storyState: StoryState, aspectRatio: string) {
  const styleKeywords = sanitizeVisualStyleKeywords(storyState.world.styleKeywords, ["现代都市悬疑"]).join("，");
  const title = "全局统一—场景风格";
  const summary = `项目统一场景画风：${styleKeywords}。空间结构清楚，光线克制，真实叙事空间中保留轻微异常感。`;
  const lockPrompt = [
    "项目统一场景风格参考图",
    styleKeywords,
    "同一项目内保持一致画风",
    "空气中有细微灰尘",
    "高细节背景概念图",
    "空间结构清楚",
    "透视稳定",
    `--ar ${aspectRatio}`
  ].join("，");
  const negativePrompt = [
    "空场景",
    "不要人物",
    "不要角色",
    "不要人影",
    "不要脸",
    "不要手",
    "不要身体剪影",
    "不要人群",
    "不要可读文字",
    "不要logo",
    "不要水印",
    "空间结构清楚",
    "透视稳定",
    "可作为视频背景参考",
    "不要海报设计",
    "不要封面设计",
    "不要偏离项目所选画风",
    "不要血腥"
  ].join("，");
  const fullPrompt = `${title}\n${summary}\n\n通用画风锁定词：\n${lockPrompt}\n\n通用限制词：\n${negativePrompt}`;

  return { title, summary, lockPrompt, negativePrompt, fullPrompt };
}

function buildCharacterVideoReferenceNote(model: CharacterModel): string {
  return [
    `人物模型图：${model.name}`,
    model.description ? `身份/用途：${model.description}` : "",
    model.consistencyPrompt ? `固定人物特征：${model.consistencyPrompt}` : "",
    "这张人物模型图是该角色唯一外观基准；必须锁定同一角色身份、脸型、五官比例、发型、年龄、体型、服装、配色和线稿；不要重新设计人物，不要换脸，不要根据文字描述另画一个相似角色"
  ]
    .filter(Boolean)
    .join("。");
}

function buildSceneVideoReferenceNote(model: SceneModel): string {
  return [
    `场景模型图：${model.name}`,
    model.description ? `空间设定：${model.description}` : "",
    model.visualKeywords.length ? `视觉关键词：${model.visualKeywords.join("、")}` : "",
    "必须锁定空间结构、光源方向、座位/道具/入口出口位置和环境氛围"
  ]
    .filter(Boolean)
    .join("。");
}

export function buildStyleVideoReferenceNote(storyState: StoryState, flow: VideoFlow): string {
  const styleKeywords = storyState.world.styleKeywords.length ? storyState.world.styleKeywords.join("、") : "项目所选画风";
  return [
    "风格参考图：当前片段/项目画风基准",
    `项目画风关键词：${styleKeywords}`,
    flow.imagePrompt ? `画面方向：${flow.imagePrompt}` : "",
    "必须锁定上述项目画风、色彩、线稿/材质、光影和构图语言；不要在视频生成时改成其他画风"
  ]
    .filter(Boolean)
    .join("。");
}

function buildCharacterLockPrompt(model: CharacterModel): string {
  return `${model.name}：${model.consistencyPrompt || model.description || "沿用已确认人物模型图"}。以已确认人物模型图为唯一外观基准，同一项目内保持同一张脸、同一发型、同一服装和同一年龄比例。`;
}

function buildSceneLockPrompt(model: SceneModel): string {
  return `${model.name}：${model.description || model.visualKeywords.join("、") || "沿用已确认场景模型图"}。同一项目内保持空间结构、光源方向和环境氛围连续。`;
}

type VideoPromptContinuityContext = {
  segmentIndex: number;
  previousSegmentScript?: string;
  nextSegmentScript?: string;
};

type VideoPromptReferenceContext = {
  activeCharacterNames?: string[];
  referenceImageNotes?: string[];
  characterLockPrompts?: string[];
  sceneLockPrompts?: string[];
};

export function buildVideoPrompt(
  segmentScript: string,
  styleSummary: string,
  continuity: VideoPromptContinuityContext = { segmentIndex: 0 },
  references: VideoPromptReferenceContext = {}
): string {
  const script = removeDisjointTransitionLanguage(segmentScript.trim());
  const style = compactPromptText(styleSummary, 900);
  const activeCharacters = references.activeCharacterNames?.filter(Boolean) || [];
  const activeCharacterLine = activeCharacters.length
    ? `本段实际出镜人物：${activeCharacters.join("、")}。未在本段实际出镜人物中的角色不得出镜，也不要因为项目人物名单或参考图让其他角色提前入画。`
    : "本段实际出镜人物：以当前 15 秒分镜脚本的主角、动作和台词说话人为准。未写在当前分镜中的角色不得出镜。";

  return [
    "任务：严格按照下方 Seedance 2.0 当前片段分镜生成一个 15 秒视频。不要改人物、地点、剧情顺序或镜头时间。",
    "剧情优先级：当前 15 秒唯一剧情脚本是最高优先级，也是唯一剧情来源。这个优先级只约束剧情、镜头、动作、台词、场景和出镜名单，不允许覆盖人物模型图的外观。只生成当前脚本明确写出的镜头、动作、人物、台词和场景；不要从项目人物名单、参考图、相邻片段或全局设定里补充本段未写出的剧情。",
    activeCharacterLine,
    "当前 15 秒唯一剧情脚本：",
    script,
    "时间结构：按分镜 1（0-5 秒）、分镜 2（5-10 秒）、分镜 3（10-15 秒）执行。不要把后续分镜或后续片段提前生成到当前时间段。",
    "参考图规则：参考图只锁定身份、人物外观、场景结构和画风，不提供本段动作、镜头或剧情；人物外观参考图优先级高于文字里的泛化外貌描述，不得覆盖上方当前 15 秒唯一剧情脚本。",
    buildReferenceLockPrompt(references),
    buildContinuityPrompt(continuity),
    style ? `统一视觉风格：${style}` : ""
  ].filter(Boolean).join("\n\n");
}

function buildReferenceLockPrompt(references: VideoPromptReferenceContext): string {
  const referenceImageNotes = references.referenceImageNotes || [];
  const characterLockPrompts = references.characterLockPrompts || [];
  const sceneLockPrompts = references.sceneLockPrompts || [];
  const lines = [
    "项目级一致性锁定：同一项目所有 15 秒片段必须保持同一套人物模型和画风；不要在相邻片段里改变脸型、发型、年龄、体型、服装、线稿粗细、渲染方式或色调。",
    referenceImageNotes.length
      ? [
          "参考图映射（按上传顺序理解）：",
          ...referenceImageNotes.map((note, index) => `@Image${index + 1} = ${note}`)
        ].join("\n")
      : "",
    characterLockPrompts.length ? `人物模型锁定：\n${characterLockPrompts.join("\n")}` : "",
    sceneLockPrompts.length ? `场景模型锁定：\n${sceneLockPrompts.join("\n")}` : "",
    "画风硬性锁定：严格使用项目统一视觉风格和风格参考图；不要在相邻片段里切换渲染方式、色调、线稿/材质或角色脸型。"
  ].filter(Boolean);

  return lines.join("\n");
}

function buildContinuityPrompt(context: VideoPromptContinuityContext): string {
  const previousAnchor = extractContinuityAnchor(context.previousSegmentScript);
  const hasNextSegment = Boolean(context.nextSegmentScript?.trim());
  const opening =
    context.segmentIndex > 0
      ? `开头首帧：承接上一段末帧的位置、光影、人物姿态、视线方向和镜头运动。上一段参考：${previousAnchor || "沿用上一段结尾状态"}。`
      : "开头首帧：作为全片开场，建立稳定空间关系和人物位置，后续片段要能沿用这个空间方向。";
  const ending = hasNextSegment
    ? "结尾尾帧：停在能自然接入下一段首帧的动作或视线状态，保留当前人物姿态、视线方向、光影和镜头运动连续性；不要提前生成下一段剧情或台词。"
    : "结尾尾帧：停在本段关键结果上，保持人物、场景和光影稳定，不做封闭式黑场结尾。";

  return [
    "首尾帧连续：当前 15 秒片段不是独立故事，之后会与相邻片段剪辑成同一条连续视频。",
    opening,
    ending,
    "衔接方式：优先使用动作连续、视线方向连续、镜头运动连续、路灯/环境光连续、道具运动连续；禁止默认使用黑场、闭眼式转场、闪白或重置人物站位。"
  ].join("\n");
}

function extractContinuityAnchor(segmentScript: string | undefined): string {
  const visualOnlyScript = (segmentScript || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(台词|对白)[：:]/.test(line))
    .join("\n");
  const cleaned = removeDisjointTransitionLanguage(visualOnlyScript)
    .replace(/\s+/g, " ")
    .replace(/整体统一设定.*?(?=第\s*\d+\s*段\s*15\s*秒|$)/, "")
    .trim();
  return compactPromptText(cleaned, 160);
}

function removeDisjointTransitionLanguage(value: string): string {
  return value
    .replace(/不黑屏/g, "不使用黑场")
    .replace(/不闪白/g, "不使用闪白")
    .replace(/再快速切黑或转场/g, "并保持动作连续，停在可衔接下一段首帧的尾帧")
    .replace(/快速切黑或转场/g, "保持动作连续并停在可衔接尾帧")
    .replace(/切黑或转场/g, "动作连续衔接")
    .replace(/切黑/g, "保持画面连续")
    .replace(/黑屏/g, "连续画面")
    .replace(/眨眼/g, "视线连续")
    .replace(/最后一秒留出转场停顿/g, "最后一秒停在可衔接尾帧")
    .replace(/结尾保留转场空间/g, "结尾保留可衔接尾帧");
}

function cleanVideoPrompt(value: string | undefined): string {
  const prompt = (value || "").trim();
  if (!prompt) return "";

  const marker = "Video motion prompt:";
  const markerIndex = prompt.indexOf(marker);
  if (markerIndex >= 0) return prompt.slice(markerIndex + marker.length).trim();
  if (prompt.startsWith("Style reference note:")) return "";

  return prompt;
}

function compactPromptText(value: string | undefined, maxLength: number): string {
  const compact = (value || "").replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength).trim()}...`;
}

function getVideoProgress(flow: VideoFlow, localProgress?: number): number {
  if (typeof localProgress === "number") return localProgress;
  if (flow.status === "ready") return 100;
  if (flow.status === "generating") return flow.pendingVideoJobId ? 96 : 12;
  return 0;
}

export function isVideoGenerationCancellable(flow: VideoFlow): boolean {
  return Boolean(
    flow.status === "generating" ||
      flow.pendingVideoJobId ||
      flow.generationRequestId ||
      flow.nodes.videoNode.status === "generating" ||
      flow.nodes.videoNode.generationRequestId
  );
}

export function isRecoverableVideoGenerationRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /Failed to fetch|fetch failed|network|socket hang up|socket closed|timed out|timeout|gateway|网关|ECONNRESET|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|ECONNREFUSED|UND_ERR/i.test(
    `${error.name} ${error.message}`
  );
}

function isApiNotFoundError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "responseStatus" in error && (error as { responseStatus?: number }).responseStatus === 404);
}

export function hasRecoveredVideoGenerationResult(project: Project, flowId: string, generationRequestId: string): boolean {
  const flow = project.videoFlows.find((item) => item.id === flowId);
  if (!flow) return false;

  const activeRequestIds = [flow.generationRequestId, flow.nodes.videoNode.generationRequestId].filter(Boolean);
  if (activeRequestIds.some((requestId) => requestId !== generationRequestId)) return false;

  return Boolean(
    flow.pendingVideoJobId ||
      flow.videoAssetId ||
      flow.status === "ready" ||
      flow.status === "failed" ||
      flow.error ||
      flow.nodes.videoNode.error
  );
}

function samePortCenters(currentCenters: Record<string, NodePosition>, nextCenters: Record<string, NodePosition>): boolean {
  const currentKeys = Object.keys(currentCenters);
  const nextKeys = Object.keys(nextCenters);
  if (currentKeys.length !== nextKeys.length) return false;

  return nextKeys.every((key) => {
    const current = currentCenters[key];
    const next = nextCenters[key];
    return current && Math.abs(current.x - next.x) < 0.5 && Math.abs(current.y - next.y) < 0.5;
  });
}

function upsertWorkflowEdges(edges: WorkflowEdge[], newEdges: WorkflowEdge[]): WorkflowEdge[] {
  const byId = new Map(edges.map((edge) => [edge.id, edge]));
  for (const edge of newEdges) {
    byId.set(edge.id, edge);
  }
  return Array.from(byId.values());
}
