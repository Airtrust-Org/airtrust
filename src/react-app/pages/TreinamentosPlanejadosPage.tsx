import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Edit2,
  Eye,
  FileClock,
  Flag,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { DropdownMenu, type DropdownMenuItem } from '@/react-app/components/UI/DropdownMenu';
import PageHeader from '@/react-app/components/PageHeader';
import TimeInput from '@/react-app/components/TimeInput';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';
import ModalNovaSessao from '@/react-app/components/modals/ModalNovaSessao';
import { MultiSelect, type MultiSelectOption } from '@/react-app/components/UI/MultiSelect';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { useApi } from '@/react-app/hooks/useApi';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useFuncionariosAtivos } from '@/react-app/hooks/qualificacoes/useFuncionariosAtivos';
import { useTiposQualificacao } from '@/react-app/hooks/qualificacoes/useTiposQualificacao';
import {
  useAtualizarPresencaDiaTreinamento,
  useAtualizarTreinamentoPlanejado,
  useConcluirTurmaTreinamento,
  useCriarTreinamentoPlanejado,
  useEnviarConvocacaoTreinamento,
  useExcluirTreinamentoPlanejado,
  usePreviewConvocacaoTreinamento,
  useReenviarConvocacaoTreinamento,
  useTreinamentoPlanejadoDetalhe,
  useTreinamentosPlanejados,
  useTreinamentosPlanejadosAuditoria,
  useTreinamentosPlanejadosCalendario,
  type TreinamentoPlanejadoConclusaoLoteParticipanteInput,
  type TreinamentoPlanejado,
  type TreinamentoPlanejadoConvocacaoPreview,
  type TreinamentoPlanejadoConvocacaoResultado,
  type TreinamentoPlanejadoDia,
  type TreinamentoPlanejadoParticipante,
  type TreinamentoPlanejadoPresencaDiaStatus,
  type TreinamentoPlanejadoStatus,
} from '@/react-app/hooks/useTreinamentosPlanejados';
import { normalizeTimeInput } from '@/react-app/lib/time-input';
import { getTodayYmdInTz, formatWithSystemTZ } from '@/react-app/utils/timezone';

type AbaAtiva = 'calendario' | 'quadro' | 'auditoria';

interface FuncionarioOption {
  id: number;
  nome: string;
  guerra?: string | null;
  matricula?: string | null;
  setor?: string | null;
  funcao?: string | null;
  is_instrutor?: boolean | number | null;
}

interface TipoQualificacaoOption {
  id: number;
  nome: string;
  codigo?: string | null;
  categoria?: string | null;
  carga_horaria_inicial?: number | null;
  carga_horaria_recorrente?: number | null;
}

// Palavras-chave que indicam público de Tripulação (voo)
const PALAVRAS_TRIPULACAO = [
  'tripulação',
  'tripulacao',
  'piloto',
  'copiloto',
  'comandante',
  'pio',
  'sic',
  'pic',
  'voo',
  'aeronauta',
  'cabin',
  'comissário',
  'comissario',
  'purser',
];

// Palavras-chave que indicam público de Manutenção
const PALAVRAS_MANUTENCAO = [
  'manutenção',
  'manutencao',
  'mecânico',
  'mecanico',
  'técnico',
  'tecnico',
  'mec',
  'maintenance',
  'avionico',
  'avionics',
  'linha',
  'hangar',
];

/**
 * Determina o tipo de público de uma qualificação com base em sua categoria e nome.
 * Retorna 'TRIPULACAO', 'MANUTENCAO' ou null (indeterminado).
 */
function determinarPublicoQualificacao(
  tipoId?: string,
  tiposQualificacao?: TipoQualificacaoOption[],
): 'TRIPULACAO' | 'MANUTENCAO' | null {
  if (!tipoId || !tiposQualificacao) return null;
  const tipo = tiposQualificacao.find((t) => String(t.id) === String(tipoId));
  if (!tipo) return null;

  const textoBase = [tipo.categoria, tipo.nome, tipo.codigo]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const matchesTripulacao = PALAVRAS_TRIPULACAO.some((palavra) => textoBase.includes(palavra));
  const matchesManutencao = PALAVRAS_MANUTENCAO.some((palavra) => textoBase.includes(palavra));

  if (matchesTripulacao && !matchesManutencao) return 'TRIPULACAO';
  if (matchesManutencao && !matchesTripulacao) return 'MANUTENCAO';
  return null;
}

// Palavras-chave de funções/setores para Tripulação
const FUNCAO_TRIPULACAO = [
  'piloto',
  'comandante',
  'copiloto',
  'purser',
  'comissário',
  'comissario',
  'aeronauta',
  'cabin crew',
  'pic',
  'sic',
];

// Palavras-chave de funções/setores para Manutenção
const FUNCAO_MANUTENCAO = [
  'manutenção',
  'manutencao',
  'mecânico',
  'mecanico',
  'técnico',
  'tecnico',
  'mec ',
  'linha ',
  'hangar',
  'avionico',
];

/**
 * Verifica se um funcionário é elegível para um tipo de público.
 */
function funcionarioElegivelParaPublico(
  funcionario: FuncionarioOption,
  publico: 'TRIPULACAO' | 'MANUTENCAO',
): boolean {
  const texto = [funcionario.funcao, funcionario.setor]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  if (publico === 'TRIPULACAO') {
    return FUNCAO_TRIPULACAO.some((kw) => texto.includes(kw));
  }
  return FUNCAO_MANUTENCAO.some((kw) => texto.includes(kw));
}

interface TreinamentoFormState {
  qualificacao_tipo_id: string;
  titulo: string;
  descricao: string;
  observacoes: string;
  local: string;
  data_prevista: string;
  data_fim: string;
  hora_inicio: string;
  hora_fim: string;
  instrutor_id: string;
  carga_horaria_prevista: string;
  status: TreinamentoPlanejadoStatus;
  participante_ids: number[];
  codigo_turma: string;
  modalidade:
    | 'TEORICO'
    | 'SALA'
    | 'PRATICO'
    | 'MISTO'
    | 'EAD'
    | 'SIMULADOR'
    | 'AERONAVE'
    | 'VOO'
    | 'CHEQUE'
    | 'OUTRO';
  base: string;
  sala: string;
  equipamento_descricao: string;
  limite_participantes: string;
  tipo_treinamento: 'INICIAL' | 'RECORRENTE';
  dias: Array<{ data: string; hora_inicio: string; hora_fim: string }>;
}

interface SessaoSimuladorParaEditar {
  id: number;
  template_id?: number | null;
  simulador_id?: number | null;
  simulador_nome?: string;
  simulador_modelo?: string;
  data: string;
  horario_inicio: string;
  horario_fim: string;
  instrutor_id: number;
  instrutor_nome?: string;
  tipo_sessao: string;
  tipo_sessao_id?: number | null;
  tipo_sessao_codigo?: string | null;
  tipo_aeronave?: string;
  tipo_dispositivo?: 'SIMULADOR' | 'AERONAVE';
  aeronave_id?: number | null;
  aeronave_prefixo?: string;
  aeronave_modelo?: string;
  tema_sessao?: string;
  observacoes?: string;
  examinador_id?: number | null;
  participantes?: Array<{
    funcionario_id: number;
    funcao?: 'PIC' | 'SIC';
  }>;
  fichas?: Array<{ id: number }>;
}

interface ConclusaoParticipanteDraft {
  funcionario_id: number;
  presente: boolean | null;
  resultado: 'APROVADO' | 'REPROVADO' | 'INCOMPLETO' | 'CANCELADO' | null;
  nota: number | null;
  conceito: string | null;
  observacoes: string | null;
  data_conclusao_efetiva: string | null;
}

// Status que representam turmas encerradas — ocultas por padrão na listagem operacional
const STATUS_ENCERRADOS = new Set<string>(['CONCLUIDO', 'CANCELADO']);

