# Yuming Scroll Launch Kit

This document contains ready-to-review launch copy, product positioning, and a
two-week distribution plan for Yuming Scroll. Chinese and English copy are kept
together so that product claims stay consistent across channels.

Do not publish every draft unchanged. Add one personal detail about why you
built the project, verify each community's current rules, and stay available to
answer technical questions after posting.

## Canonical links

- Repository: <https://github.com/tansuanyl/YumingScroll>
- Latest release: <https://github.com/tansuanyl/YumingScroll/releases/latest>
- Issues: <https://github.com/tansuanyl/YumingScroll/issues>
- Discussions: <https://github.com/tansuanyl/YumingScroll/discussions>
- Social preview: [social-preview.png](./social-preview.png)
- Text workbench: [text-creation-workbench.png](./screenshots/text-creation-workbench.png)
- Flow Map: [video-flow-map.png](./screenshots/video-flow-map.png)
- Storyboard detail: [storyboard-script-detail.png](./screenshots/storyboard-script-detail.png)

## Positioning

### Chinese

喻鸣绘卷是一个可自托管的 AI 漫剧创作工作台，把故事、人物与场景、分镜脚本、Flow Map、图片和视频资产组织在同一个项目中。

### English

Yuming Scroll is a self-hosted AI comic-to-video workbench that keeps stories,
characters, scenes, storyboard scripts, a visual Flow Map, images, and video
assets in one project.

### Claims to keep consistent

- The project is open source under `AGPL-3.0-only` and is still in early development.
- It is designed for single-user self-hosting. It is not a hosted SaaS product.
- There is no registration, login, built-in coin system, or application-level billing.
- Deployers bring their own AI provider accounts and configure keys only in server-side environment variables.
- Mock mode demonstrates the interface and workflow; it does not represent real model output quality.
- OpenAI, Moonshot/Kimi, Seedance/Volcengine Ark, fal, and compatible endpoints are third-party services, not bundled models.
- The project is not a local-inference stack unless a deployer connects a compatible local endpoint.

Avoid claims such as "production ready", "free AI generation", "fully local",
"one click", or "best output" until the project can substantiate them.

## Asset order

Use one strong visual per post instead of attaching every screenshot.

1. `docs/social-preview.png`: repository links and general launch posts.
2. `docs/screenshots/video-flow-map.png`: the clearest product differentiator.
3. `docs/screenshots/text-creation-workbench.png`: text workflow and the 12 original visual styles.
4. `docs/screenshots/storyboard-script-detail.png`: detailed storyboard, dialogue, sound, and lighting controls.

Suggested alt text:

- Chinese: `喻鸣绘卷的 Flow Map，将人物、场景、分镜脚本与 15 秒视频节点连接在同一画布中。`
- English: `Yuming Scroll Flow Map connecting characters, scenes, a storyboard script, and a 15-second video node on one canvas.`

## V2EX

