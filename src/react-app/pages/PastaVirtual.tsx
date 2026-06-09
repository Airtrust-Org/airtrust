import { useState, useEffect } from 'react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  User,
  Award,
  Folder,
  RefreshCw,
  AlertTriangle,
  Clock,
  Activity,
  BarChart3,
  TrendingUp,
  Target,
  CheckCircle,
  Briefcase,
  Mail,
  Phone,
  Plane,
  Download,
} from 'lucide-react';
import Button from '@/react-app/components/Button';
import Card, { CardContent, CardHeader } from '@/react-app/components/Card';
import Badge from '@/react-app/components/Badge';
import PastaVirtualCompleta from '@/react-app/components/funcionarios/PastaVirtualCompleta';
import CadernetaHorasVoo from '@/react-app/pages/funcionarios/CadernetaHorasVoo';
import AppLayout from '@/react-app/components/AppLayout';
import { toast } from 'sonner';
import { usePastaVirtual } from '@/react-app/hooks/usePastaVirtual';

// Helper para formatar datas com segurança
const formatarData = (data: string | null | undefined): string => {
  if (!data) return 'N/A';
  try {
    const d = new Date(data);
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('pt-BR');
  } catch {
    return 'N/A';
  }
};

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
  funcao: string;
  cargo?: string;
  is_instrutor?: number;
  email: string;
  telefone?: string;
  status: string;
  aeronave?: string;
  codigo_anac?: string;
}

// Interface para Dashboard de Desempenho de Simuladores
interface DashboardDesempenho {
  funcionario: {
    id: number;
    nome: string;
    matricula: string;
    codigo_anac: string;
  };
  top5_dificuldade: Array<{
    codigo_manobra: string;
    descricao_manobra: string;
    media_nota: number;
    total_avaliacoes: number;
    pior_nota: number;
    melhor_nota: number;
  }>;
  alertas_ativos: Array<{
    id: number;
    codigo_manobra: string;
    descricao_manobra: string;
    nota_sessao1: number;
    nota_sessao2: number;
    status: string;
    created_at: string;
  }>;
  estatisticas: {
    total_fichas: number;
    total_manobras_avaliadas: number;
    media_geral: number;
    pior_nota_geral: number;
    melhor_nota_geral: number;
  } | null;
  evolucao_temporal: Array<{
    data_sessao: string;
    media_sessao: number;
    manobras_avaliadas: number;
  }>;
}

