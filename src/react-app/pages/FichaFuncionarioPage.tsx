// ============================================================
// AIRTRUST - FASE 4: FICHA 360° DO FUNCIONÁRIO
// ============================================================
// Componente React de tela completa com todas as informações do funcionário:
//  - Abas: Resumo, Qualificações, Licenças, Pasta 360, Auditoria
//  - Badge de status de compliance
//  - Integração com APIs de ficha-360 e matriz de treinamento
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import AppLayout from '@/react-app/components/AppLayout';
import PastaVirtualCompleta from '@/react-app/components/funcionarios/PastaVirtualCompleta';
import Ficha360TreinamentoVooSection from '@/react-app/components/funcionarios/Ficha360TreinamentoVooSection';
import Ficha360OperationalContext from '@/react-app/components/funcionarios/Ficha360OperationalContext';
import CadernetaHorasVoo from '@/react-app/pages/funcionarios/CadernetaHorasVoo';
import { buildPasta360Url } from '@/react-app/utils/pasta360';
import { useFrmsOperationalSnapshot } from '@/react-app/hooks/useFrmsOperationalSnapshot';
import { FortnightConsolidatedPanel } from '@/react-app/pages/frms/components/FortnightOperationalIndicator';
import {
  ArrowLeft,
  User,
  Award,
  FileText,
  ExternalLink,
  FolderOpen,
  History,
  AlertCircle,
  CheckCircle,
  XCircle,
  Activity,
  Plane,
  ShieldAlert,
  Settings,
} from 'lucide-react';

// ============================================================
// Tipos
// ============================================================

type ComplianceStatus = 'conforme' | 'em_risco' | 'nao_conforme';
type RequisitoStatus = 'ok' | 'risco' | 'faltando';

interface Funcionario {
  id: number;
  nome?: string;
  nome_completo: string;
  matricula: string;
  cpf: string;
  email: string;
  telefone?: string;
  funcao: string;
  base?: string;
  aeronave?: string;
  licenca?: string;
  guerra?: string;
  nascimento: string;
  admissao?: string;
  status: string;
  updated_at?: string;
}

interface Qualificacao {
  id: number;
  funcionario_id: number;
  tipo_qualificacao_id: number;
  data_realizacao: string;
  data_vencimento: string;
  instrutor?: string;
  observacoes?: string;
  categoria: string;
  nome: string;
  codigo: string;
  origem_tipo?: string | null;
  lms_matricula_id?: number | null;
}

interface Licenca {
  id: number;
  funcionario_id: number;
  tipo: string;
  numero: string;
  data_emissao: string;
  data_vencimento: string;
  observacoes?: string;
}

interface Requisito {
  id: number;
  funcao: string;
  tipo_recurso: 'qualificacao' | 'licenca' | 'curso_lms';
  referencia: string;
  descricao?: string;
  status: RequisitoStatus;
  dias_restantes: number | null;
}

interface TreinamentoLms {
  id: number;
  curso_id?: number | null;
  player_matricula_id?: number | null;
  registro_tipo?: 'matricula' | 'historico_importado';
  origem?: 'LMS' | 'EDAPP' | string;
  origem_label?: string | null;
  titulo: string;
  categoria?: string | null;
  qualificacao_codigo?: string | null;
  tipo_conteudo?: 'scorm' | 'h5p' | 'video' | 'pdf' | 'pptx' | null;
  status: 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REPROVADO' | 'CANCELADO';
  progresso_pct: number;
  progresso_efetivo?: number;
  completion_state?: string;
  data_matricula?: string | null;
  data_inicio?: string | null;
  data_conclusao?: string | null;
  prazo_conclusao?: string | null;
  qualificacao_historico_id?: number | null;
}

interface SimuladorSessao {
  id: number;
  simulador_id?: number | null;
  data_sessao?: string | null;
  tipo_sessao?: string | null;
  duracao_minutos?: number | null;
  status?: string | null;
  papel?: string | null;
}

interface SimuladorFicha {
  id: number;
  sessao_id?: number | null;
  data_sessao?: string | null;
  tipo_sessao?: string | null;
  nota_geral?: number | null;
  status?: string | null;
  updated_at?: string | null;
}

interface AuditoriaEvento {
  fonte: 'auditoria' | 'auditoria_avancada_v2';
  tabela: string;
  acao: string;
  registro_id?: string | number | null;
  origem?: string | null;
  created_at?: string | null;
}

interface Ficha360Data {
  funcionario: Funcionario;
  qualificacoes: Qualificacao[];
  qualificacoes_historico?: Qualificacao[];
  licencas: Licenca[];
  treinamentos: TreinamentoLms[];
  treinamentos_planejados?: Array<{
    id: number;
    qualificacao_nome?: string | null;
    qualificacao_codigo?: string | null;
    titulo?: string | null;
    data_prevista?: string | null;
    hora_inicio?: string | null;
    hora_fim?: string | null;
    status?: string | null;
    local?: string | null;
    instrutor_nome?: string | null;
    confirmado?: number | boolean | null;
    presente?: number | boolean | null;
    aprovado?: number | boolean | null;
    nota?: number | null;
  }>;
  requisitos: Array<Record<string, unknown>>;
  simulador: {
    sessoes: SimuladorSessao[];
    fichas: SimuladorFicha[];
  };
  auditoria: AuditoriaEvento[];
  treinamento_voo_pontos_atencao?:
    | import('@/react-app/components/funcionarios/Ficha360TreinamentoVooSection').TreinamentoVooPontosAtencaoData
    | null;
}