const STATUS_META: Record<TreinamentoPlanejadoStatus, { label: string; className: string }> = {
  PLANEJADO: {
    label: 'Planejado',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  },
  CONFIRMADO: {
    label: 'Confirmado',
    className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  },
  EM_ANDAMENTO: {
    label: 'Em andamento',
    className: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  },
  CONCLUIDO: {
    label: 'Concluido',
    className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
  CANCELADO: {
    label: 'Cancelado',
    className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  },
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos os status' },
  { value: 'PLANEJADO', label: 'Planejado' },
  { value: 'CONFIRMADO', label: 'Confirmado' },
  { value: 'EM_ANDAMENTO', label: 'Em andamento' },
  { value: 'CONCLUIDO', label: 'Concluido' },
  { value: 'CANCELADO', label: 'Cancelado' },
];

const PRESENCA_DIA_OPTIONS: Array<{
  value: TreinamentoPlanejadoPresencaDiaStatus;
  label: string;
  className: string;
}> = [
  {
    value: 'PRESENTE',
    label: 'Presente',
    className: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  },
  {
    value: 'AUSENTE',
    label: 'Ausente',
    className: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  },
  {
    value: 'PARCIAL',
    label: 'Parcial',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  },
  {
    value: 'DISPENSADO',
    label: 'Dispensado',
    className: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  },
  {
    value: 'PENDENTE',
    label: 'Pendente',
    className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
  },
];

function getTodayYmd(): string {
  return getTodayYmdInTz();
}

function normalizeText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatDateLabel(value?: string | null): string {
  if (!value) return 'Sem data';
  // Parse as UTC noon to avoid date-shifting when formatting in configured timezone.
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return formatWithSystemTZ(date, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateRange(inicio?: string | null, fim?: string | null): string {
  if (!inicio) return 'Sem data';
  const label = formatDateLabel(inicio);
  if (!fim || fim === inicio) return label;
  return `${label} → ${formatDateLabel(fim)}`;
}

function formatDateTimeLabel(value?: string | null): string {
  if (!value) return 'Sem registro';
  // Backend timestamps from auditoria are now ISO 8601 UTC (strftime with Z).
  // Legacy space-separated SQLite format treated as UTC for correctness.
  const normalized = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return value;
  return formatWithSystemTZ(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMonthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const date = new Date(`${month}-01T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatHourRange(inicio?: string | null, fim?: string | null): string {
  if (inicio && fim) return `${inicio} - ${fim}`;
  if (inicio) return `Inicio ${inicio}`;
  if (fim) return `Fim ${fim}`;
  return 'Horario a definir';
}

function isResultadoFinal(resultado?: string | null): boolean {
  return ['APROVADO', 'REPROVADO', 'CANCELADO'].includes(
    String(resultado || '')
      .trim()
      .toUpperCase(),
  );
}

function isHistoricoGerado(status?: string | null): boolean {
  const normalized = String(status || '')
    .trim()
    .toUpperCase();
  return Boolean(normalized) && !['PLANEJADA', 'PLANEJADO'].includes(normalized);
}

function buildConclusaoDraft(
  participante: TreinamentoPlanejadoParticipante,
  defaultDate: string,
): ConclusaoParticipanteDraft {
  return {
    funcionario_id: participante.funcionario_id,
    presente: participante.presente ?? null,
    resultado: participante.resultado ?? null,
    nota: participante.nota ?? null,
    conceito: participante.conceito ?? null,
    observacoes: participante.observacoes ?? null,
    data_conclusao_efetiva:
      participante.resultado === 'APROVADO'
        ? participante.data_conclusao_efetiva || defaultDate
        : (participante.data_conclusao_efetiva ?? null),
  };
}

function calcularMinutosPrevistos(inicio?: string | null, fim?: string | null): number | null {
  if (!inicio || !fim) return null;
  const [inicioHora, inicioMinuto] = inicio.split(':').map(Number);
  const [fimHora, fimMinuto] = fim.split(':').map(Number);
  if (![inicioHora, inicioMinuto, fimHora, fimMinuto].every(Number.isFinite)) return null;
  const minutos = fimHora * 60 + fimMinuto - (inicioHora * 60 + inicioMinuto);
  return minutos > 0 ? minutos : null;
}

function getPresencaDia(
  dia: TreinamentoPlanejadoDia | null,
  funcionarioId: number,
): NonNullable<TreinamentoPlanejadoDia['presencas']>[number] | null {
  return (
    dia?.presencas?.find((presenca) => Number(presenca.funcionario_id) === Number(funcionarioId)) ||
    null
  );
}

function getPresencaDiaMeta(status: TreinamentoPlanejadoPresencaDiaStatus) {
  return PRESENCA_DIA_OPTIONS.find((option) => option.value === status) || PRESENCA_DIA_OPTIONS[4];
}

function getParticipantNames(item: TreinamentoPlanejado): string[] {
  return [
    ...new Set(
      (item.participantes || [])
        .map((participant) =>
          (participant.funcionario_guerra || participant.funcionario_nome)?.trim(),
        )
        .filter((name): name is string => Boolean(name)),
    ),
  ];
}

function getEventoTitulo(item: TreinamentoPlanejado): string {
  const participantNames = getParticipantNames(item);
  const linkedParticipantNames = [
    ...new Set(
      (item.participantes || [])
        .filter((participant) => Boolean(participant.qualificacao_historico_id))
        .map((participant) =>
          (participant.funcionario_guerra || participant.funcionario_nome)?.trim(),
        )
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const qualificationLabel = item.qualificacao_nome?.trim() || item.qualificacao_codigo?.trim();

  if (item.source === 'QUALIFICACAO_PLANEJADA' && qualificationLabel) {
    return participantNames[0]
      ? `${participantNames[0]} — ${qualificationLabel}`
      : qualificationLabel;
  }

  if (item.source === 'SIMULADOR' && qualificationLabel && linkedParticipantNames.length > 0) {
    const leadName = linkedParticipantNames[0];
    const extraCount = linkedParticipantNames.length - 1;
    return `${leadName}${extraCount > 0 ? ` +${extraCount}` : ''} — ${qualificationLabel}`;
  }

  return item.titulo?.trim() || item.qualificacao_nome || 'Treinamento planejado';
}

function getEventoParticipantSummary(item: TreinamentoPlanejado): string | null {
  const participantNames = getParticipantNames(item);
  if (participantNames.length === 0) return null;
  if (participantNames.length <= 2) return participantNames.join(' • ');
  return `${participantNames.slice(0, 2).join(' • ')} +${participantNames.length - 2}`;
}

function getEventoLinkedSessionLabel(item: TreinamentoPlanejado): string | null {
  if (item.source !== 'SIMULADOR') return null;
  if (!item.titulo?.trim()) return null;
  const enrichedTitle = getEventoTitulo(item);
  return enrichedTitle === item.titulo.trim() ? null : item.titulo.trim();
}

function getSimulatorSessionId(item: TreinamentoPlanejado): number | null {
  if (item.source !== 'SIMULADOR') return null;
  const rootId = Number(item.sessao_id || 0);
  if (Number.isInteger(rootId) && rootId > 0) return rootId;
  const dayId = Number(
    (item.dias || []).find((dia) => Number(dia.sessao_id || 0) > 0)?.sessao_id || 0,
  );
  if (Number.isInteger(dayId) && dayId > 0) return dayId;
  const sourceId = Number(item.source_id || 0);
  return Number.isInteger(sourceId) && sourceId > 0 ? sourceId : null;
}

function mapTreinamentoToSessaoSimulador(
  item: TreinamentoPlanejado,
): SessaoSimuladorParaEditar | null {
  const sessaoId = getSimulatorSessionId(item);
  if (!sessaoId) return null;

  const firstActiveDay =
    (item.dias || []).find((dia) => dia.status !== 'CANCELADO') || (item.dias || [])[0] || null;
  const equipamento = item.equipamento_descricao || item.local || undefined;

  return {
    id: sessaoId,
    simulador_id: firstActiveDay?.simulador_id ?? null,
    simulador_nome: equipamento,
    simulador_modelo: equipamento,
    data: item.data_prevista,
    horario_inicio: item.hora_inicio || firstActiveDay?.hora_inicio || '',
    horario_fim: item.hora_fim || firstActiveDay?.hora_fim || '',
    instrutor_id: Number(item.instrutor_id || firstActiveDay?.instrutor_id || 0),
    instrutor_nome:
      item.instrutor_nome || item.instrutor_guerra || firstActiveDay?.instrutor_nome || undefined,
    tipo_sessao: item.titulo || item.qualificacao_nome || 'Sessão de treinamento',
    tipo_dispositivo: item.modalidade === 'AERONAVE' ? 'AERONAVE' : 'SIMULADOR',
    aeronave_id: firstActiveDay?.aeronave_id ?? null,
    tipo_aeronave: item.qualificacao_codigo || equipamento,
    tema_sessao: item.titulo || item.qualificacao_nome || undefined,
    observacoes: item.observacoes || item.descricao || undefined,
    participantes: (item.participantes || []).map((participante, index) => ({
      funcionario_id: participante.funcionario_id,
      funcao: index === 0 ? 'PIC' : 'SIC',
    })),
    fichas: [],
  };
}

function getPessoaLabel(
  nome?: string | null,
  guerra?: string | null,
  matricula?: string | null,
): string {
  const principal = guerra?.trim() || nome?.trim() || 'Nao informado';
  return matricula ? `${principal} · ${matricula}` : principal;
}

function getConvocacaoDisabledReason(treinamento?: TreinamentoPlanejado | null): string | null {
  if (!treinamento) return 'Carregando detalhes da turma';
  if ((treinamento.participantes || []).length === 0) {
    return 'A turma não possui participantes matriculados';
  }
  if (!treinamento.data_prevista) {
    return 'A turma não possui data definida';
  }
  if (treinamento.status === 'CONCLUIDO' || treinamento.status === 'CANCELADO') {
    return 'A turma já foi encerrada/concluída';
  }
  return null;
}

function getMonthRange(month: string): { inicio?: string; fim?: string } {
  if (!/^\d{4}-\d{2}$/.test(month)) return {};
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(year, monthNumber - 1, 1);
  const end = new Date(year, monthNumber, 0);

  const format = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  return {
    inicio: format(start),
    fim: format(end),
  };
}

function buildTrainingDays(start: string, end: string, horaInicio: string, horaFim: string) {
  if (!start || !end || end < start) return [];
  const result: Array<{ data: string; hora_inicio: string; hora_fim: string }> = [];
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last && result.length < 90) {
    result.push({
      data: cursor.toISOString().slice(0, 10),
      hora_inicio: horaInicio,
      hora_fim: horaFim,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function buildCalendarCells(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return [] as Array<{ date: string; outside: boolean }>;
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const lastDay = new Date(year, monthNumber, 0);
  const offset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const cells: Array<{ date: string; outside: boolean }> = [];

  const format = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  for (let index = offset; index > 0; index -= 1) {
    const date = new Date(year, monthNumber - 1, 1 - index);
    cells.push({ date: format(date), outside: true });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthNumber - 1, day);
    cells.push({ date: format(date), outside: false });
  }

  while (cells.length % 7 !== 0 || cells.length < 35) {
    const lastDate = new Date(`${cells[cells.length - 1].date}T12:00:00`);
    lastDate.setDate(lastDate.getDate() + 1);
    cells.push({ date: format(lastDate), outside: true });
  }

  return cells;
}

function createEmptyForm(today: string): TreinamentoFormState {
  return {
    qualificacao_tipo_id: '',
    titulo: '',
    descricao: '',
    observacoes: '',
    local: '',
    data_prevista: today,
    data_fim: today,
    hora_inicio: '08:00',
    hora_fim: '17:00',
    instrutor_id: '',
    carga_horaria_prevista: '',
    status: 'PLANEJADO',
    participante_ids: [],
    codigo_turma: '',
    modalidade: 'TEORICO',
    base: '',
    sala: '',
    equipamento_descricao: '',
    limite_participantes: '',
    tipo_treinamento: 'RECORRENTE',
    dias: [{ data: today, hora_inicio: '08:00', hora_fim: '17:00' }],
  };
}

function mapTreinamentoToForm(item: TreinamentoPlanejado): TreinamentoFormState {
  return {
    qualificacao_tipo_id: String(item.qualificacao_tipo_id),
    titulo: item.titulo || '',
    descricao: item.descricao || '',
    observacoes: item.observacoes || '',
    local: item.local || '',
    data_prevista: item.data_prevista,
    data_fim: item.data_fim || item.data_prevista,
    hora_inicio: item.hora_inicio || '08:00',
    hora_fim: item.hora_fim || '17:00',
    instrutor_id: item.instrutor_id ? String(item.instrutor_id) : '',
    carga_horaria_prevista:
      item.carga_horaria_prevista === null || item.carga_horaria_prevista === undefined
        ? ''
        : String(item.carga_horaria_prevista),
    status: item.status,
    participante_ids: item.participantes.map((participante) => participante.funcionario_id),
    codigo_turma: item.codigo_turma || '',
    modalidade: item.modalidade || 'TEORICO',
    base: item.base || '',
    sala: item.sala || '',
    equipamento_descricao: item.equipamento_descricao || '',
    limite_participantes: item.limite_participantes ? String(item.limite_participantes) : '',
    tipo_treinamento: 'RECORRENTE',
    dias:
      item.dias && item.dias.length > 0
        ? item.dias
            .filter((dia) => dia.status !== 'CANCELADO')
            .map((dia) => ({
              data: dia.data,
              hora_inicio: dia.hora_inicio,
              hora_fim: dia.hora_fim,
            }))
        : [
            {
              data: item.data_prevista,
              hora_inicio: item.hora_inicio || '08:00',
              hora_fim: item.hora_fim || '17:00',
            },
          ],
  };
}

function StatCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: JSX.Element;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          <p className="mt-1 text-sm text-slate-500">{helper}</p>
        </div>
        <div className="rounded-xl bg-slate-100 p-2 text-slate-600">{icon}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TreinamentoPlanejadoStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

interface TreinamentosPlanejadosPageProps {
  asTab?: boolean;
  forcedTab?: AbaAtiva;
  hideTabNav?: boolean;
  hideActions?: boolean;
  sourceFilter?: 'TURMA' | 'SIMULADOR' | 'QUALIFICACAO_PLANEJADA' | 'TREINAMENTOS';
  autoOpenForm?: boolean;
  onAutoOpenFormHandled?: () => void;
  initialSetorIds?: number[];
}

export default function TreinamentosPlanejadosPage({
  asTab = false,
  forcedTab,
  hideTabNav = false,
  hideActions = false,
  sourceFilter,
  autoOpenForm = false,
  onAutoOpenFormHandled,
  initialSetorIds,
}: TreinamentosPlanejadosPageProps) {
  const { can, isAdmin, isGestor, isInstrutor, isAluno } = usePermissions();
  const navigate = useNavigate();
  const canManage = !isAluno && (isAdmin || isGestor || isInstrutor || can('qualificacoes.view'));
  const canWriteTraining = !isAluno && (isAdmin || isGestor || can('qualificacoes.edit'));
  const canConcluirTurma = canWriteTraining;

  const today = useMemo(() => getTodayYmd(), []);
  const [abaAtiva, setAbaAtiva] = useState<AbaAtiva>(forcedTab || 'calendario');
  const [mesReferencia, setMesReferencia] = useState(today.slice(0, 7));
  const [statusFiltro, setStatusFiltro] = useState('');
  // Por padrão, turmas CONCLUIDO e CANCELADO ficam ocultas na listagem operacional.
  // O usuário pode ativá-las individualmente via filtro de status.
  const [mostrarEncerrados, setMostrarEncerrados] = useState(false);
  const [instrutorFiltro, setInstrutorFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaConvocados, setBuscaConvocados] = useState('');
  const [setorFilter, setSetorFilter] = useState<string[]>(
    () => initialSetorIds?.map(String) ?? [],
  );
  const [modalFormularioAberto, setModalFormularioAberto] = useState(false);
  const [modalDetalheAberto, setModalDetalheAberto] = useState(false);
  const [modalSessaoSimuladorAberto, setModalSessaoSimuladorAberto] = useState(false);
  const [modalConfirmacaoConvocacaoAberto, setModalConfirmacaoConvocacaoAberto] = useState(false);
  const [modalConfirmacaoConclusaoAberto, setModalConfirmacaoConclusaoAberto] = useState(false);
  const [modalResultadoConvocacaoAberto, setModalResultadoConvocacaoAberto] = useState(false);
  const [trilhaRecenteAberta, setTrilhaRecenteAberta] = useState(false);
  const [gerandoListaPresencaTurma, setGerandoListaPresencaTurma] = useState(false);
  const [treinamentoEditando, setTreinamentoEditando] = useState<TreinamentoPlanejado | null>(null);
  const [treinamentoSelecionadoId, setTreinamentoSelecionadoId] = useState<number | null>(null);
  const [sessaoSimuladorEditando, setSessaoSimuladorEditando] =
    useState<SessaoSimuladorParaEditar | null>(null);
  const [diaPresencaSelecionadoId, setDiaPresencaSelecionadoId] = useState<number | null>(null);
  const [formState, setFormState] = useState<TreinamentoFormState>(() => createEmptyForm(today));
  const [conclusaoDraft, setConclusaoDraft] = useState<Record<number, ConclusaoParticipanteDraft>>(
    {},
  );
  const [convocacaoPreview, setConvocacaoPreview] =
    useState<TreinamentoPlanejadoConvocacaoPreview | null>(null);
  const [convocacaoResultado, setConvocacaoResultado] =
    useState<TreinamentoPlanejadoConvocacaoResultado | null>(null);
  const [confirmarReenvio, setConfirmarReenvio] = useState(false);
  const [ignorarSemEmail, setIgnorarSemEmail] = useState(false);
  const [gestoresCcSelecionadosIds, setGestoresCcSelecionadosIds] = useState<number[]>([]);
  const buscaAdiada = useDeferredValue(busca.trim());
  const buscaConvocadosAdiada = useDeferredValue(buscaConvocados.trim().toLowerCase());

  const { data: funcionarios = [], isLoading: funcionariosLoading } = useFuncionariosAtivos();
  const { data: tiposQualificacao = [], isLoading: tiposLoading } = useTiposQualificacao();

  const { data: setoresData } = useApi<{ data?: Array<{ id: number; nome: string }> }>('/setores', {
    requireAuth: true,
    bypassGetCache: true,
  });
  const setorOptions = useMemo<MultiSelectOption[]>(() => {
    const raw = Array.isArray(setoresData)
      ? (setoresData as Array<{ id: number; nome: string }>)
      : (setoresData?.data ?? []);
    return raw.map((s) => ({ value: String(s.id), label: s.nome }));
  }, [setoresData]);

  // Sync local filter when parent provides a new initial value (e.g. auto-select for managers).
  const prevInitialRef = useRef<string>('');
  useEffect(() => {
    const next = (initialSetorIds ?? []).join(',');
    if (next !== prevInitialRef.current) {
      prevInitialRef.current = next;
      if (initialSetorIds && initialSetorIds.length > 0) {
        setSetorFilter(initialSetorIds.map(String));
      }
    }
  }, [initialSetorIds]);

  // Auto-select the single setor when the user has access to exactly one.
  useEffect(() => {
    if (setorOptions.length === 1 && setorFilter.length === 0) {
      setSetorFilter([setorOptions[0].value]);
    }
  }, [setorOptions, setorFilter.length]);

  const monthRange = useMemo(() => getMonthRange(mesReferencia), [mesReferencia]);
  const filtrosComuns = useMemo(
    () => ({
      status: statusFiltro || undefined,
      instrutor_id: instrutorFiltro ? Number(instrutorFiltro) : undefined,
      busca: buscaAdiada || undefined,
      inicio: monthRange.inicio,
      fim: monthRange.fim,
      source: sourceFilter,
      setor_ids: setorFilter.length > 0 ? setorFilter.map(Number) : undefined,
    }),
    [
      buscaAdiada,
      instrutorFiltro,
      monthRange.fim,
      monthRange.inicio,
      setorFilter,
      sourceFilter,
      statusFiltro,
    ],
  );

  const treinamentosQuery = useTreinamentosPlanejados(filtrosComuns);
  const calendarioQuery = useTreinamentosPlanejadosCalendario({
    mes: mesReferencia,
    status: statusFiltro || undefined,
    instrutor_id: instrutorFiltro ? Number(instrutorFiltro) : undefined,
    source: sourceFilter,
    setor_ids: setorFilter.length > 0 ? setorFilter.map(Number) : undefined,
  });
  const auditoriaQuery = useTreinamentosPlanejadosAuditoria(filtrosComuns);
  const detalheQuery = useTreinamentoPlanejadoDetalhe(treinamentoSelecionadoId);

  const criarTreinamento = useCriarTreinamentoPlanejado();
  const atualizarTreinamento = useAtualizarTreinamentoPlanejado();
  const atualizarPresencaDia = useAtualizarPresencaDiaTreinamento();
  const concluirTurma = useConcluirTurmaTreinamento();
  const excluirTreinamento = useExcluirTreinamentoPlanejado();
  const previewConvocacao = usePreviewConvocacaoTreinamento();
  const enviarConvocacao = useEnviarConvocacaoTreinamento();
  const reenviarConvocacao = useReenviarConvocacaoTreinamento();

  // Quando nenhum filtro de status específico está ativo, oculta CONCLUIDO/CANCELADO por padrão.
  // O usuário pode ver esses status selecionando-os explicitamente no filtro ou ativando "Mostrar encerrados".
  const listaTreinamentos = useMemo(() => {
    const items = treinamentosQuery.data?.items || [];
    if (statusFiltro) return items; // filtro explícito ativo — respeita sem alterar
    if (mostrarEncerrados) return items;
    return items.filter((item) => !STATUS_ENCERRADOS.has(item.status));
  }, [treinamentosQuery.data?.items, statusFiltro, mostrarEncerrados]);
  const calendarioTreinamentos = useMemo(
    () => calendarioQuery.data?.items || [],
    [calendarioQuery.data?.items],
  );
  const auditoriaTreinamentos = useMemo(
    () => auditoriaQuery.data?.items || [],
    [auditoriaQuery.data?.items],
  );
  const detalheTreinamento = detalheQuery.data || treinamentoEditando;
  const defaultConclusaoDate =
    detalheTreinamento?.data_fim || detalheTreinamento?.data_prevista || today;
  const diasPresenca = useMemo(
    () =>
      (detalheTreinamento?.dias || []).filter(
        (dia) => Number(dia.id) > 0 && dia.status !== 'CANCELADO',
      ),
    [detalheTreinamento?.dias],
  );
  const diaPresencaSelecionado = useMemo(
    () =>
      diasPresenca.find((dia) => dia.id === diaPresencaSelecionadoId) || diasPresenca[0] || null,
    [diaPresencaSelecionadoId, diasPresenca],
  );
  const indiceDiaPresenca = useMemo(
    () =>
      diaPresencaSelecionado
        ? diasPresenca.findIndex((dia) => dia.id === diaPresencaSelecionado.id)
        : -1,
    [diaPresencaSelecionado, diasPresenca],
  );
  const resumoPresencaDia = useMemo(() => {
    const presencas = diaPresencaSelecionado?.presencas || [];
    const count = (status: TreinamentoPlanejadoPresencaDiaStatus) =>
      presencas.filter((presenca) => presenca.status === status).length;
    return {
      presentes: count('PRESENTE'),
      ausentes: count('AUSENTE'),
      parciais: count('PARCIAL'),
      dispensados: count('DISPENSADO'),
      pendentes:
        Math.max(0, (detalheTreinamento?.participantes.length || 0) - presencas.length) +
        count('PENDENTE'),
    };
  }, [detalheTreinamento?.participantes.length, diaPresencaSelecionado?.presencas]);

  useEffect(() => {
    if (!modalDetalheAberto || !detalheTreinamento) {
      setConclusaoDraft({});
      return;
    }

    const nextDraft = Object.fromEntries(
      detalheTreinamento.participantes.map((participante) => [
        participante.funcionario_id,
        buildConclusaoDraft(participante, defaultConclusaoDate),
      ]),
    );
    setConclusaoDraft(nextDraft);
  }, [defaultConclusaoDate, detalheTreinamento, modalDetalheAberto]);

  const resumoConclusao = useMemo(() => {
    const participantes = detalheTreinamento?.participantes || [];
    return participantes.reduce(
      (acc, participante) => {
        const draft =
          conclusaoDraft[participante.funcionario_id] ||
          buildConclusaoDraft(participante, defaultConclusaoDate);
        const resultado = draft.resultado;
        acc.total += 1;
        if (draft.presente === true) acc.presentes += 1;
        if (resultado === 'APROVADO') acc.aprovados += 1;
        if (resultado === 'REPROVADO' || resultado === 'CANCELADO') acc.reprovados += 1;
        if (resultado === 'INCOMPLETO') acc.incompletos += 1;
        if (!resultado) acc.pendentes += 1;
        if (isResultadoFinal(participante.resultado) || Boolean(participante.concluido_em)) {
          acc.jaConcluidos += 1;
        }
        if (isHistoricoGerado(participante.qualificacao_historico_status)) {
          acc.historicosGerados += 1;
        }
        return acc;
      },
      {
        total: 0,
        presentes: 0,
        aprovados: 0,
        reprovados: 0,
        incompletos: 0,
        pendentes: 0,
        jaConcluidos: 0,
        historicosGerados: 0,
      },
    );
  }, [conclusaoDraft, defaultConclusaoDate, detalheTreinamento?.participantes]);

  useEffect(() => {
    if (!modalDetalheAberto || diasPresenca.length === 0) {
      setDiaPresencaSelecionadoId(null);
      return;
    }
    if (
      !diaPresencaSelecionadoId ||
      !diasPresenca.some((dia) => dia.id === diaPresencaSelecionadoId)
    ) {
      setDiaPresencaSelecionadoId(diasPresenca[0].id);
    }
  }, [diaPresencaSelecionadoId, diasPresenca, modalDetalheAberto]);

  const instrutores = useMemo(() => {
    const base = funcionarios as FuncionarioOption[];
    const marcados = base.filter((funcionario) => {
      if (funcionario.is_instrutor === true) return true;
      if (typeof funcionario.is_instrutor === 'number' && funcionario.is_instrutor > 0) return true;
      const funcao = funcionario.funcao?.toLowerCase() || '';
      return funcao.includes('instrutor');
    });
    return marcados.length > 0 ? marcados : base;
  }, [funcionarios]);

  // Determinar elegibilidade de convocados com base no tipo de qualificação selecionada no formulário
  const publicoQualificacaoSelecionada = useMemo(
    () =>
      determinarPublicoQualificacao(
        formState.qualificacao_tipo_id,
        tiposQualificacao as TipoQualificacaoOption[],
      ),
    [formState.qualificacao_tipo_id, tiposQualificacao],
  );

  // Pool de convocados elegíveis (antes da busca textual)
  const convocadosElegiveis = useMemo(() => {
    const base = funcionarios as FuncionarioOption[];
    if (!publicoQualificacaoSelecionada) return base; // indeterminado — mostrar todos
    return base.filter((f) => funcionarioElegivelParaPublico(f, publicoQualificacaoSelecionada));
  }, [funcionarios, publicoQualificacaoSelecionada]);

  const convocadosFiltrados = useMemo(() => {
    if (!buscaConvocadosAdiada) return convocadosElegiveis;
    return convocadosElegiveis.filter((funcionario) => {
      const texto = [
        funcionario.nome,
        funcionario.guerra,
        funcionario.matricula,
        funcionario.setor,
        funcionario.funcao,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return texto.includes(buscaConvocadosAdiada);
    });
  }, [buscaConvocadosAdiada, convocadosElegiveis]);

  const resumoLista = useMemo(() => {
    return listaTreinamentos.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.convocados += item.convocados_total;
        acc.confirmados += item.confirmados_total;
        acc.presentes += item.presentes_total;
        if (item.status === 'PLANEJADO') acc.planejados += 1;
        if (item.status === 'CONFIRMADO') acc.confirmadosEventos += 1;
        if (item.status === 'EM_ANDAMENTO') acc.emAndamento += 1;
        if (item.status === 'CONCLUIDO') acc.concluidos += 1;
        if (item.status === 'CANCELADO') acc.cancelados += 1;
        return acc;
      },
      {
        total: 0,
        convocados: 0,
        confirmados: 0,
        presentes: 0,
        planejados: 0,
        confirmadosEventos: 0,
        emAndamento: 0,
        concluidos: 0,
        cancelados: 0,
      },
    );
  }, [listaTreinamentos]);

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, TreinamentoPlanejado[]>();
    calendarioTreinamentos.forEach((item) => {
      const occurrences =
        item.dias && item.dias.length > 0
          ? item.dias
              .filter((dia) => dia.status === 'ATIVO')
              .map((dia) => ({
                ...item,
                data_prevista: dia.data,
                hora_inicio: dia.hora_inicio,
                hora_fim: dia.hora_fim,
                local: dia.local || item.local,
              }))
          : [item];
      occurrences.forEach((occurrence) => {
        const current = map.get(occurrence.data_prevista) || [];
        current.push(occurrence);
        current.sort((left, right) => {
          const leftKey = `${left.hora_inicio || '99:99'}${getEventoTitulo(left)}`;
          const rightKey = `${right.hora_inicio || '99:99'}${getEventoTitulo(right)}`;
          return leftKey.localeCompare(rightKey);
        });
        map.set(occurrence.data_prevista, current);
      });
    });
    return map;
  }, [calendarioTreinamentos]);

  const calendarCells = useMemo(() => buildCalendarCells(mesReferencia), [mesReferencia]);

  useEffect(() => {
    if (forcedTab && abaAtiva !== forcedTab) {
      setAbaAtiva(forcedTab);
    }
  }, [abaAtiva, forcedTab]);

  useEffect(() => {
    if (!modalFormularioAberto) return;
    if (treinamentoEditando) {
      setFormState(mapTreinamentoToForm(treinamentoEditando));
      return;
    }
    setFormState(createEmptyForm(today));
  }, [modalFormularioAberto, today, treinamentoEditando]);

  function abrirNovoTreinamento() {
    setTreinamentoEditando(null);
    setBuscaConvocados('');
    setModalFormularioAberto(true);
  }

  const refetchPlanejadas = useCallback(() => {
    void Promise.all([
      treinamentosQuery.refetch(),
      calendarioQuery.refetch(),
      auditoriaQuery.refetch(),
    ]);
  }, [auditoriaQuery, calendarioQuery, treinamentosQuery]);

  function abrirDetalhes(treinamento: TreinamentoPlanejado) {
    if (treinamento.source === 'SIMULADOR') {
      const sessao = mapTreinamentoToSessaoSimulador(treinamento);
      if (sessao) {
        setSessaoSimuladorEditando(sessao);
        setModalSessaoSimuladorAberto(true);
        return;
      }
    }

    if (treinamento.read_only && treinamento.source_route) {
      navigate(treinamento.source_route);
      return;
    }
    setTreinamentoSelecionadoId(treinamento.id);
    setTreinamentoEditando(treinamento);
    setModalDetalheAberto(true);
  }

  function fecharModalSessaoSimulador() {
    setModalSessaoSimuladorAberto(false);
    setSessaoSimuladorEditando(null);
  }

  async function excluirSessaoSimulador(sessaoId: number) {
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${sessaoId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || 'Erro ao excluir sessão de simulador.');
      }
      toast.success('Sessão de simulador removida.');
      refetchPlanejadas();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir a sessão.');
    }
  }

  function abrirEditor(treinamento?: TreinamentoPlanejado | null) {
    if (treinamento) {
      setTreinamentoEditando(treinamento);
    }
    setBuscaConvocados('');
    setModalDetalheAberto(false);
    setModalFormularioAberto(true);
  }

  function alternarConvocado(funcionarioId: number) {
    setFormState((current) => {
      const exists = current.participante_ids.includes(funcionarioId);
      return {
        ...current,
        participante_ids: exists
          ? current.participante_ids.filter((id) => id !== funcionarioId)
          : [...current.participante_ids, funcionarioId],
      };
    });
  }

  function atualizarIntervalo(dataInicial: string, dataFinal: string) {
    setFormState((current) => ({
      ...current,
      data_prevista: dataInicial,
      data_fim: dataFinal,
      dias: buildTrainingDays(
        dataInicial,
        dataFinal,
        normalizeTimeInput(current.hora_inicio) || '08:00',
        normalizeTimeInput(current.hora_fim) || '17:00',
      ),
    }));
  }

  function atualizarDia(
    index: number,
    patch: Partial<{ data: string; hora_inicio: string; hora_fim: string }>,
  ) {
    setFormState((current) => ({
      ...current,
      dias: current.dias.map((dia, currentIndex) =>
        currentIndex === index ? { ...dia, ...patch } : dia,
      ),
    }));
  }

  function adicionarDia() {
    setFormState((current) => {
      const lastDate = [...current.dias].sort((a, b) => a.data.localeCompare(b.data)).at(-1)?.data;
      const next = new Date(`${lastDate || current.data_fim || current.data_prevista}T12:00:00`);
      next.setDate(next.getDate() + 1);
      return {
        ...current,
        data_fim:
          next.toISOString().slice(0, 10) > current.data_fim
            ? next.toISOString().slice(0, 10)
            : current.data_fim,
        dias: [
          ...current.dias,
          {
            data: next.toISOString().slice(0, 10),
            hora_inicio: normalizeTimeInput(current.hora_inicio) || '08:00',
            hora_fim: normalizeTimeInput(current.hora_fim) || '17:00',
          },
        ],
      };
    });
  }

  function removerDia(index: number) {
    setFormState((current) => ({
      ...current,
      dias: current.dias.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  async function salvarFormulario(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formState.qualificacao_tipo_id) {
      toast.error('Selecione a qualificacao vinculada ao treinamento.');
      return;
    }

    if (!formState.titulo.trim()) {
      toast.error('Informe um titulo para o treinamento planejado.');
      return;
    }

    if (!formState.data_prevista) {
      toast.error('Informe a data prevista do treinamento.');
      return;
    }
    if (!formState.data_fim || formState.data_fim < formState.data_prevista) {
      toast.error('Data inicial não pode ser posterior à data final.');
      return;
    }
    if (formState.status === 'CONCLUIDO' && formState.data_fim > today) {
      toast.error('Turma concluída não pode ter período futuro.');
      return;
    }
    if (formState.status === 'CONCLUIDO' && formState.participante_ids.length === 0) {
      toast.error('Não é permitido concluir turma sem participantes vinculados.');
      return;
    }
    if (
      formState.status === 'CONCLUIDO' &&
      !(
        treinamentoEditando?.participantes.length &&
        treinamentoEditando.participantes.every((participante) =>
          isResultadoFinal(participante.resultado),
        )
      )
    ) {
      toast.error(
        'A turma só pode ser marcada como concluída quando todos os participantes tiverem resultado final. Use "Concluir turma e salvar".',
      );
      return;
    }

    const horaInicioNormalizada = formState.hora_inicio
      ? normalizeTimeInput(formState.hora_inicio)
      : null;
    const horaFimNormalizada = formState.hora_fim ? normalizeTimeInput(formState.hora_fim) : null;
    if (formState.hora_inicio && !horaInicioNormalizada) {
      toast.error('Hora de início inválida. Use HH:mm.');
      return;
    }
    if (formState.hora_fim && !horaFimNormalizada) {
      toast.error('Hora de fim inválida. Use HH:mm.');
      return;
    }
    if (horaInicioNormalizada && horaFimNormalizada && horaFimNormalizada < horaInicioNormalizada) {
      toast.error('O horario final precisa ser maior ou igual ao horario inicial.');
      return;
    }
    if (
      formState.limite_participantes &&
      formState.participante_ids.length > Number(formState.limite_participantes)
    ) {
      toast.error('A quantidade de participantes excede o limite da turma.');
      return;
    }

    const dias = formState.dias;
    if (dias.length === 0) {
      toast.error('A turma precisa possuir ao menos um dia efetivo.');
      return;
    }
    if (new Set(dias.map((dia) => dia.data)).size !== dias.length) {
      toast.error('Não é permitido repetir um dia efetivo.');
      return;
    }
    if (dias.some((dia) => dia.hora_fim <= dia.hora_inicio)) {
      toast.error('Cada dia deve terminar depois do horário inicial.');
      return;
    }
    if (dias.some((dia) => dia.data < formState.data_prevista || dia.data > formState.data_fim)) {
      toast.error('Dias efetivos devem estar dentro do período da turma.');
      return;
    }

    const payload = {
      qualificacao_tipo_id: Number(formState.qualificacao_tipo_id),
      titulo: formState.titulo.trim(),
      descricao: normalizeText(formState.descricao),
      observacoes: normalizeText(formState.observacoes),
      local: normalizeText(formState.local),
      data_prevista: formState.data_prevista,
      data_inicio: formState.data_prevista,
      data_fim: formState.data_fim,
      hora_inicio: horaInicioNormalizada || normalizeText(formState.hora_inicio),
      hora_fim: horaFimNormalizada || normalizeText(formState.hora_fim),
      instrutor_id: formState.instrutor_id ? Number(formState.instrutor_id) : null,
      carga_horaria_prevista: formState.carga_horaria_prevista
        ? Number(formState.carga_horaria_prevista)
        : null,
      status: formState.status,
      participante_ids: formState.participante_ids,
      codigo_turma: normalizeText(formState.codigo_turma),
      modalidade: formState.modalidade,
      base: normalizeText(formState.base),
      sala: normalizeText(formState.sala),
      equipamento_descricao: normalizeText(formState.equipamento_descricao),
      limite_participantes: formState.limite_participantes
        ? Number(formState.limite_participantes)
        : null,
      tipo_treinamento: formState.tipo_treinamento,
      instrutor_ids: formState.instrutor_id ? [Number(formState.instrutor_id)] : [],
      dias: dias.map((dia) => ({
        ...dia,
        local: normalizeText(formState.local),
        instrutor_id: formState.instrutor_id ? Number(formState.instrutor_id) : null,
      })),
    };

    try {
      let savedId: number;
      if (treinamentoEditando) {
        await atualizarTreinamento.mutateAsync({ id: treinamentoEditando.id, input: payload });
        toast.success('Treinamento planejado atualizado.');
        savedId = treinamentoEditando.id;
      } else {
        const response = await criarTreinamento.mutateAsync(payload);
        toast.success('Treinamento planejado criado.');
        savedId = response.id;
      }

      setModalFormularioAberto(false);
      setTreinamentoEditando(null);
      setTreinamentoSelecionadoId(savedId);
      setModalDetalheAberto(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Nao foi possivel salvar o treinamento.',
      );
    }
  }

  const fecharModalDetalhes = useCallback(() => {
    setModalDetalheAberto(false);
    setTreinamentoSelecionadoId(null);
    setTreinamentoEditando(null);
    setDiaPresencaSelecionadoId(null);
  }, []);

  async function gerarListaPresencaTurmaAtual() {
    const treinamento = detalheQuery.data || treinamentoEditando;
    if (!treinamento) return;
    setGerandoListaPresencaTurma(true);
    try {
      const { gerarPDFListaPresencaTurma } =
        await import('@/react-app/services/pdf-lista-presenca');
      const blob = await gerarPDFListaPresencaTurma({
        titulo: treinamento.titulo || treinamento.qualificacao_nome || 'Treinamento',
        codigoQualificacao: treinamento.qualificacao_codigo || '',
        dataInicio: treinamento.data_inicio || treinamento.data_prevista,
        dataFim: treinamento.data_fim || treinamento.data_prevista,
        horaInicio: treinamento.hora_inicio || '',
        horaFim: treinamento.hora_fim || '',
        local: treinamento.local || '',
        instrutor: treinamento.instrutor_nome || treinamento.instrutor_guerra || '',
        participantes: treinamento.participantes.map((p) => ({
          nome: p.funcionario_nome || '',
          matricula: p.funcionario_matricula || '',
          setor: p.funcionario_setor || '',
          funcao: p.funcionario_funcao || '',
        })),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const nomeArquivo = (treinamento.titulo || treinamento.qualificacao_codigo || 'turma')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase();
      a.download = `lista_presenca_${nomeArquivo}_${treinamento.data_prevista}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Lista de presença gerada com sucesso.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar lista de presença.');
    } finally {
      setGerandoListaPresencaTurma(false);
    }
  }

  async function excluirTreinamentoSelecionado() {
    const treinamento = detalheQuery.data || treinamentoEditando;
    if (!treinamento) return;
    const ok = window.confirm(`Excluir o treinamento "${getEventoTitulo(treinamento)}"?`);
    if (!ok) return;

    try {
      await excluirTreinamento.mutateAsync(treinamento.id);
      toast.success('Treinamento planejado removido.');
      fecharModalDetalhes();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Nao foi possivel excluir o treinamento.',
      );
    }
  }

  async function atualizarPresencaDiaParticipante(
    participante: TreinamentoPlanejadoParticipante,
    status: TreinamentoPlanejadoPresencaDiaStatus,
  ) {
    if (!treinamentoSelecionadoId || !diaPresencaSelecionado) return;
    const minutosPrevistos = calcularMinutosPrevistos(
      diaPresencaSelecionado.hora_inicio,
      diaPresencaSelecionado.hora_fim,
    );
    const minutos =
      status === 'PRESENTE'
        ? minutosPrevistos
        : status === 'AUSENTE' || status === 'PENDENTE' || status === 'DISPENSADO'
          ? 0
          : (getPresencaDia(diaPresencaSelecionado, participante.funcionario_id)
              ?.minutos_presentes ?? null);

    try {
      await atualizarPresencaDia.mutateAsync({
        id: treinamentoSelecionadoId,
        diaId: diaPresencaSelecionado.id,
        input: {
          funcionario_id: participante.funcionario_id,
          status,
          minutos_presentes: minutos,
        },
      });
      toast.success('Presenca do dia atualizada.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Nao foi possivel atualizar a presenca do dia.',
      );
    }
  }

  async function atualizarPresencaDiaEmLote(status: TreinamentoPlanejadoPresencaDiaStatus) {
    if (
      !treinamentoSelecionadoId ||
      !diaPresencaSelecionado ||
      !detalheTreinamento?.participantes.length
    ) {
      return;
    }
    const minutosPrevistos = calcularMinutosPrevistos(
      diaPresencaSelecionado.hora_inicio,
      diaPresencaSelecionado.hora_fim,
    );
    const minutos =
      status === 'PRESENTE'
        ? minutosPrevistos
        : status === 'AUSENTE' || status === 'PENDENTE' || status === 'DISPENSADO'
          ? 0
          : null;

    try {
      for (const participante of detalheTreinamento.participantes) {
        await atualizarPresencaDia.mutateAsync({
          id: treinamentoSelecionadoId,
          diaId: diaPresencaSelecionado.id,
          input: {
            funcionario_id: participante.funcionario_id,
            status,
            minutos_presentes: minutos,
          },
        });
      }
      toast.success('Presencas do dia atualizadas.');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Nao foi possivel atualizar as presencas do dia.',
      );
    }
  }

  function resetConclusaoDraft() {
    if (!detalheTreinamento) return;
    setConclusaoDraft(
      Object.fromEntries(
        detalheTreinamento.participantes.map((participante) => [
          participante.funcionario_id,
          buildConclusaoDraft(participante, defaultConclusaoDate),
        ]),
      ),
    );
  }

  function atualizarConclusaoParticipante(
    participante: TreinamentoPlanejadoParticipante,
    patch: Partial<ConclusaoParticipanteDraft>,
  ) {
    setConclusaoDraft((current) => {
      const base =
        current[participante.funcionario_id] ||
        buildConclusaoDraft(participante, defaultConclusaoDate);
      const next = { ...base, ...patch };
      if (patch.resultado === 'APROVADO' && !next.data_conclusao_efetiva) {
        next.data_conclusao_efetiva = defaultConclusaoDate;
      }
      if (patch.resultado && patch.resultado !== 'APROVADO') {
        next.data_conclusao_efetiva = null;
      }
      return {
        ...current,
        [participante.funcionario_id]: next,
      };
    });
  }

  function aplicarConclusaoEmLote(
    modo: 'presentes' | 'aprovados' | 'presentes-aprovados' | 'limpar',
  ) {
    if (!detalheTreinamento) return;
    if (modo === 'limpar') {
      resetConclusaoDraft();
      return;
    }

    setConclusaoDraft((current) => {
      const next = { ...current };
      detalheTreinamento.participantes.forEach((participante) => {
        const base =
          next[participante.funcionario_id] ||
          buildConclusaoDraft(participante, defaultConclusaoDate);
        if (modo === 'presentes') {
          next[participante.funcionario_id] = { ...base, presente: true };
          return;
        }
        if (modo === 'aprovados') {
          next[participante.funcionario_id] = {
            ...base,
            resultado: 'APROVADO',
            data_conclusao_efetiva: base.data_conclusao_efetiva || defaultConclusaoDate,
          };
          return;
        }
        next[participante.funcionario_id] = {
          ...base,
          presente: true,
          resultado: 'APROVADO',
          data_conclusao_efetiva: base.data_conclusao_efetiva || defaultConclusaoDate,
        };
      });
      return next;
    });
  }

  function buildConclusaoPayload(): TreinamentoPlanejadoConclusaoLoteParticipanteInput[] {
    if (!detalheTreinamento) return [];
    return detalheTreinamento.participantes.map((participante) => {
      const draft =
        conclusaoDraft[participante.funcionario_id] ||
        buildConclusaoDraft(participante, defaultConclusaoDate);
      return {
        funcionario_id: participante.funcionario_id,
        presente: draft.presente,
        resultado: draft.resultado,
        data_conclusao_efetiva:
          draft.resultado === 'APROVADO'
            ? draft.data_conclusao_efetiva || defaultConclusaoDate
            : null,
        nota: draft.nota,
        conceito: draft.conceito,
        observacoes: draft.observacoes,
      };
    });
  }

  function abrirConfirmacaoConclusao() {
    if (!canConcluirTurma || !detalheTreinamento) return;
    if (detalheTreinamento.participantes.length === 0) {
      toast.error('Turma sem participantes para concluir.');
      return;
    }
    if ((detalheTreinamento.data_fim || detalheTreinamento.data_prevista) > today) {
      toast.error('Turma futura não pode ser concluída.');
      return;
    }
    setModalConfirmacaoConclusaoAberto(true);
  }

  async function confirmarConclusaoTurmaSalvar() {
    if (!treinamentoSelecionadoId || !detalheTreinamento) return;

    try {
      const resultado = await concluirTurma.mutateAsync({
        id: treinamentoSelecionadoId,
        participantes: buildConclusaoPayload(),
      });
      setModalConfirmacaoConclusaoAberto(false);
      toast.success(
        resultado.resumo.criados > 0
          ? 'Turma concluída e resumo salvo.'
          : 'Resumo da turma salvo sem gerar novos históricos.',
      );
      refetchPlanejadas();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível concluir a turma em lote.',
      );
    }
  }

  async function abrirConvocacaoTurma() {
    if (!treinamentoSelecionadoId) return;

    try {
      const preview = await previewConvocacao.mutateAsync({
        id: treinamentoSelecionadoId,
        gestores_cc_ids:
          gestoresCcSelecionadosIds.length > 0 ? gestoresCcSelecionadosIds : undefined,
      });
      setConvocacaoPreview(preview);
      setConfirmarReenvio(Boolean(preview.ultima_convocacao_em));
      setIgnorarSemEmail(
        preview.ausentes_email.length === 0 && preview.invalidos_email.length === 0,
      );
      if (gestoresCcSelecionadosIds.length === 0) {
        setGestoresCcSelecionadosIds(preview.gestores_cc.map((gestor) => gestor.id));
      }
      setModalConfirmacaoConvocacaoAberto(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Não foi possível preparar a convocação.',
      );
    }
  }

  async function confirmarConvocacaoTurma() {
    if (!treinamentoSelecionadoId || !convocacaoPreview) return;

    try {
      const resultado = await enviarConvocacao.mutateAsync({
        id: treinamentoSelecionadoId,
        force_resend: confirmarReenvio,
        skip_missing_email: ignorarSemEmail,
        gestores_cc_ids: gestoresCcSelecionadosIds,
      });
      setConvocacaoResultado(resultado);
      setModalConfirmacaoConvocacaoAberto(false);
      setModalResultadoConvocacaoAberto(true);
      toast.success('Convocação processada.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao enviar convocação.';
      toast.error(message);
    }
  }

  async function reenviarIndividual(funcionarioId: number) {
    if (!treinamentoSelecionadoId) return;

    try {
      const item = await reenviarConvocacao.mutateAsync({
        id: treinamentoSelecionadoId,
        funcionario_id: funcionarioId,
        gestores_cc_ids: gestoresCcSelecionadosIds,
      });
      setConvocacaoResultado((current) => {
        if (!current) return current;
        return {
          ...current,
          itens: current.itens.map((entry) =>
            entry.funcionario_id === funcionarioId
              ? {
                  ...entry,
                  status: item.status,
                  erro_mensagem: item.erro_mensagem,
                  email: item.email,
                }
              : entry,
          ),
        };
      });
      toast.success('Convocação reenviada com sucesso.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao reenviar convocação.');
    }
  }

  // H7: When parent header "Nova turma" button is clicked, auto-open the creation modal
  useEffect(() => {
    if (autoOpenForm && tiposQualificacao.length > 0 && funcionarios.length > 0) {
      abrirNovoTreinamento();
      onAutoOpenFormHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenForm, tiposQualificacao.length, funcionarios.length]);

  if (!canManage) {
    return (
      <main className="p-6" role="main">
        <PageHeader
          title="Planejamento e Gestão de Treinamentos"
          subtitle="Calendario operacional e trilha de auditoria para treinamentos futuros."
        />
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          Seu perfil nao possui acesso a esta central operacional.
        </div>
      </main>
    );
  }

  const erroPrincipal =
    (treinamentosQuery.error as Error | null)?.message ||
    (calendarioQuery.error as Error | null)?.message ||
    (auditoriaQuery.error as Error | null)?.message ||
    (detalheQuery.error as Error | null)?.message ||
    null;

  const diagnosticsFalhos = Object.entries({
    ...(treinamentosQuery.data?.diagnostics || {}),
    ...(calendarioQuery.data?.diagnostics || {}),
  })
    .filter(([, status]) => status === 'error')
    .map(([source]) =>
      source === 'turma'
        ? 'turmas'
        : source === 'qualificacao_planejada'
          ? 'qualificações planejadas'
          : 'sessões de simulador',
    );

  const salvandoFormulario = criarTreinamento.isPending || atualizarTreinamento.isPending;
  const excluindo = excluirTreinamento.isPending;
  const enviandoConvocacao = previewConvocacao.isPending || enviarConvocacao.isPending;

  const convocacaoDisabledReason = getConvocacaoDisabledReason(detalheTreinamento);
  const isTurmasView = sourceFilter === 'TURMA' || sourceFilter === 'TREINAMENTOS';
  const primaryActionLabel = isTurmasView ? 'Nova turma' : 'Novo treinamento';

  const actionButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" icon="refresh" onClick={() => treinamentosQuery.refetch()}>
        Atualizar
      </Button>
      {canWriteTraining ? (
        <Button icon="add" onClick={abrirNovoTreinamento}>
          {primaryActionLabel}
        </Button>
      ) : null}
    </div>
  );

  return (
    <main
      className={asTab ? '' : 'min-h-full bg-slate-50/70 px-4 py-6 sm:px-6 lg:px-8'}
      role={asTab ? undefined : 'main'}
    >
      <div
        className={asTab ? 'space-y-4' : 'mx-auto max-w-7xl space-y-6'}
        data-testid="treinamentos-planejados-page"
      >
        {asTab ? null : (
          <PageHeader
            title="Planejamento e Gestão de Treinamentos"
            subtitle="Calendario, quadro operacional e auditoria dos treinamentos futuros e seus convocados."
            actions={actionButtons}
          />
        )}

        {erroPrincipal && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {erroPrincipal}
          </div>
        )}

        {diagnosticsFalhos.length > 0 && (
          <div
            className="flex items-start gap-2 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
            <span>
              A lista está incompleta: não foi possível carregar {diagnosticsFalhos.join(', ')}.
              Atualize a página ou contate o administrador antes de tomar decisões operacionais.
            </span>
          </div>
        )}

        {/* Summary tags + action buttons in same row */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <section
            className="flex flex-wrap items-center gap-1.5"
            aria-label="Resumo dos treinamentos"
          >
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-slate-100 text-slate-700 text-xs">
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              <span>Total</span>
              <strong>{treinamentosQuery.isLoading ? '...' : resumoLista.total}</strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-purple-50 text-purple-700 text-xs">
              <ClipboardList className="h-3 w-3" aria-hidden="true" />
              <span>Planejados</span>
              <strong>{treinamentosQuery.isLoading ? '...' : resumoLista.planejados}</strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              <span>Confirmados</span>
              <strong>
                {treinamentosQuery.isLoading ? '...' : resumoLista.confirmadosEventos}
              </strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 text-xs">
              <Clock className="h-3 w-3" aria-hidden="true" />
              <span>Em andamento</span>
              <strong>{treinamentosQuery.isLoading ? '...' : resumoLista.emAndamento}</strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 text-xs">
              <Flag className="h-3 w-3" aria-hidden="true" />
              <span>Concluídos</span>
              <strong>{treinamentosQuery.isLoading ? '...' : resumoLista.concluidos}</strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-rose-50 text-rose-700 text-xs">
              <Ban className="h-3 w-3" aria-hidden="true" />
              <span>Cancelados</span>
              <strong>{treinamentosQuery.isLoading ? '...' : resumoLista.cancelados}</strong>
            </span>
          </section>
          {asTab && !hideActions && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => treinamentosQuery.refetch()}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Atualizar
              </button>
              {canWriteTraining ? (
                <button
                  type="button"
                  onClick={abrirNovoTreinamento}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-md bg-primary-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {primaryActionLabel}
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Filters bar — same inline format as Histórico */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="month"
            value={mesReferencia}
            onChange={(event) => setMesReferencia(event.target.value)}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-primary-600 focus:outline-none bg-white cursor-pointer"
          />
          {setorOptions.length === 1 ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700">
              {setorOptions[0].label}
            </div>
          ) : setorOptions.length > 1 ? (
            <MultiSelect
              options={setorOptions}
              selected={setorFilter}
              onChange={setSetorFilter}
              placeholder="Todos os setores"
              allLabel="Todos os setores"
              className="min-w-[180px]"
            />
          ) : null}
          <select
            value={statusFiltro}
            onChange={(event) => {
              setStatusFiltro(event.target.value);
              // Se o usuário selecionar CONCLUIDO ou CANCELADO explicitamente, mostrar encerrados
              if (event.target.value === 'CONCLUIDO' || event.target.value === 'CANCELADO') {
                setMostrarEncerrados(true);
              }
            }}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-600 focus:outline-none bg-white cursor-pointer"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value || 'all'} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {!statusFiltro && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-sm text-slate-600">
              <input
                type="checkbox"
                checked={mostrarEncerrados}
                onChange={(e) => setMostrarEncerrados(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600"
              />
              Mostrar concluídos/cancelados
            </label>
          )}
          <select
            value={instrutorFiltro}
            onChange={(event) => setInstrutorFiltro(event.target.value)}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-600 focus:outline-none bg-white cursor-pointer"
          >
            <option value="">Todos os instrutores</option>
            {instrutores.map((instrutor) => (
              <option key={instrutor.id} value={instrutor.id}>
                {getPessoaLabel(instrutor.nome, instrutor.guerra, instrutor.matricula)}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar..."
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-primary-600 focus:outline-none min-w-[160px]"
          />
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
          {!hideTabNav && (
            <div role="tablist" aria-label="Modos de visualização" className="flex flex-wrap gap-2">
              {[
                { id: 'calendario', label: 'Calendario', icon: CalendarDays },
                { id: 'quadro', label: 'Quadro', icon: ClipboardList },
                { id: 'auditoria', label: 'Auditoria', icon: FileClock },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = abaAtiva === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setAbaAtiva(tab.id as AbaAtiva)}
                    className={`flex items-center gap-2 px-3 sm:px-6 py-3 sm:py-4 text-sm font-medium transition-all border-b-2 whitespace-nowrap cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                      active
                        ? 'border-primary text-blue-600 dark:text-blue-300'
                        : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-800'
                    } motion-safe:transition-colors`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          )}

          {abaAtiva === 'calendario' && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const [year, month] = mesReferencia.split('-').map(Number);
                      const prev = new Date(year, month - 2, 1);
                      setMesReferencia(
                        `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`,
                      );
                    }}
                    aria-label="Mês anterior"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 cursor-pointer motion-safe:transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <div>
                    <p className="text-lg font-semibold text-slate-900 capitalize">
                      {formatMonthLabel(mesReferencia)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {calendarioQuery.data?.periodo.inicio && calendarioQuery.data?.periodo.fim
                        ? `${formatDateLabel(calendarioQuery.data.periodo.inicio)} a ${formatDateLabel(calendarioQuery.data.periodo.fim)}`
                        : 'Sem periodo definido'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const [year, month] = mesReferencia.split('-').map(Number);
                      const next = new Date(year, month, 1);
                      setMesReferencia(
                        `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`,
                      );
                    }}
                    aria-label="Próximo mês"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 cursor-pointer motion-safe:transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>
                <p className="text-sm text-slate-500">
                  {calendarioQuery.isLoading
                    ? 'Atualizando calendario...'
                    : `${calendarioTreinamentos.length} evento(s) no periodo`}
                </p>
              </div>

              <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
                <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 min-w-[640px] sm:min-w-0">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((label) => (
                    <div key={label} className="rounded-xl bg-slate-100 px-2 py-2">
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-2 min-w-[640px] sm:min-w-0">
                  {calendarCells.map((cell) => {
                    const eventos = eventosPorDia.get(cell.date) || [];
                    const isToday = cell.date === today;
                    return (
                      <div
                        key={cell.date}
                        className={`min-h-[150px] rounded-2xl border p-2.5 transition ${
                          cell.outside
                            ? 'border-slate-100 bg-slate-50/70'
                            : 'border-slate-200 bg-white'
                        } ${isToday ? 'ring-2 ring-primary-200' : ''}`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span
                            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-semibold ${
                              isToday ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {cell.date.slice(-2)}
                          </span>
                          {eventos.length > 0 && (
                            <span className="text-[11px] font-medium text-slate-500">
                              {eventos.length} evento(s)
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          {eventos.slice(0, 2).map((evento) => (
                            <button
                              key={evento.id}
                              type="button"
                              onClick={() => abrirDetalhes(evento)}
                              aria-label={`${getEventoTitulo(evento)}, ${formatHourRange(evento.hora_inicio, evento.hora_fim)}`}
                              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-left transition hover:border-primary-200 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 cursor-pointer motion-safe:transition-colors"
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <p className="truncate text-xs font-semibold text-slate-900 leading-tight">
                                  {getEventoTitulo(evento)}
                                </p>
                                <StatusBadge status={evento.status} />
                              </div>
                              <p className="mt-0.5 text-[11px] text-slate-500">
                                {formatHourRange(evento.hora_inicio, evento.hora_fim)}
                              </p>
                            </button>
                          ))}

                          {eventos.length > 2 && (
                            <p className="px-1 text-[11px] font-medium text-slate-500">
                              +{eventos.length - 2} evento(s) neste dia
                            </p>
                          )}

                          {eventos.length === 0 && !cell.outside && (
                            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400 text-center">
                              Sem treinamentos planejados
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {abaAtiva === 'quadro' && (
            <div className="mt-4 space-y-4">
              {treinamentosQuery.isLoading && listaTreinamentos.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  {isTurmasView ? 'Carregando turmas...' : 'Carregando treinamentos...'}
                </div>
              ) : treinamentosQuery.isError && listaTreinamentos.length === 0 ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-10 text-center text-sm text-rose-700">
                  <p className="font-medium">
                    Erro ao carregar {isTurmasView ? 'turmas' : 'treinamentos'}.
                  </p>
                  <button
                    type="button"
                    onClick={() => treinamentosQuery.refetch()}
                    className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : listaTreinamentos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  <ClipboardList
                    className="mx-auto mb-3 h-10 w-10 text-slate-300"
                    aria-hidden="true"
                  />
                  <p className="font-medium text-slate-700">
                    {isTurmasView
                      ? 'Nenhuma turma planejada no período'
                      : 'Nenhum treinamento planejado encontrado'}
                  </p>
                  <p className="mt-1">
                    {isTurmasView
                      ? 'Crie uma nova turma acima.'
                      : 'Ajuste os filtros ou crie um novo treinamento.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                  <table
                    className="min-w-[1080px] divide-y divide-slate-200 text-sm"
                    data-testid="treinamentos-planejados-table"
                  >
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 sticky top-0 z-[1]">
                      <tr>
                        <th className="px-4 py-3 text-left w-12">Ações</th>
                        <th className="px-4 py-3 text-left">Data</th>
                        <th className="px-4 py-3 text-left">Horário</th>
                        <th className="px-4 py-3 text-left">Fonte</th>
                        <th className="px-4 py-3 text-left">Treinamento / Qualificação</th>
                        <th className="px-4 py-3 text-left">Participantes</th>
                        <th className="px-4 py-3 text-left">Instrutor</th>
                        <th className="px-4 py-3 text-left">Equipamento / Local</th>
                        <th className="px-4 py-3 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {listaTreinamentos.map((item) => {
                        const simulatorSessionId = getSimulatorSessionId(item);
                        const participantSummary =
                          getEventoParticipantSummary(item) ||
                          `${item.convocados_total} convocados`;
                        return (
                          <tr
                            key={item.id}
                            className="align-top transition hover:bg-slate-50/80"
                            data-testid={`treinamento-planejado-row-${item.id}`}
                            data-source={item.source || 'TURMA'}
                            data-sessao-id={simulatorSessionId || undefined}
                          >
                            <td className="whitespace-nowrap px-4 py-3">
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => abrirDetalhes(item)}
                                  aria-label={
                                    simulatorSessionId
                                      ? 'Editar sessão'
                                      : item.read_only
                                        ? 'Abrir origem'
                                        : 'Ver detalhes'
                                  }
                                  title={
                                    simulatorSessionId
                                      ? 'Editar sessão'
                                      : item.read_only
                                        ? 'Abrir origem'
                                        : 'Detalhes'
                                  }
                                  className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                                  data-testid={
                                    simulatorSessionId
                                      ? `simulador-editar-sessao-${simulatorSessionId}`
                                      : `treinamento-detalhes-${item.id}`
                                  }
                                >
                                  <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                                </button>
                                {!item.read_only && canWriteTraining ? (
                                  <button
                                    type="button"
                                    onClick={() => abrirEditor(item)}
                                    aria-label="Editar"
                                    title="Editar"
                                    className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-indigo-600 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" aria-hidden="true" />
                                  </button>
                                ) : null}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                              {formatDateRange(item.data_prevista, item.data_fim)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                              {formatHourRange(item.hora_inicio, item.hora_fim)}
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                                {item.source_label || 'Turma'}
                              </span>
                            </td>
                            <td className="max-w-[280px] px-4 py-3">
                              <p className="font-semibold text-slate-900">
                                {getEventoTitulo(item)}
                              </p>
                              {getEventoLinkedSessionLabel(item) ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {getEventoLinkedSessionLabel(item)}
                                </p>
                              ) : null}
                              {item.descricao || item.observacoes ? (
                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                                  {item.descricao || item.observacoes}
                                </p>
                              ) : null}
                            </td>
                            <td className="max-w-[220px] px-4 py-3 text-slate-600">
                              <p>{participantSummary}</p>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <FuncionarioLink
                                funcionarioId={item.instrutor_id ?? undefined}
                                nome={
                                  item.instrutor_nome || item.instrutor_guerra || 'Não definido'
                                }
                                className="font-medium text-slate-700"
                              />
                            </td>
                            <td className="max-w-[180px] px-4 py-3 text-slate-600">
                              {item.equipamento_descricao || item.local || 'Local a definir'}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={item.status} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {abaAtiva === 'auditoria' && (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <StatCard
                  icon={<ClipboardList className="h-5 w-5" />}
                  label="Eventos"
                  value={auditoriaQuery.data?.resumo.total_eventos || 0}
                  helper="Treinamentos no recorte atual"
                />
                <StatCard
                  icon={<Users className="h-5 w-5" />}
                  label="Convocados"
                  value={auditoriaQuery.data?.resumo.total_convocados || 0}
                  helper="Total de pessoas convocadas"
                />
                <StatCard
                  icon={<CheckCircle2 className="h-5 w-5" />}
                  label="Confirmados"
                  value={auditoriaQuery.data?.resumo.total_confirmados || 0}
                  helper="Participantes que confirmaram"
                />
                <StatCard
                  icon={<ShieldCheck className="h-5 w-5" />}
                  label="Presentes"
                  value={auditoriaQuery.data?.resumo.total_presentes || 0}
                  helper="Presencas registradas"
                />
                <StatCard
                  icon={<FileClock className="h-5 w-5" />}
                  label="Prontos para auditoria"
                  value={auditoriaQuery.data?.resumo.prontos_para_auditoria || 0}
                  helper="Eventos com registros relevantes"
                />
              </div>

              {auditoriaQuery.isLoading && auditoriaTreinamentos.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Carregando trilha de auditoria...
                </div>
              ) : auditoriaTreinamentos.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  <FileClock className="mx-auto mb-3 h-10 w-10 text-slate-300" aria-hidden="true" />
                  <p className="font-medium text-slate-700">
                    Nenhum treinamento com trilha de auditoria
                  </p>
                  <p className="mt-1">Nenhum evento encontrado neste período.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {auditoriaTreinamentos.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-slate-900">
                              {getEventoTitulo(item)}
                            </h3>
                            <StatusBadge status={item.status} />
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatDateLabel(item.data_prevista)} ·{' '}
                            {item.local || 'Local a definir'} · {item.convocados_total} convocados
                          </p>
                        </div>
                        <Button
                          variant="secondary"
                          icon="visibility"
                          onClick={() => abrirDetalhes(item)}
                        >
                          Abrir evento
                        </Button>
                      </div>

                      <div className="mt-4 space-y-3">
                        {(item.auditoria || []).length === 0 ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-500 text-center">
                            <AlertTriangle
                              className="mx-auto mb-1 h-5 w-5 text-slate-300"
                              aria-hidden="true"
                            />
                            Sem eventos auditados ainda.
                          </div>
                        ) : (
                          (item.auditoria || []).map((registro) => (
                            <div
                              key={registro.id}
                              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                            >
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm font-semibold text-slate-900">
                                  {registro.acao}
                                </p>
                                <span className="text-xs text-slate-500">
                                  {formatDateTimeLabel(registro.created_at)}
                                </span>
                              </div>
                              {registro.usuario_nome && (
                                <p className="mt-1 text-xs text-slate-500">
                                  Por {registro.usuario_nome}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
        <ModalNovaSessao
          isOpen={modalSessaoSimuladorAberto}
          onClose={fecharModalSessaoSimulador}
          onSuccess={() => {
            fecharModalSessaoSimulador();
            refetchPlanejadas();
          }}
          sessao={sessaoSimuladorEditando}
          onDelete={(sessaoId) => {
            void excluirSessaoSimulador(sessaoId);
          }}
          onVerFichas={(sessaoId) => {
            navigate(`/simuladores?tab=fichas&sessao=${sessaoId}`);
          }}
        />
        <Modal
          isOpen={modalFormularioAberto}
          onClose={() => setModalFormularioAberto(false)}
          title={
            treinamentoEditando ? 'Editar treinamento planejado' : 'Novo treinamento planejado'
          }
          size="5xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalFormularioAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="treinamento-planejado-form" disabled={salvandoFormulario}>
                {salvandoFormulario ? 'Salvando...' : 'Salvar turma'}
              </Button>
            </>
          }
        >
          <form id="treinamento-planejado-form" className="space-y-5" onSubmit={salvarFormulario}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Tipo de qualificacao</span>
                <select
                  value={formState.qualificacao_tipo_id}
                  onChange={(event) => {
                    const selectedId = event.target.value;
                    const tipo = (tiposQualificacao as TipoQualificacaoOption[]).find(
                      (item) => String(item.id) === selectedId,
                    );
                    setFormState((current) => {
                      const cargaHoraria =
                        current.tipo_treinamento === 'INICIAL'
                          ? tipo?.carga_horaria_inicial
                          : tipo?.carga_horaria_recorrente;
                      return {
                        ...current,
                        qualificacao_tipo_id: selectedId,
                        titulo: current.titulo || tipo?.nome || '',
                        carga_horaria_prevista:
                          cargaHoraria != null
                            ? String(cargaHoraria)
                            : current.carga_horaria_prevista,
                      };
                    });
                  }}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                >
                  <option value="">Selecione</option>
                  {(tiposQualificacao as TipoQualificacaoOption[]).map((tipo) => (
                    <option key={tipo.id} value={tipo.id}>
                      {tipo.codigo ? `${tipo.codigo} · ${tipo.nome}` : tipo.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Status operacional</span>
                <select
                  value={formState.status}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      status: event.target.value as TreinamentoPlanejadoStatus,
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                >
                  {STATUS_OPTIONS.filter((option) => option.value).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="block text-xs text-slate-500">
                  `Concluído` só é aceito quando todos os participantes já tiverem resultado final.
                  Caso contrário, use o fluxo `Concluir turma e salvar` no detalhe da turma.
                </span>
              </label>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Tipo de treinamento</span>
              <div className="grid gap-3 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    formState.tipo_treinamento === 'INICIAL'
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="tipo_treinamento_form"
                    checked={formState.tipo_treinamento === 'INICIAL'}
                    onChange={() => {
                      setFormState((current) => {
                        const tipo = (tiposQualificacao as TipoQualificacaoOption[]).find(
                          (item) => String(item.id) === current.qualificacao_tipo_id,
                        );
                        const cargaHoraria = tipo?.carga_horaria_inicial;
                        return {
                          ...current,
                          tipo_treinamento: 'INICIAL',
                          carga_horaria_prevista:
                            cargaHoraria != null
                              ? String(cargaHoraria)
                              : current.carga_horaria_prevista,
                        };
                      });
                    }}
                    className="mt-1 h-4 w-4 border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900">Inicial</span>
                    <span className="text-xs text-slate-500">
                      Primeira concessão ou formação inicial da qualificação.
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    formState.tipo_treinamento === 'RECORRENTE'
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="tipo_treinamento_form"
                    checked={formState.tipo_treinamento === 'RECORRENTE'}
                    onChange={() => {
                      setFormState((current) => {
                        const tipo = (tiposQualificacao as TipoQualificacaoOption[]).find(
                          (item) => String(item.id) === current.qualificacao_tipo_id,
                        );
                        const cargaHoraria = tipo?.carga_horaria_recorrente;
                        return {
                          ...current,
                          tipo_treinamento: 'RECORRENTE',
                          carga_horaria_prevista:
                            cargaHoraria != null
                              ? String(cargaHoraria)
                              : current.carga_horaria_prevista,
                        };
                      });
                    }}
                    className="mt-1 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900">Periódico</span>
                    <span className="text-xs text-slate-500">
                      Recorrência, reciclagem ou atualização de qualificação existente.
                    </span>
                  </span>
                </label>
              </div>
            </div>

            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700">Titulo</span>
              <input
                type="text"
                value={formState.titulo}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, titulo: event.target.value }))
                }
                placeholder="Ex.: Reciclagem anual de CRM"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Código da turma</span>
                <input
                  type="text"
                  value={formState.codigo_turma}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, codigo_turma: event.target.value }))
                  }
                  placeholder="Ex.: CRM-2026-06-A"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Modalidade</span>
                <select
                  value={formState.modalidade}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      modalidade: event.target.value as TreinamentoFormState['modalidade'],
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                >
                  <option value="TEORICO">Teórico</option>
                  <option value="SALA">Sala de aula</option>
                  <option value="PRATICO">Prático</option>
                  <option value="MISTO">Misto</option>
                  <option value="SIMULADOR">Simulador</option>
                  <option value="EAD">EAD</option>
                  <option value="AERONAVE">Aeronave</option>
                  <option value="VOO">Voo de treinamento</option>
                  <option value="CHEQUE">Cheque ou avaliação</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Base</span>
                <input
                  type="text"
                  value={formState.base}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, base: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Limite de participantes</span>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={formState.limite_participantes}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      limite_participantes: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1.5 xl:col-span-1">
                <span className="text-sm font-medium text-slate-700">Data inicial</span>
                <input
                  type="date"
                  value={formState.data_prevista}
                  min={treinamentoEditando ? undefined : today}
                  onChange={(event) => {
                    const nextStart = event.target.value;
                    const nextEnd = formState.data_fim < nextStart ? nextStart : formState.data_fim;
                    atualizarIntervalo(nextStart, nextEnd);
                  }}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>

              <label className="space-y-1.5 xl:col-span-1">
                <span className="text-sm font-medium text-slate-700">Data final</span>
                <input
                  type="date"
                  value={formState.data_fim}
                  min={formState.data_prevista || today}
                  onChange={(event) =>
                    atualizarIntervalo(formState.data_prevista, event.target.value)
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>

              <label className="space-y-1.5 xl:col-span-1">
                <span className="text-sm font-medium text-slate-700">Hora inicio</span>
                <TimeInput
                  value={formState.hora_inicio}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      hora_inicio: value,
                      dias: current.dias.map((dia) => ({ ...dia, hora_inicio: value })),
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>

              <label className="space-y-1.5 xl:col-span-1">
                <span className="text-sm font-medium text-slate-700">Hora fim</span>
                <TimeInput
                  value={formState.hora_fim}
                  onChange={(value) =>
                    setFormState((current) => ({
                      ...current,
                      hora_fim: value,
                      dias: current.dias.map((dia) => ({ ...dia, hora_fim: value })),
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>

              <label className="space-y-1.5 xl:col-span-1">
                <span className="text-sm font-medium text-slate-700">Carga horaria prevista</span>
                <input
                  type="number"
                  min="0"
                  max="1000"
                  value={formState.carga_horaria_prevista}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      carga_horaria_prevista: event.target.value,
                    }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>
            </div>

            <section className="border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Dias efetivos</h3>
                  <p className="text-sm text-slate-500">
                    Remova datas, adicione reposições e ajuste horários específicos.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={adicionarDia}>
                  <Plus className="h-4 w-4" />
                  Adicionar dia
                </Button>
              </div>
              <div className="mt-3 space-y-2">
                {formState.dias.map((dia, index) => (
                  <div
                    key={`${dia.data}-${index}`}
                    className="grid gap-2 border-b border-slate-100 pb-3 sm:grid-cols-[1fr,120px,120px,40px]"
                  >
                    <input
                      type="date"
                      aria-label={`Data do dia ${index + 1}`}
                      value={dia.data}
                      onChange={(event) => atualizarDia(index, { data: event.target.value })}
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                    />
                    <TimeInput
                      value={dia.hora_inicio}
                      onChange={(value) => atualizarDia(index, { hora_inicio: value })}
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                    />
                    <TimeInput
                      value={dia.hora_fim}
                      onChange={(value) => atualizarDia(index, { hora_fim: value })}
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                    />
                    <button
                      type="button"
                      aria-label={`Remover dia ${index + 1}`}
                      title="Remover dia"
                      onClick={() => removerDia(index)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {formState.dias.length === 0 && (
                  <p className="py-3 text-sm text-rose-700">
                    Adicione ao menos um dia efetivo para salvar a turma.
                  </p>
                )}
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Sala</span>
                <input
                  type="text"
                  value={formState.sala}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, sala: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Equipamento</span>
                <input
                  type="text"
                  value={formState.equipamento_descricao}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      equipamento_descricao: event.target.value,
                    }))
                  }
                  placeholder="Projetor, mockup ou equipamento específico"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Instrutor responsavel</span>
                <select
                  value={formState.instrutor_id}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, instrutor_id: event.target.value }))
                  }
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                >
                  <option value="">Nao definido</option>
                  {instrutores.map((instrutor) => (
                    <option key={instrutor.id} value={instrutor.id}>
                      {getPessoaLabel(instrutor.nome, instrutor.guerra, instrutor.matricula)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Local</span>
                <input
                  type="text"
                  value={formState.local}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, local: event.target.value }))
                  }
                  placeholder="Sala, simulador, base ou plataforma"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                />
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Descricao operacional</span>
                <textarea
                  rows={4}
                  value={formState.descricao}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, descricao: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                  placeholder="Objetivo, publico alvo, observacoes do instrutor..."
                />
              </label>

              <label className="space-y-1.5">
                <span className="text-sm font-medium text-slate-700">Observacoes internas</span>
                <textarea
                  rows={4}
                  value={formState.observacoes}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, observacoes: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors"
                  placeholder="Requisitos previos, sala reservada, dependencia de frota..."
                />
              </label>
            </div>

            <section className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Convocados</h3>
                  <p className="text-sm text-slate-500">
                    {formState.participante_ids.length} selecionado(s) de{' '}
                    {convocadosElegiveis.length} elegível(is).
                  </p>
                  {publicoQualificacaoSelecionada ? (
                    <p className="mt-0.5 text-xs font-medium text-indigo-600">
                      Filtro de público:{' '}
                      {publicoQualificacaoSelecionada === 'TRIPULACAO'
                        ? 'Tripulação'
                        : 'Manutenção'}
                    </p>
                  ) : convocadosElegiveis.length === (funcionarios as FuncionarioOption[]).length &&
                    formState.qualificacao_tipo_id ? (
                    <p className="mt-0.5 text-xs text-amber-600">
                      Tipo de público não identificado — revise a qualificação. Mostrando todos.
                    </p>
                  ) : null}
                </div>
                <input
                  type="search"
                  value={buscaConvocados}
                  onChange={(event) => setBuscaConvocados(event.target.value)}
                  placeholder="Buscar por nome, guerra, matricula"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 motion-safe:transition-colors sm:max-w-xs"
                />
              </div>

              <div className="mt-4 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {funcionariosLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                    Carregando funcionarios...
                  </div>
                ) : convocadosFiltrados.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                    Nenhum funcionario encontrado para o filtro atual.
                  </div>
                ) : (
                  convocadosFiltrados.map((funcionario) => {
                    const checked = formState.participante_ids.includes(funcionario.id);
                    return (
                      <label
                        key={funcionario.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 transition ${
                          checked
                            ? 'border-primary-200 bg-primary-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => alternarConvocado(funcionario.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600"
                        />
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {funcionario.guerra || funcionario.nome}
                          </p>
                          <p className="text-sm text-slate-500">
                            {[
                              funcionario.nome,
                              funcionario.matricula,
                              funcionario.setor,
                              funcionario.funcao,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </section>
          </form>
        </Modal>

        <Modal
          isOpen={modalDetalheAberto}
          onClose={fecharModalDetalhes}
          title={
            detalheTreinamento ? getEventoTitulo(detalheTreinamento) : 'Detalhes do treinamento'
          }
          size="5xl"
          footer={(() => {
            const isEncerrada =
              detalheTreinamento && STATUS_ENCERRADOS.has(detalheTreinamento.status);
            const isPlanejadoOuConfirmado =
              detalheTreinamento &&
              (detalheTreinamento.status === 'PLANEJADO' ||
                detalheTreinamento.status === 'CONFIRMADO');
            const isEmAndamento =
              detalheTreinamento && detalheTreinamento.status === 'EM_ANDAMENTO';
            const convocacaoDisabled = Boolean(convocacaoDisabledReason || enviandoConvocacao);

            // ── Ação primária contextual ──────────────────────────────
            let primaryAction: ReactNode = null;
            if (canWriteTraining && isPlanejadoOuConfirmado && !convocacaoDisabled) {
              primaryAction = (
                <Button onClick={abrirConvocacaoTurma} disabled={enviandoConvocacao}>
                  <Mail className="h-4 w-4" />
                  {enviandoConvocacao ? 'Preparando...' : 'Convocar Turma'}
                </Button>
              );
            } else if (canWriteTraining && isEmAndamento) {
              primaryAction = (
                <Button onClick={abrirConfirmacaoConclusao} disabled={concluirTurma.isPending}>
                  {concluirTurma.isPending ? 'Salvando...' : 'Concluir Turma'}
                </Button>
              );
            }

            // ── Ações secundárias (dropdown) ──────────────────────────
            const dropdownItems: DropdownMenuItem[] = [];
            if (canWriteTraining) {
              dropdownItems.push({
                key: 'editar',
                label: 'Editar',
                icon: <Edit2 className="h-4 w-4" />,
                onClick: () => abrirEditor(detalheQuery.data || treinamentoEditando),
                disabled: !detalheTreinamento,
              });
            }
            // Convocar vai para o dropdown quando não é ação primária
            if (canWriteTraining && !isPlanejadoOuConfirmado && !convocacaoDisabled) {
              dropdownItems.push({
                key: 'convocar',
                label: 'Convocar Turma',
                icon: <Mail className="h-4 w-4" />,
                onClick: abrirConvocacaoTurma,
              });
            }
            if (canWriteTraining && !isEncerrada) {
              dropdownItems.push({
                key: 'excluir',
                label: 'Excluir',
                icon: <Trash2 className="h-4 w-4" />,
                onClick: excluirTreinamentoSelecionado,
                danger: true,
                disabled: excluindo || !detalheTreinamento,
              });
            }

            return (
              <div className="flex w-full items-center gap-2">
                <Button variant="secondary" onClick={fecharModalDetalhes}>
                  Fechar
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  onClick={gerarListaPresencaTurmaAtual}
                  disabled={gerandoListaPresencaTurma || !detalheTreinamento}
                  title="Gerar lista de presença da turma em PDF"
                >
                  <ClipboardList className="h-4 w-4" />
                  Lista de Presença
                </Button>
                {dropdownItems.length > 0 && (
                  <DropdownMenu items={dropdownItems} ariaLabel="Mais ações" />
                )}
                {primaryAction}
              </div>
            );
          })()}
        >
          {!detalheTreinamento || detalheQuery.isLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
              Carregando detalhes do treinamento...
            </div>
          ) : (
            <div className="space-y-6">
              <section className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={detalheTreinamento.status} />
                    {detalheTreinamento.qualificacao_codigo && (
                      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                        {detalheTreinamento.qualificacao_codigo}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-slate-500">
                    {detalheTreinamento.qualificacao_nome}
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                        Agenda
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {formatDateLabel(
                          detalheTreinamento.data_inicio || detalheTreinamento.data_prevista,
                        )}
                        {(detalheTreinamento.data_fim || detalheTreinamento.data_prevista) !==
                          (detalheTreinamento.data_inicio || detalheTreinamento.data_prevista) &&
                          ` até ${formatDateLabel(
                            detalheTreinamento.data_fim || detalheTreinamento.data_prevista,
                          )}`}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatHourRange(
                          detalheTreinamento.hora_inicio,
                          detalheTreinamento.hora_fim,
                        )}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                        Instrutor e local
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        <FuncionarioLink
                          funcionarioId={detalheTreinamento.instrutor_id ?? undefined}
                          nome={
                            detalheTreinamento.instrutor_nome ||
                            detalheTreinamento.instrutor_guerra ||
                            'Nao definido'
                          }
                          className="text-sm font-semibold text-slate-900"
                        />
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {detalheTreinamento.local || 'Local a definir'}
                      </p>
                    </div>
                  </div>

                  {(detalheTreinamento.dias || []).length > 0 && (
                    <div className="mt-4 rounded-2xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                        Dias da turma
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {(detalheTreinamento.dias || []).map((dia) => (
                          <div
                            key={dia.id}
                            className="flex items-center justify-between border-b border-slate-100 py-2 text-sm"
                          >
                            <span className="font-medium text-slate-900">
                              {formatDateLabel(dia.data)}
                            </span>
                            <span className="text-slate-500">
                              {formatHourRange(dia.hora_inicio, dia.hora_fim)}
                              {(dia.presencas || []).length > 0 &&
                                ` · ${
                                  (dia.presencas || []).filter(
                                    (presenca) => presenca.status === 'PRESENTE',
                                  ).length
                                } presente(s)`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                        Convocados
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {detalheTreinamento.convocados_total}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                        Confirmados
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {detalheTreinamento.confirmados_total}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                        Presentes
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {detalheTreinamento.presentes_total}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">Descricao operacional</p>
                    <p className="mt-2 whitespace-pre-wrap">
                      {detalheTreinamento.descricao || 'Sem descricao registrada.'}
                    </p>
                    <p className="mt-4 font-semibold text-slate-900">Observacoes internas</p>
                    <p className="mt-2 whitespace-pre-wrap">
                      {detalheTreinamento.observacoes || 'Sem observacoes registradas.'}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Presenca diaria</h3>
                    <p className="text-sm text-slate-500">
                      Registro por dia da turma; aprovacao e emissao continuam no bloco de
                      conclusao.
                    </p>
                  </div>
                  {diaPresencaSelecionado ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        disabled={indiceDiaPresenca <= 0}
                        onClick={() =>
                          setDiaPresencaSelecionadoId(
                            diasPresenca[indiceDiaPresenca - 1]?.id || null,
                          )
                        }
                      >
                        Anterior
                      </Button>
                      <select
                        value={diaPresencaSelecionado.id}
                        onChange={(event) =>
                          setDiaPresencaSelecionadoId(Number(event.target.value))
                        }
                        className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                        aria-label="Selecionar dia de presenca"
                      >
                        {diasPresenca.map((dia) => (
                          <option key={dia.id} value={dia.id}>
                            {formatDateLabel(dia.data)} ·{' '}
                            {formatHourRange(dia.hora_inicio, dia.hora_fim)}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="secondary"
                        disabled={
                          indiceDiaPresenca < 0 || indiceDiaPresenca >= diasPresenca.length - 1
                        }
                        onClick={() =>
                          setDiaPresencaSelecionadoId(
                            diasPresenca[indiceDiaPresenca + 1]?.id || null,
                          )
                        }
                      >
                        Proximo
                      </Button>
                    </div>
                  ) : null}
                </div>

                {!diaPresencaSelecionado ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    Esta turma nao possui dias efetivos editaveis para presenca diaria.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-5">
                      {[
                        ['Presentes', resumoPresencaDia.presentes],
                        ['Ausentes', resumoPresencaDia.ausentes],
                        ['Parciais', resumoPresencaDia.parciais],
                        ['Dispensados', resumoPresencaDia.dispensados],
                        ['Pendentes', resumoPresencaDia.pendentes],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {label}
                          </p>
                          <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
                        </div>
                      ))}
                    </div>

                    {canWriteTraining ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={atualizarPresencaDia.isPending}
                          onClick={() => atualizarPresencaDiaEmLote('PRESENTE')}
                        >
                          Marcar todos presentes
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={atualizarPresencaDia.isPending}
                          onClick={() => atualizarPresencaDiaEmLote('AUSENTE')}
                        >
                          Marcar todos ausentes
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={atualizarPresencaDia.isPending}
                          onClick={() => atualizarPresencaDiaEmLote('PENDENTE')}
                        >
                          Limpar dia
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead>
                          <tr className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                            <th className="px-3 py-3">Participante</th>
                            <th className="px-3 py-3">Status diario</th>
                            <th className="px-3 py-3">Minutos</th>
                            <th className="px-3 py-3">Conclusao</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detalheTreinamento.participantes.map((participante) => {
                            const presenca = getPresencaDia(
                              diaPresencaSelecionado,
                              participante.funcionario_id,
                            );
                            const status = presenca?.status || 'PENDENTE';
                            const meta = getPresencaDiaMeta(status);
                            return (
                              <tr
                                key={`${diaPresencaSelecionado.id}-${participante.id}`}
                                className="align-top"
                              >
                                <td className="px-3 py-4">
                                  <p className="font-semibold text-slate-900">
                                    {participante.funcionario_guerra ||
                                      participante.funcionario_nome ||
                                      'Sem nome'}
                                  </p>
                                  <p className="text-slate-500">
                                    {[
                                      participante.funcionario_nome,
                                      participante.funcionario_matricula,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                </td>
                                <td className="px-3 py-4">
                                  <div className="flex flex-wrap gap-2">
                                    {PRESENCA_DIA_OPTIONS.map((option) => (
                                      <button
                                        key={option.value}
                                        type="button"
                                        disabled={
                                          !canWriteTraining || atualizarPresencaDia.isPending
                                        }
                                        onClick={() =>
                                          atualizarPresencaDiaParticipante(
                                            participante,
                                            option.value,
                                          )
                                        }
                                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                          status === option.value
                                            ? option.className
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-3 py-4 text-slate-600">
                                  {presenca?.minutos_presentes != null
                                    ? `${presenca.minutos_presentes} min`
                                    : status === 'PRESENTE'
                                      ? `${
                                          calcularMinutosPrevistos(
                                            diaPresencaSelecionado.hora_inicio,
                                            diaPresencaSelecionado.hora_fim,
                                          ) || 0
                                        } min`
                                      : '-'}
                                </td>
                                <td className="px-3 py-4">
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
                                  >
                                    {meta.label}
                                  </span>
                                  <p className="mt-2 text-xs text-slate-500">
                                    {participante.resultado
                                      ? `Resultado: ${participante.resultado}`
                                      : 'Sem conclusao'}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Conclusão da turma</h3>
                    <p className="text-sm text-slate-500">
                      O status da turma é recalculado pelo backend. Ela só fecha como concluída
                      quando todos os participantes tiverem resultado final.
                    </p>
                  </div>
                  {concluirTurma.isPending && (
                    <p className="text-sm text-slate-500">Salvando conclusão...</p>
                  )}
                </div>

                {detalheTreinamento.status === 'PLANEJADO' ||
                detalheTreinamento.status === 'CONFIRMADO' ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                    A conclusão da turma estará disponível quando o treinamento estiver em andamento
                    ou após a data de encerramento. Registre as presenças diárias durante a execução
                    da turma e depois retorne aqui para concluir.
                  </div>
                ) : (
                  <>
                    <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                      {[
                        ['Total', resumoConclusao.total],
                        ['Presentes', resumoConclusao.presentes],
                        ['Aprovados', resumoConclusao.aprovados],
                        ['Pendentes', resumoConclusao.pendentes],
                        ['Já concluídos', resumoConclusao.jaConcluidos],
                        ['Históricos gerados', resumoConclusao.historicosGerados],
                      ].map(([label, value]) => (
                        <div
                          key={String(label)}
                          className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                        >
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {label}
                          </p>
                          <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
                        </div>
                      ))}
                    </div>

                    {canConcluirTurma ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          disabled={concluirTurma.isPending}
                          onClick={() => aplicarConclusaoEmLote('presentes')}
                        >
                          Marcar todos como presentes
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={concluirTurma.isPending}
                          onClick={() => aplicarConclusaoEmLote('aprovados')}
                        >
                          Marcar todos como aprovados
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={concluirTurma.isPending}
                          onClick={() => aplicarConclusaoEmLote('presentes-aprovados')}
                        >
                          Marcar todos presentes e aprovados
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={concluirTurma.isPending}
                          onClick={() => aplicarConclusaoEmLote('limpar')}
                        >
                          Limpar marcações
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Apenas admin/gestor autorizado pode concluir a turma.
                      </div>
                    )}

                    <div className="mt-4 overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead>
                          <tr className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                            <th className="px-3 py-3">Participante</th>
                            <th className="px-3 py-3">Situação atual</th>
                            <th className="px-3 py-3">Presenca</th>
                            <th className="px-3 py-3">Resultado</th>
                            <th className="px-3 py-3">Histórico</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {detalheTreinamento.participantes.length === 0 ? (
                            <tr>
                              <td
                                colSpan={5}
                                className="px-3 py-8 text-center text-sm text-slate-500"
                              >
                                Nenhum convocado vinculado a este treinamento.
                              </td>
                            </tr>
                          ) : (
                            detalheTreinamento.participantes.map((participante) => {
                              const draft =
                                conclusaoDraft[participante.funcionario_id] ||
                                buildConclusaoDraft(participante, defaultConclusaoDate);
                              return (
                                <tr key={participante.id} className="align-top">
                                  <td className="px-3 py-4">
                                    <p className="font-semibold text-slate-900">
                                      {participante.funcionario_guerra ||
                                        participante.funcionario_nome ||
                                        'Sem nome'}
                                    </p>
                                    <p className="text-slate-500">
                                      {[
                                        participante.funcionario_nome,
                                        participante.funcionario_matricula,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ')}
                                    </p>
                                  </td>
                                  <td className="px-3 py-4 text-slate-600">
                                    <p>
                                      {[
                                        participante.funcionario_setor,
                                        participante.funcionario_funcao,
                                      ]
                                        .filter(Boolean)
                                        .join(' · ') || 'Nao informado'}
                                    </p>
                                    <p className="mt-2 text-xs text-slate-500">
                                      {participante.confirmado
                                        ? 'Confirmado'
                                        : 'Ainda não confirmado'}
                                      {participante.resultado
                                        ? ` · Resultado atual: ${participante.resultado}`
                                        : ' · Sem conclusão final'}
                                    </p>
                                  </td>
                                  <td className="px-3 py-4">
                                    <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                                      <input
                                        type="checkbox"
                                        checked={draft.presente === true}
                                        disabled={!canConcluirTurma || concluirTurma.isPending}
                                        onChange={(event) =>
                                          atualizarConclusaoParticipante(participante, {
                                            presente: event.target.checked ? true : null,
                                          })
                                        }
                                      />
                                      Presente
                                    </label>
                                  </td>
                                  <td className="px-3 py-4">
                                    <div className="flex flex-wrap gap-2">
                                      {[
                                        ['APROVADO', 'Aprovado'],
                                        ['REPROVADO', 'Reprovado'],
                                        ['INCOMPLETO', 'Incompleto'],
                                      ].map(([value, label]) => (
                                        <button
                                          key={value}
                                          type="button"
                                          disabled={!canConcluirTurma || concluirTurma.isPending}
                                          onClick={() =>
                                            atualizarConclusaoParticipante(participante, {
                                              resultado:
                                                value as ConclusaoParticipanteDraft['resultado'],
                                              presente:
                                                value === 'APROVADO' && draft.presente == null
                                                  ? true
                                                  : draft.presente,
                                              data_conclusao_efetiva:
                                                value === 'APROVADO'
                                                  ? draft.data_conclusao_efetiva ||
                                                    defaultConclusaoDate
                                                  : null,
                                            })
                                          }
                                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                                            draft.resultado === value
                                              ? value === 'APROVADO'
                                                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                                                : value === 'REPROVADO'
                                                  ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                                  : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                          }`}
                                        >
                                          {label}
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        disabled={!canConcluirTurma || concluirTurma.isPending}
                                        onClick={() =>
                                          atualizarConclusaoParticipante(participante, {
                                            resultado: null,
                                            data_conclusao_efetiva: null,
                                          })
                                        }
                                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                                      >
                                        Limpar
                                      </button>
                                    </div>
                                    {draft.resultado === 'APROVADO' ? (
                                      <div className="mt-3 max-w-[180px]">
                                        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                          Data de conclusão
                                        </label>
                                        <input
                                          type="date"
                                          value={draft.data_conclusao_efetiva || ''}
                                          max={today}
                                          disabled={!canConcluirTurma || concluirTurma.isPending}
                                          onChange={(event) =>
                                            atualizarConclusaoParticipante(participante, {
                                              data_conclusao_efetiva: event.target.value || null,
                                            })
                                          }
                                          className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                        />
                                      </div>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-4 text-slate-600">
                                    <p className="font-medium text-slate-900">
                                      {participante.qualificacao_historico_id
                                        ? `Histórico #${participante.qualificacao_historico_id}`
                                        : 'Sem histórico gerado'}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {participante.qualificacao_historico_status ||
                                        'Sem status histórico'}
                                    </p>
                                    {participante.resultado === 'APROVADO' &&
                                    participante.data_conclusao_efetiva ? (
                                      <p className="mt-2 text-xs text-slate-500">
                                        Última conclusão:{' '}
                                        {formatDateLabel(participante.data_conclusao_efetiva)}
                                      </p>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Histórico de convocações
                    </h3>
                    <p className="text-sm text-slate-500">
                      Registro operacional dos envios de e-mail e das falhas por participante.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {(detalheTreinamento.convocacoes_email || []).length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                      Nenhuma convocação por e-mail registrada para esta turma.
                    </div>
                  ) : (
                    (detalheTreinamento.convocacoes_email || []).map((convocacao) => (
                      <div
                        key={convocacao.id}
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                      >
                        <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {convocacao.assunto &&
                              convocacao.assunto.includes('{{') &&
                              detalheTreinamento
                                ? `Convocação: ${getEventoTitulo(detalheTreinamento)}`
                                : convocacao.assunto || 'Convocação de turma'}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {formatDateTimeLabel(convocacao.created_at)} ·{' '}
                              {convocacao.disparado_por_nome || 'Usuário do sistema'}
                            </p>
                            <p className="mt-1 text-sm text-slate-600">
                              {convocacao.enviados_sucesso} sucesso(s) · {convocacao.enviados_falha}{' '}
                              falha(s)
                            </p>
                            {convocacao.cc.length > 0 && (
                              <p className="mt-1 text-xs text-slate-500">
                                CC: {convocacao.cc.join(', ')}
                              </p>
                            )}
                          </div>
                          {convocacao.avisos.length > 0 && (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                              {convocacao.avisos.join(' ')}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* ── Trilha recente (colapsavel) ─────────────────────────── */}
              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <button
                  type="button"
                  onClick={() => setTrilhaRecenteAberta(!trilhaRecenteAberta)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Trilha recente</h3>
                    <p className="text-sm text-slate-500">
                      Registro auditado das alteracoes nesta turma.
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 text-slate-400 transition-transform ${
                      trilhaRecenteAberta ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {trilhaRecenteAberta && (
                  <div className="mt-4 space-y-3">
                    {(detalheQuery.data?.auditoria || []).length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-4 text-sm text-slate-500">
                        Nenhuma alteracao auditada ainda.
                      </div>
                    ) : (
                      (detalheQuery.data?.auditoria || []).map((registro) => (
                        <div
                          key={registro.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                        >
                          <div className="flex flex-col gap-1">
                            <p className="text-sm font-semibold text-slate-900">{registro.acao}</p>
                            <p className="text-xs text-slate-500">
                              {formatDateTimeLabel(registro.created_at)}
                            </p>
                            <p className="text-sm text-slate-600">
                              {registro.usuario_nome || 'Usuario do sistema'}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </Modal>

        <Modal
          isOpen={modalConfirmacaoConclusaoAberto}
          onClose={() => setModalConfirmacaoConclusaoAberto(false)}
          title="Confirmar conclusão da turma"
          size="xl"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalConfirmacaoConclusaoAberto(false)}>
                Revisar
              </Button>
              <Button onClick={confirmarConclusaoTurmaSalvar} disabled={concluirTurma.isPending}>
                {concluirTurma.isPending ? 'Salvando...' : 'Confirmar conclusão'}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              Você está prestes a concluir a turma e registrar presença/aprovação dos participantes
              selecionados. Esta ação pode gerar histórico e qualificações para participantes
              elegíveis.
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['Presentes', resumoConclusao.presentes],
                ['Aprovados', resumoConclusao.aprovados],
                [
                  'Reprovados/Incompletos',
                  resumoConclusao.reprovados + resumoConclusao.incompletos,
                ],
                ['Pendentes sem conclusão', resumoConclusao.pendentes],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Regra operacional</p>
              <p className="mt-2">
                A tabela principal só exibirá <strong>Concluído</strong> quando todos os
                participantes tiverem resultado final. Participantes pendentes mantêm a turma em
                andamento.
              </p>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={modalConfirmacaoConvocacaoAberto}
          onClose={() => setModalConfirmacaoConvocacaoAberto(false)}
          title="Confirmar convocação da turma"
          size="3xl"
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => setModalConfirmacaoConvocacaoAberto(false)}
              >
                Cancelar
              </Button>
              <Button
                onClick={confirmarConvocacaoTurma}
                disabled={
                  enviarConvocacao.isPending ||
                  (Boolean(convocacaoPreview?.ultima_convocacao_em) && !confirmarReenvio) ||
                  ((convocacaoPreview?.ausentes_email.length || 0) +
                    (convocacaoPreview?.invalidos_email.length || 0) >
                    0 &&
                    !ignorarSemEmail)
                }
              >
                {enviarConvocacao.isPending ? 'Enviando...' : 'Confirmar envio'}
              </Button>
            </>
          }
        >
          {!convocacaoPreview ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Carregando prévia...
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Destinatários
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">
                    {convocacaoPreview.destinatarios_total}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {convocacaoPreview.destinatarios_validos} válidos para envio
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Treinamento
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {convocacaoPreview.treinamento_nome}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{convocacaoPreview.modalidade}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Agenda
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {convocacaoPreview.data_inicio}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{convocacaoPreview.horario}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Local / acesso
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {convocacaoPreview.local}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {convocacaoPreview.link_acesso || 'Sem link associado'}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Gestores em cópia</p>
                {convocacaoPreview.gestores_cc.length > 0 ? (
                  <>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        onClick={() =>
                          setGestoresCcSelecionadosIds(
                            convocacaoPreview.gestores_cc.map((gestor) => gestor.id),
                          )
                        }
                      >
                        Marcar todos
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                        onClick={() => setGestoresCcSelecionadosIds([])}
                      >
                        Limpar
                      </button>
                    </div>
                    <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                      {convocacaoPreview.gestores_cc.map((gestor) => (
                        <label
                          key={gestor.id}
                          className="flex items-start gap-2 text-sm text-slate-600"
                        >
                          <input
                            type="checkbox"
                            checked={gestoresCcSelecionadosIds.includes(gestor.id)}
                            onChange={(event) => {
                              setGestoresCcSelecionadosIds((current) => {
                                if (event.target.checked) {
                                  return current.includes(gestor.id)
                                    ? current
                                    : [...current, gestor.id];
                                }
                                return current.filter((id) => id !== gestor.id);
                              });
                            }}
                          />
                          <span>
                            {gestor.nome}{' '}
                            <span className="text-slate-500">&lt;{gestor.email}&gt;</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    Nenhum gestor ativo configurado para cópia.
                  </p>
                )}
              </div>

              {(convocacaoPreview.ausentes_email.length > 0 ||
                convocacaoPreview.invalidos_email.length > 0) && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
                    <div>
                      <p className="font-semibold text-amber-900">
                        Alguns participantes não entrarão na fila
                      </p>
                      <ul className="mt-2 space-y-1 text-sm text-amber-800">
                        {convocacaoPreview.ausentes_email.map((item) => (
                          <li key={`missing-${item.funcionario_id}`}>
                            {item.nome}: sem e-mail cadastrado
                          </li>
                        ))}
                        {convocacaoPreview.invalidos_email.map((item) => (
                          <li key={`invalid-${item.funcionario_id}`}>
                            {item.nome}: e-mail inválido ({item.email})
                          </li>
                        ))}
                      </ul>
                      <label className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-900">
                        <input
                          type="checkbox"
                          checked={ignorarSemEmail}
                          onChange={(event) => setIgnorarSemEmail(event.target.checked)}
                        />
                        Confirmo o envio ignorando participantes sem e-mail ou com e-mail inválido.
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {convocacaoPreview.ultima_convocacao_em && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-semibold text-rose-900">
                    Esta turma já recebeu convocação em{' '}
                    {formatDateTimeLabel(convocacaoPreview.ultima_convocacao_em)}.
                  </p>
                  <label className="mt-3 flex items-center gap-2 text-sm font-medium text-rose-800">
                    <input
                      type="checkbox"
                      checked={confirmarReenvio}
                      onChange={(event) => setConfirmarReenvio(event.target.checked)}
                    />
                    Confirmo que desejo reenviar a convocação desta turma.
                  </label>
                </div>
              )}

              {convocacaoPreview.avisos.length > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  {convocacaoPreview.avisos.map((aviso) => (
                    <p key={aviso}>{aviso}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal>

        <Modal
          isOpen={modalResultadoConvocacaoAberto}
          onClose={() => setModalResultadoConvocacaoAberto(false)}
          title="Resultado da convocação"
          size="4xl"
          footer={
            <Button variant="secondary" onClick={() => setModalResultadoConvocacaoAberto(false)}>
              Fechar
            </Button>
          }
        >
          {!convocacaoResultado ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
              Sem resultado disponível.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
                    Sucesso
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-emerald-900">
                    {convocacaoResultado.enviados_sucesso}
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">
                    Falhas
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-rose-900">
                    {convocacaoResultado.enviados_falha}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-3">Tripulante</th>
                      <th className="px-3 py-3">E-mail</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3">Motivo</th>
                      <th className="px-3 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {convocacaoResultado.itens.map((item) => (
                      <tr key={`${item.funcionario_id}-${item.email || 'sem-email'}`}>
                        <td className="px-3 py-3 font-medium text-slate-900">{item.nome}</td>
                        <td className="px-3 py-3 text-slate-600">{item.email || 'Sem e-mail'}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.status === 'sucesso' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : item.status === 'falha' ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{item.erro_mensagem || '—'}</td>
                        <td className="px-3 py-3 text-right">
                          {item.status === 'falha' && item.email ? (
                            <Button
                              variant="secondary"
                              onClick={() => reenviarIndividual(item.funcionario_id)}
                              disabled={reenviarConvocacao.isPending}
                            >
                              Reenviar
                            </Button>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>

        {(tiposLoading || funcionariosLoading) && (
          <div className="pointer-events-none fixed bottom-6 right-6 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
            Atualizando bases de apoio...
          </div>
        )}
      </div>
    </main>
  );
}
