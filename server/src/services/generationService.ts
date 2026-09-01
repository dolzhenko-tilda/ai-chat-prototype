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
  const mockSources = [
    { title: "Tilda Help Center", url: "https://www.tilda.cc/help/" },
    { title: "Product docs", url: "https://example.com/product-docs" },
    { title: "Knowledge base", url: "https://example.com/knowledge-base" },
  ];
  /** Mock source parts emitted live as paragraphs of assistant text complete
   * (see `emitSourcesForCompletedUnits` below). Kept in a side list -
   * like `customJsonParts` - so they survive into the persisted message even
   * though they're injected manually onto the raw stream and never seen by
   * `toUIMessageStream`'s internal state builder. */
  const sourceParts: Extract<
    AppUIMessage["parts"][number],
    { type: "data-source" }
  >[] = [];
  /** Per-text-part (keyed by the stream's `text-start`/`text-delta` chunk
   * id) state used to detect paragraph boundaries (`\n\n`) as text streams
   * in, so a source can be attached to each paragraph - or, for a list
   * paragraph, to each of its list items - the moment it's finished rather
   * than only once the whole message is done. `textIndex` is this text
   * part's ordinal among all text parts in the message (0-based), used as
   * `SourcePartMessage.textPartIndex` so the client can match a source to
   * the right paragraph even with several text parts. */
  const textBuffers = new Map<
    string,
    { buffer: string; completedUnits: number; textIndex: number }
  >();
  let nextTextIndex = 0;

  /** Matches a markdown list item marker (`-`/`*`/`+` or `1.`/`1)`) at the
   * start of a line. */
  const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;

  /** A single "source-attachable" chunk of a text part: either a whole
   * non-list paragraph, or one item of a list paragraph. `itemIndex` is only
   * set for list items, letting the client attach the source to that
   * specific `<li>` instead of the paragraph as a whole. */
  interface SourceUnit {
    paragraphIndex: number;
    itemIndex?: number;
  }

  /** Splits `buffer` into paragraphs (blank-line separated, as markdown
   * expects) and, for any paragraph that contains a markdown list, further
   * splits it into its individual items - so each list item can be
   * tracked/sourced independently instead of the list as a whole only
   * getting one source. A paragraph can be a bare list, or have an intro
   * line directly above the list with no blank line separating them (e.g.
   * "Some intro:\n- item one\n- item two") - the intro text (if any) becomes
   * its own unit alongside the item units, rather than the whole block being
   * treated as a single plain paragraph. */
  function splitIntoUnits(buffer: string): SourceUnit[] {
    const blocks = buffer.split(/\n\s*\n+/);
    const units: SourceUnit[] = [];
    blocks.forEach((block, paragraphIndex) => {
      const lines = block.split("\n");
      const firstItemLine = lines.findIndex((line) => LIST_ITEM_RE.test(line));
      if (firstItemLine === -1) {
        if (block.trim()) units.push({ paragraphIndex });
        return;
      }
      const introText = lines.slice(0, firstItemLine).join("\n").trim();
      if (introText) units.push({ paragraphIndex });
      let itemIndex = -1;
      for (const line of lines.slice(firstItemLine)) {
        if (LIST_ITEM_RE.test(line)) {
          itemIndex += 1;
          units.push({ paragraphIndex, itemIndex });
        }
      }
    });
    return units;
  }

  function countCompleteUnits(buffer: string, includeTrailing: boolean): number {
    const units = splitIntoUnits(buffer);
    return includeTrailing ? units.length : Math.max(units.length - 1, 0);
  }

  /** Emits a `data-source` chunk for every newly-completed unit (paragraph,
   * or list item within a paragraph) in the text part `textId` (buffered in
   * `textBuffers`). Every list item always gets a source; plain paragraphs
   * still skip a random ~third so not every one has a source. Pushes
   * directly onto `gen.chunks`/`emitter` - the caller's generic
   * `gen.chunks.push`/`appendChunk` at the bottom of the loop persists these
   * too since it runs after this. */
  function emitSourcesForCompletedUnits(textId: string, completedCount: number) {
    const state = textBuffers.get(textId);
    if (!state) return;
    const units = splitIntoUnits(state.buffer);
    while (state.completedUnits < completedCount) {
      const unit = units[state.completedUnits];
      state.completedUnits += 1;
      if (!unit) continue;
      // Plain paragraphs skip a random ~third so not every one has a source;
      // list items always get one since each is its own distinct claim.
      // if (unit.itemIndex === undefined && Math.random() < 0.5) continue;
      const source =
        mockSources[Math.floor(Math.random() * mockSources.length)];
      const sourceId = randomUUID();
      const data = {
        title: source.title,
        url: source.url,
        textPartIndex: state.textIndex,
        paragraphIndex: unit.paragraphIndex,
        ...(unit.itemIndex !== undefined ? { itemIndex: unit.itemIndex } : {}),
      };
      const sourceChunk: AppUIMessageChunk = {
        type: "data-source",
        id: sourceId,
        data,
      };
      sourceParts.push({ type: "data-source", id: sourceId, data });
      gen.chunks.push(sourceChunk);
      emitter.emit("chunk", sourceChunk);
    }
  }

  /** Appends `data-error`/`data-custom-json`/`data-source` parts (if any
   * were seen) to whatever ai-sdk's own state builder produced. Necessary
   * because these chunks are emitted manually onto the raw stream (see the
   * `for await` loop below) and never passed through `toUIMessageStream`'s
   * internal state builder, so they're missing from `onEnd`'s
   * `responseMessage.parts` - without this, they'd be visible in the live
   * stream but vanish once the message is persisted and reloaded from
   * history. */
  function finalizeParts(parts: AppUIMessage["parts"]): AppUIMessage["parts"] {
    let result = parts;
    for (const part of customJsonParts) {
      if (
        !result.some((p) => p.type === "data-custom-json" && p.id === part.id)
      ) {
        result = [...result, part];
      }
    }
    for (const part of sourceParts) {
      if (!result.some((p) => p.type === "data-source" && p.id === part.id)) {
        result = [...result, part];
      }
    }
    if (lastErrorText && !result.some((p) => p.type === "data-error")) {
      result = [
        ...result,
        { type: "data-error", data: { message: lastErrorText } },
      ];
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
        if (chunk.type === "text-start") {
          textBuffers.set(chunk.id, {
            buffer: "",
            completedUnits: 0,
            textIndex: nextTextIndex,
          });
          nextTextIndex += 1;
        }
        if (chunk.type === "text-delta") {
          const state = textBuffers.get(chunk.id);
          if (state) {
            state.buffer += chunk.delta;
            // Only units (paragraphs, or list items) followed by more content
            // are "complete" while streaming (the trailing, still-growing
            // one is excluded).
            emitSourcesForCompletedUnits(
              chunk.id,
              countCompleteUnits(state.buffer, false),
            );
          }
        }
        if (chunk.type === "text-end") {
          const state = textBuffers.get(chunk.id);
          if (state) {
            // The text is done, so the trailing unit is now complete too.
            emitSourcesForCompletedUnits(
              chunk.id,
              countCompleteUnits(state.buffer, true),
            );
          }
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
