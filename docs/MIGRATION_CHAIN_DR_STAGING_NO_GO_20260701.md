# MIGRATION_CHAIN_DR_STAGING_NO_GO_20260701

## Status

NO-GO para release do PR #216 em staging. Bloqueio estrutural pré-existente, não causado pelo PR.

## Sumário executivo

A tentativa de liberar o PR #216 (`draft: feat(qualificacoes): classificação por categoria, formato
e modelo`, squash-merged em `main` como `8e4a5dc37dc2e9b24ff45179ee6592d561cc882d`) em staging falhou
duas vezes por motivos estruturais anteriores ao PR:

1. **Staging antigo** (`airtrust-db-staging`, `b7f50907-c110-45f5-ad17-e97ea47f2826`) tem o ledger
   `d1_migrations` atrasado (apenas 4 entradas registradas) enquanto o schema físico (244 tabelas)
   está muito à frente — drift de proveniência, provável dump/restore ou execução manual fora do
   fluxo `wrangler d1 migrations apply`.
2. **Staging novo do zero** (`airtrust-db-staging-v2`, `3f902892-16f3-474f-88e3-293d1e6533c1`),
   criado para contornar o drift acima replayando a cadeia completa (`0001` → atual) contra um banco
   vazio, **também falhou** — não no PR #216, mas em `0060_recreate_integrated_view_funcionarios.sql`,
   muito antes da `0412`.

Conclusão: a cadeia de migrations commitada no repositório **não é capaz de reconstruir o schema
real de produção a partir de um banco vazio**. Esse é um problema de dívida técnica histórica
(região `0058`–`0077`, especificamente a coluna `funcionarios.nome_guerra` e a view
`qualificacoes_historico_v`), independente do PR #216, e bloqueia qualquer criação de ambiente novo
(staging, DR, onboarding) enquanto não for resolvido.

## Causa raiz (evidência técnica)

### 1. `funcionarios.nome_guerra` nunca é criada via `ALTER TABLE`

- `0000_production_schema.sql:35-47` cria `funcionarios` com um conjunto mínimo de colunas — **sem**
  `nome_guerra`.
- Nenhuma migration entre `0001` e `0058` adiciona `nome_guerra` via `ALTER TABLE ... ADD COLUMN`
  (confirmado por grep em todo o intervalo — zero ocorrências do nome da coluna antes da `0058`).
- `0058_extend_integrated_view_funcionarios.sql:49` já **referencia** `f.nome_guerra` numa view
  (`SELECT f.nome_guerra AS funcionario_nome_guerra`), assumindo que a coluna já existe fisicamente
  — o que só é verdade em produção/staging porque a coluna foi adicionada fora de banda, sem
  migration commitada correspondente.
- `0059_funcionarios_schema_parity.sql` recria a tabela inteira (`RENAME TO funcionarios_old` →
  `CREATE TABLE funcionarios` já com `nome_guerra TEXT` → `INSERT INTO funcionarios (...) SELECT
  ..., nome_guerra, ... FROM funcionarios_old`). O `SELECT nome_guerra FROM funcionarios_old` só
  funciona se `funcionarios_old` já tiver essa coluna — e contra um banco reconstruído do zero
  (schema `0000` puro), ela não tem. Daí o erro observado ao aplicar `0060` (a próxima migration
  que toca a view dependente): `no such column: f.nome_guerra`.

Em suma: `0059` **assume implicitamente** um estado de schema que só existe em bancos provisionados
fora do fluxo de migrations sequenciais (produção e staging antigo herdaram esse estado por
dump/restore histórico ou DDL manual; um banco novo criado só com `wrangler d1 migrations apply`
nunca chega nesse estado).

### 2. Cadeia de views `qualificacoes_historico_v` é frágil e longa

17 migrations entre `0058` e `0077` recriam/ajustam a mesma view em sucessão (`0058`, `0059`,
`0060`, `0062` ×2, `0063` ×2, `0065`, `0066`, `0068`, `0069` ×2, `0070`, `0071`, `0072`, `0073`,
`0076`, `0077`), cada uma corrigindo uma referência quebrada deixada pela anterior. Isso já havia
sido mapeado em `docs/LOCAL_MIGRATION_CHAIN_SANITY_DISCOVERY_20260630.md` (2026-06-30, mesmo erro
exato, investigação anterior não commitada como fix).

### 3. Numeração de migrations não é única nem estritamente sequencial

Há **30 números de migration duplicados** no repositório inteiro (ex.: `0062`, `0063`, `0068`,
`0069`, `0092`, `0093`, ... até `0367`), além de arquivos fora do padrão numérico
(`9999_add_modelo_sessao_id_to_agendamentos.sql`, `purge-soft-deleted-qualificacoes.sql` sem
prefixo). `wrangler d1 migrations apply` ordena por nome de arquivo — com números duplicados a
ordem de aplicação depende do sufixo textual, não de uma sequência garantida. Isso é um risco
estrutural adicional para qualquer replay determinístico da cadeia, além do problema pontual da
`0059`.

### 4. Escopo do problema

- **Local e remoto**: o mesmo erro ocorre tanto em SQLite local puro quanto via
  `wrangler d1 migrations apply --remote` contra um D1 novo — não é peculiaridade de ambiente.
- **Não é causado pelo PR #216**: a `0412_qualificacoes_classificacao.sql` do PR nunca chegou a ser
  aplicada em nenhuma tentativa — a cadeia quebra ~350 migrations antes dela.

## Bancos D1 envolvidos (estado em 2026-07-01)

| Banco | UUID | Papel | Estado |
|---|---|---|---|
| `airtrust-db` | `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae` | Produção | Intocado. Não tocado nesta investigação. |
| `airtrust-db-staging` | `b7f50907-c110-45f5-ad17-e97ea47f2826` | Staging (binding ativo) | Schema físico adiantado (244 tabelas), ledger atrasado (4 entradas). `0412` não aplicada. Dados de teste mínimos (15 usuarios, 3 empresas, 8 funcionarios, 0 qualificacoes_historico) — efetivamente descartável. |
| `airtrust-db-staging-v2` | `3f902892-16f3-474f-88e3-293d1e6533c1` | Tentativa de rebuild do zero (Opção A) | Órfão, incompleto — ledger parou em `0058` (25 de ~383 migrations aplicadas). Não é usado por nenhum binding. |
| `airtrust-db-staging-sane-20260701` | `b4effa09-1a0c-496e-99dd-81c5ca207c8f` | Criado em tentativa anterior do mesmo dia (03:53Z) | Órfão, praticamente vazio (307200 bytes = tamanho de banco recém-criado). Não é usado por nenhum binding. |
| `airtrust-db-dev` | `a72fb05b-0912-4ad9-9686-e7948c8b09eb` | Development | Fora de escopo desta investigação. |
| `airtrust-db-pilot-cv-n1` | `76ec876a-8727-44b6-aa33-b8dea53cdebb` | Piloto (fora de escopo) | Fora de escopo. |

`worker-airtrust/wrangler.toml` — binding `env.staging.d1_databases` aponta para `airtrust-db-staging`
(`b7f50907-...`), o banco original. **Sem diff** em relação a `main` (`git diff` vazio) — nenhuma
mudança de binding foi commitada ou deixada pendente.

## Por que o PR #216 não é a causa

- O PR #216 só adiciona a migration `0412_qualificacoes_classificacao.sql` (tabela
  `qualificacoes_formatos` e colunas de classificação), aplicada no **final** da cadeia.
- Em nenhuma das duas tentativas de release (staging antigo, staging novo do zero) a execução
  chegou perto da `0412` — a primeira falhou na `0016` (drift de ledger do staging antigo), a
  segunda falhou na `0060` (~350 migrations antes da `0412`).
- A revisão funcional do PR #216 já estava concluída antes deste bloqueio (ver
  `docs/QUALIFICACOES_FASE_1_6_DEPLOY_CLOSEOUT_20260630.md`).

## Por que as duas tentativas falharam

| Tentativa | Estratégia | Resultado | Motivo |
|---|---|---|---|
| 1 | Aplicar migrations pendentes no staging antigo (`airtrust-db-staging`) | NO-GO | Ledger atrasado (4 entradas) vs. schema físico adiantado (244 tabelas) — `duplicate column name: habilitacao_anterior_id` na migration `0016` |
| 2 (Opção A) | Criar D1 novo (`airtrust-db-staging-v2`) e replayar a cadeia completa do zero | NO-GO | Cadeia de migrations `0058-0077` depende de estado de schema (`funcionarios.nome_guerra`) que nenhuma migration commitada cria — `no such column: f.nome_guerra` na `0060` |

Ambas confirmam o mesmo diagnóstico por ângulos diferentes: **a cadeia sequencial de migrations do
repositório, sozinha, não é fonte de verdade suficiente para reconstruir o schema real** — nem para
corrigir um ledger atrasado (drift já divergiu demais), nem para bootstrapar um banco novo do zero.

## Opções avaliadas

### Opção A — Corrigir migrations antigas `0058-0077`

- **Vantagens**: mantém um único mecanismo (`wrangler d1 migrations apply`) como fonte de verdade;
  não introduz processo novo.
- **Riscos**: alto. É preciso reconstruir, migration a migration, qual era o estado real do schema
  em cada ponto histórico — sem tê-lo documentado, o risco de introduzir uma migration "corrigida"
  que diverge do que produção/staging realmente têm é alto. A tentativa já feita em 2026-06-30
  (`fix/local-migration-chain-sanity-20260630`) cresceu descontroladamente ao tocar 17 arquivos e
  foi abandonada sem commit.
- **Reversibilidade**: baixa depois de aplicada em qualquer ambiente compartilhado — migrations já
  aplicadas em produção/staging antigo não podem ser "reescritas" retroativamente sem risco de
  quebrar o ledger existente desses ambientes.
- **Esforço**: alto (a tentativa anterior já demonstrou isso).
- **Aceitável alterar migrations históricas já aplicadas?** Não, na prática — produção e staging
  antigo já rodaram (ou herdaram por dump) essas migrations; editar os arquivos históricos não muda
  o que já está aplicado lá, só quebra a garantia de que "replay = estado real" para qualquer
  ambiente novo. Editar histórico sem um plano de migração de todos os ambientes é uma ilusão de
  conserto.

### Opção B — Criar novo baseline de schema atual para ambientes novos

- Congela o schema real de produção (ou de um snapshot saneado dele) como um novo ponto de partida
  (`0000_baseline_vN` ou fluxo de bootstrap dedicado), a partir do qual a cadeia de migrations
  futuras (`0413` em diante) continua normalmente.
- **Como preservar histórico de produção**: produção continua com seu ledger real intacto — o
  baseline novo é usado apenas para *criar* ambientes novos (staging, DR, dev), não para substituir
  o ledger de produção.
- **Como evitar replay quebrado**: ambientes novos partem do baseline consolidado (schema real,
  sem os saltos incoerentes de `0058-0077`) em vez de replayar ~380 migrations históricas.
- **Como aplicar migrations futuras a partir do baseline**: a partir da `0413` (próxima após a
  `0412` do PR #216), a cadeia normal de `wrangler d1 migrations apply` volta a funcionar, porque
  o baseline já reflete o schema que essas migrations esperam.
- **Impacto em staging/DR/onboarding**: positivo — resolve o bloqueio de forma duradoura para
  qualquer ambiente futuro, não só para este release.

### Opção C — Script de bootstrap de staging/dev a partir de schema snapshot sanitizado

- Gera um `CREATE TABLE`/`CREATE VIEW` consolidado a partir do schema real de produção (via
  `PRAGMA table_info` / `sqlite_master`, sem nenhum dado — só DDL), sanitizado (sem dados pessoais,
  sem linhas), para popular staging/dev rapidamente.
- **Sem alterar produção**: é somente leitura de schema.
- **Sem dados pessoais**: extrai apenas DDL, não linhas de dados.
- **Adequado para staging/dev**: sim — é essencialmente uma variante tática da Opção B, focada só
  em desbloquear o próximo ambiente, sem necessariamente virar o novo baseline oficial do
  repositório.
- **Limitações**: não resolve a dívida técnica de fundo (a cadeia de migrations continua não
  reconstruindo do zero) — é um contorno pontual, não uma correção estrutural. Se não for
  formalizado como baseline (Opção B), o mesmo problema reaparece na próxima vez que alguém tentar
  criar um ambiente novo.

### Opção D — Corrigir ledger do staging antigo (popular `d1_migrations` manualmente)

- Marcaria como "aplicadas" as migrations que o schema físico do staging antigo já reflete, sem
  rodar o DDL de novo.
- **Por que não resolve rebuild/DR**: só resolve o desalinhamento *deste* banco específico — não
  ajuda a criar um staging novo, um ambiente de DR, ou qualquer banco futuro, porque a cadeia de
  migrations em si continua incapaz de reconstruir o schema do zero (Opção A/B/C tratam a causa
  raiz; isso só trata o sintoma local).
- **Classificação**: não recomendado, exceto em emergência isolada — editar ledger manualmente
  mascara o desalinhamento sem produzir nenhum artefato reaproveitável para o próximo ambiente.

### Opção E — Validar PR #216 direto contra produção com backup/snapshot, sem staging

- **Risco**: alto. Aplicar uma migration nova (`0412`) direto em produção sem antes tê-la validado
  em um ambiente equivalente remove a rede de segurança que staging existe para prover — qualquer
  efeito colateral (índice mal formado, view quebrada, lock de tabela grande) vira incidente de
  produção real, não um NO-GO reversível.
- **Veredito**: NO-GO. As regras absolutas desta investigação já proíbem migration/DML/deploy em
  produção; mesmo sem essa restrição explícita, validar contra produção sem staging confiável vai
  contra a prática básica de release seguro deste projeto (ver `CLAUDE.md`: "Production system with
  real data — never deploy, push, or run migrations without explicit authorization").
- Reforça por que recuperar um staging confiável (Opção B/C) é pré-requisito, não opcional.

## Recomendação

**Opção B (baseline/snapshot controlado), com Opção C como implementação tática imediata.**

Justificativa:

- **Segurança operacional**: não toca produção nem exige reescrever migrations já aplicadas em
  ambientes compartilhados (ao contrário da Opção A).
- **DR**: um baseline consolidado é exatamente o artefato que também serviria para recuperação de
  desastre — hoje, se produção precisasse ser reconstruída do zero, o mesmo bloqueio da `0060`
  ocorreria lá também. Resolver isso para staging resolve a mesma lacuna para DR.
- **Rastreabilidade**: um baseline novo, gerado a partir do schema real (documentado, sanitizado,
  com registro de proveniência), é auditável — ao contrário de editar ledger manualmente (Opção D)
  ou reescrever migrations históricas sem registro do que mudou (Opção A).
- **Custo**: menor que reconstruir 17+ migrations históricas coerentemente (Opção A já foi tentada
  uma vez e abandonada por crescer descontroladamente).

### O que fazer agora

1. Tratar este bloqueio como uma frente própria, separada do PR #216 — o PR não precisa ser reaberto
   nem revisado de novo por causa disso.
2. Descartar (ou manter como órfãos documentados, sem uso) os bancos `airtrust-db-staging-v2` e
   `airtrust-db-staging-sane-20260701` — nenhuma ação de exclusão foi tomada nesta execução, por
   regra explícita; decisão de descarte fica para uma frente futura dedicada.
3. Abrir uma frente dedicada (não nesta sessão) para gerar o snapshot de schema sanitizado (Opção C)
   a partir de produção, revisado por humano antes de qualquer aplicação em staging.

### O que fica para depois

- Decidir formalmente se o snapshot sanitizado vira o novo `0000` oficial do repositório (Opção B
  completa) ou permanece como script de bootstrap paralelo (Opção C isolada).
- Release do PR #216 em staging, condicionado a um staging reconstruído e confiável.
- Decisão sobre descarte dos bancos D1 órfãos (`-v2`, `-sane-20260701`).

## Próximos passos mínimos

1. Nova frente dedicada: gerar snapshot de DDL de produção (schema-only, sanitizado, sem dados
   pessoais) para popular um staging novo.
2. Validar esse staging novo contra a cadeia de migrations a partir do ponto do baseline (`0413+`).
3. Só então reabrir a tentativa de release do PR #216 em staging.
4. Revisitar, em frente separada, o destino dos bancos órfãos `airtrust-db-staging-v2` e
   `airtrust-db-staging-sane-20260701`.
