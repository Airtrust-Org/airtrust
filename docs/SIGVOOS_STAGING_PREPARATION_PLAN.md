# SIGVOOS Staging Preparation Plan

**Veredito:** `STAGING PREPARADO — AGUARDA AUTORIZACAO`

Data: 2026-06-15
Branch base: `main` @ `f06e714e5453b9e017f4753c8220e17ace470278`
Autor do plano: Claude Sonnet 4.6 (modo controlado)
Modelo para execução sensível futura: Codex 5.5 (somente com autorização explícita separada)

---

## 1. Estado atual confirmado

| Item | Status |
|---|---|
| `main` alinhado com `origin/main` | CONFIRMADO — HEAD = `f06e714e`, divergência 0/0 |
| PR #39 mergeado | CONFIRMADO — "Validação local persistente do schema SIGVOOS" |
| CI pós-merge | `CI` ✓ `Tests` ✓ `Lint and Prettier Check` ✓ `Demo Data Prevention Check` ✓ |
| Cloudflare Deploy disparado | NÃO — não rodou |
| workflow_dispatch disparado | NÃO — não disparado |
| Migration remota aplicada | NÃO — nenhuma |
| 0410/0411 aplicadas em local persistente | CONFIRMADO — somente D1 local |
| 0410/0411 aplicadas em staging | NÃO — staging intocado |
| 0410/0411 aplicadas em produção | NÃO — produção intocada |
| API real SIGVOOS chamada | NÃO |
| Credenciais SIGVOOS usadas | NÃO |
| FRMS canônico alterado | NÃO — `frms_jornada` e `frms_alerta` estáveis |
| `frms-source-policy.ts` alterado | NÃO — intocado |
| Testes SIGVOOS | 31/31 PASS |
| `tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `check-tracked-secrets.sh` | PASS |
| `audit-dangerous-ops.sh` | PASS |

---

## 2. Escopo permitido da próxima fase sensível

A próxima fase, quando autorizada explicitamente, tem escopo restrito a:

1. Aplicar `0410_controle_voos_n1_schema.sql` em D1 staging usando `--file`.
2. Aplicar `0411_controle_voos_sigvoos_integration_schema.sql` em D1 staging usando `--file`.
3. Verificar presença das tabelas `cv_*`, índices `idx_cv_*` e triggers `trg_cv_*` no D1 staging.
4. Verificar que `d1_migrations` registra `0410` e `0411` após aplicação.
5. Executar payloads sintéticos/sanitizados para validação de idempotência e tenant isolation em staging.
6. Validar que dados manuais pré-existentes (se houver) não foram alterados pelas migrations.
7. Documentar contagens pré/pós para tabelas afetadas.
8. Confirmar que rollback de snapshot/restore é viável.

O que NÃO está no escopo desta próxima fase:

- Qualquer interação com produção.
- Chamada à API real SIGVOOS sem autorização separada adicional.
- Alteração de FRMS canônico.
- Alteração de `frms-source-policy.ts`.
- Deploy de código.
- Inserção de dados reais não sanitizados.
- Qualquer promessa ou certificação ANAC.

---

## 3. Escopo proibido (permanente)

| Ação | Proibição |
|---|---|
| Execução em produção | PROIBIDO PERMANENTEMENTE nesta fase |
| API real SIGVOOS sem autorização explícita adicional | PROIBIDO |
| E-mails reais | PROIBIDO |
| Deploy automático | PROIBIDO sem autorização |
| Alteração de FRMS canônico | PROIBIDO |
| Alteração de `frms-source-policy.ts` | PROIBIDO |
| Dados reais não sanitizados | PROIBIDO |
| Promessa ou certificação ANAC | PROIBIDO |
| `git push` direto para `main` | PROIBIDO |
| Migration aplicada sem janela operacional confirmada | PROIBIDO |

---

## 4. Pré-requisitos obrigatórios para execução em staging

Todos os itens abaixo DEVEM estar confirmados antes de qualquer execução em staging. A ausência de qualquer um resulta em NO-GO imediato.

### 4.1 Backup / snapshot do D1 staging

- [ ] Snapshot ou export do D1 staging realizado e salvo em local seguro antes de qualquer `--remote`.
- [ ] Caminho/identificador do snapshot documentado e verificável.
- [ ] Confirmação de que o snapshot pode ser restaurado em caso de erro.

### 4.2 Identificação do banco de staging

- [ ] Nome exato do D1 staging identificado (ex.: `airtrust-db-dev` ou equivalente em `wrangler.dev.toml`).
- [ ] Database ID do D1 staging confirmado via `wrangler d1 list` ou painel Cloudflare.
- [ ] Confirmação de que o database ID NÃO é o de produção (`airtrust-db`).

### 4.3 Confirmação de ambiente

- [ ] Variável de ambiente ou flag `--env` apontando exclusivamente para staging.
- [ ] Nenhum alias, binding ou variável referenciando produção no mesmo comando.
- [ ] `wrangler.dev.toml` ou toml equivalente verificado e apontando para staging.

### 4.4 Janela operacional

- [ ] Janela de manutenção definida (horário de início e fim).
- [ ] Equipe responsável notificada e disponível durante a janela.
- [ ] Nenhum deploy de código agendado durante a janela.

### 4.5 Plano de rollback confirmado

- [ ] Rollback documentado neste plano (seção 5) lido e aceito pelo responsável.
- [ ] Snapshot disponível conforme 4.1.
- [ ] Critérios de abort definidos conforme 5.4.

### 4.6 Validação de secrets

- [ ] Nenhum secret real de produção no ambiente de staging.
- [ ] `JWT_SECRET` e demais secrets usam valores de staging/dev isolados.
- [ ] `ENABLE_DEV_AUTH_BYPASS` nunca comitado.

### 4.7 Confirmação de isolamento de produção

- [ ] Revisão manual dos comandos a executar, confirmando ausência de `--env production`.
- [ ] Confirmação de que nenhum binding do worker de staging aponta para D1 de produção.
- [ ] Segundo revisor (quando disponível) valida os comandos antes da execução.

---

## 5. Plano de rollback

### 5.1 O que pode ser revertido

| Operação | Reversibilidade |
|---|---|
| `CREATE TABLE IF NOT EXISTS` | Reversível via `DROP TABLE` — mas requer migration explícita |
| `ALTER TABLE ADD COLUMN` | **NÃO REVERSÍVEL** em SQLite/D1 sem recriação da tabela |
| `CREATE INDEX IF NOT EXISTS` | Reversível via `DROP INDEX` |
| `CREATE TRIGGER IF NOT EXISTS` | Reversível via `DROP TRIGGER` |
| Dados inseridos por seed | Reversíveis via `DELETE` ou restauração de snapshot |

### 5.2 Limitações de SQLite/D1 para `ALTER TABLE ADD COLUMN`

O D1 (SQLite) **não suporta** `ALTER TABLE DROP COLUMN` de forma padrão em versões anteriores ao SQLite 3.35. A D1 da Cloudflare pode ou não suportar. Portanto:

- Uma vez aplicadas as colunas SIGVOOS em `cv_voos` e `cv_voo_tripulantes`, elas **não podem ser removidas** com um simples `ALTER TABLE DROP COLUMN`.
- A reversão de colunas requer: recriar a tabela sem as colunas → copiar dados → renomear → recriar índices e triggers.
- Esta operação é custosa e arriscada em ambiente com dados.

### 5.3 Estratégia realista de rollback: snapshot/restore

O rollback primário e recomendado é via restauração de snapshot:

1. Antes de executar qualquer migration em staging: `wrangler d1 export airtrust-db-dev --env <staging> --output snapshot-pre-0410.sql` (ou equivalente).
2. Se algo falhar durante ou após a aplicação: restaurar o export no D1 staging.
3. O processo de restore em D1 Cloudflare envolve recriar o database ou reimportar o dump SQL.
4. Confirmar com a Cloudflare a viabilidade de restore antes de iniciar a janela.

### 5.4 Critérios para abortar

Abortar imediatamente se:

- Qualquer comando aponta para database de produção.
- `--env production` aparece em qualquer comando.
- O database ID confirmado na saída do comando não bate com o ID de staging esperado.
- Qualquer erro inesperado de schema (tabela já existente com estrutura incompatível).
- Qualquer falha nos triggers de tenant isolation após aplicação.
- Qualquer contagem de `frms_jornada` ou `frms_alerta` se alterar.
- Qualquer write em tabelas não-`cv_*` ocorrer.

---

## 6. Checklist GO/NO-GO

### GO — todos os itens abaixo devem ser `SIM`

- [ ] Snapshot do D1 staging realizado e verificável? **SIM / NÃO**
- [ ] Database ID de staging confirmado e diferente de produção? **SIM / NÃO**
- [ ] Janela operacional definida e equipe disponível? **SIM / NÃO**
- [ ] Plano de rollback lido, aceito e viável? **SIM / NÃO**
- [ ] Secrets de staging isolados de produção? **SIM / NÃO**
- [ ] Nenhum comando contém `--env production`? **SIM / NÃO**
- [ ] Autorização explícita concedida para esta fase sensível? **SIM / NÃO**
- [ ] Testes locais 31/31 PASS na branch base? **SIM** (confirmado)
- [ ] `tsc --noEmit` PASS? **SIM** (confirmado)

**GO somente se TODOS os itens acima forem SIM.**

### NO-GO — qualquer item abaixo resulta em NO-GO imediato

- [ ] Falta backup/snapshot de staging? → **NO-GO**
- [ ] Database ID de staging não confirmado ou coincide com produção? → **NO-GO**
- [ ] Falta autorização explícita? → **NO-GO**
- [ ] Rollback não é viável ou não foi planejado? → **NO-GO**
- [ ] Qualquer comando aponta para produção? → **NO-GO**
- [ ] Janela operacional indefinida? → **NO-GO**
- [ ] Testes locais com falha? → **NO-GO**

---

## 7. Comandos proibidos

Os comandos abaixo são **ABSOLUTAMENTE PROIBIDOS** em qualquer fase de staging ou produção sem autorização explícita adicional separada:

```bash
# PROIBIDO — produção
wrangler d1 execute airtrust-db --env production --remote --file ...
wrangler d1 migrations apply --env production --remote
wrangler deploy --env production
wrangler publish --env production

