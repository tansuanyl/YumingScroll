import { LockKeyhole, LogIn, RotateCcw, Send, UserPlus } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { EmailVerificationResponse } from "../types/domain";
import { BrandMark } from "./BrandMark";

type AuthMode = "login" | "register" | "reset";

type RegisterResult = {
  emailVerification: EmailVerificationResponse;
};

type LoginScreenProps = {
  onLogin: (input: { username: string; password: string }) => Promise<void>;
  onRegister: (input: { email: string; password: string; displayName?: string }) => Promise<RegisterResult>;
  onResendVerification: (input: { email: string }) => Promise<{ emailVerification?: EmailVerificationResponse }>;
  onPasswordReset: (input: { username: string; contact?: string }) => Promise<void>;
};

export function LoginScreen({ onLogin, onRegister, onResendVerification, onPasswordReset }: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [contact, setContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<string | null>(readEmailVerifiedMessage());
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      if (mode === "register") {
        const result = await onRegister({
          email: username,
          password,
          displayName: displayName || undefined
        });
        setPassword("");
        setMode("login");
        setMessage(formatVerificationMessage(result.emailVerification));
        return;
      }
      if (mode === "reset") {
        await onPasswordReset({ username, contact: contact || undefined });
        setMessage("重置申请已提交，管理员处理后会通知你新的登录密码。");
        setPassword("");
        return;
      }
      await onLogin({ username, password });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : getFallbackError(mode));
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    if (resending || !isLikelyEmail(username)) return;
    setResending(true);
    setMessage(null);
    setError(null);
    try {
      const result = await onResendVerification({ email: username });
      setMessage(formatVerificationMessage(result.emailVerification));
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "验证邮件发送失败");
    } finally {
      setResending(false);
    }
  }

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
    setPassword("");
    if (nextMode !== "register") setDisplayName("");
    if (nextMode !== "reset") setContact("");
  }

  const submitDisabled =
    loading ||
    username.trim().length < 2 ||
    (mode === "register" && !isLikelyEmail(username)) ||
    (mode !== "reset" && password.length < 6);

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <BrandMark className="login-brand-mark" />
        </div>
        <div>
          <p className="eyebrow">{getEyebrow(mode)}</p>
          <h1 id="login-title">{getTitle(mode)}</h1>
          <p className="login-copy">{getCopy(mode)}</p>
        </div>

        <div className="login-mode-tabs" aria-label="账号入口">
          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>
            登录
          </button>
          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>
            注册
          </button>
          <button type="button" className={mode === "reset" ? "active" : ""} onClick={() => switchMode("reset")}>
            重置密码
          </button>
        </div>

        <form className="login-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>{mode === "register" ? "有效邮箱" : "邮箱或内测账号"}</span>
            <input
              autoComplete={mode === "register" ? "email" : "username"}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={mode === "register" ? "用于接收验证邮件" : "请输入邮箱或内测账号"}
            />
          </label>
          {mode === "register" ? (
            <label>
              <span>显示名称</span>
              <input
                autoComplete="name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="可选"
              />
            </label>
          ) : null}
          {mode === "reset" ? (
            <label>
              <span>联系方式</span>
              <input
                autoComplete="email"
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder="微信、邮箱或手机号，便于管理员联系"
              />
            </label>
          ) : (
            <label>
              <span>密码</span>
              <input
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === "register" ? "至少 6 位密码" : "请输入密码"}
              />
            </label>
          )}
          {message ? <div className="admin-message">{message}</div> : null}
          {error ? <div className="login-error">{error}</div> : null}
          <button className="primary-button login-submit" type="submit" disabled={submitDisabled}>
            {getSubmitIcon(mode, loading)}
            <span>{getSubmitLabel(mode, loading)}</span>
          </button>
          {mode === "login" ? (
            <button
              className="secondary-button login-resend-button"
              type="button"
              disabled={resending || !isLikelyEmail(username)}
              onClick={() => void resendVerification()}
            >
              <Send size={16} />
              {resending ? "发送中..." : "重发验证邮件"}
            </button>
          ) : null}
          {mode === "register" ? (
            <p className="login-footnote">
              新注册账号赠送 10 coins；之后按 coins 计费：文本 10 coins，图片 20 coins，视频 150 coins。旧内测账号仍可直接登录且不消耗 coins。
            </p>
          ) : null}
        </form>
        <p className="login-policy-link">
          使用本服务前请阅读 <a href="/privacy">隐私政策</a>
          <span aria-hidden="true"> · </span>
          <a href="https://github.com/tansuanyl/YumingScroll" target="_blank" rel="noreferrer">
            查看源代码
          </a>
        </p>
      </section>
    </main>
  );
}

function getEyebrow(mode: AuthMode): string {
  if (mode === "register") return "邮箱注册";
  if (mode === "reset") return "密码重置";
  return "账号登录";
}

function getTitle(mode: AuthMode): string {
  if (mode === "register") return "创建新账号";
  if (mode === "reset") return "申请重置密码";
  return "进入喻鸣绘卷";
}

function getCopy(mode: AuthMode): string {
  if (mode === "register") {
    return "新账号需要先完成邮箱验证，再按 coins 计费使用生成能力。";
  }
  if (mode === "reset") {
    return "提交账号和联系方式后，管理员可在后台确认并设置新密码。";
  }
  return "使用邮箱登录，或继续使用原来的内测账号。未验证邮箱的账号需要先完成邮件验证。";
}

function getSubmitIcon(mode: AuthMode, loading: boolean) {
  if (loading) return <LockKeyhole size={18} />;
  if (mode === "register") return <UserPlus size={18} />;
  if (mode === "reset") return <RotateCcw size={18} />;
  return <LogIn size={18} />;
}

function getSubmitLabel(mode: AuthMode, loading: boolean): string {
  if (loading) return mode === "reset" ? "提交中..." : mode === "register" ? "注册中..." : "登录中...";
  if (mode === "register") return "注册并发送验证邮件";
  if (mode === "reset") return "提交重置申请";
  return "登录";
}

function getFallbackError(mode: AuthMode): string {
  if (mode === "register") return "注册失败";
  if (mode === "reset") return "重置申请提交失败";
  return "登录失败";
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function formatVerificationMessage(emailVerification: EmailVerificationResponse | undefined): string {
  if (!emailVerification) return "如果账号存在，系统会重新发送验证邮件。";
  if (emailVerification.sent) {
    return "验证邮件已发送，请打开邮箱点击验证链接后再登录。";
  }
  return "账号已创建，但服务器还没有配置 SMTP 发信。请联系管理员在后台手动验证，或配置邮箱服务后重发验证邮件。";
}

function readEmailVerifiedMessage(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  if (url.searchParams.get("emailVerified") !== "1") return null;
  url.searchParams.delete("emailVerified");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return "邮箱验证成功，现在可以登录。";
}
