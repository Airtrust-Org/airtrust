# AirTrust — Data Quality and Migration Integrity Audit v0.5

**Data:** 2026-06-04  
**Branch:** `main`  
**HEAD base:** `d08adf387e9e83feab11c9abbb358d8853956429`  
**Modo:** auditoria local/read-only com guards permanentes, sem D1 remoto, sem deploy, sem backfill e sem editar migrations históricas.

---

## 1. Veredito

| Stream | Status | Motivo |
|---|---|---|
| `MIG-01` | `BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE` | a cadeia histórica não foi curada nem reescrita; existe estratégia e gate, mas o gate de execução bloqueou por falta de target, snapshot, rollback, aprovação e comando revisado |
| `DQ-01` | `BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE` | os riscos, o lote controlado, o contrato e o gate existem; o gate de execução bloqueou por falta de ambiente controlado real |

---

## 2. Correções e guards aplicados

| Área | Mudança | Evidência |
|---|---|---|
| Governança de migrations | criado guard que pina prefixos duplicados, nomes fora do padrão, uso histórico de `CREATE TEMP TABLE` e `PRAGMA foreign_keys = OFF` | `worker-airtrust/src/__tests__/migrations/migration-governance.test.ts` |
| Replay SIGVOOS | prova local já existente preservada para o caso `0354 -> 0387` com/sem bootstrap | `worker-airtrust/src/__tests__/migrations/sigvoos-base-tables-schema.test.ts` |
| Runtime sem DDL | guard amplo de DDL/runtime preservado, sem reabrir o stream R01/R04/R09 | `worker-airtrust/src/__tests__/architecture/no-runtime-ddl-hot-paths.test.ts` |
| Simuladores `GET /instrutores` | consulta passou a exigir `empresa_id = ?` | `worker-airtrust/src/routes/simuladores-sessoes.ts`, `worker-airtrust/src/__tests__/routes/simuladores-sessoes-data-quality.test.ts` |
| Simuladores participantes | leitura, criação, update e delete agora validam sessão e funcionário no tenant atual antes de escrever | `worker-airtrust/src/routes/simuladores-sessoes-participantes.ts`, `worker-airtrust/src/__tests__/routes/simuladores-sessoes-data-quality.test.ts` |
| Simuladores checks | lookup da sessão e fallback de `qualificacoes_tipos` passaram a respeitar `empresa_id` | `worker-airtrust/src/routes/simuladores-sessoes-participantes.ts`, `worker-airtrust/src/__tests__/routes/simuladores-sessoes-data-quality.test.ts` |
| Arquitetura/performance | crescimento de God files e concentração de `.prepare(` agora ficam pinados por guard | `worker-airtrust/src/__tests__/architecture/architecture-performance-guard.test.ts` |

---

## 3. MIG-01 — Evidência consolidada

### 3.1 Inventário canônico atual

| Métrica | Valor |
|---|---|
| Arquivos `.sql` em `worker-airtrust/migrations/` | `360` |
| Prefixos duplicados | `30` |
| Arquivos fora do padrão `NNNN_snake_case.sql` | `3` |
| Maior prefixo regular atual | `0388` |
| Sentinel reservado fora da cadeia regular | `9999_add_modelo_sessao_id_to_agendamentos.sql` |

**Arquivos fora do padrão pinados pelo guard:**
- `0098-indices-performance.sql`
- `132_add_funcionario_ativo.sql`
- `purge-soft-deleted-qualificacoes.sql`

### 3.2 Irregularidades históricas aceitas, mas não resolvidas

| Tipo | Evidência | Situação |
|---|---|---|
| Prefixos duplicados | 30 grupos duplicados no diretório canônico | aceitos apenas como histórico; novos casos agora quebram o guard |
| Construtos hostis ao runner | `CREATE TEMP TABLE` confinado a `0062_consolidate_ssot_preserve_data.sql` e `0091_restore_diversidade_qualificacoes.sql` | documentado e pinado |
| Rebuilds com `PRAGMA foreign_keys = OFF` | 16 migrations históricas ainda usam esse padrão | documentado e pinado |
| Sentinel fora da cadeia regular | `9999_add_modelo_sessao_id_to_agendamentos.sql` | mantido como exceção explícita |

### 3.3 Riscos reais de replay/ordenação

| Caso | Evidência | Impacto | Estado |
|---|---|---|---|
| `0058 -> 0059` | o relatório histórico de staging documenta falha do runner remoto ao criar a view antes da coluna `nome_guerra` existir | replay limpo pode divergir do estado incremental já aplicado | documentado; não reproduzível de forma fiel com `sqlite3` local |
| `0354 -> 0387` | teste local já versionado prova que a cadeia limpa SIGVOOS quebra antes de `0387` sem bootstrap | ambientes novos não podem depender apenas da ordem histórica | mitigado por `scripts/bootstrap-new-environment.sql`; dívida histórica permanece |
| Prefixos duplicados | o runner oficial trata filenames como distintos, mas a governança fica ambígua e difícil de auditar | risco de shadowing humano e replay frágil | agora guardado; não saneado |