# PROIBIDO — sem confirmação de ambiente
wrangler d1 execute ... --remote   # sem --env staging explícito
wrangler d1 execute ... --remote   # sem database ID confirmado previamente

# PROIBIDO — mistura de ambientes
wrangler d1 execute airtrust-db ... --remote  # database de produção em qualquer fase

# PROIBIDO — secrets reais
export SIGVOOS_API_KEY=<valor real>
export SIGVOOS_SECRET=<valor real>
```

---

## 8. Comandos candidatos para fase futura

> **ATENÇÃO: NÃO EXECUTAR NESTA ETAPA. Estes comandos são templates para autorização futura.**
> Todos os `<PLACEHOLDER>` devem ser substituídos e verificados antes de qualquer execução.

### 8.1 Identificar o ambiente de staging

```bash
# TEMPLATE — NÃO EXECUTAR
# Verificar databases disponíveis e confirmar ID de staging
wrangler d1 list
# Anotar o database ID de staging (NÃO produção) e confirmar visualmente
```

### 8.2 Exportar snapshot pré-migration

```bash
# TEMPLATE — NÃO EXECUTAR
# Substituir <STAGING_DB_NAME> e <STAGING_ENV> pelos valores reais de staging
wrangler d1 export <STAGING_DB_NAME> \
  --config worker-airtrust/wrangler.dev.toml \
  --env <STAGING_ENV> \
  --remote \
  --output /tmp/airtrust-staging-pre-0410-$(date +%Y%m%dT%H%M%SZ).sql
