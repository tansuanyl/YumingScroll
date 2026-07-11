# Deployment Architecture

目标部署形态：

```text
Vercel Next.js Frontend
        |
        | HTTPS API
        v
Independent NestJS API Service
        |
        +-- Cloud PostgreSQL
        |
        +-- Object Storage
        |
        +-- OpenAI API
        |
        +-- Volcano Ark / Seedance API
```

## 1. Frontend: Next.js on Vercel

Vercel 只部署前端，不运行 NestJS 后端。

推荐环境变量：

```env
NEXT_PUBLIC_API_BASE_URL=https://api.your-domain.com
```

可选：如果希望浏览器继续访问同域 `/api/*`，也可以在 Vercel 配置：

```env
API_PROXY_TARGET=https://api.your-domain.com
```

当前 `next.config.mjs` 只有在 `API_PROXY_TARGET` 存在时才开启 `/api/*` rewrite，避免生产环境误代理到 `127.0.0.1`。

Vercel 构建命令：

```bash
npm run build:web
```

## 2. Backend: NestJS on Independent Service

后端部署到独立 Node.js 服务，例如 Railway、Render、Fly.io、AWS ECS、阿里云 ECS、火山 ECS 或任意 Docker/Node 平台。

关键环境变量：

```env
NODE_ENV=production
APP_ENV=production
PORT=8787
HOST=0.0.0.0
WEB_ORIGIN=https://your-vercel-domain.vercel.app
DATABASE_URL=postgresql://USER:PASSWORD@PROD_DB_HOST:5432/ai_comic_workbench?sslmode=require
```

后端启动命令：

```bash
npm run db:deploy
npm run start:server
```

如果平台要求独立 build/start：

```bash
npm run build:server
npm run start:server
```

## 3. PostgreSQL: Cloud Database

本地开发用 Docker PostgreSQL。

生产环境使用云数据库，并在后端服务中配置：

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME?sslmode=require
```

上线前执行：

```bash
npm run db:deploy
```

## 4. Media: Object Storage

开发环境：

```env
STORAGE_PROVIDER=local
```

生产环境：

```env
STORAGE_PROVIDER=s3
STORAGE_BUCKET=ai-comic-production
STORAGE_REGION=auto
STORAGE_ENDPOINT=https://your-s3-compatible-endpoint
STORAGE_PREFIX=media
STORAGE_FORCE_PATH_STYLE=false
STORAGE_ACCESS_KEY_ID=your-access-key-id
STORAGE_SECRET_ACCESS_KEY=your-secret-access-key
```

前端不直接依赖模型服务商临时 URL。所有素材通过后端稳定接口访问：

```text
GET /api/projects/:projectId/assets/:assetId/file
GET /api/projects/:projectId/assets/:assetId/download
```

## 5. Env Files

仓库只提交模板文件：

```text
.env.local.example
.env.development.example
.env.production.example
```

真实密钥文件不要提交：

```text
.env
.env.local
.env.development
.env.production
```

后端会按 `APP_ENV` 加载：

```text
.env
.env.<APP_ENV>
.env.local              # 非 production 时
.env.<APP_ENV>.local
```

平台环境变量优先级最高，不会被文件覆盖。

## 6. Deployment Checklist

1. 创建云 PostgreSQL。
2. 将本地 Prisma migration 部署到云数据库。
3. 创建对象存储 bucket。
4. 后端服务配置 `.env.production` 对应变量。
5. 后端服务健康检查通过：`GET /api/health`。
6. Vercel 配置 `NEXT_PUBLIC_API_BASE_URL`。
7. Vercel 部署前端。
8. 前端发起完整主流程回归测试。
9. 确认图片、视频、项目状态刷新后仍可恢复。
