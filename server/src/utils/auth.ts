import type { NextFunction, Request, Response } from "express";
import { tokensRepository } from "../repositories/tokensRepository.js";
import { sendError } from "./response.js";

/**
 * Enforces the `ClientRequest<T>` contract (`ai-chat-contracts.ts`): every
 * endpoint except `GET /api/v1/init` requires a `token` minted by `/init`.
 * Reads it from the query string for `GET` requests and from the JSON body
 * otherwise, and rejects the request with a `ServerErrorResponse` if it's
 * missing or unknown.
 */
export function requireToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.method === "GET" ? req.query.token : (req.body as Record<string, unknown> | undefined)?.token;
  if (!tokensRepository.isValid(token)) {
    sendError(res, 401, "Missing or invalid token", "UNAUTHORIZED");
    return;
  }
  next();
}
