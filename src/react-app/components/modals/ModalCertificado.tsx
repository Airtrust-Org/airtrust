import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

import {
  X,
  FolderOpen,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  AlertCircle,
  ClipboardList,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getAccessToken } from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';
import {
  openPreviewWindow,
  previewPdfBeforeDownload,
  showPdfPreviewError,
} from '@/react-app/utils/pdfPreview';
import { buildPasta360Url } from '@/react-app/utils/pasta360';

export interface ModalCertificadoProps {
  isOpen: boolean;
  onClose: () => void;
  onCertificadosChange?: (historicoId: number, temCertificados: boolean) => void | Promise<void>;
  qualificacao: {
    id: number;
    funcionario_id: number;
    funcionario_nome: string;
    matricula: string;
    qualificacao_nome: string;
    codigo: string;
    data_conclusao: string;
    instrutor?: string | null;
  };
  onUploadSuccess?: (temCertificados: boolean) => void | Promise<void>;
  onDeleteSuccess?: (temCertificados: boolean) => void | Promise<void>;
}

interface Certificado {
  id: number;
  nome_arquivo: string;
  arquivo_nome: string;
  url: string;
  arquivo_url: string;
  tamanho: number;
  arquivo_tamanho: number;
  tipo: string;
  numero_certificado: string;
  created_at: string;
}

