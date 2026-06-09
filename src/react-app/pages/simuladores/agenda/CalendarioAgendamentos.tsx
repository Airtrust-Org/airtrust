/**
 * CALENDÁRIO DE AGENDAMENTOS DE SIMULADORES
 *
 * Visualização em formato calendário (Mensal, Semanal, Agenda)
 * - Vista Mensal: Grid de dias com eventos
 * - Vista Semanal: Dias da semana em colunas
 * - Vista Agenda: Lista cronológica
 *
 * Filtros:
 * - Simulador
 * - Período
 * - Status
 * - Funcionário (Piloto)
 * - Instrutor
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { SimuladoresCard } from '../components/SimuladoresLayout';
import { Calendar, ChevronLeft, ChevronRight, Printer, Search } from 'lucide-react';
import ModalNovaSessao from '@/react-app/components/modals/ModalNovaSessao';
import { getCorSimulador, isCheck } from '@/react-app/utils/simulador-cores';
import { useLanguage } from '@/react-app/i18n/useLanguage';
import { toast } from 'sonner';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import {
  openMonthlyAgendaPrint,
  openCalendarGridPrint,
  openWeeklyAgendaPrint,
  openDailyAgendaPrint,
  openAgendaListPrint,
  type MonthlyAgendaPrintSession,
  type WeeklyPrintOptions,
} from './monthlyAgendaPrint';
import {
  parseStoredCalendarViewMode,
  SIMULADORES_CALENDAR_VIEW_MODE_STORAGE_KEY,
  type SimuladoresCalendarViewMode,
} from './calendarViewState';

// ==================== TYPES ====================

interface Agendamento {
  id: number;
  modo_compartilhado?: number | boolean;
  simulador_id: number;
  simulador_nome: string;
  simulador_tipo?: string;
  simulador_modelo?: string;
  tipo_dispositivo?: 'SIMULADOR' | 'AERONAVE';
  aeronave_id?: number | null;
  aeronave_prefixo?: string | null;
  aeronave_modelo?: string | null;
  template_id?: number | null;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  horario_inicio?: string; // Alias de hora_inicio (para compatibilidade com /sessoes)
  horario_fim?: string; // Alias de hora_fim (para compatibilidade com /sessoes)
  tipo_sessao: string;
  tipo_sessao_id?: number | null; // FK canônica via JOIN modelos_sessao (commit 7b3b034)
  tipo_sessao_codigo?: string | null; // Código via JOIN tipos_sessao (commit 7b3b034)
  tema_sessao?: string;
  instrutor_id: number;
  instrutor_nome: string;
  examinador_id?: number | null;
  examinador_nome?: string | null;
  status: string;
  observacoes?: string;
  fichas?: Array<{ id: number; status?: string }>; // Array de fichas geradas
  participantes?: Array<{
    id?: number; // id do participante (sessoes_participantes.id)
    funcionario_id?: number; // id do funcionario
    nome?: string; // nome do funcionario (de /agendamentos)
    funcionario_nome?: string; // nome do funcionario (de /sessoes)
    funcao: string;
  }>;
}

interface Instrutor {
  id: number;
  nome: string;
}

type ViewMode = SimuladoresCalendarViewMode;

/**
 * Ordena participantes por função: PIC primeiro, depois SIC, depois demais
 */
function sortParticipantesByFuncao(participantes: any[]) {
  if (!participantes || participantes.length === 0) return [];

  const ordem: Record<string, number> = { PIC: 0, SIC: 1, DUAL: 2 };

  return [...participantes].sort((a, b) => {
    const prioA = ordem[a.funcao] ?? 99;
    const prioB = ordem[b.funcao] ?? 99;
    return prioA - prioB;
  });
}

// ==================== HELPERS ====================

const DIAS_SEMANA_PT = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const DIAS_SEMANA_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DIAS_SEMANA_FULL_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_SEMANA_FULL_EN = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];
const MESES_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const FICHAS_STATUS_FINAIS = new Set(['CONCLUIDA', 'APROVADO', 'NAO_APROVADO']);

function isSessionConcluida(agendamento: Agendamento): boolean {
  const fichas = agendamento.fichas;
  if (!fichas || fichas.length === 0) return false;
  return fichas.every((f) => FICHAS_STATUS_FINAIS.has(f.status || ''));
}

