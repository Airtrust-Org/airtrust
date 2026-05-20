# 🎨 PADRÃO UNIFICADO DE TELAS - AIRTRUST v2

> **Aplicar este padrão em TODAS as páginas**  
> Garante consistência visual e funcional  
> Copiar inteiramente para Windsurf/Cursor

---

## 📐 ESTRUTURA BASE DE PÁGINA

```typescript
import React, { useState, useEffect } from 'react';
import { ChevronDown, Plus, Search, Filter, MoreVertical, AlertCircle, CheckCircle, XCircle, FileX } from 'lucide-react';
import { FormDateInput } from '@/components/Form/FormDateInput';
import { FormInput } from '@/components/Form/FormInput';
import { FormSelect } from '@/components/Form/FormSelect';
import { StatCard } from '@/components/UI/StatCard';
import { useHabilitacoes } from '@/hooks/useHabilitacoes';
import { useCreateHabilitacao } from '@/hooks/useHabilitacoes';
import { ModalDeleteSeguro } from '@/components/Modals/ModalDeleteSeguro';

interface PaginaExemploProps {
  titulo: string;
  descricao?: string;
}

export function PaginaExemplo({ titulo, descricao }: PaginaExemploProps) {
  // ============================================
  // 1. ESTADO GLOBAL
  // ============================================
  
  const [filtros, setFiltros] = useState({
    page: 1,
    limit: 20,
    search: '',
    status: 'TODOS',
    ordenacao: 'recentes',
  });

  const [modalAberta, setModalAberta] = useState(false);
  const [itemSelecionado, setItemSelecionado] = useState<any>(null);
  const [modalDeleteAberta, setModalDeleteAberta] = useState(false);

  // ============================================
  // 2. HOOKS DE DADOS (React Query)
  // ============================================
  
  const { habilitacoes, loading, error, pagination, refetch } = useHabilitacoes({
    page: filtros.page,
    limit: filtros.limit,
    status: filtros.status !== 'TODOS' ? filtros.status : undefined,
  });

  const createMutation = useCreateHabilitacao();

  // ============================================
  // 3. FUNÇÕES DE AÇÃO
  // ============================================

  const handleFiltrar = (novosFiltros: typeof filtros) => {
    setFiltros({ ...novosFiltros, page: 1 });
  };

  const handlePesquisar = (termo: string) => {
    setFiltros(prev => ({ ...prev, search: termo, page: 1 }));
  };

  const handleCriar = async (dados: any) => {
    try {
      await createMutation.mutateAsync(dados);
      setModalAberta(false);
      refetch();
    } catch (error: any) {
      console.error('Erro ao criar:', error.message);
    }
  };

  const handleDelete = async (id: number) => {
    setItemSelecionado({ id });
    setModalDeleteAberta(true);
  };

  // ============================================
  // 4. EFEITO: Refetch ao mudar filtros
  // ============================================

  useEffect(() => {
    refetch();
  }, [filtros, refetch]);

  // ============================================
  // 5. RENDER PRINCIPAL
  // ============================================

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      
      {/* ============ HEADER ============ */}
      <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">{titulo}</h1>
              {descricao && (
                <p className="text-slate-600 text-sm mt-1">{descricao}</p>
              )}
            </div>
            <button
              onClick={() => setModalAberta(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg"
            >
              <Plus className="w-4 h-4" />
              Novo
            </button>
          </div>
        </div>
      </div>

      {/* ============ MAIN CONTENT ============ */}
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        
        {/* ---- STATS CARDS ---- */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total"
            value={pagination?.total || 0}
            icon={Filter}
            color="blue"
          />
          <StatCard
            label="Válidos"
            value={habilitacoes.filter(h => h.status === 'VÁLIDO').length}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            label="Vencendo"
            value={habilitacoes.filter(h => h.status === 'VENCENDO').length}
            icon={AlertCircle}
            color="amber"
          />
          <StatCard
            label="Vencidos"
            value={habilitacoes.filter(h => h.status === 'VENCIDA').length}
            icon={XCircle}
            color="red"
          />
        </div>

        {/* ---- FILTROS ---- */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Pesquisa */}
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar..."
                value={filtros.search}
                onChange={(e) => handlePesquisar(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status */}
            <select
              value={filtros.status}
              onChange={(e) => handleFiltrar({ ...filtros, status: e.target.value })}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="TODOS">Todos</option>
              <option value="VÁLIDO">Válidos</option>
              <option value="VENCENDO">Vencendo</option>
              <option value="VENCIDA">Vencida</option>
            </select>

            {/* Ordenação */}
            <select
              value={filtros.ordenacao}
              onChange={(e) => handleFiltrar({ ...filtros, ordenacao: e.target.value })}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="recentes">Mais Recentes</option>
              <option value="antiguos">Mais Antigos</option>
              <option value="vencimento">Por Vencimento</option>
            </select>

            {/* Limite */}
            <select
              value={filtros.limit}
              onChange={(e) => handleFiltrar({ ...filtros, limit: parseInt(e.target.value) })}
              className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={10}>10 por página</option>
              <option value={20}>20 por página</option>
              <option value={50}>50 por página</option>
              <option value={100}>100 por página</option>
            </select>
          </div>
        </div>

        {/* ---- LOADING STATE ---- */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <p className="text-slate-600 ml-4">Carregando dados...</p>
          </div>
        )}

        {/* ---- ERROR STATE ---- */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-800 font-medium">Erro ao carregar dados</p>
                <p className="text-red-600 text-sm mt-1">{error}</p>
              </div>
            </div>
            <button
              onClick={() => refetch()}
              className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Tentar Novamente
            </button>
          </div>
        )}

        {/* ---- EMPTY STATE ---- */}
        {!loading && habilitacoes.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-full mb-4">
              <FileX className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900">Nenhum resultado</h3>
            <p className="text-slate-600 text-sm mt-1">Tente ajustar seus filtros</p>
          </div>
        )}

        {/* ---- TABLE ---- */}
        {!loading && habilitacoes.length > 0 && (
          <>
            <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-slate-200">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Vencimento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Criação
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {habilitacoes.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {item.nome}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          item.status === 'VÁLIDO'
                            ? 'bg-green-100 text-green-800'
                            : item.status === 'VENCENDO'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {new Date(item.data_vencimento).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {new Date(item.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="inline-flex items-center gap-2 px-3 py-1 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Deletar"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ---- PAGINATION ---- */}
            {pagination && pagination.pages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <p className="text-sm text-slate-600">
                  Mostrando {(filtros.page - 1) * filtros.limit + 1} a{' '}
                  {Math.min(filtros.page * filtros.limit, pagination.total)} de{' '}
                  {pagination.total} resultados
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleFiltrar({ ...filtros, page: filtros.page - 1 })}
                    disabled={filtros.page === 1}
                    className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Anterior
                  </button>
                  <button
                    onClick={() => handleFiltrar({ ...filtros, page: filtros.page + 1 })}
                    disabled={filtros.page === pagination.pages}
                    className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ============ MODAL CRIAR ============ */}
      {modalAberta && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Novo Item</h2>
            
            <div className="space-y-4 mb-6">
              <FormInput
                label="Nome"
                value=""
                onChange={() => {}}
                required
              />
              
              <FormDateInput
                label="Data Conclusão"
                value=""
                onChange={() => {}}
                minDate={new Date().toISOString().split('T')[0]}
                required
              />

              <FormDateInput
                label="Data Vencimento"
                value=""
                onChange={() => {}}
                minDate={new Date().toISOString().split('T')[0]}
                required
              />

              <FormSelect
                label="Status"
                options={[
                  { label: 'Válido', value: 'VÁLIDO' },
                  { label: 'Vencendo', value: 'VENCENDO' },
                  { label: 'Vencida', value: 'VENCIDA' },
                ]}
                value=""
                onChange={() => {}}
                required
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setModalAberta(false)}
                className="flex-1 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleCriar({})}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODAL DELETE ============ */}
      {modalDeleteAberta && itemSelecionado && (
        <ModalDeleteSeguro
          titulo="Deletar Item"
          mensagem="Tem certeza? Esta ação é irreversível."
          itemId={itemSelecionado.id}
          onConfirm={() => {
            setModalDeleteAberta(false);
            refetch();
          }}
          onCancel={() => setModalDeleteAberta(false)}
        />
      )}
    </div>
  );
}
```

