/**
 * ADVANCED DATATABLE - EXEMPLO DE IMPLEMENTAÇÃO REAL
 *
 * Este arquivo demonstra como usar o AdvancedDataTable com um caso real
 * de uso no AirTrust - página de Habilitações
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AdvancedDataTable } from '@/react-app/components/UI';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

interface Habilitacao {
  id: string;
  nome: string;
  categoria: string;
  descricao: string;
  dataVencimento: Date;
  dataRenovacao?: Date;
  status: 'valid' | 'expiring' | 'expired' | 'revoked';
  ativo: boolean;
}

// ============================================================================
// COMPONENTE DE EXEMPLO: PÁGINA HABILITAÇÕES
// ============================================================================

export function HabilitacoesAdvancedExample() {
  // ======================== STATE ========================
  const [habilitacoes, setHabilitacoes] = useState<Habilitacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // ======================== DADOS MOCK ========================
  const mockHabilitacoes: Habilitacao[] = [
    {
      id: '1',
      nome: 'Instrumento (IR)',
      categoria: 'Piloto',
      descricao: 'Rating de voo por instrumentos',
      dataVencimento: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      status: 'valid',
      ativo: true,
    },
    {
      id: '2',
      nome: 'Comercial (CPL)',
      categoria: 'Piloto',
      descricao: 'Licença comercial',
      dataVencimento: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      status: 'expiring',
      ativo: true,
    },
    {
      id: '3',
      nome: 'Multi-Piloto (ATPL)',
      categoria: 'Piloto',
      descricao: 'Linha aérea de transporte',
      dataVencimento: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      status: 'expired',
      ativo: false,
    },
    {
      id: '4',
      nome: 'Privada (PPL)',
      categoria: 'Piloto',
      descricao: 'Licença privada',
      dataVencimento: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      status: 'valid',
      ativo: true,
    },
  ];

  // ======================== LIFECYCLE ========================
  useEffect(() => {
    loadHabilitacoes();
  }, []);

  // ======================== HANDLERS ========================

  /** Carregar habilitações */
  const loadHabilitacoes = useCallback(async () => {
    setLoading(true);
    try {
      // Simular API call
      await new Promise((resolve) => setTimeout(resolve, 500));
      setHabilitacoes(mockHabilitacoes);
    } catch (error) {
      console.error('Erro ao carregar habilitações:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Editar habilitação */
  const handleEdit = useCallback((id: string | number) => {
    console.log('Editar habilitação:', id);
    setEditingId(String(id));
    // Abrir modal de edição
  }, []);

  /** Visualizar habilitação */
  const handleView = useCallback((id: string | number) => {
    console.log('Visualizar habilitação:', id);
    setViewingId(String(id));
    // Abrir modal de visualização
  }, []);

  /** Deletar habilitação */
  const handleDelete = useCallback(async (id: string | number) => {
    try {
      console.log('Deleting:', id);
      setHabilitacoes((prev) => prev.filter((h) => h.id !== id));
    } catch (error) {
      console.error('Erro ao deletar:', error);
    }
  }, []);

  /** Deletar múltiplas habilitações */
  const handleBulkDelete = useCallback(async (ids: (string | number)[]) => {
    try {
      console.log('Deletando múltiplas:', ids);
      setHabilitacoes((prev) => prev.filter((h) => !ids.includes(h.id)));
    } catch (error) {
      console.error('Erro ao deletar múltiplas:', error);
    }
  }, []);

  /** Exportar dados */
  const handleExport = useCallback((data: Habilitacao[], format: 'csv' | 'excel' | 'pdf') => {
    console.log(`Exportando ${data.length} habilitações em ${format}`);
    // Aqui você poderia fazer algo customizado antes de exportar
  }, []);

  /** Calcula status da habilitação */
  const getHabilitacaoStatus = (
    item: Habilitacao,
  ): 'valid' | 'expiring' | 'expired' | 'revoked' => {
    if (!item.ativo) return 'revoked';

    const dataVencimento = new Date(item.dataVencimento);
    const hoje = new Date();
    const diasParaVencer = Math.floor(
      (dataVencimento.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diasParaVencer < 0) return 'expired';
    if (diasParaVencer < 30) return 'expiring';
    return 'valid';
  };

  // ======================== COLUMNS DEFINITION ========================

  const columns = [
    {
      key: 'nome',
      label: 'Habilitação',
      sortable: true,
      searchable: true,
      width: 220,
      render: (value: string, item: Habilitacao) => (
        <div className="flex flex-col">
          <span className="font-semibold text-neutral-900">{value}</span>
          <span className="text-sm text-neutral-500">{item.categoria}</span>
        </div>
      ),
    },
    {
      key: 'descricao',
      label: 'Descrição',
      sortable: false,
      searchable: true,
      width: 300,
      render: (value: string) => <span className="text-neutral-600">{value}</span>,
    },
    {
      key: 'dataVencimento',
      label: 'Vencimento',
      sortable: true,
      searchable: false,
      width: 150,
      render: (value: Date) => {
        const formatted = new Date(value).toLocaleDateString('pt-BR');
        const daysLeft = Math.floor(
          (new Date(value).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
        );

        let color = 'text-green-600';
        if (daysLeft < 0) color = 'text-red-600';
        else if (daysLeft < 30) color = 'text-yellow-600';

        return (
          <div className="flex flex-col">
            <span className={`font-medium ${color}`}>{formatted}</span>
            {daysLeft >= 0 && <span className="text-sm text-neutral-500">{daysLeft} dias</span>}
          </div>
        );
      },
    },
    {
      key: 'ativo',
      label: 'Status',
      sortable: true,
      searchable: false,
      width: 120,
      render: (value: boolean) => (
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            value ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {value ? '✓ Ativa' : '✕ Inativa'}
        </span>
      ),
    },
  ];

  // ======================== RENDER ========================

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-neutral-900">Habilitações</h1>
        <p className="text-neutral-600">Gerenciar habilitações dos pilotos</p>
      </div>

      {/* Advanced DataTable */}
      <AdvancedDataTable
        // Data Props
        columns={columns}
        data={habilitacoes}
        idKey="id"
        // Status & Styling
        getRowStatus={getHabilitacaoStatus}
        // Callbacks
        onEdit={handleEdit}
        onDelete={handleDelete}
        onView={handleView}
        onBulkDelete={handleBulkDelete}
        onExport={handleExport}
        // States
        loading={loading}
        emptyMessage="Nenhuma habilitação cadastrada"
        // UI Options
        showActions={true}
        searchPlaceholder="Pesquisar por habilitação, categoria ou descrição..."
        // Features
        enableSearch={true}
        enablePagination={true}
        enableCheckboxes={true}
        enableExport={true}
        columnResizable={true}
        // Configuration
        searchableColumns={['nome', 'categoria', 'descricao']}
        pageSize={25}
      />
    </div>
  );
}

// ============================================================================
// EXEMPLO 2: TABELA SIMPLES (SEM RECURSOS AVANÇADOS)
// ============================================================================

export function HabilitacoesSimpleExample() {
  const [habilitacoes, setHabilitacoes] = useState<Habilitacao[]>([]);

  useEffect(() => {
    setHabilitacoes([
      {
        id: '1',
        nome: 'Instrumento (IR)',
        categoria: 'Piloto',
        descricao: 'Rating de voo por instrumentos',
        dataVencimento: new Date(),
        status: 'valid',
        ativo: true,
      },
    ]);
  }, []);

  return (
    <AdvancedDataTable
      columns={[
        { key: 'nome', label: 'Nome', sortable: true },
        { key: 'categoria', label: 'Categoria', sortable: true },
        { key: 'descricao', label: 'Descrição' },
      ]}
      data={habilitacoes}
      enableSearch={false}
      enablePagination={false}
      enableCheckboxes={false}
      enableExport={false}
      columnResizable={false}
    />
  );
}

// ============================================================================
// EXEMPLO 3: BULK OPERATIONS
// ============================================================================

interface Item {
  id: string;
  name: string;
  status: string;
}

export function BulkOperationsExample() {
  const [items, setItems] = useState<Item[]>([
    { id: '1', name: 'Item 1', status: 'active' },
    { id: '2', name: 'Item 2', status: 'active' },
    { id: '3', name: 'Item 3', status: 'inactive' },
  ]);

  return (
    <AdvancedDataTable
      columns={[
        { key: 'name', label: 'Nome', sortable: true, searchable: true },
        { key: 'status', label: 'Status', sortable: true },
      ]}
      data={items}
      enableCheckboxes={true}
      enableExport={true}
      onBulkDelete={(ids) => {
        setItems((prev) => prev.filter((item) => !ids.includes(item.id)));
      }}
      onExport={(data) => {
        console.log('Exportando:', data);
      }}
    />
  );
}

// ============================================================================
// EXEMPLO 4: CUSTOM COLUMN RENDERING
// ============================================================================

export function CustomRenderingExample() {
  const [data] = useState([
    {
      id: '1',
      title: 'Task 1',
      priority: 'high',
      dueDate: new Date('2025-11-10'),
      completed: true,
    },
    {
      id: '2',
      title: 'Task 2',
      priority: 'medium',
      dueDate: new Date('2025-11-15'),
      completed: false,
    },
  ]);

  const columns = [
    {
      key: 'title',
      label: 'Título',
      render: (value: string) => <span className="font-semibold">{value}</span>,
    },
    {
      key: 'priority',
      label: 'Prioridade',
      render: (value: string) => {
        const colors = {
          high: 'bg-red-100 text-red-800',
          medium: 'bg-yellow-100 text-yellow-800',
          low: 'bg-green-100 text-green-800',
        };
        return (
          <span
            className={`px-3 py-1 rounded-full text-sm ${colors[value as keyof typeof colors]}`}
          >
            {value.toUpperCase()}
          </span>
        );
      },
    },
    {
      key: 'dueDate',
      label: 'Data Limite',
      render: (value: Date) => new Date(value).toLocaleDateString('pt-BR'),
    },
    {
      key: 'completed',
      label: 'Concluído',
      render: (value: boolean) => (value ? '✓ Sim' : '✕ Não'),
    },
  ];

  return <AdvancedDataTable columns={columns} data={data} />;
}

export default HabilitacoesAdvancedExample;
