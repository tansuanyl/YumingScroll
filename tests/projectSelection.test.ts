import { describe, expect, it } from "vitest";
import { getProjectLoadOrder } from "../src/lib/projectSelection";

describe("project load order", () => {
  it("tries the stored active project before the default server order", () => {
    const projects = [{ id: "project-new" }, { id: "project-active" }, { id: "project-old" }];

    expect(getProjectLoadOrder(projects, "project-active")).toEqual(["project-active", "project-new", "project-old"]);
  });

  it("uses server order when the stored project is missing", () => {
    const projects = [{ id: "project-new" }, { id: "project-old" }];

    expect(getProjectLoadOrder(projects, "deleted-project")).toEqual(["project-new", "project-old"]);
  });
});
