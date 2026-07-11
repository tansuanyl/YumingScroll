import type { NextRequest } from "next/server";
import { existsSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const apiProxyTargets = resolveApiProxyTargets();
const apiProxyTimeoutMs = Number(process.env.API_PROXY_TIMEOUT_MS || 480_000);
const apiProxyMaxAttempts = Math.max(1, Number(process.env.API_PROXY_MAX_ATTEMPTS || 2));
const apiProxyRetryDelayMs = Math.max(0, Number(process.env.API_PROXY_RETRY_DELAY_MS || 300));
const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
]);
const cacheRevalidationHeaders = new Set([
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "if-unmodified-since"
]);
const emptyBodyStatusCodes = new Set([204, 205, 304]);

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxyApiRequest(request: NextRequest, context: RouteContext) {
  if (apiProxyTargets.length === 0) {
    return Response.json({ error: "API_PROXY_TARGET is not configured" }, { status: 500 });
  }

  const params = await context.params;
  const path = (params.path || []).map(encodeURIComponent).join("/");
  const sourceUrl = new URL(request.url);

  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const failures: ProxyFailure[] = [];

  for (const apiProxyTarget of apiProxyTargets) {
    const targetUrl = `${apiProxyTarget}/api/${path}${sourceUrl.search}`;
    for (let attempt = 1; attempt <= apiProxyMaxAttempts; attempt += 1) {
      try {
        return await proxyWithNodeHttp(targetUrl, request.method, request.headers, body);
      } catch (error) {
        const failure = { target: apiProxyTarget, error: toError(error) };
        failures.push(failure);
        if (attempt < apiProxyMaxAttempts && isRetryableProxyConnectionError(failure.error)) {
          await delay(apiProxyRetryDelayMs);
          continue;
        }
        break;
      }
    }
  }

  return Response.json({ error: formatProxyFailureMessage(failures) }, { status: 502 });
}

function proxyWithNodeHttp(
  targetUrl: string,
  method: string,
  sourceHeaders: Headers,
  body?: ArrayBuffer
): Promise<Response> {
  const url = new URL(targetUrl);
  const client = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const upstreamRequest = client.request(
      url,
      {
        method,
        headers: buildUpstreamHeaders(sourceHeaders, body),
        timeout: apiProxyTimeoutMs
      },
      (upstreamResponse) => {
        const responseHeaders = new Headers();
        for (const [key, value] of Object.entries(upstreamResponse.headers)) {
          if (!value || hopByHopHeaders.has(key.toLowerCase())) continue;
          if (Array.isArray(value)) {
            value.forEach((item) => responseHeaders.append(key, item));
          } else {
            responseHeaders.set(key, value);
          }
        }

        const status = upstreamResponse.statusCode || 502;
        const responseBody = emptyBodyStatusCodes.has(status)
          ? null
          : (Readable.toWeb(upstreamResponse) as ReadableStream<Uint8Array>);

        resolve(
          new Response(responseBody, {
            status,
            statusText: upstreamResponse.statusMessage,
            headers: responseHeaders
          })
        );
      }
    );

    upstreamRequest.on("timeout", () => {
      upstreamRequest.destroy(new Error(`API proxy timed out after ${apiProxyTimeoutMs}ms`));
    });
    upstreamRequest.on("error", reject);

    if (body) {
      upstreamRequest.end(Buffer.from(body));
    } else {
      upstreamRequest.end();
    }
  });
}

function buildUpstreamHeaders(sourceHeaders: Headers, body?: ArrayBuffer): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {};
  sourceHeaders.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (!hopByHopHeaders.has(normalizedKey) && !cacheRevalidationHeaders.has(normalizedKey)) {
      headers[key] = value;
    }
  });
  headers["cache-control"] = "no-store";
  if (body) {
    headers["content-length"] = Buffer.byteLength(Buffer.from(body));
  }
  return headers;
}

type ProxyFailure = {
  target: string;
  error: Error;
};

function resolveApiProxyTargets(): string[] {
  const configuredTargets = [
    process.env.API_PROXY_TARGET,
    ...(process.env.API_PROXY_FALLBACK_TARGETS || "")
      .split(",")
      .map((target) => target.trim())
      .filter(Boolean)
  ];
  const targets = uniqueTargets(configuredTargets.map(normalizeApiProxyTarget).filter((target): target is string => Boolean(target)));
  const primaryTarget = targets[0];
  if (primaryTarget && shouldAddLocalApiFallback(primaryTarget)) {
    targets.push("http://127.0.0.1:8787");
  }
  return uniqueTargets(targets);
}

function normalizeApiProxyTarget(target?: string): string | undefined {
  const normalizedTarget = target?.trim().replace(/\/+$/, "");
  if (!normalizedTarget) return undefined;
  try {
    const url = new URL(normalizedTarget);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return normalizedTarget;
  } catch {
    return undefined;
  }
}

function uniqueTargets(targets: string[]): string[] {
  return Array.from(new Set(targets));
}

function shouldAddLocalApiFallback(target: string): boolean {
  try {
    const url = new URL(target);
    return url.hostname === "api" && !isProbablyRunningInContainer();
  } catch {
    return false;
  }
}

function isProbablyRunningInContainer(): boolean {
  return existsSync("/.dockerenv") || Boolean(process.env.KUBERNETES_SERVICE_HOST || process.env.CONTAINER);
}

function isRetryableProxyConnectionError(error: Error): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return (
    (typeof code === "string" && ["EAI_AGAIN", "ENOTFOUND", "ECONNREFUSED"].includes(code)) ||
    /getaddrinfo (?:EAI_AGAIN|ENOTFOUND)|connect ECONNREFUSED/i.test(`${error.name} ${error.message}`)
  );
}

function formatProxyFailureMessage(failures: ProxyFailure[]): string {
  const lastFailure = failures.at(-1);
  if (!lastFailure) return "API 代理无法连接后端服务。";

  const target = uniqueTargets(failures.map((failure) => failure.target)).join(", ") || lastFailure.target;
  return `API 代理无法连接后端服务（${target}）。请确认 API 服务正在运行；本地开发请使用 http://127.0.0.1:8787。最后错误：${lastFailure.error.message}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error("API proxy request failed");
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const GET = proxyApiRequest;
export const POST = proxyApiRequest;
export const PUT = proxyApiRequest;
export const PATCH = proxyApiRequest;
export const DELETE = proxyApiRequest;
export const OPTIONS = proxyApiRequest;
