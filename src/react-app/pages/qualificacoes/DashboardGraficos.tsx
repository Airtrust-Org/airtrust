import { useState, useEffect } from 'react';
import { TrendingUp, PieChart as PieChartIcon, BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

export default function DashboardGraficos({ exames, checks }: { exames?: any; checks?: any }) {
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
        por_tipo: { treinamentos: 10, checks: 20, exames: 30 },
        por_categoria: [{ nome: 'Cat 1', total: 15 }],
        por_status: { validas: 50, vencendo: 10, vencidas: 5 },
        evolucao: [{ mes: 'Jan', total: 100 }],
      });
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !dados) return <div className="p-4 text-center">Carregando gráficos...</div>;

  const dataPie = [
    { name: 'Válidas', value: dados.por_status.validas },
    { name: 'Vencendo', value: dados.por_status.vencendo },
    { name: 'Vencidas', value: dados.por_status.vencidas },
  ];
  const COLORS = ['#10b981', '#f59e0b', '#ef4444'];

  const dataBar = [
    { name: 'Treinamentos', value: dados.por_tipo.treinamentos },
    { name: 'Checks', value: dados.por_tipo.checks },
    { name: 'Exames', value: dados.por_tipo.exames },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-lg shadow h-80 flex flex-col">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-blue-600" />
            Distribuição por Status
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={dataPie} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {dataPie.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow h-80 flex flex-col">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Distribuição por Tipo
          </h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataBar}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow h-80 flex flex-col">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Evolução (Últimos 6 Meses)
        </h3>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados.evolucao}>
              <XAxis dataKey="mes" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="total" stroke="#3b82f6" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
