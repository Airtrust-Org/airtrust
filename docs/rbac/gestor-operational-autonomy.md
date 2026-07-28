# RBAC: Autonomia Operacional do Gestor por Domínio e Setor

Branch: `feat/gestor-operational-domain-rbac`. Implementa a separação
Administrador (sistema) / Gestor (operação), com autonomia completa do
gestor dentro dos domínios e setores atribuídos, sob rollout controlado por
tenant. **Nada disto está ativo em produção por padrão** — cada tenant
começa em modo legado (`operational_domain_rbac_enabled = 0`) e só migra
para o novo modelo quando um administrador ativa explicitamente, após o
readiness check não reportar bloqueios.

## 1. Separação Administrador / Gestor

Antes desta mudança, `GESTOR` já era um wildcard de permissão no frontend
(`usePermissions.ts`), idêntico a `ADMINISTRADOR` exceto por 2 permissões
bloqueadas. O backend não tinha o menor conceito de domínio ou de escopo por
recurso — a autorização era binária (`requireRole('admin','manager')` ou
`requireRole('admin')`), sem relação com setor/domínio.

Este trabalho **não removeu** esse wildcard de UI (isso quebraria tenants
ainda em modo legado). Em vez disso, acrescentou uma camada de autorização
**backend, dinâmica por tenant**:

- `worker-airtrust/src/services/operational-domain-access.ts` — a guarda
  central. Resolve o acesso operacional de qualquer usuário (independente do
  papel declarado) a partir das suas atribuições ativas em
  `setores_gestores`. Um `ADMINISTRADOR` sem atribuição não recebe nenhum
  acesso operacional; um `ADMINISTRADOR` também atribuído como gestor de um
  setor recebe exatamente o mesmo acesso que um `GESTOR` teria nesse setor —
  nunca mais, nunca menos.
- Continua vigente, e é **obrigatório**, `requireRole('admin','manager')` (ou
  `admin`) em cada rota — a guarda nova é adicional, não substitui o gate de
  papel.

## 2. Domínios

Catálogo canônico (migration `0452_operational_domain_rbac.sql`), identidade
por **código textual**, nunca por id numérico:

```
CREATE TABLE dominios_operacionais (
  codigo TEXT PRIMARY KEY,   -- OPERACOES | MANUTENCAO | SGSO | FRMS | CORPORATIVO
  nome TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);
```

Um domínio inativo (`ativo = 0`) nunca concede acesso, mesmo que o setor
esteja corretamente classificado — testado em
`operational-domain-access.test.ts`.

## 3. Setores e resolução de domínio por recurso

`setores.dominio_codigo` (nullable, sem FK de banco — ver §9) é a fonte de
domínio para recursos ancorados em setor. A resolução de domínio de um
recurso segue uma ordem de prioridade, implementada em
`resolveResourceDomain()`:

1. **Domínio fixo por tipo de recurso** (`FIXED_DOMAIN_RESOURCE_TYPES`) —
   simuladores (modelos de sessão, tipos de sessão, manobras, sessões,
   fichas, guias do instrutor) são sempre `OPERACOES`; o protótipo MRO é
   sempre `MANUTENCAO`. Não depende de nenhuma coluna.
2. **Herança de categoria** — `qualificacoes_tipos.categoria_id` e
   `qualificacoes_historico.categoria_id` apontam para
   `qualificacoes_categorias.dominio_codigo`. Reaproveita a classificação já
   existente (migrations 0412/0450) em vez de criar um campo paralelo.
3. **Coluna explícita, sem herança** — `lms_cursos.dominio_codigo`. A
   investigação confirmou que um curso LMS pode existir com
   `qualificacao_tipo_id` **e** `categoria` nulos ao mesmo tempo (schema e
   validação do endpoint de criação não exigem nenhum dos dois) — forçar
   herança teria classificado cursos independentes incorretamente.
4. **Setor do próprio recurso** — `funcionarios.setor_id → setores.dominio_codigo`.

**Fail-closed em todos os casos**: setor sem domínio, categoria sem
domínio, curso sem `dominio_codigo`, ou funcionário sem setor →
`resolveResourceDomain` retorna `domain: null` → `assertOperationalAccess`
nega o acesso (`RESOURCE_DOMAIN_UNCLASSIFIED`, 403) quando o RBAC está
ativo. Nenhum recurso é tratado como `OPERACOES` por omissão.

## 4. Guarda central — contratos

`worker-airtrust/src/services/operational-domain-access.ts`:

```ts
resolveOperationalAccess({ db, empresaId, userId, userRole })
  // -> { enabled, domains, setorIds, actions }

assertOperationalAccess({ db, empresaId, userId, userRole, domain?, action, resourceType?, resourceId? })
  // domain é opcional: quando omitido, resolve dinamicamente a partir do
  // próprio recurso (resourceType + resourceId). Obrigatório fornecer um
  // dos dois.

requireOperationalAccess({ domain?, action, resourceType?, resolveResourceId? })
  // middleware Hono, usado ao lado de requireRole(...) em cada rota.
```

