# AirTrust — CLAUDE.md | Guia de implementação

**Operação e release:** seguir `AGENTS.md` e `docs/ops/FAST_RELEASE_V7.md`. Para uma solicitação de correção/deploy, executar de ponta a ponta **as etapas permitidas**, sem pedir confirmações intermediárias. Commits em branch e PR de trabalho estão dentro da preparação autorizada; produção/schema/writes exigem suas autorizações específicas quando aplicáveis.

## Autoridade

`Airtrust-Org/airtrust`/`main` é a fonte de código. GitHub Actions executa os oito gates oficiais; Cloudflare hospeda Worker/Pages/D1/R2. GCB somente fallback de CI. Verificar estado vivo, não aplicar receitas antigas sobre workflow novo. Local/Mac apenas por necessidade técnica objetiva.

## Stack e localização

- Frontend: React 19, Router 7, Vite, TanStack Query, Zustand. Entrada: `src/react-app/main.tsx`. Alias `@` aponta para `src`.
- Backend: Cloudflare Worker/Hono, D1/SQLite com `DB.prepare` parametrizado, R2 para arquivos. Entradas atuais devem ser verificadas em `worker-airtrust/src/index.ts` e `worker-airtrust/src/environment-entrypoint.ts`.
- Testes: Vitest/Node e Playwright, conforme o módulo. Comandos usuais: `npm run lint`, `npm run build`, `npm run test:run`, `npm run test:worker`. Consultar `package.json` atual antes de execução; `npm run agent:test-plan` é **opcional**.

## Invariantes

- API privada exige auth + tenant + RBAC no backend; o frontend não concede permissões. Consultas tenant-owned incluem `empresa_id` ou escopo equivalente e binds SQL, conforme contrato real. Rotas públicas são exceções restritas. Nunca presumir hierarquia fixa de roles sem ler guards atuais.
- Frontend usa transporte canônico de auth e invalidação de cache por tenant; cuidar de service worker e operação offline.
- LMS/SCORM não fabrica conclusão/progresso; preservar ciclo, score, `lesson_status`, `suspend_data` e autorização de assets.
- FRMS/EVD/Pilot App/SIGVOOS preservam origem/confiança de dados, sincronização, idempotência e integridade operacional.
- Não registrar tokens, secrets ou PII em logs/commits/chat.

## Schema e deploy

Migrations históricas em `worker-airtrust/migrations/` **não** devem ser reaplicadas por rotina. Para alteração moderna, consultar `worker-airtrust/schema-v2/` e usar o workflow governado `apply-schema-change-v2.yml` ou sucessor, com hashes, ledger, recovery e pós-condições. Não usar comandos diretos de Wrangler para produção como atalho.

Produção: workflow `.github/workflows/deploy-airtrust.yml` ou sucessor e autorização atual para SHA/artefato/escopo exatos. Verificar os oito gates e proteção da `main`. Staging proporcional ao risco, jamais dispensado quando exigido pelo contrato ou pela operação. Pós-deploy valida versão, saúde, proveniência e fluxo real. Não equiparar merge a publicação.

## Fluxo mínimo

Encontrar PR existente → inspecionar apenas delta/erro → corrigir causa em lote → teste focado/suíte afetada → CI → merge governado → publicação autorizada → pós-validação. Evitar reler a issue #776 integralmente e não repetir auditorias válidas do mesmo SHA. Comunicação em marcos relevantes, não em cada passo.

Detalhes sob demanda: `docs/ops/RUNBOOK_INDEX.md`; código e workflows vigentes sempre prevalecem sobre texto histórico.
