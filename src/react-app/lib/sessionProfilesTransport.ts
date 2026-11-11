/**
 * Bound the read-only, server-authoritative session-profile lookup after login.
 * A stalled request must not hold login forever. Replaying a GET is safe only
 * for transport timeout/failure; HTTP responses (including 401/403/503) are
 * returned untouched and never converted into permissions or profile choices.
 */
export type SessionProfilesFetcher = (url: string, options: RequestInit) => Promise<Response>;

export async function fetchSessionProfilesBounded(
  url: string,
  fetcher: SessionProfilesFetcher,
  timeoutMs = 12_000,
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('SESSION_PROFILES_TIMEOUT_INVALID');
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error('SESSION_PROFILES_TIMEOUT'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        fetcher(url, { method: 'GET', cache: 'no-store', signal: controller.signal }),
        deadline,
      ]);
    } catch (error) {
      const transportError = error instanceof Error &&
        (error.message === 'SESSION_PROFILES_TIMEOUT' || error.name === 'AbortError' || error instanceof TypeError);
      if (attempt === 0 && transportError) continue;
      throw error;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  throw new Error('SESSION_PROFILES_UNAVAILABLE');
}
