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
