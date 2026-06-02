# AirTrust Data Quality Evidence 2026-06-02

## Summary

- Branch: `main`
- HEAD local: `11b9d44abf11f8f6b98fb53f0864dafab4a9987c`
- origin/main: `11b9d44abf11f8f6b98fb53f0864dafab4a9987c`
- HEAD == origin/main: yes

## Static Validation

- SQL static validation: `PASS`
- Validator: `bash scripts/validation/validate-data-quality-sql.sh`
- NPM wrapper: `npm run validate:data-quality-sql`

## Runner

- Runner local criado: `sim`
- Script: `scripts/validation/run-data-quality-local.sh`
- NPM script: `data-quality:local`
- Environment used: `AIRTRUST_ALLOW_DATA_QUALITY_RUN=YES`, `AIRTRUST_DATA_QUALITY_TARGET=local`

## Data Quality Run

- Status: `SKIPPED`
- Motivo: cobertura parcial do snapshot local atual; algumas tabelas nao existem no banco local usado pelo runner e alguns checks retornaram erro de compatibilidade de colunas no snapshot.
- Resultado agregado: `PASS=5`, `WARN=4`, `FAIL=0`, `SKIPPED=5`
- PII: `nao`

## Categorias Cobertas

- `TENANT_ISOLATION`
- `USUARIOS_PERMISSOES`
- `QUALIFICACOES`
- `SIMULADORES`
- `ESCALAS_EVD`
- `STATUS_COMPATIBILITY`
- `SOFT_DELETE`
- `DATA_ORPHANS`
- `DUPLICATES`
- `FRMS`

## Checks Sanitizados

- PASS: `funcionario_duplicado_tenant`, `funcionario_sem_empresa`, `qualificacao_planejada_orfa`, `escala_sem_tenant_valido`, `status_divergente`
- WARN: `qualificacao_duplicada`, `alocacao_sem_escala_valida`, `alocacao_duplicada`, `registro_ativo_deleted_at_inconsistente`
- SKIPPED: `empresa_sem_admin`, `usuario_sem_empresa`, `usuario_multiplas_empresas_sem_primaria`, `sessao_simulador_sem_participantes`, `frms_jornada_sem_dados_minimos`

## Decision

- Decision: `DATA_QUALITY_READY_FOR_LOCAL_STAGING`
- Next action: ampliar o snapshot local ou apontar um staging aprovado com esquema completo para reduzir os checks `SKIPPED`.

## Guard Rails Confirmed

- Sem dados reais alterados.
- Sem migration.
- Sem schema novo.
- Sem `wrangler d1 execute --remote`.
- Sem deploy.
- Sem secrets.
- Sem PII.
- Sem `git add .`.
