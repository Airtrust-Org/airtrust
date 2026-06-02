# AirTrust Data Quality Runbook v0.5

Data: 2026-06-02

## 1. Objetivo

Executar checks read-only de data quality em ambiente local ou staging, com evidencia sanitizada e sem alterar qualquer dado.

## 2. Ambientes permitidos

- local
- staging
- snapshot sanitizado
- dump local aprovado

## 3. Ambientes proibidos

- production
- D1 remoto
- qualquer banco real de cliente em producao
- qualquer caminho que exija `wrangler d1 execute --remote`

## 4. Pre-check read-only

1. Confirmar `main` alinhada com `origin/main`.
2. Rodar `bash scripts/preflight-clean-deploy.sh`.
3. Rodar `npm run ops:guard`.
4. Validar o SQL com `bash scripts/validation/validate-data-quality-sql.sh` e `npm run validate:data-quality-sql`.

## 5. Como executar local/staging

### Local

```bash
export AIRTRUST_ALLOW_DATA_QUALITY_RUN=YES
export AIRTRUST_DATA_QUALITY_TARGET=local
npm run data-quality:local
```

### Staging

```bash
export AIRTRUST_ALLOW_DATA_QUALITY_RUN=YES
export AIRTRUST_DATA_QUALITY_TARGET=staging
export AIRTRUST_DATA_QUALITY_DB_PATH=/caminho/seguro/para/staging.sqlite
npm run data-quality:local
```

Se o banco nao estiver configurado, o runner deve parar com `SKIPPED_DATA_QUALITY_RUN`.

## 6. Como registrar evidencia sanitizada

Registrar somente:

- branch e HEAD
- validacao estatica do SQL
- runner criado ou nao
- status do run
- motivo do `SKIPPED`, se houver
- categorias cobertas
- resumo agregado por check
- decisao final

Nao registrar nomes, e-mails, documentos, matriculas, registros FRMS, ASO ou saida bruta de consultas.

## 7. Como classificar achados

- `BLOCKER`: impede cliente externo ou um piloto interno seguro.
- `WARN`: nao bloqueia, mas exige remediacao.
- `INFO`: acompanhamento apenas.

## 8. O que bloqueia cliente externo

- tenant sem admin/manager
- usuario sem tenant
- funcionario sem tenant
- escala sem tenant valido
- FRMS sem dados minimos
- qualquer inconsistencia que exponha dados ou metricas de tenant incorreto

## 9. O que bloqueia piloto interno

- qualquer `BLOCKER`
- duplicidades operacionais relevantes
- status divergente que distorca metricas
- orfaos que quebrem a navegacao operacional
- inconsistencias de soft delete que contaminem dashboard

## 10. O que nunca deve ser feito

- Nao executar em producao.
- Nao executar em D1 remoto.
- Nao corrigir dados nesta fase.
- Nao criar migration.
- Nao alterar schema.
- Nao usar deploy de worker/pages.
- Nao versionar secrets.
- Nao usar `git add .`.
- Nao commitar saida bruta do SQL.
