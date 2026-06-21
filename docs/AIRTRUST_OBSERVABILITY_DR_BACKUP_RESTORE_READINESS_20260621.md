# AIRTRUST_OBSERVABILITY_DR_BACKUP_RESTORE_READINESS_20260621

Data: 2026-06-21
Base auditada: `origin/main` em `3b5228b2`
Contexto de execucao original: worktree temporaria local dedicada a esta macroetapa
Modo: macroetapa unica, sem deploy, sem migration, sem SQL remoto de escrita, sem alteracao de D1/R2 e sem restore real.

## Objetivo

Responder, com base no repositorio e nos artefatos locais existentes:

> Se algo quebrar em producao, conseguimos detectar, diagnosticar, restaurar e explicar o que aconteceu sem improviso?

Resposta curta em 2026-06-21:

- deteccao publica basica: sim;
- diagnostico seguro por versao/request: parcial;
- rollback de aplicacao: parcial, com caminho documentavel;
- restore/DR validado em ambiente seguro: parcial;
- prontidao comercial para sair de PILOTO CONTROLADO: ainda nao.

## Estado confirmado

- `origin/main` contem o merge do PR #117 em `3b5228b2`.
- O contexto informado bate com a arvore auditada: sem migration nova nesta macroetapa e sem alteracao de banco.
- O worker expoe `/api/health`, `/api/version` e `/api/status` com no-cache em [worker-airtrust/src/routes/system.ts](../worker-airtrust/src/routes/system.ts).
- O worker aplica `X-Request-ID` via [worker-airtrust/src/middleware/requestId.ts](../worker-airtrust/src/middleware/requestId.ts) e retorna `requestId` em erros via [worker-airtrust/src/middleware/error-handler.ts](../worker-airtrust/src/middleware/error-handler.ts).
- O backend ja persiste `correlation_id` em fluxos especificos de auditoria/control support, mas isso ainda nao virou padrao operacional unico.
- O backend possui servicos e rotas versionadas para backup e restore em [worker-airtrust/src/routes/backup.ts](../worker-airtrust/src/routes/backup.ts), [worker-airtrust/src/services/backup/orchestrator.ts](../worker-airtrust/src/services/backup/orchestrator.ts) e [worker-airtrust/src/services/backup/restore.ts](../worker-airtrust/src/services/backup/restore.ts).
- Existe evidencia local de drill D1 em `docs/d1-rollback-drill/`, mas ela e local/documental, nao prova restore remoto controlado.
- Validacao autenticada e cross-tenant continua bloqueada por falta de fixture autorizada.
- SIGVOOS permanece NO-GO nesta macroetapa.

## Observabilidade

### O que ja existe

- health/version/status publicos com contrato consistente e no-cache;
- `X-Request-ID` em requests e respostas de erro;
- `correlation_id` aparece em alguns fluxos controlados, mas nao em cobertura operacional uniforme;
- `X-AirTrust-Version` no middleware global em [worker-airtrust/src/index.ts](../worker-airtrust/src/index.ts);
- telemetria de erro do frontend em `POST /api/telemetry/client-error`;
- evidencias recentes de release em `docs/AIRTRUST_PR117_MANAGER_ALERT_CENTER_V2_DEPLOY_VALIDATION_20260621.md`.

### Lacunas

- o header `X-AirTrust-Version` hoje usa `cf.colo` no middleware global, o que nao representa versao real de deploy; a versao canonica confiavel esta em `/api/version` e `/api/health`;
- nao existe trilha estruturada e padronizada de erro por tenant para todo o app; ha sinais pontuais em auditoria, `requestId`, `correlation_id` e platform support, mas nao uma camada unica de observabilidade operacional;
- o script [scripts/analyze-logs.sh](../scripts/analyze-logs.sh) estava consumindo `wrangler tail` sem gate proprio e repassando campos brutos de log; isso foi endurecido nesta macroetapa para exigir gate operacional e suprimir `userEmail`, `message` e `error` brutos por padrao;
- nao ha fixture autenticada aprovada para validar negativamente isolamento cross-tenant ponta a ponta.

### Leitura operacional

- detectar indisponibilidade publica: pronto;
- correlacionar incidente por `requestId`: parcialmente pronto;
- explicar falha tenant-specific sem improviso: ainda parcial.

## Backup

### O que ja existe

