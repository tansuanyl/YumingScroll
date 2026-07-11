# 喻鸣绘卷 / Yuming Scroll

[![CI](https://github.com/tansuanyl/YumingScroll/actions/workflows/ci.yml/badge.svg)](https://github.com/tansuanyl/YumingScroll/actions/workflows/ci.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](./LICENSE)

喻鸣绘卷是一个可自托管的 AI 漫剧创作工作台，把故事文本、人物与场景模型、分镜脚本、Flow Map、图片和视频资产组织在同一个项目中。

> 当前处于早期开发阶段。Mock 模式可用于本地体验和开发；真实生成需要部署者自己的模型服务账号，并可能产生第三方 API 费用。

## 功能

- 从一句灵感或导入的小说/文档生成世界观、人物、剧情大纲和分镜
- 生成人物模型、场景模型和片段构图参考图
- 用 Flow Map 连接人物、场景、画风和当前 15 秒脚本
- 生成并恢复异步视频任务，管理相邻片段的连续性
- 在 Gallery 中预览、复用、下载和删除项目资产
- 支持账号、邮箱验证、管理员权限和可选 coins 计费
- 支持本地 JSON 或 PostgreSQL 项目存储
- 支持本地磁盘或 S3-compatible 媒体存储

## 技术栈

- Web：Next.js 16、React 19、TypeScript
- API：NestJS 11
- 数据：Prisma 7、PostgreSQL，或本地 JSON
- 媒体：本地磁盘或 S3-compatible storage
- 文本模型：OpenAI、Moonshot/Kimi 或 OpenAI-compatible endpoint
- 图片/视频：Seedance/Volcengine Ark、fal 或兼容接口

## 快速开始

环境要求：Node.js 22+、npm 10+。

```bash
git clone https://github.com/tansuanyl/YumingScroll.git
cd YumingScroll
npm ci
cp .env.example .env
```

第一次体验建议把 `.env` 调整为零密钥 Mock 模式：

```env
APP_ENV=local
DATABASE_URL=
MOCK_PROVIDERS=true
OPENAI_MOCK=true
SEEDANCE_MOCK=true
AUTH_BOOTSTRAP_USERNAME=admin
AUTH_BOOTSTRAP_PASSWORD=change-this-local-password
```

启动 Web 和 API：

```bash
npm run dev
```

- Web：`http://127.0.0.1:5173`
- API：`http://127.0.0.1:8787`
- 健康检查：`http://127.0.0.1:8787/api/health`

使用上面配置的本地管理员账号登录。Mock 模式会返回结构化示例结果，不会调用外部模型服务。

## PostgreSQL 模式

启动本地 PostgreSQL 并执行迁移：

```bash
npm run db:up
npm run db:deploy
npm run dev
```

`.env.example` 默认使用本地 PostgreSQL。将 `DATABASE_URL` 留空时，项目与认证数据改用本地 JSON/内存实现，适合演示，不建议用于生产。

## 配置真实 AI 服务

仓库不内置任何模型 API Key。每个部署者必须在自己的服务端环境中配置 Key；浏览器端只调用本项目 API，不接收、不保存也不转发用户输入的 Key。不要创建 `NEXT_PUBLIC_OPENAI_*`、`VITE_OPENAI_*` 或其他公开 Key 变量。

未配置 Key 时，对应 Provider 状态会返回 `unconfigured`，生成请求会明确提示缺少哪个服务端变量，不会静默使用示例结果。只有显式设置 `MOCK_PROVIDERS=true`、`OPENAI_MOCK=true` 或 `SEEDANCE_MOCK=true` 才会启用 Mock。

文本生成的基本配置：

```env
OPENAI_MOCK=false
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.5
OPENAI_BASE_URL=
OPENAI_API_MODE=responses

MOONSHOT_API_KEY=
MOONSHOT_MODEL=kimi-k2.6
MOONSHOT_BASE_URL=https://api.moonshot.cn/v1
```

图片和视频生成的基本配置：

```env
SEEDANCE_MOCK=false
SEEDANCE_API_KEY=
SEEDANCE_PROVIDER=ark
SEEDANCE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
SEEDANCE_IMAGE_MODEL=doubao-seedream-4-0-250828
SEEDANCE_VIDEO_MODEL=doubao-seedance-2-0-260128
```

模型名称、接口能力和计费可能随提供商变化。部署者需要根据自己的服务账号更新配置，并遵守相应条款、内容政策和数据保留规则。

配置完成后重启 API 服务。登录后可通过 `/api/text/provider-status` 和 `/api/media/provider-status` 检查状态；响应只包含 `configured`、模式和模型信息，不会返回 Key。

## 媒体与支付配置

生产环境建议使用 S3-compatible 存储，详见 [媒体存储文档](./docs/media-storage.md)。

仓库不分发任何收款二维码。需要启用手动充值时，由部署者配置公开 HTTPS URL 或站内绝对路径：

```env
NEXT_PUBLIC_RECHARGE_WECHAT_QR_URL=
NEXT_PUBLIC_RECHARGE_ALIPAY_QR_URL=
```

保持为空时充值入口自动隐藏。这些变量会进入浏览器构建，只能用于公开资源 URL，不能存放密钥。

## 验证

```bash
npm run typecheck
npm test
npm run build
npm run verify:client-secrets
npm audit
```

CI 会在 push 和 pull request 中执行类型检查、测试、构建、依赖审计和浏览器密钥扫描。

## 项目结构

```text
app/                 Next.js 页面与同域 API 代理
src/components/      工作台、Gallery、Flow Map 和账号界面
src/lib/             前端状态、连接关系和项目资产逻辑
server/nest/         NestJS controllers、guard 和错误处理
server/services/     文本、媒体、存储、认证和项目服务
server/providers/    OpenAI 与图片/视频 Provider 适配器
prisma/              Schema 与 migrations
tests/               Vitest 单元和集成测试
docs/                部署、存储和提示框架文档
```

## 部署

- 通用前后端分离方案：[部署架构](./docs/deployment-architecture.md)
- 腾讯云部署：[腾讯云部署说明](./docs/tencent-cloud-deployment.md)
- GitHub Actions 手动部署：[CVM Actions 部署](./docs/github-actions-deployment.md)

生产部署前必须更换管理员密码、启用安全 Cookie、配置 HTTPS、持久数据库和持久媒体存储。不要把 `.env`、数据库、上传文件或生成素材提交到 Git。

## 隐私与安全

- 应用内隐私政策页面位于 `/privacy`；运营者应按实际部署、联系方式和第三方服务修改内容
- 安全问题请按 [SECURITY.md](./SECURITY.md) 私下报告
- 参与贡献前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)

## 许可证

软件源代码采用 [GNU Affero General Public License v3.0 only](./LICENSE)。修改后通过网络提供服务时，需要向这些服务用户提供对应版本的源代码。

用户输入和用户生成的小说、Prompt、图片、音频及视频不会因为使用本软件而自动适用 AGPL。项目名称、Logo 和品牌素材不随软件代码授权，详见 [TRADEMARKS.md](./TRADEMARKS.md)；第三方组件说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
