import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AppShell } from "./components/AppShell";
import { CharacterModels } from "./components/CharacterModels";
import { ProjectOverview } from "./components/ProjectOverview";
import { SceneModels } from "./components/SceneModels";
import { TextCreation } from "./components/TextCreation";
import { VideoFlowMap } from "./components/VideoFlowMap";
import { Hero1 } from "./components/ui/hero-1";
import { apiClient, type TextModelSelection } from "./lib/apiClient";
import { generateStoryInNewHomeProject, importSourceInNewHomeProject } from "./lib/homeProjectGeneration";
import { normalizeProjectVideoFlows } from "./lib/projectFlowSync";
import { getProjectLoadOrder, readStoredActiveProjectId, rememberActiveProjectId } from "./lib/projectSelection";
import { SOURCE_IMPORT_MAX_FILE_BYTES, buildSourceFilePayload } from "./lib/sourceImportFile";
import { getProviderReadiness, type ProviderStatusSnapshot } from "./lib/providerReadiness";
import type { PageKey, Project } from "./types/domain";

const LOCAL_WORKSPACE_ID = "local-workspace";

export default function App() {
  const [page, setPageState] = useState<PageKey>(() => readInitialPage());
  const [project, setProject] = useState<Project | null>(null);
  const [projectCatalog, setProjectCatalog] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHome, setShowHome] = useState(true);
  const [homeGenerating, setHomeGenerating] = useState(false);
  const [homeTextModel, setHomeTextModel] = useState<TextModelSelection>("gpt-5.5");
  const [homeGenerationStartedAt, setHomeGenerationStartedAt] = useState<number | null>(null);
  const [homeGenerationProjectId, setHomeGenerationProjectId] = useState<string | null>(null);
  const [homeErrorMessage, setHomeErrorMessage] = useState<string | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusSnapshot | null>(null);
  const [assistantMessage, setAssistantMessage] = useState("正在加载项目...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProviderStatus(null);
    void Promise.all([apiClient.textProviderStatus(), apiClient.mediaProviderStatus()])
      .then(([text, media]) => {
        if (!cancelled) setProviderStatus({ text, media });
      })
      .catch(() => {
        if (!cancelled) setProviderStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setShowHome(window.sessionStorage.getItem("ai-comic-workbench-entered") !== "true");
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const projectSummaries = await apiClient.listProjects();
        let loadedProjects = (
          await Promise.all(projectSummaries.map((summary) => apiClient.getProject(summary.id).catch(() => undefined)))
        )
          .filter(isProject)
          .map(normalizeVideoFlows);
        let activeProject: Project | undefined;
        for (const projectId of getProjectLoadOrder(projectSummaries, readStoredActiveProjectId(LOCAL_WORKSPACE_ID))) {
          activeProject = loadedProjects.find((item) => item.id === projectId);
          if (activeProject) break;
        }
        activeProject =
          activeProject ||
          (await apiClient.createProject({
            title: "霓虹雨夜的芯片恋人",
            inspiration: "赛博朋克背景下的悬疑恋爱漫剧"
          }));
        const normalizedProject = normalizeVideoFlows(activeProject);
        loadedProjects = upsertProjectCatalog(loadedProjects, normalizedProject);
        setProject(normalizedProject);
        setProjectCatalog(loadedProjects);
        rememberActiveProjectId(LOCAL_WORKSPACE_ID, normalizedProject.id);
        if (normalizedProject !== activeProject) {
          const saved = normalizeVideoFlows(await apiClient.saveProject(normalizedProject));
          setProject(saved);
          setProjectCatalog((current) => upsertProjectCatalog(current, saved));
        }
        setAssistantMessage("项目已加载。可以从文本创作开始，也可以直接查看 Flow Map。");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "加载失败");
        setAssistantMessage("后端服务未就绪。请确认 API server 已启动。");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  useEffect(() => {
    if (!showHome || !homeGenerating || !homeGenerationStartedAt || !homeGenerationProjectId) return;

    let cancelled = false;
    const checkGenerationResult = async () => {
      const recoveredProject = await findRecoveredHomeProject(homeGenerationStartedAt, homeGenerationProjectId);
      if (!recoveredProject || cancelled) return;
      enterTextWorkbench(recoveredProject, "初版文本创作内容已生成，已自动进入文本创作页。");
    };

    const interval = window.setInterval(() => {
      void checkGenerationResult().catch(() => undefined);
    }, 3000);

    void checkGenerationResult().catch(() => undefined);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [homeGenerating, homeGenerationStartedAt, homeGenerationProjectId, showHome]);

  async function saveProject(nextProject: Project, message = "项目已保存。") {
    const saved = normalizeVideoFlows(await apiClient.saveProject(nextProject));
    updateActiveProject(saved);
    rememberActiveProjectId(LOCAL_WORKSPACE_ID, saved.id);
    setAssistantMessage(message);
  }

  if (loading) {
    return <div className="boot-screen">正在启动喻鸣绘卷...</div>;
  }

  if (!project) {
    return (
      <div className="boot-screen">
        <h1>工作台暂时无法启动</h1>
        <p>{error}</p>
      </div>
    );
  }

  if (showHome) {
    return (
      <Hero1
        isLoading={homeGenerating}
        errorMessage={homeErrorMessage}
        currentProjectTitle={project.status !== "draft" ? project.title : undefined}
        selectedTextModel={homeTextModel}
        providerReadiness={getProviderReadiness(providerStatus, homeTextModel)}
        onTextModelChange={setHomeTextModel}
        onOpenWorkbench={() => enterTextWorkbench(project, "已进入当前项目。")}
        onSubmit={(prompt) => void startFromHome(prompt)}
        onImportSourceFile={(file) => void startSourceImportFromHome(file)}
      />
    );
  }

  const pages: Record<PageKey, ReactNode> = {
    overview: (
      <ProjectOverview
        project={project}
        projectCatalog={projectCatalog}
        onSelectProject={(projectId) => void openProject(projectId)}
        onProjectChange={updateActiveProject}
        onSave={saveProject}
        onAssistantMessage={setAssistantMessage}
        onNavigate={setPage}
      />
    ),
    text: (
      <TextCreation
        project={project}
        onProjectChange={updateActiveProject}
        onSave={saveProject}
        onAssistantMessage={setAssistantMessage}
      />
    ),
    characters: (
      <CharacterModels
        project={project}
        onProjectChange={updateActiveProject}
        onSave={saveProject}
        onAssistantMessage={setAssistantMessage}
      />
    ),
    scenes: (
      <SceneModels
        project={project}
        onProjectChange={updateActiveProject}
        onSave={saveProject}
        onAssistantMessage={setAssistantMessage}
      />
    ),
    flow: (
      <VideoFlowMap
        project={project}
        onProjectChange={updateActiveProject}
        onSave={saveProject}
        onAssistantMessage={setAssistantMessage}
      />
    )
  };

  return (
    <AppShell project={project} page={page} onNavigate={setPage} onReturnHome={returnHome}>
      {pages[page]}
    </AppShell>
  );

  function setPage(nextPage: PageKey) {
    window.sessionStorage.setItem("ai-comic-active-page", nextPage);
    setPageState(nextPage);
  }

  async function startFromHome(prompt: string) {
    if (homeGenerating || !project) return;
    const startedAt = Date.now();
    setHomeGenerating(true);
    setHomeGenerationStartedAt(startedAt);
    setHomeGenerationProjectId(null);
    setHomeErrorMessage(null);
    const textModelLabel = homeTextModel === "gpt-5.5" ? "GPT-5.5" : "Kimi K2.6";
    setAssistantMessage(`${textModelLabel} 正在根据首页初想法生成初版文本创作内容...`);
    let recovered = false;
    let generationProjectId: string | undefined;
    try {
      const { generatedProject: nextProject } = await generateStoryInNewHomeProject(
        apiClient,
        {
          currentProjectId: project.id,
          prompt,
          textModel: homeTextModel
        },
        {
          onDraftProject: (draftProject) => {
            generationProjectId = draftProject.id;
            setHomeGenerationProjectId(draftProject.id);
            updateActiveProject(draftProject);
            rememberActiveProjectId(LOCAL_WORKSPACE_ID, draftProject.id);
          }
        }
      );
      enterTextWorkbench(nextProject, "初版文本创作内容已生成。你可以继续编辑世界观、剧情、分镜和 Seedance 脚本。");
    } catch (homeError) {
      const recoveredProject = await findRecoveredHomeProject(startedAt, generationProjectId).catch(() => null);
      if (recoveredProject) {
        recovered = true;
        enterTextWorkbench(recoveredProject, "后端已完成文本生成，已恢复到文本创作页。");
        return;
      }
      const message = homeError instanceof Error ? homeError.message : "首页生成失败";
      setHomeErrorMessage(message);
      setAssistantMessage(message);
    } finally {
      if (!recovered) {
        setHomeGenerating(false);
        setHomeGenerationStartedAt(null);
        setHomeGenerationProjectId(null);
      }
    }
  }

  async function startSourceImportFromHome(file: File) {
    if (homeGenerating || !project) return;
    if (file.size > SOURCE_IMPORT_MAX_FILE_BYTES) {
      const message = "文档超过 8MB，请拆分后上传，或先粘贴关键章节文本。";
      setHomeErrorMessage(message);
      setAssistantMessage(message);
      return;
    }

    const startedAt = Date.now();
    setHomeGenerating(true);
    setHomeGenerationStartedAt(startedAt);
    setHomeGenerationProjectId(null);
    setHomeErrorMessage(null);
    const textModelLabel = homeTextModel === "gpt-5.5" ? "GPT-5.5" : "Kimi K2.6";
    setAssistantMessage(`${textModelLabel} 正在读取导入文档「${file.name}」，并生成文本工作台内容...`);
    let recovered = false;
    let generationProjectId: string | undefined;
    try {
      const sourceFile = await buildSourceFilePayload(file);
      const { generatedProject: nextProject } = await importSourceInNewHomeProject(
        apiClient,
        {
          sourceFile,
          textModel: homeTextModel
        },
        {
          onDraftProject: (draftProject) => {
            generationProjectId = draftProject.id;
            setHomeGenerationProjectId(draftProject.id);
            updateActiveProject(draftProject);
            rememberActiveProjectId(LOCAL_WORKSPACE_ID, draftProject.id);
          }
        }
      );
      enterTextWorkbench(nextProject, "小说/文档导入完成。已基于原文生成文本工作台内容。");
    } catch (homeError) {
      const recoveredProject = await findRecoveredHomeProject(startedAt, generationProjectId).catch(() => null);
      if (recoveredProject) {
        recovered = true;
        enterTextWorkbench(recoveredProject, "后端已完成小说/文档导入，已恢复到文本创作页。");
        return;
      }
      const message = homeError instanceof Error ? homeError.message : "小说/文档导入失败";
      setHomeErrorMessage(message);
      setAssistantMessage(message);
    } finally {
      if (!recovered) {
        setHomeGenerating(false);
        setHomeGenerationStartedAt(null);
        setHomeGenerationProjectId(null);
      }
    }
  }

  async function findRecoveredHomeProject(startedAt: number, projectId?: string | null): Promise<Project | null> {
    const targetProjectId = projectId || project?.id;
    if (!targetProjectId) return null;
    const currentProject = await apiClient.getProject(targetProjectId).catch(() => null);
    if (!currentProject) return null;

    const updatedAt = Date.parse(currentProject.updatedAt);
    const hasGeneratedText =
      currentProject.status === "text-ready" &&
      currentProject.storyState.seedanceScript.trim().length > 0 &&
      currentProject.storyState.storyboard.length > 0;

    if (!hasGeneratedText || Number.isNaN(updatedAt) || updatedAt < startedAt - 2000) {
      return null;
    }

    return currentProject;
  }

  function enterTextWorkbench(nextProject: Project, message: string) {
    updateActiveProject(nextProject);
    rememberActiveProjectId(LOCAL_WORKSPACE_ID, nextProject.id);
    window.sessionStorage.setItem("ai-comic-workbench-entered", "true");
    setPage("text");
    setShowHome(false);
    setHomeGenerating(false);
    setHomeGenerationStartedAt(null);
    setHomeGenerationProjectId(null);
    setHomeErrorMessage(null);
    setAssistantMessage(message);
  }

  async function openProject(projectId: string) {
    if (project?.id === projectId) {
      setShowHome(false);
      setPage("overview");
      return;
    }
    try {
      const selectedProject = normalizeVideoFlows(await apiClient.getProject(projectId));
      updateActiveProject(selectedProject);
      rememberActiveProjectId(LOCAL_WORKSPACE_ID, selectedProject.id);
      window.sessionStorage.setItem("ai-comic-workbench-entered", "true");
      setShowHome(false);
      setPage("overview");
      setAssistantMessage("项目已切换。");
    } catch (switchError) {
      const message = switchError instanceof Error ? switchError.message : "项目切换失败";
      setAssistantMessage(message);
    }
  }

  function updateActiveProject(nextProject: Project) {
    const normalizedProject = normalizeVideoFlows(nextProject);
    setProject(normalizedProject);
    setProjectCatalog((current) => upsertProjectCatalog(current, normalizedProject));
  }

  function returnHome() {
    window.sessionStorage.removeItem("ai-comic-workbench-entered");
    window.sessionStorage.removeItem("ai-comic-active-page");
    setHomeErrorMessage(null);
    setShowHome(true);
    setPageState("overview");
  }

}

function readInitialPage(): PageKey {
  if (typeof window === "undefined") return "overview";
  const storedPage = window.sessionStorage.getItem("ai-comic-active-page");
  if (storedPage === "characters" || storedPage === "scenes") return "flow";
  if (storedPage === "overview" || storedPage === "text" || storedPage === "flow") {
    return storedPage;
  }
  return "overview";
}

function isProject(project: Project | undefined): project is Project {
  return Boolean(project);
}

function upsertProjectCatalog(projects: Project[], nextProject: Project): Project[] {
  const byId = new Map(projects.map((project) => [project.id, project]));
  byId.set(nextProject.id, nextProject);
  return sortProjectCatalog([...byId.values()]);
}

function sortProjectCatalog(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => getProjectTime(right) - getProjectTime(left));
}

function getProjectTime(project: Project): number {
  const time = Date.parse(project.updatedAt);
  return Number.isFinite(time) ? time : 0;
}

function normalizeVideoFlows(project: Project): Project {
  return normalizeProjectVideoFlows(project);
}
