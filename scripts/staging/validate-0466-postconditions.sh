#!/usr/bin/env bash
# Read-only staging proof for 0466 CAE Planning V3 columns/defaults/checks.
# Compensation is documented in docs/0466_cae_planning_v3.rollback.md.
set -euo pipefail
DB='airtrust-db-staging-baseline-20260701'
[[ "${1:-}" == "--target=$DB" ]] || { echo 'ERROR: staging target required' >&2; exit 1; }
run() { (cd worker-airtrust && npx wrangler d1 execute "$DB" --remote --json --command "$1") | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.stringify(JSON.parse(d)[0]?.results??[])))'; }
count() { node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>process.stdout.write(String(JSON.parse(d)[0]?.n??0)))'; }

test "$(run "SELECT COUNT(*) n FROM pragma_table_info('empresas_config') WHERE name IN ('planejamento_simulador_antecedencia_dias','planejamento_simulador_preferencia_sessoes_por_dia','planejamento_simulador_preferencia_minutos_por_dia','planejamento_simulador_permitir_quebra_preferencia','planejamento_simulador_regra_quinzena','planejamento_simulador_permitir_sessao_compartilhada','planejamento_simulador_preferir_mesmo_treinamento','planejamento_simulador_preferir_mesma_sessao','planejamento_simulador_aprovacao_obrigatoria')" | count)" = 9
test "$(run "SELECT COUNT(*) n FROM pragma_table_info('treinamentos_planejados') WHERE name IN ('planejamento_aprovacao_status','planejamento_aprovado_por','planejamento_aprovado_em','planejamento_aprovacao_observacoes','planejamento_revalidado_em')" | count)" = 5
test "$(run "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='empresas_config' AND sql LIKE '%planejamento_simulador_regra_quinzena%' AND sql LIKE '%FOLGA%' AND sql LIKE '%TRABALHO%' AND sql LIKE '%AMBAS%'" | count)" = 1
test "$(run "SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='treinamentos_planejados' AND sql LIKE '%planejamento_aprovacao_status%' AND sql LIKE '%RASCUNHO%' AND sql LIKE '%APROVADO%'" | count)" = 1
echo POSTCONDITIONS_OK
