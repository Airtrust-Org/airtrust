# AIRTRUST_OPERATIONAL_SCOPE_HARDENING_AND_SCALE_READINESS_20260621

## Veredito

SEGURO PARA PR `DRAFT`

Nao `ready` em `2026-06-21` porque:

- o pacote local passou em testes, `lint` e `build`;
- o smoke publico passou;
- o probe `D1` remoto de staging passou em modo read-only;
- o smoke autenticado continua sem credencial aprovada nesta execucao (`AUTHENTICATED_SESSION_UNAVAILABLE`);
- a validacao live cross-tenant autenticada continua incompleta.

## Ambiente e guardrails

- producao: nao alterada
- migration/schema: nao
- SQL remoto em producao: nao
- deploy producao: nao
- SIGVOOS: NO-GO
- SegVoo: nao tocado

## Matriz de bloqueios consolidados

| area | rota/funcao | risco | leitura/escrita/cache | perfil afetado | risco multiempresa | correcao aplicada | teste obrigatorio | status final |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Simuladores/Sessoes | `GET /simuladores/sessoes/:id` | detalhe reaplicava tenant/perfil de forma insuficiente | leitura | gestor setorial, aluno, instrutor | exposicao indevida intra-tenant e acoplamento fraco ao guard global | revalidacao de escopo por tenant + setor + participacao; payload filtrado para perfis participantes; queries filhas reforcadas com `empresa_id` | `simuladores-sessoes-scope`, `simuladores-sessoes-schema-compat`, `simuladores-sessoes-legacy-characterization` | corrigido |
| Simuladores/Fichas | `GET /simuladores/sessoes/:id/fichas` e `/fichas*` | fichas nao revalidavam escopo setorial/participacao de forma suficiente | leitura | gestor setorial, aluno, instrutor | exposicao de fichas de participante fora do escopo | fail-closed por setor para gestor; filtros por ficha propria para perfis participantes; tenant reforcado nas queries | `simuladores-fichas-scope`, `simuladores-fichas-tenant-write`, `simuladores-sessoes-scope` | corrigido |
| Simuladores/Sessoes | `POST /simuladores/sessoes` | escrita permissiva demais para perfis autoescopados | escrita | gestor setorial, usuario comum | criacao de sessao fora do escopo com participantes de outro setor | validacao de tenant para simulador/aeronave/vinculos; escrita setorial restrita a funcionarios totalmente dentro do escopo; perfis autoescopados passam a falhar fechado | `simuladores-sessoes-scope`, `simuladores-sessoes-legacy-characterization` | corrigido |
| LMS Cursos | `POST/PUT /lms/cursos` | escrita nao seguia o mesmo contrato setorial da leitura | escrita | gestor setorial | alteracao de curso fora do escopo permitido | enforcement de setores efetivos do curso; fallback staging sem tabelas setoriais fecha com `403` para perfil restrito; `admin` preservado | `lms-cursos-beta-contract`, `lms-cursos-schema-compat` | corrigido |
| Qualificacoes/Historico | `GET /qualificacoes/historico/stats-extended` | cache compartilhava escopo insuficiente | cache | admin, gestor, usuarios com escopos distintos | reuse de stats entre usuarios/escopos diferentes | cache key, `scope_hash` e `ETag` agora incluem empresa, usuario interno, perfil, funcionario do contexto, modo de acesso e escopo setorial efetivo | `qualificacoes-historico-renovadas`, `qualificacoes-historico-certificados-fallback` | corrigido |
| Employee Sector Access | service transversal | fallback permissivo em schema drift | leitura/escrita | gestor setorial, self scope | ampliacao indevida em staging antigo | mantido fail-closed; sem alteracao global de auth/RBAC/tenant | `employee-sector-access`, `funcionarios-tenant-isolation` | mantido seguro |
| Compatibilidade staging | ausencia de tabelas/colunas setoriais | schema drift | leitura/escrita | gestor setorial | risco de fallback virar allow-all | mantido fail-closed em LMS/qualificacoes/simuladores; sem migration | `lms-cursos-schema-compat`, `simuladores-sessoes-schema-compat` | mitigado |
| Escalas/FRMS/Central | impacto indireto | regressao operacional adjacente | leitura/escrita | operacao empresa 6 | impacto em seletor, dashboard e deep link | pacote validado com testes adjacentes de dashboard e DR local | `dashboard-metrics-integrity`, `backup-restore-drill` | sem regressao local |

## Correcoes aplicadas

- `worker-airtrust/src/routes/simuladores-sessoes.ts`
  - endurecimento de `POST /sessoes`;
  - reaplicacao de escopo em `GET /sessoes/:id`;
  - reaplicacao de escopo em `GET /sessoes/:id/fichas`;
  - reforco defensivo de `empresa_id` em queries filhas.
