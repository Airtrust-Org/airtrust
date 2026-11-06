# HFA 0529 — governança de produção (Schema V2)

## Objetivo e escopo

Aplicar **somente** o bridge aditivo `hfa-integration-bridge-0529` em produção, após confirmação real do D1 e autorizações específicas. O código SGSO/RELPREV→HFA chegou à `main` pela PR #1138; isso **não** comprova tabelas aplicadas, segredo disponível, integração habilitada ou sincronização operacional.

O Pilot App da PR #1781 foi incorporado à `main` de 24/10/2026. A presença de ambos os módulos no release não autoriza exportação automática de relatos, mudança de tenant, inicialização de análise HFA nem uso de créditos.

## Contrato imutável

- Change ID: `hfa-integration-bridge-0529`
- Baseline: `production-d1-baseline-v2-20260714`
- SQL: `worker-airtrust/schema-v2/changes/0529_hfa_integration_bridge.sql`
- SQL SHA-256: `09d17ed2551b6d63ccd01677eb47cd7bb758c295784df4f1afaead06e1dc62f4`
- Plan SHA-256: `2d71bcd602959a320fc3dc223ba127c07f53b3394608f235b4cdf2e0fd9222dd`
- D1 production: `airtrust-db`, nunca `airtrust-db-staging-baseline-20260701`
- Mutação autorizada pelo mecanismo: **uma** mudança Schema V2, com SQL e ledger no bundle revisado. Nenhum seed, backfill ou exportação de RELPREV.

## Verificações e sequência obrigatórias

1. **Estado vivo:** confirmar `main` e SHA final, PRs incluídas, 8 gates oficiais no mesmo SHA, janela de produção, ausência de migrations/write concorrentes, segredos e aprovação do Environment `production`. Comparar o snapshot contra a última versão publicada.
2. **Produção somente leitura:** executar `.github/workflows/production-release-readonly-preflight.yml` com SHA exato, sem converter o resultado em autorização de escrita. Verificar o contrato e a existência/ausência de 0529 no D1 real; evidência histórica de staging não serve.
3. **Admissão de schema:** utilizar somente `.github/workflows/apply-schema-change-v2.yml`, em `main`, `change_id=hfa-integration-bridge-0529`, `expected_sha=<SHA exato da main>` e `confirm_production=AIRTRUST_PRODUCTION`, após aprovação específica da mudança. Não usar `wrangler d1 migrations apply`, `--file` manual nem o workflow legado `deploy-airtrust.yml` para schema.
4. **Preflight físico antes da primeira gravação:** `validate-0529-production-preflight.sh` exige baseline ativo, ledger 0529 ausente, `empresas` e `sgso_relatos` com colunas de tenant, ausência de ambas as tabelas HFA, três índices e dois triggers. Captura a contagem inicial de RELPREVs para comparação pós-apply. Se 0529 já existe ou houver instalação parcial: **NO-GO**, sem reaplicar.
5. **Recovery obrigatório:** o workflow salva ledger e captura D1 Time Travel imediatamente antes do bundle atômico. Qualquer falha aborta a aplicação e exige procedimento de recuperação governado.
6. **Postchecks antes de declarar schema aplicado:** `validate-0529-production-postconditions.sh` comprova linha de ledger com `github_sha` e hashes exatos, duas tabelas, três índices, dois triggers tenant, colunas obrigatórias e ausência de registros novos. A contagem de `sgso_relatos` deve coincidir com a captura preflight. Falha significa **NO-GO** para publicar.
7. **Release completo:** somente após aprovação e readback do schema, usar `.github/workflows/deploy-airtrust.yml` na `main` com `expected_sha` exato, `deploy_worker=true`, `deploy_pages=true`, `run_migrations=false`. O release publica a `main` completa, não apenas Pilot ou HFA.
8. **Pós-release:** exigir proveniência SHA, manifest e Worker bundle, smoke `/api/version`, `/api/health`, paridade Worker/Pages e integridade de autenticação. Validar HFA apenas com conexão/tenant autorizado e um RELPREV **sintético**, verificando idempotência, segregação cross-tenant e zero análise/crédito. Não transmitir relatos reais durante QA sem autorização operacional específica.

## Segurança e rollback

O SQL é aditivo, inicialmente sem configuração por empresa; a API só sincroniza após credenciamento e ação deliberada de gestor/admin. O segredo `HFA_INTEGRATION_ENCRYPTION_KEY` é dedicado e não deve aparecer em commits, logs ou issues. Falta do segredo ou do token HFA não autoriza enfraquecer criptografia.

Rollback de Worker/Pages só pelo procedimento oficial. Tabelas HFA aditivas podem permanecer vazias/inativas. **Não fazer DROP remoto nem desfazer ledger manualmente**; se houver falha estrutural, usar recuperação Schema V2 governada e registrar o incidente antes de qualquer novo deploy.

## Estado de execução

Este documento e os scripts específicos **não são comprovação de aplicação do schema**. A execução depende de PR integrada, gates, revisão da situação física do banco, grants e workflow oficial. Sempre registrar SHA, manifests, recovery, ledger, resultados e evidência de produção na PR/issue de coordenação #776.
