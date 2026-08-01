#!/usr/bin/env node

// source_reference: issue #568 staging runs 30703547716 and 30706103939.
// The first proved the synthetic tenant needed one deliberately unclassified
// qualification; the second proved empresas_config in the real staging schema
// does not expose deleted_at.
// operational_decision: STAGING_ONLY; provision one durable synthetic type and
// history by exact QA natural keys, while adapting every empresas_config write
// and read predicate to the columns actually present in the remote schema.
// dry_run_required: default mode is read-only; --apply requires the exact
// AIRTRUST_STAGING_QA_CERT_CANDIDATE confirmation phrase.
// rollback_plan_required: --rollback soft-deletes only the exact synthetic type
// and history and requires AIRTRUST_STAGING_QA_CERT_CANDIDATE_ROLLBACK.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseWranglerJson } from './seed-qa-admin-operational-grant.mjs';

export const QA_CERT_CANDIDATE = Object.freeze({
  allowedD1Name: 'airtrust-db-staging-baseline-20260701',
  allowedD1Id: 'bf9963f4-eb12-439b-a830-20bbf577ac22',
  blockedProductionD1Id: '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
  applyConfirmation: 'AIRTRUST_STAGING_QA_CERT_CANDIDATE',
  rollbackConfirmation: 'AIRTRUST_STAGING_QA_CERT_CANDIDATE_ROLLBACK',
  empresaCodigo: 'qa_examiner_training',
  setorCodigo: 'QA-SETOR-EXA',
  funcionarioMatricula: 'QA-PARTICIPANTE-ALFA',
  syntheticCpf: '99900600001',
  tipoCodigo: 'QA-CERT-DOMAIN-E2E-999006',
  tipoNome: 'QA Certificado Domínio E2E',
  historyMarker: 'QA_CERT_DOMAIN_E2E_999006',
});