export default function PastaVirtual() {
  const { funcionarioId } = useParams<{ funcionarioId: string }>();
  const navigate = useNavigate();

  const [funcionario, setFuncionario] = useState<Funcionario | null>(null);
  const [dashboardDesempenho, setDashboardDesempenho] = useState<DashboardDesempenho | null>(null);
  const [loadingDesempenho, setLoadingDesempenho] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingSync, setLoadingSync] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<'documentos' | 'desempenho' | 'caderneta'>('documentos');

  // Hook para buscar dados reais da pasta virtual
  const { categorias: categoriasDocumentos, refetch: refetchDocumentos } = usePastaVirtual(
    funcionarioId ? parseInt(funcionarioId) : undefined,
  );

  const getAuthHeaders = (): HeadersInit => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Função para buscar dashboard de desempenho
  const fetchDashboardDesempenho = async () => {
    if (!funcionarioId) return;

    setLoadingDesempenho(true);
    try {
      const response = await fetch(`${API_BASE_URL}/simuladores/dashboard/${funcionarioId}`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setDashboardDesempenho(result.data);
        }
      }
    } catch (err) {
      console.error('Erro ao buscar dashboard de desempenho:', err);
      toast.error('Erro ao carregar dashboard de desempenho');
    } finally {
      setLoadingDesempenho(false);
    }
  };

  // Carregar dashboard quando aba desempenho for selecionada
  useEffect(() => {
    if (abaAtiva === 'desempenho' && !dashboardDesempenho && funcionarioId) {
      fetchDashboardDesempenho();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abaAtiva, funcionarioId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const funcionarioResponse = await fetch(`${API_BASE_URL}/funcionarios/${funcionarioId}`, {
        cache: 'no-cache',
        headers: getAuthHeaders(),
      });
      const funcionarioData = await funcionarioResponse.json();

      const dadosFuncionario = funcionarioData.funcionario || funcionarioData.data;

      if (!funcionarioData.success || !dadosFuncionario) {
        console.error('❌ Dados inválidos:', {
          success: funcionarioData.success,
          hasFuncionario: !!dadosFuncionario,
        });
        throw new Error(funcionarioData.error || 'Funcionário não encontrado');
      }

      setFuncionario(dadosFuncionario);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar dados';
      setError(errorMessage);
      console.error('❌ Erro ao buscar dados da pasta virtual:', err);
    } finally {
      setLoading(false);
    }
  };

  const sincronizarFuncionario = async () => {
    try {
      setLoadingSync(true);
      setError(null);
      await refetchDocumentos();
      toast.success('Documentos sincronizados com sucesso!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro na sincronização';
      setError(errorMessage);
      toast.error('Erro ao sincronizar documentos');
      console.error('❌ Erro na sincronização:', err);
    } finally {
      setLoadingSync(false);
    }
  };

  const downloadCertificadosZip = async () => {
    if (!funcionarioId) return;

    try {
      toast.loading('Preparando download...');

      const response = await fetch(
        `${API_BASE_URL}/pasta-virtual/download-certificados/${funcionarioId}`,
        {
          headers: getAuthHeaders(),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao baixar certificados');
      }

      // Baixar o arquivo ZIP
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;

      // Extrair nome do arquivo do header Content-Disposition
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `Certificados-${funcionario?.matricula}.zip`;

      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Download concluído!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao baixar certificados';
      console.error('❌ Erro no download ZIP:', err);
      toast.error(errorMessage);
    }
  };

  useEffect(() => {
    if (funcionarioId) {
      fetchData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funcionarioId]);

  if (loading) {
    return (
      <AppLayout>
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
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 mb-4 text-lg font-medium">Erro: {error}</p>
          <div className="space-x-3">
            <Button variant="secondary" onClick={fetchData}>
              Tentar Novamente
            </Button>
            <Button variant="primary" onClick={() => navigate('/funcionarios')}>
              Voltar para Funcionários
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!funcionario) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">Funcionário não encontrado</p>
          <Button variant="primary" onClick={() => navigate('/funcionarios')}>
            Voltar para Funcionários
          </Button>
        </div>
      </AppLayout>
    );
  }

  // Calcular estatísticas a partir dos dados reais
  const totalArquivos = categoriasDocumentos.reduce((acc, cat) => acc + cat.documentos.length, 0);
  const arquivosVencidos = categoriasDocumentos.reduce(
    (acc, cat) => acc + cat.documentos.filter((doc) => doc.status === 'VENCIDO').length,
    0,
  );
  const arquivosVencendo = categoriasDocumentos.reduce(
    (acc, cat) => acc + cat.documentos.filter((doc) => doc.status === 'VENCENDO').length,
    0,
  );
  const espacoTotal =
    categoriasDocumentos.reduce(
      (acc, cat) => acc + cat.documentos.reduce((sum, doc) => sum + (doc.tamanho || 0), 0),
      0,
    ) /
    (1024 * 1024); // Converter bytes para MB

  const perfilOperacional = `${String(funcionario.cargo || '').toLowerCase()} ${String(
    funcionario.funcao || '',
  ).toLowerCase()}`;
  const showCadernetaTab =
    Number(funcionario.is_instrutor || 0) === 1 ||
    /comandante|copiloto|co-piloto|piloto|instrutor/.test(perfilOperacional);

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => navigate('/funcionarios')} className="p-2">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                Pasta Virtual
              </h1>
              <p className="text-gray-600 mt-1">Sistema de Gestão Documental Integrado</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Button variant="secondary" onClick={sincronizarFuncionario} disabled={loadingSync}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingSync ? 'animate-spin' : ''}`} />
              {loadingSync ? 'Sincronizando...' : 'Sincronizar'}
            </Button>
            <Button
              variant="primary"
              onClick={downloadCertificadosZip}
              disabled={
                !categoriasDocumentos ||
                !categoriasDocumentos.some((cat) => cat.documentos && cat.documentos.length > 0)
              }
              title={
                categoriasDocumentos &&
                categoriasDocumentos.some((cat) => cat.documentos && cat.documentos.length > 0)
                  ? 'Baixar certificados em ZIP'
                  : 'Nenhum certificado disponível'
              }
            >
              <Download className="w-4 h-4 mr-2" />
              Baixar Certificados (ZIP)
            </Button>
          </div>
        </div>

        {/* Cabeçalho do Funcionário */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">{funcionario.nome}</h2>
                <Badge variant={funcionario.status === 'ATIVO' ? 'success' : 'danger'}>
                  {funcionario.status}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Coluna 1: Matrícula e CANAC */}
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 text-sm text-gray-700">
                    <User className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Matrícula:</strong> {funcionario.matricula}
                    </span>
                  </div>
                  {funcionario.codigo_anac && (
                    <div className="flex items-start gap-2 text-sm text-gray-700">
                      <Award className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>CANAC:</strong> {funcionario.codigo_anac}
                      </span>
                    </div>
                  )}
                </div>

                {/* Coluna 2: Função e Aeronave */}
                <div className="space-y-1.5">
                  <div className="flex items-start gap-2 text-sm text-gray-700">
                    <Briefcase className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Função:</strong> {funcionario.funcao}
                    </span>
                  </div>
                  {funcionario.aeronave && (
                    <div className="flex items-start gap-2 text-sm text-gray-700">
                      <Plane className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>Aeronave:</strong> {funcionario.aeronave}
                      </span>
                    </div>
                  )}
                </div>

                {/* Coluna 3: Email e Telefone */}
                <div className="space-y-1.5">
                  {funcionario.email && (
                    <div className="flex items-start gap-2 text-sm text-gray-700">
                      <Mail className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <a
                        href={`mailto:${funcionario.email}`}
                        className="text-blue-600 hover:underline break-all"
                      >
                        {funcionario.email}
                      </a>
                    </div>
                  )}
                  {funcionario.telefone && (
                    <div className="flex items-start gap-2 text-sm text-gray-700">
                      <Phone className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <a
                        href={`https://wa.me/55${funcionario.telefone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {funcionario.telefone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estatísticas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-primary/20 rounded-lg">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-600">Total de Documentos</p>
                  <p className="text-xl font-bold text-gray-900">{totalArquivos}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-600">Vencendo</p>
                  <p className="text-xl font-bold text-gray-900">{arquivosVencendo}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-600">Vencidos</p>
                  <p className="text-xl font-bold text-gray-900">{arquivosVencidos}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Activity className="w-5 h-5 text-purple-600" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-600">Espaço</p>
                  <p className="text-xl font-bold text-gray-900">{espacoTotal.toFixed(1)}MB</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Navegação de Abas */}
        <div className="bg-white rounded-lg shadow border border-gray-200">
          <nav className="flex border-b">
            <button
              onClick={() => setAbaAtiva('documentos')}
              className={`flex-1 px-6 py-4 font-medium transition flex items-center justify-center gap-2 ${
                abaAtiva === 'documentos'
                  ? 'border-primary text-blue-600 dark:text-blue-300'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Folder className="w-5 h-5" />
              <span>Documentos</span>
            </button>

            <button
              onClick={() => setAbaAtiva('desempenho')}
              className={`flex-1 px-6 py-4 font-medium transition flex items-center justify-center gap-2 ${
                abaAtiva === 'desempenho'
                  ? 'border-primary text-blue-600 dark:text-blue-300'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <BarChart3 className="w-5 h-5" />
              <span>Desempenho</span>
            </button>

            {showCadernetaTab && (
              <button
                onClick={() => setAbaAtiva('caderneta')}
                className={`flex-1 px-6 py-4 font-medium transition flex items-center justify-center gap-2 ${
                  abaAtiva === 'caderneta'
                    ? 'border-primary text-blue-600 dark:text-blue-300'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Plane className="w-5 h-5" />
                <span>Caderneta de Horas</span>
              </button>
            )}
          </nav>
        </div>

        {/* Conteúdo da Aba Documentos */}
        {abaAtiva === 'documentos' && (
          <PastaVirtualCompleta funcionarioId={parseInt(funcionarioId!)} />
        )}

        {/* Conteúdo Antigo (Comentado)
      {abaAtiva === 'documentos' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Folder className="w-5 h-5 mr-2 text-primary" />
                Documentos da Pasta Virtual
              </h3>
              <p className="text-sm text-gray-500">
                Última atualização: {new Date().toLocaleString('pt-BR')}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {totalArquivos === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-xl font-medium mb-2">Pasta Virtual Vazia</p>
                <p className="text-gray-400 mb-6">
                  Nenhum documento encontrado. Clique em "Sincronizar" para carregar documentos ou
                  "Adicionar" para inserir manualmente.
                </p>
                <div className="space-x-3">
                  <Button variant="primary" onClick={sincronizarFuncionario} disabled={loadingSync}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loadingSync ? 'animate-spin' : ''}`} />
                    Sincronizar
                  </Button>
                  <Button variant="secondary" onClick={() => setIsAddModalOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar Manual
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {arquivos.map((arquivo) => (
                  <div
                    key={arquivo.id}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors hover:shadow-md"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <File className="w-4 h-4 text-primary" />
                          <h5 className="font-medium text-gray-900 text-sm">{arquivo.nome}</h5>
                          <Badge variant={getStatusBadgeVariant(getStatusText(arquivo))} size="sm">
                            {getStatusText(arquivo)}
                          </Badge>
                          {arquivo.codigo && (
                            <Badge variant="neutral" size="sm">
                              {arquivo.codigo}
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-2">
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-2" />
                            <span>Upload: {formatarData(arquivo.dataUpload)}</span>
                          </div>
                          {arquivo.data_vencimento && (
                            <div className="flex items-center">
                              <Clock className="w-4 h-4 mr-2" />
                              <span>Vence: {formatarData(arquivo.data_vencimento)}</span>
                            </div>
                          )}
                          <div className="flex items-center">
                            <Activity className="w-4 h-4 mr-2" />
                            <span>Tipo: {arquivo.tipo}</span>
                          </div>
                          {arquivo.categoria && (
                            <div className="flex items-center">
                              <Award className="w-4 h-4 mr-2" />
                              <span>Categoria: {arquivo.categoria}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>📁 {arquivo.nome}.pdf</span>
                          <span>💾 {arquivo.tamanho}</span>
                          <span>🔗 ID: {arquivo.id}</span>
                        </div>
                      </div>

                      <div className="ml-4">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => downloadArquivo(arquivo)}
                          className="flex items-center space-x-2 hover:bg-primary/90 transition-colors"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )} */}

        {/* Conteúdo da Aba Desempenho */}
        {abaAtiva === 'desempenho' && (
          <div className="space-y-4">
            {loadingDesempenho ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
                  <p className="text-gray-600">Carregando dashboard de desempenho...</p>
                </CardContent>
              </Card>
            ) : dashboardDesempenho ? (
              <>
                {/* Estatísticas Gerais */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <Target className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-gray-600">Total de Fichas</p>
                          <p className="text-xl font-bold text-gray-900">
                            {dashboardDesempenho.estatisticas?.total_fichas || 0}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <TrendingUp className="w-5 h-5 text-green-600" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-gray-600">Média Geral</p>
                          <p className="text-xl font-bold text-gray-900">
                            {dashboardDesempenho.estatisticas?.media_geral?.toFixed(1) || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <CheckCircle className="w-5 h-5 text-purple-600" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-gray-600">Melhor Nota</p>
                          <p className="text-xl font-bold text-gray-900">
                            {dashboardDesempenho.estatisticas?.melhor_nota_geral?.toFixed(1) ||
                              'N/A'}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center">
                        <div
                          className={`p-2 rounded-lg ${
                            (dashboardDesempenho.alertas_ativos?.length || 0) > 0
                              ? 'bg-amber-100'
                              : 'bg-gray-100'
                          }`}
                        >
                          <AlertTriangle
                            className={`w-5 h-5 ${
                              (dashboardDesempenho.alertas_ativos?.length || 0) > 0
                                ? 'text-amber-600'
                                : 'text-gray-400'
                            }`}
                          />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-gray-600">Alertas Ativos</p>
                          <p className="text-xl font-bold text-gray-900">
                            {dashboardDesempenho.alertas_ativos?.length || 0}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Alertas Ativos */}
                {(dashboardDesempenho.alertas_ativos?.length || 0) > 0 && (
                  <Card className="border-amber-200 bg-amber-50/30">
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-amber-800 flex items-center">
                        <AlertTriangle className="w-5 h-5 mr-2 text-amber-600" />
                        Alertas de Reforço Ativo
                      </h3>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {dashboardDesempenho.alertas_ativos.map((alerta) => (
                          <div
                            key={alerta.id}
                            className="p-4 bg-white rounded-lg border border-amber-200 flex items-center justify-between"
                          >
                            <div>
                              <p className="font-medium text-gray-900">
                                Manobra: {alerta.codigo_manobra}
                              </p>
                              <p className="text-sm text-gray-600">
                                Notas: {alerta.nota_sessao1.toFixed(1)} e{' '}
                                {alerta.nota_sessao2.toFixed(1)}
                              </p>
                              <p className="text-xs text-gray-400">
                                Desde: {formatarData(alerta.created_at)}
                              </p>
                            </div>
                            <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium">
                              {alerta.status === 'ativo' ? 'Ativo' : alerta.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top 5 Manobras com Dificuldade */}
                {(dashboardDesempenho.top5_dificuldade?.length || 0) > 0 && (
                  <Card>
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <TrendingUp className="w-5 h-5 mr-2 text-primary" />
                        Top 5 Manobras que Precisam Atenção
                      </h3>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-3 px-4 font-medium text-gray-600">
                                Manobra
                              </th>
                              <th className="text-center py-3 px-4 font-medium text-gray-600">
                                Avaliações
                              </th>
                              <th className="text-center py-3 px-4 font-medium text-gray-600">
                                Média
                              </th>
                              <th className="text-center py-3 px-4 font-medium text-gray-600">
                                Melhor
                              </th>
                              <th className="text-center py-3 px-4 font-medium text-gray-600">
                                Pior
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardDesempenho.top5_dificuldade.map((item, idx) => (
                              <tr key={idx} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4 font-medium">{item.codigo_manobra}</td>
                                <td className="py-3 px-4 text-center">{item.total_avaliacoes}</td>
                                <td className="py-3 px-4 text-center">
                                  <span
                                    className={`px-2 py-1 rounded ${
                                      item.media_nota >= 7
                                        ? 'bg-green-100 text-green-700'
                                        : item.media_nota >= 5
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {item.media_nota.toFixed(1)}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className="text-green-600">
                                    {item.melhor_nota.toFixed(1)}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className="text-red-600">{item.pior_nota.toFixed(1)}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Evolução Temporal */}
                {(dashboardDesempenho.evolucao_temporal?.length || 0) > 0 && (
                  <Card>
                    <CardHeader>
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <BarChart3 className="w-5 h-5 mr-2 text-primary" />
                        Evolução das Notas
                      </h3>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-3 px-4 font-medium text-gray-600">
                                Data
                              </th>
                              <th className="text-center py-3 px-4 font-medium text-gray-600">
                                Média da Sessão
                              </th>
                              <th className="text-center py-3 px-4 font-medium text-gray-600">
                                Manobras Avaliadas
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {dashboardDesempenho.evolucao_temporal.slice(0, 10).map((item, idx) => (
                              <tr key={idx} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-4">{formatarData(item.data_sessao)}</td>
                                <td className="py-3 px-4 text-center">
                                  <span
                                    className={`px-2 py-1 rounded ${
                                      item.media_sessao >= 7
                                        ? 'bg-green-100 text-green-700'
                                        : item.media_sessao >= 5
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {item.media_sessao.toFixed(1)}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">{item.manobras_avaliadas}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-700 mb-2">
                    Nenhum dado de desempenho
                  </h4>
                  <p className="text-gray-500">
                    Este funcionário ainda não possui fichas de avaliação de simulador registradas.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {abaAtiva === 'caderneta' && showCadernetaTab && (
          <CadernetaHorasVoo
            funcionarioId={parseInt(funcionarioId!)}
            funcionarioNome={funcionario.nome}
            canEdit={true}
          />
        )}
      </div>
    </AppLayout>
  );
}
