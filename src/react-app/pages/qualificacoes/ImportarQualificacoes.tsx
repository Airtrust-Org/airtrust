import { useState, useEffect } from 'react';
import { toast } from 'sonner';

import { API_BASE_URL } from '@/react-app/config/api';
// 🚀 LAZY LOADING: XLSX carregado dinamicamente apenas quando necessário (importar/preview/export)
import { Upload, Download, FileSpreadsheet, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ImportarQualificacoesProps {
  onImportSuccess?: () => void;
}

const IMPORTACAO_QUALIFICACOES_DISPONIVEL = false;
const IMPORTACAO_QUALIFICACOES_BLOQUEADA_MSG =
  'Importação de qualificações nesta tela está temporariamente desabilitada: endpoint legado removido (/api/qualificacoes/importar-json).';

export default function ImportarQualificacoes({ onImportSuccess }: ImportarQualificacoesProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);
  const [modo, setModo] = useState<
    'preencher_vazios' | 'atualizar_inteligente' | 'substituir_tudo'
  >('atualizar_inteligente');
  const [validacao, setValidacao] = useState<{
    total: number;
    validos: number;
    erros: Array<{ linha: number; campo?: string; erro: string }>;
  }>({ total: 0, validos: 0, erros: [] });

  useEffect(() => {
    carregarHistorico();
  }, []);

  const carregarHistorico = async () => {
    try {
      const API_URL = API_BASE_URL.replace('/api', '');
      const response = await fetch(`${API_URL}/api/qualificacoes/importacoes-historico?limit=10`);
      const data = await response.json();
      if (data.success) {
        setHistorico(data.importacoes);
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
    }
  };

  // Validação local dos dados
  const validarDadosLocalmente = (
    jsonData: any[],
  ): {
    total: number;
    validos: number;
    erros: Array<{ linha: number; campo?: string; erro: string }>;
  } => {
    const erros: Array<{ linha: number; campo?: string; erro: string }> = [];

    jsonData.forEach((row: any, index: number) => {
      const linha = index + 2; // +2 porque linha 1 é header, index começa em 0

      // Validar campos obrigatórios: codigo e nome
      const codigo = String(row.codigo || '')
        .trim()
        .toUpperCase();
      const nome = String(row.nome || '').trim();

      if (!codigo) {
        erros.push({ linha, campo: 'codigo', erro: 'Código obrigatório' });
        return;
      }

      if (!nome) {
        erros.push({ linha, campo: 'nome', erro: 'Nome obrigatório' });
        return;
      }

      if (nome.length < 3) {
        erros.push({ linha, campo: 'nome', erro: 'Nome deve ter no mínimo 3 caracteres' });
        return;
      }

      // Validar tipos de dados
      if (
        row.validade !== null &&
        row.validade !== undefined &&
        String(row.validade).trim() !== ''
      ) {
        const validadeStr = String(row.validade).trim();
        const validade = parseInt(validadeStr, 10);
        if (isNaN(validade) || validade <= 0) {
          erros.push({ linha, campo: 'validade', erro: 'Validade deve ser número inteiro > 0' });
          return;
        }
      }

      if (
        row.carga_horaria !== null &&
        row.carga_horaria !== undefined &&
        String(row.carga_horaria).trim() !== ''
      ) {
        const chStr = String(row.carga_horaria).trim();
        const ch = parseFloat(chStr);
        if (isNaN(ch) || ch <= 0) {
          erros.push({ linha, campo: 'carga_horaria', erro: 'Carga horária deve ser número > 0' });
          return;
        }
      }
    });

    return {
      total: jsonData.length,
      validos: jsonData.length - erros.length,
      erros,
    };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setResultado(null);

      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        // Validar dados localmente
        const validacaoLocal = validarDadosLocalmente(jsonData);
        setValidacao(validacaoLocal);

        const previewData = jsonData.slice(0, 5).map((row: any) => {
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
    if (!IMPORTACAO_QUALIFICACOES_DISPONIVEL) {
      toast.warning(IMPORTACAO_QUALIFICACOES_BLOQUEADA_MSG);
      return;
    }

    if (!file) {
      toast.warning('Selecione um arquivo');
      return;
    }

    setLoading(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(arrayBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const API_URL = API_BASE_URL.replace('/api', '');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

      const response = await fetch(`${API_URL}/api/qualificacoes/importar-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dados: jsonData,
          arquivo_nome: file.name,
          modo, // Enviar modo selecionado
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json();
        const errorMsg = errorData.error || `Erro ${response.status}: ${response.statusText}`;
        console.error('[IMPORT ERROR]', errorData);
        toast.warning(`Erro ao importar: ${errorMsg}`);
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setResultado(data.resultados);
        onImportSuccess?.();
        carregarHistorico();

        if (data.resultados.erros.length === 0) {
          setTimeout(() => {
            setFile(null);
            setResultado(null);
            setPreview([]);
            setShowPreview(false);
          }, 10000);
        }
      } else {
        toast.warning(`Erro: ${data.error || 'Erro desconhecido'}`);
        console.error('[IMPORT ERROR]', data);
      }
    } catch (error) {
      let errorMsg = 'Erro ao importar planilha';

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMsg =
            'Timeout: A importação demorou mais de 60 segundos. Tente com menos registros.';
        } else {
          errorMsg = error.message;
        }
      }

      toast.warning(`Erro: ${errorMsg}`);
      console.error('[IMPORT EXCEPTION]', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = async () => {
    const template = [
      [
        'cpf',
        'tipo',
        'codigo',
        'categoria',
        'descricao',
        'instituicao',
        'instrutor',
        'carga_horaria',
        'numero',
        'data_emissao',
        'data_conclusao',
        'data_vencimento',
        'observacoes',
      ],
      [
        '123.456.789-00',
        'TREINAMENTO',
        'CRM-2025',
        'CRM',
        'Crew Resource Management',
        'ANAC',
        'João Silva',
        40,
        'CERT-001',
        '15/01/2025',
        '20/01/2025',
        '20/01/2026',
        'Treinamento obrigatório',
      ],
      [
        '123.456.789-00',
        'CHECK',
        'PC-A320',
        'SIMULADOR',
        'Proficiency Check A320',
        'AirTrust',
        'Maria Santos',
        4,
        'CHECK-001',
        '01/02/2025',
        '01/02/2025',
        '01/08/2025',
        'Aprovado',
      ],
      [
        '987.654.321-00',
        'EXAME',
        'ASO-2025',
        'ASO',
        'Atestado Saúde Ocupacional',
        'Clínica Médica',
        'Dr. Pedro',
        0,
        'ASO-001',
        '10/03/2025',
        '10/03/2025',
        '10/03/2026',
        'Apto para voo',
      ],
    ];

    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Qualificações');
    XLSX.writeFile(wb, 'template_qualificacoes_airtrust.xlsx');
  };

  return (
    <div className="space-y-4">
      {/* Importação */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex items-center gap-3 mb-4">
          <FileSpreadsheet className="w-6 h-6 text-primary" />
          <h3 className="text-lg font-semibold">Importar Qualificações (Excel)</h3>
        </div>

        <div className="space-y-4">
          {!IMPORTACAO_QUALIFICACOES_DISPONIVEL && (
            <div className="p-4 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-900">
              <p className="font-medium">Importação temporariamente desabilitada</p>
              <p className="text-sm mt-1">{IMPORTACAO_QUALIFICACOES_BLOQUEADA_MSG}</p>
            </div>
          )}

          {/* Template */}
          <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-lg border border-blue-200">
            <Download className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <p className="font-medium text-blue-900">Baixe o template Excel</p>
              <p className="text-sm text-blue-700">
                Use este arquivo para garantir o formato correto
              </p>
            </div>
            <button
              onClick={downloadTemplate}
              className=" py-2 bg-primary text-white rounded hover:bg-primary/90 flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Baixar Template
            </button>
          </div>

          {/* Upload */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Selecionar Arquivo (.xlsx ou .xls)
            </label>
            <div className="flex items-center gap-3">
              <label className="flex-1 flex items-center justify-center  py-8 border-2 border-dashed border-gray-300 rounded-lg hover:border-primary cursor-pointer transition">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="text-center">
                  <Upload className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">
                    {file ? (
                      <span className="font-semibold text-primary">{file.name}</span>
                    ) : (
                      'Clique para selecionar ou arraste o arquivo'
                    )}
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Modo de Importação */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-primary" />
              Modo de Importação
            </h4>
            <div className="space-y-3">
              <label
                className="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-white transition"
                style={{ borderColor: modo === 'preencher_vazios' ? '#3b82f6' : '#d1d5db' }}
              >
                <input
                  type="radio"
                  name="modo"
                  value="preencher_vazios"
                  checked={modo === 'preencher_vazios'}
                  onChange={(e) => setModo(e.target.value as any)}
                  className="w-4 h-4"
                />
                <div>
                  <p className="font-medium">Preencher Vazios</p>
                  <p className="text-sm text-gray-600">
                    Adiciona informações apenas nos campos que estão vazios. Preserva todos os dados
                    existentes.
                  </p>
                </div>
              </label>

              <label
                className="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-white transition"
                style={{ borderColor: modo === 'atualizar_inteligente' ? '#3b82f6' : '#d1d5db' }}
              >
                <input
                  type="radio"
                  name="modo"
                  value="atualizar_inteligente"
                  checked={modo === 'atualizar_inteligente'}
                  onChange={(e) => setModo(e.target.value as any)}
                  className="w-4 h-4"
                />
                <div>
                  <p className="font-medium text-blue-600">Atualizar Inteligente (Recomendado)</p>
                  <p className="text-sm text-gray-600">
                    Atualiza dados existentes. Se o registro não existe, adiciona novo. Melhor opção
                    para a maioria dos casos.
                  </p>
                </div>
              </label>

              <label
                className="flex items-center gap-3 p-3 border rounded cursor-pointer hover:bg-white transition"
                style={{ borderColor: modo === 'substituir_tudo' ? '#3b82f6' : '#d1d5db' }}
              >
                <input
                  type="radio"
                  name="modo"
                  value="substituir_tudo"
                  checked={modo === 'substituir_tudo'}
                  onChange={(e) => setModo(e.target.value as any)}
                  className="w-4 h-4"
                />
                <div>
                  <p className="font-medium">Substituir Tudo</p>
                  <p className="text-sm text-gray-600">
                    Substitui completamente os registros existentes. Requer que todos os registros
                    já existam no sistema.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Preview */}
          {showPreview && preview.length > 0 && (
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-primary" />
                <h4 className="font-semibold">Status de Validação</h4>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-100 rounded">
                  <p className="text-2xl font-bold">{validacao.total}</p>
                  <p className="text-sm text-gray-600">Total</p>
                </div>
                <div className="text-center p-3 bg-green-100 rounded">
                  <p className="text-2xl font-bold text-green-600">{validacao.validos}</p>
                  <p className="text-sm text-gray-600">Válidos</p>
                </div>
                <div className="text-center p-3 bg-red-100 rounded">
                  <p className="text-2xl font-bold text-red-600">{validacao.erros.length}</p>
                  <p className="text-sm text-gray-600">Erros</p>
                </div>
              </div>

              {validacao.erros.length > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
                  <p className="text-red-600 font-semibold mb-2 flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Erros Encontrados:
                  </p>
                  <div className="max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b border-red-300">
                        <tr>
                          <th className="text-left p-1">Linha</th>
                          <th className="text-left p-1">Campo</th>
                          <th className="text-left p-1">Erro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {validacao.erros.slice(0, 10).map((erro, i) => (
                          <tr key={i} className="border-b border-red-100">
                            <td className="p-1">{erro.linha}</td>
                            <td className="p-1">{erro.campo || '-'}</td>
                            <td className="p-1">{erro.erro}</td>
                          </tr>
                        ))}
                        {validacao.erros.length > 10 && (
                          <tr>
                            <td colSpan={3} className="p-1 text-center text-red-600 font-semibold">
                              ... e {validacao.erros.length - 10} erros mais
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mt-3">
                <h5 className="font-semibold text-sm mb-2">Preview (primeiras 5 linhas)</h5>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm border">
                    <thead className="bg-gray-200">
                      <tr>
                        {Object.keys(preview[0]).map((key) => (
                          <th key={key} className="px-3 py-2 text-left border">
                            {key}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {preview.map((row, i) => (
                        <tr key={i} className="border-t hover:bg-gray-50">
                          {Object.values(row).map((val: any, j) => (
                            <td key={j} className="px-3 py-2 border">
                              {String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Total de {validacao.total} linhas no arquivo. Arquivo completo será processado na
                  importação.
                </p>
              </div>
            </div>
          )}

          {/* Botão Importar */}
          <button
            onClick={handleImport}
            disabled={!file || loading || !IMPORTACAO_QUALIFICACOES_DISPONIVEL}
            className={`w-full py-3 rounded-lg text-white font-semibold flex items-center justify-center gap-2 ${
              loading || !file || !IMPORTACAO_QUALIFICACOES_DISPONIVEL
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Importando...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                {IMPORTACAO_QUALIFICACOES_DISPONIVEL
                  ? 'Importar Qualificações'
                  : 'Importação Indisponível'}
              </>
            )}
          </button>

          {/* Resultados */}
          {resultado && (
            <div className="mt-4 p-4 border rounded-lg bg-white">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                Resultado da Importação
              </h4>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-100 rounded">
                  <p className="text-2xl font-bold">{resultado.total}</p>
                  <p className="text-sm text-gray-600">Total</p>
                </div>
                <div className="text-center p-3 bg-green-100 rounded">
                  <p className="text-2xl font-bold text-green-600">{resultado.sucesso}</p>
                  <p className="text-sm text-gray-600">Sucesso</p>
                </div>
                <div className="text-center p-3 bg-red-100 rounded">
                  <p className="text-2xl font-bold text-red-600">{resultado.erros.length}</p>
                  <p className="text-sm text-gray-600">Erros</p>
                </div>
              </div>

              {resultado.erros.length > 0 && (
                <div className="mt-3">
                  <p className="text-red-600 font-semibold mb-2 flex items-center gap-2">
                    <XCircle className="w-5 h-5" />
                    Detalhes dos Erros:
                  </p>
                  <div className="max-h-60 overflow-y-auto bg-red-50 p-3 rounded border border-red-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-red-200">
                          <th className="text-left p-2">Linha</th>
                          <th className="text-left p-2">Campo</th>
                          <th className="text-left p-2">Erro</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.erros.map((erro: any, i: number) => (
                          <tr key={i} className="border-b border-red-100">
                            <td className="p-2">{erro.linha}</td>
                            <td className="p-2">{erro.campo || '-'}</td>
                            <td className="p-2">{erro.erro}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Histórico de Importações */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">Histórico de Importações</h3>
        {historico.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nenhuma importação realizada ainda</p>
        ) : (
          <div className="space-y-2">
            {historico.map((imp: any) => (
              <div
                key={imp.id}
                className="border rounded-lg p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div>
                  <p className="font-semibold">{imp.arquivo_nome}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(imp.data_importacao).toLocaleString('pt-BR')}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`px-3 py-1 rounded text-sm font-semibold ${
                      imp.status === 'CONCLUIDA'
                        ? 'bg-green-100 text-green-800'
                        : imp.status === 'PARCIAL'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {imp.status}
                  </span>
                  <p className="text-sm mt-1 text-gray-600">
                    {imp.sucesso}/{imp.total} registros
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
