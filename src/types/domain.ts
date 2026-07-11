export type ProjectStatus = "draft" | "text-ready" | "models-ready" | "video-ready" | "exported";
export type GenerationStatus = "idle" | "generating" | "ready" | "failed";
export type PageKey = "overview" | "text" | "characters" | "scenes" | "flow" | "admin";
export type TextModelSelection = "gpt-5.5" | "kimi-k2.6";
export type VideoAspectRatio = "9:16" | "16:9" | "9:21" | "21:9";
export type FlowMapNodeOffset = { x: number; y: number };
export type FlowMapSegmentNodeKind = "imagePrompt" | "script" | "video" | "output";

export type MediaAsset = {
  id: string;
  type: "image" | "video";
  url: string;
  storageKey?: string;
  provider: "seedance" | "mock";
  prompt: string;
  jobId?: string;
  createdAt: string;
};

export type StoryWorld = {
  title: string;
  background: string;
  rules: string[];
  factions: string[];
  timeline: string[];
  styleKeywords: string[];
};

export type CharacterProfile = {
  id: string;
  name: string;
  role: string;
  age?: string;
  gender?: string;
  relationshipToProtagonist?: string;
  personality: string[];
  appearance: string;
  speakingStyle: string;
  consistencyPrompt: string;
};

export type ScriptScene = {
  id: string;
  title: string;
  location: string;
  description: string;
  dialogues: Array<{ character: string; line: string; emotion: string }>;
};

export type StoryboardShot = {
  id: string;
  sceneId: string;
  order: number;
  shotType: string;
  cameraMovement: string;
  composition: string;
  characterActions: string;
  expression: string;
  background: string;
  dialogue?: string;
  imagePrompt: string;
  videoPrompt: string;
};

export type VisualPrompt = {
  id: string;
  shotId: string;
  imagePrompt: string;
  videoPrompt: string;
};

export type StoryState = {
  world: StoryWorld;
  characters: CharacterProfile[];
  outline: string;
  script: ScriptScene[];
  storyboard: StoryboardShot[];
  visualPrompts: VisualPrompt[];
  seedanceScript: string;
  visualStyleId?: string;
  promptOptimizerModel?: TextModelSelection;
  promptOptimizationEnabled?: boolean;
  sourceReferenceText?: string;
  sourceReferenceLabel?: string;
  textGenerationRequestId?: string;
};

export type CharacterModel = {
  id: string;
  characterId: string;
  name: string;
  description: string;
  consistencyPrompt: string;
  imageAspectRatio?: string;
  candidateImages: MediaAsset[];
  confirmedImageId?: string;
  status: GenerationStatus;
  error?: string;
  generationRequestId?: string;
  flowMapOffset?: FlowMapNodeOffset;
};

export type SceneModel = {
  id: string;
  name: string;
  description: string;
  visualKeywords: string[];
  generationPrompt?: string;
  imageAspectRatio?: string;
  candidateImages: MediaAsset[];
  confirmedImageId?: string;
  status: GenerationStatus;
  error?: string;
  generationRequestId?: string;
  flowMapOffset?: FlowMapNodeOffset;
};

export type FlowNode = {
  id: string;
  type: "character" | "scene" | "prompt" | "video" | "preview";
  status: GenerationStatus;
  stale?: boolean;
  error?: string;
  candidateImages?: MediaAsset[];
  confirmedImageId?: string;
  imageAspectRatio?: string;
  generationRequestId?: string;
};

export type WorkflowNodeType = "characterModel" | "sceneModel" | "imagePrompt" | "script" | "videoFlow";
export type WorkflowEdgeKind = "character-reference" | "scene-reference" | "image-prompt" | "script";

export type WorkflowEdge = {
  id: string;
  sourceType: WorkflowNodeType;
  sourceId: string;
  sourcePort: string;
  targetType: "videoFlow";
  targetId: string;
  targetPort: "character" | "scene" | "imagePrompt" | "script";
  kind: WorkflowEdgeKind;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type VideoFlow = {
  id: string;
  shotId: string;
  flowMapOffsets?: Partial<Record<FlowMapSegmentNodeKind, FlowMapNodeOffset>>;
  nodes: {
    characterNode: FlowNode;
    sceneNode: FlowNode;
    promptNode: FlowNode;
    videoNode: FlowNode;
    previewNode: FlowNode;
  };
  selectedCharacterModelId?: string;
  selectedSceneModelId?: string;
  selectedCharacterModelIds?: string[];
  selectedSceneModelIds?: string[];
  imagePrompt?: string;
  imagePromptImageUrl?: string;
  imagePromptImageName?: string;
  prompt: string;
  actionDescription: string;
  emotion: string;
  cameraMovement: string;
  durationSeconds: 15;
  aspectRatio: VideoAspectRatio;
  videoAssetId?: string;
  pendingVideoJobId?: string;
  firstFrameImageAssetId?: string;
  lastFrameImageAssetId?: string;
  status: GenerationStatus;
  error?: string;
  generationRequestId?: string;
};

export type Project = {
  id: string;
  ownerUserId?: string;
  title: string;
  inspiration: string;
  status: ProjectStatus;
  storyState: StoryState;
  characterModels: CharacterModel[];
  sceneModels: SceneModel[];
  videoFlows: VideoFlow[];
  workflowEdges: WorkflowEdge[];
  assets: MediaAsset[];
  createdAt: string;
  updatedAt: string;
  textGenerationRequestId?: string;
};

export type ProjectSummary = Pick<Project, "id" | "ownerUserId" | "title" | "inspiration" | "status" | "createdAt" | "updatedAt">;

export type AuthRole = "admin" | "tester";
export type AuthStatus = "active" | "disabled";
export type BillingMode = "free" | "coins";
export type PaymentMethod = "wechat" | "alipay";
export type RechargeStatus = "pending" | "approved" | "rejected";
export type PasswordResetStatus = "pending" | "completed" | "rejected";

export type AuthUser = {
  id: string;
  username: string;
  email?: string;
  emailVerifiedAt?: string;
  emailVerificationRequired?: boolean;
  emailVerificationSentAt?: string;
  emailVerificationExpiresAt?: string;
  displayName?: string;
  role: AuthRole;
  status: AuthStatus;
  billingMode: BillingMode;
  coinBalance: number;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
};

export type EmailVerificationResponse = {
  sent: boolean;
  mailerConfigured: boolean;
  expiresAt?: string;
  url?: string;
  error?: string;
};

export type AccountHealthRecord = {
  user: AuthUser;
  flags: Array<{
    code: "email_unverified" | "email_verification_expired" | "disabled" | "never_logged_in" | "coins_empty";
    severity: "info" | "warning" | "danger";
    label: string;
  }>;
  canLogin: boolean;
  needsEmailAction: boolean;
};

export type BillingStatus = {
  billingMode: BillingMode;
  coinBalance: number;
  costs: {
    text: number;
    image: number;
    video: number;
  };
  rechargeRateCnyToCoins: number;
};

export type RechargeRequest = {
  id: string;
  userId: string;
  paymentMethod: PaymentMethod;
  amountCny: number;
  coins: number;
  status: RechargeStatus;
  note?: string;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PasswordResetRequest = {
  id: string;
  userId: string;
  username: string;
  contact?: string;
  status: PasswordResetStatus;
  reviewedByUserId?: string;
  reviewedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};
