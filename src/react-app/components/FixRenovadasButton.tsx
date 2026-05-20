/**
 * ========================================
 * COMPONENTE: Fix Renovadas Button
 * Botão para corrigir lógica de renovadas pós-importação
 * ========================================
 */

import { useState, useTransition } from 'react';
import { api } from '../utils/api-client';

interface FixRenovadasResult {
  success: boolean;
  data?: {
    total_renovadas: number;
    total_vinculadas: number;
    execution_time_ms: number;
  };
  error?: string;
}

interface StatsData {
  total: number;
  renovadas: number;
  vinculadas: number;
  total_funcionarios: number;
  funcionarios_com_renovacao: number;
}

export function FixRenovadasButton() {
  const [showConfirm, setShowConfirm] = useState(false);
  const [result, setResult] = useState<FixRenovadasResult | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isPending, startTransition] = useTransition();

  // Carregar estatísticas ao montar
  useState(() => {
    loadStats();
  });

  const loadStats = async () => {
    try {
      const response = await api.get('/qualificacoes-historico/fix-renovadas/stats');
      if (response.success) {
        setStats(response.data);
      }
    } catch (error) {
      console.error('Erro ao carregar stats:', error);
    }
  };

  const handleExecute = async () => {
    startTransition(async () => {
      try {
        const response = await api.post('/qualificacoes-historico/fix-renovadas', {});
        setResult(response as FixRenovadasResult);
        if (response.success) {
          await loadStats(); // Recarregar stats após sucesso
        }
      } catch (error) {
        setResult({
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
      setShowConfirm(false);
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-3">🔄 Corrigir Lógica de Renovadas</h3>

      <p className="text-sm text-gray-600 mb-4">
        Identifica automaticamente qualificações renovadas após importação de dados e marca
        corretamente o status e vínculo entre registros.
      </p>

      {/* Estatísticas atuais */}
      {stats && (
        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">📊 Status Atual:</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-600">Total de registros:</span>
              <span className="ml-2 font-semibold text-gray-800">{stats.total}</span>
            </div>
            <div>
              <span className="text-gray-600">Marcados como renovadas:</span>
              <span className="ml-2 font-semibold text-purple-600">{stats.renovadas}</span>
            </div>
            <div>
              <span className="text-gray-600">Com vínculo:</span>
              <span className="ml-2 font-semibold text-blue-600">{stats.vinculadas}</span>
            </div>
            <div>
              <span className="text-gray-600">Funcionários:</span>
              <span className="ml-2 font-semibold text-gray-800">
                {stats.funcionarios_com_renovacao} / {stats.total_funcionarios}
              </span>
            </div>
          </div>
        </div>
      )}

      {!showConfirm ? (
        <button
          onClick={() => setShowConfirm(true)}
          disabled={isPending}
          className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Processando...' : 'Executar Correção'}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm font-semibold text-yellow-800 mb-1">⚠️ Esta operação irá:</p>
            <ul className="text-xs text-yellow-700 space-y-1 ml-4">
              <li>
                • Identificar qualificações sequenciais (mesmo funcionário + mesmo tipo de
                qualificação)
              </li>
              <li>• Marcar registros antigos com status "renovada"</li>
              <li>• Vincular registros novos aos antigos via campo renovacao_de</li>
              <li>• Atualizar automaticamente a visualização na tela de histórico</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowConfirm(false)}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
              disabled={isPending}
            >
              Cancelar
            </button>

            <button
              onClick={handleExecute}
              disabled={isPending}
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? (
                <>
                  <span className="inline-block animate-spin mr-2">⚙️</span>
                  Processando...
                </>
              ) : (
                'Confirmar Correção'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Resultado da execução */}
      {result?.success && result.data && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <h4 className="font-semibold text-green-800 mb-2">✅ Correção aplicada com sucesso!</h4>
          <ul className="text-sm text-green-700 space-y-1">
            <li>
              • <strong>{result.data.total_renovadas}</strong> registros marcados como RENOVADA
            </li>
            <li>
              • <strong>{result.data.total_vinculadas}</strong> vínculos criados entre registros
            </li>
            <li>
              • Tempo de execução: <strong>{result.data.execution_time_ms}ms</strong>
            </li>
          </ul>
          <p className="text-xs text-green-600 mt-2">
            💡 Atualize a página de histórico para ver as mudanças
          </p>
        </div>
      )}

      {result?.error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="font-semibold text-red-800 mb-1">❌ Erro ao executar correção</p>
          <p className="text-sm text-red-700">{result.error}</p>
        </div>
      )}
    </div>
  );
}
