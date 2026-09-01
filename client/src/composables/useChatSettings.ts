import { ref, watch } from "vue";
import { REASONING_EFFORT_LEVELS, type ReasoningEffort } from "../types/chat";

const REQUIRE_APPROVAL_KEY = "ai-chat-prototype:requireApproval";
const REASONING_EFFORT_KEY = "ai-chat-prototype:reasoningEffort";

function isReasoningEffort(value: string | null): value is ReasoningEffort {
  return value != null && (REASONING_EFFORT_LEVELS as readonly string[]).includes(value);
}

/**
 * Persists the two per-request generation settings the user controls from
 * `ChatInput` - "require approval for sensitive tools" and the reasoning
 * (thinking) effort level - to localStorage, so they survive reloads/new
 * chats instead of resetting to defaults every time.
 */
export function useChatSettings() {
  const storedApproval = localStorage.getItem(REQUIRE_APPROVAL_KEY);
  const requireApproval = ref(storedApproval === "true");

  const storedEffort = localStorage.getItem(REASONING_EFFORT_KEY);
  const reasoningEffort = ref<ReasoningEffort>(isReasoningEffort(storedEffort) ? storedEffort : "medium");

  watch(requireApproval, (value) => {
    localStorage.setItem(REQUIRE_APPROVAL_KEY, String(value));
  });

  watch(reasoningEffort, (value) => {
    localStorage.setItem(REASONING_EFFORT_KEY, value);
  });

  return { requireApproval, reasoningEffort };
}