const CORES_CONCLUIDA = {
  bg: 'bg-slate-100',
  border: 'border-l-slate-500',
  text: 'text-slate-500',
};

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const firstDayOfWeek = firstDay.getDay();
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }

  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }

  const lastDayOfWeek = lastDay.getDay();
  for (let i = 1; i <= 6 - lastDayOfWeek; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

function getWeekDays(date: Date): Date[] {
  const days: Date[] = [];
  const dayOfWeek = date.getDay();
  const startOfWeek = new Date(date);
  startOfWeek.setDate(date.getDate() - dayOfWeek);

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    days.push(d);
  }

  return days;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

// ==================== COMPONENT ====================

export default function CalendarioAgendamentos() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  const DIAS_SEMANA = language === 'en-US' ? DIAS_SEMANA_EN : DIAS_SEMANA_PT;
  const DIAS_SEMANA_FULL = language === 'en-US' ? DIAS_SEMANA_FULL_EN : DIAS_SEMANA_FULL_PT;
  const MESES = language === 'en-US' ? MESES_EN : MESES_PT;

  const { isAluno } = usePermissions();
  const readOnly = isAluno; // apenas ALUNO fica em modo somente leitura

  // State
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [instrutores, setInstrutores] = useState<Instrutor[]>([]);
  const [loading, setLoading] = useState(true);

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    parseStoredCalendarViewMode(localStorage.getItem(SIMULADORES_CALENDAR_VIEW_MODE_STORAGE_KEY)),
  );

  // Restaurar data salva do localStorage ou usar hoje
  const [currentDate, setCurrentDate] = useState(() => {
    const saved = localStorage.getItem('simuladores_calendar_date');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return new Date(parsed.year, parsed.month, 1);
      } catch {
        return new Date();
      }
    }
    return new Date();
  });

  // Filters
  const [filtroInstrutor, setFiltroInstrutor] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroBusca, setFiltroBusca] = useState('');

  // Modal
  const [modalNovaSessaoOpen, setModalNovaSessaoOpen] = useState(false);
  const [sessaoSelecionada, setSessaoSelecionada] = useState<any>(null);

  const handleNovaSessaoNaData = (day: Date) => {
    if (readOnly) return;
    // Reset any previously selected session to ensure create mode
    setSessaoSelecionada(null);
    // Use setTimeout to let React flush the null state before re-opening
    setTimeout(() => {
      setSessaoSelecionada({ data: formatDate(day) } as any);
      setModalNovaSessaoOpen(true);
    }, 0);
  };

  // readOnly em mobile → padrão agenda (lista vertical, mais usável com toque)
  useEffect(() => {
    if (readOnly && typeof window !== 'undefined' && window.innerWidth < 768) {
      setViewMode('agenda');
    }
  }, [readOnly]);

  // Persistir visualização para preservar semanal/mensal após salvar e remontar a tela.
  useEffect(() => {
    localStorage.setItem(SIMULADORES_CALENDAR_VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  // Persistir data ao mudar
  useEffect(() => {
    localStorage.setItem(
      'simuladores_calendar_date',
      JSON.stringify({
        year: currentDate.getFullYear(),
        month: currentDate.getMonth(),
      }),
    );
  }, [currentDate]);

  // ==================== DATA LOADING ====================

  useEffect(() => {
    const carregarDadosIniciais = async () => {
      try {
        const _token = getAccessToken();
        const _authH = _token ? { Authorization: `Bearer ${_token}` } : {};
        const instRes = await fetch(`${API_BASE_URL}/simuladores/instrutores`, { headers: _authH });

        if (instRes.ok) {
          const data = await instRes.json();
          if (data.success) setInstrutores(data.data || []);
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      }
    };

    carregarDadosIniciais();
  }, []);

  useEffect(() => {
    const carregarAgendamentos = async () => {
      try {
        setLoading(true);

        let dataInicio: string;
        let dataFim: string;

        if (viewMode === 'monthly') {
          const year = currentDate.getFullYear();
          const month = currentDate.getMonth();
          dataInicio = formatDate(new Date(year, month, 1));
          dataFim = formatDate(new Date(year, month + 1, 0));
        } else if (viewMode === 'weekly') {
          if (readOnly) {
            const inicio = new Date();
            inicio.setMonth(inicio.getMonth() - 6);
            dataInicio = formatDate(inicio);
            const fim = new Date();
            fim.setMonth(fim.getMonth() + 6);
            dataFim = formatDate(fim);
          } else {
            const weekDays = getWeekDays(currentDate);
            dataInicio = formatDate(weekDays[0]);
            dataFim = formatDate(weekDays[6]);
          }
        } else {
          if (readOnly) {
            // Perfis restritos: carrega 6 meses passados + 6 meses futuros
            const inicio = new Date();
            inicio.setMonth(inicio.getMonth() - 6);
            dataInicio = formatDate(inicio);
            const fim = new Date();
            fim.setMonth(fim.getMonth() + 6);
            dataFim = formatDate(fim);
          } else {
            dataInicio = formatDate(new Date());
            const fim = new Date();
            fim.setDate(fim.getDate() + 30);
            dataFim = formatDate(fim);
          }
        }

        const params = new URLSearchParams();
        params.append('data_inicio', dataInicio);
        params.append('data_fim', dataFim);
        params.append('_t', Date.now().toString()); // Cache bust

        const _tok1 = getAccessToken();
        const response = await fetch(`${API_BASE_URL}/simuladores/sessoes?${params}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            ...(_tok1 ? { Authorization: `Bearer ${_tok1}` } : {}),
          },
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // Normalizar dados de /sessoes para interface Agendamento
            const normalized = (data.data || []).map((sessao: any) => ({
              ...sessao,
              hora_inicio: sessao.horario_inicio || sessao.hora_inicio,
              hora_fim: sessao.horario_fim || sessao.hora_fim,
              participantes: (sessao.participantes || []).map((p: any) => ({
                id: p.funcionario_id || p.id,
                nome: p.funcionario_nome || p.nome,
                funcao: p.funcao,
              })),
            }));
            setAgendamentos(normalized);
            // readOnly + weekly: auto-navigate to nearest session if current week is empty
            if (readOnly && viewMode === 'weekly' && normalized.length > 0) {
              const weekDays = getWeekDays(currentDate);
              const weekStart = formatDate(weekDays[0]);
              const weekEnd = formatDate(weekDays[6]);
              const hasSessionThisWeek = normalized.some(
                (ag: any) => ag.data >= weekStart && ag.data <= weekEnd,
              );
              if (!hasSessionThisWeek) {
                // Jump to the date of the nearest upcoming session (or most recent past)
                const today = formatDate(new Date());
                const upcoming = normalized
                  .map((ag: any) => ag.data)
                  .filter((d: string) => d >= today)
                  .sort();
                const past = normalized
                  .map((ag: any) => ag.data)
                  .filter((d: string) => d < today)
                  .sort()
                  .reverse();
                const target = upcoming[0] ?? past[0];
                if (target) {
                  setCurrentDate(new Date(target + 'T00:00:00'));
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
      } finally {
        setLoading(false);
      }
    };

    carregarAgendamentos();
  }, [currentDate, viewMode, readOnly]);

  const recarregarAgendamentos = async () => {
    try {
      setLoading(true);

      let dataInicio: string;
      let dataFim: string;

      if (viewMode === 'monthly') {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        dataInicio = formatDate(new Date(year, month, 1));
        dataFim = formatDate(new Date(year, month + 1, 0));
      } else if (viewMode === 'weekly') {
        if (readOnly) {
          const inicio = new Date();
          inicio.setMonth(inicio.getMonth() - 6);
          dataInicio = formatDate(inicio);
          const fim = new Date();
          fim.setMonth(fim.getMonth() + 6);
          dataFim = formatDate(fim);
        } else {
          const weekDays = getWeekDays(currentDate);
          dataInicio = formatDate(weekDays[0]);
          dataFim = formatDate(weekDays[6]);
        }
      } else {
        if (readOnly) {
          // Perfis restritos: carrega 6 meses passados + 6 meses futuros
          const inicio = new Date();
          inicio.setMonth(inicio.getMonth() - 6);
          dataInicio = formatDate(inicio);
          const fim = new Date();
          fim.setMonth(fim.getMonth() + 6);
          dataFim = formatDate(fim);
        } else {
          dataInicio = formatDate(new Date());
          const fim = new Date();
          fim.setDate(fim.getDate() + 30);
          dataFim = formatDate(fim);
        }
      }

      const params = new URLSearchParams();
      params.append('data_inicio', dataInicio);
      params.append('data_fim', dataFim);
      params.append('t', new Date().getTime().toString()); // Bypass cache

      const _tok2 = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes?${params}`, {
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          ...(_tok2 ? { Authorization: `Bearer ${_tok2}` } : {}),
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // Normalizar dados de /sessoes para interface Agendamento
          const normalized = (data.data || []).map((sessao: any) => ({
            ...sessao,
            hora_inicio: sessao.horario_inicio || sessao.hora_inicio,
            hora_fim: sessao.horario_fim || sessao.hora_fim,
            participantes: (sessao.participantes || []).map((p: any) => ({
              id: p.funcionario_id || p.id,
              nome: p.funcionario_nome || p.nome,
              funcao: p.funcao,
            })),
          }));
          setAgendamentos(normalized);
          // readOnly + weekly: auto-navigate to nearest session if current week is empty
          if (readOnly && viewMode === 'weekly' && normalized.length > 0) {
            const weekDays = getWeekDays(currentDate);
            const weekStart = formatDate(weekDays[0]);
            const weekEnd = formatDate(weekDays[6]);
            const hasSessionThisWeek = normalized.some(
              (ag: any) => ag.data >= weekStart && ag.data <= weekEnd,
            );
            if (!hasSessionThisWeek) {
              // Jump to the date of the nearest upcoming session (or most recent past)
              const today = formatDate(new Date());
              const upcoming = normalized
                .map((ag: any) => ag.data)
                .filter((d: string) => d >= today)
                .sort();
              const past = normalized
                .map((ag: any) => ag.data)
                .filter((d: string) => d < today)
                .sort()
                .reverse();
              const target = upcoming[0] ?? past[0];
              if (target) {
                setCurrentDate(new Date(target + 'T00:00:00'));
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar agendamentos:', error);
    } finally {
      setLoading(false);
    }
  };

  // ==================== FILTERED DATA ====================

  const agendamentosFiltrados = useMemo(() => {
    return agendamentos.filter((ag) => {
      if (filtroInstrutor && ag.instrutor_id !== Number(filtroInstrutor)) return false;
      if (filtroStatus && ag.status !== filtroStatus) return false;

      // Filtro de busca por texto
      if (filtroBusca) {
        const buscaLower = filtroBusca.toLowerCase();
        const simuladorMatch = ag.simulador_nome.toLowerCase().includes(buscaLower);
        const instrutorMatch = ag.instrutor_nome.toLowerCase().includes(buscaLower);
        const participantesMatch = ag.participantes?.some((p) =>
          p.nome.toLowerCase().includes(buscaLower),
        );

        if (!simuladorMatch && !instrutorMatch && !participantesMatch) return false;
      }

      return true;
    });
  }, [agendamentos, filtroInstrutor, filtroStatus, filtroBusca]);

  const agendamentosPorDia = useMemo(() => {
    const map = new Map<string, Agendamento[]>();
    agendamentosFiltrados.forEach((ag) => {
      const key = ag.data;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ag);
    });
    map.forEach((list) => {
      list.sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
    });
    return map;
  }, [agendamentosFiltrados]);

  // ==================== NAVIGATION ====================

  const navegarAnterior = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'monthly') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCurrentDate(newDate);
  };

  const navegarProximo = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'monthly') {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCurrentDate(newDate);
  };

  const irParaHoje = () => {
    setCurrentDate(new Date());
  };

  // ==================== RENDER HELPERS ====================

  const getTituloNavegacao = () => {
    if (viewMode === 'monthly') {
      return `${MESES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    } else if (viewMode === 'weekly') {
      const weekDays = getWeekDays(currentDate);
      const inicio = weekDays[0];
      const fim = weekDays[6];

      if (inicio.getMonth() === fim.getMonth()) {
        return `${inicio.getDate()} - ${fim.getDate()} de ${
          MESES[inicio.getMonth()]
        }, ${inicio.getFullYear()}`;
      } else {
        return `${inicio.getDate()} ${MESES[inicio.getMonth()].substring(
          0,
          3,
        )} - ${fim.getDate()} ${MESES[fim.getMonth()].substring(0, 3)}, ${inicio.getFullYear()}`;
      }
    }
    return t('sim.calendar.nextSchedules');
  };

  const hasActiveFilters = filtroInstrutor || filtroStatus || filtroBusca;

  const limparFiltros = () => {
    setFiltroInstrutor('');
    setFiltroStatus('');
    setFiltroBusca('');
  };

  const handleImprimirMes = () => {
    if (viewMode !== 'monthly') {
      toast.warning('A impressão do agendamento está disponível apenas na visão mensal.');
      return;
    }

    const instrutorSelecionado = instrutores.find(
      (instrutor) => instrutor.id === Number(filtroInstrutor),
    );
    const opened = openMonthlyAgendaPrint({
      monthDate: currentDate,
      sessions: buildSessions(),
      filters: {
        instrutor: instrutorSelecionado?.nome,
        status: filtroStatus || undefined,
        busca: filtroBusca || undefined,
      },
    });

    if (!opened) {
      toast.error(
        'Não foi possível abrir a impressão. Verifique se o navegador bloqueou a nova janela.',
      );
    }
  };

  const buildSessions = (): MonthlyAgendaPrintSession[] => {
    return agendamentosFiltrados.map((agendamento) => ({
      id: agendamento.id,
      simulador_nome: agendamento.simulador_nome,
      simulador_tipo: agendamento.simulador_tipo,
      simulador_modelo: agendamento.simulador_modelo,
      data: agendamento.data,
      hora_inicio: agendamento.hora_inicio,
      hora_fim: agendamento.hora_fim,
      tipo_sessao: agendamento.tipo_sessao,
      tema_sessao: agendamento.tema_sessao,
      instrutor_nome: agendamento.instrutor_nome,
      examinador_nome: agendamento.examinador_nome,
      status: agendamento.status,
      observacoes: agendamento.observacoes,
      participantes: sortParticipantesByFuncao(agendamento.participantes || []).map((p) => ({
        nome: p.nome,
        funcao: p.funcao,
      })),
    }));
  };

  const handleImprimirCalendario = () => {
    if (viewMode !== 'monthly') {
      toast.warning('A impressão em calendário está disponível apenas na visão mensal.');
      return;
    }
    const instrutorSelecionado = instrutores.find((i) => i.id === Number(filtroInstrutor));
    const opened = openCalendarGridPrint({
      monthDate: currentDate,
      sessions: buildSessions(),
      filters: {
        instrutor: instrutorSelecionado?.nome,
        status: filtroStatus || undefined,
        busca: filtroBusca || undefined,
      },
    });
    if (!opened) {
      toast.error('Não foi possível abrir a impressão.');
    }
  };

  const handleImprimirSemanal = () => {
    const instrutorSelecionado = instrutores.find((i) => i.id === Number(filtroInstrutor));
    const weekDays = getWeekDays(currentDate);
    const opts: WeeklyPrintOptions = {
      weekStart: weekDays[0],
      sessions: buildSessions(),
      filters: {
        instrutor: instrutorSelecionado?.nome,
        status: filtroStatus || undefined,
        busca: filtroBusca || undefined,
      },
    };
    if (!openWeeklyAgendaPrint(opts)) toast.error('Não foi possível abrir a impressão.');
  };

  const handleImprimirAgenda = () => {
    const instrutorSelecionado = instrutores.find((i) => i.id === Number(filtroInstrutor));
    if (
      !openAgendaListPrint({
        sessions: buildSessions(),
        filters: {
          instrutor: instrutorSelecionado?.nome,
          status: filtroStatus || undefined,
          busca: filtroBusca || undefined,
        },
      })
    )
      toast.error('Não foi possível abrir a impressão.');
  };

  const handleImprimirDiario = () => {
    const instrutorSelecionado = instrutores.find((i) => i.id === Number(filtroInstrutor));
    if (
      !openDailyAgendaPrint({
        date: currentDate,
        sessions: buildSessions(),
        filters: {
          instrutor: instrutorSelecionado?.nome,
          status: filtroStatus || undefined,
          busca: filtroBusca || undefined,
        },
      })
    ) {
      toast.error('Não foi possível abrir a impressão.');
    }
  };

  // ==================== EVENT CARD ====================

  const EventCard = ({
    agendamento,
    compact = false,
  }: {
    agendamento: Agendamento;
    compact?: boolean;
  }) => {
    const concluida = isSessionConcluida(agendamento);
    const cores = concluida ? CORES_CONCLUIDA : getCorSimulador(agendamento);
    const piloto = agendamento.participantes?.[0];

    const handleClick = (e: React.MouseEvent) => {
      // stopPropagation must run unconditionally — prevents day-cell onClick from firing
      e.stopPropagation();
      if (readOnly) return; // ALUNO/INSTRUTOR: apenas visualização, sem edição
      try {
        const sessaoFormatada = {
          id: agendamento.id,
          modo_compartilhado: agendamento.modo_compartilhado,
          template_id: agendamento.template_id ?? null,
          simulador_id: agendamento.simulador_id,
          simulador_nome: agendamento.simulador_nome,
          simulador_modelo: agendamento.simulador_modelo,
          // tipo_dispositivo: AERONAVE or SIMULADOR — must be passed so modal selects correct toggle
          tipo_dispositivo: agendamento.tipo_dispositivo ?? 'SIMULADOR',
          // aeronave fields for AERONAVE sessions
          aeronave_id: agendamento.aeronave_id ?? null,
          aeronave_prefixo: agendamento.aeronave_prefixo ?? null,
          aeronave_modelo: agendamento.aeronave_modelo ?? null,
          data: agendamento.data,
          horario_inicio: agendamento.hora_inicio,
          horario_fim: agendamento.hora_fim,
          instrutor_id: agendamento.instrutor_id,
          instrutor_nome: agendamento.instrutor_nome,
          examinador_id: agendamento.examinador_id ?? null,
          examinador_nome: agendamento.examinador_nome,
          tipo_sessao: agendamento.tipo_sessao,
          tipo_sessao_id: agendamento.tipo_sessao_id ?? null,
          tipo_sessao_codigo: agendamento.tipo_sessao_codigo ?? null,
          // For AERONAVE sessions, use aeronave_modelo as the aircraft type code; fall back to simulador fields
          tipo_aeronave: agendamento.aeronave_modelo || agendamento.simulador_tipo || agendamento.simulador_modelo,
          tema_sessao: agendamento.tema_sessao,
          observacoes: agendamento.observacoes,
          // Preserve original funcionario_id so the modal pre-fills participants correctly
          participantes:
            agendamento.participantes?.map((p) => ({
              funcionario_id: (p.funcionario_id ?? p.id) as number,
              funcao: p.funcao as 'PIC' | 'SIC',
            })) || [],
          fichas: agendamento.fichas || [],
        };
        // Set session and open modal. If already open from a previous create flow,
        // close first to force a clean re-open with new data.
        if (modalNovaSessaoOpen) {
          setModalNovaSessaoOpen(false);
          setSessaoSelecionada(sessaoFormatada as any);
          setTimeout(() => {
            setModalNovaSessaoOpen(true);
          }, 0);
        } else {
          setSessaoSelecionada(sessaoFormatada as any);
          setModalNovaSessaoOpen(true);
        }
      } catch (error) {
        console.error('[Calendar] Erro handleClick:', error);
      }
    };

    if (compact) {
      const participantesOrdenados = sortParticipantesByFuncao(agendamento.participantes || []);
      const participantesText =
        participantesOrdenados.length > 0
          ? participantesOrdenados.map((p) => p.nome).join(', ')
          : '';
      const isCheck =
        (agendamento.examinador_id != null && agendamento.examinador_id > 0) ||
        !!agendamento.examinador_nome;
      return (
        <div
          className={`${cores.bg} ${
            cores.border
          } border-l-4 rounded-r px-2 py-1 mb-1 cursor-pointer hover:shadow-sm transition-shadow text-xs ${
            isCheck ? 'ring-1 ring-emerald-700' : ''
          }`}
          onClick={handleClick}
          title={`${agendamento.tema_sessao || agendamento.tipo_sessao}\n${
            agendamento.hora_inicio
          } - ${agendamento.hora_fim}\n${t('sim.calendar.card.participants')}: ${
            participantesText || t('sim.calendar.card.na')
          }\n${t('sim.calendar.card.instructor')}: ${
            agendamento.instrutor_nome
          }${agendamento.examinador_nome ? `\n👨‍✈️ ${t('sim.calendar.card.examiner')}: ${agendamento.examinador_nome}` : ''}`}
        >
          <div className={`font-semibold ${cores.text} truncate flex items-center gap-1`}>
            {agendamento.hora_inicio.substring(0, 5)}
            {Boolean(agendamento.modo_compartilhado) && (
              <span className="rounded bg-indigo-100 px-1 text-[8px] font-semibold uppercase text-indigo-700">
                Compartilhada
              </span>
            )}
            {concluida && (
              <span title="Todas as fichas concluídas" className="text-[9px] text-slate-400">
                ✓
              </span>
            )}
          </div>
          <div className="text-slate-700 font-medium truncate text-[11px]">
            {agendamento.tema_sessao || agendamento.tipo_sessao || agendamento.simulador_nome}
          </div>
          {agendamento.examinador_nome && (
            <div className="text-emerald-900 font-semibold truncate text-[10px]">
              👨‍✈️ {t('sim.calendar.card.examiner')}: {agendamento.examinador_nome}
            </div>
          )}
          {participantesText && (
            <div className="text-slate-500 truncate text-[10px]">{participantesText}</div>
          )}
        </div>
      );
    }

    return (
      <div
        className={`${cores.bg} ${cores.border} border-l-4 rounded-r-lg p-3 mb-2 cursor-pointer hover:shadow-md transition-shadow`}
        onClick={handleClick}
      >
        <div className={`font-bold ${cores.text} text-sm flex items-center gap-1`}>
          {agendamento.tema_sessao || agendamento.tipo_sessao || agendamento.simulador_nome}
          {Boolean(agendamento.modo_compartilhado) && (
            <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-indigo-700">
              Compartilhada
            </span>
          )}
          {concluida && (
            <span title="Todas as fichas concluídas" className="ml-auto text-slate-400 text-xs">
              ✓
            </span>
          )}
        </div>
        <div className="text-slate-600 text-xs mt-1">
          {agendamento.hora_inicio.substring(0, 5)} - {agendamento.hora_fim.substring(0, 5)}
        </div>
        {agendamento.participantes && agendamento.participantes.length > 0 && (
          <div className="text-slate-500 text-xs mt-1">
            {t('sim.calendar.card.participants')}:{' '}
            {sortParticipantesByFuncao(agendamento.participantes)
              .map((p) => p.nome)
              .join(', ')}
          </div>
        )}
        <div className="text-slate-500 text-xs">
          {t('sim.calendar.card.instructor')}: {agendamento.instrutor_nome}
        </div>
        {agendamento.examinador_nome && (
          <div className="text-emerald-700 text-xs font-semibold mt-1">
            👨‍✈️ {t('sim.calendar.card.examiner')}: {agendamento.examinador_nome}
          </div>
        )}
      </div>
    );
  };

  // ==================== MONTHLY VIEW ====================

  const renderMonthlyView = () => {
    const days = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
    const currentMonth = currentDate.getMonth();

    return (
      <div className="overflow-hidden overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div
          className="grid min-w-[560px] grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/70"
          data-no-auto-i18n="true"
        >
          {DIAS_SEMANA.map((dia) => (
            <div
              key={dia}
              className="py-3 text-center text-xs font-semibold text-slate-500 uppercase"
            >
              {dia}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 min-w-[560px]">
          {days.map((day, index) => {
            const isCurrentMonth = day.getMonth() === currentMonth;
            const hoje = isToday(day);
            const dateKey = formatDate(day);
            const eventos = agendamentosPorDia.get(dateKey) || [];

            return (
              <div
                key={index}
                onClick={() => handleNovaSessaoNaData(day)}
                className={`min-h-[120px] border-b border-r border-slate-100 p-2 dark:border-slate-800 ${
                  !isCurrentMonth ? 'bg-slate-50 dark:bg-slate-800/60' : 'bg-white dark:bg-slate-900'
                } ${!readOnly ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors' : ''}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span
                    className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                      hoje
                        ? 'bg-primary text-white'
                        : isCurrentMonth
                          ? 'text-slate-900 dark:text-slate-100'
                          : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {eventos.length > 3 && (
                    <span className="text-xs text-slate-500">+{eventos.length - 3}</span>
                  )}
                </div>

                <div className="space-y-1">
                  {eventos.slice(0, 3).map((ev) => (
                    <EventCard key={ev.id} agendamento={ev} compact />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ==================== WEEKLY VIEW ====================

  const renderWeeklyView = () => {
    const weekDays = getWeekDays(currentDate);

    return (
      <div className="overflow-hidden overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="grid min-w-[560px] grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/70">
          {weekDays.map((day, index) => {
            const hoje = isToday(day);
            return (
              <div
                key={index}
                className="border-r border-slate-100 py-4 text-center last:border-r-0 dark:border-slate-800"
              >
                <div className="text-xs font-medium text-primary uppercase">
                  {DIAS_SEMANA_FULL[day.getDay()].substring(0, 3)}
                </div>
                <div
                  className={`text-2xl font-bold mt-1 w-10 h-10 mx-auto flex items-center justify-center rounded-full ${
                    hoje ? 'bg-primary text-white' : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-7 min-h-[500px] min-w-[560px]">
          {weekDays.map((day, index) => {
            const dateKey = formatDate(day);
            const eventos = agendamentosPorDia.get(dateKey) || [];

            return (
              <div
                key={index}
                onClick={() => handleNovaSessaoNaData(day)}
                className={`border-r border-slate-100 p-3 last:border-r-0 dark:border-slate-800 ${
                  !readOnly ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors' : ''
                }`}
              >
                {eventos.map((ev) => (
                  <EventCard key={ev.id} agendamento={ev} />
                ))}

                {eventos.length === 0 && (
                  <div className="text-center text-slate-400 text-sm py-8">
                    {t('sim.calendar.agenda.noEventsInDay')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ==================== AGENDA VIEW ====================

  const renderAgendaView = () => {
    const sortedDates = Array.from(agendamentosPorDia.keys()).sort();

    if (sortedDates.length === 0) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Calendar className="w-16 h-16 mx-auto text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">
            {t('sim.calendar.agenda.emptyTitle')}
          </h3>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            {t('sim.calendar.agenda.emptySubtitle')}
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {sortedDates.map((dateKey) => {
          const date = new Date(dateKey + 'T00:00:00');
          const eventos = agendamentosPorDia.get(dateKey)!;
          const hoje = isToday(date);

          return (
            <div
              key={dateKey}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <div
                className={`border-b border-slate-200 px-4 py-3 dark:border-slate-800 ${
                  hoje ? 'bg-primary/5 dark:bg-blue-500/10' : 'bg-slate-50 dark:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-lg flex flex-col items-center justify-center ${
                      hoje
                        ? 'bg-primary text-white'
                        : 'border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                    }`}
                  >
                    <span className="text-xs font-medium uppercase">
                      {DIAS_SEMANA[date.getDay()]}
                    </span>
                    <span className="text-lg font-bold">{date.getDate()}</span>
                  </div>
                  <div>
                    <div
                      className={`font-semibold ${hoje ? 'text-primary dark:text-blue-300' : 'text-slate-900 dark:text-slate-100'}`}
                    >
                      {hoje ? t('sim.calendar.today') : DIAS_SEMANA_FULL[date.getDay()]}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      {MESES[date.getMonth()]} {date.getFullYear()}
                    </div>
                  </div>
                  <div className="ml-auto">
                    <span className="rounded bg-slate-100 px-2 py-1 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {eventos.length} {eventos.length === 1 ? 'sessão' : 'sessões'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {eventos.map((ev) => (
                  <EventCard key={ev.id} agendamento={ev} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ==================== MAIN RENDER ====================

  // Conteúdo interno do calendário (usado tanto embedded quanto standalone)
  const CalendarioContent = () => {
    return (
      <SimuladoresCard className="p-5">
        {/* Busca, Filtros e Toggle de Visualização — tudo em uma linha */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Busca compacta */}
          <div className="relative w-48 sm:w-56">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder={t('sim.calendar.searchPlaceholder')}
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-slate-700 placeholder:text-gray-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Filtro status */}
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="cursor-pointer rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          >
            <option value="">{t('sim.calendar.status.all')}</option>
            <option value="AGENDADO">{t('sim.calendar.status.scheduled')}</option>
            <option value="EM_ANDAMENTO">{t('sim.calendar.status.inProgress')}</option>
            <option value="CONCLUIDO">{t('sim.calendar.status.completed')}</option>
            <option value="CANCELADO">{t('sim.calendar.status.canceled')}</option>
          </select>

          {/* Filtro instrutor — oculto para readOnly (só veem as próprias sessões) */}
          {!readOnly && (
            <select
              value={filtroInstrutor}
              onChange={(e) => setFiltroInstrutor(e.target.value)}
              className="cursor-pointer rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">{t('sim.calendar.instructor.all')}</option>
              {instrutores.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          )}

          {hasActiveFilters && (
            <button
              onClick={limparFiltros}
              className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              {t('sim.calendar.filters.clear')}
            </button>
          )}

          {/* Separador visual */}
          <div className="flex-1" />

          {/* Toggle de Visualização */}
          <div className="flex items-center rounded-lg bg-gray-100 p-1 dark:bg-slate-800">
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'monthly'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                  : 'text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              {t('sim.calendar.view.monthly')}
            </button>
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'weekly'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                  : 'text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              {t('sim.calendar.view.weekly')}
            </button>
            <button
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                viewMode === 'agenda'
                  ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-950 dark:text-slate-100'
                  : 'text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              {t('sim.calendar.view.agenda')}
            </button>
          </div>
        </div>

        {/* Navegação do Calendário */}
        <div className="flex items-center justify-between mt-4 mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={navegarAnterior}
              className="rounded-lg border border-slate-200 p-2 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              title={t('sim.calendar.nav.prevMonth')}
            >
              <ChevronLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </button>
            <h2 className="min-w-[120px] text-center text-base font-bold text-slate-900 dark:text-slate-100 sm:min-w-[200px] sm:text-xl">
              {getTituloNavegacao()}
            </h2>
            <button
              onClick={navegarProximo}
              className="rounded-lg border border-slate-200 p-2 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              title={t('sim.calendar.nav.nextMonth')}
            >
              <ChevronRight className="h-5 w-5 text-slate-600 dark:text-slate-300" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={irParaHoje}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t('sim.calendar.today')}
            </button>
            {/* Botões de impressão — ocultos em mobile (não aplicáveis) */}
            <button
              onClick={handleImprimirDiario}
              className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:inline-flex"
              title="Imprimir o dia em foco (A4 retrato)"
            >
              <Printer className="w-4 h-4" />
              Dia
            </button>
            {/* Mensal: Lista + Calendário */}
            {viewMode === 'monthly' && (
              <>
                <button
                  onClick={handleImprimirMes}
                  className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:inline-flex"
                  title="Imprimir lista detalhada do mês"
                >
                  <Printer className="w-4 h-4" />
                  Lista
                </button>
                <button
                  onClick={handleImprimirCalendario}
                  className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:inline-flex"
                  title="Imprimir grade de calendário mensal"
                >
                  <Calendar className="w-4 h-4" />
                  Calendário
                </button>
              </>
            )}
            {/* Semanal */}
            {viewMode === 'weekly' && (
              <button
                onClick={handleImprimirSemanal}
                className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:inline-flex"
                title="Imprimir semana atual (A4 paisagem)"
              >
                <Printer className="w-4 h-4" />
                Imprimir semana
              </button>
            )}
            {/* Agenda */}
            {viewMode === 'agenda' && (
              <button
                onClick={handleImprimirAgenda}
                className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 sm:inline-flex"
                title="Imprimir lista de próximos agendamentos"
              >
                <Printer className="w-4 h-4" />
                Imprimir agenda
              </button>
            )}
          </div>
        </div>

        {/* Conteúdo do Calendário */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        ) : (
          <>
            {viewMode === 'monthly' && renderMonthlyView()}
            {viewMode === 'weekly' && renderWeeklyView()}
            {viewMode === 'agenda' && renderAgendaView()}
          </>
        )}
      </SimuladoresCard>
    );
  };

  return (
    <div className="space-y-4">
      <CalendarioContent />

      {/* Modal de Nova Sessão */}
      <ModalNovaSessao
        isOpen={modalNovaSessaoOpen}
        onClose={() => {
          setModalNovaSessaoOpen(false);
          setSessaoSelecionada(null);
        }}
        onSuccess={() => {
          setModalNovaSessaoOpen(false);
          setSessaoSelecionada(null);
          recarregarAgendamentos();
        }}
        sessao={sessaoSelecionada}
        onDelete={async (id: number) => {
          try {
            const token = getAccessToken();
            const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${id}`, {
              method: 'DELETE',
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });

            if (!response.ok) throw new Error('Erro ao excluir sessão');

            const result = await response.json();
            if (result.success) {
              recarregarAgendamentos();
            }
          } catch (error) {
            console.error('Erro ao excluir sessão:', error);
          }
        }}
        onVerFichas={(sessaoId: number) => {
          navigate(`/simuladores?tab=fichas&sessao=${sessaoId}`);
        }}
      />
    </div>
  );
}
