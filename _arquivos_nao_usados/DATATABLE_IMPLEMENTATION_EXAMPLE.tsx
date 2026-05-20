/**
 * EXAMPLE: How to use DataTable and StatusCard in a real page
 * This shows the integration pattern for Habilitações.tsx
 *
 * Copy and adapt this code to integrate DataTable and StatusCard
 * into your existing pages.
 */

import React, { useState, useEffect } from 'react';
import { DataTable, StatusCard } from '@/react-app/components/UI';
import { PageLayout, PageSection, PageGrid } from '@/react-app/components/layout/PageLayout';
import { CheckCircle, AlertCircle, XCircle, RotateCcw } from 'lucide-react';
import { statusBadges } from '@/react-app/styles/design-tokens';

// ============================================
// STEP 1: Define your data types
// ============================================

interface Habilitacao {
  id: number;
  funcionario_nome: string;
  qualificacao_codigo: string;
  qualificacao_nome: string;
  data_vencimento: string;
  data_emissao: string;
  status: 'VÁLIDO' | 'VENCENDO' | 'VENCIDA';
}

interface TableData extends Record<string, unknown> {
  id: number;
  funcionario: string;
  qualificacao: string;
  emissao: string;
  vencimento: string;
  status: string;
}

// ============================================
// STEP 2: Create status mapper function
// ============================================

const calculateHabilitacaoStatus = (dataVencimento: string): 'valid' | 'expiring' | 'expired' => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const vencimento = new Date(dataVencimento);
  vencimento.setHours(0, 0, 0, 0);

  const diasRestantes = (vencimento.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);

  if (diasRestantes < 0) return 'expired'; // VENCIDA
  if (diasRestantes < 30) return 'expiring'; // VENCENDO
  return 'valid'; // VÁLIDO
};

// ============================================
// STEP 3: Define table columns
// ============================================

const defineColumns = () => [
  {
    key: 'funcionario',
    label: 'Funcionário',
    sortable: true,
    width: '25%',
  },
  {
    key: 'qualificacao',
    label: 'Qualificação',
    sortable: true,
    width: '25%',
  },
  {
    key: 'emissao',
    label: 'Emissão',
    sortable: true,
    width: '15%',
  },
  {
    key: 'vencimento',
    label: 'Vencimento',
    sortable: true,
    width: '15%',
  },
  {
    key: 'status',
    label: 'Status',
    render: (value: unknown) => (
      <span className={statusBadges[String(value) as keyof typeof statusBadges]}>
        {String(value).toUpperCase()}
      </span>
    ),
    width: '10%',
  },
];

// ============================================
// STEP 4: Create the component
// ============================================

