/**
 * MODAL: Nova Sessão de Treinamento
 * Versão: 4.0 - Gestão Completa via Calendário
 * Data: 14/01/2026
 *
 * FLUXO:
 * 1. Aeronave → 2. Simulador → 3. Tipo de Sessão → 4. Modelo de Sessão
 *
 * MUDANÇAS v4.0:
 * - ✅ Adicionado envio por Email e WhatsApp (modo edição)
 * - ✅ Adicionado botão para excluir sessão (modo edição)
 * - ✅ Adicionado acesso às fichas geradas (modo edição)
 * - ✅ Mensagens pré-configuradas com dados da sessão
 * - ✅ Destinatários automáticos (participantes + instrutor)
 */

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Mail, MessageCircle, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import TimeInput from '@/react-app/components/TimeInput';
import AlertModal from '@/react-app/components/modals/AlertModal';
import ConfirmDeleteModal from '@/react-app/components/modals/ConfirmDeleteModal';
import { emitirEventoModulo, escutarEventosModulo } from '@/react-app/lib/moduloBus';
import { normalizeTimeInput } from '@/react-app/lib/time-input';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import {
  filterCompatibleCheckIds,
  filterCompatibleChecks,
} from '@/react-app/utils/checkCompatibility';
import {
  applyModelChangeDefaults,
  deriveSpecialFichaFlags,
  filterModelosSessaoForModal,
  resolveEditModeloSelection,
} from './modalNovaSessaoRules';
import { enviarNotificacaoSessao, montarResumoCanal } from '@/react-app/utils/sessaoNotificacoes';

interface ModeloAeronave {
  id: number;
  modelo: string;
  fabricante?: string;
}

interface AeronaveReal {
  id: number;
  prefixo: string;
  modelo: string;
  fabricante?: string;
}

interface Simulador {
  id: number;
  nome: string;
  modelo: string;
  modelo_aeronave?: string;
  tipo?: string; // Tipo de aeronave (ex: AW139)
  fabricante?: string;
  aeronave_codigo?: string; // FK para aeronaves.codigo
}

interface TipoSessao {
  id: number;
  codigo: string;
  nome: string;
}

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
}

interface TipoCheck {
  id: number;
  codigo: string;
  nome: string;
  descricao?: string | null;
}

interface Participante {
  funcionario_id: number | null;
  funcao?: 'PIC' | 'SIC';
}

interface ModeloSessao {
  id: number;
  codigo: string;
  nome: string;
  tipo_sessao_id: number;
  tipo_aeronave: string;
  tipo?: string | null;
  modelo_aeronave?: string | null;
  codigo_aeronave?: string | null;
  tipo_sessao_codigo?: string | null;
  tipo_sessao_nome?: string | null;
  checks?: Array<{ id: number }>;
}

interface SessaoParaEditar {
  id: number;
  template_id?: number | null;
  simulador_id?: number | null; // null for AERONAVE sessions
  simulador_nome?: string;
  simulador_modelo?: string;
  data: string;
  horario_inicio: string;
  horario_fim: string;
  instrutor_id: number;
  instrutor_nome?: string;
  tipo_sessao: string;
  tipo_sessao_id?: number | null; // FK canônica (via template_id JOIN no backend)
  tipo_sessao_codigo?: string | null; // Código do tipo (via template_id JOIN no backend)
  tipo_aeronave?: string; // Código da aeronave
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
  fichas?: Array<{ id: number }>; // Array de fichas geradas
}

interface ModalNovaSessaoProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sessao?: SessaoParaEditar | null; // Para edição
  onDelete?: (id: number) => void; // Callback para excluir
  onVerFichas?: (sessaoId: number) => void; // Callback para ver fichas
}

