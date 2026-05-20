import { useState, useEffect, useMemo } from 'react';
import { API_BASE_URL } from '@/react-app/config/api';
import {
  Search,
  Users,
  FileText,
  RefreshCw,
  Folder,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Activity,
  HardDrive,
} from 'lucide-react';
import Button from '@/react-app/components/Button';
import Card, { CardHeader, CardContent } from '@/react-app/components/Card';
import AdvancedCombobox from '@/react-app/components/shared/AdvancedCombobox';
import TreeView, { TreeNode } from '@/react-app/components/shared/TreeView';

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
  funcao: string;
  label: string;
  total_certificacoes: number;
  sincronizados: number;
  com_erro: number;
  vencidos: number;
  status_visual: 'ok' | 'atencao' | 'erro';
}

interface DashboardStats {
  total_funcionarios: number;
  com_pendencias: number;
  certificacoes_vencidas: number;
  situacoes_criticas: number;
  certificacoes_sincronizadas: number;
  tamanho_total_mb: number;
  certificacoes_disponiveis: number;
  taxa_sincronizacao: number;
}

interface FuncionarioPastaData {
  funcionario: {
    id: number;
    nome: string;
    matricula: string;
    funcao: string;
  };
  estrutura: TreeNode;
  estatisticas: {
    total_certificacoes: number;
    certificacoes_tecnicas: number;
    documentos_medicos: number;
    total_pastas: number;
    espaco_utilizado_bytes: number;
  };
  metadata: {
    total_arquivos: number;
    espaco_total_mb: number;
    ultima_sincronizacao: string;
  };
}

