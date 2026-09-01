import { ref, watch } from "vue";
import { DEFAULT_SOURCE_PROBABILITY_PERCENT, REASONING_EFFORT_LEVELS, type ReasoningEffort } from "../types/chat";

const REQUIRE_APPROVAL_KEY = "ai-chat-prototype:requireApproval";
const REASONING_EFFORT_KEY = "ai-chat-prototype:reasoningEffort";
const SOURCE_PROBABILITY_PERCENT_KEY = "ai-chat-prototype:sourceProbabilityPercent";

function isReasoningEffort(value: string | null): value is ReasoningEffort {
  return value != null && (REASONING_EFFORT_LEVELS as readonly string[]).includes(value);
}

function parseSourceProbabilityPercent(value: string | null): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

/**
 * Persists the per-request generation settings the user controls from
 * `ChatInput` - "require approval for sensitive tools", the reasoning
 * (thinking) effort level, and the mock-source attachment probability - to
 * localStorage, so they survive reloads/new chats instead of resetting to
 * defaults every time.
 */
export function useChatSettings() {
  const storedApproval = localStorage.getItem(REQUIRE_APPROVAL_KEY);
  const requireApproval = ref(storedApproval === "true");

  const storedEffort = localStorage.getItem(REASONING_EFFORT_KEY);
  const reasoningEffort = ref<ReasoningEffort>(isReasoningEffort(storedEffort) ? storedEffort : "medium");

  const storedSourceProbabilityPercent = parseSourceProbabilityPercent(
    localStorage.getItem(SOURCE_PROBABILITY_PERCENT_KEY)
  );
  const sourceProbabilityPercent = ref(storedSourceProbabilityPercent ?? DEFAULT_SOURCE_PROBABILITY_PERCENT);

  watch(requireApproval, (value) => {
    localStorage.setItem(REQUIRE_APPROVAL_KEY, String(value));
  });

  watch(reasoningEffort, (value) => {
    localStorage.setItem(REASONING_EFFORT_KEY, value);
  });

  watch(sourceProbabilityPercent, (value) => {
    localStorage.setItem(SOURCE_PROBABILITY_PERCENT_KEY, String(value));
  });

  return { requireApproval, reasoningEffort, sourceProbabilityPercent };
}
