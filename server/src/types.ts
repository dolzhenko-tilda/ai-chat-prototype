import type { InferUIMessageChunk, InferUITools, UIMessage } from "ai";
import type { tools } from "./services/llm.js";

export type CustomJsonPartMessage = {
  title: string;
  count: number;
};

/** Custom data parts our server emits into message.parts (section 8: error handling). */
export type AppUIDataTypes = {
  error: { message: string };
  ["custom-json"]: CustomJsonPartMessage;
};

export type AppTools = InferUITools<typeof tools>;

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

/** Client-supplied context about where the chat is embedded (e.g. the page
 * the user was on when they sent a message) - see `ai-chat-contracts.ts`'s
 * `Context`/`UiMessageMetadata`. Sent by the client on `POST
 * /messages/create` and fed into the system prompt for that generation so
 * the model knows what page the user is looking at. */
export type Context = {
  pageUrl: string;
};

/** A chat's summary, used for the chats history list (see `GET /api/v1/chats/list`). */
export type Chat = {
  id: string;
  name: string;
  updatedAt: string;
};

/** Reasoning effort levels accepted from the client (see the AI SDK's
 * standardized `reasoning` call option used in generationService.ts).
 * "off" disables thinking entirely. */
export const REASONING_EFFORT_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORT_LEVELS)[number];

/** Message-level metadata surfaced to the client (e.g. to render an "aborted"/"error" badge on history load). */
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
  /** Present on a user message that was sent along with page context (see
   * `Context`). Persisted so it survives a history reload, though it's
   * only actually used (fed into the system prompt) for the generation
   * triggered by that same message. */
  context?: Context;
};

/** The concrete UIMessage shape used across the whole server (matches the client). */
export type AppUIMessage = UIMessage<
  AppUIMessageMetadata,
  AppUIDataTypes,
  AppTools
>;

/** The exact UIMessageChunk union for AppUIMessage (includes our custom `data-error` chunk). */
export type AppUIMessageChunk = InferUIMessageChunk<AppUIMessage>;

export interface MessageRow {
  id: string;
  chatId: string;
  role: AppUIMessage["role"];
  parts: AppUIMessage["parts"];
  status: MessageStatus;
  seq: number;
  createdAt: number;
  rate?: Rate;
  ratedAt?: number;
  /** See `AppUIMessageMetadata.context`; only ever set on user messages. */
  context?: Context;
}
