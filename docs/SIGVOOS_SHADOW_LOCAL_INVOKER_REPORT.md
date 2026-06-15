# SIGVOOS Shadow Local Invoker Report

## Veredito

`SHADOW LOCAL INVOKER OK`

## Arquivos alterados

- `worker-airtrust/src/services/controle-voos/sigvoos-shadow-local-invoker.ts`
- `worker-airtrust/src/__tests__/services/controle-voos-sigvoos-shadow-local-invoker.test.ts`
- `docs/SIGVOOS_SHADOW_LOCAL_INVOKER_REPORT.md`

## Contrato do invocador

O invocador `invokeSigvoosShadowLocal`:

- recebe lista de entradas locais com caminhos JSON permitidos, payloads inline ou objetos embrulhados com metadados opcionais;
- rejeita URLs externas (`http://`, `https://` e demais esquemas `://`);
- restringe caminhos locais ao diretório de fixtures/testes por padrão;
- só permite caminho externo com `allowUnsafeLocalPathForDevOnly: true`;
- carrega JSON local e delega o processamento para `runSigvoosImporterBatch`;
- retorna relatório estruturado com:
  - `mode: 'LOCAL_SHADOW'`
  - `totalFiles`
  - `loadedFiles`
  - `failedFiles`
  - `runnerSummary`
  - `fileResults[]`
  - `warnings[]`
  - `startedAt`
  - `finishedAt`

## Proteções contra API real e superfície sensível

Confirmado nesta fase:

- sem `fetch`;
- sem leitura de `env`;
- sem credenciais SIGVOOS;
- sem endpoint HTTP público;
- sem uso de D1 remoto;
- sem deploy;
- sem Cloudflare, R2 ou secrets;
- sem alteração de `frms-source-policy.ts`;
- sem escrita em FRMS canônico;
- sem alterações em staging ou produção;
- sem alterações nas migrations `0410` e `0411`.

## Proteções contra caminho inseguro

- URL externa é rejeitada antes de qualquer leitura.
- Caminho fora de `worker-airtrust/src/__tests__/fixtures/` é rejeitado por padrão.
- O bypass só existe com a flag explícita `allowUnsafeLocalPathForDevOnly`.
- JSON inválido gera falha controlada em `warnings[]` e não dispara rede.

## Testes executados

- `cd worker-airtrust && npx vitest run src/__tests__/services/controle-voos-sigvoos-shadow-local-invoker.test.ts`
- `cd worker-airtrust && npx vitest run src/__tests__/services/controle-voos-sigvoos-importer-runner.test.ts`
- `cd worker-airtrust && npx vitest run src/__tests__/services/controle-voos-sigvoos-importer.test.ts`
- `cd worker-airtrust && npx vitest run src/__tests__/migrations/controle-voos-sigvoos-integration-0411-schema.test.ts`
- `npx tsc --noEmit --pretty false`
- `npm run build`
- `git diff --check`
- `bash scripts/check-tracked-secrets.sh`
- `bash scripts/validation/audit-deploy-scripts.sh`
- `bash scripts/audit-dangerous-ops.sh`

## Observações de validação

- `scripts/validation/audit-deploy-scripts.sh` passou como auditoria/inventário e continuou listando referências históricas já rastreadas a `migrations apply`.
- `scripts/audit-dangerous-ops.sh` retornou `RESULT: PASS` com um warning já existente sobre scripts remotos que exigem revisão manual.

## Confirmações de não execução sensível

- nenhuma API real SIGVOOS foi chamada;
- nenhuma migration foi aplicada em staging;
- nenhuma migration foi aplicada em produção;
- nenhum deploy foi executado;
- nenhum D1 remoto foi executado;
- staging/produção permaneceram intocados;
- nenhum fluxo FRMS foi tocado;
- nenhum dado real foi introduzido em fixtures.

## Próxima recomendação

Usar este invocador apenas em shadow mode local com fixtures sintéticas ou payloads locais controlados. Se a próxima etapa exigir API real SIGVOOS, D1 remoto, staging, produção, secrets, FRMS canônico ou mudança de RBAC real, o status deve mudar para:

`BLOQUEADO — REQUER FASE SENSÍVEL`
