# Production Release Checklist — Preparado para o Próximo Operador

> **Data:** 2026-07-02
> **SHA main:** `fde847781d458c52c8b519da86c8081dabda8c1a`
> **Status:** Checklist preparado, NÃO EXECUTADO
> **Modelo de execução recomendado:** DeepSeek v4 Pro

---

## 🚨 Regras Antes de Começar

- Não executar sem janela aprovada.
- Não pular snapshots.
- Rollback: reverter Worker primeiro; DDL reverso só com autorização separada.
- PR #168 não deve ser tocado.

---

## Etapa 1 — Snapshot/Backup do D1 de Produção

```bash
# 1. Exportar schema + dados completos
npx wrangler d1 export airtrust-db --remote --output ./backups/production-pre-0412-$(date -u +%Y%m%dT%H%M%SZ).sql

# 2. Gerar hash do arquivo
sha256sum ./backups/production-pre-0412-*.sql > ./backups/production-pre-0412-$(date -u +%Y%m%dT%H%M%SZ).sha256

# 3. Fazer upload para R2 (backup externo)
npx wrangler r2 object put airtrust-files/backups/production-pre-0412-$(date -u +%Y%m%dT%H%M%SZ).sql --file ./backups/production-pre-0412-*.sql

# 4. Verificar hash no R2
```

**Critério de aceite:** Snapshot salvo em R2 com hash verificado. SHA registrado no ledger.

---

## Etapa 2 — Ledger antes da 0412

Registrar no ledger (ex: `domain_events` ou arquivo versionado):

| Campo | Valor |
|-------|-------|
| Evento | `production_release_pre_0412` |
| SHA main | `fde847781d458c52c8b519da86c8081dabda8c1a` |
| Snapshot R2 path | `<path do snapshot>` |
| Snapshot hash | `<sha256 do snapshot>` |
| Autorização | `<aprovador>` |
| Data/hora | `<timestamp>` |

---

## Etapa 3 — Aplicar Migration 0412

```bash
# 1. Deploy da migration via wrangler (ou pipeline)
npx wrangler d1 execute airtrust-db --remote --file worker-airtrust/migrations/0412_qualificacoes_classificacao.sql

# 2. Confirmar idempotência (pode rodar novamente sem dano)
npx wrangler d1 execute airtrust-db --remote --command "SELECT COUNT(*) as n FROM qualificacoes_formatos;"

# 3. Registrar no ledger
```

**Critério de aceite:** Migration aplicada, tabelas criadas, seeds inseridos, 0 erros.

---

## Etapa 4 — Deploy Worker (somente após 0412)

```bash
# 1. Deploy do worker production
npm run deploy:worker

# 2. Verificar health
curl -s https://airtrust-api.airtrust.workers.dev/api/health | python3 -m json.tool

# 3. Verificar versão
curl -s https://airtrust-api.airtrust.workers.dev/api/version | python3 -m json.tool
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

### Smoke público (sem auth)

```bash
node scripts/smoke-staging-auth.mjs --dry-run
# Adaptar para apontar para produção: STAGING_API_BASE_URL=https://airtrust-api.airtrust.workers.dev
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
STAGING_API_BASE_URL='https://airtrust-api.airtrust.workers.dev' \
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
- Smoke autenticado falha em qualquer endpoint crítico
- Cross-tenant detectado (empresa_id incorreto)
- PR #168 foi tocado (não deve)
- `env.production` foi alterado no wrangler.toml (não deve)
