import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class JsonErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = extractErrorMessage(exception, payload);

    response.status(status).json({ error: message });
  }
}

export function extractErrorMessage(exception: unknown, payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const body = payload as { error?: unknown; message?: unknown };
    if (typeof body.message === "string") return body.message;
    if (Array.isArray(body.message)) return body.message.join("; ");
    if (typeof body.error === "string") return body.error;
  }
  return exception instanceof Error ? exception.message : "Unknown server error";
}