interface MatrizRequisito {
  matriz_id: number;
  qualificacao_tipo_nome?: string | null;
  qualificacao_tipo_codigo?: string | null;
  obrigatoriedade?: string | null;
  ultima_data?: string | null;
  data_validade?: string | null;
  status: 'EM_DIA' | 'VENCIDO' | 'EM_FALTA';
  dias_para_vencer?: number | null;
}

type FichaTab =
  | 'resumo'
  | 'qualificacoes'
  | 'licencas'
  | 'simulador'
  | 'caderneta'
  | 'pasta'
  | 'auditoria';

// ============================================================
// Constantes
// ============================================================

// ============================================================
// Utilitários
// ============================================================

function formatarData(dataStr: string | undefined): string {
  if (!dataStr) return '-';
  try {
    return format(parseISO(dataStr), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '-';
  }
}

function formatarDataHora(dataStr: string | null | undefined): string {
  if (!dataStr) return '-';
  try {
    return format(parseISO(dataStr.replace(' ', 'T')), 'dd/MM/yyyy HH:mm', { locale: ptBR });
  } catch {
    return '-';
  }
}

function badgeCompliance(status: ComplianceStatus) {
  if (status === 'conforme') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
        <CheckCircle className="h-3.5 w-3.5" />
        Conforme
      </span>
    );
  }
  if (status === 'em_risco') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
        <AlertCircle className="h-3.5 w-3.5" />
        Em risco
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
      <XCircle className="h-3.5 w-3.5" />
      Não conforme
    </span>
  );
}

function badgeStatusRequisito(status: RequisitoStatus, diasRestantes: number | null) {
  if (status === 'ok') {
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
        OK
      </span>
    );
  }
  if (status === 'risco') {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
        Vence em {diasRestantes}d
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
      Faltando
    </span>
  );
}

function badgeStatusQualificacao(dataVencimento: string | null | undefined) {
  if (!dataVencimento) {
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
        Sem data
      </span>
    );
  }
  const hoje = new Date();
  const dv = parseISO(dataVencimento);
  const dias = differenceInDays(dv, hoje);

  if (dias < 0) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
        Vencida
      </span>
    );
  }
  if (dias <= 30) {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
        Vence em {dias}d
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
      Válida
    </span>
  );
}

function badgeStatusLicenca(dataVencimento: string | null | undefined) {
  if (!dataVencimento) {
    return (
      <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
        Sem data
      </span>
    );
  }
  const hoje = new Date();
  const dv = parseISO(dataVencimento);
  const dias = differenceInDays(dv, hoje);

  if (dias < 0) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
        Vencida
      </span>
    );
  }
  if (dias <= 60) {
    return (
      <span className="inline-flex rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
        Vence em {dias}d
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
      Válida
    </span>
  );
}

function badgeAcaoAuditoria(acao: string) {
  const normalizada = (acao || '').toUpperCase();

  if (normalizada.includes('DELETE') || normalizada.includes('REMOVIDO')) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        {acao}
      </span>
    );
  }

  if (normalizada.includes('UPDATE') || normalizada.includes('ALOCADO')) {
    return (
      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
        {acao}
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {acao}
    </span>
  );
}

function labelTabelaAuditoria(tabela: string) {
  const labels: Record<string, string> = {
    funcionarios: 'Funcionário',
    compliance_eventos: 'Compliance',
    domain_events: 'Eventos de domínio',
    escala_alocacoes: 'Escalas',
    frms_jornada: 'FRMS',
    qualificacoes_historico: 'Qualificações',
    licencas: 'Licenças',
    lms_matriculas: 'Treinamentos LMS',
    fichas_sessao: 'Fichas de treinamento de voo',
    pasta_virtual: 'Pasta 360',
    documentos: 'Documentos',
  };

  return labels[tabela] ?? tabela;
}

function isTreinamentoHistorico(categoria: string) {
  return ['EAD', 'TREINAMENTO TEÓRICO', 'TREINAMENTO DE VOO', 'CHECK', 'EXAME', 'TESTE'].includes(
    (categoria || '').toUpperCase(),
  );
}

function statusSimuladorClasse(status: string | null | undefined) {
  const value = String(status || '').toUpperCase();
  if (value.includes('APROVADO') || value.includes('CONCL') || value.includes('REALIZADO')) {
    return 'bg-emerald-100 text-emerald-700';
  }
  if (value.includes('REPROVADO') || value.includes('NAO_APROVADO') || value.includes('CANCEL')) {
    return 'bg-red-100 text-red-700';
  }
  if (value.includes('AGEND') || value.includes('PENDENTE') || value.includes('ASSINATURA')) {
    return 'bg-amber-100 text-amber-800';
  }
  return 'bg-slate-200 text-slate-700';
}

