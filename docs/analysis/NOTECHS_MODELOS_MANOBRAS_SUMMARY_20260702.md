# NOTECHS Modelos-Manobras Matrix 20260702

Status: export read-only consolidado a partir de `scripts/operations/modelos-sessao-manobras-empresa6-source-map.json`.

## Resumo

- Modelos cobertos: 51
- Modelos esperados: 51
- Relações totais: 1122
- Relações esperadas: 1122
- Relações com classificação: 1122
- Relações sem classificação: 0
- Relações ambíguas: 0
- Allowlist: 51
- Bloqueados: 0
- Unresolved: 0
- Coverage status: READY_FOR_FULL_RESTORE

## Classificação

- migration_verified: 1011
- pto_visual_verified: 88
- responsavel_operacional_confirmado: 22
- operational_inference_confirmed: 1

## Distribuição por família

- A139: 25
- S76: 9
- Outros: 17

## Observações

- Nenhum modelo ficou sem relações.
- Nenhuma relação ficou sem classificação.
- O conjunto está pronto para full restore analítico.

## Fontes principais

- docs/vendor/pto/relacao_manobras_pto_rev10_ocr.md:page=106
- docs/vendor/pto/relacao_manobras_pto_rev10_ocr.md:page=109 | scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=29 | worker-airtrust/migrations/0180_implement_periodico_aw139.sql
- operational_inference_confirmed_2026-06-16:A139-P-C1/IFR:ordem_10:derived_from_similar_A139_IFR_cycle | docs/vendor/pto/relacao_manobras_pto_rev10_ocr.md:page=111:analog=A139-P-C2/IFR:ordem_10
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=16
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=17
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=18
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=19
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=20
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=21
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=22
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=23
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=24
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=25
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=28 | worker-airtrust/migrations/0180_implement_periodico_aw139.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=30 | worker-airtrust/migrations/0180_implement_periodico_aw139.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=31 | worker-airtrust/migrations/0180_implement_periodico_aw139.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=32 | worker-airtrust/migrations/0180_implement_periodico_aw139.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=33 | worker-airtrust/migrations/0180_implement_periodico_aw139.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=45 | worker-airtrust/migrations/0262_sk76_periodico_ciclos.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=46 | worker-airtrust/migrations/0262_sk76_periodico_ciclos.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=47 | worker-airtrust/migrations/0262_sk76_periodico_ciclos.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=48 | worker-airtrust/migrations/0262_sk76_periodico_ciclos.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=49 | worker-airtrust/migrations/0262_sk76_periodico_ciclos.sql
- scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=50 | worker-airtrust/migrations/0262_sk76_periodico_ciclos.sql
- worker-airtrust/migrations/0284_fix_sk76_loft_check_0303.sql
- worker-airtrust/migrations/0296_fap07_fap13_manobras.sql
- worker-airtrust/migrations/0299_loft_chk_manobras.sql
- worker-airtrust/migrations/0300_loft_off_not_e_fap_refs.sql
- worker-airtrust/migrations/0367_sk76_reaquisicao_experiencia_recente.sql
- worker-airtrust/migrations/0368_aw139_reaquisicao_experiencia_recente.sql
- worker-airtrust/migrations/0375_redistribuir_pf_sk76_inicial.sql
- worker-airtrust/migrations/0382_create_sk76_semestral_sessions.sql
- worker-airtrust/migrations/0383_split_night_training_onshore_offshore.sql

## Arquivos gerados

- [CSV](./NOTECHS_MODELOS_MANOBRAS_MATRIX_20260702.csv)
- [JSON](./NOTECHS_MODELOS_MANOBRAS_MATRIX_20260702.json)
