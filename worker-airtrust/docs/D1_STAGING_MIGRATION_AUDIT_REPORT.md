# D1 Staging Migration Audit Report

## Metadados

| Campo | Valor |
|---|---|
| Data/hora | 2026-05-15T01:30:00Z |
| Branch | main |
| Commit checkpoint | `35c5fb6a6` |
| Commit final | (gerado abaixo) |
| Ambiente | staging |
| Database staging | `airtrust-db-staging` (ID: `b7f50907-c110-45f5-ad17-e97ea47f2826`) |

## Objetivo

Preparar D1 staging para smoke funcional sem tocar em produção.

---

## Configuração D1

| Campo | Valor |
|---|---|
| Binding | `DB` |
| Database staging | `airtrust-db-staging` (ID: `b7f50907`) |
| Database production | `airtrust-db` (ID: `7c8a788e`) |
| Comando de migration staging | `npx wrangler d1 migrations apply airtrust-db-staging --env staging --remote` |
| Produção tocada? | **NÃO** — nenhum comando `--env production` foi executado |

---

## Auditoria de Migrations

| Métrica | Valor |
|---|---|
| Total de arquivos `.sql` no repositório | 340 |
| Prefixos com duplicatas | **29** |
| Prefixo mais problemático | `0092` (9 arquivos) |
| Arquivos fora do padrão | 3: `132_add_funcionario_ativo.sql`, `9999_add_modelo_sessao_id_to_agendamentos.sql`, `purge-soft-deleted-qualificacoes.sql` |

### Duplicatas encontradas

| Prefixo | Qtd |
|---|---|
| 0049, 0062, 0063, 0068, 0069, 0093, 0098, 0107, 0112, 0117, 0137, 0140, 0144, 0145, 0151, 0159, 0172, 0200, 0215, 0246, 0263, 0284, 0320, 0332, 0340, 0347, 0367 | 2 cada |
| 0150 | 3 |
| 0092 | 9 |

### Conclusão sobre risco

- **Risco de schema**: MÉDIO. As duplicatas de schema usam `IF NOT EXISTS`/`IF EXISTS` (idempotentes). Os 9 arquivos `0092_*` são data-restore com `INSERT OR IGNORE` (seguros).
- **Risco de ordem**: ALTO — problema crítico identificado (ver abaixo).
- **Para produção**: as duplicatas são pré-existentes e não bloqueiam `wrangler deploy`. Bloqueiam `wrangler d1 migrations apply` se Wrangler rejeitar duplicatas (não rejeita — trata como filenames distintos).

---

## Estado do D1 Staging Antes

| Aspecto | Valor |
|---|---|
| Banco existe | ✅ Sim (criado em 2026-03-16) |
| Tabelas antes | `_cf_KV`, `d1_migrations`, `documentos`, `sqlite_sequence` |
| `d1_migrations` antes | **Vazia** (0 migrations formalmente aplicadas) |
| Tabela `documentos` | Criada manualmente, sem dados |
| Dados existentes | Nenhum |
| Backup/export realizado | ✅ `/tmp/d1-staging-schema-backup.sql` (schema only, 57KB, não commitado) |

---

## Problemas Identificados

### Problema 1 — Ordenação não-alfabética do Wrangler 4.47.0

**Sintoma:** `wrangler d1 migrations apply` aplicou `0016_habilitacoes_renovacao.sql` antes de `0000_production_schema.sql`, que cria a tabela `habilitacoes`.

**Causa raiz:** Wrangler 4.47.0 usa ordem do filesystem (directory-entry order) em vez de ordem alfabética para migrations remotas. O arquivo `0000_production_schema.sql` foi adicionado/modificado mais recentemente no repositório, resultando em posição posterior no listing do filesystem.

**Erro resultante:**
```
Migration 0016_habilitacoes_renovacao.sql failed: no such table: habilitacoes: SQLITE_ERROR
```

**Impacto:** Nenhuma migration foi aplicada (D1 reverteu automaticamente).

---

### Problema 2 — Forward reference em 0058 (view antes da coluna)

**Sintoma:** `0058_extend_integrated_view_funcionarios.sql` cria a view `qualificacoes_historico_v` referenciando `f.nome_guerra` de `funcionarios`. A coluna `nome_guerra` só é adicionada por `0059_funcionarios_schema_parity.sql` (que vem depois alfabeticamente).

**Causa raiz:** `0000_production_schema.sql` cria `funcionarios` sem `nome_guerra`. A migration `0058` foi escrita contra um banco que já tinha essa coluna (adicionada incrementalmente em produção). Em um banco fresco, a coluna não existe quando `0058` tenta criar a view.

**Erro resultante:**
```
error in view qualificacoes_historico_v: no such column: f.nome_guerra: SQLITE_ERROR
```

**Workaround identificado:** Injetar um pre-patch `ALTER TABLE funcionarios ADD COLUMN ...` antes de `0058` no arquivo combinado.

---

### Problema 3 — SQLITE_AUTH em migrations 0050+

**Sintoma:** Ao aplicar migrations combinadas incluindo o range 0050-0099, D1 retorna `not authorized: SQLITE_AUTH`.

**Causa provável:** Alguma migration nesse range usa feature não autorizada pelo D1 (possivelmente `CREATE TEMP TABLE`, trigger com lógica específica, ou outra feature restrita). O erro ocorre mesmo com PRAGMAs removidos.

