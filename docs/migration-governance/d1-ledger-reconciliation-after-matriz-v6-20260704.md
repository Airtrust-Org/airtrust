# Pendência: reconciliação do ledger `d1_migrations` pós Matriz V6.1 (2026-07-04)

## Estado observado

Produção (`airtrust-db`, `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`) tem o ledger `d1_migrations`
travado em `0407` (`SELECT name FROM d1_migrations ORDER BY id DESC LIMIT 10` → mais recente é
`0407_qualificacoes_tipos_setores.sql`).

Migrations `0408` a `0414` existem em `worker-airtrust/migrations/` mas **nenhuma delas está
registrada no ledger de produção**:

| Migration | Estado real em produção | Estado no ledger |
|---|---|---|
| 0408 (lms_cursos_setores) | Não aplicada | Ausente (correto) |
| 0409 (backfill setores) | Não aplicada | Ausente (correto) |
| 0410 (Controle de Voos schema) | Não aplicada | Ausente (correto) |
| 0411 (SIGVOOS integration) | Não aplicada | Ausente (correto) |
| 0412 (Qualificações classificação) | Não aplicada (bloqueada) | Ausente (correto) |
| **0413 (NOTECHS catálogo)** | **Aplicada** (2026-07-04, via `d1 execute --file`) | **Ausente — desalinhado** |
| **0414 (referencias_json)** | **Aplicada** (2026-07-04, via `d1 execute --file`) | **Ausente — desalinhado** |

## Por que isso é uma pendência real (não cosmética)

- `0414_add_manobras_referencias_json.sql` é um `ALTER TABLE manobras ADD COLUMN referencias_json
  TEXT NULL` — **não é idempotente**. Se qualquer rotina futura (CI, script de setup, outro
  operador) tentar reaplicar esse arquivo por não encontrar `0414` no ledger, a execução falhará
  com `duplicate column name: referencias_json`.
- `0413_notechs_categoria_itens.sql` **é** idempotente (`INSERT OR IGNORE`), então reaplicação
  acidental não corrompe dados — mas ainda assim mascara o estado real do banco para quem consulta
  apenas o ledger.
- Este padrão de desalinhamento já é conhecido no projeto: as migrations
  `0398_reconcile_wave1_wave2_d1_ledger.sql`, `0400_reconcile_wave3_d1_ledger.sql` e
  `0403_reconcile_wave4_d1_ledger.sql` existem precisamente para corrigir esse tipo de drift
  em ondas anteriores (histórico de SIGVOOS/Controle de Voos, aplicado via `execute --file` sem
  atualização automática do ledger).

## O que NÃO foi feito (intencionalmente)

Nenhuma escrita manual no ledger `d1_migrations` foi realizada nesta operação. Não há política
clara e explícita sobre o formato/timing correto de reconciliação, e escrever no ledger sem essa
decisão seria "corrigir problema em produção no escuro" — proibido pelas regras desta execução.

## Plano seguro proposto (não executado)

1. **Não escrever no ledger via SQL solto.** Seguir o padrão já estabelecido no projeto: uma
   migration dedicada de reconciliação (`04XX_reconcile_wave5_d1_ledger.sql`, seguindo o padrão de
   `0398`/`0400`/`0403`), que faça `INSERT OR IGNORE INTO d1_migrations (name, applied_at) VALUES
   (...)` para as entradas já confirmadamente aplicadas (`0413`, `0414`), com o `applied_at` real
   (2026-07-04) documentado explicitamente como reconstituído, não original.
2. Antes de criar essa migration de reconciliação, **auditar se há outras migrations "aplicadas
   mas não registradas"** além de 0413/0414 — o histórico do projeto sugere que isso já aconteceu
   em ondas anteriores (0398/0400/0403), então vale um scan completo comparando `sqlite_master`/
   schema real contra o ledger, não só olhar os últimos números.
3. Só aplicar essa migration de reconciliação após revisão humana explícita — é escrita em
   metadado de controle de produção, não em dado de negócio, mas ainda merece o mesmo rigor.
