# Runbook — Reconstrução de staging a partir de baseline schema-only

| Campo | Valor |
|---|---|
| **Status** | Preliminar (não executado) |
| **Data** | 2026-07-01 |
| **ADR vinculada** | `docs/adr/0002-airtrust-schema-baseline-strategy.md` |
| **Contexto** | `docs/MIGRATION_CHAIN_DR_STAGING_NO_GO_20260701.md` |
| **SHA alvo** | `8e4a5dc37dc2e9b24ff45179ee6592d561cc882d` |

---

## Avisos

- Este runbook é **apenas um plano**. Nenhum comando foi executado.
- A export de schema usa produção como **fonte read-only** — sem dados, sem DML, sem alteração.
- Nenhuma ação neste runbook afeta produção.
- Staging atual (`airtrust-db-staging`) será substituído. Dados de staging (mínimos) serão descartados.
- Bancos D1 órfãos de tentativas anteriores (`airtrust-db-staging-v2`, `airtrust-db-staging-sane-20260701`) podem ser removidos depois, em decisão separada.

---

## Fase 0 — Autorização e freeze

**Objetivo**: garantir que todas as partes cientes autorizem o rebuild e que não haja operação concorrente em staging.

**Comandos prováveis**:
- Nenhum comando técnico — apenas comunicação.
- Confirmar que staging não está sendo usado por testes ativos.
- Confirmar janela operacional.

**Riscos**:
- Staging sendo usado por outra pessoa no momento do rebuild.
- Pipeline CI apontando para staging desatualizado.

**Critérios GO**:
- Autorização explícita obtida.
- Staging sem operação concorrente.
- Pipeline CI/DEPLOY de staging pausado ou ciente.

**Critérios NO-GO**:
- Qualquer dúvida sobre concorrência.
- Pipeline staging ativo sem comunicação.

**Rollback**: abortar antes de qualquer comando mutável.

**Evidências**:
- Comunicado/documento de autorização.

---

## Fase 1 — Export schema-only (read-only de produção)

**Objetivo**: extrair DDL completo do schema de produção sem dados, sem PII, sem tabelas de controle.

**Comandos prováveis**:
```bash
# A produção tem database_id = 7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae
# no binding env.production.d1_databases em worker-airtrust/wrangler.toml.

# Exportar schema-only filtrando tabelas internas:
#   - Excluir d1_migrations, _cf_%
#   - Excluir quaisquer tabelas de metadados do Cloudflare
#   - Extrair apenas DDL: CREATE TABLE, CREATE VIEW, CREATE INDEX, CREATE TRIGGER

# Artefato esperado:
#   scripts/schema-baseline-pre-0412.sql
```

**Ferramenta futura**: após esta fase, criar `scripts/export-d1-schema-only.sh` com as regras de filtro.

**Riscos**:
- Export pode capturar nomes de bucket R2 hardcoded — requer revisão humana.
- PII pode estar em nomes de constraints ou comentários — revisão obrigatória.
- View/trigger pode conter expressões com dados — revisão obrigatória.

**Critérios GO**:
- Arquivo DDL-only gerado, revisado, sem PII, sem DML, sem tabelas internas.
- Revisão humana concluída.

**Critérios NO-GO**:
- DDL contém PII.
- DDL contém DML.
- DDL contém tabelas `_cf_%` ou `d1_migrations`.
- DDL não compila em staging novo (dry-run).

**Rollback**: deletar o arquivo exportado se revisão reprovar.

**Evidências**:
- Arquivo `scripts/schema-baseline-pre-0412.sql` versionado.
- Hash SHA256 do arquivo registrado.
- Revisão humana documentada (PR ou issue).

---

## Fase 2 — Revisão do DDL

**Objetivo**: garantir que o baseline é seguro, completo e sem PII.

**Ações**:
- grep para `INSERT|UPDATE|DELETE|REPLACE|UPSERT` — zero ocorrências.
- grep para `d1_migrations|_cf_` — zero ocorrências.
- grep para padrões de PII (CPF, email, `@`, `nome`, `telefone` como valor literal — não como nome de coluna).
- Validar que `CREATE TABLE`, `CREATE VIEW`, `CREATE INDEX`, `CREATE TRIGGER` cobrem todo o schema de produção conhecido.

**Riscos**:
- PII em comentários ou nomes de constraints personalizadas.
- View com dados embutidos via UNION de valores literais.

**Critérios GO**:
- Revisão automatizada + manual aprovada.

**Critérios NO-GO**:
- Qualquer PII encontrado.
- Qualquer DML encontrado.

