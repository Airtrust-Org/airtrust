import { describe, expect, it } from 'vitest';
import {
  buildOverrideAckNote,
  parseOverrideAckNote,
  resolveCausa,
  resolveDecisao,
  resolveMitigacao,
  resolveNaturezaDado,
  sanitizeOverrideJustificativa,
} from '../../lib/frms/decision-policy';

describe('FRMS decision policy', () => {
  it('classifica natureza do dado sem promover projecao ou check-in subjetivo', () => {
    expect(
      resolveNaturezaDado(
        {
          data_operacional: '2026-06-21',
          checkin_status: 'AUSENTE',
          escala_source: 'EVD',
          jornada_data_source: 'REAL',
        },
        '2026-06-20',
      ),
    ).toBe('PROJECAO');

    expect(
      resolveNaturezaDado(
        {
          data_operacional: '2026-06-20',
          checkin_status: 'RECEBIDO',
          escala_source: 'AUSENTE',
          jornada_data_source: 'AUSENTE',
        },
        '2026-06-20',
      ),
    ).toBe('CHECKIN_SUBJETIVO');

    expect(
      resolveNaturezaDado(
        {
          data_operacional: '2026-06-20',
          checkin_status: 'RECEBIDO',
          escala_source: 'SIGVOOS',
          jornada_data_source: 'REAL',
        },
        '2026-06-20',
      ),
    ).toBe('JORNADA_REALIZADA');

    for (const source of ['MANUAL', 'ESTIMADO', 'AUSENTE', 'INCONSISTENTE'] as const) {
      expect(
        resolveNaturezaDado(
          {
            data_operacional: '2026-06-20',
            checkin_status: 'PENDENTE',
            escala_source: 'EVD',
            jornada_data_source: source,
          },
          '2026-06-20',
        ),
      ).toBe('JORNADA_PLANEJADA');
    }
  });

  it('resolve causa e mitigacao pelo catalogo conservador', () => {
    expect(resolveCausa([])).toBe('Nenhuma ocorrencia identificada');
    expect(resolveMitigacao(['CHECKIN_CRITICO'], 'JORNADA_REALIZADA', 'CRITICO')).toBe(
      'TROCAR_TRIPULANTE',
    );
    expect(resolveMitigacao(['EFETIVIDADE_BAIXA'], 'JORNADA_REALIZADA', 'CRITICO')).toBe(
      'REDUZIR_JORNADA',
    );
    expect(resolveMitigacao(['CHECKIN_PENDENTE'], 'JORNADA_PLANEJADA', 'ATENCAO')).toBe(
      'REVISAR_CHECKIN',
    );
    expect(resolveMitigacao([], 'JORNADA_REALIZADA', 'OK')).toBe('SEM_ACAO');
  });

  it('resolve decisao sem BLOQUEIA por default e sem override para projecao/subjetivo', () => {
    expect(resolveDecisao('OK', 'JORNADA_REALIZADA')).toBe('INFORMA');
    expect(resolveDecisao('ATENCAO', 'JORNADA_REALIZADA')).toBe('ALERTA');
    expect(resolveDecisao('CRITICO', 'PROJECAO')).toBe('ALERTA');
    expect(resolveDecisao('CRITICO', 'CHECKIN_SUBJETIVO')).toBe('ALERTA');
    expect(resolveDecisao('CRITICO', 'JORNADA_REALIZADA')).toBe('EXIGE_OVERRIDE');
    expect(resolveDecisao('CRITICO', 'JORNADA_REALIZADA', { critico: 'BLOQUEIA' })).toBe(
      'EXIGE_OVERRIDE',
    );
    expect(
      resolveDecisao('CRITICO', 'JORNADA_REALIZADA', {
        critico: 'BLOQUEIA',
        allowBloqueia: true,
      }),
    ).toBe('BLOQUEIA');
  });

  it('sanitiza justificativa e parseia ack_note de override v1', () => {
    expect(sanitizeOverrideJustificativa('curta')).toBeNull();
    expect(sanitizeOverrideJustificativa('Mitigacao operacional revisada e registrada.')).toBe(
      'Mitigacao operacional revisada e registrada.',
    );

    const note = buildOverrideAckNote({
      responsavel_user_id: 77,
      justificativa: 'Mitigacao operacional revisada e registrada.',
      evidencia_ref: 'DOC-FRMS-2026-001',
      override_at: '2026-06-20T12:00:00.000Z',
    });

    expect(note?._override_schema).toBe(1);
    expect(parseOverrideAckNote(JSON.stringify(note))).toMatchObject({
      _override_schema: 1,
      responsavel_user_id: 77,
      evidencia_ref: 'DOC-FRMS-2026-001',
    });
    expect(parseOverrideAckNote(JSON.stringify({ ...note, _override_schema: 2 }))).toBeNull();
  });
});
