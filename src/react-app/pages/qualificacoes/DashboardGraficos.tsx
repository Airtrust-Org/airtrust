import { useState, useEffect, useMemo } from 'react';
// import {
//   Chart as ChartJS,
//   CategoryScale,
//   LinearScale,
//   BarElement,
//   LineElement,
//   PointElement,
//   ArcElement,
//   Title,
//   Tooltip,
//   Legend,
// } from 'chart.js'; // ⚠️ Removido - implementar gráficos com recharts
// import { Bar, Line, Doughnut } from 'react-chartjs-2'; // ⚠️ Removido
import { TrendingUp, PieChart, BarChart3, Activity } from 'lucide-react';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
);

export default function DashboardGraficos() {
  const [dados, setDados] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);

      setDados({
        total: 0,
        por_tipo: {
          treinamentos: 0,
          checks: 0,
          exames: 0,
        },
        por_categoria: [],
        por_status: {
          validas: 0,
          vencendo: 0,
          vencidas: 0,
        },
        evolucao: {
          meses: [],
          valores: [],
        },
      });
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!dados) {
    return <div className="text-center text-red-600 py-8">Erro ao carregar dados</div>;
  }

  const dadosStatus = {
    labels: ['Válidas', 'Vencendo (30 dias)', 'Vencidas'],
    datasets: [
      {
        label: 'Qualificações',
        data: [dados.validas, dados.vencendo, dados.vencidas],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        borderWidth: 0,
      },
    ],
  };

  const dadosTipo = {
    labels: ['Treinamentos', 'Checks', 'Exames'],
    datasets: [
      {
        label: 'Quantidade',
        data: [dados.por_tipo.treinamentos, dados.por_tipo.checks, dados.por_tipo.exames],
        backgroundColor: ['#3b82f6', '#8b5cf6', '#ec4899'],
      },
    ],
  };

  const dadosEvolucao = {
    labels: dados.evolucao.meses,
    datasets: [
      {
        label: 'Novas Qualificações',
        data: dados.evolucao.valores,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true,
      },
    ],
  };

  const dadosCategorias = {
    labels: dados.top_categorias.map((c: any) => c.categoria),
    datasets: [
      {
        label: 'Quantidade',
        data: dados.top_categorias.map((c: any) => c.total),
        backgroundColor: '#6366f1',
      },
    ],
  };

  return (
    <div className="space-y-4">
      {/* Cards Resumo */}
      <div className="grid grid-cols-4 gap-4">
        <div className="card card-neutral p-6 rounded-lg text-center">
          <Activity className="w-8 h-8 mx-auto mb-2 text-blue-600" />
          <p className="text-2xl font-bold text-gray-800">{dados.total}</p>
          <p className="text-gray-600">Total</p>
        </div>
        <div className="card card-success p-6 rounded-lg text-center">
          <TrendingUp className="w-8 h-8 mx-auto mb-2 text-blue-600" />
          <p className="text-2xl font-bold text-gray-800">{dados.validas}</p>
          <p className="text-gray-600">Válidas</p>
        </div>
        <div className="card card-warning p-6 rounded-lg text-center">
          <PieChart className="w-8 h-8 mx-auto mb-2 text-blue-600" />
          <p className="text-2xl font-bold text-gray-800">{dados.vencendo}</p>
          <p className="text-gray-600">Vencendo</p>
        </div>
        <div className="card card-error p-6 rounded-lg text-center">
          <BarChart3 className="w-8 h-8 mx-auto mb-2 text-blue-600" />
          <p className="text-2xl font-bold text-gray-800">{dados.vencidas}</p>
          <p className="text-gray-600">Vencidas</p>
        </div>
      </div>

      {/* Linha 1: Status + Tipo */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-blue-600" />
            Distribuição por Status
          </h3>
          <Doughnut
            data={dadosStatus}
            options={{
              responsive: true,
              plugins: {
                legend: { position: 'bottom' as const },
              },
            }}
          />
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Distribuição por Tipo
          </h3>
          <Bar
            data={dadosTipo}
            options={{
              responsive: true,
              plugins: {
                legend: { display: false },
              },
              scales: {
                y: { beginAtZero: true },
              },
            }}
          />
        </div>
      </div>

      {/* Linha 2: Evolução Temporal */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Evolução (Últimos 6 Meses)
        </h3>
        <Line
          data={dadosEvolucao}
          options={{
            responsive: true,
            plugins: {
              legend: { display: true, position: 'top' as const },
            },
            scales: {
              y: { beginAtZero: true },
            },
          }}
        />
      </div>

      {/* Linha 3: Top Categorias */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Top 10 Categorias
        </h3>
        <Bar
          data={dadosCategorias}
          options={{
            responsive: true,
            indexAxis: 'y' as const,
            plugins: {
              legend: { display: false },
            },
            scales: {
              x: { beginAtZero: true },
            },
          }}
        />
      </div>
    </div>
  );
}