export function HabilitacoesWithDataTable() {
  const [habilitacoes, setHabilitacoes] = useState<Habilitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    valid: 0,
    expiring: 0,
    expired: 0,
  });
  const [filter, setFilter] = useState<'valid' | 'expiring' | 'expired' | null>(null);

  // Load data
  useEffect(() => {
    loadHabilitacoes();
  }, []);

  const loadHabilitacoes = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v2/habilitacoes');
      const data = await response.json();
      const habs: Habilitacao[] = Array.isArray(data?.data) ? data.data : [];
      setHabilitacoes(habs);
      calculateStats(habs);
    } catch (error) {
      console.error('Erro ao carregar habilitações:', error);
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // STEP 5: Calculate statistics
  // ============================================

  const calculateStats = (habs: Habilitacao[]) => {
    const stats = {
      total: habs.length,
      valid: habs.filter((h) => calculateHabilitacaoStatus(h.data_vencimento) === 'valid').length,
      expiring: habs.filter((h) => calculateHabilitacaoStatus(h.data_vencimento) === 'expiring')
        .length,
      expired: habs.filter((h) => calculateHabilitacaoStatus(h.data_vencimento) === 'expired')
        .length,
    };
    setStats(stats);
  };

  // ============================================
  // STEP 6: Transform data for DataTable
  // ============================================

  const transformToTableData = (habs: Habilitacao[]): TableData[] => {
    return habs.map((hab) => ({
      id: hab.id,
      funcionario: hab.funcionario_nome,
      qualificacao: hab.qualificacao_nome,
      emissao: new Date(hab.data_emissao).toLocaleDateString('pt-BR'),
      vencimento: new Date(hab.data_vencimento).toLocaleDateString('pt-BR'),
      status: calculateHabilitacaoStatus(hab.data_vencimento),
    }));
  };

  // ============================================
  // STEP 7: Filter data based on selected status
  // ============================================

  const getFilteredData = () => {
    if (!filter) {
      return transformToTableData(habilitacoes);
    }
    const filtered = habilitacoes.filter(
      (h) => calculateHabilitacaoStatus(h.data_vencimento) === filter,
    );
    return transformToTableData(filtered);
  };

  // ============================================
  // STEP 8: Define action handlers
  // ============================================

  const handleEdit = (id: string | number) => {
    console.log('Editar habilitação:', id);
    // Implement your edit logic here
  };

  const handleDelete = (id: string | number) => {
    console.log('Deletar habilitação:', id);
    // Implement your delete logic here
  };

  const handleView = (id: string | number) => {
    console.log('Visualizar habilitação:', id);
    // Implement your view logic here
  };

  const handleStatusCardClick = (status: 'valid' | 'expiring' | 'expired' | null) => {
    setFilter(status);
  };

  // ============================================
  // STEP 9: Render the component
  // ============================================

  return (
    <PageLayout
      title="Habilitações"
      subtitle="Gerenciamento de habilitações e qualificações de funcionários"
    >
      {/* Dashboard with StatusCards */}
      <PageSection title="Resumo">
        <PageGrid columns={4}>
          <StatusCard
            icon={RotateCcw}
            title="Total"
            count={stats.total}
            status="total"
            onClick={() => handleStatusCardClick(null)}
          />
          <StatusCard
            icon={CheckCircle}
            title="Válidas"
            count={stats.valid}
            status="valid"
            onClick={() => handleStatusCardClick('valid')}
          />
          <StatusCard
            icon={AlertCircle}
            title="Vencendo"
            count={stats.expiring}
            status="expiring"
            onClick={() => handleStatusCardClick('expiring')}
          />
          <StatusCard
            icon={XCircle}
            title="Vencidas"
            count={stats.expired}
            status="expired"
            onClick={() => handleStatusCardClick('expired')}
          />
        </PageGrid>
      </PageSection>

      {/* Table with StatusCard filtering */}
      <PageSection title={filter ? `Habilitações (Filtrado: ${filter})` : 'Todas as Habilitações'}>
        <DataTable
          columns={defineColumns()}
          data={getFilteredData()}
          getRowStatus={(item) => item.status as 'valid' | 'expiring' | 'expired'}
          idKey="id"
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          showActions={true}
          emptyMessage={
            filter ? `Nenhuma habilitação ${filter} encontrada` : 'Nenhuma habilitação encontrada'
          }
        />
      </PageSection>
    </PageLayout>
  );
}

// ============================================
// USAGE IN YOUR APP
// ============================================

/*
In your Router or App component:

import { HabilitacoesWithDataTable } from '@/react-app/pages/Habilitacoes';

// Use the new component instead of the old one
<Route path="/habilitacoes" element={<HabilitacoesWithDataTable />} />

*/

// ============================================
// KEY FEATURES DEMONSTRATED
// ============================================

/*
✅ Sortable columns - Click header to sort (asc/desc/none)
✅ Status-based row coloring - Rows automatically color based on status
✅ StatusCard dashboard - Click to filter by status
✅ Inline actions - Edit, Delete, View buttons
✅ Loading state - Shows while fetching data
✅ Empty state - Custom message when no data
✅ Data transformation - Map API response to table format
✅ Dynamic filtering - Filter by status using StatusCard
✅ Portuguese locale - Dates in pt-BR format
✅ Type safety - Full TypeScript support
*/

// ============================================
// ADAPTATION GUIDE
// ============================================

/*
To use this pattern in other pages:

1. Define your data interface
   interface MyData { ... }

2. Create a status mapper function
   const getMyStatus = (item) => 'valid' | 'expiring' | 'expired'

3. Define table columns with sortable fields
   const columns = [
     { key: 'field1', label: 'Label 1', sortable: true },
     { key: 'field2', label: 'Label 2', sortable: true },
   ]

4. Calculate statistics
   const stats = {
     total: data.length,
     valid: data.filter(...).length,
     expiring: data.filter(...).length,
     expired: data.filter(...).length,
   }

5. Render DataTable + StatusCards
   <StatusCard status="valid" count={stats.valid} onClick={...} />
   <DataTable columns={columns} data={data} getRowStatus={getMyStatus} />

6. Add action handlers
   const handleEdit = (id) => { ... }
   const handleDelete = (id) => { ... }
   const handleView = (id) => { ... }

*/

export default HabilitacoesWithDataTable;
