import { describe, expect, it } from 'vitest';
import { validScormAssetRefreshRequest } from './scormAssetSessionDeadline';

describe('SCORM asset session renewal parent authorization', () => {
  const parent = { postMessage() {} } as unknown as MessageEventSource;
  const other = { postMessage() {} } as unknown as MessageEventSource;
  const valid = { type: 'lms:asset-session-refresh-request', matriculaId: 42, requestId: 3 };
  const base = { data: valid, source: parent, expectedSource: parent, origin: 'https://api.airtrust.online', expectedOrigin: 'https://api.airtrust.online', matriculaId: 42, reviewMode: false };
  it('accepts only same-frame same-origin same-enrollment request with integer nonce', () => {
    expect(validScormAssetRefreshRequest(base)).toBe(3);
    expect(validScormAssetRefreshRequest({ ...base, origin: 'https://attacker.test' })).toBeNull();
    expect(validScormAssetRefreshRequest({ ...base, source: other })).toBeNull();
    expect(validScormAssetRefreshRequest({ ...base, source: null })).toBeNull();
    expect(validScormAssetRefreshRequest({ ...base, data: { ...valid, matriculaId: 43 } })).toBeNull();
    expect(validScormAssetRefreshRequest({ ...base, data: { ...valid, requestId: 0 } })).toBeNull();
    expect(validScormAssetRefreshRequest({ ...base, data: { ...valid, requestId: 1.4 } })).toBeNull();
    expect(validScormAssetRefreshRequest({ ...base, reviewMode: true })).toBeNull();
  });
});
