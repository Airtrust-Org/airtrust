import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
import {
  X,
  Upload,
  Download,
  CheckCircle,
  AlertTriangle,
  XCircle,
  FileText,
  Clock,
  AlertCircle,
} from 'lucide-react';
import Papa from 'papaparse';
import Button from '@/react-app/components/Button';
import { BaseModal as Modal } from '@/react-app/components/modals/BaseModal';

interface ImportError {
  linha: number;
  erro: string;
  dados?: any;
}

interface ImportResult {
  success: boolean;
  linhas_processadas: number;
  importadas_com_sucesso?: number;
  funcionarios_criados?: number;
  treinamentos_criados?: number;
  erros: number;
  detalhes_erros: ImportError[];
  duracao_ms?: number;
  resumo?: string;
  error?: string;
  novas_entidades?: {
    funcionarios?: string[];
    treinamentos?: string[];
  };
  observacao?: string;
}

interface PreviewData {
  headers: string[];
  rows: string[][];
}

interface ImportarCertificacoesProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EXPECTED_FORMAT = {
  headers: [
    'funcionario_matricula',
    'treinamento_codigo',
    'data_conclusao',
    'data_vencimento',
    'instrutor',
    'nota',
    'observacoes',
  ],
  example: `funcionario_matricula,treinamento_codigo,data_conclusao,data_vencimento,instrutor,nota,observacoes
00300,CMA-001,20/08/2025,19/09/2026,Dr. João Silva,8.5,Certificação médica aprovada
00301,ICAO-001,17/09/2025,16/09/2026,Maria Santos,9.0,Proficiência linguística excelente
00302,SGS-001,15/08/2025,14/02/2026,Pedro Costa,7.5,Treinamento de segurança concluído`,
  requiredFields: ['funcionario_matricula', 'treinamento_codigo', 'data_conclusao'],
  dateFormat: 'DD/MM/AAAA',
};

