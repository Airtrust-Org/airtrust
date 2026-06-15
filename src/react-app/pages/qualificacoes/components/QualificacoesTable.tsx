/**
 * Tabela de Qualificações
 */

import {
  Edit2,
  Trash2,
  Download,
  Upload,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Award,
} from 'lucide-react';
import { EmptyState } from '@/react-app/components/UI/EmptyState';

interface Qualificacao {
  id: number;
  funcionario_nome: string;
  funcionario_matricula: string;
  tipo: string;
  codigo: string;
  nome?: string;
  data_conclusao?: string;
  data_vencimento?: string;
  status: string;
  certificado_url?: string;
  [key: string]: any;
}

interface Coluna {
  id: string;
  nome: string;
  visivel: boolean;
}

interface QualificacoesTableProps {
  qualificacoes: Qualificacao[];
  configColunas: Coluna[];
  orderBy: string;
  orderDir: 'asc' | 'desc';
  onSort: (field: string) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  onUploadCertificado: (id: number) => void;
  onDownloadCertificado: (url: string) => void;
  renderizarCelulas: (qual: Qualificacao) => React.ReactNode;
}

export default function QualificacoesTable({
  qualificacoes,
  configColunas,
  orderBy,
  orderDir,
  onSort,
  onEdit,
  onDelete,
  onUploadCertificado,
  onDownloadCertificado,
  renderizarCelulas,
}: QualificacoesTableProps) {
  const getSortIcon = (field: string) => {
    if (orderBy !== field) return <ArrowUpDown className="w-4 h-4" />;
    return orderDir === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {configColunas
                .filter((col) => col.visivel)
                .map((col) => (
                  <th
                    key={col.id}
                    onClick={() => col.id !== 'acoes' && onSort(col.id)}
                    className={`px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                      col.id !== 'acoes' ? 'cursor-pointer hover:bg-gray-100' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      {col.nome}
                      {col.id !== 'acoes' && getSortIcon(col.id)}
                    </div>
                  </th>
                ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {qualificacoes.length === 0 ? (
              <tr>
                <td colSpan={configColunas.filter((c) => c.visivel).length} className="py-8">
                  <EmptyState
                    icon={<Award size={48} className="text-slate-300" />}
                    title="Nenhuma qualificação"
                    description="Não foram encontradas qualificações para exibir baseadas no filtro atual."
                  />
                </td>
              </tr>
            ) : (
              qualificacoes.map((qual) => (
                <tr key={qual.id} className="hover:bg-gray-50">
                  {renderizarCelulas(qual)}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
