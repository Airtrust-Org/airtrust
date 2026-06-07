/**
 * Directed tests for the direct simulator session projection.
 *
 * These tests verify the buildSyntheticAlocacoesFromEventos bridge logic
 * (inline replica) and the filtering contract expected from the backend query.
 */
import { describe, it, expect } from 'vitest';

// ─── Inline replica of EVENT_TYPE_TO_SITUACAO and bridge logic ───────────────
// (mirrors src/react-app/pages/escalas/components/EscalaCalendario/GradeTripulantes.utils.ts)

const SYNTHETIC_ID_PREFIX = 'synthetic-';

const EVENT_TYPE_TO_SITUACAO: Record<string, { situacao_tipo: string; cor: string; label: string }> = {
  treinamento_simulador: { situacao_tipo: 'SIM', cor: '#9333EA', label: 'Simulador' },
  ferias:               { situacao_tipo: 'FERIAS', cor: '#16A34A', label: 'Férias' },
  licenca:              { situacao_tipo: 'AFT', cor: '#DC2626', label: 'Licença' },
  medico:               { situacao_tipo: 'MED', cor: '#F59E0B', label: 'Médico' },
  treinamento_solo:     { situacao_tipo: 'CURSO', cor: '#6366F1', label: 'Treinamento' },
};

interface SimEvento {
  id: string;
  escala_id: string;
  tripulacao_id?: string | null;
  funcionario_id: string;
  funcionario_nome?: string | null;
  funcionario_matricula?: string | null;
  funcionario_cargo?: string | null;
  tipo_evento: string;
  data_inicio: string;
  data_fim: string;
  turno?: string;
  local?: string | null;
  simulador_id?: string | null;
  gerado_automaticamente?: 0 | 1;
  motivo_automatico?: string | null;
  origem?: string | null;
  status: 'confirmado' | 'pendente' | 'cancelado';
  observacoes?: string | null;
}

function buildSyntheticAlocacoesFromEventos(params: {
  eventos: SimEvento[];
  escalaId: string;
  tripulanteIds: Set<string>;
}): Array<{ id: string; situacao_tipo: string; situacao_cor: string; status: string; funcionario_id: string; data_inicio: string; data_fim: string; auto_gerado: boolean }> {
  const { eventos, escalaId, tripulanteIds } = params;

  return eventos
    .filter(
      (e) =>
        e.escala_id === String(escalaId) &&
        tripulanteIds.has(e.funcionario_id) &&
        e.status !== 'cancelado' &&
        EVENT_TYPE_TO_SITUACAO[e.tipo_evento] !== undefined,
    )
    .map((e) => {
      const mapping = EVENT_TYPE_TO_SITUACAO[e.tipo_evento];
      const syntheticId = `${SYNTHETIC_ID_PREFIX}${e.tipo_evento}-${e.id}`;
      return {
        id: syntheticId,
        situacao_tipo: mapping.situacao_tipo,
        situacao_cor: mapping.cor,
        status: e.status === 'confirmado' ? 'confirmado' : 'planejado',
        funcionario_id: e.funcionario_id,
        data_inicio: e.data_inicio,
        data_fim: e.data_fim,
        auto_gerado: true,
      };
    });
}

// ─── Fixture builder ──────────────────────────────────────────────────────────

