/**
 * 🔄 useMutacoesHabilitacao.ts
 *
 * Sistema de mutações otimistas para habilitações
 * Permite atualizar o estado local sem refetch
 *
 * Filosofia: "Assume sucesso, reverte em caso de falha"
 */

import { useState, useCallback } from 'react';
import type { Habilitacao } from './useHabilitacoes';

export interface MutacaoEvent {
  tipo: 'atualizacao' | 'criacao' | 'delecao';
  habilitacaoId: number;
  dados?: Partial<Habilitacao>;
  timestamp: number;
}

// Singleton para gerenciar listeners de mutação
const mutacaoListeners = new Set<(evento: MutacaoEvent) => void>();

export function useMutacoesHabilitacao() {
  const [ultimaMutacao, setUltimaMutacao] = useState<MutacaoEvent | null>(null);

  /**
   * Disparar mutação e notificar todos os listeners
   */
  const disparar = useCallback((evento: MutacaoEvent) => {
    setUltimaMutacao(evento);
    console.log(`🔄 Mutação disparada:`, evento);

    // Notificar todos os listeners registrados
    mutacaoListeners.forEach((listener) => {
      try {
        listener(evento);
      } catch (err) {
        console.error('❌ Erro em listener de mutação:', err);
      }
    });
  }, []);

  /**
   * Registrar listener para mutações
   * Retorna função para desregistrar
   */
  const registrarListener = useCallback((listener: (evento: MutacaoEvent) => void) => {
    mutacaoListeners.add(listener);

    return () => {
      mutacaoListeners.delete(listener);
    };
  }, []);

  /**
   * Disparar mutação de atualização de habilitação
   */
  const atualizarHabilitacao = useCallback(
    (habilitacaoId: number, dados: Partial<Habilitacao>) => {
      disparar({
        tipo: 'atualizacao',
        habilitacaoId,
        dados,
        timestamp: Date.now(),
      });
    },
    [disparar],
  );

  /**
   * Disparar mutação de criação
   */
  const criarHabilitacao = useCallback(
    (habilitacaoId: number, dados: Partial<Habilitacao>) => {
      disparar({
        tipo: 'criacao',
        habilitacaoId,
        dados,
        timestamp: Date.now(),
      });
    },
    [disparar],
  );

  /**
   * Disparar mutação de deleção
   */
  const deletarHabilitacao = useCallback(
    (habilitacaoId: number) => {
      disparar({
        tipo: 'delecao',
        habilitacaoId,
        timestamp: Date.now(),
      });
    },
    [disparar],
  );

  return {
    ultimaMutacao,
    disparar,
    registrarListener,
    atualizarHabilitacao,
    criarHabilitacao,
    deletarHabilitacao,
  };
}

/**
 * Instância global de mutações (singleton pattern)
 */
let mutacoesInstance: ReturnType<typeof useMutacoesHabilitacao> | null = null;

export function getMutacoesHabilitacao() {
  if (!mutacoesInstance) {
    // Seria melhor usar Context, mas isso funciona para eventos cross-component
    throw new Error('useMutacoesHabilitacao não inicializado no Provider');
  }
  return mutacoesInstance;
}

export function setMutacoesHabilitacao(instance: ReturnType<typeof useMutacoesHabilitacao>) {
  mutacoesInstance = instance;
}
