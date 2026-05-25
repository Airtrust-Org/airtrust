# AIRTRUST — Auditoria Maio/2026 (Encerramento)

## Resultado operacional final
- O backfill de maio/2026 foi regularizado.
- Os 8 registros alvo (`4522..4529`) estão **ativos** (`deleted_at = null`) e com status **`CONCLUIDA`**.
- Dry-run final do backfill (`--month 2026-05`) retorna:
  - `total_faltantes_apply = 0`
  - `total_bloqueadas_data_passada = 0`

## Regras de negócio confirmadas
- `PLANEJADA` somente para sessão futura (ou hoje).
- Sessão/data passada não deve ficar como `PLANEJADA`.
- Regularização histórica de maio/2026 ficou em `CONCLUIDA`.
- Sessões `56/57`: `NAO_GERAVEL_OK` (não geram qualificação).
- Sessão `58`: `LEGADO_CONCLUIDO_SEM_SESSAO_ID` (sem criação duplicada).

## Evidências de banco (read-only)
Registros confirmados:
- `4522` — sessão `60` — funcionário `5` — `T` — `2026-05-13` — `CONCLUIDA`
- `4523` — sessão `60` — funcionário `25` — `T` — `2026-05-13` — `CONCLUIDA`
- `4524` — sessão `61` — funcionário `6` — `T` — `2026-05-16` — `CONCLUIDA`
- `4525` — sessão `62` — funcionário `41` — `T` — `2026-05-16` — `CONCLUIDA`
- `4526` — sessão `63` — funcionário `20` — `T` — `2026-05-16` — `CONCLUIDA`
- `4527` — sessão `64` — funcionário `1` — `T` — `2026-05-16` — `CONCLUIDA`
- `4528` — sessão `67` — funcionário `32` — `R` — `2026-05-23` — `CONCLUIDA`
- `4529` — sessão `68` — funcionário `19` — `R` — `2026-05-23` — `CONCLUIDA`

Validações adicionais:
- `PLANEJADA` em data passada (maio/2026): `0`
- Qualificações ativas vinculadas a sessão `56/57`: `0`
- G2 criada para sessão `58`: `0`

## Proteção implementada para prevenção
Arquivo: [scripts/backfill-qualificacoes-sessoes-mes.sh](/Users/filipedaumas/SAAS/Airtrust/scripts/backfill-qualificacoes-sessoes-mes.sh)
- O backfill só aplica `PLANEJADA` para `date(data) >= date('now')`.
- Itens em data passada não entram em apply como planejada.

Arquivo: [simuladores-shared.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/routes/simuladores-shared.ts)
- O helper automático bloqueia criação de `PLANEJADA` para sessão passada (`bloqueadasDataPassada`).

Chamadores cobertos:
- [simuladores-sessoes.ts:816](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/routes/simuladores-sessoes.ts:816)
- [simuladores-sessoes-update.ts:430](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/routes/simuladores-sessoes-update.ts:430)

## Cobertura de teste
Arquivo: [simuladores-planejadas-edit-session.test.ts](/Users/filipedaumas/SAAS/Airtrust/worker-airtrust/src/__tests__/routes/simuladores-planejadas-edit-session.test.ts)
- Sessão futura elegível gera `PLANEJADA`.
- Reedição não duplica.
- Sessão passada elegível não gera `PLANEJADA`.
- Sessão sem qualificação mapeada não gera.
- Conflito legado não cria duplicata.

## Validações executadas
- `./scripts/test-simuladores-planejadas-edit-session.sh` ✅
- `npx tsc --noEmit` ✅
- `npm run build` ✅
- `npm run test:worker` ✅

## Encerramento operacional
- Maio/2026 regularizado.
- Sem faltantes backfilláveis remanescentes.
- Sem duplicação para `56/57/58`.
- Prevenção ativa para não gerar `PLANEJADA` em sessão passada.
