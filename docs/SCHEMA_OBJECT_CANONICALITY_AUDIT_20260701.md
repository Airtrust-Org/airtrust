# Schema Object Canonicality Audit — Baseline Pre-0412

| Campo | Valor |
|---|---|
| **Data** | 2026-07-01 |
| **Ambiente** | Produção (read-only) |
| **Database** | `airtrust-db` (`7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`) |
| **Objetivo** | Classificar objetos do schema de produção para baseline schema-only |
| **Método** | Consultas `sqlite_master`, `PRAGMA`, `pragma_foreign_key_list` — sem DML, sem export de linhas |
| **Documentos de referência** | `docs/adr/0002-airtrust-schema-baseline-strategy.md`, `docs/MIGRATION_CHAIN_DR_STAGING_NO_GO_20260701.md` |

---

## Metodologia

1. Consultas read-only contra produção via `wrangler d1 execute --env production --remote --command --json`.
2. Extração de `sqlite_master.type`, `name`, `sql`, `tbl_name` para cada objeto (table, view, index, trigger).
3. Identificação de objetos com nomes suspeitos: `backup`, `_backup`, `tmp`, `temp`, `old`, `legacy`, `bkp_`, `__`.
4. Verificação de dependências via:
   - `pragma_foreign_key_list()` para FKs de/para objetos suspeitos.
   - Varredura textual de `sql` em views e triggers que referenciam objetos suspeitos.
5. Nenhuma linha de dados foi exportada. Nenhuma instrução DML foi emitida.

---

## Inventário resumido

| Tipo | Quantidade |
|---|---|
| **Tabelas** (excluindo `sqlite_sequence`, `sqlite_stat1`, `d1_migrations`, `_cf_%`) | 249 |
| **Views** | 10 |
| **Triggers** | 44 |
| **Indexes** | 860 |
| **Total** | 1.011 |

---

## Status da migration 0412 na produção

| Objeto/Coluna | Presente na produção? |
|---|---|
| `qualificacoes_formatos` (tabela) | **NÃO** |
| `qualificacoes_tipos.formato_id` | **NÃO** |
| `qualificacoes_tipos.categoria_id` | **NÃO** |
| `qualificacoes_tipos.classe_requisito` | **NÃO** |
| `qualificacoes_historico.formato_id` | **NÃO** |
| `qualificacoes_historico.formato_codigo` | **NÃO** |
| `qualificacoes_historico.categoria_id` | **NÃO** |
| `qualificacoes_historico.categoria_codigo` | **NÃO** |
| `lms_cursos.formato_id` | **NÃO** |

**Conclusão**: a produção está no estado pré-0412. O baseline pode ser gerado sem incluir a `0412`. A `0412` será aplicada separadamente depois.

---

## Objetos suspeitos — inventário detalhado

### Tabelas de backup/residual/legado

| Nome | Tipo | Padrão suspeito | DDL resumido |
|---|---|---|---|
| `_backup_qh_tmp` | table | `_backup` + `_tmp` | FK para `funcionarios_backup` (tabela não existe em `sqlite_master`) |
| `_data_recovery_log` | table | `_` prefix | Log de recuperação |
| `_qualificacoes_enriquecimento` | table | `_` prefix | Dados de enriquecimento de qualificações |
| `_qualificacoes_mapping` | table | `_` prefix | Mapeamento de IDs |
| `backups` | table | `backup` | Backup de dados |
| `backups_controle` | table | `backup` | Controle de backups. FK para `usuarios`. Referenciado por view `vw_backups_monitoramento` |
| `backups_logs` | table | `backup` | Logs de backup. FK para `backups_controle` |
| `bkp_qual_historico_20260325` | table | `bkp_` | Backup pontual de `qualificacoes_historico` |
| `bkp_qual_tipos_20260325` | table | `bkp_` | Backup pontual de `qualificacoes_tipos` |
| `funcionarios_tmp` | table | `_tmp` | Tabela temporária de funcionários |
| `legacy_funcionarios` | table | `legacy` | Funcionários legados (pré-refactor) |
| `legacy_import_log` | table | `legacy` | Log de importação legado |
| `legacy_qualificacoes_historico` | table | `legacy` | Histórico de qualificações legado |
| `legacy_qualificacoes_tipos` | table | `legacy` | Tipos de qualificação legados |
| `migracao_log` | table | `migracao` | Log de migração |
| `migracao_mapeamento_ids` | table | `migracao` | Mapeamento de IDs de migração |
| `qualificacoes_tipos_backup_0063` | table | `backup` | Backup da migration `0063` |
| `qualificacoes_tipos_backup_20251128` | table | `backup` | Backup pontual de tipos |
| `qualificacoes_tipos_id_map` | table | `_id_map` | Mapeamento de IDs de tipos |
| `qualificacoes_tipos_old` | table | `_old` | Tabela antiga de tipos. Referenciada por triggers `update_qt_timestamp` e `trg_qualificacoes_tipos_prevent_hard_delete` |
| `schema_versions` | table | `schema_versions` | Controle de versão de schema (legado, anterior ao `d1_migrations`) |
| `sqlite_sequence` | table | `sqlite_` | SQLite interno (auto-increment tracking) |
| `sqlite_stat1` | table | `sqlite_` | SQLite interno (estatísticas de query planner) |
| `pessoas_auditoria_acessos` | table | — | Auditoria de acessos (pode ser canônico — confirmar) |
| `pessoas_papeis` | table | — | Papéis de pessoas (pode ser canônico — confirmar) |

