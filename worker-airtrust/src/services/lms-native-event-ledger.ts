/**
 * Bounded, keyset-paginated Native V1 ledger read.
 *
 * Every SQL request fetches at most 500 records. A complete ledger can
 * contain at most 10,000 monotonically numbered events; never silently
 * truncate it or infer completion from a partial page.
 */
export type NativeLedgerRow = {
  event_id: string;
  sequencia: number;
  unidade_id: string;
  payload_sha256?: string;
};

export class NativeLedgerReadError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NativeLedgerReadError';
  }
}

const PAGE_SIZE = 500;
export const MAX_NATIVE_LEDGER_EVENTS = 10000;

const PAGE_SQL = [
  'SELECT event_id, sequencia, unidade_id, payload_sha256',
  'FROM lms_native_eventos',
  'WHERE vinculo_id=? AND sequencia>?',
  'ORDER BY sequencia ASC LIMIT 500',
].join(' ');

export async function readNativeEventLedger(
  db: D1Database,
  bindingId: number,
): Promise<NativeLedgerRow[]> {
  if (!Number.isSafeInteger(bindingId) || bindingId <= 0) {
    throw new NativeLedgerReadError('NATIVE_LEDGER_INVALID_BINDING');
  }
  const ledger: NativeLedgerRow[] = [];
  let cursor = 0;
  for (let page = 0; page <= MAX_NATIVE_LEDGER_EVENTS / PAGE_SIZE; page++) {
    const result = await db.prepare(PAGE_SQL).bind(bindingId, cursor).all<NativeLedgerRow>();
    if (!result.success || !Array.isArray(result.results) ||
        result.results.length > PAGE_SIZE) {
      throw new NativeLedgerReadError('NATIVE_LEDGER_READ_UNAVAILABLE');
    }
    for (const row of result.results) {
      // Sequence consistency is checked before exposing a resume point,
      // computing readiness or accepting a subsequent checkpoint.
      if (!row || !Number.isSafeInteger(row.sequencia) ||
          row.sequencia !== ledger.length + 1 ||
          typeof row.event_id !== 'string' || typeof row.unidade_id !== 'string') {
        throw new NativeLedgerReadError('NATIVE_LEDGER_SEQUENCE_INVALID');
      }
      ledger.push(row);
      if (ledger.length > MAX_NATIVE_LEDGER_EVENTS) {
        throw new NativeLedgerReadError('NATIVE_LEDGER_CAP_EXCEEDED');
      }
    }
    if (result.results.length < PAGE_SIZE) return ledger;
    cursor = ledger.at(-1)!.sequencia;
  }
  throw new NativeLedgerReadError('NATIVE_LEDGER_CAP_EXCEEDED');
}
