[简体中文](./README.md) | **English**

# Yuming Scroll

[![CI](https://github.com/tansuanyl/YumingScroll/actions/workflows/ci.yml/badge.svg)](https://github.com/tansuanyl/YumingScroll/actions/workflows/ci.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](./LICENSE)

Yuming Scroll is a self-hosted AI comic drama creation workbench that brings story text, character and scene models, storyboard scripts, a visual Flow Map, images, and video assets together in one project.

> [!IMPORTANT]
> **Configure real AI provider API keys before evaluating generation quality.** Mock mode only returns sample results for checking the interface and workflow. It does not represent the output quality of OpenAI, Kimi, Seedance, or other real models. API keys must be stored in server-side environment variables and must never be placed in browser code or `NEXT_PUBLIC_*` variables.

The project is in early development. Real generation requires your own model provider accounts and may incur third-party API charges.

## Screenshots

> The screenshots below use mock demonstration data and contain no real API keys or user data.

### Start with one idea

![Creation entry point with provider configuration status](./docs/screenshots/home-provider-setup.png)

### Text creation workbench

![Input modes, model selection, and the 12 original visual styles](./docs/screenshots/text-creation-workbench.png?v=3)

### Video Flow Map

![Flow Map connecting characters, scenes, storyboard scripts, and a 15-second video node](./docs/screenshots/video-flow-map.png)

### Seedance 2.0 storyboard script

![Shot, camera movement, dialogue, sound, and lighting settings for the current 15-second segment](./docs/screenshots/storyboard-script-detail.png)

## Features

- Generate a world, characters, plot outline, and storyboards from one idea or an imported novel/document
- Generate character models, scene models, and composition reference images
- Connect characters, scenes, visual styles, and the current 15-second script in the Flow Map
- Generate and resume asynchronous video jobs while maintaining continuity between adjacent segments
- Preview, reuse, download, and delete project assets in the Gallery
- Switch between Chinese and English interfaces, with the language choice saved in the browser
- Use the local workbench without registration or login
- Store project data in local JSON or PostgreSQL
- Store media on local disk or S3-compatible storage

## Technology

- Web: Next.js 16, React 19, TypeScript
- API: NestJS 11
- Data: Prisma 7 with PostgreSQL, or local JSON
- Media: local disk or S3-compatible storage
- Text models: OpenAI, Moonshot/Kimi, or an OpenAI-compatible endpoint
- Image and video: Seedance/Volcengine Ark, fal, or compatible endpoints

## Quick Start

Requirements: Node.js 22+ and npm 10+.

```bash
git clone https://github.com/tansuanyl/YumingScroll.git
cd YumingScroll
npm ci
cp .env.example .env
```

### Recommended: configure real providers first

To evaluate actual generation quality, disable mock mode in `.env` and configure at least one text provider. Image and video generation also require a media provider:

```env
APP_ENV=local
DATABASE_URL=
MOCK_PROVIDERS=false

# Configure at least one text provider: OpenAI or Moonshot/Kimi
OPENAI_MOCK=false
OPENAI_API_KEY=your-openai-api-key
MOONSHOT_API_KEY=

# Image and video generation
SEEDANCE_MOCK=false
SEEDANCE_API_KEY=your-seedance-api-key
```

Never commit an `.env` file containing real keys. See [Configure Real AI Services](#configure-real-ai-services) for model, compatible endpoint, and additional variable settings.

Start the Web and API services:

```bash
npm run dev
```

- Web: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8787`
- Health check: `http://127.0.0.1:8787/api/health`

Open the Web URL to enter the workbench directly; no registration or login is required. The home page checks text and media provider status. Generation is blocked when the selected text model is unconfigured, while mock or missing media providers are clearly identified.

### Interface and workflow only: mock mode

If you do not have provider accounts, enable key-free mock mode in `.env`:

```env
MOCK_PROVIDERS=true
OPENAI_MOCK=true
SEEDANCE_MOCK=true
```

Mock mode does not call external models. It returns structured sample results only, so do not use those results to judge text, image, or video generation quality.

## PostgreSQL Mode

Start local PostgreSQL and apply migrations:

```bash
npm run db:up
npm run db:deploy
npm run dev
```

`.env.example` uses local PostgreSQL by default. Leave `DATABASE_URL` empty to store project data in local JSON files, which is convenient for personal local use.

## Configure Real AI Services

This repository does not contain model API keys. Every deployment must provide its own keys through server-side environment variables. The browser calls only this project's API; it does not receive, store, or forward API keys entered by users. Do not create `NEXT_PUBLIC_OPENAI_*`, `VITE_OPENAI_*`, or other public key variables.

When a key is missing, the corresponding provider reports `unconfigured`, and generation requests identify the missing server variable. The application never silently falls back to sample output. Mock providers are enabled only when `MOCK_PROVIDERS=true`, `OPENAI_MOCK=true`, or `SEEDANCE_MOCK=true` is explicitly set.

Basic text generation settings:

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

Basic image and video generation settings:

```env
SEEDANCE_MOCK=false
SEEDANCE_API_KEY=
SEEDANCE_PROVIDER=ark
SEEDANCE_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
SEEDANCE_IMAGE_MODEL=doubao-seedream-4-0-250828
SEEDANCE_VIDEO_MODEL=doubao-seedance-2-0-260128
```

Yuming Scroll has no built-in coin or token billing and does not charge generation fees. Model names, API capabilities, and pricing may change at the provider's discretion. Charges are billed directly to the deployment owner's provider account. Follow each provider's terms, content policies, and data-retention rules.

Restart the API service after changing the configuration. Check `/api/text/provider-status` and `/api/media/provider-status`; these endpoints return only configuration status, mode, and model information, never API keys.

## Media Storage

S3-compatible storage is recommended for production. See the [media storage documentation](./docs/media-storage.md).

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run verify:client-secrets
npm audit
```

CI runs type checking, tests, a production build, dependency auditing, and browser bundle secret scanning on pushes and pull requests.

## Project Structure

```text
app/                 Next.js pages and same-origin API proxy
src/components/      Workbench, Gallery, and Flow Map interface
src/lib/             Frontend state, workflow connections, and project asset logic
server/nest/         NestJS controllers and error handling
server/services/     Text, media, storage, and project services
server/providers/    OpenAI and image/video provider adapters
prisma/              Schema and migrations
tests/               Vitest unit and integration tests
docs/                Deployment, storage, and prompt framework documentation
```

## Deployment

- General frontend/backend architecture: [deployment architecture](./docs/deployment-architecture.md)
- Tencent Cloud deployment: [Tencent Cloud deployment guide](./docs/tencent-cloud-deployment.md)
- Manual deployment with GitHub Actions: [CVM Actions deployment](./docs/github-actions-deployment.md)

This version is designed for single-user self-hosting and has no built-in accounts or access control. Before exposing it to the public internet, add access protection at the reverse proxy or private network layer, enable HTTPS, and configure persistent database and media storage. Never commit `.env` files, databases, uploads, or generated assets.

## Privacy and Security

- The in-app privacy policy is available at `/privacy`; operators should update it for their deployment, contact details, and third-party providers
- Report security issues privately according to [SECURITY.md](./SECURITY.md)
- Read [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) before contributing

## License

The source code is licensed under the [GNU Affero General Public License v3.0 only](./LICENSE). If you provide a modified version over a network, you must make the corresponding source code available to users of that service.

User inputs and user-generated novels, prompts, images, audio, and videos do not automatically become subject to the AGPL by using this software. The project name, logo, and brand assets are not licensed with the source code; see [TRADEMARKS.md](./TRADEMARKS.md). Third-party component notices are available in [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