4. Depois de reconciliado, revalidar que uma tentativa de reaplicar `0414` (em ambiente de teste)
   falha corretamente por coluna já existente, e documentar esse comportamento esperado para quem
   operar migrations no futuro.

## Escopo explicitamente fora desta pendência

- `0408`–`0412` continuam pendentes/bloqueadas por motivos próprios (fora de escopo da Matriz V6.1
  ou exigindo autorização separada) — não fazem parte desta reconciliação de ledger, que trata
  apenas do desalinhamento entre "aplicado de fato" e "registrado no ledger" para 0413/0414.

---

## Migration de reconciliação criada: `0416_reconcile_matriz_v6_d1_ledger.sql`

**Data de criação:** 2026-07-04.

**O que ela faz (3 INSERTs):**
- Registra `0413_notechs_categoria_itens.sql` no ledger, se ausente, com `applied_at = '2026-07-04'`.
  Verifica presença de dados NOTECHS (`manobras_categorias.nome = 'NOTECHS'` + `manobras.codigo =
  'NOT-COM-01'`) antes de inserir.
- Registra `0414_add_manobras_referencias_json.sql` no ledger, se ausente, com `applied_at =
  '2026-07-04'`. Verifica presença da coluna `referencias_json` em `manobras` via
  `pragma_table_info` antes de inserir.
- **Auto-registra `0416_reconcile_matriz_v6_d1_ledger.sql`** no ledger com `applied_at =
  '2026-07-04'`. Necessário porque 0416 é aplicada via `d1 execute --file` (não via wrangler
  migration runner), então não há runner externo que a registre — ao contrário de 0398/0400/0403
  que foram aplicadas pelo wrangler e contavam com auto-registro do runner.

**Desvio intencional do padrão 0398/0400/0403:** 0398, 0400 e 0403 não se auto-registram porque
foram aplicadas via `wrangler d1 migrations apply`, cujo runner insere a própria entrada no ledger.
0416 será aplicada via `d1 execute --file` (mesmo caminho de 0413/0414), então deve se
auto-registrar para evitar deslocar a dívida de reconciliação para a frente (que exigiria uma 0417
para reconciliar 0416, ad infinitum).

**Estado do ledger após apply da 0416:**
```
0407_qualificacoes_tipos_setores.sql      ← última aplicada pelo wrangler
0413_notechs_categoria_itens.sql          ← registrada pela 0416
0414_add_manobras_referencias_json.sql     ← registrada pela 0416
0416_reconcile_matriz_v6_d1_ledger.sql     ← auto-registrada
```

**O que ela NÃO faz:**
- Não executa DDL (`ALTER TABLE`, `CREATE`, etc.).
- Não insere/atualiza/deleta dados de domínio (`manobras`, `modelos_sessao`, etc.).
- Não registra `0412_qualificacoes_classificacao.sql` (permanece bloqueada).
- Não registra `0408`–`0411` (permanecem pendentes, fora de escopo).

**Idempotência:** `WHERE NOT EXISTS` no ledger + verificação de schema real. Rodar 2x resulta em
0 linhas inseridas na segunda execução.

**Padrão:** Segue o mesmo formato de `0398_reconcile_wave1_wave2_d1_ledger.sql`,
`0400_reconcile_wave3_d1_ledger.sql` e `0403_reconcile_wave4_d1_ledger.sql`, com a adição do
auto-registro justificado acima.

**Aplicação:** Exige autorização explícita. A migration existe e está versionada, mas NÃO foi
aplicada em produção nesta etapa. Comando futuro (após autorização):
```bash
npx wrangler d1 execute airtrust-db --env production --remote --file=worker-airtrust/migrations/0416_reconcile_matriz_v6_d1_ledger.sql
```

**Risco residual:** Baixo. Escreve apenas em `d1_migrations` (metadado de controle), com
verificação de schema real como pré-condição. Rollback simples via `DELETE` das 3 entradas
inseridas, sem perda de dados de domínio.