Ações suportadas (todas as 15 do enunciado): `view create update delete
restore complete reopen cancel publish unpublish issue reissue revoke
import export`.

Quando o tenant está em modo legado (`enabled: false`), a guarda é
**totalmente no-op** — não bloqueia nada além do que já era bloqueado por
`requireRole`.

## 5. Matriz de recursos (o que foi efetivamente ligado à guarda)

| Recurso | Domínio | Setor | Role gate | Arquivo(s) |
|---|---|---|---|---|
| Tipos de sessão / Modelos de sessão / Manobras (catálogo) | OPERACOES (fixo) | N/A — conteúdo compartilhado | `admin,manager` | `simuladores-modelos.ts` |
| Sessões (criar/editar/excluir) | OPERACOES (fixo) | **dinâmico** — funcionário principal da sessão | modelo próprio da rota (`isFullAccessRole`) | `simuladores-sessoes*.ts` |
| Participantes de sessão | OPERACOES (fixo) | herdado da sessão | modelo próprio da rota | `simuladores-sessoes-participantes.ts` |
| Fichas (criar/editar/excluir) | OPERACOES (fixo) | **dinâmico** — aluno da ficha | modelo próprio da rota (`isFullAccess`/`resolveFichaScope`) | `simuladores-fichas.ts` |
| Ficha: assinar / exportar PDF | N/A — ação pessoal, não gerencial | N/A | identidade (aluno/instrutor da própria ficha) — **sem guarda de domínio** | `simuladores-fichas-acoes.ts`, `simuladores-fichas.ts` |
| Ficha: arquivar / edições / extras / manobras da ficha simulador | OPERACOES (fixo) | **dinâmico** onde aplicável | modelo próprio da rota | `simuladores-fichas-*.ts` |
| Guias do instrutor (criação, versões, ativar/desativar) | OPERACOES (fixo) | N/A — conteúdo compartilhado | capability dedicada `simuladores.guias.gerenciar` (sem default de role, nem para manager — decisão de produto pré-existente) | `simuladores-guias-instrutor.ts` |
| Histórico de qualificação (update/delete/complete/cancel/reissue) | dinâmico via categoria | **dinâmico** via funcionário do histórico | `admin,manager` | `qualificacoes/historico-write.ts` |
| Tipos de qualificação (create/update/delete) | dinâmico via categoria (create resolve do payload; update valida origem E destino) | N/A — conteúdo compartilhado | `admin,manager` | `qualificacoes/tipos.ts` |
| Certificados (emitir/upload) | dinâmico via histórico→categoria | **dinâmico** via funcionário do histórico | `admin,manager` | `qualificacoes-certificados-write.ts` |
| Reclassificação de histórico | dinâmico via categoria | **dinâmico** via funcionário do histórico | `admin,manager` | `qualificacoes-reclass.ts` |
| Cursos LMS (create resolve do payload/qualificação vinculada; update/delete/uploads dinâmico) | dinâmico via coluna explícita | N/A — conteúdo compartilhado | `admin,manager` | `lms-cursos.ts` |
| Funcionários (update, delete) | dinâmico via setor | **dinâmico** — o próprio funcionário | `admin,manager` (delete ampliado de admin-only) | `funcionarios-mutations.ts` |
| Setores-gestores (atribuir/remover gestor) | N/A — administrativo | N/A | `admin`-only (bloqueado para gestor, §6) | `setores-gestores.ts` |
| MRO (dashboard, aeronaves, componentes, OS, vencimentos, estoque, registros) | MANUTENCAO (fixo) | N/A | frontend apenas — ver §8 | protótipo, sem backend |

**Nota importante (fechamento §18)**: sessões e fichas usam um modelo de
autorização **próprio e pré-existente** (`isFullAccess`/`isFullAccessRole`/
`resolveFichaScope`), que já inclui INSTRUTOR e ALUNO como atores legítimos
(um instrutor preenche/avalia a ficha do seu aluno; o aluno assina a
própria ficha). Uma primeira tentativa de fechamento adicionou
`requireRole('admin','manager')` a essas rotas — isso quebraria esses
fluxos reais e foi revertido após os testes existentes acusarem a
regressão. A guarda de domínio (`requireOperacoesSessao`/`Ficha`)
permanece nessas rotas de escrita, mas — residual risk explícito — **uma
vez que o tenant ativar `operational_domain_rbac_enabled`, ela negará
INSTRUTOR** (que não está entre `admin`/`manager`), efetivamente bloqueando
a criação/edição de sessões e fichas por instrutores até uma decisão de
produto explícita sobre esse ponto. `POST /fichas/:id/assinar` e
`POST /fichas/:id/pdf` foram excluídas da guarda de domínio inteiramente,
por serem ações pessoais/de propriedade, não de gestão operacional.

"Dinâmica" significa: a rota **não** fixa o domínio em código — ela resolve
o domínio real do registro (via `resourceType` + `resourceId`) e compara
contra o que o gestor tem liberado. Isto foi uma correção deliberada em
relação a uma primeira versão que fixava `OPERACOES` nessas rotas: um
registro de qualificação/curso classificado como `MANUTENCAO` seria negado
incorretamente a um gestor de Manutenção se o domínio fosse fixo. Ver §9
para os casos que **ainda** usam domínio fixo por limitação de dados
disponíveis na rota (principalmente `create`).

