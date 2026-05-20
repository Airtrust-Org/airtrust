import { useState, useRef } from 'react';
import { X, Upload, FileText, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useImportacao, type MergeMode } from '../../hooks/useImportacao';

interface ModalImportacaoProps {
  entidade: 'funcionarios' | 'qualificacoes_tipos' | 'qualificacoes_historico';
  onClose: () => void;
  onSucesso: () => void;
}

type Etapa = 'upload' | 'validacao' | 'preview' | 'importando' | 'concluido';

export function ModalImportacao({ entidade, onClose, onSucesso }: ModalImportacaoProps) {
  const [etapa, setEtapa] = useState<Etapa>('upload');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [dados, setDados] = useState<Record<string, unknown>[]>([]);
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [mode, setMode] = useState<MergeMode>('MESCLAR_INTELIGENTE');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { parsearArquivo, validarDados, executarImportacao, baixarTemplate, isLoading, validacao } =
    useImportacao(entidade);

  const nomeEntidade = {
    funcionarios: 'Funcionários',
    qualificacoes_tipos: 'Tipos de Qualificação',
    qualificacoes_historico: 'Histórico de Qualificações',
  }[entidade];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Verificar extensão
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      toast.error('Formato inválido', {
        description: 'Selecione um arquivo CSV (.csv) ou Excel (.xlsx, .xls)',
      });
      return;
    }

    setArquivo(file);
    setEtapa('validacao');

    try {
      console.log('[ModalImportacao] Parseando arquivo:', file.name);
      const parsed = await parsearArquivo(file);

      if (parsed.length === 0) {
        toast.error('Arquivo vazio', {
          description: 'O arquivo não contém dados para importar.',
        });
        setEtapa('upload');
        return;
      }

      setDados(parsed);

      console.log('[ModalImportacao] Validando dados...');
      const result = await validarDados(parsed, { modo: mode });

      console.log('[ModalImportacao] Resultado da validação:', result);

      if (result) {
        const criar = result.criar || 0;
        const completar = result.completar || 0;
        const mesclar = result.mesclar || 0;
        const erros = result.erros || 0;
        const total = criar + completar + mesclar;

        if (erros === 0) {
          toast.success('Arquivo validado com sucesso!', {
            description: `${total} linhas prontas para importar.`,
          });
        } else {
          toast.warning('Arquivo contém erros', {
            description: `${erros} linhas com erro. Revise antes de importar.`,
          });
        }
        setEtapa('preview');
      } else {
        toast.error('Erro na validação', {
          description: 'Não foi possível validar o arquivo. Verifique o formato.',
        });
        setEtapa('upload');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      toast.error('Erro ao processar arquivo', {
        description: msg,
      });
      console.error(error);
      setEtapa('upload');
    }
  };

  const handleConfirmar = async () => {
    if (!dados || dados.length === 0) {
      toast.error('Nenhum dado para importar');
      return;
    }

    if (validacao && validacao.erros > 0) {
      toast.error('Arquivo contém erros', {
        description: 'Corrija os erros antes de importar.',
      });
      return;
    }

    setEtapa('importando');

    try {
      const success = await executarImportacao(dados, { modo: mode });

      if (success) {
        toast.success('Importação concluída!', {
          description: 'Os dados foram importados com sucesso.',
        });
        setEtapa('concluido');
        setTimeout(() => {
          onSucesso();
        }, 1500);
      } else {
        toast.error('Erro na importação', {
          description: 'Não foi possível concluir a importação.',
        });
        setEtapa('preview');
      }
    } catch (error) {
      toast.error('Erro ao importar dados', {
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      console.error(error);
      setEtapa('preview');
    }
  };

  const handleVoltar = () => {
    setArquivo(null);
    setDados([]);
    setEtapa('upload');
    setPaginaAtual(1);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Importar {nomeEntidade}</h2>
            <p className="text-sm text-gray-600 mt-1">
              Importe dados em massa via CSV ou Excel (Sistema v2.0)
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {/* Etapa 1: Upload */}
          {etapa === 'upload' && (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-5 text-center hover:border-blue-500 transition-colors">
                <Upload size={48} className="mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Upload de Arquivo CSV ou Excel</h3>
                <p className="text-gray-600 mb-4">
                  Clique ou arraste um arquivo .csv, .xlsx ou .xls
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                >
                  Selecionar Arquivo
                </button>
              </div>

              {/* Template Download */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <Download size={24} className="text-blue-600 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 mb-1">Baixar Template</h3>
                    <p className="text-sm text-blue-700 mb-3">
                      Baixe um modelo CSV com os campos corretos para preencher
                    </p>
                    <button
                      onClick={baixarTemplate}
                      className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 text-sm"
                    >
                      Baixar Template de {nomeEntidade}
                    </button>
                  </div>
                </div>
              </div>

              {/* Informações sobre formatos */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <FileText size={20} />
                  Formatos Suportados
                </h4>
                <ul className="text-sm text-gray-600 space-y-1 ml-6">
                  <li>• CSV (.csv) - Comma-separated values</li>
                  <li>• Excel 2007+ (.xlsx) - Formato moderno</li>
                  <li>• Excel 97-2003 (.xls) - Formato legado</li>
                </ul>
              </div>

              {/* Informações específicas para Histórico de Qualificações */}
              {entidade === 'qualificacoes_historico' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <h4 className="font-semibold text-emerald-900 mb-2">
                    📋 Campos do Histórico (Simplificado)
                  </h4>
                  <div className="text-sm text-emerald-800 space-y-2">
                    <p className="font-medium">Apenas 3 campos obrigatórios:</p>
                    <ul className="ml-4 space-y-1">
                      <li>
                        <strong>funcionario_cpf:</strong> CPF do funcionário (11 dígitos, sem
                        pontos/traços)
                      </li>
                      <li>
                        <strong>qualificacao_codigo:</strong> Código da qualificação (ex: CMA1,
                        ICAO, PP)
                      </li>
                      <li>
                        <strong>data_conclusao:</strong> Data de realização (formato: AAAA-MM-DD)
                      </li>
                    </ul>
                    <div className="mt-3 pt-3 border-t border-emerald-300">
                      <p className="font-medium text-emerald-900">✨ Cálculo Automático:</p>
                      <ul className="ml-4 mt-1 space-y-1">
                        <li>• Nome do funcionário (via CPF)</li>
                        <li>• Nome da qualificação (via código)</li>
                        <li>• Data de vencimento (baseado na validade)</li>
                        <li>• Carga horária (do tipo de qualificação)</li>
                        <li>• Status e urgência (calculados automaticamente)</li>
                      </ul>
                    </div>
                    <div className="mt-3 pt-3 border-t border-emerald-300">
                      <p className="font-medium text-emerald-900">🔗 Integração Ativa:</p>
                      <p className="mt-1">
                        Quando funcionários ou tipos de qualificação são atualizados, os dados do
                        histórico refletem as mudanças automaticamente!
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Etapa 2: Validando */}
          {etapa === 'validacao' && (
            <div className="py-12 text-center">
              <div className="animate-spin w-16 h-16 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Validando arquivo...</h3>
              <p className="text-gray-600">Verificando dados e referências</p>
            </div>
          )}

          {/* Etapa 3: Preview de Validação */}
          {etapa === 'preview' && validacao && (
            <div className="space-y-4">
              {/* Resumo */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Total</p>
                  <p className="text-2xl font-bold text-blue-600">{validacao.total}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Válidos</p>
                  <p className="text-2xl font-bold text-green-600">
                    {validacao.criar + validacao.completar + validacao.mesclar}
                  </p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Erros</p>
                  <p className="text-2xl font-bold text-red-600">{validacao.erros}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Status</p>
                  <p className="text-lg font-bold text-gray-900">
                    {validacao.erros === 0 ? '✓ Pronto' : '✗ Revisar'}
                  </p>
                </div>
              </div>

              {/* Opções de Modo */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="font-semibold mb-3">Modo de Importação</h3>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                    <input
                      type="radio"
                      name="mode"
                      value="COMPLETAR"
                      checked={mode === 'COMPLETAR'}
                      onChange={(e) => setMode(e.target.value as MergeMode)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-semibold text-slate-900">Preencher Vazios</div>
                      <div className="text-sm text-slate-600 mt-0.5">
                        Adiciona informações apenas nos campos que estão vazios. Preserva todos os
                        dados existentes.
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                    <input
                      type="radio"
                      name="mode"
                      value="MESCLAR_INTELIGENTE"
                      checked={mode === 'MESCLAR_INTELIGENTE'}
                      onChange={(e) => setMode(e.target.value as MergeMode)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-semibold text-blue-900 flex items-center gap-2">
                        Atualizar Inteligente
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          Recomendado
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 mt-0.5">
                        Compara os dados e mantém sempre a informação mais completa. Ideal para
                        atualizações.
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-white border border-transparent hover:border-slate-200 transition-all">
                    <input
                      type="radio"
                      name="mode"
                      value="SOBRESCREVER"
                      checked={mode === 'SOBRESCREVER'}
                      onChange={(e) => setMode(e.target.value as MergeMode)}
                      className="mt-1"
                    />
                    <div>
                      <div className="font-semibold text-slate-900">Substituir Tudo</div>
                      <div className="text-sm text-slate-600 mt-0.5">
                        Substitui completamente os registros existentes. Use com cuidado.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Erros de Validação */}
              {validacao.detalhes &&
                validacao.detalhes.filter((d) => d.acao === 'ERROR').length > 0 && (
                  <div className="border border-red-200 rounded-lg overflow-hidden">
                    <div className="bg-red-50 px-4 py-3 border-b border-red-200">
                      <h3 className="font-semibold text-red-900 flex items-center gap-2">
                        <AlertTriangle size={20} />
                        Erros de Validação ({validacao.erros})
                      </h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="min-w-full divide-y divide-red-100">
                        <thead className="bg-red-50 sticky top-0">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-800 uppercase">
                              Linha
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-800 uppercase">
                              Ação
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-800 uppercase">
                              Mensagem
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-red-100">
                          {(() => {
                            const LINHAS_POR_PAGINA = 20;
                            const inicio = (paginaAtual - 1) * LINHAS_POR_PAGINA;
                            const fim = inicio + LINHAS_POR_PAGINA;
                            const erros = validacao.detalhes.filter((d) => d.acao === 'ERROR');
                            const errosPagina = erros.slice(inicio, fim);

                            return errosPagina.map((detalhe, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-2 text-sm text-gray-900">{detalhe.linha}</td>
                                <td className="px-4 py-2 text-sm font-mono text-gray-700">
                                  {detalhe.acao}
                                </td>
                                <td className="px-4 py-2 text-sm text-red-600">
                                  {detalhe.mensagem || 'Erro de validação'}
                                </td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                    {validacao.erros > 20 && (
                      <div className="bg-red-50 px-4 py-3 border-t flex items-center justify-between">
                        <div className="text-sm text-red-700">
                          Mostrando {Math.min((paginaAtual - 1) * 20 + 1, validacao.erros)} a{' '}
                          {Math.min(paginaAtual * 20, validacao.erros)} de {validacao.erros} erros
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                            disabled={paginaAtual === 1}
                            className="px-3 py-1 rounded border border-red-300 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            Anterior
                          </button>
                          <div className="px-3 py-1 text-sm text-red-700">
                            Página {paginaAtual} de {Math.ceil(validacao.erros / 20)}
                          </div>
                          <button
                            onClick={() =>
                              setPaginaAtual((p) =>
                                Math.min(Math.ceil(validacao.erros / 20), p + 1),
                              )
                            }
                            disabled={paginaAtual >= Math.ceil(validacao.erros / 20)}
                            className="px-3 py-1 rounded border border-red-300 bg-white hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

              {/* Ações */}
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleVoltar}
                  className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Voltar
                </button>
                <button
                  onClick={handleConfirmar}
                  disabled={validacao.erros > 0 || isLoading}
                  className="px-6 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Importando...' : 'Confirmar Importação'}
                </button>
              </div>
            </div>
          )}

          {/* Etapa 4: Importando */}
          {etapa === 'importando' && (
            <div className="py-12 text-center">
              <div className="animate-spin w-16 h-16 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Importando dados...</h3>
              <p className="text-gray-600">Por favor aguarde</p>
            </div>
          )}

          {/* Etapa 5: Concluído */}
          {etapa === 'concluido' && (
            <div className="py-12 text-center">
              <CheckCircle size={64} className="text-green-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Importação Concluída!</h3>
              <p className="text-gray-600 mb-6">Os dados foram importados com sucesso.</p>
              <button
                onClick={onSucesso}
                className="px-6 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
