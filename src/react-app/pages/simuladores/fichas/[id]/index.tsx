import PageHeader from '@/react-app/components/PageHeader';
import AppLayout from '@/react-app/components/AppLayout';
/**
 * FICHA DE SESSÃO - DETALHE COMPLETO
 *
 * Exibe ficha completa com:
 * - Cabeçalho (participante, instrutor, simulador, sessão/modelo, data/hora, carga horária)
 * - Grade técnica operacional + bloco NOTECHS separado
 * - Cada manobra: número, descrição, código, nota (badge colorido 0-10)
 * - Observações gerais
 * - Assinaturas digitais (Tripulante + Instrutor)
 * - Botão Gerar PDF
 *
 * Modos: view (somente leitura) | edit (avaliação)
 */

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { useAuth } from '@/react-app/hooks/useAuth';
import {
  deveGerarQualificacaoAoAssinar,
  isFichaDoFluxoDeCheckComQualificacao,
} from '../qualificacaoFlow';
import {
  ArrowLeft,
  Award,
  BadgeCheck,
  Check,
  Clock,
  FileCheck,
  History,
  Info,
  Lock,
  Pencil,
  PenTool,
  Save,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  buildNomeFichaOficial,
  gerarPDFFichaCliente,
  type FichaPDFData,
} from '@/react-app/services/pdf-ficha-client';
import {
  getSpecialEventSessionDefinition,
  splitSpecialTechnicalBlocks,
} from '@/shared/simuladores/special-event-sessions';
import {
  getInstructionSeatLabel,
  INSTRUCTION_SEAT_VALUES,
} from '@/shared/simuladores/ficha-header';
import { openPreviewWindow } from '@/react-app/utils/pdfPreview';
import AssinaturaModal from '@/react-app/components/AssinaturaModal';
import ModalNotechsReferencia from '../components/ModalNotechsReferencia';
import { NOTECHS_ORDEM_BASE, splitManobrasNotechs } from '../notechs';

interface ManobraAvaliacao {
  id: number;
  ordem: number;
  codigo: string;
  nome?: string;
  descricao: string;
  nota: number | null;
  observacoes?: string;
  tripulante?: 'A' | 'B' | 'AB';
}

interface CheckSessao {
  id: number; // sessao_check_id
  qualificacao_tipo_id: number;
  codigo: string;
  nome: string;
  descricao: string | null;
  aprovado?: boolean | number | null;
  observacoes?: string;
}

interface FichaDetalhada {
  id: number;
  sessao_codigo?: string | null;
  participante_nome: string;
  participante_funcao: string;
  instrutor_id?: number | null;
  instrutor_nome: string;
  simulador_codigo: string;
  simulador_nome?: string;
  simulador_modelo?: string;
  equipamento_utilizado?: string | null;
  dispositivo_identificacao?: string | null;
  assento_instrucao_utilizado?: string | null;
  sessao_modelo: string;
  sessao_titulo?: string;
  data_hora: string;
  data?: string;
  horario_inicio?: string;
  horario_fim?: string;
  carga_horaria_pf?: string | number;
  carga_horaria_pm?: string | number;
  carga_horaria_total?: string;
  duracao_minutos?: number;
  tipo_sessao?: string;
  tripulante_codigo_anac?: string;
  instrutor_codigo_anac?: string;
  created_at?: string | null;
  updated_at?: string | null;
  nota_geral?: number;
  aprovado?: boolean | number | null;
  status: string;
  observacoes_gerais?: string;
  assinatura_aluno_timestamp?: string | null;
  assinatura_instrutor_timestamp?: string | null;
  assinatura_aluno_ip?: string | null;
  assinatura_instrutor_ip?: string | null;
  assinatura_aluno_imagem?: string | null;
  assinatura_instrutor_imagem?: string | null;
  manobras: ManobraAvaliacao[];
  is_check?: number; // 0 ou 1
  examinador_nome?: string | null;
  sessao_id?: number | null; // ID da sessão para endpoints de checks
  modelo_sessao_id?: number | null;
  atribuicao_curricular_id?: number | null;
  modo_compartilhado?: number;
  tripulacao_nomes?: string | null;
  edicao_pendente?: boolean;
  edicoes_pendentes_count?: number;
  notechs_status?: 'missing' | 'partial' | 'complete';
  missing_notechs_count?: number;
}

interface AlteracaoEdicaoFicha {
  observacoes_gerais?: { antes: string; depois: string };
  manobras?: Array<{
    manobra_id: number;
    ordem: number | null;
    codigo: string | null;
    nome: string | null;
    observacoes_antes: string;
    observacoes_depois: string;
  }>;
}

interface EdicaoFicha {
  id: number;
  ficha_id: number;
  status: 'PENDENTE' | 'APROVADA' | 'REJEITADA' | 'CANCELADA';
  motivo: string;
  solicitante_nome?: string | null;
  aprovador_email?: string | null;
  decisao_observacoes?: string | null;
  aprovado_em?: string | null;
  rejeitado_em?: string | null;
  created_at: string;
  alteracoes?: AlteracaoEdicaoFicha | null;
}

function formatarDataLocalSemUTC(valor?: string): string {
  const raw = String(valor || '').trim();
  if (!raw) return '—';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (iso) {
    const [, ano, mes, dia] = iso;
    return `${dia}/${mes}/${ano}`;
  }

  const data = new Date(raw);
  if (Number.isNaN(data.getTime())) return raw;
  return data.toLocaleDateString('pt-BR');
}

const STATUS_FICHA_FINALIZADA = new Set(['APROVADO', 'NAO_APROVADO', 'CONCLUIDA']);

function normalizarPerfil(perfil?: string | null): string {
  return String(perfil || '')
    .trim()
    .toUpperCase();
}

function isPerfilGestor(perfil?: string | null): boolean {
  return ['ADMIN', 'ADMINISTRADOR', 'GESTOR', 'MANAGER'].includes(normalizarPerfil(perfil));
}

