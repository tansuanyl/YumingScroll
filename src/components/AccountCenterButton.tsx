import { ChevronDown, Coins, LogOut, MailCheck, ShieldCheck, UserCog, UserCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { formatCoinBalance } from "../lib/billing";
import type { AuthUser } from "../types/domain";

type AccountCenterButtonProps = {
  user: AuthUser;
  onOpenAdmin?: () => void;
  onLogout: () => void;
};

export function AccountCenterButton({ user, onOpenAdmin, onLogout }: AccountCenterButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const accountName = user.displayName || user.email || user.username;

  useEffect(() => {
    if (!open) return;

    function closeWhenClickFinishesOutside(event: MouseEvent) {
      const target = event.target;
      if (target && rootRef.current?.contains(target as Node)) {
        return;
      }
      setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("click", closeWhenClickFinishesOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("click", closeWhenClickFinishesOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function logout() {
    setOpen(false);
    onLogout();
  }

  function openAdmin() {
    setOpen(false);
    onOpenAdmin?.();
  }

  return (
    <div ref={rootRef} className="account-center">
      <button
        type="button"
        className="account-center-trigger"
        aria-expanded={open}
        aria-controls={menuId}
        title="账号中心"
        onClick={() => setOpen((current) => !current)}
      >
        <UserCircle size={17} />
        <span>账号中心</span>
        <ChevronDown size={14} className={open ? "account-center-chevron open" : "account-center-chevron"} />
      </button>

      {open ? (
        <div id={menuId} className="account-center-menu" role="menu">
          <div className="account-center-header">
            <strong title={accountName}>{accountName}</strong>
            <span title={user.email || user.username}>{user.email || user.username}</span>
          </div>
          <div className="account-center-meta">
            <div>
              <ShieldCheck size={15} />
              <span>{user.role === "admin" ? "管理员账号" : "普通账号"}</span>
            </div>
            <div>
              <Coins size={15} />
              <span>{formatCoinBalance(user)}</span>
            </div>
            <div>
              <MailCheck size={15} />
              <span>{formatEmailState(user)}</span>
            </div>
          </div>
          {user.role === "admin" && onOpenAdmin ? (
            <button
              type="button"
              className="account-center-admin"
              role="menuitem"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openAdmin();
              }}
              onClick={openAdmin}
            >
              <UserCog size={16} />
              <span>充值审核 / coins 入账</span>
            </button>
          ) : null}
          <button
            type="button"
            className="account-center-logout"
            role="menuitem"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              logout();
            }}
            onClick={logout}
          >
            <LogOut size={16} />
            <span>登出账号</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function formatEmailState(user: AuthUser): string {
  if (!user.email) return "内测账号";
  return user.emailVerificationRequired ? "邮箱未验证" : "邮箱已验证";
}