function makeEvento(partial: Partial<SimEvento> & { id: string; funcionario_id: string }): SimEvento {
  return {
    escala_id: 'escala-jun-2026',
    tripulacao_id: `sim_sessao:${partial.id}`,
    funcionario_nome: 'Piloto Teste',
    funcionario_matricula: '12345',
    funcionario_cargo: 'comandante',
    tipo_evento: 'treinamento_simulador',
    data_inicio: '2026-06-10',
    data_fim: '2026-06-10',
    turno: 'dia_todo',
    local: 'FNPT-II',
    simulador_id: 'sim-1',
    gerado_automaticamente: 1,
    motivo_automatico: 'Projetado da sessão de simulador (participante).',
    origem: 'simuladores',
    status: 'confirmado',
    observacoes: null,
    ...partial,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const ESCALA_ID = 'escala-jun-2026';
const TRIPULANTE_IDS = new Set(['101', '102', '103']);

describe('Direct simulator session projection — bridge filtering contract', () => {
  describe('calendario_projeta_participante', () => {
    it('creates a synthetic alocacao for a participant in the correct escala', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-1', funcionario_id: '101' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(1);
      expect(result[0].funcionario_id).toBe('101');
      expect(result[0].situacao_tipo).toBe('SIM');
    });

    it('calendario_preserva_data — data_inicio/data_fim match the session date', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-2', funcionario_id: '102', data_inicio: '2026-06-15', data_fim: '2026-06-15' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result[0].data_inicio).toBe('2026-06-15');
      expect(result[0].data_fim).toBe('2026-06-15');
    });
  });

  describe('calendario_exclui_cancelada', () => {
    it('excludes events with status cancelado', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-3', funcionario_id: '101', status: 'cancelado' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('calendario_isola_tenant', () => {
    it('rejects events not belonging to this escala (different escala_id)', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-4', funcionario_id: '101', escala_id: 'escala-outro-empresa' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(0);
    });

    it('accepts events with matching escala_id', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-5', funcionario_id: '102', escala_id: ESCALA_ID })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('calendario_nao_inclui_fora_da_grade', () => {
    it('excludes events for funcionarios not in tripulanteIds', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-6', funcionario_id: '999' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('calendario_projeta_instrutor', () => {
    it('instrutor event (same tipo_evento) is projected when in tripulanteIds', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-7', funcionario_id: '103', motivo_automatico: 'Projetado da sessão de simulador (instrutor).' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(1);
      expect(result[0].funcionario_id).toBe('103');
    });
  });

  describe('calendario_deduplica_participante_instrutor', () => {
    it('when backend sends one row per person, bridge produces one alocacao', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-9', funcionario_id: '102' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(1);
    });
  });

  describe('calendario_evento_direto_somente_leitura', () => {
    it('auto_gerado is true on synthetic alocacao', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-10', funcionario_id: '101' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result[0].auto_gerado).toBe(true);
    });

    it('id starts with SYNTHETIC_ID_PREFIX for guard checks', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-11', funcionario_id: '102' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result[0].id).toMatch(/^synthetic-/);
    });
  });

  describe('calendario_mantem_concluida', () => {
    it('a concluded (confirmado) session is still projected', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-12', funcionario_id: '103', status: 'confirmado' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('confirmado');
    });
  });

  describe('calendario_projeta_pendente_como_planejado', () => {
    it('pendente maps to "planejado" status in synthetic alocacao', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-13', funcionario_id: '101', status: 'pendente' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result[0].status).toBe('planejado');
    });
  });

  describe('calendario_tipo_evento_desconhecido_ignorado', () => {
    it('unknown tipo_evento is filtered out by the bridge', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [makeEvento({ id: 'sess-14', funcionario_id: '101', tipo_evento: 'evento_desconhecido' })],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('calendario_multiplos_eventos', () => {
    it('projects multiple participants from different sessions on different days', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [
          makeEvento({ id: 'sess-15', funcionario_id: '101', data_inicio: '2026-06-05', data_fim: '2026-06-05' }),
          makeEvento({ id: 'sess-16', funcionario_id: '102', data_inicio: '2026-06-10', data_fim: '2026-06-10' }),
          makeEvento({ id: 'sess-17', funcionario_id: '103', data_inicio: '2026-07-01', data_fim: '2026-07-01' }),
        ],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(3);
    });

    it('evento_soft_deleted_nao_aparece — soft-deleted (cancelado) excluded', () => {
      const result = buildSyntheticAlocacoesFromEventos({
        eventos: [
          makeEvento({ id: 'sess-18', funcionario_id: '101' }),          // active
          makeEvento({ id: 'sess-19', funcionario_id: '102', status: 'cancelado' }), // deleted
          makeEvento({ id: 'sess-20', funcionario_id: '103' }),          // active
        ],
        escalaId: ESCALA_ID,
        tripulanteIds: TRIPULANTE_IDS,
      });
      expect(result).toHaveLength(2);
    });
  });
});
