import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { selectQaStorageState,selectQaApiBearerToken } from './qa-storage-state';

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

describe('Player3 QA read-only API must use the matching learner, not a shared admin bearer',()=>{
  const tokens={
    PLAYER3_QA_READONLY_BEARER_TOKEN_CHROMIUM:'qa-chromium-private-token',
    PLAYER3_QA_READONLY_BEARER_TOKEN_WEBKIT:'qa-webkit-private-token',
  };
  it('uses the exact independent private token for each browser',()=>{
    expect(selectQaApiBearerToken('chromium','SYNTHETIC_TECHNICAL',tokens))
      .toBe(tokens.PLAYER3_QA_READONLY_BEARER_TOKEN_CHROMIUM);
    expect(selectQaApiBearerToken('webkit','SYNTHETIC_TECHNICAL',tokens))
      .toBe(tokens.PLAYER3_QA_READONLY_BEARER_TOKEN_WEBKIT);
  });
  it('does not fall back to global admin or another browser identity',()=>{
    const shared={PLAYER3_QA_READONLY_BEARER_TOKEN:'admin-is-not-learner'};
    expect(()=>selectQaApiBearerToken('chromium','SYNTHETIC_TECHNICAL',shared))
      .toThrow('SYNTHETIC_QA_TWO_BEARER_TOKENS_REQUIRED');
    expect(()=>selectQaApiBearerToken('webkit','SYNTHETIC_TECHNICAL',{
      ...tokens,PLAYER3_QA_READONLY_BEARER_TOKEN_WEBKIT:tokens.PLAYER3_QA_READONLY_BEARER_TOKEN_CHROMIUM,
    })).toThrow('SYNTHETIC_QA_SHARED_BEARER_FORBIDDEN');
  });
  it('allows legacy reviewed QA bearer contract without widening ownership',()=>{
    expect(selectQaApiBearerToken('chromium','AUTHORED_RC81',{
      PLAYER3_QA_READONLY_BEARER_TOKEN:'legacy-reviewed-token',
    })).toBe('legacy-reviewed-token');
    expect(()=>selectQaApiBearerToken('chromium','AUTHORED_RC81',{}))
      .toThrow('AUTHORIZED_LEARNER_READONLY_BEARER');
  });
});
