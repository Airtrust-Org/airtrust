import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { showAlertDialog } from '@/react-app/utils/confirmDialog';
import { parseSpreadsheetFile } from '@/react-app/utils/parseSpreadsheetFile';
import { exportToExcel } from '@/react-app/utils/lazyXLSX';
// 🚀 LAZY LOADING: ExcelJS carregado apenas quando necessário
import { Upload, Download, FileSpreadsheet, CheckCircle, XCircle, Clock } from 'lucide-react';

import type { SpreadsheetRow } from '@/react-app/utils/parseSpreadsheetFile';

interface ResultadoImportacaoSucesso {
  sucesso: true;
  total: number;
  importados: number;
  erros: number;
  detalhes: string;
}

interface ResultadoImportacaoErro {
  sucesso: false;
  erro: string;
  detalhes: string;
}

type ResultadoImportacaoPadrao = ResultadoImportacaoSucesso | ResultadoImportacaoErro;

interface HistoricoImportacao {
  arquivo_nome?: string;
  nome?: string;
  created_at?: string;
  data?: string;
  total_registros?: number;
  total?: number;
  importados?: number;
  erros?: number;
  status?: string;
  sucesso?: boolean;
}

interface ImportacaoPadraoProps {
  titulo: string;
  descricao: string;
  apiEndpoint: string;
  historicoEndpoint?: string;
  templateUrl?: string;
  colunasObrigatorias: string[];
  colunasOpcionais?: string[];
  exemploColunas?: Record<string, string>;
  onImportSuccess?: () => void;
}

