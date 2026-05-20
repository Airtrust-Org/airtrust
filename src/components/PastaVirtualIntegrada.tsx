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