### Views e triggers que referenciam objetos suspeitos

| Objeto | Tipo | Referencia | Impacto no baseline |
|---|---|---|---|
| `vw_backups_monitoramento` | view | `backups_controle` | Se `backups_controle` for excluído, view quebra. |
| `update_qt_timestamp` | trigger | `qualificacoes_tipos_old` | Se `qualificacoes_tipos_old` for excluído, trigger quebra. |
| `trg_qualificacoes_tipos_prevent_hard_delete` | trigger | `qualificacoes_tipos_old` | Se `qualificacoes_tipos_old` for excluído, trigger quebra. |
| `trg_apply_reclassification` | trigger | `qualificacoes_historico_reclass_queue` | Referencia tabela canônica de reclassificação — pode ser necessário. |
| `vw_tripulante_operacional` | view | `funcionarios` (não suspeito) | Falso positivo — o LIKE capturou `guerra` no corpo da view, mas não há dependência de objeto suspeito. |

---

## Matriz de dependências

### FKs de objetos suspeitos

| Tabela | FK para | Coluna | Ref coluna | Risco |
|---|---|---|---|---|
| `_backup_qh_tmp` | `funcionarios_backup` (NÃO EXISTE) | `funcionario_id` | `id` | **BLOQUEANTE** — FK para tabela ausente |
| `backups_controle` | `usuarios` | `restaurado_por` | `id` | Normal (canônico) |
| `backups_controle` | `usuarios` | `usuarios_id` | `id` | Normal (canônico) |
| `backups_logs` | `backups_controle` | `backups_controle_id` | `id` | Cadeia de backup (residual) |

### FKs para objetos suspeitos — NENHUMA tabela canônica referência objetos suspeitos.

### Views que referenciam objetos suspeitos

| View | Objeto referenciado | Classificação do objeto |
|---|---|---|
| `vw_backups_monitoramento` | `backups_controle` | Residual (monitoramento de backup — não é core) |

### Triggers em objetos suspeitos

| Trigger | Tabela | Tipo | DML no corpo |
|---|---|---|---|
| `update_qt_timestamp` | `qualificacoes_tipos_old` | `AFTER UPDATE` | `UPDATE qualificacoes_tipos_old` |
| `trg_qualificacoes_tipos_prevent_hard_delete` | `qualificacoes_tipos_old` | `BEFORE DELETE` | `SELECT RAISE(ABORT)` |

---

## Classificação proposta

### CANÔNICO (incluir no baseline)

Todos os objetos não listados abaixo. Aproximadamente **225 tabelas**, **10 views**, **44 triggers**, **860 indexes** canônicos.

### LEGADO NECESSÁRIO (incluir — referenciado por objeto canônico)

Nenhum objeto suspeito foi classificado como LEGADO NECESSÁRIO com base na análise de dependências. Nenhuma tabela canônica referência objetos backup/legacy/temp.

### RESIDUAL EXCLUÍVEL (excluir do baseline)

