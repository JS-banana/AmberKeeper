export function summarizeDomSnapshotMetadata(detail: string): string | null {
  // Provider snapshots share a JSON envelope, but the samples inside it can contain any role.
  let snapshot: {
    url?: unknown;
    messages?: unknown;
    texts?: unknown;
    debug?: { providerId?: unknown; selectorCounts?: unknown };
  } | null;
  try {
    snapshot = JSON.parse(detail);
  } catch {
    return null;
  }

  const url = typeof snapshot?.url === 'string' ? snapshot.url : undefined;
  const samples = snapshot?.messages ?? snapshot?.texts;
  const sampledMessageCount = Array.isArray(samples) ? samples.length : undefined;
  const providerId = typeof snapshot?.debug?.providerId === 'string' ? snapshot.debug.providerId : undefined;
  const counts = snapshot?.debug?.selectorCounts;
  const selectorCounts = counts && typeof counts === 'object' && !Array.isArray(counts)
    ? Object.fromEntries(Object.entries(counts).filter(([, count]) => Number.isInteger(count)))
    : undefined;

  if (url === undefined && sampledMessageCount === undefined && providerId === undefined && !selectorCounts) {
    return null;
  }
  return JSON.stringify({ url, sampledMessageCount, providerId, selectorCounts });
}
