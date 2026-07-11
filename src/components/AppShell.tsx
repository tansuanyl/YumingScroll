import { Boxes, Code2, FileText, Home, LayoutDashboard, LockKeyhole } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "./BrandMark";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useI18n } from "../i18n/I18nProvider";
import type { PageKey, Project } from "../types/domain";

type AppShellProps = {
  project: Project;
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  onReturnHome: () => void;
  children: React.ReactNode;
};

const navItems: Array<{ key: PageKey; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { key: "overview", label: "项目总览", icon: LayoutDashboard },
  { key: "text", label: "文本创作", icon: FileText },
  { key: "flow", label: "视频 Flow Map", icon: Boxes }
];

export function AppShell({
  project,
  page,
  onNavigate,
  onReturnHome,
  children
}: AppShellProps) {
  const { t } = useI18n();
  const [navExpanded, setNavExpanded] = useState(false);
  const projectTitle = project.storyState.world.title?.trim() || project.title || t("未命名项目");

  return (
    <div className="app-shell">
      <aside className={navExpanded ? "sidebar expanded" : "sidebar"}>
        <button
          type="button"
          className="brand sidebar-toggle"
          title={navExpanded ? t("收起导航") : t("展开导航")}
          aria-label={navExpanded ? t("收起导航") : t("展开导航")}
          onClick={() => setNavExpanded((expanded) => !expanded)}
        >
          <BrandMark compact={!navExpanded} className="sidebar-brand-mark" />
        </button>
        <nav className="nav-list">
          {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.key}
                  className={page === item.key ? "nav-item active" : "nav-item"}
                  title={t(item.label)}
                  aria-label={t(item.label)}
                  onClick={() => onNavigate(item.key)}
                >
                  <Icon size={18} />
                  <span className="nav-label">{t(item.label)}</span>
                </button>
              );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="project-meta">
            <span>{t("当前项目")}</span>
            <strong title={projectTitle}>{projectTitle}</strong>
          </div>
          <LanguageSwitcher compact className="sidebar-language-switcher" />
          <button type="button" className="return-home-button" title={t("返回首页 / 新建想法")} aria-label={t("返回首页 / 新建想法")} onClick={onReturnHome}>
            <Home size={16} />
            <span>{t("返回首页 / 新建想法")}</span>
          </button>
          <a className="return-home-button privacy-link-button" href="/privacy" target="_blank" rel="noreferrer" title={t("隐私政策")} aria-label={t("隐私政策")}>
            <LockKeyhole size={16} />
            <span>{t("隐私政策")}</span>
          </a>
          <a
            className="return-home-button privacy-link-button"
            href="https://github.com/tansuanyl/YumingScroll"
            target="_blank"
            rel="noreferrer"
            title={t("查看源代码")}
            aria-label={t("查看源代码")}
          >
            <Code2 size={16} />
            <span>{t("源代码")}</span>
          </a>
        </div>
      </aside>
      <main className="workspace">{children}</main>
    </div>
  );
}