---

## 🎨 COMPONENTES DE SUPORTE

### StatCard.tsx
```typescript
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: 'blue' | 'green' | 'amber' | 'red';
}

export function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-600 text-sm font-medium">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`${colorMap[color]} p-3 rounded-lg`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Usar estrutura Header + Stats + Filtros + Table
- [ ] Implementar React Query para caching (5min stale)
- [ ] Estados: loading, error, empty sempre presentes
- [ ] Paginação quando pagination.pages > 1
- [ ] Modal para CRUD isolado
- [ ] Soft delete com confirmação
- [ ] Validação com Zod
- [ ] Auditoria logs em backend
- [ ] Mobile responsive (grid-cols-1 md:grid-cols-*)
- [ ] Accessibility (labels, ARIA)
- [ ] Spinner durante loading
- [ ] Toast de sucesso/erro

---

## 🎯 RESUMO VISUAL

```
┌─────────────────────────────────────────┐
│  HEADER (sticky)                        │
│  Título + CTA (Novo)                    │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  STATS CARDS (4 cols)                   │
│  Total | Válido | Vencendo | Vencido    │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  FILTROS (4 cols)                       │
│  Search | Status | Ordem | Limite       │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  TABLE                                  │
│  [rows com hover]                       │
│  PAGINATION: Anterior | Próxima         │
└─────────────────────────────────────────┘
```

---

**Pronto para copiar e colar em Windsurf!** ✨
