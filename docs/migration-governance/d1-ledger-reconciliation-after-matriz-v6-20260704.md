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
