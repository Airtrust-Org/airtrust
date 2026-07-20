import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  saoPauloTodayDateKey,
  pdfFixtureCandidateTimeWindows,
  pdfFixtureTimeWindow,
  isValidPdfResponse,
  sanitizeScheduleConflict,
  createPdfSessionInAvailableSlot,
  releasePriorPdfFixtureSlots,
} from '../staging/smoke-examiner-training.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('smoke-examiner-training: PDF fixture date/time', () => {
  it('resolves the current São Paulo civil date (not necessarily equal to UTC date)', () => {
    const key = saoPauloTodayDateKey(new Date());
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  });

  it('does not fall into a future day due to naive UTC conversion late in the evening (Brasília time)', () => {
    // 23:30 America/Sao_Paulo on 2026-07-19 is 2026-07-20T02:30:00Z — a naive
    // `new Date(now).toISOString().slice(0, 10)` (UTC) would silently return
    // 2026-07-20, one day ahead of the real São Paulo civil day.
    const lateEveningInSaoPauloAsUtc = new Date('2026-07-20T02:30:00.000Z');
    const key = saoPauloTodayDateKey(lateEveningInSaoPauloAsUtc);
    assert.equal(key, '2026-07-19');
    assert.notEqual(key, lateEveningInSaoPauloAsUtc.toISOString().slice(0, 10));
  });

  it('does not fall into the previous day due to naive UTC conversion early in the morning (Brasília time)', () => {
    // 00:30 America/Sao_Paulo on 2026-07-19 is 2026-07-19T03:30:00Z — same
    // calendar day in both, but exercises the other boundary explicitly.
    const earlyMorningInSaoPauloAsUtc = new Date('2026-07-19T03:30:00.000Z');
    const key = saoPauloTodayDateKey(earlyMorningInSaoPauloAsUtc);
    assert.equal(key, '2026-07-19');
  });

  // 21:00 America/Sao_Paulo (2026-07-20T00:00:00Z) — horário fixo e tardio o
  // suficiente para abrir a janela inteira de slots (06:00 até ~20:45),
  // tornando estes dois testes determinísticos independentemente de quando
  // a suíte realmente rodar.
  const LATE_AFTERNOON_NOW = new Date('2026-07-20T00:00:00.000Z');

  it('produces a valid same-day 60-minute window that never crosses midnight', () => {
    for (let i = 0; i < 50; i += 1) {
      const { hora_inicio, hora_fim } = pdfFixtureTimeWindow(i / 50, LATE_AFTERNOON_NOW);
      assert.match(hora_inicio, /^\d{2}:\d{2}$/);
      assert.match(hora_fim, /^\d{2}:\d{2}$/);
      assert.ok(
        hora_inicio < hora_fim,
        `hora_inicio (${hora_inicio}) deve ser < hora_fim (${hora_fim})`,
      );
      assert.ok(hora_fim <= '23:00', `hora_fim (${hora_fim}) não deve ultrapassar 23:00`);
      assert.ok(
        hora_inicio >= '06:00',
        `hora_inicio (${hora_inicio}) não deve começar antes de 06:00`,
      );
    }
  });

  it('never picks a hora_inicio later than "now" in São Paulo time (would trigger a legitimate 409)', () => {
    // Varre horários de "agora" ao longo do dia (manhã, tarde, noite) e confirma
    // que o horário sorteado para a sessão nunca fica no futuro em relação a
    // "agora" — reprodução direta do bug: hora_inicio="20:15" sorteado quando o
    // horário real era ~18:27 America/Sao_Paulo.
    const sampleNows = [
      '2026-07-19T03:00:00.000Z', // 00:00 BRT — madrugada, antes do piso preferencial de 06:00
      '2026-07-19T06:00:00.000Z', // 03:00 BRT — idem
      '2026-07-19T09:30:00.000Z', // 06:30 BRT
      '2026-07-19T13:00:00.000Z', // 10:00 BRT
      '2026-07-19T18:00:00.000Z', // 15:00 BRT
      '2026-07-19T21:27:00.000Z', // 18:27 BRT — horário real da falha reproduzida
      '2026-07-20T00:45:00.000Z', // 21:45 BRT
    ];
    for (const iso of sampleNows) {
      const now = new Date(iso);
      const nowKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(now);
      for (let i = 0; i < 20; i += 1) {
        const { hora_inicio } = pdfFixtureTimeWindow(i / 20, now);
        assert.ok(
          hora_inicio <= nowKey,
          `hora_inicio (${hora_inicio}) não pode ser posterior ao horário atual (${nowKey}) para now=${iso}`,
        );
      }
    }
  });

  it('uses deterministic 60-minute candidates that have already started', () => {
    const slots = pdfFixtureCandidateTimeWindows(LATE_AFTERNOON_NOW);
    assert.ok(slots.length >= 10);
    assert.deepEqual(slots[0], { hora_inicio: '06:00', hora_fim: '07:00' });
    assert.equal(new Set(slots.map(({ hora_inicio }) => hora_inicio)).size, slots.length);
  });

  it('never accepts a non-200 (e.g. 409 FICHA_NOT_AVAILABLE_YET) as a valid PDF response', () => {
    assert.equal(
      isValidPdfResponse({
        status: 409,
        contentType: 'application/json',
        bytes: 120,
        hasPdfSignature: false,
      }),
      false,
    );
    assert.equal(isValidPdfResponse({ status: null, bytes: 0 }), false);
  });

  it('requires status 200, application/pdf content-type, non-empty body and the %PDF- signature', () => {
    assert.equal(
      isValidPdfResponse({
        status: 200,
        contentType: 'application/pdf',
        bytes: 5713,
        hasPdfSignature: true,
      }),
      true,
    );
    assert.equal(
      isValidPdfResponse({
        status: 200,
        contentType: 'application/json',
        bytes: 5713,
        hasPdfSignature: true,
      }),
      false,
      'content-type divergente não deve passar mesmo com status 200',
    );
    assert.equal(
      isValidPdfResponse({
        status: 200,
        contentType: 'application/pdf',
        bytes: 0,
        hasPdfSignature: false,
      }),
      false,
      'corpo vazio não deve passar',
    );
    assert.equal(
      isValidPdfResponse({
        status: 200,
        contentType: 'application/pdf',
        bytes: 52,
        hasPdfSignature: false,
      }),
      false,
      'sem assinatura %PDF- (ex.: corpo é na verdade um JSON de erro) não deve passar',
    );
  });

  it('keeps the other scenarios (B/C/D, F) scheduled on future days, never today, to avoid conflicting with the dedicated PDF-day fixture', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/smoke-examiner-training.mjs'), 'utf8');
    const offsetDeclarations = [...source.matchAll(/const randomDayOffset(\d) = (\d+) \+/g)];
    assert.equal(
      offsetDeclarations.length,
      2,
      'esperado exatamente dois offsets de dia futuro (B/C/D e F)',
    );
    for (const [, , minDays] of offsetDeclarations) {
      assert.ok(
        Number(minDays) >= 7,
        'offset mínimo dos demais cenários deve permanecer >= 7 dias no futuro',
      );
    }
  });

  it('retries a recognized 400 schedule conflict and selects the next free slot', async () => {
    const candidates = [
      { hora_inicio: '06:00', hora_fim: '07:00' },
      { hora_inicio: '07:00', hora_fim: '08:00' },
    ];
    const tried = [];
    const result = await createPdfSessionInAvailableSlot({
      candidates,
      createSession: async (slot) => {
        tried.push(slot.hora_inicio);
        return slot.hora_inicio === '06:00'
          ? { status: 400, json: { error: 'Conflito externo de simulador' } }
          : { status: 201, json: { data: { sessao: { id: 123 } } } };
      },
    });
    assert.deepEqual(tried, ['06:00', '07:00']);
    assert.deepEqual(result.selected, candidates[1]);
    assert.equal(result.attempts[0].discardReason, 'schedule_conflict_simulador');
    assert.equal(result.attempts[1].discardReason, 'selected');
  });

  it('retries through several occupied slots before success', async () => {
    const candidates = [
      { hora_inicio: '06:00', hora_fim: '07:00' },
      { hora_inicio: '07:00', hora_fim: '08:00' },
      { hora_inicio: '08:00', hora_fim: '09:00' },
      { hora_inicio: '09:00', hora_fim: '10:00' },
    ];
    const result = await createPdfSessionInAvailableSlot({
      candidates,
      createSession: async (slot) =>
        slot.hora_inicio === '09:00'
          ? { status: 201, json: { data: { sessao: { id: 99 } } } }
          : { status: 400, json: { error: 'Conflito externo de instrutor' } },
    });
    assert.equal(result.selected.hora_inicio, '09:00');
    assert.equal(result.attempts.length, 4);
    assert.equal(
      result.attempts.filter((a) => a.discardReason?.startsWith('schedule_conflict_')).length,
      3,
    );
  });

  it('reports every occupied candidate with sanitized diagnostics', async () => {
    await assert.rejects(
      () =>
        createPdfSessionInAvailableSlot({
          candidates: [
            { hora_inicio: '06:00', hora_fim: '07:00' },
            { hora_inicio: '07:00', hora_fim: '08:00' },
          ],
          createSession: async () => ({
            status: 400,
            json: { error: 'Conflito externo de participante: 9988' },
          }),
        }),
      (error) => {
        assert.match(String(error.message), /I_pdf sem slot disponível/);
        assert.equal(error.attempts.length, 2);
        assert.equal(error.attempts[0].message, 'Conflito externo de participante');
        assert.doesNotMatch(JSON.stringify(error.attempts), /9988/);
        return true;
      },
    );
  });

  it('does not mistake an unrelated 400 or a 500 for a conflict', async () => {
    assert.equal(
      sanitizeScheduleConflict({ status: 400, json: { error: 'Payload inválido' } }),
      null,
    );
    assert.equal(
      sanitizeScheduleConflict({ status: 400, json: { error: 'Conflito externo de simulador' } })
        ?.errorCode,
      'EXTERNAL_SCHEDULE_CONFLICT',
    );
    await assert.rejects(
      () =>
        createPdfSessionInAvailableSlot({
          candidates: [{ hora_inicio: '06:00', hora_fim: '07:00' }],
          createSession: async () => ({ status: 400, json: { error: 'Payload inválido' } }),
        }),
      /HTTP 400/,
    );
    await assert.rejects(
      () =>
        createPdfSessionInAvailableSlot({
          candidates: [{ hora_inicio: '06:00', hora_fim: '07:00' }],
          createSession: async () => ({ status: 500, json: { error: 'Erro interno' } }),
        }),
      /HTTP 500/,
    );
    await assert.rejects(
      () =>
        createPdfSessionInAvailableSlot({
          candidates: [{ hora_inicio: '06:00', hora_fim: '07:00' }],
          createSession: async () => ({
            status: 409,
            json: { code: 'FICHA_NOT_AVAILABLE_YET', error: 'ainda não' },
          }),
        }),
      /HTTP 409/,
    );
  });

  it('keeps logs free of auth material markers in the I_pdf reporting path', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/smoke-examiner-training.mjs'), 'utf8');
    assert.match(source, /selectedSlot/);
    assert.match(source, /discardReason/);
    assert.doesNotMatch(source, /Authorization.*attempts/);
    assert.doesNotMatch(source, /QA_EXAMINER_ADMIN_PASSWORD.*I_pdf/);
  });

  it('releases only prior I_pdf fixture sessions for the same day and simulator', async () => {
    const deleted = [];
    const released = await releasePriorPdfFixtureSlots({
      dateKey: '2026-07-20',
      simuladorId: 7,
      listSessions: async () => ({
        status: 200,
        json: {
          data: [
            {
              id: 11,
              data: '2026-07-20',
              simulador_id: 7,
              horario_inicio: '08:00',
              horario_fim: '09:00',
              observacoes: 'QA smoke — fixture dedicada I_pdf old',
            },
            {
              id: 12,
              data: '2026-07-20',
              simulador_id: 7,
              horario_inicio: '10:00',
              horario_fim: '11:00',
              observacoes: 'sessão legítima do tenant',
            },
          ],
        },
      }),
      deleteSession: async (id) => {
        deleted.push(id);
        return { status: 200 };
      },
    });
    assert.deepEqual(deleted, [11]);
    assert.equal(released.length, 1);
  });
});
