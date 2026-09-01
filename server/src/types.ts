import type { InferUIMessageChunk, InferUITools, UIMessage } from "ai";
import type { tools } from "./services/llm.js";

export type CustomJsonPartMessage = {
  title: string;
  count: number;
};

export type SourcePartMessage = {
  title: string;
  url: string;
  /** Ordinal index of the text part this source's paragraph belongs to, among
   * all "text" parts in the message (0-based; usually just one text part per
   * message, but this keeps sources correctly attached if there are more). */
  textPartIndex: number;
  /** Index (within that text part) of the paragraph this source is attached to. */
  paragraphIndex: number;
};

/** Custom data parts our server emits into message.parts (section 8: error handling). */
export type AppUIDataTypes = {
  error: { message: string };
  ["custom-json"]: CustomJsonPartMessage;
  source: SourcePartMessage;
};

export type AppTools = InferUITools<typeof tools>;

export type MessageStatus = "complete" | "streaming" | "aborted" | "error";

/** Message-level metadata surfaced to the client (e.g. to render an "aborted"/"error" badge on history load). */
export type AppUIMessageMetadata = {
  status: MessageStatus;
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
}
