import { UnauthorizedException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { extractErrorMessage } from "../server/nest/http-error.filter";

describe("JsonErrorFilter", () => {
  it("prefers Nest exception messages over generic error labels", () => {
    const exception = new UnauthorizedException("Invalid username or password");

    expect(extractErrorMessage(exception, exception.getResponse())).toBe("Invalid username or password");
  });
});
