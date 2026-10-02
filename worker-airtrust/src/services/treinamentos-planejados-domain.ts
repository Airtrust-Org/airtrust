import type { DiaRow, InstrutorRow, ParticipanteRow } from './treinamentos-planejados-expansions';

export const STATUS_VALUES = [
  'PLANEJADO',
  'CONFIRMADO',
  'EM_ANDAMENTO',
  'CONCLUIDO',
  'CANCELADO',
] as const;

export const MODALIDADE_VALUES = [
  'TEORICO',
  'SALA',
  'PRATICO',
  'MISTO',
  'EAD',
  'SIMULADOR',
  'AERONAVE',
  'VOO',
  'CHEQUE',
  'OUTRO',
] as const;

export type EventoRow = {
  id: number;
  empresa_id: number;
  qualificacao_tipo_id: number;
  qualificacao_nome: string | null;
  qualificacao_codigo: string | null;
  programa_treinamento_id: number | null;
  programa_tipo_treinamento: string | null;
  programa_nome: string | null;
  data_prevista: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  status: (typeof STATUS_VALUES)[number];
  instrutor_id: number | null;
  instrutor_nome: string | null;
  instrutor_guerra: string | null;
  local: string | null;
  carga_horaria_prevista: number | null;
  titulo: string | null;
  descricao: string | null;
  observacoes: string | null;
  created_by: number | null;
  created_at: string | null;
  updated_at: string | null;
  codigo_turma: string | null;
  modalidade: (typeof MODALIDADE_VALUES)[number] | null;
  data_inicio: string | null;
  data_fim: string | null;
  base: string | null;
  sala: string | null;
  equipamento_descricao: string | null;
  limite_participantes: number | null;
  convocados_total: number | string | null;
  confirmados_total: number | string | null;
  presentes_total: number | string | null;
};

export type ConsolidatedSource =
  | 'TURMA'
  | 'SIMULADOR'
  | 'QUALIFICACAO_PLANEJADA'
  | 'TREINAMENTOS';

export type ConsolidatedTrainingItem = Omit<
  ReturnType<typeof serializeEvento>,
  'source' | 'source_id' | 'source_route' | 'source_label' | 'read_only'
> & {
  source: ConsolidatedSource;
  source_id: number;
  sessao_id?: number | null;
  source_route: string | null;
  source_label: string;
  read_only: boolean;
};

const SOURCE_VALUES = [
  'TURMA',
  'SIMULADOR',
  'QUALIFICACAO_PLANEJADA',
  'TREINAMENTOS',
] as const;

function serializeParticipante(row: ParticipanteRow) {
  return {
    id: Number(row.id),
    treinamento_id: Number(row.treinamento_id),
    funcionario_id: Number(row.funcionario_id),
    funcionario_nome: row.funcionario_nome,
    funcionario_guerra: row.funcionario_guerra,
    funcionario_matricula: row.funcionario_matricula,
    funcionario_email: row.funcionario_email,
    funcionario_setor: row.funcionario_setor,
    funcionario_funcao: row.funcionario_funcao,
    confirmado: Number(row.confirmado || 0) === 1,
    presente:
      row.presente === null || row.presente === undefined ? null : Number(row.presente) === 1,
    aprovado:
      row.aprovado === null || row.aprovado === undefined ? null : Number(row.aprovado) === 1,
    nota: row.nota === null || row.nota === undefined ? null : Number(row.nota),
    observacoes: row.observacoes,
    qualificacao_historico_id: row.qualificacao_historico_id,
    qualificacao_historico_status: row.qualificacao_historico_status,
    status_participacao: row.status_participacao || 'MATRICULADO',
    resultado: row.resultado,
    conceito: row.conceito,
    data_conclusao_efetiva: row.data_conclusao_efetiva,
    concluido_em: row.concluido_em,
  };
}

