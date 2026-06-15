# SIGVOOS Schema Local Persistent Report

**Veredito:** `SCHEMA LOCAL PERSISTENTE OK`

Data: 2026-06-15
Branch local: `codex/sigvoos-schema-local-persistent`
Base validada: `966957d2`

## 1. Escopo confirmado

- Execucao restrita a D1 local persistente em `worker-airtrust/.wrangler/state/...`.
- Nenhum comando usou `--remote`.
- Nenhum comando usou `--env staging`.
- Nenhum comando usou `--env production`.
- Nenhum deploy foi executado.
- Nenhuma API real SIGVOOS foi chamada.
- Nenhuma credencial SIGVOOS foi usada.
- Nenhum secret real foi usado.
- FRMS canonicamente intocado; contagens de `frms_jornada` e `frms_alerta` ficaram estaveis.
- `frms-source-policy.ts` nao foi importado nem invocado.

## 2. Comandos locais executados

```bash
git fetch origin --prune
git checkout main
git pull --ff-only origin main
git checkout -b codex/sigvoos-schema-local-persistent

npx wrangler d1 execute airtrust-db-local --config worker-airtrust/wrangler.dev.toml --local --file scripts/schema-local.sql
npx wrangler d1 execute airtrust-db-local --config worker-airtrust/wrangler.dev.toml --local --file worker-airtrust/migrations/0410_controle_voos_n1_schema.sql
npx wrangler d1 execute airtrust-db-local --config worker-airtrust/wrangler.dev.toml --local --file worker-airtrust/migrations/0411_controle_voos_sigvoos_integration_schema.sql
sqlite3 worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite < scripts/seed-local-controle-voos.sql
sqlite3 worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
  "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0410_controle_voos_n1_schema.sql');"
sqlite3 worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
  "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0411_controle_voos_sigvoos_integration_schema.sql');"

# Complementos locais sinteticos para fixtures
sqlite3 worker-airtrust/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite
  "INSERT OR IGNORE INTO funcionarios (...) VALUES (6001...6004 tenant 6, 7001 tenant 7)"

# Validacoes e consultas sqlite3 locais
# Invoker/importer executados via adaptador D1 local sobre o sqlite persistente

cd worker-airtrust && npx vitest run src/__tests__/services/controle-voos-sigvoos-shadow-local-invoker.test.ts
cd worker-airtrust && npx vitest run src/__tests__/services/controle-voos-sigvoos-importer-runner.test.ts
cd worker-airtrust && npx vitest run src/__tests__/services/controle-voos-sigvoos-importer.test.ts
cd worker-airtrust && npx vitest run src/__tests__/migrations/controle-voos-sigvoos-integration-0411-schema.test.ts
npx tsc --noEmit --pretty false
npm run build
git diff --check
bash scripts/check-tracked-secrets.sh
bash scripts/validation/audit-deploy-scripts.sh
bash scripts/audit-dangerous-ops.sh
```

Snapshot local criado antes do reset:

```text
/tmp/airtrust-sigvoos-schema-local-persistent-20260615T214652Z
```

## 3. Estruturas 0410 validadas

- Tabelas N1 `cv_*` presentes em D1 local persistente.
- Seeds locais sinteticas carregadas para `empresa_id` 1 e 6.
- Dados manuais preservados:
  - `cv_voos` tenant 6 manual: `62401`, `62402`
  - `origem_importacao = 'MANUAL'`
  - `sigvoos_flight_report_id IS NULL` em multiplos voos manuais
- Nenhum `DROP` destrutivo apareceu nas migrations 0410/0411.
- Nenhum dado real foi inserido por 0410/0411.

Evidencias:

- `cv_*` tables: 11
- `idx_cv_*` indices: 49
- `trg_cv_*` triggers: 18
- `d1_migrations` contem `0410_controle_voos_n1_schema.sql`

## 4. Estruturas 0411 validadas

- `cv_voo_etapas` existe.
- `cv_sigvoos_staging` existe.
- `cv_conflitos_integracao` existe.
- Colunas SIGVOOS em `cv_voos` presentes:
  - `sigvoos_flight_report_id`
  - `sigvoos_flight_report_id_confident`
  - `sigvoos_report_number`
  - `sigvoos_flight_number`
  - `sigvoos_client_name`
  - `sigvoos_contract_name`
  - `sigvoos_importado_em`
  - `sigvoos_content_hash`
  - `origem_importacao`
  - `campos_editados_json`
- Colunas SIGVOOS em `cv_voo_tripulantes` presentes:
  - `etapa_id`
  - `sigvoos_staff_id`
  - `sigvoos_staff_inscription`
  - `funcao_origem`
  - `resolucao_funcionario_fonte`
  - `sigvoos_content_hash`
- Indices parciais presentes em staging e voos.
- Triggers de tenant isolation presentes e ativas.
- `d1_migrations` contem `0411_controle_voos_sigvoos_integration_schema.sql`

## 5. Aditividade, idempotencia e isolamento

### Aditividade

- Voos manuais seed do tenant 6 permaneceram manuais:
  - `62401`, `62402` com `origem_importacao = 'MANUAL'`
- Voo manual sintetico `96501` (`ATX7001`) foi enriquecido por SIGVOOS sem duplicar voo.
- Multiplos `sigvoos_flight_report_id NULL` permaneceram permitidos.

### Idempotencia