```

### 8.3 Aplicar migration 0410 em staging

```bash
# TEMPLATE — NÃO EXECUTAR
# Verificar database ID na saída antes de confirmar
wrangler d1 execute <STAGING_DB_NAME> \
  --config worker-airtrust/wrangler.dev.toml \
  --env <STAGING_ENV> \
  --remote \
  --file worker-airtrust/migrations/0410_controle_voos_n1_schema.sql
```

### 8.4 Aplicar migration 0411 em staging

```bash
# TEMPLATE — NÃO EXECUTAR
wrangler d1 execute <STAGING_DB_NAME> \
  --config worker-airtrust/wrangler.dev.toml \
  --env <STAGING_ENV> \
  --remote \
  --file worker-airtrust/migrations/0411_controle_voos_sigvoos_integration_schema.sql
```

### 8.5 Registrar migrations em d1_migrations (se necessário)

```bash
# TEMPLATE — NÃO EXECUTAR
# Somente se o Wrangler não registrar automaticamente via --file
wrangler d1 execute <STAGING_DB_NAME> \
  --config worker-airtrust/wrangler.dev.toml \
  --env <STAGING_ENV> \
  --remote \
  --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0410_controle_voos_n1_schema.sql');"

wrangler d1 execute <STAGING_DB_NAME> \
  --config worker-airtrust/wrangler.dev.toml \
  --env <STAGING_ENV> \
  --remote \
  --command "INSERT OR IGNORE INTO d1_migrations (name) VALUES ('0411_controle_voos_sigvoos_integration_schema.sql');"
