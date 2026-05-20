# Tratamento padronizado de erros via `useHandleApiError` + toasts.

## Arquitetura Atual

```
components/
  modals/ModalAtribuirQualificacao.tsx   <- único modal cascade
services/
  apiClient.ts                          <- fetch com retry e formato {success,data,error}
  qualificacoesService.ts               <- operações de domínio
schemas/
  qualificacoes.ts                      <- Zod schemas
hooks/qualificacoes/
  useFuncionariosAtivos.ts              <- cache 5min
  useTiposQualificacao.ts               <- cache 10min
utils/handleApiError.ts                 <- toast erros
```

## Padrões de Resposta

- Sempre `{ success, data?, error?, code? }`.
- Erros de validação convertidos em string concatenada.

## Convenções

- `data_conclusao` é a fonte para cálculo de `data_vencimento`.
- `validade_meses` controla auto cálculo; ausência => campo manual.
- `defaultFuncionarioId` permite contexto (ex: agendamento simulador).

## Extensões Futuras (Sugestões)

1. Adicionar React Query Devtools somente em dev.
2. Cache persistente (localStorage) para tipos se o volume crescer.
3. Upload de certificado direto no modal (drag & drop) com pre-validação.
4. Otimizar bundle: lazy load modal de qualificação somente quando aberto.
5. Métrica de telemetria: tempo entre abertura e salvamento.

## Testes

- `__tests__/qualificacoesService.test.ts` valida schema principal.
- Recomenda-se adicionar testes para cálculo de vencimento edge cases.

## Boas Práticas

- Evitar múltiplos modais para o mesmo domínio.
- Reutilizar React Query para consistência e evitar race conditions.
- Em novos endpoints, criar schema Zod primeiro.

## Próximos Passos Recomendados

- Expandir testes (renovação, exclusão, erro de rede retry).
- Padronizar mais modais para o mesmo formato de API (licenças, treinamentos).

---

Documentação gerada automaticamente em 22/11/2025.
Qualificações - Otimização & Padronização

## Objetivos Alcançados

- Unificação total de criação/edição de histórico via `ModalAtribuirQualificacao`.
- Remoção de wrappers legados (`ModalQualificacao`, `ModalNovaQualificacao`, `ModalVincularQualificacao`).
- Validação forte com Zod (`schemas/qualificacoes.ts`).
- Service layer (`services/qualificacoesService.ts`) + `apiClient` com retry.
- Cache e reuso com React Query (`useFuncionariosAtivos`, `useTiposQualificacao`, `useHistoricoQualificacoes`).
- **Backend corrigido**: Endpoints POST/PUT/GET/DELETE sem status column (view-derived).
- **Schemas alinhados**: IDs como number, campos legados populados automaticamente (tipo_codigo, categoria).
- **Testes completos executados**: CRUD + validações + edge cases + persistência de dados confirmada.
- **Hook de Histórico**: Implementado `useHistoricoQualificacoes` com suporte a paginação e filtros.