- Primeira rodada dos 9 cenarios locais:
  - 5 payloads processados de imediato
  - 1 conflito esperado (`staff.id` vs `inscription`)
  - 4 payloads inicialmente barrados por catalogo local incompleto (`SBMI`)
- Apos complemento sintetico do seed local (`SBMI` tenant 6/7), os 4 cenarios restantes foram reexecutados:
  - 4/4 payloads carregados
  - 4/4 payloads sem falha de infra
  - 3 registros processados
  - 1 conflito esperado (`sem canac` / funcionario nao resolvido)
- Segunda execucao das duas rodadas:
  - rodada 1: `reusedPayloads = 5`
  - rodada complementar: `reusedPayloads = 4`
- Hash/staging reutilizado:
  - 5 hashes originais mantidos na rodada 2
  - 4 hashes complementares atualizados/reutilizados sem duplicacao de stage

### Tenant isolation

- Tenant 6 e tenant 7 processaram o mesmo `flight_report.id = 700101` sem colisao.
- Resultado final:
  - `empresa_id = 6`: 9 voos locais (`3 MANUAL`, `6 SIGVOOS`)
  - `empresa_id = 7`: 1 voo SIGVOOS local
- Triggers rejeitaram mismatch:
  - `cv_voo_etapas empresa_id mismatch`
  - `cv_sigvoos_staging cv_voo_id mismatch`

## 6. Metricas do importer/invoker em D1 local persistente

### Rodada inicial

- Inputs totais: 9
- Payloads processados: 5
- Payloads com falha de infra local: 4
- Flights criados: 4
- Flights atualizados/reutilizados: 2
- Etapas criadas: 6
- Tripulantes criados: 5
- Conflitos criados: 1

Cenarios cobertos na rodada inicial:

- `sigvoos-com-flight-report-id.json`
- `sigvoos-sem-flight-report-id.json`
- `sigvoos-multileg-sem-flight-report-id.json`
- `sigvoos-staff-id-inscription-conflict.json`
- `tenant-7-inline`

### Rodada complementar apos seed local

- Inputs totais: 4
- Payloads processados: 4
- Flights criados: 3
- Flight atualizado/reutilizado: 1
- Etapas criadas: 4
- Tripulantes criados: 3
- Conflitos criados: 1

Cenarios cobertos na rodada complementar:

- `sigvoos-multileg-flight-report-id.json`
- `sigvoos-apenas-staff-inscription.json`
- `sigvoos-sem-canac.json`
- `sigvoos-optional-missing-extra-sensitive.json`

## 7. Conflitos e warnings esperados

- Conflito esperado 1:
  - fixture `sigvoos-staff-id-inscription-conflict.json`
  - justificativa: `staff.id e staff.inscription resolvidos para funcionarios diferentes`
- Conflito esperado 2:
  - fixture `sigvoos-sem-canac.json`
  - justificativa: `funcionario nao resolvido por staff.id ou staff.inscription`
- Sanitizacao confirmada:
  - payload com `token`, `credential`, `password`, `auth_secret` nao gerou falha de seguranca
  - extras benignos foram mantidos no payload sanitizado

## 8. FRMS, rede e politica de fonte

- Contagem antes:
  - `frms_jornada = 237`
  - `frms_alerta = 171`
- Contagem depois:
  - `frms_jornada = 237`
  - `frms_alerta = 171`
- Nenhum write em FRMS ocorreu.
- `fetch` foi forçado a falhar no harness local; nenhuma chamada de rede ocorreu.
- Busca textual nos servicos SIGVOOS nao encontrou import/invocacao de `frms-source-policy.ts`.

## 9. Testes e validacoes automatizadas

- `controle-voos-sigvoos-shadow-local-invoker.test.ts`: 3/3 PASS
- `controle-voos-sigvoos-importer-runner.test.ts`: 3/3 PASS
- `controle-voos-sigvoos-importer.test.ts`: 16/16 PASS
- `controle-voos-sigvoos-integration-0411-schema.test.ts`: 9/9 PASS
- `npx tsc --noEmit --pretty false`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS
- `bash scripts/check-tracked-secrets.sh`: PASS (`[tracked-secrets] OK`)
- `bash scripts/validation/audit-deploy-scripts.sh`: PASS como auditoria/inventario
- `bash scripts/audit-dangerous-ops.sh`: PASS com 1 warning historico ja conhecido

## 10. Ajustes locais minimos versionados

- `scripts/seed-local-controle-voos.sql`
  - adiciona `SBMI` sintetico para tenant 6
  - adiciona catalogo local sintetico para tenant 7

Motivo:

- a validacao local persistente exigiu cenarios com `SBMI` e prova real de isolamento `empresa_id = 6` vs `7`;
- o seed anterior nao cobria esses casos sem complemento manual local.

## 11. Rollback local recomendado

1. Restaurar o snapshot local do diretório:
   - `/tmp/airtrust-sigvoos-schema-local-persistent-20260615T214652Z`
2. Ou apagar `worker-airtrust/.wrangler/state` e refazer o setup local padrão.
3. Se necessario, remover as linhas `0410` e `0411` de `d1_migrations` no SQLite local recriado antes de uma nova prova controlada.

## 12. Proxima recomendacao

- Manter `0410/0411` como fluxo `--file` local para validacao persistente.
- Reutilizar o seed local atualizado para regressao de SIGVOOS no D1 persistente.
- Se a proxima fase exigir qualquer `--remote`, staging, producao, deploy, API real ou secrets reais, parar e abrir fase sensivel separada.
