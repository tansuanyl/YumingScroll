import { Injectable, Logger } from "@nestjs/common";
import nodemailer from "nodemailer";
import { env } from "../env";

export type SendEmailVerificationInput = {
  to: string;
  displayName?: string;
  verificationUrl: string;
};

export type EmailDeliveryResult = {
  sent: boolean;
  verificationUrl: string;
  reason?: string;
};

export type EmailVerificationDelivery = {
  isConfigured(): boolean;
  sendEmailVerification(input: SendEmailVerificationInput): Promise<EmailDeliveryResult>;
};

@Injectable()
export class EmailService implements EmailVerificationDelivery {
  private readonly logger = new Logger(EmailService.name);

  isConfigured(): boolean {
    return Boolean(env.SMTP_HOST && env.MAIL_FROM);
  }

  async sendEmailVerification(input: SendEmailVerificationInput): Promise<EmailDeliveryResult> {
    if (!this.isConfigured()) {
      this.logger.warn(`SMTP is not configured. Verification link for ${input.to}: ${input.verificationUrl}`);
      return {
        sent: false,
        verificationUrl: input.verificationUrl,
        reason: "SMTP is not configured"
      };
    }

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE === "true",
      auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
    });

    const greeting = input.displayName ? `${input.displayName}，` : "";
    await transporter.sendMail({
      from: env.MAIL_FROM,
      to: input.to,
      subject: "验证你的喻鸣绘卷账号邮箱",
      text: `${greeting}请打开下面的链接完成邮箱验证：\n\n${input.verificationUrl}\n\n如果不是你本人注册，请忽略这封邮件。`,
      html: [
        `<p>${escapeHtml(greeting)}请点击下面的链接完成邮箱验证。</p>`,
        `<p><a href="${escapeHtml(input.verificationUrl)}">验证邮箱</a></p>`,
        `<p>如果按钮不可用，请复制这个链接到浏览器打开：</p>`,
        `<p>${escapeHtml(input.verificationUrl)}</p>`,
        `<p>如果不是你本人注册，请忽略这封邮件。</p>`
      ].join("")
    });

    return { sent: true, verificationUrl: input.verificationUrl };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
