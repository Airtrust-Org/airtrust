/**
 * FICHAS DE AVALIAÇÃO - PAINEL PRINCIPAL
 *
 * Gerenciamento de fichas de sessões de simulador
 * - Dashboard com estatísticas
 * - Busca e filtros
 * - Tabela com ordenação
 * - Ações de avaliação e assinatura
 */

import { useState, useEffect, useMemo } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useAuth } from '@/react-app/hooks/useAuth';
import { hasInstructorEvaluationCapability } from '@/react-app/utils/simuladoresEvaluateCapability';
import AppLayout from '@/react-app/components/AppLayout';
import {
  CalendarDays,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  Eye,
  FileDown,
  Filter,
  Loader2,
  PenTool,
  Printer,
  Search,
  Trash2,
  TrendingUp,
  User,
} from 'lucide-react';
import { SimuladoresCard } from '../components/SimuladoresLayout';
import ModalAvaliarFicha from '@/react-app/components/modals/ModalAvaliarFicha';
import AssinaturaModal from '@/react-app/components/AssinaturaModal';
import { ConfirmDeleteModal } from '@/react-app/components/modals/ConfirmDeleteModal';
import { BaseModal } from '@/react-app/components/modals/BaseModal';
import {
  buildFichaModeloPdfData,
  type ModeloSessaoManobra,
  type ModeloSessaoResumo,
} from './fichaModeloPdf';
import { isFichaFutureEvaluation } from './fichaAvailability';
import { RowActionsMenu } from '@/react-app/components/UI/RowActionsMenu';

interface Instrutor {
  id: number;
  nome: string;
}

interface EmpresaResumo {
  logo_url?: string | null;
  certificado_logo_url?: string | null;
}

interface Ficha {
  id: number;
  agendamento_slot_id?: number; // sessao_id
  participante_nome: string;
  participante_funcao: 'PIC' | 'SIC' | 'OBS' | 'PF' | 'PM';
  colaborador_id_aluno?: number;
  aluno_matricula?: string;
  aluno_codigo_anac?: string;
  simulador_codigo: string;
  simulador_nome?: string;
  sessao_modelo: string;
  sessao_titulo?: string;
  tipo_sessao?: string;
  data_sessao?: string;
  hora_inicio?: string;
  hora_fim?: string;
  data_hora: string;
  instrutor_nome: string;
  status:
    | 'AVALIACAO_PENDENTE'
    | 'AGUARDANDO_ASSINATURA_ALUNO'
    | 'AGUARDANDO_ASSINATURA_INSTRUTOR'
    | 'APROVADO'
    | 'NAO_APROVADO'
    | 'CONCLUIDA';
  assinatura_aluno_timestamp?: string | null;
  assinatura_instrutor_timestamp?: string | null;
  nota_geral?: number;
}

// Mapeamento de status para exibição amigável (SIMPLIFICADO)
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  AVALIACAO_PENDENTE: {
    label: 'Avaliação Pendente',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border border-amber-200',
  },
  AGUARDANDO_ASSINATURA_ALUNO: {
    label: 'Aguardando Aluno',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border border-blue-200',
  },
  AGUARDANDO_ASSINATURA_INSTRUTOR: {
    label: 'Aguardando Instrutor',
    color: 'text-purple-700',
    bg: 'bg-purple-50 border border-purple-200',
  },
  CONCLUIDA: {
    label: 'Concluída',
    color: 'text-green-700',
    bg: 'bg-green-50 border border-green-200',
  },
  APROVADO: {
    label: 'Aprovado',
    color: 'text-green-700',
    bg: 'bg-green-50 border border-green-200',
  },
  NAO_APROVADO: {
    label: 'Não Aprovado',
    color: 'text-red-700',
    bg: 'bg-red-50 border border-red-200',
  },
};

const STATUS_PRIORITY: Record<string, number> = {
  AVALIACAO_PENDENTE: 0,
  AGUARDANDO_ASSINATURA_INSTRUTOR: 1,
  AGUARDANDO_ASSINATURA_ALUNO: 2,
  NAO_APROVADO: 3,
  APROVADO: 4,
  CONCLUIDA: 5,
};

const getStatusPriority = (status?: string | null) => STATUS_PRIORITY[status || ''] ?? 99;

type SortColumn = 'participante_nome' | 'sessao_titulo' | 'instrutor_nome' | 'data_hora' | 'status';
type SortDirection = 'asc' | 'desc' | null;

const formatarData = (dataHora?: string) => {
  if (!dataHora) return '-';

  const iso = dataHora.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (iso) {
    const [, ano, mes, dia] = iso;
    return `${dia}/${mes}/${ano}`;
  }

  const data = new Date(dataHora);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleDateString('pt-BR');
};

