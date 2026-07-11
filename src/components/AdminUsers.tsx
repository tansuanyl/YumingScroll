import { Check, Coins, MailCheck, MailWarning, RefreshCw, RotateCcw, ShieldCheck, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { apiClient } from "../lib/apiClient";
import type { AccountHealthRecord, AuthUser, PasswordResetRequest, RechargeRequest } from "../types/domain";

type AdminUsersProps = {
  currentUser: AuthUser;
};

type CreateUserState = {
  username: string;
  email: string;
  password: string;
  displayName: string;
  role: "tester" | "admin";
  billingMode: "free" | "coins";
  initialCoins: string;
  note: string;
};

const emptyForm: CreateUserState = {
  username: "",
  email: "",
  password: "",
  displayName: "",
  role: "tester",
  billingMode: "free",
  initialCoins: "0",
  note: ""
};

export function AdminUsers({ currentUser }: AdminUsersProps) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [accountHealth, setAccountHealth] = useState<AccountHealthRecord[]>([]);
  const [rechargeRequests, setRechargeRequests] = useState<RechargeRequest[]>([]);
  const [passwordResetRequests, setPasswordResetRequests] = useState<PasswordResetRequest[]>([]);
  const [resetPasswords, setResetPasswords] = useState<Record<string, string>>({});
  const [manualCredits, setManualCredits] = useState<Record<string, string>>({});
  const [form, setForm] = useState<CreateUserState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  useEffect(() => {
    void loadAdminData();
  }, []);

  async function loadAdminData() {
    setLoading(true);
    setError(null);
    try {
      const [nextUsers, nextHealth, nextRechargeRequests, nextPasswordResetRequests] = await Promise.all([
        apiClient.listUsers(),
        apiClient.listAccountHealth(),
        apiClient.listRechargeRequests(),
        apiClient.listPasswordResetRequests()
      ]);
      setUsers(nextUsers);
      setAccountHealth(nextHealth);
      setRechargeRequests(nextRechargeRequests);
      setPasswordResetRequests(nextPasswordResetRequests);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "后台数据加载失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshUsersAndHealth() {
    const [nextUsers, nextHealth] = await Promise.all([apiClient.listUsers(), apiClient.listAccountHealth()]);
    setUsers(nextUsers);
    setAccountHealth(nextHealth);
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const user = await apiClient.createUser({
        username: form.username,
        email: form.email || undefined,
        password: form.password,
        displayName: form.displayName || undefined,
        role: form.role,
        billingMode: form.billingMode,
        initialCoins: Number(form.initialCoins || 0),
        note: form.note || undefined
      });
      setUsers((items) => [...items, user]);
      setForm(emptyForm);
      await refreshUsersAndHealth();
      setMessage(`已创建账号：${user.username}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "创建失败");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(user: AuthUser) {
    if (user.id === currentUser.id) return;
    setReviewingId(`status:${user.id}`);
    setMessage(null);
    setError(null);
    try {
      const nextStatus = user.status === "active" ? "disabled" : "active";
      const updated = await apiClient.updateUser(user.id, { status: nextStatus });
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      await refreshUsersAndHealth();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "账号状态更新失败");
    } finally {
      setReviewingId(null);
    }
  }

  async function creditCoins(user: AuthUser) {
    const coins = Math.floor(Number(manualCredits[user.id] || 0));
    if (!Number.isFinite(coins) || coins <= 0) return;
    setReviewingId(`credit:${user.id}`);
    setMessage(null);
    setError(null);
    try {
      const updated = await apiClient.creditUserCoins(user.id, {
        coins,
        note: "管理员手动入账"
      });
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setManualCredits((items) => ({ ...items, [user.id]: "" }));
      await refreshUsersAndHealth();
      setMessage(`已为 ${updated.displayName || updated.username} 入账 ${coins} coins。`);
    } catch (creditError) {
      setError(creditError instanceof Error ? creditError.message : "coins 入账失败");
    } finally {
      setReviewingId(null);
    }
  }

  async function resendEmailVerification(record: AccountHealthRecord) {
    setReviewingId(`resend:${record.user.id}`);
    setMessage(null);
    setError(null);
    try {
      const result = await apiClient.resendUserEmailVerification(record.user.id);
      setMessage(result.sent ? "验证邮件已重新发送。" : "服务器尚未配置 SMTP，暂时无法发送验证邮件。");
      await refreshUsersAndHealth();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "验证邮件发送失败");
    } finally {
      setReviewingId(null);
    }
  }

  async function markEmailVerified(record: AccountHealthRecord) {
    setReviewingId(`verify:${record.user.id}`);
    setMessage(null);
    setError(null);
    try {
      const updated = await apiClient.markUserEmailVerified(record.user.id);
      setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      await refreshUsersAndHealth();
      setMessage(`已手动验证 ${updated.email || updated.username}。`);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "邮箱验证状态更新失败");
    } finally {
      setReviewingId(null);
    }
  }

  async function reviewRecharge(request: RechargeRequest, status: "approved" | "rejected") {
    setReviewingId(request.id);
    setMessage(null);
    setError(null);
    try {
      const updated = await apiClient.reviewRechargeRequest(request.id, status);
      setRechargeRequests((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      await refreshUsersAndHealth();
      setMessage(status === "approved" ? `已确认 ${updated.coins} coins 到账。` : "已拒绝该充值申请。");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "充值申请处理失败");
    } finally {
      setReviewingId(null);
    }
  }

  async function completePasswordReset(request: PasswordResetRequest) {
    const password = resetPasswords[request.id]?.trim();
    if (!password || password.length < 6) return;
    setReviewingId(request.id);
    setMessage(null);
    setError(null);
    try {
      const updated = await apiClient.completePasswordResetRequest(request.id, password);
      setPasswordResetRequests((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setResetPasswords((items) => ({ ...items, [request.id]: "" }));
      setMessage(`已重置 ${updated.username} 的密码。`);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "密码重置失败");
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div className="page admin-users-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">账号管理</p>
          <h1>用户、coins 与账号检测</h1>
          <p>内测账号默认免费；邮箱注册账号需先完成验证，再按 coins 计费。后台可处理充值、重置密码和邮箱验证异常。</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => void loadAdminData()}>
          <RefreshCw size={16} />
          刷新
        </button>
      </header>

      <section className="admin-users-layout">
        <form className="content-card admin-create-user" onSubmit={(event) => void createUser(event)}>
          <div className="admin-section-title">
            <UserPlus size={18} />
            <strong>新建账号</strong>
          </div>
          <label className="form-field">
            <span>账号</span>
            <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} />
          </label>
          <label className="form-field">
            <span>邮箱</span>
            <input
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              placeholder="可选；管理员创建后默认已验证"
            />
          </label>
          <label className="form-field">
            <span>初始密码</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
            />
          </label>
          <label className="form-field">
            <span>显示名称</span>
            <input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} />
          </label>
          <label className="form-field">
            <span>角色</span>
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as "tester" | "admin" })}>
              <option value="tester">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <label className="form-field">
            <span>计费方式</span>
            <select
              value={form.billingMode}
              onChange={(event) => setForm({ ...form, billingMode: event.target.value as "free" | "coins" })}
            >
              <option value="free">内测免费</option>
              <option value="coins">coins 计费</option>
            </select>
          </label>
          {form.billingMode === "coins" ? (
            <label className="form-field">
              <span>初始 coins</span>
              <input
                type="number"
                min={0}
                step={1}
                value={form.initialCoins}
                onChange={(event) => setForm({ ...form, initialCoins: event.target.value })}
              />
            </label>
          ) : null}
          <label className="form-field">
            <span>备注</span>
            <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </label>
          <button className="primary-button" type="submit" disabled={saving || form.username.length < 2 || form.password.length < 6}>
            <UserPlus size={16} />
            {saving ? "创建中..." : "创建账号"}
          </button>
          {message ? <div className="admin-message">{message}</div> : null}
          {error ? <div className="login-error">{error}</div> : null}
        </form>

        <section className="content-card admin-user-list">
          <div className="admin-section-title">
            <ShieldCheck size={18} />
            <strong>现有账号</strong>
          </div>
          {loading ? (
            <div className="empty-state">正在加载账号...</div>
          ) : (
            <div className="admin-user-table">
              {users.map((user) => (
                <article key={user.id} className="admin-user-row">
                  <div>
                    <strong>{user.displayName || user.username}</strong>
                    <span>{user.email || user.username}</span>
                  </div>
                  <em className={`admin-role ${user.role}`}>{user.role === "admin" ? "管理员" : "普通用户"}</em>
                  <em className={`admin-billing ${user.billingMode}`}>{user.billingMode === "free" ? "内测免费" : `${user.coinBalance} coins`}</em>
                  <em className={`admin-status ${user.emailVerificationRequired ? "pending" : "completed"}`}>
                    {user.email ? (user.emailVerificationRequired ? "邮箱未验证" : "邮箱已验证") : "旧账号"}
                  </em>
                  <em className={`admin-status ${user.status}`}>{user.status === "active" ? "启用" : "停用"}</em>
                  {user.billingMode === "coins" ? (
                    <form
                      className="admin-manual-credit"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void creditCoins(user);
                      }}
                    >
                      <input
                        aria-label={`为 ${user.displayName || user.username} 入账 coins`}
                        type="number"
                        min={1}
                        step={1}
                        placeholder="coins"
                        value={manualCredits[user.id] || ""}
                        onChange={(event) => setManualCredits((items) => ({ ...items, [user.id]: event.target.value }))}
                      />
                      <button
                        type="submit"
                        className="secondary-button"
                        disabled={reviewingId === `credit:${user.id}` || Math.floor(Number(manualCredits[user.id] || 0)) <= 0}
                      >
                        <Coins size={15} />
                        入账
                      </button>
                    </form>
                  ) : (
                    <span className="admin-manual-credit-placeholder">-</span>
                  )}
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={user.id === currentUser.id || reviewingId === `status:${user.id}`}
                    onClick={() => void toggleStatus(user)}
                  >
                    {user.status === "active" ? "停用" : "启用"}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="content-card admin-review-panel">
        <div className="admin-section-title">
          <MailWarning size={18} />
          <strong>账号检测</strong>
        </div>
        {accountHealth.length === 0 ? (
          <div className="empty-state">暂无账号检测数据</div>
        ) : (
          <div className="admin-review-list">
            {accountHealth.map((record) => (
              <article key={record.user.id} className="admin-health-row">
                <div>
                  <strong>{record.user.displayName || record.user.username}</strong>
                  <span>{record.user.email || record.user.username}</span>
                  <div className="admin-health-flags">
                    {record.flags.length > 0 ? (
                      record.flags.map((flag) => (
                        <em key={flag.code} className={`admin-health-flag ${flag.severity}`}>
                          {flag.label}
                        </em>
                      ))
                    ) : (
                      <em className="admin-health-flag info">正常</em>
                    )}
                  </div>
                </div>
                <em className={`admin-status ${record.canLogin ? "completed" : "pending"}`}>
                  {record.canLogin ? "可登录" : "需处理"}
                </em>
                {record.needsEmailAction ? (
                  <div className="admin-review-actions">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={reviewingId === `resend:${record.user.id}`}
                      onClick={() => void resendEmailVerification(record)}
                    >
                      <MailCheck size={15} />
                      重发验证
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={reviewingId === `verify:${record.user.id}`}
                      onClick={() => void markEmailVerified(record)}
                    >
                      手动验证
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="content-card admin-review-panel">
        <div className="admin-section-title">
          <RefreshCw size={18} />
          <strong>充值申请</strong>
        </div>
        {rechargeRequests.length === 0 ? (
          <div className="empty-state">暂无充值申请</div>
        ) : (
          <div className="admin-review-list">
            {rechargeRequests.map((request) => {
              const user = usersById.get(request.userId);
              return (
                <article key={request.id} className="admin-review-row">
                  <div>
                    <strong>{user?.displayName || user?.username || request.userId}</strong>
                    <span>
                      {request.paymentMethod === "wechat" ? "微信" : "支付宝"} · {request.amountCny} 元 · {request.coins} coins
                    </span>
                    {request.note ? <small>{request.note}</small> : null}
                  </div>
                  <em className={`admin-status ${request.status}`}>{formatRechargeStatus(request.status)}</em>
                  {request.status === "pending" ? (
                    <div className="admin-review-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={reviewingId === request.id}
                        onClick={() => void reviewRecharge(request, "approved")}
                      >
                        <Check size={15} />
                        确认到账
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={reviewingId === request.id}
                        onClick={() => void reviewRecharge(request, "rejected")}
                      >
                        <X size={15} />
                        拒绝
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="content-card admin-review-panel">
        <div className="admin-section-title">
          <RotateCcw size={18} />
          <strong>密码重置申请</strong>
        </div>
        {passwordResetRequests.length === 0 ? (
          <div className="empty-state">暂无重置申请</div>
        ) : (
          <div className="admin-review-list">
            {passwordResetRequests.map((request) => (
              <article key={request.id} className="admin-review-row">
                <div>
                  <strong>{request.username}</strong>
                  <span>{request.contact || "未填写联系方式"}</span>
                </div>
                <em className={`admin-status ${request.status}`}>{request.status === "completed" ? "已完成" : "待处理"}</em>
                {request.status === "pending" ? (
                  <div className="admin-reset-actions">
                    <input
                      type="password"
                      placeholder="输入新密码"
                      value={resetPasswords[request.id] || ""}
                      onChange={(event) => setResetPasswords((items) => ({ ...items, [request.id]: event.target.value }))}
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={reviewingId === request.id || (resetPasswords[request.id] || "").length < 6}
                      onClick={() => void completePasswordReset(request)}
                    >
                      完成重置
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatRechargeStatus(status: RechargeRequest["status"]): string {
  if (status === "approved") return "已到账";
  if (status === "rejected") return "已拒绝";
  return "待确认";
}