- `worker-airtrust/src/routes/simuladores-fichas.ts`
  - escopo setorial para `GET /fichas`, `GET /fichas/:id` e `POST /fichas`;
  - fail-closed para perfis fora de gestao quando a escrita nao e propria do escopo.
- `worker-airtrust/src/routes/lms-cursos.ts`
  - alinhamento de escrita com leitura setorial;
  - preservacao de `admin`;
  - fail-closed seguro em staging sem tabelas auxiliares.
- `worker-airtrust/src/routes/qualificacoes/historico.ts`
  - cache isolado por identidade/escopo efetivo;
  - `scope_hash` materializado e `ETag` compatibilizados com o mesmo escopo.

## Testes e validacoes

- `npx vitest run ...` sobre 12 arquivos diretamente afetados
  - `77` testes `PASS`
- `npx vitest run src/__tests__/routes/dashboard-metrics-integrity.test.ts src/__tests__/services/dashboard-metrics-integrity.test.ts src/__tests__/services/backup-restore-drill.test.ts`
  - `16` testes `PASS`
- total local consolidado nesta macroetapa
  - `93` testes `PASS`
- `npm run lint`
  - `PASS`
- `npm run build`
  - `PASS`
- `AIRTRUST_PUBLIC_ONLY=YES bash scripts/smoke-authenticated-operational.sh`
  - `PASS`
- `env -u AIRTRUST_AUTH_TOKEN -u AIRTRUST_COOKIE bash scripts/smoke-authenticated-operational.sh`
  - `FAIL` esperado com `AUTHENTICATED_SESSION_UNAVAILABLE`
- `npx wrangler d1 execute airtrust-db-staging --env staging --remote --command 'SELECT 1 as ok'`
  - `PASS`

## Live staging

- smoke publico read-only: `PASS`
- smoke autenticado: `AUTHENTICATED_SESSION_UNAVAILABLE`
- cross-tenant live autenticado: nao executado por ausencia de sessao/credencial aprovada
- `D1` remoto staging read-only: `PASS`

Observacao:
- `WRANGLER_D1_REMOTE_UNAVAILABLE` nao e mais um fato atual nesta sessao de `2026-06-21`; o status antigo ficou desatualizado.

## Impacto para escala comercial

- reduz risco operacional de escopo em superficies que tocam operacao real: simuladores, LMS e qualificacoes;
- melhora previsibilidade multiempresa em staging ao preferir fail-closed sobre fallback permissivo;
- diminui o risco de cache incorreto entre gestores e perfis com escopo distinto;
- evita que schema drift setorial em staging vire allow-all em escrita.

Hotspots observados:

- `worker-airtrust/src/routes/lms-cursos.ts`
- `worker-airtrust/src/routes/simuladores-sessoes.ts`
- `worker-airtrust/src/routes/frms.ts`
- `worker-airtrust/src/services/escala-mensal-integrada.ts`
- `worker-airtrust/src/services/dashboardService.ts`
- `src/react-app/pages/Qualificacoes.tsx`
- `src/react-app/pages/TreinamentosPlanejadosPage.tsx`
- `src/react-app/pages/escalas/EvdPage.tsx`

Macro futura recomendada, sem implementar agora:

- unificar enforcement de tenant/escopo em servicos compartilhados;
- quebrar rotas monoliticas por subdominio operacional;
- tratar compatibilidade de schema como ponte curta, nao contrato permanente;
- revisar scripts/sources de staging para evitar ambiguidade entre `airtrust-db` e `airtrust-db-staging`.

## Integracao operacional

- Escalas
  - depende de funcionarios, sessoes e disponibilidade operacional; o pacote reduz risco de sessao/ficha fora do escopo.
- FRMS
  - depende de funcionarios e visoes operacionais; o pacote reduz leituras indevidas em superficies compartilhadas.
- Central de Alertas
  - depende de deep links e correlacoes de LMS/qualificacoes; o endurecimento de escrita/leitura reduz divergencia entre visao e alteracao.
- SegVoo/SIGVOOS
  - continua NO-GO
  - nada deste pacote tocou integracao SIGVOOS.

## Decisao multiempresa e DR

- Empresa 6: GO COM RESSALVAS
- Multiempresa: PILOTO CONTROLADO
- DR: NO-GO
- SIGVOOS: NO-GO

Motivos:

- o pacote tecnico ficou seguro localmente para revisao em PR;
- a validacao autenticada live e a prova cross-tenant ainda nao foram fechadas nesta execucao;
- `D1` remoto staging esta acessivel em read-only, mas isso nao substitui smoke autenticado aprovado;
- nao houve migration, alteracao de schema ou mudanca global irreversivel de auth/RBAC/tenant.

## Proximos passos macro

- abrir um unico PR consolidado como `draft`;
- anexar este relatorio ao PR;
- obter sessao/credencial efemera aprovada para smoke autenticado;
- rodar validacao cross-tenant autenticada em staging;
- promover para `ready` apenas com CI remoto verde e smoke autenticado concluido.