export function ModalCertificado({
  isOpen,
  onClose,
  onCertificadosChange,
  qualificacao,
  onUploadSuccess,
  onDeleteSuccess,
}: ModalCertificadoProps) {
  const navigate = useNavigate();
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [gerandoInstrutor, setGerandoInstrutor] = useState(false);
  const [gerandoLista, setGerandoLista] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [descricao, setDescricao] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);
  const certificadosChangeRef = useRef(onCertificadosChange);
  const instrutorNome = String(qualificacao.instrutor || '').trim();

  useEffect(() => {
    certificadosChangeRef.current = onCertificadosChange;
  }, [onCertificadosChange]);

  const parseDateOnly = (value: string) => {
    const [year, month, day] = String(value || '')
      .split('-')
      .map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  };

  const formatDatePtBr = (value: string) => {
    const parsed = parseDateOnly(value);
    if (!parsed) return value;
    return parsed.toLocaleDateString('pt-BR');
  };

  const buildPresenceFilename = () => {
    const matriculaPadded = String(qualificacao.matricula || '00000')
      .replace(/\D/g, '')
      .padStart(5, '0');
    const codigoLimpo = String(qualificacao.codigo || 'XXX')
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10);
    const dateValue = parseDateOnly(qualificacao.data_conclusao) ?? new Date();
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    const uuid =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().substring(0, 8)
        : Math.random().toString(36).slice(2, 10).padEnd(8, '0').slice(0, 8);
    return `PRESENCA-${matriculaPadded}-${codigoLimpo}-${year}${month}${day}-${uuid}.pdf`;
  };

  const authHeader = () => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();

    // Safari can cancel downloads if the blob URL is revoked immediately.
    window.setTimeout(() => window.URL.revokeObjectURL(url), 30_000);
  };

  const requestJson = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    const response = await apiFetch(path, {
      ...init,
      headers: {
        ...authHeader(),
        ...(init?.headers || {}),
      },
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => '');

    if (!response.ok) {
      const errorMessage =
        typeof payload === 'object' && payload
          ? String(
              ('error' in payload && payload.error) ||
                ('message' in payload && payload.message) ||
                `Erro na requisição (${response.status})`,
            )
          : `Erro na requisição (${response.status})`;
      throw new Error(errorMessage);
    }

    return payload as T;
  }, []);

  const notifyCertificadosChange = useCallback(
    async (temCertificados: boolean) => {
      if (!certificadosChangeRef.current) return;
      try {
        await certificadosChangeRef.current(qualificacao.id, temCertificados);
      } catch (error) {
        console.error('[ModalCertificado] Falha ao sincronizar estado externo:', error);
      }
    },
    [qualificacao.id],
  );

  const carregarCertificados = useCallback(async (): Promise<Certificado[]> => {
    setLoading(true);
    try {
      // Adicionar timestamp para evitar cache no navegador
      const timestamp = Date.now();
      const data = await requestJson<{
        success: boolean;
        data: Array<{
          id: number;
          nome_arquivo?: string;
          r2_key?: string;
          tipo?: string;
          tamanho?: number;
          created_at?: string;
          numero_certificado?: string;
        }>;
      }>(`/api/certificados/historico/${qualificacao.id}/certificados?_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          'X-AirTrust-Bypass-Cache': '1',
        },
      });

      const mapped = (data.data || []).map((cert) => ({
        id: cert.id,
        nome_arquivo: cert.nome_arquivo || 'CERTIFICADO.pdf',
        arquivo_nome: cert.nome_arquivo || 'CERTIFICADO.pdf',
        url: cert.r2_key || '',
        arquivo_url: cert.r2_key || '',
        tamanho: cert.tamanho || 0,
        arquivo_tamanho: cert.tamanho || 0,
        tipo: cert.tipo || 'application/pdf',
        numero_certificado: cert.numero_certificado || '',
        created_at: cert.created_at || new Date().toISOString(),
      }));
      console.log('📋 [ModalCertificado] Certificados mapeados:', mapped.length, 'itens');
      setCertificados(mapped);
      await notifyCertificadosChange(mapped.length > 0);
      return mapped;
    } catch (error) {
      console.error('[ModalCertificado] Erro ao carregar certificados:', error);
      setCertificados([]);
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar certificados');
      return [];
    } finally {
      setLoading(false);
    }
  }, [notifyCertificadosChange, qualificacao.id, requestJson]);

  useEffect(() => {
    if (isOpen) {
      carregarCertificados();
    }
  }, [isOpen, carregarCertificados]);

  const handlePastaVirtual = () => {
    const pasta360Url = buildPasta360Url(qualificacao.funcionario_id, {
      tab: 'pasta',
      origem: 'modal-certificado',
      historicoId: qualificacao.id,
    });
    if (!pasta360Url) {
      toast.error('Não foi possível abrir a Pasta 360: funcionário inválido.');
      return;
    }
    navigate(pasta360Url);
    onClose();
  };

  const gerarCertificadoInternal = async (
    setLoading: (v: boolean) => void,
    extraBody?: Record<string, unknown>,
    successMsg = '✅ Certificado gerado com sucesso!',
  ) => {
    setLoading(true);
    try {
      const data = await requestJson<{ success: boolean; data?: { id?: number } }>(
        `/api/certificados/historico/${qualificacao.id}/certificados/gerar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: extraBody ? JSON.stringify(extraBody) : undefined,
        },
      );
      if (!data.success || !data.data?.id) {
        throw new Error('Erro ao gerar certificado - ID não retornado');
      }
      toast.success(successMsg);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const certificadosAtualizados = await carregarCertificados();
      if (onUploadSuccess) {
        try {
          await onUploadSuccess(certificadosAtualizados.length > 0);
        } catch (error) {
          console.error('[ModalCertificado] Falha em onUploadSuccess após gerar:', error);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[ModalCertificado] Erro ao gerar certificado:', err);
      toast.error(`❌ Erro: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGerarCertificado = () => gerarCertificadoInternal(setGerando);

  const handleGerarCertificadoInstrutor = () =>
    gerarCertificadoInternal(
      setGerandoInstrutor,
      { para_instrutor: true, nome_instrutor: instrutorNome },
      '✅ Certificado do instrutor gerado com sucesso!',
    );

  const handleGerarListaPresenca = async () => {
    setGerandoLista(true);
    const previewTitle = `Lista de Presença — ${qualificacao.codigo}`;
    const previewWindow = openPreviewWindow(previewTitle);
    try {
      const { gerarPDFListaPresenca } = await import('@/react-app/services/pdf-lista-presenca');
      const blob = await gerarPDFListaPresenca({
        cursoTreinamento: qualificacao.qualificacao_nome,
        codigoQualificacao: qualificacao.codigo,
        dataRealizacao: qualificacao.data_conclusao,
        participante: {
          nome: qualificacao.funcionario_nome,
          matricula: qualificacao.matricula,
        },
      });

      const fileName = buildPresenceFilename();

      await previewPdfBeforeDownload({
        fileName,
        title: previewTitle,
        mimeType: 'application/pdf',
        existingWindow: previewWindow,
        fetcher: () =>
          Promise.resolve(new Response(blob, { headers: { 'Content-Type': 'application/pdf' } })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      showPdfPreviewError(previewWindow, previewTitle, msg);
      toast.error(`❌ Erro ao gerar lista: ${msg}`);
    } finally {
      setGerandoLista(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.includes('pdf')) {
      toast.warning('❌ Apenas arquivos PDF são permitidos');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.warning('❌ Arquivo muito grande. Máximo 10MB');
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.warning('❌ Selecione um arquivo');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('descricao', descricao || selectedFile.name);
      await requestJson(`/api/certificados/historico/${qualificacao.id}/certificados/upload`, {
        method: 'POST',
        body: formData,
      });

      // Mostrar sucesso
      toast.success('✅ Certificado enviado com sucesso!');

      // Aguardar 300ms para garantir que o backend processou
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Recarregar lista imediatamente
      console.log('🔄 [ModalCertificado] Recarregando certificados...');
      const certificadosAtualizados = await carregarCertificados();
      console.log('✅ [ModalCertificado] Lista recarregada!');

      // Forçar re-render
      setRefreshKey((prev) => prev + 1);

      // Limpar seleção
      setSelectedFile(null);
      setDescricao('');

      // Callback para atualizar lista externa (tabela principal)
      if (onUploadSuccess) {
        console.log('🔄 [ModalCertificado] Chamando onUploadSuccess...');
        try {
          await onUploadSuccess(certificadosAtualizados.length > 0);
        } catch (error) {
          console.error('[ModalCertificado] Falha em onUploadSuccess após upload:', error);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.warning(`❌ Erro: ${msg}`);
    } finally {
      setUploading(false);
    }
  };

  const handlePreview = async (certificado: Certificado) => {
    try {
      await previewPdfBeforeDownload({
        fileName: certificado.nome_arquivo,
        title: `Certificado ${qualificacao.codigo}`,
        mimeType: certificado.tipo,
        fetcher: () =>
          apiFetch(`/api/pasta-virtual/stream/${certificado.id}`, {
            headers: authHeader(),
          }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.warning(`❌ Erro ao visualizar: ${msg}`);
    }
  };

  const handleDownload = async (certificado: Certificado) => {
    try {
      const response = await apiFetch(`/api/pasta-virtual/stream/${certificado.id}?download=1`, {
        headers: authHeader(),
      });

      if (!response.ok) {
        throw new Error(`Erro ao baixar arquivo (${response.status})`);
      }

      const blob = await response.blob();
      downloadBlob(blob, certificado.nome_arquivo || 'CERTIFICADO.pdf');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      toast.warning(`❌ Erro ao baixar: ${msg}`);
    }
  };

  const handleDelete = async (certificado: Certificado) => {
    console.log(
      '[ModalCertificado] handleDelete - abrindo confirmação para:',
      certificado.nome_arquivo,
    );
    setShowConfirmDelete({ id: certificado.id, nome: certificado.nome_arquivo });
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id, nome } = showConfirmDelete;
    const toastId = toast.loading(`Deletando "${nome}"...`);
    const certificadosAntes = [...certificados];
    console.log('[ModalCertificado] handleConfirmDelete - cert ID:', id);

    setDeletandoId(id);
    setShowConfirmDelete(null);

    try {
      await requestJson(`/api/certificados/historico/${qualificacao.id}/certificados/${id}`, {
        method: 'DELETE',
      });

      let quantidadeRestante = 0;
      setCertificados((prev) => {
        const novaLista = prev.filter((c) => c.id !== id);
        quantidadeRestante = novaLista.length;
        return novaLista;
      });

      if (onDeleteSuccess) {
        console.log(
          '[ModalCertificado] Notificando onDeleteSuccess - temCertificados:',
          quantidadeRestante > 0,
        );
        try {
          await onDeleteSuccess(quantidadeRestante > 0);
        } catch (error) {
          console.error('[ModalCertificado] Falha em onDeleteSuccess:', error);
        }
      }

      toast.success(`"${nome}" deletado com sucesso!`, { id: toastId });

      // Aguardar e recarregar para confirmar
      await new Promise((resolve) => setTimeout(resolve, 500));
      await carregarCertificados();

      if (onUploadSuccess) {
        console.log('[ModalCertificado] Notificando componente pai para refetch');
        try {
          await onUploadSuccess(quantidadeRestante > 0);
        } catch (error) {
          console.error('[ModalCertificado] Falha em onUploadSuccess após delete:', error);
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro desconhecido';
      const certificadosAtualizados = await carregarCertificados();
      const certificadoAindaExiste = certificadosAtualizados.some((cert) => cert.id === id);

      if (!certificadoAindaExiste) {
        const quantidadeRestante = certificadosAtualizados.length;

        if (onDeleteSuccess) {
          try {
            await onDeleteSuccess(quantidadeRestante > 0);
          } catch (error) {
            console.error('[ModalCertificado] Falha em onDeleteSuccess após fallback:', error);
          }
        }

        if (onUploadSuccess) {
          try {
            await onUploadSuccess(quantidadeRestante > 0);
          } catch (error) {
            console.error('[ModalCertificado] Falha em onUploadSuccess após fallback:', error);
          }
        }

        if (certificadosAntes.some((cert) => cert.id === id)) {
          setCertificados(certificadosAtualizados);
        }

        console.warn(
          '[ModalCertificado] DELETE retornou erro, mas a exclusão foi confirmada no recarregamento:',
          msg,
        );
        toast.success(`"${nome}" deletado com sucesso!`, { id: toastId });
      } else {
        console.error('[ModalCertificado] Erro ao deletar:', e);
        toast.error(`Erro: ${msg}`, { id: toastId });
      }
    } finally {
      setDeletandoId(null);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50">
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div className="min-w-0 pr-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Documentos — {qualificacao.codigo}
            </h2>
            <p className="mt-1 break-words text-sm text-gray-600">
              {qualificacao.qualificacao_nome}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Info Card */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Funcionário</p>
                <p className="font-medium text-gray-900">{qualificacao.funcionario_nome}</p>
              </div>
              <div>
                <p className="text-gray-600">Matrícula</p>
                <p className="font-medium text-gray-900">{qualificacao.matricula}</p>
              </div>
              <div>
                <p className="text-gray-600">Data de realização</p>
                <p className="font-medium text-gray-900">
                  {formatDatePtBr(qualificacao.data_conclusao)}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Código</p>
                <p className="font-medium text-gray-900">{qualificacao.codigo}</p>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-blue-300">
              <p className="text-xs text-gray-600 flex items-start gap-2">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                Certificados usam o padrão CERT-00000-CODIGO-YYYYMMDD-XXXXXXXX.pdf e a lista de
                presença usa PRESENCA-00000-CODIGO-YYYYMMDD-XXXXXXXX.pdf, sempre com a data de
                realização.
              </p>
            </div>
          </div>

          {/* Ações principais */}
          <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Ações</p>
            <div
              className={`grid grid-cols-1 gap-3 ${instrutorNome ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}
            >
              {/* Pasta 360 */}
              <button
                onClick={handlePastaVirtual}
                className="px-4 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition flex items-center justify-center gap-2"
              >
                <FolderOpen size={18} />
                Pasta 360
              </button>

              {/* Gerar Certificado */}
              <button
                onClick={handleGerarCertificado}
                disabled={gerando}
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gerando ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Gerando...
                  </>
                ) : (
                  <>
                    <FileText size={18} />
                    Gerar Certificado
                  </>
                )}
              </button>

              {/* Gerar Certificado do Instrutor - apenas quando há instrutor cadastrado */}
              {instrutorNome && (
                <button
                  onClick={handleGerarCertificadoInstrutor}
                  disabled={gerandoInstrutor}
                  className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {gerandoInstrutor ? (
                    <>
                      <svg
                        className="animate-spin h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Gerando...
                    </>
                  ) : (
                    <>
                      <FileText size={18} />
                      Certificado do Instrutor
                    </>
                  )}
                </button>
              )}

              {/* Gerar Lista de Presença */}
              <button
                onClick={handleGerarListaPresenca}
                disabled={gerandoLista}
                className="px-4 py-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {gerandoLista ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Gerando...
                  </>
                ) : (
                  <>
                    <ClipboardList size={18} />
                    Gerar Lista de Presença
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Upload Section */}
          <div className="border-t pt-6 mb-6">
            <p className="text-sm font-medium text-gray-700 mb-3">Upload de documento existente</p>
            <div className="space-y-4">
              <label htmlFor="file-upload" className="block cursor-pointer">
                <input
                  id="file-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 hover:bg-blue-50 transition">
                  {selectedFile ? (
                    <div>
                      <FileText size={48} className="mx-auto text-blue-600 mb-2" />
                      <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatFileSize(selectedFile.size)}
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedFile(null);
                        }}
                        className="mt-2 text-xs text-red-600 hover:text-red-700"
                      >
                        Remover arquivo
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Upload size={48} className="mx-auto text-gray-400 mb-2" />
                      <p className="text-sm text-gray-600">Clique para escolher arquivo</p>
                      <p className="text-xs text-gray-500 mt-1">Apenas PDF, máximo 10MB</p>
                    </div>
                  )}
                </div>
              </label>
              {selectedFile && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Descrição (opcional)
                    </label>
                    <input
                      type="text"
                      value={descricao}
                      onChange={(e) => setDescricao(e.target.value)}
                      placeholder="Ex: Certificado emitido pela ANAC"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <span className="animate-spin">⏳</span>Enviando...
                      </>
                    ) : (
                      <>
                        <Upload size={20} />
                        Anexar certificado
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Certificados existentes */}
          <div className="border-t pt-6">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Documentos anexados ({certificados.length})
            </p>
            {loading ? (
              <div className="text-center py-8 text-gray-500">
                <div className="animate-spin mx-auto mb-2">⏳</div>Carregando...
              </div>
            ) : certificados.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText size={48} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm">Nenhum certificado cadastrado</p>
                <p className="text-xs text-gray-400 mt-1">
                  Use as ações acima para gerar ou anexar um certificado
                </p>
              </div>
            ) : (
              <div className="space-y-2" key={refreshKey}>
                {certificados.map((cert) => (
                  <div
                    key={`${cert.id}-${refreshKey}`}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <FileText size={24} className="text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="break-all font-medium text-gray-900">{cert.nome_arquivo}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatFileSize(cert.tamanho)} •{' '}
                            {new Date(cert.created_at).toLocaleDateString('pt-BR')} às{' '}
                            {new Date(cert.created_at).toLocaleTimeString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handlePreview(cert)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition"
                          title="Visualizar PDF"
                        >
                          <Eye size={16} />
                          <span>Visualizar</span>
                        </button>
                        <button
                          onClick={() => handleDownload(cert)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-medium text-blue-700 hover:bg-blue-50 transition"
                          title="Baixar PDF"
                        >
                          <Download size={16} />
                          <span>Download</span>
                        </button>
                        <button
                          onClick={() => handleDelete(cert)}
                          disabled={deletandoId === cert.id}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
          >
            Fechar
          </button>
        </div>
      </div>

      {/* Modal de Confirmação de Delete */}
      {showConfirmDelete && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-modal p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Confirmar exclusão</h3>
            </div>

            <p className="text-gray-600 mb-6">
              Tem certeza que deseja excluir{' '}
              <span className="font-medium text-gray-900">"{showConfirmDelete.nome}"</span>?
              <br />
              <span className="text-sm mt-2 block text-gray-500">
                Esta ação não poderá ser desfeita.
              </span>
            </p>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirmDelete(null)}
                disabled={deletandoId !== null}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deletandoId !== null}
                className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {deletandoId !== null && (
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                )}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