## 6. Setores-gestores é administrativo, não operacional

Correção aplicada em `worker-airtrust/src/routes/setores-gestores.ts`:
`POST`, `PUT`, `DELETE` e `POST /bulk-assign/:setor_id` passaram de
`requireRole('admin','manager')` para `requireRole('admin')`. Um gestor não
pode mais atribuir, alterar ou remover vínculos setor-gestor — nem os
próprios, nem os de outro gestor. Os endpoints `GET` continuam acessíveis a
`admin,manager` (consulta, não escrita) — não foram restritos além disso
porque não fazia parte do escopo pedido e outras telas legadas já dependem
de listagem por gestor.

Isto também fechou um buraco pré-existente encontrado durante a auditoria:
antes desta mudança, **qualquer** gestor podia reatribuir os gestores de
**qualquer** setor, não só o seu — a rota nunca checava o próprio escopo do
gestor. A correção elimina o problema simplesmente tornando a escrita
admin-only, em vez de implementar "gestor administra gestores do próprio
setor" (que o enunciado pediu explicitamente para não fazer).

## 7. Exclusão e recursos históricos

Nenhum novo mecanismo de exclusão foi criado. Onde já existia soft-delete
(`deleted_at`, `status='CANCELADA'`, etc.), ele continua sendo o mecanismo —
a guarda nova apenas decide **quem** pode chamar esses endpoints, não
**como** a exclusão é feita. `funcionarios-mutations.ts DELETE /:id` foi
ampliado de `admin`-only para `admin,manager` (a exclusão já era soft-delete
com auditoria — ver linha `UPDATE funcionarios SET deleted_at = ...`), com
`requireOperacoesFuncionario('delete')` fazendo o escopo por setor/domínio.

Nenhuma ação foi bloqueada por status do registro (concluído, assinado,
emitido, vencido, cancelado). A guarda nova só decide domínio/setor — o
enunciado foi explícito em não esconder ações por causa do status
histórico, e nenhuma rota tocada introduziu esse tipo de checagem.

## 8. MRO — protótipo frontend, não um módulo backend

Investigação confirmou: `src/react-app/pages/mro/*` é 100% dado mockado
(`mroMockData.ts`), sem nenhuma chamada de API real. Não existe tabela,
rota ou serviço de MRO no backend — nenhuma foi criada como parte desta
entrega, conforme pedido explícito de não inventar backend fictício.

O que foi feito: o módulo foi classificado `MANUTENCAO` (fixo) e ligado à
guarda em dois pontos do frontend:

- `src/react-app/components/ProtectedRoute.tsx` — bloqueia acesso direto por
  URL (`/mro/*`) quando o tenant tem o RBAC ativo e o usuário não tem o
  domínio `MANUTENCAO`.
- `src/react-app/components/MainSidebar.tsx` — esconde o item de menu
  "Manutenção" na mesma condição.

**Nota importante**: hoje, `/mro` já está atrás de uma restrição
pré-existente e não relacionada (`development-module-nav.ts`), que limita o
módulo a um único e-mail de admin principal enquanto está em preview
(`status: 'beta'`). A guarda de domínio nova é aditiva e correta, mas só
terá efeito prático quando essa restrição de preview for suspensa —
documentado aqui para não ser confundido com um bug desta entrega.

## 9. Riscos residuais (fechamento final — ver §19)

Todos os 5 gaps declarados na rodada anterior de fechamento (leitura por
domínio/setor, classificação administrativa, criação de funcionário/setor
transfer, atribuição/renovação de qualificação, sync-ead, sessões com
múltiplos participantes) foram resolvidos — ver §19 para o detalhamento
completo, arquivos tocados e testes. Os itens abaixo continuam como
limitações **deliberadas e documentadas**, não bugs de segurança:

1. **Sem FK de banco entre `dominio_codigo` e `dominios_operacionais.codigo`.**
   Escolha deliberada: `ALTER TABLE ... ADD COLUMN ... REFERENCES` torna a
   coluna **impossível de remover depois** via `ALTER TABLE ... DROP COLUMN`
   no SQLite/D1 usado aqui — este banco já tem um trigger pré-existente e
   não relacionado (`trg_matriz_manobra_resolution_mesmo_tenant`) que
   quebra **qualquer** `DROP COLUMN` no banco inteiro. A validação de
   código de domínio é feita apenas na camada de aplicação
   (`operational-domain-access.ts`, `isValidOperationalDomain` para o
   catálogo estático de 5 códigos; `POST /classify` valida contra
   `dominios_operacionais` em runtime — existente e `ativo = 1` — ver §20).
2. **`normalizeTenantRole`/`isManagerRole`/`isManagerPerfil` continuam
   fragmentados** (6+ implementações divergentes encontradas na auditoria
   inicial) — não foi criada uma sétima, mas a fragmentação pré-existente
   não foi consolidada nesta entrega.
