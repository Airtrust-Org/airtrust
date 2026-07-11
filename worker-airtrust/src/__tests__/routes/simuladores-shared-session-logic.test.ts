import { describe, expect, it } from 'vitest';
import {
  calculateSharedSessionParticipantSummaries,
  createSharedCurricularSignature,
  validateAndNormalizeSharedSessionRequest,
} from '../../routes/simuladores-shared-session-logic';

describe('simuladores shared session logic', () => {
  it('credits both curricula explicitly when both segments attend both assignments', () => {
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
          atribuicao_funcionario_ids: [101, 102],
          finalidade_codigo: 'SOP_NORMAL',
          funcoes: [
            { funcionario_id: 101, funcao: 'PF' },
            { funcionario_id: 102, funcao: 'PM' },
          ],
        },
        {
          inicio: '08:00',
          fim: '09:00',
          atribuicao_funcionario_id: 102,
          atribuicao_funcionario_ids: [101, 102],
          finalidade_codigo: 'ATUACAO_EXAMINADOR',
          funcoes: [
            { funcionario_id: 102, funcao: 'PF' },
            { funcionario_id: 101, funcao: 'PM' },
          ],
        },
      ],
    });

    expect(normalized.segmentos.map((segmento) => segmento.atribuicao_funcionario_ids)).toEqual([
      [101, 102],
      [101, 102],
    ]);
    expect(normalized.resumo_participantes.map((summary) => summary.curricular_minutos)).toEqual([
      120,
      120,
    ]);
  });

  it('uses explicit curricular relations instead of mixing with the legacy scalar', () => {
    const summaries = calculateSharedSessionParticipantSummaries(
      [
        { funcionario_id: 101, cumpre_treinamento: true, gera_ficha: true },
        { funcionario_id: 102, cumpre_treinamento: true, gera_ficha: true },
      ],
      [
        {
          duracao_minutos: 60,
          atribuicao_funcionario_id: 101,
          atribuicao_funcionario_ids: [102],
          funcoes: [
            { funcionario_id: 101, funcao: 'PF' },
            { funcionario_id: 102, funcao: 'PM' },
          ],
        },
      ],
    );

    expect(summaries.find((summary) => summary.funcionario_id === 101)?.curricular_minutos).toBe(0);
    expect(summaries.find((summary) => summary.funcionario_id === 102)?.curricular_minutos).toBe(60);
  });

  it('deduplicates explicit curricular ids so a segment cannot double count minutes', () => {
    const summaries = calculateSharedSessionParticipantSummaries(
      [
        { funcionario_id: 101, cumpre_treinamento: true, gera_ficha: true },
        { funcionario_id: 102, cumpre_treinamento: true, gera_ficha: true },
      ],
      [
        {
          duracao_minutos: 60,
          atribuicao_funcionario_ids: [101, 101, 102],
          funcoes: [
            { funcionario_id: 101, funcao: 'PF' },
            { funcionario_id: 102, funcao: 'PM' },
          ],
        },
      ],
    );

    expect(summaries.map((summary) => summary.curricular_minutos)).toEqual([60, 60]);
  });

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

  it('rejects a support participant trying to send modelo_sessao_id', () => {
    expect(() =>
      validateAndNormalizeSharedSessionRequest({
        data: '2026-06-15',
        hora_inicio: '07:00',
        hora_fim: '08:00',
        simulador_id: 10,
        instrutor_id: 20,
        participantes: [
          { funcionario_id: 101, cumpre_treinamento: true, modelo_sessao_id: 2001 },
          { funcionario_id: 102, cumpre_treinamento: false, modelo_sessao_id: 2002 },
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
    ).toThrow('não pode informar modelo_sessao_id como apoio');
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

  // ═══════════════════════════════════════════════════════════
  // Testes de consistência de split/segmentos
  // ═══════════════════════════════════════════════════════════

  describe('consistência de split e segmentos', () => {
    it('Cenário 1: split válido 08:00 em reserva 07:00-09:00 resulta 1h+1h total 2h', () => {
      const normalized = validateAndNormalizeSharedSessionRequest({
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

      // Ambos os segmentos com 60 min
      expect(normalized.segmentos[0].duracao_minutos).toBe(60);
      expect(normalized.segmentos[1].duracao_minutos).toBe(60);

      // Total de cada piloto = 120 min (2h)
      for (const summary of normalized.resumo_participantes) {
        expect(summary.total_minutos).toBe(120);
      }
    });

    it('Cenário 2: reserva 07:00-09:00 com split 06:00 (fora da janela) é rejeitado', () => {
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
              fim: '06:00', // invertido — fim antes do início
              atribuicao_funcionario_id: 101,
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '06:00',
              fim: '09:00',
              atribuicao_funcionario_id: 102,
              funcoes: [
                { funcionario_id: 102, funcao: 'PF' },
                { funcionario_id: 101, funcao: 'PM' },
              ],
            },
          ],
        }),
      ).toThrow(/Segmento 1 precisa terminar após o início/);
    });

    it('Cenário 3: split antes do início da reserva é rejeitado', () => {
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
              inicio: '06:00', // antes do início da reserva (07:00)
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
        }),
      ).toThrow(/Segmento 1 está fora da janela da reserva/);
    });

    it('Cenário 4: split depois do fim da reserva é rejeitado', () => {
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
              fim: '08:00',
              atribuicao_funcionario_id: 101,
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00',
              fim: '10:00', // depois do fim da reserva (09:00)
              atribuicao_funcionario_id: 102,
              funcoes: [
                { funcionario_id: 102, funcao: 'PF' },
                { funcionario_id: 101, funcao: 'PM' },
              ],
            },
          ],
        }),
      ).toThrow(/Segmento 2 está fora da janela da reserva/);
    });

    it('Cenário 5: soma PF+PM = duração total da reserva (120 min)', () => {
      const normalized = validateAndNormalizeSharedSessionRequest({
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

      for (const summary of normalized.resumo_participantes) {
        // PF + PM deve ser igual ao total
        expect(summary.pf_minutos + summary.pm_minutos).toBe(summary.total_minutos);
        // Total = duração da reserva (07:00-09:00 = 120 min)
        expect(summary.total_minutos).toBe(120);
      }

      // A duração total dos segmentos = duração da reserva
      const segmentTotal = normalized.segmentos.reduce(
        (sum, seg) => sum + seg.duracao_minutos,
        0,
      );
      expect(segmentTotal).toBe(120);
    });

    it('rejeita segmento com início igual ao fim (duração zero)', () => {
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
              fim: '07:00', // início = fim
              atribuicao_funcionario_id: 101,
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
          ],
        }),
      ).toThrow(/Segmento 1 precisa terminar após o início/);
    });

    it('rejeita segmentos com gap (não cobrem continuamente a reserva)', () => {
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
              fim: '07:45',
              atribuicao_funcionario_id: 101,
              funcoes: [
                { funcionario_id: 101, funcao: 'PF' },
                { funcionario_id: 102, funcao: 'PM' },
              ],
            },
            {
              inicio: '08:00', // gap entre 07:45 e 08:00
              fim: '09:00',
              atribuicao_funcionario_id: 102,
              funcoes: [
                { funcionario_id: 102, funcao: 'PF' },
                { funcionario_id: 101, funcao: 'PM' },
              ],
            },
          ],
        }),
      ).toThrow(/cobertura contínua/);
    });
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
