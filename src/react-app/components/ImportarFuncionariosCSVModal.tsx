import { useState } from 'react';
import { Upload, Download, X, AlertCircle, CheckCircle } from 'lucide-react';
import Papa from 'papaparse';
import { showToast } from '../utils/toast';
import { API_BASE_URL } from '@/react-app/config/api';

interface ImportarFuncionariosCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ImportarFuncionariosCSVModal({
  isOpen,
  onClose,
  onSuccess,
}: ImportarFuncionariosCSVModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    total?: number;
    inseridos?: number;
    atualizados?: number;
    detalhes?: Array<{ linha: number; erro: string }>;
    preview?: Array<Record<string, unknown>>;
  } | null>(null);
  const [validacao, setValidacao] = useState<{
    total: number;
    validos: number;
    erros: Array<{ linha: number; campo?: string; erro: string }>;
  }>({ total: 0, validos: 0, erros: [] });

  if (!isOpen) return null;

  // Validação local dos dados de funcionários
  const validarDadosLocalmente = (
    dados: Array<Record<string, unknown>>,
  ): {
    total: number;
    validos: number;
    erros: Array<{ linha: number; campo?: string; erro: string }>;
  } => {
    const erros: Array<{ linha: number; campo?: string; erro: string }> = [];

    dados.forEach((row, index) => {
      const linha = index + 2; // +2 porque linha 1 é header, index começa em 0

      // Validar campos obrigatórios
      const nome = String(row.Nome || row.nome || '').trim();
      const cpf = String(row.CPF || row.cpf || '').trim();
      const matricula = String(row.Matricula || row.matricula || '').trim();

      if (!nome) {
        erros.push({ linha, campo: 'Nome', erro: 'Nome obrigatório' });
        return;
      }

      if (!cpf) {
        erros.push({ linha, campo: 'CPF', erro: 'CPF obrigatório' });
        return;
      }

      if (!matricula) {
        erros.push({ linha, campo: 'Matricula', erro: 'Matrícula obrigatória' });
        return;
      }

      // Validar comprimento mínimo de nome
      if (nome.length < 3) {
        erros.push({ linha, campo: 'Nome', erro: 'Nome deve ter no mínimo 3 caracteres' });
        return;
      }

      // Validar formato de CPF (apenas números, 11 dígitos)
      const cpfNumeros = cpf.replace(/\D/g, '');
      if (cpfNumeros.length !== 11) {
        erros.push({ linha, campo: 'CPF', erro: 'CPF deve ter 11 dígitos' });
        return;
      }
    });

    return {
      total: dados.length,
      validos: dados.length - erros.length,
      erros,
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.csv')) {
        showToast.error('Por favor, selecione um arquivo CSV');
        return;
      }
      setFile(selectedFile);
      setResult(null);
      setValidacao({ total: 0, validos: 0, erros: [] });

      // Validar assim que arquivo for selecionado
      Papa.parse(selectedFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const dados = results.data as Array<Record<string, unknown>>;
          const validacaoLocal = validarDadosLocalmente(dados);
          setValidacao(validacaoLocal);
        },
      });
    }
  };

  const handleImport = async () => {
    if (!file) {
      showToast.error('Selecione um arquivo CSV');
      return;
    }

    setImporting(true);

    try {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          try {
            const get = (obj: Record<string, unknown>, key: string) =>
              (obj as Record<string, unknown>)[key] as unknown;

            const dados = (results.data as Array<Record<string, unknown>>).map((r) => ({
              nome:
                (r.nome as string) ||
                (r.Nome as string) ||
                (get(r, 'Nome Completo') as string) ||
                (get(r, 'NOME') as string) ||
                (get(r, 'NOME COMPLETO') as string) ||
                '',
              matricula:
                (r.matricula as string) ||
                (r.Matricula as string) ||
                (get(r, 'Matrícula') as string) ||
                (get(r, 'MATRICULA') as string) ||
                (get(r, 'MATRÍCULA') as string) ||
                (get(r, 'Matricula') as string),
              cpf: (r.cpf as string) || (r.CPF as string),
              email:
                (r.email as string) ||
                (r.Email as string) ||
                (get(r, 'E-mail') as string) ||
                (get(r, 'E-MAIL') as string),
              telefone:
                (r.telefone as string) ||
                (r.Telefone as string) ||
                (get(r, 'Fone') as string) ||
                (get(r, 'Celular') as string),
              funcao:
                (r.funcao as string) ||
                (get(r, 'função') as string) ||
                (r.Funcao as string) ||
                (get(r, 'Função') as string),
              setor:
                (r.setor as string) || (r.Setor as string) || (get(r, 'Departamento') as string),
              base: (r.base as string) || (r.Base as string),
              contrato: (r.contrato as string) || (r.Contrato as string),
              status: (r.status as string) || (r.Status as string),
              guerra:
                (r.guerra as string) ||
                (get(r, 'Nome Guerra') as string) ||
                (get(r, 'Nome de Guerra') as string),
              nascimento:
                (r.nascimento as string) ||
                (get(r, 'Data Nascimento') as string) ||
                (get(r, 'Nascimento') as string),
              admissao:
                (r.admissao as string) ||
                (get(r, 'Data Admissao') as string) ||
                (get(r, 'Admissao') as string) ||
                (get(r, 'Data Admissão') as string) ||
                (get(r, 'Admissão') as string),
              codigo_anac:
                (r.codigo_anac as string) ||
                (get(r, 'Codigo ANAC') as string) ||
                (get(r, 'Cód. ANAC') as string) ||
                (get(r, 'Código ANAC') as string),
              codigo_codigo_anac:
                (r.codigo_codigo_anac as string) ||
                (get(r, 'Codigo CANAC') as string) ||
                (get(r, 'Código CANAC') as string),
              licenca_aeronautica:
                (r.licenca_aeronautica as string) ||
                (get(r, 'Licenca Aeronautica') as string) ||
                (get(r, 'Licença Aeronáutica') as string),
              cma_numero:
                (r.cma_numero as string) ||
                (get(r, 'CMA Numero') as string) ||
                (get(r, 'CMA Número') as string),
              cma_data_vencimento:
                (r.cma_data_vencimento as string) ||
                (get(r, 'CMA Vencimento') as string) ||
                (get(r, 'Validade CMA') as string),
              cma_status: (r.cma_status as string) || (get(r, 'CMA Status') as string),
              aso_data_vencimento:
                (r.aso_data_vencimento as string) ||
                (get(r, 'ASO Vencimento') as string) ||
                (get(r, 'Validade ASO') as string),
              nivel_icao:
                (r.nivel_icao as string) ||
                (get(r, 'Nível ICAO') as string) ||
                (get(r, 'Nivel ICAO') as string),
              nivel_icao_data_vencimento:
                (r.nivel_icao_data_vencimento as string) || (get(r, 'Validade ICAO') as string),
              nivel_icao_status:
                (r.nivel_icao_status as string) || (get(r, 'ICAO Status') as string),
              aeronave_principal:
                (r.aeronave_principal as string) ||
                (r.Aeronave as string) ||
                (get(r, 'Aeronave Principal') as string),
              is_instrutor:
                (r.is_instrutor as number | string | boolean) ||
                (get(r, 'Instrutor') as number | string | boolean) ||
                (get(r, 'É Instrutor') as number | string | boolean) ||
                0,
              is_checador:
                (r.is_checador as number | string | boolean) ||
                (get(r, 'Checador') as number | string | boolean) ||
                (get(r, 'É Checador') as number | string | boolean) ||
                0,
            }));

            const response = await fetch(`${API_BASE_URL}/funcionarios/import`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ funcionarios: dados }),
            });

            const data = await response.json();

            if (response.ok && (data.sucesso || data.inseridos !== undefined)) {
              setResult(data);
              const ok = data.inseridos || 0;
              const upd = data.atualizados || 0;
              showToast.success(`${ok} inseridos, ${upd} atualizados`);
              setTimeout(() => {
                onSuccess();
                handleClose();
              }, 1200);
            } else {
              showToast.error(data.error || data.erro || 'Erro ao importar');
            }
          } catch (error) {
            console.error('Erro ao importar:', error);
            showToast.error('Erro ao processar importação');
          } finally {
            setImporting(false);
          }
        },
        error: (error) => {
          console.error('Erro ao ler CSV:', error);
          showToast.error('Erro ao ler arquivo CSV');
          setImporting(false);
        },
      });
    } catch (error) {
      console.error('Erro:', error);
      showToast.error('Erro ao processar arquivo');
      setImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    onClose();
  };

  const templateUrl = `${API_BASE_URL}/templates/funcionarios.csv`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Importar Funcionários</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="mb-6 p-4 bg-primary/10 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <Download className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-medium text-blue-900 mb-1">Baixe o template CSV</h3>
              <p className="text-sm text-blue-700 mb-3">
                Use nosso template para garantir que os dados estejam no formato correto
              </p>
              <a
                href={templateUrl}
                download
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                Baixar Template
              </a>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selecione o arquivo CSV
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
            <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload-funcs"
            />
            <label
              htmlFor="csv-upload-funcs"
              className="cursor-pointer inline-block px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Escolher Arquivo
            </label>
            {file && (
              <p className="mt-3 text-sm text-gray-600">
                Arquivo selecionado: <span className="font-medium">{file.name}</span>
              </p>
            )}
          </div>
        </div>

        {/* Status de Validação */}
        {file && validacao.total > 0 && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-primary" />
              Status de Validação
            </h4>
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
                  <AlertCircle className="w-5 h-5" />
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
          </div>
        )}

        {result && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="font-medium text-gray-900 mb-3">Resultado da Importação</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                <div className="text-2xl font-bold text-gray-900">
                  {result.total ?? (result.inseridos ?? 0) + (result.atualizados ?? 0)}
                </div>
                <div className="text-sm text-gray-600">Total</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="text-2xl font-bold text-green-600">{result.inseridos || 0}</div>
                <div className="text-sm text-green-700">Inseridos</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="text-2xl font-bold text-yellow-600">{result.atualizados || 0}</div>
                <div className="text-sm text-yellow-700">Atualizados</div>
              </div>
            </div>
            {Array.isArray(result.detalhes) && result.detalhes.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer font-medium text-red-600 hover:text-red-700">
                  Ver erros ({result.detalhes.length})
                </summary>
                <div className="mt-3 max-h-40 overflow-y-auto">
                  {result.detalhes.map((erro: { linha: number; erro: string }, i: number) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 py-2 border-b border-gray-200 last:border-0"
                    >
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        <span className="font-medium">Linha {erro.linha}:</span>{' '}
                        <span className="text-gray-600">{erro.erro}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {Array.isArray(result.preview) && result.preview.length > 0 && (
              <div className="mt-3 flex items-center gap-2 text-green-600">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Pré-visualização de {result.preview.length} registros
                </span>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            Fechar
          </button>
          <button
            onClick={handleImport}
            disabled={!file || importing || validacao.erros.length > 0}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {importing ? 'Importando...' : 'Importar'}
          </button>
        </div>
      </div>
    </div>
  );
}
