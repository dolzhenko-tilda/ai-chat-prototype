import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  convertToModelMessages,
  streamText,
  stepCountIs,
  toUIMessageStream,
} from "ai";
import { model, tools, APPROVAL_GATED_TOOLS } from "./llm.js";
import { messagesRepository } from "../repositories/messagesRepository.js";
import { generationStateRepository } from "../repositories/generationStateRepository.js";
import type {
  AppUIMessage,
  AppUIMessageChunk,
  MessageStatus,
} from "../types.js";

export interface ActiveGeneration {
  chatId: string;
  messageId: string;
  abortController: AbortController;
  emitter: EventEmitter;
  chunks: AppUIMessageChunk[];
  finished: boolean;
  /** Set when the target message was deleted mid-generation (see
   * `discardGeneration`) - the final persist step must then skip writing
   * (otherwise it would silently resurrect the "deleted" message once the
   * in-flight LLM call finishes). */
  discarded: boolean;
}

/** In-memory registry of currently streaming generations, keyed by chatId. */
const activeGenerations = new Map<string, ActiveGeneration>();

export function isGenerationActive(chatId: string): boolean {
  return activeGenerations.has(chatId);
}

export function getActiveGeneration(
  chatId: string,
): ActiveGeneration | undefined {
  return activeGenerations.get(chatId);
}

/**
 * Aborts the active generation for `chatId` if it targets `messageId`, and
 * marks it so its (still in-flight) completion handler won't re-persist the
 * message. Used by `DELETE /messages/:id` so deleting a message that's
 * actively streaming actually sticks, instead of the message reappearing
 * once the LLM call finishes.
 */
export function discardGenerationIfTargeting(
  chatId: string,
  messageId: string,
): void {
  const gen = activeGenerations.get(chatId);
  if (!gen || gen.messageId !== messageId) return;
  gen.discarded = true;
  gen.abortController.abort();
}

/**
 * Builds the per-tool approval configuration passed to `streamText`. Only
 * tools in `APPROVAL_GATED_TOOLS` are affected when the client opts in via
 * the "require approval for sensitive tools" checkbox; everything else runs
 * automatically as usual.
 */
function buildToolApproval(requireApproval: boolean) {
  if (!requireApproval) return undefined;
  const config: Record<string, "user-approval"> = {};
  for (const name of APPROVAL_GATED_TOOLS) {
    config[name] = "user-approval";
  }
  return config;
}

function persistAssistantMessage(
  chatId: string,
  messageId: string,
  parts: AppUIMessage["parts"],
  status: MessageStatus,
) {
  const existing = messagesRepository.getById(messageId);
  if (existing) {
    messagesRepository.update(messageId, parts, status);
  } else {
    messagesRepository.insert({
      id: messageId,
      chatId,
      role: "assistant",
      parts,
      status,
      createdAt: Date.now(),
    });
  }
}

function finishGeneration(gen: ActiveGeneration) {
  if (gen.finished) return;
  gen.finished = true;
  activeGenerations.delete(gen.chatId);
  generationStateRepository.finish(gen.chatId);
  gen.emitter.emit("end");
}

export interface RunGenerationOptions {
  chatId: string;
  /** id the assistant message should have (freshly generated, or an existing one for regenerate/continue) */
  assistantMessageId: string;
  /** Full conversation to send to the model, ending with the latest user or assistant (tool-updated) message. */
  conversation: AppUIMessage[];
  requireApproval: boolean;
}

/**
 * Starts a new streaming generation for a chat. Registers it in the active
 * generation registry so cancel/resume can find it, persists raw chunks as
 * they arrive (so a reconnecting client can replay them via /resume), and
 * writes the final message state to SQLite once the stream ends.
 */
