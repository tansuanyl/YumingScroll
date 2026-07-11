import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AdminUsers } from "./components/AdminUsers";
import { AppShell } from "./components/AppShell";
import { CharacterModels } from "./components/CharacterModels";
import { LoginScreen } from "./components/LoginScreen";
import { ProjectOverview } from "./components/ProjectOverview";
import { RechargeDialog } from "./components/RechargeDialog";
import { SceneModels } from "./components/SceneModels";
import { TextCreation } from "./components/TextCreation";
import { VideoFlowMap } from "./components/VideoFlowMap";
import { Hero1 } from "./components/ui/hero-1";
import { apiClient, type TextModelSelection } from "./lib/apiClient";
import {
  RECHARGE_BILLING_SYNC_WINDOW_MS,
  applyBillingStatusToUser,
  canRequestRecharge,
  formatGenerationCost,
  getBillingSyncIntervalMs
} from "./lib/billing";
import { generateStoryInNewHomeProject, importSourceInNewHomeProject } from "./lib/homeProjectGeneration";
import { normalizeProjectVideoFlows } from "./lib/projectFlowSync";
import { getProjectLoadOrder, readStoredActiveProjectId, rememberActiveProjectId } from "./lib/projectSelection";
import { SOURCE_IMPORT_MAX_FILE_BYTES, buildSourceFilePayload } from "./lib/sourceImportFile";
import type { AuthUser, PageKey, Project } from "./types/domain";