const TEMPLATE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;padding:32px}.box{border:2px solid #111;padding:28px}h1{text-align:center}</style></head><body><main class="box"><h1>Certificado QA</h1><p>Certificamos que <strong>{{funcionario_nome}}</strong> concluiu <strong>{{qualificacao_nome}}</strong> ({{qualificacao_codigo}}).</p><p>Conclusão: {{data_conclusao}}</p><p>Carga horária: {{carga_horaria}}</p><div>{{conteudo}}</div><p>Nº {{numero_certificado}}</p></main></body></html>`;

const DEFAULT_CONFIG_COLUMNS = [
  'id',
  'empresa_id',
  'certificado_template_html',
  'timezone',
  'idioma',
  'created_at',
  'updated_at',
  'deleted_at',
];

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function validateCandidateTarget({ dbName, dbId }) {
  const name = String(dbName || '').trim();
  const id = String(dbId || '').trim().toLowerCase();
  if (name !== QA_CERT_CANDIDATE.allowedD1Name || /prod/i.test(name)) {
    throw new Error(`QA_CERT_D1_NAME_REJECTED:${name || 'empty'}`);
  }
  if (
    id !== QA_CERT_CANDIDATE.allowedD1Id ||
    id === QA_CERT_CANDIDATE.blockedProductionD1Id
  ) {
    throw new Error(`QA_CERT_D1_ID_REJECTED:${id || 'empty'}`);
  }
  return { dbName: name, dbId: id };
}

function columnNames(payload) {
  const rows = Array.isArray(payload) ? payload[0]?.results || [] : payload?.results || [];
  return new Set(rows.map((row) => String(row?.name || '')).filter(Boolean));
}

function requireColumns(columns, table, required) {
  for (const column of required) {
    if (!columns.has(column)) throw new Error(`QA_CERT_SCHEMA_MISSING:${table}.${column}`);
  }
}

function selectSupported(columns, values) {
  return Object.entries(values).filter(
    ([column, value]) => columns.has(column) && value !== undefined,
  );
}

function insertSelect(table, columns, values, fromAndWhere) {
  const supported = selectSupported(columns, values);
  if (supported.length === 0) throw new Error(`QA_CERT_INSERT_COLUMNS_EMPTY:${table}`);
  return `INSERT INTO ${table} (${supported.map(([column]) => column).join(', ')})\nSELECT ${supported
    .map(([, value]) => value)
    .join(', ')}\n${fromAndWhere};`;
}

function updateAssignments(columns, values) {
  return selectSupported(columns, values)
    .map(([column, value]) => `${column} = ${value}`)
    .join(',\n    ');
}

function empresaIdSql() {
  return `(SELECT id FROM empresas WHERE codigo = ${sqlString(QA_CERT_CANDIDATE.empresaCodigo)} AND ativo = 1 AND deleted_at IS NULL LIMIT 1)`;
}

export function buildCandidateSql(
  typeColumnsInput,
  historyColumnsInput,
  mode = 'apply',
  configColumnsInput = DEFAULT_CONFIG_COLUMNS,
  funcionarioColumnsInput = ['id', 'cpf', 'updated_at'],
) {
  const typeColumns = new Set(typeColumnsInput);
  const historyColumns = new Set(historyColumnsInput);
  const configColumns = new Set(configColumnsInput);
  const funcionarioColumns = new Set(funcionarioColumnsInput);

  requireColumns(typeColumns, 'qualificacoes_tipos', [
    'id',
    'codigo',
    'nome',
    'categoria_id',
    'dominio_codigo',
    'empresa_id',
    'ativo',
    'deleted_at',
  ]);
  requireColumns(historyColumns, 'qualificacoes_historico', [
    'id',
    'funcionario_id',
    'qualificacao_id',
    'data_conclusao',
    'empresa_id',
    'observacoes',
    'deleted_at',
  ]);
  requireColumns(configColumns, 'empresas_config', [
    'empresa_id',
    'certificado_template_html',
  ]);
  requireColumns(funcionarioColumns, 'funcionarios', ['id']);

  const q = QA_CERT_CANDIDATE;
  const e = sqlString;
  const empresaId = empresaIdSql();
  const funcionarioId = `(SELECT f.id FROM funcionarios f WHERE f.empresa_id = ${empresaId} AND f.matricula = ${e(q.funcionarioMatricula)} AND f.ativo = 1 AND f.deleted_at IS NULL LIMIT 1)`;
  const tipoId = `(SELECT qt.id FROM qualificacoes_tipos qt WHERE qt.empresa_id = ${empresaId} AND qt.codigo = ${e(q.tipoCodigo)} LIMIT 1)`;

  if (mode === 'rollback') {
    const historyUpdatedAt = historyColumns.has('updated_at')
      ? ", updated_at = datetime('now')"
      : '';
    const typeUpdatedAt = typeColumns.has('updated_at') ? ", updated_at = datetime('now')" : '';
    return `UPDATE qualificacoes_historico SET deleted_at = datetime('now')${historyUpdatedAt}\nWHERE empresa_id = ${empresaId} AND observacoes = ${e(q.historyMarker)} AND deleted_at IS NULL;\n\nUPDATE qualificacoes_tipos SET deleted_at = datetime('now'), ativo = 0${typeUpdatedAt}\nWHERE empresa_id = ${empresaId} AND codigo = ${e(q.tipoCodigo)} AND deleted_at IS NULL;`;
  }
  if (mode !== 'apply') throw new Error(`QA_CERT_MODE_INVALID:${mode}`);

  const typeValues = {
    tipo: e('TREINAMENTO'),
    codigo: e(q.tipoCodigo),
    nome: e(q.tipoNome),
    descricao: e('Fixture sintética para validação E2E de certificado e RBAC em staging.'),
    categoria: e('QA E2E sem categoria canônica'),
    categoria_id: 'NULL',
    dominio_codigo: 'NULL',
    carga_horaria: '1',
    carga_horaria_inicial: '1',
    carga_horaria_recorrente: '1',
    conteudo_programatico: e(
      'Validação sintética do fluxo de certificado por domínio operacional.',
    ),
    validade: '12',
    vencimento_fim_mes: '0',
    observacoes: e(q.historyMarker),
    ativo: '1',
    is_check: '0',
    classe_requisito: e('TREINAMENTO'),
    empresa_id: empresaId,
    created_at: `datetime('now')`,
    updated_at: `datetime('now')`,
    deleted_at: 'NULL',
  };

  const historyValues = {
    funcionario_id: funcionarioId,
    funcionario_cpf: funcionarioColumns.has('cpf')
      ? `(SELECT cpf FROM funcionarios WHERE id = ${funcionarioId})`
      : undefined,
    qualificacao_id: tipoId,
    qualificacao_codigo: e(q.tipoCodigo),
    tipo: e(q.tipoNome),
    categoria: e('QA E2E sem categoria canônica'),
    categoria_id: 'NULL',
    data_conclusao: `date('now','-1 day')`,
    data_vencimento: `date('now','+12 months')`,
    carga_horaria: '1',
    nota: '5',
    instrutor: e('QA Instrutor Examinador'),
    local: e('STAGING QA'),
    modalidade: e('EAD'),
    observacoes: e(q.historyMarker),
    status: e('CONCLUIDA'),
    validade_meses: '12',
    tipo_treinamento: e('INICIAL'),
    empresa_id: empresaId,
    created_at: `datetime('now')`,
    updated_at: `datetime('now')`,
    deleted_at: 'NULL',
  };

  const configValues = {
    empresa_id: empresaId,
    certificado_template_html: e(TEMPLATE_HTML),
    timezone: e('America/Sao_Paulo'),
    idioma: e('pt-BR'),
    created_at: `datetime('now')`,
    updated_at: `datetime('now')`,
    deleted_at: 'NULL',
  };

  const typeUpdate = updateAssignments(typeColumns, {
    ...typeValues,
    created_at: undefined,
  });
  const historyUpdate = updateAssignments(historyColumns, {
    ...historyValues,
    certificado_arquivo_id: undefined,
    created_at: undefined,
  });
  const configUpdate = updateAssignments(configColumns, {
    certificado_template_html: `CASE WHEN TRIM(COALESCE(certificado_template_html, '')) = '' THEN ${e(TEMPLATE_HTML)} ELSE certificado_template_html END`,
    deleted_at: 'NULL',
    updated_at: `datetime('now')`,
  });

  const funcionarioUpdate = [];
  if (funcionarioColumns.has('cpf')) {
    funcionarioUpdate.push(`cpf = COALESCE(NULLIF(TRIM(cpf), ''), ${e(q.syntheticCpf)})`);
  }
  if (funcionarioColumns.has('updated_at')) {
    funcionarioUpdate.push(`updated_at = datetime('now')`);
  }

  return `
${
  funcionarioUpdate.length > 0
    ? `UPDATE funcionarios\nSET ${funcionarioUpdate.join(',\n    ')}\nWHERE id = ${funcionarioId};`
    : '-- funcionarios has no mutable fixture columns beyond id; no update required.'
}

UPDATE empresas_config
SET ${configUpdate}
WHERE empresa_id = ${empresaId};

${insertSelect(
  'empresas_config',
  configColumns,
  configValues,
  `WHERE NOT EXISTS (SELECT 1 FROM empresas_config WHERE empresa_id = ${empresaId})`,
)}

UPDATE qualificacoes_tipos
SET ${typeUpdate}
WHERE empresa_id = ${empresaId} AND codigo = ${e(q.tipoCodigo)};

${insertSelect(
  'qualificacoes_tipos',
  typeColumns,
  typeValues,
  `FROM empresas emp\nWHERE emp.id = ${empresaId}\n  AND NOT EXISTS (SELECT 1 FROM qualificacoes_tipos qt WHERE qt.empresa_id = emp.id AND qt.codigo = ${e(q.tipoCodigo)})`,
)}

UPDATE qualificacoes_historico
SET ${historyUpdate}
WHERE empresa_id = ${empresaId} AND observacoes = ${e(q.historyMarker)};

${insertSelect(
  'qualificacoes_historico',
  historyColumns,
  historyValues,
  `FROM empresas emp\nWHERE emp.id = ${empresaId}\n  AND ${funcionarioId} IS NOT NULL\n  AND ${tipoId} IS NOT NULL\n  AND NOT EXISTS (SELECT 1 FROM qualificacoes_historico qh WHERE qh.empresa_id = emp.id AND qh.observacoes = ${e(q.historyMarker)})`,
)}
`;
}

export function buildCandidatePostconditionSql(
  configColumnsInput = DEFAULT_CONFIG_COLUMNS,
) {
  const q = QA_CERT_CANDIDATE;
  const e = sqlString;
  const configColumns = new Set(configColumnsInput);
  const configActivePredicate = configColumns.has('deleted_at')
    ? ' AND ec.deleted_at IS NULL'
    : '';
  return `SELECT
    (SELECT COUNT(*) FROM qualificacoes_tipos qt INNER JOIN empresas emp ON emp.id = qt.empresa_id
      WHERE emp.codigo = ${e(q.empresaCodigo)} AND qt.codigo = ${e(q.tipoCodigo)}
        AND qt.ativo = 1 AND qt.deleted_at IS NULL AND qt.categoria_id IS NULL
        AND qt.dominio_codigo IS NULL) AS type_count,
    (SELECT COUNT(*) FROM qualificacoes_historico qh
      INNER JOIN empresas emp ON emp.id = qh.empresa_id
      INNER JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.empresa_id = qh.empresa_id
      INNER JOIN funcionarios f ON f.id = qh.funcionario_id AND f.empresa_id = qh.empresa_id
      INNER JOIN setores s ON s.id = f.setor_id AND s.empresa_id = f.empresa_id
      WHERE emp.codigo = ${e(q.empresaCodigo)} AND qt.codigo = ${e(q.tipoCodigo)}
        AND qh.observacoes = ${e(q.historyMarker)} AND qh.data_conclusao IS NOT NULL
        AND qh.deleted_at IS NULL AND f.matricula = ${e(q.funcionarioMatricula)}
        AND s.codigo = ${e(q.setorCodigo)} AND s.dominio_codigo = 'OPERACOES') AS history_count,
    (SELECT COUNT(*) FROM empresas_config ec INNER JOIN empresas emp ON emp.id = ec.empresa_id
      WHERE emp.codigo = ${e(q.empresaCodigo)}${configActivePredicate}
        AND TRIM(COALESCE(ec.certificado_template_html, '')) <> '') AS template_count;`;
}

function executeWranglerJson(dbName, args) {
  const result = spawnSync(
    'npx',
    ['wrangler', 'd1', 'execute', dbName, '--remote', ...args, '--json'],
    {
      cwd: join(process.cwd(), 'worker-airtrust'),
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'wrangler d1 execute failed');
  }
  return parseWranglerJson(result.stdout);
}

function firstRow(payload) {
  const row = Array.isArray(payload) ? payload[0]?.results?.[0] : payload?.results?.[0];
  if (!row) throw new Error('QA_CERT_D1_ROW_MISSING');
  return row;
}

function readRemoteColumns(dbName, table) {
  return columnNames(
    executeWranglerJson(dbName, ['--command', `PRAGMA table_info('${table}')`]),
  );
}

export async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const rollback = args.has('--rollback');
  if (apply && rollback) throw new Error('QA_CERT_MODE_CONFLICT');

  const target = validateCandidateTarget({
    dbName: process.env.STAGING_D1_NAME || QA_CERT_CANDIDATE.allowedD1Name,
    dbId: process.env.STAGING_D1_ID || QA_CERT_CANDIDATE.allowedD1Id,
  });
  const typeColumns = readRemoteColumns(target.dbName, 'qualificacoes_tipos');
  const historyColumns = readRemoteColumns(target.dbName, 'qualificacoes_historico');
  const configColumns = readRemoteColumns(target.dbName, 'empresas_config');
  const funcionarioColumns = readRemoteColumns(target.dbName, 'funcionarios');
  const mode = rollback ? 'rollback' : apply ? 'apply' : 'dry-run';
  const reportPath = String(process.env.QA_CERT_CANDIDATE_REPORT_PATH || '').trim();
  const report = {
    success: false,
    mode,
    target: target.dbName,
    schema: {
      empresasConfigHasDeletedAt: configColumns.has('deleted_at'),
      empresasConfigHasUpdatedAt: configColumns.has('updated_at'),
    },
    before: null,
    after: null,
    changed: false,
    error: null,
  };

  try {
    const postconditionSql = buildCandidatePostconditionSql([...configColumns]);
    const before = firstRow(
      executeWranglerJson(target.dbName, ['--command', postconditionSql]),
    );
    report.before = before;

    if (!apply && !rollback) {
      report.success = true;
      report.after = before;
      if (reportPath) {
        writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
      }
      console.log(JSON.stringify({ success: true, mode, before, schema: report.schema }));
      return;
    }

    const expected = rollback
      ? QA_CERT_CANDIDATE.rollbackConfirmation
      : QA_CERT_CANDIDATE.applyConfirmation;
    if (process.env.CONFIRM_STAGING_QA_CERT_CANDIDATE !== expected) {
      throw new Error(`QA_CERT_CONFIRMATION_REQUIRED:${expected}`);
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'airtrust-staging-qa-cert-candidate-'));
    const sqlFile = join(tempDir, rollback ? 'rollback.sql' : 'apply.sql');
    writeFileSync(
      sqlFile,
      buildCandidateSql(
        [...typeColumns],
        [...historyColumns],
        rollback ? 'rollback' : 'apply',
        [...configColumns],
        [...funcionarioColumns],
      ),
      { mode: 0o600 },
    );
    try {
      executeWranglerJson(target.dbName, ['--file', sqlFile]);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    const after = firstRow(
      executeWranglerJson(target.dbName, ['--command', postconditionSql]),
    );
    report.after = after;
    const expectedCount = rollback ? 0 : 1;
    if (
      Number(after.type_count) !== expectedCount ||
      Number(after.history_count) !== expectedCount
    ) {
      throw new Error(
        `QA_CERT_POSTCONDITION:type=${after.type_count};history=${after.history_count};expected=${expectedCount}`,
      );
    }
    if (!rollback && Number(after.template_count) !== 1) {
      throw new Error(`QA_CERT_TEMPLATE_POSTCONDITION:${after.template_count}`);
    }
    report.changed =
      Number(before.type_count) !== Number(after.type_count) ||
      Number(before.history_count) !== Number(after.history_count);
    report.success = true;
    if (reportPath) {
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    }
    console.log(
      JSON.stringify({ success: true, mode, changed: report.changed, after, schema: report.schema }),
    );
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    if (reportPath) {
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(
      `STAGING_QA_CERT_CANDIDATE_FAILED: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}
