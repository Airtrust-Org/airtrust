import { useState, useEffect } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import { Award, CheckCircle, Clock, XCircle, BarChart3, Upload } from 'lucide-react';
import {
  fetchAPI,
  diasRestantes,
  formatarData,
  QualificacoesResponse,
} from '@/react-app/utils/qualificacoesUtils';
import { Card, CardContent, Button, EmptyState, Badge } from '@/react-app/components/UI';
import DashboardGraficos from './DashboardGraficos';
import ImportarQualificacoes from './ImportarQualificacoes';
import FuncionarioLink from '@/react-app/components/funcionarios/FuncionarioLink';

interface Stats {
  total: number;
  validas: number;
  vencendo: number;
  vencidas: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    validas: 0,
    vencendo: 0,
    vencidas: 0,
  });
  const [qualificacoes, setQualificacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mostrarGraficos, setMostrarGraficos] = useState(false);
  const [mostrarImportacao, setMostrarImportacao] = useState(false);
  const [exames, setExames] = useState<any[]>([]);
  const [checks, setChecks] = useState<any[]>([]);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);
      setErro(null);

      const API_URL = API_BASE_URL.replace('/api', '');
      const [qualsData, examesRes, checksRes] = await Promise.all([
        fetchAPI<QualificacoesResponse>('/api/qualificacoes'),
        fetch(`${API_URL}/api/exames`),
        fetch(`${API_URL}/api/checks`),
      ]);

      const quals = qualsData.qualificacoes || [];
      setQualificacoes(quals);
      calcularStats(quals);

      const examesData = await examesRes.json();
      if (examesData.success) {
        setExames(examesData.data || []);
      }

      const checksData = await checksRes.json();
      if (checksData.success) {
        setChecks(checksData.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      setErro('Erro ao carregar dados. Verifique se o servidor está rodando.');
    } finally {
      setLoading(false);
    }
  };

  const calcularStats = (quals: any[]) => {
    setStats({
      total: quals.length,
      validas: quals.filter((q) => diasRestantes(q.data_vencimento) > 30).length,
      vencendo: quals.filter((q) => {
        const dias = diasRestantes(q.data_vencimento);
        return dias >= 0 && dias <= 30;
      }).length,
      vencidas: quals.filter((q) => diasRestantes(q.data_vencimento) < 0).length,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-red-900 mb-2">Erro ao Carregar Dados</h3>
        <p className="text-red-700 mb-4">{erro}</p>
        <button
          onClick={carregarDados}
          className=" py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setMostrarImportacao(!mostrarImportacao)}>
          <Upload className="w-4 h-4 mr-2" />
          {mostrarImportacao ? 'Ocultar Importação' : 'Importar Qualificações'}
        </Button>
        <Button onClick={() => setMostrarGraficos(!mostrarGraficos)}>
          <BarChart3 className="w-4 h-4 mr-2" />
          {mostrarGraficos ? 'Ocultar Gráficos' : 'Mostrar Gráficos Avançados'}
        </Button>
      </div>

      {/* Importação de Excel */}
      {mostrarImportacao && (
        <div className="mb-6">
          <ImportarQualificacoes onImportSuccess={carregarDados} />
        </div>
      )}

      {/* Gráficos Avançados */}
      {mostrarGraficos && (
        <div className="space-y-4">
          <DashboardGraficos exames={exames} checks={checks} />
        </div>
      )}

      {/* CARDS DE ESTATÍSTICAS - DESIGN SYSTEM */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total</p>
                <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
                <p className="text-xs text-slate-500 mt-1">Qualificações</p>
              </div>
              <Award className="w-8 h-8 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Válidas</p>
                <p className="text-2xl font-bold text-green-600">{stats.validas}</p>
                <p className="text-xs text-slate-500 mt-1">Compliance OK</p>
              </div>
              <CheckCircle className="w-8 h-8 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Vencendo</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.vencendo}</p>
                <p className="text-xs text-slate-500 mt-1">≤ 30 dias</p>
              </div>
              <Clock className="w-8 h-8 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Vencidas</p>
                <p className="text-2xl font-bold text-red-600">{stats.vencidas}</p>
                <p className="text-xs text-slate-500 mt-1">Não conforme</p>
              </div>
              <XCircle className="w-8 h-8 text-blue-500 opacity-20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* QUALIFICAÇÕES RECENTES - DESIGN SYSTEM */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-base font-bold mb-3 text-slate-900">Qualificações Recentes</h3>
          {qualificacoes.length === 0 ? (
            <EmptyState
              icon={<Award className="w-12 h-12" />}
              title="Nenhuma qualificação cadastrada"
              description="Importe ou cadastre qualificações para começar"
            />
          ) : (
            <div className="space-y-3">
              {qualificacoes.slice(0, 5).map((qual) => {
                const dias = diasRestantes(qual.data_vencimento);
                const badgeVariant = dias < 0 ? 'danger' : dias <= 30 ? 'warning' : 'success';
                const badgeText =
                  dias < 0
                    ? `Vencida há ${Math.abs(dias)} dias`
                    : dias <= 30
                      ? `Vence em ${dias} dias`
                      : 'Válida';

                return (
                  <Card
                    key={qual.id}
                    className="bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">
                            <FuncionarioLink
                              nome={qual.funcionario_nome || 'Sem nome'}
                              className="hover:text-primary hover:underline"
                            />
                          </p>
                          <p className="text-sm text-slate-600">{qual.categoria}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-600 mb-1">
                            Validade: {formatarData(qual.data_vencimento)}
                          </p>
                          <Badge variant={badgeVariant}>{badgeText}</Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
