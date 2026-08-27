import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { tool } from "ai";
import { z } from "zod";
import { env } from "../env.js";

/**
 * Provider pointed at whatever OpenAI-compatible LLM server is configured via
 * .env (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL_ID). Works with local runtimes
 * such as LM Studio, Ollama's OpenAI-compatible endpoint, vLLM, llama.cpp
 * server, etc.
 */
const provider = createOpenAICompatible({
  name: "local-llm",
  baseURL: env.llmBaseUrl,
  apiKey: env.llmApiKey,
});

export const model = provider.chatModel(env.llmModelId);

/**
 * Server-side tool: executed by the AI SDK on the server. Demonstrates the
 * "tools" requirement from the spec (section 6). Also used to demo the
 * tool-approval feature (section handled via `toolApproval` in
 * generationService), since it performs an "operation" (evaluating an
 * arbitrary expression) that could be considered sensitive.
 */
export const calculate = tool({
  description:
    "Evaluates a basic arithmetic expression (e.g. '2 + 2 * 10') and returns the numeric result.",
  inputSchema: z.object({
    expression: z
      .string()
      .describe("Arithmetic expression using only numbers and + - * / ( ) . operators"),
  }),
  execute: async ({ expression }) => {
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
      throw new Error("Expression contains disallowed characters");
    }
    // eslint-disable-next-line no-new-func -- sandboxed to arithmetic-only input validated above
    const result = Function(`"use strict"; return (${expression});`)();
    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error("Expression did not evaluate to a finite number");
    }
    return { expression, result };
  },
});

/**
 * Second server-side tool: returns the server's current time. Simple,
 * always auto-executes (never requires approval).
 */
export const getCurrentTime = tool({
  description: "Returns the current date and time on the server.",
  inputSchema: z.object({}),
  execute: async () => ({ iso: new Date().toISOString() }),
});

/**
 * Client-side tool: has no `execute`. The AI SDK will surface a pending
 * tool call to the client (section 7.6); the browser executes it (a
 * `console.log`) and reports the result back via `addToolOutput`.
 */
export const logToConsole = tool({
  description:
    "Logs a message to the end user's browser console. Use this when the user explicitly asks you to log or print something to the console.",
  inputSchema: z.object({
    message: z.string().describe("The message to log to the browser console"),
  }),
});

export const tools = {
  calculate,
  getCurrentTime,
  logToConsole,
};

/** Tools that require explicit user approval when tool-approval mode is enabled. */
export const APPROVAL_GATED_TOOLS = new Set<keyof typeof tools>(["calculate"]);