| Objeto | Justificativa |
|---|---|
| `_backup_qh_tmp` | Backup temp com FK para tabela ausente (`funcionarios_backup`). Residual comprovado. |
| `_data_recovery_log` | Log de recuperação — não é referenciado por nenhum objeto canônico. |
| `_qualificacoes_enriquecimento` | Tabela de enriquecimento — não referenciada. |
| `_qualificacoes_mapping` | Tabela de mapeamento — não referenciada. |
| `backups` | Backup — não referenciado por objeto canônico. |
| `backups_controle` | Controle de backup — referenciado apenas por `vw_backups_monitoramento` (view não canônica). Pode ser excluído junto. |
| `backups_logs` | Log de backup — depende de `backups_controle`. Pode ser excluído junto. |
| `bkp_qual_historico_20260325` | Backup pontual de Mar/2025 — residual. |
| `bkp_qual_tipos_20260325` | Backup pontual de Mar/2025 — residual. |
| `funcionarios_tmp` | Temporária — residual. |
| `legacy_funcionarios` | Legado — não referenciado por objeto canônico. |
| `legacy_import_log` | Legado — não referenciado. |
| `legacy_qualificacoes_historico` | Legado — não referenciado. |
| `legacy_qualificacoes_tipos` | Legado — não referenciado. |
| `migracao_log` | Log de migração histórica — não referenciado. |
| `migracao_mapeamento_ids` | Mapeamento de migração — não referenciado. |
| `qualificacoes_tipos_backup_0063` | Backup de migration — residual. |
| `qualificacoes_tipos_backup_20251128` | Backup pontual — residual. |
| `qualificacoes_tipos_id_map` | Mapeamento de IDs — não referenciado. |
| `qualificacoes_tipos_old` | Tabela antiga — triggers residuais dependem dela, mas nenhum objeto canônico. |
| `schema_versions` | Controle de versão legado (anterior ao `d1_migrations`) — residual. |
| `sqlite_sequence` | SQLite interno — não exportar. |
| `sqlite_stat1` | SQLite interno — não exportar. |
| `d1_migrations` | Ledger de migrations — não exportar (será recriado pelo fluxo oficial). |

**Views e triggers residuais** (excluir do baseline):

| Objeto | Justificativa |
|---|---|
| `vw_backups_monitoramento` | View de monitoramento de backup — residual. |
| `update_qt_timestamp` | Trigger em `qualificacoes_tipos_old` — residual. |
| `trg_qualificacoes_tipos_prevent_hard_delete` | Trigger em `qualificacoes_tipos_old` — residual. |

### BLOQUEANTE

| Objeto | Razão |
|---|---|
| `_backup_qh_tmp` | FK para `funcionarios_backup` que **não existe** em `sqlite_master`. Isso indica um objeto que referencia uma tabela já removida. O wrapper atual exclui `_backup%` e `%_tmp` por padrão, então não deve aparecer no baseline. **Requer revisão humana para confirmar que a FK quebrada não indica perda de dados.** |

### DESCONHECIDO

Nenhum objeto permanece sem classificação suficiente após a auditoria.

---

## Política de baseline

### Incluir no baseline

1. **Tabelas canônicas** — todas as tabelas de produção que não se enquadram nas categorias de exclusão abaixo.
2. **Views canônicas** — todas as views de produção, exceto as explicitamente excluídas.
3. **Triggers canônicos** — todos os triggers, exceto triggers residuais que operam exclusivamente em tabelas residuais.
4. **Índices canônicos** — todos os índices, exceto `sqlite_autoindex_*` (são implícitos de UNIQUE/PK e serão recriados pela DDL).
5. **`d1_migrations`** — NÃO incluir. O ledger será alimentado pelo fluxo oficial após baseline.

### Excluir do baseline

Ver lista "RESIDUAL EXCLUÍVEL" acima.

### Regras de exclusão automática (para o wrapper)

