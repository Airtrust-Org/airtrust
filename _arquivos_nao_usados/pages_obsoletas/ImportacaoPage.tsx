/**
 * Página de Importação Inteligente - Versão Simplificada
 *
 * Sistema de importação CSV com validação, merge modes e preview de mudanças.
 */

import { useState } from 'react';
import {
  useImportacao,
  type Entidade,
  type MergeMode,
  type ResultadoValidacao,
  type DetalheValidacao,
} from '@/react-app/hooks/useImportacao';
import AppLayout from '@/react-app/components/AppLayout';
import { Card } from '@/react-app/components/UI/Card';
import { Button } from '@/react-app/components/UI/Button';
import { Input } from '@/react-app/components/UI/Input';
import { Badge } from '@/react-app/components/UI/Badge';

export default function ImportacaoPage() {
  const [entidade, setEntidade] = useState<Entidade>('funcionarios');
  const [mergeMode, setMergeMode] = useState<MergeMode>('MESCLAR_INTELIGENTE');
  const [file, setFile] = useState<File | null>(null);
  const [dados, setDados] = useState<Record<string, unknown>[]>([]);
  const [validacao, setValidacao] = useState<ResultadoValidacao | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'completed'>('upload');
  const [activeTab, setActiveTab] = useState<'upload' | 'text'>('upload');
  const [pastedText, setPastedText] = useState('');

  const {
    isLoading,
    progress,
    error,
    parsearArquivo,
    validarDados,
    executarImportacao,
    baixarTemplate,
  } = useImportacao(entidade);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleValidar = async () => {
    if (!file && !pastedText) {
      alert('Selecione um arquivo ou cole os dados CSV');
      return;
    }

    try {
      let dadosParsed: Record<string, unknown>[];

      if (file) {
        dadosParsed = await parsearArquivo(file);
      } else {
        // Criar um arquivo virtual a partir do texto colado
        const blob = new Blob([pastedText], { type: 'text/csv' });
        const virtualFile = new File([blob], 'dados.csv', { type: 'text/csv' });
        dadosParsed = await parsearArquivo(virtualFile);
      }

      setDados(dadosParsed);
      const result = await validarDados(dadosParsed, { modo: mergeMode });

      if (result) {
        setValidacao(result);
        setStep('preview');
      }
    } catch (err) {
      console.error('[VALIDACAO_ERROR]', err);
    }
  };

  const handleExecutar = async () => {
    if (!validacao || !dados.length) return;

    try {
      const success = await executarImportacao(dados, {
        modo: mergeMode,
      });

      if (success) {
        setStep('completed');
      }
    } catch (err) {
      console.error('[EXECUCAO_ERROR]', err);
    }
  };

  const handleReset = () => {
    setFile(null);
    setPastedText('');
    setDados([]);
    setValidacao(null);
    setStep('upload');
    setActiveTab('upload');
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">📥 Importação Inteligente</h1>
          <p className="text-gray-600">
            Importe dados via CSV com validação prévia e controle total
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-4 mb-8">
          <div
            className={`flex items-center gap-2 ${
              step === 'upload' ? 'text-blue-600 font-semibold' : 'text-gray-400'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}
            >
              1
            </div>
            <span>Upload</span>
          </div>
          <span className="text-gray-300">→</span>
          <div
            className={`flex items-center gap-2 ${
              step === 'preview' ? 'text-blue-600 font-semibold' : 'text-gray-400'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}
            >
              2
            </div>
            <span>Preview</span>
          </div>
          <span className="text-gray-300">→</span>
          <div
            className={`flex items-center gap-2 ${
              step === 'completed' ? 'text-green-600 font-semibold' : 'text-gray-400'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center ${
                step === 'completed' ? 'bg-green-600 text-white' : 'bg-gray-200'
              }`}
            >
              ✓
            </div>
            <span>Concluído</span>
          </div>
        </div>

        <Card className="p-6">
          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Seleção de entidade */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Entidade</label>
                  <select
                    value={entidade}
                    onChange={(e) => setEntidade(e.target.value as Entidade)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="funcionarios">Funcionários</option>
                    <option value="qualificacoes_tipos">Tipos de Qualificações</option>
                    <option value="qualificacoes_historico">Histórico de Qualificações</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Modo de Merge</label>
                  <select
                    value={mergeMode}
                    onChange={(e) => setMergeMode(e.target.value as MergeMode)}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    <option value="COMPLETAR">Completar campos vazios</option>
                    <option value="MESCLAR_INTELIGENTE">Mesclar inteligente</option>
                    <option value="SOBRESCREVER">Sobrescrever tudo</option>
                    <option value="PULAR">Pular duplicatas</option>
                  </select>
                </div>
              </div>

              {/* Descrição do modo */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <strong>Modo: {mergeMode}</strong>
                <p className="mt-1 text-gray-700">
                  {mergeMode === 'COMPLETAR' &&
                    'Preenche apenas campos vazios nos registros existentes.'}
                  {mergeMode === 'MESCLAR_INTELIGENTE' &&
                    'Preenche campos vazios e atualiza valores diferentes.'}
                  {mergeMode === 'SOBRESCREVER' &&
                    'Sobrescreve todos os campos dos registros existentes.'}
                  {mergeMode === 'PULAR' && 'Ignora registros que já existem no banco.'}
                </p>
              </div>

              {/* Tabs */}
              <div className="flex border-b mb-4">
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`px-4 py-2 border-b-2 transition-colors ${
                    activeTab === 'upload'
                      ? 'border-blue-600 text-blue-600 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Upload CSV
                </button>
                <button
                  onClick={() => setActiveTab('text')}
                  className={`px-4 py-2 border-b-2 transition-colors ${
                    activeTab === 'text'
                      ? 'border-blue-600 text-blue-600 font-medium'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Colar Texto
                </button>
              </div>

              {activeTab === 'upload' ? (
                <div className="space-y-4">
                  <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} />
                  <Button onClick={() => baixarTemplate()} className="w-full" variant="ghost">
                    📥 Baixar Template
                  </Button>
                </div>
              ) : (
                <textarea
                  placeholder="Cole aqui o conteúdo CSV..."
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value);
                    setFile(null);
                  }}
                  rows={10}
                  className="w-full px-3 py-2 border rounded-md font-mono text-sm"
                />
              )}

              <Button
                onClick={handleValidar}
                disabled={isLoading || (!file && !pastedText)}
                className="w-full"
              >
                {isLoading ? '🔄 Validando...' : '📄 Validar Dados'}
              </Button>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                  ⚠️ {error}
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === 'preview' && validacao && (
            <div className="space-y-6">
              {/* Resumo */}
              <div className="p-4 bg-gray-50 rounded-md">
                <h3 className="font-bold text-lg mb-4">
                  {validacao.erros > 0 ? (
                    <span className="text-red-600">⚠️ Erros Encontrados</span>
                  ) : (
                    <span className="text-green-600">✅ Validação OK</span>
                  )}
                </h3>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold">{validacao.total}</div>
                    <div className="text-sm text-gray-500">Total</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{validacao.criar}</div>
                    <div className="text-sm text-gray-500">Criar</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {validacao.completar + validacao.mesclar}
                    </div>
                    <div className="text-sm text-gray-500">Atualizar</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">{validacao.erros}</div>
                    <div className="text-sm text-gray-500">Erros</div>
                  </div>
                </div>
              </div>

              {/* Tabela de registros */}
              <div className="max-h-96 overflow-y-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">Ação</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validacao.detalhes.map((detalhe: DetalheValidacao, idx: number) => (
                      <tr key={idx} className="border-t">
                        <td className="px-4 py-2">{idx + 1}</td>
                        <td className="px-4 py-2">
                          <Badge
                            variant={
                              detalhe.acao === 'CREATE'
                                ? 'success'
                                : detalhe.acao === 'UPDATE'
                                ? 'warning'
                                : detalhe.acao === 'ERROR'
                                ? 'danger'
                                : 'default'
                            }
                          >
                            {detalhe.acao}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">{detalhe.acao === 'ERROR' ? '❌' : '✅'}</td>
                        <td className="px-4 py-2 text-xs">
                          {detalhe.acao === 'ERROR' && detalhe.mensagem && (
                            <div className="text-red-600">{detalhe.mensagem}</div>
                          )}
                          {detalhe.dados && (
                            <div className="text-gray-600 text-xs">
                              {JSON.stringify(detalhe.dados).substring(0, 100)}...
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Botões */}
              <div className="flex gap-4">
                <Button onClick={handleReset} className="flex-1" variant="ghost">
                  ❌ Cancelar
                </Button>

                <Button
                  onClick={handleExecutar}
                  disabled={isLoading || validacao.erros > 0}
                  className="flex-1"
                  variant="primary"
                >
                  {isLoading ? `🔄 Importando... ${progress}%` : '✅ Executar Importação'}
                </Button>
              </div>

              {isLoading && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* STEP 3: COMPLETED */}
          {step === 'completed' && (
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl">
                  ✅
                </div>
              </div>

              <div>
                <h3 className="text-2xl font-bold text-green-600 mb-2">Importação Concluída!</h3>
                <p className="text-gray-600">Os dados foram importados com sucesso.</p>
              </div>

              {validacao && (
                <div className="p-4 bg-gray-50 rounded-md">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-2xl font-bold text-green-600">{validacao.criar}</div>
                      <div className="text-sm text-gray-500">Criados</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-600">
                        {validacao.completar + validacao.mesclar}
                      </div>
                      <div className="text-sm text-gray-500">Atualizados</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-gray-600">{validacao.pular}</div>
                      <div className="text-sm text-gray-500">Ignorados</div>
                    </div>
                  </div>
                </div>
              )}

              <Button onClick={handleReset} className="w-full">
                🔄 Nova Importação
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
