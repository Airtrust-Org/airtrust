// src/react-app/pages/escalas/hooks/useEscalaConfigStore.ts
//
// Store de CONFIGURAÇÃO do módulo de escalas.
// Separada do store de UI para minimizar rerenders.
// Persiste via localStorage (será migrado para DB em FUNC-05).

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

export type TipoEvento =
  | 'voo'
  | 'viagem'
  | 'treinamento_solo'
  | 'treinamento_simulador'
  | 'medico'
  | 'cheque'
  | 'reaquisi'
  | 'trabalho'
  | 'folga'
  | 'standby'
  | 'ferias'
  | 'licenca';

interface EventoConfig {
  cor?: string;
  label?: string;
  ativoDropdown?: boolean;
}

interface EscalaConfigStore {
  /** Overrides de cor/label por tipo (localStorage → migrar para DB) */
  eventoConfigOverrides: Partial<Record<TipoEvento, EventoConfig>>;
  setEventoConfigOverride: (tipo: TipoEvento, patch: EventoConfig) => void;
  resetEventoConfigOverrides: () => void;

  /** Exibir nome completo ou nome de guerra */
  exibirNome: 'completo' | 'guerra';
  setExibirNome: (v: 'completo' | 'guerra') => void;

  /** Painel de alertas CMA minimizado */
  alertasCMAMinimizados: boolean;
  toggleAlertasCMA: () => void;
}

export const useEscalaConfigStore = create<EscalaConfigStore>()(
  devtools(
    persist(
      (set) => ({
        eventoConfigOverrides: {},
        setEventoConfigOverride: (tipo, patch) =>
          set((s) => ({
            eventoConfigOverrides: {
              ...s.eventoConfigOverrides,
              [tipo]: { ...s.eventoConfigOverrides[tipo], ...patch },
            },
          })),
        resetEventoConfigOverrides: () => set({ eventoConfigOverrides: {} }),

        exibirNome: 'guerra',
        setExibirNome: (v) => set({ exibirNome: v }),

        alertasCMAMinimizados: false,
        toggleAlertasCMA: () => set((s) => ({ alertasCMAMinimizados: !s.alertasCMAMinimizados })),
      }),
      {
        name: 'escala-config-v2',
        // Migração: importar valores legados se existirem
        migrate: (persisted, version) => {
          const old = persisted as EscalaConfigStore;
          // v0→v1: importar overrides legados
          if (version === 0 && !old.eventoConfigOverrides) {
            try {
              const legacy = JSON.parse(
                localStorage.getItem('escala-evento-config-overrides') || '{}',
              );
              const exibirNomeLegacy = localStorage.getItem('escala-exibir-nome');
              return {
                ...old,
                eventoConfigOverrides: legacy,
                exibirNome: exibirNomeLegacy === 'guerra' ? 'guerra' : (old.exibirNome ?? 'guerra'),
              };
            } catch {
              return old;
            }
          }
          // v1→v2: mudar default de exibirNome para 'guerra'
          if (version === 1) {
            return {
              ...old,
              exibirNome: old.exibirNome === 'completo' ? 'guerra' : old.exibirNome,
            };
          }
          return old;
        },
        version: 2,
      },
    ),
    { name: 'escala-config-store' },
  ),
);
