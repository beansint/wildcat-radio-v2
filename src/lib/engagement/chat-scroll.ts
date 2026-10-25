export function isChatAtBottom(metrics: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= 48;
}

export function unreadMessageCount(ids: readonly string[], seen: ReadonlySet<string>) {
  return ids.filter(id => !seen.has(id)).length;
}
