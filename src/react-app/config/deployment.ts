export const DEPLOYMENT_VERSION =
  typeof __APP_BUILD_VERSION__ !== 'undefined' ? __APP_BUILD_VERSION__ : '0.0.0-dev';

const BUILD_VERSION_META_SELECTOR = 'meta[name="build-version"]';
const BUILD_VERSION_PLACEHOLDERS = new Set(['', '__BUILD_VERSION__', 'unknown', 'null', 'undefined']);

function sanitizeBuildVersion(value: string | null | undefined): string | null {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (BUILD_VERSION_PLACEHOLDERS.has(normalized)) return null;
  return normalized;
}

export function readServedFrontendVersionFromDocument(
  doc: Pick<Document, 'querySelector'> = document,
): string | null {
  try {
    const meta = doc.querySelector(BUILD_VERSION_META_SELECTOR) as HTMLMetaElement | null;
    return sanitizeBuildVersion(meta?.content);
  } catch {
    return null;
  }
}

export function extractBuildVersionFromHtml(html: string): string | null {
  const match = html.match(
    /<meta\s+name=["']build-version["']\s+content=["']([^"']+)["']/i,
  );
  return sanitizeBuildVersion(match?.[1] || null);
}

export async function fetchServedFrontendVersion(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<string | null> {
  const response = await fetchImpl(`/index.html?v=${now()}`, {
    cache: 'no-store',
    headers: {
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  return extractBuildVersionFromHtml(html);
}
