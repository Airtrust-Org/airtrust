/**
 * Regression tests for the Data inicial / Data final validation bug.
 *
 * Root cause: `min={today}` on the Data inicial input blocked past dates when
 * editing a CONCLUIDO training (browser-native constraint fired before JS).
 * Fix: `min={treinamentoEditando ? undefined : today}` — removes the native
 * constraint on edit mode; JS validations handle logical invariants.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const currentDir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(currentDir, '../TreinamentosPlanejadosPage.tsx'), 'utf8');

describe('TreinamentosPlanejadosPage — Data inicial min regression', () => {
  it('data_inicial_sem_min_ao_editar — Data inicial usa min condicional para permitir datas passadas no edit', () => {
    expect(src).toContain('min={treinamentoEditando ? undefined : today}');
    expect(src).not.toMatch(/min=\{today\}[^}]*data_prevista/);
  });

  it('data_inicial_sem_min_fixo_today — nenhum input de data_prevista tem min={today} sem condicional', () => {
    const problematicPattern = /type="date"[\s\S]{0,200}data_prevista[\s\S]{0,100}min=\{today\}/;
    expect(src).not.toMatch(problematicPattern);
  });

  it('data_final_min_mantido — Data final preserva min baseado em data_prevista', () => {
    expect(src).toContain('min={formState.data_prevista || today}');
  });
});

describe('TreinamentosPlanejadosPage — submit validations', () => {
  it('valida_data_inicial_nao_posterior_final — mensagem correta ao violar ordem de datas', () => {
    expect(src).toContain('Data inicial não pode ser posterior à data final.');
  });

  it('valida_concluido_nao_futuro — CONCLUIDO não pode ter período futuro', () => {
    expect(src).toContain("formState.status === 'CONCLUIDO' && formState.data_fim > today");
    expect(src).toContain('Turma concluída não pode ter período futuro.');
  });

  it('valida_concluido_sem_participantes — CONCLUIDO exige ao menos um participante vinculado', () => {
    expect(src).toContain("formState.status === 'CONCLUIDO' && formState.participante_ids.length === 0");
    expect(src).toContain('Não é permitido concluir turma sem participantes vinculados.');
  });

  it('valida_dias_dentro_do_periodo — dias efetivos devem estar entre data_prevista e data_fim', () => {
    expect(src).toContain('dia.data < formState.data_prevista || dia.data > formState.data_fim');
    expect(src).toContain('Dias efetivos devem estar dentro do período da turma.');
  });
});

describe('TreinamentosPlanejadosPage — lógica de validação de data (unit)', () => {
  function validateDates(
    dataPrevista: string,
    dataFim: string,
    today: string,
    status: string,
    participanteIds: number[],
    dias: { data: string }[],
  ): string | null {
    if (!dataFim || dataFim < dataPrevista) return 'Data inicial não pode ser posterior à data final.';
    if (status === 'CONCLUIDO' && dataFim > today) return 'Turma concluída não pode ter período futuro.';
    if (status === 'CONCLUIDO' && participanteIds.length === 0)
      return 'Não é permitido concluir turma sem participantes vinculados.';
    if (dias.some((d) => d.data < dataPrevista || d.data > dataFim))
      return 'Dias efetivos devem estar dentro do período da turma.';
    return null;
  }

  const TODAY = '2026-06-23';

  it('turma_passada_concluida_valida — CONCLUIDO com 20-23/06/2026 e participantes é válida', () => {
    const err = validateDates(
      '2026-06-20',
      '2026-06-23',
      TODAY,
      'CONCLUIDO',
      [1, 2],
      [{ data: '2026-06-20' }, { data: '2026-06-22' }],
    );
    expect(err).toBeNull();
  });

  it('data_inicial_posterior_final_invalida — 24/06 > 23/06 é rejeitado', () => {
    const err = validateDates('2026-06-24', '2026-06-23', TODAY, 'PLANEJADO', [], []);
    expect(err).toBe('Data inicial não pode ser posterior à data final.');
  });

  it('concluido_periodo_futuro_invalido — CONCLUIDO com data_fim amanhã é rejeitado', () => {
    const err = validateDates('2026-06-23', '2026-06-24', TODAY, 'CONCLUIDO', [1], [{ data: '2026-06-23' }]);
    expect(err).toBe('Turma concluída não pode ter período futuro.');
  });

  it('concluido_sem_participantes_invalido — CONCLUIDO sem participante_ids é rejeitado', () => {
    const err = validateDates('2026-06-20', '2026-06-23', TODAY, 'CONCLUIDO', [], [{ data: '2026-06-21' }]);
    expect(err).toBe('Não é permitido concluir turma sem participantes vinculados.');
  });

  it('dia_fora_periodo_invalido — dia anterior à data_prevista é rejeitado', () => {
    const err = validateDates(
      '2026-06-20',
      '2026-06-23',
      TODAY,
      'CONCLUIDO',
      [1],
      [{ data: '2026-06-19' }],
    );
    expect(err).toBe('Dias efetivos devem estar dentro do período da turma.');
  });

  it('dia_apos_fim_invalido — dia posterior à data_fim é rejeitado', () => {
    const err = validateDates(
      '2026-06-20',
      '2026-06-23',
      TODAY,
      'CONCLUIDO',
      [1],
      [{ data: '2026-06-24' }],
    );
    expect(err).toBe('Dias efetivos devem estar dentro do período da turma.');
  });

  it('turma_futura_planejada_valida — PLANEJADO com período futuro é aceito', () => {
    const err = validateDates(
      '2026-07-01',
      '2026-07-05',
      TODAY,
      'PLANEJADO',
      [],
      [{ data: '2026-07-02' }],
    );
    expect(err).toBeNull();
  });
});
