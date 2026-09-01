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
};

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

export type AppUIDataTypes = {
  error: { message: string };
  ["custom-json"]: CustomJsonPartMessage;
  source: SourcePartMessage;
};

export type MessageStatus = "complete" | "streaming" | "aborted" | "error";

export type AppUIMessageMetadata = {
  status: MessageStatus;
};

export type AppUIMessage = UIMessage<
  AppUIMessageMetadata,
  AppUIDataTypes,
  AppUITools
>;

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

/** Default percentage (0-100) chance that a plain paragraph gets a mock
 * source attached (see server/src/services/generationService.ts). List
 * items always get one regardless of this setting. */
export const DEFAULT_SOURCE_PROBABILITY_PERCENT = 50;
