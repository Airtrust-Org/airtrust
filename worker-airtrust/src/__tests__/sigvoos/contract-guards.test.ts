import { strict as assert } from 'node:assert';
import {
  buildSigvoosEtapasSearchRequest,
  classifySigvoosHttpStatus,
  detectSigvoosApplicationError,
} from '../../lib/sigvoos/contract-guards';

describe('SIGVOOS documented search contract', () => {
  it('builds only the documented body and rejects a window over 90 days', () => {
    const request = buildSigvoosEtapasSearchRequest({ from: '2026-08-22', to: '2026-08-22', staffIds: [73, 91] });
    assert.deepEqual(request, { date_start: '22/08/2026', date_finish: '22/08/2026', staff_ids: [73, 91] });
    assert.equal('page' in request || 'page_size' in request || 'limit' in request, false);
    assert.throws(() => buildSigvoosEtapasSearchRequest({ from: '2026-01-01', to: '2026-04-01' }));
  });

  it('keeps HTTP-200 application errors and 503 fail-closed', () => {
    assert.equal(detectSigvoosApplicationError({ status: 'error', data: '' })?.code, 'SIGVOOS_APPLICATION_ERROR');
    assert.equal(detectSigvoosApplicationError({ permission_denied: 1 })?.code, 'SIGVOOS_PERMISSION_DENIED');
    assert.equal(classifySigvoosHttpStatus(503), 'SIGVOOS_UPSTREAM_UNAVAILABLE');
  });
});
