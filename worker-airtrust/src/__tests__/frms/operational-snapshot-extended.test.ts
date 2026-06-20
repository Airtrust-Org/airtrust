import { describe, expect, it } from 'vitest';
import {
  buildFrmsOperationalSnapshot,
  type BuildOperationalSnapshotInput,
} from '../../lib/frms/operational-snapshot';

function baseInput(): BuildOperationalSnapshotInput {
  return {
    empresaId: 42,
    hoje: '2026-06-20',
    rows: {
      escalas: [],
      jornadas: [],
      checkins: [],
      effectiveness: [],
      funcionarios: [
        {
          id: 10,
          nome: 'Tripulante Um',
          nome_guerra: 'UM',
          funcao: 'PIC',
          cargo: 'COMANDANTE',
          base: 'SBJR',
          aeronave: 'AW139',
        },
      ],
    },
  };
}

describe('FRMS operational snapshot extended decision fields', () => {
  it('preserva payload legado e adiciona campos novos em todos os itens', () => {
    const input = baseInput();
    input.rows.escalas.push({
      data_operacional: '2026-06-19',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '14:00',
      aeronave_prefixo: 'PR-ATX',
      aeronave_modelo: 'AW139',
    });

    const result = buildFrmsOperationalSnapshot(input);
    expect(result.items).toHaveLength(1);
    const item = result.items[0];

    expect(item.empresa_id).toBe(42);
    expect(item.funcionario_id).toBe(10);
    expect(item.alertas).toContain('CHECKIN_PENDENTE');
    expect(item).toMatchObject({
      natureza_dado: expect.any(String),
      causa: expect.any(String),
      mitigacao_recomendada: expect.any(String),
      decisao: expect.any(String),
    });
    expect(Object.prototype.hasOwnProperty.call(item, 'limite_referencia')).toBe(true);
  });

  it('PROJECAO nunca gera EXIGE_OVERRIDE mesmo quando critica', () => {
    const input = baseInput();
    input.rows.escalas.push({
      data_operacional: '2026-06-21',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '18:00',
      aeronave_prefixo: 'PR-ATX',
      aeronave_modelo: 'AW139',
    });
    input.rows.effectiveness.push({
      data_operacional: '2026-06-21',
      funcionario_id: 10,
      effectiveness_pct: 52,
      effectiveness_nivel: 'VERMELHO',
    });

    const item = buildFrmsOperationalSnapshot(input).items[0];
    expect(item.natureza_dado).toBe('PROJECAO');
    expect(item.snapshot_status).toBe('CRITICO');
    expect(item.decisao).toBe('ALERTA');
  });

  it('item critico realizado pode gerar EXIGE_OVERRIDE', () => {
    const input = baseInput();
    input.rows.jornadas.push({
      data_operacional: '2026-06-19',
      funcionario_id: 10,
      hora_apresentacao: '08:00',
      hora_termino: '18:00',
      horas_voo_minutos: 240,
      duracao_jornada_minutos: 600,
      origem: 'SIGVOOS',
      has_operational_data: 1,
      is_manual_empty: 0,
    });
    input.rows.effectiveness.push({
      data_operacional: '2026-06-19',
      funcionario_id: 10,
      effectiveness_pct: 59,
      effectiveness_nivel: 'VERMELHO',
    });

    const item = buildFrmsOperationalSnapshot(input).items[0];
    expect(item.natureza_dado).toBe('JORNADA_REALIZADA');
    expect(item.snapshot_status).toBe('CRITICO');
    expect(item.decisao).toBe('EXIGE_OVERRIDE');
  });
});
