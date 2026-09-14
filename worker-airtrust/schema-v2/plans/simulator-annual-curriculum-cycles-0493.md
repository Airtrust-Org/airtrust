# Schema V2 plan — Simulator Annual Curriculum Cycles (0493)

## Objective
Represent the annual flight curriculum as one qualification with three rotating curricula instead of creating a new flight-training qualification for every year.

The operational rotation is fixed as **2026 = Cycle 2, 2027 = Cycle 3, 2028 = Cycle 1**, repeating every three calendar years.

## Scope and invariants
- the qualification identity remains unchanged (`G1`, `G1-SEM`, `G2`); a cycle is a child curriculum, not a new training;
- cycle configuration is tenant-scoped and additive; legacy `modelos_sessao.qualificacao_tipo_id` / `ordem_no_treinamento` remain intact for compatibility;
- `simuladores_curriculos_voo_config` stores the rotation rule (`total_ciclos`, `ano_base`, `ciclo_ano_base`);
- `simuladores_curriculos_voo_itens` stores ordered S1..SN membership by cycle and canonical session code;
- the current physical model is resolved through `modelos_sessao_versionamento.codigo_canonico`, so a technical version change does not create a new curriculum identity;
- runtime writes accept only active/current session models and preserve the canonical code;
- existing planned/executed sessions are not rewritten; their snapshots/model references remain historical evidence;
- SQL guards reject cross-tenant qualification/model references and cycles outside the configured range.

## Initial Costa do Sol seed
- `G1` AW139 annual: 4 sessions per cycle;
- `G1-SEM` AW139 semiannual: 2 sessions per cycle, following the same calendar rotation;
- `G2` S-76 annual: 2 cycle-specific sessions plus the shared check per cycle;
- all three are configured with `total_ciclos=3`, `ano_base=2026`, `ciclo_ano_base=2`.

## Runtime rollout
1. Merge only after migration, route, planning and regression tests are green for the exact SHA.
2. Apply the reviewed change in staging through the governed Schema V2 workflow.
3. Validate the curriculum editor: three cycle tabs, 2026=C2, canonical model catalogue without technical duplicates, and save/reload for each cycle.
4. Validate planning across a year boundary: a 2026 obligation resolves C2, 2027 resolves C3, 2028 resolves C1.
5. Validate approval/revalidation against the same year-specific cycle and confirm historical plans remain unchanged.
6. Production apply/deploy requires a separate exact-SHA authorization and recovery point.

## Rollback
Application rollback is to stop reading the cycle tables and fall back to the legacy ordered curriculum columns. The additive tables and historical audit evidence remain in place. Destructive table removal or data deletion requires a separate reviewed change.

Merging this plan does not authorize staging or production apply or deployment.