### 3.4 Scripts fora do fluxo padrão

Os seguintes pontos permanecem como evidência de governança legada e exigem revisão explícita se forem reutilizados:

- `worker-airtrust/package.json`: scripts `d1:migrate:*` e `d1:seed:*`
- `worker-airtrust/scripts/aplicar-migration-0091-seguro.sh`
- `scripts/validation/audit-deploy-scripts.sh` como inventário/auditoria de uso de `migrations apply`

**Conclusão MIG-01:** a cadeia não está “curada”. O projeto tem material suficiente para execução controlada, mas a etapa final rodou o gate e confirmou ausência de ambiente aprovado. Status atual: `BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`.

---

## 4. DQ-01 — Evidência consolidada

| Área | Regra de integridade | Evidência | Correção segura nesta fase | Teste |
|---|---|---|---|---|
| Simuladores instrutores | listagem não pode misturar funcionários de outros tenants | `GET /instrutores` lia `funcionarios` sem `empresa_id` | filtro por tenant adicionado | `simuladores-sessoes-data-quality.test.ts` |
| Simuladores participantes | leitura por sessão deve falhar fechado fora do tenant | endpoints usavam `sessao_id`/`id` sem checar empresa da sessão | sessão passou a ser validada via `simulador_agendamentos.empresa_id` | `simuladores-sessoes-data-quality.test.ts` |
| Simuladores create participante | insert não pode aceitar `funcionario_id` de outro tenant | criação não validava pai (`sessao`) nem referência (`funcionario`) no tenant | validação prévia de sessão + funcionário no tenant atual | `simuladores-sessoes-data-quality.test.ts` |
| Simuladores update/delete participante | updates/deletes críticos não podem operar só por `id` | `PUT`/`DELETE /participantes/:id` eram resolvidos apenas por `id` | update/delete agora vinculam `id + sessao_id` após lookup tenant-scoped | `simuladores-sessoes-data-quality.test.ts` |
| Simuladores checks | fallback de checks não pode puxar `qualificacoes_tipos` de outro tenant | sessão era lida sem tenant e o fallback não filtrava `qt.empresa_id` | sessão e fallback tenant-scoped | `simuladores-sessoes-data-quality.test.ts` |
| Data Quality operacional | runner ainda precisa de ambiente com schema completo | `PASS=5 WARN=4 FAIL=0 SKIPPED=5` continua sendo a melhor evidência operacional local | nenhuma escrita real feita; backlog mantido | `validate-data-quality-sql.sh`, `data-quality:local` histórico |

**Conclusão DQ-01:** os caminhos críticos corrigidos nesta fase deixam de depender de integridade “implícita” entre sessão, participante, instrutor e tipo de check. A trilha de execução tem gate fail-closed, mas a etapa final confirmou ausência de ambiente aprovado. Status atual: `BLOCKED_BY_CONTROLLED_ENVIRONMENT_NOT_AVAILABLE`.

---

## 5. O que exigirá migration futura

| Item | Tipo |
|---|---|
| Rebaseline/squash da cadeia histórica de migrations | migration governance / schema baseline |
| Eventual limpeza da allowlist histórica (`9999`, nomes fora do padrão, duplicatas) | reorganização controlada da cadeia, não correção incremental simples |

## 6. O que exigirá backfill futuro

| Item | Tipo |
|---|---|
| Execução completa de Data Quality em snapshot/staging com schema aprovado | auditoria operacional |
| Saneamento de qualquer órfão ou inconsistência histórica que o runner completo encontrar | backfill/manual remediation separado |

---

## 7. Riscos residuais

- `MIG-01` continua exigindo uma execução controlada separada antes de ser tratado como encerrado.
- `DQ-01` continua bloqueado até existir snapshot aprovado, rollback explícito e autorização operacional para um lote de saneamento.
- `ARCH-01` agora está mitigado por guard, mas ainda exige refatoração gradual para reduzir a concentração real de SQL e tamanho dos módulos.
- Nenhuma dessas pendências foi mascarada com apply remoto, migration nova ou limpeza manual de dados.

---

## 8. Próxima etapa grande recomendada

1. Executar auditoria independente Opus pós-ciclo sobre a matriz, os gates e o relatório final.
2. Provisionar staging, snapshot e rollback explícito para `DQ-01`, depois rerodar o gate fail-closed.
3. Executar `DQ-01` primeiro e `MIG-01` apenas depois, em janela separada de rebaseline controlado com corte, rollback e validação estrutural explícitos.
