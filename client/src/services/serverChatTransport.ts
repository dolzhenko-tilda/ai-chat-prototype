import { parseJsonEventStream, uiMessageChunkSchema } from "ai";
import type { ChatRequestOptions, ChatTransport, UIMessageChunk } from "ai";
import type { AppUIMessage, ReasoningEffort } from "../types/chat";

export interface ServerChatTransportOptions {
  baseUrl: string;
  /** Whether tool calls to sensitive server tools should require user approval. */
  requireApproval: () => boolean;
  /** Reasoning effort level to send with each request (see `ReasoningEffort`). */
  reasoningEffort: () => ReasoningEffort;
}

/**
 * Talks to the ai-chat-prototype server's REST/SSE API (see server/README.md
 * for the exact endpoint contract). Implements ai-sdk's `ChatTransport`
 * directly (rather than extending `DefaultChatTransport`) because our
 * endpoints don't follow the single-POST-to-one-URL convention: submitting a
 * new user message, regenerating an assistant message, and continuing after
 * a client-side tool result / tool-approval response are three different
 * routes, and the client only ever sends the single new/updated message
 * (never the whole history) as required by the spec.
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
    body: unknown,
    abortSignal: AbortSignal | undefined
  ): Promise<ReadableStream<UIMessageChunk>> {
    const res = await fetch(`${this.options.baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

    if (trigger === "regenerate-message") {
      const targetId = messageId ?? messages[messages.length - 1]?.id;
      if (!targetId) throw new Error("regenerate-message requires a messageId");
      return this.post(
        `/api/chats/${chatId}/messages/${targetId}/regenerate`,
        { requireApproval, reasoningEffort },
        abortSignal
      );
    }

    // trigger === "submit-message"
    const last = messages[messages.length - 1];
    if (!last) throw new Error("No message to send");

    if (last.role === "assistant") {
      // Continuation: the AI SDK re-submits after a client-side tool result
      // (addToolOutput) or a tool-approval response (addToolApprovalResponse)
      // was recorded on the last assistant message. Forward just that
      // updated message to /continue so the server can feed it back to the LLM.
      return this.post(
        `/api/chats/${chatId}/messages/${last.id}/continue`,
        { message: last, requireApproval, reasoningEffort },
        abortSignal
      );
    }

    // Normal case: a brand new user message. Per spec, only this single
    // message is sent - never the full history (server keeps it in SQLite).
    return this.post(
      `/api/chats/${chatId}/messages`,
      { message: last, requireApproval, reasoningEffort },
      abortSignal
    );
  }

  async reconnectToStream({
    chatId,
    abortSignal,
  }: Parameters<ChatTransport<AppUIMessage>["reconnectToStream"]>[0] & ChatRequestOptions): Promise<
    ReadableStream<UIMessageChunk> | null
  > {
    const res = await fetch(`${this.options.baseUrl}/api/chats/${chatId}/resume`, {
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
