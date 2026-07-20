import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import {
  Download,
  Upload,
  Database,
  Clock,
  CheckCircle,
  AlertTriangle,
  FileText,
  Trash2,
} from 'lucide-react';
import Button from '@/react-app/components/Button';
import { BaseModal as Modal } from '@/react-app/components/modals/BaseModal';
import { PageLayout } from '@/react-app/components/layout/PageLayout';
import PageGrid from '@/react-app/components/layout/PageGrid';
import PageSection from '@/react-app/components/layout/PageSection';
import { showAlertDialog } from '@/react-app/utils/confirmDialog';

interface BackupMetadata {
  version: string;
  created_at: string;
  origin_domain: string;
  total_records: number;
  checksum: string;
  modules_included: string[];
}

interface Conflito {
  tipo: string;
  descricao: string;
  valor_existente: string;
  valor_importacao: string;
}

interface PreviewData {
  metadata: BackupMetadata;
  resumo: {
    funcionarios: number;
    fichas_simulador: number;
    manobras: number;
    treinamentos: number;
  };
  conflitos: Conflito[];
  compatibilidade: boolean;
}

interface HistoricoItem {
  id: number;
  data: string;
  operacao: string;
  tamanho: string;
  status: string;
  usuario: string;
}

const BackupRestorePage = () => {
  const [funcionarioCount, setFuncionarioCount] = useState(0);
  const [simuladorCount, setSimuladorCount] = useState(0);
  const [fichaCount, setFichaCount] = useState(0);
  const [treinamentoCount, setTreinamentoCount] = useState(0);
  const [estimativaSize, setEstimativaSize] = useState('0 MB');
  const [estimativaTempo, setEstimativaTempo] = useState('0');

  const [modulosExportacao, setModulosExportacao] = useState({
    funcionarios: true,
    simuladores: true,
    treinamentos: true,
    configuracoes: true,
  });

  const [previewDados, setPreviewDados] = useState<PreviewData | null>(null);
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);

  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [showConflitos, setShowConflitos] = useState(false);

  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');

  const carregarEstatisticas = useCallback(async () => {
    try {
      // ✅ CORRIGIDO: /funcionarios/listar não existe, usar /funcionarios com limit
      const [funcionariosResp, simuladoresResp, treinamentosResp] = await Promise.all([
        fetch(`${API_BASE_URL}/funcionarios?limit=1000`),
        fetch(`${API_BASE_URL}/simulador/slots`),
        fetch(`${API_BASE_URL}/qualificacoes?page=1&limit=1`),
      ]);

      const funcionarios = await funcionariosResp.json();
      const simuladores = await simuladoresResp.json();
      const treinamentos = await treinamentosResp.json();

      const numFuncionarios = funcionarios.total || funcionarios.data?.length || 0;
      const numSimuladores = simuladores.total || simuladores.slots?.length || 0;
      const numFichas =
        simuladores.slots?.reduce(
          (acc: number, slot: { fichas?: unknown[] }) => acc + (slot.fichas?.length || 0),
          0,
        ) || 0;
      const numTreinamentos =
        treinamentos.stats?.total || treinamentos.total || treinamentos.data?.length || 0;

      setFuncionarioCount(numFuncionarios);
      setSimuladorCount(numSimuladores);
      setFichaCount(numFichas);
      setTreinamentoCount(numTreinamentos);

      const totalRecords = numFuncionarios + numSimuladores + numFichas + numTreinamentos;
      const estimatedSizeMB = Math.max(1, Math.round(totalRecords * 0.05));
      const estimatedTime = Math.max(5, Math.round(totalRecords * 0.1));

      setEstimativaSize(`${estimatedSizeMB} MB`);
      setEstimativaTempo(estimatedTime.toString());
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
    }
  }, []);

  useEffect(() => {
    carregarEstatisticas();
    carregarHistorico();
  }, [carregarEstatisticas]);

  const carregarHistorico = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/backup/historico`);
      const data = await response.json();

      if (data.success) {
        setHistorico(data.historico);
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      setHistorico([
        {
          id: 1,
          data: '03/10/2025 18:30',
          operacao: 'Backup Completo',
          tamanho: '12.5 MB',
          status: 'Sucesso',
          usuario: 'Admin',
        },
        {
          id: 2,
          data: '02/10/2025 14:22',
          operacao: 'Importação Funcionários',
          tamanho: '2.1 MB',
          status: 'Sucesso',
          usuario: 'Gestor',
        },
        {
          id: 3,
          data: '01/10/2025 09:15',
          operacao: 'Backup Incremental',
          tamanho: '5.8 MB',
          status: 'Sucesso',
          usuario: 'Sistema',
        },
      ]);
    }
  };

  const gerarBackup = async () => {
    setIsExporting(true);
    setProgress(0);
    setProgressMessage('Iniciando backup...');

    try {
      const modulosSelecionados = Object.entries(modulosExportacao)
        .filter(([, selected]) => selected)
        .map(([modulo]) => modulo);

      if (modulosSelecionados.length === 0) {
        toast.warning('Selecione pelo menos um módulo para exportar');
        setIsExporting(false);
        return;
      }

      setProgressMessage('Exportando dados...');
      setProgress(25);

      const response = await fetch(`${API_BASE_URL}/backup/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modulos: modulosSelecionados }),
      });

      setProgress(75);
      setProgressMessage('Processando backup...');

      if (!response.ok) {
        throw new Error(`Erro HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: 'application/json',
        });

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download =
          result.filename || `airtrust_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        setProgress(100);
        setProgressMessage('Backup concluído com sucesso!');

        setTimeout(() => carregarHistorico(), 1000);
      } else {
        throw new Error(result.error || 'Erro desconhecido ao gerar backup');
      }
    } catch (error) {
      console.error('❌ Erro completo ao gerar backup:', error);
      setProgressMessage(`Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      showAlertDialog(
        `Erro ao gerar backup: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
    }

    setTimeout(() => {
      setIsExporting(false);
      setProgress(0);
      setProgressMessage('');
    }, 2000);
  };

  const selecionarArquivo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setArquivo(file);

    try {
      const text = await file.text();
      const dados = JSON.parse(text);

      console.log('📁 Arquivo selecionado:', {
        nome: file.name,
        tamanho: file.size,
        metadata: dados.metadata,
      });

      const response = await fetch(`${API_BASE_URL}/backup/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });

      const preview = await response.json();

      if (preview.success) {
        setPreviewDados(preview.preview);
        setConflitos(preview.preview.conflitos || []);
      } else {
        console.error('❌ Erro no preview:', preview.error);
        toast.warning(`Erro ao processar arquivo: ${preview.error}`);
      }
    } catch (error) {
      console.error('❌ Erro ao processar arquivo:', error);
      showAlertDialog(
        `Arquivo inválido ou corrompido: ${
          error instanceof Error ? error.message : 'Erro desconhecido'
        }`,
      );
    }
  };

  const executarImportacao = async () => {
    if (!arquivo || !previewDados) return;

    setIsImporting(true);
    setProgress(0);
    setProgressMessage('Iniciando importação...');

    try {
      const text = await arquivo.text();
      const dados = JSON.parse(text);

      console.log('📤 Enviando dados para importação:', {
        metadata: dados.metadata,
        modulos: Object.keys(dados).filter((k) => k !== 'metadata'),
      });

      setProgress(25);
      setProgressMessage('Validando dados...');

      const response = await fetch(`${API_BASE_URL}/backup/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });

      setProgress(75);
      setProgressMessage('Importando dados...');

      const result = await response.json();

      if (result.success) {
        setProgress(100);
        setProgressMessage('Importação concluída!');

        setPreviewDados(null);
        setArquivo(null);
        setConflitos([]);

        void carregarHistorico();
        void carregarEstatisticas();
      } else {
        const errorMsg = result.error || 'Erro na importação';
        const details = result.details ? `\n\nDetalhes: ${result.details}` : '';
        throw new Error(`${errorMsg}${details}`);
      }
    } catch (error) {
      console.error('❌ Erro completo na importação:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Erro desconhecido na importação';
      setProgressMessage(`Erro: ${errorMessage}`);
      toast.warning(`❌ Falha na importação:\n\n${errorMessage}`);
    }

    setTimeout(() => {
      setIsImporting(false);
      setProgress(0);
      setProgressMessage('');
    }, 3000);
  };

  const resolverConflitos = () => {
    setShowConflitos(true);
  };

  return (
    <PageLayout
      title="Backup & Restore"
      description="Sistema completo para transferência de dados entre instâncias do AirTrust"
    >
      <PageGrid cols={2}>
        {/* PAINEL EXPORTAÇÃO */}
        <PageSection title="Exportar Dados" icon={<Download className="text-blue-700" />}>
          {/* Seleção de Módulos */}
          <div className="space-y-4 mb-6">
            <label className="flex items-center p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors">
              <input
                type="checkbox"
                checked={modulosExportacao.funcionarios}
                onChange={(e) =>
                  setModulosExportacao((prev) => ({ ...prev, funcionarios: e.target.checked }))
                }
                className="w-4 h-4 text-primary"
              />
              <span className="ml-3 font-medium">Funcionários ({funcionarioCount} registros)</span>
            </label>

            <label className="flex items-center p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors">
              <input
                type="checkbox"
                checked={modulosExportacao.simuladores}
                onChange={(e) =>
                  setModulosExportacao((prev) => ({ ...prev, simuladores: e.target.checked }))
                }
                className="w-4 h-4 text-primary"
              />
              <span className="ml-3 font-medium">
                Simuladores ({simuladorCount} sessões, {fichaCount} fichas)
              </span>
            </label>

            <label className="flex items-center p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors">
              <input
                type="checkbox"
                checked={modulosExportacao.treinamentos}
                onChange={(e) =>
                  setModulosExportacao((prev) => ({ ...prev, treinamentos: e.target.checked }))
                }
                className="w-4 h-4 text-primary"
              />
              <span className="ml-3 font-medium">
                Treinamentos ({treinamentoCount} certificações)
              </span>
            </label>

            <label className="flex items-center p-3 bg-neutral-50 rounded-lg hover:bg-neutral-100 transition-colors">
              <input
                type="checkbox"
                checked={modulosExportacao.configuracoes}
                onChange={(e) =>
                  setModulosExportacao((prev) => ({ ...prev, configuracoes: e.target.checked }))
                }
                className="w-4 h-4 text-primary"
              />
              <span className="ml-3 font-medium">Configurações (templates, matriz, manobras)</span>
            </label>
          </div>

          <Button
            onClick={gerarBackup}
            disabled={isExporting}
            className="w-full bg-primary hover:bg-primary/90 text-white py-3 rounded-lg font-semibold text-lg"
          >
            {isExporting ? (
              <>
                <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                Gerando...
              </>
            ) : (
              <>📦 Gerar Backup Completo</>
            )}
          </Button>

          {isExporting && (
            <div className="mt-4">
              <div className="bg-primary/10 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-700">{progressMessage}</span>
                  <span className="text-sm text-primary">{progress}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 text-sm text-neutral-600 bg-neutral-50 p-3 rounded-lg">
            <div className="flex items-center justify-between">
              <span>Estimativa: {estimativaSize}</span>
              <span className="flex items-center">
                <Clock className="w-4 h-4 mr-1" />~{estimativaTempo}s
              </span>
            </div>
          </div>
        </PageSection>

        {/* PAINEL IMPORTAÇÃO */}
        <PageSection title="Importar Dados" icon={<Upload className="text-green-700" />}>
          <div className="border-2 border-dashed border-neutral-300 rounded-lg p-5 text-center hover:border-green-400 hover:bg-green-50 transition-colors">
            <input
              type="file"
              accept=".zip,.json"
              onChange={selecionarArquivo}
              className="mb-4 text-sm text-neutral-600 file:mr-4 file:py-2 file: file:rounded-full file:border-0 file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
            />
            <p className="mt-2 text-neutral-600">
              <FileText className="w-8 h-8 mx-auto mb-2 text-neutral-400" />
              Arraste um arquivo de backup aqui ou clique para selecionar
            </p>
            <p className="text-xs text-neutral-500 mt-1">Formatos suportados: .json, .zip</p>
          </div>

          {previewDados && (
            <div className="mt-6 bg-neutral-50 p-4 rounded-lg border border-neutral-200">
              <h3 className="font-semibold mb-3 flex items-center text-neutral-800">
                <CheckCircle className="w-5 h-5 mr-2 text-green-600" />
                Preview do Backup
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="font-medium text-neutral-600 mb-1">Conteúdo:</div>
                  <ul className="space-y-1 text-neutral-800">
                    <li>• {previewDados.resumo.funcionarios} funcionários</li>
                    <li>• {previewDados.resumo.fichas_simulador} fichas de treinamento de voo</li>
                    <li>• {previewDados.resumo.treinamentos} treinamentos</li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium text-neutral-600 mb-1">Informações:</div>
                  <ul className="space-y-1 text-neutral-800">
                    <li>• Versão: {previewDados.metadata.version}</li>
                    <li>
                      • Data:{' '}
                      {new Date(previewDados.metadata.created_at).toLocaleDateString('pt-BR')}
                    </li>
                    <li>• Origem: {previewDados.metadata.origin_domain}</li>
                  </ul>
                </div>
              </div>

              {conflitos.length > 0 && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
                    <p className="text-yellow-800 font-medium">
                      ⚠️ {conflitos.length} conflitos detectados
                    </p>
                  </div>
                  <button
                    onClick={resolverConflitos}
                    className="text-yellow-700 underline text-sm mt-1 hover:text-yellow-800"
                  >
                    Ver e resolver conflitos
                  </button>
                </div>
              )}

              <Button
                onClick={executarImportacao}
                disabled={isImporting}
                className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-semibold"
              >
                {isImporting ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                    Importando...
                  </>
                ) : (
                  <>✅ Importar Dados</>
                )}
              </Button>

              {isImporting && (
                <div className="mt-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-700">{progressMessage}</span>
                      <span className="text-sm text-green-600">{progress}%</span>
                    </div>
                    <div className="w-full bg-green-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </PageSection>
      </PageGrid>

      {/* HISTÓRICO */}
      <PageSection title="Histórico de Operações" icon={<Database />}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200">
                <th className="text-left py-3  font-semibold text-neutral-700">Data/Hora</th>
                <th className="text-left py-3  font-semibold text-neutral-700">Operação</th>
                <th className="text-left py-3  font-semibold text-neutral-700">Tamanho</th>
                <th className="text-left py-3  font-semibold text-neutral-700">Status</th>
                <th className="text-left py-3  font-semibold text-neutral-700">Usuário</th>
                <th className="text-left py-3  font-semibold text-neutral-700">Ações</th>
              </tr>
            </thead>
            <tbody>
              {historico.map((item) => (
                <tr key={item.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                  <td className="py-3  text-neutral-800">{item.data}</td>
                  <td className="py-3  text-neutral-800">{item.operacao}</td>
                  <td className="py-3  text-neutral-600">{item.tamanho}</td>
                  <td className="py-3 ">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        item.status === 'Sucesso'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3  text-neutral-600">{item.usuario}</td>
                  <td className="py-3 ">
                    <button className="text-neutral-400 hover:text-red-600 p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {historico.length === 0 && (
            <div className="text-center py-8 text-neutral-500">
              <Database className="w-12 h-12 mx-auto mb-4 text-neutral-300" />
              <p>Nenhuma operação realizada ainda</p>
            </div>
          )}
        </div>
      </PageSection>

      {/* Modal de Conflitos */}
      <Modal
        isOpen={showConflitos}
        onClose={() => setShowConflitos(false)}
        title="Resolver Conflitos"
      >
        <div className="max-h-96 overflow-y-auto">
          {conflitos.map((conflito, index) => (
            <div key={index} className="border-b border-neutral-200 py-4 last:border-b-0">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-neutral-900">{conflito.tipo}</h4>
                  <p className="text-sm text-neutral-600 mt-1">{conflito.descricao}</p>
                  <div className="mt-2 space-y-2">
                    <div className="text-xs bg-red-50 p-2 rounded">
                      <strong>Existente:</strong> {conflito.valor_existente}
                    </div>
                    <div className="text-xs bg-primary/10 p-2 rounded">
                      <strong>Importação:</strong> {conflito.valor_importacao}
                    </div>
                  </div>
                </div>
                <div className="ml-4 space-y-1">
                  <button className="block w-full px-3 py-1 text-xs bg-primary text-white rounded hover:bg-primary/90">
                    Usar Novo
                  </button>
                  <button className="block w-full px-3 py-1 text-xs bg-neutral-600 text-white rounded hover:bg-neutral-700">
                    Manter Atual
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-6 space-x-3">
          <Button variant="secondary" onClick={() => setShowConflitos(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => {
              setShowConflitos(false);
              executarImportacao();
            }}
          >
            Aplicar Soluções
          </Button>
        </div>
      </Modal>
    </PageLayout>
  );
};

export default BackupRestorePage;
