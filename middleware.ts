import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const REALM = "AI Comic Workbench";

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      "Cache-Control": "no-store"
    }
  });
}

function forbidden(message: string) {
  return new NextResponse(message, {
    status: 503,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

export function middleware(request: NextRequest) {
  if (process.env.BASIC_AUTH_ENABLED !== "true") {
    return NextResponse.next();
  }

  const configuredUser = process.env.BASIC_AUTH_USER;
  const configuredPassword = process.env.BASIC_AUTH_PASSWORD;

  if (!configuredUser || !configuredPassword) {
    if (process.env.NODE_ENV === "production") {
      return forbidden("Basic auth is not configured");
    }
    return NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded = "";
  try {
    decoded = atob(authorization.slice("Basic ".length));
  } catch {
    return unauthorized();
  }

  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex < 0) {
    return unauthorized();
  }

  const providedUser = decoded.slice(0, separatorIndex);
  const providedPassword = decoded.slice(separatorIndex + 1);

  if (providedUser !== configuredUser || providedPassword !== configuredPassword) {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
