# AirTrust Data Quality Evidence 2026-06-02

**Sprint:** M — Data Quality completo + Smoke com empresa esperada
**Data da execução:** 2026-06-02

## Summary

- Branch: `main`
- HEAD: `1b496afc1f7e9e1e001c5d734710dbdaf94f22d8`
- origin/main: `1b496afc1f7e9e1e001c5d734710dbdaf94f22d8`
- HEAD == origin/main: yes

## Static Validation

- SQL static validation: `PASS`
- Validator: `bash scripts/validation/validate-data-quality-sql.sh`
- NPM wrapper: `npm run validate:data-quality-sql`
- SQL file: `scripts/validation/data-quality-checks-readonly.sql` (SELECT-only confirmado)

## Runner

- Runner local: `scripts/validation/run-data-quality-local.sh`
- NPM script: `data-quality:local`
- Environment: `AIRTRUST_ALLOW_DATA_QUALITY_RUN=YES`, `AIRTRUST_DATA_QUALITY_TARGET=local`

## Data Quality Run (Sprint M — 2026-06-02)

- Status: `EXECUTED` (run local, não staging completo)
- Decisão: `PARTIAL` — runner funcional, 0 FAIL, mas 5 SKIPPED por esquema local incompleto
- Resultado agregado: `PASS=5`, `WARN=4`, `FAIL=0`, `SKIPPED=5`
- PII: `não`

### Detalhe dos checks

| check_id | category | status | note |
|---|---|---|---|
| empresa_sem_admin | TENANT_ISOLATION | SKIPPED | sql error: no such column: u.role (coluna ausente no snapshot local) |
| usuario_sem_empresa | USUARIOS_PERMISSOES | SKIPPED | sql error: no such column: u.ativo |
| usuario_multiplas_empresas_sem_primaria | USUARIOS_PERMISSOES | SKIPPED | sql error: no such column: ue.is_current |
| funcionario_duplicado_tenant | DUPLICATES | PASS | zero rows — sem duplicados cross-tenant |
| funcionario_sem_empresa | DATA_ORPHANS | PASS | zero rows — sem órfãos |
| qualificacao_duplicada | QUALIFICACOES | WARN | 45 registros — não bloqueante |
| qualificacao_planejada_orfa | DATA_ORPHANS | PASS | zero rows |
| sessao_simulador_sem_participantes | SIMULADORES | SKIPPED | missing table(s): simulador_sessoes, simulador_sessao_participantes |
| escala_sem_tenant_valido | ESCALAS_EVD | PASS | zero rows |
| alocacao_sem_escala_valida | ESCALAS_EVD | WARN | 2 registros — não bloqueante |
| alocacao_duplicada | ESCALAS_EVD | WARN | 2 registros — não bloqueante |
| status_divergente | STATUS_COMPATIBILITY | PASS | zero rows |
| registro_ativo_deleted_at_inconsistente | SOFT_DELETE | WARN | 17 registros — não bloqueante |
| frms_jornada_sem_dados_minimos | FRMS | SKIPPED | missing table(s): frms_jornadas |

### Categorias cobertas

- `TENANT_ISOLATION` — 1 SKIPPED (coluna ausente no snapshot local)
- `USUARIOS_PERMISSOES` — 2 SKIPPED (colunas ausentes no snapshot local)
- `DUPLICATES` — 1 PASS
- `DATA_ORPHANS` — 2 PASS
- `QUALIFICACOES` — 1 WARN (45 duplicadas, não bloqueante)
- `SIMULADORES` — 1 SKIPPED (tabelas ausentes no snapshot local)
- `ESCALAS_EVD` — 1 PASS, 2 WARN (2 alocações sem escala válida, 2 duplicadas)
- `STATUS_COMPATIBILITY` — 1 PASS
- `SOFT_DELETE` — 1 WARN (17 registros inconsistentes)
- `FRMS` — 1 SKIPPED (tabelas ausentes no snapshot local)

### Análise dos SKIPPED

Todos os 5 SKIPPED são por **ausência de schema no snapshot local** (colunas ou tabelas que existem em staging/produção mas não no SQLite local):

- `empresa_sem_admin`: coluna `u.role` não existe no snapshot local
- `usuario_sem_empresa`: coluna `u.ativo` não existe no snapshot local
- `usuario_multiplas_empresas_sem_primaria`: coluna `ue.is_current` não existe no snapshot local
- `sessao_simulador_sem_participantes`: tabelas `simulador_sessoes`, `simulador_sessao_participantes` ausentes
- `frms_jornada_sem_dados_minimos`: tabela `frms_jornadas` ausente

**Nenhum SKIPPED é por erro de SQL.** Todos são por cobertura parcial do snapshot local.

### Análise dos WARN

- `qualificacao_duplicada` (45): registros de qualificação possivelmente duplicados — não bloqueante, investigar em staging
- `alocacao_sem_escala_valida` (2): alocações órfãs — baixo volume
- `alocacao_duplicada` (2): possível overlap — baixo volume
- `registro_ativo_deleted_at_inconsistente` (17): soft delete inconsistente — revisar

**Nenhum WARN é bloqueante para piloto interno.**

## Decisão

- Decisão: `DATA_QUALITY_PARTIAL`
- Bloqueia cliente externo: Sim (5 checks SKIPPED por schema incompleto)
- Bloqueia piloto interno: Não (0 FAIL, WARN não bloqueantes)
- Próxima ação: Executar em staging aprovado com schema completo para zerar SKIPPED

## Guard Rails Confirmados

- Sem dados reais de produção alterados.
- Sem migration.
- Sem schema novo.
- Sem `wrangler d1 execute --remote`.
- Sem deploy.
- Sem secrets.
- Sem PII.
- Sem `git add .`.