export default function ModalNovaSessao({
  isOpen,
  onClose,
  onSuccess,
  sessao,
  onDelete,
  onVerFichas,
}: ModalNovaSessaoProps) {
  const participantesIniciais = (): Participante[] => [
    { funcionario_id: null },
    { funcionario_id: null },
  ];

  const getFuncaoParticipante = (index: number): 'PIC' | 'SIC' => (index === 0 ? 'PIC' : 'SIC');

  const isEditMode = !!sessao?.id;
  // ========== STATES ==========
  const [loading, setLoading] = useState(false);
  const [sendingChannel, setSendingChannel] = useState<'email' | 'whatsapp' | null>(null);
  const [aeronaves, setAeronaves] = useState<ModeloAeronave[]>([]);
  const [simuladores, setSimuladores] = useState<Simulador[]>([]);
  const [simuladoresFiltrados, setSimuladoresFiltrados] = useState<Simulador[]>([]);
  const [tiposSessao, setTiposSessao] = useState<TipoSessao[]>([]);
  const [instrutores, setInstrutores] = useState<Funcionario[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [examinadores, setExaminadores] = useState<Funcionario[]>([]);
  const [tiposCheck, setTiposCheck] = useState<TipoCheck[]>([]);
  const [modelos, setModelos] = useState<ModeloSessao[]>([]);
  const [loadingModelos, setLoadingModelos] = useState(false);
  const [conflitoModal, setConflitoModal] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editHydrating, setEditHydrating] = useState(false); // Loading state for edit mode hydration

  // ========== FLUXO EM CASCATA ==========
  const [tipoDispositivo, setTipoDispositivo] = useState<'SIMULADOR' | 'AERONAVE'>('SIMULADOR');
  const [aeronaveId, setAeronaveId] = useState<number | null>(null);
  const [aeronaveCodigo, setAeronaveCodigo] = useState<string>('');
  const [simuladorId, setSimuladorId] = useState<number | null>(null);
  const [aeronaveRealId, setAeronaveRealId] = useState<number | null>(null);
  const [aeronavesReais, setAeronavesReais] = useState<AeronaveReal[]>([]);
  const [aeronavesReaisFiltradas, setAeronavesReaisFiltradas] = useState<AeronaveReal[]>([]);
  const [tipoSessaoId, setTipoSessaoId] = useState<number | null>(null);
  const [modeloSessaoId, setModeloSessaoId] = useState<number | null>(null);

  // Campos do formulário
  const [temaSessao, setTemaSessao] = useState<string>('');
  const [data, setData] = useState<string>('');
  const [dataInvalida, setDataInvalida] = useState<boolean>(false);
  const [horarioInicio, setHorarioInicio] = useState<string>('');
  const [horarioFim, setHorarioFim] = useState<string>('');
  const [horarioFimFoiEditado, setHorarioFimFoiEditado] = useState<boolean>(false);
  const [instrutorId, setInstrutorId] = useState<number | null>(null);
  const [examinadorId, setExaminadorId] = useState<number | null>(null);
  const [checksSelecionados, setChecksSelecionados] = useState<number[]>([]);
  // Fichas especiais: podem ser acionadas pelos checks FAP07/FAP13 ou manualmente
  const [gerarFichaInstrutor, setGerarFichaInstrutor] = useState(false);
  const [gerarFichaExaminador, setGerarFichaExaminador] = useState(false);
  const [observacoes, setObservacoes] = useState<string>('');
  const [participantes, setParticipantes] = useState<Participante[]>(participantesIniciais());

  const {
    hasFap07Selecionada,
    hasFap13Selecionada,
    gerarFichaInstrutorEfetivo,
    gerarFichaExaminadorEfetivo,
  } = deriveSpecialFichaFlags({
    checksSelecionados,
    tiposCheck,
    gerarFichaInstrutorManual: gerarFichaInstrutor,
    gerarFichaExaminadorManual: gerarFichaExaminador,
  });

  function addMinutesToTimeHHMM(timeHHMM: string, minutesToAdd: number): string {
    const horarioNormalizado = normalizeTimeInput(timeHHMM);
    if (!horarioNormalizado) return '';
    const [hStr, mStr] = horarioNormalizado.split(':');
    const h = Number(hStr);
    const m = Number(mStr);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return '';
    const total = h * 60 + m + minutesToAdd;
    // Allow overflow to next day: if total >= 24*60, use modulo to get time of next day
    const normalizedMinutes = total >= 0 ? total : 0;
    const hh = String(Math.floor((normalizedMinutes / 60) % 24)).padStart(2, '0');
    const mm = String(normalizedMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // ========== LOAD DATA INICIAL ==========
  useEffect(() => {
    if (isOpen) {
      setTiposSessao([]);
      setModelos([]);
      setSimuladoresFiltrados([]);
      setTipoSessaoId(null);
      setModeloSessaoId(null);
      fetchAeronaves();
      fetchAeronavesReais();
      fetchSimuladores();
      fetchTiposSessao();
      fetchInstrutores();
      setFuncionarios([]);
      fetchExaminadores();
      fetchTiposCheck();

      // Em criação: pré-preencher com data de hoje
      if (!isEditMode) {
        setData(new Date().toISOString().split('T')[0]);
        setEditHydrating(false);
      } else {
        setEditHydrating(true); // Show loading until hydration completes
      }

      // Em criação: auto +2h; em edição: preservar valor existente
      setHorarioFimFoiEditado(isEditMode);
    } else {
      // Modal fechando: limpar estado de hidratação
      setEditHydrating(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (!aeronaveCodigo) {
      setFuncionarios([]);
      return;
    }

    fetchFuncionarios(aeronaveCodigo);
  }, [isOpen, aeronaveCodigo]);

  useEffect(() => {
    if (!isOpen || !tipoSessaoId || !aeronaveCodigo) return;

    const recarregarModelos = () => {
      void fetchModelosComCodigo(tipoSessaoId, aeronaveCodigo);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recarregarModelos();
      }
    };

    const unsubscribe = escutarEventosModulo((evento) => {
      if (evento.modulo === 'simuladores' && evento.tipo === 'SIMULADOR_ATUALIZADO') {
        recarregarModelos();
      }
    });

    window.addEventListener('focus', recarregarModelos);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', recarregarModelos);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isOpen, tipoSessaoId, aeronaveCodigo]);

  // Se estiver em modo edição, tentar pré-carregar checks vinculados (se houver)
  useEffect(() => {
    if (!isOpen || !isEditMode || !sessao?.id) return;

    // Preencher examinador_id se o objeto vier com esse campo
    if (typeof sessao.examinador_id === 'number') {
      setExaminadorId(sessao.examinador_id);
    }

    (async () => {
      try {
        const token = getAccessToken();
        const res = await fetch(`${API_BASE_URL}/simuladores/sessoes/${sessao.id}/checks`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.success || !Array.isArray(data?.data)) return;
        const ids = data.data
          .map((c: { qualificacao_tipo_id?: number }) => c.qualificacao_tipo_id)
          .filter((v: unknown): v is number => typeof v === 'number');
        setChecksSelecionados(ids);
      } catch (e) {
        // silencioso: edição continua funcional mesmo sem checks
      }
    })();
  }, [isOpen, isEditMode, sessao?.id, sessao?.examinador_id]);

  // Pré-preencher data quando abrindo modo criação via click no calendário
  useEffect(() => {
    if (isOpen && !isEditMode && sessao?.data) {
      setData(sessao.data.split('T')[0]);
    }
  }, [isOpen, isEditMode, sessao?.data]);

  // ========== PREENCHER DADOS PARA EDIÇÃO ==========
  useEffect(() => {
    // For SIMULADOR sessions: wait for simuladores + aeronaves + tiposSessao to load
    // For AERONAVE sessions: simuladores may be empty (null simulador_id), so skip that guard
    const tipoDisp = sessao?.tipo_dispositivo || 'SIMULADOR';
    const dataReady = tipoDisp === 'AERONAVE'
      ? isOpen && isEditMode && sessao && aeronaves.length > 0 && tiposSessao.length > 0 && aeronavesReais !== undefined
      : isOpen && isEditMode && sessao && simuladores.length > 0 && aeronaves.length > 0 && tiposSessao.length > 0;

    if (!dataReady) return;

    // Helper to set non-cascading fields (always populated, even if cascading lookups fail)
    const setCamposIndependentes = () => {
      setData((sessao!.data || '').split('T')[0]);
      setHorarioInicio(sessao!.horario_inicio?.substring(0, 5) || '');
      setHorarioFim(sessao!.horario_fim?.substring(0, 5) || '');
      setHorarioFimFoiEditado(true);
      setInstrutorId(sessao!.instrutor_id);
      setObservacoes(sessao!.observacoes || '');
      if (sessao!.tema_sessao) {
        setTemaSessao(sessao!.tema_sessao);
      }
      // Preencher participantes (máximo 2)
      if (sessao!.participantes && sessao!.participantes.length > 0) {
        setParticipantes(
          sessao!.participantes.slice(0, 2).map((p) => ({
            funcionario_id: p.funcionario_id,
            funcao: p.funcao,
          })),
        );
      }
    };

    {
      console.log('🔧 [EDIT MODE] Iniciando preenchimento:', {
        sessao_id: sessao!.id,
        simulador_id: sessao!.simulador_id,
        tipo_sessao: sessao!.tipo_sessao,
        tipo_sessao_id: sessao!.tipo_sessao_id,
        tema_sessao: sessao!.tema_sessao,
        tipo_dispositivo: sessao!.tipo_dispositivo,
        aeronave_id: sessao!.aeronave_id,
      });

      // tipoDisp is declared above, before the dataReady guard
      setTipoDispositivo(tipoDisp);

      // ─── Always set non-cascading fields first ───
      setCamposIndependentes();

      let aeronaveEncontrada: ModeloAeronave | undefined;
      let modeloDirecto: string | null = (sessao as any).simulador_modelo || null;

      if (tipoDisp === 'AERONAVE') {
        // Modo AERONAVE: determinar modelo via aeronave_modelo ou tipo_aeronave
        modeloDirecto = sessao.aeronave_modelo || sessao.tipo_aeronave || null;

        aeronaveEncontrada = aeronaves.find(
          (a) => a.modelo === modeloDirecto || a.modelo === sessao.tipo_aeronave,
        );

        if (aeronaveEncontrada) {
          setAeronaveId(aeronaveEncontrada.id);
          setAeronaveCodigo(aeronaveEncontrada.modelo);
          const filtradosReais = aeronavesReais.filter(
            (a) => a.modelo === aeronaveEncontrada!.modelo,
          );
          setAeronavesReaisFiltradas(filtradosReais);
        } else if (modeloDirecto) {
          setAeronaveCodigo(modeloDirecto);
        }

        if (sessao.aeronave_id) {
          setAeronaveRealId(sessao.aeronave_id);
        }
      } else {
        // Modo SIMULADOR
        const simulador = simuladores.find((s) => s.id === sessao.simulador_id);

        if (simulador) {
          console.log('🔧 [EDIT MODE] Simulador encontrado:', simulador);

          modeloDirecto =
            simulador.aeronave_codigo || simulador.tipo || simulador.modelo || modeloDirecto || null;

          aeronaveEncontrada = aeronaves.find(
            (a) =>
              a.modelo === modeloDirecto ||
              a.modelo === simulador.modelo_aeronave ||
              a.modelo === (sessao as any).tipo_aeronave,
          );

          if (aeronaveEncontrada) {
            console.log('🔧 [EDIT MODE] Aeronave encontrada via lookup:', aeronaveEncontrada);
            setAeronaveId(aeronaveEncontrada.id);
            setAeronaveCodigo(aeronaveEncontrada.modelo);
          } else if (modeloDirecto) {
            console.warn(
              '⚠️ [EDIT MODE] Aeronave não encontrada no lookup; usando modelo direto:',
              modeloDirecto,
            );
            setAeronaveCodigo(modeloDirecto);
          } else {
            console.error(
              '❌ [EDIT MODE] Modelo de aeronave NÃO determinado para simulador:',
              simulador,
            );
          }

          const modeloFinal = aeronaveEncontrada?.modelo ?? modeloDirecto ?? '';
          if (modeloFinal) {
            const filtrados = simuladores.filter(
              (s) =>
                s.aeronave_codigo === modeloFinal ||
                s.tipo === modeloFinal ||
                s.modelo === modeloFinal ||
                s.modelo_aeronave === modeloFinal,
            );
            setSimuladoresFiltrados(filtrados);
          }

          setSimuladorId(sessao.simulador_id);
        } else {
          console.error('❌ [EDIT MODE] Simulador NÃO encontrado com ID:', sessao.simulador_id);
        }
      }

      // Encontrar tipo de sessão: tentar FK (tipo_sessao_id) primeiro, depois código TEXT
      let tipoSessao = tiposSessao.find((t) => t.id === sessao.tipo_sessao_id);
      let tipoSessaoSource = 'tipo_sessao_id';

      if (!tipoSessao && sessao.tipo_sessao_codigo) {
        tipoSessao = tiposSessao.find((t) => t.codigo === sessao.tipo_sessao_codigo);
        tipoSessaoSource = 'tipo_sessao_codigo';
      }

      if (!tipoSessao && sessao.tipo_sessao) {
        tipoSessao = tiposSessao.find((t) => t.codigo === sessao.tipo_sessao);
        tipoSessaoSource = 'tipo_sessao (TEXT fallback)';
      }

      if (tipoSessao) {
        console.log(`🔧 [EDIT MODE] Tipo sessão encontrado via ${tipoSessaoSource}:`, tipoSessao);
        setTipoSessaoId(tipoSessao.id);

        // ✅ CARREGAR MODELOS USANDO O CÓDIGO DA AERONAVE ENCONTRADA
        const codigoParaModelos = aeronaveEncontrada?.modelo ?? modeloDirecto;
        if (codigoParaModelos) {
          console.log('🔧 [EDIT MODE] Chamando fetchModelos com:', {
            tipoSessaoId: tipoSessao.id,
            aeronaveCodigo: codigoParaModelos,
          });
          fetchModelosComCodigo(tipoSessao.id, codigoParaModelos, tipoDisp);
        } else {
          console.warn('⚠️ [EDIT MODE] Não pode carregar modelos - aeronave não determinada (campos básicos já preenchidos)');
        }
      } else {
        console.warn('⚠️ [EDIT MODE] Tipo de sessão NÃO encontrado por nenhum método:', {
          tipo_sessao_id: sessao.tipo_sessao_id,
          tipo_sessao_codigo: sessao.tipo_sessao_codigo,
          tipo_sessao_text: sessao.tipo_sessao,
          tipos_disponiveis: tiposSessao.map((t) => ({ id: t.id, codigo: t.codigo })),
        });
        // ⚠️ Tipo não encontrado — campos básicos (data, horários, instrutor, etc.) já foram preenchidos.
        //    O usuário verá o select de tipo vazio e precisará selecionar um manualmente.
      }

      // Hydration concluída
      setEditHydrating(false);
    }
  }, [isOpen, isEditMode, sessao, simuladores, aeronaves, aeronavesReais, tiposSessao]);

  function _authHeaders(): HeadersInit {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchAeronaves() {
    try {
      const res = await fetch(`${API_BASE_URL}/modelos-aeronave`, { headers: _authHeaders() });
      const data = await res.json();
      setAeronaves(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar modelos de aeronave:', error);
    }
  }

  async function fetchAeronavesReais() {
    try {
      const res = await fetch(`${API_BASE_URL}/aeronaves`, { headers: _authHeaders() });
      const data = await res.json();
      setAeronavesReais(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar aeronaves:', error);
    }
  }

  async function fetchSimuladores() {
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores`, { headers: _authHeaders() });
      const data = await res.json();
      setSimuladores(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar simuladores:', error);
    }
  }

  async function fetchTiposSessao() {
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/tipos-sessao`, {
        headers: _authHeaders(),
      });
      const data = await res.json();
      setTiposSessao(
        (data.data || []).filter(
          (tipo: TipoSessao & { deleted_at?: string | null }) => !tipo.deleted_at,
        ),
      );
    } catch (error) {
      console.error('Erro ao buscar tipos de sessão:', error);
    }
  }

  useEffect(() => {
    if (!tipoSessaoId) return;
    if (tiposSessao.some((tipo) => tipo.id === tipoSessaoId)) return;

    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setModelos([]);
    setTemaSessao('');
  }, [tipoSessaoId, tiposSessao]);

  async function fetchInstrutores() {
    try {
      const res = await fetch(`${API_BASE_URL}/funcionarios`, { headers: _authHeaders() });
      const data = await res.json();
      const todosFunc = data.data || [];
      const somenteInstrutores = todosFunc.filter(
        (f: Funcionario & { is_instrutor?: number; cargo?: string }) =>
          f.is_instrutor === 1 || f.cargo?.toLowerCase().includes('instrutor'),
      );
      setInstrutores(somenteInstrutores);
    } catch (error) {
      console.error('Erro ao buscar instrutores:', error);
    }
  }

  async function fetchFuncionarios(modeloAeronave?: string) {
    try {
      const params = new URLSearchParams({
        limit: '100',
        orderBy: 'nome',
        order: 'ASC',
      });

      if (modeloAeronave) {
        params.set('aeronave', modeloAeronave);
      }

      const res = await fetch(`${API_BASE_URL}/funcionarios?${params.toString()}`, {
        headers: _authHeaders(),
      });
      const data = await res.json();
      setFuncionarios(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar funcionários:', error);
    }
  }

  async function fetchExaminadores() {
    try {
      const token = getAccessToken();
      console.log('🔍 [MODAL] Buscando examinadores...', { token: token ? 'presente' : 'AUSENTE' });
      const res = await fetch(`${API_BASE_URL}/funcionarios?examinador=true`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      console.log('🔍 [MODAL] Response status:', res.status, res.statusText);
      const data = await res.json();
      console.log('🔍 [MODAL] Response data:', data);
      console.log('🔍 [MODAL] Examinadores encontrados:', data.data?.length || 0, data.data);
      setExaminadores(data.data || []);
    } catch (error) {
      console.error('❌ [MODAL] Erro ao buscar examinadores:', error);
    }
  }

  async function fetchTiposCheck() {
    try {
      const token = getAccessToken();
      const res = await fetch(`${API_BASE_URL}/simuladores/tipos-check`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setTiposCheck(data.data || []);
    } catch (error) {
      console.error('Erro ao buscar tipos de check:', error);
    }
  }

  async function fetchChecksPadraoModelo(modeloId: number): Promise<number[]> {
    try {
      const res = await fetch(`${API_BASE_URL}/simuladores/modelos-sessao/${modeloId}/checks`, {
        headers: _authHeaders(),
      });
      const data = await res.json();
      if (!data?.success || !Array.isArray(data?.data)) {
        return [];
      }
      return filterCompatibleChecks(data.data, aeronaveCodigo)
        .map((check: { id?: number }) => check.id)
        .filter((id: unknown): id is number => typeof id === 'number');
    } catch (error) {
      console.error('Erro ao carregar checks padrão do modelo:', error);
      return [];
    }
  }

  /**
   * Filtra a lista de tipos de check pelo modelo de aeronave da sessão.
   * Checks com sufixo "-139" → apenas AW139; "-76" → apenas SK76.
   * Checks sem sufixo de modelo (ex: FAP14) → exibidos para todos.
   */
  function filtrarChecksPorModelo(checks: typeof tiposCheck): typeof tiposCheck {
    return filterCompatibleChecks(checks, aeronaveCodigo);
  }

  // ========== FLUXO 1: SELECIONAR AERONAVE ==========
  function handleAeronaveChange(id: number, modelo: string) {
    setAeronaveId(id);
    setAeronaveCodigo(modelo);

    // Reset cascata
    setSimuladorId(null);
    setAeronaveRealId(null);
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setTemaSessao('');
    setModelos([]);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
    setParticipantes(participantesIniciais());

    // Filtrar simuladores por modelo de aeronave (com fallback legados)
    const filtrados = simuladores.filter(
      (s) =>
        s.modelo_aeronave === modelo ||
        s.aeronave_codigo === modelo ||
        s.tipo === modelo ||
        s.modelo === modelo,
    );
    setSimuladoresFiltrados(filtrados);

    // Filtrar aeronaves reais pelo modelo selecionado
    const filtradosReais = aeronavesReais.filter((a) => a.modelo === modelo);
    setAeronavesReaisFiltradas(filtradosReais);

    console.log('🔍 Filtro simuladores:', {
      modelo,
      total: simuladores.length,
      filtrados: filtrados.length,
    });
  }

  // ========== FLUXO 2b: SELECIONAR AERONAVE REAL (modo AERONAVE) ==========
  function handleAeronaveRealChange(id: number) {
    setAeronaveRealId(id);

    // Reset cascata
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setTemaSessao('');
    setModelos([]);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
  }

  function handleTipoDispositivoChange(tipo: 'SIMULADOR' | 'AERONAVE') {
    setTipoDispositivo(tipo);
    setSimuladorId(null);
    setAeronaveRealId(null);
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setTemaSessao('');
    setModelos([]);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
  }

  // ========== FLUXO 2: SELECIONAR SIMULADOR ==========
  function handleSimuladorChange(id: number) {
    setSimuladorId(id);

    // Reset cascata
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setTemaSessao('');
    setModelos([]);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
  }

  // ========== FLUXO 3: SELECIONAR TIPO DE SESSÃO ==========
  function handleTipoSessaoChange(id: number) {
    setTipoSessaoId(id);

    // Reset cascata
    setModeloSessaoId(null);
    setTemaSessao('');
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);

    // Carregar modelos filtrados
    fetchModelos(id);
  }

  function buildModelosSessaoUrl(
    tipoSessaoIdParam: number,
    codigoAeronave: string,
    tipo?: 'SIMULADOR' | 'AERONAVE',
    includeFilters = true,
  ) {
    const params = new URLSearchParams({ t: String(Date.now()) });

    if (includeFilters) {
      const tipoSessaoObj = tiposSessao.find((item) => item.id === tipoSessaoIdParam);
      params.set('tipo_sessao_id', String(tipoSessaoIdParam));
      if (tipoSessaoObj?.codigo) params.set('tipo_sessao_codigo', tipoSessaoObj.codigo);
      if (tipoSessaoObj?.nome) params.set('tipo_sessao_nome', tipoSessaoObj.nome);
      params.set('modelo_aeronave', codigoAeronave);
      if (tipo) params.set('tipo', tipo);
    }

    return `${API_BASE_URL}/simuladores/modelos-sessao?${params.toString()}`;
  }

  function filtrarModelosSessaoModal(
    modelosRecebidos: ModeloSessao[],
    tipoSessaoIdParam: number,
    codigoAeronave: string,
    tipo?: 'SIMULADOR' | 'AERONAVE',
  ) {
    return filterModelosSessaoForModal({
      modelos: modelosRecebidos,
      tipoSessao: tiposSessao.find((item) => item.id === tipoSessaoIdParam) || {
        id: tipoSessaoIdParam,
      },
      equipamento: codigoAeronave,
      tipoDispositivo: tipo || tipoDispositivo,
    });
  }

  async function carregarModelosSessao(
    tipoSessaoIdParam: number,
    codigoAeronave: string,
    origem: 'fetchModelos' | 'fetchModelosComCodigo',
    tipo?: 'SIMULADOR' | 'AERONAVE',
  ) {
    try {
      setLoadingModelos(true);
      const url = buildModelosSessaoUrl(tipoSessaoIdParam, codigoAeronave, tipo);

      console.log(`🔍 [${origem}] Buscando modelos:`, {
        tipoSessaoIdParam,
        modelo_aeronave: codigoAeronave,
        url,
      });

      const res = await fetch(url, {
        headers: _authHeaders(),
        cache: 'no-store',
      });
      const data = await res.json();

      console.log(`📦 [${origem}] Resposta recebida:`, data);

      if (data.success) {
        let modelosAtualizados = filtrarModelosSessaoModal(
          data.data || [],
          tipoSessaoIdParam,
          codigoAeronave,
          tipo,
        );

        if (modelosAtualizados.length === 0) {
          const fallbackUrl = buildModelosSessaoUrl(tipoSessaoIdParam, codigoAeronave, tipo, false);
          const fallbackRes = await fetch(fallbackUrl, {
            headers: _authHeaders(),
            cache: 'no-store',
          });
          const fallbackData = await fallbackRes.json();

          if (fallbackData.success) {
            modelosAtualizados = filtrarModelosSessaoModal(
              fallbackData.data || [],
              tipoSessaoIdParam,
              codigoAeronave,
              tipo,
            );
          }
        }

        setModelos(modelosAtualizados);

        if (
          modeloSessaoId &&
          !modelosAtualizados.some((modelo: ModeloSessao) => modelo.id === modeloSessaoId)
        ) {
          setModeloSessaoId(null);
          setTemaSessao('');
        }

        console.log(`✅ [${origem}] ${modelosAtualizados.length} modelos carregados`);
      } else {
        console.error(`❌ [${origem}] API retornou success=false`);
        setModelos([]);
      }
    } catch (error) {
      console.error(`❌ [${origem}] Erro:`, error);
      setModelos([]);
    } finally {
      setLoadingModelos(false);
    }
  }

  // ========== FLUXO 4: CARREGAR MODELOS DE SESSÃO ==========
  async function fetchModelos(tipoSessaoIdParam: number) {
    if (!aeronaveCodigo) {
      console.warn('⚠️ [fetchModelos] aeronaveCodigo vazio!');
      setModelos([]);
      return;
    }

    await carregarModelosSessao(tipoSessaoIdParam, aeronaveCodigo, 'fetchModelos', tipoDispositivo);
  }

  // ========== CARREGAR MODELOS COM CÓDIGO DIRETO (PARA MODO EDIÇÃO) ==========
  async function fetchModelosComCodigo(
    tipoSessaoIdParam: number,
    codigoAeronave: string,
    tipo?: 'SIMULADOR' | 'AERONAVE',
  ) {
    if (!codigoAeronave) {
      console.error('❌ [fetchModelosComCodigo] codigoAeronave vazio!');
      setModelos([]);
      return;
    }

    await carregarModelosSessao(tipoSessaoIdParam, codigoAeronave, 'fetchModelosComCodigo', tipo);
  }

  // ========== AUTO-SELECIONAR MODELO BASEADO NO TEMA (EDIÇÃO) ==========
  useEffect(() => {
    const resolved = resolveEditModeloSelection({
      modelos,
      modeloSessaoId,
      isEditMode,
      templateId: sessao?.template_id,
      temaSessao,
    });

    if (!resolved) {
      return;
    }

    setModeloSessaoId(resolved.id);

    if (resolved.temaSessao) {
      setTemaSessao(resolved.temaSessao);
    }

    if (resolved.source === 'tema') {
      console.log('✅ [AUTO-SELECT] Modelo selecionado automaticamente:', {
        id: resolved.id,
        nome: resolved.temaSessao,
      });
    } else {
      console.log('✅ [AUTO-SELECT] Modelo selecionado por template_id:', {
        id: resolved.id,
        nome: resolved.temaSessao,
      });
    }
  }, [modelos, temaSessao, modeloSessaoId, isEditMode, sessao?.template_id]);

  useEffect(() => {
    if (!aeronaveCodigo || checksSelecionados.length === 0 || tiposCheck.length === 0) {
      return;
    }

    const checksNormalizados = filterCompatibleCheckIds(
      checksSelecionados,
      tiposCheck,
      aeronaveCodigo,
    );

    if (checksNormalizados.length !== checksSelecionados.length) {
      setChecksSelecionados(checksNormalizados);
    }
  }, [aeronaveCodigo, checksSelecionados, tiposCheck]);

  useEffect(() => {
    if (
      !isEditMode ||
      !isOpen ||
      !modeloSessaoId ||
      !examinadorId ||
      checksSelecionados.length > 0
    ) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const checksPadrao = await fetchChecksPadraoModelo(modeloSessaoId);
      if (!cancelled && checksPadrao.length > 0) {
        setChecksSelecionados(checksPadrao);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, isOpen, modeloSessaoId, examinadorId, checksSelecionados.length]);

  // ========== FLUXO 5: SELECIONAR MODELO ==========
  async function handleModeloChange(id: string) {
    if (!id) {
      setModeloSessaoId(null);
      setTemaSessao('');
      setChecksSelecionados([]);
      setGerarFichaInstrutor(false);
      setGerarFichaExaminador(false);
      return;
    }

    const modeloId = Number(id);
    const modelo = modelos.find((m) => m.id === modeloId);

    if (modelo) {
      setModeloSessaoId(modeloId);
      setTemaSessao(modelo.nome);

      const checksPadrao = await fetchChecksPadraoModelo(modeloId);
      const nextState = applyModelChangeDefaults({
        modeloAnteriorId: modeloSessaoId,
        modeloId,
        checksPadrao,
      });

      if (nextState) {
        setChecksSelecionados(nextState.checksSelecionados);
        setGerarFichaInstrutor(nextState.gerarFichaInstrutor);
        setGerarFichaExaminador(nextState.gerarFichaExaminador);
      }
    }
  }

  // ========== PARTICIPANTES ==========
  function adicionarParticipante() {
    if (participantes.length < 2) {
      setParticipantes([...participantes, { funcionario_id: null }]);
    }
  }

  function removerParticipante(index: number) {
    setParticipantes(participantes.filter((_, i) => i !== index));
  }

  function atualizarParticipante(
    index: number,
    campo: keyof Participante,
    valor: number | string | null,
  ) {
    const novos = [...participantes];
    (novos[index][campo] as number | string | null) = valor;
    setParticipantes(novos);
  }

  // ========== VALIDAÇÃO ==========
  function validarFormulario(): string | null {
    if (!aeronaveId) return 'Selecione o equipamento';
    if (tipoDispositivo === 'SIMULADOR') {
      if (!simuladorId) return 'Selecione o simulador';
    } else {
      if (!aeronaveRealId) return 'Selecione a aeronave';
    }
    if (!tipoSessaoId) return 'Selecione o tipo de sessão';
    // Modelo só é obrigatório ao criar nova sessão
    if (!isEditMode && !modeloSessaoId) return 'Selecione um modelo de sessão cadastrado';
    if (!temaSessao.trim()) return 'Erro ao carregar tema do modelo';
    if (dataInvalida) return 'Data não existente';
    if (!data) return 'Selecione a data';
    if (!horarioInicio) return 'Informe o horário de início';
    if (!horarioFim) return 'Informe o horário de fim';
    const horarioInicioNormalizado = normalizeTimeInput(horarioInicio);
    const horarioFimNormalizado = normalizeTimeInput(horarioFim);
    if (!horarioInicioNormalizado || !horarioFimNormalizado) {
      return 'Informe horários válidos no formato HH:mm (00:00 até 23:59)';
    }
    if (!instrutorId) return 'Selecione o instrutor';

    // Se selecionou examinador, exige ao menos 1 check
    if (examinadorId && checksSelecionados.length === 0) {
      return 'Selecione pelo menos 1 check para a sessão';
    }

    // Validar pelo menos 1 participante
    const participantesValidos = participantes.filter((p) => p.funcionario_id);
    if (participantesValidos.length === 0) {
      return 'Adicione pelo menos 1 participante';
    }

    // Validar participantes duplicados
    const ids = participantesValidos.map((p) => p.funcionario_id);
    if (new Set(ids).size !== ids.length) {
      return 'Não é permitido o mesmo tripulante duas vezes';
    }

    // Validar horários: apenas garanta que não sejam iguais
    // Permite horarioInicio > horarioFim (significa que passa para próximo dia)
    if (horarioInicioNormalizado === horarioFimNormalizado) {
      return 'Horário de fim deve ser diferente do horário de início';
    }

    return null;
  }

  // ========== SUBMIT ==========
  async function handleSubmit() {
    const erro = validarFormulario();
    if (erro) {
      toast.error(erro);
      return;
    }

    if (isEditMode) {
      const confirmado = await confirmDialog(
        'Ao salvar a sessão novamente, todas as fichas vinculadas voltarão para o início do fluxo. As avaliações, notas e assinaturas atuais serão limpas e o status retornará para "Avaliar tripulante". Deseja continuar?',
        {
          title: 'Confirmar regravação da sessão',
          confirmText: 'Salvar e resetar fichas',
          cancelText: 'Cancelar',
        },
      );

      if (!confirmado) {
        return;
      }
    }

    setLoading(true);

    try {
      const horarioInicioNormalizado = normalizeTimeInput(horarioInicio);
      const horarioFimNormalizado = normalizeTimeInput(horarioFim);
      if (!horarioInicioNormalizado || !horarioFimNormalizado) {
        throw new Error('Horários inválidos. Informe HH:mm.');
      }
      const [hIni, mIni] = horarioInicioNormalizado.split(':').map(Number);
      const [hFim, mFim] = horarioFimNormalizado.split(':').map(Number);
      let duracaoMinutos = hFim * 60 + mFim - (hIni * 60 + mIni);
      // Se duração é negativa, significa que passou para o dia seguinte
      if (duracaoMinutos < 0) {
        duracaoMinutos += 24 * 60; // Adiciona 24 horas
      }

      const tipoSessaoObj = tiposSessao.find((t) => t.id === tipoSessaoId);

      console.log('💾 [SUBMIT] Preparando payload:', {
        tipoSessaoId,
        tipoSessaoObj,
        modeloSessaoId,
        temaSessao,
        aeronaveCodigo,
      });

      const payload = {
        tipo_dispositivo: tipoDispositivo,
        simulador_id: tipoDispositivo === 'SIMULADOR' ? simuladorId : null,
        aeronave_id: tipoDispositivo === 'AERONAVE' ? aeronaveRealId : null,
        modelo_sessao_id: modeloSessaoId,
        data: data,
        horario_inicio: horarioInicioNormalizado,
        horario_fim: horarioFimNormalizado,
        duracao_minutos: duracaoMinutos,
        instrutor_id: instrutorId,
        tipo_sessao: tipoSessaoObj?.codigo || 'TREINAMENTO',
        tipo_aeronave: aeronaveCodigo,
        tema_sessao: temaSessao,
        observacoes: observacoes || null,
        participantes: participantes
          .filter((p) => p.funcionario_id)
          .map((p, index) => ({
            funcionario_id: p.funcionario_id,
            funcao: getFuncaoParticipante(index),
          })),
        ...(examinadorId
          ? {
              examinador_id: examinadorId,
              checks: checksSelecionados,
            }
          : {
              examinador_id: null,
              checks: [],
            }),
        // Fichas especiais: flags independentes (também auto-setados por FAP07/FAP13)
        gerar_ficha_instrutor: gerarFichaInstrutorEfetivo,
        gerar_ficha_examinador: gerarFichaExaminadorEfetivo,
        ...(isEditMode ? { resetar_fluxo_fichas: true } : {}),
      };

      console.log('💾 [SUBMIT] Payload completo:', payload);

      // Se for edição, usar PUT, senão POST
      const url = isEditMode
        ? `${API_BASE_URL}/simuladores/sessoes/${sessao!.id}`
        : `${API_BASE_URL}/simuladores/sessoes`;

      const method = isEditMode ? 'PUT' : 'POST';

      console.log(`💾 [SUBMIT] Enviando ${method} para:`, url);

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => null);
        if (error?.code === 'SCHEDULE_CONFLICT') {
          setConflitoModal({
            isOpen: true,
            message:
              error?.error ||
              'Conflito de agendamento detectado. Já existe uma sessão neste horário. Escolha outro horário.',
          });
          return;
        }
        throw new Error(error?.error || `Erro ao ${isEditMode ? 'atualizar' : 'criar'} sessão`);
      }

      const responseData = await res.json();

      console.log('✅ [RESPOSTA] Dados salvos no servidor:', {
        tipo_sessao: responseData.data?.tipo_sessao,
        nome: responseData.data?.nome,
      });

      if (responseData.success) {
        toast.success(sessao ? 'Sessão atualizada com sucesso!' : 'Sessão criada com sucesso!');
        emitirEventoModulo({
          modulo: 'simuladores',
          tipo: 'SIMULADOR_ATUALIZADO',
          funcionarioIds: payload.participantes.map((participante) => participante.funcionario_id),
        });

        // Aguardar para garantir que o servidor processou
        await new Promise((resolve) => setTimeout(resolve, 500));

        onSuccess();
      } else {
        throw new Error(responseData.error || 'Erro ao processar sessão');
      }

      onClose();
      resetForm();
    } catch (error) {
      console.error('Erro ao criar sessão:', error);
      const message = error instanceof Error ? error.message : 'Erro ao criar sessão';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setTipoDispositivo('SIMULADOR');
    setAeronaveId(null);
    setAeronaveCodigo('');
    setSimuladorId(null);
    setAeronaveRealId(null);
    setAeronavesReaisFiltradas([]);
    setSimuladoresFiltrados([]);
    setTipoSessaoId(null);
    setModeloSessaoId(null);
    setModelos([]);
    setTemaSessao('');
    setData('');
    setDataInvalida(false);
    setHorarioInicio('');
    setHorarioFim('');
    setInstrutorId(null);
    setExaminadorId(null);
    setChecksSelecionados([]);
    setGerarFichaInstrutor(false);
    setGerarFichaExaminador(false);
    setObservacoes('');
    setParticipantes(participantesIniciais());
  }

  // ========== AÇÕES EXTRAS (EMAIL, WHATSAPP, DELETE, FICHAS) ==========
  async function handleEnviarEmail() {
    if (!sessao) return;

    try {
      setSendingChannel('email');
      const alertas = await enviarNotificacaoSessao(sessao.id, {
        enviarEmail: true,
        enviarWhatsApp: false,
      });
      const resumo = montarResumoCanal('email', alertas);
      if (resumo.tipo === 'success') toast.success(resumo.mensagem);
      if (resumo.tipo === 'warning') toast.warning(resumo.mensagem);
      if (resumo.tipo === 'error') toast.error(resumo.mensagem);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao enviar notificação por e-mail';
      toast.error(message);
    } finally {
      setSendingChannel(null);
    }
  }

  async function handleEnviarWhatsApp() {
    if (!sessao) return;

    try {
      setSendingChannel('whatsapp');
      const alertas = await enviarNotificacaoSessao(sessao.id, {
        enviarEmail: false,
        enviarWhatsApp: true,
      });
      const resumo = montarResumoCanal('whatsapp', alertas);
      if (resumo.tipo === 'success') toast.success(resumo.mensagem);
      if (resumo.tipo === 'warning') toast.warning(resumo.mensagem);
      if (resumo.tipo === 'error') toast.error(resumo.mensagem);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Erro ao enviar notificação por WhatsApp';
      toast.error(message);
    } finally {
      setSendingChannel(null);
    }
  }

  function handleDelete() {
    if (!sessao?.id) return;
    setShowDeleteModal(true);
  }

  function handleConfirmDelete() {
    if (!sessao?.id) return;
    onDelete?.(sessao.id);
    setShowDeleteModal(false);
    onClose();
    resetForm();
  }

  function handleVerFichas() {
    if (!sessao?.id) return;
    onVerFichas?.(sessao.id);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-modal p-4">
      <AlertModal
        isOpen={conflitoModal.isOpen}
        onClose={() => setConflitoModal({ isOpen: false, message: '' })}
        title="Conflito de Agendamento"
        message={conflitoModal.message}
        confirmText="Entendi"
        backdrop={false}
      />
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto mx-2 sm:mx-0">
        {/* ========== HEADER ========== */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isEditMode ? 'Editar Sessão de Treinamento' : 'Nova Sessão de Treinamento'}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {isEditMode
                ? 'Atualize os dados da sessão de treinamento'
                : 'Configure a sessão e as manobras serão carregadas automaticamente'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition"
            disabled={loading}
          >
            <X size={20} />
          </button>
        </div>

        {/* ========== FORM ========== */}
        <div className="p-4 sm:p-6 space-y-6">
          {/* 0️⃣ TIPO DE DISPOSITIVO */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Tipo de Sessão de Voo <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleTipoDispositivoChange('SIMULADOR')}
                disabled={loading}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
                  tipoDispositivo === 'SIMULADOR'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                🖥️ Simulador
              </button>
              <button
                type="button"
                onClick={() => handleTipoDispositivoChange('AERONAVE')}
                disabled={loading}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
                  tipoDispositivo === 'AERONAVE'
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                ✈️ Aeronave Real
              </button>
            </div>
          </div>

          {/* 1️⃣ EQUIPAMENTO */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              1. Equipamento <span className="text-red-500">*</span>
            </label>
            <select
              value={aeronaveId || ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                const aeronave = aeronaves.find((a) => a.id === id);
                if (aeronave) handleAeronaveChange(id, aeronave.modelo);
              }}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
              disabled={loading}
            >
              <option value="">Selecione o equipamento</option>
              {aeronaves.map((aer) => (
                <option key={aer.id} value={aer.id}>
                  {aer.modelo} {aer.fabricante ? `(${aer.fabricante})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 2️⃣ SIMULADOR ou AERONAVE REAL */}
          {tipoDispositivo === 'SIMULADOR' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                2. Simulador <span className="text-red-500">*</span>
              </label>
              <select
                value={simuladorId || ''}
                onChange={(e) => handleSimuladorChange(Number(e.target.value))}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading || !aeronaveId}
              >
                <option value="">
                  {aeronaveId ? 'Selecione o simulador' : 'Selecione o equipamento primeiro'}
                </option>
                {simuladoresFiltrados.map((sim) => (
                  <option key={sim.id} value={sim.id}>
                    {sim.nome} - {sim.modelo}
                  </option>
                ))}
              </select>
              {aeronaveId && simuladoresFiltrados.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Nenhum simulador disponível para este equipamento
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                2. Aeronave <span className="text-red-500">*</span>
              </label>
              <select
                value={aeronaveRealId || ''}
                onChange={(e) => handleAeronaveRealChange(Number(e.target.value))}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading || !aeronaveId}
              >
                <option value="">
                  {aeronaveId ? 'Selecione a aeronave' : 'Selecione o equipamento primeiro'}
                </option>
                {aeronavesReaisFiltradas.map((aer) => (
                  <option key={aer.id} value={aer.id}>
                    {aer.prefixo} — {aer.modelo}
                  </option>
                ))}
              </select>
              {aeronaveId && aeronavesReaisFiltradas.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠️ Nenhuma aeronave cadastrada para este modelo
                </p>
              )}
            </div>
          )}

          {/* 3️⃣ TIPO DE SESSÃO */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              3. Tipo de Sessão <span className="text-red-500">*</span>
            </label>
            <select
              value={tipoSessaoId || ''}
              onChange={(e) => handleTipoSessaoChange(Number(e.target.value))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
              disabled={
                loading ||
                (tipoDispositivo === 'SIMULADOR' ? !simuladorId : !aeronaveRealId)
              }
            >
              <option value="">
                {tipoDispositivo === 'SIMULADOR'
                  ? simuladorId
                    ? 'Selecione o tipo de sessão'
                    : 'Selecione o simulador primeiro'
                  : aeronaveRealId
                    ? 'Selecione o tipo de sessão'
                    : 'Selecione a aeronave primeiro'}
              </option>
              {tiposSessao.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.codigo} - {tipo.nome}
                </option>
              ))}
            </select>
          </div>

          {/* 4️⃣ TEMA DA SESSÃO - SELECIONAR MODELO */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              4. Tema da Sessão <span className="text-red-500">*</span>
            </label>

            {loadingModelos || editHydrating ? (
              <div className="w-full px-4 py-3 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 text-sm">
                🔄 {editHydrating ? 'Carregando dados da sessão...' : 'Carregando modelos disponíveis...'}
              </div>
            ) : modelos.length > 0 ? (
              // Dropdown com modelos disponíveis
              <select
                value={modeloSessaoId || ''}
                onChange={(e) => handleModeloChange(e.target.value)}
                onFocus={() => {
                  if (tipoSessaoId && aeronaveCodigo) {
                    void fetchModelosComCodigo(tipoSessaoId, aeronaveCodigo);
                  }
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading}
              >
                <option value="">Selecione um modelo de sessão</option>
                {modelos.map((modelo) => (
                  <option key={modelo.id} value={modelo.id}>
                    {modelo.codigo} - {modelo.nome}
                  </option>
                ))}
              </select>
            ) : (
              // Mensagem quando não há modelos (mas apenas se tipo + aeronave já estão selecionados)
              <div className="w-full px-4 py-3 border border-amber-300 rounded-lg bg-amber-50 text-amber-700 text-sm">
                {tipoSessaoId
                  ? '⚠️ Nenhum modelo cadastrado para esta combinação. Cadastre um modelo primeiro em '
                  : 'Selecione o tipo de sessão e equipamento para carregar os modelos disponíveis.'}
                {tipoSessaoId && <strong>Gestão → Modelos de Sessão</strong>}
              </div>
            )}
          </div>

          {/* 4. DATA E HORÁRIOS */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Data <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={data}
                onChange={(e) => {
                  if (e.target.value === '' && e.target.validity.badInput) {
                    setDataInvalida(true);
                    setData('');
                  } else {
                    setDataInvalida(false);
                    setData(e.target.value);
                  }
                }}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary ${
                  dataInvalida ? 'border-red-400 bg-red-50' : 'border-slate-300'
                }`}
                disabled={loading}
              />
              {dataInvalida && <p className="text-xs text-red-600 mt-1">⚠️ Data não existente</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Horário Início <span className="text-red-500">*</span>
              </label>
              <TimeInput
                value={horarioInicio}
                onChange={(v) => {
                  setHorarioInicio(v);
                  if (!horarioFimFoiEditado) {
                    const autoFim = addMinutesToTimeHHMM(v, 120);
                    if (autoFim) setHorarioFim(autoFim);
                  }
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Horário Fim <span className="text-red-500">*</span>
              </label>
              <TimeInput
                value={horarioFim}
                onChange={(v) => {
                  setHorarioFim(v);
                  setHorarioFimFoiEditado(!!v);
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading}
              />
            </div>
          </div>

          {/* 5. INSTRUTOR */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Instrutor <span className="text-red-500">*</span>
            </label>
            <select
              value={instrutorId || ''}
              onChange={(e) => setInstrutorId(Number(e.target.value))}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
              disabled={loading}
            >
              <option value="">Selecione o instrutor</option>
              {instrutores.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.nome} ({inst.matricula})
                </option>
              ))}
            </select>
            {instrutores.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                ⚠️ Nenhum instrutor encontrado. Configure instrutores em Configurações.
              </p>
            )}
          </div>

          {/* 5.1 EXAMINADOR (OPCIONAL) + CHECKS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Examinador (opcional)
              </label>
              <select
                value={examinadorId || ''}
                onChange={(e) => {
                  const v = e.target.value ? Number(e.target.value) : null;
                  setExaminadorId(v);
                  // Reset checks se remover examinador
                  if (!v) setChecksSelecionados([]);
                }}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary"
                disabled={loading}
              >
                <option value="">Sem examinador</option>
                {examinadores.map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.nome} ({exam.matricula})
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Ao selecionar examinador, esta sessão passa a ser um check.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Checks vinculados
              </label>
              <div
                className={`w-full px-4 py-3 border rounded-lg text-sm ${
                  examinadorId
                    ? 'border-slate-300 bg-white'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
                }`}
              >
                {!examinadorId ? (
                  <span>Selecione um examinador para habilitar</span>
                ) : tiposCheck.length === 0 ? (
                  <span>Nenhum tipo de check disponível</span>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {filtrarChecksPorModelo(tiposCheck).map((check) => (
                      <label key={check.id} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checksSelecionados.includes(check.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setChecksSelecionados([...checksSelecionados, check.id]);
                            } else {
                              setChecksSelecionados(
                                checksSelecionados.filter((id) => id !== check.id),
                              );
                            }
                          }}
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-primary/30 focus:ring-1"
                        />
                        <span className="leading-5">
                          <strong>{check.codigo}</strong> — {check.nome}
                          {check.descricao ? (
                            <span className="block text-xs text-slate-500">{check.descricao}</span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              {examinadorId && checksSelecionados.length === 0 && (
                <p className="text-xs text-amber-700 mt-1">
                  ⚠️ Se há examinador, selecione ao menos 1 check.
                </p>
              )}
            </div>
          </div>

          {/* 5b. FICHAS ESPECIAIS (Instrutor / Examinador) — visível quando há examinador */}
          {examinadorId && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-800 mb-2 uppercase tracking-wide">
                Fichas adicionais para esta sessão
              </p>
              <p className="text-xs text-blue-700 mb-3">
                Marcando abaixo, uma ficha extra será criada tendo o <strong>instrutor</strong> da
                sessão como avaliado.
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gerarFichaInstrutorEfetivo}
                    onChange={(e) => setGerarFichaInstrutor(e.target.checked)}
                    disabled={hasFap07Selecionada}
                    className="h-4 w-4 rounded border-blue-400 text-blue-600 focus:ring-primary/30"
                  />
                  <span className="text-sm text-blue-900">
                    <strong>Treinamento de Instrutor de Voo</strong>
                    <span className="block text-xs text-blue-600">
                      Gera ficha modelo "TREINAMENTO DE INSTRUTOR DE VOO" — auto-ativado com FAP 07
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={gerarFichaExaminadorEfetivo}
                    onChange={(e) => setGerarFichaExaminador(e.target.checked)}
                    disabled={hasFap13Selecionada}
                    className="h-4 w-4 rounded border-blue-400 text-blue-600 focus:ring-primary/30"
                  />
                  <span className="text-sm text-blue-900">
                    <strong>Credenciamento de Examinador</strong>
                    <span className="block text-xs text-blue-600">
                      Gera ficha modelo "CREDENCIAMENTO DE EXAMINADOR" — auto-ativado com FAP 13
                    </span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* 6. PARTICIPANTES */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-700">
                Participantes da Sessão <span className="text-red-500">*</span>
              </label>
              {participantes.length < 2 && (
                <button
                  type="button"
                  onClick={adicionarParticipante}
                  disabled={loading}
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium"
                >
                  <Plus size={16} />
                  Adicionar Participante
                </button>
              )}
            </div>

            <div className="space-y-3">
              {participantes.map((part, index) => (
                <div key={index} className="flex items-end gap-3 p-4 bg-slate-50 rounded-lg">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Tripulante {index + 1}
                    </label>
                    <select
                      value={part.funcionario_id || ''}
                      onChange={(e) =>
                        atualizarParticipante(
                          index,
                          'funcionario_id',
                          e.target.value ? Number(e.target.value) : null,
                        )
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      disabled={loading || !aeronaveId}
                    >
                      <option value="">
                        {aeronaveId ? 'Selecione o tripulante...' : 'Selecione o equipamento primeiro'}
                      </option>
                      {funcionarios.map((func) => (
                        <option key={func.id} value={func.id}>
                          {func.nome} ({func.matricula})
                        </option>
                      ))}
                    </select>
                  </div>

                  {participantes.length > 1 && (
                    <button
                      onClick={() => removerParticipante(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
                      disabled={loading}
                      title="Remover participante"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-slate-500 mt-2">
              Ao escolher a aeronave, a lista mostra apenas os tripulantes cadastrados para ela.
            </p>
          </div>

          {/* 7. OBSERVAÇÕES (OPCIONAL) */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Observações (opcional)
            </label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Informações adicionais sobre a sessão..."
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary resize-none"
              rows={3}
              disabled={loading}
            />
          </div>
        </div>

        {/* ========== FOOTER ========== */}
        <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center gap-2">
          {isEditMode && (
            <>
              <button
                onClick={handleEnviarEmail}
                disabled={loading || sendingChannel !== null}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-emerald-700 bg-white border border-slate-200 hover:bg-emerald-50 rounded-lg transition disabled:opacity-50"
              >
                <Mail size={14} />
                {sendingChannel === 'email' ? 'Enviando...' : 'Email'}
              </button>
              <button
                onClick={handleEnviarWhatsApp}
                disabled={loading || sendingChannel !== null}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 bg-white border border-slate-200 hover:bg-green-50 rounded-lg transition disabled:opacity-50"
              >
                <MessageCircle size={14} />
                {sendingChannel === 'whatsapp' ? 'Enviando...' : 'WhatsApp'}
              </button>
              <button
                onClick={handleVerFichas}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-white border border-slate-200 hover:bg-blue-50 rounded-lg transition disabled:opacity-50"
              >
                <FileText size={14} />
                Fichas
                {sessao?.fichas && sessao.fichas.length > 0 ? ` (${sessao.fichas.length})` : ''}
              </button>
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
              >
                <Trash2 size={14} />
                Excluir
              </button>
            </>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-lg transition disabled:opacity-50"
          >
            {loading
              ? isEditMode
                ? 'Atualizando...'
                : 'Criando sessão...'
              : isEditMode
                ? 'Salvar Alterações'
                : 'Criar Sessão'}
          </button>
        </div>
      </div>

      {/* Modal de confirmação de exclusão */}
      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        title="Excluir Sessão"
        message="Tem certeza que deseja excluir esta sessão de treinamento? Esta ação não pode ser desfeita."
      />
    </div>
  );
}
