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

/**
 * Static catalog of images the assistant is allowed to embed in its
 * markdown responses (as `![alt](url)`). In a real system this could query
 * a media library or search API; here it's a fixed demo set.
 */
const IMAGE_LIBRARY = [
  {
    url: "https://static.tildacdn.com/2c5f76e1-d544-43f6-bc1c-4058c8ce82f0/OnRKhvlFQ2uJNSx5O3cc_DSC00560.jpg",
    description: "Photo of a scenic outdoor landscape.",
  },
  {
    url: "https://static.tildacdn.com/tild3039-3432-4333-b966-656536396165/photo1413920346627a4.jpeg",
    description: "Photo of people at an event or gathering.",
  },
  {
    url: "https://static.tildacdn.com/tild3262-6163-4439-b462-623538666334/photo142198652753788.jpeg",
    description: "Photo depicting a lifestyle or everyday scene.",
  },
];

/**
 * Server-side tool: lets the model discover available image URLs (with
 * descriptions) so it can embed them in its markdown reply using
 * `![description](url)` syntax.
 */
export const getImages = tool({
  description:
    "Returns a list of available image URLs with descriptions. Use this when the user wants an image in the response, then embed the chosen image(s) in your markdown reply using ![description](url).",
  inputSchema: z.object({}),
  execute: async () => ({ images: IMAGE_LIBRARY }),
});

/**
 * Static catalog of videos (YouTube embed URLs) the assistant is allowed to
 * embed in its markdown responses. YouTube's oEmbed API can supply a video's
 * real title dynamically (fetched client-side, see `TextPart.vue`), but it
 * has no "description" field, so descriptions here are authored by hand.
 */
const VIDEO_LIBRARY = [
  {
    url: "https://www.youtube.com/embed/XEfDYMngJeE?rel=0&fmt=18&html5=1&showinfo=0",
    description:
      "Relaxing instrumental music paired with scenic Norwegian nature footage - good for background listening or focus.",
  },
  {
    url: "https://www.youtube.com/embed/1dy5wKtJxEY?rel=0&fmt=18&html5=1&showinfo=0",
    description: "A first-person running tour through the streets and landmarks of San Francisco.",
  },
];

/**
 * Server-side tool: lets the model discover available video URLs (with
 * descriptions) so it can embed them in its markdown reply. There's no
 * native markdown syntax for video, so - mirroring how source citations
 * reuse a markdown link's `title` attribute (see `generationService.ts`'s
 * `buildSystemPrompt`) - videos are embedded as a markdown link whose title
 * is prefixed with "video:", e.g. `[Video](<url> "video:<description>")`.
 * The client detects that exact prefix and swaps the link for a real
 * embedded player (see `TextPart.vue`).
 */
export const getVideos = tool({
  description:
    'Returns a list of available video URLs (YouTube embeds) with descriptions. Use this when the user wants a video in the response, then embed the chosen video(s) in your markdown reply using a markdown link in exactly this format: [Video](<url> "video:<description>"). Only use urls and descriptions from this list verbatim - never invent one. Example: [Video](https://www.youtube.com/embed/XEfDYMngJeE?rel=0&fmt=18&html5=1&showinfo=0 "video:Relaxing nature music").',
  inputSchema: z.object({}),
  execute: async () => ({ videos: VIDEO_LIBRARY }),
});

export const tools = {
  calculate,
  getCurrentTime,
  logToConsole,
  getImages,
  getVideos,
};

/** Tools that require explicit user approval when tool-approval mode is enabled. */
export const APPROVAL_GATED_TOOLS = new Set<keyof typeof tools>(["calculate"]);
