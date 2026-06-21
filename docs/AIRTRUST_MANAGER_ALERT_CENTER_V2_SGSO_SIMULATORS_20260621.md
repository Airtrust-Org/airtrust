# AIRTRUST_MANAGER_ALERT_CENTER_V2_SGSO_SIMULATORS_20260621

## Objetivo

Evoluir a Central de Alertas do Gestor para incluir sinais operacionais de SGSO e simuladores/fichas sem migration, sem SQL remoto e sem integração SIGVOOS.

## Fontes incluídas

- `GET /api/dashboard/metrics`
- `GET /api/dashboard/alertas-criticos`
- `GET /api/dashboard/frms-alertas`
- `GET /api/frms/operational-snapshot`
- `GET /api/sgso/compliance/rbac121/checklist`
- `GET /api/dashboard/simuladores-alertas`

## Fontes pendentes

- agregação backend mais ampla para simuladores além do resumo operacional;
- validação autenticada ponta a ponta com fixture dedicada;
- parametrização operacional de limiares por tenant para simuladores/SGSO;
- consolidação futura em agregador backend único da Central.

## Alertas SGSO

- relatos SGSO fora do SLA de triagem;
- investigações SGSO fora do prazo;
- barreiras Bowtie degradadas ou inoperantes;
- FRAT de alto risco sem aprovação final;
- ações corretivas SGSO vencidas.

## Alertas simuladores/fichas

- fichas pendentes de avaliação para sessão já iniciada;
- fichas aguardando assinatura;
- sessões próximas com ficha incompleta;
- solicitações de edição de ficha pendentes de revisão.

`FICHA_NOT_AVAILABLE_YET` não é promovida a alerta crítico nesta etapa.

## Priorização

- `CRITICO`: FRMS crítico, SGSO `NAO_CONFORME`, passivos operacionais já vencidos.
- `ATENCAO`: pendências operacionais em curso que exigem acompanhamento do gestor.
- `INFORMATIVO`: filas de revisão e pendências não bloqueantes.

A ordenação continua limitada à janela de maior prioridade da Central.

## Segurança

- sem migration;
- sem SQL remoto;
- sem alteração de banco;
- sem SIGVOOS;
- sem alteração global de RBAC/tenant/auth;
- sem renderização de PII na Home;
- SGSO consumido por fonte agregada;
- simuladores consumidos por resumo agregado tenant-scoped.

## Testes

- `npm run test:run -- src/react-app/pages/funcionarios/__tests__/ManagerAlertCenter.test.tsx`
- `npm run test:run -- src/react-app/pages/funcionarios/__tests__/managerAlertCenter.utils.test.ts`
- `npm run test:worker -- --run dashboard-metrics-integrity`
- `npm run test:run -- --run alert`
- `npm run test:run -- --run sgso simulador ficha dashboard frms`
- `npm run lint`
- `npm run build`

Todos os comandos acima passaram nesta worktree.

## Limitações

- a validação autenticada continua dependente de fixture/sessão disponível;
- a priorização de simuladores usa resumo agregado, não drilldown consolidado;
- ajustes finos de severidade podem exigir parâmetros operacionais por empresa.

## SIGVOOS NO-GO

Nenhuma leitura, escrita ou integração com SIGVOOS foi adicionada nesta macroetapa.

## Próxima macroetapa única

`validação autenticada quando fixture existir`