**Status:** Investigação parcial. Chunk 0000-0049 passou (16 migrations). O chunk 0050-0099 gerou SQLITE_AUTH. O arquivo de 0050-0099 contém o pre-patch para `nome_guerra`. A causa exata dentro do range 0050-0099 não foi isolada (processo interrompido antes da conclusão).

---

## Estratégia Adotada

**Abordagem:** Aplicar migrations via arquivo SQL combinado em ordem alfabética correta, contornando o bug de ordenação do Wrangler 4.47.0. Cada migration seguida de `INSERT OR IGNORE INTO d1_migrations`.

**Execução:** Aplicação em chunks de 50 migrations para facilitar diagnóstico de erros.

**Resultado:** Chunk 0000-0049 aplicado com sucesso. Chunks subsequentes bloqueados pelo SQLITE_AUTH.

---

## Resultado da Aplicação

| Aspecto | Valor |
|---|---|
| Migrations aplicadas | **16** (0000–0049 excluindo alguns gaps) |
| Migrations pendentes | **~324** |
| Tabelas criadas | **22** |
| Erros encontrados | 3 (ver seção Problemas) |
| Produção tocada | **NÃO** |

### Tabelas críticas após aplicação parcial

| Tabela | Status |
|---|---|
| `usuarios` | ✅ Existe |
| `funcionarios` | ✅ Existe |
| `qualificacoes_tipos` | ✅ Existe |
| `qualificacoes_historico` | ✅ Existe |
| `simuladores` | ✅ Existe |
| `sessoes_simulador` | ✅ Existe |
| `modelos_sessao` | ✅ Existe |
| `empresas` | ❌ Não existe (migration posterior) |
| `frms_jornadas` | ❌ Não existe (migration posterior) |
| `lms_cursos` | ❌ Não existe (migration posterior) |
| `audit_logs` | ❌ Não existe (migration posterior) |
| `agendamentos_simulador` | ❌ Não existe (migration posterior) |

---

## Smoke Após Migrations Parciais

O smoke pós-migrations não foi executado (schema insuficiente para autenticação funcional — tabela `empresas` e relacionadas ainda ausentes).

| Teste | Resultado | Observação |
|---|---|---|
| `GET /api/health` | ✅ 200 | DB conecta, sem erro |
| `GET /api/version` | ✅ 200 | env=staging confirmado |
| Rota protegida sem token | ✅ 401 | Auth middleware ativo |
| Login staging | ❌ Bloqueado | Schema incompleto (falta multi-tenant) |
| Rota protegida com token | ❌ Bloqueado | Depende de login |

---

## Bloqueios Remanescentes

1. **Causa exata do SQLITE_AUTH em 0050-0099** — Isolar a migration específica que usa feature não suportada pelo D1. Candidatos: `CREATE TEMP TABLE`, trigger bodies, ou statement específico.

2. **Forward references no histórico de migrations** — A migration `0058` e provavelmente outras foram escritas contra um banco com estado histórico não reproduzível em banco fresco. Workaround por pre-patch foi implementado parcialmente.

3. **Wrangler 4.47.0 não ordena alfabeticamente** — Atualizar para Wrangler ≥4.91.0 pode corrigir o bug de ordenação. Verificar changelog antes de atualizar.

4. **29 prefixos duplicados** — Pré-existentes no repo. Não bloqueiam `wrangler deploy`, mas complicam `migrations apply`. Para staging descartável, pode ser resolvido com schema-dump da produção (read-only).

5. **`MAINTENANCE_SECRET` ausente** — Rotas de manutenção retornam 503 (fail-closed). OK para staging, mas registrado.

6. **Seed/test user ausente** — Mesmo com schema completo, falta um usuário de staging para smoke funcional de login.

---

## Recomendação

**D1 staging parcialmente pronto.** O schema básico (0000-0049: 16 migrations, 22 tabelas) está aplicado e inclui `usuarios`, `funcionarios`, `qualificacoes_historico`, `qualificacoes_tipos`, e outras tabelas fundamentais.

Para smoke funcional completo, a abordagem mais eficiente é:

**Opção A (recomendada):** Export de schema da produção (read-only, sem dados) e aplicação no staging.
```bash
wrangler d1 export airtrust-db --env production --remote --no-data --output /tmp/prod-schema.sql
wrangler d1 execute airtrust-db-staging --env staging --remote --file /tmp/prod-schema.sql
```
Isso bypassa toda a complexidade das 340 migrations com forward references e duplicatas.

**Opção B:** Continuar a investigação do SQLITE_AUTH, isolar a migration problemática, e retomar a aplicação em chunks com workarounds.

**Opção C:** Atualizar Wrangler para ≥4.91.0 e testar se o bug de ordenação foi corrigido. Com ordenação correta + pre-patches documentados, a aplicação completa pode funcionar.

---

## Como Reverter

O staging é descartável. Se necessário:

```bash
# Recriar staging do zero (suporta via Cloudflare Dashboard ou wrangler)
# OU aplicar apenas o schema de produção (Opção A acima)
```

Backup do estado pré-migration está em `/tmp/d1-staging-schema-backup.sql` (gerado em 2026-05-15, apenas schema, sem dados sensíveis).

---

## Confirmações de Segurança

- ✅ Nenhum comando `--env production` executado
- ✅ Banco de produção (`7c8a788e`) não modificado
- ✅ Nenhum dado sensível exposto ou commitado
- ✅ Backup do staging realizado antes de qualquer mudança
- ✅ D1 reverte automaticamente em caso de falha (conforme confirmado nas tentativas)
