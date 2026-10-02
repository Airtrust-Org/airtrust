import { describe, expect, it } from 'vitest';
import {
  isFinalResultado,
  isHistoricoGerado,
  normalizeSourceFilter,
  serializeEvento,
  sortEventoRows,
  toVirtualId,
  type EventoRow,
} from '../../services/treinamentos-planejados-domain';

function evento(overrides: Partial<EventoRow> = {}): EventoRow {
  return {
    id: 7,
    empresa_id: 1,
    qualificacao_tipo_id: 10,
    qualificacao_nome: 'CRM',
    qualificacao_codigo: 'CRM',
    programa_treinamento_id: null,
    programa_tipo_treinamento: null,
    programa_nome: null,
    data_prevista: '2026-10-02',
    hora_inicio: '08:00',
    hora_fim: '10:00',
    status: 'PLANEJADO',
    instrutor_id: null,
    instrutor_nome: null,
    instrutor_guerra: null,
    local: null,
    carga_horaria_prevista: 2,
    titulo: 'CRM',
    descricao: null,
    observacoes: null,
    created_by: 1,
    created_at: null,
    updated_at: null,
    codigo_turma: null,
    modalidade: null,
    data_inicio: null,
    data_fim: null,
    base: null,
    sala: null,
    equipamento_descricao: null,
    limite_participantes: null,
    convocados_total: '2',
    confirmados_total: 1,
    presentes_total: null,
    ...overrides,
  };
}

describe('treinamentos planejados domain helpers', () => {
  it('preserva defaults e normalização do serializer da turma', () => {
    const serialized = serializeEvento(evento(), [], [], []);
    expect(serialized).toMatchObject({
      id: 7,
      modalidade: 'TEORICO',
      data_inicio: '2026-10-02',
      data_fim: '2026-10-02',
      convocados_total: 2,
      confirmados_total: 1,
      presentes_total: 0,
      source: 'TURMA',
      source_route: '/treinamentos/planejados',
      read_only: false,
    });
  });

  it('mantém IDs virtuais estáveis e separados por origem', () => {
    expect(toVirtualId('QUALIFICACAO_PLANEJADA', 9)).toBe(-1000000009);
    expect(toVirtualId('SIMULADOR', 9)).toBe(-2000000009);
  });

  it('normaliza filtros apenas para origens suportadas', () => {
    expect(normalizeSourceFilter(' simulador ')).toBe('SIMULADOR');
    expect(normalizeSourceFilter('treinamentos')).toBe('TREINAMENTOS');
    expect(normalizeSourceFilter('desconhecido')).toBeNull();
  });

  it('mantém critérios finais e histórico gerado', () => {
    expect(isFinalResultado(' aprovado ')).toBe(true);
    expect(isFinalResultado('INCOMPLETO')).toBe(false);
    expect(isHistoricoGerado('REALIZADA')).toBe(true);
    expect(isHistoricoGerado('PLANEJADA')).toBe(false);
  });

  it('ordena eventos por data, hora e id de forma determinística', () => {
    const sorted = sortEventoRows([
      evento({ id: 1, data_prevista: '2026-10-03', hora_inicio: '08:00' }),
      evento({ id: 2, data_prevista: '2026-10-02', hora_inicio: '09:00' }),
      evento({ id: 3, data_prevista: '2026-10-02', hora_inicio: '09:00' }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual([3, 2, 1]);
  });
});
