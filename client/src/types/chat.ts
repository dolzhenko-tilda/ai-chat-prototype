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

export type AppUIDataTypes = {
  error: { message: string };
  ["custom-json"]: CustomJsonPartMessage;
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
