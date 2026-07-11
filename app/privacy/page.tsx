import type { Metadata } from "next";
import { BrandMark } from "../../src/components/BrandMark";

export const metadata: Metadata = {
  title: "隐私政策 | 喻鸣绘卷",
  description: "喻鸣绘卷关于用户数据收集、使用、第三方 AI 服务传输和数据删除方式的说明。"
};

const collectedData = [
  "账号信息：邮箱、内测账号名、显示名称、密码哈希、邮箱验证状态、登录状态和管理员设置的账号权限。",
  "创作内容：你输入或上传的小说、题材、人物关系、世界观、分镜脚本、Prompt、Flow Map 连接和项目编辑记录。",
  "生成素材：系统生成或你上传的图片、视频、参考图、文件名、素材 URL、存储 key、生成状态、失败原因和任务 ID。",
  "计费与使用记录：coins 余额、充值或扣费流水、生成任务类型、生成时间、请求状态和必要的防滥用记录。",
  "技术日志：访问时间、接口错误、浏览器请求信息、IP 地址等由服务器、托管平台或安全系统产生的运行日志。"
];

const usage = [
  "为你创建和保存项目、同步 Flow Map、恢复生成任务、展示 Gallery 和导出素材。",
  "完成账号登录、邮箱验证、密码重置、权限管理、coins 计费和管理员支持。",
  "把你主动提交的文本、Prompt、图片或视频参考传给生成服务，返回文本、图片或视频结果。",
  "排查错误、阻止滥用、保护服务安全，并以汇总或去标识化方式改进产品体验。"
];

const thirdPartyServices = [
  "文本模型服务：当你选择 GPT 或 Kimi 等文本模型时，创作输入、上下文、分镜要求和相关项目内容可能会发送给 OpenAI、Moonshot/Kimi 或配置的 OpenAI-compatible 服务。",
  "图像和视频生成服务：当你生成角色图、场景图或视频时，相关 Prompt、参考图、首尾帧、分镜脚本和任务参数可能会发送给 Seedance、火山引擎或配置的图像/视频生成服务。",
  "存储和基础设施：生成素材、上传文件和日志可能会存放在本服务配置的本地存储、S3-compatible 存储、云服务器、数据库或托管平台中。",
  "我们不会出售你的个人数据。第三方服务对数据的处理还会受其自身服务条款、隐私政策和数据保留规则约束。"
];

const deletionSteps = [
  "你可以联系系统管理员，说明需要删除的账号邮箱、项目名称、素材或生成记录。",
  "管理员可删除或匿名化账号资料、项目内容、上传文件、生成图片、生成视频、Gallery 素材和相关数据库记录。",
  "已进入备份、审计日志、第三方 AI 服务或云存储日志的数据，可能需要更长时间清除，或按安全、合规和账务要求保留必要记录。",
  "删除完成后，相关项目和素材可能无法恢复；如果只是误生成素材，优先在 Gallery 或项目内删除对应内容。"
];

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <section className="privacy-hero" aria-labelledby="privacy-title">
        <a className="privacy-brand-link" href="/" aria-label="返回喻鸣绘卷首页">
          <BrandMark className="hero-brand-mark" />
        </a>
        <p className="eyebrow">Privacy Policy</p>
        <h1 id="privacy-title">隐私政策</h1>
        <p>
          本政策说明喻鸣绘卷会收集哪些用户数据、如何使用这些数据、哪些数据会发送给第三方 AI 服务，以及你如何请求删除数据。
        </p>
        <div className="privacy-meta">
          <span>最后更新：2026 年 6 月 23 日</span>
          <a href="/">返回工作台</a>
        </div>
      </section>

      <section className="privacy-content" aria-label="隐私政策正文">
        <PolicySection title="我们收集的数据" items={collectedData} />
        <PolicySection title="我们如何使用数据" items={usage} />
        <PolicySection title="是否发送给第三方 AI 服务" items={thirdPartyServices} />
        <PolicySection title="用户如何删除数据" items={deletionSteps} />

        <section className="privacy-notice" aria-labelledby="privacy-security-title">
          <h2 id="privacy-security-title">安全与最小化</h2>
          <p>
            浏览器端只请求喻鸣绘卷自己的后端接口。OpenAI 等模型服务密钥应只保存在服务端环境变量中，不应放入前端代码、
            <code>NEXT_PUBLIC_*</code> 或 <code>VITE_*</code> 环境变量。
          </p>
        </section>
      </section>
    </main>
  );
}

function PolicySection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="privacy-section">
      <h2>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
