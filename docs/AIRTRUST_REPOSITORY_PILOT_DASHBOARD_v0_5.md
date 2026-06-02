# AirTrust Repository Pilot Dashboard v0.5

Data: 2026-06-02

## 1. Objetivo

Criar um primeiro repository read-only para reduzir SQL espalhado em `dashboardService`, sem alterar contrato publico, tenant-scope ou status compatibility.

## 2. Por que dashboard foi escolhido

- Ja existiam funcoes read-only dedicadas para metricas executivas.
- O dominio ja tinha testes de tenant-scope e compatibilidade de status.
- O risco era controlado porque as rotas publicas podiam permanecer intactas.
- O piloto podia ficar reversivel com poucos arquivos runtime.

## 3. Metricas migradas para repository

- `getTaxaConclusaoMensal`
- `getUtilizacaoSimuladores`

As queries foram movidas para `worker-airtrust/src/repositories/dashboardMetricsRepository.ts` e o service permaneceu responsavel apenas por mapear o DTO interno para o shape publico atual.

## 4. Metricas nao migradas e motivo

- `getDashboardMetrics`: agrega multiplas queries e mistura dashboard executivo com LMS e qualificacoes; mover tudo neste sprint aumentaria demais a superficie.
- `getDashboardAlerts`: depende de calculo dinamico de vencimento e fallbacks opcionais de LMS.
- `getComplianceScore`: mistura regras de compliance, comparacao com periodo anterior e calculos mais sensiveis.
- `getDemandaTreinamento`: possui mais de uma query e combinacoes de status planejado/agendado.
- `getAtividadesRecentes`: nao e metrica executiva principal e o contrato de erro foi endurecido recentemente.
- `getSystemHealth`: nao e metrica de negocio do dashboard e nao depende de tenant-scope.

## 5. Contratos preservados

- Nenhuma rota publica foi alterada.
- `GET /api/dashboard/taxa-conclusao-mensal` continua retornando `{ meses, taxas, meta }`.
- `GET /api/dashboard/utilizacao-simuladores` continua retornando `{ simuladores }`.
- O tratamento de fallback em erro no service foi mantido.

## 6. Regras de tenant-scope

- O repository recebe `empresaId` explicitamente.
- O repository falha fechado quando `empresaId` nao e inteiro positivo.
- Nenhuma funcao de repository le tenant de contexto implicito.
- As queries preservam `empresa_id = ?` em todos os pontos relevantes.

## 7. Regras de status compatibility

- Taxa de conclusao mensal continua contando `CONCLUIDA` e `CONCLUIDO`.
- Utilizacao de simuladores continua contando apenas status ativos/concluidos compativeis definidos no helper central.
- Status cancelados continuam fora da utilizacao de simuladores.
- Soft-delete continua preservado nos filtros.

## 8. Testes adicionados

- `worker-airtrust/src/__tests__/repositories/dashboardMetricsRepository.test.ts`
- `worker-airtrust/src/__tests__/services/dashboardService.repository-contract.test.ts`

Cobertura nova:

- repository exige `empresaId` explicito;
- tenant-scope e soft-delete permanecem nos SQLs extraidos;
- status compatibility permanece nos SQLs extraidos;
- service continua retornando o mesmo shape publico;
- fallback vazio do service em erro de taxa mensal foi preservado.

## 9. Criterio para expandir repository pattern

- escolher apenas funcoes read-only com tenant-scope explicito;
- exigir cobertura de contrato antes da extracao;
- mover primeiro queries com status centralizado ou comportamento ja caracterizado;
- evitar agregados muito grandes ou com regras ambiguas no mesmo sprint.

## 10. O que nao deve ser feito

- Nao mover auth, tenant middleware ou RBAC para dentro do repository.
- Nao criar abstracao generica para todos os services.
- Nao misturar read-model com mutation.
- Nao alterar shape de resposta das rotas publicas.
- Nao introduzir SQL concatenado com input nao parametrizado.
- Nao usar este piloto para justificar refatoracao ampla do dashboard inteiro sem testes equivalentes.
