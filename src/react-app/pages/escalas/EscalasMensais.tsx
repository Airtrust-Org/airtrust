/**
 * EscalasMensais — Re-export para compatibilidade com App.tsx
 *
 * O módulo foi refatorado para EscalasPage com arquitetura de componentes:
 *   components/EscalaCalendario/ — Grade Gantt + Células + Alertas
 *   components/Paineis/         — Tripulações, Estatísticas, Legenda
 *   components/Modais/          — Criar, Tripulação, Evento, Conflitos
 *   hooks/useEscalaStore.ts     — Zustand store centralizado
 *   hooks/queries/              — Wrappers sobre useApi com tipos completos
 */

export { default } from './EscalasPage';
