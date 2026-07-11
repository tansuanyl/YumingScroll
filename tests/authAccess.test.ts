import { describe, expect, it } from "vitest";
import { canAccessProject } from "../server/services/AccessControl";
import type { AuthUserRecord } from "../server/services/AuthService";
import type { Project } from "../src/types/domain";

const project = { id: "project-1", ownerUserId: "user-1" } as Project;

describe("project access control", () => {
  it("allows admins to access any project", () => {
    const admin = { id: "admin-1", role: "admin", status: "active" } as AuthUserRecord;

    expect(canAccessProject(admin, project)).toBe(true);
  });

  it("allows testers to access only their own projects", () => {
    const owner = { id: "user-1", role: "tester", status: "active" } as AuthUserRecord;
    const other = { id: "user-2", role: "tester", status: "active" } as AuthUserRecord;

    expect(canAccessProject(owner, project)).toBe(true);
    expect(canAccessProject(other, project)).toBe(false);
  });

  it("keeps unowned legacy projects admin-only", () => {
    const admin = { id: "admin-1", role: "admin", status: "active" } as AuthUserRecord;
    const tester = { id: "user-1", role: "tester", status: "active" } as AuthUserRecord;
    const legacyProject = { id: "legacy-project" } as Project;

    expect(canAccessProject(admin, legacyProject)).toBe(true);
    expect(canAccessProject(tester, legacyProject)).toBe(false);
  });
});