3. **Ativação do RBAC não afeta INSTRUTOR/ALUNO em sessões/fichas** — isso
   deixou de ser um risco residual: `skipOperationalGuardForRoles` isola
   explicitamente esses papéis do novo guard de domínio (ver §19, Item 4),
   testado com a flag ativa.

Nenhum destes riscos amplia acesso além do que já existe hoje. O modo
legado (`enabled: false`) não é afetado por nenhum deles.

## 10. Consistência automática

Não foi necessário adicionar nenhuma lógica de reconciliação nova — a
guarda de autorização não substitui nem interfere nos fluxos existentes de
recálculo (validade de qualificação, atualização de certificado, etc.), que
continuam rodando exatamente como antes dentro do mesmo handler, agora só
precedido por uma checagem de autorização adicional.

## 11. Migration e rollback

`worker-airtrust/migrations/0452_operational_domain_rbac.sql` — aditiva:
cria `dominios_operacionais` (com seed dos 5 códigos), adiciona
`dominio_codigo` (nullable) a `setores`, `qualificacoes_categorias`,
`lms_cursos`, e `operational_domain_rbac_enabled` (default 0) a `empresas`.
Testada localmente (aplicar + consultar schema) — nenhuma coluna/tabela
pré-existente é alterada ou removida.

`0452_operational_domain_rbac_rollback.sql` — **neutraliza em vez de
remover colunas** (zera a flag, limpa `dominio_codigo`, remove o catálogo e
os índices), pela razão descrita no risco residual #4. Testado localmente
em round-trip (aplicar → rollback → verificar estado limpo).

Nenhuma migration foi executada remotamente.

## 12. Backfill / classificação

