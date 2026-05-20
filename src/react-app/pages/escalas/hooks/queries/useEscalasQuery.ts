// src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts
//
// BARREL FILE — re-exports all escalas query/mutation hooks and types.
// Split into smaller modules for maintainability:
//   - escalas-types.ts     → Types & interfaces
//   - escalas-infra.ts     → Query keys, fetchApi, mutateApi
//   - useEscalasQueries.ts → All useQuery hooks
//   - useEscalasMutations.ts → All useMutation hooks

export * from './escalas-types';
export * from './escalas-infra';
export * from './useEscalasQueries';
export * from './useEscalasMutations';
