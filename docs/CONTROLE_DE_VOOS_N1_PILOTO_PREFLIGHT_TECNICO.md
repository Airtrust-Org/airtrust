# Controle de Voos N1 - Preflight tecnico do piloto preview/staging

Data da auditoria: 2026-06-14  
Escopo: preparacao segura de ambiente preview/staging para piloto N1, sem producao, sem deploy, sem secrets e sem aplicacao de migration nesta fase.

## 1. Veredito

**Veredito tecnico: pronto com ressalvas.**

O ambiente pode ser preparado para o piloto em **preview/staging com acesso restrito**, desde que o Dia 0 execute um gate manual antes de qualquer aplicacao da `0410`: confirmar ambiente aprovado, snapshot/backup do D1 de staging, ledger de migrations coerente e lista de pending contendo somente a `0410_controle_voos_n1_schema.sql` para o escopo do piloto.

Nao ha evidencia tecnica de que a `0411` exista como migration real ou que sera aplicada por fluxo padrao. A `0411` permanece apenas como design documental.

## 2. Estado Git auditado

- Branch atual: `main`.
- HEAD: `a6c035622b84aee1fccede40ca1ccc29370824d6`.
- `origin/main`: `971f95fe8082d32d4621272c95d4468a28fcdd7f`.
- Divergencia: `0 16` em `origin/main...HEAD` (branch local 16 commits a frente).
- Working tree ja estava suja antes deste relatorio, com alteracoes e arquivos nao rastreados fora deste escopo.
- Novo arquivo criado nesta fase: `docs/CONTROLE_DE_VOOS_N1_PILOTO_PREFLIGHT_TECNICO.md`.

Ressalva: por estar em `main` e com working tree suja, qualquer commit futuro deve ser autorizado explicitamente e escopado com cuidado. Nao usar `git add .`.

## 3. Ambiente alvo recomendado

Ambiente recomendado: **preview/staging com acesso restrito**.

Nao usar:

- producao;
- ambiente local como piloto formal com usuarios reais;
- qualquer ambiente que compartilhe D1, secrets ou rotas de producao;
- qualquer fluxo de deploy ou migration automatica que aplique pendencias alem da `0410`.

## 4. Status da migration 0410

Status: **existe na cadeia canonica** em `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql`.

A migration cria o schema N1 `cv_*` esperado:

- `cv_aeroportos`;
- `cv_tipos_voo`;
- `cv_naturezas_voo`;
- `cv_motivos_operacionais`;
- `cv_voos`;
- `cv_rdv_operacional`;
- `cv_voo_tripulantes`;
- `cv_voo_eventos`.

Os testes especificos validam que a `0410`:

- cria apenas as tabelas B1 de Controle de Voos;
- mantem indices tenant-scoped;
- mantem `empresa_id`, timestamps e soft delete;
- rejeita status/valores invalidos;
- nao cria tabelas `regulated_*`;
- nao contem termos proibidos de escopo regulatorio na SQL.

## 5. Confirmacao sobre a migration 0411

Status: **nao existe como migration real** em `worker-airtrust/`.

Evidencias:

- busca por arquivos `0411` em `worker-airtrust` nao retornou resultados;
- `docs/CONTROLE_DE_VOOS_N1_SCHEMA_0411_DESIGN.md` existe apenas como documento de design;
- nenhum comando foi executado para aplicar `0411`;
- nenhum script padrao auditado aponta para `0411`.

Conclusao: **a `0411` nao deve ser aplicada no piloto preview/staging**. Qualquer implementacao futura deve ser outra decisao, apos feedback do piloto e aprovacao explicita.

## 6. `migrations_experimental`

Status: **isolada da cadeia canonica**.

Verificacoes:

- `worker-airtrust/wrangler.toml` usa `migrations_dir = "./migrations"` em `development`, `staging` e `production`;
- `worker-airtrust/wrangler.dev.toml` usa `migrations_dir = "./migrations"`;
- `scripts/setup-local-db.sh` aplica explicitamente `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql` para Controle de Voos local, nao `migrations_experimental`;
- `package.json`, `worker-airtrust/package.json`, `scripts/`, `wrangler.toml` e `wrangler.dev.toml` nao contem referencia a `migrations_experimental`;
- `worker-airtrust/migrations_experimental/README.md` declara que a pasta nao faz parte da cadeia normal, nao deve ser usada por staging/producao e nao deve ser usada por deploy/CI/remote apply.

Ressalva: o repositorio contem scripts legados/perigosos de deploy, D1 remote e producao. Eles nao apontam para `migrations_experimental`, mas devem ficar fora do runbook Dia 0.

## 7. Endpoints e frontend

Backend:

