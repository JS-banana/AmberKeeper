const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export async function discoverSiteIcon(
  url: string,
  options?: { fetchImpl?: typeof fetch }
): Promise<string | null> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const baseUrl = parseUrl(url);
  if (!baseUrl) {
    return null;
  }

  try {
    const response = await fetchImpl(baseUrl.toString(), {
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
      },
    });
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    return extractSiteIconUrl(baseUrl, html);
  } catch {
    return null;
  }
}

export function extractSiteIconUrl(baseUrl: URL, html: string): string | null {
  const linkTagMatches = html.match(/<link\b[^>]*>/gi) ?? [];

  for (const tag of linkTagMatches) {
    const relValue = getAttributeValue(tag, 'rel')?.toLowerCase();
    if (!relValue?.includes('icon')) {
      continue;
    }

    const href = getAttributeValue(tag, 'href')?.trim();
    if (!href || href.startsWith('data:')) {
      continue;
    }

    try {
      return new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
  }

  return null;
}

function getAttributeValue(tag: string, attribute: string): string | null {
  const quoted = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, 'i').exec(tag);
  if (quoted?.[1]) {
    return quoted[1];
  }

  const unquoted = new RegExp(`${attribute}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag);
  return unquoted?.[1] ?? null;
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
