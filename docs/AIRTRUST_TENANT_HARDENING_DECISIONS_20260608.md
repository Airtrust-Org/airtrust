# AirTrust — Decisões de Hardening Tenant (H1)

**Data**: 2026-06-08  
**Lote**: H1 — documentação e guards preventivos  
**Status**: Aplicado (sem migration, sem deploy)

---

## Histórico dos lotes de tenant isolation concluídos

| Lote | Commit | Escopo |
|---|---|---|
| A0 | `4d59c5d` | funcionario mutation ownership — WHERE id AND empresa_id |
| T1-A | `4c43084` | modelos_aeronave write restrito a admin |
| T1-B | `f963a65` | notificacoes_sistema empresa_id-scoped |
| B1+B2 | `c969162` | funcionarios fail-closed + matrícula por empresa |
| B4 | `e2ff0da` | licenças com empresa_id |
| D-lote | `fcde4cf` | frms_jornada backfill empresa_id=6 |
| F5 | `453ab5f`+`381f2d5` | catálogos por empresa (migration 0394) |

---

## Decisões de design registradas

### D1 — Catálogos são tenant-scoped por empresa

As tabelas de catálogo do domínio de qualificações e simuladores pertencem exclusivamente ao tenant:

- `manobras` — 474 rows, empresa_id=6
- `manobras_categorias` — 20 rows, empresa_id=6
- `qualificacoes_categorias` — 8 rows, empresa_id=6
- `modelos_aeronave` — 6 rows, empresa_id=6
- `habilitacoes` — 0 rows (vazia)

**Regras de acesso**:
- GET lista apenas `empresa_id = c.get('empresaId')`.
- POST grava `empresa_id` da sessão autenticada — nunca do body.
- PUT/DELETE exigem `WHERE id = ? AND empresa_id = ?`.
- Unicidade de código/nome é **por empresa**, não global.

### D2 — notificacoes_sistema: empresa_id NULL é intencional para notificações de plataforma

A tabela `notificacoes_sistema` (e a legada `notificacoes`) admite `empresa_id IS NULL` exclusivamente para notificações globais emitidas pela plataforma (ex: avisos de manutenção, atualizações de sistema). Isso **não é um vazamento** — é design explícito.

Regra: rotas de listagem de notificações por tenant filtram `empresa_id = ? OR empresa_id IS NULL`.  
Criação de notificações de tenant DEVE gravar `empresa_id`. Criação de notificações globais é privilégio de super-admin (plataforma) e NÃO está disponível via UI de tenant.

### D3 — modelos_aeronave é tenant-scoped após F5

Antes de F5, `modelos_aeronave` tinha `empresa_id DEFAULT 1` e era tratado como catálogo compartilhado. Após lote T1-A (write admin-only) e F5 (backfill + scope), ele é **tenant-scoped**. Cada empresa mantém seu próprio catálogo de modelos de aeronave.

### D4 — CPF é global, matrícula é por empresa

- **CPF** (`funcionarios.cpf`): identificador único global de pessoa física. Não é scoped por empresa — pertence ao indivíduo. Não indexar com `WHERE empresa_id`.
- **Matrícula** (`funcionarios.matricula`): identificador operacional interno. É por empresa — a mesma matrícula pode existir em dois tenants distintos sem conflito. Todas as queries de matrícula DEVEM incluir `WHERE empresa_id = ?`.

### D5 — 7 placeholders LEGACY-ORPHAN em manobras são soft-deleted e preservam FK histórica

Migration 0394 criou 7 registros `nome = "Manobra legada orfa #<id>"` / `codigo = "LEGACY-ORPHAN-<id>"` para preservar integridade referencial de fichas históricas que referenciavam manobras sem `empresa_id`.

**IDs**: 94, 136, 137, 138, 139, 140, 153  
**Estado**: `deleted_at` preenchido (invisíveis ao produto), `empresa_id=6`.  
**Cada um tem exatamente 1 ref em `ficha_manobras_avaliacao`** — fichas históricas reais.  
**Não remover** sem auditoria prévia dessas fichas.

---

## Pendências registradas

| # | Item | Risco | Decisão |
|---|---|---|---|
| P1 | `empresa_id INTEGER DEFAULT 1` em 18 tabelas legadas | Médio–Alto | Remover DEFAULT + adicionar NOT NULL via rebuild de tabela (SQLite exige isso). Pendente hardening de schema futuro. Ver inventário: `docs/AIRTRUST_EMPRESA_ID_DEFAULT1_INVENTORY_20260608.md`. |
| P2 | Platform admin F7 — super-admin sem empresa_id fixa | Médio | Necessário para gestão multi-tenant real. Não implementado ainda. |
| P3 | Saneamento LEGACY-ORPHAN | Baixo | Apenas após auditoria das 7 fichas históricas com refs. |
| P4 | Guard CI para DEFAULT 1 em novas migrations | Feito (H1) | `scripts/guard-no-new-empresa-default1.sh` — verifica migrations acima do threshold 0394. |