Não há backfill automático de `dominio_codigo` para setores/categorias/cursos
existentes — é uma decisão deliberada do enunciado ("não corrigir produção
automaticamente"). O relatório read-only
(`scripts/operational-domain-rbac-readiness-report.sql`) lista exatamente
quais registros precisam de classificação manual por um administrador antes
da ativação; o mesmo relatório está disponível via API em
`GET /api/admin/operational-domain-rbac/readiness`.

## 13. Rollout por tenant

- Flag: `empresas.operational_domain_rbac_enabled` (0 = legado, padrão).
- `GET /api/admin/operational-domain-rbac/readiness` (admin-only) — retorna
  `{ ready, setores_sem_dominio, categorias_sem_dominio, gestores_sem_setor,
  cursos_sem_classificacao, bloqueios[] }` para o tenant do chamador.
- `POST /api/admin/operational-domain-rbac/activate` (admin-only) —
  recusa com `409` se `ready: false`; senão liga a flag só para aquele
  tenant.
- `POST /api/admin/operational-domain-rbac/deactivate` (admin-only) —
  desliga a flag (rollback controlado, sem precisar reverter a migration).
- `GET /api/me/operational-access` — usado pelo frontend
  (`useOperationalAccess()`) para saber os domínios/setores/ações efetivos
  do usuário logado; puramente informativo, a decisão real é sempre no
  backend.

## 14. Testes

- `worker-airtrust/src/__tests__/services/operational-domain-access.test.ts`
  (31 testes) — cobre a guarda central: modo legado, gestor de um/dois
  domínios, gestor sem setor, admin sem atribuição, admin também gestor,
  setor/vínculo/domínio inativos, tenant isolation, ações/domínios
  desconhecidos (422), resolução dinâmica por tipo de recurso, o middleware
  HTTP.
- `worker-airtrust/src/__tests__/routes/admin-operational-domain-rbac.test.ts`
  (5 testes) — readiness (pronto e com bloqueios), ativação bloqueada por
  409, ativação isolada por tenant, rollback via deactivate.
- `worker-airtrust/src/__tests__/routes/setores-gestores-admin-only.test.ts`
  (8 testes) — gestor barrado em create/update/delete/bulk-assign; admin
  continua liberado — usando o `requireRole` real, não mockado.
- `src/react-app/components/__tests__/ProtectedRoute.mro-domain-gating.test.tsx`
  (3 testes) e `MainSidebar.mro-domain-gating.test.tsx` (3 testes) — MRO
  acessível/visível em modo legado, acessível para gestor de Manutenção,
  bloqueado/escondido para gestor sem esse domínio.
- Fixtures reais, dependency-free (`worker-airtrust/src/__tests__/helpers/fixture-d1.ts`)
  — um pequeno executor em memória que reconhece exatamente as queries que
  a guarda emite e computa o resultado a partir de arrays de fixture em JS
  puro, sem motor de SQL real. Tentativas anteriores com `node:sqlite`
  (indisponível no Node 20 do CI) e `better-sqlite3` (binding nativo
  derrubou o processo de teste no runner do CI) foram descartadas por
  risco de portabilidade — esta abordagem tem zero dependência nova e zero
  código nativo. Cobre: dois tenants, gestor de um domínio, gestor de dois
  domínios, gestor sem setor, administrador sistêmico, administrador também
  gestor, setor inativo, domínio inativo, vínculo inativo.
- Suítes completas rodadas e verdes após cada mudança: worker (340 arquivos
  / 2818 testes) e frontend (175 arquivos / 1558 testes, 3 skips
  pré-existentes), incluindo os testes de arquitetura/governança de
  migração (ratchets atualizados para refletir o crescimento real
  introduzido: `simuladores-modelos.ts` para 2005 linhas, prefixo de
  migration mais alto para 452).
- `npx tsc --noEmit` limpo em `worker-airtrust/` e na raiz (frontend) após
  cada etapa.

## 15. Plano de staging

1. Aplicar `0452_operational_domain_rbac.sql` em staging (`wrangler d1
   execute --config ... --file=...`, sem `--local`, mas staging, não
   produção).
2. Deploy do Worker de staging com o código desta branch.
3. Rodar `GET /api/admin/operational-domain-rbac/readiness` para o(s)
   tenant(s) de staging — ou o script SQL equivalente — e classificar
   manualmente os setores/categorias/cursos reportados.
4. Ativar via `POST /activate` **apenas em staging**, validar os fluxos
   reais (simuladores, qualificações, LMS, funcionários) com um usuário
   gestor de teste em cada domínio.
5. Validar explicitamente: admin sem atribuição perde acesso operacional
   (era esperado); admin também gestor mantém acesso apenas ao seu setor.

## 16. Plano de produção

Não iniciar antes do staging validado. Quando autorizado:

1. Aplicar a migration em produção via
   `scripts/apply-migration-production.sh` (wrapper revisado, com as
   variáveis de ambiente de confirmação exigidas pelo CLAUDE.md).
2. Deploy do Worker.
3. Rodar o readiness check por tenant; **não ativar nenhum tenant sem
   `ready: true`**.
4. Ativar tenant por tenant (nunca em massa), a começar por um tenant piloto
   de baixo risco.
5. Monitorar logs/auditoria por pelo menos um ciclo operacional completo
   antes do próximo tenant.

## 17. Plano de rollback

- **Por tenant, sem tocar em schema**: `POST
  /api/admin/operational-domain-rbac/deactivate` — imediato, reversível,
  não perde nenhuma classificação já feita (dominio_codigo permanece
  gravado, só para de ser aplicado).
- **De schema, se necessário**: aplicar
  `0452_operational_domain_rbac_rollback.sql` — neutraliza a flag e as
  colunas de domínio para todos os tenants e remove o catálogo. Testado
  localmente em round-trip. Não requer `DROP COLUMN` (ver risco residual #4).
- Reverter o deploy do Worker para a revisão anterior sempre continua
  disponível como último recurso — o código desta branch nunca remove
  comportamento pré-existente quando a flag está desligada, então reverter
  o deploy sozinho (sem tocar na flag) já restaura o comportamento anterior
  para qualquer tenant que não tenha sido ativado.

## 18. Fechamento de segurança (revisão pós-PR #516)

Uma segunda rodada de revisão de segurança sobre o PR #516 identificou 13
bloqueadores. Resumo do que foi corrigido nesta revisão e o que permanece
aberto (ver §9 para a lista completa e atualizada de riscos residuais):

- **Bloqueador 1 (fail-open)** — `isTenantRbacEnabled` deixou de capturar
  qualquer erro de query e devolver `false` silenciosamente. Agora
  distingue: flag explícita `0` (legado), flag explícita `1` (aplica RBAC),
  falha de query (503, bloqueia), valor inválido armazenado (500,
  bloqueia). Linha ausente para o `empresaId` (não a query falhar, a linha
  não existir) continua tratada como legado, porque `empresaId` já chega
  validado pelo `tenantMiddleware` — uma linha ausente aqui indicaria
  quebra na resolução de tenant, um problema que já se manifesta (e é
  bloqueado) antes desta guarda. **Corrigido.**
- **Bloqueador 2 (papel não validado centralmente)** — adicionado um
  allowlist de papéis elegíveis (`admin`, `manager`) verificado *antes* de
  qualquer consulta a `setores_gestores`. Um vínculo indevido em
  `setores_gestores` para um INSTRUTOR/ALUNO/USUARIO não transforma mais
  esse usuário em gestor operacional. **Corrigido.**
- **Bloqueador 3 (mesmo domínio, setor diferente)** — `qualificacao_
  historico`/`certificado` passaram a resolver também o setor do
  funcionário dono do registro (não só o domínio da categoria);
  `simulador_sessao`/`simulador_ficha` saíram do mapa de domínio fixo e
  passaram a resolver o setor do participante/aluno principal. **Corrigido
  para o participante/aluno principal — múltiplos participantes de uma
  sessão em outros setores continuam um gap residual (§9.6).**
- **Bloqueador 4 (criações sem domínio)** — `qualificacoes/tipos.ts POST /`
  e `lms-cursos.ts POST /` passaram a resolver o domínio do próprio payload
  antes de gravar (categoria informada / `dominio_codigo` explícito ou
  herdado da qualificação vinculada). **Parcialmente corrigido** —
  `qualificacoes/atribuicao.ts`, `lms-cursos.ts POST /sync-ead` e
  `funcionarios-mutations.ts POST /` continuam sem essa resolução (§9.1-3).
- **Bloqueador 5 (rotas sem `requireRole`)** — auditoria completa de todas
  as rotas com a guarda de domínio. Corrigido onde realmente não havia
  nenhum gate de papel (`simuladores-modelos.ts`, catálogo puro) e onde o
  gate existente era mais restritivo que o necessário
  (`qualificacoes/tipos.ts`, era `admin`-only). **Não aplicado** a
  `simuladores-sessoes*.ts`/`simuladores-fichas*.ts`, que já têm seu
  próprio modelo de autorização por identidade/setor incluindo INSTRUTOR e
  ALUNO como atores legítimos — uma tentativa inicial de aplicar
  `requireRole('admin','manager')` ali quebrou fluxos reais de assinatura e
  avaliação de ficha, capturado pela suíte de testes existente e revertido
  antes do commit. Ver §9.7 para o risco residual que isso deixa (ativação
  do RBAC bloqueando INSTRUTOR nessas rotas).
- **Bloqueadores 6/7/8 (leitura filtrada, classificação administrativa,
  frontend completo)** — **não resolvidos nesta revisão.** São,
  cada um, um escopo de trabalho comparável ao PR original inteiro
  (auditoria sistemática de todo GET/listagem/export por domínio+setor;
  endpoints administrativos dedicados de classificação + UI; auditoria de
  toda a superfície de frontend por módulo). Registrados como riscos
  residuais explícitos (§9.8, §9.9) em vez de uma tentativa superficial que
  arriscaria dar falsa sensação de cobertura.
- **Bloqueador 9 (migration 0451 fora de escopo)** — revertida via commits
  `git revert` (não reescrita de histórico, sem `push --force`) — os
  commits `8819bddc`/`d393648d`, que existiam localmente antes desta tarefa
  e nunca haviam sido enviados a `origin/main`, foram revertidos para que o
  diff do PR contra `main` não inclua mais essa migration nem as mudanças
  não relacionadas de UI/filtro que vinham junto.
- **Bloqueador 10 (documentação de rollback incoerente)** — já estava
  correta neste documento (rollback neutraliza, não remove colunas); apenas
  reforçado e mantido atualizado nesta revisão.
- **Bloqueador 11 (readiness insuficiente)** — os 4 checks existentes
  (setores/categorias/cursos sem domínio, gestores sem setor) foram
  mantidos; os checks adicionais pedidos (domínio inválido/inativo em uso,
  vínculo com setor de outro tenant, funcionário sem setor) **não foram
  adicionados** nesta revisão — risco residual de completude do readiness,
  não de segurança (a guarda central já falha fechado nesses casos em
  tempo de requisição, independente do que o readiness relata).
- **Bloqueador 12 (operações históricas realmente funcionais)** — validado
  indiretamente pela suíte de testes existente: os testes de assinatura,
  reabertura, arquivamento etc. já exercitavam esses fluxos antes desta
  revisão e continuam passando após as correções de escopo de papel
  (Bloqueador 5). Uma auditoria formal marcando cada ação como
  IMPLEMENTADO/JÁ EXISTIA/NÃO EXISTE não foi produzida como documento
  separado nesta revisão.
- **Bloqueador 13 (guardrails inflados sem justificativa)** — todo aumento
  de cap nesta revisão (e na anterior) tem comentário datado explicando a
  causa raiz do crescimento; nenhum ratchet de TypeScript foi tocado
  (`guard:typescript-delta` permanece verde).

**Testes**: suíte completa (worker 340 arquivos / ~2838 testes, frontend
175 arquivos / 1558 testes) verde após cada correção desta revisão, mais
testes novos dedicados a cada bloqueador corrigido (fail-open, role gate,
setor-vs-domínio, criação com domínio resolvido do payload).

## 19. Fechamento final — os 5 gaps declarados em §18 resolvidos

Esta rodada resolve integralmente os 5 itens que §18 (e a antiga §9)
deixaram como residuais.

**Item 1 — leitura filtrada por domínio+setor.** Duas primitivas novas em
`operational-domain-access.ts`, testadas isoladamente:

- `resolveOperationalReadScope({ db, empresaId, userId, userRole })` —
  análogo de leitura do `resolveOperationalAccess` de escrita. Só restringe
  o papel `manager` (gestor); admin e todo papel não-gestor (instrutor,
  aluno, editor, viewer) recebem `{ restricted: false }` — cada um já tem
  seu próprio modelo de acesso de leitura estabelecido, que este item não
  deveria alterar. Quando restrito, narrowa `setorIds` para excluir
  setores geridos que ainda não têm domínio classificado (um setor sem
  classificação não deve vazar seus dados só porque é gerido pelo gestor).
- `appendOperationalReadFilter(conditions, bindings, scope, { domainColumn?,
  setorColumn? })` — apêndice de cláusula SQL fail-closed: sem restrição é
  no-op; restrito com lista vazia gera `1 = 0` (nunca "sem filtro = tudo
  visível").

Aplicado em:

- **Funcionários** (`funcionarios.ts`): `GET /` (setor) e `GET /:id`
  (reusa `assertOperationalAccess` com `action: 'view'`, resourceType
  `funcionario` — escopado a `manager` para não afetar instrutor/aluno que
  também acessam este endpoint).
- **Qualificações tipos** (`qualificacoes/tipos.ts`): `GET /` (domínio via
  `qc.dominio_codigo`) e `GET /:id`.
- **Qualificações histórico** (`qualificacoes/historico.ts`): `GET /`
  (domínio + setor), `GET /stats`, `GET /stats-extended` (setor).
- **LMS cursos** (`lms-cursos.ts`): `GET /` (domínio) e `GET /:id{[0-9]+}`.
- **Simuladores sessões** (`simuladores-sessoes.ts`): `GET /sessoes` (list
  completo e modo `summary`) — narrowa para sessões com pelo menos um
  participante (incluindo o instrutor) no domínio+setor do gestor; `GET
  /sessoes/:id` — `resolveSessaoReadAccess` narrowa o `setorIds` legado
  para a versão classificada-por-domínio quando o papel é gestor e o RBAC
  está ativo.
- **Simuladores fichas** (`simuladores-fichas.ts`): `GET /fichas`, `GET
  /fichas/:id`, `POST /fichas/:id/pdf` — helper `effectiveFichaSetorIds`
  reutilizado nos três pontos.

Acesso direto por ID fora do escopo retorna 403 (mutações,
`assertOperationalAccess`) ou 404 (leitura — consistente com o padrão
já usado nessas rotas para "não encontrado" vs. "existe mas não é seu").

**Item 2 — classificação administrativa de domínio.** Dois endpoints novos
em `admin-operational-domain-rbac.ts`, admin-only, audit-logged:

- `GET /api/admin/operational-domain-rbac/unclassified` — lista setores,
  categorias de qualificação e cursos LMS sem `dominio_codigo`, mais os 5
  domínios canônicos válidos.
- `POST /api/admin/operational-domain-rbac/classify` — `{ resource_type:
  'setor'|'categoria'|'curso', resource_id, dominio_codigo }`. Rejeita
  qualquer `dominio_codigo` fora do catálogo (nunca texto livre), 404 se o
  recurso não pertence ao tenant do chamador, registra `dados_anteriores`/
  `dados_novos` via `registrarAuditoria`.

Tela mínima nova: `src/react-app/pages/admin/OperationalDomainRbacPage.tsx`,
montada em `/admin/operational-domain-rbac` (implicitamente admin-only via
`ProtectedRoute`'s `ADMIN_ONLY_PATH_PREFIXES`), cobrindo consulta de
readiness, tabelas de pendentes com seletor de domínio + botão
"Classificar", e botões de ativar/desativar a flag do tenant.

**Item 3 — criações/automations restantes resolvendo domínio do
payload.** `assertSetorWithinOperationalScope` (novo) e
`assertQualificacaoAtribuicaoWithinOperationalScope` (novo) em
`operational-domain-access.ts`:

- **Funcionário** (`funcionarios-mutations.ts`): `POST /` valida o setor
  do payload; `PUT /:id` valida a setor de DESTINO quando `setor`/
  `setor_id` está sendo alterado (a origem já era validada pelo guard
  existente resolvido a partir do registro atual).
- **Qualificação atribuição/renovação** (`qualificacoes/atribuicao.ts`):
  o guard de rota fixo em OPERACOES foi removido de `POST /`, `POST
  /renovar`, `PUT/DELETE /renovacoes/:id` — cada handler agora resolve e
  valida o domínio real (via a categoria do `qualificacao_tipo`) e o
  setor do funcionário-alvo inline, antes da automação de escrita.
- **LMS sync-ead** (`lms-ead-ssot.ts`): `syncLmsCourseFromQualificacaoTipo`
  agora resolve `dominio_codigo` a partir da categoria do
  `qualificacao_tipo` de origem e grava no curso auto-criado (INSERT) ou
  faz backfill (UPDATE, só quando o curso ainda não tem domínio — nunca
  sobrescreve uma classificação manual já feita por um admin).

**Item 4 — instrutor/aluno preservados com a flag ativa** — já havia sido
resolvido antes desta rodada (`skipOperationalGuardForRoles`); mantido
sem alteração, testado.

**Item 5 — sessões com múltiplos participantes.**
`resolveResourceDomain('simulador_sessao', ...)` passou a resolver TODOS
os participantes ativos (`sessoes_participantes`), não só o principal —
`setorIds` (plural) carrega o conjunto completo, e
`assertOperationalAccess` exige que todos estejam no escopo do gestor para
uma operação de sessão inteira. Novo resourceType
`simulador_sessao_participante` cobre operações sobre UM participante
específico (criar/editar/remover), validando só aquele. Novo helper
`assertFuncionarioIdsWithinOperationalScope` cobre a validação em
tempo de criação (sem resourceId ainda) tanto para a criação de sessão com
participantes iniciais (`simuladores-sessoes.ts POST /sessoes`) quanto
para adicionar um novo participante a uma sessão existente
(`simuladores-sessoes-participantes.ts POST /sessoes/:id/participantes`).

**Testes**: suíte completa (worker 340 arquivos / 2870 testes, frontend
175 arquivos / 1558 testes) verde. Testes novos dedicados: read-scope
helpers (`resolveOperationalReadScope`, `appendOperationalReadFilter`),
`assertSetorWithinOperationalScope`,
`assertQualificacaoAtribuicaoWithinOperationalScope`, classificação admin
(`GET /unclassified`, `POST /classify`, isolamento de tenant, rejeição de
domínio inválido), e o cenário de dois participantes em setores
diferentes do mesmo domínio (operação de sessão inteira negada vs.
operação por participante permitida).

## 20. Saneamento final (commit único pós-§19)

Cinco correções pontuais sobre a entrega de §19, sem nova arquitetura:

1. **`POST /classify` valida contra `dominios_operacionais` em runtime**,
   não mais contra o catálogo estático de 5 códigos — `activeDomainCodes(db)`
   (já usada por `resolveOperationalAccess`) é reaproveitada aqui. Um
   `dominio_codigo` que existe na tabela mas está `ativo = 0` é rejeitado
   com a mesma mensagem/código de um código totalmente desconhecido
   (`UNKNOWN_OR_INACTIVE_OPERATIONAL_DOMAIN`) — a API não distingue os dois
   casos para o chamador, mas o teste de auditoria confirma ambos os casos
   pelo comportamento (rejeição), não pela causa interna.
2. **Readiness detecta domínio desconhecido/inativo em uso.** Dois novos
   contadores (`dominios_desconhecidos_em_uso`, `dominios_inativos_em_uso`)
   somam, através de setores + categorias + cursos, quantos registros têm
   um `dominio_codigo` não-NULL que não corresponde a nenhuma linha de
   `dominios_operacionais` (desconhecido) ou corresponde a uma linha com
   `ativo = 0` (inativo). Qualquer um dos dois bloqueia `ready` e a
   ativação do RBAC — o mesmo drift que a guarda central já trata como
   fail-closed em tempo de requisição agora também aparece no readiness
   *antes* da ativação.
3. **`isTenantRbacEnabled` — semântica restrita a exatamente 0/1.** Antes,
   "empresa não encontrada" (linha ausente) caía silenciosamente em modo
   legado, igual a um `NULL`. Agora: **somente** `0`/`'0'` significa
   legado; **somente** `1`/`'1'` ativa o RBAC; empresa ausente lança
   `OPERATIONAL_DOMAIN_RBAC_EMPRESA_NOT_FOUND` (404); `NULL`, `undefined`
   (coluna ausente) ou qualquer outro valor lançam
   `OPERATIONAL_DOMAIN_RBAC_INVALID_FLAG` (500) — nunca mais um fallback
   silencioso para legado nesses casos.
4. **Extração das adições de RBAC dos arquivos gigantes.** Lógica pura
   (guards de rota, filtros de leitura por domínio, resolução de domínio
   na criação) foi movida para três novos módulos dedicados, sem mudança
   de comportamento: `routes/lms-cursos-rbac.ts`,
   `routes/simuladores-modelos-rbac.ts`, `routes/simuladores-sessoes-rbac.ts`.
   Isso restaurou `lms-cursos.ts` ao cap histórico de 3000 linhas e tirou
   `simuladores-modelos.ts`/`simuladores-sessoes.ts` da lista de arquivos
   acima de 2000 linhas monitorada por
   `architecture-performance-guard.test.ts` — nenhum outro guardrail foi
   alterado.
5. **Alterações não relacionadas revertidas.** `classificacaoColors.ts` e
   a reorganização visual da aba de categorias em `Qualificacoes.tsx`
   (renomeação de aba, remoção do filtro de setor, badges por cor de
   setor) não faziam parte do escopo desta PR e foram restauradas ao
   estado anterior a este trabalho.

**Efeito colateral esperado e corrigido**: a semântica mais restrita de
`isTenantRbacEnabled` (item 3) expôs que ~25 arquivos de teste
pré-existentes (não relacionados a este RBAC) dependiam do fallback
silencioso "empresa ausente no mock ⇒ modo legado" para não quebrar —
cada um recebeu um stub explícito
`{ operational_domain_rbac_enabled: 0 }` para a query
`FROM empresas WHERE id`, preservando a intenção original desses testes
(tenant legado) sem reintroduzir o fallback silencioso na implementação.

**Testes**: suíte completa (worker 340 arquivos / 2876 testes, frontend
175 arquivos / 1558 testes) verde. Testes novos dedicados: classificação
em domínio inativo, readiness com domínio inativo, readiness com código
desconhecido, empresa não encontrada na consulta da flag, flag `NULL`, e
regressão dos limites arquiteturais (`architecture-performance-guard.test.ts`).
