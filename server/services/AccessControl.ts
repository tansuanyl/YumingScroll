import type { Project } from "../../src/types/domain";
import type { AuthUserRecord } from "./AuthService";

export function canAccessProject(user: AuthUserRecord, project: Pick<Project, "ownerUserId">): boolean {
  if (user.status !== "active") return false;
  if (user.role === "admin") return true;
  return Boolean(project.ownerUserId && project.ownerUserId === user.id);
}
