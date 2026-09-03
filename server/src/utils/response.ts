import type { Response } from "express";

/**
 * Wraps a successful payload in the `ServerResponse<T>` envelope from
 * `ai-chat-contracts.ts`: `{ success: true, result: T }`.
 */
export function sendResult<T>(res: Response, result: T, status = 200): void {
  res.status(status).json({ success: true, result });
}

/**
 * Wraps a failure in the `ServerErrorResponse` envelope from
 * `ai-chat-contracts.ts`: `{ success: false, error, errorCode? }`.
 */
export function sendError(res: Response, status: number, error: string, errorCode?: string): void {
  res.status(status).json({ success: false, error, ...(errorCode ? { errorCode } : {}) });
}
