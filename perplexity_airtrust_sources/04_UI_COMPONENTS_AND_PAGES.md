# UI Components & Pages


---
## FILE: src/components/FormTipoQualificacao.tsx
~~~tsx
import { useState } from 'react';
import { useTiposQualificacoes } from '../hooks/useTiposQualificacoes';

export function FormTipoQualificacao() {
  const { criar, loading, error } = useTiposQualificacoes();
  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    categoria: 'Nenhuma' as const,
    descricao: '',
    carga_horaria: 8,
    conteudo_programatico: '',
    validade_meses: 12,
    tipo_vencimento: 'Dia Exato' as const,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitError(null);
      setSubmitLoading(true);
      await criar(formData);
      setFormData({
        nome: '',
        codigo: '',
        categoria: 'Nenhuma',
        descricao: '',
        carga_horaria: 8,
        conteudo_programatico: '',
        validade_meses: 12,
        tipo_vencimento: 'Dia Exato',
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao criar qualificação');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold text-gray-900">Nova Qualificação</h2>

      {error && <div className="bg-red-100 text-red-800 p-3 rounded text-sm">{error}</div>}
      {submitError && (
        <div className="bg-red-100 text-red-800 p-3 rounded text-sm">{submitError}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <input
            type="text"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            required
            maxLength={100}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Ex: CMA - Certificado Médico"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
          <input
            type="text"
            value={formData.codigo}
            onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
            required
            pattern="^[A-Z0-9-]+$"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Ex: CMA-001"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <select
            value={formData.categoria}
            onChange={(e) => setFormData({ ...formData, categoria: e.target.value as any })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option>Nenhuma</option>
            <option>Profissional</option>
            <option>Periódico</option>
            <option>Especial</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Carga Horária</label>
          <input
            type="number"
            value={formData.carga_horaria}
            onChange={(e) => setFormData({ ...formData, carga_horaria: parseInt(e.target.value) })}
            min="1"
            max="500"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
        <textarea
          value={formData.descricao}
          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
          maxLength={500}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          rows={2}
          placeholder="Descrição da qualificação"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Conteúdo Programático
        </label>
        <textarea
          value={formData.conteudo_programatico}
          onChange={(e) => setFormData({ ...formData, conteudo_programatico: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          rows={4}
          placeholder="Um tópico por linha"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Validade (meses)</label>
          <input
            type="number"
            value={formData.validade_meses}
            onChange={(e) => setFormData({ ...formData, validade_meses: parseInt(e.target.value) })}
            min="1"
            max="120"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Vencimento</label>
          <select
            value={formData.tipo_vencimento}
            onChange={(e) => setFormData({ ...formData, tipo_vencimento: e.target.value as any })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option>Dia Exato</option>
            <option>Aniversário</option>
            <option>Mês Seguinte</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || submitLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded transition"
        >
          {submitLoading ? '⏳ Criando...' : '✅ Criar Qualificação'}
        </button>
        <button
          type="reset"
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition"
        >
          Limpar
        </button>
      </div>
    </form>
  );
}

~~~

---
## FILE: src/components/GerenciadorCertificados.tsx
~~~tsx
import { useCertificados } from '../hooks/useCertificados';
import { useState, useRef } from 'react';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

interface Props {
  qualificacao_id: number;
  qualificacao_nome: string;
}

export function GerenciadorCertificados({ qualificacao_id, qualificacao_nome }: Props) {
  const { certificados, loading, error, gerar, download, deletar, upload } =
    useCertificados(qualificacao_id);
  const [gerando, setGerando] = useState(false);
  const [uploadando, setUploadando] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGerar = async () => {
    try {
      setGerando(true);
      await gerar();
      showAlertDialog('✅ Certificado gerado com sucesso!');
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setGerando(false);
    }
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!fileInputRef.current?.files?.[0]) return;

    try {
      setUploadando(true);
      const file = fileInputRef.current.files[0];

      const formData = new FormData(e.currentTarget);
      const metadata = {
        data_documento: formData.get('data_documento') as string,
        validade_ate: formData.get('validade_ate') as string,
        observacoes: formData.get('observacoes') as string,
      };

      await upload(file, qualificacao_id, metadata);
      showAlertDialog('✅ Arquivo enviado com sucesso!');
      setShowUploadForm(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      console.error('Erro:', err);
    } finally {
      setUploadando(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      ATIVO: 'bg-green-100 text-green-800',
      VENCIDO: 'bg-red-100 text-red-800',
      REJEITADO: 'bg-orange-100 text-orange-800',
      SUBSTITUIDO: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getTipoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      UPLOAD: '📤 Enviado',
      GERADO: '⚙️ Gerado',
      RENOVADO: '🔄 Renovado',
    };
    return labels[tipo] || tipo;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-gray-900">📄 Certificados</h3>
          <p className="text-sm text-gray-600 mt-1">{qualificacao_nome}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowUploadForm(!showUploadForm)}
            className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
          >
            📤 Fazer Upload
          </button>
          <button
            onClick={handleGerar}
            disabled={gerando}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-lg transition-colors"
          >
            {gerando ? '⏳ Gerando...' : '🔧 Gerar'}
          </button>
        </div>
      </div>

      {showUploadForm && (
        <form
          onSubmit={handleUpload}
          className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo PDF *</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Data do Documento
              </label>
              <input
                type="date"
                name="data_documento"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Validade Até</label>
              <input
                type="date"
                name="validade_ate"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
              <input
                type="text"
                name="observacoes"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              disabled={uploadando}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {uploadando ? '⏳ Enviando...' : '✅ Enviar'}
            </button>
            <button
              type="button"
              onClick={() => setShowUploadForm(false)}
              className="bg-gray-400 hover:bg-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              ❌ Cancelar
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          ⚠️ {error}
        </div>
      )}

      {loading && !certificados.length ? (
        <div className="text-center py-8 text-gray-500">⏳ Carregando certificados...</div>
      ) : certificados.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>Nenhum certificado cadastrado</p>
          <p className="text-sm mt-2">Clique em "Gerar Certificado" ou faça upload de um arquivo</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Tipo</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Data</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">
                  Válido até
                </th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Status</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Arquivo</th>
                <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {certificados.map((cert) => (
                <tr key={cert.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">{getTipoLabel(cert.tipo)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(cert.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {cert.validade_ate
                      ? new Date(cert.validade_ate).toLocaleDateString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(
                        cert.status,
                      )}`}
                    >
                      {cert.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-blue-600 truncate max-w-xs">
                    {cert.arquivo_nome}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      <button
                        onClick={() => download(cert.id, cert.arquivo_nome)}
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        📥 Baixar
                      </button>
                      <button
                        onClick={async () => {
                          if (await confirmDialog('Tem certeza que deseja deletar?')) {
                            deletar(cert.id);
                          }
                        }}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        🗑️ Deletar
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
  );
}

~~~

---
## FILE: src/components/ListaHabilitacoes.tsx
~~~tsx
import React, { useState } from 'react';
import { useHabilitacoes, useDeleteHabilitacao } from '../react-app/hooks/useHabilitacoes';
import { Trash2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Habilitacao = any;

interface ListaHabilitacoesProps {
  funcionarioId?: number;
}

export function ListaHabilitacoes({ funcionarioId }: ListaHabilitacoesProps) {
  const [page, setPage] = useState(1);

  // Hooks
  const { data: listaData, isLoading } = useHabilitacoes({
    page,
    limit: 20,
    funcionario_id: funcionarioId,
  });

  const { mutate: deletarHabilitacao, isPending: isDeletando } = useDeleteHabilitacao();

  const habilitacoes = listaData?.data || [];
  const pagination = listaData?.pagination || { page: 1, limit: 20, total: 0, pages: 0 };

  const handleDelete = async (id: number) => {
    if (!(await confirmDialog('Tem certeza que deseja deletar esta habilitação?'))) return;
    deletarHabilitacao(id);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ATIVA':
        return 'bg-green-100 text-green-800';
      case 'VENCIDA':
        return 'bg-red-100 text-red-800';
      case 'SUSPENSA':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getResultadoColor = (resultado: string) => {
    switch (resultado) {
      case 'APROVADO':
        return 'text-green-600 font-semibold';
      case 'REPROVADO':
        return 'text-red-600 font-semibold';
      case 'PENDENTE':
        return 'text-yellow-600 font-semibold';
      default:
        return 'text-gray-600';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin">⏳</div>
        <span className="ml-2 text-gray-600">Carregando habilitações...</span>
      </div>
    );
  }

  if (habilitacoes.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-8 text-center border border-gray-200">
        <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600">Nenhuma habilitação encontrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Qualificação
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Resultado
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Conclusão
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Vencimento
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                Nota
              </th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-700 uppercase">
                Ação
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {habilitacoes.map((hab: Habilitacao) => (
              <tr key={hab.id} className="hover:bg-gray-50 transition">
                <td className="px-6 py-4 text-sm text-gray-900">{hab.qualificacao_nome || '-'}</td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                      hab.status,
                    )}`}
                  >
                    {hab.status}
                  </span>
                </td>
                <td className={`px-6 py-4 text-sm ${getResultadoColor(hab.resultado || '')}`}>
                  {hab.resultado || '-'}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{hab.data_conclusao || '-'}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{hab.data_vencimento || '-'}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {hab.nota_final ? `${hab.nota_final}/100` : '-'}
                </td>
                <td className="px-6 py-4 text-sm text-center">
                  <button
                    onClick={async () => handleDelete(hab.id)}
                    disabled={isDeletando}
                    className="inline-flex items-center gap-2 px-3 py-1 text-red-600 hover:bg-red-50 rounded transition disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-xs">Deletar</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
          <button
            disabled={page === 1}
            onClick={() => setPage(Math.max(1, page - 1))}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-white"
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {page} de {pagination.pages} ({pagination.total} total)
          </span>
          <button
            disabled={page >= pagination.pages}
            onClick={() => setPage(page + 1)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg disabled:opacity-50 hover:bg-white"
          >
            Próxima
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

~~~

---
## FILE: src/components/PastaVirtualIntegrada.tsx
~~~tsx
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/constants';

export interface ArquivoPastaVirtual {
  id: string;
  tipo: 'CERTIFICADO' | 'DOCUMENTO' | 'RELATORIO';
  nome: string;
  url: string;
  data_upload: string;
  tamanho: number;
}

interface Props {
  qualificacao_id: number;
  funcionario_id: number;
}

export function PastaVirtualIntegrada({ qualificacao_id, funcionario_id }: Props) {
  const [arquivos, setArquivos] = useState<ArquivoPastaVirtual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        setLoading(true);
        setError(null);
        // Tenta carregar certificados da pasta virtual
        // Prefer simplified certificados endpoint with funcionario + qualificacao
        const res = await fetch(
          `${API_BASE_URL}/certificados/funcionario/${funcionario_id}/qualificacao/${qualificacao_id}`,
        );
        if (res.ok) {
          const data = await res.json();
          const lista = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
          type CertFromApi = {
            id: string | number;
            arquivo_nome?: string;
            arquivo_url?: string;
            created_at?: string;
            data_documento?: string;
            arquivo_tamanho?: number;
          };
          const mapped: ArquivoPastaVirtual[] = (lista as CertFromApi[]).map((cert) => ({
            id: String(cert.id),
            tipo: 'CERTIFICADO',
            nome: cert.arquivo_nome || '',
            url: cert.arquivo_url || '',
            data_upload: cert.created_at || cert.data_documento || new Date().toISOString(),
            tamanho: cert.arquivo_tamanho || 0,
          }));
          setArquivos(mapped);
        } else {
          // Se endpoint não existir, tenta endpoint alternativo
          const res2 = await fetch(`${API_BASE_URL}/certificados/qualificacao/${qualificacao_id}`);
          if (res2.ok) {
            const certs = await res2.json();
            const lista2 = Array.isArray(certs)
              ? certs
              : Array.isArray(certs?.data)
              ? certs.data
              : [];
            type CertFromApi2 = {
              id: string | number;
              arquivo_nome?: string;
              arquivo_url?: string;
              created_at?: string;
              data_documento?: string;
              arquivo_tamanho?: number;
            };
            const mapped2: ArquivoPastaVirtual[] = (lista2 as CertFromApi2[]).map((cert) => ({
              id: cert.id?.toString?.() || String(cert.id),
              tipo: 'CERTIFICADO',
              nome: cert.arquivo_nome || '',
              url: cert.arquivo_url || '',
              data_upload: cert.created_at || cert.data_documento || new Date().toISOString(),
              tamanho: cert.arquivo_tamanho || 0,
            }));
            setArquivos(mapped2);
          }
        }
      } catch (err) {
        console.error('Erro ao carregar pasta virtual:', err);
        setError('Erro ao carregar pasta virtual');
      } finally {
        setLoading(false);
      }
    };
    carregar();
  }, [funcionario_id, qualificacao_id]);

  const formatarTamanho = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getTipoIcon = (tipo: string) => {
    const icons: Record<string, string> = {
      CERTIFICADO: '📜',
      DOCUMENTO: '📄',
      RELATORIO: '📊',
    };
    return icons[tipo] || '📎';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold text-gray-900 mb-4">📁 Pasta Virtual</h3>

      {error && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded-lg mb-4 text-sm">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-6 text-gray-500">⏳ Carregando...</div>
      ) : arquivos.length === 0 ? (
        <div className="text-center py-6 text-gray-500 text-sm">
          <p>Nenhum arquivo na pasta virtual</p>
        </div>
      ) : (
        <div className="space-y-2">
          {arquivos.map((arquivo) => (
            <div
              key={arquivo.id}
              className="flex items-center justify-between bg-gray-50 p-3 rounded-lg hover:bg-gray-100 transition"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getTipoIcon(arquivo.tipo)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{arquivo.nome}</p>
                    <p className="text-xs text-gray-500">
                      {new Date(arquivo.data_upload).toLocaleDateString('pt-BR')} -{' '}
                      {formatarTamanho(arquivo.tamanho)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 ml-4 flex-shrink-0">
                {arquivo.url && (
                  <>
                    <a
                      href={arquivo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                      title="Visualizar"
                    >
                      👁️
                    </a>
                    <a
                      href={arquivo.url}
                      download
                      className="text-green-600 hover:text-green-800 font-medium text-sm"
                      title="Baixar"
                    >
                      📥
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

~~~

---
## FILE: src/components/layout/AppLayout.tsx
~~~tsx
import React from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  currentPath?: string;
}

export function AppLayout({ children, title, currentPath = '' }: AppLayoutProps) {
  React.useEffect(() => {
    document.title = `${title} | AirTrust`;
  }, [title]);

  return (
    <div className="min-h-screen bg-gray-100">
      <Sidebar currentPath={currentPath} />

      <div className="lg:ml-72 transition-all duration-200">
        <Topbar />

        <main className="px-6 py-8">
          <div className="max-w-7xl mx-auto space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

~~~

---
## FILE: src/components/layout/PageHeader.tsx
~~~tsx
import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumb?: string[];
}

export function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
            {breadcrumb.map((item, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span className="material-symbols-outlined text-sm">chevron_right</span>}
                <span className={i === breadcrumb.length - 1 ? 'text-slate-900 font-medium' : ''}>
                  {item}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}

        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>

        {subtitle && <p className="text-sm text-slate-600 mt-2">{subtitle}</p>}
      </div>

      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

~~~

---
## FILE: src/components/layout/Sidebar.tsx
~~~tsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  currentPath: string;
}

interface MenuItem {
  icon: string;
  label: string;
  path: string;
}

const menuItems: MenuItem[] = [
  { icon: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { icon: 'person', label: 'Funcionários', path: '/funcionarios' },
  { icon: 'badge', label: 'Qualificações', path: '/qualificacoes' },
  { icon: 'flight_takeoff', label: 'Simuladores', path: '/simuladores' },
  { icon: 'folder', label: 'Pasta Virtual', path: '/pasta-virtual' },
  { icon: 'settings', label: 'Configurações', path: '/configuracoes' },
];

export function Sidebar({ currentPath }: SidebarProps) {
  const location = useLocation();
  const activePath = currentPath || location.pathname;

  return (
    <aside className="fixed left-0 top-0 h-screen w-72 bg-white border-r border-gray-200 p-6 z-40 overflow-y-auto">
      {/* Logo */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-600">AirTrust</h1>
        <p className="text-xs text-slate-500 mt-1">Sistema de Gestão</p>
      </div>

      {/* Navegação */}
      <nav className="space-y-1">
        {menuItems.map((item) => {
          const isActive = activePath.startsWith(item.path);

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-600 font-medium'
                  : 'text-slate-700 hover:bg-gray-50'
              }`}
            >
              <span className="material-symbols-outlined text-xl">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Perfil (rodapé) */}
      <div className="absolute bottom-6 left-6 right-6 border-t border-gray-200 pt-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-primary-600 font-semibold text-sm">FD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">Filipe Daumas</p>
            <p className="text-xs text-slate-500 truncate">Administrador</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

~~~

---
## FILE: src/components/layout/TopNavLayout.tsx
~~~tsx
import React, { useEffect } from 'react';
import AppLayout from '../../react-app/components/AppLayout';

interface TopNavLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function TopNavLayout({ children, title }: TopNavLayoutProps) {
  useEffect(() => {
    if (title) document.title = `${title} | AirTrust`;
  }, [title]);

  // Important: Delegate rendering entirely to the new global AppLayout so
  // any legacy page that still imports TopNavLayout adopts the new standard.
  return <AppLayout>{children}</AppLayout>;
}

~~~

---
## FILE: src/components/layout/Topbar.tsx
~~~tsx
import React from 'react';

export function Topbar() {
  return (
    <header className="sticky top-0 h-16 bg-white border-b border-gray-200 px-6 flex items-center justify-between z-30">
      {/* Lado esquerdo: Breadcrumb/Título */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span className="text-slate-900 font-medium">AirTrust</span>
      </div>

      {/* Lado direito: Ações */}
      <div className="flex items-center gap-4">
        {/* Busca global (opcional) */}
        <div className="relative hidden md:block">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
            search
          </span>
          <input
            type="text"
            placeholder="Buscar..."
            className="w-64 h-10 pl-10 pr-3 border border-gray-300 rounded-lg text-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all"
          />
        </div>

        {/* Notificações */}
        <button className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-gray-50 rounded-lg transition-colors">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* Avatar */}
        <button className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded-lg transition-colors">
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-primary-600 text-sm font-semibold">FD</span>
          </div>
          <span className="material-symbols-outlined text-slate-400 text-lg">expand_more</span>
        </button>
      </div>
    </header>
  );
}

~~~

---
## FILE: src/components/qualificacoes/NovaQualificacaoModal.tsx
~~~tsx
import { useState, useEffect, useCallback } from 'react';
import { X, Calendar } from 'lucide-react';
import { getDataHojeHTML } from '@/react-app/utils/dateUtils';

interface NovaQualificacaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  funcionarioCpf?: string;
}

interface Funcionario {
  cpf: string;
  nome: string;
  matricula: string;
}

interface TipoQualificacao {
  codigo: string;
  nome: string;
  categoria: string;
  validade: number | null;
  vencimento_fim_mes: number;
}

export function NovaQualificacaoModal({
  isOpen,
  onClose,
  onSuccess,
  funcionarioCpf,
}: NovaQualificacaoModalProps) {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [tipos, setTipos] = useState<TipoQualificacao[]>([]);

  const [formData, setFormData] = useState({
    funcionario_cpf: funcionarioCpf || '',
    qualificacao_codigo: '',
    data_conclusao: getDataHojeHTML(),
    nota: 5.0,
    instrutor: '',
    local: '',
    modalidade: 'PRESENCIAL',
    observacoes: '',
  });

  const [previewVencimento, setPreviewVencimento] = useState<string | null>(null);

  // Carregar funcionários e tipos
  useEffect(() => {
    if (isOpen) {
      carregarOpcoes();
    }
  }, [isOpen]);

  const calcularPreview = useCallback(async () => {
    const tipo = tipos.find((t) => t.codigo === formData.qualificacao_codigo);
    if (!tipo) return;

    if (!tipo.validade) {
      setPreviewVencimento('Vitalício (sem vencimento)');
      return;
    }

    // Calcular localmente
    const conclusao = new Date(formData.data_conclusao);
    const vencimento = new Date(conclusao);
    vencimento.setMonth(vencimento.getMonth() + tipo.validade);

    if (tipo.vencimento_fim_mes === 1) {
      // Ajustar para fim do mês
      vencimento.setMonth(vencimento.getMonth() + 1);
      vencimento.setDate(0);
    }

    const vencimentoFormatado = vencimento.toLocaleDateString('pt-BR');
    const tipoVenc = tipo.vencimento_fim_mes === 1 ? 'fim do mês' : 'dia exato';
    setPreviewVencimento(`${vencimentoFormatado} (${tipoVenc})`);
  }, [tipos, formData.qualificacao_codigo, formData.data_conclusao]);

  // Calcular preview de vencimento
  useEffect(() => {
    if (formData.qualificacao_codigo && formData.data_conclusao) {
      calcularPreview();
    }
  }, [formData.qualificacao_codigo, formData.data_conclusao, calcularPreview]);

  const carregarOpcoes = async () => {
    try {
      const token = localStorage.getItem('authToken');

      const [funcRes, tiposRes] = await Promise.all([
        fetch(
          'https://airtrust-api.airtrust.workers.dev/api/funcionarios?status=ativos&orderBy=nome&order=ASC',
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        ),
        fetch('https://airtrust-api.airtrust.workers.dev/api/qualificacoes/tipos', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (funcRes.ok) {
        const data = await funcRes.json();
        setFuncionarios(data.data || []);
      }

      if (tiposRes.ok) {
        const data = await tiposRes.json();
        setTipos(data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar opções:', error);
    }
  };

  const validarFormulario = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.funcionario_cpf) {
      newErrors.funcionario_cpf = 'Funcionário é obrigatório';
    }

    if (!formData.qualificacao_codigo) {
      newErrors.qualificacao_codigo = 'Tipo de qualificação é obrigatório';
    }

    if (!formData.data_conclusao) {
      newErrors.data_conclusao = 'Data de conclusão é obrigatória';
    }

    if (formData.nota !== undefined && (formData.nota < 1 || formData.nota > 5)) {
      newErrors.nota = 'Nota deve estar entre 1 e 5';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validarFormulario()) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('authToken');

      const payload = {
        funcionario_cpf: formData.funcionario_cpf?.trim() || null,
        qualificacao_codigo: formData.qualificacao_codigo?.trim() || null,
        data_conclusao: formData.data_conclusao?.trim() || null,
        nota: formData.nota ? Number(formData.nota) : null,
        instrutor: formData.instrutor?.trim() || null,
        local: formData.local?.trim() || null,
        modalidade: formData.modalidade?.trim() || null,
        observacoes: formData.observacoes?.trim() || null,
      };

      const response = await fetch(
        'https://airtrust-api.airtrust.workers.dev/api/qualificacoes/historico',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();

      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setErrors({ submit: data.error || 'Erro ao salvar' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao salvar';
      setErrors({ submit: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Nova Qualificação</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Erro geral */}
          {errors.submit && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-600">{errors.submit}</p>
            </div>
          )}

          {/* Funcionário */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Funcionário <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.funcionario_cpf}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, funcionario_cpf: e.target.value }))
              }
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.funcionario_cpf ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={loading || !!funcionarioCpf}
            >
              <option value="">Selecione um funcionário</option>
              {funcionarios.map((func) => (
                <option key={func.cpf} value={func.cpf}>
                  {func.nome} (Mat: {func.matricula})
                </option>
              ))}
            </select>
            {errors.funcionario_cpf && (
              <p className="text-xs text-red-600 mt-1">{errors.funcionario_cpf}</p>
            )}
          </div>

          {/* Tipo de Qualificação */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Qualificação <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.qualificacao_codigo}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, qualificacao_codigo: e.target.value }))
              }
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.qualificacao_codigo ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={loading}
            >
              <option value="">Selecione um tipo</option>
              {tipos.map((tipo) => (
                <option key={tipo.codigo} value={tipo.codigo}>
                  {tipo.nome} ({tipo.categoria})
                </option>
              ))}
            </select>
            {errors.qualificacao_codigo && (
              <p className="text-xs text-red-600 mt-1">{errors.qualificacao_codigo}</p>
            )}
          </div>

          {/* Data de Conclusão */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Data de Conclusão <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.data_conclusao}
              onChange={(e) => setFormData((prev) => ({ ...prev, data_conclusao: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-lg ${
                errors.data_conclusao ? 'border-red-300' : 'border-gray-300'
              }`}
              disabled={loading}
            />
            {errors.data_conclusao && (
              <p className="text-xs text-red-600 mt-1">{errors.data_conclusao}</p>
            )}
          </div>

          {/* Preview de Vencimento */}
          {previewVencimento && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <Calendar size={16} className="text-blue-600" />
                <span className="font-medium text-blue-900">Vencimento calculado:</span>
                <span className="text-blue-700">{previewVencimento}</span>
              </div>
            </div>
          )}

          {/* Grid de campos adicionais */}
          <div className="grid grid-cols-2 gap-4">
            {/* Nota */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nota (1-5)</label>
              <input
                type="number"
                min="1"
                max="5"
                step="0.1"
                value={formData.nota}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, nota: parseFloat(e.target.value) }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={loading}
              />
            </div>

            {/* Modalidade */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Modalidade</label>
              <select
                value={formData.modalidade}
                onChange={(e) => setFormData((prev) => ({ ...prev, modalidade: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                disabled={loading}
              >
                <option value="PRESENCIAL">Presencial</option>
                <option value="EAD">EAD</option>
                <option value="HIBRIDO">Híbrido</option>
              </select>
            </div>
          </div>

          {/* Instrutor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instrutor/Examinador
            </label>
            <input
              type="text"
              value={formData.instrutor}
              onChange={(e) => setFormData((prev) => ({ ...prev, instrutor: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Nome do instrutor"
              disabled={loading}
            />
          </div>

          {/* Local */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Local</label>
            <input
              type="text"
              value={formData.local}
              onChange={(e) => setFormData((prev) => ({ ...prev, local: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Ex: São Paulo, SBGR"
              disabled={loading}
            />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={formData.observacoes}
              onChange={(e) => setFormData((prev) => ({ ...prev, observacoes: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              rows={3}
              placeholder="Observações adicionais..."
              disabled={loading}
            />
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              disabled={loading}
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

~~~

---
## FILE: src/components/qualificacoes/QualificacaoCard.tsx
~~~tsx
import { Calendar, User, MapPin, Award, FileText, Edit, Trash2 } from 'lucide-react';
import { StatusBadge } from './StatusBadge';
import { formatarData } from '../../utils/formatters';

interface QualificacaoCardProps {
  qualificacao: {
    id: number;
    funcionario_nome: string;
    funcionario_matricula: string;
    qualificacao_nome: string;
    categoria: string;
    data_conclusao: string;
    data_vencimento?: string | null;
    dias_ate_vencimento?: number | null;
    status: 'vigente' | 'expirando' | 'vencida' | 'vitalicio';
    urgencia?: 'critical' | 'high' | 'medium' | 'low';
    nota?: number | null;
    instrutor?: string | null;
    local?: string | null;
  };
  onEdit?: () => void;
  onDelete?: () => void;
  onRenovar?: () => void;
}

export function QualificacaoCard({
  qualificacao,
  onEdit,
  onDelete,
  onRenovar,
}: QualificacaoCardProps) {
  const urgenciaColors = {
    critical: 'border-red-500 bg-red-50',
    high: 'border-orange-500 bg-orange-50',
    medium: 'border-yellow-500 bg-yellow-50',
    low: 'border-green-500 bg-green-50',
  };

  const borderClass = qualificacao.urgencia
    ? urgenciaColors[qualificacao.urgencia]
    : 'border-gray-200 bg-white';

  return (
    <div
      className={`
      rounded-lg border-2 p-4 transition-all hover:shadow-md
      ${borderClass}
    `}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900">{qualificacao.qualificacao_nome}</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
              {qualificacao.categoria}
            </span>
          </div>

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User size={14} />
            <span>{qualificacao.funcionario_nome}</span>
            <span className="text-gray-400">-</span>
            <span className="font-mono text-xs">Mat: {qualificacao.funcionario_matricula}</span>
          </div>
        </div>

        <StatusBadge
          status={qualificacao.status}
          diasAteVencimento={qualificacao.dias_ate_vencimento}
        />
      </div>

      {/* Detalhes */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Calendar size={14} />
          <span>Conclusão: {formatarData(qualificacao.data_conclusao)}</span>
          {qualificacao.data_vencimento && (
            <>
              <span className="text-gray-400">→</span>
              <span>Vencimento: {formatarData(qualificacao.data_vencimento)}</span>
            </>
          )}
        </div>

        {qualificacao.nota && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Award size={14} />
            <span>Nota: {qualificacao.nota.toFixed(1)}/5.0</span>
          </div>
        )}

        {qualificacao.instrutor && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <User size={14} />
            <span>Instrutor: {qualificacao.instrutor}</span>
          </div>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
        {qualificacao.status === 'expirando' || qualificacao.status === 'vencida' ? (
          <button
            onClick={onRenovar}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <FileText size={14} className="inline mr-1" />
            Renovar Agora
          </button>
        ) : (
          <button
            onClick={onRenovar}
            className="flex-1 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <FileText size={14} className="inline mr-1" />
            Renovar
          </button>
        )}

        {onEdit && (
          <button
            onClick={onEdit}
            className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <Edit size={14} />
          </button>
        )}

        {onDelete && (
          <button
            onClick={onDelete}
            className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Alerta de urgência */}
      {qualificacao.urgencia === 'critical' && (
        <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded text-xs text-red-700 font-medium">
          ⚠️ AÇÃO URGENTE: Esta qualificação requer renovação imediata
        </div>
      )}
    </div>
  );
}

~~~

---
## FILE: src/components/qualificacoes/QualificacoesCalendario.tsx
~~~tsx
import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, User } from 'lucide-react';

interface QualificacaoItem {
  id: number;
  data_conclusao?: string;
  data_realizacao?: string;
  data_vencimento?: string;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
  funcionario_nome?: string;
  qualificacao_status?: string;
  instrutor?: string | null;
  observacoes?: string | null;
  tipo_treinamento?: string;
}

interface Props {
  qualificacoes: QualificacaoItem[];
  onOpenQualificacao?: (qualificacao: QualificacaoItem) => void;
}

interface CalendarCell {
  date: string;
  outside: boolean;
}

function buildCalendarCells(month: string): CalendarCell[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];

  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const lastDay = new Date(year, monthNumber, 0);
  const offset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const cells: CalendarCell[] = [];

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

function obterMesAnterior(mes: string): string {
  const [year, month] = mes.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function obterProximoMes(mes: string): string {
  const [year, month] = mes.split('-').map(Number);
  if (month === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  );
}

function formatDateLabel(value?: string): string {
  if (!value) return 'Sem data';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function getEventoData(item: QualificacaoItem): string {
  return (item.data_realizacao || item.data_conclusao || '').slice(0, 10);
}

function getTipoBadgeClass(tipo?: string): string {
  if (tipo === 'INICIAL') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  if (tipo === 'SEMESTRAL') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  return 'bg-sky-50 text-sky-700 ring-1 ring-sky-200';
}

function getTipoLabel(tipo?: string): string {
  if (tipo === 'INICIAL') return 'Inicial';
  if (tipo === 'SEMESTRAL') return 'Semestral';
  return 'Periodico';
}

function sortQualificacoes(left: QualificacaoItem, right: QualificacaoItem): number {
  const leftName = `${left.qualificacao_nome || ''}${left.funcionario_nome || ''}`;
  const rightName = `${right.qualificacao_nome || ''}${right.funcionario_nome || ''}`;
  return leftName.localeCompare(rightName, 'pt-BR');
}

export function QualificacoesCalendario({ qualificacoes, onOpenQualificacao }: Props) {
  const hoje = new Date().toISOString().split('T')[0];
  const [mesReferencia, setMesReferencia] = useState(() => {
    const primeiraData = [...qualificacoes]
      .map((item) => getEventoData(item))
      .filter(Boolean)
      .sort()[0];
    return (primeiraData || hoje).slice(0, 7);
  });

  const calendarCells = useMemo(() => buildCalendarCells(mesReferencia), [mesReferencia]);

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, QualificacaoItem[]>();
    qualificacoes.forEach((item) => {
      const data = getEventoData(item);
      if (!data) return;

      const current = map.get(data) || [];
      current.push(item);
      current.sort(sortQualificacoes);
      map.set(data, current);
    });
    return map;
  }, [qualificacoes]);

  const diasSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-lg font-semibold capitalize text-slate-900">
            {formatMonthLabel(mesReferencia)}
          </p>
          <p className="text-sm text-slate-500">
            {qualificacoes.length === 0
              ? 'Sem qualificacoes planejadas para exibir.'
              : `${qualificacoes.length} qualificacao(oes) planejada(s) acompanhadas neste calendario`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMesReferencia(obterMesAnterior(mesReferencia))}
            className="rounded-xl p-2 transition hover:bg-slate-100"
            title="Mes anterior"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <button
            type="button"
            onClick={() => setMesReferencia(obterProximoMes(mesReferencia))}
            className="rounded-xl p-2 transition hover:bg-slate-100"
            title="Proximo mes"
          >
            <ChevronRight className="h-5 w-5 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {diasSemana.map((dia) => (
          <div key={dia} className="rounded-xl bg-slate-100 px-2 py-2">
            {dia}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {calendarCells.map((cell) => {
          const eventos = eventosPorDia.get(cell.date) || [];
          const isToday = cell.date === hoje;

          return (
            <div
              key={cell.date}
              className={`min-h-[150px] rounded-2xl border p-2.5 transition ${
                cell.outside ? 'border-slate-100 bg-slate-50/70' : 'border-slate-200 bg-white'
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

              <div className="space-y-2">
                {eventos.slice(0, 3).map((evento) => (
                  <button
                    key={evento.id}
                    type="button"
                    onClick={() => onOpenQualificacao?.(evento)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-primary-200 hover:bg-primary-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {evento.qualificacao_nome || 'Qualificacao planejada'}
                      </p>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getTipoBadgeClass(
                          evento.tipo_treinamento,
                        )}`}
                      >
                        {getTipoLabel(evento.tipo_treinamento)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {evento.qualificacao_codigo || 'Sem codigo'}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <User className="h-3 w-3" />
                      <span className="truncate">
                        {evento.funcionario_nome || 'Funcionario nao informado'}
                      </span>
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Clock3 className="h-3 w-3" />
                      <span>{formatDateLabel(getEventoData(evento))}</span>
                    </p>
                  </button>
                ))}

                {eventos.length > 3 && (
                  <p className="px-1 text-xs font-medium text-slate-500">
                    +{eventos.length - 3} evento(s) neste dia
                  </p>
                )}

                {eventos.length === 0 && !cell.outside && (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400">
                    Sem qualificacoes planejadas
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900">{qualificacoes.length}</div>
          <div className="text-xs text-slate-600">Total de qualificacoes</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-center">
          <div className="text-2xl font-bold text-sky-600">
            {
              qualificacoes.filter((item) => {
                const data = getEventoData(item);
                return data > hoje;
              }).length
            }
          </div>
          <div className="text-xs text-slate-600">Futuras</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">
            {
              qualificacoes.filter((item) => {
                const data = getEventoData(item);
                return data <= hoje;
              }).length
            }
          </div>
          <div className="text-xs text-slate-600">Atrasadas</div>
        </div>
      </div>

      {qualificacoes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          <CalendarDays className="mx-auto mb-3 h-6 w-6 text-slate-300" />
          Nenhuma qualificacao planejada encontrada para o periodo atual.
        </div>
      )}
    </div>
  );
}

~~~

---
## FILE: src/components/qualificacoes/StatusBadge.tsx
~~~tsx
import { CheckCircle, Clock, AlertCircle, Shield } from 'lucide-react';

interface StatusBadgeProps {
  status: 'vigente' | 'expirando' | 'vencida' | 'vitalicio';
  diasAteVencimento?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, diasAteVencimento, size = 'md' }: StatusBadgeProps) {
  const configs = {
    vigente: {
      icon: CheckCircle,
      bgColor: 'bg-green-50',
      textColor: 'text-green-700',
      borderColor: 'border-green-200',
      label: 'Vigente',
    },
    expirando: {
      icon: Clock,
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-700',
      borderColor: 'border-yellow-200',
      label: 'Expirando',
    },
    vencida: {
      icon: AlertCircle,
      bgColor: 'bg-red-50',
      textColor: 'text-red-700',
      borderColor: 'border-red-200',
      label: 'Vencida',
    },
    vitalicio: {
      icon: Shield,
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
      borderColor: 'border-blue-200',
      label: 'Vitalício',
    },
  };

  const config = configs[status];
  const Icon = config.icon;

  const sizes = {
    sm: { icon: 12, text: 'text-xs', px: 'px-2', py: 'py-0.5' },
    md: { icon: 14, text: 'text-sm', px: 'px-2.5', py: 'py-1' },
    lg: { icon: 16, text: 'text-base', px: 'px-3', py: 'py-1.5' },
  };

  const sizeConfig = sizes[size];

  return (
    <span
      className={`
      inline-flex items-center gap-1.5 rounded-full border
      ${config.bgColor} ${config.textColor} ${config.borderColor}
      ${sizeConfig.px} ${sizeConfig.py} ${sizeConfig.text}
      font-medium
    `}
    >
      <Icon size={sizeConfig.icon} />
      {config.label}
      {diasAteVencimento !== null && diasAteVencimento !== undefined && (
        <span className="font-normal opacity-75">
          (
          {diasAteVencimento > 0
            ? `${diasAteVencimento}d`
            : `${Math.abs(diasAteVencimento)}d atrás`}
          )
        </span>
      )}
    </span>
  );
}

~~~

---
## FILE: src/components/shared/ErrorMessage.tsx
~~~tsx
import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorMessageProps {
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
  variant?: 'error' | 'warning' | 'info';
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({
  title = 'Erro',
  message,
  onClose,
  className = '',
  variant = 'error'
}) => {
  const variantClasses = {
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  const iconColors = {
    error: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600'
  };

  return (
    <div className={`border-l-4 p-4 rounded-r-lg ${variantClasses[variant]} ${className}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertCircle className={`h-5 w-5 ${iconColors[variant]}`} />
        </div>
        <div className="ml-3 flex-1">
          {title && <h3 className="text-sm font-medium">{title}</h3>}
          <div className={`text-sm ${title ? 'mt-1' : ''}`}>
            {message}
          </div>
        </div>
        {onClose && (
          <div className="ml-auto pl-3">
            <div className="-mx-1.5 -my-1.5">
              <button
                type="button"
                className={`inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${iconColors[variant]} hover:bg-red-100`}
                onClick={onClose}
              >
                <span className="sr-only">Dispensar</span>
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

~~~

---
## FILE: src/components/shared/Modal.tsx
~~~tsx
import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  className = ''
}) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-full mx-4'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} max-h-[90vh] overflow-y-auto ${className}`}>
        {title && (
          <div className="flex justify-between items-center p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        )}

        <div className={title ? 'p-6' : 'p-6'}>
          {children}
        </div>
      </div>
    </div>
  );
};

~~~

---
## FILE: src/components/shared/Pagination.tsx
~~~tsx
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  hasNext: boolean;
  hasPrev: boolean;
  total?: number;
  limit?: number;
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  hasNext,
  hasPrev,
  total,
  limit,
  onLimitChange,
  limitOptions = [50, 100],
}: PaginationProps) {
  const pages: number[] = [];
  const maxButtons = 5;

  let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
  let endPage = Math.min(totalPages, startPage + maxButtons - 1);

  if (endPage - startPage < maxButtons - 1) {
    startPage = Math.max(1, endPage - maxButtons + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
      {/* Mobile */}
      <div className="flex justify-between sm:hidden w-full">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={!hasPrev}
          className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Anterior
        </button>

        {onLimitChange && (
          <select
            value={limit}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10);
              if (!isNaN(next)) onLimitChange(next);
            }}
            className="mx-3 flex-1 rounded-md border border-gray-300 bg-white px-2 py-2 text-sm text-gray-700"
            aria-label="Itens por página"
          >
            {limitOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}/p
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={!hasNext}
          className="relative ml-3 inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Próxima
        </button>
      </div>

      {/* Desktop */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Página <span className="font-medium">{currentPage}</span> de{' '}
            <span className="font-medium">{totalPages}</span>
            {total && limit && (
              <>
                {' '}
                • Mostrando <span className="font-medium">{Math.min(limit, total)}</span> de{' '}
                <span className="font-medium">{total}</span> registros
              </>
            )}
          </p>
        </div>

        {onLimitChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Itens por página:</span>
            <select
              value={limit}
              onChange={(e) => {
                const next = parseInt(e.target.value, 10);
                if (!isNaN(next)) onLimitChange(next);
              }}
              className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700"
            >
              {limitOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <nav
            className="relative z-0 inline-flex -space-x-px rounded-md shadow-sm"
            aria-label="Pagination"
          >
            {/* Botão Anterior */}
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={!hasPrev}
              className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-l-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Página anterior"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {/* Números de Página */}
            {pages.map((page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-medium border ${
                  page === currentPage
                    ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                    : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                }`}
                aria-label={`Página ${page}`}
                aria-current={page === currentPage ? 'page' : undefined}
              >
                {page}
              </button>
            ))}

            {/* Botão Próxima */}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={!hasNext}
              className="relative inline-flex items-center px-2 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-r-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Próxima página"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}

~~~

---
## FILE: src/components/shared/index.ts
~~~typescript
export * from './Button';
export * from './LoadingSpinner';
export * from './ErrorMessage';
export * from './Badge';
export * from './Card';
export * from './DataTable';
export * from './Modal';

~~~

---
## FILE: src/components/ui/Button.tsx
~~~tsx
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: string;
  children: React.ReactNode;
}

export function Button({
  variant = 'primary',
  icon,
  children,
  className = '',
  ...props
}: ButtonProps) {
  const baseClasses =
    'h-10 px-4 py-2 font-medium rounded-lg transition-all duration-200 flex items-center gap-2 justify-center disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-primary-600 text-white shadow-sm hover:bg-primary-700 hover:shadow',
    secondary: 'bg-white border border-gray-300 text-slate-700 hover:bg-gray-50',
    ghost: 'text-primary-600 hover:bg-primary-50',
    danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow',
  };

  return (
    <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>
      {icon && <span className="material-symbols-outlined text-lg">{icon}</span>}
      {children}
    </button>
  );
}

~~~

---
## FILE: src/components/ui/DataTable.tsx
~~~tsx
import { useState, useMemo, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { buildUserScopedStorageKey } from '../../react-app/utils/userPreferences';

export interface Column<T> {
  id: string;
  label: string;
  accessor: (row: T) => unknown;
  sortable?: boolean;
  visible?: boolean;
  render?: (value: unknown, row: T) => React.ReactNode;
  width?: string;
  minWidth?: string;
}

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig {
  column: string | null;
  direction: SortDirection;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onColumnVisibilityChange?: (columnId: string, visible: boolean) => void;
  onColumnOrderChange?: (newOrder: string[]) => void;
  loading?: boolean;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  actions?: (row: T) => React.ReactNode;
  tableId?: string; // Unique identifier for localStorage
  // Column config control (optional controlled mode)
  columnConfigOpen?: boolean;
  onColumnConfigOpenChange?: (open: boolean) => void;
  showInternalColumnConfigButton?: boolean; // default: true. When false, hide internal trigger
  // Pagination
  page?: number; // 1-based page index (controlled)
  total?: number; // total items (when server-side)
  pageSize?: number; // page size (controlled)
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[]; // default: [50, 100]
  // Server-side sorting
  sortConfig?: SortConfig; // controlled sort state
  onSortChange?: (sortConfig: SortConfig) => void; // callback when sort changes
  virtualizeRows?: boolean;
  virtualizeThreshold?: number;
  estimatedRowHeight?: number;
  maxTableHeight?: number;
  enableColumnWidthConfig?: boolean;
}

export function DataTable<T extends { id?: string | number }>({
  data,
  columns: initialColumns,
  onColumnVisibilityChange,
  onColumnOrderChange,
  loading,
  emptyState,
  onRowClick,
  rowClassName,
  actions,
  tableId = 'default-table',
  // column config
  columnConfigOpen,
  onColumnConfigOpenChange,
  showInternalColumnConfigButton = true,
  // pagination
  page,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [50, 100],
  // sorting
  sortConfig: controlledSortConfig,
  onSortChange,
  virtualizeRows = true,
  virtualizeThreshold = 80,
  estimatedRowHeight = 52,
  maxTableHeight = 600,
  enableColumnWidthConfig = true,
}: DataTableProps<T>) {
  // localStorage key for this table (scoped by logged user)
  const storageKey = buildUserScopedStorageKey(`airtrust_datatable_${tableId}`);

  const getInitialPageSize = () => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return pageSizeOptions[0] ?? 50;
      const config = JSON.parse(saved) as { pageSize?: number };
      if (typeof config.pageSize === 'number' && config.pageSize > 0) {
        return config.pageSize;
      }
    } catch {
      // ignore parse errors and keep default
    }
    return pageSizeOptions[0] ?? 50;
  };

  const [internalSortColumn, setInternalSortColumn] = useState<string | null>(null);
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>(null);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [columns, setColumns] = useState(initialColumns);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const resizeStateRef = useRef<{
    columnId: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  // Internal pagination state (used when uncontrolled / client-side)
  const [internalPage, setInternalPage] = useState<number>(1);
  const [internalPageSize, setInternalPageSize] = useState<number>(getInitialPageSize);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Use controlled sort if provided, otherwise use internal state
  const sortColumn = controlledSortConfig?.column ?? internalSortColumn;
  const sortDirection = controlledSortConfig?.direction ?? internalSortDirection;

  // Load saved configuration on mount
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const config = JSON.parse(saved);
        const widths = (config.widths ?? {}) as Record<string, string | undefined>;

        // Apply saved column visibility
        const updatedColumns = initialColumns.map((col) => ({
          ...col,
          visible: config.visibility?.[col.id] !== false,
          width: widths[col.id] || col.width,
        }));

        if (typeof config.pageSize === 'number' && config.pageSize > 0) {
          setInternalPageSize(config.pageSize);
        }

        // Apply saved column order if available
        if (config.order && config.order.length === updatedColumns.length) {
          const orderedColumns = config.order
            .map((id: string) => updatedColumns.find((col) => col.id === id))
            .filter(Boolean) as Column<T>[];
          setColumns(orderedColumns);
        } else {
          setColumns(updatedColumns);
        }
      } catch {
        // If JSON parsing fails, just use initial columns
        setColumns(initialColumns);
      }
    } else {
      setColumns(initialColumns);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]); // Apenas tableId como dependência para evitar resetar config

  // Keep column definitions fresh when parent render/accessor functions change,
  // while preserving the user's current order and visibility preferences.
  useEffect(() => {
    setColumns((prevColumns) => {
      if (prevColumns.length === 0) {
        return initialColumns;
      }

      const previousById = new Map(prevColumns.map((column) => [column.id, column]));
      const mergedColumns = initialColumns.map((column) => {
        const previous = previousById.get(column.id);
        return previous ? { ...column, visible: previous.visible, width: previous.width } : column;
      });

      const previousOrder = prevColumns.map((column) => column.id);
      const orderedColumns = [
        ...previousOrder
          .map((id) => mergedColumns.find((column) => column.id === id))
          .filter(Boolean),
        ...mergedColumns.filter((column) => !previousOrder.includes(column.id)),
      ] as Column<T>[];

      const changed =
        orderedColumns.length !== prevColumns.length ||
        orderedColumns.some((column, index) => column !== prevColumns[index]);

      return changed ? orderedColumns : prevColumns;
    });
  }, [initialColumns]);

  // Save configuration to localStorage whenever columns change
  const saveConfiguration = (updatedColumns: Column<T>[]) => {
    try {
      const config = {
        visibility: updatedColumns.reduce(
          (acc, col) => ({
            ...acc,
            [col.id]: col.visible !== false,
          }),
          {} as Record<string, boolean>,
        ),
        order: updatedColumns.map((col) => col.id),
        widths: updatedColumns.reduce(
          (acc, col) => ({
            ...acc,
            [col.id]: col.width,
          }),
          {} as Record<string, string | undefined>,
        ),
        pageSize: pageSize ?? internalPageSize,
      };
      localStorage.setItem(storageKey, JSON.stringify(config));
    } catch (err) {
      console.warn('Failed to save table configuration:', err);
    }
  };

  // Filtrar colunas visíveis
  const visibleColumns = useMemo(() => {
    return columns.filter((col) => col.visible !== false);
  }, [columns]);

  // Ordenar dados
  // Skip client-side sorting when server-side sorting is active
  const sortedData = useMemo(() => {
    // If server-side sorting is enabled, assume data is already sorted by the server
    if (typeof onSortChange === 'function') return data;

    if (!sortColumn || !sortDirection) return data;

    const column = columns.find((col) => col.id === sortColumn);
    if (!column) return data;

    return [...data].sort((a, b) => {
      const aValue = column.accessor(a);
      const bValue = column.accessor(b);

      if (aValue === bValue) return 0;

      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue, 'pt-BR');
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (aValue instanceof Date && bValue instanceof Date) {
        comparison = aValue.getTime() - bValue.getTime();
      } else {
        comparison = String(aValue).localeCompare(String(bValue), 'pt-BR');
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortColumn, sortDirection, columns, onSortChange]);

  // Pagination calculations
  const effectivePageSize = pageSize ?? internalPageSize;
  const effectivePage = page ?? internalPage;
  const effectiveTotal = total ?? sortedData.length;

  const totalPages = Math.max(1, Math.ceil(effectiveTotal / Math.max(1, effectivePageSize)));
  const currentPage = Math.min(Math.max(1, effectivePage), totalPages);
  const startIndex = (currentPage - 1) * effectivePageSize;
  const endIndex = Math.min(startIndex + effectivePageSize, effectiveTotal);

  // If server-side pagination (total provided and caller controls the page), assume data is already sliced
  // Also skip client-side sorting when server-side sorting is enabled
  const isServerPaginated = typeof total === 'number' && typeof onPageChange === 'function';
  const isServerSorted = typeof onSortChange === 'function';
  const displayData =
    isServerPaginated || isServerSorted ? sortedData : sortedData.slice(startIndex, endIndex);
  const shouldVirtualize = virtualizeRows && displayData.length >= virtualizeThreshold;
  const rowVirtualizer = useVirtualizer({
    count: displayData.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan: 8,
  });
  const virtualRows = shouldVirtualize ? rowVirtualizer.getVirtualItems() : [];

  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [currentPage, effectivePageSize, displayData.length]);

  const handleSort = (columnId: string) => {
    const column = columns.find((col) => col.id === columnId);
    if (!column?.sortable) return;

    let newDirection: SortDirection = 'asc';
    let newColumn: string | null = columnId;

    if (sortColumn === columnId) {
      if (sortDirection === 'asc') {
        newDirection = 'desc';
      } else if (sortDirection === 'desc') {
        newDirection = null;
        newColumn = null;
      }
    }

    // Server-side sorting: call callback
    if (onSortChange) {
      onSortChange({ column: newColumn, direction: newDirection });
    } else {
      // Client-side sorting: update internal state
      setInternalSortColumn(newColumn);
      setInternalSortDirection(newDirection);
    }
  };

  const toggleColumnVisibility = (columnId: string) => {
    const newColumns = columns.map((col) =>
      col.id === columnId ? { ...col, visible: col.visible === false ? true : false } : col,
    );
    setColumns(newColumns);
    saveConfiguration(newColumns);
    onColumnVisibilityChange?.(
      columnId,
      newColumns.find((c) => c.id === columnId)?.visible !== false,
    );
  };

  const updateColumnWidth = (columnId: string, widthPx: number | null) => {
    const newColumns = columns.map((col) => {
      if (col.id !== columnId) return col;
      return {
        ...col,
        width: widthPx && widthPx > 0 ? `${Math.max(120, Math.round(widthPx))}px` : undefined,
      };
    });

    setColumns(newColumns);
    saveConfiguration(newColumns);
  };

  const getColumnWidthInputValue = (width?: string) => {
    if (!width) return '';
    const normalized = String(width).trim().toLowerCase();
    if (normalized.endsWith('rem')) {
      const remValue = Number.parseFloat(normalized.replace('rem', ''));
      return Number.isFinite(remValue) ? String(Math.round(remValue * 16)) : '';
    }
    const pxValue = Number.parseFloat(normalized.replace('px', ''));
    return Number.isFinite(pxValue) ? String(Math.round(pxValue)) : '';
  };

  const handleDragStart = (columnId: string) => {
    setDraggedColumnId(columnId);
  };

  const handleDragOver = (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    if (!draggedColumnId || draggedColumnId === targetColumnId) return;

    const draggedIndex = columns.findIndex((col) => col.id === draggedColumnId);
    const targetIndex = columns.findIndex((col) => col.id === targetColumnId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const newColumns = [...columns];
    const [draggedColumn] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumn);

    setColumns(newColumns);
    saveConfiguration(newColumns);
    onColumnOrderChange?.(newColumns.map((col) => col.id));
  };

  const handleDragEnd = () => {
    setDraggedColumnId(null);
  };

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      const nextWidth = resizeState.startWidth + (event.clientX - resizeState.startX);

      setColumns((prevColumns) =>
        prevColumns.map((column) =>
          column.id === resizeState.columnId
            ? { ...column, width: `${Math.max(120, Math.round(nextWidth))}px` }
            : column,
        ),
      );
    };

    const handleMouseUp = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setColumns((currentColumns) => {
        saveConfiguration(currentColumns);
        return currentColumns;
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const beginResize = (event: React.MouseEvent, columnId: string, width?: string) => {
    event.preventDefault();
    event.stopPropagation();

    const parsedWidth = Number.parseFloat(String(width || '').replace('px', ''));
    const fallbackWidth = 180;
    resizeStateRef.current = {
      columnId,
      startX: event.clientX,
      startWidth: Number.isFinite(parsedWidth) ? parsedWidth : fallbackWidth,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const getSortIcon = (columnId: string) => {
    if (sortColumn !== columnId) {
      return <span className="material-symbols-outlined text-slate-400">unfold_more</span>;
    }
    if (sortDirection === 'asc') {
      return <span className="material-symbols-outlined text-primary-600">arrow_upward</span>;
    }
    return <span className="material-symbols-outlined text-primary-600">arrow_downward</span>;
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4 block animate-pulse">
          hourglass_empty
        </span>
        <p className="text-slate-500">Carregando dados...</p>
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="relative">
      {/* Column Config Button */}
      {showInternalColumnConfigButton && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() =>
              columnConfigOpen === undefined
                ? setShowColumnConfig((prev) => !prev)
                : onColumnConfigOpenChange?.(!columnConfigOpen)
            }
            className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <span className="material-symbols-outlined text-base">view_column</span>
            <span>Configurar Colunas</span>
          </button>
        </div>
      )}

      {/* Column Configuration Panel */}
      {(columnConfigOpen ?? showColumnConfig) && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Configurar Colunas</h3>
            <span className="text-xs text-slate-500">
              <span className="material-symbols-outlined text-base align-middle">
                drag_indicator
              </span>
              Arraste para reordenar
            </span>
          </div>
          <div className="space-y-2">
            {columns.map((column) => (
              <div
                key={column.id}
                draggable
                onDragStart={() => handleDragStart(column.id)}
                onDragOver={(e) => handleDragOver(e, column.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 rounded-md bg-white px-3 py-2.5 text-sm border border-slate-200 transition-all cursor-move hover:border-primary-300 hover:shadow-sm ${
                  draggedColumnId === column.id ? 'opacity-50 scale-95' : ''
                }`}
              >
                <span className="material-symbols-outlined text-slate-400 text-lg">
                  drag_indicator
                </span>
                <label className="flex flex-1 items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={column.visible !== false}
                    onChange={() => toggleColumnVisibility(column.id)}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-600"
                  />
                  <span className="text-slate-700 font-medium">{column.label}</span>
                </label>
                {enableColumnWidthConfig && (
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500">
                    {getColumnWidthInputValue(column.width) || 'auto'} px
                  </span>
                )}
                {column.sortable && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                    Ordenável
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div
        ref={tableContainerRef}
        className="airtrust-table-container overflow-x-auto overflow-y-auto border border-slate-200 rounded-lg"
        style={{ maxHeight: `${maxTableHeight}px` }}
      >
        <table className="w-full table-fixed text-left text-sm">
          <colgroup>
            {visibleColumns.map((column) => (
              <col
                key={column.id}
                style={
                  column.width || column.minWidth
                    ? {
                        width: column.width,
                        minWidth: column.minWidth || column.width,
                      }
                    : undefined
                }
              />
            ))}
            {actions && <col style={{ width: '140px', minWidth: '140px' }} />}
          </colgroup>
          <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 shadow-[0_1px_0_0_rgba(148,163,184,0.25)]">
            <tr>
              {visibleColumns.map((column) => (
                <th
                  key={column.id}
                  className={`relative px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 whitespace-nowrap ${
                    column.sortable ? 'cursor-pointer select-none hover:bg-slate-100' : ''
                  }`}
                  onClick={() => column.sortable && handleSort(column.id)}
                >
                  <div className="flex items-center gap-2">
                    <span>{column.label}</span>
                    {column.sortable && <span className="text-lg">{getSortIcon(column.id)}</span>}
                  </div>
                  <div
                    className="absolute right-0 top-0 h-full w-3 cursor-col-resize select-none"
                    onMouseDown={(event) => beginResize(event, column.id, column.width)}
                  />
                </th>
              ))}
              {actions && (
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-600 text-right whitespace-nowrap">
                  Ações
                </th>
              )}
            </tr>
          </thead>
          {shouldVirtualize ? (
            <tbody
              className="relative block divide-y divide-slate-200 bg-white"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {virtualRows.map((virtualRow) => {
                const row = displayData[virtualRow.index];
                if (!row) return null;

                return (
                  <tr
                    key={row.id || virtualRow.index}
                    className={`absolute left-0 transition-colors hover:bg-slate-50 ${
                      onRowClick ? 'cursor-pointer' : ''
                    } ${rowClassName ? rowClassName(row) : ''}`}
                    style={{
                      transform: `translateY(${virtualRow.start}px)`,
                      height: `${virtualRow.size}px`,
                      width: '100%',
                      display: 'table',
                      tableLayout: 'fixed',
                    }}
                    onClick={() => onRowClick?.(row)}
                  >
                    {visibleColumns.map((column) => {
                      const value = column.accessor(row);
                      const contentClassName = column.render
                        ? 'min-w-0 max-w-full overflow-hidden'
                        : 'airtrust-cell-content min-w-0 max-w-full';
                      return (
                        <td key={column.id} className="px-4 py-3 text-sm align-middle">
                          <div className={contentClassName}>
                            {column.render ? column.render(value, row) : String(value ?? '')}
                          </div>
                        </td>
                      );
                    })}
                    {actions && (
                      <td
                        className="px-4 py-3 text-sm align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-2">{actions(row)}</div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          ) : (
            <tbody className="divide-y divide-slate-200 bg-white">
              {displayData.map((row, index) => (
                <tr
                  key={row.id || index}
                  className={`transition-colors hover:bg-slate-50 ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${rowClassName ? rowClassName(row) : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {visibleColumns.map((column) => {
                    const value = column.accessor(row);
                    const contentClassName = column.render
                      ? 'min-w-0 max-w-full overflow-hidden'
                      : 'airtrust-cell-content min-w-0 max-w-full';
                    return (
                      <td key={column.id} className="px-4 py-3 text-sm align-middle">
                        <div className={contentClassName}>
                          {column.render ? column.render(value, row) : String(value ?? '')}
                        </div>
                      </td>
                    );
                  })}
                  {actions && (
                    <td className="px-4 py-3 text-sm" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">{actions(row)}</div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      {/* Pagination footer */}
      <div className="mt-4 flex items-center justify-between px-2">
        {/* Page size selector */}
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span>Itens por página:</span>
          <select
            className="rounded-md border border-slate-300 px-2 py-1 text-sm focus:border-primary-600 focus:outline-none focus:ring-1 focus:ring-primary-600"
            value={effectivePageSize}
            onChange={(e) => {
              const size = parseInt(e.target.value, 10) || pageSizeOptions[0] || 50;
              if (onPageSizeChange) onPageSizeChange(size);
              else setInternalPageSize(size);
              localStorage.setItem(
                storageKey,
                JSON.stringify({
                  ...(() => {
                    try {
                      return JSON.parse(localStorage.getItem(storageKey) || '{}');
                    } catch {
                      return {};
                    }
                  })(),
                  pageSize: size,
                }),
              );
              // reset page to 1
              if (onPageChange) onPageChange(1);
              else setInternalPage(1);
            }}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* Range and nav */}
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span>
            {effectiveTotal === 0
              ? '0–0 de 0'
              : `${startIndex + 1}–${
                  isServerPaginated ? startIndex + displayData.length : endIndex
                } de ${effectiveTotal}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
              disabled={currentPage <= 1}
              onClick={() => {
                const next = currentPage - 1;
                if (onPageChange) {
                  onPageChange(next);
                  // Scroll to top da tabela
                  setTimeout(() => {
                    const tableContainer = document.querySelector('.airtrust-table-container');
                    if (tableContainer) {
                      tableContainer.scrollTop = 0;
                    }
                  }, 0);
                } else {
                  setInternalPage(next);
                }
              }}
            >
              Anterior
            </button>
            <button
              className="rounded-md border border-slate-300 px-2 py-1 text-sm disabled:opacity-50"
              disabled={currentPage >= totalPages}
              onClick={() => {
                const next = currentPage + 1;
                if (onPageChange) {
                  onPageChange(next);
                  // Scroll to top da tabela
                  setTimeout(() => {
                    const tableContainer = document.querySelector('.airtrust-table-container');
                    if (tableContainer) {
                      tableContainer.scrollTop = 0;
                    }
                  }, 0);
                } else {
                  setInternalPage(next);
                }
              }}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

~~~

---
## FILE: src/components/ui/Form.tsx
~~~tsx
import React from 'react';

interface FormFieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

export function FormField({ label, required, error, hint, children }: FormFieldProps) {
  return (
    <div className="mb-4">
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-danger-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-xs text-danger-600">
          <span className="material-symbols-outlined text-sm">error</span>
          {error}
        </p>
      )}
    </div>
  );
}

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export function TextInput({ error, className = '', ...props }: TextInputProps) {
  return (
    <input
      {...props}
      className={`w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${
        error
          ? 'border-danger-300 focus:border-danger-600 focus:ring-danger-600/20'
          : 'border-slate-300 focus:border-primary-600 focus:ring-primary-600/20'
      } ${className}`}
    />
  );
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export function TextArea({ error, className = '', ...props }: TextAreaProps) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${
        error
          ? 'border-danger-300 focus:border-danger-600 focus:ring-danger-600/20'
          : 'border-slate-300 focus:border-primary-600 focus:ring-primary-600/20'
      } ${className}`}
    />
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
  options: { value: string | number; label: string }[];
}

export function Select({ error, options, className = '', ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={`w-full rounded-md border px-3 py-2 text-sm transition-colors focus:outline-none focus:ring-2 ${
        error
          ? 'border-danger-300 focus:border-danger-600 focus:ring-danger-600/20'
          : 'border-slate-300 focus:border-primary-600 focus:ring-primary-600/20'
      } ${className}`}
    >
      <option value="">Selecione...</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface FormActionsProps {
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  submitDisabled?: boolean;
}

export function FormActions({
  onCancel,
  onSubmit,
  submitLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  loading,
  submitDisabled,
}: FormActionsProps) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onSubmit}
        disabled={loading || submitDisabled}
        className="flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {loading ? (
          <>
            <span className="material-symbols-outlined text-base animate-spin">refresh</span>
            Salvando...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-base">check</span>
            {submitLabel}
          </>
        )}
      </button>
    </>
  );
}

~~~

---
## FILE: src/components/ui/Input.tsx
~~~tsx
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: string;
  error?: string;
}

export function Input({ label, icon, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}

      <div className="relative">
        {icon && (
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
            {icon}
          </span>
        )}

        <input
          className={`
            w-full h-10 ${icon ? 'pl-10' : 'pl-3'} pr-3 py-2 
            border ${error ? 'border-red-500 ring-2 ring-red-500/20' : 'border-gray-300'}
            rounded-lg bg-white text-slate-900 
            placeholder:text-slate-400 
            focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 
            outline-none transition-all
            disabled:bg-gray-50 disabled:text-slate-500 disabled:cursor-not-allowed
            ${className}
          `}
          {...props}
        />
      </div>

      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

~~~

---
## FILE: src/components/ui/KPICard.tsx
~~~tsx
import React from 'react';

interface KPICardProps {
  label: string;
  value: number | string;
  icon?: string;
  color?: 'default' | 'success' | 'warning' | 'danger';
  trend?: string;
  trendDirection?: 'up' | 'down';
}

export function KPICard({
  label,
  value,
  icon,
  color = 'default',
  trend,
  trendDirection,
}: KPICardProps) {
  const iconColors = {
    default: 'text-primary-600',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-red-600',
  };

  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">{label}</p>
          <p className="text-3xl font-bold text-slate-900 mt-2">{value}</p>
          {trend && (
            <p
              className={`text-sm mt-1 flex items-center gap-1 ${
                trendDirection ? trendColors[trendDirection] : 'text-slate-600'
              }`}
            >
              {trendDirection && (
                <span className="material-symbols-outlined text-sm">
                  {trendDirection === 'up' ? 'trending_up' : 'trending_down'}
                </span>
              )}
              {trend}
            </p>
          )}
        </div>
        {icon && (
          <span className={`material-symbols-outlined text-4xl ${iconColors[color]}`}>{icon}</span>
        )}
      </div>
    </div>
  );
}

~~~

---
## FILE: src/components/ui/KPICardNew.tsx
~~~tsx
import React from 'react';

interface KPICardNewProps {
  label: string;
  value: string | number;
  change?: string;
  changeDirection?: 'up' | 'down';
  variant?: 'default' | 'warning' | 'danger' | 'success';
}

export function KPICardNew({
  label,
  value,
  change,
  changeDirection,
  variant = 'default',
}: KPICardNewProps) {
  const variantStyles = {
    default: 'text-slate-900',
    warning: 'text-warning-600',
    danger: 'text-danger-600',
    success: 'text-success-600',
  };

  const changeStyles =
    changeDirection === 'up'
      ? 'text-success-600'
      : changeDirection === 'down'
      ? 'text-danger-600'
      : 'text-slate-500';

  return (
    <div className="flex flex-1 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-6">
      <p className="text-base font-medium leading-normal text-slate-600">{label}</p>
      <div className="flex items-baseline gap-3">
        <p className={`text-4xl font-bold leading-tight tracking-tight ${variantStyles[variant]}`}>
          {value}
        </p>
        {change && <p className={`text-sm font-medium leading-normal ${changeStyles}`}>{change}</p>}
      </div>
    </div>
  );
}

~~~

---
## FILE: src/components/ui/Modal.tsx
~~~tsx
import { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | 'full';
  footer?: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children, size = 'md', footer }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sizeConfig: Record<string, { widthClass: string; maxHeight: string }> = {
    sm: { widthClass: 'max-w-sm', maxHeight: 'min(70vh, calc(100dvh - 1.5rem))' },
    md: { widthClass: 'max-w-md', maxHeight: 'min(82vh, calc(100dvh - 1.5rem))' },
    lg: { widthClass: 'max-w-2xl', maxHeight: 'min(84vh, calc(100dvh - 1.5rem))' },
    xl: { widthClass: 'max-w-3xl', maxHeight: 'min(86vh, calc(100dvh - 1.5rem))' },
    '2xl': { widthClass: 'max-w-2xl', maxHeight: 'min(88vh, calc(100dvh - 1.5rem))' },
    '3xl': { widthClass: 'max-w-4xl', maxHeight: 'min(88vh, calc(100dvh - 1.5rem))' },
    '4xl': { widthClass: 'max-w-5xl', maxHeight: 'min(90vh, calc(100dvh - 1.5rem))' },
    '5xl': { widthClass: 'max-w-6xl', maxHeight: 'min(92vh, calc(100dvh - 1.5rem))' },
    full: { widthClass: 'max-w-full mx-4', maxHeight: 'calc(100dvh - 2rem)' },
  };

  const cfg = sizeConfig[size] || sizeConfig.md;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] overflow-y-auto bg-black/50 p-3 backdrop-blur-sm sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      role="presentation"
    >
      <div className="flex min-h-[calc(100dvh-1.5rem)] w-full items-center justify-center sm:min-h-[calc(100dvh-2rem)]">
        <div
          data-modal-container
          className={`relative flex w-full flex-col ${cfg.widthClass} overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-200 ease-out`}
          style={{ maxHeight: cfg.maxHeight }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
            <h2 id="modal-title" className="pr-3 text-lg font-bold text-slate-900">
              {title}
            </h2>
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          <div data-modal-body className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {children}
          </div>

          {footer && (
            <div
              data-modal-footer
              className="flex flex-shrink-0 flex-col-reverse gap-2 border-t border-gray-100 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3"
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

~~~

---
## FILE: src/components/ui/PageHeaderNew.tsx
~~~tsx
import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  lastUpdated?: string;
}

export function PageHeader({ title, subtitle, action, lastUpdated }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-[288px] flex-col gap-1">
        <h1 className="text-4xl font-black leading-tight tracking-tight text-slate-900">{title}</h1>
        {subtitle && (
          <p className="text-base font-normal leading-normal text-slate-500">{subtitle}</p>
        )}
        {lastUpdated && (
          <p className="text-sm font-normal leading-normal text-slate-400">
            Atualizado: {lastUpdated}
          </p>
        )}
      </div>
      {action && <div className="flex items-center">{action}</div>}
    </div>
  );
}

~~~

---
## FILE: src/hooks/index.ts
~~~typescript
/**
 * COMPATIBILITY LAYER: Re-export modern hooks from react-app/hooks
 *
 * The modern hooks are in /src/react-app/hooks
 * This index maintains backward compatibility with legacy imports:
 *   import { useFuncionarios } from '@/hooks'
 */

// Modern hooks (from src/react-app/hooks)
export { useFuncionarios } from '../react-app/hooks/useFuncionarios';
export { useQualificacoes } from '../react-app/hooks/useQualificacoes';
export { useApi } from '../react-app/hooks/useApi';
export { useToast } from '../react-app/hooks/useToast';
export { useAuth } from '../react-app/hooks/useAuth';
export { useFuncionariosSimples } from '../react-app/hooks/useFuncionariosSimples';
export type { ColumnConfig, SchemaField } from '../react-app/hooks/useFuncionariosConfig';
export { useFuncionariosConfig } from '../react-app/hooks/useFuncionariosConfig';

~~~

---
## FILE: src/hooks/useFuncionariosConfig.ts
~~~typescript
import { useState, useEffect } from 'react';

export interface ColumnConfig {
  name: string;
  label: string;
  visible: boolean;
  order: number;
}

export interface SchemaField {
  name: string;
  label: string;
  type: string;
  filterable: boolean;
}

const STORAGE_KEY = 'airtrust_funcionarios_columns_config';

export const useFuncionariosConfig = () => {
  const [schema, setSchema] = useState<SchemaField[]>([]);
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Carregar schema do servidor
  useEffect(() => {
    const loadSchema = async () => {
      try {
        const baseUrl = (
          (import.meta as unknown as { env?: { VITE_API_URL?: string } })?.env?.VITE_API_URL ||
          'https://airtrust.airtrust.workers.dev/api'
        ).replace(/\/$/, '');

        const response = await fetch(`${baseUrl}/funcionarios/schema`);
        const data = await response.json();

        if (data.success && data.data) {
          setSchema(data.data);

          // Carregar config salva ou criar padrão
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            try {
              const config = JSON.parse(saved);
              setColumns(config);
            } catch {
              initializeDefaultColumns(data.data);
            }
          } else {
            initializeDefaultColumns(data.data);
          }
        }
      } catch (error) {
        console.error('[useFuncionariosConfig] Erro ao carregar schema:', error);
        initializeDefaultColumns([]);
      } finally {
        setLoading(false);
      }
    };

    loadSchema();
    // Dependências intencionais limitadas para evitar re-fetch infinito
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializeDefaultColumns = (fields: SchemaField[]) => {
    // Colunas padrão que aparecem por padrão (ordem importa)
    const defaultOrder = ['matricula', 'nome', 'cargo', 'email', 'ativo', 'created_at'];

    const config = fields.map((field, index) => ({
      name: field.name,
      label: field.label,
      visible: defaultOrder.includes(field.name),
      order: defaultOrder.indexOf(field.name) >= 0 ? defaultOrder.indexOf(field.name) : 999 + index,
    }));

    const sorted = config.sort((a, b) => a.order - b.order);
    setColumns(sorted);
    saveConfig(sorted);
  };

  const saveConfig = (config: ColumnConfig[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  };

  const toggleColumn = (name: string) => {
    const updated = columns.map((col) =>
      col.name === name ? { ...col, visible: !col.visible } : col,
    );
    setColumns(updated);
    saveConfig(updated);
  };

  const reorderColumns = (fromIndex: number, toIndex: number) => {
    const updated = [...columns];
    const [removed] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, removed);

    // Recalcular ordem
    const reordered = updated.map((col, idx) => ({
      ...col,
      order: idx,
    }));

    setColumns(reordered);
    saveConfig(reordered);
  };

  const resetToDefault = () => {
    localStorage.removeItem(STORAGE_KEY);
    initializeDefaultColumns(schema);
  };

  return {
    schema,
    columns,
    loading,
    toggleColumn,
    reorderColumns,
    resetToDefault,
    visibleColumns: columns.filter((col) => col.visible).sort((a, b) => a.order - b.order),
  };
};

~~~

---
## FILE: src/react-app/App.tsx
~~~tsx
import { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginSimple from './pages/LoginSimple';
import { ErrorBoundary } from './components/ErrorBoundary';
import { lazyWithRetry } from './utils/lazyWithRetry';
// RequestMonitor removed
const FrmsDashboard = lazyWithRetry(() => import('./pages/frms/FrmsDashboard'), 'FrmsDashboard');
import { applySystemSettingsToDocument, getSystemSettings } from './config/systemSettings';
import { LanguageProvider } from './i18n/LanguageContext';
import { useLanguage } from './i18n/useLanguage';
import { syncRuntimeTranslation } from './i18n/runtimeTranslator';
import DashboardPrincipal from './pages/DashboardPrincipal';
import { ThemeProvider } from './theme/ThemeProvider';

// 🚀 LAZY LOADING: Páginas principais (code splitting)
const HomePerfil = lazyWithRetry(() => import('./pages/HomePerfil'), 'HomePerfil');
const TrocarSenhaPage = lazyWithRetry(() => import('./pages/TrocarSenhaPage'), 'TrocarSenhaPage');
const Funcionarios = lazyWithRetry(() => import('./pages/Funcionarios'), 'Funcionarios');
const PastaVirtual = lazyWithRetry(() => import('./pages/PastaVirtual'), 'PastaVirtual');
const Qualificacoes = lazyWithRetry(() => import('./pages/Qualificacoes'), 'Qualificacoes');
const DashboardQualificacoes = lazyWithRetry(
  () => import('./pages/DashboardQualificacoes'),
  'DashboardQualificacoes',
);
const ReclassificacaoQualificacoes = lazyWithRetry(
  () => import('./pages/ReclassificacaoQualificacoes'),
  'ReclassificacaoQualificacoes',
);
const QualificacoesAlertas = lazyWithRetry(
  () => import('./pages/qualificacoes/Alertas'),
  'QualificacoesAlertas',
);
const LicencasPage = lazyWithRetry(() => import('./pages/LicencasPage'), 'LicencasPage');
const HospedagemPage = lazyWithRetry(() => import('./pages/HospedagemPage'), 'HospedagemPage');
const FichaFuncionarioPage = lazyWithRetry(
  () => import('./pages/FichaFuncionarioPage'),
  'FichaFuncionarioPage',
);
const PerfilFuncionario = lazyWithRetry(
  () => import('./pages/funcionarios/PerfilFuncionario'),
  'PerfilFuncionario',
);
const ImportacaoPageV2 = lazyWithRetry(
  () => import('./pages/ImportacaoPageV2'),
  'ImportacaoPageV2',
);
const Simuladores = lazyWithRetry(() => import('./pages/Simuladores'), 'Simuladores');
const SimuladoresDashboard = lazyWithRetry(
  () => import('./pages/simuladores/dashboard/SimuladoresDashboard'),
  'SimuladoresDashboard',
);
const DashboardDesempenho = lazyWithRetry(
  () => import('./pages/simuladores/dashboard/DashboardDesempenho'),
  'DashboardDesempenho',
);
const AgendaCalendario = lazyWithRetry(
  () => import('./pages/simuladores/agenda'),
  'AgendaCalendario',
);
const FichasSessao = lazyWithRetry(() => import('./pages/simuladores/fichas'), 'FichasSessao');
const FichaDetalhe = lazyWithRetry(
  () => import('./pages/simuladores/fichas/FichaDetalhe'),
  'FichaDetalhe',
);
const CrudSimuladores = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/simuladores/crud-completo'),
  'CrudSimuladores',
);
const CrudManobras = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/manobras'),
  'CrudManobras',
);
const CrudModelos = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/modelos'),
  'CrudModelos',
);
const CrudCategorias = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/categorias'),
  'CrudCategorias',
);
const CrudTiposSessao = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/tipos-sessao'),
  'CrudTiposSessao',
);
const CrudInstrutores = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/instrutores'),
  'CrudInstrutores',
);
const CrudModelosSessao = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/modelos-sessao'),
  'CrudModelosSessao',
);
const RelatoriosSimuladores = lazyWithRetry(
  () => import('./pages/simuladores/relatorios'),
  'RelatoriosSimuladores',
);
const RelatoriosDashboard = lazyWithRetry(
  () => import('./pages/relatorios/Dashboard'),
  'RelatoriosDashboard',
);
const ConfiguracoesCadastros = lazyWithRetry(
  () => import('./pages/simuladores/cadastros/configuracoes'),
  'ConfiguracoesCadastros',
);
const Configuracoes = lazyWithRetry(() => import('./pages/Configuracoes'), 'Configuracoes');
const ConfiguracoesCadastrosGerais = lazyWithRetry(
  () => import('./pages/Configuracoes/CadastrosPage'),
  'ConfiguracoesCadastrosGerais',
);
const IntegracoesEdApp = lazyWithRetry(
  () => import('./pages/Configuracoes/Integracoes/EdApp'),
  'IntegracoesEdApp',
);
const ComplianceSettings = lazyWithRetry(
  () => import('./pages/ComplianceSettings').then((m) => ({ default: m.ComplianceSettings })),
  'ComplianceSettings',
);
const VerificarCertificado = lazyWithRetry(
  () => import('./pages/VerificarCertificado'),
  'VerificarCertificado',
);
const ValidarCertificado = lazyWithRetry(
  () => import('./pages/ValidarCertificado'),
  'ValidarCertificado',
);
const AceitarConvite = lazyWithRetry(() => import('./pages/AceitarConvite'), 'AceitarConvite');
const AdminUsuarios = lazyWithRetry(() => import('./pages/admin/UsuariosPage'), 'AdminUsuarios');
const AdminPermissoes = lazyWithRetry(
  () => import('./pages/admin/PermissoesPage'),
  'AdminPermissoes',
);
// Escalas (Planejamento de Escala Mensal)
const EscalasMensais = lazyWithRetry(
  () => import('./pages/escalas/EscalasMensais'),
  'EscalasMensais',
);
const ConfiguracaoEscala = lazyWithRetry(
  () => import('./pages/escalas/ConfiguracaoEscalaPage'),
  'ConfiguracaoEscala',
);
const MinhaEscala = lazyWithRetry(() => import('./pages/escalas/MinhaEscalaPage'), 'MinhaEscala');
const EvdPage = lazyWithRetry(() => import('./pages/escalas/EvdPage'), 'EvdPage');
// FRMS (Gestão de Fadiga e Jornada)
const FrmsFichaTripulante = lazyWithRetry(
  () => import('./pages/frms/FrmsFichaTripulante'),
  'FrmsFichaTripulante',
);
const FrmsAlertasPainel = lazyWithRetry(
  () => import('./pages/frms/FrmsAlertasPainel'),
  'FrmsAlertasPainel',
);
const FrmsRelatorios = lazyWithRetry(() => import('./pages/frms/FrmsRelatorios'), 'FrmsRelatorios');
const FrmsEscalas = lazyWithRetry(() => import('./pages/frms/FrmsEscalas'), 'FrmsEscalas');
const FrmsConfiguracoes = lazyWithRetry(
  () => import('./pages/frms/FrmsConfiguracoes'),
  'FrmsConfiguracoes',
);
const FrmsImportacaoFira = lazyWithRetry(
  () => import('./pages/frms/FrmsImportacaoFira'),
  'FrmsImportacaoFira',
);
const FrmsHistoricoFira = lazyWithRetry(
  () => import('./pages/frms/FrmsHistoricoFira'),
  'FrmsHistoricoFira',
);
const FrmsConceitos = lazyWithRetry(() => import('./pages/frms/FrmsConceitos'), 'FrmsConceitos');
const FrmsFadigaAcumulada = lazyWithRetry(
  () => import('./pages/frms/FrmsFadigaAcumulada'),
  'FrmsFadigaAcumulada',
);
const FrmsCheckinFadiga = lazyWithRetry(
  () => import('./pages/frms/FrmsCheckinFadiga'),
  'FrmsCheckinFadiga',
);
const FrmsFadigaPainel = lazyWithRetry(
  () => import('./pages/frms/FrmsFadigaPainel'),
  'FrmsFadigaPainel',
);
const FrmsFadigaHistorico = lazyWithRetry(
  () => import('./pages/frms/FrmsFadigaHistorico'),
  'FrmsFadigaHistorico',
);
const HorasVooPage = lazyWithRetry(() => import('./pages/HorasVooPage'), 'HorasVooPage');
const SolicitacoesTreinamentoPage = lazyWithRetry(
  () => import('./pages/SolicitacoesTreinamentoPage'),
  'SolicitacoesTreinamentoPage',
);
const TreinamentosPlanejadosPage = lazyWithRetry(
  () => import('./pages/TreinamentosPlanejadosPage'),
  'TreinamentosPlanejadosPage',
);

// LMS — Learning Management System
const LmsCatalogo = lazyWithRetry(() => import('./pages/lms/LmsCatalogo'), 'LmsCatalogo');
const LmsCursoDetalhe = lazyWithRetry(
  () => import('./pages/lms/LmsCursoDetalhe'),
  'LmsCursoDetalhe',
);
const LmsAdminCursos = lazyWithRetry(() => import('./pages/lms/LmsAdminCursos'), 'LmsAdminCursos');
const LmsPlayer = lazyWithRetry(() => import('./pages/lms/LmsPlayer'), 'LmsPlayer');
const LmsPreviewPlayer = lazyWithRetry(
  () => import('./pages/lms/LmsPreviewPlayer'),
  'LmsPreviewPlayer',
);
const LmsPlayerH5p = lazyWithRetry(() => import('./pages/lms/LmsPlayerH5p'), 'LmsPlayerH5p');
const LmsPlayerPdf = lazyWithRetry(() => import('./pages/lms/LmsPlayerPdf'), 'LmsPlayerPdf');
const LmsPlayerPptx = lazyWithRetry(() => import('./pages/lms/LmsPlayerPptx'), 'LmsPlayerPptx');
const LmsRelatorios = lazyWithRetry(() => import('./pages/lms/LmsRelatorios'), 'LmsRelatorios');
const LmsHistoricoEdApp = lazyWithRetry(
  () => import('./pages/lms/LmsHistoricoEdApp'),
  'LmsHistoricoEdApp',
);
const LmsDashboard = lazyWithRetry(() => import('./pages/lms/LmsDashboard'), 'LmsDashboard');
const LmsMatriculas = lazyWithRetry(() => import('./pages/lms/LmsMatriculas'), 'LmsMatriculas');

// SGSO — Sistema de Gerenciamento de Segurança Operacional
const Sgso = lazyWithRetry(() => import('./pages/Sgso'), 'Sgso');
const SgsoRelato = lazyWithRetry(() => import('./pages/SgsoRelato'), 'SgsoRelato');
const SgsoRelprevPage = lazyWithRetry(
  () => import('./pages/sgso/SgsoRelprevPage'),
  'SgsoRelprevPage',
);
const SgsoBowtiePage = lazyWithRetry(() => import('./pages/sgso/SgsoBowtiePage'), 'SgsoBowtiePage');
const SgsoFratPage = lazyWithRetry(() => import('./pages/sgso/SgsoFratPage'), 'SgsoFratPage');

// Loading fallback component
const PageLoader = () => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-gray-600">{t('common.loading')}</p>
      </div>
    </div>
  );
};

const RuntimeTranslationBridge = () => {
  const { language } = useLanguage();

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    syncRuntimeTranslation(language).then((dispose) => {
      cleanup = dispose;
    });

    return () => {
      cleanup?.();
    };
  }, [language]);

  return null;
};

// React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutos
      gcTime: 1000 * 60 * 30, // 30 minutos
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});

/** Redireciona para a home correta de acordo com o perfil do usuário */
function HomeRouter() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  const role = user?.role?.toUpperCase() ?? '';
  if (role === 'ALUNO' || role === 'INSTRUTOR' || role === 'USUARIO') return <HomePerfil />;
  return <DashboardPrincipal />;
}

function LmsEntryRouter() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  const role = user?.role?.toUpperCase() ?? '';
  if (role === 'ALUNO' || role === 'INSTRUTOR') return <Navigate to="/lms/cursos" replace />;
  return <LmsDashboard />;
}

export default function App() {
  useEffect(() => {
    applySystemSettingsToDocument(getSystemSettings());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Toaster
          position="top-right"
          richColors
          closeButton
          duration={4000}
          toastOptions={{
            style: {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '14px',
              borderRadius: '12px',
            },
          }}
        />
        <LanguageProvider>
          <RuntimeTranslationBridge />
          <AuthProvider>
            <BrowserRouter>
              <div className="airtrust-global-standard">
                <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/login" element={<LoginSimple />} />
                      <Route path="/aceitar-convite" element={<AceitarConvite />} />
                      <Route
                        path="/admin/usuarios"
                        element={
                          <ProtectedRoute>
                            <AdminUsuarios />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin/permissoes"
                        element={
                          <ProtectedRoute>
                            <AdminPermissoes />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/"
                        element={
                          <ProtectedRoute>
                            <HomeRouter />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/home"
                        element={
                          <ProtectedRoute>
                            <HomePerfil />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/perfil/trocar-senha"
                        element={
                          <ProtectedRoute>
                            <TrocarSenhaPage />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/funcionarios"
                        element={
                          <ProtectedRoute>
                            <Funcionarios />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/pasta-virtual/:funcionarioId"
                        element={
                          <ProtectedRoute>
                            <PastaVirtual />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qualificacoes"
                        element={
                          <ProtectedRoute>
                            <Qualificacoes />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qualificacoes/dashboard"
                        element={
                          <ProtectedRoute>
                            <DashboardQualificacoes />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qualificacoes/reclassificacao"
                        element={
                          <ProtectedRoute>
                            <ReclassificacaoQualificacoes />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/qualificacoes/alertas"
                        element={
                          <ProtectedRoute>
                            <QualificacoesAlertas />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/licencas"
                        element={
                          <ProtectedRoute>
                            <LicencasPage />
                          </ProtectedRoute>
                        }
                      />
                    <Route
                      path="/hospedagem"
                      element={
                        <ProtectedRoute>
                          <HospedagemPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/funcionarios/:id/ficha"
                      element={
                        <ProtectedRoute>
                          <FichaFuncionarioPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/funcionarios/:id"
                      element={
                        <ProtectedRoute>
                          <FichaFuncionarioPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/funcionarios/:id/perfil"
                      element={
                        <ProtectedRoute>
                          <PerfilFuncionario />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores"
                      element={
                        <ProtectedRoute>
                          <Simuladores />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/dashboard"
                      element={
                        <ProtectedRoute>
                          <SimuladoresDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/desempenho/:funcionarioId"
                      element={
                        <ProtectedRoute>
                          <DashboardDesempenho />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/calendario"
                      element={
                        <ProtectedRoute>
                          <AgendaCalendario />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/fichas"
                      element={
                        <ProtectedRoute>
                          <FichasSessao />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/configuracoes"
                      element={
                        <ProtectedRoute>
                          <ConfiguracoesCadastros />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/fichas/:id"
                      element={
                        <ProtectedRoute>
                          <FichaDetalhe />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/sessoes/nova"
                      element={
                        <ProtectedRoute>
                          <Navigate to="/simuladores" replace />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/simuladores"
                      element={
                        <ProtectedRoute>
                          <CrudSimuladores />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/manobras"
                      element={
                        <ProtectedRoute>
                          <CrudManobras />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/modelos"
                      element={
                        <ProtectedRoute>
                          <CrudModelos />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/categorias"
                      element={
                        <ProtectedRoute>
                          <CrudCategorias />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/tipos"
                      element={
                        <ProtectedRoute>
                          <CrudTiposSessao />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/instrutores"
                      element={
                        <ProtectedRoute>
                          <CrudInstrutores />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/cadastros/modelos-sessao"
                      element={
                        <ProtectedRoute>
                          <CrudModelosSessao />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/relatorios"
                      element={
                        <ProtectedRoute>
                          <RelatoriosDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/simuladores/relatorios"
                      element={
                        <ProtectedRoute>
                          <RelatoriosSimuladores />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes"
                      element={
                        <ProtectedRoute>
                          <Configuracoes />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/matriz-treinamentos"
                      element={
                        <ProtectedRoute>
                          <Navigate to="/configuracoes?tab=matriz-treinamento" replace />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/cadastros"
                      element={
                        <ProtectedRoute>
                          <ConfiguracoesCadastrosGerais />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/integracoes/edapp"
                      element={
                        <ProtectedRoute>
                          <IntegracoesEdApp />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/integracoes/sigvoos"
                      element={
                        <ProtectedRoute>
                          <IntegracoesEdApp />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/configuracoes/compliance"
                      element={
                        <ProtectedRoute>
                          <ComplianceSettings />
                        </ProtectedRoute>
                      }
                    />
                    {/* Treinamentos integrado em qualificações */}
                    {/* Importação Inteligente */}
                    <Route
                      path="/importacao"
                      element={
                        <ProtectedRoute>
                          <ImportacaoPageV2 />
                        </ProtectedRoute>
                      }
                    />
                    {/* Compat: redirecionar rota antiga para a nova */}
                    <Route
                      path="/habilitacoes"
                      element={<Navigate to="/qualificacoes" replace />}
                    />

                    {/* Escalas — Planejamento Mensal (protegido) */}
                    <Route
                      path="/escalas"
                      element={
                        <ProtectedRoute>
                          <EscalasMensais />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/escalas/configuracoes"
                      element={
                        <ProtectedRoute>
                          <Suspense fallback={<PageLoader />}>
                            <ConfiguracaoEscala />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/escalas/minha-escala"
                      element={
                        <ProtectedRoute>
                          <Suspense fallback={<PageLoader />}>
                            <MinhaEscala />
                          </Suspense>
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/escalas/evd"
                      element={
                        <ProtectedRoute>
                          <EvdPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* FRMS — Gestão de Fadiga e Jornada (protegido) */}
                    <Route
                      path="/frms"
                      element={
                        <ProtectedRoute>
                          <FrmsDashboard />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/tripulante/:id"
                      element={
                        <ProtectedRoute>
                          <FrmsFichaTripulante />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/alertas"
                      element={
                        <ProtectedRoute>
                          <FrmsAlertasPainel />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/relatorios"
                      element={
                        <ProtectedRoute>
                          <FrmsRelatorios />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/escalas"
                      element={
                        <ProtectedRoute>
                          <FrmsEscalas />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/configuracoes"
                      element={
                        <ProtectedRoute>
                          <FrmsConfiguracoes />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/importacao/fira"
                      element={
                        <ProtectedRoute>
                          <FrmsImportacaoFira />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/importacao/fira/historico"
                      element={
                        <ProtectedRoute>
                          <FrmsHistoricoFira />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/conceitos"
                      element={
                        <ProtectedRoute>
                          <FrmsConceitos />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/metodologia"
                      element={<Navigate to="/frms/conceitos" replace />}
                    />
                    <Route
                      path="/frms/fadiga-acumulada"
                      element={
                        <ProtectedRoute>
                          <FrmsFadigaAcumulada />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/checkin"
                      element={
                        <ProtectedRoute>
                          <FrmsCheckinFadiga />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/fadiga-painel"
                      element={
                        <ProtectedRoute>
                          <FrmsFadigaPainel />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/frms/fadiga-historico"
                      element={
                        <ProtectedRoute>
                          <FrmsFadigaHistorico />
                        </ProtectedRoute>
                      }
                    />

                    {/* SGSO — Sistema de Gerenciamento de Segurança Operacional */}
                    <Route
                      path="/sgso"
                      element={
                        <ProtectedRoute>
                          <Sgso />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sgso/relatos/:id"
                      element={
                        <ProtectedRoute>
                          <SgsoRelato />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sgso/relprev"
                      element={
                        <ProtectedRoute>
                          <SgsoRelprevPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sgso/bowtie"
                      element={
                        <ProtectedRoute>
                          <SgsoBowtiePage />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/sgso/frat"
                      element={
                        <ProtectedRoute>
                          <SgsoFratPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Horas de Voo — caderneta standalone */}
                    <Route
                      path="/horas-voo"
                      element={
                        <ProtectedRoute>
                          <HorasVooPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* Treinamentos Planejados — agora aba de Qualificações */}
                    <Route
                      path="/treinamentos/planejados"
                      element={<Navigate to="/qualificacoes" replace />}
                    />
                    <Route
                      path="/treinamentos/solicitacoes"
                      element={
                        <ProtectedRoute>
                          <SolicitacoesTreinamentoPage />
                        </ProtectedRoute>
                      }
                    />

                    {/* LMS — Learning Management System */}
                    <Route
                      path="/lms"
                      element={
                        <ProtectedRoute>
                          <LmsEntryRouter />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/dashboard"
                      element={
                        <ProtectedRoute>
                          <LmsEntryRouter />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/admin"
                      element={<Navigate to="/lms/admin/cursos" replace />}
                    />
                    <Route
                      path="/treinamentos"
                      element={<Navigate to="/treinamentos/planejados" replace />}
                    />
                    <Route
                      path="/lms/cursos"
                      element={
                        <ProtectedRoute>
                          <LmsCatalogo />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/cursos/:id"
                      element={
                        <ProtectedRoute>
                          <LmsCursoDetalhe />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/admin/cursos"
                      element={
                        <ProtectedRoute>
                          <LmsAdminCursos />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/:matriculaId"
                      element={
                        <ProtectedRoute>
                          <LmsPlayer />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/preview/:cursoId"
                      element={
                        <ProtectedRoute>
                          <LmsPreviewPlayer />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/h5p/:matriculaId"
                      element={
                        <ProtectedRoute>
                          <LmsPlayerH5p />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/pdf/:matriculaId"
                      element={
                        <ProtectedRoute>
                          <LmsPlayerPdf />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/player/pptx/:matriculaId"
                      element={
                        <ProtectedRoute>
                          <LmsPlayerPptx />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/relatorios"
                      element={
                        <ProtectedRoute>
                          <LmsRelatorios />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/legado-edapp"
                      element={
                        <ProtectedRoute>
                          <LmsHistoricoEdApp />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/historico-edapp"
                      element={
                        <ProtectedRoute>
                          <Navigate to="/lms/legado-edapp" replace />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/matriculas"
                      element={
                        <ProtectedRoute>
                          <LmsMatriculas />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/lms/matriculas/:cursoId"
                      element={
                        <ProtectedRoute>
                          <LmsMatriculas />
                        </ProtectedRoute>
                      }
                    />

                    {/* Rotas PÚBLICAS de Verificação de Certificados */}
                    <Route path="/verificar-certificado" element={<VerificarCertificado />} />
                    <Route path="/verificar-certificado/:hash" element={<VerificarCertificado />} />
                    <Route path="/c/:hash" element={<ValidarCertificado />} />
                    <Route path="/validar/:hash" element={<ValidarCertificado />} />
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </div>
            </BrowserRouter>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

~~~

---
## FILE: src/react-app/components/AeronaveMultiSelect.tsx
~~~tsx
import { useState } from 'react';
import { useApi } from '@/react-app/hooks/useApi';
import { X } from 'lucide-react';

interface Aeronave {
  id: number;
  codigo: string;
  nome: string;
  fabricante?: string;
}

interface AeronaveMultiSelectProps {
  value: number[];
  onChange: (value: number[]) => void;
  className?: string;
  placeholder?: string;
}

export default function AeronaveMultiSelect({ 
  value, 
  onChange, 
  className 
}: AeronaveMultiSelectProps) {
  const { data: aeronaves } = useApi<Aeronave[]>('/api/aeronaves');
  const [isOpen, setIsOpen] = useState(false);

  const selectedAeronaves = aeronaves?.filter(a => value.includes(a.id)) || [];
  const availableAeronaves = aeronaves?.filter(a => !value.includes(a.id)) || [];

  const handleSelect = (aeronaveId: number) => {
    onChange([...value, aeronaveId]);
    setIsOpen(false);
  };

  const handleRemove = (aeronaveId: number) => {
    onChange(value.filter(id => id !== aeronaveId));
  };

  return (
    <div className={`relative ${className}`}>
      {/* Selected aeronaves as tags */}
      <div className="mb-2 min-h-[2rem] flex flex-wrap gap-1">
        {selectedAeronaves.map((aeronave) => (
          <span
            key={aeronave.id}
            className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-primary/20 text-primary border border-blue-200 max-w-full"
          >
            <span className="font-medium truncate">{aeronave.codigo}</span>
            <button
              type="button"
              onClick={() => handleRemove(aeronave.id)}
              className="ml-1 text-primary hover:text-primary transition-colors flex-shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      {/* Dropdown button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-sm"
      >
        {selectedAeronaves.length === 0 ? (
          <span className="text-gray-500 truncate block">Selecione aeronaves qualificadas</span>
        ) : (
          <span className="text-gray-700 truncate block">
            {selectedAeronaves.length} aeronave{selectedAeronaves.length > 1 ? 's' : ''} selecionada{selectedAeronaves.length > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Dropdown options */}
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {availableAeronaves.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 text-sm">
              {aeronaves?.length === 0 ? 'Carregando aeronaves...' : 'Todas selecionadas'}
            </div>
          ) : (
            availableAeronaves.map((aeronave) => (
              <button
                key={aeronave.id}
                type="button"
                onClick={() => handleSelect(aeronave.id)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
              >
                <div className="font-medium text-gray-900 truncate">{aeronave.codigo}</div>
                {aeronave.nome && (
                  <div className="text-sm text-gray-600 truncate">{aeronave.nome}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

~~~

---
## FILE: src/react-app/components/AeronaveSelect.tsx
~~~tsx
import { useApi } from '@/react-app/hooks/useApi';

interface AeronaveSelectProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export default function AeronaveSelect({ value, onChange, className, placeholder = "Selecione uma aeronave" }: AeronaveSelectProps) {
  const { data: aeronaves } = useApi<any[]>('/api/aeronaves');

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      <option value="">{placeholder}</option>
      {aeronaves?.map((aeronave) => (
        <option key={aeronave.id} value={aeronave.codigo}>
          {aeronave.codigo} - {aeronave.nome}
        </option>
      ))}
    </select>
  );
}

~~~

---
## FILE: src/react-app/components/AppLayout.tsx
~~~tsx
import React, { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Settings, Bell, LogOut, MoonStar, SunMedium } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { VersionBadge } from './VersionBadge';
import { NotificacoesSistema } from './NotificacoesSistema';
import { NotificacoesEscala } from './NotificacoesEscala';
import { useSystemSettings } from '../hooks/useSystemSettings';
import { toast } from 'sonner';
import { API_BASE_URL } from '../config/api';
import { useLanguage } from '../i18n/useLanguage';
import { useTheme } from '../theme/ThemeProvider';

interface AppLayoutProps {
  children: ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, empresas, empresaAtualId, selectEmpresa } = useAuth();
  const { can, isAdmin, isGestor, isInstrutor, isAluno } = usePermissions();
  const { logoSrc, settings } = useSystemSettings();
  const { t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [empresaLogoError, setEmpresaLogoError] = useState<Record<number, boolean>>({});

  // Flags de acesso a módulos
  const showDashboard = can('dashboard.view') || isAdmin || isGestor;
  const showFuncionarios = can('funcionarios.view');
  const showQualificacoes = can('qualificacoes.view');
  const showSimuladores = can('simuladores.view');
  const showLms = !isAluno && !isInstrutor;
  const showTreinamentosPlanejados =
    !isAluno && (showQualificacoes || isAdmin || isGestor || isInstrutor);
  const showEscalas = can('escalas.view') || can('self.escala');
  const showFrms = can('frms.view');
  const showSgso = can('sgso.view');
  // Minha escala não aparece no nav superior — acesso via HomePerfil cards
  const showMinhaEscala = false;

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const getUserInitials = () => {
    if (!user?.nome) return 'US';
    const names = user.nome.trim().split(' ');
    if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
    return (names[0][0] + names[names.length - 1][0]).toUpperCase();
  };

  const empresaAtual = empresas.find((empresa) => empresa.id === empresaAtualId) || null;

  const hasEmpresaLogo = (empresaId: number, logoUrl?: string | null): boolean => {
    return Boolean(getEmpresaLogoUrl(logoUrl) && !empresaLogoError[empresaId]);
  };

  const markEmpresaLogoError = (empresaId: number) => {
    setEmpresaLogoError((prev) => ({ ...prev, [empresaId]: true }));
  };

  const getEmpresaLogoUrl = (logoUrl?: string | null): string | null => {
    if (!logoUrl) return null;
    // Data URLs e absolute URLs passam direto
    if (
      logoUrl.startsWith('data:') ||
      logoUrl.startsWith('http://') ||
      logoUrl.startsWith('https://')
    )
      return logoUrl;
    // Relative API URLs precisam de origin prefix
    if (logoUrl.startsWith('/api/')) {
      const apiOrigin = API_BASE_URL.replace(/\/api$/, '');
      return `${apiOrigin}${logoUrl}`;
    }
    return logoUrl;
  };

  const getEmpresaInitials = (nome?: string): string => {
    if (!nome) return 'EM';
    const parts = nome.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return 'EM';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const handleSelectEmpresa = async (empresaId: number) => {
    if (!empresaId || empresaId === empresaAtualId) return;

    try {
      await selectEmpresa(empresaId);
      toast.success(t('layout.actions.switchCompanySuccess'));
      navigate(0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('layout.actions.switchCompanyError'));
    }
  };

  // Expõe altura do header como CSS var para módulos que precisam de layout full-height (ex: FRMS)
  const headerHeightVar = settings.compactHeader
    ? ({ '--header-height': '44px' } as React.CSSProperties)
    : ({ '--header-height': '48px' } as React.CSSProperties);

  const themeActionLabel = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
  const themeStateLabel = isDark ? 'Escuro' : 'Claro';

  return (
    <div
      className="airtrust-global-standard relative flex h-auto min-h-screen w-full flex-col overflow-x-hidden bg-slate-50 font-display text-slate-800 transition-colors dark:bg-slate-950 dark:text-slate-100"
      style={headerHeightVar}
    >
      {/* Header */}
      <header className="sticky top-0 z-header w-full border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-md transition-colors dark:border-slate-800 dark:bg-slate-950/95">
        <div
          className={`mx-auto flex w-full items-center justify-between px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 ${
            settings.compactHeader ? 'h-11 sm:h-12' : 'h-12 sm:h-13'
          }`}
        >
          <div className="flex items-center gap-4 sm:gap-8">
            {/* Logo */}
            <Link
              to="/"
              aria-label={t('layout.aria.logoHome')}
              title={t('layout.aria.logoHome')}
              className="group flex items-center rounded-lg px-2 py-1 transition-all hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <img
                src={logoSrc}
                alt="AirTrust"
                className="h-6 sm:h-7 md:h-8 w-[150px] object-contain object-left"
              />
            </Link>

            {/* Navigation (text-only, no icons) — hidden for restricted roles (ALUNO/INSTRUTOR) */}
            <nav className="hidden items-center gap-2 md:flex" data-no-auto-i18n="true">
              {!isAluno && !isInstrutor && showDashboard && (
                <Link
                  to="/"
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium ${
                    isActive('/')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.dashboard')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showFuncionarios && (
                <Link
                  to="/funcionarios"
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium ${
                    isActive('/funcionarios')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.employees')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showQualificacoes && (
                <Link
                  to="/qualificacoes"
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium ${
                    isActive('/qualificacoes')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.qualifications')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showSimuladores && (
                <Link
                  to="/simuladores"
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium ${
                    isActive('/simuladores')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.simulators')}
                </Link>
              )}
              {showLms && (
                <Link
                  to="/lms/cursos"
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium ${
                    location.pathname.startsWith('/lms')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  LMS
                </Link>
              )}
              {!isAluno && !isInstrutor && showMinhaEscala && (
                <Link
                  to="/escalas/minha-escala"
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium ${
                    location.pathname.startsWith('/escalas/minha-escala')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  Minha Escala
                </Link>
              )}
              {!isAluno && !isInstrutor && showEscalas && !showMinhaEscala && (
                <Link
                  to="/escalas"
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium ${
                    location.pathname.startsWith('/escalas')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.escalas')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showFrms && (
                <Link
                  to="/frms"
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium ${
                    location.pathname.startsWith('/frms')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.frms')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showSgso && (
                <Link
                  to="/sgso"
                  className={`flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium ${
                    location.pathname.startsWith('/sgso')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  SGSO
                </Link>
              )}
            </nav>
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-2 sm:gap-4">
            {empresaAtual && (
              <div
                className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900/70 md:flex"
                title={empresaAtual.nome}
              >
                {hasEmpresaLogo(empresaAtual.id, empresaAtual.logo_url) ? (
                  <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
                    <img
                      src={getEmpresaLogoUrl(empresaAtual.logo_url) || ''}
                      alt={empresaAtual.nome}
                      className="h-full w-full object-contain"
                      onError={() => markEmpresaLogoError(empresaAtual.id)}
                    />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    <span data-no-auto-i18n="true">{getEmpresaInitials(empresaAtual.nome)}</span>
                  </div>
                )}
                <span className="max-w-[110px] truncate text-xs font-medium text-slate-600 dark:text-slate-300">
                  {empresaAtual.nome}
                </span>
              </div>
            )}

            {isAdmin && empresas.length > 1 && (
              <select
                value={empresaAtualId ?? ''}
                onChange={(e) => handleSelectEmpresa(Number(e.target.value))}
                className="hidden h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 md:block"
                title={t('layout.mobile.activeCompany')}
              >
                {empresas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome}
                  </option>
                ))}
              </select>
            )}
            <div className="hidden sm:flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={themeActionLabel}
                aria-pressed={isDark}
                title={themeActionLabel}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-2.5 text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm dark:bg-blue-500/15 dark:text-blue-200">
                  {isDark ? <MoonStar className="h-3.5 w-3.5" /> : <SunMedium className="h-3.5 w-3.5" />}
                </span>
                <span className="pr-1 text-xs font-semibold">{themeStateLabel}</span>
              </button>
              <NotificacoesEscala />
              <NotificacoesSistema />
              {(isAdmin || isGestor) && (
                <button
                  className="flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  title={t('layout.actions.settings')}
                  onClick={() => navigate('/configuracoes')}
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
            {/* User avatar with role badge */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="flex flex-col items-end">
                <span
                  className="text-xs font-medium leading-none text-slate-700 dark:text-slate-100"
                  data-no-auto-i18n="true"
                >
                  {user?.nome?.split(' ')[0] || t('layout.user.default')}
                </span>
                {user?.role && (
                  <span className="mt-0.5 text-[10px] capitalize leading-none text-slate-400 dark:text-slate-500">
                    {user.role.toLowerCase()}
                  </span>
                )}
              </div>
              <div
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-slate-200 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                title={`${user?.nome || t('layout.user.default')} — Clique para sair`}
                onClick={logout}
                data-no-auto-i18n="true"
              >
                {getUserInitials()}
              </div>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
              aria-label={t('layout.aria.menu')}
            >
              <svg
                className="h-5 w-5 text-slate-700 dark:text-slate-100"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-sidebar bg-black/30 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Menu Content */}
          <div className="fixed left-0 right-0 bottom-0 top-[48px] z-sidebar overflow-y-auto bg-white shadow-2xl dark:bg-slate-950 md:hidden sm:top-[56px]">
            {/* User Profile Section */}
            <div className="border-b border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 p-4 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-base font-bold text-slate-600 shadow-md dark:bg-slate-800 dark:text-slate-100">
                  <span data-no-auto-i18n="true">{getUserInitials()}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {user?.nome || t('layout.user.default')}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {t('layout.mobile.systemName')}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-1 p-3">
              {!isAluno && !isInstrutor && showDashboard && (
                <Link
                  to="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    location.pathname === '/'
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.dashboard')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showFuncionarios && (
                <Link
                  to="/funcionarios"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    location.pathname === '/funcionarios'
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.employees')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showQualificacoes && (
                <Link
                  to="/qualificacoes"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    location.pathname === '/qualificacoes'
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.qualifications')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showSimuladores && (
                <Link
                  to="/simuladores"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    location.pathname === '/simuladores'
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.simulators')}
                </Link>
              )}
              {showLms && (
                <Link
                  to="/lms/cursos"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    location.pathname.startsWith('/lms')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  LMS
                </Link>
              )}
              {!isAluno && !isInstrutor && showMinhaEscala && (
                <Link
                  to="/escalas/minha-escala"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    location.pathname.startsWith('/escalas/minha-escala')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  Minha Escala
                </Link>
              )}
              {!isAluno && !isInstrutor && showEscalas && !showMinhaEscala && (
                <Link
                  to="/escalas"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    location.pathname.startsWith('/escalas')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.escalas')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showFrms && (
                <Link
                  to="/frms"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    location.pathname.startsWith('/frms')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  {t('layout.nav.frms')}
                </Link>
              )}
              {!isAluno && !isInstrutor && showSgso && (
                <Link
                  to="/sgso"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-left px-4 py-3.5 rounded-lg font-medium transition-all ${
                    location.pathname.startsWith('/sgso')
                      ? 'bg-primary/10 text-primary font-semibold dark:bg-blue-500/15 dark:text-blue-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  SGSO
                </Link>
              )}
            </nav>

            {/* Mobile Actions */}
            <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
              {isAdmin && empresas.length > 1 && (
                <div className="px-4 py-2">
                  {empresaAtual && (
                    <div className="mb-2 flex items-center gap-2">
                      {hasEmpresaLogo(empresaAtual.id, empresaAtual.logo_url) ? (
                        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-950">
                          <img
                            src={getEmpresaLogoUrl(empresaAtual.logo_url) || ''}
                            alt={empresaAtual.nome}
                            className="h-full w-full object-contain"
                            onError={() => markEmpresaLogoError(empresaAtual.id)}
                          />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-[10px] font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {getEmpresaInitials(empresaAtual.nome)}
                        </div>
                      )}
                      <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                        {empresaAtual.nome}
                      </p>
                    </div>
                  )}
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t('layout.mobile.activeCompany')}
                  </label>
                  <select
                    value={empresaAtualId ?? ''}
                    onChange={(e) => handleSelectEmpresa(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {empresas.map((empresa) => (
                      <option key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={themeActionLabel}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {isDark ? <MoonStar className="h-5 w-5" /> : <SunMedium className="h-5 w-5" />}
                {isDark ? 'Modo escuro ativo' : 'Modo claro ativo'}
              </button>
              <button
                onClick={() => {
                  navigate('/configuracoes');
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Settings className="w-5 h-5" />
                {t('layout.actions.settings')}
              </button>
              <button className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800">
                <Bell className="w-5 h-5" />
                {t('layout.mobile.notifications')}
              </button>
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
              >
                <LogOut className="w-5 h-5" />
                {t('layout.mobile.logout')}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main content */}
      <main className="mx-auto w-full flex-1 px-4 py-3 sm:px-6 sm:py-4 md:px-8 lg:px-10 lg:py-5 xl:px-12">
        {children}
      </main>

      {/* Version Badge */}
      <footer className="mt-auto">
        <VersionBadge />
      </footer>
    </div>
  );
}

~~~

---
## FILE: src/react-app/components/AssinaturaModal.tsx
~~~tsx
/**
 * MODAL DE ASSINATURA DIGITAL
 * Modelo atualizado: Campo de assinatura via mouse/touch + Declaração + Checkbox de confirmação
 * Data: 03/12/2025
 */

import { useRef, useState, useEffect } from 'react';
import { X, PenTool } from 'lucide-react';
import { toast } from 'sonner';

interface AssinaturaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSalvar: (aprovado?: boolean, signatureDataUrl?: string) => void;
  papel: 'INSTRUTOR' | 'TRIPULANTE';
  children?: React.ReactNode; // Conteúdo adicional (ex: avaliação de checks)
}

export default function AssinaturaModal({
  isOpen,
  onClose,
  onSalvar,
  papel,
  children,
}: AssinaturaModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [desenhando, setDesenhando] = useState(false);
  const [assinado, setAssinado] = useState(false);
  const [concordo, setConcordo] = useState(false);
  const [assinaturaTexto, setAssinaturaTexto] = useState('');
  const [aprovado, setAprovado] = useState<boolean | null>(null);

  const configurarCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width || canvas.clientWidth || 700);
    const cssHeight = Math.max(1, rect.height || canvas.clientHeight || 180);
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
    if (isOpen) {
      const frame = window.requestAnimationFrame(() => {
        configurarCanvas();
      });

      setConcordo(false);
      setAssinaturaTexto('');
      setAprovado(null);

      return () => window.cancelAnimationFrame(frame);
    }
  }, [isOpen]);

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
      setDesenhando(true);
      setAssinado(true);
    }
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

  const pararDesenho = () => {
    setDesenhando(false);
  };

  const limpar = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      setAssinado(false);
    }
  };

  const salvar = () => {
    // Validações opcionais para UX (backend não usa esses dados, apenas valida presença)
    if (!assinado) {
      toast.warning('Por favor, desenhe sua assinatura no campo acima');
      return;
    }

    if (!concordo) {
      toast.warning('Por favor, confirme a declaração antes de continuar');
      return;
    }

    // Instrutor DEVE escolher aprovação antes de assinar
    if (papel === 'INSTRUTOR' && aprovado === null) {
      toast.warning('Por favor, indique se a sessão foi APROVADA ou NÃO APROVADA');
      return;
    }

    const signatureDataUrl = canvasRef.current?.toDataURL('image/png');
    onSalvar(papel === 'INSTRUTOR' ? (aprovado ?? undefined) : undefined, signatureDataUrl);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <PenTool size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Assinatura Digital</h2>
              <p className="text-sm text-blue-100">
                {papel === 'INSTRUTOR' ? 'Instrutor-Administrador' : 'Participante'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded-lg p-2 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Instruções */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900 font-medium mb-1">
              <strong>Instruções:</strong> Desenhe sua assinatura no campo abaixo usando o mouse ou
              touch.
            </p>
            <p className="text-xs text-blue-700">
              Você pode limpar e refazer quantas vezes quiser antes de confirmar.
            </p>
          </div>

          {/* Campo de Assinatura (Canvas) */}
          <div className="mb-4">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Assinatura *</label>
            <div className="border-2 border-slate-300 rounded-lg overflow-hidden bg-slate-50 hover:border-blue-500 transition">
              <canvas
                ref={canvasRef}
                width={700}
                height={180}
                className="w-full cursor-crosshair touch-none"
                onMouseDown={iniciarDesenho}
                onMouseMove={desenhar}
                onMouseUp={pararDesenho}
                onMouseLeave={pararDesenho}
                onTouchStart={(e) => {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const mouseEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                  });
                  canvasRef.current?.dispatchEvent(mouseEvent);
                }}
                onTouchMove={(e) => {
                  e.preventDefault();
                  const touch = e.touches[0];
                  const mouseEvent = new MouseEvent('mousemove', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                  });
                  canvasRef.current?.dispatchEvent(mouseEvent);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  const mouseEvent = new MouseEvent('mouseup', {});
                  canvasRef.current?.dispatchEvent(mouseEvent);
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500">Desenhe sua assinatura no campo acima</p>
              <button
                type="button"
                onClick={limpar}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                🗑️ Limpar Assinatura
              </button>
            </div>
          </div>

          {/* Declaração */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-4">
            <p className="text-xs text-slate-700 mb-2">
              <strong className="text-slate-900">Declaração:</strong> Ao confirmar esta assinatura
              digital, declaro que:
            </p>
            <ul className="text-xs text-slate-600 space-y-1 ml-4 list-disc">
              <li>Li e concordo com as informações contidas nesta ficha</li>
              <li>A avaliação reflete fielmente o desempenho observado</li>
              <li>Esta assinatura tem validade legal para fins de registro</li>
            </ul>
          </div>

          {/* Checkbox de Confirmação */}
          <div className="flex items-start gap-3 mb-6">
            <input
              type="checkbox"
              id="concordo"
              checked={concordo}
              onChange={(e) => setConcordo(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-primary/30"
            />
            <label htmlFor="concordo" className="text-sm text-slate-700 cursor-pointer">
              * Campo obrigatório
            </label>
          </div>

          {/* Aprovação do Instrutor (OBRIGATÓRIO) */}
          {papel === 'INSTRUTOR' && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-5 mb-6">
              <label className="block text-sm font-bold text-amber-900 mb-3">
                ⚠️ Aprovação da Sessão *
              </label>
              <p className="text-xs text-amber-700 mb-4">
                Como instrutor, você deve indicar se a sessão foi APROVADA ou NÃO APROVADA.
              </p>
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setAprovado(true)}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 font-semibold text-sm transition ${
                    aprovado === true
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-green-700 border-green-300 hover:bg-green-50'
                  }`}
                >
                  ✓ APROVADO
                </button>
                <button
                  type="button"
                  onClick={() => setAprovado(false)}
                  className={`flex-1 px-4 py-3 rounded-lg border-2 font-semibold text-sm transition ${
                    aprovado === false
                      ? 'bg-red-600 text-white border-red-600'
                      : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                  }`}
                >
                  ✗ NÃO APROVADO
                </button>
              </div>
            </div>
          )}

          {/* Conteúdo Adicional (ex: Avaliação de Checks) */}
          {children && <div className="mb-6">{children}</div>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 rounded-b-xl">
          <p className="text-xs text-slate-500">Data/Hora: {new Date().toLocaleString('pt-BR')}</p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={salvar}
              disabled={!assinado || !concordo || (papel === 'INSTRUTOR' && aprovado === null)}
              className="px-6 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              ✓ Confirmar Assinatura
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

~~~

---
## FILE: src/react-app/components/Badge.tsx
~~~tsx
import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  size?: 'sm' | 'md';
}

export default function Badge({ children, variant = 'neutral', size = 'sm' }: BadgeProps) {
  const variants = {
    success: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    danger: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-primary/20 text-primary border-blue-200',
    neutral: 'bg-gray-100 text-gray-800 border-gray-200'
  };

  const sizes = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-sm'
  };

  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${variants[variant]} ${sizes[size]}`}>
      {children}
    </span>
  );
}

~~~

---
## FILE: src/react-app/components/Button.tsx
~~~tsx
import { ReactNode, ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const baseClasses =
    'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variants = {
    primary: 'bg-primary text-white hover:bg-primary/90 focus:ring-primary/30 shadow-sm',
    secondary:
      'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 focus:ring-slate-500 shadow-sm',
    danger:
      'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 focus:ring-red-500 shadow-lg shadow-red-500/25',
    ghost: 'text-slate-700 hover:bg-slate-100 focus:ring-slate-500',
  };

  const sizes = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${loading || disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
      disabled={loading || disabled}
      {...props}
    >
      {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
      {children}
    </button>
  );
}

~~~

---
## FILE: src/react-app/components/Card.tsx
~~~tsx
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  gradient?: boolean;
}

export default function Card({ children, className = '', gradient = false }: CardProps) {
  return (
    <div className={`
      ${gradient 
        ? 'bg-gradient-to-br from-white via-blue-50/50 to-indigo-50/50' 
        : 'bg-white/80'
      }
      backdrop-blur-lg rounded-xl border border-blue-200/50 shadow-lg shadow-blue-500/10 
      hover:shadow-xl hover:shadow-blue-500/20 transition-all duration-300
      ${className}
    `}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return (
    <div className={`p-6 border-b border-blue-200/50 ${className}`}>
      {children}
    </div>
  );
}

interface CardContentProps {
  children: ReactNode;
  className?: string;
}

export function CardContent({ children, className = '' }: CardContentProps) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}

~~~

---
## FILE: src/react-app/components/CertificadoLista.tsx
~~~tsx
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { FileText, Trash2, Calendar, File } from 'lucide-react';
import { confirmDialog } from '@/react-app/utils/confirmDialog';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { previewPdfBeforeDownload } from '@/react-app/utils/pdfPreview';

interface Certificado {
  id: number;
  arquivo_nome: string;
  arquivo_url: string;
  arquivo_tamanho: number;
  arquivo_tamanho_comprimido?: number;
  compressao_percentual?: number;
  qualificacao_codigo: string;
  qualificacao_nome: string;
  qualificacao_tipo: string;
  data_documento: string;
  uploaded_at: string;
}

interface CertificadoListaProps {
  funcionarioId: number;
  onDelete?: (id: number) => void;
  refreshTrigger?: number;
}

export default function CertificadoLista({
  funcionarioId,
  onDelete,
  refreshTrigger,
}: CertificadoListaProps) {
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarCertificados();
  }, [funcionarioId, refreshTrigger]);

  const carregarCertificados = async () => {
    try {
      const res = await apiFetch(`/api/certificados/funcionario/${funcionarioId}`);
      const data = await res.json();
      if (data.success) {
        setCertificados(data.data);
      }
    } catch (error) {
      console.error('Erro ao carregar certificados:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id: number, filename: string) => {
    try {
      await previewPdfBeforeDownload({
        fileName: filename,
        title: 'Certificado',
        fetcher: () => apiFetch(`/api/pasta-virtual/stream/${id}`),
      });
    } catch (error) {
      console.error('Erro ao baixar certificado:', error);
      toast.warning('Erro ao baixar certificado');
    }
  };

  const handleDelete = async (id: number) => {
    if (!await confirmDialog('Tem certeza que deseja excluir este certificado?')) {
      return;
    }

    try {
      const res = await apiFetch(`/api/certificados/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        setCertificados((prev) => prev.filter((c) => c.id !== id));
        if (onDelete) onDelete(id);
      } else {
        toast.warning('Erro ao excluir certificado');
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      toast.warning('Erro ao excluir certificado');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getTipoBadge = (tipo: string) => {
    const badges = {
      TREINAMENTO: 'bg-primary/20 text-blue-700',
      EXAME: 'bg-purple-100 text-purple-700',
      CHECK: 'bg-emerald-100 text-emerald-700',
    };
    return badges[tipo as keyof typeof badges] || 'bg-gray-100 text-gray-700';
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
        <p className="mt-2 text-gray-600">Carregando certificados...</p>
      </div>
    );
  }

  if (certificados.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600">Nenhum certificado cadastrado</p>
        <p className="text-sm text-gray-500 mt-1">Faça o upload do primeiro certificado acima</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2">
        <File className="h-5 w-5" />
        Certificados ({certificados.length})
      </h3>

      {certificados.map((cert) => (
        <div
          key={cert.id}
          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
        >
          <div className="flex items-start justify-between">
            {/* Info */}
            <div className="flex items-start gap-3 flex-1">
              <FileText className="h-10 w-10 text-red-600 flex-shrink-0 mt-1" />

              <div className="flex-1 min-w-0">
                {/* Nome do arquivo */}
                <p className="font-medium text-gray-900 truncate">{cert.arquivo_nome}</p>

                {/* Qualificação */}
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${getTipoBadge(
                      cert.qualificacao_tipo,
                    )}`}
                  >
                    {cert.qualificacao_tipo}
                  </span>
                  <span className="text-sm text-gray-600">
                    {cert.qualificacao_codigo} - {cert.qualificacao_nome}
                  </span>
                </div>

                {/* Metadados */}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(cert.data_documento + 'T00:00:00').toLocaleDateString('pt-BR')}
                  </span>
                  <span>
                    {formatFileSize(cert.arquivo_tamanho_comprimido || cert.arquivo_tamanho)}
                    {cert.compressao_percentual && cert.compressao_percentual > 0 && (
                      <span className="ml-2 text-green-600 font-medium">
                        📦 -{cert.compressao_percentual.toFixed(0)}%
                      </span>
                    )}
                  </span>
                  <span>Upload: {new Date(cert.uploaded_at).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-2 ml-4">
              {/* Download do certificado */}
              <button
                onClick={() => handleDownload(cert.id, cert.arquivo_nome)}
                className="p-2 text-primary hover:bg-primary/10 rounded transition"
                title="Download do certificado"
              >
                <File className="h-5 w-5" />
              </button>

              <button
                onClick={() => handleDelete(cert.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded transition"
                title="Excluir"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

~~~

---
## FILE: src/react-app/components/CertificadoUpload.tsx
~~~tsx
import { useState, useRef } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Upload, File, X, Check, AlertCircle } from 'lucide-react';

interface CertificadoUploadProps {
  qualificacaoId: number;
  funcionarioId: number;
  dataDocumento?: string;
  onUploadSuccess?: (certificado: any) => void;
}

export default function CertificadoUpload({
  qualificacaoId,
  funcionarioId,
  dataDocumento,
  onUploadSuccess,
}: CertificadoUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setError('Apenas arquivos PDF são permitidos');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo: 10MB');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setSuccess(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];

    if (droppedFile && droppedFile.type === 'application/pdf') {
      if (droppedFile.size <= 10 * 1024 * 1024) {
        setFile(droppedFile);
        setError(null);
        setSuccess(false);
      } else {
        setError('Arquivo muito grande. Máximo: 10MB');
      }
    } else {
      setError('Apenas arquivos PDF são permitidos');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('funcionarioId', funcionarioId.toString());
      formData.append('qualificacaoId', qualificacaoId.toString());

      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      // ✅ CORRIGIDO: Usar endpoint correto /historico/:id/certificados/upload
      const response = await fetch(
        `${API_BASE_URL}/certificados/historico/${qualificacaoId}/certificados/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      clearInterval(progressInterval);
      setProgress(100);

      const data = await response.json();

      if (data.success) {
        setSuccess(true);
        setFile(null);
        if (onUploadSuccess) {
          onUploadSuccess(data.data);
        }
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(data.error || 'Erro ao fazer upload');
      }
    } catch (err) {
      setError('Erro ao fazer upload do arquivo');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setError(null);
    setSuccess(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`border-2 border-dashed rounded-lg p-5 text-center transition ${
          file ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-blue-400'
        }`}
      >
        {!file ? (
          <>
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-gray-700 font-medium mb-2">Arraste o arquivo PDF aqui</p>
            <p className="text-gray-500 text-sm mb-4">ou clique para selecionar</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="inline-block px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 cursor-pointer"
            >
              Selecionar PDF
            </label>
            <p className="text-gray-400 text-xs mt-4">Máximo: 10MB</p>
          </>
        ) : (
          <div className="flex items-center justify-between bg-white p-4 rounded border border-blue-200">
            <div className="flex items-center gap-3">
              <File className="h-10 w-10 text-red-600" />
              <div className="text-left">
                <p className="font-medium text-gray-900">{file.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(file.size)}</p>
              </div>
            </div>
            <button
              onClick={handleRemoveFile}
              disabled={uploading}
              className="text-gray-400 hover:text-red-600 disabled:opacity-50"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Fazendo upload...</span>
            <span className="text-gray-600">{progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded text-green-700">
          <Check className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">Certificado enviado com sucesso!</span>
        </div>
      )}

      {/* Upload Button */}
      {file && !uploading && !success && (
        <button
          onClick={handleUpload}
          className="w-full px-4 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition"
        >
          Fazer Upload
        </button>
      )}
    </div>
  );
}

~~~

---
## FILE: src/react-app/components/ContentCard.tsx
~~~tsx
import React from 'react';

interface ContentCardProps {
  children: React.ReactNode;
  className?: string;
}

export const ContentCard: React.FC<ContentCardProps> = ({ children, className = '' }) => {
  return (
    <div
      className={`flex flex-col gap-4 rounded-lg border border-slate-200 p-6 bg-white ${className}`}
    >
      {children}
    </div>
  );
};

export default ContentCard;

~~~

---
## FILE: src/react-app/components/EmptyState.tsx
~~~tsx

import React from 'react';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-16 px-4">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 rounded-full mb-4">
        <div className="text-gray-400">
          {icon}
        </div>
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {title}
      </h3>
      
      <p className="text-gray-600 mb-6 max-w-md mx-auto">
        {description}
      </p>
      
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium shadow-sm"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

~~~

---
## FILE: src/react-app/components/ErrorBoundary.tsx
~~~tsx
/**
 * Error Boundary Component - Captura erros em componentes React
 *
 * Benefícios:
 * - Previne white screen of death
 * - UI elegante com fallback
 * - Log em Sentry (produção)
 * - Detalhes técnicos em desenvolvimento
 * - Keyboard navigation acessível
 */

import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './UI/Button';
import { Card, CardContent, CardHeader, CardTitle } from './UI/Card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

function isRecoverableAssetError(error: Error): boolean {
  const message = String(error?.message || '').toLowerCase();
  const stack = String(error?.stack || '').toLowerCase();
  const raw = `${message}\n${stack}`;

  return (
    raw.includes('chunkloaderror') ||
    raw.includes('loading chunk') ||
    raw.includes('failed to fetch dynamically imported module') ||
    raw.includes('importing a module script failed') ||
    (raw.includes('javascript mime') && raw.includes('text/html')) ||
    raw.includes('not a valid javascript mime type')
  );
}

async function hardRecoverOnce(error: Error): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isRecoverableAssetError(error)) return false;

  const key = `airtrust-hard-recover:${window.location.pathname}`;
  if (sessionStorage.getItem(key) === '1') return false;
  sessionStorage.setItem(key, '1');

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((reg) => reg.unregister()));
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('airtrust-'))
          .map((name) => caches.delete(name)),
      );
    }
  } catch {
    // Segue para reload mesmo se limpeza falhar.
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('hard_refresh', Date.now().toString());
  window.location.replace(nextUrl.toString());
  return true;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error para serviço de monitoring
    console.error('🚨 ErrorBoundary caught an error:', error, errorInfo);

    // Callback customizado
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    this.setState({
      errorInfo,
    });

    void hardRecoverOnce(error);

    // Enviar para serviço de tracking (Sentry, etc)
    if (typeof window !== 'undefined' && (window as any).Sentry) {
      (window as any).Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoHome = (): void => {
    this.handleReset();
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Usar fallback customizado se fornecido
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Fallback padrão elegante
      return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex items-center justify-center p-4">
          <Card className="max-w-lg w-full shadow-xl border-0">
            <CardHeader className="pb-3">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-critical/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={24} className="text-critical" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-xl text-slate-900">Algo deu errado</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">
                    Ocorreu um erro inesperado. A equipe foi notificada.
                  </p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Always allow inspecting error details (production too) */}
              {this.state.error && (
                <details
                  className="group cursor-pointer"
                  role="region"
                  aria-label="Detalhes técnicos do erro"
                  open={true}
                >
                  <summary className="select-none flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-900 py-2 px-3 rounded-md hover:bg-slate-50">
                    <span className="group-open:rotate-90 transition-transform inline-block">
                      ▶
                    </span>
                    Detalhes técnicos
                  </summary>
                  <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                        Mensagem do Erro
                      </p>
                      <pre className="text-xs text-critical font-mono overflow-auto max-h-24 p-2 bg-white rounded border border-slate-200">
                        {this.state.error.toString()}
                      </pre>
                    </div>

                    {this.state.errorInfo && (
                      <div>
                        <p className="text-xs font-semibold text-slate-600 mb-1 uppercase tracking-wide">
                          Stack de Componentes
                        </p>
                        <pre className="text-xs text-slate-700 font-mono overflow-auto max-h-32 p-2 bg-white rounded border border-slate-200 whitespace-pre-wrap break-words">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* Dica útil */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-900">
                  💡 <strong>Dica:</strong> Tente recarregar a página. Se o problema persistir,
                  entre em contato com o suporte.
                </p>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={this.handleReset}
                  variant="primary"
                  className="flex-1"
                  leftIcon={<RefreshCw size={16} />}
                >
                  Tentar Novamente
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="secondary"
                  className="flex-1"
                  leftIcon={<Home size={16} />}
                >
                  Ir para Início
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook para usar Error Boundary programaticamente
 */
export function useErrorHandler() {
  const handleError = (error: Error) => {
    throw error;
  };

  return handleError;
}

export default ErrorBoundary;

~~~

---
## FILE: src/react-app/components/ExportButton.tsx
~~~tsx
import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { API_BASE_URL } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import { toast } from 'sonner';

interface ExportButtonProps {
  /**
   * Tipo de exportação
   */
  type: 'funcionarios' | 'qualificacoes-historico' | 'qualificacoes-tipos';

  /**
   * Texto do botão (opcional)
   */
  label?: string;

  /**
   * Variante de cor do botão
   */
  variant?: 'primary' | 'secondary' | 'emerald' | 'amber';

  /**
   * Classe CSS adicional
   */
  className?: string;
}

/**
 * Mapeamento de tipos para endpoints e labels
 */
const EXPORT_CONFIG = {
  funcionarios: {
    endpoint: '/exportacao/funcionarios',
    defaultLabel: 'Exportar Funcionários',
    fileName: 'funcionarios',
  },
  'qualificacoes-historico': {
    endpoint: '/exportacao/qualificacoes-historico',
    defaultLabel: 'Exportar Histórico',
    fileName: 'qualificacoes_historico',
  },
  'qualificacoes-tipos': {
    endpoint: '/exportacao/qualificacoes-tipos',
    defaultLabel: 'Exportar Modelos',
    fileName: 'qualificacoes_tipos',
  },
};

/**
 * Variantes de estilo do botão
 */
const BUTTON_VARIANTS = {
  primary: 'bg-primary text-white hover:bg-primary/90 border-primary',
  secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
  emerald: 'bg-white text-emerald-700 border-emerald-600 hover:bg-emerald-50',
  amber: 'bg-white text-amber-700 border-amber-600 hover:bg-amber-50',
};

/**
 * Botão de Exportação para Excel/CSV
 *
 * Exporta dados do sistema em formato CSV para download
 *
 * @example
 * ```tsx
 * <ExportButton type="funcionarios" variant="emerald" />
 * <ExportButton type="qualificacoes-historico" label="Download CSV" />
 * ```
 */
export const ExportButton: React.FC<ExportButtonProps> = ({
  type,
  label,
  variant = 'emerald',
  className = '',
}) => {
  const { token } = useAuth();
  const [isExporting, setIsExporting] = useState(false);

  const config = EXPORT_CONFIG[type];
  const buttonLabel = label || config.defaultLabel;
  const buttonClass = BUTTON_VARIANTS[variant];

  const handleExport = async () => {
    if (!token) {
      toast.error('Você precisa estar autenticado para exportar');
      return;
    }

    setIsExporting(true);
    const loadingToast = toast.loading('Preparando exportação...');

    try {
      const response = await fetch(`${API_BASE_URL}${config.endpoint}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
        throw new Error(errorData.error || `Erro HTTP ${response.status}`);
      }

      // Verificar se é CSV ou JSON de erro
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        // Resposta JSON (erro)
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erro ao exportar');
      }

      // Resposta CSV (sucesso)
      const blob = await response.blob();

      // Criar link de download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Nome do arquivo com timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `${config.fileName}_${timestamp}.csv`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Exportação concluída com sucesso!', { id: loadingToast });
    } catch (error: any) {
      console.error('[EXPORT] Erro ao exportar:', error);
      toast.error(error.message || 'Erro ao exportar dados', { id: loadingToast });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className={`inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-4 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${buttonClass} ${className}`}
      title={`Exportar dados em formato CSV`}
    >
      <Download size={18} className={isExporting ? 'animate-pulse' : ''} />
      {isExporting ? 'Exportando...' : buttonLabel}
    </button>
  );
};

export default ExportButton;

~~~

---
## FILE: src/react-app/components/FixRenovadasButton.tsx
~~~tsx
/**
 * ========================================
 * COMPONENTE: Fix Renovadas Button
 * Botão para corrigir lógica de renovadas pós-importação
 * ========================================
 */

import { useState, useTransition } from 'react';
import { api } from '../utils/api-client';

interface FixRenovadasResult {
  success: boolean;
  data?: {
    total_renovadas: number;
    total_vinculadas: number;
    execution_time_ms: number;
  };
  error?: string;
}

interface StatsData {
  total: number;
  renovadas: number;
  vinculadas: number;
  total_funcionarios: number;
  funcionarios_com_renovacao: number;
}

export function FixRenovadasButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<FixRenovadasResult | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isPending, startTransition] = useTransition();

  // Carregar estatísticas ao montar
  useState(() => {
    loadStats();
  });

  const loadStats = async () => {
    try {
      const response = await api.get('/qualificacoes-historico/fix-renovadas/stats');
      if (response.success) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar stats:', error);
    }
  };

  const handleExecute = async () => {
    startTransition(async () => {
      try {
        const response = await api.post('/qualificacoes-historico/fix-renovadas', {});
        setResult(response as FixRenovadasResult);
        if (response.success) {
          await loadStats(); // Recarregar stats após sucesso
        }
      } catch (error) {
        setResult({
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
      setShowConfirm(false);
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">🔄 Corrigir Lógica de Renovadas</h3>

      <p className="text-sm text-gray-600 mb-4">
        Identifica automaticamente qualificações renovadas após importação de dados e marca
        corretamente o status e vínculo entre registros.
      </p>

      {/* Estatísticas atuais */}
      {stats && (
        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">📊 Status Atual:</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-600">Total de registros:</span>
              <span className="ml-2 font-semibold text-gray-800">{stats.total}</span>
            </div>
            <div>
              <span className="text-gray-600">Marcados como renovadas:</span>
              <span className="ml-2 font-semibold text-purple-600">{stats.renovadas}</span>
            </div>
            <div>
              <span className="text-gray-600">Com vínculo:</span>
              <span className="ml-2 font-semibold text-blue-600">{stats.vinculadas}</span>
            </div>
            <div>
              <span className="text-gray-600">Funcionários:</span>
              <span className="ml-2 font-semibold text-gray-800">
                {stats.funcionarios_com_renovacao} / {stats.total_funcionarios}
              </span>
            </div>
          </div>
        </div>
      )}

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isPending}
          className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Processando...' : 'Executar Correção'}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm font-semibold text-yellow-800 mb-1">⚠️ Esta operação irá:</p>
            <ul className="text-xs text-yellow-700 space-y-1 ml-4">
              <li>
                • Identificar qualificações sequenciais (mesmo funcionário + mesmo tipo de
                qualificação)
              </li>
              <li>• Marcar registros antigos com status "renovada"</li>
              <li>• Vincular registros novos aos antigos via campo renovacao_de</li>
              <li>• Atualizar automaticamente a visualização na tela de histórico</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
              disabled={isPending}
            >
              Cancelar
            </button>

            <button
              onClick={handleExecute}
              disabled={isPending}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? (
                <>
                  <span className="inline-block animate-spin mr-2">⚙️</span>
                  Processando...
                </>
              ) : (
                'Confirmar Correção'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Resultado da execução */}
      {result?.success && result.data && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <h4 className="font-semibold text-green-800 mb-2">✅ Correção aplicada com sucesso!</h4>
          <ul className="text-sm text-green-700 space-y-1">
            <li>
              • <strong>{result.data.total_renovadas}</strong> registros marcados como RENOVADA
            </li>
            <li>
              • <strong>{result.data.total_vinculadas}</strong> vínculos criados entre registros
            </li>
            <li>
              • Tempo de execução: <strong>{result.data.execution_time_ms}ms</strong>
            </li>
          </ul>
          <p className="text-xs text-green-600 mt-2">
            💡 Atualize a página de histórico para ver as mudanças
          </p>
        </div>
      )}

      {result?.error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="font-semibold text-red-800 mb-1">❌ Erro ao executar correção</p>
          <p className="text-sm text-red-700">{result.error}</p>
        </div>
      )}
    </div>
  );
}

~~~

---
## FILE: src/react-app/components/Form/FormDateInput.tsx
~~~tsx
/**
 * src/react-app/components/Form/FormDateInput.tsx
 * Componente de input de data com validação
 */

import React, { useState, useCallback } from 'react';
import { AlertCircle, Calendar } from 'lucide-react';

interface FormDateInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: string;
  maxDate?: string;
  onValidationError?: (error: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  className?: string;
}

export function FormDateInput({
  label,
  value,
  onChange,
  minDate,
  maxDate,
  onValidationError,
  error,
  required = false,
  disabled = false,
  helperText,
  className = '',
}: FormDateInputProps) {
  const [validationError, setValidationError] = useState<string>('');

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;

      if (!newValue) {
        setValidationError('');
        onChange(newValue);
        return;
      }

      const date = new Date(newValue + 'T00:00:00');
      let currentError = '';

      // Validar minDate
      if (minDate) {
        const min = new Date(minDate + 'T00:00:00');
        if (date < min) {
          currentError = `Data não pode ser anterior a ${formatDateBR(minDate)}`;
        }
      }

      // Validar maxDate
      if (!currentError && maxDate) {
        const max = new Date(maxDate + 'T00:00:00');
        if (date > max) {
          currentError = `Data não pode ser posterior a ${formatDateBR(maxDate)}`;
        }
      }

      setValidationError(currentError);
      if (currentError) {
        onValidationError?.(currentError);
      }

      onChange(newValue);
    },
    [minDate, maxDate, onChange, onValidationError]
  );

  const displayError = error || validationError;

  return (
    <div className={`mb-4 ${className}`}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </span>
      </label>

      <input
        type="date"
        value={value}
        onChange={handleChange}
        min={minDate}
        max={maxDate}
        disabled={disabled}
        required={required}
        className={`w-full px-3 py-2 border rounded-lg transition-colors
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}
          ${
            displayError
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 focus:ring-primary/30'
          }
          focus:outline-none focus:ring-2
        `}
        aria-invalid={!!displayError}
        aria-describedby={displayError ? `${label}-error` : undefined}
      />

      {displayError && (
        <div
          id={`${label}-error`}
          className="flex items-center gap-1 text-red-500 text-sm mt-2"
        >
          <AlertCircle className="w-4 h-4" />
          {displayError}
        </div>
      )}

      {helperText && !displayError && (
        <p className="text-gray-500 text-sm mt-1">{helperText}</p>
      )}
    </div>
  );
}

function formatDateBR(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR');
}

~~~
