# AirTrust Dashboard & Metrics Integrity Audit v0.5

Data: 2026-06-01
Branch: main
Base analisada: 2128a50ff76a5b6264d1c3f4544c2c0fe15aa922

## 1) Métricas auditadas

- Dashboard executivo (`/api/dashboard/metrics`)
- Taxa de conclusão mensal (`/api/dashboard/taxa-conclusao-mensal`)
- Utilização de simuladores (`/api/dashboard/utilizacao-simuladores`)
- Sinais de integridade relacionados: sessões concluídas e horas programadas

## 2) Regras de contagem consolidadas

- Escopo por tenant obrigatório (`empresa_id = ?`).
- Exclusão de soft delete (`deleted_at IS NULL`).
- Sessões concluídas aceitam status operacional atual e legado:
  - `CONCLUIDA`
  - `CONCLUIDO`
- Utilização considera apenas sessões ativas/concluídas:
  - `AGENDADO`, `CONCLUIDA`, `CONCLUIDO`
  - `CANCELADA` permanece fora por não pertencer ao conjunto de status contabilizado.

## 3) Bugs confirmados

1. `getTaxaConclusaoMensal` sem filtro de tenant.
2. `getUtilizacaoSimuladores` sem filtro de tenant (simuladores e agendamentos).
3. Rotas de dashboard não propagavam `empresaId` para essas duas funções.
4. Contagem de sessão concluída usando apenas `CONCLUIDO`, enquanto fluxo atual registra `CONCLUIDA`.

## 4) Correções aplicadas

- `worker-airtrust/src/services/dashboardService.ts`
  - `getTaxaConclusaoMensal(db, empresaId)` agora filtra tenant.
  - `getUtilizacaoSimuladores(db, empresaId)` agora filtra tenant em `simuladores` e `simulador_agendamentos`.
  - Métricas de conclusão em dashboard passaram a considerar `CONCLUIDA` + `CONCLUIDO`.
- `worker-airtrust/src/routes/dashboard.ts`
  - `/taxa-conclusao-mensal` e `/utilizacao-simuladores` agora propagam `empresaId` via `getTenantContext`.

## 5) Testes criados

- `worker-airtrust/src/__tests__/routes/dashboard-metrics-integrity.test.ts`
  - Garante propagação de tenant nas duas rotas críticas.
- `worker-airtrust/src/__tests__/services/dashboard-metrics-integrity.test.ts`
  - Garante presença de tenant, soft-delete e regra de status nas queries.

## 6) Pendências

- Nenhuma pendência técnica bloqueante identificada para estas duas métricas críticas.
- Outras métricas de módulos adjacentes (fora do endpoint de dashboard executivo) seguem cobertas por suites específicas já existentes.