1. `name LIKE '%backup%'` → excluir, a menos que revisão humana aprove.
2. `name LIKE 'bkp_%'` → excluir.
3. `name LIKE '%_tmp'` → excluir.
4. `name LIKE 'tmp_%'` → excluir.
5. `name LIKE 'temp_%'` → excluir.
6. `name LIKE '%_old'` → excluir.
7. `name LIKE 'legacy_%'` → excluir.
8. `name = '_backup_qh_tmp'` → excluir (tem FK quebrada).
9. `name = '_data_recovery_log'` → excluir.
10. `name = 'schema_versions'` → excluir.
11. `name = 'd1_migrations'` → excluir.
12. `name LIKE 'sqlite_%'` → excluir (SQLite interno).
13. `name LIKE '_cf_%'` → excluir (Cloudflare interno).
14. Triggers cuja tabela base foi excluída → excluir.

### Bloqueios para baseline

- Não há bloqueio operacional conhecido se:
  - O wrapper aplicar as regras de exclusão da política acima.
  - O wrapper validar que nenhum objeto canônico depende de objeto residual.
  - O wrapper falhar fechado (abortar) se encontrar DML proibido no DDL exportado.
- A FK quebrada `_backup_qh_tmp → funcionarios_backup` **é dívida técnica histórica**:
  - Indica uma tabela (`funcionarios_backup`) que existia em produção mas foi removida sem limpar a FK dependente.
  - Não bloqueia o baseline porque `_backup_qh_tmp` será excluído do baseline pelas regras de exclusão.
  - **Deve ser registrada como dívida a sanear futuramente** (avaliar se a FK quebrada causa erros em runtime ou é inerte).

---

## Relação com a migration 0412

| Pergunta | Resposta |
|---|---|
| O baseline deve excluir `qualificacoes_formatos`? | **Sim, mas é irrelevante** — a tabela não existe em produção. O baseline é naturalmente pré-0412. |
| O baseline deve excluir colunas da `0412` se já existirem em produção? | **Não se aplica** — as colunas não existem em produção. |
| Por que `wrangler d1 migrations apply` NÃO aplicará só a `0412` após baseline? | Com ledger vazio, o Wrangler tentará aplicar a cadeia inteira de migrations (`0001` → atual), que já sabemos que quebra em `0060` por `f.nome_guerra`. **A `0412` NÃO será a primeira migration aplicada.** É preciso definir explicitamente o mecanismo de ledger pós-baseline. |
| Como evitar que o baseline esconda a validação da `0412`? | O baseline é exclusivamente DDL pré-0412. A smoke staging pós-`0412` validará as novas colunas. |

### Estratégia de ledger pós-baseline

Com o baseline DDL aplicado e o ledger `d1_migrations` vazio, aplicar a `0412` exige uma das opções abaixo:

#### Opção A — Aplicar `0412` por arquivo específico após baseline

- Aplicar apenas a `0412` via `wrangler d1 execute --file`.
- **Prós**: simples para validação do PR #216; sem risco de replay da cadeia.
- **Contras**: não alimenta o ledger `d1_migrations`; migrations futuras após a `0412` não serão gerenciadas pelo fluxo oficial.
- **Adequação**: validação pontual do PR #216 em staging. Não escala para produção.

#### Opção B — Ledger bootstrap formal (marca o baseline pré-0412)

- Inserir entradas no `d1_migrations` para todas as migrations de `0001` a `0411` que estão cobertas pelo baseline DDL.
- Após bootstrap, `wrangler d1 migrations apply` detecta que só a `0412` (e seguintes) estão pendentes.
- **Prós**: ledger íntegro; fluxo `wrangler d1 migrations apply` funciona normalmente da `0412` em diante.
- **Contras**: operação delicada — requer lista correta de nomes de migrations, ordem exata, e execução controlada sem duplicação.
- **Adequação**: cenário preferido para staging oficial e eventual produção.

#### Opção C — Pasta/fluxo separado para migrations pós-baseline

- Criar diretório `worker-airtrust/migrations-post-baseline/` contendo apenas a `0412` e migrations futuras.
- Configurar `migrations_dir` diferente no `wrangler.toml` para ambientes baseados em baseline.
- **Prós**: separação limpa entre histórico (não replayável) e futuro.
- **Contras**: dois diretórios de migrations; overhead de governança; `wrangler.toml` com bindings divergentes.
- **Adequação**: overkill para o cenário atual. Pode ser reavaliado no futuro.