```

### 8.6 Validar tabelas pós-aplicação

```bash
# TEMPLATE — NÃO EXECUTAR
wrangler d1 execute <STAGING_DB_NAME> \
  --config worker-airtrust/wrangler.dev.toml \
  --env <STAGING_ENV> \
  --remote \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cv_%' ORDER BY name;"
```

### 8.7 Validar d1_migrations pós-aplicação

```bash
# TEMPLATE — NÃO EXECUTAR
wrangler d1 execute <STAGING_DB_NAME> \
  --config worker-airtrust/wrangler.dev.toml \
  --env <STAGING_ENV> \
  --remote \
  --command "SELECT name, applied_at FROM d1_migrations WHERE name LIKE '%controle_voos%' OR name LIKE '%sigvoos%' ORDER BY name;"
```

### 8.8 Validar contagem de índices e triggers

```bash
# TEMPLATE — NÃO EXECUTAR
wrangler d1 execute <STAGING_DB_NAME> \
  --config worker-airtrust/wrangler.dev.toml \
  --env <STAGING_ENV> \
  --remote \
  --command "SELECT type, COUNT(*) as total FROM sqlite_master WHERE name LIKE 'idx_cv_%' OR name LIKE 'trg_cv_%' GROUP BY type;"
```

### 8.9 Confirmar FRMS inalterado após aplicação

```bash
# TEMPLATE — NÃO EXECUTAR
wrangler d1 execute <STAGING_DB_NAME> \
  --config worker-airtrust/wrangler.dev.toml \
  --env <STAGING_ENV> \
  --remote \
  --command "SELECT 'frms_jornada' as tabela, COUNT(*) as total FROM frms_jornada UNION ALL SELECT 'frms_alerta', COUNT(*) FROM frms_alerta;"
