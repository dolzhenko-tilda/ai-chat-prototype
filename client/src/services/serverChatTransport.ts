import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import type { ChatRequestOptions, ChatTransport, UIMessageChunk } from "ai";
import { api } from "./api";
import type { AppUIMessage, ReasoningEffort } from "../types/chat";

export interface ServerChatTransportOptions {
  baseUrl: string;
  /**
   * Returns the chatId that should actually be used for every request,
   * overriding whatever (possibly stale/empty) `chatId` `@ai-sdk/vue`'s
   * `useChat` itself passes in. Necessary because `useChat`'s internal chat
   * instance freezes its `id` at construction time and reuses that same
   * instance (and thus the same frozen id) for a whole exchange, including
   * any automatic tool-call/approval continuations - so if a message is
   * first sent with no `chatId` (new chat, see `useChatId.ts`), the server
   * mints one, but that instance never learns it. See `useAppChat.ts`'s
   * `effectiveChatId`, which this getter is wired to.
   */
  getChatId: () => string;
  /** Whether tool calls to sensitive server tools should require user approval. */
  requireApproval: () => boolean;
  /** Reasoning effort level to send with each request (see `ReasoningEffort`). */
  reasoningEffort: () => ReasoningEffort;
}

function extractText(message: AppUIMessage): string {
  return message.parts
    .filter((p): p is Extract<AppUIMessage["parts"][number], { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

/**
 * Picks the tool part `/continue` should forward as `toolPart` (see
 * `ai-chat-contracts.ts`'s `ContinueMessageRequest`, which - unlike our
 * previous ad-hoc `/continue` endpoint - only carries a single tool part,
 * not the whole message). We don't track which part changed since the last
 * sync, so this picks the last tool/dynamic-tool part in the message; this
 * only loses information if the model calls more than one tool in the same
 * step, which doesn't happen with this demo's tool set.
 */
function findToolPartToContinue(message: AppUIMessage): AppUIMessage["parts"][number] | undefined {
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];
    if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) return part;
  }
  return undefined;
}

/**
 * Talks to the ai-chat-prototype server's REST/SSE API (see
 * `ai-chat-contracts.ts` for the exact endpoint contract). Implements
 * ai-sdk's `ChatTransport` directly (rather than extending
 * `DefaultChatTransport`) because our endpoints don't follow the
 * single-POST-to-one-URL convention: submitting a new user message,
 * regenerating an assistant message, and continuing after a client-side tool
 * result / tool-approval response are three different routes, and the
 * client only ever sends the single new/updated message (never the whole
 * history) as required by the spec.
 */
export class ServerChatTransport implements ChatTransport<AppUIMessage> {
  private options: ServerChatTransportOptions;

  constructor(options: ServerChatTransportOptions) {
    this.options = options;
  }

  private parseStream(body: ReadableStream<Uint8Array>): ReadableStream<UIMessageChunk> {
    return parseJsonEventStream({ stream: body, schema: uiMessageChunkSchema }).pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          if (!chunk.success) throw chunk.error;
          controller.enqueue(chunk.value);
        },
      })
    );
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
    abortSignal: AbortSignal | undefined
  ): Promise<ReadableStream<UIMessageChunk>> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: api.getToken(), ...body }),
      signal: abortSignal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Request to ${path} failed (${res.status}): ${text || res.statusText}`);
    }
    if (!res.body) throw new Error("Response body is empty");
    return this.parseStream(res.body);
  }

  async sendMessages({
    trigger,
    chatId,
    messageId,
    messages,
    abortSignal,
  }: Parameters<ChatTransport<AppUIMessage>["sendMessages"]>[0] & ChatRequestOptions): Promise<
    ReadableStream<UIMessageChunk>
  > {
    const requireApproval = this.options.requireApproval();
    const reasoningEffort = this.options.reasoningEffort();
    // Prefer our own authoritative getter over ai-sdk's `chatId` (see
    // `getChatId`'s doc comment) - falls back to it only as a safety net.
    const effectiveChatId = this.options.getChatId() || chatId;

    if (trigger === "regenerate-message") {
      const targetId = messageId ?? messages[messages.length - 1]?.id;
      if (!targetId) throw new Error("regenerate-message requires a messageId");
      return this.post(
        "/api/v1/messages/regenerate",
        { chatId: effectiveChatId, messageId: targetId, requireApproval, reasoningEffort },
        abortSignal
      );
    }

    // trigger === "submit-message"
    const last = messages[messages.length - 1];
    if (!last) throw new Error("No message to send");

    if (last.role === "assistant") {
      // Continuation: the AI SDK re-submits after a client-side tool result
      // (addToolOutput) or a tool-approval response (addToolApprovalResponse)
      // was recorded on the last assistant message. Forward just the
      // relevant tool part to /continue so the server can merge it into the
      // stored message and feed the result back to the LLM.
      const toolPart = findToolPartToContinue(last);
      if (!toolPart) throw new Error("No tool part to continue with");
      return this.post(
        "/api/v1/messages/continue",
        { chatId: effectiveChatId, messageId: last.id, toolPart, requireApproval, reasoningEffort },
        abortSignal
      );
    }

    // Normal case: a brand new user message. Per spec, only this single
    // message is sent (as plain text) - never the full history (server
    // keeps it in SQLite). `context` (e.g. `pageUrl`) rides along as
    // `metadata` per `ai-chat-contracts.ts`'s `CreateMessageRequest`.
    // `effectiveChatId` is falsy only for the very first message of a brand
    // new chat (see `useChatId.ts`'s `newChat()`) - it's omitted rather than
    // sent as `""` so the server mints one itself; only the server is
    // allowed to generate a chatId.
    return this.post(
      "/api/v1/messages/create",
      {
        ...(effectiveChatId ? { chatId: effectiveChatId } : {}),
        message: extractText(last),
        requireApproval,
        reasoningEffort,
        ...(last.metadata?.context ? { metadata: { context: last.metadata.context } } : {}),
      },
      abortSignal
    );
  }

  async reconnectToStream({
    chatId,
    abortSignal,
  }: Parameters<ChatTransport<AppUIMessage>["reconnectToStream"]>[0] & ChatRequestOptions): Promise<
    ReadableStream<UIMessageChunk> | null
  > {
    const effectiveChatId = this.options.getChatId() || chatId;
    const params = new URLSearchParams({ token: api.getToken() ?? "", chatId: effectiveChatId });
    const res = await fetch(`${this.options.baseUrl}/api/v1/messages/resume?${params}`, {
      method: "GET",
      signal: abortSignal,
    });
    if (res.status === 204) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Resume failed (${res.status}): ${text || res.statusText}`);
    }
    if (!res.body) return null;
    return this.parseStream(res.body);
  }
}
