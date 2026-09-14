#!/usr/bin/env node
// source_reference: issue #648 / staging simulator planning persistence QA
// operational_decision: read-only schema compatibility gate before any synthetic D1 mutation
// dry_run_required: always read-only
// rollback_plan_required: not applicable; PRAGMA only
import { spawnSync } from 'node:child_process';

const DB = 'airtrust-db-staging-baseline-20260701';
const requested = String(process.env.STAGING_D1_NAME || DB).trim();
if (requested !== DB || /prod/i.test(requested)) throw new Error(`STAGING_TARGET_REFUSED:${requested}`);

const REQUIRED = {
  empresas: ['id','codigo','ativo','deleted_at'],
  empresas_config: [
    'empresa_id','planejamento_simulador_antecedencia_dias','planejamento_simulador_regra_quinzena',
    'planejamento_simulador_permitir_sessao_compartilhada','planejamento_simulador_preferir_mesmo_treinamento',
    'planejamento_simulador_preferir_mesma_sessao','planejamento_simulador_aprovacao_obrigatoria',
  ],
  funcionarios: [
    'id','empresa_id','nome','matricula','cargo','setor','setor_id','status','is_instrutor','is_checador',
    'is_examinador','ativo','created_at','updated_at','deleted_at',
  ],
  qualificacoes_categorias: [
    'id','empresa_id','nome','codigo','descricao','cor','ativo','dominio_codigo','lms_integrada',
    'created_at','updated_at','deleted_at',
  ],
  qualificacoes_tipos: [
    'id','empresa_id','tipo','codigo','nome','descricao','categoria_id','categoria','carga_horaria','validade',
    'vencimento_fim_mes','observacoes','ativo','created_at','updated_at','deleted_at',
  ],
  modelos_sessao: [
    'id','empresa_id','codigo','nome','tipo','descricao','duracao_estimada','ordem_no_treinamento','ativo',
    'modelo_aeronave','qualificacao_tipo_id','created_at','updated_at','deleted_at',
  ],
  modelos_sessao_versionamento: [
    'modelo_id','empresa_id','codigo_canonico','versao_numero','versao_matriz','is_current','modelo_anterior_id',
    'efetivo_em','efetivo_ate','created_at','updated_at',
  ],
  qualificacoes_historico: [
    'funcionario_id','qualificacao_id','qualificacao_codigo','data_conclusao','data_vencimento','validade_meses',
    'codigo','categoria','observacoes','carga_horaria','status','empresa_id','created_at','updated_at','deleted_at',
  ],
  escalas_mensais: [
    'id','mes','ano','titulo','status','observacoes','empresa_id','created_by','created_at','updated_at','deleted_at',
  ],
  escala_alocacoes: [
    'id','escala_id','funcionario_id','aeronave_id','funcao','situacao_tipo','situacao_cor','quinzena_id',
    'data_inicio','data_fim','status','observacoes','created_by','created_at','updated_at','deleted_at',
  ],
  treinamentos_planejados: [
    'empresa_id','planejamento_origem','planejamento_snapshot_json','deleted_at','updated_at',
  ],
};

function d1(sql) {
  if (!/^\s*PRAGMA\b/i.test(sql)) throw new Error('READ_ONLY_PRAGMA_REQUIRED');
  const result = spawnSync('npx', ['wrangler','d1','execute',requested,'--remote','--json','--command',sql], {
    cwd: 'worker-airtrust', encoding: 'utf8', env: process.env,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'D1_PRAGMA_FAILED');
  const start = result.stdout.indexOf('['), end = result.stdout.lastIndexOf(']');
  const payload = JSON.parse(start >= 0 && end > start ? result.stdout.slice(start, end + 1) : result.stdout);
  return payload[0]?.results || [];
}

const missing = {};
for (const [table, required] of Object.entries(REQUIRED)) {
  const rows = d1(`PRAGMA table_info(${table});`);
  const actual = new Set(rows.map((row) => String(row.name || '')));
  const absent = required.filter((column) => !actual.has(column));
  if (absent.length > 0) missing[table] = absent;
}

const compatible = Object.keys(missing).length === 0;
console.log(JSON.stringify({
  target: requested,
  mode: 'READ_ONLY_SCHEMA_PREFLIGHT',
  fixture_schema_compatible: compatible,
  checked_tables: Object.keys(REQUIRED).length,
  missing_columns: missing,
}, null, 2));
if (!compatible) process.exitCode = 4;
