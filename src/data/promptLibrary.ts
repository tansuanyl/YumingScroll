export type PromptLibraryEntry = {
  readonly id: string;
  readonly name: string;
  readonly items: readonly string[];
};

export type PromptLibrarySection = {
  readonly id: string;
  readonly name: string;
  readonly entries: readonly PromptLibraryEntry[];
};

export type PromptTemplate = {
  readonly id: string;
  readonly name: string;
  readonly target: "characterModel" | "sceneModel" | "imagePrompt" | "videoPrompt";
  readonly description: string;
  readonly template: string;
};

export const visualPromptLibrary = {
  source: {
    name: "Yuming Scroll built-in visual prompt framework",
    url: "https://github.com/tansuanyl/YumingScroll",
    localNote: "Original workflow-oriented templates maintained with the open-source project"
  },
  sections: [
    {
      id: "facial-features",
      name: "面部特征",
      entries: [
        {
          id: "shape-and-structure",
          name: "轮廓与结构",
          items: ["脸型和下颌轮廓", "眉眼间距和眼型", "鼻梁与唇形", "年龄感和皮肤质感"]
        },
        {
          id: "identity-marks",
          name: "身份识别点",
          items: ["稳定的面部标记", "左右位置明确的疤痕或痣", "固定妆容", "不可漂移的核心特征"]
        }
      ]
    },
    {
      id: "temperament",
      name: "气质与表情",
      entries: [
        {
          id: "expression-baseline",
          name: "基础状态",
          items: ["警觉或放松程度", "视线方向", "嘴角和眉部状态", "与剧情一致的情绪强度"]
        },
        {
          id: "performance-boundary",
          name: "表演边界",
          items: ["避免无关夸张表情", "保持角色年龄感", "情绪变化服从当前镜头", "不改变人物性格"]
        }
      ]
    },
    {
      id: "body",
      name: "体型与姿态",
      entries: [
        {
          id: "proportions",
          name: "稳定比例",
          items: ["身高和肩宽", "四肢比例", "体态和重心", "符合角色身份的动作习惯"]
        }
      ]
    },
    {
      id: "hair",
      name: "发型",
      entries: [
        {
          id: "hair-identity",
          name: "发型识别",
          items: ["长度和分缝", "刘海轮廓", "发色和挑染位置", "固定发饰及佩戴方向"]
        }
      ]
    },
    {
      id: "style-keywords",
      name: "画面风格",
      entries: [
        {
          id: "rendering",
          name: "绘制与材质",
          items: ["线条特征", "明暗塑造", "表面材质", "颗粒或笔触强度"]
        },
        {
          id: "cinematography",
          name: "镜头与光色",
          items: ["景别和视角", "主光方向", "色彩对比", "景深和运动方式"]
        }
      ]
    }
  ] satisfies readonly PromptLibrarySection[],
  templates: [
    {
      id: "character-turnaround",
      name: "角色三视图",
      target: "characterModel",
      description: "建立可复用的角色身份和外观基准。",
      template: [
        "同一角色的正面、侧面和背面设定图，纯色中性背景。",
        "角色信息：{角色姓名、年龄、身份、剧情定位}。",
        "身份特征：{脸型、眼型、发型、体型、肤色、固定识别点}。",
        "服装与配饰：{款式、材质、颜色、穿戴位置}。",
        "风格：{项目所选画风提示词}。",
        "一致性：三个视角必须保持年龄、比例、服装结构和识别特征一致。",
        "排除项：无关人物、文字、水印、logo、重复肢体和结构畸变。"
      ].join("\n")
    },
    {
      id: "character-bust",
      name: "角色半身参考",
      target: "characterModel",
      description: "补充对话镜头所需的面部和上身细节。",
      template: [
        "根据已确认角色生成正面半身参考图。",
        "保持脸型、发型、年龄、服装上身结构和固定配饰不变。",
        "风格：{项目所选画风提示词}。",
        "背景简洁，无文字、无水印、无其他人物。"
      ].join("\n")
    },
    {
      id: "character-face-closeup",
      name: "角色面部参考",
      target: "characterModel",
      description: "锁定高频角色的面部识别特征。",
      template: [
        "根据已确认角色生成包含完整发型的正面面部参考图。",
        "保留眼型、眉形、鼻唇比例、肤色和固定面部标记。",
        "风格：{项目所选画风提示词}。",
        "中性表情，中性背景，无文字、无水印。"
      ].join("\n")
    },
    {
      id: "scene-model",
      name: "场景模型图",
      target: "sceneModel",
      description: "建立可在多个镜头中重复使用的空间基准。",
      template: [
        "无人场景设定图：{场景名称}。",
        "空间：{入口、出口、纵深、主体区域和镜头可用方向}。",
        "固定物件：{关键道具及其相对位置}。",
        "光线与材质：{主光方向、时间、表面材质和氛围}。",
        "风格：{项目所选画风提示词}。",
        "一致性：后续镜头保持空间布局、物件位置和光线方向稳定。",
        "排除项：人物、无关道具、文字、水印、logo。"
      ].join("\n")
    },
    {
      id: "image-prompt-frame",
      name: "片段构图参考图",
      target: "imagePrompt",
      description: "为当前视频片段锁定构图、角色和光影。",
      template: [
        "当前第 {段号} 段构图参考图。",
        "剧情时刻：{当前片段的唯一核心画面}。",
        "出镜角色：{已连接角色及动作、表情、视线}。",
        "场景：{已连接场景及固定物件}。",
        "镜头：{景别、机位、主体位置、前中后景关系}。",
        "风格与光线：{项目所选画风提示词}；{当前片段光线}。",
        "连续性：承接上一段末帧，并为下一段保留自然衔接状态。",
        "排除项：后续剧情、未连接角色、身份漂移、文字、水印、logo。"
      ].join("\n")
    },
    {
      id: "video-continuity",
      name: "15 秒视频连续性",
      target: "videoPrompt",
      description: "限制生成范围并保持相邻片段首尾连续。",
      template: [
        "当前 15 秒唯一剧情：{当前分镜脚本}。",
        "角色参考只用于锁定身份、外貌、服装和体型。",
        "场景参考只用于锁定空间、物件、材质和光线方向。",
        "构图参考只用于锁定当前片段的画风、机位和主体关系。",
        "按当前分镜的时间顺序完成动作和台词，不提前生成下一段剧情。",
        "开头承接上一段末帧的位置、姿态、视线、光线和镜头运动。",
        "结尾停留在可自然连接下一段的有效画面，不默认黑屏、闪白或眨眼转场。"
      ].join("\n")
    }
  ] satisfies readonly PromptTemplate[]
} as const;

export type VisualPromptLibrary = typeof visualPromptLibrary;
