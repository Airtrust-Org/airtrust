import { describe, expect, it } from 'vitest';
import {
  calculateSharedSessionParticipantSummaries,
  createSharedCurricularSignature,
  validateAndNormalizeSharedSessionRequest,
} from '../../routes/simuladores-shared-session-logic';

describe('simuladores shared session logic', () => {
  it('calculates 60 PF + 60 PM for both pilots in the two-training scenario', () => {
    const normalized = validateAndNormalizeSharedSessionRequest({
      data: '2026-06-15',
      hora_inicio: '07:00',
      hora_fim: '09:00',
      simulador_id: 10,
      instrutor_id: 20,
      participantes: [
        {
          funcionario_id: 101,
          cumpre_treinamento: true,
          treinamento_planejado_id: 1001,
          modelo_sessao_id: 2001,
          gera_ficha: true,
        },
        {
          funcionario_id: 102,
          cumpre_treinamento: true,
          treinamento_planejado_id: 1002,
          modelo_sessao_id: 2002,
          gera_ficha: true,
        },
      ],
      segmentos: [
        {
          inicio: '07:00',
          fim: '08:00',
          atribuicao_funcionario_id: 101,
          funcoes: [
            { funcionario_id: 101, funcao: 'PF' },
            { funcionario_id: 102, funcao: 'PM' },
          ],
        },
        {
          inicio: '08:00',
          fim: '09:00',
          atribuicao_funcionario_id: 102,
          funcoes: [
            { funcionario_id: 102, funcao: 'PF' },
            { funcionario_id: 101, funcao: 'PM' },
          ],
        },
      ],
    });

    expect(normalized.resumo_participantes).toEqual([
      {
        funcionario_id: 101,
        total_minutos: 120,
        pf_minutos: 60,
        pm_minutos: 60,
        curricular_minutos: 60,
        cumpre_treinamento: true,
        gera_ficha: true,
      },
      {
        funcionario_id: 102,
        total_minutos: 120,
        pf_minutos: 60,
        pm_minutos: 60,
        curricular_minutos: 60,
        cumpre_treinamento: true,
        gera_ficha: true,
      },
    ]);
  });

  it('supports one curricular participant and one support participant', () => {
    const normalized = validateAndNormalizeSharedSessionRequest({
      data: '2026-06-15',
      hora_inicio: '07:00',
      hora_fim: '09:00',
      simulador_id: 10,
      instrutor_id: 20,
      participantes: [
        {
          funcionario_id: 101,
          cumpre_treinamento: true,
          treinamento_planejado_id: 1001,
          modelo_sessao_id: 2001,
          gera_ficha: true,
        },
        {
          funcionario_id: 102,
          cumpre_treinamento: false,
          gera_ficha: false,
        },
      ],
      segmentos: [
        {
          inicio: '07:00',
          fim: '08:00',
          atribuicao_funcionario_id: 101,
          funcoes: [
            { funcionario_id: 101, funcao: 'PF' },
            { funcionario_id: 102, funcao: 'PM' },
          ],
        },
        {
          inicio: '08:00',
          fim: '09:00',
          atribuicao_funcionario_id: 101,
          funcoes: [
            { funcionario_id: 102, funcao: 'PF' },
            { funcionario_id: 101, funcao: 'PM' },
          ],
        },
      ],
    });

    expect(normalized.resumo_participantes).toEqual([
      {
        funcionario_id: 101,
        total_minutos: 120,
        pf_minutos: 60,
        pm_minutos: 60,
        curricular_minutos: 120,
        cumpre_treinamento: true,
        gera_ficha: true,
      },
      {
        funcionario_id: 102,
        total_minutos: 120,
        pf_minutos: 60,
        pm_minutos: 60,
        curricular_minutos: 0,
        cumpre_treinamento: false,
        gera_ficha: false,
      },
    ]);
  });

  it('rejects overlapping segments', () => {
    expect(() =>
      validateAndNormalizeSharedSessionRequest({
        data: '2026-06-15',
        hora_inicio: '07:00',
        hora_fim: '09:00',
        simulador_id: 10,
        instrutor_id: 20,
        participantes: [
          { funcionario_id: 101, cumpre_treinamento: true, modelo_sessao_id: 2001 },
          { funcionario_id: 102, cumpre_treinamento: true, modelo_sessao_id: 2002 },
        ],
        segmentos: [
          {
            inicio: '07:00',
            fim: '08:30',
            atribuicao_funcionario_id: 101,
            funcoes: [
              { funcionario_id: 101, funcao: 'PF' },
              { funcionario_id: 102, funcao: 'PM' },
            ],
          },
          {
            inicio: '08:00',
            fim: '09:00',
            atribuicao_funcionario_id: 102,
            funcoes: [
              { funcionario_id: 102, funcao: 'PF' },
              { funcionario_id: 101, funcao: 'PM' },
            ],
          },
        ],
      }),
    ).toThrow('Segmentos não podem se sobrepor');
  });

  it('rejects a support participant trying to generate a ficha', () => {
    expect(() =>
      validateAndNormalizeSharedSessionRequest({
        data: '2026-06-15',
        hora_inicio: '07:00',
        hora_fim: '08:00',
        simulador_id: 10,
        instrutor_id: 20,
        participantes: [
          { funcionario_id: 101, cumpre_treinamento: true, modelo_sessao_id: 2001 },
          { funcionario_id: 102, cumpre_treinamento: false, gera_ficha: true },
        ],
        segmentos: [
          {
            inicio: '07:00',
            fim: '08:00',
            atribuicao_funcionario_id: 101,
            funcoes: [
              { funcionario_id: 101, funcao: 'PF' },
              { funcionario_id: 102, funcao: 'PM' },
            ],
          },
        ],
      }),
    ).toThrow('não pode gerar ficha sem atribuição curricular');
  });

  it('keeps the summary helper deterministic outside route handlers', () => {
    const summaries = calculateSharedSessionParticipantSummaries(
      [
        { funcionario_id: 10, cumpre_treinamento: true, gera_ficha: true },
        { funcionario_id: 11, cumpre_treinamento: false, gera_ficha: false },
      ],
      [
        {
          duracao_minutos: 30,
          atribuicao_funcionario_id: 10,
          funcoes: [
            { funcionario_id: 10, funcao: 'PF' },
            { funcionario_id: 11, funcao: 'PM' },
          ],
        },
      ],
    );

    expect(summaries).toEqual([
      {
        funcionario_id: 10,
        total_minutos: 30,
        pf_minutos: 30,
        pm_minutos: 0,
        curricular_minutos: 30,
        cumpre_treinamento: true,
        gera_ficha: true,
      },
      {
        funcionario_id: 11,
        total_minutos: 30,
        pf_minutos: 0,
        pm_minutos: 30,
        curricular_minutos: 0,
        cumpre_treinamento: false,
        gera_ficha: false,
      },
    ]);
  });

  it('normalizes curricular signatures while detecting material curriculum changes', () => {
    const current = createSharedCurricularSignature(
      [{ funcionario_id: 102 }, { funcionario_id: 101 }],
      [
        {
          funcionario_id: 101,
          treinamento_planejado_id: 1001,
          modelo_sessao_id: 2001,
          gera_ficha: 1,
        },
      ],
    );
    const reordered = createSharedCurricularSignature(
      [{ funcionario_id: 101 }, { funcionario_id: 102 }],
      [
        {
          funcionario_id: 101,
          treinamento_planejado_id: 1001,
          modelo_sessao_id: 2001,
          gera_ficha: true,
        },
      ],
    );
    const changedModel = createSharedCurricularSignature(
      [{ funcionario_id: 101 }, { funcionario_id: 102 }],
      [
        {
          funcionario_id: 101,
          treinamento_planejado_id: 1001,
          modelo_sessao_id: 2002,
          gera_ficha: true,
        },
      ],
    );

    expect(reordered).toBe(current);
    expect(changedModel).not.toBe(current);
  });
});
