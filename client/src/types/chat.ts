import type { UIMessage } from "ai";

/**
 * Mirrors the server's tool set shape (see server/src/services/llm.ts) so the
 * client gets typed `tool-<name>` UIMessagePart discriminated unions without
 * importing server code (client and server are separate runtimes/packages).
 */
export type AppUITools = {
  calculate: {
    input: { expression: string };
    output: { expression: string; result: number };
  };
  getCurrentTime: {
    input: Record<string, never>;
    output: { iso: string };
  };
  logToConsole: {
    input: { message: string };
    output: { logged: true };
  };
  getImages: {
    input: Record<string, never>;
    output: { images: Array<{ url: string; description: string }> };
  };
  getVideos: {
    input: Record<string, never>;
    output: { videos: Array<{ url: string; description: string }> };
  };
};

export type CustomJsonPartMessage = {
  title: string;
  count: number;
};

export type AppUIDataTypes = {
  error: { message: string };
  ["custom-json"]: CustomJsonPartMessage;
};

export type MessageStatus = "complete" | "streaming" | "aborted" | "error";

/** A user's rating of an assistant answer (see `POST /api/v1/messages/rate`). */
export type Rate = "like" | "dislike";

/** Rating data surfaced on a rated message's `metadata.rateInfo`. */
export type RateInfo = {
  rate: Rate;
  ratedAt: string;
};

export type RateResult = RateInfo & {
  messageId: string;
};

/** Context about where the chat is embedded (e.g. the page the user was on
 * when they sent a message) - see `ai-chat-contracts.ts`'s
 * `Context`/`UiMessageMetadata`. Attached to an outgoing user message so the
 * server can feed it into the model's system prompt for that generation. */
export type Context = {
  pageUrl: string;
};

export type AppUIMessageMetadata = {
  status: MessageStatus;
  /** The chat this message belongs to. Every message has one (mirroring
   * `status`, it's required within the metadata shape even though the
   * top-level `metadata` field itself can briefly be absent client-side,
   * before the first streamed chunk populates it - see
   * `AppUIMessage["metadata"]`/ai-sdk's `createStreamingUIMessageState`). */
  chatId: string;
  /** ISO timestamp the message was created at (used to render its time and to group messages by day). Required like `status`/`chatId` - every message has one. */
  createdAt: string;
  /** Present only once the (assistant) message has been rated. */
  rateInfo?: RateInfo;
  /** Present on a user message sent along with page context (see `Context`). */
  context?: Context;
};

export type AppUIMessage = UIMessage<
  AppUIMessageMetadata,
  AppUIDataTypes,
  AppUITools
>;

/** A chat's summary, used for the chats history list (see `GET /api/v1/chats/list`). */
export type Chat = {
  id: string;
  name: string;
  updatedAt: string;
};

export type ChatStatus = "submitted" | "streaming" | "ready" | "error";

/** Reasoning effort levels the UI lets the user pick, mirroring the AI SDK's
 * standardized `reasoning` call option (see server/src/services/llm.ts /
 * generationService.ts) - "off" disables thinking entirely (mapped to
 * `reasoning: "none"` server-side). */
export const REASONING_EFFORT_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORT_LEVELS)[number];