function normalizeFichaTab(tab: string | null): FichaTab {
  const value = (tab || '').toLowerCase();
  if (value === 'qualificacoes' || value === 'qualificacao') return 'qualificacoes';
  if (value === 'licencas' || value === 'licenca') return 'licencas';
  if (value === 'treinamentos' || value === 'treinamento') return 'qualificacoes';
  if (value === 'simulador') return 'simulador';
  if (value === 'caderneta' || value === 'caderneta-voo') return 'caderneta';
  if (value === 'pasta' || value === 'pasta-virtual' || value === 'documentos') return 'pasta';
  if (value === 'auditoria') return 'auditoria';
  return 'resumo';
}

function getTodayLocalIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ============================================================
// Componente Principal
// ============================================================

export default function FichaFuncionarioPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState<FichaTab>(() => normalizeFichaTab(searchParams.get('tab')));
  const [ficha, setFicha] = useState<Ficha360Data | null>(null);
  const [requisitosFuncao, setRequisitosFuncao] = useState<MatrizRequisito[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const todayIso = useMemo(() => getTodayLocalIsoDate(), []);

  const requestedFuncionarioId = Number(id);
  const {
    data: frmsSnapshotItems,
    loading: loadingFrmsSnapshot,
    meta: frmsSnapshotMeta,
  } = useFrmsOperationalSnapshot({
    data_inicio: todayIso,
    data_fim: todayIso,
    funcionario_id: id,
  });
  const fortnightSnapshotItem = frmsSnapshotItems.find(
    (item) => item.funcionario_id === requestedFuncionarioId,
  );
  const shouldExposeFortnightIndicator =
    Number.isFinite(requestedFuncionarioId) &&
    requestedFuncionarioId > 0 &&
    (!frmsSnapshotMeta?.forced_funcionario_id ||
      frmsSnapshotMeta.forced_funcionario_id === requestedFuncionarioId);
  const fortnightIndicator = shouldExposeFortnightIndicator
    ? (fortnightSnapshotItem?.fortnight_indicator ?? null)
    : null;

  useEffect(() => {
    const tabFromUrl = normalizeFichaTab(searchParams.get('tab'));
    setTab((current) => (current === tabFromUrl ? current : tabFromUrl));
  }, [searchParams]);

  const handleTabChange = (nextTab: FichaTab) => {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', nextTab);
    setSearchParams(nextParams, { replace: true });
  };

  // ============================================================
  // Carregar dados
  // ============================================================

  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        setLoading(true);
        setError('');

        const fichaRes = await fetchWithAuth(`${API_BASE_URL}/funcionarios/${id}/ficha-360`);
        if (!fichaRes.ok) {
          throw new Error('Erro ao carregar dados');
        }

        const fichaJson = await fichaRes.json();
        const matrizRes = await fetchWithAuth(
          `${API_BASE_URL}/matriz-treinamento/requisitos/${id}`,
        );
        let matrizJson: { data?: MatrizRequisito[] } = {};

        if (!matrizRes.ok) {
          console.warn('[FichaFuncionarioPage] Falha ao carregar matriz de treinamento', {
            funcionarioId: id,
            status: matrizRes.status,
          });
        } else {
          matrizJson = await matrizRes.json();
        }

        setFicha(fichaJson.data);
        setRequisitosFuncao((matrizJson.data || []) as MatrizRequisito[]);
      } catch (err) {
        setError('Erro ao carregar dados do funcionário');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const qualificacoes = ficha?.qualificacoes ?? [];
  const qualificacoesHistorico = ficha?.qualificacoes_historico ?? [];
  const licencas = ficha?.licencas ?? [];
  const treinamentos = ficha?.treinamentos ?? [];
  const treinamentosPlanejados = ficha?.treinamentos_planejados ?? [];
  const simuladorSessoes = ficha?.simulador?.sessoes ?? [];
  const simuladorFichas = ficha?.simulador?.fichas ?? [];
  const auditoriaRecente = ficha?.auditoria ?? [];
  const nomeExibicao =
    ficha?.funcionario.nome_completo ||
    ficha?.funcionario.nome ||
    ficha?.funcionario.guerra ||
    (ficha?.funcionario ? `Funcionário ${ficha.funcionario.id}` : 'Funcionário');
  const licencasHistorico = useMemo(
    () => qualificacoes.filter((q) => (q.categoria || '').toUpperCase() === 'LICENÇA'),
    [qualificacoes],
  );
  const treinamentosHistorico = useMemo(
    () => qualificacoes.filter((q) => isTreinamentoHistorico(q.categoria)),
    [qualificacoes],
  );
  const qualificacoesTecnicas = useMemo(() => qualificacoes, [qualificacoes]);
  const qualificacoesVencidas = useMemo(
    () =>
      qualificacoesTecnicas.filter(
        (q) => q.data_vencimento && differenceInDays(parseISO(q.data_vencimento), new Date()) < 0,
      ).length,
    [qualificacoesTecnicas],
  );
  const qualificacoesEmRisco = useMemo(
    () =>
      qualificacoesTecnicas.filter((q) => {
        if (!q.data_vencimento) return false;
        const dias = differenceInDays(parseISO(q.data_vencimento), new Date());
        return dias >= 0 && dias <= 30;
      }).length,
    [qualificacoesTecnicas],
  );
  const treinamentosLmsConcluidos = useMemo(
    () => treinamentos.filter((treinamento) => treinamento.status === 'CONCLUIDO').length,
    [treinamentos],
  );
  const treinamentosImportadosEdapp = useMemo(
    () => treinamentos.filter((treinamento) => treinamento.origem === 'EDAPP').length,
    [treinamentos],
  );
  const treinamentosNativosLms = useMemo(
    () => treinamentos.filter((treinamento) => treinamento.registro_tipo === 'matricula').length,
    [treinamentos],
  );
  const complianceStatus = useMemo<ComplianceStatus>(() => {
    if (requisitosFuncao.length === 0) return 'conforme';
    if (requisitosFuncao.some((req) => req.status === 'VENCIDO' || req.status === 'EM_FALTA')) {
      return 'nao_conforme';
    }
    if (
      requisitosFuncao.some(
        (req) => req.status === 'EM_DIA' && Number(req.dias_para_vencer ?? 9999) <= 30,
      )
    ) {
      return 'em_risco';
    }
    return 'conforme';
  }, [requisitosFuncao]);

  // ============================================================
  // Renderização
  // ============================================================

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4 p-4">
          <div className="h-20 rounded-2xl border border-slate-200 bg-white animate-pulse" />
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-9 w-28 rounded-full bg-slate-100 animate-pulse" />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-36 rounded-2xl border border-slate-200 bg-white animate-pulse"
              />
            ))}
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !ficha) {
    return (
      <AppLayout>
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <p className="mt-2 text-sm text-gray-600">{error || 'Funcionário não encontrado'}</p>
            <button
              type="button"
              onClick={() => navigate('/funcionarios')}
              className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
            >
              Voltar
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const f = ficha.funcionario;
  const tabButtonClass = (tabValue: FichaTab) =>
    `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
      tab === tabValue
        ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
    }`;

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1280px] space-y-4 p-4">
        {/* Header */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate('/funcionarios')}
              className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{nomeExibicao}</h1>
              <p className="text-sm text-gray-600">
                Matrícula: {f.matricula} · {f.funcao} · Base {f.base ?? '-'}
              </p>
            </div>
          </div>
          <div>{badgeCompliance(complianceStatus)}</div>
        </div>

        {/* Abas */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-3 py-2">
          <div className="flex min-w-max gap-2">
            <button
              type="button"
              onClick={() => handleTabChange('resumo')}
              className={tabButtonClass('resumo')}
            >
              <User className="h-4 w-4" />
              Resumo
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('qualificacoes')}
              className={tabButtonClass('qualificacoes')}
            >
              <Award className="h-4 w-4" />
              Qualificações
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('licencas')}
              className={tabButtonClass('licencas')}
            >
              <FileText className="h-4 w-4" />
              Licenças
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('simulador')}
              className={tabButtonClass('simulador')}
            >
              <Activity className="h-4 w-4" />
              Treinamento de Voo
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('caderneta')}
              className={tabButtonClass('caderneta')}
            >
              <Plane className="h-4 w-4" />
              Caderneta de Voo
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('auditoria')}
              className={tabButtonClass('auditoria')}
            >
              <History className="h-4 w-4" />
              Auditoria
            </button>
            <button
              type="button"
              onClick={() => handleTabChange('pasta')}
              className={tabButtonClass('pasta')}
            >
              <FolderOpen className="h-4 w-4" />
              Pasta 360
            </button>
            <div className="ml-2 flex items-center gap-2 border-l border-slate-200 pl-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Subpágina
              </span>
              <button
                type="button"
                onClick={() => navigate(`/frms/tripulante/${id}?origem=ficha`)}
                aria-label="Abrir página FRMS / Fadiga deste funcionário"
                title="Abrir página FRMS / Fadiga"
                className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm font-semibold text-amber-800 transition-colors whitespace-nowrap hover:bg-amber-100"
              >
                <ShieldAlert className="h-4 w-4" />
                Abrir FRMS / Fadiga
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {/* Conteúdo das abas */}

        {/* === ABA RESUMO === */}
        {tab === 'resumo' && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {/* Card 1: Situação de requisitos */}
              <div className="min-h-[420px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-gray-800">
                  Situação de Requisitos da Matriz da Função
                </h3>
                {requisitosFuncao.length === 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800">
                          Nenhum requisito de matriz configurado para a função
                        </p>
                        <p className="mt-0.5 text-xs text-amber-700">
                          A função &quot;{f.funcao}&quot; não possui requisitos ativos na matriz de
                          treinamento. Nesse cenário, o funcionário deve aparecer sem pendências.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/matriz-treinamento')}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      <Settings className="h-4 w-4" />
                      Configurar matriz da função
                    </button>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {requisitosFuncao.map((req) => (
                      <li
                        key={req.matriz_id}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                          req.status === 'EM_DIA' && Number(req.dias_para_vencer ?? 9999) > 30
                            ? 'border-emerald-200 bg-emerald-50'
                            : req.status === 'EM_DIA'
                              ? 'border-amber-200 bg-amber-50'
                              : 'border-red-200 bg-red-50'
                        }`}
                      >
                        <div className="flex-1">
                          <p
                            className={`text-sm font-medium ${
                              req.status === 'EM_DIA' && Number(req.dias_para_vencer ?? 9999) > 30
                                ? 'text-emerald-900'
                                : req.status === 'EM_DIA'
                                  ? 'text-amber-900'
                                  : 'text-red-900'
                            }`}
                          >
                            {req.qualificacao_tipo_nome ?? 'Requisito sem nome'}
                          </p>
                          <p
                            className={`text-xs ${
                              req.status === 'EM_DIA' && Number(req.dias_para_vencer ?? 9999) > 30
                                ? 'text-emerald-700'
                                : req.status === 'EM_DIA'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }`}
                          >
                            Código {req.qualificacao_tipo_codigo ?? '-'} · Obrigatoriedade{' '}
                            {req.obrigatoriedade ?? '-'}
                          </p>
                        </div>
                        <div className="ml-4">
                          {badgeStatusRequisito(
                            req.status === 'EM_DIA'
                              ? Number(req.dias_para_vencer ?? 9999) <= 30
                                ? 'risco'
                                : 'ok'
                              : 'faltando',
                            req.dias_para_vencer as number | null | undefined,
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Ficha360OperationalContext
                status={f.status}
                funcao={f.funcao}
                base={f.base}
                aeronave={f.aeronave}
                licenca={f.licenca}
                updatedAtLabel={formatarDataHora(f.updated_at)}
                onOpenPersonalProfile={() => navigate(`/funcionarios/${id}/perfil?tab=dados`)}
              />

              <div className="min-h-[420px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-gray-800">Panorama Integrado</h3>
                <dl className="space-y-2 text-sm text-gray-700">
                  <div className="flex justify-between border-b pb-2">
                    <dt className="font-medium text-gray-500">Qualificações:</dt>
                    <dd>{qualificacoesTecnicas.length}</dd>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <dt className="font-medium text-gray-500">Licenças formais:</dt>
                    <dd>{ficha.licencas.length}</dd>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <dt className="font-medium text-gray-500">Licenças no histórico:</dt>
                    <dd>{licencasHistorico.length}</dd>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <dt className="font-medium text-gray-500">Treinamentos no LMS:</dt>
                    <dd>
                      {ficha.treinamentos.length} total · {treinamentosLmsConcluidos} concluídos ·{' '}
                      {treinamentosImportadosEdapp} legado EdApp
                    </dd>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <dt className="font-medium text-gray-500">Histórico operacional:</dt>
                    <dd>{treinamentosHistorico.length}</dd>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <dt className="font-medium text-gray-500">Simulador:</dt>
                    <dd>
                      {simuladorSessoes.length} sessões · {simuladorFichas.length} fichas
                    </dd>
                  </div>
                  <div className="flex justify-between border-b pb-2">
                    <dt className="font-medium text-gray-500">Auditoria recente:</dt>
                    <dd>{auditoriaRecente.length} eventos</dd>
                  </div>
                </dl>
              </div>

              <div className="min-h-[420px] rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-gray-800">Alertas e Leitura</h3>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {qualificacoesVencidas > 0
                      ? `${qualificacoesVencidas} qualificação(ões) técnica(s) vencida(s).`
                      : 'Nenhuma qualificação vencida no histórico atual.'}
                  </li>
                  <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {qualificacoesEmRisco > 0
                      ? `${qualificacoesEmRisco} qualificação(ões) vencem nos próximos 30 dias.`
                      : 'Sem qualificações em risco imediato.'}
                  </li>
                  <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {requisitosFuncao.length > 0
                      ? `${requisitosFuncao.length} requisito(s) ativos na matriz da função.`
                      : `Função ${f.funcao} sem requisitos ativos na matriz de treinamento.`}
                  </li>
                  <li className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    {ficha.treinamentos.length > 0
                      ? `${treinamentosNativosLms} matrícula(s) nativa(s) e ${treinamentosImportadosEdapp} registro(s) legado(s) do EdApp vinculados ao funcionário.`
                      : 'Sem registros LMS vinculados; treinamentos atuais vêm do histórico operacional.'}
                  </li>
                </ul>
              </div>
            </div>

            <FortnightConsolidatedPanel
              indicator={fortnightIndicator}
              loading={loadingFrmsSnapshot}
            />
          </div>
        )}

        {/* === ABA QUALIFICAÇÕES === */}
        {tab === 'qualificacoes' && (
          <div className="overflow-x-auto rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-base font-semibold text-gray-800">Qualificações</h3>
            <p className="mb-4 text-sm text-gray-500">
              {qualificacoesTecnicas.length} registros · {qualificacoesEmRisco} em risco ·{' '}
              {qualificacoesVencidas} vencida(s)
            </p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Categoria</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Qualificação</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Origem</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Realização</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {qualificacoesTecnicas.map((q: Qualificacao) => (
                  <tr key={q.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{q.categoria}</td>
                    <td className="px-4 py-3 text-gray-700">{q.nome}</td>
                    <td className="px-4 py-3 text-gray-700">{q.codigo}</td>
                    <td className="px-4 py-3">
                      {q.origem_tipo === 'LMS' || q.lms_matricula_id ? (
                        <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          EAD
                        </span>
                      ) : q.origem_tipo === 'IMPORTADO_EDAPP' ? (
                        <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                          EdApp
                        </span>
                      ) : q.origem_tipo === 'SIMULADOR' ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          Simulador
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          Presencial
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{formatarData(q.data_realizacao)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatarData(q.data_vencimento)}</td>
                    <td className="px-4 py-3 text-center">
                      {badgeStatusQualificacao(q.data_vencimento)}
                    </td>
                  </tr>
                ))}
                {qualificacoesTecnicas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                      Nenhuma qualificação cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* === ABA LICENÇAS === */}
        {tab === 'licencas' && (
          <div className="space-y-4 rounded-lg bg-white p-6 shadow">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Licença principal no cadastro
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{f.licenca ?? '-'}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Licenças formais
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{ficha.licencas.length}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Habilitações no histórico
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {licencasHistorico.length}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-4 text-base font-semibold text-gray-800">Licenças formais</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Número</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Emissão</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ficha.licencas.map((l: Licenca) => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-md bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                          {l.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{l.numero}</td>
                      <td className="px-4 py-3 text-gray-700">{formatarData(l.data_emissao)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatarData(l.data_vencimento)}</td>
                      <td className="px-4 py-3 text-center">
                        {badgeStatusLicenca(l.data_vencimento)}
                      </td>
                    </tr>
                  ))}
                  {ficha.licencas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                        Nenhuma licença formal cadastrada na tabela específica.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-4 text-base font-semibold text-gray-800">
                Habilitações e extratos encontrados no histórico
              </h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Categoria</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Registro</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Realização</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {licencasHistorico.map((licenca) => (
                    <tr key={licenca.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{licenca.categoria}</td>
                      <td className="px-4 py-3 text-gray-700">{licenca.nome}</td>
                      <td className="px-4 py-3 text-gray-700">{licenca.codigo}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatarData(licenca.data_realizacao)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatarData(licenca.data_vencimento)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {badgeStatusQualificacao(licenca.data_vencimento)}
                      </td>
                    </tr>
                  ))}
                  {licencasHistorico.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                        Nenhuma habilitação encontrada no histórico de qualificações.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* === BLOCO CONSOLIDADO: QUALIFICAÇÕES + TREINAMENTOS === */}
        {tab === 'qualificacoes' && (
          <div className="space-y-4 rounded-lg bg-white p-6 shadow">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  LMS nativo
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {treinamentosNativosLms}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Legado EdApp
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {treinamentosImportadosEdapp}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Histórico de treinamentos
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {treinamentosHistorico.length}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Treinamento de voo
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {simuladorSessoes.length} sessões · {simuladorFichas.length} fichas
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Planejados
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {treinamentosPlanejados.length}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <h3 className="mb-4 text-base font-semibold text-gray-800">
                Treinamentos planejados para o funcionário
              </h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Título</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Qualificação</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Data</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Instrutor</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Local</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {treinamentosPlanejados.map((evento) => (
                    <tr key={`planejado-${evento.id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-700">
                        {evento.titulo ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {evento.qualificacao_nome ?? '-'} ({evento.qualificacao_codigo ?? '-'})
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatarData(evento.data_prevista ?? undefined)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{evento.status ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{evento.instrutor_nome ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-700">{evento.local ?? '-'}</td>
                    </tr>
                  ))}
                  {treinamentosPlanejados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                        Nenhum treinamento planejado vinculado ao funcionário.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <h3 className="mb-4 text-base font-semibold text-gray-800">
                Treinamentos internos e legado importado
              </h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Curso</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Origem</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Categoria</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Tipo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Progresso</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Conclusão</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Prazo</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ficha.treinamentos.map((treinamento) => (
                    <tr
                      key={`${treinamento.registro_tipo ?? 'treinamento'}-${treinamento.id}`}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-gray-700 font-medium">{treinamento.titulo}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            treinamento.origem === 'EDAPP'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-sky-100 text-sky-700'
                          }`}
                        >
                          {treinamento.origem_label ?? treinamento.origem ?? 'LMS'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{treinamento.categoria ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-500 uppercase text-xs">
                        {treinamento.tipo_conteudo ?? 'LEGADO'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                            treinamento.status === 'CONCLUIDO'
                              ? 'bg-emerald-100 text-emerald-700'
                              : treinamento.status === 'EM_ANDAMENTO'
                                ? 'bg-amber-100 text-amber-800'
                                : treinamento.status === 'REPROVADO'
                                  ? 'bg-red-100 text-red-700'
                                  : treinamento.status === 'CANCELADO'
                                    ? 'bg-gray-100 text-gray-500'
                                    : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {treinamento.status === 'CONCLUIDO'
                            ? 'Concluído'
                            : treinamento.status === 'EM_ANDAMENTO'
                              ? 'Em andamento'
                              : treinamento.status === 'REPROVADO'
                                ? 'Reprovado'
                                : treinamento.status === 'CANCELADO'
                                  ? 'Cancelado'
                                  : 'Não iniciado'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${(treinamento.progresso_efetivo ?? treinamento.progresso_pct) >= 100 ? 'bg-emerald-500' : (treinamento.progresso_efetivo ?? treinamento.progresso_pct) > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
                              style={{
                                width: `${treinamento.progresso_efetivo ?? treinamento.progresso_pct}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-slate-500">
                            {treinamento.progresso_efetivo ?? treinamento.progresso_pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatarData(treinamento.data_conclusao ?? undefined)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatarData(treinamento.prazo_conclusao ?? undefined)}
                      </td>
                      <td className="px-4 py-3">
                        {treinamento.status !== 'CANCELADO' && treinamento.player_matricula_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              navigate(
                                treinamento.tipo_conteudo === 'h5p'
                                  ? `/lms/player/h5p/${treinamento.player_matricula_id}`
                                  : treinamento.tipo_conteudo === 'pdf'
                                    ? `/lms/player/pdf/${treinamento.player_matricula_id}`
                                    : treinamento.tipo_conteudo === 'pptx'
                                      ? `/lms/player/pptx/${treinamento.player_matricula_id}`
                                      : `/lms/player/${treinamento.player_matricula_id}`,
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {treinamento.status === 'NAO_INICIADO'
                              ? 'Iniciar'
                              : treinamento.status === 'CONCLUIDO'
                                ? 'Rever'
                                : 'Continuar'}
                          </button>
                        ) : treinamento.origem === 'EDAPP' ? (
                          <span className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                            Histórico importado
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {ficha.treinamentos.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                        Nenhum treinamento interno ou legado EdApp vinculado. O histórico abaixo
                        mostra os treinamentos já registrados em outros módulos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <h3 className="mb-4 text-base font-semibold text-gray-800">
                Histórico operacional de treinamentos e checks
              </h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Categoria</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Registro</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Realização</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {treinamentosHistorico.map((registro) => (
                    <tr key={registro.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{registro.categoria}</td>
                      <td className="px-4 py-3 text-gray-700">{registro.nome}</td>
                      <td className="px-4 py-3 text-gray-700">{registro.codigo}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatarData(registro.data_realizacao)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatarData(registro.data_vencimento)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {badgeStatusQualificacao(registro.data_vencimento)}
                      </td>
                    </tr>
                  ))}
                  {treinamentosHistorico.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                        Nenhum treinamento adicional encontrado no histórico operacional.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <h3 className="mb-4 text-base font-semibold text-gray-800">
                Histórico completo de qualificações
              </h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Categoria</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Registro</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Código</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Realização</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">Vencimento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {qualificacoesHistorico.map((registro) => (
                    <tr key={`historico-${registro.id}`} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{registro.categoria}</td>
                      <td className="px-4 py-3 text-gray-700">{registro.nome}</td>
                      <td className="px-4 py-3 text-gray-700">{registro.codigo}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatarData(registro.data_realizacao)}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {formatarData(registro.data_vencimento)}
                      </td>
                    </tr>
                  ))}
                  {qualificacoesHistorico.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                        Nenhum item no histórico completo de qualificações.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-4 text-base font-semibold text-gray-800">
                  Sessões recentes de treinamento de voo
                </h3>
                <div className="space-y-3">
                  {simuladorSessoes.map((sessao) => (
                    <div
                      key={sessao.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {sessao.tipo_sessao ?? 'Sessão de treinamento'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatarDataHora(sessao.data_sessao)} · Papel {sessao.papel ?? '-'}
                          </p>
                        </div>
                        <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {sessao.status ?? 'Sem status'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {simuladorSessoes.length === 0 && (
                    <p className="text-sm text-gray-400">Nenhuma sessão recente encontrada.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 p-4">
                <h3 className="mb-4 text-base font-semibold text-gray-800">
                  Fichas recentes de treinamento de voo
                </h3>
                <div className="space-y-3">
                  {simuladorFichas.map((fichaSimulador) => (
                    <div
                      key={fichaSimulador.id}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {fichaSimulador.tipo_sessao ?? 'Ficha de treinamento'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatarDataHora(fichaSimulador.data_sessao)} · Nota{' '}
                            {fichaSimulador.nota_geral ?? '-'}
                          </p>
                        </div>
                        <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {fichaSimulador.status ?? 'Sem status'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {simuladorFichas.length === 0 && (
                    <p className="text-sm text-gray-400">Nenhuma ficha recente encontrada.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === ABA SIMULADOR === */}
        {tab === 'simulador' && (
          <div className="space-y-4 rounded-lg bg-white p-6 shadow">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Treinamento de Voo</h3>
                <p className="text-sm text-gray-600">
                  Sessões e fichas de avaliação registradas para este funcionário em simulador e
                  aeronave.
                </p>
              </div>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {simuladorSessoes.length} sessão(ões) · {simuladorFichas.length} ficha(s)
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Sessões */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-800">Sessões</h4>
                <div className="space-y-2">
                  {simuladorSessoes.map((sessao) => (
                    <div
                      key={sessao.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {sessao.tipo_sessao ?? 'Sessão de treinamento'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatarData(sessao.data_sessao)} ·{' '}
                          {sessao.duracao_minutos
                            ? `${sessao.duracao_minutos} min`
                            : 'Duração não informada'}{' '}
                          · Papel: {sessao.papel ?? '-'}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusSimuladorClasse(sessao.status)}`}
                      >
                        {sessao.status ?? 'Sem status'}
                      </span>
                    </div>
                  ))}
                  {simuladorSessoes.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
                      Nenhuma sessão registrada.
                    </div>
                  )}
                </div>
              </div>

              {/* Fichas de avaliação */}
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-800">Fichas de avaliação</h4>
                <div className="space-y-2">
                  {simuladorFichas.map((fichaSimulador) => (
                    <div
                      key={fichaSimulador.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">
                          {fichaSimulador.tipo_sessao ?? 'Ficha de avaliação'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {formatarData(fichaSimulador.data_sessao)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {fichaSimulador.nota_geral !== null &&
                        fichaSimulador.nota_geral !== undefined ? (
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${
                              fichaSimulador.nota_geral >= 3
                                ? 'bg-emerald-100 text-emerald-700'
                                : fichaSimulador.nota_geral >= 2
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            Nota {fichaSimulador.nota_geral}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                            Sem nota numérica
                          </span>
                        )}
                        <span
                          className={`text-xs font-medium ${
                            String(fichaSimulador.status || '')
                              .toUpperCase()
                              .includes('APROVADO')
                              ? 'text-emerald-600'
                              : String(fichaSimulador.status || '')
                                    .toUpperCase()
                                    .includes('REPROVADO') ||
                                  String(fichaSimulador.status || '')
                                    .toUpperCase()
                                    .includes('NAO_APROVADO')
                                ? 'text-red-600'
                                : 'text-slate-500'
                          }`}
                        >
                          {fichaSimulador.status ?? 'Sem status'}
                        </span>
                      </div>
                    </div>
                  ))}
                  {simuladorFichas.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
                      Nenhuma ficha de avaliação encontrada.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Pontos de Atenção em Treinamento de Voo — bloco centralizado do backend */}
            <Ficha360TreinamentoVooSection data={ficha?.treinamento_voo_pontos_atencao} />
          </div>
        )}

        {/* === ABA CADERNETA DE VOO === */}
        {tab === 'caderneta' && (
          <div className="rounded-lg bg-white p-6 shadow">
            <CadernetaHorasVoo
              funcionarioId={f.id}
              funcionarioNome={f.nome_completo}
              canEdit={false}
            />
          </div>
        )}

        {/* === ABA PASTA 360 === */}
        {tab === 'pasta' && (
          <div className="space-y-4 rounded-lg bg-white p-6 shadow">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Pasta 360 Consolidada</h3>
                <p className="text-sm text-gray-600">
                  Todos os certificados e documentos do funcionário ficam acessíveis nesta aba sem
                  sair da ficha.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const pasta360Url = buildPasta360Url(f.id, {
                    tab: 'pasta',
                    origem: 'ficha-funcionario',
                  });
                  if (pasta360Url) navigate(pasta360Url);
                }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Abrir Pasta 360
              </button>
            </div>

            <PastaVirtualCompleta funcionarioId={f.id} />
          </div>
        )}

        {/* === ABA AUDITORIA === */}
        {tab === 'auditoria' && (
          <div className="space-y-4 rounded-lg bg-white p-6 shadow">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Auditoria</h3>
                <p className="text-sm text-gray-600">
                  Eventos recentes consolidados das tabelas de auditoria vinculadas a este
                  funcionário.
                </p>
              </div>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {auditoriaRecente.length} evento(s)
              </span>
            </div>

            <div className="space-y-3">
              {auditoriaRecente.map((evento, index) => (
                <div
                  key={`${evento.fonte}-${evento.tabela}-${evento.acao}-${evento.created_at}-${index}`}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {labelTabelaAuditoria(evento.tabela)}
                        </span>
                        {badgeAcaoAuditoria(evento.acao)}
                        <span className="inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                          {evento.fonte}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        Origem: {evento.origem || 'sistema'} · Registro {evento.registro_id ?? '-'}
                      </p>
                    </div>
                    <div className="text-xs font-medium text-slate-500">
                      {formatarDataHora(evento.created_at)}
                    </div>
                  </div>
                </div>
              ))}

              {auditoriaRecente.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  Nenhum evento recente encontrado para este funcionário nas tabelas de auditoria.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
