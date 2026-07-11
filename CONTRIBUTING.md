# 贡献指南

感谢你改进喻鸣绘卷。提交代码前，请先搜索现有 Issue 和 Pull Request，避免重复工作。较大的功能、数据结构变更或 Provider 接口调整，建议先创建 Issue 说明目标和兼容性影响。

## 本地开发

```bash
npm ci
cp .env.example .env
npm run dev
```

没有模型密钥时，请使用 `MOCK_PROVIDERS=true`、`OPENAI_MOCK=true` 和 `SEEDANCE_MOCK=true`。不需要 PostgreSQL 时可将 `DATABASE_URL` 留空。

## 提交要求

- 保持变更范围清晰，不混入无关重构或生成文件
- 不提交 API key、`.env`、数据库、用户内容、上传文件或生成媒体
- 新功能和缺陷修复应增加与风险相称的测试
- UI 变更需要同时检查桌面和移动布局
- Provider 变更应保留 Mock 模式和现有接口兼容性
- 新增依赖前说明用途，并检查许可证与 `npm audit`

提交 Pull Request 前运行：

```bash
npm run typecheck
npm test
npm run build
npm run verify:client-secrets
npm audit
```

## Pull Request

PR 描述应说明：

- 解决的问题和用户影响
- 主要实现方式及兼容性变化
- 验证方法和测试结果
- 新增环境变量、迁移或部署步骤
- UI 变化的截图或录屏（如适用）

## 许可证与贡献权利

提交贡献即表示你有权提供这些内容，并同意贡献按项目的 AGPL-3.0-only 许可证分发。不要提交无权再许可的客户资料、提示词集合、图片、字体、音频或其他第三方素材。