export function serializeEvento(
  row: EventoRow,
  participantes: ParticipanteRow[],
  dias: DiaRow[],
  instrutores: InstrutorRow[],
) {
  return {
    id: Number(row.id),
    empresa_id: Number(row.empresa_id),
    qualificacao_tipo_id: Number(row.qualificacao_tipo_id),
    qualificacao_nome: row.qualificacao_nome,
    qualificacao_codigo: row.qualificacao_codigo,
    programa_treinamento_id: row.programa_treinamento_id,
    programa_tipo_treinamento: row.programa_tipo_treinamento,
    programa_nome: row.programa_nome,
    data_prevista: row.data_prevista,
    hora_inicio: row.hora_inicio,
    hora_fim: row.hora_fim,
    status: row.status,
    instrutor_id: row.instrutor_id,
    instrutor_nome: row.instrutor_nome,
    instrutor_guerra: row.instrutor_guerra,
    local: row.local,
    carga_horaria_prevista:
      row.carga_horaria_prevista === null || row.carga_horaria_prevista === undefined
        ? null
        : Number(row.carga_horaria_prevista),
    titulo: row.titulo,
    descricao: row.descricao,
    observacoes: row.observacoes,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    codigo_turma: row.codigo_turma,
    modalidade: row.modalidade || 'TEORICO',
    data_inicio: row.data_inicio || row.data_prevista,
    data_fim: row.data_fim || row.data_prevista,
    base: row.base,
    sala: row.sala,
    equipamento_descricao: row.equipamento_descricao,
    limite_participantes: row.limite_participantes,
    convocados_total: Number(row.convocados_total || 0),
    confirmados_total: Number(row.confirmados_total || 0),
    presentes_total: Number(row.presentes_total || 0),
    participantes: participantes.map(serializeParticipante),
    dias,
    instrutores: instrutores.map((instrutor) => ({
      funcionario_id: Number(instrutor.funcionario_id),
      nome: instrutor.nome,
      guerra: instrutor.guerra,
      papel: instrutor.papel,
      principal: Number(instrutor.principal || 0) === 1,
    })),
    source: 'TURMA' as const,
    source_id: Number(row.id),
    source_route: '/treinamentos/planejados',
    source_label: 'Turma',
    read_only: false,
  };
}

const VIRTUAL_ID_OFFSETS = {
  QUALIFICACAO_PLANEJADA: 1000000000,
  SIMULADOR: 2000000000,
} as const;

export function toVirtualId(
  source: 'QUALIFICACAO_PLANEJADA' | 'SIMULADOR',
  sourceId: number,
): number {
  return -1 * (VIRTUAL_ID_OFFSETS[source] + sourceId);
}

export function isFinalResultado(resultado: string | null | undefined): boolean {
  return ['APROVADO', 'REPROVADO', 'CANCELADO'].includes(
    String(resultado || '')
      .trim()
      .toUpperCase(),
  );
}

export function isHistoricoGerado(status: string | null | undefined): boolean {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  return Boolean(normalized) && !['PLANEJADA', 'PLANEJADO'].includes(normalized);
}

export function normalizeSourceFilter(
  raw: string | null | undefined,
): ConsolidatedSource | null {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase();
  return SOURCE_VALUES.includes(normalized as ConsolidatedSource)
    ? (normalized as ConsolidatedSource)
    : null;
}

export function sortConsolidatedItems(
  items: ConsolidatedTrainingItem[],
): ConsolidatedTrainingItem[] {
  return [...items].sort((left, right) => {
    const leftKey = `${left.data_prevista} ${left.hora_inicio || '99:99'} ${left.id}`;
    const rightKey = `${right.data_prevista} ${right.hora_inicio || '99:99'} ${right.id}`;
    return leftKey.localeCompare(rightKey);
  });
}

export function sortEventoRows(rows: EventoRow[]): EventoRow[] {
  return [...rows].sort((left, right) => {
    const byDate = String(left.data_prevista || '').localeCompare(
      String(right.data_prevista || ''),
    );
    if (byDate) return byDate;
    const byTime = String(left.hora_inicio || '00:00').localeCompare(
      String(right.hora_inicio || '00:00'),
    );
    return byTime || Number(right.id) - Number(left.id);
  });
}