export default function FichaDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get('mode') || 'view'; // 'view' | 'edit' | 'sign'
  const papelParam = (searchParams.get('papel') || 'TRIPULANTE') as 'INSTRUTOR' | 'TRIPULANTE';
  const isSignMode = mode === 'sign';

  const [ficha, setFicha] = useState<FichaDetalhada | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  // Modal de assinatura (modo view — admins)
  const [modalAssinatura, setModalAssinatura] = useState<{
    isOpen: boolean;
    papel: 'INSTRUTOR' | 'TRIPULANTE';
  }>({ isOpen: false, papel: 'TRIPULANTE' });

  // Estados do formulário inline de assinatura (modo sign)
  const { user } = useAuth();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [desenhando, setDesenhando] = useState(false);
  const [assinado, setAssinado] = useState(false);
  const [assinaturaTexto, setAssinaturaTexto] = useState('');
  const [concordo, setConcordo] = useState(false);

  // Auto-preencher nome com o perfil do usuário logado
  useEffect(() => {
    if (user?.nome) {
      setAssinaturaTexto(user.nome);
    }
  }, [user?.nome]);
  const [aprovadoInline, setAprovadoInline] = useState<boolean | null>(null);
  const [assinando, setAssinando] = useState(false);
  const signSectionRef = useRef<HTMLDivElement>(null);
  const fichaGeraQualificacao = isFichaDoFluxoDeCheckComQualificacao(ficha);

  // Estados para sistema de checks
  const [checks, setChecks] = useState<CheckSessao[]>([]);
  const [checksResultados, setChecksResultados] = useState<
    Record<number, { aprovado: boolean | null; observacoes: string }>
  >({});
  const [edicoes, setEdicoes] = useState<EdicaoFicha[]>([]);
  const [modalSolicitarEdicao, setModalSolicitarEdicao] = useState(false);
  const [modalNotechsAberto, setModalNotechsAberto] = useState(false);
  const [motivoEdicao, setMotivoEdicao] = useState('');
  const [observacoesGeraisEdicao, setObservacoesGeraisEdicao] = useState('');
  const [observacoesManobrasEdicao, setObservacoesManobrasEdicao] = useState<
    Record<number, string>
  >({});
  const [enviandoEdicao, setEnviandoEdicao] = useState(false);
  const [decidindoEdicaoId, setDecidindoEdicaoId] = useState<number | null>(null);
  const [decisaoEdicao, setDecisaoEdicao] = useState<Record<number, string>>({});

  const formatarDataQualificacao = (valor?: string) => {
    if (!valor) return '-';
    const data = new Date(`${valor}T00:00:00`);
    if (Number.isNaN(data.getTime())) return valor;
    return data.toLocaleDateString('pt-BR');
  };

  const exibirResumoQualificacoesGeradas = (
    qualificacoes: Array<{ codigo?: string; nome: string; valida_ate: string; tipo?: string }>,
    prefixo: string,
  ) => {
    if (qualificacoes.length === 0) {
      toast.success(prefixo);
      return;
    }

    const principais = qualificacoes.filter((item) => item.tipo === 'principal');
    const complementares = qualificacoes.filter((item) => item.tipo !== 'principal');

    toast.success(prefixo, {
      duration: 9000,
      description: (
        <div className="mt-2 space-y-3 text-sm leading-5">
          {principais.length > 0 && (
            <div>
              <div className="font-semibold text-slate-900">Qualificação principal</div>
              <ul className="mt-1 list-disc pl-5 text-slate-700">
                {principais.map((item) => (
                  <li key={`${item.tipo || 'principal'}-${item.codigo || item.nome}`}>
                    {item.nome}
                    {item.codigo ? ` (${item.codigo})` : ''} - válida até{' '}
                    {formatarDataQualificacao(item.valida_ate)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {complementares.length > 0 && (
            <div>
              <div className="font-semibold text-slate-900">Checks e FAPs gerados</div>
              <ul className="mt-1 list-disc pl-5 text-slate-700">
                {complementares.map((item) => (
                  <li key={`${item.tipo || 'extra'}-${item.codigo || item.nome}`}>
                    {item.nome}
                    {item.codigo ? ` (${item.codigo})` : ''} - válida até{' '}
                    {formatarDataQualificacao(item.valida_ate)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ),
    });
  };

  const opcoesNota = ['NR', ...Array.from({ length: 21 }, (_, index) => (index * 0.5).toFixed(1))];

  const configurarCanvasAssinatura = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || canvas.clientWidth || 600);
    const cssHeight = Math.max(1, rect.height || canvas.clientHeight || 200);
    const pixelRatio = window.devicePixelRatio || 1;

    canvas.width = Math.round(cssWidth * pixelRatio);
    canvas.height = Math.round(cssHeight * pixelRatio);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5 * pixelRatio;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.imageSmoothingEnabled = true;
    }

    setAssinado(false);
    setDesenhando(false);
  };

  useEffect(() => {
    carregarFicha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-scroll para seção de assinatura após carregar no modo sign
  useEffect(() => {
    if (isSignMode && !loading && signSectionRef.current) {
      setTimeout(() => {
        signSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  }, [isSignMode, loading]);

  // Inicializar canvas quando entrar em modo sign
  useEffect(() => {
    if (!isSignMode || loading) return;

    const frame = window.requestAnimationFrame(() => {
      configurarCanvasAssinatura();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isSignMode, loading]);

  const carregarFicha = async () => {
    if (!id) return;

    try {
      setLoading(true);
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/fichas/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const apiData = data.data;
          // Map API field names to interface fields
          const dataHora = apiData.data
            ? apiData.horario_inicio
              ? `${apiData.data} ${apiData.horario_inicio}`
              : apiData.data
            : '';
          const normalizada = {
            ...apiData,
            sessao_codigo: apiData.sessao_codigo || null,
            participante_nome: apiData.tripulante_nome,
            participante_funcao: apiData.tripulante_funcao || 'PIC',
            sessao_modelo: apiData.sessao_titulo,
            simulador_nome: apiData.simulador_nome || '',
            simulador_modelo: apiData.simulador_modelo || '',
            simulador_codigo: apiData.simulador_nome || apiData.simulador || '',
            equipamento_utilizado:
              apiData.equipamento_utilizado || apiData.simulador_modelo || null,
            dispositivo_identificacao:
              apiData.dispositivo_identificacao ||
              apiData.simulador_nome ||
              apiData.simulador ||
              null,
            assento_instrucao_utilizado: apiData.assento_instrucao_utilizado || null,
            data_hora: dataHora,
            nota_geral: apiData.nota_final,
            manobras: Array.isArray(apiData?.manobras)
              ? (
                  apiData.manobras as Array<{
                    id: number;
                    ordem: number;
                    codigo: string;
                    nome?: string;
                    descricao: string;
                    observacoes?: string | null;
                    resultado?: unknown;
                    nota?: unknown;
                    tripulante?: string;
                  }>
                ).map((m) => {
                  const notaRaw = m.nota;
                  const resultadoRaw = m.resultado;

                  let nota: number | null = null;
                  // NR sentinel: -1 means "Não Realizado"
                  if (resultadoRaw === 'NR' || resultadoRaw === 'NAO_REALIZADA') {
                    nota = -1;
                  } else if (typeof notaRaw === 'number') {
                    nota = notaRaw;
                  } else if (typeof resultadoRaw === 'number') {
                    nota = resultadoRaw;
                  } else if (typeof resultadoRaw === 'string' && resultadoRaw.trim() !== '') {
                    const n = Number(resultadoRaw);
                    nota = Number.isFinite(n) ? n : null;
                  }

                  return {
                    id: m.id,
                    ordem: m.ordem,
                    codigo: m.codigo,
                    nome: m.nome || undefined,
                    descricao: m.descricao,
                    nota,
                    observacoes: typeof m.observacoes === 'string' ? m.observacoes : undefined,
                    tripulante: (m.tripulante as 'A' | 'B' | 'AB' | undefined) || 'AB',
                  };
                })
              : [],
          };

          setFicha(normalizada);
          carregarEdicoes();

          // Se sessão tem checks, carregar os checks
          if (apiData.is_check === 1 && apiData.sessao_id) {
            await carregarChecks(apiData.sessao_id);
          }
        }
      } else {
        console.error('[FICHA] Erro ao carregar ficha:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Erro ao carregar ficha:', error);
    } finally {
      setLoading(false);
    }
  };

  async function carregarEdicoes() {
    if (!id) return;

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/fichas/${id}/edicoes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (response.status === 403 || response.status === 404) {
        setEdicoes([]);
        return;
      }

      if (!response.ok) return;

      const data = (await response.json()) as { success: boolean; data?: EdicaoFicha[] };
      if (data.success) {
        setEdicoes(Array.isArray(data.data) ? data.data : []);
      }
    } catch (error) {
      console.warn('Não foi possível carregar edições da ficha:', error);
    }
  }

  const carregarChecks = async (sessaoId: number) => {
    if (!sessaoId) return;

    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/sessoes/${sessaoId}/checks`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setChecks(data.data);

          // Inicializar resultados com valores já salvos (se houver)
          const resultadosIniciais: Record<
            number,
            { aprovado: boolean | null; observacoes: string }
          > = {};
          data.data.forEach((check: CheckSessao) => {
            // Converter INTEGER (0/1) para BOOLEAN (false/true)
            let aprovadoBool: boolean | null = null;
            if (check.aprovado === 1 || check.aprovado === true) {
              aprovadoBool = true;
            } else if (check.aprovado === 0 || check.aprovado === false) {
              aprovadoBool = false;
            }

            resultadosIniciais[check.id] = {
              aprovado: aprovadoBool,
              observacoes: check.observacoes ?? '',
            };
          });
          setChecksResultados(resultadosIniciais);
          console.log('[CHECKS] Resultados inicializados:', resultadosIniciais);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar checks:', error);
    }
  };

  const salvarFicha = async () => {
    if (!ficha) return;

    const manobrasPendentes = ficha.manobras.filter((manobra) => manobra.nota === null);
    if (manobrasPendentes.length > 0) {
      const mensagem = manobrasPendentes
        .slice(0, 8)
        .map((manobra) => `${manobra.ordem} - ${manobra.nome || manobra.descricao}`)
        .join('\n');
      window.alert(
        `Preencha todas as manobras com uma nota ou NR antes de salvar.\n\nFaltando:\n${mensagem}${manobrasPendentes.length > 8 ? '\n...' : ''}`,
      );
      toast.error('Há manobras sem avaliação. Preencha com nota ou NR antes de salvar.');
      return;
    }

    try {
      setSalvando(true);
      const response = await fetch(`${API_BASE_URL}/simuladores/fichas/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          status: ficha.status,
          expected_updated_at: ficha.updated_at || undefined,
          recalculate_status: true,
          observacoes: ficha.observacoes_gerais,
          equipamento_utilizado: ficha.equipamento_utilizado,
          dispositivo_identificacao: ficha.dispositivo_identificacao,
          assento_instrucao_utilizado: ficha.assento_instrucao_utilizado,
          manobras: ficha.manobras.map((m) => ({
            ordem: m.ordem,
            resultado: m.nota === -1 ? 'NR' : m.nota,
            observacoes: m.observacoes,
          })),
        }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => null);
        toast.success('Ficha salva com sucesso!');
        if (data?.success && data?.data?.status) {
          setFicha((prev) => (prev ? { ...prev, status: data.data.status } : prev));
        }
        // Recarregar ficha para atualizar botões de assinatura
        await carregarFicha();
      } else {
        const error = await response.json().catch(() => null);
        const missingManobras = error?.details?.missingManobras;
        if (Array.isArray(missingManobras) && missingManobras.length > 0) {
          const mensagem = missingManobras
            .slice(0, 8)
            .map(
              (manobra: { ordem: number; descricao: string }) =>
                `${manobra.ordem} - ${manobra.descricao}`,
            )
            .join('\n');
          window.alert(
            `Preencha todas as manobras com uma nota ou NR antes de salvar.\n\nFaltando:\n${mensagem}${missingManobras.length > 8 ? '\n...' : ''}`,
          );
        }
        toast.error(error?.error || 'Erro ao salvar ficha');
      }
    } catch (error) {
      console.error('Erro:', error);
      toast.error('Erro ao salvar ficha');
    } finally {
      setSalvando(false);
    }
  };

  const abrirSolicitacaoEdicao = () => {
    if (!ficha) return;

    setMotivoEdicao('');
    setObservacoesGeraisEdicao(ficha.observacoes_gerais || '');
    setObservacoesManobrasEdicao(
      Object.fromEntries(ficha.manobras.map((manobra) => [manobra.id, manobra.observacoes || ''])),
    );
    setModalSolicitarEdicao(true);
  };

  const solicitarEdicaoFinalizada = async () => {
    if (!ficha || !id) return;

    try {
      setEnviandoEdicao(true);
      const response = await fetch(`${API_BASE_URL}/simuladores/fichas/${id}/edicoes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          motivo: motivoEdicao,
          observacoes_gerais: observacoesGeraisEdicao,
          manobras: ficha.manobras.map((manobra) => ({
            id: manobra.id,
            observacoes: observacoesManobrasEdicao[manobra.id] || '',
          })),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error || 'Erro ao solicitar edição');
        return;
      }

      toast.success('Solicitação enviada para aprovação do gestor.');
      setModalSolicitarEdicao(false);
      await carregarEdicoes();
      await carregarFicha();
    } catch (error) {
      console.error('Erro ao solicitar edição:', error);
      toast.error('Erro ao solicitar edição');
    } finally {
      setEnviandoEdicao(false);
    }
  };

  const decidirEdicao = async (edicaoId: number, acao: 'aprovar' | 'rejeitar') => {
    try {
      setDecidindoEdicaoId(edicaoId);
      const response = await fetch(
        `${API_BASE_URL}/simuladores/fichas-edicoes/${edicaoId}/${acao}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({ observacoes: decisaoEdicao[edicaoId] || '' }),
        },
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error || `Erro ao ${acao === 'aprovar' ? 'aprovar' : 'rejeitar'} edição`);
        return;
      }

      toast.success(acao === 'aprovar' ? 'Edição aprovada e aplicada.' : 'Edição rejeitada.');
      await carregarEdicoes();
      await carregarFicha();
    } catch (error) {
      console.error('Erro ao decidir edição:', error);
      toast.error('Erro ao processar decisão');
    } finally {
      setDecidindoEdicaoId(null);
    }
  };

  const atualizarNotaManobra = (ordem: number, nota: number | null) => {
    if (!ficha) return;
    setFicha({
      ...ficha,
      manobras: ficha.manobras.map((m) => (m.ordem === ordem ? { ...m, nota } : m)),
    });
  };

  const getNotaBadgeClass = (nota: number | null): string => {
    if (nota === null) return 'bg-slate-100 text-slate-500';
    if (nota === -1) return 'bg-slate-200 text-slate-600'; // NR
    if (nota >= 8) return 'bg-green-100 text-green-700';
    if (nota >= 6) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  };

  const getNotaLabel = (nota: number | null): string => {
    if (nota === null) return '—';
    if (nota === -1) return 'NR';
    return nota.toFixed(1);
  };

  const getNotaSelectValue = (nota: number | null): string => {
    if (nota === null) return '';
    if (nota === -1) return 'NR';
    return nota.toFixed(1);
  };

  const handleNotaChange = (ordem: number, value: string) => {
    if (value === '') {
      atualizarNotaManobra(ordem, null);
      return;
    }

    if (value === 'NR') {
      atualizarNotaManobra(ordem, -1);
      return;
    }

    const nota = Number(value);
    atualizarNotaManobra(ordem, Number.isFinite(nota) ? nota : null);
  };

  const getChecksPendentes = () =>
    checks.filter((check) => {
      const resultado = checksResultados[check.id]?.aprovado;
      return resultado !== true && resultado !== false;
    });

  const buildChecksPayload = () =>
    checks
      .filter((check) => {
        const resultado = checksResultados[check.id]?.aprovado;
        return resultado === true || resultado === false;
      })
      .map((check) => ({
        sessao_check_id: check.id,
        aprovado: checksResultados[check.id]?.aprovado === true,
        observacoes: checksResultados[check.id]?.observacoes ?? '',
      }));

  const confirmChecksPendentes = async () => {
    const pendentes = getChecksPendentes();
    if (pendentes.length === 0) return true;

    const resumo = pendentes
      .slice(0, 8)
      .map((check) => `- ${check.codigo} - ${check.nome}`)
      .join('\n');

    return confirmDialog(
      `Há ${pendentes.length} FAP(s) sem avaliação:\n\n${resumo}${pendentes.length > 8 ? '\n...' : ''}\n\nSe continuar, apenas as FAPs marcadas serão atualizadas nas qualificações. Deseja salvar mesmo assim?`,
      {
        title: 'FAPs em branco',
        confirmText: 'Salvar mesmo assim',
        cancelText: 'Voltar e preencher',
      },
    );
  };

  // ── Canvas helpers ──────────────────────────────────────────────────────────
  const iniciarDesenho = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
    }
    setDesenhando(true);
    setAssinado(true);
  };
  const desenhar = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!desenhando) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineTo((e.clientX - rect.left) * scaleX, (e.clientY - rect.top) * scaleY);
      ctx.stroke();
    }
  };
  const pararDesenho = () => setDesenhando(false);
  const limparCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    setAssinado(false);
  };
  // ────────────────────────────────────────────────────────────────────────────

  const handleAssinarInline = async () => {
    if (!id) return;
    if (!assinado) {
      toast.warning('Desenhe sua assinatura no campo acima');
      return;
    }
    if (!concordo) {
      toast.warning('Confirme a declaração antes de continuar');
      return;
    }
    if (papelParam === 'INSTRUTOR' && aprovadoInline === null) {
      toast.warning('Indique se a sessão foi APROVADA ou NÃO APROVADA');
      return;
    }

    try {
      setAssinando(true);
      const tipo = papelParam === 'TRIPULANTE' ? 'ALUNO' : 'INSTRUTOR';

      // Checks (somente instrutor em sessão de check)
      if (tipo === 'INSTRUTOR' && ficha?.is_check === 1 && checks.length > 0) {
        const podeProsseguir = await confirmChecksPendentes();
        if (!podeProsseguir) {
          return;
        }

        const resultados = buildChecksPayload();
        if (resultados.length > 0) {
          const resChecks = await fetch(
            `${API_BASE_URL}/simuladores/sessoes/${ficha.sessao_id}/checks/resultados`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getAccessToken()}`,
              },
              body: JSON.stringify({ resultados }),
            },
          );
          if (!resChecks.ok) {
            const e = await resChecks.json();
            toast.error(e.error || 'Erro ao salvar checks');
            return;
          }
        } else {
          toast.warning('Nenhuma FAP foi marcada. A assinatura será salva sem atualizar checks.');
        }
      }

      const signatureDataUrl = canvasRef.current?.toDataURL('image/png');
      const payload: Record<string, unknown> = { tipo };
      if (tipo === 'INSTRUTOR') {
        payload.aprovado = aprovadoInline;
        if (deveGerarQualificacaoAoAssinar(ficha, aprovadoInline)) {
          payload.gerar_qualificacao = true;
        }
      }
      if (signatureDataUrl) payload.assinatura_imagem = signatureDataUrl;

      const response = await fetch(`${API_BASE_URL}/simuladores/fichas/${id}/assinar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          success: boolean;
          data?: {
            qualificacoes_geradas?: Array<{
              codigo?: string;
              nome: string;
              valida_ate: string;
              tipo?: string;
            }>;
          };
          error?: string;
        };
        const geradas = data.data?.qualificacoes_geradas || [];
        if (tipo === 'INSTRUTOR' && aprovadoInline === true && geradas.length > 0) {
          exibirResumoQualificacoesGeradas(
            geradas,
            `Assinatura registrada e ${geradas.length} qualificação(ões) gerada(s).`,
          );
        } else {
          toast.success('Assinatura registrada com sucesso!');
        }
        // Voltar para a lista de fichas
        navigate('/simuladores/fichas');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao registrar assinatura');
      }
    } catch (err) {
      console.error(err);
      toast.error('Erro ao registrar assinatura');
    } finally {
      setAssinando(false);
    }
  };

  const handleSalvarAssinatura = async (aprovadoInstrutor?: boolean, signatureDataUrl?: string) => {
    if (!id) return;

    try {
      const tipo = modalAssinatura.papel === 'TRIPULANTE' ? 'ALUNO' : 'INSTRUTOR';

      // Se é assinatura do instrutor e é uma sessão de check, validar e salvar resultados
      if (tipo === 'INSTRUTOR' && ficha?.is_check === 1 && checks.length > 0) {
        const podeProsseguir = await confirmChecksPendentes();
        if (!podeProsseguir) {
          return;
        }

        const resultados = buildChecksPayload();

        console.log('[CHECKS] Estado checksResultados:', checksResultados);
        console.log('[CHECKS] Payload para enviar:', resultados);

        if (!ficha?.sessao_id) {
          toast.error('ID da sessão não encontrado');
          return;
        }

        if (resultados.length > 0) {
          console.log('[CHECKS] Enviando resultados:', resultados);

          const responseChecks = await fetch(
            `${API_BASE_URL}/simuladores/sessoes/${ficha.sessao_id}/checks/resultados`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getAccessToken()}`,
              },
              body: JSON.stringify({ resultados }),
            },
          );

          if (!responseChecks.ok) {
            const error = await responseChecks.json();
            console.error('[CHECKS] Erro ao salvar:', error);
            toast.error(error.error || 'Erro ao salvar resultados dos checks');
            return;
          }

          const dataChecks = await responseChecks.json();
          console.log('[CHECKS] Salvamento bem-sucedido:', dataChecks);
          toast.success('Resultados dos checks salvos com sucesso!');
        } else {
          toast.warning('Nenhuma FAP foi marcada. A assinatura será salva sem atualizar checks.');
        }
      }

      // Salvar assinatura
      const _sigToken = getAccessToken();
      const response = await fetch(`${API_BASE_URL}/simuladores/fichas/${id}/assinar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(_sigToken ? { Authorization: `Bearer ${_sigToken}` } : {}),
        },
        body: JSON.stringify({
          tipo: tipo,
          ...(signatureDataUrl ? { assinatura_imagem: signatureDataUrl } : {}),
          ...(tipo === 'INSTRUTOR' && aprovadoInstrutor !== undefined
            ? { aprovado: aprovadoInstrutor }
            : {}),
          ...(tipo === 'INSTRUTOR' &&
          deveGerarQualificacaoAoAssinar(ficha, aprovadoInstrutor ?? null)
            ? { gerar_qualificacao: true }
            : {}),
        }),
      });

      if (response.ok) {
        toast.success('Assinatura registrada com sucesso!');
        setModalAssinatura({ isOpen: false, papel: 'TRIPULANTE' });
        carregarFicha();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erro ao salvar assinatura');
      }
    } catch (error) {
      console.error('Erro ao salvar assinatura:', error);
      toast.error('Erro ao salvar assinatura');
    }
  };

  // Separar manobras técnicas variáveis do bloco NOTECHS (namespace de
  // ordem reservado >= 1001) — sempre separado, independentemente do modelo.
  const { tecnicas: manobrasTecnicas, notechs: manobrasNotechs } = splitManobrasNotechs(
    ficha?.manobras || [],
  );
  const specialDefinition = getSpecialEventSessionDefinition(ficha?.sessao_codigo);
  const specialTechnicalBlocks = splitSpecialTechnicalBlocks(
    ficha?.sessao_codigo,
    manobrasTecnicas,
  );
  const manobrasEsquerda = manobrasTecnicas.filter((m) => m.ordem >= 1 && m.ordem <= 11);
  const manobrasDireita = manobrasTecnicas.filter((m) => m.ordem >= 12 && m.ordem <= 22);
  const fichaFinalizada = STATUS_FICHA_FINALIZADA.has(normalizarPerfil(ficha?.status));
  const isEditMode = mode === 'edit' && !fichaFinalizada;
  const perfilUsuario = normalizarPerfil(user?.role);
  const usuarioGestor = isPerfilGestor(perfilUsuario);
  const usuarioEhInstrutorDaFicha =
    !!ficha?.instrutor_id &&
    !!user?.funcionario_id &&
    String(ficha.instrutor_id) === String(user.funcionario_id);
  const podeSolicitarEdicaoFinalizada =
    fichaFinalizada &&
    usuarioEhInstrutorDaFicha &&
    !edicoes.some((edicao) => edicao.status === 'PENDENTE');
  return (
    <AppLayout>
      <PageHeader
        className="mb-6"
        title={
          specialDefinition?.headerTitle ||
          ficha?.sessao_modelo ||
          ficha?.sessao_titulo ||
          `Ficha #${ficha?.id || ''}`
        }
      />
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-500">Carregando ficha...</p>
          </div>
        ) : !ficha ? (
          <div className="text-center py-12 text-slate-600">
            <p className="text-lg font-medium mb-2">Ficha não encontrada</p>
            <button
              onClick={() => navigate('/simuladores?tab=fichas')}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Voltar para fichas
            </button>
          </div>
        ) : (
          <>
            {/* Header com ações */}
            <div className="mb-6 flex items-center justify-end gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => navigate('/simuladores?tab=fichas')}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar
                </button>
                {mode === 'view' && !fichaFinalizada && (
                  <button
                    onClick={() => navigate(`/simuladores/fichas/${id}?mode=edit`)}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
                  >
                    <Pencil className="w-4 h-4" />
                    Modo Avaliação
                  </button>
                )}
                {podeSolicitarEdicaoFinalizada && (
                  <button
                    onClick={abrirSolicitacaoEdicao}
                    className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                  >
                    <Send className="w-4 h-4" />
                    Solicitar edição
                  </button>
                )}
                {isEditMode && (
                  <button
                    onClick={salvarFicha}
                    disabled={salvando}
                    className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {salvando ? 'Salvando...' : 'Salvar Avaliação'}
                  </button>
                )}
              </div>
            </div>
            {mode === 'edit' && fichaFinalizada && (
              <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Esta ficha já foi finalizada. Alterações diretas ficam bloqueadas; o instrutor deve
                abrir uma solicitação de edição para aprovação do gestor.
              </div>
            )}
            {/* Cabeçalho da Ficha */}
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
              {/* Badge de Check (se aplicável) */}
              {ficha.is_check === 1 && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
                  <BadgeCheck className="w-4 h-4 text-amber-600" />
                  <div className="flex-1">
                    <p className="text-sm font-bold text-amber-900">Sessão de Check</p>
                    <p className="text-xs text-amber-700">
                      {ficha.examinador_nome ? (
                        <>
                          Examinador ANAC: <strong>{ficha.examinador_nome}</strong>
                          <span className="block mt-0.5 text-amber-600">
                            Documentação ANAC separada — a assinatura desta ficha pedagógica é do
                            instrutor
                          </span>
                        </>
                      ) : (
                        'Esta sessão está vinculada a uma avaliação de check'
                      )}
                    </p>
                  </div>
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-600 text-white">
                    CHECK
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase">
                    {specialDefinition?.participantLabel || 'Participante Avaliado'}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">{ficha.participante_nome}</p>
                  <span className="text-xs px-2 py-0.5 rounded bg-primary-100 text-primary-700">
                    {ficha.participante_funcao}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">
                    {specialDefinition?.supervisorLabel || 'Instrutor Supervisor'}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">{ficha.instrutor_nome}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Modelo</p>
                  {isEditMode && specialDefinition?.kind === 'instructor' ? (
                    <input
                      value={ficha.equipamento_utilizado || ''}
                      onChange={(e) =>
                        setFicha((prev) =>
                          prev ? { ...prev, equipamento_utilizado: e.target.value } : prev,
                        )
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900">
                      {ficha.equipamento_utilizado ||
                        ficha.simulador_modelo ||
                        ficha.simulador_codigo}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Sessão/Modelo</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {specialDefinition?.fullTitle || ficha.sessao_modelo}
                  </p>
                  {specialDefinition ? (
                    <p className="mt-1 text-xs text-slate-500">{ficha.sessao_codigo}</p>
                  ) : null}
                </div>
              </div>
              {specialDefinition ? (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">
                    {specialDefinition.headerTitle}
                  </p>
                  <p className="text-sm text-slate-700">{specialDefinition.headerSubtitle}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Duração curricular: {specialDefinition.durationMinutes} minutos
                  </p>
                  {specialDefinition.kind === 'instructor' ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase text-slate-500">Simulador</p>
                        <p className="text-sm font-medium text-slate-900">
                          {ficha.simulador_codigo || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-500">Dispositivo/Matrícula</p>
                        {isEditMode ? (
                          <input
                            value={ficha.dispositivo_identificacao || ''}
                            onChange={(e) =>
                              setFicha((prev) =>
                                prev
                                  ? { ...prev, dispositivo_identificacao: e.target.value }
                                  : prev,
                              )
                            }
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          />
                        ) : (
                          <p className="text-sm font-medium text-slate-900">
                            {ficha.dispositivo_identificacao || '—'}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-500">Assento de Instrução</p>
                        {isEditMode ? (
                          <select
                            value={ficha.assento_instrucao_utilizado || ''}
                            onChange={(e) =>
                              setFicha((prev) =>
                                prev
                                  ? { ...prev, assento_instrucao_utilizado: e.target.value }
                                  : prev,
                              )
                            }
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          >
                            <option value="">Selecione</option>
                            {INSTRUCTION_SEAT_VALUES.map((seat) => (
                              <option key={seat} value={seat}>
                                {getInstructionSeatLabel(seat)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-sm font-medium text-slate-900">
                            {getInstructionSeatLabel(ficha.assento_instrucao_utilizado) || '—'}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-500 uppercase">Data</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {formatarDataLocalSemUTC(ficha.data || ficha.data_hora)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Horário</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {[ficha.horario_inicio, ficha.horario_fim]
                      .filter((h) => h && h !== 'N/A')
                      .join(' – ') || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">
                    {specialDefinition ? 'Duração Curricular' : 'Carga Horária'}
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    {specialDefinition
                      ? ficha.carga_horaria_total
                      : `${ficha.carga_horaria_total || '—'} (PF: ${ficha.carga_horaria_pf || '00:00'} / PM: ${ficha.carga_horaria_pm || '00:00'})`}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase">Status</p>
                  <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                    {ficha.status}
                  </span>
                </div>
              </div>
            </div>
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Avaliação de Manobras</h3>
              {specialTechnicalBlocks ? (
                <div className="space-y-4">
                  {specialTechnicalBlocks.map((block) => (
                    <div key={block.definition.id} className="rounded-lg border border-slate-200">
                      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-sm font-semibold text-slate-900">
                          {block.definition.title}
                        </p>
                      </div>
                      <div className="space-y-3 p-4">
                        {block.items.map((manobra) => (
                          <div
                            key={manobra.id}
                            className={`flex items-center gap-3 rounded-md border p-3 ${
                              manobra.tripulante === 'A'
                                ? 'border-blue-200 bg-blue-50'
                                : manobra.tripulante === 'B'
                                  ? 'border-orange-200 bg-orange-50'
                                  : 'border-slate-200'
                            }`}
                          >
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                              {manobra.ordem}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {manobra.nome || manobra.descricao}
                              </p>
                              <p className="text-xs text-slate-500">{manobra.codigo}</p>
                              {!isEditMode && manobra.observacoes?.trim() ? (
                                <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-600">
                                  {manobra.observacoes}
                                </p>
                              ) : null}
                            </div>
                            {!specialDefinition?.hideTripulanteBadge ? (
                              <span
                                className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  manobra.tripulante === 'A'
                                    ? 'bg-blue-100 text-blue-700 border-blue-300'
                                    : manobra.tripulante === 'B'
                                      ? 'bg-orange-100 text-orange-700 border-orange-300'
                                      : 'bg-purple-100 text-purple-700 border-purple-300'
                                }`}
                              >
                                {manobra.tripulante || 'AB'}
                              </span>
                            ) : null}
                            {isEditMode ? (
                              <select
                                value={getNotaSelectValue(manobra.nota)}
                                onChange={(e) => handleNotaChange(manobra.ordem, e.target.value)}
                                className={`w-24 rounded-md border px-2 py-1 text-sm ${
                                  manobra.nota === null
                                    ? 'border-slate-300 bg-white text-slate-700'
                                    : getNotaBadgeClass(manobra.nota)
                                }`}
                              >
                                <option value="">Selecione</option>
                                <option value="NR">NR</option>
                                {Array.from({ length: 10 }, (_, i) => i + 1).map((nota) => (
                                  <option key={nota} value={String(nota)}>
                                    {nota}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className={getNotaBadgeClass(manobra.nota)}>
                                {getNotaLabel(manobra.nota)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Coluna Esquerda (1-11) */}
                  <div className="space-y-3">
                    {manobrasEsquerda.map((manobra) => (
                      <div
                        key={manobra.id}
                        className={`flex items-center gap-3 rounded-md border p-3 ${
                          manobra.tripulante === 'A'
                            ? 'border-blue-200 bg-blue-50'
                            : manobra.tripulante === 'B'
                              ? 'border-orange-200 bg-orange-50'
                              : 'border-slate-200'
                        }`}
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                          {manobra.ordem}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {manobra.nome || manobra.descricao}
                          </p>
                          <p className="text-xs text-slate-500">{manobra.codigo}</p>
                          {!isEditMode && manobra.observacoes?.trim() ? (
                            <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-600">
                              {manobra.observacoes}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            manobra.tripulante === 'A'
                              ? 'bg-blue-100 text-blue-700 border-blue-300'
                              : manobra.tripulante === 'B'
                                ? 'bg-orange-100 text-orange-700 border-orange-300'
                                : 'bg-purple-100 text-purple-700 border-purple-300'
                          }`}
                        >
                          {manobra.tripulante || 'AB'}
                        </span>
                        {isEditMode ? (
                          <select
                            value={getNotaSelectValue(manobra.nota)}
                            onChange={(e) => handleNotaChange(manobra.ordem, e.target.value)}
                            className={`w-24 rounded border px-2 py-1 text-sm text-center focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                              manobra.nota === null
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-slate-300'
                            }`}
                          >
                            <option value="">Selecione</option>
                            {opcoesNota.map((opcao) => (
                              <option key={opcao} value={opcao}>
                                {opcao}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-bold ${getNotaBadgeClass(
                              manobra.nota,
                            )}`}
                          >
                            {getNotaLabel(manobra.nota)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Coluna Direita (12-22) */}
                  <div className="space-y-3">
                    {manobrasDireita.map((manobra) => (
                      <div
                        key={manobra.id}
                        className={`flex items-center gap-3 rounded-md border p-3 ${
                          manobra.tripulante === 'A'
                            ? 'border-blue-200 bg-blue-50'
                            : manobra.tripulante === 'B'
                              ? 'border-orange-200 bg-orange-50'
                              : 'border-slate-200'
                        }`}
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                          {manobra.ordem}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {manobra.nome || manobra.descricao}
                          </p>
                          <p className="text-xs text-slate-500">{manobra.codigo}</p>
                          {!isEditMode && manobra.observacoes?.trim() ? (
                            <p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-600">
                              {manobra.observacoes}
                            </p>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            manobra.tripulante === 'A'
                              ? 'bg-blue-100 text-blue-700 border-blue-300'
                              : manobra.tripulante === 'B'
                                ? 'bg-orange-100 text-orange-700 border-orange-300'
                                : 'bg-purple-100 text-purple-700 border-purple-300'
                          }`}
                        >
                          {manobra.tripulante || 'AB'}
                        </span>
                        {isEditMode ? (
                          <select
                            value={getNotaSelectValue(manobra.nota)}
                            onChange={(e) => handleNotaChange(manobra.ordem, e.target.value)}
                            className={`w-24 rounded border px-2 py-1 text-sm text-center focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                              manobra.nota === null
                                ? 'border-red-300 bg-red-50 text-red-700'
                                : 'border-slate-300'
                            }`}
                          >
                            <option value="">Selecione</option>
                            {opcoesNota.map((opcao) => (
                              <option key={opcao} value={opcao}>
                                {opcao}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`px-3 py-1 rounded-full text-sm font-bold ${getNotaBadgeClass(
                              manobra.nota,
                            )}`}
                          >
                            {getNotaLabel(manobra.nota)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {manobrasNotechs.length > 0 && (
              <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">
                      NOTECHS
                    </span>
                    <h3 className="text-lg font-bold text-slate-900">Habilidades Não Técnicas</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalNotechsAberto(true)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Info className="h-3.5 w-3.5" />
                    Ver descritores completos
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                  {manobrasNotechs.map((manobra) => (
                    <div
                      key={manobra.id}
                      className="flex items-center gap-3 rounded-md border border-slate-100 bg-slate-50/40 p-2.5"
                    >
                      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
                        {manobra.ordem - NOTECHS_ORDEM_BASE + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {manobra.nome || manobra.descricao}
                        </p>
                      </div>
                      {isEditMode ? (
                        <select
                          value={getNotaSelectValue(manobra.nota)}
                          onChange={(e) => handleNotaChange(manobra.ordem, e.target.value)}
                          className={`w-24 shrink-0 rounded border px-2 py-1 text-sm text-center focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary ${
                            manobra.nota === null
                              ? 'border-red-300 bg-red-50 text-red-700'
                              : 'border-slate-300'
                          }`}
                        >
                          <option value="">Selecione</option>
                          {opcoesNota.map((opcao) => (
                            <option key={opcao} value={opcao}>
                              {opcao}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`shrink-0 px-3 py-1 rounded-full text-sm font-bold ${getNotaBadgeClass(
                            manobra.nota,
                          )}`}
                        >
                          {getNotaLabel(manobra.nota)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <ModalNotechsReferencia
              isOpen={modalNotechsAberto}
              onClose={() => setModalNotechsAberto(false)}
            />
            <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
              {/* Observações Gerais */}
              <h3 className="text-lg font-bold text-slate-900 mb-3">Observações Gerais</h3>
              {isEditMode ? (
                <textarea
                  value={ficha.observacoes_gerais || ''}
                  onChange={(e) => setFicha({ ...ficha, observacoes_gerais: e.target.value })}
                  rows={4}
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Adicione observações sobre a sessão de simulador..."
                />
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {ficha.observacoes_gerais || 'Nenhuma observação registrada.'}
                </p>
              )}
            </div>
            {fichaFinalizada &&
              (edicoes.length > 0 || usuarioGestor || usuarioEhInstrutorDaFicha) && (
                <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                        <History className="h-5 w-5 text-slate-500" />
                        Edições pós-finalização
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Somente observações podem ser alteradas, sempre com solicitação do instrutor
                        e aprovação do gestor.
                      </p>
                    </div>
                    {podeSolicitarEdicaoFinalizada && (
                      <button
                        onClick={abrirSolicitacaoEdicao}
                        className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
                      >
                        <Send className="h-4 w-4" />
                        Solicitar edição
                      </button>
                    )}
                  </div>

                  {edicoes.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      Nenhuma solicitação de edição registrada para esta ficha.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {edicoes.map((edicao) => {
                        const pendente = edicao.status === 'PENDENTE';
                        const aprovada = edicao.status === 'APROVADA';
                        const manobrasAlteradas = edicao.alteracoes?.manobras || [];

                        return (
                          <div
                            key={edicao.id}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                                      pendente
                                        ? 'bg-amber-100 text-amber-800'
                                        : aprovada
                                          ? 'bg-emerald-100 text-emerald-800'
                                          : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {pendente ? (
                                      <Clock className="h-3.5 w-3.5" />
                                    ) : aprovada ? (
                                      <ShieldCheck className="h-3.5 w-3.5" />
                                    ) : (
                                      <XCircle className="h-3.5 w-3.5" />
                                    )}
                                    {edicao.status}
                                  </span>
                                  <span className="text-xs text-slate-500">
                                    #{edicao.id} ·{' '}
                                    {new Date(edicao.created_at).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-700">
                                  <strong>Solicitante:</strong>{' '}
                                  {edicao.solicitante_nome || 'Instrutor'}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                                  <strong>Motivo:</strong> {edicao.motivo}
                                </p>
                              </div>
                            </div>

                            <div className="space-y-3 rounded-lg bg-white p-3">
                              {edicao.alteracoes?.observacoes_gerais && (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Observações gerais
                                  </p>
                                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                                    <div className="rounded border border-rose-100 bg-rose-50 p-2">
                                      <p className="mb-1 text-[11px] font-semibold text-rose-700">
                                        Antes
                                      </p>
                                      <p className="whitespace-pre-wrap text-xs text-slate-700">
                                        {edicao.alteracoes.observacoes_gerais.antes || '—'}
                                      </p>
                                    </div>
                                    <div className="rounded border border-emerald-100 bg-emerald-50 p-2">
                                      <p className="mb-1 text-[11px] font-semibold text-emerald-700">
                                        Depois
                                      </p>
                                      <p className="whitespace-pre-wrap text-xs text-slate-700">
                                        {edicao.alteracoes.observacoes_gerais.depois || '—'}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {manobrasAlteradas.length > 0 && (
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                    Manobras alteradas ({manobrasAlteradas.length})
                                  </p>
                                  <div className="mt-2 space-y-2">
                                    {manobrasAlteradas.map((manobra) => (
                                      <div
                                        key={manobra.manobra_id}
                                        className="rounded border border-slate-200 p-2"
                                      >
                                        <p className="text-xs font-semibold text-slate-800">
                                          {manobra.ordem}. {manobra.nome || manobra.codigo}
                                        </p>
                                        <div className="mt-2 grid gap-2 md:grid-cols-2">
                                          <p className="whitespace-pre-wrap rounded bg-rose-50 p-2 text-xs text-slate-700">
                                            <span className="font-semibold text-rose-700">
                                              Antes:
                                            </span>{' '}
                                            {manobra.observacoes_antes || '—'}
                                          </p>
                                          <p className="whitespace-pre-wrap rounded bg-emerald-50 p-2 text-xs text-slate-700">
                                            <span className="font-semibold text-emerald-700">
                                              Depois:
                                            </span>{' '}
                                            {manobra.observacoes_depois || '—'}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            {edicao.decisao_observacoes && (
                              <p className="mt-3 whitespace-pre-wrap rounded bg-white px-3 py-2 text-xs text-slate-600">
                                <strong>Decisão:</strong> {edicao.decisao_observacoes}
                              </p>
                            )}

                            {usuarioGestor && pendente && (
                              <div className="mt-4 border-t border-slate-200 pt-4">
                                <textarea
                                  value={decisaoEdicao[edicao.id] || ''}
                                  onChange={(event) =>
                                    setDecisaoEdicao((prev) => ({
                                      ...prev,
                                      [edicao.id]: event.target.value,
                                    }))
                                  }
                                  rows={2}
                                  placeholder="Observações da decisão (opcional)"
                                  className="mb-3 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    onClick={() => decidirEdicao(edicao.id, 'aprovar')}
                                    disabled={decidindoEdicaoId === edicao.id}
                                    className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                                  >
                                    <ShieldCheck className="h-4 w-4" />
                                    Aprovar e aplicar
                                  </button>
                                  <button
                                    onClick={() => decidirEdicao(edicao.id, 'rejeitar')}
                                    disabled={decidindoEdicaoId === edicao.id}
                                    className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                                  >
                                    <XCircle className="h-4 w-4" />
                                    Rejeitar
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            {/* Assinaturas - só mostra em modo view, pois o modo sign já tem formulário inline */}
            {!isSignMode && (
              <div className="mb-6 rounded-lg border border-slate-200 bg-white p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-4">Assinaturas Digitais</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Assinatura Tripulante */}
                  <div className="rounded border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-slate-900">Tripulante</p>
                      {!ficha.assinatura_aluno_timestamp ? (
                        <button
                          onClick={() => setModalAssinatura({ isOpen: true, papel: 'TRIPULANTE' })}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Assinar
                        </button>
                      ) : (
                        <button
                          disabled
                          className="inline-flex items-center gap-1 rounded-md bg-gray-400 px-3 py-1.5 text-xs font-medium text-gray-600 cursor-not-allowed opacity-60"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Assinado
                        </button>
                      )}
                    </div>
                    {ficha.assinatura_aluno_timestamp ? (
                      <div>
                        <div className="h-24 bg-slate-50 rounded border border-slate-200 flex items-center justify-center mb-2 overflow-hidden p-2">
                          {ficha.assinatura_aluno_imagem ? (
                            <img
                              src={ficha.assinatura_aluno_imagem}
                              alt="Assinatura do tripulante"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="text-xs text-slate-500">✓ Assinado digitalmente</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600">
                          Assinado em{' '}
                          {new Date(ficha.assinatura_aluno_timestamp).toLocaleString('pt-BR')}
                        </p>
                        {ficha.assinatura_aluno_ip && (
                          <p className="text-xs text-slate-500">IP: {ficha.assinatura_aluno_ip}</p>
                        )}
                      </div>
                    ) : (
                      <div className="h-24 bg-slate-50 rounded border border-dashed border-slate-300 flex items-center justify-center">
                        <span className="text-xs text-slate-400">Aguardando assinatura</span>
                      </div>
                    )}
                  </div>

                  {/* Assinatura Instrutor */}
                  <div className="rounded border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-slate-900">Instrutor</p>
                      {ficha.assinatura_aluno_timestamp && !ficha.assinatura_instrutor_timestamp ? (
                        <button
                          onClick={() => setModalAssinatura({ isOpen: true, papel: 'INSTRUTOR' })}
                          className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Assinar
                        </button>
                      ) : ficha.assinatura_instrutor_timestamp ? (
                        <button
                          disabled
                          className="inline-flex items-center gap-1 rounded-md bg-gray-400 px-3 py-1.5 text-xs font-medium text-gray-600 cursor-not-allowed opacity-60"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Assinado
                        </button>
                      ) : (
                        <button
                          disabled
                          className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 cursor-not-allowed opacity-50"
                        >
                          <Lock className="w-3 h-3" />
                          Aguardando tripulante
                        </button>
                      )}
                    </div>
                    {ficha.assinatura_instrutor_timestamp ? (
                      <div>
                        <div className="h-24 bg-slate-50 rounded border border-slate-200 flex items-center justify-center mb-2 overflow-hidden p-2">
                          {ficha.assinatura_instrutor_imagem ? (
                            <img
                              src={ficha.assinatura_instrutor_imagem}
                              alt="Assinatura do instrutor"
                              className="h-full w-full object-contain"
                            />
                          ) : (
                            <span className="text-xs text-slate-500">✓ Assinado digitalmente</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600">
                          Assinado em{' '}
                          {new Date(ficha.assinatura_instrutor_timestamp).toLocaleString('pt-BR')}
                        </p>
                        {ficha.assinatura_instrutor_ip && (
                          <p className="text-xs text-slate-500">
                            IP: {ficha.assinatura_instrutor_ip}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="h-24 bg-slate-50 rounded border border-dashed border-slate-300 flex items-center justify-center">
                        <span className="text-xs text-slate-400">Aguardando assinatura</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}{' '}
            {/* fim !isSignMode assinaturas */}
            {/* Seção de Assinatura Inline (modo sign) */}
            {isSignMode && (
              <div
                ref={signSectionRef}
                className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-6"
              >
                <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
                  <PenTool className="w-5 h-5" />
                  Assinatura Digital - {papelParam === 'TRIPULANTE' ? 'Tripulante' : 'Instrutor'}
                </h3>

                <div className="space-y-4">
                  {/* Canvas para assinatura */}
                  <div>
                    <p className="text-sm font-medium text-blue-800 mb-2">
                      Desenhe sua assinatura no campo abaixo:
                    </p>
                    <div className="border-2 border-blue-300 rounded-lg overflow-hidden bg-white">
                      <canvas
                        ref={canvasRef}
                        width={600}
                        height={200}
                        onMouseDown={iniciarDesenho}
                        onMouseMove={desenhar}
                        onMouseUp={pararDesenho}
                        onMouseLeave={pararDesenho}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          const canvas = canvasRef.current;
                          if (!canvas) return;
                          const rect = canvas.getBoundingClientRect();
                          const scaleX = canvas.width / rect.width;
                          const scaleY = canvas.height / rect.height;
                          const touch = e.touches[0];
                          const ctx = canvas.getContext('2d');
                          if (ctx) {
                            ctx.beginPath();
                            ctx.moveTo(
                              (touch.clientX - rect.left) * scaleX,
                              (touch.clientY - rect.top) * scaleY,
                            );
                          }
                          setDesenhando(true);
                          setAssinado(true);
                        }}
                        onTouchMove={(e) => {
                          e.preventDefault();
                          if (!desenhando) return;
                          const canvas = canvasRef.current;
                          if (!canvas) return;
                          const rect = canvas.getBoundingClientRect();
                          const scaleX = canvas.width / rect.width;
                          const scaleY = canvas.height / rect.height;
                          const touch = e.touches[0];
                          const ctx = canvas.getContext('2d');
                          if (ctx) {
                            ctx.lineTo(
                              (touch.clientX - rect.left) * scaleX,
                              (touch.clientY - rect.top) * scaleY,
                            );
                            ctx.stroke();
                          }
                        }}
                        onTouchEnd={() => setDesenhando(false)}
                        className="w-full cursor-crosshair touch-none"
                        style={{ height: '200px' }}
                      />
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <button
                        onClick={limparCanvas}
                        className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Limpar assinatura
                      </button>
                      <span className="text-xs text-slate-500">
                        {assinado ? '✓ Assinatura desenhada' : 'Aguardando assinatura'}
                      </span>
                    </div>
                  </div>

                  {/* Nome do signatário — preenchido automaticamente do perfil */}
                  {assinaturaTexto && (
                    <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-2.5 text-sm text-slate-700">
                      <span className="font-medium">Signatário:</span> {assinaturaTexto}
                    </div>
                  )}

                  {/* Checkbox de concordância */}
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="concordo"
                      checked={concordo}
                      onChange={(e) => setConcordo(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="concordo" className="text-sm text-slate-700">
                      <span className="font-medium">Declaração:</span> Ao confirmar esta assinatura
                      digital, declaro que:
                      <ul className="mt-1 ml-5 list-disc text-xs text-slate-600 space-y-1">
                        <li>Li e concordo com todas as avaliações e notas atribuídas</li>
                        <li>A avaliação reflete fielmente o desempenho observado</li>
                        <li>Esta assinatura tem validade legal para fins de registro</li>
                      </ul>
                    </label>
                  </div>

                  {/* Aprovação (somente para instrutor) */}
                  {papelParam === 'INSTRUTOR' && (
                    <div className="border-t border-blue-200 pt-4">
                      <p className="text-sm font-medium text-slate-700 mb-3">Esta sessão foi:</p>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="aprovacao"
                            checked={aprovadoInline === true}
                            onChange={() => setAprovadoInline(true)}
                            className="w-4 h-4 text-green-600 border-slate-300 focus:ring-green-500"
                          />
                          <span className="text-sm font-medium text-green-700">✓ APROVADA</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="aprovacao"
                            checked={aprovadoInline === false}
                            onChange={() => setAprovadoInline(false)}
                            className="w-4 h-4 text-red-600 border-slate-300 focus:ring-red-500"
                          />
                          <span className="text-sm font-medium text-red-700">✗ NÃO APROVADA</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {papelParam === 'INSTRUTOR' && ficha?.is_check === 1 && checks.length > 0 && (
                    <div className="border-t border-blue-200 pt-4">
                      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Avalie todos os checks abaixo antes de concluir a assinatura e gerar a
                        qualificação.
                      </div>

                      <div className="space-y-4">
                        {checks.map((check) => (
                          <div
                            key={check.id}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                          >
                            <div className="mb-3 flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="mb-1 flex items-center gap-2">
                                  <span className="inline-flex items-center rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                                    {check.codigo}
                                  </span>
                                  <h4 className="text-sm font-bold text-slate-900">{check.nome}</h4>
                                </div>
                                {check.descricao && (
                                  <p className="text-xs text-slate-600">{check.descricao}</p>
                                )}
                              </div>
                            </div>

                            <div className="mb-3 flex items-center gap-4">
                              <label className="flex cursor-pointer items-center gap-2">
                                <input
                                  type="radio"
                                  name={`inline-check-${check.id}`}
                                  checked={checksResultados[check.id]?.aprovado === true}
                                  onChange={() => {
                                    setChecksResultados((prev) => ({
                                      ...prev,
                                      [check.id]: {
                                        aprovado: true,
                                        observacoes: prev[check.id]?.observacoes ?? '',
                                      },
                                    }));
                                  }}
                                  className="w-4 h-4 text-green-600 border-slate-300 focus:ring-green-500"
                                />
                                <span className="text-sm font-medium text-green-700">
                                  ✓ Aprovado
                                </span>
                              </label>

                              <label className="flex cursor-pointer items-center gap-2">
                                <input
                                  type="radio"
                                  name={`inline-check-${check.id}`}
                                  checked={checksResultados[check.id]?.aprovado === false}
                                  onChange={() => {
                                    setChecksResultados((prev) => ({
                                      ...prev,
                                      [check.id]: {
                                        aprovado: false,
                                        observacoes: prev[check.id]?.observacoes ?? '',
                                      },
                                    }));
                                  }}
                                  className="w-4 h-4 text-red-600 border-slate-300 focus:ring-red-500"
                                />
                                <span className="text-sm font-medium text-red-700">
                                  ✗ Reprovado
                                </span>
                              </label>
                            </div>

                            <textarea
                              value={checksResultados[check.id]?.observacoes ?? ''}
                              onChange={(e) =>
                                setChecksResultados((prev) => ({
                                  ...prev,
                                  [check.id]: {
                                    aprovado: prev[check.id]?.aprovado ?? null,
                                    observacoes: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Observações sobre este check (opcional)"
                              rows={2}
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Botão de confirmação */}
                  <div className="pt-4 border-t border-blue-200">
                    {papelParam === 'INSTRUTOR' &&
                      aprovadoInline === true &&
                      fichaGeraQualificacao && (
                        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                          Ao concluir esta assinatura, a qualificação será gerada automaticamente.
                        </div>
                      )}
                    <button
                      onClick={handleAssinarInline}
                      disabled={
                        assinando ||
                        !assinado ||
                        !concordo ||
                        (papelParam === 'INSTRUTOR' && aprovadoInline === null)
                      }
                      className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {assinando
                        ? 'Registrando assinatura...'
                        : papelParam === 'INSTRUTOR' &&
                            aprovadoInline === true &&
                            fichaGeraQualificacao
                          ? 'Assinar e Gerar Qualificação'
                          : `Confirmar Assinatura como ${papelParam === 'TRIPULANTE' ? 'Tripulante' : 'Instrutor'}`}
                    </button>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                      {papelParam === 'INSTRUTOR' &&
                      aprovadoInline === true &&
                      fichaGeraQualificacao
                        ? 'A ficha será concluída com geração imediata da qualificação antes do retorno à lista'
                        : 'Após confirmar, você será redirecionado para a lista de fichas'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {/* Ações Finais */}
            <div className="flex justify-between items-center gap-3">
              <button
                onClick={() => navigate('/simuladores?tab=fichas')}
                className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </button>

              <div className="flex gap-3">
                {isEditMode && (
                  <button
                    onClick={salvarFicha}
                    disabled={salvando}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {salvando ? 'Salvando...' : 'Salvar Avaliação'}
                  </button>
                )}

                <button
                  onClick={async () => {
                    if (
                      !ficha ||
                      !ficha.assinatura_aluno_timestamp ||
                      !ficha.assinatura_instrutor_timestamp
                    ) {
                      toast.warning('Ficha precisa estar totalmente assinada para gerar PDF');
                      return;
                    }
                    const pw = openPreviewWindow();
                    try {
                      toast.info('Gerando PDF...');

                      // Buscar logo da empresa
                      let logoUrl: string | undefined;
                      try {
                        const token = getAccessToken();
                        console.log('🔐 [FICHA-PDF] Token obtido:', token ? '✓' : '✗');

                        const empresaRes = await fetch(`${API_BASE_URL}/empresas/minha`, {
                          headers: { Authorization: `Bearer ${token}` },
                        });
                        console.log(
                          `📊 [FICHA-PDF] Response status /empresas/minha:`,
                          empresaRes.status,
                        );

                        const empresaData = await empresaRes.json();
                        console.log('📦 [FICHA-PDF] Dados da empresa:', empresaData);

                        if (empresaData.success && empresaData.data) {
                          // Prioridade: 1. Logo específico do certificado, 2. Logo principal da empresa
                          logoUrl =
                            empresaData.data.certificado_logo_url || empresaData.data.logo_url;
                          console.log('✅ [FICHA-PDF] Logo carregado da empresa:', logoUrl);
                        } else {
                          console.warn(
                            '⚠️ [FICHA-PDF] Logo não encontrado na empresa ou erro:',
                            empresaData,
                          );
                        }
                      } catch (e) {
                        console.warn(
                          '❌ [FICHA-PDF] Não foi possível carregar logo da empresa:',
                          e,
                        );
                      }

                      // Calcular carga horária (usar valores do backend quando disponíveis)
                      const cargaPF =
                        typeof ficha.carga_horaria_pf === 'string'
                          ? parseFloat(ficha.carga_horaria_pf) || 0
                          : Number(ficha.carga_horaria_pf) || 0;
                      const cargaPM =
                        typeof ficha.carga_horaria_pm === 'string'
                          ? parseFloat(ficha.carga_horaria_pm) || 0
                          : Number(ficha.carga_horaria_pm) || 0;

                      // Formatar para exibição
                      const formatarHoras = (h: number) => {
                        if (h === Math.floor(h)) return `${h}`;
                        return h.toFixed(1).replace('.', ',');
                      };

                      const tipoSessaoPDF = (ficha.tipo_sessao || '').toUpperCase();
                      const isInstrExamPDF =
                        tipoSessaoPDF.includes('INSTRUTOR') ||
                        tipoSessaoPDF.includes('EXAMINADOR') ||
                        tipoSessaoPDF.includes('CHECK');
                      const isSharedPDF =
                        Number(ficha.modo_compartilhado || 0) === 1 ||
                        Boolean(ficha.atribuicao_curricular_id);
                      const showOperationalHoursPDF = !isInstrExamPDF || isSharedPDF;

                      const cargaHorariaTotalStr = !showOperationalHoursPDF
                        ? ficha.carga_horaria_total || `${formatarHoras(cargaPF + cargaPM)} h`
                        : `${ficha.carga_horaria_total || formatarHoras(cargaPF + cargaPM) + ' h'} (PF: ${formatarHoras(cargaPF)} h / PM: ${formatarHoras(cargaPM)} h)`;

                      // Preparar dados para o PDF
                      const dadosPDF: FichaPDFData = {
                        fichaId: ficha.id,
                        sessao_codigo: ficha.sessao_codigo || undefined,
                        sessao_titulo: ficha.sessao_titulo || 'Sessão de Treinamento',
                        sessao_nome: ficha.sessao_titulo || undefined,
                        sessao_titulo_linha1: specialDefinition?.headerTitle,
                        sessao_titulo_linha2: specialDefinition?.headerSubtitle,
                        tripulante_nome: ficha.participante_nome,
                        tripulante_funcao: ficha.participante_funcao,
                        tripulante_codigo_anac: ficha.tripulante_codigo_anac || '',
                        instrutor_nome: ficha.instrutor_nome,
                        instrutor_codigo_anac: ficha.instrutor_codigo_anac || '',
                        data: formatarDataLocalSemUTC(ficha.data || ficha.data_hora),
                        horario_inicio:
                          ficha.horario_inicio && ficha.horario_inicio !== 'N/A'
                            ? ficha.horario_inicio
                            : ficha.data_hora
                              ? new Date(ficha.data_hora).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '',
                        horario_fim:
                          ficha.horario_fim && ficha.horario_fim !== 'N/A' ? ficha.horario_fim : '',
                        simulador: ficha.simulador_codigo,
                        simulador_nome: ficha.simulador_nome,
                        simulador_modelo: ficha.simulador_modelo,
                        equipamento_utilizado: ficha.equipamento_utilizado || undefined,
                        dispositivo_identificacao: ficha.dispositivo_identificacao || undefined,
                        assento_instrucao_utilizado: ficha.assento_instrucao_utilizado || undefined,
                        carga_horaria_total: ficha.carga_horaria_total || cargaHorariaTotalStr,
                        carga_horaria_pf: showOperationalHoursPDF
                          ? String(ficha.carga_horaria_pf || '')
                          : '',
                        carga_horaria_pm: showOperationalHoursPDF
                          ? String(ficha.carga_horaria_pm || '')
                          : '',
                        tripulacao_nomes: isSharedPDF ? ficha.tripulacao_nomes || '' : '',
                        status: ficha.status,
                        observacoes_gerais: ficha.observacoes_gerais || '',
                        assinatura_aluno_timestamp: ficha.assinatura_aluno_timestamp,
                        assinatura_instrutor_timestamp: ficha.assinatura_instrutor_timestamp,
                        assinatura_aluno_dataUrl: ficha.assinatura_aluno_imagem,
                        assinatura_instrutor_dataUrl: ficha.assinatura_instrutor_imagem,
                        logoUrl: logoUrl,
                        // Fichas criadas a partir de 2026-07-01 usam V6.2 (sem régua).
                        // Fichas anteriores preservam template legado.
                        templateVersion:
                          ficha.created_at && ficha.created_at >= '2026-07-01' ? 'v6' : 'legacy',
                        manobras: ficha.manobras.map((m) => ({
                          ordem: m.ordem,
                          nome: m.nome, // nome curto da manobra (nunca usar descricao aqui)
                          descricao: m.descricao, // descrição completa (apenas para avaliação, não no PDF)
                          codigo: m.codigo,
                          resultado: m.nota === -1 ? 'NR' : m.nota,
                          observacoes: m.observacoes || '',
                          tripulante: m.tripulante || 'AB',
                        })),
                      };
                      // Nome padronizado garante consistência entre visualização e download
                      dadosPDF.fileName = buildNomeFichaOficial(dadosPDF);

                      // Gerar PDF no cliente (agora assíncrono)
                      await gerarPDFFichaCliente(dadosPDF, { previewWindow: pw });
                      toast.success('PDF gerado com sucesso!');
                    } catch (error) {
                      console.error('Erro ao gerar PDF:', error);
                      toast.error(error instanceof Error ? error.message : 'Erro ao gerar PDF');
                    }
                  }}
                  disabled={
                    !['CONCLUIDA', 'APROVADO', 'NAO_APROVADO'].includes(ficha?.status || '')
                  }
                  className={`inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-medium ${
                    ['CONCLUIDA', 'APROVADO', 'NAO_APROVADO'].includes(ficha?.status || '')
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <FileCheck className="w-4 h-4" />
                  Gerar PDF
                </button>

                {/* Botão Gerar Qualificação — fichas do fluxo de check aprovadas pelo instrutor */}
                {ficha.aprovado === 1 &&
                  fichaGeraQualificacao &&
                  ficha.assinatura_instrutor_timestamp && (
                    <button
                      onClick={async () => {
                        try {
                          const token = getAccessToken();
                          const res = await fetch(
                            `${API_BASE_URL}/simuladores/fichas-simulador/${id}/gerar-qualificacao`,
                            {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                              },
                            },
                          );
                          const data = (await res.json()) as {
                            success: boolean;
                            message?: string;
                            error?: string;
                            data?: {
                              valida_ate?: string;
                              nome?: string;
                              qualificacoes_geradas?: Array<{
                                codigo: string;
                                nome: string;
                                valida_ate: string;
                                tipo: string;
                              }>;
                            };
                          };
                          if (data.success) {
                            const geradas = data.data?.qualificacoes_geradas || [];
                            if (geradas.length > 0) {
                              exibirResumoQualificacoesGeradas(
                                geradas,
                                `${geradas.length} qualificação(ões) gerada(s) com sucesso.`,
                              );
                            } else {
                              toast.success(
                                `Qualificação gerada com sucesso. Válida até ${formatarDataQualificacao(
                                  data.data?.valida_ate,
                                )}.`,
                              );
                            }
                          } else {
                            toast.error(data.error || 'Erro ao gerar qualificação');
                          }
                        } catch {
                          toast.error('Erro ao gerar qualificação');
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-md bg-green-600 px-6 py-3 text-sm font-medium text-white hover:bg-green-700"
                    >
                      <Award className="w-4 h-4" />
                      Gerar Qualificação
                    </button>
                  )}
              </div>
            </div>
          </>
        )}

        {modalSolicitarEdicao && ficha && (
          <div className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/50 p-4">
            <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="border-b border-slate-200 px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">
                      Solicitar edição da ficha finalizada
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      A solicitação será enviada ao gestor. A qualificação, notas, status e
                      assinaturas não serão alterados.
                    </p>
                  </div>
                  <button
                    onClick={() => setModalSolicitarEdicao(false)}
                    disabled={enviandoEdicao}
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
                <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Use este fluxo apenas para complementar ou corrigir observações. Qualquer mudança
                  de nota, resultado ou aprovação exige processo administrativo separado.
                </div>

                <div className="mb-5">
                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                    Motivo da solicitação
                  </label>
                  <textarea
                    value={motivoEdicao}
                    onChange={(event) => setMotivoEdicao(event.target.value)}
                    rows={3}
                    placeholder="Explique por que a ficha finalizada precisa receber estas observações."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="mb-5">
                  <label className="mb-2 block text-sm font-semibold text-slate-900">
                    Observações gerais
                  </label>
                  <textarea
                    value={observacoesGeraisEdicao}
                    onChange={(event) => setObservacoesGeraisEdicao(event.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold text-slate-900">
                    Observações por manobra
                  </h3>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {ficha.manobras.map((manobra) => (
                      <div key={manobra.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {manobra.ordem}. {manobra.nome || manobra.descricao}
                            </p>
                            <p className="text-xs text-slate-500">
                              {manobra.codigo} · Nota {getNotaLabel(manobra.nota)}
                            </p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                            {manobra.tripulante || 'AB'}
                          </span>
                        </div>
                        <textarea
                          value={observacoesManobrasEdicao[manobra.id] || ''}
                          onChange={(event) =>
                            setObservacoesManobrasEdicao((prev) => ({
                              ...prev,
                              [manobra.id]: event.target.value,
                            }))
                          }
                          rows={3}
                          placeholder="Observações desta manobra"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 px-6 py-4">
                <button
                  onClick={() => setModalSolicitarEdicao(false)}
                  disabled={enviandoEdicao}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={solicitarEdicaoFinalizada}
                  disabled={enviandoEdicao || motivoEdicao.trim().length < 5}
                  className="inline-flex items-center gap-2 rounded-md bg-amber-600 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {enviandoEdicao ? 'Enviando...' : 'Enviar para aprovação'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Assinatura */}
        <AssinaturaModal
          isOpen={modalAssinatura.isOpen}
          onClose={() => setModalAssinatura({ isOpen: false, papel: 'TRIPULANTE' })}
          onSalvar={handleSalvarAssinatura}
          papel={modalAssinatura.papel}
        >
          {/* Avaliação de Checks (somente para instrutor em sessões de check) */}
          {modalAssinatura.papel === 'INSTRUTOR' && ficha?.is_check === 1 && checks.length > 0 && (
            <div className="border-t border-slate-200 pt-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-bold text-amber-900 mb-1 flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4" />
                  Avaliação de Checks
                </h3>
                <p className="text-xs text-amber-800">
                  Esta sessão está vinculada a um examinador. Avalie se o aluno foi{' '}
                  <strong>aprovado ou reprovado</strong> em cada check abaixo.
                </p>
              </div>

              <div className="space-y-4">
                {checks.map((check) => (
                  <div
                    key={check.id}
                    className="border border-slate-200 rounded-lg p-4 bg-slate-50 hover:bg-white transition"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                            {check.codigo}
                          </span>
                          <h4 className="text-sm font-bold text-slate-900">{check.nome}</h4>
                        </div>
                        {check.descricao && (
                          <p className="text-xs text-slate-600">{check.descricao}</p>
                        )}
                      </div>
                    </div>

                    {/* Radio buttons Aprovado/Reprovado */}
                    <div className="flex items-center gap-4 mb-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`check-${check.id}`}
                          checked={checksResultados[check.id]?.aprovado === true}
                          onChange={() => {
                            console.log(`[CHECK ${check.id}] Marcando como APROVADO`);
                            setChecksResultados((prev) => ({
                              ...prev,
                              [check.id]: {
                                aprovado: true,
                                observacoes: prev[check.id]?.observacoes ?? '',
                              },
                            }));
                          }}
                          className="w-4 h-4 text-green-600 border-slate-300 focus:ring-green-500"
                        />
                        <span className="text-sm font-medium text-green-700">✓ Aprovado</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`check-${check.id}`}
                          checked={checksResultados[check.id]?.aprovado === false}
                          onChange={() => {
                            console.log(`[CHECK ${check.id}] Marcando como REPROVADO`);
                            setChecksResultados((prev) => ({
                              ...prev,
                              [check.id]: {
                                aprovado: false,
                                observacoes: prev[check.id]?.observacoes ?? '',
                              },
                            }));
                          }}
                          className="w-4 h-4 text-red-600 border-slate-300 focus:ring-red-500"
                        />
                        <span className="text-sm font-medium text-red-700">✗ Reprovado</span>
                      </label>
                    </div>

                    {/* Campo de Observações */}
                    <textarea
                      value={checksResultados[check.id]?.observacoes ?? ''}
                      onChange={(e) =>
                        setChecksResultados((prev) => ({
                          ...prev,
                          [check.id]: {
                            aprovado: prev[check.id]?.aprovado ?? null,
                            observacoes: e.target.value,
                          },
                        }))
                      }
                      placeholder="Observações sobre este check (opcional)"
                      rows={2}
                      className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                ))}
              </div>

              {/* Aviso de obrigatoriedade */}
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-800">
                  <strong>Atenção:</strong> Todos os checks precisam ser avaliados antes de
                  confirmar a assinatura. Qualificações serão geradas automaticamente para checks
                  aprovados.
                </p>
              </div>
            </div>
          )}
        </AssinaturaModal>
      </div>
    </AppLayout>
  );
}