**Rollback**: corrigir o DDL exportado ou reexportar.

**Evidências**:
- Log da revisão.
- Aprovação documentada.

---

## Fase 3 — Criação de D1 staging novo

**Objetivo**: provisionar banco D1 staging do zero, sem herdar drift do staging atual.

**Comandos prováveis**:
```bash
cd worker-airtrust

# Criar novo D1
npx wrangler d1 create airtrust-db-staging-rebuild \
  --env staging \
  --location enam

# Atualizar binding de staging em wrangler.toml
# [[env.staging.d1_databases]]
# binding = "DB"
# database_name = "airtrust-db-staging-rebuild"
# database_id = "<uuid_retornado>"
# migrations_dir = "./migrations"
```

**Riscos**:
- Esquecer de atualizar o binding no `wrangler.toml` — worker staging continuaria apontando para o banco antigo.
- Nome do banco conflitar com tentativas anteriores — usar sufixo `-rebuild` para clareza.

**Critérios GO**:
- D1 criado, binding atualizado, commit do binding separado.

**Critérios NO-GO**:
- Binding não atualizado.
- D1 criado em região incorreta.

**Rollback**: reverter o binding para o banco staging antigo via `git revert` do commit do binding.

**Evidências**:
- UUID do D1 criado.
- Commit do binding.

---

## Fase 4 — Aplicação do baseline

**Objetivo**: popular o D1 staging novo com o schema completo de produção (sem dados, sem ledger).

**Comandos prováveis**:
```bash
cd worker-airtrust

# Aplicar baseline DDL-only no banco staging novo
npx wrangler d1 execute airtrust-db-staging-rebuild \
  --env staging \
  --remote \
  --file ../scripts/schema-baseline-pre-0412.sql
```

**Observações**:
- O baseline **não alimenta** a tabela `d1_migrations`. O ledger fica vazio.
- A migration `0412` será a primeira entrada no ledger daqui para frente.

**Riscos**:
- Baseline pode conter DDL que falha em D1 (ex.: sintaxe não suportada, tipo de dado incompatível).
- Baseline pode omitir tabela que só existe via migration e não via dump de produção.

**Critérios GO**:
- Comando executa sem erro.
- `qualificacoes_tipos`, `qualificacoes_historico`, `lms_cursos` etc. existem com schema completo.
- Contagem de tabelas igual à de produção (mesma `sqlite_master`).

**Critérios NO-GO**:
- Qualquer erro de sintaxe DDL.
- Tabela faltante.
- Tabela inesperada além do schema de produção.

**Rollback**: deletar o D1 staging novo e recriar.

**Evidências**:
- Log da execução.
- `wrangler d1 execute --command "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"`.

---

## Fase 5 — Aplicação da migration 0412

**Objetivo**: adicionar as mudanças do PR #216 (classificação de qualificações) via fluxo oficial de migrations.

**Comandos prováveis**:
```bash
cd worker-airtrust

# Como o ledger está vazio, wrangler vai querer aplicar todas as migrations.
# Precisamos pular o replay histórico e registrar apenas a 0412 em diante.
# Estratégia: inserir manualmente no ledger as migrations já cobertas pelo baseline,
# depois aplicar as pendentes via wrangler.

# Opção segura a definir — detalhamento depende da implementação do passo.
```

**Riscos**:
- Inserir entradas no `d1_migrations` manualmente é operação delicada — qualquer erro de nome ou ordem quebra o ledger.
- Se `wrangler d1 migrations apply` detectar que o ledger está vazio, tentará replayar toda a cadeia e falhará em `0058`–`0077`.

**Alternativas em avaliação** (definir antes da execução):
1. Seed manual do ledger com nomes de todas as migrations até `0411` inclusive, depois `wrangler d1 migrations apply` para aplicar só a `0412`.
2. Aplicar `0412` via `wrangler d1 execute --file` diretamente (fora do ledger), registrar manualmente no ledger.
3. Criar migration sintética `0412-only` que condensa apenas as mudanças do PR #216 e registrar como primeira entrada no ledger.

**Recomendação preliminar**: opção 1 (seed manual do ledger), porque mantém o ledger íntegro para migrations futuras.

**Critérios GO**:
- `d1_migrations` contém todas as entradas de `0000` a `0411`.
- `0412` aplicada com sucesso via `wrangler d1 migrations apply`.
- Schema de `qualificacoes_formatos`, colunas de classificação em `qualificacoes_tipos`, snapshots em `qualificacoes_historico`, `lms_cursos.formato_id` existem.