export default function ImportacaoPadrao({
  titulo,
  descricao,
  apiEndpoint,
  historicoEndpoint,
  templateUrl,
  colunasObrigatorias,
  colunasOpcionais = [],
  exemploColunas = {},
  onImportSuccess,
}: ImportacaoPadraoProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportacaoPadrao | null>(null);
  const [preview, setPreview] = useState<SpreadsheetRow[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [historico, setHistorico] = useState<HistoricoImportacao[]>([]);

  const carregarHistorico = useCallback(async () => {
    if (!historicoEndpoint) return;

    try {
      const API_URL = 'https://airtrust.airtrust.workers.dev';
      const response = await fetch(`${API_URL}${historicoEndpoint}?limit=10`);
      const data = await response.json();
      if (data.success || data.sucesso) {
        setHistorico(data.importacoes || data.historico || data.data || []);
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  }, [historicoEndpoint]);

  useEffect(() => {
    if (historicoEndpoint) {
      void carregarHistorico();
    }
  }, [carregarHistorico, historicoEndpoint]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setResultado(null);

      try {
        const { rows: jsonData } = await parseSpreadsheetFile(selectedFile);

        const previewData = jsonData.slice(0, 5).map((row) => {
          const newRow = { ...row };
          Object.keys(newRow).forEach((key) => {
            const value = newRow[key];
            if (
              typeof value === 'number' &&
              (key.toLowerCase().includes('data') || key.toLowerCase().includes('validade'))
            ) {
              const date = new Date((value - 25569) * 86400 * 1000);
              const day = String(date.getUTCDate()).padStart(2, '0');
              const month = String(date.getUTCMonth() + 1).padStart(2, '0');
              const year = date.getUTCFullYear();
              newRow[key] = `${day}/${month}/${year}`;
            }
          });
          return newRow;
        });

        setPreview(previewData);
        setShowPreview(true);
      } catch (error) {
        console.error('Erro ao gerar preview:', error);
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      toast.warning('Selecione um arquivo');
      return;
    }

    setLoading(true);

    try {
      const { rows: jsonData } = await parseSpreadsheetFile(file);

      if (jsonData.length > 0) {
        const primeiraLinha = jsonData[0];
        const colunasPresentes = Object.keys(primeiraLinha).map((k) => k.trim().toLowerCase());
        const colunasObrigatoriasLower = colunasObrigatorias.map((c) => c.toLowerCase());
        const colunasFaltando = colunasObrigatoriasLower.filter(
          (col) => !colunasPresentes.includes(col),
        );

        if (colunasFaltando.length > 0) {
          showAlertDialog(
            `❌ Colunas obrigatórias faltando: ${colunasFaltando.join(
              ', ',
            )}\n\n⚠️ Baixe o template correto e use-o como base.`,
          );
          setLoading(false);
          return;
        }
      }

      const todasColunas = [...colunasObrigatorias, ...(colunasOpcionais || [])].map((c) =>
        c.toLowerCase(),
      );

      const processedData = jsonData.map((row) => {
        const newRow: SpreadsheetRow = {};
        Object.keys(row).forEach((key) => {
          const cleanKey = key.trim().toLowerCase();
          if (todasColunas.includes(cleanKey)) {
            let value = row[key];
            if (
              typeof value === 'number' &&
              (cleanKey.includes('data') || cleanKey.includes('validade'))
            ) {
              const date = new Date((value - 25569) * 86400 * 1000);
              const day = String(date.getUTCDate()).padStart(2, '0');
              const month = String(date.getUTCMonth() + 1).padStart(2, '0');
              const year = date.getUTCFullYear();
              value = `${day}/${month}/${year}`;
            }
            newRow[cleanKey] = value;
          }
        });
        return newRow;
      });

      const API_URL = 'https://airtrust.airtrust.workers.dev';
      const response = await fetch(`${API_URL}${apiEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dados: processedData }),
      });

      const data = await response.json();

      if (data.success || data.sucesso) {
        setResultado({
          sucesso: true,
          total: data.total || data.importados || processedData.length,
          importados: data.importados || data.total || processedData.length,
          erros: data.erros || 0,
          detalhes: data.detalhes || data.mensagem || 'Importação concluída com sucesso!',
        });

        if (onImportSuccess) {
          onImportSuccess();
        }

        if (historicoEndpoint) {
          carregarHistorico();
        }
      } else {
        setResultado({
          sucesso: false,
          erro: data.erro || data.error || 'Erro desconhecido',
          detalhes: data.detalhes || data.mensagem || '',
        });
      }
    } catch (error) {
      console.error('[IMPORT] Erro:', error);
      setResultado({
        sucesso: false,
        erro: error instanceof Error ? error.message : 'Erro ao processar importação',
        detalhes: 'Verifique o console para mais detalhes',
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    if (templateUrl) {
      window.open(templateUrl, '_blank');
      return;
    }

    const templateData = [exemploColunas];
    await exportToExcel(templateData, `template_${titulo.toLowerCase().replace(/\s+/g, '_')}`, 'Template');
  };

  return (
    <div className="max-w-[1280px] mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{titulo}</h1>
        <p className="text-gray-600">{descricao}</p>
      </div>

      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Importar Arquivo</h2>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            Baixar Template
          </button>
        </div>

        {/* File Input */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center hover:border-blue-400 transition-colors">
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer">
            <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-700 mb-2">
              {file ? file.name : 'Clique para selecionar ou arraste o arquivo Excel'}
            </p>
            <p className="text-sm text-gray-500">Apenas arquivos Excel: .xlsx</p>
          </label>
        </div>

        {/* Colunas Obrigatórias */}
        <div className="mt-6 p-4 bg-primary/10 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-2">Colunas Obrigatórias:</h3>
          <div className="flex flex-wrap gap-2">
            {colunasObrigatorias.map((col) => (
              <span
                key={col}
                className="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm font-medium"
              >
                {col}
              </span>
            ))}
          </div>
        </div>

        {colunasOpcionais.length > 0 && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-700 mb-2">Colunas Opcionais:</h3>
            <div className="flex flex-wrap gap-2">
              {colunasOpcionais.map((col) => (
                <span
                  key={col}
                  className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm"
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Preview */}
        {showPreview && preview.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-900 mb-3">Preview (primeiras 5 linhas):</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {Object.keys(preview[0]).map((key) => (
                      <th
                        key={key}
                        className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {preview.map((row, idx) => (
                    <tr key={idx}>
                      {Object.values(row).map((value, i) => (
                        <td key={i} className="px-4 py-2 whitespace-nowrap text-gray-700">
                          {String(value)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Button */}
        <button
          onClick={handleImport}
          disabled={!file || loading}
          className="mt-6 w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              Processando...
            </>
          ) : (
            <>
              <Upload className="w-5 h-5" />
              Importar Dados
            </>
          )}
        </button>
      </div>

      {/* Resultado */}
      {resultado && (
        <div
          className={`rounded-lg shadow-sm border p-6 mb-6 ${
            resultado.sucesso ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex items-start gap-3">
            {resultado.sucesso ? (
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
            ) : (
              <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-1" />
            )}
            <div className="flex-1">
              <h3
                className={`font-semibold mb-2 ${
                  resultado.sucesso ? 'text-green-900' : 'text-red-900'
                }`}
              >
                {resultado.sucesso ? 'Importação Concluída!' : 'Erro na Importação'}
              </h3>

              {resultado.sucesso ? (
                <div className="space-y-2">
                  <p className="text-green-800">
                    <strong>Total processado:</strong> {resultado.total || resultado.importados}
                  </p>
                  {resultado.importados && (
                    <p className="text-green-800">
                      <strong>Importados com sucesso:</strong> {resultado.importados}
                    </p>
                  )}
                  {resultado.erros > 0 && (
                    <p className="text-orange-600">
                      <strong>Erros:</strong> {resultado.erros}
                    </p>
                  )}
                  {resultado.detalhes && (
                    <p className="text-green-700 text-sm mt-2">{resultado.detalhes}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-red-800 font-medium">{resultado.erro}</p>
                  {resultado.detalhes && (
                    <p className="text-red-700 text-sm">{resultado.detalhes}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Histórico */}
      {historicoEndpoint && historico.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Histórico de Importações
          </h2>
          <div className="space-y-3">
            {historico.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {item.arquivo_nome || item.nome || 'Importação'}
                  </p>
                  <p className="text-sm text-gray-600">
                    {new Date(item.created_at || item.data || 0).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-gray-900">
                    {item.total_registros || item.total || item.importados || 0} registros
                  </p>
                  {(item.erros ?? 0) > 0 && (
                    <p className="text-sm text-orange-600">{item.erros} erros</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
