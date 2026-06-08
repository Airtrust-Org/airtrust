# AirTrust — Decisão: Catálogos são Tenant-Scoped por Empresa

**Data**: 2026-06-08  
**Contexto**: Lote F5 — isolamento de catálogos de qualificação/simulador  
**Status**: Aplicado em produção (migration 0394, commit 381f2d5)

---

## Decisão

Os catálogos de referência do domínio de qualificações e simuladores são **scoped por empresa** — cada tenant possui sua própria cópia dos dados de catálogo, isolada das demais.

### Tabelas afetadas

| Tabela | Coluna | Estado atual (produção) |
|---|---|---|
| `manobras` | `empresa_id NOT NULL` | 474 rows — empresa 6 |
| `manobras_categorias` | `empresa_id NOT NULL` | 20 rows — empresa 6 |
| `qualificacoes_categorias` | `empresa_id NOT NULL` | 8 rows — empresa 6 |
| `modelos_aeronave` | `empresa_id NOT NULL` | 6 rows — empresa 6 |
| `habilitacoes` | `empresa_id NOT NULL` | 0 rows (vazia) |

---

## Regras de acesso obrigatórias

Qualquer rota que toque essas tabelas DEVE seguir estas regras:

1. **GET (listagem)** — filtrar por `empresa_id = c.get('empresaId')`. Nunca retornar catálogo de outra empresa.
2. **POST (criação)** — gravar `empresa_id` a partir da sessão autenticada (`c.get('empresaId')`). Nunca aceitar `empresa_id` do body ou query string.
3. **PUT/DELETE (mutação)** — condição `WHERE id = ? AND empresa_id = ?` obrigatória. Retornar 404 se o item não pertencer ao tenant.
4. **Unicidade** — constraints de unicidade (ex: código de manobra) são por empresa, não globais.
5. **Nunca usar `empresa_id` do body/query** para isolar dados — sempre usar o contexto de autenticação.

---

## Histórico da migration

- **Migration 0394** (`worker-airtrust/migrations/0394_scope_catalogs_by_empresa.sql`):
  - Backfill de `empresa_id` nas 5 tabelas de catálogo para `empresa_id = 6` (único tenant com dados).
  - Criação de 7 placeholders soft-deleted `LEGACY-ORPHAN-{id}` para preservar FKs históricas em `ficha_manobras_avaliacao` que referenciavam manobras sem `empresa_id`.
  - Aplicada em produção em 2026-06-08T17:51:41Z.

- **Commits F5**:
  - `453ab5f` — rotas de catálogo passam a filtrar/gravar por `empresa_id` da sessão.
  - `381f2d5` — migration 0394 preserva FKs órfãs via placeholders.

### Placeholders LEGACY-ORPHAN

7 manobras soft-deleted com `nome = "Manobra legada orfa #<id>"` e `codigo = "LEGACY-ORPHAN-<id>"`:

- IDs: 94, 136, 137, 138, 139, 140, 153
- Todas `empresa_id = 6`, todas com `deleted_at` preenchido (invisíveis ao produto).
- Cada uma tem 1 referência em `ficha_manobras_avaliacao` — registros históricos preservados.
- **Não remover** sem auditoria das fichas históricas. Saneamento futuro requer decisão explícita.

---

## Próximos hardenings (pendentes)

| # | Item | Risco |
|---|---|---|
| P1 | Remover `DEFAULT 1` de `empresa_id` nas tabelas de catálogo e principais | Médio — INSERT sem `empresa_id` silently vai para empresa 1 |
| P2 | Platform admin F7 — super-admin sem empresa_id fixa | Médio — necessário para gestão multi-tenant real |
| P3 | Saneamento dos 7 placeholders LEGACY-ORPHAN | Baixo — apenas quando as fichas históricas forem revisadas |

---

## Rationale

Catálogos globais (compartilhados entre tenants) foram descartados porque:
- Diferentes empresas podem ter manobras homônimas com semânticas distintas.
- Controle de versão de catálogo por empresa é mais simples do que versionamento global com override por tenant.
- Isolamento completo elimina a classe de bugs onde catálogo de empresa A contamina resultados de empresa B.