- rota montada em `worker-airtrust/src/index.ts` como `/api/controle-voos`;
- endpoints principais auditados em `worker-airtrust/src/routes/controle-voos.ts`:
  - `GET /voos`;
  - `POST /voos`;
  - `GET /voos/:id`;
  - `PATCH /voos/:id`;
  - `POST /voos/:id/status`;
  - `GET /voos/:id/rdv`;
  - `PUT /voos/:id/rdv`;
  - `POST /voos/:id/rdv/finalizar-preenchimento`;
  - `GET /dashboard`;
  - `GET /relatorios/resumo-operacional`;
  - `GET /catalogos/:nome`.

Controles observados:

- autenticacao obrigatoria;
- RBAC de escrita via `requireControleVoosWrite`;
- tenant scope por `empresa_id`;
- bloqueio de campos proibidos;
- bloqueio de termos fora de escopo regulatorio;
- retorno explicito `nao_regulado: true` em dashboard/relatorios.

Frontend conectado:

- `src/react-app/hooks/useControleVoos.ts` consome `/controle-voos`;
- telas conectadas ao backend:
  - Dashboard;
  - Voos;
  - Detalhe do voo;
  - RDV;
  - Detalhe/preenchimento do RDV;
  - catalogo de aeroportos.

Telas ainda demonstrativas:

- Jornadas;
- Indisponibilidades;
- Hangaragem;
- Relatorios;
- Tabelas.

Essas telas estao marcadas no `ControleVoosPageShell` com banner demonstrativo N0/A0 e no `ControleVoosSubnav` com badge `Demo`.

## 8. Textos de prototipo/demo e risco de confusao

Nao foi encontrado texto que declare o modulo como regulado, fiscal, eDB, SDRMe, ANAC aprovado ou substituto oficial nas telas conectadas principais.

Ressalvas de UX/documentacao para Dia 0:

- O dashboard possui atalhos para Jornadas e Indisponibilidades sem badge `Demo` no proprio card; ao abrir, a tela mostra banner demonstrativo, mas o atalho pode gerar expectativa errada.
- A tela Jornadas usa linguagem de FRMS demonstrativo e menciona leitura futura do FRMS real. Como a tela esta marcada como demonstrativa, isto nao bloqueia tecnicamente o preflight, mas deve ser explicado no briefing e preferencialmente revisado antes do uso com usuarios.
- A tela Relatorios continua demonstrativa apesar de existir backend para `GET /relatorios/resumo-operacional`; isso e gap de produto, nao bloqueio de schema.

Classificacao: **pendencias antes do Dia 0**, nao bloqueadores tecnicos para preparar staging.

## 9. Riscos de producao

Riscos identificados:

- branch atual e `main`;
- working tree suja com alteracoes nao relacionadas;
- scripts de deploy/producao existem no repositorio;
- `npm run deploy`, `wrangler deploy`, `wrangler d1 migrations apply --remote` e `wrangler d1 execute --remote` podem tocar ambiente remoto se usados fora do runbook;
- `npm run build` imprime aviso de banco de producao ativo, mas nesta auditoria foi apenas build local.

Mitigacoes obrigatorias:

- nao executar deploy;
- nao executar migration em producao;
- nao executar scripts de sync/export/producao;
- nao tocar secrets;
- usar apenas ambiente `staging` explicitamente aprovado;
- verificar `database_name`, `database_id` e `migrations_dir` antes do apply;
- registrar evidencias de pre e pos-aplicacao.

## 10. Checklist tecnico antes de aplicar 0410 no ambiente de piloto

- [ ] Confirmar por escrito que o alvo e `staging`/preview aprovado para o piloto.
- [ ] Confirmar que o D1 alvo e `airtrust-db-staging`, nao `airtrust-db`.
- [ ] Confirmar `worker-airtrust/wrangler.toml` com `migrations_dir = "./migrations"` em `[env.staging]`.
- [ ] Confirmar que `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql` e o unico artefato de schema Controle de Voos N1 a aplicar.
- [ ] Confirmar que nao existe migration `0411` em `worker-airtrust/migrations/`.
- [ ] Confirmar lista de migrations pending no D1 staging; aplicar somente se a pendencia relevante for a `0410`.
- [ ] Capturar snapshot/backup do D1 staging antes da aplicacao.
- [ ] Confirmar que usuarios do piloto tem acesso restrito e perfis corretos.
- [ ] Confirmar que o frontend preview aponta para API staging, nao producao.
- [ ] Confirmar que telas demonstrativas estao comunicadas no briefing.
- [ ] Confirmar que SIGVOOS/APUS/papel continuam como referencias oficiais.

## 11. Comandos seguros sugeridos para Dia 0

Nao executados nesta auditoria. Executar somente apos aprovacao explicita do ambiente.

```bash
cd worker-airtrust
npx wrangler d1 migrations list airtrust-db-staging --env staging --remote
```

Aplicar somente se o resultado confirmar o D1 staging correto e se a lista de pending for compativel com aplicar a `0410` sem arrastar migrations fora do escopo:

```bash
cd worker-airtrust
npx wrangler d1 migrations apply airtrust-db-staging --env staging --remote
```

Validacao estrutural pos-aplicacao:

