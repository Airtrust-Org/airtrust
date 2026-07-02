# Production Release Checklist — Preparado para o Próximo Operador

> **Data:** 2026-07-02
> **SHA main:** `953ef22603a4c1775b413f037cd66c23eae899c3` (SHA atual — antes da janela, rodar `git rev-parse HEAD` e confirmar que o working tree está limpo)
> **Status:** Checklist preparado, NÃO EXECUTADO
> **Modelo de execução recomendado:** DeepSeek v4 Pro

---

## 🚨 Regras Antes de Começar

- Não executar sem janela aprovada.
- Não pular snapshots.
- Rollback: reverter Worker primeiro; DDL reverso só com autorização separada.
- PR #168 não deve ser tocado.
- **`git status --short` deve estar vazio** (zero untracked, zero modified, zero staged).
- Branch deve ser `main`.
- **`git rev-parse HEAD` deve ser registrado no relatório da execução** — não depender de SHA hardcoded neste documento.
- Domínio canônico de produção é **`api.airtrust.online`**. O endpoint **`airtrust-api.airtrust.workers.dev`** NÃO é canônico e não deve ser usado para decisão de produção.
- Fallback técnico aceitável: **`airtrust-api-production.airtrust.workers.dev`**.
- Toda etapa deve ser confirmada antes de passar para a próxima.

## 🔵 Pré-janela (antes de começar)

```bash
# 0. Confirmar working tree limpo
git status --short
# Deve estar vazio

# 1. Confirmar branch
git branch --show-current
# Deve ser "main"

# 2. Registrar SHA atual
git rev-parse HEAD
# Salvar no relatório da execução

# 3. Confirmar CI verde do último commit em main
gh run list --commit "$(git rev-parse HEAD)" --limit 10 --json name,conclusion,status

# 4. Confirmar domínio canônico de produção
dig +short api.airtrust.online
echo ""
echo "⚠️  ATENÇÃO: o endpoint airtrust-api.airtrust.workers.dev NÃO é canônico."
echo "   Não usá-lo para decisão de produção."

# 5. Confirmar produção saudável antes da janela
curl -s https://api.airtrust.online/api/health | python3 -m json.tool
# Deve retornar: status=healthy, database=ok, environment=production
```

---

## Etapa 1 — Snapshot/Backup do D1 de Produção

```bash
# 0. Criar diretório de backup
mkdir -p ./backups

# 1. Exportar schema + dados completos com timestamp único
TS=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="./backups/production-pre-0412-${TS}.sql"
npx wrangler d1 export airtrust-db --remote --output "$BACKUP"

# 2. Gerar hash do arquivo
HASH=$(sha256sum "$BACKUP" | cut -d' ' -f1)
echo "$HASH  $BACKUP" > "${BACKUP}.sha256"

# 3. Fazer upload para R2 (backup externo)
npx wrangler r2 object put "airtrust-files/backups/production-pre-0412-${TS}.sql" --file "$BACKUP"

# 4. Verificar hash no R2
echo "=== HASH do snapshot ==="
echo "$HASH"
echo "=== Salve este hash no ledger ==="
```

**Critério de aceite:** Snapshot salvo em R2 com hash verificado. SHA registrado no ledger.

---

## Etapa 2 — Ledger antes da 0412

Registrar no ledger (ex: `domain_events` ou arquivo versionado):

| Campo | Valor |
|-------|-------|
| Evento | `production_release_pre_0412` |
| SHA main | `4e41e6bbc48c1f97efb2eab03a92ae44351cea31` |
| Snapshot R2 path | `<path do snapshot>` |
| Snapshot hash | `<sha256 do snapshot>` |
| Autorização | `<aprovador>` |
| Data/hora | `<timestamp>` |

---

## Etapa 3 — Aplicar Migration 0412

**Mecanismo preferencial (registra no ledger):**

Usar o pipeline de release oficial que registra o evento em `domain_events` ou o mecanismo definido no runbook de staging baseline. Se houver script de release que já faz o registro no ledger, utilizá-lo.

**Alternativa emergencial (apenas se o pipeline oficial não estiver disponível):**

```bash
# 1. Registrar PRE no ledger
#    Exemplo: INSERT INTO domain_events (empresa_id, modulo, tipo, payload)
#    VALUES (1, 'qualificacoes', 'MIGRATION_0412_PRE', '{"sha":"4e41e6b","status":"starting"}')

# 2. Aplicar migration
npx wrangler d1 execute airtrust-db --remote --file worker-airtrust/migrations/0412_qualificacoes_classificacao.sql

# 3. Registrar PÓS no ledger
#    Exemplo: INSERT INTO domain_events (empresa_id, modulo, tipo, payload)
#    VALUES (1, 'qualificacoes', 'MIGRATION_0412_POST', '{"sha":"4e41e6b","status":"applied"}')

# 4. Confirmar idempotência (pode rodar novamente sem dano)
npx wrangler d1 execute airtrust-db --remote --command "SELECT COUNT(*) as n FROM qualificacoes_formatos;"
```