const formatarHora = (dataHora?: string) => {
  if (!dataHora) return '--:--';
  const data = new Date(dataHora);
  if (Number.isNaN(data.getTime())) return '--:--';
  return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatarResumoModelos = (modelos: string[]) => {
  if (modelos.length === 0) return '';
  if (modelos.length <= 3) return modelos.join(', ');
  return `${modelos.slice(0, 3).join(', ')} e mais ${modelos.length - 3}`;
};

export type FichasViewMode = 'all' | 'minhas' | 'para-avaliar';

interface FichasAvaliacaoContentProps {
  /**
   * 'minhas' — apenas fichas onde o usuário autenticado é o participante
   *   avaliado (aluno). Sem ações de avaliação/assinatura de instrutor.
   * 'para-avaliar' — apenas fichas onde o usuário autenticado é o
   *   instrutor formalmente atribuído. Nunca mostra assinatura como aluno.
   * 'all' (padrão) — painel completo (admin/gestor), comportamento legado.
   */
  mode?: FichasViewMode;
}

const FICHAS_VIEW_COPY: Record<Exclude<FichasViewMode, 'all'>, { title: string; subtitle: string }> = {
  minhas: {
    title: 'Minhas Fichas de Treinamento de Voo',
    subtitle: 'Consulte e assine suas próprias fichas como participante.',
  },
  'para-avaliar': {
    title: 'Fichas de Treinamento de Voo para Avaliar',
    subtitle: 'Avalie e assine as fichas dos participantes sob sua instrução.',
  },
};

export function FichasAvaliacaoContent({ mode = 'all' }: FichasAvaliacaoContentProps = {}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role, isAdmin, isGestor, isAluno, isInstrutor } = usePermissions();
  const { user: currentUser } = useAuth();
  const isMinhasMode = mode === 'minhas';
  const isParaAvaliarMode = mode === 'para-avaliar';
  // Capability real (não apenas "o modo da tela é para-avaliar" e não o
  // `can()` genérico, que aplica wildcard de ADMINISTRADOR/GESTOR): mesma
  // regra que a rota de backend exige em GET /fichas/para-avaliar
  // (hasSimuladoresEvaluateCapability — sem fallback de role admin/gestor).
  // Nas telas dedicadas ("Minhas Fichas" / "Fichas para Avaliar") as ações de
  // instrutor (avaliar / assinar instrutor / imprimir ficha modelo) seguem o
  // papel exercido NESSA lista (identidade por ficha, já garantida pelo
  // backend) E a capability real do usuário — nunca apenas o modo da tela
  // nem o wildcard de role administrativo.
  const showInstrutorActions = isMinhasMode
    ? false
    : isParaAvaliarMode
      ? hasInstructorEvaluationCapability(role, currentUser?.permissions)
      : !isAluno;
  const sessaoIdParam = searchParams.get('sessao');
  const [fichas, setFichas] = useState<Ficha[]>([]);
  const [instrutores, setInstrutores] = useState<Instrutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroInstrutor, setFiltroInstrutor] = useState('');
  const [filtroSimulador, setFiltroSimulador] = useState('');
  const [busca, setBusca] = useState('');

  // Estado de ordenação
  const [sortColumn, setSortColumn] = useState<SortColumn>('data_hora');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Estados dos modais
  const [selectedFichaId, setSelectedFichaId] = useState<number | null>(null);
  const [modalAvaliar, setModalAvaliar] = useState(false);
  const [modalAssinatura, setModalAssinatura] = useState<{
    isOpen: boolean;
    papel: 'INSTRUTOR' | 'TRIPULANTE';
  }>({ isOpen: false, papel: 'TRIPULANTE' });
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);
  const [modalFichaModeloAberto, setModalFichaModeloAberto] = useState(false);
  const [modelosSessao, setModelosSessao] = useState<ModeloSessaoResumo[]>([]);
  const [loadingModelosSessao, setLoadingModelosSessao] = useState(false);
  const [erroModelosSessao, setErroModelosSessao] = useState<string | null>(null);
  const [feedbackFichaModelo, setFeedbackFichaModelo] = useState<string | null>(null);
  const [gerandoFichaModelo, setGerandoFichaModelo] = useState(false);
  const [gerandoFichaModeloFichaId, setGerandoFichaModeloFichaId] = useState<number | null>(null);
  const [modelosSelecionados, setModelosSelecionados] = useState<Set<number>>(new Set());
  const [gerandoProgresso, setGerandoProgresso] = useState(0);

  // Estado para informações da sessão filtrada
  const [sessaoInfo, setSessaoInfo] = useState<{
    titulo: string;
    data: string;
    simulador: string;
  } | null>(null);

  const authHeaders = (): Record<string, string> => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const modelosImprimiveis = useMemo(
    () => modelosSessao.filter((modelo) => Number(modelo.total_manobras || 0) > 0),
    [modelosSessao],
  );

  useEffect(() => {
    carregarFichas();
    carregarInstrutores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoIdParam]);

  // Carregar informações da sessão quando filtrado
  useEffect(() => {
    if (sessaoIdParam) {
      carregarSessaoInfo(sessaoIdParam);
    } else {
      setSessaoInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessaoIdParam]);

  useEffect(() => {
    if (!modalFichaModeloAberto) return;
    void carregarModelosSessao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalFichaModeloAberto]);

  const carregarSessaoInfo = async (sessaoId: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${sessaoId}`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.sessao) {
          const s = data.sessao;
          setSessaoInfo({
            titulo: s.tipo_sessao || `Sessão #${sessaoId}`,
            data: s.data ? new Date(s.data).toLocaleDateString('pt-BR') : '',
            simulador: s.simulador_nome || '',
          });
        }
      }
    } catch (error) {
      console.error('Erro ao carregar info da sessão:', error);
    }
  };

  const carregarInstrutores = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/instrutores`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setInstrutores(data.data || []);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar instrutores:', error);
    }
  };

  const carregarModelosSessao = async () => {
    try {
      setLoadingModelosSessao(true);
      setErroModelosSessao(null);
      setFeedbackFichaModelo(null);
      const response = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao?t=${Date.now()}`, {
        headers: authHeaders(),
      });

      if (!response.ok) {
        throw new Error('Erro ao carregar modelos de sessão');
      }

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Erro ao carregar modelos de sessão');
      }

      const modelosOrdenados = ((data.data || []) as ModeloSessaoResumo[])
        .map((modelo) => ({
          ...modelo,
          total_manobras: Number(modelo.total_manobras || 0),
        }))
        .sort(
          (a: ModeloSessaoResumo, b: ModeloSessaoResumo) =>
            `${a.codigo} ${a.nome}`.localeCompare(`${b.codigo} ${b.nome}`, 'pt-BR'),
        );
      setModelosSessao(modelosOrdenados);
    } catch (error) {
      console.error('Erro ao carregar modelos de sessão:', error);
      setModelosSessao([]);
      setErroModelosSessao('Não foi possível carregar os modelos de sessão da empresa ativa.');
      toast.error('Erro ao carregar modelos de sessão');
    } finally {
      setLoadingModelosSessao(false);
    }
  };

  const carregarLogoEmpresa = async (): Promise<string | undefined> => {
    try {
      const response = await fetch(`${API_BASE_URL}/empresas/minha`, {
        headers: authHeaders(),
      });

      if (!response.ok) return undefined;

      const data = await response.json();
      const empresa = data.data as EmpresaResumo | undefined;
      return empresa?.certificado_logo_url || empresa?.logo_url || undefined;
    } catch (error) {
      console.warn('Erro ao carregar logo da empresa para ficha modelo:', error);
      return undefined;
    }
  };

  const fecharModalFichaModelo = () => {
    setModalFichaModeloAberto(false);
    setModelosSelecionados(new Set());
    setGerandoProgresso(0);
    setErroModelosSessao(null);
    setFeedbackFichaModelo(null);
  };

  const abrirModalFichaModelo = () => {
    setModelosSelecionados(new Set());
    setErroModelosSessao(null);
    setFeedbackFichaModelo(null);
    setModalFichaModeloAberto(true);
  };

  const handleGerarFichaModelo = async () => {
    if (modelosSelecionados.size === 0) {
      toast.warning('Selecione ao menos um modelo de sessão');
      return;
    }

    try {
      setGerandoFichaModelo(true);
      setGerandoProgresso(0);
      setFeedbackFichaModelo(null);

      const logoUrl = await carregarLogoEmpresa();
      const { gerarPDFFichaCliente } = await import('@/react-app/services/pdf-ficha-client');
      const selecionados = modelosSessao.filter((m) => modelosSelecionados.has(m.id));
      const selecionadosBloqueados = selecionados.filter(
        (modelo) => Number(modelo.total_manobras || 0) === 0,
      );
      const selecionadosImprimiveis = selecionados.filter(
        (modelo) => Number(modelo.total_manobras || 0) > 0,
      );

      if (selecionadosImprimiveis.length === 0) {
        const modelosBloqueados = formatarResumoModelos(
          selecionadosBloqueados.map((modelo) => modelo.codigo || modelo.nome),
        );
        const message = modelosBloqueados
          ? `Nenhum modelo selecionado pode ser impresso. Sem manobras: ${modelosBloqueados}.`
          : 'Nenhum modelo selecionado pode ser impresso no momento.';
        setFeedbackFichaModelo(message);
        toast.warning(message);
        return;
      }

      let gerados = 0;
      const falhas: string[] = [];
      const previewPolicyMessage =
        'Preview controlado: 18 técnicas por ordem + 15 NOTECHS fixos; seleção pedagógica final pendente.';

      for (const modelo of selecionadosImprimiveis) {
        try {
          const manobrasResponse = await fetch(
            `${API_BASE_URL}/simuladores/modelos-sessao/${modelo.id}/manobras`,
            { headers: authHeaders() },
          );
          if (!manobrasResponse.ok) {
            falhas.push(`${modelo.codigo || modelo.nome}: erro ao carregar manobras`);
            continue;
          }
          const manobrasPayload = await manobrasResponse.json();
          const manobras = (manobrasPayload.data || []) as ModeloSessaoManobra[];
          if (manobras.length === 0) {
            falhas.push(`${modelo.codigo || modelo.nome}: sem manobras cadastradas`);
            continue;
          }
          const dadosPDF = buildFichaModeloPdfData(modelo, manobras, logoUrl);
          await gerarPDFFichaCliente(dadosPDF, { mode: 'download' });
          gerados++;
          setGerandoProgresso(Math.round((gerados / selecionadosImprimiveis.length) * 100));
        } catch (error) {
          console.error('Erro ao gerar ficha modelo para o modelo', modelo.id, error);
          falhas.push(`${modelo.codigo || modelo.nome}: falha ao gerar PDF`);
        }
      }

      const bloqueados = selecionadosBloqueados.map((modelo) => modelo.codigo || modelo.nome);
      const mensagens: string[] = [];

      if (gerados > 0) {
        mensagens.push(
          gerados === 1 ? '1 ficha modelo gerada com sucesso.' : `${gerados} fichas modelo geradas com sucesso.`,
        );
        mensagens.push(previewPolicyMessage);
      }

      if (bloqueados.length > 0) {
        mensagens.push(`Bloqueadas por falta de manobras: ${formatarResumoModelos(bloqueados)}.`);
      }

      if (falhas.length > 0) {
        mensagens.push(`Falhas: ${formatarResumoModelos(falhas)}.`);
      }

      if (gerados > 0 && falhas.length === 0 && bloqueados.length === 0) {
        toast.success(mensagens[0]);
        fecharModalFichaModelo();
      } else {
        const message = mensagens.join(' ');
        setFeedbackFichaModelo(message || 'Nenhuma ficha pôde ser gerada.');
        if (gerados > 0) {
          toast.warning(message || 'A geração foi concluída com pendências.');
        } else {
          toast.error(message || 'Nenhuma ficha pôde ser gerada');
        }
      }
    } catch (error) {
      console.error('Erro ao gerar ficha modelo:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar ficha modelo');
    } finally {
      setGerandoFichaModelo(false);
      setGerandoProgresso(0);
    }
  };

  const handleGerarFichaModeloDaFicha = async (fichaId: number) => {
    try {
      setGerandoFichaModeloFichaId(fichaId);

      const [fichaResponse, logoUrl] = await Promise.all([
        fetch(`${API_BASE_URL}/simuladores/fichas/${fichaId}`, {
          headers: authHeaders(),
        }),
        carregarLogoEmpresa(),
      ]);

      if (!fichaResponse.ok) {
        throw new Error('Erro ao carregar dados da ficha');
      }

      const fichaPayload = await fichaResponse.json();
      const modeloId = Number(fichaPayload?.data?.modelo_sessao_id || 0);

      if (!modeloId) {
        throw new Error('Esta ficha não possui modelo de sessão vinculado para impressão');
      }

      const [modeloResponse, manobrasResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${modeloId}`, {
          headers: authHeaders(),
        }),
        fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${modeloId}/manobras`, {
          headers: authHeaders(),
        }),
      ]);

      if (!modeloResponse.ok || !manobrasResponse.ok) {
        throw new Error('Erro ao carregar o modelo vinculado à ficha');
      }

      const modeloPayload = await modeloResponse.json();
      const manobrasPayload = await manobrasResponse.json();
      const modelo = modeloPayload.data as ModeloSessaoResumo | undefined;
      const manobras = (manobrasPayload.data || []) as ModeloSessaoManobra[];

      if (!modelo) {
        throw new Error('Modelo da sessão não encontrado');
      }

      if (manobras.length === 0) {
        throw new Error('O modelo desta sessão não possui manobras cadastradas');
      }

      const dadosPDF = buildFichaModeloPdfData(modelo, manobras, logoUrl);
      const { gerarPDFFichaCliente } = await import('@/react-app/services/pdf-ficha-client');
      await gerarPDFFichaCliente(dadosPDF, { mode: 'download' });
      toast.success(
        'Ficha modelo da sessão gerada em preview controlado: 18 técnicas por ordem + 15 NOTECHS fixos.',
      );
    } catch (error) {
      console.error('Erro ao gerar ficha modelo da sessão:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar ficha modelo');
    } finally {
      setGerandoFichaModeloFichaId(null);
    }
  };

  const carregarFichas = async () => {
    try {
      setLoading(true);
      console.log('[CARREGAR_FICHAS] Iniciando busca...');

      // Adicionar timestamp para evitar cache
      // Telas dedicadas ("Minhas Fichas" / "Fichas para Avaliar") usam
      // endpoints com contrato próprio: identidade sempre derivada da sessão
      // autenticada no backend, nunca do papel global do usuário.
      const endpoint = isMinhasMode
        ? `${API_BASE_URL}/simuladores/fichas/minhas?t=${new Date().getTime()}`
        : isParaAvaliarMode
          ? `${API_BASE_URL}/simuladores/fichas/para-avaliar?t=${new Date().getTime()}`
          : sessaoIdParam
            ? `${API_BASE_URL}/simuladores/sessoes/${sessaoIdParam}/fichas?t=${new Date().getTime()}`
            : `${API_BASE_URL}/simuladores/fichas?t=${new Date().getTime()}`;

      const response = await fetch(endpoint, {
        headers: {
          ...authHeaders(),
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      console.log('[CARREGAR_FICHAS] Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('[CARREGAR_FICHAS] Dados recebidos:', data.data?.length, 'fichas');
        console.log(
          '[CARREGAR_FICHAS] Primeiras 3 fichas:',
          data.data?.slice(0, 3).map((f: Ficha) => ({
            id: f.id,
            nome: f.participante_nome,
            status: f.status,
          })),
        );

        if (data.success) {
          setFichas(data.data || []);
        }
      }
    } catch (error) {
      console.error('[CARREGAR_FICHAS] Erro ao carregar fichas:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handler de ordenação
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Cicla: asc -> desc -> null
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortDirection(null);
        setSortColumn('data_hora'); // Reset para default
      } else {
        setSortDirection('asc');
      }
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Filtros e ordenação aplicados
  const fichasFiltradas = useMemo(() => {
    let resultado = fichas.filter((f) => {
      // Filtro por sessão (quando vem da navegação de sessões)
      if (sessaoIdParam && Number(f.agendamento_slot_id) !== Number(sessaoIdParam)) return false;

      // Filtro de status - CORRIGIDO com valores reais do backend
      if (filtroStatus) {
        if (filtroStatus === 'AGUARDANDO_ASSINATURAS') {
          // Agrupa os dois status de aguardando assinatura
          if (
            f.status !== 'AGUARDANDO_ASSINATURA_ALUNO' &&
            f.status !== 'AGUARDANDO_ASSINATURA_INSTRUTOR'
          ) {
            return false;
          }
        } else if (filtroStatus === 'CONCLUIDAS') {
          // Agrupa todos os status de conclusão
          if (f.status !== 'APROVADO' && f.status !== 'NAO_APROVADO' && f.status !== 'CONCLUIDA') {
            return false;
          }
        } else if (f.status !== filtroStatus) {
          return false;
        }
      }

      // Filtro de instrutor
      if (
        filtroInstrutor &&
        !f.instrutor_nome?.toLowerCase().includes(filtroInstrutor.toLowerCase())
      )
        return false;

      // Filtro de simulador - CORRIGIDO para usar simulador_nome
      if (
        filtroSimulador &&
        !f.simulador_nome?.toLowerCase().includes(filtroSimulador.toLowerCase())
      )
        return false;

      // Busca por texto
      if (busca) {
        const termo = busca.toLowerCase();
        return (
          f.participante_nome?.toLowerCase().includes(termo) ||
          f.sessao_modelo?.toLowerCase().includes(termo) ||
          f.simulador_codigo?.toLowerCase().includes(termo) ||
          f.instrutor_nome?.toLowerCase().includes(termo) ||
          f.aluno_codigo_anac?.toLowerCase().includes(termo)
        );
      }
      return true;
    });

    resultado = [...resultado].sort((a, b) => {
      const priorityDiff = getStatusPriority(a.status) - getStatusPriority(b.status);
      if (priorityDiff !== 0) return priorityDiff;

      if (sortColumn && sortDirection) {
        let valA: string | number = '';
        let valB: string | number = '';

        switch (sortColumn) {
          case 'participante_nome':
            valA = a.participante_nome || '';
            valB = b.participante_nome || '';
            break;
          case 'sessao_titulo':
            valA = a.sessao_titulo || a.sessao_modelo || '';
            valB = b.sessao_titulo || b.sessao_modelo || '';
            break;
          case 'instrutor_nome':
            valA = a.instrutor_nome || '';
            valB = b.instrutor_nome || '';
            break;
          case 'data_hora':
            valA = new Date(a.data_hora || 0).getTime();
            valB = new Date(b.data_hora || 0).getTime();
            break;
          case 'status':
            valA = a.status || '';
            valB = b.status || '';
            break;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortDirection === 'asc'
            ? valA.localeCompare(valB, 'pt-BR')
            : valB.localeCompare(valA, 'pt-BR');
        }

        return sortDirection === 'asc'
          ? (valA as number) - (valB as number)
          : (valB as number) - (valA as number);
      }

      return new Date(a.data_hora || 0).getTime() - new Date(b.data_hora || 0).getTime();
    });

    return resultado;
  }, [
    fichas,
    filtroStatus,
    filtroInstrutor,
    filtroSimulador,
    busca,
    sortColumn,
    sortDirection,
    sessaoIdParam,
  ]);

  // Contadores
  const stats = useMemo(() => {
    const pendentes = fichas.filter((f) => !f.status || f.status === 'AVALIACAO_PENDENTE').length;
    const aguardando = fichas.filter(
      (f) =>
        f.status === 'AGUARDANDO_ASSINATURA_ALUNO' ||
        f.status === 'AGUARDANDO_ASSINATURA_INSTRUTOR',
    ).length;
    const concluidas = fichas.filter(
      (f) => f.status === 'APROVADO' || f.status === 'NAO_APROVADO' || f.status === 'CONCLUIDA',
    ).length;

    return { pendentes, aguardando, concluidas };
  }, [fichas]);

  // Nas telas dedicadas não há exclusão de fichas (fora de escopo) nem
  // painel de filtros avançados — layout simplificado sempre.
  const canDeleteFicha = mode === 'all' && (isAdmin || isGestor);
  const showAlunoSimplificado = mode !== 'all' || isAluno || isInstrutor;

  // Handlers dos modais
  const handleAvaliar = (fichaId: number) => {
    const ficha = fichas.find((f) => f.id === fichaId);
    if (
      isFichaFutureEvaluation({
        dataHora: ficha?.data_hora,
        dataSessao: ficha?.data_sessao,
        horaInicio: ficha?.hora_inicio,
      })
    ) {
      toast.warning('Ficha disponível no dia da sessão');
      return;
    }
    if (
      ficha?.status === 'APROVADO' ||
      ficha?.status === 'NAO_APROVADO' ||
      ficha?.status === 'CONCLUIDA'
    ) {
      toast.warning('Esta ficha já foi finalizada e não pode mais ser editada');
      return;
    }
    setSelectedFichaId(fichaId);
    setModalAvaliar(true);
  };

  const handleAssinar = (fichaId: number, papel: 'INSTRUTOR' | 'TRIPULANTE') => {
    const ficha = fichas.find((f) => f.id === fichaId);

    // Bloquear se avaliação não foi salva (status AVALIACAO_PENDENTE)
    if (ficha?.status === 'AVALIACAO_PENDENTE') {
      const isAguardandoAssinatura =
        ficha.assinatura_aluno_timestamp || ficha.assinatura_instrutor_timestamp;
      if (!isAguardandoAssinatura) {
        toast.warning('A ficha precisa ser avaliada pelo instrutor primeiro');
        return;
      }
    }
    if (
      ficha?.status === 'APROVADO' ||
      ficha?.status === 'NAO_APROVADO' ||
      ficha?.status === 'CONCLUIDA'
    ) {
      toast.warning('Esta ficha já foi finalizada');
      return;
    }
    // Verificar se já assinou
    if (papel === 'INSTRUTOR' && ficha?.assinatura_instrutor_timestamp) {
      toast.warning('Instrutor já assinou esta ficha');
      return;
    }
    if (papel === 'TRIPULANTE' && ficha?.assinatura_aluno_timestamp) {
      toast.warning('Aluno já assinou esta ficha');
      return;
    }
    // Navegar para a ficha completa com modo assinatura para que o usuário
    // veja todas as notas antes de assinar
    navigate(`/simuladores/fichas/${fichaId}?mode=sign&papel=${papel}`);
  };

  const handleDeletar = async (ficha: Ficha) => {
    setShowConfirmDelete({
      id: ficha.id,
      nome: `${ficha.participante_nome} - ${ficha.sessao_titulo || ficha.sessao_modelo}`,
    });
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id, nome } = showConfirmDelete;

    setDeletandoId(id);

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/fichas/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const responseData = await response.json();

      if (response.ok) {
        // Optimistic update - remover da lista imediatamente
        setFichas((prev) => prev.filter((f) => f.id !== id));

        toast.success(`"${nome}" deletada com sucesso!`);
        setShowConfirmDelete(null);

        // Aguardar um pouco para garantir que o servidor processou
        await new Promise((resolve) => setTimeout(resolve, 500));
        await carregarFichas();
      } else {
        // Se falhou, reverter optimistic update (recarregar)
        await carregarFichas();
        const error = responseData;
        toast.error(error.error || 'Erro ao excluir ficha');
      }
    } catch (error) {
      console.error('Erro ao excluir ficha:', error);
      toast.error('Erro ao excluir ficha');
    } finally {
      setDeletandoId(null);
    }
  };

  const handleSalvarAssinatura = async (aprovadoInstrutor?: boolean, signatureDataUrl?: string) => {
    if (!selectedFichaId) return;

    try {
      const tipo = modalAssinatura.papel === 'TRIPULANTE' ? 'ALUNO' : 'INSTRUTOR';

      const payload: Record<string, unknown> = { tipo };
      if (tipo === 'INSTRUTOR' && aprovadoInstrutor !== undefined) {
        payload.aprovado = aprovadoInstrutor;
      }
      if (signatureDataUrl) {
        payload.assinatura_imagem = signatureDataUrl;
      }

      const token = getAccessToken();
      const response = await fetch(
        `${API_BASE_URL}/simuladores/fichas/${selectedFichaId}/assinar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        },
      );

      if (response.ok) {
        toast.success(`Assinatura do ${tipo === 'ALUNO' ? 'Aluno' : 'Instrutor'} registrada!`);
        setModalAssinatura({ isOpen: false, papel: 'TRIPULANTE' });
        setSelectedFichaId(null);
        carregarFichas();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao salvar assinatura');
      }
    } catch (error) {
      console.error('Erro ao salvar assinatura:', error);
      toast.error('Erro ao salvar assinatura');
    }
  };

  const getStatusInfo = (status: string) => {
    return STATUS_MAP[status] || STATUS_MAP.PENDENTE;
  };

  // Componente de header de coluna com ordenação
  const SortableHeader = ({
    column,
    label,
    className = '',
  }: {
    column: SortColumn;
    label: string;
    className?: string;
  }) => {
    const isActive = sortColumn === column;
    return (
      <button
        onClick={() => handleSort(column)}
        className={`group flex items-center gap-1 text-xs font-medium text-gray-600 uppercase tracking-wider hover:text-gray-900 transition-colors ${className}`}
      >
        {label}
        <span className="flex flex-col">
          <ChevronUp
            size={12}
            className={`-mb-1 transition-colors duration-200 ${
              isActive && sortDirection === 'asc' ? 'text-blue-600 scale-110' : 'text-gray-300 group-hover:text-gray-400'
            }`}
          />
          <ChevronDown
            size={12}
            className={`transition-colors duration-200 ${
              isActive && sortDirection === 'desc' ? 'text-blue-600 scale-110' : 'text-gray-300 group-hover:text-gray-400'
            }`}
          />
        </span>
      </button>
    );
  };

  const renderFichaActions = (ficha: Ficha, compact = false) => {
    const isPendente = ficha.status === 'AVALIACAO_PENDENTE';
    const isFichaFutura = isFichaFutureEvaluation({
      dataHora: ficha.data_hora,
      dataSessao: ficha.data_sessao,
      horaInicio: ficha.hora_inicio,
    });

    const baseActionClass = compact
      ? 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium shadow-sm transition-all'
      : 'inline-flex min-w-[140px] items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition-all';

    return (
      <>
        {isPendente && showInstrutorActions && isFichaFutura && (
          <button
            type="button"
            disabled
            className={`${baseActionClass} cursor-not-allowed bg-slate-100 text-slate-500 shadow-none ${compact ? 'flex-1' : ''}`}
          >
            <ClipboardList size={14} />
            Ficha disponível no dia da sessão
          </button>
        )}

        {isPendente && showInstrutorActions && !isFichaFutura && (
          <button
            type="button"
            onClick={() => handleAvaliar(ficha.id)}
            className={`${baseActionClass} bg-amber-600 text-white hover:bg-amber-700 ${compact ? 'flex-1' : ''}`}
          >
            <ClipboardList size={14} />
            Avaliar Tripulante
          </button>
        )}

        {/* "Assinar (Aluno)" nunca aparece na tela "para avaliar": mesmo que a
            identidade coincida por engano de dados, essa tela é exclusiva do
            papel de instrutor. */}
        {ficha.status === 'AGUARDANDO_ASSINATURA_ALUNO' &&
          !isParaAvaliarMode &&
          currentUser?.funcionario_id != null &&
          ficha.colaborador_id_aluno != null &&
          Number(currentUser.funcionario_id) === Number(ficha.colaborador_id_aluno) && (
          <button
            onClick={() => handleAssinar(ficha.id, 'TRIPULANTE')}
            className={`${baseActionClass} bg-primary text-white hover:bg-primary/90 ${compact ? 'flex-1' : ''}`}
          >
            <PenTool size={14} />
            Assinar (Aluno)
          </button>
        )}

        {ficha.status === 'AGUARDANDO_ASSINATURA_ALUNO' &&
          (isParaAvaliarMode ||
            currentUser?.funcionario_id == null ||
            ficha.colaborador_id_aluno == null ||
            Number(currentUser.funcionario_id) !== Number(ficha.colaborador_id_aluno)) && (
          <span className={`${baseActionClass} text-blue-700 bg-blue-50 border border-blue-200 ${compact ? 'flex-1' : ''}`}>
            Aguardando assinatura do aluno
          </span>
        )}

        {ficha.status === 'AGUARDANDO_ASSINATURA_INSTRUTOR' && showInstrutorActions && (
          <button
            onClick={() => handleAssinar(ficha.id, 'INSTRUTOR')}
            className={`${baseActionClass} bg-purple-600 text-white hover:bg-purple-700 ${compact ? 'flex-1' : ''}`}
          >
            <PenTool size={14} />
            Assinar Instrutor
          </button>
        )}

        {showInstrutorActions && ficha.status === 'AVALIACAO_PENDENTE' && (
          <button
            onClick={() => handleGerarFichaModeloDaFicha(ficha.id)}
            disabled={gerandoFichaModeloFichaId === ficha.id}
            className={`${baseActionClass} bg-slate-600 text-white hover:bg-slate-500 disabled:opacity-60 ${compact ? 'flex-1' : ''}`}
          >
            <Printer size={14} />
            {gerandoFichaModeloFichaId === ficha.id ? 'Gerando modelo...' : 'Imprimir Ficha Modelo'}
          </button>
        )}

        {/* Botão Visualizar Ficha — apenas para fichas totalmente assinadas */}
        {ficha.assinatura_aluno_timestamp && ficha.assinatura_instrutor_timestamp && (
          <button
            onClick={() => navigate(`/simuladores/fichas/${ficha.id}`)}
            className={`${baseActionClass} bg-teal-600 text-white hover:bg-teal-700 ${compact ? 'flex-1' : ''}`}
            title="Visualizar Ficha"
          >
            <Eye className="w-4 h-4" />
            Visualizar Ficha
          </button>
        )}

        {canDeleteFicha && (
          <RowActionsMenu
            label={`Mais ações para ficha de ${ficha.participante_nome}`}
            actions={[
              {
                label: 'Excluir ficha',
                destructive: true,
                icon: Trash2,
                disabled: deletandoId === ficha.id,
                onSelect: () => handleDeletar(ficha),
              },
            ]}
          />
        )}
      </>
    );
  };

  return (
    <>
      <div className="space-y-4 animate-fade-in-up">
        {mode !== 'all' && (
          <div>
            <h1 className="text-xl font-semibold text-gray-900">
              {FICHAS_VIEW_COPY[mode].title}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{FICHAS_VIEW_COPY[mode].subtitle}</p>
          </div>
        )}

        {/* Busca e Filtros */}
        {!showAlunoSimplificado && (
          <SimuladoresCard className="p-4">
            {/* Indicador de filtro por sessão */}
            {sessaoIdParam && (
              <div className="mb-3 flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-900">
                    {sessaoInfo
                      ? `Sessão "${sessaoInfo.simulador} - ${sessaoInfo.titulo}" · ${sessaoInfo.data}`
                      : `Sessão #${sessaoIdParam}`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    searchParams.delete('sessao');
                    setSearchParams(searchParams);
                  }}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Ver todas
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 overflow-x-auto min-w-0">
              {/* Chips de status — clique para filtrar, clique novamente (ou sem seleção) = todos */}
              {!showAlunoSimplificado && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setFiltroStatus(
                        filtroStatus === 'AVALIACAO_PENDENTE' ? '' : 'AVALIACAO_PENDENTE',
                      )
                    }
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 press-scale ${
                      filtroStatus === 'AVALIACAO_PENDENTE'
                        ? 'border-amber-500 bg-amber-100 text-amber-800 ring-1 ring-amber-300 shadow-sm'
                        : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-300'
                    }`}
                  >
                    <TrendingUp className="w-3 h-3 shrink-0" />
                    <span className="whitespace-nowrap">Pendente: {stats.pendentes}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFiltroStatus(
                        filtroStatus === 'AGUARDANDO_ASSINATURAS' ? '' : 'AGUARDANDO_ASSINATURAS',
                      )
                    }
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 press-scale ${
                      filtroStatus === 'AGUARDANDO_ASSINATURAS'
                        ? 'border-purple-500 bg-purple-100 text-purple-800 ring-1 ring-purple-300 shadow-sm'
                        : 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 hover:border-purple-300'
                    }`}
                  >
                    <User className="w-3 h-3 shrink-0" />
                    <span className="whitespace-nowrap">Aguardando: {stats.aguardando}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setFiltroStatus(filtroStatus === 'CONCLUIDAS' ? '' : 'CONCLUIDAS')
                    }
                    className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 press-scale ${
                      filtroStatus === 'CONCLUIDAS'
                        ? 'border-emerald-500 bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300 shadow-sm'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-300'
                    }`}
                  >
                    <CheckCircle className="w-3 h-3 shrink-0" />
                    <span className="whitespace-nowrap">Concluídas: {stats.concluidas}</span>
                  </button>
                  <div className="w-px h-5 shrink-0 bg-gray-200" />
                </>
              )}
              {/* Busca compacta */}
              <div className="relative shrink-0 w-44">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-transparent transition-all"
                />
              </div>

              <select
                value={filtroInstrutor}
                onChange={(e) => setFiltroInstrutor(e.target.value)}
                className="shrink-0 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer transition-all"
              >
                <option value="">Todos os Instrutores</option>
                {instrutores.map((inst) => (
                  <option key={inst.id} value={inst.nome}>
                    {inst.nome}
                  </option>
                ))}
              </select>

              <select
                value={filtroSimulador}
                onChange={(e) => setFiltroSimulador(e.target.value)}
                className="shrink-0 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer transition-all"
              >
                <option value="">Todos os Simuladores</option>
                {Array.from(new Set(fichas.map((f) => f.simulador_nome).filter(Boolean)))
                  .sort()
                  .map((sim) => (
                    <option key={sim} value={sim}>
                      {sim}
                    </option>
                  ))}
              </select>

              {(filtroStatus || filtroInstrutor || filtroSimulador || busca) && (
                <button
                  type="button"
                  onClick={() => {
                    setFiltroStatus('');
                    setFiltroInstrutor('');
                    setFiltroSimulador('');
                    setBusca('');
                  }}
                  className="shrink-0 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Limpar
                </button>
              )}

              <div className="ml-auto shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={abrirModalFichaModelo}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800 transition-colors"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Ficha Modelo
                </button>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-600 border border-slate-200">
                  <Filter className="h-3 w-3" />
                  {fichasFiltradas.length} fichas
                </span>
              </div>
            </div>
          </SimuladoresCard>
        )}

        {/* Lista de Fichas - Tabela */}
        {loading ? (
          <SimuladoresCard className="overflow-hidden border-slate-200">
            {/* Skeleton Table Header */}
            <div className="hidden lg:block">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 grid grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="skeleton h-4 rounded" style={{ width: `${60 + Math.random() * 40}%` }} />
                ))}
              </div>
              {/* Skeleton Rows */}
              <div className="divide-y divide-gray-100">
                {[...Array(5)].map((_, rowIdx) => (
                  <div key={rowIdx} className="px-4 py-3.5 grid grid-cols-6 gap-4 items-center">
                    <div className="skeleton h-6 rounded-full w-24" />
                    <div>
                      <div className="skeleton h-4 rounded w-32 mb-1.5" />
                      <div className="skeleton h-3 rounded w-20" />
                    </div>
                    <div>
                      <div className="skeleton h-4 rounded w-28 mb-1.5" />
                      <div className="skeleton h-3 rounded w-16" />
                    </div>
                    <div className="skeleton h-4 rounded w-24" />
                    <div>
                      <div className="skeleton h-4 rounded w-16 mb-1.5" />
                      <div className="skeleton h-3 rounded w-20" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <div className="skeleton h-8 rounded-lg w-28" />
                      <div className="skeleton h-8 rounded-lg w-8" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* Skeleton Cards (mobile) */}
            <div className="lg:hidden divide-y divide-slate-200">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="px-5 py-4 space-y-3">
                  <div className="flex justify-between">
                    <div>
                      <div className="skeleton h-5 rounded w-36 mb-2" />
                      <div className="skeleton h-3 rounded w-24" />
                    </div>
                    <div className="skeleton h-6 rounded-full w-20" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="skeleton h-3 rounded w-12 mb-2" />
                      <div className="skeleton h-4 rounded w-28 mb-1.5" />
                      <div className="skeleton h-3 rounded w-16" />
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <div className="skeleton h-3 rounded w-20 mb-2" />
                      <div className="flex gap-2 mb-2">
                        <div className="skeleton h-6 rounded-full w-20" />
                        <div className="skeleton h-6 rounded-full w-14" />
                      </div>
                      <div className="skeleton h-3 rounded w-28" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="skeleton h-10 rounded-lg flex-1" />
                    <div className="skeleton h-10 rounded-lg w-10" />
                  </div>
                </div>
              ))}
            </div>
          </SimuladoresCard>
        ) : fichasFiltradas.length === 0 ? (
          <SimuladoresCard className="p-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhuma ficha encontrada</h3>
            <p className="text-gray-500 text-sm max-w-sm mx-auto">
              {busca || filtroStatus || filtroInstrutor
                ? 'Tente ajustar os filtros para encontrar o que procura'
                : isMinhasMode
                  ? 'Você ainda não possui fichas de treinamento de voo como participante.'
                  : isParaAvaliarMode
                    ? 'Nenhuma ficha de treinamento de voo aguardando sua avaliação como instrutor.'
                    : 'As fichas aparecerão aqui quando as sessões forem criadas'}
            </p>
          </SimuladoresCard>
        ) : (
          <SimuladoresCard className="overflow-hidden border-slate-200">
            <div className="border-b border-slate-200 bg-white px-6 py-3 lg:hidden">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Visualização por cards
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {showAlunoSimplificado
                  ? 'Abra a ficha correta e assine quando estiver disponível.'
                  : 'Toque na ação principal da ficha certa sem precisar interpretar uma tabela larga.'}
              </p>
            </div>

            <div className="divide-y divide-slate-200 lg:hidden stagger-list">
              {fichasFiltradas.map((ficha) => {
                const statusInfo = getStatusInfo(ficha.status);
                const dataFormatada = formatarData(ficha.data_hora);
                const horaFormatada = formatarHora(ficha.data_hora);

                return (
                  <div key={`card-${ficha.id}`} className="space-y-4 px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-900">
                          {ficha.participante_nome}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {ficha.participante_funcao} · CANAC {ficha.aluno_codigo_anac || '-'}
                        </p>
                      </div>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Sessão
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {ficha.sessao_titulo || ficha.sessao_modelo || 'Sessão'}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {ficha.simulador_nome || ficha.simulador_codigo || '-'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Agendamento
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-slate-200">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {dataFormatada}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 border border-slate-200">
                            <Clock3 className="h-3.5 w-3.5" />
                            {horaFormatada}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          Instrutor: {ficha.instrutor_nome || '-'}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {renderFichaActions(ficha, true)}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <SortableHeader column="status" label="Status" />
                    </th>
                    <th className="px-4 py-3 text-left">
                      <SortableHeader column="participante_nome" label="Participante" />
                    </th>
                    <th className="px-4 py-3 text-left">
                      <SortableHeader column="sessao_titulo" label="Sessão / Horário" />
                    </th>
                    <th className="px-4 py-3 text-left">
                      <SortableHeader column="instrutor_nome" label="Instrutor" />
                    </th>
                    <th className="px-4 py-3 text-left">
                      <SortableHeader column="data_hora" label="Data" />
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 stagger-list">
                  {fichasFiltradas.map((ficha) => {
                    const statusInfo = getStatusInfo(ficha.status);
                    const dataFormatada = formatarData(ficha.data_hora);
                    const horaFormatada = formatarHora(ficha.data_hora);
                    const isFichaEspecial =
                      ficha.tipo_sessao === 'TRE-INST' || ficha.tipo_sessao === 'CRED-EXA';
                    const rowClassName = 'hover:bg-gray-50/80 transition-colors duration-150';
                    const stickyCellClassName = 'sticky left-0 z-10 bg-white group-hover:bg-gray-50/80 transition-colors duration-150';

                    return (
                      <tr key={ficha.id} className={`${rowClassName} group`}>
                        {/* Status */}
                        <td className={`px-4 py-3 ${stickyCellClassName}`}>
                          <div className="flex flex-col items-start gap-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}
                            >
                              {statusInfo.label}
                            </span>
                          </div>
                        </td>

                        {/* Participante */}
                        <td className="px-4 py-3 align-top">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {ficha.participante_nome}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {ficha.participante_funcao} · CANAC {ficha.aluno_codigo_anac || '-'}
                            </p>
                          </div>
                        </td>

                        {/* Sessão */}
                        <td className="px-4 py-3 align-top">
                          <div>
                            <p
                              className={`text-sm font-medium ${isFichaEspecial ? 'text-violet-800' : 'text-gray-900'}`}
                            >
                              {ficha.sessao_titulo || ficha.sessao_modelo || 'Sessão'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {ficha.simulador_nome || ficha.simulador_codigo || '-'}
                            </p>
                            {isFichaEspecial && (
                              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                                {ficha.tipo_sessao === 'CRED-EXA' ? 'Examinador' : 'Instrutor'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Instrutor */}
                        <td className="px-4 py-3 align-top">
                          <p className="text-sm text-gray-700">{ficha.instrutor_nome || '-'}</p>
                        </td>

                        {/* Data */}
                        <td className="px-4 py-3 align-top">
                          <div className="space-y-1">
                            <p className="text-sm text-gray-700">{dataFormatada}</p>
                            <p className="text-xs font-medium text-blue-700">
                              {ficha.hora_inicio || horaFormatada}
                              {ficha.hora_fim ? ` → ${ficha.hora_fim}` : ''}
                            </p>
                          </div>
                        </td>

                        {/* Ações */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-2">
                            {renderFichaActions(ficha)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SimuladoresCard>
        )}

        {/* Modais */}
        <ModalAvaliarFicha
          isOpen={modalAvaliar}
          onClose={() => {
            setModalAvaliar(false);
            setSelectedFichaId(null);
          }}
          fichaId={selectedFichaId || 0}
          onSucesso={() => {
            carregarFichas();
            setModalAvaliar(false);
            setSelectedFichaId(null);
          }}
        />

        <AssinaturaModal
          isOpen={modalAssinatura.isOpen}
          onClose={() => {
            setModalAssinatura({ isOpen: false, papel: 'TRIPULANTE' });
            setSelectedFichaId(null);
          }}
          onSalvar={handleSalvarAssinatura}
          papel={modalAssinatura.papel}
        />

        <ConfirmDeleteModal
          isOpen={showConfirmDelete !== null}
          onClose={() => setShowConfirmDelete(null)}
          onConfirm={handleConfirmDelete}
          itemName={showConfirmDelete?.nome || ''}
          isDeleting={deletandoId !== null}
        />

        <BaseModal
          isOpen={modalFichaModeloAberto}
          onClose={fecharModalFichaModelo}
          title="Fichas Modelo para Impressão"
          subtitle="Selecione um ou mais modelos para gerar os PDFs de uma vez."
          size="xl"
          placement="top"
          footer={
            <>
              <button
                type="button"
                onClick={fecharModalFichaModelo}
                disabled={gerandoFichaModelo}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGerarFichaModelo}
                disabled={
                  modelosSelecionados.size === 0 || loadingModelosSessao || gerandoFichaModelo
                }
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <FileDown className="h-4 w-4" />
                {gerandoFichaModelo
                  ? `Gerando${gerandoProgresso > 0 ? ` ${gerandoProgresso}%` : '...'}`
                  : modelosSelecionados.size > 1
                    ? `Gerar ${modelosSelecionados.size} PDFs`
                    : 'Gerar PDF'}
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {feedbackFichaModelo && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {feedbackFichaModelo}
              </div>
            )}

            {loadingModelosSessao ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Carregando modelos de sessão...
              </div>
            ) : erroModelosSessao ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                <p>{erroModelosSessao}</p>
                <button
                  type="button"
                  onClick={() => void carregarModelosSessao()}
                  className="mt-3 inline-flex items-center rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                >
                  Tentar novamente
                </button>
              </div>
            ) : modelosSessao.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                Nenhum modelo de sessão cadastrado.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      {modelosSelecionados.size === 0
                        ? 'Nenhum selecionado'
                        : `${modelosSelecionados.size} selecionado(s)`}
                    </span>
                    <p className="text-xs text-slate-500">
                      Modelos sem manobras continuam visíveis, mas ficam bloqueados para impressão.
                    </p>
                  </div>
                  {modelosImprimiveis.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (modelosSelecionados.size === modelosImprimiveis.length) {
                          setModelosSelecionados(new Set());
                        } else {
                          setModelosSelecionados(new Set(modelosImprimiveis.map((m) => m.id)));
                        }
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {modelosSelecionados.size === modelosImprimiveis.length
                        ? 'Desmarcar todos'
                        : 'Selecionar todos'}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {modelosSessao.map((modelo) => {
                    const checked = modelosSelecionados.has(modelo.id);
                    const totalManobras = Number(modelo.total_manobras || 0);
                    const bloqueado = totalManobras === 0;

                    return (
                      <label
                        key={modelo.id}
                        className={`flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors ${
                          bloqueado
                            ? 'cursor-not-allowed border-amber-200 bg-amber-50/70'
                            : checked
                              ? 'cursor-pointer border-blue-500 bg-blue-50'
                              : 'cursor-pointer border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={gerandoFichaModelo || bloqueado}
                          onChange={() => {
                            setModelosSelecionados((prev) => {
                              const next = new Set(prev);
                              if (next.has(modelo.id)) next.delete(modelo.id);
                              else next.add(modelo.id);
                              return next;
                            });
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {modelo.codigo} — {modelo.nome}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {[modelo.tipo_sessao_nome, modelo.modelo_aeronave]
                                  .filter(Boolean)
                                  .join(' · ') || 'Sem detalhes'}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                                bloqueado
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}
                            >
                              {bloqueado
                                ? 'Sem manobras'
                                : `${totalManobras} manobra${totalManobras === 1 ? '' : 's'}`}
                            </span>
                          </div>
                          {bloqueado && (
                            <p className="mt-2 text-xs text-amber-800">
                              Este modelo pode ser visualizado, mas a impressão fica bloqueada até
                              que as manobras sejam restauradas.
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </>
            )}

            {gerandoFichaModelo && gerandoProgresso > 0 && (
              <div className="animate-fade-in-up">
                <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                  <span>Gerando PDFs...</span>
                  <span className="tabular-nums font-medium text-slate-700">
                    {gerandoProgresso}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-[width] duration-500 ease-out"
                    style={{ width: `${gerandoProgresso}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </BaseModal>
      </div>
    </>
  );
}

/**
 * FichasSessao — página legada montada em /simuladores/fichas.
 *
 * A visão administrativa formal (admin/gestor, com getEmployeeSectorAccess
 * no backend) é o único consumidor legítimo que resta do endpoint
 * não-escopado GET /fichas — permanece intacta abaixo.
 *
 * Para qualquer outro papel (instrutor, aluno, etc.) esta rota não serve
 * mais a lista mesclada "instrutor_id OR colaborador_id_aluno" (ver
 * GET /fichas no backend, que agora responde 403
 * LEGACY_FICHAS_LIST_FORBIDDEN nesse caso). O usuário é redirecionado
 * direto para a tela dedicada correta: quem tem a capability
 * 'simuladores.evaluate' vai para "Fichas para Avaliar"; todo o resto vai
 * para "Minhas Fichas".
 */
export default function FichasSessao() {
  const { role, isAdmin, isGestor } = usePermissions();
  const { user: currentUser } = useAuth();

  if (isAdmin || isGestor) {
    return (
      <AppLayout>
        <FichasAvaliacaoContent />
      </AppLayout>
    );
  }

  return (
    <Navigate
      to={
        hasInstructorEvaluationCapability(role, currentUser?.permissions)
          ? '/simuladores/fichas/para-avaliar'
          : '/simuladores/fichas/minhas'
      }
      replace
    />
  );
}