**Critérios NO-GO**:
- Ledger inconsistency detectada.
- Migration `0412` falha.
- Schema pós-0412 diverge do esperado.

**Rollback**: deletar D1 staging novo e recriar, ou reaplicar baseline.

**Evidências**:
- `d1_migrations` completo.
- Log da aplicação.

---

## Fase 6 — Deploy worker + frontend staging

**Objetivo**: publicar o código do SHA `8e4a5dc` no worker staging e frontend staging.

**Comandos prováveis**:
```bash
# Worker staging
cd worker-airtrust && npm run deploy:staging

# Frontend staging
cd worker-frontend && npm run deploy:staging
```

**Riscos**:
- Worker apontando para binding do D1 antigo se o binding não foi commitado.

**Critérios GO**:
- Worker staging responde `/api/version` com `8e4a5dc`.
- Frontend staging mostra `build-version=8e4a5dc`.

**Critérios NO-GO**:
- Worker retorna erro de binding de DB.
- Frontend não carrega.

**Rollback**: redeploy do worker/frontend apontando para o banco staging antigo.

**Evidências**:
- Version ID do worker.
- Version ID do frontend.
- URL do frontend staging.

---

## Fase 7 — Smoke staging

**Objetivo**: validar que o staging reconstruído está operacional e que o PR #216 funciona.

**Smokes backend**:
- `GET /api/version` → `8e4a5dc`
- `GET /api/health` → database/storage ok
- Auth sem token → 401
- `GET /api/qualificacoes/formatos` → 401 sem auth, 200 com auth
- `GET /api/qualificacoes/tipos` → schema inclui `formato_id`, `categoria_id`, `classe_requisito`
- `GET /api/qualificacoes/historico` → filtro de formato funcional
- `GET /api/lms/cursos` → `tipo_conteudo` preservado, `formato_id` presente

**Smokes frontend**:
- URL staging carrega com build-version `8e4a5dc`
- Página Qualificações abre
- Aba Classificações visível com Categorias, Formatos, Modelos
- Modelo tem campo/coluna Formato
- Histórico tem filtro de Formato
- Qualificação sem vencimento aparece no Histórico
- LMS CursoDetalhe mostra "Tipo de conteúdo", não "Formato", quando se refere a `tipo_conteudo`

**Segurança**:
- Rotas de formatos exigem autenticação
- Tenant isolation sem vazar dados entre empresas

**Critérios GO**:
- Todos os smokes passam.

**Critérios NO-GO**:
- Qualquer smoke falha.

**Rollback**: investigar e corrigir antes de prosseguir. Smoke deve ser repetível.

**Evidências**:
- Log dos smokes.
- Screenshots ou prints de tela.

---

## Fase 8 — Decisão de produção

**Objetivo**: decidir se o PR #216 pode ir para produção.

**Pré-requisitos**:
- Fases 0–7 concluídas com sucesso.
- Aprovação da revisão humana.
- Rollback definido.

**Plano de rollback para produção** (apenas plano, não executar):
1. **Reverter worker deploy** — as novas colunas são aditivas (nullable, coexistem com código que não as referencia via columnsSupport guards).
2. **Se necessário remover artefatos**: `DROP TABLE qualificacoes_formatos; ALTER TABLE ... DROP COLUMN` para `formato_id`, `categoria_id`, `classe_requisito` em `qualificacoes_tipos`, `qualificacoes_historico`, `lms_cursos`.
3. **Rollback de dados não é necessário** — `0412` é aditiva (nenhum dado legado é removido ou alterado com perda de informação).

**Decisão**:
- GO → planejar release em produção.
- NO-GO → documentar bloqueios e reabrir PR #216 se necessário.

---

## Artefatos futuros (não criar nesta execução)

Os seguintes scripts serão criados em fases posteriores:

- `scripts/export-d1-schema-only.sh` — exporta DDL de produção com filtros de segurança.
- `scripts/seed-d1-migration-ledger.sh` — sementeia o ledger `d1_migrations` para migrações cobertas pelo baseline.

---

## Check-list resumido

- [ ] Fase 0 — Autorização obtida
- [ ] Fase 1 — Schema exportado (read-only)
- [ ] Fase 2 — DDL revisado
- [ ] Fase 3 — D1 staging novo criado
- [ ] Fase 4 — Baseline aplicado
- [ ] Fase 5 — 0412 aplicada
- [ ] Fase 6 — Deploy staging
- [ ] Fase 7 — Smoke OK
- [ ] Fase 8 — Decisão GO/NO-GO para produção
