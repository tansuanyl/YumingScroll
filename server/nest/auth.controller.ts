import { Body, Controller, Get, Inject, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { env } from "../env";
import { AuthService } from "../services/AuthService";
import { CurrentUser, Public } from "./auth.decorators";
import { extractSessionToken, SESSION_COOKIE_NAME } from "./auth.guard";
import type { AuthenticatedRequest } from "./auth.decorators";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  displayName: z.string().optional()
});

const resendVerificationSchema = z.object({
  email: z.string().email()
});

const passwordResetRequestSchema = z.object({
  username: z.string().min(1),
  contact: z.string().optional()
});

@Controller("api/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Get("me")
  me(@CurrentUser() user: unknown) {
    return { user: user || null };
  }

  @Public()
  @Post("login")
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = loginSchema.parse(body);
    const result = await this.auth.authenticate(input.username, input.password);
    if (!result) throw new UnauthorizedException("Invalid username or password");

    response.cookie(SESSION_COOKIE_NAME, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.AUTH_COOKIE_SECURE === "true",
      expires: result.expiresAt,
      path: "/"
    });

    return { user: result.user };
  }

  @Public()
  @Post("register")
  async register(@Body() body: unknown) {
    const input = registerSchema.parse(body);
    const user = await this.auth.registerUser(input);
    return {
      user,
      emailVerification: {
        sent: user.emailVerificationSent,
        mailerConfigured: user.emailVerificationMailerConfigured,
        expiresAt: user.emailVerificationExpiresAt,
        url: user.emailVerificationUrl,
        error: user.emailVerificationError
      }
    };
  }

  @Public()
  @Post("resend-verification")
  async resendVerification(@Body() body: unknown) {
    const input = resendVerificationSchema.parse(body);
    const result = await this.auth.resendEmailVerificationForLogin(input.email).catch(() => undefined);
    return {
      ok: true,
      emailVerification: result
        ? {
            sent: result.sent,
            mailerConfigured: result.mailerConfigured,
            error: result.reason
          }
        : undefined
    };
  }

  @Public()
  @Get("verify-email")
  async verifyEmail(@Query("token") token: string | undefined, @Res() response: Response) {
    if (!token) throw new UnauthorizedException("Missing email verification token");
    await this.auth.verifyEmailToken(token);
    const redirectUrl = new URL("/", env.APP_PUBLIC_URL || env.WEB_ORIGIN);
    redirectUrl.searchParams.set("emailVerified", "1");
    response.redirect(302, redirectUrl.toString());
  }

  @Public()
  @Post("password-reset-requests")
  async requestPasswordReset(@Body() body: unknown) {
    const input = passwordResetRequestSchema.parse(body);
    await this.auth.createPasswordResetRequest(input).catch(() => undefined);
    return { ok: true };
  }

  @Public()
  @Post("logout")
  async logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    await this.auth.revokeSessionToken(extractSessionToken(request));
    response.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { ok: true };
  }
}
