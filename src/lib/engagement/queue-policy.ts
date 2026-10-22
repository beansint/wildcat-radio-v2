import type { EngagementControls, SubmissionBudget } from "./api";

export function groupStudioQueue<T extends { status: string }>(items: readonly T[]) {
  return {
    pending: items.filter(item => item.status === "PENDING"),
    upNext: items.filter(item => item.status === "QUEUED"),
    history: items.filter(item => item.status !== "PENDING" && item.status !== "QUEUED"),
  };
}

export function queueActionMessage(result: { status: string; receipt: boolean }) {
  const message = {
    QUEUED: "Added to Up Next.",
    READ: "Marked read on air.",
    HANDLED: "Marked handled. Removed from Up Next.",
    DECLINED: "Declined silently.",
  }[result.status] ?? "Submission updated.";
  return `${message}${result.receipt ? " Receipt sent." : ""}`;
}

export function listenerRestrictions(controls: EngagementControls | undefined, user?: { role?: string; class?: string }) {
  const none = { chat: null, submissions: null, voting: null };
  if (!controls || user?.role === "MODERATOR" || user?.role === "CUSTODIAN") return none;
  const guest = user?.class === "GUEST" && controls.staffGuestsDisabled
    ? "Guest participation is paused by station staff. Campus listeners can still participate."
    : null;
  return {
    chat: controls.staffChatFrozen ? "Listener chat is paused by station staff." : guest ?? (controls.chatPaused ? "Listener chat is paused by the booth for this episode." : null),
    submissions: controls.staffChatFrozen ? "New submissions are paused by station staff." : guest ?? (controls.submissionsPaused ? "New submissions are paused by the booth for this episode." : null),
    voting: guest,
  };
}

export function quotaMessage(budget: SubmissionBudget) {
  if (budget.limit === null) return "Staff have unlimited submissions. Requests, dedications, and questions share this episode's allowance.";
  return `${budget.remaining} of ${budget.limit} submissions left this episode, shared across requests, dedications, and questions. All submitted items count; completed or closed items do not restore your allowance.`;
}