**Critério de aceite:** Migration aplicada, tabelas criadas, seeds inseridos, 0 erros. Eventos PRE e POST registrados no ledger.

---

## Etapa 4 — Deploy Worker (somente após 0412)

```bash
# 1. Deploy do worker production
npm run deploy:worker

# 2. Verificar health (domínio canônico)
curl -s https://api.airtrust.online/api/health | python3 -m json.tool

# 3. Verificar versão
curl -s https://api.airtrust.online/api/version | python3 -m json.tool
```

**Critério de aceite:** Health 200, versão contém o SHA esperado.

---

## Etapa 5 — Deploy Pages (somente após Worker)

```bash
# 1. Deploy frontend production
npm run deploy:pages
```

**Critério de aceite:** Frontend carrega, API calls funcionam.

---

## Etapa 6 — Smoke Produção

**Antes de iniciar, confirmar o domínio canônico de produção:**

```bash
# O Worker de produção está em:
#   CANÔNICO: https://api.airtrust.online
#   Fallback técnico: https://airtrust-api-production.airtrust.workers.dev
#
# ⚠️  airtrust-api.airtrust.workers.dev NÃO é produção canônica.
#      Este endpoint causou falso NO-GO em 2026-07-02 por estar
#      rodando uma build dev-local. Ignorá-lo.
#
# Confirmar que o DNS aponta para o Workers correto:
dig +short api.airtrust.online
# Deve retornar um IP da Cloudflare (104.x.x.x ou 172.x.x.x)
```

### Smoke público (sem auth)

> ⚠️ **Atenção:** O script `smoke-staging-auth.mjs` foi projetado para staging.  
> Seu uso em produção é **temporário** — o próximo release deve ter um script `smoke-production-auth.mjs` dedicado.  
> Antes de rodar, confirme que o alvo é `api.airtrust.online` (canônico) ou `airtrust-api-production.airtrust.workers.dev` (fallback):

```bash
# CONFIRMAR ALVO ANTES DE RODAR:
export SMOKE_TARGET='https://api.airtrust.online'
echo "Alvo: $SMOKE_TARGET"
# Deve mostrar "api.airtrust.online"

node scripts/smoke-staging-auth.mjs --dry-run
```

Checklist:
- [ ] `/api/health` → 200
- [ ] `/api/auth/me` → 401 (sem token)
- [ ] `/api/qualificacoes/formatos` → 401 (sem token)
- [ ] `/api/qualificacoes/tipos` → 401 (sem token)
- [ ] `/api/qualificacoes/historico` → 401 (sem token)
- [ ] `/api/lms/cursos` → 401 (sem token)

### Smoke autenticado (com admin de produção)

```bash
# CONFIRMAR ALVO NOVAMENTE:
echo "Alvo: $STAGING_API_BASE_URL"
# Deve mostrar "api.airtrust.online" (canônico) ou "airtrust-api-production.airtrust.workers.dev" (fallback)

STAGING_API_BASE_URL='https://api.airtrust.online' \
STAGING_SMOKE_EMAIL='<email-admin-producao>' \
STAGING_SMOKE_PASSWORD='<senha-admin-producao>' \
node scripts/smoke-staging-auth.mjs
```

Checklist:
- [ ] Login → 200, empresa_id > 0
- [ ] `/api/auth/me` → 200, email coincide
- [ ] `/api/qualificacoes/formatos` → 200, count > 0
- [ ] `/api/qualificacoes/tipos` → 200, count > 0
- [ ] `/api/qualificacoes/historico` → 200
- [ ] `/api/lms/cursos` → 200, count > 0
- [ ] JSON válido, sem erro de schema
- [ ] Sem indício cross-tenant

---

## Etapa 7 — Rollback

| Cenário | Ação | Autorização |
|---------|------|-------------|
| Worker com bug | Reverter Worker para versão anterior (`git revert` + deploy) | Imediata |
| Migration 0412 causa problema | Reverter Worker primeiro. DDL reverso **não** é automático | Requer autorização separada + novo snapshot |
| Frontend quebrado | Reverter Pages para deployment anterior via Cloudflare Dashboard | Imediata |

### DDL Reverso (não executar sem autorização)

```sql
-- Rollback 0412 (apenas se autorizado explicitamente)
DROP TABLE IF EXISTS qualificacoes_formatos;
-- As colunas adicionadas (formato_id, categoria_id, classe_requisito) são
-- NULL e não quebram queries existentes — podem permanecer sem rollback.
```

---

## Sinais de NO-GO Immediato

- Snapshot de produção falha ou hash não confere
- Migration 0412 retorna erro não idempotente
- Worker deployado retorna 500 em health check
- Domínio canônico `api.airtrust.online` não responde ou retorna unhealthy
- Smoke autenticado falha em qualquer endpoint crítico
- Cross-tenant detectado (empresa_id incorreto)
- PR #168 foi tocado (não deve)
- `env.production` foi alterado no wrangler.toml (não deve)
- Endpoint `airtrust-api.airtrust.workers.dev` foi usado como referência de produção (não usar)
