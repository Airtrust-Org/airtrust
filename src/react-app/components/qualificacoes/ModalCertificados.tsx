import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Award, Download, FileText, FolderOpen, Trash2, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { FormActions } from '@/components/ui/Form';
import { showToast } from '@/react-app/utils/toast';
import { apiClient } from '@/react-app/services/apiClient';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';

interface ModalCertificadosProps {
  isOpen: boolean;
  onClose: () => void;
  historicoId: number;
  funcionarioId: number;
  matricula: string;
  codigoQualificacao: string;
  nomeQualificacao: string;
  dataConclusao: string | null;
  onUploadSuccess?: () => void; // Callback para atualizar lista
}

interface CertificadoItem {
  id: number;
  nome_arquivo: string;
  tipo: string;
  tamanho: number;
  r2_key: string;
  created_at: string;
}

export function ModalCertificados({
  isOpen,
  onClose,
  historicoId,
  funcionarioId,
  matricula,
  codigoQualificacao,
  nomeQualificacao,
  dataConclusao,
  onUploadSuccess,
}: ModalCertificadosProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [certificados, setCertificados] = useState<CertificadoItem[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDescricao, setUploadDescricao] = useState('');
  const [uploadDataRealizacao, setUploadDataRealizacao] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState<{ id: number; nome: string } | null>(
    null,
  );
  const [deletandoId, setDeletandoId] = useState<number | null>(null);

  const apiUrl = API_BASE_URL;

  const fetchCertificados = async () => {
    if (!isOpen) return;
    setLoading(true);
    try {
      // Adicionar timestamp para forçar bypass de cache
      const timestamp = Date.now();
      const json = await apiClient<{ success: boolean; data: CertificadoItem[] }>(
        `${apiUrl}/certificados/historico/${historicoId}/certificados?_t=${timestamp}`,
        {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        },
      );
      if (json.success && Array.isArray(json.data)) {
        console.log('[ModalCertificados] Certificados carregados:', json.data.length, json.data);
        setCertificados(json.data);
      } else {
        showToast.error('Erro ao carregar certificados');
      }
    } catch (error) {
      console.error('[ModalCertificados] Erro ao carregar certificados', error);
      showToast.error('Erro ao carregar certificados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void fetchCertificados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, historicoId]);

  const handleGerar = async () => {
    setSubmitting(true);
    try {
      const json = await apiClient<{ success: boolean }>(
        `${apiUrl}/certificados/historico/${historicoId}/certificados/gerar`,
        { method: 'POST' },
      );
      if (json.success) {
        showToast.success('Certificado gerado com sucesso');
        // Aguardar 500ms para garantir que o banco foi atualizado
        await new Promise((resolve) => setTimeout(resolve, 500));
        await fetchCertificados();
        // Notificar componente pai para refetch da lista principal
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        showToast.error('Erro ao gerar certificado');
      }
    } catch (error) {
      console.error('[ModalCertificados] Erro ao gerar certificado', error);
      showToast.error('Erro ao gerar certificado');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      showToast.error('Selecione um arquivo PDF');
      return;
    }

    setSubmitting(true);
    try {
      const token = getAccessToken();
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (uploadDescricao) {
        formData.append('descricao', uploadDescricao);
      }
      if (uploadDataRealizacao) {
        formData.append('data_realizacao', uploadDataRealizacao);
      }

      const res = await fetch(
        `${apiUrl}/certificados/historico/${historicoId}/certificados/upload`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        },
      );
      const json = await res.json();
      if (res.ok && json.success) {
        setUploadFile(null);
        setUploadDescricao('');
        setUploadDataRealizacao('');
        // Recarregar certificados imediatamente
        await fetchCertificados();
        // Notificar componente pai para refetch da lista principal
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      } else {
        showToast.error(json.error || 'Erro ao anexar certificado');
      }
    } catch (error) {
      console.error('[ModalCertificados] Erro no upload de certificado', error);
      showToast.error('Erro ao anexar certificado');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async (cert: CertificadoItem) => {
    console.log('[ModalCertificados] handleDownload - cert:', cert);

    // Validar ID do certificado
    if (!cert.id || typeof cert.id !== 'number') {
      console.error('[ModalCertificados] ID do certificado inválido:', cert.id);
      showToast.error('ID do certificado inválido');
      return;
    }

    try {
      const token = getAccessToken();
      const streamUrl = `/api/pasta-virtual/stream/${cert.id}`;
      console.log('[ModalCertificados] Download URL:', streamUrl);

      const response = await apiFetch(streamUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        throw new Error(`Erro ao baixar arquivo (${response.status})`);
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = cert.nome_arquivo || 'CERTIFICADO.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);

      showToast.success('Download iniciado');
    } catch (error) {
      console.error('[ModalCertificados] Erro ao baixar certificado', error);
      showToast.error('Erro ao baixar certificado');
    }
  };

  const handleDelete = async (cert: CertificadoItem) => {
    console.log('[ModalCertificados] handleDelete - abrindo confirmação para:', cert.nome_arquivo);
    setShowConfirmDelete({ id: cert.id, nome: cert.nome_arquivo });
  };

  const handleConfirmDelete = async () => {
    if (!showConfirmDelete) return;

    const { id, nome } = showConfirmDelete;

    console.log(
      '[ModalCertificados] handleConfirmDelete - cert ID:',
      id,
      'historicoId:',
      historicoId,
    );

    // Validar IDs
    if (!id || typeof id !== 'number') {
      console.error('[ModalCertificados] ID do certificado inválido:', id);
      showToast.error('ID do certificado inválido');
      setShowConfirmDelete(null);
      return;
    }

    if (!historicoId || typeof historicoId !== 'number') {
      console.error('[ModalCertificados] historicoId inválido:', historicoId);
      showToast.error('ID do histórico inválido');
      setShowConfirmDelete(null);
      return;
    }

    setDeletandoId(id);
    setShowConfirmDelete(null);
    const toastId = showToast.loading(`Deletando "${nome}"...`);

    try {
      const deleteUrl = `${apiUrl}/certificados/historico/${historicoId}/certificados/${id}`;
      console.log('[ModalCertificados] Delete URL:', deleteUrl);

      const json = await apiClient<{ success: boolean }>(deleteUrl, { method: 'DELETE' });

      if (json.success) {
        console.log('[ModalCertificados] Delete bem-sucedido, removendo da lista local...');

        // Remover imediatamente da lista local
        setCertificados((prev) => prev.filter((c) => c.id !== id));

        showToast.dismiss(toastId);
        showToast.success(`"${nome}" deletado com sucesso!`);

        // Aguardar 300ms e recarregar do servidor para confirmar
        await new Promise((resolve) => setTimeout(resolve, 300));
        await fetchCertificados();

        // Notificar componente pai para refetch da lista principal
        if (onUploadSuccess) {
          console.log('[ModalCertificados] Notificando componente pai para refetch');
          onUploadSuccess();
        }
      } else {
        console.error('[ModalCertificados] Delete retornou success=false');
        showToast.dismiss(toastId);
        showToast.error('Erro ao remover certificado');
      }
    } catch (error: unknown) {
      console.error('[ModalCertificados] Erro ao remover certificado:', error);
      showToast.dismiss(toastId);
      // 403: Permissão negada (RBAC)
      const err = error as { status?: number; message?: string };
      if (err?.status === 403 || err?.message?.includes('403')) {
        showToast.error('Permissão negada. Apenas administradores podem deletar certificados.');
      } else {
        const errorMsg = err?.message || 'Erro ao remover certificado';
        showToast.error(errorMsg);
      }
    } finally {
      setDeletandoId(null);
    }
  };

  const titulo = `Certificados – ${matricula} / ${codigoQualificacao}`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={titulo} size="lg">
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-medium">{nomeQualificacao}</p>
          <p className="mt-1 text-xs text-slate-500">
            Data de realização:{' '}
            {dataConclusao ? new Date(dataConclusao).toLocaleDateString('pt-BR') : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Os arquivos seguem o padrão CERT-{`{NOME_FUNCIONARIO}`}-{codigoQualificacao}
            -YYYYMMDD.pdf, usando SEMPRE a data da realização.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-slate-800">Ações de certificado</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  navigate(`/pasta-virtual/${funcionarioId}`);
                  onClose();
                }}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary/90"
              >
                <FolderOpen className="w-4 h-4" />
                <span>Pasta Virtual</span>
              </button>
              <button
                onClick={handleGerar}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              >
                <FileText className="w-4 h-4" />
                <span>Gerar certificado</span>
              </button>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2 rounded-md bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-700">Upload de certificado existente</p>
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setUploadFile(file);
                }}
                className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-primary-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary-700 hover:file:bg-primary-100"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="date"
                  placeholder="Data de realização"
                  value={uploadDataRealizacao}
                  onChange={(e) => setUploadDataRealizacao(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                />
                <input
                  type="text"
                  placeholder="Descrição (opcional)"
                  value={uploadDescricao}
                  onChange={(e) => setUploadDescricao(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
                />
              </div>
              <button
                onClick={handleUpload}
                disabled={submitting}
                className="mt-2 inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:mt-0"
              >
                <Upload className="w-4 h-4" />
                <span>Anexar</span>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">Certificados existentes</p>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-slate-500">
              Carregando certificados...
            </div>
          ) : certificados.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-8 text-center">
              <Award className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-medium text-slate-700">Nenhum certificado cadastrado</p>
              <p className="text-xs text-slate-500">
                Use as ações acima para gerar ou anexar um certificado em PDF.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Arquivo
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tipo
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tamanho
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Criado em
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {certificados.map((cert) => (
                    <tr key={cert.id}>
                      <td className="px-4 py-2 text-sm text-slate-700">{cert.nome_arquivo}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{cert.tipo}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {(cert.tamanho / 1024).toFixed(1)} KB
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-500">
                        {new Date(cert.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => void handleDownload(cert)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>
                          <button
                            onClick={() => void handleDelete(cert)}
                            disabled={deletandoId === cert.id}
                            className="inline-flex items-center gap-1 rounded-md border border-danger-200 px-2 py-1 text-xs font-medium text-danger-700 hover:bg-danger-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{deletandoId === cert.id ? 'Deletando...' : 'Excluir'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <FormActions onCancel={onClose} onSubmit={onClose} submitLabel="Fechar" />
      </div>

      {/* Modal de Confirmação de Delete */}
      {showConfirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-sm w-full p-6">
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
    </Modal>
  );
}
