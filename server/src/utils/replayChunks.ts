import { randomUUID } from "node:crypto";
import type { AppUIMessage, AppUIMessageChunk } from "../types.js";

type MessagePart = AppUIMessage["parts"][number];
type ToolOrDynamicToolPart = Extract<MessagePart, { toolCallId: string }>;

/**
 * Converts a single already-persisted tool/dynamic-tool part back into the
 * chunk sequence that would have produced it, ending in whatever state the
 * part is currently in. Needed by `partsToReplayChunks` (see its doc
 * comment) - tool parts are the only part type whose *later* states
 * (`output-available`, `approval-responded`, ...) can only be applied by
 * ai-sdk's client-side state builder on top of a part that already exists
 * (`getToolInvocation` throws if it doesn't - see `process-ui-message-stream`
 * in the `ai` package), so this always emits a `tool-input-available` chunk
 * first to create the part, then layers on the approval/output chunks
 * needed to reach the part's final state.
 */
function toolPartToReplayChunks(part: ToolOrDynamicToolPart): AppUIMessageChunk[] {
  const { toolCallId } = part;
  const toolName = part.type === "dynamic-tool" ? part.toolName : part.type.slice("tool-".length);
  const dynamic = part.type === "dynamic-tool" ? true : undefined;
  const chunks: AppUIMessageChunk[] = [];

  if (part.state === "input-streaming") {
    chunks.push({ type: "tool-input-start", toolCallId, toolName, dynamic } as AppUIMessageChunk);
    return chunks;
  }

  // Every state past "input-streaming" carries a final `input`, and (per
  // `updateToolPart`/`updateDynamicToolPart` in the `ai` package) a single
  // "tool-input-available" chunk both creates the part (if missing) and sets
  // that input - no need to also replay a preceding "tool-input-start".
  chunks.push({
    type: "tool-input-available",
    toolCallId,
    toolName,
    input: part.input,
    dynamic,
  } as AppUIMessageChunk);
  if (part.state === "input-available") return chunks;

  if (part.approval) {
    chunks.push({
      type: "tool-approval-request",
      toolCallId,
      approvalId: part.approval.id,
      reason: part.approval.requestReason,
      isAutomatic: part.approval.isAutomatic,
      signature: part.approval.signature,
    } as AppUIMessageChunk);
  }
  if (part.state === "approval-requested") return chunks;

  if (part.approval && "approved" in part.approval && part.approval.approved !== undefined) {
    chunks.push({
      type: "tool-approval-response",
      toolCallId,
      approvalId: part.approval.id,
      approved: part.approval.approved,
      reason: part.approval.reason,
    } as AppUIMessageChunk);
  }
  if (part.state === "output-denied") {
    chunks.push({ type: "tool-output-denied", toolCallId } as AppUIMessageChunk);
    return chunks;
  }
  if (part.state === "approval-responded") return chunks;

  if (part.state === "output-available") {
    chunks.push({
      type: "tool-output-available",
      toolCallId,
      output: part.output,
      preliminary: part.preliminary,
    } as AppUIMessageChunk);
  } else if (part.state === "output-error") {
    chunks.push({
      type: "tool-output-error",
      toolCallId,
      errorText: part.errorText,
    } as AppUIMessageChunk);
  }

  return chunks;
}

/**
 * Converts a message's already-persisted `parts` into an equivalent sequence
 * of `UIMessageChunk`s that, replayed through ai-sdk's client-side stream
 * processor (`processUIMessageStream`), reconstruct those exact parts.
 *
 * This exists to plug a gap in `GET /messages/resume`: `@ai-sdk/vue`'s
 * `chat.resumeStream()` always rebuilds the target message from scratch
 * (ai-sdk's `AbstractChat.triggerRequest` passes `lastMessage: undefined` to
 * `createStreamingUIMessageState` for the `resume-stream` trigger,
 * discarding whatever the client already has for that message id, e.g. from
 * a `GET /messages/list` history load), relying entirely on the resumed
 * stream to carry every chunk needed to rebuild it. That's fine for a
 * message's very first (and only) generation, but `/messages/continue`
 * starts a *new* generation reusing the same message id, and that new
 * generation's own chunk log only contains chunks for its *new* content -
 * upstream (`toUIMessageStream`) intentionally never re-emits chunks for
 * parts the model/tooling already produced in an earlier generation. Without
 * this, a client that reconnects mid-continuation would see the earlier
 * parts (e.g. a finished reasoning block, or the tool call being continued)
 * vanish from the message it just rebuilt. `runGeneration` prepends this
 * function's output to a continuation's chunk log so `/resume`'s replay is
 * self-contained.
 */
export function partsToReplayChunks(parts: AppUIMessage["parts"]): AppUIMessageChunk[] {
  const chunks: AppUIMessageChunk[] = [];

  for (const part of parts) {
    switch (part.type) {
      case "step-start":
        chunks.push({ type: "start-step" });
        break;

      case "text": {
        const id = randomUUID();
        chunks.push({ type: "text-start", id, providerMetadata: part.providerMetadata });
        if (part.text) chunks.push({ type: "text-delta", id, delta: part.text });
        chunks.push({ type: "text-end", id, providerMetadata: part.providerMetadata });
        break;
      }

      case "reasoning": {
        const id = part.id ?? randomUUID();
        chunks.push({ type: "reasoning-start", id, providerMetadata: part.providerMetadata });
        if (part.text) chunks.push({ type: "reasoning-delta", id, delta: part.text });
        chunks.push({ type: "reasoning-end", id, providerMetadata: part.providerMetadata });
        break;
      }

      case "data-error":
        chunks.push({ type: "data-error", id: part.id, data: part.data });
        break;

      case "data-custom-json":
        chunks.push({ type: "data-custom-json", id: part.id, data: part.data });
        break;

      default:
        if (part.type === "dynamic-tool" || part.type.startsWith("tool-")) {
          chunks.push(...toolPartToReplayChunks(part as ToolOrDynamicToolPart));
        }
        break;
    }
  }

  return chunks;
}
