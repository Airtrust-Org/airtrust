# AirTrust — AGENTS.md | V7 Fast Release

**Regra operacional:** `docs/ops/FAST_RELEASE_V7.md`. Corrigir e entregar com autonomia. A solicitação inicial do proprietário autoriza a preparação completa no escopo; **não** implica autorização irrestrita de produção, schema ou writes de dados reais. Não interromper para "prossiga" enquanto houver trabalho seguro e autorizado.

## Estado e ferramentas

- Autoridade: GitHub `Airtrust-Org/airtrust`, `main`. CI: GitHub Actions. Cloudflare: runtime. GCB: fallback de CI, nunca bypass. GitLab/CircleCI: legado.
- Começar pelo caso real, PR/branch existente, HEAD/base, último SHA revisado, diff, testes/checks pertinentes. Issue #776 é índice, não leitura integral obrigatória. Mesmo SHA reutiliza evidências válidas.
- GitHub-first. Acesso local/Remote Desktop apenas quando teste, build, browser, arquivos locais ou limitação da integração exigirem. Não delegar a outro agente por volume.
- Preservar branches e worktrees de outros executores. Sem reset/clean/stash, force-push, `git add .` ou refatoração fora do escopo de modo indiscriminado.

## Execução

`causa suficiente → correção em lote → teste focado → suíte afetada → oito gates → merge governado → ambiente autorizado → validação real`

- Não reiniciar auditorias, inspecionar logs verdes, repetir CI sem delta ou pollar por rotina. Corrigir falhas da mesma causa em lote; após duas falhas equivalentes, mudar o método.
- Testes proporcionais: **baixo** (texto/layout isolado) permite dispensar staging se contrato permitir; **médio** (API, matrícula/visibilidade LMS, regra de negócio) exige regressão e staging quando necessário; **alto** (auth, RBAC, tenant, conclusão LMS, certificados, D1/R2, schema, escrita crítica) exige testes negativos e controles de staging/recovery aplicáveis.
- Os oito gates obrigatórios são `lint`, `build-content-gates`, `worker-typecheck`, `frontend-coverage`, `worker-tests-1`, `worker-tests-2`, `lms-smoke` e `public-e2e`. Não alterar baseline/ratchet nem enfraquecer branch protection.
- Após checks/review/dependências satisfeitos, merge pelo processo governado. Desenvolvimento de outras branches pode continuar; serializar merge/deploy conflitante e mutações de schema/dados.

## Segurança e domínio

- Backend autentica e autoriza; escopo tenant/`empresa_id` (ou contrato equivalente) na consulta; SQL parametrizado; RBAC fail-closed; logs sem PII/secrets. Mudanças sensíveis testam permitido, negado e cross-tenant.
- Frontend preserva `fetchWithAuth`, cache por tenant, retry controlado, offline/sync e service worker quando afetados.
- LMS/SCORM preserva matrícula/ciclo, progresso, score, `lesson_status`, `suspend_data`, commit/finish, conclusão e autorização de assets. Não fabricar evidência de conclusão.
- FRMS/EVD/SIGVOOS/Pilot App: dados ausentes não são zero, conformidade ou sincronização bem-sucedida; preservar integridade operacional e idempotência.

## Produção e autorização única

Aprovação de produção, quando exigida, deve estar vinculada a **SHA, artefato e escopo exatos**. Preparar tudo antes de solicitar uma única decisão final. Aprovação pelo GitHub Environment é válida somente quando houver política/identidade/escopo efetivamente verificáveis; não presumir requisitos de reviewer. Usar o workflow oficial, guardar proveniência, versionamento, health e validação do caso real. Schema V2, recovery e execução governada para qualquer migration/write remoto; nenhum script histórico ou SQL ad hoc.

## Revisão e fechamento

Revisar riscos introduzidos pelo delta (segurança, regressão, dados, corrida, resiliência), não observações cosméticas. Findings exigem linha, condição, impacto, evidência e teste proposto. Comunicar só marcos materiais. Registrar na PR causa, alteração, teste, SHA, status do ambiente e bloqueio, se houver; atualizar #776 apenas quando necessário. **PR verde não é deploy**. Não inventar execução nem aprovação.

Referências técnicas sob demanda: `CLAUDE.md`, `docs/ops/AGENT_WORKFLOW.md`, `docs/ops/RUNBOOK_INDEX.md`; workflows e proteções atuais prevalecem.
