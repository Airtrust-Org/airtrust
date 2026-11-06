/** Fail-closed SIGVOOS search paging, isolated from the FRMS import service. */
export interface SigvoosPaginationDependencies {
  formatBrDateFromIso(value: string): string;
  getArrayPayload(value: unknown): Record<string, unknown>[];
  shouldStopSigvoosPaging(page: number, length: number, pageSize: number): boolean;
}

/**
 * Read every SIGVOOS page before mutating FRMS data. A full-sized last page
 * does not prove the request was exhausted; a repeated full page indicates
 * the upstream endpoint ignored paging, not another set of flight records.
 * In both cases fail closed instead of advancing the durable watermark.
 */
export async function fetchCompleteSigvoosWindowGuard(
  client: { postSearch(endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> },
  window: { from: string; to: string },
  pageSize: number,
  maxPages: number,
  dependencies: SigvoosPaginationDependencies,
): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  const dateStart = dependencies.formatBrDateFromIso(window.from);
  const dateFinish = dependencies.formatBrDateFromIso(window.to);
  let previousPageSignature: string | null = null;

  for (let page = 1; page <= maxPages; page++) {
    const payload = await client.postSearch('/relatorios/voos/tripulantes/etapas/pesquisa', {
      date_start: dateStart,
      date_finish: dateFinish,
      page,
      page_size: pageSize,
      limit: pageSize,
    });
    const payloadStatus = payload.status;
    if (
      payload.success === false ||
      payloadStatus === false ||
      (typeof payloadStatus === 'number' && payloadStatus >= 400) ||
      (typeof payloadStatus === 'string' &&
        ['ERRO', 'ERROR', 'FALHA', 'FAILED'].includes(payloadStatus.trim().toUpperCase()))
    ) {
      throw new Error('SIGVOOS_UPSTREAM_SEARCH_REJECTED');
    }
    const recordsEnvelope = payload.data ?? payload;
    if (!isRecognizedSigvoosRecordArray(recordsEnvelope)) {
      throw new Error('SIGVOOS_UNEXPECTED_RESPONSE_SHAPE');
    }
    const pageItems = dependencies.getArrayPayload(recordsEnvelope);

    if (page > 1 && pageItems.length > 0) {
      const currentPageSignature = JSON.stringify(pageItems);
      if (previousPageSignature === currentPageSignature) {
        throw new Error('SIGVOOS_PAGINATION_STALLED');
      }
    }

    records.push(...pageItems);
    if (dependencies.shouldStopSigvoosPaging(page, pageItems.length, pageSize)) {
      return records;
    }
    previousPageSignature = JSON.stringify(pageItems);
  }

  throw new Error('SIGVOOS_PAGINATION_INCOMPLETE');
}

/**
 * An upstream error document or a changed response envelope must never be
 * mistaken for a valid empty flight list. Empty arrays are legitimate; absent
 * or malformed arrays are not evidence that the day had zero flights.
 */
function isRecognizedSigvoosRecordArray(value: unknown): boolean {
  const isRecords = (candidate: unknown): boolean =>
    Array.isArray(candidate) &&
    candidate.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item));
  if (isRecords(value)) return true;
  if (!value || typeof value !== 'object') return false;

  const object = value as Record<string, unknown>;
  if (['main', 'data', 'results', 'items', 'rows', 'payload'].some((key) => isRecords(object[key]))) {
    return true;
  }
  const nestedPaths = [
    ['data', 'main'],
    ['data', 'items'],
    ['data', 'results'],
    ['payload', 'main'],
    ['payload', 'items'],
    ['result', 'main'],
  ] as const;
  return nestedPaths.some(([parent, child]) => {
    const parentValue = object[parent];
    return parentValue !== null && typeof parentValue === 'object' &&
      isRecords((parentValue as Record<string, unknown>)[child]);
  });
}
