import { Boxes, Code2, Coins, FileText, Home, LayoutDashboard, LockKeyhole, LogOut, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { AccountCenterButton } from "./AccountCenterButton";
import { BalancePill } from "./BalancePill";
import { BrandMark } from "./BrandMark";
import { formatCoinBalance } from "../lib/billing";
import { hasConfiguredRechargePaymentMethod } from "../lib/rechargePayment";
import type { AuthUser, PageKey, Project } from "../types/domain";

type AppShellProps = {
  project: Project;
  page: PageKey;
  authUser: AuthUser;
  onNavigate: (page: PageKey) => void;
  onReturnHome: () => void;
  onOpenRecharge: () => void;
  onLogout: () => void;
  children: React.ReactNode;
};

const navItems: Array<{ key: PageKey; label: string; icon: React.ComponentType<{ size?: number }>; adminOnly?: boolean }> = [
  { key: "overview", label: "项目总览", icon: LayoutDashboard },
  { key: "text", label: "文本创作", icon: FileText },
  { key: "flow", label: "视频 Flow Map", icon: Boxes },
  { key: "admin", label: "账号管理", icon: ShieldCheck, adminOnly: true }
];

export function AppShell({
  project,
  page,
  authUser,
  onNavigate,
  onReturnHome,
  onOpenRecharge,
  onLogout,
  children
}: AppShellProps) {
  const [navExpanded, setNavExpanded] = useState(false);
  const projectTitle = project.storyState.world.title?.trim() || project.title || "未命名项目";

  return (
    <div className="app-shell">
      <aside className={navExpanded ? "sidebar expanded" : "sidebar"}>
        <button
          type="button"
          className="brand sidebar-toggle"
          title={navExpanded ? "收起导航" : "展开导航"}
          aria-label={navExpanded ? "收起导航" : "展开导航"}
          onClick={() => setNavExpanded((expanded) => !expanded)}
        >
          <BrandMark compact={!navExpanded} className="sidebar-brand-mark" />
        </button>
        <nav className="nav-list">
          {navItems
            .filter((item) => !item.adminOnly || authUser.role === "admin")
            .map((item) => {
              const Icon = item.icon;
              return (
                <button
                  type="button"
                  key={item.key}
                  className={page === item.key ? "nav-item active" : "nav-item"}
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => onNavigate(item.key)}
                >
                  <Icon size={18} />
                  <span className="nav-label">{item.label}</span>
                </button>
              );
            })}
        </nav>
        <div className="sidebar-footer">
          <div className="project-meta account-meta">
            <span>当前账号</span>
            <strong title={authUser.username}>{authUser.displayName || authUser.username}</strong>
          </div>
          <div className="project-meta billing-meta">
            <span>Coins</span>
            <strong>{formatCoinBalance(authUser)}</strong>
          </div>
          {authUser.billingMode === "coins" && hasConfiguredRechargePaymentMethod() ? (
            <button
              type="button"
              className="return-home-button recharge-button"
              title="充值 coins"
              aria-label="充值 coins"
              onClick={onOpenRecharge}
            >
              <Coins size={16} />
              <span>充值 coins</span>
            </button>
          ) : null}
          <div className="project-meta">
            <span>当前项目</span>
            <strong title={projectTitle}>{projectTitle}</strong>
          </div>
          <button type="button" className="return-home-button" title="返回首页 / 新建想法" aria-label="返回首页 / 新建想法" onClick={onReturnHome}>
            <Home size={16} />
            <span>返回首页 / 新建想法</span>
          </button>
          <a className="return-home-button privacy-link-button" href="/privacy" target="_blank" rel="noreferrer" title="隐私政策" aria-label="隐私政策">
            <LockKeyhole size={16} />
            <span>隐私政策</span>
          </a>
          <a
            className="return-home-button privacy-link-button"
            href="https://github.com/tansuanyl/YumingScroll"
            target="_blank"
            rel="noreferrer"
            title="查看源代码"
            aria-label="查看源代码"
          >
            <Code2 size={16} />
            <span>源代码</span>
          </a>
          <button type="button" className="return-home-button logout-button" title="退出登录" aria-label="退出登录" onClick={onLogout}>
            <LogOut size={16} />
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      <div className="app-shell-topbar">
        <BalancePill user={authUser} onOpenRecharge={onOpenRecharge} />
        <AccountCenterButton user={authUser} onOpenAdmin={() => onNavigate("admin")} onLogout={onLogout} />
      </div>
      <main className="workspace">{children}</main>
    </div>
  );
}