export default function App() {
  const [page, setPageState] = useState<PageKey>(() => readInitialPage());
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [project, setProject] = useState<Project | null>(null);
  const [projectCatalog, setProjectCatalog] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHome, setShowHome] = useState(true);
  const [homeGenerating, setHomeGenerating] = useState(false);
  const [homeTextModel, setHomeTextModel] = useState<TextModelSelection>("gpt-5.5");
  const [homeGenerationStartedAt, setHomeGenerationStartedAt] = useState<number | null>(null);
  const [homeGenerationProjectId, setHomeGenerationProjectId] = useState<string | null>(null);
  const [homeErrorMessage, setHomeErrorMessage] = useState<string | null>(null);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [rechargeSyncUntil, setRechargeSyncUntil] = useState<number | null>(null);
  const [assistantMessage, setAssistantMessage] = useState("正在加载项目...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAuth() {
      try {
        const result = await apiClient.me();
        setAuthUser(result.user);
      } catch {
        setAuthUser(null);
      } finally {
        setAuthLoading(false);
      }
    }
    void loadAuth();
  }, []);

  useEffect(() => {
    const initialIntervalMs = getBillingSyncIntervalMs(authUser, rechargeSyncUntil);
    if (!initialIntervalMs || !authUser) return;
    const syncedUser = authUser;
    const userId = syncedUser.id;
    let timeoutId: number | undefined;
    let cancelled = false;

    function scheduleNextSync() {
      if (timeoutId) window.clearTimeout(timeoutId);
      const intervalMs = getBillingSyncIntervalMs(syncedUser, rechargeSyncUntil) || initialIntervalMs;
      timeoutId = window.setTimeout(() => void syncBillingStatus(), intervalMs);
    }

    async function syncBillingStatus() {
      try {
        const billingStatus = await apiClient.billingMe();
        if (cancelled) return;
        const balanceChanged = syncedUser.billingMode !== billingStatus.billingMode || syncedUser.coinBalance !== billingStatus.coinBalance;
        setAuthUser((current) => {
          if (!current || current.id !== userId) return current;
          if (current.billingMode === billingStatus.billingMode && current.coinBalance === billingStatus.coinBalance) return current;
          return applyBillingStatusToUser(current, billingStatus);
        });
        if (balanceChanged) setRechargeSyncUntil(null);
      } catch {
        // Keep the last visible balance if a background refresh misses.
      } finally {
        if (!cancelled) scheduleNextSync();
      }
    }

    const handleFocus = () => void syncBillingStatus();
    const handleVisibilityChange = () => {
      if (!document.hidden) void syncBillingStatus();
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void syncBillingStatus();

    return () => {
      cancelled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [authUser?.id, authUser?.billingMode, rechargeSyncUntil]);

  useEffect(() => {
    if (authLoading || !authUser) return;
    const currentUser = authUser;
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
        for (const projectId of getProjectLoadOrder(projectSummaries, readStoredActiveProjectId(currentUser.id))) {
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
        rememberActiveProjectId(currentUser.id, normalizedProject.id);
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
  }, [authLoading, authUser?.id]);

  useEffect(() => {
    if (authUser?.role !== "admin" && page === "admin") {
      setPage("overview");
    }
  }, [authUser?.role, page]);

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
    if (authUser) rememberActiveProjectId(authUser.id, saved.id);
    setAssistantMessage(message);
  }

  if (authLoading) {
    return <div className="boot-screen">正在检查登录状态...</div>;
  }

  if (!authUser) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onRegister={handleRegister}
        onResendVerification={apiClient.resendEmailVerification}
        onPasswordReset={handlePasswordReset}
      />
    );
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
      <>
        <Hero1
          isLoading={homeGenerating}
          errorMessage={homeErrorMessage}
          currentProjectTitle={project.status !== "draft" ? project.title : undefined}
          authUser={authUser}
          selectedTextModel={homeTextModel}
          generationCostLabel={formatGenerationCost(authUser, "text")}
          onTextModelChange={setHomeTextModel}
          onOpenRecharge={openRecharge}
          onOpenAdmin={openAdminPanel}
          onLogout={() => void handleLogout()}
          onOpenWorkbench={() => enterTextWorkbench(project, "已进入当前项目。")}
          onSubmit={(prompt) => void startFromHome(prompt)}
          onImportSourceFile={(file) => void startSourceImportFromHome(file)}
        />
        {rechargeOpen ? (
          <RechargeDialog user={authUser} onClose={() => setRechargeOpen(false)} onSubmitted={handleRechargeSubmitted} />
        ) : null}
      </>
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
        generationCostLabel={formatGenerationCost(authUser, "text")}
        onBillingChange={refreshAuthUser}
      />
    ),
    characters: (
      <CharacterModels
        project={project}
        onProjectChange={updateActiveProject}
        onSave={saveProject}
        onAssistantMessage={setAssistantMessage}
        generationCostLabel={formatGenerationCost(authUser, "image")}
        onBillingChange={refreshAuthUser}
      />
    ),
    scenes: (
      <SceneModels
        project={project}
        onProjectChange={updateActiveProject}
        onSave={saveProject}
        onAssistantMessage={setAssistantMessage}
        generationCostLabel={formatGenerationCost(authUser, "image")}
        onBillingChange={refreshAuthUser}
      />
    ),
    flow: (
      <VideoFlowMap
        project={project}
        onProjectChange={updateActiveProject}
        onSave={saveProject}
        onAssistantMessage={setAssistantMessage}
        imageGenerationCostLabel={formatGenerationCost(authUser, "image")}
        videoGenerationCostLabel={formatGenerationCost(authUser, "video")}
        onBillingChange={refreshAuthUser}
      />
    ),
    admin:
      authUser.role === "admin" ? (
        <AdminUsers currentUser={authUser} />
      ) : (
        <ProjectOverview
          project={project}
          projectCatalog={projectCatalog}
          onSelectProject={(projectId) => void openProject(projectId)}
          onProjectChange={updateActiveProject}
          onSave={saveProject}
          onAssistantMessage={setAssistantMessage}
          onNavigate={setPage}
        />
      )
  };

  return (
    <>
      <AppShell
        project={project}
        page={page}
        authUser={authUser}
        onNavigate={setPage}
        onReturnHome={returnHome}
        onOpenRecharge={openRecharge}
        onLogout={() => void handleLogout()}
      >
        {pages[page]}
      </AppShell>
      {rechargeOpen ? (
        <RechargeDialog user={authUser} onClose={() => setRechargeOpen(false)} onSubmitted={handleRechargeSubmitted} />
      ) : null}
    </>
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
            if (authUser) rememberActiveProjectId(authUser.id, draftProject.id);
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
      void refreshAuthUser();
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
            if (authUser) rememberActiveProjectId(authUser.id, draftProject.id);
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
      void refreshAuthUser();
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
    if (authUser) rememberActiveProjectId(authUser.id, nextProject.id);
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
      if (authUser) rememberActiveProjectId(authUser.id, selectedProject.id);
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

  async function handleLogin(input: { username: string; password: string }) {
    const result = await apiClient.login(input);
    setAuthUser(result.user);
    setProject(null);
    setProjectCatalog([]);
    setLoading(true);
    window.sessionStorage.removeItem("ai-comic-workbench-entered");
    window.sessionStorage.removeItem("ai-comic-active-page");
  }

  async function handleRegister(input: { email: string; password: string; displayName?: string }) {
    return apiClient.register(input);
  }

  async function handlePasswordReset(input: { username: string; contact?: string }) {
    await apiClient.requestPasswordReset(input);
  }

  async function refreshAuthUser() {
    const result = await apiClient.me().catch(() => ({ user: null }));
    if (result.user) setAuthUser(result.user);
  }

  async function handleRechargeSubmitted() {
    setRechargeSyncUntil(Date.now() + RECHARGE_BILLING_SYNC_WINDOW_MS);
    await refreshAuthUser();
  }

  function openRecharge() {
    if (canRequestRecharge(authUser)) setRechargeOpen(true);
  }

  function openAdminPanel() {
    if (authUser?.role !== "admin") return;
    window.sessionStorage.setItem("ai-comic-workbench-entered", "true");
    setShowHome(false);
    setPage("admin");
  }

  async function handleLogout() {
    await apiClient.logout().catch(() => undefined);
    setRechargeOpen(false);
    setRechargeSyncUntil(null);
    setAuthUser(null);
    setProject(null);
    setProjectCatalog([]);
    setLoading(true);
    setShowHome(true);
    setPageState("overview");
    window.sessionStorage.removeItem("ai-comic-workbench-entered");
    window.sessionStorage.removeItem("ai-comic-active-page");
  }
}

function readInitialPage(): PageKey {
  if (typeof window === "undefined") return "overview";
  const storedPage = window.sessionStorage.getItem("ai-comic-active-page");
  if (storedPage === "characters" || storedPage === "scenes") return "flow";
  if (storedPage === "overview" || storedPage === "text" || storedPage === "flow" || storedPage === "admin") {
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
