/**
 * Bounded, read-only FRMS snapshot transport. A stalled browser GET must never
 * leave the operational panel on an indefinite spinner. Exactly one replay is
 * permitted for a network failure/timeout; HTTP errors and auth failures are
 * returned to the caller without replaying or elevating permissions.
 */
export type FrmsSnapshotFetcher = (url: string, options: RequestInit) => Promise<Response>;

export async function fetchFrmsSnapshotBounded<T>(
  url: string,
  fetcher: FrmsSnapshotFetcher,
  timeoutMs = 12_000,
): Promise<{ response: Response; payload: T }> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('FRMS_SNAPSHOT_TIMEOUT_INVALID');
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new Error('FRMS_SNAPSHOT_TIMEOUT'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        (async () => {
          const response = await fetcher(url, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
          });
          return { response, payload: (await response.json()) as T };
        })(),
        deadline,
      ]);
    } catch (error) {
      const transportFailure =
        (error instanceof Error &&
          (error.message === 'FRMS_SNAPSHOT_TIMEOUT' || error.name === 'AbortError')) ||
        error instanceof TypeError;
      if (attempt === 0 && transportFailure) continue;
      throw error;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  }
  throw new Error('FRMS_SNAPSHOT_UNAVAILABLE');
}
