import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  examinerSessionCandidateDates,
  createSimpleSessionInAvailableDate,
  sanitizeSimpleSessionCreate,
} from '../staging/smoke-examiner-training.mjs';

describe('smoke-examiner-training: B_simple_session hardening', () => {
  it('builds deterministic future candidate dates for the same run attempt', () => {
    const now = new Date('2026-09-14T00:00:00Z');
    const a = examinerSessionCandidateDates({ runId: '12345', runAttempt: '2', now, count: 4 });
    const b = examinerSessionCandidateDates({ runId: '12345', runAttempt: '2', now, count: 4 });
    assert.deepEqual(a, b);
    assert.equal(a.length, 4);
    assert.ok(a.every((date) => date > '2026-09-20'));
  });

  it('retries only explicit SCHEDULE_CONFLICT 409 and selects the next date', async () => {
    const calls = [];
    const result = await createSimpleSessionInAvailableDate({
      candidates: ['2026-10-01', '2026-10-02'],
      createSession: async (date) => {
        calls.push(date);
        return date === '2026-10-01'
          ? { status: 409, json: { code: 'SCHEDULE_CONFLICT', error: 'Conflito de agendamento: sessão 98765' } }
          : { status: 201, json: { data: { sessao_id: 77 } } };
      },
    });
    assert.deepEqual(calls, ['2026-10-01', '2026-10-02']);
    assert.equal(result.selectedDate, '2026-10-02');
    assert.equal(result.sessionId, 77);
    assert.equal(result.attempts[0].discardReason, 'schedule_conflict');
    assert.equal(result.attempts[0].message.includes('98765'), false);
  });

  it('fails closed on qualification integration 409 because the primary session may already exist', async () => {
    let calls = 0;
    await assert.rejects(
      () => createSimpleSessionInAvailableDate({
        candidates: ['2026-10-01', '2026-10-02'],
        createSession: async () => {
          calls += 1;
          return {
            status: 409,
            json: {
              code: 'SIMULATOR_QUALIFICATION_INTEGRATION_PENDING',
              error: 'Sessão 12345 criada, mas integração pendente',
              data: { sessao_id: 12345 },
            },
          };
        },
      }),
      (error) => {
        assert.match(error.message, /SIMULATOR_QUALIFICATION_INTEGRATION_PENDING/);
        assert.equal(error.sessionId, 12345);
        assert.equal(error.attempts.length, 1);
        assert.equal(error.attempts[0].message.includes('12345'), false);
        return true;
      },
    );
    assert.equal(calls, 1);
  });

  it('sanitizes codes and long numeric identifiers from diagnostics', () => {
    assert.deepEqual(
      sanitizeSimpleSessionCreate({ status: 409, json: { code: 'SCHEDULE_CONFLICT<script>', error: 'sessão 123456 ocupada' } }),
      { status: 409, errorCode: 'SCHEDULE_CONFLICTscript', message: 'sessão [id] ocupada' },
    );
  });
});