```

---

## 9. Validações esperadas após aplicação em staging

### 9.1 `d1_migrations`

- `0410_controle_voos_n1_schema.sql` presente na tabela `d1_migrations`.
- `0411_controle_voos_sigvoos_integration_schema.sql` presente na tabela `d1_migrations`.
- Nenhuma migration de produção ausente ou em conflito.

### 9.2 Tabelas `cv_*`

Tabelas esperadas (criadas por 0410):

- `cv_aeroportos`
- `cv_tipos_voo`
- `cv_naturezas_voo`
- `cv_motivos_operacionais`
- `cv_voos`
- `cv_rdv_operacional`
- `cv_voo_tripulantes`
- `cv_voo_eventos`

Tabelas esperadas (criadas por 0411):

- `cv_voo_etapas`
- `cv_sigvoos_staging`
- `cv_conflitos_integracao`

### 9.3 Índices e triggers esperados

- Mínimo 49 índices `idx_cv_*` presentes.
- Mínimo 18 triggers `trg_cv_*` presentes.
- Triggers de tenant isolation ativos: `trg_cv_voo_etapas_empresa_insert`, `trg_cv_sigvoos_staging_voo_insert`, `trg_cv_conflitos_integracao_staging_insert` e demais.

### 9.4 Colunas SIGVOOS em `cv_voos`

- `sigvoos_flight_report_id` (NULLABLE)
- `sigvoos_flight_report_id_confident` (DEFAULT 0)
- `sigvoos_report_number`, `sigvoos_flight_number`, `sigvoos_client_name`, `sigvoos_contract_name`
- `sigvoos_importado_em`, `sigvoos_content_hash`
- `origem_importacao` (DEFAULT 'MANUAL')
- `campos_editados_json`

### 9.5 Colunas SIGVOOS em `cv_voo_tripulantes`

- `etapa_id`, `sigvoos_staff_id`, `sigvoos_staff_inscription`
- `funcao_origem`, `resolucao_funcionario_fonte`, `sigvoos_content_hash`

### 9.6 Idempotência

- Executar 0410 e 0411 uma segunda vez não deve gerar erros (todas as DDLs usam `IF NOT EXISTS`).
- Contagens pré/pós nas tabelas `cv_*` devem ser idênticas na segunda execução.

### 9.7 Conflitos esperados conhecidos

- `idx_cv_voos_empresa_sigvoos_fr_id`: único por `(empresa_id, sigvoos_flight_report_id)` onde não-NULL — comportamento esperado.
- Múltiplos `sigvoos_flight_report_id IS NULL` permitidos na mesma empresa.

### 9.8 FRMS inalterado

- Contagem de `frms_jornada` idêntica à pré-migration.
- Contagem de `frms_alerta` idêntica à pré-migration.
- `frms-source-policy.ts` sem alteração.

---

## 10. Critérios de sucesso da fase de staging

| Critério | Condição |
|---|---|
| Staging validado | Tabelas, índices, triggers e colunas presentes e corretos |
| Nenhuma alteração em produção | Nenhum comando com `--env production` executado |
| FRMS inalterado | Contagens `frms_jornada` e `frms_alerta` estáveis |
| Sem API real | Nenhuma chamada à API SIGVOOS real durante a fase |
| Idempotência confirmada | Segunda execução de 0410/0411 não gera erros |
| Tenant isolation confirmado | Triggers de mismatch ativos e rejeitam cross-tenant |
| Rollback viável | Snapshot documentado e testável |
| Sem deploy | Nenhum `wrangler deploy` executado durante a fase |

---

## 11. Confirmações de escopo desta fase (Preparação)

| Restrição | Status |
|---|---|
| Nenhuma migration aplicada em staging | CONFIRMADO — nenhuma executada |
| Nenhuma migration aplicada em produção | CONFIRMADO — nenhuma executada |
| Nenhum D1 remoto executado | CONFIRMADO |
| Nenhuma API real SIGVOOS chamada | CONFIRMADO |
| Nenhuma credencial real usada | CONFIRMADO |
| Nenhum deploy executado | CONFIRMADO |
| FRMS canônico intocado | CONFIRMADO |
| `frms-source-policy.ts` intocado | CONFIRMADO |
| Nenhum endpoint público criado | CONFIRMADO |
| Nenhum dado real importado | CONFIRMADO |

---

## 12. Próxima recomendação macro

1. Coletar todas as confirmações da seção 4 (pré-requisitos) antes de abrir uma fase sensível.
2. Identificar o database ID de staging (`wrangler d1 list`) em sessão prévia e documentar.
3. Abrir fase sensível separada com autorização explícita do responsável.
4. Executar os templates da seção 8 **na ordem apresentada**, com revisão manual entre cada passo.
5. Após staging validado, planejar fase de produção como etapa completamente independente e com autorização separada adicional.

**Modelo para execução sensível futura:** Codex 5.5, somente com autorização explícita e separada.