```bash
cd worker-airtrust
npx wrangler d1 execute airtrust-db-staging --env staging --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'cv_%' ORDER BY name;"
```

Validacao de ausencia de `0411` no workspace antes de qualquer apply:

```bash
rg --files worker-airtrust/migrations | rg '(^|/)0411|0411_'
```

Observacao: se houver qualquer pending alem da `0410` ou qualquer duvida sobre o D1 alvo, parar o Dia 0 e abrir decisao tecnica. Nao usar producao como fallback.

## 12. Validacao pos-aplicacao

Validar e registrar evidencia de:

- tabelas `cv_*` existentes no D1 staging;
- indices principais criados;
- endpoint `GET /api/controle-voos/dashboard` autenticado retorna `success: true` e `nao_regulado: true`;
- endpoint `GET /api/controle-voos/voos` retorna lista/paginacao sem erro;
- fluxo RDV no frontend preview: abrir voo, abrir RDV, salvar rascunho e finalizar preenchimento com usuario editor;
- usuario viewer consegue ler e nao consegue escrever;
- telas demonstrativas exibem banner e badge;
- nenhum dado de producao foi alterado;
- nenhuma rota ou tela declara substituicao de SIGVOOS/APUS/papel/eDB/SDRMe.

## 13. Rollback

Rollback recomendado para piloto preview/staging:

1. Parar acesso dos usuarios ao preview/staging.
2. Registrar erro e evidencias.
3. Restaurar o snapshot/backup do D1 staging capturado antes da `0410`, ou recriar o ambiente de staging a partir de baseline aprovado.
4. Se restauracao nao for possivel e o ambiente for descartavel, preparar SQL destrutivo explicito para remover somente `cv_*`, com aprovacao separada.
5. Nao executar rollback em producao.
6. Nao tentar "corrigir" aplicando `0411`.

Nao ha rollback executado nesta auditoria.

## 14. Validacoes executadas

Executadas localmente, sem deploy e sem acesso remoto D1:

```bash
git status --short
git log -5 --oneline
git rev-parse HEAD
git rev-parse origin/main
git rev-list --left-right --count origin/main...HEAD
git diff --check
npx tsc --noEmit
npm run lint
npm run build
cd worker-airtrust && npx vitest run src/__tests__/migrations/controle-voos-n1-schema.test.ts src/__tests__/routes/controle-voos.test.ts src/__tests__/migrations/migration-governance.test.ts
```

Resultados:

- `git diff --check`: passou sem saida.
- `npx tsc --noEmit`: passou.
- `npm run lint`: passou.
- `npm run build`: passou.
- Vitest worker direcionado: 3 arquivos, 54 testes, todos passaram.

Tentativa descartada:

- `npx vitest run ...` a partir da raiz nao encontrou arquivos porque a config raiz nao inclui `worker-airtrust`; o mesmo conjunto foi reexecutado corretamente dentro de `worker-airtrust` e passou.

## 15. Go/no-go tecnico

**GO com ressalvas para preparar preview/staging.**

Nao e GO para producao.  
Nao e GO para aplicar `0411`.  
Nao e GO para integrar SIGVOOS, FRMS real, MRO real, eDB, SDRMe ou Records Core.

Bloqueadores tecnicos atuais:

- nenhum bloqueador tecnico encontrado para preparar staging, desde que o gate Dia 0 seja seguido.

Ressalvas obrigatorias:

- ambiente staging precisa ser formalmente confirmado;
- working tree esta suja e em `main`;
- scripts perigosos existem no repo e devem ficar fora do runbook;
- atalhos do dashboard para telas demonstrativas podem confundir usuarios se o briefing nao for claro;
- nao aplicar `0410` se houver pending migrations alem do escopo ou qualquer incerteza sobre o D1 alvo.

## 16. Pendencias antes do Dia 0

- Definir e aprovar formalmente o ambiente preview/staging do piloto.
- Capturar snapshot/backup do D1 staging.
- Verificar pending migrations no staging.
- Confirmar que apenas `0410` sera aplicada para o piloto.
- Confirmar que `0411` continua nao implementada.
- Confirmar RBAC dos usuarios do piloto.
- Confirmar seed/dados controlados do piloto.
- Fazer briefing explicito: uso operacional interno, nao regulado, nao fiscal, nao substitui SIGVOOS/APUS/papel/Diario de Bordo/eDB/SDRMe.
- Listar telas demonstrativas no material do piloto.
- Decidir se os atalhos do dashboard para telas demo devem receber marcador visual antes de usuarios reais.

## 17. Confirmacoes finais

- Producao nao foi tocada.
- Secrets nao foram lidos nem alterados.
- Nenhum deploy foi executado.
- Nenhuma migration foi aplicada.
- `0411` nao foi aplicada.
- `0411` nao existe como migration real no workspace auditado.
- `migrations_experimental` nao esta apontada por Wrangler nem por scripts padrao auditados.

Sugestao de commit, se autorizado depois:

```text
docs(controle-voos): add N1 pilot technical preflight
```
