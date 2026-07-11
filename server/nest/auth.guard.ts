import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService, type AuthRole } from "../services/AuthService";
import { PUBLIC_ROUTE_KEY, ROLES_KEY, type AuthenticatedRequest } from "./auth.decorators";

export const SESSION_COOKIE_NAME = "ys_session";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(Reflector) private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.auth.getUserBySessionToken(extractSessionToken(request));

    if (isPublic) {
      request.user = user;
      return true;
    }

    if (!user) throw new UnauthorizedException("Login required");

    const roles = this.reflector.getAllAndOverride<AuthRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException("Insufficient account role");
    }

    request.user = user;
    return true;
  }
}

export function extractSessionToken(request: Request): string | undefined {
  const headerToken = request.headers.authorization?.startsWith("Bearer ")
    ? request.headers.authorization.slice("Bearer ".length)
    : undefined;
  if (headerToken) return headerToken;

  const cookies = parseCookies(request.headers.cookie || "");
  return cookies[SESSION_COOKIE_NAME];
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(";").reduce<Record<string, string>>((cookies, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) return cookies;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}