Recommended node: [分享创造](https://www.v2ex.com/go/create). Check that the
account is eligible to post and review the node rules immediately before
publishing. Do not repost small updates as new launch topics.

### Title

```text
开源了一个自托管 AI 漫剧工作台：从故事、分镜到 Flow Map 和视频资产
```

### Body

```text
大家好，我把之前面向 C 端产品形态开发的 AI 漫剧工作台，整理成了一个开源、自托管版本：喻鸣绘卷（Yuming Scroll）。

我做它的原因是，长篇故事转视频并不是“一条 Prompt 生成一个片段”这么简单。人物、场景、画风、分镜、台词和前后片段连续性都需要反复编辑和复用，所以我想把这些信息放进一个持续存在的项目工作区，而不是散落在不同对话和文件夹里。

目前包含：

- 从一句想法或小说/文档生成世界观、人物、剧情大纲和分镜
- 人物、场景、构图参考图与 Gallery 资产管理
- 用 Flow Map 连接人物、场景、画风、当前 15 秒脚本和视频节点
- Seedance 风格的分镜脚本编辑，包括镜头、运镜、台词、音效和光影
- 中文/英文界面、本地 JSON 或 PostgreSQL、本地磁盘或 S3-compatible 存储
- 无需注册登录，没有 coins/token 计费

技术栈是 Next.js 16、React 19、NestJS 11、Prisma 7 和 TypeScript。

仓库不内置任何 API Key。部署者需要把自己的 OpenAI、Moonshot/Kimi、Seedance/Ark、fal 或兼容服务 Key 配置在服务端环境变量里，浏览器端不会接收 Key。没有 Provider 时可以用 Mock 检查界面和流程，但 Mock 结果不代表真实生成质量。

项目还在早期开发阶段，目前更适合愿意本地部署、看代码和一起打磨工作流的用户。我尤其想听这三类反馈：

1. 从 README 到首次启动，哪一步最容易卡住？
2. Flow Map 的连接关系是否直观？
3. 你最需要接入哪一种图片或视频 Provider？

GitHub：
https://github.com/tansuanyl/YumingScroll

许可证：AGPL-3.0-only
```

### First reply

```text
补充一下当前边界：这是单用户自托管版本，没有内置访问控制；部署到公网前需要在反向代理或私有网络层增加认证和 HTTPS。真实模型调用费用由部署者自己的 Provider 账号承担。

如果你愿意试跑，遇到安装、Provider 配置或 Flow Map 问题，可以直接在 Issues 里贴环境和复现步骤：
https://github.com/tansuanyl/YumingScroll/issues
```

## Jike / 即刻

Pair this copy with `docs/social-preview.png` or the Flow Map screenshot.

```text
把我之前做成 C 端产品形态的 AI 漫剧工作台，重新整理成开源、自托管版本了。

它不是“一条 Prompt 出一段视频”的壳，而是把故事、人物、场景、画风、分镜脚本、Flow Map、图片和视频资产放进同一个可持续编辑的项目里。现在不需要注册登录，也没有 coins/token 计费；部署者使用自己的 AI Provider，并把 Key 只放在服务端环境变量中。

项目还在早期阶段，最想找愿意本地部署、认真反馈工作流的人。尤其想知道：Flow Map 是否直观，以及从 README 到第一次启动会卡在哪一步。

GitHub：https://github.com/tansuanyl/YumingScroll

#开源项目 #AI漫剧 #独立开发
```

## X

The primary posts below fit the standard short-post format. Attach the social
preview or Flow Map image. Put setup details in replies instead of overloading
the first post.

### Chinese primary post

```text
我把 AI 漫剧工作台「喻鸣绘卷」开源了：故事、人物、场景、分镜脚本、Flow Map、图片和视频资产都在一个项目里。支持自托管、中英界面，无需账号或内置计费；API Key 只配置在自己的服务端。项目还在早期，欢迎试跑和提反馈。

https://github.com/tansuanyl/YumingScroll
```

### Chinese reply

```text
技术栈：Next.js + React + NestJS + Prisma。数据可用本地 JSON 或 PostgreSQL，媒体可放本地磁盘或 S3-compatible storage。Mock 只用于检查界面和流程，评估生成质量前请配置真实 Provider。
```

### English primary post

```text
I open-sourced Yuming Scroll, a self-hosted AI comic-to-video workbench for stories, characters, scenes, storyboards, Flow Map, and video assets. No accounts or built-in billing. Bring your own server-side provider keys.

https://github.com/tansuanyl/YumingScroll
```

### English reply

```text
Built with Next.js, React, NestJS, Prisma, and TypeScript. Use local JSON or PostgreSQL for projects and local disk or S3-compatible media storage. It is early-stage, and I am looking for honest feedback on setup friction and the Flow Map model.
```

## Reddit

Use the following as a source draft, then rewrite the opening paragraph in your
own voice. Read the target community's current rules and disclose that you are
the author. Do not post identical copy to several subreddits.

`r/selfhosted` currently expects promoted applications to be production-ready
and documented. Because Yuming Scroll is explicitly early-stage, wait until the
installation path and provider setup have been validated by several external
users before posting there. For an earlier feedback post, choose a maker or open
source community that explicitly permits project showcases and where your
account already participates.

### Title

```text
I open-sourced the self-hosted AI comic-to-video workbench I built for long-form story workflows
```

### Body

```text
Hi, I am the author of Yuming Scroll. I started building it because long-form story-to-video work quickly becomes more than a prompt box: characters and locations need to stay reusable, storyboard details need to remain editable, and every short video segment has to preserve context from the previous one.

Yuming Scroll keeps that work in one project. It currently includes:

- story, world, character, plot, and storyboard generation
- character, scene, and composition-reference assets
- a visual Flow Map connecting characters, scenes, visual styles, scripts, and 15-second video nodes
- editable shot, camera, dialogue, sound, and lighting details
- a Gallery for previewing, reusing, downloading, and deleting assets
- Chinese and English interfaces
- local JSON or PostgreSQL project storage, plus local or S3-compatible media storage

The stack is Next.js, React, NestJS, Prisma, and TypeScript. The app is designed for single-user self-hosting, so it has no registration flow or built-in coin/token billing.

The repository does not ship API keys. Deployers bring their own OpenAI, Moonshot/Kimi, Seedance/Ark, fal, or compatible provider credentials and keep them in server-side environment variables. Mock mode is available to inspect the interface and workflow, but it is not representative of real model output.

This is an early release, not a production-ready hosted service. I would value concrete feedback on three things: installation friction, whether the Flow Map is understandable without explanation, and which image/video provider abstraction would be most useful next.

Repository: https://github.com/tansuanyl/YumingScroll
License: AGPL-3.0-only
```

### First comment

```text
One deployment caveat: there is no built-in access control in this single-user release. Anyone exposing it to the public internet should add authentication and HTTPS at the reverse proxy or private-network layer.

The latest setup guide and provider configuration are in the README. Reproducible issues are welcome here:
https://github.com/tansuanyl/YumingScroll/issues
```

## Hacker News readiness

Do not submit the project as a Show HN yet. Show HN asks for something people
can try easily, while the current project requires a local setup and external
provider configuration. Reconsider after adding a reliable containerized quick
start or a safe public demo.

When it is ready, write the submission and comments personally rather than
copying generated launch prose. The current HN guidelines explicitly disallow
generated or AI-edited comments.

Potential future title:

```text
Show HN: Yuming Scroll, a self-hosted workbench for AI comic-to-video projects
```

## Two-week launch sequence

Do not publish the same pitch everywhere on the same day. Each post should
produce feedback or an artifact that improves the next one.

| Day | Action | Goal |
| --- | --- | --- |
| 0 | Publish the V2EX post and one Chinese X post | Validate positioning and setup questions with Chinese developers |
| 1 | Answer every substantive reply and convert reproducible problems into Issues | Show that the project is actively maintained |
| 2 | Publish the Jike post with the Flow Map image | Reach creators and independent developers |
| 4 | Publish the English Reddit feedback post in one rules-compatible community | Collect installation and architecture feedback |
| 6 | Share a short technical note about keeping provider keys out of browser bundles | Offer useful engineering detail, not another launch ad |
| 8 | Record a 30-45 second screen capture from idea to Flow Map | Make the workflow understandable without reading the README |
| 10 | Fix the top onboarding issue and ship a patch release if warranted | Turn attention into visible product progress |
| 14 | Share what changed from external feedback, with issue/PR links | Build credibility through follow-through |

## Pre-publish checklist

- Pull the latest `main` and verify CI is green.
- Confirm <https://github.com/tansuanyl/YumingScroll/releases/latest> points to the intended release.
- Open every screenshot at full size and verify that it contains no API key, private text, or user data.
- Keep the early-development and bring-your-own-provider caveats in the post.
- Check the target community's live rules, account-age requirements, flair, and self-promotion policy.
- Use one canonical repository link without tracking parameters.
- Be available for the first two hours after posting.
- Turn bugs into Issues and answer the thread with the resulting link.
- Do not ask friends to manufacture upvotes, comments, stars, or watches.
- Record the baseline before each post: repository views, unique visitors, clones, stars, Issues, and Discussions.

## Feedback prompts

Ask for one or two concrete forms of feedback rather than a generic "thoughts?":

- Which README step prevented you from reaching the workbench?
- Could you predict what connecting each Flow Map input would change?
- Which provider did you expect to work but could not configure?
- Which project data would you need to export before using this for real work?
- What is the smallest missing feature that would make you return next week?

## Platform references

- [V2EX 分享创造](https://www.v2ex.com/go/create)
- [Reddit guidance for participating as a human first](https://www.business.reddit.com/learning-hub/articles/smb-how-to-use-reddit)
- [r/selfhosted rules](https://www.reddit.com/r/selfhosted/about/rules)
- [X post formats](https://help.x.com/en/using-x/types-of-posts)
- [Hacker News guidelines](https://news.ycombinator.com/newsguidelines.html)
- [Show HN guidelines](https://news.ycombinator.com/showhn.html)
