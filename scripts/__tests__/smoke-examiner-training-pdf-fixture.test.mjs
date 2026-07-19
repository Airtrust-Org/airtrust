import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  saoPauloTodayDateKey,
  pdfFixtureTimeWindow,
  isValidPdfResponse,
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
      assert.ok(hora_inicio < hora_fim, `hora_inicio (${hora_inicio}) deve ser < hora_fim (${hora_fim})`);
      assert.ok(hora_fim <= '23:00', `hora_fim (${hora_fim}) não deve ultrapassar 23:00`);
      assert.ok(hora_inicio >= '06:00', `hora_inicio (${hora_inicio}) não deve começar antes de 06:00`);
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

  it('spreads distinct executions across distinct time slots (low collision probability)', () => {
    const slots = new Set();
    for (let i = 0; i < 20; i += 1) {
      const { hora_inicio } = pdfFixtureTimeWindow(i / 20, LATE_AFTERNOON_NOW);
      slots.add(hora_inicio);
    }
    // 20 evenly-spaced samples across the window must land on at least 15
    // distinct slots — proves the slot resolution is fine-grained enough that
    // two real executions picking independent Math.random() values are very
    // unlikely to collide on the same simulador/day.
    assert.ok(slots.size >= 15, `esperado >=15 horários distintos, obteve ${slots.size}`);
  });

  it('never accepts a non-200 (e.g. 409 FICHA_NOT_AVAILABLE_YET) as a valid PDF response', () => {
    assert.equal(
      isValidPdfResponse({ status: 409, contentType: 'application/json', bytes: 120, hasPdfSignature: false }),
      false,
    );
    assert.equal(isValidPdfResponse({ status: null, bytes: 0 }), false);
  });

  it('requires status 200, application/pdf content-type, non-empty body and the %PDF- signature', () => {
    assert.equal(
      isValidPdfResponse({ status: 200, contentType: 'application/pdf', bytes: 5713, hasPdfSignature: true }),
      true,
    );
    assert.equal(
      isValidPdfResponse({ status: 200, contentType: 'application/json', bytes: 5713, hasPdfSignature: true }),
      false,
      'content-type divergente não deve passar mesmo com status 200',
    );
    assert.equal(
      isValidPdfResponse({ status: 200, contentType: 'application/pdf', bytes: 0, hasPdfSignature: false }),
      false,
      'corpo vazio não deve passar',
    );
    assert.equal(
      isValidPdfResponse({ status: 200, contentType: 'application/pdf', bytes: 52, hasPdfSignature: false }),
      false,
      'sem assinatura %PDF- (ex.: corpo é na verdade um JSON de erro) não deve passar',
    );
  });

  it('keeps the other scenarios (B/C/D, F) scheduled on future days, never today, to avoid conflicting with the dedicated PDF-day fixture', () => {
    const source = readFileSync(join(ROOT, 'scripts/staging/smoke-examiner-training.mjs'), 'utf8');
    const offsetDeclarations = [...source.matchAll(/const randomDayOffset(\d) = (\d+) \+/g)];
    assert.equal(offsetDeclarations.length, 2, 'esperado exatamente dois offsets de dia futuro (B/C/D e F)');
    for (const [, , minDays] of offsetDeclarations) {
      assert.ok(Number(minDays) >= 7, 'offset mínimo dos demais cenários deve permanecer >= 7 dias no futuro');
    }
  });
});
