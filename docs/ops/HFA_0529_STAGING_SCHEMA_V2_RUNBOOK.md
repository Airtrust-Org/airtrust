# HFA 0529 — aplicação governada em staging

## Escopo e autoridade

Esta etapa habilita **somente** a mudança aditiva `hfa-integration-bridge-0529` no D1 **staging**. Código do bridge HFA/RELPREV já foi integrado pela PR #1138, mas merge/CI não significam schema aplicado nem conexão HFA habilitada. A aplicação requer o workflow oficial `.github/workflows/staging-apply-schema-v2.yml` na `main`.

## Pré-condições de execução

1. Integrar a PR do guard 0529 pela branch protection, com os oito gates oficiais aprovados no SHA de candidata.
2. Usar o **SHA exato da `main` protegida após o merge**, vinculado à PR que realizou a integração do guard. O caminho para PR **merged** é aceito apenas para `hfa-integration-bridge-0529`, se `merge_commit_sha == release_sha == main`; PR aberta deve ter `head.sha == release_sha`. Fonte e destino da PR devem ser o mesmo repositório e `main`.
3. Verificar que o Environment `staging` está autorizado e que existe credencial de migração D1 de staging. Nunca escrever credenciais em comments ou logs.
4. Congelar a janela exclusiva `airtrust-staging-mutations-and-scorm-qa`; não disputar esse mutex com SCORM/FRMS/Pilot.
5. Guard deve validar `confirmation=AIRTRUST_STAGING_SCHEMA_V2`, `change_id=hfa-integration-bridge-0529`, `pr_number`, `release_sha` e razão explícita. Não executar migration por CLI/SQL avulso.

## Verificações exigidas do próprio workflow

- Manifesto `hfa-integration-bridge-0529.json` com hash SQL `09d17ed2551b6d63ccd01677eb47cd7bb758c295784df4f1afaead06e1dc62f4` e hash plan `2d71bcd602959a320fc3dc223ba127c07f53b3394608f235b4cdf2e0fd9222dd`.
- D1 staging fixo e diferente de produção; baseline Schema V2 ACTIVE; mudança não aplicada; `empresas`, `sgso_relatos` e colunas tenant existentes; nenhuma das duas tabelas, três indexes ou dois triggers 0529 já presentes.
- Recovery-point D1 Time Travel capturado e validado antes de qualquer SQL.
- Após apply, ledger `change_id/baseline_id/file_hash/plan_hash/github_sha` exato, duas tabelas, três índices, dois triggers de isolamento tenant, nenhuma linha nas novas tabelas e contagem de `sgso_relatos` inalterada.

## Aceite funcional posterior (não executado por esta PR)

Publicar Worker/Pages de staging somente pelo workflow governado de staging e na janela apropriada; confirmar o segredo `HFA_INTEGRATION_ENCRYPTION_KEY` no Environment e obter token HFA **sintético/autorizado** fora do repositório. Pela UI autenticada, configurar empresa de QA e enviar RELPREV não sensível duas vezes para comprovar idempotência, refresh de status e zero análises/créditos. Validar negativo cross-tenant. Desligar integração ou aplicar compensação governada em caso de falha, sem `DROP` remoto improvisado.

**Não autorizado nesta etapa:** migração/deploy de produção, envio de relato real, início de análise HFA, escrita sem grant, rotacionar tokens, deploy fora do workflow ou concluir aceite funcional sem QA física.
