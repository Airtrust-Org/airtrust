# Homologação staging — checks individuais de Simuladores (Frente 7, #1548)

Procedimento reproduzível para provar, com banco, Worker, frontend e PDF **físicos de staging**, os três
cenários obrigatórios. Nenhuma execução deste procedimento autoriza migration, deploy ou produção.

## Pré-condições (todas obrigatórias, verificadas pelo próprio workflow)

1. PR #1558 integrada e Worker + Pages de **staging** implantados com o SHA exato (`/api/version` e frontend).
2. Schema V2 aplicado fisicamente no D1 de staging, **em ordem e em dois runs**, por
   `staging-apply-schema-v2.yml`: `simulator-individual-check-evidence-0554` → `simulator-individual-check-delete-guard-0560`
   (autorização específica por SHA/change/banco, Time Travel, hashes, ledger). O seed recusa executar se o ledger
   físico não contiver as duas mudanças.
3. Janela de staging livre: o workflow usa o lock `airtrust-staging-mutations-and-scorm-qa`
   (não rodar durante a janela do Player 3/SCORM/Schema V2).
4. Identidade QA sintética `QA_EXAMINER_ADMIN_*` do Environment `staging` (tenant `qa_examiner_training`).
   Nunca usar credenciais pessoais nem dados reais de tripulantes.

## Execução

```bash
gh workflow run staging-simulator-individual-check-qa.yml --repo Airtrust-Org/airtrust --ref main \
  -f confirmation=AIRTRUST_STAGING_SIMULATOR_INDIVIDUAL_CHECK_QA \
  -f expected_deployed_sha=<SHA_IMPLANTADO_EM_STAGING> \
  -f pr_number=1558
```

Jobs: `guard` (proveniência/8 gates/SHA vivo) → `d1_fixture` (seed + manifesto numérico) → `browser`
(Playwright) → `d1_cleanup` (sempre) → `summary`.

## Fixture sintético (`scripts/staging/seed-qa-simulator-individual-check.mjs`)

| Cenário | Ficha | Fluxo exercitado | Resultado esperado |
|---|---|---|---|
| A | assinatura do instrutor pendente | **modal** (`Assinar` → canvas → `✓ APROVADO` → check `✓ Aprovado`) | `APROVADO`, FAP com validade, PDF 200 |
| B | assinatura do instrutor pendente + FAP prematura indevida | **inline** (`?mode=sign&papel=INSTRUTOR`), sessão **APROVADA** mas check **Reprovado** | `REPROVADO`, nenhuma FAP ativa, FAP prematura revogada (soft) com auditoria |
| C | finalizada, sem avaliação individual | somente leitura | `PENDENTE_AVALIACAO`, sem FAP/certificado |
| D | finalizada, sem avaliação individual | seção **Confirmar resultados individuais**, com falha de rede + retry | 1ª tentativa não grava; retry grava uma única vez |

Segurança/recuperação no mesmo spec: dupla submissão (idempotente, sem 2º `201`), contradição (`409`), concorrência
(todas `409`), `DELETE` físico (`404/405`), nova sessão de login (A/B/C idênticos), outra identidade QA/tenant
(`401/403/404` em leitura e escrita), recarga de página.

## Limpeza e evidência sem PII

- O rollback faz **soft-delete** de fichas, agendamento, checks, FAP, funcionários e tipo sintéticos e desvincula o login QA.
- Evidências individuais confirmadas são **imutáveis** e protegidas contra `DELETE` físico (0554/0560): permanecem como
  linhas órfãs sintéticas por desenho. O relatório e o manifesto contêm apenas IDs numéricos.
- Artefatos: manifesto numérico (3 dias) e `results.json` do Playwright (14 dias). Sem trace, screenshot, vídeo, e-mail
  ou senha.

## Validação local equivalente (sem staging)

```bash
cd worker-airtrust
npx vitest run src/__tests__/routes/simuladores-individual-check-staging-seed.sqlite.test.ts \
  src/__tests__/routes/simuladores-checks-individuais.sqlite.test.ts \
  src/__tests__/routes/simuladores-check-evidence.sqlite.test.ts
cd .. && node --test scripts/__tests__/staging-simulator-individual-check-workflow.test.mjs
npx playwright test --config=e2e/simuladores-individual-check.config.ts --list
```

O teste de seed executa o SQL do fixture e as **rotas reais** contra o esquema do repositório com 0554/0560 aplicados.
Isso prova a lógica; **não** substitui a homologação física: a aprovação só é declarada com a execução verde do workflow.
