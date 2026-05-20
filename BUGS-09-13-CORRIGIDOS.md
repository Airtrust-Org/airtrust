# BUGS 09–13 Corrigidos

## Resumo

Correções aplicadas no fluxo de Escalas e no dashboard de Funcionários para eliminar regressões reais do fluxo de alocação contextual.

## BUG-09 — endpoint `regenerar-eventos` ausente no runtime

**Causa raiz**

- O frontend chamava `POST /api/escalas/:id/tripulacoes/:tripId/regenerar-eventos`.
- A rota existia no router dividido, mas o runtime montado em produção usa `worker-airtrust/src/routes/escalas.ts`.

**Correção**

- Rota reimplementada no router monolítico.
- Fluxo remove eventos `auto_quinzena` antigos e recria VOO/FOL para PIC/SIC.

**Arquivos**

- `worker-airtrust/src/routes/escalas.ts`

## BUG-10 — modal contextual abria vazia

**Causa raiz**

- `GradeGantt` passava o contexto da aeronave.
- `EscalasPage` descartava esse valor ao abrir o modal.
- O modal não possuía prop para pré-seleção da aeronave.

**Correção**

- O payload do modal passou a carregar `aeronaveInicial`.
- O modal faz matching por prefixo, modelo ou descrição completa.
- O título e a mensagem do modal agora indicam o contexto de origem.

**Arquivos**

- `src/react-app/pages/escalas/hooks/useEscalaUIStore.ts`
- `src/react-app/pages/escalas/EscalasPage.tsx`
- `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx`

## BUG-11 — padrões de escala hardcoded

**Diagnóstico final**

- O modal principal já consumia padrões dinâmicos via API.
- A página de configuração também já possuía gerenciamento de templates e tipos de evento.
- O gap real estava na ausência de validação automatizada desse contrato.

**Correção aplicada**

- O smoke test agora valida que `/api/escalas/padroes` retorna padrões dinâmicos antes de criar a tripulação.

**Arquivos**

- `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx`
- `src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx`
- `scripts/smoke-test-alocacao.sh`

## BUG-12 — pilotos S76 apareciam ao selecionar AW139

**Causa raiz**

- O filtro de pilotos aceitava combinações legadas amplas demais em `modelo_aeronave_id`.
- Isso permitia vazamento de pilotos fora do modelo contextual esperado.

**Correção**

- O backend passou a filtrar por labels exatos do modelo/aeronave selecionado.
- A comparação considera `aeronave`, `codigo`, `nome` e `modelo`, sem abrir o filtro para matches ambíguos.

**Arquivos**

- `worker-airtrust/src/routes/escalas.ts`

## BUG-13 — header continuava em `0 eventos`

**Causa raiz**

- O header dependia de `dadosCalendario`.
- As mutations não invalidavam/forçavam refresh do calendário de forma explícita.
- O modal fechava sem sincronização forte do estado da grade.

**Correção**

- Invalidação explícita de `detail`, `calendario` e `conflitos` nas mutations de tripulação.
- Sincronização adicional no `EscalasPage` após salvar.
- Feedback visual durante a atualização da grade.
- Toast com quantidade de eventos automáticos gerados.

**Arquivos**

- `src/react-app/pages/escalas/hooks/queries/useEscalasQuery.ts`
- `src/react-app/pages/escalas/EscalasPage.tsx`
- `src/react-app/pages/escalas/components/EscalaCalendario/GradeGantt.tsx`
- `src/react-app/pages/escalas/components/Modais/ModalAdicionarTripulacao.tsx`

## Gap adicional — dashboard Funcionários x tabela

**Problema**

- O card de aeronaves mostrava total bruto enquanto a tabela padrão exibe ativos.
- Isso gerava discrepância visual como `S76 = 35` no card e `17` na tabela.

**Correção**

- Backend do dashboard normalizado para o mesmo label de aeronave.
- Frontend passou a destacar `ativos` e exibir `total` apenas como apoio.

**Arquivos**

- `worker-airtrust/src/routes/funcionarios.ts`
- `src/react-app/components/funcionarios/DashboardStats.tsx`

## Validação

### Build

- `npm run build` ✅

### Smoke

- Script atualizado para validar:
  - padrões dinâmicos
  - `eventos_gerados` síncronos
  - endpoint `regenerar-eventos`
  - limpeza final
- Execução completa não foi realizada nesta sessão porque `AIRTRUST_SMOKE_EMAIL` e `AIRTRUST_SMOKE_PASSWORD` não estavam definidos no ambiente.

### Sintaxe do smoke

- `bash -n scripts/smoke-test-alocacao.sh` ✅
