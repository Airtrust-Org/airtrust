# AirTrust — Inventário: empresa_id INTEGER DEFAULT 1

**Data**: 2026-06-08  
**Gerado por**: grep em `worker-airtrust/migrations/` (read-only)  
**Threshold de corte para novos guards**: migration 0394 (último aplicado em produção)

> Este documento lista tabelas afetadas pelo padrão `empresa_id INTEGER DEFAULT 1` introduzido
> durante o processo de multi-tenantização inicial (migrations 0161–0165).
> O DEFAULT 1 significa que INSERTs sem `empresa_id` explícito silenciosamente vão para empresa 1.
> Remover este default exige rebuild de tabela em SQLite/D1 — pendente hardening futuro.

---

## Migrations históricas com DEFAULT 1

### 0161_multi_tenant_empresas.sql (origem principal)

| Tabela | Risco | Observação |
|---|---|---|
| `funcionarios` | **ALTO** | PII — nome, CPF, dados pessoais. Lote B1/B2 já adicionou WHERE empresa_id nas rotas. |
| `qualificacoes_historico` | **ALTO** | Dados operacionais críticos — certificações históricas por funcionário. |
| `certificacoes` | **ALTO** | Definições de certificação por empresa. |
| `certificados` | **ALTO** | Documentos emitidos — PII + regulatório. |
| `fichas_sessao` | **ALTO** | Fichas de avaliação de simulador — dados operacionais + assinaturas. |
| `aeronaves` | **MÉDIO** | Catálogo operacional — aeronaves registradas por empresa. |
| `modelos_sessao` | **MÉDIO** | Catálogo — modelos de sessão de simulador. |
| `tipos_sessao` | **MÉDIO** | Catálogo — tipos de sessão de simulador. |
| `pasta_virtual` | **MÉDIO** | Estrutura de pastas de documentos por funcionário/empresa. |
| `arquivos` | **MÉDIO** | Metadados de arquivos/documentos enviados. |
| `importacoes_log` | **BAIXO** | Log de importações — auditoria interna. |
| `notificacoes` | **BAIXO** | Notificações legadas — empresa_id NULL intencional para globais (ver D2). |
| `auditoria` | **BAIXO** | Auditoria de ações — empresa_id=1 em registros pré-multi-tenant é esperado. |

### 0165_migrate_to_costa_do_sol.sql

| Tabela | Risco | Observação |
|---|---|---|
| `documentos` | **MÉDIO** | Documentos de funcionários. |
| `qualificacoes_tipos` | **MÉDIO** | Tipos de qualificação — catálogo por empresa. |
| `setores` | **MÉDIO** | Setores organizacionais por empresa. |
| `funcoes` | **MÉDIO** | Funções/cargos por empresa. |
| `modelos_aeronave` | ~~MÉDIO~~ **RESOLVIDO** | Backfill F5 + scope por empresa (migration 0394). |

### Migrations de canonical schema com DEFAULT 1

| Migration | Tabela afetada | Risco | Observação |
|---|---|---|---|
| 0176 | `certificados` | ALTO | Schema canônico — mesma tabela já listada. |
| 0200 | `qualificacoes_historico` | ALTO | Rebuild parcial — mesma tabela. |
| 0325 | (tabela de histórico expandida) | ALTO | Semestral expand — mesma família. |
| 0388 | `documentos` | MÉDIO | Schema canônico de documentos com DEFAULT 1. |

---

## Tabelas únicas afetadas (consolidado)

```
ALTO RISCO (PII / dados operacionais):
  funcionarios
  qualificacoes_historico
  certificacoes
  certificados
  fichas_sessao

MÉDIO RISCO (catálogos / docs):
  aeronaves
  modelos_sessao
  tipos_sessao
  pasta_virtual
  arquivos
  documentos
  qualificacoes_tipos
  setores
  funcoes

RESOLVIDO (F5):
  modelos_aeronave

BAIXO RISCO (infra / auditoria):
  importacoes_log
  notificacoes  (NULL intencional para globais)
  auditoria
```

Total: **18 tabelas** com DEFAULT 1 ainda ativo no schema de produção (excluindo modelos_aeronave resolvida).

---

## Plano de remoção (futuro)

SQLite não suporta `ALTER TABLE ... ALTER COLUMN`. Para remover DEFAULT 1:

1. Criar tabela nova `tabela_new` com `empresa_id INTEGER NOT NULL`.
2. `INSERT INTO tabela_new SELECT ... FROM tabela WHERE empresa_id IS NOT NULL`.
3. Verificar contagem.
4. `DROP TABLE tabela`.
5. `ALTER TABLE tabela_new RENAME TO tabela`.
6. Recriar índices e FKs.

**Prioridade de execução sugerida**:
1. `funcionarios` — maior risco PII, rotas já protegidas.
2. `qualificacoes_historico` + `fichas_sessao` — dados operacionais core.
3. Catálogos (`qualificacoes_tipos`, `setores`, `funcoes`, `modelos_sessao`, `tipos_sessao`).
4. Docs/infra (`documentos`, `pasta_virtual`, `arquivos`, `importacoes_log`, `auditoria`).

**Não executar sem**: revisão de FK dependentes, testes de regressão completos, janela de manutenção.

---

## Guard CI

O script `scripts/guard-no-new-empresa-default1.sh` (adicionado no lote H1) verifica automaticamente
se novas migrations acima de 0394 introduzem `empresa_id.*DEFAULT 1`.
Integrado em `npm run lint` via `guard:empresa-default1`.
