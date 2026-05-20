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