export default function PastaVirtualLanding() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState<Funcionario | null>(null);
  const [pastaFuncionario, setPastaFuncionario] = useState<FuncionarioPastaData | null>(null);
  const [dashboard, setDashboard] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPasta, setLoadingPasta] = useState(false);
  const [loadingSincronizacao, setLoadingSincronizacao] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carregarDadosIniciais = async () => {
    try {
      setLoading(true);
      setError(null);

      const timestamp = new Date().getTime();
      const [dashboardResult, funcionariosResult] = await Promise.all([
        fetch(`${API_BASE_URL}/pasta-virtual/dashboard?t=${timestamp}`, {
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        }).then((r) => r.json()),
        fetch(`${API_BASE_URL}/funcionarios?limit=1000&t=${timestamp}`, {
          headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        }).then((r) => r.json()),
      ]);

      if (dashboardResult.success) {
        setDashboard(dashboardResult.dashboard);
      }

      if (funcionariosResult.success) {
        setFuncionarios(funcionariosResult.funcionarios);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
      console.error('💥 Erro ao carregar dados iniciais:', err);
    } finally {
      setLoading(false);
    }
  };

  const carregarPastaFuncionario = async (funcionario: Funcionario) => {
    try {
      setLoadingPasta(true);
      setError(null);

      const result = await apiFetch(`/api/pasta-virtual/${funcionario.id}`).then((r) => r.json());

      if (result.success) {
        setPastaFuncionario(result);
        setFuncionarioSelecionado(funcionario);
      } else {
        throw new Error(result.error || 'Erro ao carregar pasta do funcionário');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pasta do funcionário');
      console.error('💥 Erro ao carregar pasta:', err);
    } finally {
      setLoadingPasta(false);
    }
  };

  const sincronizarFuncionario = async (funcionarioId: number) => {
    try {
      setLoadingSincronizacao(true);

      const result = await apiFetch(`/api/pasta-virtual/funcionario/${funcionarioId}`, {
        method: 'POST',
      }).then((r) => r.json());

      if (result.success) {
        await Promise.all([
          carregarDadosIniciais(),
          funcionarioSelecionado
            ? carregarPastaFuncionario(funcionarioSelecionado)
            : Promise.resolve(),
        ]);
      } else {
        throw new Error(result.error || 'Erro na sincronização');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na sincronização');
      console.error('💥 Erro na sincronização:', err);
    } finally {
      setLoadingSincronizacao(false);
    }
  };

  const sincronizarTudo = async () => {
    try {
      setLoadingSincronizacao(true);

      const result = await fetch(`${API_BASE_URL}/pasta-virtual/sincronizar-tudo`, {
        method: 'POST',
      }).then((r) => r.json());

      if (result.success) {
        await carregarDadosIniciais();
      } else {
        throw new Error(result.error || 'Erro na sincronização geral');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na sincronização geral');
      console.error('💥 Erro na sincronização geral:', err);
    } finally {
      setLoadingSincronizacao(false);
    }
  };

  const downloadArquivo = (node: TreeNode) => {
    if (node.metadata?.download_url) {
      const syncId = node.id.replace('cert_', '');
      const url = `/api/pasta-virtual-download-enhanced/download/${syncId}`;

      const link = document.createElement('a');
      link.href = url;
      link.download = node.name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const funcionarioOptions = useMemo(() => {
    return funcionarios.map((f) => ({
      id: f.id,
      label: f.label,
      value: f,
      metadata: {
        status_visual: f.status_visual,
        total_certificacoes: f.total_certificacoes,
        sincronizados: f.sincronizados,
      },
    }));
  }, [funcionarios]);

  const renderFuncionarioOption = (option: any) => (
    <div className="flex items-center justify-between w-full">
      <div className="flex items-center space-x-2">
        {option.metadata.status_visual === 'ok' && (
          <CheckCircle className="w-4 h-4 text-green-500" />
        )}
        {option.metadata.status_visual === 'atencao' && (
          <AlertTriangle className="w-4 h-4 text-yellow-500" />
        )}
        {option.metadata.status_visual === 'erro' && <XCircle className="w-4 h-4 text-red-500" />}
        <div>
          <div className="font-medium text-gray-900">{option.value.nome}</div>
          <div className="text-sm text-gray-600">
            {option.value.matricula} • {option.value.funcao}
          </div>
        </div>
      </div>
      <div className="text-xs text-gray-500">
        {option.metadata.sincronizados}/{option.metadata.total_certificacoes}
      </div>
    </div>
  );

  useEffect(() => {
    carregarDadosIniciais();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4 w-64"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Pasta Virtual Corporativa 2.0
          </h1>
          <p className="text-gray-600 mt-1">
            Sistema Avançado de Gestão Documental com Busca Inteligente e Visualização em Árvore
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="secondary" onClick={carregarDadosIniciais} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="primary" onClick={sincronizarTudo} disabled={loadingSincronizacao}>
            <Activity className={`w-4 h-4 mr-2 ${loadingSincronizacao ? 'animate-pulse' : ''}`} />
            Sincronizar Tudo
          </Button>
        </div>
      </div>

      {/* Dashboard de Métricas */}
      {dashboard && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Total Funcionários</p>
                  <p className="text-2xl font-bold text-gray-900">{dashboard.total_funcionarios}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Sincronizados</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboard.certificacoes_sincronizadas}
                  </p>
                  <p className="text-xs text-gray-500">{dashboard.taxa_sincronizacao}% completo</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <AlertTriangle className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Situações Críticas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboard.certificacoes_vencidas + dashboard.situacoes_criticas}
                  </p>
                  <p className="text-xs text-gray-500">
                    {dashboard.certificacoes_vencidas} vencidas
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <HardDrive className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Espaço Utilizado</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboard.tamanho_total_mb} MB
                  </p>
                  <p className="text-xs text-gray-500">
                    {dashboard.certificacoes_disponiveis} arquivos
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Erro */}
      {error && (
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center text-red-600">
              <XCircle className="w-5 h-5 mr-2" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {/* Seleção de Funcionário com Combobox Avançado */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <Search className="w-5 h-5 mr-2 text-primary" />
              Buscar e Selecionar Funcionário
            </h3>
          </CardHeader>
          <CardContent className="space-y-4">
            <AdvancedCombobox
              options={funcionarioOptions}
              value={
                funcionarioSelecionado
                  ? {
                      id: funcionarioSelecionado.id,
                      label: funcionarioSelecionado.label,
                      value: funcionarioSelecionado,
                    }
                  : null
              }
              onChange={(option) => {
                if (option?.value) {
                  carregarPastaFuncionario(option.value);
                } else {
                  setFuncionarioSelecionado(null);
                  setPastaFuncionario(null);
                }
              }}
              placeholder="Digite o nome, matrícula ou função do funcionário..."
              searchPlaceholder="Buscar funcionário..."
              emptyMessage="Nenhum funcionário encontrado"
              loading={loading}
              renderOption={renderFuncionarioOption}
              className="w-full"
            />

            {funcionarioSelecionado && (
              <div className="flex items-center justify-between p-3 bg-primary/10 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-primary/20 rounded-lg">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-blue-900">{funcionarioSelecionado.nome}</p>
                    <p className="text-sm text-blue-700">
                      {funcionarioSelecionado.matricula} • {funcionarioSelecionado.funcao}
                    </p>
                    <p className="text-xs text-primary">
                      {funcionarioSelecionado.sincronizados}/
                      {funcionarioSelecionado.total_certificacoes} certificações sincronizadas
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => sincronizarFuncionario(funcionarioSelecionado.id)}
                  disabled={loadingSincronizacao}
                >
                  <RefreshCw
                    className={`w-3 h-3 mr-1 ${loadingSincronizacao ? 'animate-spin' : ''}`}
                  />
                  Sincronizar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Visualização em Árvore da Pasta Virtual */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Folder className="w-5 h-5 mr-2 text-primary" />
                {funcionarioSelecionado
                  ? `Pasta Virtual: ${funcionarioSelecionado.nome}`
                  : 'Estrutura da Pasta Virtual'}
              </h3>
            </div>
          </CardHeader>
          <CardContent>
            {loadingPasta ? (
              <div className="space-y-4">
                <div className="animate-pulse">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 bg-gray-200 rounded mb-2"></div>
                  ))}
                </div>
              </div>
            ) : !funcionarioSelecionado ? (
              <div className="text-center py-12">
                <Folder className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Selecione um Funcionário</h3>
                <p className="text-gray-600">
                  Use o campo de busca acima para localizar e acessar a pasta virtual de um
                  funcionário
                </p>
              </div>
            ) : !pastaFuncionario ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Pasta Vazia</h3>
                <p className="text-gray-600">
                  Este funcionário ainda não possui documentos sincronizados
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Estatísticas da Pasta */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Total Certificações</p>
                    <p className="text-xl font-bold text-primary">
                      {pastaFuncionario.estatisticas.total_certificacoes}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Técnicas</p>
                    <p className="text-xl font-bold text-green-600">
                      {pastaFuncionario.estatisticas.certificacoes_tecnicas}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Médicas</p>
                    <p className="text-xl font-bold text-orange-600">
                      {pastaFuncionario.estatisticas.documentos_medicos}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Espaço</p>
                    <p className="text-xl font-bold text-purple-600">
                      {pastaFuncionario.metadata.espaco_total_mb} MB
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Última Sync</p>
                    <p className="text-sm font-medium text-gray-800">
                      {new Date(pastaFuncionario.metadata.ultima_sincronizacao).toLocaleDateString(
                        'pt-BR',
                      )}
                    </p>
                  </div>
                </div>

                {/* Árvore de Documentos */}
                <div className="border rounded-lg p-4 bg-white">
                  <TreeView
                    data={pastaFuncionario.estrutura.children || []}
                    onDownload={downloadArquivo}
                    onFileClick={(node) => {}}
                    expandAll={true}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
