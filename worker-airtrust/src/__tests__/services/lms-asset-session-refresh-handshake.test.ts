import { describe, expect, it, vi } from 'vitest';
import { buildScormAssetSessionRefreshScript, buildScormExpiredSessionRetryBranchScript } from '../../services/lms-scorm-wrapper-runtime';

type Message = { source: unknown; origin: string; data: Record<string, unknown> };
function handshake(options: { preview?: boolean; review?: boolean } = {}) {
  let listener: ((event: Message) => void) | undefined;
  const sent: Record<string, unknown>[] = [];
  const parent = { postMessage: (msg: Record<string, unknown>) => sent.push(msg) };
  const frame = {
    parent,
    setTimeout,
    clearTimeout,
    addEventListener: (_type: string, handler: typeof listener) => { listener = handler; },
    removeEventListener: (_type: string, handler: typeof listener) => { if (listener === handler) listener = undefined; },
  };
  const setup = new Function('window', `
    var PARENT_ORIGIN = 'https://airtrust.online';
    var PREVIEW_MODE = ${options.preview === true};
    var REVIEW_MODE = ${options.review === true};
    var MATRICULA_ID = 42;
    ${buildScormAssetSessionRefreshScript()}
    return refreshExpiredAssetSession;
  `) as (window: typeof frame) => () => Promise<boolean>;
  return { refresh: setup(frame), sent, parent, emit: (m: Message) => listener?.(m) };
}
function retry(params: { code?: string; status?: number; attempt?: number; renewed?: boolean; malformed?: boolean }) {
  const data = { cmi_json: '{"cmi.core.lesson_status":"completed"}', completion_candidate: true };
  const commit = vi.fn().mockResolvedValue('saved');
  const rejected = vi.fn();
  const refresh = vi.fn().mockResolvedValue(params.renewed ?? true);
  const response = { clone: () => ({ json: async () => {
    if (params.malformed) throw Error('invalid json');
    return { code: params.code ?? 'ASSET_SESSION_INVALID' };
  } }) };
  const run = new Function('response', 'status', 'currentAttempt', 'data', 'eventType', 'handleNonOkResponse', 'setStatus', 'refreshExpiredAssetSession', 'commit', `${buildScormExpiredSessionRetryBranchScript()}\nreturn 'untouched';`);
  return { result: run(response, params.status ?? 409, params.attempt ?? 0, data, 'SCORM_USER_FINALIZE', rejected, vi.fn(), refresh, commit), data, commit, rejected, refresh };
}
describe('SCORM scoped asset capability recovery', () => {
  it('accepts only matching origin, parent source, enrollment and request nonce', async () => {
    const h = handshake();
    let result: boolean | undefined;
    const pending = h.refresh().then(v => { result = v; });
    const requestId = h.sent[0]?.requestId;
    expect(h.sent).toEqual([{ type: 'lms:asset-session-refresh-request', matriculaId: 42, requestId: 1 }]);
    const valid = { type: 'lms:asset-session-refresh-response', matriculaId: 42, requestId, ok: true };
    h.emit({ source: {}, origin: 'https://airtrust.online', data: valid });
    h.emit({ source: h.parent, origin: 'https://evil.test', data: valid });
    h.emit({ source: h.parent, origin: 'https://airtrust.online', data: { ...valid, matriculaId: 43 } });
    h.emit({ source: h.parent, origin: 'https://airtrust.online', data: { ...valid, requestId: 999 } });
    await Promise.resolve();
    expect(result).toBeUndefined();
    h.emit({ source: h.parent, origin: 'https://airtrust.online', data: valid });
    await pending;
    expect(result).toBe(true);
  });
  it('rejects negative acknowledgement, expires without acknowledgement, and blocks preview', async () => {
    const h = handshake();
    const p = h.refresh();
    h.emit({ source: h.parent, origin: 'https://airtrust.online', data: { type: 'lms:asset-session-refresh-response', matriculaId: 42, requestId: 1, ok: false } });
    expect(await p).toBe(false);
    vi.useFakeTimers();
    try {
      const timed = handshake();
      const promise = timed.refresh();
      await vi.advanceTimersByTimeAsync(9001);
      expect(await promise).toBe(false);
    } finally { vi.useRealTimers(); }
    expect(await handshake({ preview: true }).refresh()).toBe(false);
    expect(await handshake({ review: true }).refresh()).toBe(false);
  });
  it('retries only once with original payload on successful renewal', async () => {
    const r = retry({});
    expect(await r.result).toBe('saved');
    expect(r.refresh).toHaveBeenCalledTimes(1);
    expect(r.commit).toHaveBeenCalledTimes(1);
    expect(r.commit).toHaveBeenCalledWith(r.data, 1, 'SCORM_USER_FINALIZE');
  });
  it('does not replay when renewal fails or response is unrelated, malformed or already retried', async () => {
    for (const options of [{ renewed: false }, { code: 'LMS_SCORM_CYCLE_MISMATCH' }, { status: 403 }, { attempt: 1 }, { malformed: true }]) {
      const r = retry(options);
      await r.result;
      expect(r.commit).not.toHaveBeenCalled();
    }
  });
});
