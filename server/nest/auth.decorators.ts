import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Request } from "express";
import type { AuthRole, AuthUserRecord } from "../services/AuthService";

export const PUBLIC_ROUTE_KEY = "publicRoute";
export const ROLES_KEY = "roles";

export type AuthenticatedRequest = Request & {
  user?: AuthUserRecord;
};

export const Public = () => SetMetadata(PUBLIC_ROUTE_KEY, true);
export const Roles = (...roles: AuthRole[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});