- cron de backup diario/semanal/mensal em [worker-airtrust/src/cron/scheduled-handler.ts](../worker-airtrust/src/cron/scheduled-handler.ts);
- orquestracao com checksum/manifest no R2 em [worker-airtrust/src/services/backup/orchestrator.ts](../worker-airtrust/src/services/backup/orchestrator.ts);
- manifesto e evidencias locais em `docs/production-backup/` e `docs/backup-readiness/`;
- script legado remoto [scripts/backup_d1_to_r2.sh](../scripts/backup_d1_to_r2.sh) ja bloqueado por fail-closed.

### Lacunas

- o script [scripts/backup-database.sh](../scripts/backup-database.sh) e historico, mistura fluxos, tem limpeza final inconsistente e nao deve ser tratado como runbook canonico;
- nao ha um runbook unico e curto dizendo onde estao os artefatos esperados, qual checksum verificar e quais pre-checks fazer antes de confiar no backup;
- evidencia de periodicidade existe no codigo, mas a macroetapa nao pode provar execucao remota atual sem entrar em producao.

## Restore e DR

### O que ja existe

- `RestoreService` e endpoint de restore versionados;
- evidencias locais do drill D1 em `docs/d1-rollback-drill/`;
- planos de rollback controlado em `docs/controlled-execution/`.

### Lacunas

- o `RestoreService` faz `INSERT OR REPLACE` em lote direto no D1 e nao e um runbook seguro por si so para producao; ele precisa de janela controlada, snapshot aprovado, pre-checks e pos-checks;
- nao existe prova nesta macroetapa de restore remoto aprovado em staging gerenciado;
- faltam criterios consolidados de GO/NO-GO e comunicacao em um runbook unico.

## Rollback

### O que ja existe

- gates fortes para deploy e migration em [scripts/deploy-worker-only.sh](../scripts/deploy-worker-only.sh) e [scripts/deploy-worker-safe.sh](../scripts/deploy-worker-safe.sh);
- pipeline e guardas descritos em [DEPLOYMENT_AND_DEVOPS.md](../DEPLOYMENT_AND_DEVOPS.md);
- sem migration no PR #117, entao rollback de codigo para essa linha continua teoricamente reversivel sem rollback de schema.

### Lacunas

- nao ha runbook curto e operacional separando rollback de Worker, rollback de Pages e fallback da Central/FRMS;
- o frontend e o worker nao publicam uma fonte unica, pronta para operador, com paridade de versao backend/frontend apos incidente;
- PRs 109, 110, 112 e 115 nao tinham relatorios locais dedicados com esse identificador; a auditoria usou `git log`, docs recentes e o contexto atual.

## Readiness comercial

### Ainda falta antes de nova empresa real

- smoke autenticado com fixture autorizada;
- validacao negativa cross-tenant autenticada;
- drill de restore aprovado em staging/local com checklist unico;
- consolidacao de rollback operacional Worker/Pages;
- clarificacao de ownership operacional para incidentes na Central/FRMS.

### Ainda falta para sair de PILOTO CONTROLADO

- evidenciar DR executado em ambiente seguro e repetivel;
- reduzir ambiguidade de observabilidade por tenant;
- fechar a lacuna de fixture autenticada;
- consolidar backup canonico e desqualificar scripts legados ambiguos.

## Entregas desta macroetapa

- hardening do script de logs de producao para gate explicito e saida sem PII por padrao;
- script read-only de inventario: [scripts/audit-observability-dr-readiness.sh](../scripts/audit-observability-dr-readiness.sh);
- runbook de restore drill seguro: [docs/operational-hardening/AIRTRUST_RESTORE_DRILL_RUNBOOK_20260621.md](operational-hardening/AIRTRUST_RESTORE_DRILL_RUNBOOK_20260621.md);
- runbook de rollback de aplicacao: [docs/operational-hardening/AIRTRUST_ROLLBACK_RUNBOOK_20260621.md](operational-hardening/AIRTRUST_ROLLBACK_RUNBOOK_20260621.md).

## Veredito

Status final: `PARCIALMENTE PRONTO COM RESSALVAS`.

O AirTrust ja consegue detectar falhas publicas, identificar versao backend e operar com gates fortes contra deploy/migration acidental. Ainda nao ha evidencia suficiente para afirmar prontidao completa de restore/DR multiempresa sem improviso, principalmente por tres motivos:

1. falta fixture autenticada para validacao operacional real;
2. falta drill de restore aprovado em ambiente seguro com checklist canonico;
3. a observabilidade por tenant/request ainda e suficiente para investigacao basica, mas nao esta consolidada em uma camada operacional unica.