export function runGeneration(options: RunGenerationOptions): ActiveGeneration {
  const { chatId, assistantMessageId, conversation, requireApproval } = options;

  // Only one active generation per chat at a time; a new one supersedes it.
  const existing = activeGenerations.get(chatId);
  if (existing) {
    existing.abortController.abort();
    finishGeneration(existing);
  }

  const abortController = new AbortController();
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  const gen: ActiveGeneration = {
    chatId,
    messageId: assistantMessageId,
    abortController,
    emitter,
    chunks: [],
    finished: false,
    discarded: false,
  };
  activeGenerations.set(chatId, gen);
  generationStateRepository.start(chatId, assistantMessageId);

  // Placeholder row so history/resume immediately reflect the "streaming" state.
  persistAssistantMessage(chatId, assistantMessageId, [], "streaming");

  let finalMessage: AppUIMessage | undefined;
  let finalStatus: MessageStatus = "complete";
  let lastErrorText: string | undefined;
  const customJsonParts: Extract<
    AppUIMessage["parts"][number],
    { type: "data-custom-json" }
  >[] = [];

  /** Appends `data-error`/`data-custom-json` parts (if any were seen) to
   * whatever ai-sdk's own state builder produced. Necessary because these
   * chunks are emitted manually onto the raw stream (see the `for await`
   * loop below) and never passed through `toUIMessageStream`'s internal
   * state builder, so they're missing from `onEnd`'s `responseMessage.parts`
   * - without this, they'd be visible in the live stream but vanish once
   * the message is persisted and reloaded from history. */
  function finalizeParts(parts: AppUIMessage["parts"]): AppUIMessage["parts"] {
    let result = parts;
    for (const part of customJsonParts) {
      if (!result.some((p) => p.type === "data-custom-json" && p.id === part.id)) {
        result = [...result, part];
      }
    }
    if (lastErrorText && !result.some((p) => p.type === "data-error")) {
      result = [...result, { type: "data-error", data: { message: lastErrorText } }];
    }
    return result;
  }

  void (async () => {
    try {
      const modelMessages = await convertToModelMessages(conversation, {
        tools,
      });

      const result = streamText({
        model,
        messages: modelMessages,
        tools,
        toolApproval: buildToolApproval(requireApproval),
        stopWhen: stepCountIs(5),
        abortSignal: abortController.signal,
      });

      const uiStream = toUIMessageStream<typeof tools, AppUIMessage>({
        stream: result.stream,
        tools,
        originalMessages: conversation,
        generateMessageId: () => assistantMessageId,
        onError: (error) =>
          error instanceof Error ? error.message : "An error occurred.",
        onEnd: ({ responseMessage, outcome }) => {
          finalMessage = responseMessage;
          finalStatus =
            outcome.status === "aborted"
              ? "aborted"
              : outcome.status === "failed"
                ? "error"
                : "complete";
        },
      });

      for await (const chunk of uiStream) {
        // A live client's `useChat` throws synchronously the moment it sees
        // a built-in `error` chunk (its `onError` re-throws to abort the
        // stream), so anything queued *after* it is never processed. Emit
        // our custom `data-error` data part *before* the fatal `error`
        // chunk so a connected client still gets to render it inline on
        // the message before the stream aborts.
        if (chunk.type === "error") {
          lastErrorText = chunk.errorText;
          const dataErrorChunk: AppUIMessageChunk = {
            type: "data-error",
            id: randomUUID(),
            data: { message: chunk.errorText },
          };
          gen.chunks.push(dataErrorChunk);
          emitter.emit("chunk", dataErrorChunk);
        }
        if (chunk.type === "finish-step") {
          const customJsonId = randomUUID();
          const customJsonChunk: AppUIMessageChunk = {
            type: "data-custom-json",
            id: customJsonId,
            data: {
              title: "Chunks",
              count: gen.chunks.length,
            },
          };
          customJsonParts.push({
            type: "data-custom-json",
            id: customJsonId,
            data: customJsonChunk.data,
          });
          gen.chunks.push(customJsonChunk);
          emitter.emit("chunk", customJsonChunk);
        }
        gen.chunks.push(chunk);
        emitter.emit("chunk", chunk);
        generationStateRepository.appendChunk(chatId, gen.chunks);
      }

      // If the message was deleted while this generation was still running
      // (see `discardGenerationIfTargeting`), don't resurrect it.
      if (!gen.discarded) {
        persistAssistantMessage(
          chatId,
          assistantMessageId,
          finalizeParts(finalMessage?.parts ?? []),
          finalMessage ? finalStatus : "error",
        );
      }
    } catch (error) {
      console.error(`[generation:${chatId}] failed`, error);
      const message = error instanceof Error ? error.message : String(error);
      lastErrorText = message;
      const dataErrorChunk: AppUIMessageChunk = {
        type: "data-error",
        id: randomUUID(),
        data: { message },
      };
      const errorChunk: AppUIMessageChunk = {
        type: "error",
        errorText: message,
      };
      gen.chunks.push(dataErrorChunk, errorChunk);
      generationStateRepository.appendChunk(chatId, gen.chunks);
      emitter.emit("chunk", dataErrorChunk);
      emitter.emit("chunk", errorChunk);
      if (!gen.discarded) {
        persistAssistantMessage(
          chatId,
          assistantMessageId,
          finalizeParts(finalMessage?.parts ?? []),
          "error",
        );
      }
    } finally {
      finishGeneration(gen);
    }
  })();

  return gen;
}

export function cancelGeneration(chatId: string): boolean {
  const gen = activeGenerations.get(chatId);
  generationStateRepository.requestAbort(chatId);
  if (!gen) return false;
  gen.abortController.abort();
  return true;
}

export function subscribeToGeneration(
  gen: ActiveGeneration,
  onChunk: (chunk: AppUIMessageChunk) => void,
  onEnd: () => void,
): () => void {
  gen.emitter.on("chunk", onChunk);
  gen.emitter.on("end", onEnd);
  return () => {
    gen.emitter.off("chunk", onChunk);
    gen.emitter.off("end", onEnd);
  };
}

export function newMessageId(): string {
  return randomUUID();
}
