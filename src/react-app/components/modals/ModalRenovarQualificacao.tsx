import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, Calendar, AlertCircle } from 'lucide-react';
import { parseISO, format, isValid } from 'date-fns';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { getDataHojeHTML } from '@/react-app/utils/dateUtils';
import { emitirEventoModulo } from '@/react-app/lib/moduloBus';

interface ModalRenovarQualificacaoProps {
  isOpen: boolean;
  onClose: () => void;
  qualificacao: {
    id: number;
    funcionario_nome: string;
    qualificacao_nome: string;
    qualificacao_codigo: string;
    data_vencimento: string;
    data_realizacao?: string;
  } | null;
  onSuccess: () => void;
}

export function ModalRenovarQualificacao({
  isOpen,
  onClose,
  qualificacao,
  onSuccess,
}: ModalRenovarQualificacaoProps) {
  const [novaDataConclusao, setNovaDataConclusao] = useState('');
  const [observacao, setObservacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const initializedRef = useRef(false);
  const submitInFlightRef = useRef(false);

  useEffect(() => {
    if (isOpen && qualificacao && !initializedRef.current) {
      // Inicializar apenas uma vez quando o modal abre
      setNovaDataConclusao(getDataHojeHTML());
      initializedRef.current = true;
      setErro('');
    } else if (!isOpen) {
      // Resetar quando fecha
      setNovaDataConclusao('');
      setObservacao('');
      setErro('');
      initializedRef.current = false;
      submitInFlightRef.current = false;
    }
  }, [isOpen, qualificacao]);

  const handleConfirmar = async () => {
    if (submitInFlightRef.current) {
      return;
    }

    if (!novaDataConclusao) {
      setErro('Data de conclusão é obrigatória');
      return;
    }
    if (!qualificacao) {
      setErro('Qualificação não encontrada');
      return;
    }

    try {
      submitInFlightRef.current = true;
      setSalvando(true);
      setErro('');

      console.log('[Renovar] Enviando requisição:', {
        id: qualificacao.id,
        nova_data_conclusao: novaDataConclusao,
        observacao: observacao.trim() || undefined,
        url: `${API_BASE_URL}/qualificacoes/historico/${qualificacao.id}/renovar`,
      });

      const response = await fetch(
        `${API_BASE_URL}/qualificacoes/historico/${qualificacao.id}/renovar`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify({
            nova_data_conclusao: novaDataConclusao,
            observacao: observacao.trim() || undefined,
          }),
        },
      );

      console.log('[Renovar] Response status:', response.status);

      const data = await response.json();
      console.log('[Renovar] Response data:', data);

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao renovar qualificação');
      }

      emitirEventoModulo({
        modulo: 'qualificacoes',
        tipo: 'QUALIFICACAO_ATUALIZADA',
      });
      onSuccess();
      onClose();
    } catch (e: unknown) {
      console.error('[Renovar] Erro:', e);
      setErro(e instanceof Error ? e.message : 'Erro ao renovar qualificação');
    } finally {
      submitInFlightRef.current = false;
      setSalvando(false);
    }
  };

  if (!isOpen || !qualificacao) return null;

  // Calcular data máxima (hoje) - formato local sem conversão UTC
  const dataMaxima = getDataHojeHTML();

  // Função auxiliar para formatar datas com segurança
  const formatDate = (dateString: string | undefined | null): string => {
    if (!dateString) return '-';
    try {
      const date = parseISO(dateString);
      if (!isValid(date)) return '-';
      return format(date, 'dd/MM/yyyy');
    } catch {
      return '-';
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <RotateCcw className="w-6 h-6 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold">Renovar Qualificação</h2>
          </div>
          <button
            onClick={onClose}
            disabled={salvando}
            className="p-2 hover:bg-gray-100 rounded-full transition disabled:opacity-50"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-6">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <h3 className="font-medium text-gray-900">Qualificação Atual</h3>
            <p>
              <span className="font-medium">Funcionário:</span> {qualificacao.funcionario_nome}
            </p>
            <p>
              <span className="font-medium">Qualificação:</span> {qualificacao.qualificacao_codigo}{' '}
              - {qualificacao.qualificacao_nome}
            </p>
            <p>
              <span className="font-medium">Data Anterior:</span>{' '}
              {formatDate(qualificacao.data_realizacao)}
            </p>
            <p>
              <span className="font-medium">Vence em:</span>{' '}
              {formatDate(qualificacao.data_vencimento)}
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-blue-800 space-y-1">
                <p className="font-medium mb-1">O que acontecerá:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-700">
                  <li>Registro atual marcado como RENOVADA</li>
                  <li>Nova entrada criada com a nova data de vencimento</li>
                  <li>Histórico preservado via observações</li>
                </ul>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nova Data de Conclusão/Realização *
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="date"
                value={novaDataConclusao}
                onChange={(e) => setNovaDataConclusao(e.target.value)}
                max={dataMaxima}
                disabled={salvando}
                className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${
                  erro ? 'border-red-500' : 'border-gray-300'
                }`}
              />
            </div>
            {erro && (
              <p className="text-red-500 text-sm mt-1 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {erro}
              </p>
            )}
            <p className="text-gray-500 text-xs mt-1">
              A data de vencimento será calculada automaticamente com base na validade da
              qualificação
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Observações</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={salvando}
              rows={3}
              placeholder="Descreva observações da renovação (opcional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
          </div>
        </div>
        <div className="p-6 border-t bg-gray-50">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={onClose}
              disabled={salvando}
              className="w-full sm:w-auto px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={salvando || !novaDataConclusao}
              className="w-full sm:w-auto px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {salvando ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Renovando...
                </>
              ) : (
                <>
                  <RotateCcw className="w-4 h-4" />
                  Confirmar Renovação
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
