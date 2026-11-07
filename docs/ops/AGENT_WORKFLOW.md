# AirTrust — Fluxo rápido para ChatGPT/agentes (V7)

**Política operativa:** [FAST_RELEASE_V7.md](./FAST_RELEASE_V7.md). Este documento é somente um roteiro de execução, não uma nova camada de autorizações.

## Uma solicitação, uma execução

Quando o proprietário solicitar correção e deploy, avançar continuamente em todas as etapas autorizadas. Não perguntar "prossiga" após análise, edição, teste, PR, CI, revisão, merge ou preparação. Não abrir segunda frente para o mesmo objetivo.

1. Conferir estado real no GitHub: caso, PR/branch, HEAD/base, delta, oito checks e bloqueios. #776 é índice; abrir somente a seção relacionada.
2. Encontrar causa suficiente, modificar apenas o escopo afetado, resolver falhas equivalentes em lote. Preservar outros executores.
3. Teste focado e suíte afetada; CI oficial. `npm run agent:context` e `npm run agent:test-plan` são ferramentas **opcionais** para execução local, nunca precondições da conversa.
4. Merge pelo contrato vigente. Não suspender trabalho independente durante checks. Não repetir trabalho concluído no SHA idêntico.
5. Staging conforme classificação de risco e guardas do release. No deploy, congelar SHA candidato, componentes e dependências pertinentes.
6. Autorização SHA/artefato/escopo-específica: se já válida, usar; se ausente, pedir apenas uma decisão final após preparar tudo. Nunca assumir que mera presença de GitHub Environment comprova required reviewer.
7. Workflow oficial de produção, health/versão/proveniência e caso real. Reportar resultado em uma mensagem com PR/SHA, checks, ambiente e eventual bloqueio.

## Segurança intacta

Oito gates, branch protection, autenticação/RBAC, isolamento tenant, Schema V2, integridade de dados, recuperação e trilha de release permanecem obrigatórios. Sem SQL remoto improvisado nem scripts legados.

## Onde buscar detalhes, apenas quando relevantes

- CI atual: `.github/workflows/ci.yml`, `heavy-ci.yml`, `scripts/ci/verify-release-gates.mjs`.
- Produção: `.github/workflows/deploy-airtrust.yml`, `docs/PRODUCTION_DEPLOY_RUNBOOK.md`.
- Staging: `.github/workflows/deploy-staging.yml`.
- Schema: `.github/workflows/apply-schema-change-v2.yml`, `worker-airtrust/schema-v2/`.
- Índice: `docs/ops/RUNBOOK_INDEX.md`.

GitHub é a memória operacional durável. Não reconstituir histórico em cada conversa.
