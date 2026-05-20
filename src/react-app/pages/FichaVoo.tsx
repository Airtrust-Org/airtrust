/**
 * PÁGINA: Ficha de Treinamento de Voo
 * Layout completo com 22 manobras em 2 colunas
 * Inclui: Botões de ação + Modal de Avaliação + Modal de Assinatura
 * Data: 03/12/2025
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { logger } from '@/react-app/utils/logger';
import {
  ArrowLeft,
  FileText,
  Download,
  CheckCircle,
  AlertCircle,
  Plane,
  Eye,
  Edit,
  PenTool,
  FolderOpen,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import ModalAvaliarFicha from '@/react-app/components/modals/ModalAvaliarFicha';
import AssinaturaModal from '@/react-app/components/AssinaturaModal';
import type { FichaPDFData } from '@/react-app/services/pdf-ficha-client';
import { openPreviewWindow } from '@/react-app/utils/pdfPreview';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';

interface Manobra {
  id: number;
  ordem: number;
  codigo: string;
  descricao: string;
  categoria: string;
  resultado: number | null;
  observacoes: string;
}

interface Ficha {
  id: number;
  sessao_titulo: string;
  tripulante_nome: string;
  tripulante_codigo_anac: string;
  tripulante_funcao: string;
  instrutor_nome: string;
  instrutor_codigo_anac: string;
  data: string;
  horario_inicio: string;
  horario_fim: string;
  simulador: string;
  carga_horaria_total: number;
  carga_horaria_pf: string;
  carga_horaria_pm: string;
  status: 'AVALIACAO_PENDENTE' | 'AGUARDANDO_ASSINATURAS' | 'CONCLUIDA';
  observacoes_gerais: string;
  assinatura_aluno_timestamp: string | null;
  assinatura_instrutor_timestamp: string | null;
  assinatura_aluno_imagem?: string | null;
  assinatura_instrutor_imagem?: string | null;
  manobras: Manobra[];
  colaborador_id_aluno?: number;
}

export default function FichaVoo() {
  const { id: fichaId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalAvaliar, setModalAvaliar] = useState(false);
  const [modalAssinatura, setModalAssinatura] = useState<{
    isOpen: boolean;
    papel: 'INSTRUTOR' | 'TRIPULANTE';
  }>({ isOpen: false, papel: 'TRIPULANTE' });

  const API_URL = API_BASE_URL;
  const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');

  useEffect(() => {
    logger.info('[FichaVoo] fichaId:', fichaId);
    if (!fichaId) {
      console.error('❌ [FichaVoo] fichaId está undefined!');
      toast.error('ID da ficha não encontrado');
      return;
    }
    fetchFicha();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaId]);

  async function fetchFicha() {
    try {
      setLoading(true);
      logger.info('[FichaVoo] Buscando ficha:', `${API_URL}/simuladores/fichas/${fichaId}`);

      // Cache-busting: timestamp + headers
      const res = await fetch(
        `${API_URL}/simuladores/fichas/${fichaId}?t=${new Date().getTime()}`,
        {
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        },
      );
      const data = await res.json();

      if (data.success) {
        setFicha(data.data);
      } else {
        toast.error('Erro ao carregar ficha');
      }
    } catch (error) {
      console.error('Erro ao buscar ficha:', error);
      toast.error('Erro ao carregar ficha');
    } finally {
      setLoading(false);
    }
  }

  // ========== FUNÇÕES DE FORMATAÇÃO ==========
  function getScoreColor(score: number | null | string): string {
    // Handle null, undefined, or non-numeric values
    if (score === null || score === undefined) return 'bg-slate-300 text-slate-600';
    const numScore = typeof score === 'number' ? score : parseFloat(String(score));
    if (isNaN(numScore)) return 'bg-slate-300 text-slate-600';
    if (numScore >= 8) return 'bg-green-500 text-white';
    if (numScore >= 6) return 'bg-yellow-500 text-white';
    return 'bg-red-500 text-white';
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'AVALIACAO_PENDENTE':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'AGUARDANDO_ASSINATURAS':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'CONCLUIDA':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  }

  function getStatusLabel(status: string): string {
    switch (status) {
      case 'AVALIACAO_PENDENTE':
        return 'AVALIAÇÃO PENDENTE';
      case 'AGUARDANDO_ASSINATURAS':
        return 'AGUARDANDO ASSINATURAS';
      case 'CONCLUIDA':
        return 'CONCLUÍDA';
      default:
        return status;
    }
  }

  function formatData(data: string): string {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  }

  function formatTimestamp(timestamp: string | null): string {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  // ========== HANDLERS DE AÇÕES ==========
  const handleAvaliar = () => {
    logger.info('[DEBUG] handleAvaliar CHAMADO!', { status: ficha?.status });
    if (ficha?.status === 'CONCLUIDA') {
      toast.warning('Esta ficha já foi finalizada e não pode mais ser editada');
      return;
    }
    logger.info('[DEBUG] Abrindo modal...');
    setModalAvaliar(true);
  };

  const handleAssinarTripulante = () => {
    if (ficha?.status === 'AVALIACAO_PENDENTE') {
      toast.warning('A ficha precisa ser avaliada pelo instrutor antes da assinatura');
      return;
    }
    if (ficha?.assinatura_aluno_timestamp) {
      toast.info('O tripulante já assinou esta ficha');
      return;
    }
    setModalAssinatura({ isOpen: true, papel: 'TRIPULANTE' });
  };

  const handleAssinarInstrutor = () => {
    if (ficha?.status === 'AVALIACAO_PENDENTE') {
      toast.warning('A ficha precisa ser avaliada antes da assinatura');
      return;
    }
    if (!ficha?.assinatura_aluno_timestamp) {
      toast.warning('O tripulante precisa assinar primeiro');
      return;
    }
    if (ficha?.assinatura_instrutor_timestamp) {
      toast.info('O instrutor já assinou esta ficha');
      return;
    }
    setModalAssinatura({ isOpen: true, papel: 'INSTRUTOR' });
  };

  const handleSalvarAssinatura = async (aprovadoInstrutor?: boolean) => {
    try {
      // Backend espera 'tipo' com valores 'ALUNO' ou 'INSTRUTOR'
      const tipo = modalAssinatura.papel === 'TRIPULANTE' ? 'ALUNO' : 'INSTRUTOR';

      const payload: any = { tipo };

      // Se for assinatura de instrutor, deve incluir aprovado
      if (tipo === 'INSTRUTOR') {
        if (aprovadoInstrutor === undefined) {
          toast.error('Instrutor deve indicar se aprova ou não o tripulante');
          return;
        }
        payload.aprovado = aprovadoInstrutor;
      }

      const response = await fetch(`${API_URL}/simuladores/fichas/${fichaId}/assinar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Assinatura registrada com sucesso!');
        setModalAssinatura({ isOpen: false, papel: 'TRIPULANTE' });

        // Aguardar processamento do servidor
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchFicha();
      } else {
        toast.error(result.error || 'Erro ao registrar assinatura');
      }
    } catch (error) {
      console.error('Erro ao salvar assinatura:', error);
      toast.error('Erro ao registrar assinatura');
    }
  };

  // Função auxiliar para calcular carga horária em horas
  function calcularCargaHoraria(horarioInicio: string, horarioFim: string): number {
    try {
      const [horaIni, minIni] = horarioInicio.split(':').map(Number);
      const [horaFim, minFim] = horarioFim.split(':').map(Number);

      const inicioMinutos = horaIni * 60 + minIni;
      const fimMinutos = horaFim * 60 + minFim;

      // Se fim < inicio, assume que passou da meia-noite
      const diffMinutos =
        fimMinutos >= inicioMinutos
          ? fimMinutos - inicioMinutos
          : 24 * 60 - inicioMinutos + fimMinutos;

      return diffMinutos / 60; // retorna em horas
    } catch {
      return 0;
    }
  }

  async function handleGerarPDF() {
    if (!ficha || !['CONCLUIDA', 'APROVADO', 'NAO_APROVADO'].includes(ficha.status)) {
      toast.error('Ficha precisa estar totalmente assinada para gerar PDF');
      return;
    }

    const pw = openPreviewWindow();
    try {
      toast.info('Gerando PDF da ficha...');

      // Buscar logo da empresa (Forçando Costa do Sol - ID 6 conforme solicitado)
      let logoUrl: string | undefined;
      try {
        const token = getAccessToken();

        // Tentar buscar empresa específica (ID 6 - Costa do Sol)
        // Se falhar (ex: sem permissão), tenta /minha
        let empresaData;
        try {
          const empresaRes = await fetch(`${API_URL}/empresas/6`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (empresaRes.ok) {
            empresaData = await empresaRes.json();
          }
        } catch (e) {
          logger.warn('Falha ao buscar empresa 6, tentando /minha', e);
        }

        if (!empresaData) {
          const empresaRes = await fetch(`${API_URL}/empresas/minha`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          empresaData = await empresaRes.json();
        }

        if (empresaData.success && empresaData.data?.logo_url) {
          // Se a URL for relativa (começa com /api), adicionar o domínio base
          if (empresaData.data.logo_url.startsWith('/api')) {
            logoUrl = `${API_ORIGIN}${empresaData.data.logo_url}`;
          } else {
            logoUrl = empresaData.data.logo_url;
          }
          logger.info('Logo URL resolvida:', logoUrl);
        }
      } catch (e) {
        logger.warn('Não foi possível carregar logo da empresa:', e);
      }

      // Calcular carga horária total e PF/PM
      const cargaHorariaTotal = calcularCargaHoraria(ficha.horario_inicio, ficha.horario_fim);
      const cargaPF = cargaHorariaTotal / 2;
      const cargaPM = cargaHorariaTotal / 2;

      // Formatar para exibição
      const formatarHoras = (h: number) => {
        if (h === Math.floor(h)) return `${h}`;
        return h.toFixed(1).replace('.', ',');
      };

      const cargaHorariaTotalStr = `${formatarHoras(cargaHorariaTotal)} h (PF: ${formatarHoras(
        cargaPF,
      )} h / PM: ${formatarHoras(cargaPM)} h)`;

      // Preparar dados para o PDF
      const dadosPDF: FichaPDFData = {
        fichaId: fichaId || '0',
        sessao_titulo: ficha.sessao_titulo || 'Sessão de Treinamento',
        tripulante_nome: ficha.tripulante_nome,
        tripulante_codigo_anac: ficha.tripulante_codigo_anac,
        tripulante_funcao: ficha.tripulante_funcao,
        instrutor_nome: ficha.instrutor_nome,
        instrutor_codigo_anac: ficha.instrutor_codigo_anac,
        data: ficha.data,
        horario_inicio: ficha.horario_inicio,
        horario_fim: ficha.horario_fim,
        simulador: ficha.simulador,
        carga_horaria_total: cargaHorariaTotalStr,
        carga_horaria_pf: formatarHoras(cargaPF),
        carga_horaria_pm: formatarHoras(cargaPM),
        status: ficha.status,
        observacoes_gerais: ficha.observacoes_gerais,
        assinatura_aluno_timestamp: ficha.assinatura_aluno_timestamp,
        assinatura_instrutor_timestamp: ficha.assinatura_instrutor_timestamp,
        assinatura_aluno_dataUrl: ficha.assinatura_aluno_imagem,
        assinatura_instrutor_dataUrl: ficha.assinatura_instrutor_imagem,
        logoUrl: logoUrl,
        manobras: ficha.manobras.map((m) => ({
          ordem: m.ordem,
          descricao: m.descricao,
          codigo: m.codigo,
          resultado: m.resultado,
        })),
      };

      // Gerar PDF no cliente (agora assíncrono)
      const { gerarPDFFichaCliente } = await import('@/react-app/services/pdf-ficha-client');
      await gerarPDFFichaCliente(dadosPDF, { previewWindow: pw });

      toast.success('PDF gerado com sucesso! ✅');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar PDF');
    }
  }

  async function handleArquivar() {
    if (!ficha || !['CONCLUIDA', 'APROVADO', 'NAO_APROVADO'].includes(ficha.status)) {
      toast.error('Ficha precisa estar totalmente assinada para arquivar');
      return;
    }

    if (!(await confirmDialog('Deseja arquivar esta ficha na Pasta Virtual do tripulante?'))) {
      return;
    }

    try {
      toast.info('Arquivando ficha...');

      const response = await fetch(`${API_URL}/simuladores/fichas/${fichaId}/arquivar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Ficha arquivada: ${result.data.nome_arquivo}`);
      } else {
        toast.error(result.error || 'Erro ao arquivar ficha');
      }
    } catch (error) {
      console.error('Erro ao arquivar ficha:', error);
      toast.error('Erro ao arquivar ficha');
    }
  }

  function handleVerDesempenho() {
    if (!ficha?.colaborador_id_aluno) {
      toast.error('ID do funcionário não disponível');
      return;
    }
    navigate(`/simuladores/desempenho/${ficha.colaborador_id_aluno}`);
  }

  // ========== LOADING ==========
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!ficha) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">Ficha não encontrada</p>
          <button
            onClick={() => navigate('/simuladores')}
            className="mt-4 text-blue-600 hover:underline"
          >
            Voltar aos Simuladores
          </button>
        </div>
      </div>
    );
  }

  // ========== DIVIDIR MANOBRAS EM 2 COLUNAS ==========
  const manobrasEsquerda = ficha.manobras.filter((m) => m.ordem >= 1 && m.ordem <= 11);
  const manobrasDireita = ficha.manobras.filter((m) => m.ordem >= 12 && m.ordem <= 22);

  // ========== RENDER ==========
  return (
    <div className="min-h-screen bg-slate-50">
      {/* ===== HEADER FIXO ===== */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            {/* Botão Voltar + Logo */}
            <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition flex-shrink-0"
              >
                <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
                <span className="font-medium text-sm sm:text-base">Voltar</span>
              </button>

              <div className="flex items-center gap-2 sm:gap-3">
                <FileText size={20} className="text-blue-600 sm:w-6 sm:h-6" />
                <div>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900">
                    Ficha de Treinamento de Voo
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-600">Sessão: {ficha.sessao_titulo}</p>
                </div>
              </div>
            </div>

            {/* Badge Status */}
            <div
              className={`px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs font-bold border uppercase tracking-wide ${getStatusColor(
                ficha.status,
              )}`}
            >
              {getStatusLabel(ficha.status)}
            </div>
          </div>
        </div>
      </div>

      {/* ===== CONTEÚDO PRINCIPAL ===== */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {/* ===== DADOS DA SESSÃO ===== */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* COLUNA 1: Tripulante */}
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1 uppercase">Tripulante:</p>
              <p className="text-sm font-bold text-slate-900">{ficha.tripulante_nome}</p>
              <p className="text-xs text-slate-600 mt-1">
                Código ANAC: {ficha.tripulante_codigo_anac}
              </p>
            </div>

            {/* COLUNA 2: Função */}
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1 uppercase">Função:</p>
              <span
                className={`inline-block px-3 py-1 rounded text-xs font-bold uppercase ${
                  ficha.tripulante_funcao === 'PIC'
                    ? 'bg-blue-500 text-white'
                    : 'bg-orange-500 text-white'
                }`}
              >
                {ficha.tripulante_funcao === 'PIC'
                  ? 'PIC'
                  : ficha.tripulante_funcao === 'SIC'
                    ? 'SIC'
                    : ficha.tripulante_funcao}
              </span>
            </div>

            {/* COLUNA 3: Instrutor */}
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1 uppercase">Instrutor:</p>
              <p className="text-sm font-bold text-slate-900">{ficha.instrutor_nome}</p>
              <p className="text-xs text-slate-600 mt-1">
                Código ANAC: {ficha.instrutor_codigo_anac}
              </p>
            </div>
          </div>

          {/* Linha 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-100">
            {/* Data */}
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1 uppercase">Data:</p>
              <p className="text-sm font-semibold text-slate-900">{formatData(ficha.data)}</p>
            </div>

            {/* Horários */}
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1 uppercase">Horários:</p>
              <p className="text-xs sm:text-sm text-slate-900">
                Início: <span className="font-semibold">{ficha.horario_inicio}</span> / Fim:{' '}
                <span className="font-semibold">{ficha.horario_fim}</span>
              </p>
            </div>

            {/* Simulador */}
            <div>
              <p className="text-xs text-slate-500 font-medium mb-1 uppercase">Simulador:</p>
              <div className="flex items-center gap-2">
                <Plane size={16} className="text-blue-600" />
                <p className="text-sm font-semibold text-slate-900">{ficha.simulador}</p>
              </div>
            </div>
          </div>

          {/* Linha 3 */}
          <div className="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-100">
            <p className="text-xs text-slate-500 font-medium mb-1 uppercase">Carga Horária:</p>
            <p className="text-sm text-slate-900">
              <span className="font-bold">{ficha.carga_horaria_total}</span>{' '}
              <span className="text-xs text-slate-500">
                (PF: {ficha.carga_horaria_pf || 'N/A'} / PM: {ficha.carga_horaria_pm || 'N/A'})
              </span>
            </p>
          </div>
        </div>

        {/* ===== ITENS AVALIADOS (22 MANOBRAS) ===== */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 flex items-center gap-2">
            <AlertCircle size={18} className="text-blue-600 sm:w-5 sm:h-5" />
            Itens Avaliados
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* ===== COLUNA ESQUERDA (1-11) ===== */}
            <div className="space-y-2 sm:space-y-3">
              {manobrasEsquerda.map((man) => (
                <div
                  key={man.id}
                  className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5 sm:p-3 hover:bg-slate-100 transition border border-slate-200"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                      {man.ordem}. {man.descricao}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 sm:mt-1">{man.codigo}</p>
                  </div>

                  {/* Círculo com Score */}
                  <div
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0 ${getScoreColor(
                      man.resultado,
                    )}`}
                  >
                    {man.resultado !== null &&
                    man.resultado !== undefined &&
                    !isNaN(Number(man.resultado))
                      ? Number(man.resultado)
                      : 'NA'}
                  </div>
                </div>
              ))}
            </div>

            {/* ===== COLUNA DIREITA (12-22) ===== */}
            <div className="space-y-2 sm:space-y-3">
              {manobrasDireita.map((man) => (
                <div
                  key={man.id}
                  className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5 sm:p-3 hover:bg-slate-100 transition border border-slate-200"
                >
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                      {man.ordem}. {man.descricao}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 sm:mt-1">{man.codigo}</p>
                  </div>

                  {/* Círculo com Score */}
                  <div
                    className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0 ${getScoreColor(
                      man.resultado,
                    )}`}
                  >
                    {man.resultado !== null &&
                    man.resultado !== undefined &&
                    !isNaN(Number(man.resultado))
                      ? Number(man.resultado)
                      : 'NA'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===== OBSERVAÇÕES GERAIS ===== */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-3">Observações Gerais</h2>
          <div className="bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-200 min-h-[80px] sm:min-h-[100px]">
            <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-wrap">
              {ficha.observacoes_gerais || (
                <span className="italic text-slate-400">Nenhuma observação registrada</span>
              )}
            </p>
          </div>
        </div>

        {/* ===== ASSINATURAS DIGITAIS ===== */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 sm:p-6 mb-4 sm:mb-6">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 flex items-center gap-2">
            <CheckCircle size={18} className="text-green-600 sm:w-5 sm:h-5" />
            Assinaturas Digitais
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* TRIPULANTE */}
            <div
              className={`rounded-lg p-4 border ${
                ficha.assinatura_aluno_timestamp
                  ? 'bg-green-50 border-green-200'
                  : 'bg-orange-50 border-orange-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">👤</span>
                <p className="text-sm font-bold text-slate-900">Tripulante</p>
              </div>
              <p className="text-sm text-slate-700 mb-2">{ficha.tripulante_nome}</p>

              {ficha.assinatura_aluno_timestamp ? (
                <div>
                  {ficha.assinatura_aluno_imagem ? (
                    <div className="mb-3 h-24 rounded border border-green-200 bg-white p-2 overflow-hidden">
                      <img
                        src={ficha.assinatura_aluno_imagem}
                        alt="Assinatura do tripulante"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 text-green-600 mb-1">
                    <CheckCircle size={16} />
                    <span className="text-xs font-semibold">Assinado digitalmente</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatTimestamp(ficha.assinatura_aluno_timestamp)}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-orange-600">
                  <AlertCircle size={16} />
                  <span className="text-xs font-semibold">Aguardando assinatura</span>
                </div>
              )}
            </div>

            {/* INSTRUTOR */}
            <div
              className={`rounded-lg p-4 border ${
                ficha.assinatura_instrutor_timestamp
                  ? 'bg-green-50 border-green-200'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🏆</span>
                <p className="text-sm font-bold text-slate-900">Instrutor</p>
              </div>
              <p className="text-sm text-slate-700 mb-2">{ficha.instrutor_nome}</p>

              {ficha.assinatura_instrutor_timestamp ? (
                <div>
                  {ficha.assinatura_instrutor_imagem ? (
                    <div className="mb-3 h-24 rounded border border-green-200 bg-white p-2 overflow-hidden">
                      <img
                        src={ficha.assinatura_instrutor_imagem}
                        alt="Assinatura do instrutor"
                        className="h-full w-full object-contain"
                      />
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 text-green-600 mb-1">
                    <CheckCircle size={16} />
                    <span className="text-xs font-semibold">Assinado digitalmente</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatTimestamp(ficha.assinatura_instrutor_timestamp)}
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-slate-500">
                  <AlertCircle size={16} />
                  <span className="text-xs font-semibold">Aguardando assinatura do tripulante</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== BOTÕES DE AÇÃO ===== */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 sm:p-6">
          <h3 className="text-sm font-bold text-slate-700 mb-3">Ações</h3>
          <div className="flex justify-start gap-3">
            {/* Voltar */}
            <button
              onClick={() => navigate('/simuladores')}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition font-medium text-sm"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Voltar</span>
            </button>
          </div>

          {/* Botão Gerar PDF (destaque) */}
          <div className="mt-4 pt-4 border-t border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={handleGerarPDF}
                disabled={!['CONCLUIDA', 'APROVADO', 'NAO_APROVADO'].includes(ficha.status)}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition font-semibold text-sm ${
                  ['CONCLUIDA', 'APROVADO', 'NAO_APROVADO'].includes(ficha.status)
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-md'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Download size={18} />
                Gerar PDF
              </button>

              <button
                onClick={handleArquivar}
                disabled={!['CONCLUIDA', 'APROVADO', 'NAO_APROVADO'].includes(ficha.status)}
                className={`flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition font-semibold text-sm ${
                  ['CONCLUIDA', 'APROVADO', 'NAO_APROVADO'].includes(ficha.status)
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <FolderOpen size={18} />
                Arquivar na Pasta Virtual
              </button>

              <button
                onClick={handleVerDesempenho}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg transition font-semibold text-sm bg-primary hover:bg-primary/90 text-white shadow-md"
              >
                <BarChart3 size={18} />
                Ver Dashboard de Desempenho
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ===== MODALS ===== */}
      <ModalAvaliarFicha
        isOpen={modalAvaliar}
        onClose={() => setModalAvaliar(false)}
        fichaId={Number(fichaId)}
        onSucesso={() => {
          fetchFicha();
          setModalAvaliar(false);
        }}
      />

      <AssinaturaModal
        isOpen={modalAssinatura.isOpen}
        onClose={() => setModalAssinatura({ isOpen: false, papel: 'TRIPULANTE' })}
        onSalvar={handleSalvarAssinatura}
        papel={modalAssinatura.papel}
      />
    </div>
  );
}