**Recomendação para o próximo passo**: Opção B (ledger bootstrap) para staging, com execução controlada documentada no runbook `docs/STAGING_REBUILD_FROM_SCHEMA_BASELINE_RUNBOOK.md`. A lista de migrations cobertas pelo baseline deve ser extraída do `d1_migrations` de produção (read-only), que contém o ledger real e correto.

---

## Recomendação

**GO para preparar wrapper/estratégia de baseline; NO-GO para execução operacional até resolver ledger pós-baseline.**

### Pré-requisitos bloqueantes antes da execução do baseline

1. **[ ]** Melhorar o wrapper `scripts/export-d1-schema-only.sh`:
   - [ ] Incluir triggers no baseline (com filtro de DML perigoso).
   - [ ] Corrigir query de suspeitos — separar `all_objects` de `suspicious_objects` com query precisa (esta auditoria usou análise manual para compensar a imprecisão).
   - [ ] Adicionar detecção de FK quebrada como warning.
   - [ ] Validar que objetos excluídos não são referenciados por objetos canônicos.
   - [ ] Falhar fechado: abortar se DML proibido for encontrado no DDL exportado.
   - [ ] Não gerar baseline final automaticamente — a saída deve ser revisada por humano antes da aplicação.

2. **[ ]** Definir e documentar mecanismo de ledger pós-baseline:
   - Recomendação: Opção B (ledger bootstrap formal com lista de migrations do ledger de produção).
   - Lista de migrations de `0001` a `0411` deve ser extraída do `d1_migrations` de produção (read-only).

3. **[ ]** Revisão humana do DDL exportado antes da aplicação em staging.

### Passos subsequentes (fora desta etapa)

- Gerar baseline DDL contra produção (read-only, usando wrapper corrigido).
- Criar D1 staging novo.
- Aplicar baseline via `wrangler d1 execute --file`.
- Fazer bootstrap do ledger `d1_migrations` com migrations `0001`–`0411`.
- Aplicar `0412` via `wrangler d1 migrations apply`.
- Deploy worker + frontend staging.
- Smoke staging.
- Decisão GO/NO-GO para produção.

---

## Artefatos gerados

| Arquivo | Conteúdo | Qualidade |
|---|---|---|
| `/tmp/airtrust-schema-object-audit-20260701/all_objects.json` | Todos os 1.011 objetos do schema de produção | Confiável — fonte `sqlite_master` |
| `/tmp/airtrust-schema-object-audit-20260701/suspicious_objects.json` | **⚠️ IMPRECISO** — a query usada capturou todos os 1.011 objetos por limitação da cláusula `WHERE`. NÃO usar como artefato final de "suspeitos". Regenerar com query corrigida antes do baseline real. | **Impreciso** — falsos positivos massivos |
| `/tmp/airtrust-schema-object-audit-20260701/suspicious_table_names.txt` | Nomes de todas as tabelas (query ampla demais) | Impreciso — lista de todas as tabelas, não só suspeitas |
| `/tmp/airtrust-schema-object-audit-20260701/suspicious_ddl.json` | DDL das 21 tabelas suspeitas (lista manual) | Confiável — composta manualmente |
| `/tmp/airtrust-schema-object-audit-20260701/dependent_views_triggers.json` | 5 views/triggers que referenciam objetos suspeitos | Confiável — query textual direcionada |
| `/tmp/airtrust-schema-object-audit-20260701/dependent_object_ddl.json` | DDL completo dos 5 objetos dependentes | Confiável |
| `/tmp/airtrust-schema-object-audit-20260701/suspicious_fks.json` | 4 FKs de/para tabelas suspeitas | Confiável |

**Recomendação**: antes do baseline real, o wrapper deve separar `all_objects` de `suspicious_objects` com query precisa. Esta auditoria usou análise manual para compensar a imprecisão da coleta automática.

---

## Confirmações

- ✅ Nenhum dado pessoal exportado
- ✅ Nenhuma instrução DML emitida
- ✅ Nenhuma migration aplicada
- ✅ Nenhum deploy executado
- ✅ Nenhuma alteração mutável em produção
- ✅ Nenhum D1 criado
- ✅ `wrangler.toml` sem diff
- ✅ PR #168 intocado
- ✅ `scripts/export-d1-schema-only.sh` não foi commitado
