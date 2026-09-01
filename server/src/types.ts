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
  /** If the paragraph is a markdown list, the index of the specific list
   * item (within that paragraph) this source is attached to - letting each
   * item have its own source instead of just one per whole list. Omitted
   * for sources attached to a non-list paragraph as a whole. */
  itemIndex?: number;
};

/** Custom data parts our server emits into message.parts (section 8: error handling). */
export type AppUIDataTypes = {
  error: { message: string };
  ["custom-json"]: CustomJsonPartMessage;
  source: SourcePartMessage;
};

export type AppTools = InferUITools<typeof tools>;

export type MessageStatus = "complete" | "streaming" | "aborted" | "error";

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

/** Percentage (0-100) chance that a plain paragraph gets a mock source
 * attached (see `emitSourcesForCompletedUnits` in generationService.ts).
 * List items always get one regardless of this setting. */
export const DEFAULT_SOURCE_PROBABILITY_PERCENT = 0;

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
