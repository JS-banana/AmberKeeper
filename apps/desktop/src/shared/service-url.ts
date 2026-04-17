export function normalizeServiceUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

export function buildServiceDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin;
  } catch {
    return url;
  }
}
