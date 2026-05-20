import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import { Plus, Search, Edit2, Trash2 } from 'lucide-react';
import Button from '@/react-app/components/Button';
import { PageLayout, PageSection } from '@/react-app/components/layout/PageLayout';
import { useConfirmDelete } from '../hooks/useConfirmDelete';

export default function Manobras() {
  const [manobras, setManobras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const { confirm, ConfirmDialog } = useConfirmDelete();

  useEffect(() => {
    fetchManobras();
  }, []);

  const fetchManobras = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/manobras`);
      const data = await response.json();
      setManobras(data.data || []);
    } catch (error) {
      console.error('Erro ao carregar manobras:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExcluir = (id: number, nome: string) => {
    confirm({
      message: 'Tem certeza que deseja excluir esta manobra?',
      itemName: nome,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/manobras/${id}`, {
            method: 'DELETE',
          });

          if (response.ok) {
            fetchManobras();
          } else {
            toast.warning('Erro ao excluir manobra');
          }
        } catch (error) {
          console.error('Erro ao excluir:', error);
          toast.warning('Erro ao excluir manobra');
        }
      },
    });
  };

  const filteredManobras = manobras.filter(
    (m: Record<string, unknown>) =>
      String(m.nome).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(m.codigo).toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (loading) {
    return (
      <PageLayout title="Manobras">
        <PageSection>
          <div className="p-6 text-center text-neutral-500">Carregando...</div>
        </PageSection>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Manobras"
      subtitle="Catálogo de manobras para treinamentos"
      action={
        <div className="flex gap-2">
          <Button variant="primary" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Manobra
          </Button>
        </div>
      }
    >
      <PageSection>
        <div className="p-6">
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            A importação deste catálogo foi centralizada em{' '}
            <a
              href="/importacao#fluxo-manobras"
              className="font-semibold text-primary hover:underline"
            >
              Importações e Exportações
            </a>
            .
          </div>

          {/* Search */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 h-5 w-5" />
              <input
                type="text"
                placeholder="Buscar manobras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-neutral-200 rounded-lg focus:ring-2 focus:ring-primary/30 focus:border-transparent"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className=" py-3 text-left text-xs font-semibold text-neutral-600 uppercase w-24">
                    Ações
                  </th>
                  <th className=" py-3 text-left text-xs font-semibold text-neutral-600 uppercase">
                    Código
                  </th>
                  <th className=" py-3 text-left text-xs font-semibold text-neutral-600 uppercase">
                    Nome
                  </th>
                  <th className=" py-3 text-left text-xs font-semibold text-neutral-600 uppercase">
                    Tipo
                  </th>
                  <th className=" py-3 text-left text-xs font-semibold text-neutral-600 uppercase">
                    Referência QRH
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredManobras.length === 0 ? (
                  <tr>
                    <td colSpan={5} className=" py-8 text-center text-neutral-500">
                      Nenhuma manobra encontrada
                    </td>
                  </tr>
                ) : (
                  filteredManobras.map((manobra) => {
                    const manobraTyped = manobra as Record<string, unknown>;
                    const id = String(manobraTyped.id);
                    return (
                      <tr
                        key={id}
                        className="border-t border-neutral-200 hover:bg-neutral-50 transition-colors"
                      >
                        <td className=" py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" title="Editar">
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleExcluir(
                                  manobraTyped.id as number,
                                  manobraTyped.nome as string,
                                )
                              }
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                        <td className=" py-3 font-medium text-neutral-900">
                          {String(manobraTyped.codigo)}
                        </td>
                        <td className=" py-3 text-neutral-900">{String(manobraTyped.nome)}</td>
                        <td className=" py-3 text-neutral-600">{String(manobraTyped.tipo)}</td>
                        <td className=" py-3 text-neutral-600">
                          {String(manobraTyped.referenciaQRH) || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PageSection>
      <ConfirmDialog />
    </PageLayout>
  );
}
