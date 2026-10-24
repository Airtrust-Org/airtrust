# AirTrust — AGENTS.md (execução rápida e revisão por risco)

AirTrust é um SaaS multi-tenant de aviação com dados reais. Otimize por
**correção verificável e menor retrabalho**; velocidade nunca justifica bypass
de segurança, testes, branch protection, schema ou autorização.

## Autoridade e contexto mínimo

- `Airtrust-Org/airtrust`, `main`: autoridade de código, PRs e releases.
  GitHub Actions: CI oficial; Cloudflare: staging/produção. GCB: contingência,
  não bypass; GitLab/CircleCI: legados.
- Estado vivo do GitHub (código, checks, proteções e workflows) prevalece sobre
  documentação/snapshots. Instruções canônicas V6/V3 seguem aplicáveis.
- `docs/ops/RUNBOOK_INDEX.md`, `docs/ops/AGENT_WORKFLOW.md` e `CLAUDE.md`
  são referências **sob demanda**, nunca leitura integral obrigatória.

**Ao iniciar ou retomar uma tarefa:** localizar caso e PR/branch existente;
consultar `main`/base, HEAD, último SHA revisado, diff, checks e falhas
pertinentes. A issue `#776` é apenas índice vivo: não reler centenas de
comentários; a PR e seus checks são a evidência primária. Reutilizar a frente
existente. Mesmo SHA = mesma evidência: não repetir auditoria/teste PASS sem
mudança invalidante. Se `main` avançar, revisar somente o delta relevante.

**GitHub-first:** fazer busca, leitura, edição, diff, PR, checks e workflows no
GitHub quando suportado. Local/Remote Desktop somente para teste/build,
reprodução de browser/offline/service worker, arquivo local ou limitação
comprovada do conector. Não usar Mac para leitura/edição GitHub simples.
Agentes externos só por limitação técnica objetiva. Se houver acesso local,
conferir `~/SAAS/Airtrust`, `origin`, status, HEAD e `origin/main`, preservando
alterações alheias. Nunca `reset`, `clean`, `stash`, force-push ou `git add .`
indiscriminados. `npm run agent:context` e `npm run agent:test-plan` são
ferramentas locais **opcionais**, não bootstrap de toda sessão.

## Fast Lane — fazer, testar, concluir

`caso/erro → causa suficiente → correção coerente → teste focado →
suíte afetada → gates necessários → integração governada → staging/aceite
se aplicável → produção somente com autorização específica`

- Congelar escopo ao achar causa suficiente; não converter bug em auditoria.
- Corrigir ocorrências da **mesma causa em lote** antes do próximo CI.
- Não executar suíte ampla com teste focado falhando, nem rerodar CI sem
  delta/justificativa; jamais elevar baseline/ratchet para ficar verde.
- Após duas falhas equivalentes, mudar de método. Distinguir bug real de
  falha de sessão, seletor, infraestrutura ou timeout.
- Não abrir logs verdes nem fazer polling constante. Usar resultados por SHA.
  Transformar regressões manuais repetitivas em testes automatizados.
- Durante CI, continuar trabalho independente no mesmo escopo sem modificar
  o SHA candidato congelado ou colidir com outro executor.
- Prosseguir até conclusão segura ou **bloqueio real**; não parar em relatório.

## Padrão de implementação

Preservar contratos de API, UX, compatibilidade e dados. Corrigir causa, não
sintoma; seguir helpers e padrões existentes. Evitar refatoração lateral,
dependência nova ou mudança cosmética sem necessidade. Validar inputs,
propagar erros reais e não fabricar sucesso, progresso nem dados operacionais.

- **Backend:** autenticação/autorização no servidor, RBAC, escopo tenant/
  `empresa_id` (ou contrato equivalente), SQL parametrizado, auditoria e
  logs sem PII/secrets. Testar permitido/negado/cross-tenant nas mudanças
  sensíveis. Rotas públicas exigem allowlist/controles específicos.
- **Frontend:** `fetchWithAuth`/fluxo canônico, invalidação de cache no
  tenant switch, estados offline/sync e service worker quando afetados.
- **LMS/SCORM:** preservar matrícula/ciclo, score, `lesson_status`,
  `suspend_data`, commit/finish, conclusão e autorização de assets. Não
  sintetizar resultado ou remover proteção para resolver CORS/404.
- **FRMS/EVD/SIGVOOS/Pilot App:** ausência de dados não significa zero,
  segurança ou sincronização bem-sucedida. Preservar integridade operacional,
  idempotência e casos offline/online aplicáveis.

## Revisão automática de PR (Codex)

Priorizar bugs **introduzidos ou expostos pelo delta**, não comentários
cosméticos. Inspecionar principalmente:
1. Segurança: vazamento cross-tenant, auth/RBAC, rota pública, secrets/PII,
   write D1/R2 ou migration sem proteção.
2. Regressões: API, LMS→Qualificações→Certificados,
   Escalas/EVD→FRMS→SIGVOOS, offline→sync→XML, persistência e ciclo.
3. Confiabilidade: perda de estado, concorrência, idempotência, erro
   mascarado e recuperação.

Cada finding precisa de **linha, condição concreta, impacto, evidência e
correção/teste sugerido**. Separar confirmação de hipótese. Não reabrir finding
resolvido no SHA atual. Se nada material for comprovável, dizer isso sem
afirmar que release está aprovada. Lint e formatação pertencem à CI.

## CI, deploy e limites inegociáveis

Oito gates oficiais (confirmar contrato vivo): `lint`,
`build-content-gates`, `worker-typecheck`, `frontend-coverage`,
`worker-tests-1`, `worker-tests-2`, `lms-smoke`, `public-e2e`.

Antes de merge: conferir HEAD/base, mergeabilidade, gates, dependências e
branch protection; confirmar nova `main` após merge. Uma frente = PR/branch
e executor coordenado. Paralelizar apenas trabalho independente; serializar
merge/deploy no mesmo ambiente, schema/migrations e writes D1/R2.

Staging usa workflow governado, secrets sintéticos do GitHub Environment
`staging` e validação **real** do caso; consultar
`docs/ops/STAGING_CREDENTIAL_CONTRACT.md` somente quando aplicável.
Nunca levar credenciais para chat, `.env` versionado, logs ou commits.
Migration versionada ≠ aplicada: Schema V2 requer manifest, hashes,
baseline, plan, recovery, ledger e postchecks quando aplicável.
Não improvisar SQL remoto, seed, import, backfill ou escrita sem governança.

**Produção:** só com autorização explícita, atual e específica para SHA,
artefato e escopo, workflow oficial e pós-validação. PR, CI, merge e staging
não provam produção. Nunca contornar proteções nem usar scripts históricos
como atalho.

## Checkpoint e encerramento

Registrar marco material na PR/issue específica e na linha da frente de
`#776` quando aplicável: `objetivo | PR/branch | HEAD | último SHA revisado |
causa | mudança | testes/checks | ambiente | bloqueio | próxima ação |
não autorizado`. Evitar relatórios repetidos. Distinguir **comprovado,
executado, não executado e bloqueado**; jamais inventar teste, autorização,
migração, merge, deploy ou aceite.
