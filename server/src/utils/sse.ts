import type { Response } from "express";
import type { AppUIMessageChunk } from "../types.js";

/**
 * Minimal hand-rolled SSE writer matching the "UI Message Stream" protocol
 * used by ai-sdk's `parseJsonEventStream` on the client (see
 * `JsonToSseTransformStream` in the `ai` package): one JSON-encoded
 * `UIMessageChunk` per `data: ...\n\n` frame, terminated by `data: [DONE]\n\n`.
 */

export function startSse(res: Response) {
  res.status(200);
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "x-vercel-ai-ui-message-stream": "v1",
  });
  res.flushHeaders();
}

export function writeChunk(res: Response, chunk: AppUIMessageChunk) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  } catch {
    // client already gone; nothing to do
  }
}

export function endSse(res: Response) {
  if (res.writableEnded || res.destroyed) return;
  try {
    res.write("data: [DONE]\n\n");
    res.end();
  } catch {
    // client already gone; nothing to do
  }
}
