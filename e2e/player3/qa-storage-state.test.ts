import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { selectQaStorageState } from './qa-storage-state';

const separate = {
  PLAYER3_QA_STORAGE_STATE_CHROMIUM: '/private/qa-chromium.json',
  PLAYER3_QA_STORAGE_STATE_WEBKIT: '/private/qa-webkit.json',
};
describe('Player 3 per-browser synthetic QA authentication', () => {
  it('selects independently provisioned browser state files', () => {
    expect(selectQaStorageState('chromium', 'SYNTHETIC_TECHNICAL', separate))
      .toBe(resolve('/private/qa-chromium.json'));
    expect(selectQaStorageState('webkit', 'SYNTHETIC_TECHNICAL', separate))
      .toBe(resolve('/private/qa-webkit.json'));
  });
  it('rejects missing per-project state even when legacy global state is provided', () => {
    expect(() => selectQaStorageState('chromium', 'SYNTHETIC_TECHNICAL', {
      PLAYER3_QA_STORAGE_STATE: '/private/shared.json',
    })).toThrow('SYNTHETIC_QA_TWO_BROWSER_IDENTITIES_REQUIRED');
  });
  it('rejects the same state via distinct relative and absolute paths', () => {
    expect(() => selectQaStorageState('webkit', 'SYNTHETIC_TECHNICAL', {
      PLAYER3_QA_STORAGE_STATE_CHROMIUM: '/private/qa-state.json',
      PLAYER3_QA_STORAGE_STATE_WEBKIT: '/private/../private/qa-state.json',
    })).toThrow('SYNTHETIC_QA_SHARED_AUTH_STATE_FORBIDDEN');
  });
  it('rejects unknown browser projects and unknown content mode', () => {
    expect(() => selectQaStorageState('firefox', 'SYNTHETIC_TECHNICAL', separate))
      .toThrow('QA_BROWSER_PROJECT_UNKNOWN');
    expect(() => selectQaStorageState('chromium', 'other' as never, separate))
      .toThrow('QA_CONTENT_MODE');
  });
  it('retains the original reviewed-course legacy single-profile path', () => {
    expect(selectQaStorageState('webkit', 'AUTHORED_RC81', {
      PLAYER3_QA_STORAGE_STATE: '/private/legacy.json',
    })).toBe(resolve('/private/legacy.json'));
  });
});