export default function ImportarCertificacoes({
  isOpen,
  onClose,
  onSuccess,
}: ImportarCertificacoesProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'processing' | 'result'>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [csvText, setCsvText] = useState('');
  const [inputMode, setInputMode] = useState<'file' | 'text'>('file');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetModal = useCallback(() => {
    setStep('upload');
    setSelectedFile(null);
    setPreviewData(null);
    setValidationErrors([]);
    setResult(null);
    setIsDragOver(false);
    setCsvText('');
    setInputMode('file');
  }, []);

  const handleClose = useCallback(() => {
    resetModal();
    onClose();
  }, [resetModal, onClose]);

  const validateHeaders = useCallback((headers: string[]): string[] => {
    const errors: string[] = [];
    const normalizedHeaders = headers.map((h) => h.trim().toLowerCase());

    for (const required of EXPECTED_FORMAT.requiredFields) {
      const requiredLower = required.toLowerCase();
      const found = normalizedHeaders.some((header) => {
        return (
          header === requiredLower ||
          (header.includes('funcionario') && requiredLower.includes('funcionario')) ||
          (header.includes('matricula') && requiredLower.includes('matricula')) ||
          (header.includes('treinamento') && requiredLower.includes('treinamento')) ||
          (header.includes('data') && requiredLower.includes('data'))
        );
      });

      if (!found) {
        errors.push(`Campo obrigatório '${required}' não encontrado`);
      }
    }

    return errors;
  }, []);

  const parseCSVFile = useCallback(
    (file: File) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        preview: 5, // APENAS PARA PREVIEW
        transformHeader: (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_'),
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows = results.data.map((row: any) => headers.map((header) => row[header] || ''));

          setPreviewData({ headers, rows });

          const headerErrors = validateHeaders(headers);
          setValidationErrors(headerErrors);

          setStep('preview');
        },
        error: (error) => {
          console.error('Erro ao fazer parse do CSV:', error);
          setValidationErrors(['Erro ao processar arquivo CSV: ' + error.message]);
          setStep('preview');
        },
      });
    },
    [validateHeaders],
  );

  const parseCSVText = useCallback(
    (csvContent: string) => {
      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        preview: 5, // APENAS PARA PREVIEW
        transformHeader: (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_'),
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows = results.data.map((row: any) => headers.map((header) => row[header] || ''));

          setPreviewData({ headers, rows });

          const headerErrors = validateHeaders(headers);
          setValidationErrors(headerErrors);

          setStep('preview');
        },
        error: (error: any) => {
          console.error('Erro ao fazer parse do CSV:', error);
          setValidationErrors(['Erro ao processar texto CSV: ' + error.message]);
          setStep('preview');
        },
      });
    },
    [validateHeaders],
  );

  const handleFileSelect = useCallback(
    (file: File) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.warning('Arquivo muito grande. Máximo 10MB permitido.');
        return;
      }

      if (!file.name.toLowerCase().endsWith('.csv')) {
        toast.warning('Por favor, selecione um arquivo CSV.');
        return;
      }

      setSelectedFile(file);
      parseCSVFile(file);
    },
    [parseCSVFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect],
  );

  const processImport = useCallback(async () => {
    console.log('🔥 [IMPORT] processImport chamada!', {
      previewData: !!previewData,
      validationErrors: validationErrors.length,
      step: step,
      selectedFile: !!selectedFile,
      csvText: csvText.length,
    });

    if (validationErrors.length > 0) {
      console.error('❌ [IMPORT] Erros de validação:', validationErrors);
      toast.warning('Erro: Corrija os erros de validação antes de importar.');
      return;
    }

    setStep('processing');

    try {
      let fullDataFormatted: any[] = [];

      if (selectedFile) {
        await new Promise<void>((resolve, reject) => {
          Papa.parse(selectedFile, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_'),
            complete: (results) => {
              const headers = results.meta.fields || [];
              fullDataFormatted = results.data.map((row: any) => {
                const obj: Record<string, string> = {};
                headers.forEach((header) => {
                  obj[header] = row[header] || '';
                });
                return obj;
              });
              resolve();
            },
            error: (error: any) => {
              console.error('❌ [IMPORT] Erro ao processar arquivo completo:', error);
              reject(error);
            },
          });
        });
      } else if (csvText.trim()) {
        await new Promise<void>((resolve, reject) => {
          Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_'),
            complete: (results) => {
              const headers = results.meta.fields || [];
              fullDataFormatted = results.data.map((row: any) => {
                const obj: Record<string, string> = {};
                headers.forEach((header) => {
                  obj[header] = row[header] || '';
                });
                return obj;
              });
              resolve();
            },
            error: (error: any) => {
              console.error('❌ [IMPORT] Erro ao processar texto completo:', error);
              reject(error);
            },
          });
        });
      } else {
        throw new Error('Nenhum arquivo ou texto CSV fornecido para importação');
      }

      if (fullDataFormatted.length === 0) {
        throw new Error('Nenhum dado válido encontrado no arquivo/texto CSV');
      }

      const response = await fetch(`${API_BASE_URL}/qualificacoes/importar-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dados: fullDataFormatted, origem: 'importar-certificacoes-csv' }),
      });

      const responseText = await response.text();

      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ [IMPORT CERT] JSON Parse Error:', parseError);
        throw new Error(`Resposta inválida do servidor: ${responseText.substring(0, 100)}...`);
      }

      setResult(responseData);
      setStep('result');

      if (
        responseData.success &&
        (responseData.importadas_com_sucesso > 0 || responseData.resultados?.sucesso > 0)
      ) {
        setTimeout(() => {
          onSuccess();
        }, 3000);
      }
    } catch (error) {
      console.error('❌ [IMPORT CERT] Erro na importação:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setResult({
        success: false,
        error: `Erro de comunicação: ${errorMessage}`,
        linhas_processadas: 0,
        erros: 1,
        detalhes_erros: [{ linha: 0, erro: errorMessage, dados: null }],
        resumo: `Falha na comunicação: ${errorMessage}`,
      });
      setStep('result');
    }
  }, [previewData, validationErrors, step, selectedFile, csvText, onSuccess]);

  const renderUploadStep = () => (
    <div className="space-y-6 w-full">
      {/* Modo de Input */}
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setInputMode('file')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            inputMode === 'file'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📁 Upload de Arquivo
        </button>
        <button
          onClick={() => setInputMode('text')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            inputMode === 'text'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📄 Colar CSV
        </button>
      </div>

      {inputMode === 'file' ? (
        /* Drag & Drop Area */
        <div
          className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors ${
            isDragOver ? 'border-primary bg-primary/10' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-lg font-medium text-gray-700 mb-2">
            Arraste e solte seu arquivo CSV aqui
          </p>
          <p className="text-sm text-gray-500 mb-4">ou clique para selecionar um arquivo</p>
          <Button variant="primary" onClick={() => fileInputRef.current?.click()} className="mb-4">
            Selecionar Arquivo CSV
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <p className="text-xs text-gray-400">Máximo 10MB • Formato CSV apenas</p>
        </div>
      ) : (
        /* Área de Texto */
        <div className="space-y-4 w-full">
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cole seu conteúdo CSV aqui:
            </label>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`Exemplo (Formato de Data: DD/MM/AAAA):\n${EXPECTED_FORMAT.headers.join(
                ',',
              )}\n${EXPECTED_FORMAT.example.split('\n').slice(1, 3).join('\n')}`}
              className="w-full h-40 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent font-mono text-sm resize-none"
            />
          </div>
          <Button
            variant="primary"
            onClick={() => parseCSVText(csvText)}
            disabled={!csvText.trim()}
            className="w-full"
          >
            Processar CSV
          </Button>
        </div>
      )}

      {/* Template Download */}
      <div className="bg-primary/10 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-blue-900">Precisa de um template?</h4>
            <p className="text-sm text-blue-700">
              Baixe nosso modelo totalmente editável (sem proteção)
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                window.open('/api/templates-airtrust-brazilian-dates/certificacoes/csv', '_blank')
              }
            >
              <Download className="w-4 h-4 mr-2" />
              CSV (DD/MM/AAAA)
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                window.open('/api/templates-airtrust-brazilian-dates/certificacoes/xlsx', '_blank')
              }
            >
              <Download className="w-4 h-4 mr-2" />
              Excel (DD/MM/AAAA)
            </Button>
          </div>
        </div>
        <p className="text-xs text-primary mt-2">
          ✅ Templates totalmente editáveis - sem senha, sem proteção, sem restrições
        </p>
      </div>

      {/* Formato Esperado */}
      <div className="bg-gray-50 rounded-lg p-4 w-full">
        <h4 className="font-medium text-gray-900 mb-3">📋 Formato CSV Esperado</h4>

        <div className="bg-white rounded-lg border overflow-hidden w-full">
          {/* Header */}
          <div className="bg-primary/10 px-4 py-2 border-b">
            <p className="text-sm font-medium text-blue-900">
              Campos obrigatórios:{' '}
              <span className="text-primary">{EXPECTED_FORMAT.requiredFields.join(', ')}</span>
            </p>
          </div>

          {/* Formato Completo Estilizado */}
          <div className="p-4 w-full">
            <p className="font-medium text-gray-800 mb-3">Formato CSV esperado:</p>
            <pre className="bg-gray-100 p-3 rounded-md overflow-x-auto text-sm border w-full">
              <code className="text-gray-700 font-mono whitespace-pre block">
                {EXPECTED_FORMAT.example}
              </code>
            </pre>

            {/* Descrição dos Campos */}
            <div className="mt-4 text-xs text-gray-600">
              <p className="font-medium mb-2">Descrição dos campos principais:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>
                  <strong>funcionario_matricula:</strong> Matrícula do funcionário (deve existir no
                  sistema)
                </li>
                <li>
                  <strong>treinamento_codigo:</strong> Código do treinamento (será criado
                  automaticamente se não existir)
                </li>
                <li>
                  <strong>data_conclusao:</strong> Data de conclusão no formato{' '}
                  <span className="text-primary font-bold">DD/MM/AAAA</span> (ex: 20/08/2025)
                </li>
                <li>
                  <strong>data_vencimento:</strong> Data de vencimento no formato{' '}
                  <span className="text-primary font-bold">DD/MM/AAAA</span> (opcional, ex:
                  19/09/2026)
                </li>
                <li>
                  <strong>instrutor:</strong> Nome do instrutor (opcional)
                </li>
                <li>
                  <strong>nota:</strong> Nota final (decimal com ponto, ex: 8.5)
                </li>
                <li>
                  <strong>observacoes:</strong> Observações adicionais (opcional)
                </li>
              </ul>
              <div className="mt-3 p-2 bg-primary/10 rounded-md border-l-4 border-blue-400">
                <p className="font-bold text-primary">📅 Formato de Data: DD/MM/AAAA</p>
                <p className="text-blue-700">
                  Padrão brasileiro obrigatório. Exemplos: 20/08/2025, 17/09/2026
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      {/* File Info */}
      <div className="bg-primary/10 rounded-lg p-4">
        <div className="flex items-center">
          <FileText className="w-5 h-5 text-primary mr-3" />
          <div>
            <p className="font-medium text-blue-900">
              {selectedFile?.name || 'Dados colados via texto'}
            </p>
            <p className="text-sm text-blue-700">
              {selectedFile
                ? `${Math.round((selectedFile?.size || 0) / 1024)} KB • ${
                    previewData?.rows.length || 0
                  } linha(s) de preview`
                : `${previewData?.rows.length || 0} linha(s) de preview`}
            </p>
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-center mb-2">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
            <h4 className="font-medium text-red-900">Erros de Validação</h4>
          </div>
          <ul className="text-sm text-red-700 space-y-1">
            {validationErrors.map((error, index) => (
              <li key={index} className="flex items-start">
                <span className="w-1 h-1 bg-red-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Preview Table */}
      {previewData && (
        <div className="border rounded-lg overflow-hidden w-full">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <h4 className="font-medium text-gray-900">Preview dos dados (primeiras 5 linhas)</h4>
          </div>

          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  {previewData.headers.map((header, index) => (
                    <th
                      key={index}
                      className="px-4 py-3 text-left font-medium text-gray-700 border-r last:border-r-0 min-w-[140px] whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewData.rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-t hover:bg-gray-50">
                    {row.map((cell, cellIndex) => (
                      <td
                        key={cellIndex}
                        className="px-4 py-2 text-gray-600 border-r last:border-r-0 max-w-[200px] truncate"
                        title={cell}
                      >
                        {cell || <span className="text-gray-400 italic">vazio</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Header Mapping Info */}
      <div className="bg-green-50 rounded-lg p-4">
        <div className="flex items-center mb-2">
          <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
          <h4 className="font-medium text-green-900">Mapeamento de Campos</h4>
        </div>
        <div className="text-sm text-green-700">
          <p>
            Headers detectados: <span className="font-mono">{previewData?.headers.join(', ')}</span>
          </p>
          <p className="mt-1">
            Status:{' '}
            {validationErrors.length === 0
              ? 'Válido ✓'
              : `${validationErrors.length} erro(s) encontrado(s) ✗`}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => setStep('upload')}>
          Voltar
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            processImport();
          }}
          disabled={validationErrors.length > 0}
        >
          {validationErrors.length > 0 ? 'Corrigir Erros Primeiro' : 'Iniciar Importação'}
        </Button>
      </div>
    </div>
  );

  const renderProcessingStep = () => (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/20 rounded-full mb-6">
        <Clock className="w-8 h-8 text-primary animate-spin" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-2">Processando importação...</h3>
      <p className="text-gray-600">Validando dados e executando importação em lote</p>
      <div className="mt-4 text-sm text-gray-500">
        <p>• Validando funcionários existentes</p>
        <p>• Auto-criando treinamentos necessários</p>
        <p>• Gerando relatório detalhado</p>
      </div>
    </div>
  );

  const renderResultStep = () => {
    if (!result) return null;

    const isPartialSuccess =
      result.success &&
      result.erros > 0 &&
      result.importadas_com_sucesso &&
      result.importadas_com_sucesso > 0;

    const getStatusIcon = () => {
      if (!result.success) return <XCircle className="w-8 h-8 text-red-600" />;
      if (isPartialSuccess) return <AlertTriangle className="w-8 h-8 text-yellow-600" />;
      return <CheckCircle className="w-8 h-8 text-green-600" />;
    };

    const getStatusColor = () => {
      if (!result.success) return 'red';
      if (isPartialSuccess) return 'yellow';
      return 'green';
    };

    const statusColor = getStatusColor();

    return (
      <div className="space-y-4">
        {/* Status Header */}
        <div className={`bg-${statusColor}-50 rounded-lg p-6 text-center`}>
          <div className="flex justify-center mb-4">{getStatusIcon()}</div>
          <h3 className={`text-lg font-medium text-${statusColor}-900 mb-2`}>
            {!result.success
              ? 'Importação Falhada!'
              : isPartialSuccess
              ? 'Importação Parcial'
              : 'Importação Concluída!'}
          </h3>
          <p className={`text-${statusColor}-700`}>
            {result.error || result.resumo || 'Certificações processadas com sucesso'}
          </p>
        </div>

        {/* Metrics Expandidas */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">{result.linhas_processadas}</p>
            <p className="text-sm text-gray-600">Processadas</p>
          </div>

          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">
              {result.importadas_com_sucesso || 0}
            </p>
            <p className="text-sm text-green-700">Certificações</p>
          </div>

          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{result.funcionarios_criados || 0}</p>
            <p className="text-sm text-purple-700">Funcionários Criados</p>
          </div>

          <div className="bg-primary/10 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-primary">{result.treinamentos_criados || 0}</p>
            <p className="text-sm text-blue-700">Treinamentos Criados</p>
          </div>

          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{result.erros}</p>
            <p className="text-sm text-red-700">Erros</p>
          </div>
        </div>

        {/* Auto-Creation Alerts */}
        {result.novas_entidades?.funcionarios && result.novas_entidades.funcionarios.length > 0 && (
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <CheckCircle className="w-5 h-5 text-purple-600 mr-2" />
              <h4 className="font-medium text-purple-900">
                👥 Funcionários Criados Automaticamente (
                {result.novas_entidades.funcionarios.length})
              </h4>
            </div>
            <div className="max-h-32 overflow-y-auto">
              <ul className="text-sm text-purple-700 space-y-1">
                {result.novas_entidades.funcionarios.map((func: string, idx: number) => (
                  <li key={idx} className="flex items-center">
                    <span className="w-2 h-2 bg-purple-400 rounded-full mr-2"></span>
                    {func}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-purple-600 mt-2">
              💡 Funcionários foram criados com dados mínimos. Importe dados completos para
              atualizar.
            </p>
          </div>
        )}

        {result.novas_entidades?.treinamentos && result.novas_entidades.treinamentos.length > 0 && (
          <div className="bg-primary/10 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <CheckCircle className="w-5 h-5 text-primary mr-2" />
              <h4 className="font-medium text-blue-900">
                📚 Treinamentos Criados Automaticamente (
                {result.novas_entidades.treinamentos.length})
              </h4>
            </div>
            <div className="max-h-32 overflow-y-auto">
              <ul className="text-sm text-blue-700 space-y-1">
                {result.novas_entidades.treinamentos.map((trein: string, idx: number) => (
                  <li key={idx} className="flex items-center">
                    <span className="w-2 h-2 bg-blue-400 rounded-full mr-2"></span>
                    {trein}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs text-primary mt-2">
              💡 Treinamentos foram criados com dados mínimos. Importe catálogo completo para
              atualizar.
            </p>
          </div>
        )}

        {/* Observação da Auto-Criação */}
        {result.observacao && (
          <div className="bg-yellow-50 rounded-lg p-4">
            <div className="flex items-center mb-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
              <h4 className="font-medium text-yellow-900">Observação Importante</h4>
            </div>
            <p className="text-sm text-yellow-700">{result.observacao}</p>
          </div>
        )}

        {/* Performance */}
        {result.duracao_ms && (
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-lg font-bold text-gray-600">{result.duracao_ms}ms</p>
            <p className="text-sm text-gray-600">Tempo de Processamento</p>
          </div>
        )}

        {/* Errors Detail */}
        {result.detalhes_erros && result.detalhes_erros.length > 0 && (
          <div className="bg-red-50 rounded-lg p-4">
            <h4 className="font-medium text-red-900 mb-3">
              Detalhes dos Erros ({result.detalhes_erros.length})
            </h4>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {result.detalhes_erros.map((erro, index) => (
                <div key={index} className="text-sm border-l-2 border-red-300 pl-3">
                  <span className="font-medium text-red-700">Linha {erro.linha}:</span>
                  <span className="text-red-600 ml-2">{erro.erro}</span>
                  {erro.dados && (
                    <div className="text-red-500 text-xs mt-1 font-mono">
                      {JSON.stringify(erro.dados, null, 2).substring(0, 100)}...
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between">
          <Button variant="secondary" onClick={resetModal}>
            Nova Importação
          </Button>
          <Button variant="primary" onClick={handleClose}>
            Fechar
          </Button>
        </div>
      </div>
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 'upload':
        return renderUploadStep();
      case 'preview':
        return renderPreviewStep();
      case 'processing':
        return renderProcessingStep();
      case 'result':
        return renderResultStep();
      default:
        return renderUploadStep();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      className="max-w-[1280px] max-h-[90vh] overflow-y-auto m-4"
    >
      <div className="w-full p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-xl font-semibold text-gray-900 truncate">
              Importar Certificações via CSV
            </h2>
            <p className="text-sm text-gray-600 mt-1 break-words">
              Importe certificações usando arquivo CSV com validação avançada
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Step Progress */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className={step === 'upload' ? 'font-medium text-primary' : 'text-gray-500'}>
              1. Upload
            </span>
            <span className={step === 'preview' ? 'font-medium text-primary' : 'text-gray-500'}>
              2. Preview
            </span>
            <span className={step === 'processing' ? 'font-medium text-primary' : 'text-gray-500'}>
              3. Processamento
            </span>
            <span className={step === 'result' ? 'font-medium text-primary' : 'text-gray-500'}>
              4. Resultado
            </span>
          </div>
          <div className="mt-2 bg-gray-200 rounded-full h-2">
            <div
              className="bg-primary rounded-full h-2 transition-all duration-300"
              style={{
                width:
                  step === 'upload'
                    ? '25%'
                    : step === 'preview'
                    ? '50%'
                    : step === 'processing'
                    ? '75%'
                    : '100%',
              }}
            />
          </div>
        </div>

        <div className="max-h-[80vh] overflow-y-auto w-full">
          <div className="w-full">{renderStepContent()}</div>
        </div>
      </div>
    </Modal>
  );
}
