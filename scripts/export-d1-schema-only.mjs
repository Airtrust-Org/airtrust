#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const INTERNAL_EXACT_NAMES = new Set(['d1_migrations']);
const INTERNAL_REASON_CODES = new Set(['sqlite_internal', 'cloudflare_internal', 'internal_ledger']);
const TYPE_RENDER_ORDER = {
  table: 1,
  view: 2,
  index: 3,
  trigger: 4,
};

const EXPLICIT_RESIDUAL_NAMES = new Set([
  '_backup_qh_tmp',
  '_data_recovery_log',
  '_qualificacoes_enriquecimento',
  '_qualificacoes_mapping',
  '__backup_pessoas',
  'backups',
  'backups_controle',
  'backups_logs',
  'escalas',
  'funcionarios_backup',
  'migracao_log',
  'migracao_mapeamento_ids',
  'qualificacoes_tipos_backup_0063',
  'qualificacoes_tipos_backup_20251128',
  'qualificacoes_tipos_id_map',
  'qualificacoes_tipos_old',
  'schema_versions',
  'vw_backups_monitoramento',
  'update_qt_timestamp',
  'trg_qualificacoes_tipos_prevent_hard_delete',
]);

const EXCLUDED_NAME_PATTERNS = [
  { reason: 'sqlite_internal', test: (name) => /^sqlite_/i.test(name) },
  { reason: 'cloudflare_internal', test: (name) => /^_cf_/i.test(name) },
  { reason: 'internal_ledger', test: (name) => INTERNAL_EXACT_NAMES.has(name) },
  { reason: 'explicit_residual', test: (name) => EXPLICIT_RESIDUAL_NAMES.has(name) },
  { reason: 'backup_name_pattern', test: (name) => /backup/i.test(name) },
  { reason: 'backup_prefix_pattern', test: (name) => /^bkp_/i.test(name) },
  { reason: 'tmp_suffix_pattern', test: (name) => /_tmp$/i.test(name) },
  { reason: 'tmp_prefix_pattern', test: (name) => /^tmp_/i.test(name) },
  { reason: 'temp_prefix_pattern', test: (name) => /^temp_/i.test(name) },
  { reason: 'old_suffix_pattern', test: (name) => /_old$/i.test(name) },
  { reason: 'legacy_prefix_pattern', test: (name) => /^legacy_/i.test(name) },
];

const PRE_0412_TABLE_COLUMN_RULES = [
  { table: 'qualificacoes_tipos', columns: ['formato_id', 'categoria_id', 'classe_requisito'] },
  {
    table: 'qualificacoes_historico',
    columns: ['formato_id', 'formato_codigo', 'categoria_id', 'categoria_codigo'],
  },
  { table: 'lms_cursos', columns: ['formato_id'] },
];

const TRIGGER_DML_PATTERN = /\b(INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+SET|DELETE\s+FROM|REPLACE\s+INTO|UPSERT)\b/i;
const PROHIBITED_STATEMENT_START = /^(INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE\s+[A-Za-z_][A-Za-z0-9_]*\s+SET|DELETE\s+FROM|REPLACE\s+INTO|UPSERT|DROP(?:\s+TABLE|\s+VIEW|\s+INDEX|\s+TRIGGER)?)/i;
const FK_PATTERN = /references\s+("?)([A-Za-z0-9_]+)\1/gi;
const OBJECT_REFERENCE_PATTERNS = [
  /\bFROM\s+("?)([A-Za-z_][A-Za-z0-9_]*)\1/gi,
  /\bJOIN\s+("?)([A-Za-z_][A-Za-z0-9_]*)\1/gi,
  /\bINTO\s+("?)([A-Za-z_][A-Za-z0-9_]*)\1/gi,
  /\bUPDATE\s+("?)([A-Za-z_][A-Za-z0-9_]*)\1/gi,
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function typeRank(type) {
  return TYPE_RENDER_ORDER[type] || 99;
}

function objectSortForRender(a, b) {
  return typeRank(a.type) - typeRank(b.type) || a.name.localeCompare(b.name);
}

function objectSortByIdentity(a, b) {
  return `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`);
}

function trimTrailingSemicolon(sql) {
  return sql.replace(/;\s*$/u, '');
}

function stripStringsAndComments(sql) {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'([^']|'')*'/g, ' ');
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inSingleQuote = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    current += char;

    if (char === "'" && next === "'" && inSingleQuote) {
      current += next;
      index += 1;
      continue;
    }

    if (char === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === ';' && !inSingleQuote) {
      const statement = current.slice(0, -1).trim();
      if (statement) {
        statements.push(statement);
      }
      current = '';
    }
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

function extractTriggerBody(sql) {
  const match = sql.match(/\bBEGIN\b([\s\S]*)\bEND\b/i);
  return match ? match[1] : '';
}

function parseArgs(argv) {
  const args = {
    inputJson: null,
    outputDir: null,
    stamp: null,
    writeSql: false,
    sourceLabel: 'production sqlite_master read-only query',
    sourceDatabaseName: 'airtrust-db',
    sourceDatabaseId: '7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--input-json':
        args.inputJson = argv[++index];
        break;
      case '--output-dir':
        args.outputDir = argv[++index];
        break;
      case '--stamp':
        args.stamp = argv[++index];
        break;
      case '--write-sql':
        args.writeSql = true;
        break;
      case '--source-label':
        args.sourceLabel = argv[++index];
        break;
      case '--source-database-name':
        args.sourceDatabaseName = argv[++index];
        break;
      case '--source-database-id':
        args.sourceDatabaseId = argv[++index];
        break;
      default:
        throw new Error(`unknown_argument:${arg}`);
    }
  }

  if (!args.inputJson) {
    throw new Error('missing_required_flag:--input-json');
  }

  return args;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function normalizeWranglerResults(raw) {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && Array.isArray(first.results)) {
      return first.results;
    }
  }

  if (raw && Array.isArray(raw.results)) {
    return raw.results;
  }

  if (Array.isArray(raw?.objects)) {
    return raw.objects;
  }

  throw new Error('unsupported_json_shape');
}

function normalizeObject(row) {
  return {
    type: String(row.type || '').toLowerCase(),
    name: String(row.name || ''),
    tbl_name: row.tbl_name ? String(row.tbl_name) : '',
    sql: String(row.sql || '').trim(),
  };
}

function getExclusionReasons(name) {
  return EXCLUDED_NAME_PATTERNS.filter((rule) => rule.test(name)).map((rule) => rule.reason);
}

function buildRiskFlags(exclusionReasons) {
  return {
    suspicious: exclusionReasons.some((reason) => !INTERNAL_REASON_CODES.has(reason)),
  };
}

function findIdentifierReferences(sql, knownNames, selfName) {
  const references = new Set();
  const sanitizedSql = stripStringsAndComments(sql).toLowerCase();

  for (const name of knownNames) {
    if (name === selfName) {
      continue;
    }
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(name.toLowerCase())}([^A-Za-z0-9_]|$)`, 'i');
    if (pattern.test(sanitizedSql)) {
      references.add(name);
    }
  }

  return [...references].sort();
}

function findForeignKeyReferences(sql) {
  const references = [];
  for (const match of sql.matchAll(FK_PATTERN)) {
    references.push(match[2]);
  }
  return [...new Set(references)];
}

function findPotentialObjectReferences(object) {
  const references = new Set();
  let relevantSql = object.sql;
  if (object.type === 'trigger') {
    relevantSql = extractTriggerBody(object.sql);
  } else if (object.type === 'view') {
    const match = object.sql.match(/\bAS\b([\s\S]*)$/i);
    relevantSql = match ? match[1] : object.sql;
  }
  const sanitizedSql = stripStringsAndComments(relevantSql);
  for (const pattern of OBJECT_REFERENCE_PATTERNS) {
    for (const match of sanitizedSql.matchAll(pattern)) {
      references.add(match[2]);
    }
  }
  return [...references];
}

function collectTopLevelProhibitedStatements(object) {
  if (object.type === 'trigger') {
    return [];
  }

  return splitSqlStatements(object.sql).filter((statement) => PROHIBITED_STATEMENT_START.test(statement));
}

function containsTriggerDml(object) {
  if (object.type !== 'trigger') {
    return false;
  }
  return TRIGGER_DML_PATTERN.test(extractTriggerBody(object.sql));
}

function collectPre0412Violations(objects) {
  const violations = [];
  const tables = new Map(objects.filter((object) => object.type === 'table').map((object) => [object.name, object]));

  if (tables.has('qualificacoes_formatos')) {
    violations.push({
      code: 'pre0412_table_present',
      object: 'qualificacoes_formatos',
      detail: 'Baseline pre-0412 forbids table qualificacoes_formatos.',
    });
  }

  for (const rule of PRE_0412_TABLE_COLUMN_RULES) {
    const table = tables.get(rule.table);
    if (!table) {
      continue;
    }
    const lowerSql = table.sql.toLowerCase();
    for (const column of rule.columns) {
      const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(column.toLowerCase())}([^A-Za-z0-9_]|$)`, 'i');
      if (pattern.test(lowerSql)) {
        violations.push({
          code: 'pre0412_column_present',
          object: rule.table,
          detail: `Baseline pre-0412 forbids column ${rule.table}.${column}.`,
        });
      }
    }
  }

  return violations;
}

function createDependencyEdge(source, target, targetObject, via) {
  return {
    source: source.name,
    source_type: source.type,
    target,
    target_type: targetObject?.type || 'absent',
    via,
  };
}

function buildRenderOrder(canonicalObjects, dependencyEdges) {
  const canonicalByName = new Map(canonicalObjects.map((object) => [object.name, object]));
  const indegree = new Map(canonicalObjects.map((object) => [object.name, 0]));
  const adjacency = new Map(canonicalObjects.map((object) => [object.name, new Set()]));

  for (const edge of dependencyEdges) {
    if (!canonicalByName.has(edge.source) || !canonicalByName.has(edge.target)) {
      continue;
    }
    if (edge.source === edge.target) {
      continue;
    }
    const outgoing = adjacency.get(edge.target);
    if (!outgoing.has(edge.source)) {
      outgoing.add(edge.source);
      indegree.set(edge.source, indegree.get(edge.source) + 1);
    }
  }

  const queue = canonicalObjects
    .filter((object) => indegree.get(object.name) === 0)
    .sort(objectSortForRender);
  const ordered = [];

  while (queue.length > 0) {
    queue.sort(objectSortForRender);
    const current = queue.shift();
    ordered.push(current);

    for (const dependentName of adjacency.get(current.name) || []) {
      indegree.set(dependentName, indegree.get(dependentName) - 1);
      if (indegree.get(dependentName) === 0) {
        queue.push(canonicalByName.get(dependentName));
      }
    }
  }

  const remaining = canonicalObjects
    .filter((object) => !ordered.some((candidate) => candidate.name === object.name))
    .sort(objectSortForRender);

  return [...ordered, ...remaining];
}

export function analyzeObjects(rawObjects, options = {}) {
  const objects = rawObjects.map(normalizeObject).sort(objectSortByIdentity);
  const knownNames = objects.map((object) => object.name);
  const allByName = new Map(objects.map((object) => [object.name, object]));
  const findings = [];
  const suspiciousObjects = [];
  const triggerDmlObjects = [];

  const classifications = new Map();
  for (const object of objects) {
    const exclusionReasons = getExclusionReasons(object.name);
    const riskFlags = buildRiskFlags(exclusionReasons);
    const record = {
      ...object,
      classification: exclusionReasons.length > 0 ? 'excluded' : 'canonical',
      exclusion_reasons: [...exclusionReasons],
      risk_flags: riskFlags,
      finalDecision: exclusionReasons.length > 0 ? 'excluded' : 'included',
    };
    classifications.set(object.name, record);
  }

  for (const object of objects) {
    const record = classifications.get(object.name);
    const baseObjectName = object.type === 'index' || object.type === 'trigger' ? object.tbl_name : '';

    if (baseObjectName) {
      const baseObject = classifications.get(baseObjectName);
      if (!baseObject) {
        findings.push({
          severity: 'fail',
          code: `${object.type}_base_object_absent`,
          object: object.name,
          detail: `${object.type} ${object.name} depends on absent base object ${baseObjectName}.`,
        });
      } else if (baseObject.classification !== 'canonical') {
        record.classification = 'excluded';
        record.finalDecision = 'excluded';
        record.exclusion_reasons = [
          ...new Set([...record.exclusion_reasons, `${object.type}_base_object_excluded`]),
        ];
      }
    }

    if (record.risk_flags.suspicious) {
      suspiciousObjects.push({
        ...record,
        finalDecision: record.finalDecision,
      });
    }

    if (containsTriggerDml(object)) {
      triggerDmlObjects.push(object.name);
    }

    const prohibitedStatements = collectTopLevelProhibitedStatements(object);
    if (prohibitedStatements.length > 0) {
      findings.push({
        severity: 'fail',
        code: 'prohibited_top_level_statement',
        object: object.name,
        detail: `Object ${object.name} contains prohibited top-level DML or DROP.`,
      });
    }
  }

  const dependencyEdges = [];
  for (const object of objects) {
    const explicitBaseObjectName = object.type === 'index' || object.type === 'trigger' ? object.tbl_name : '';
    if (explicitBaseObjectName) {
      dependencyEdges.push(
        createDependencyEdge(object, explicitBaseObjectName, allByName.get(explicitBaseObjectName), 'base_object'),
      );
    }

    const textualRefs = findIdentifierReferences(object.sql, knownNames, object.name);
    const fkRefs = object.type === 'table' ? findForeignKeyReferences(object.sql) : [];
    const potentialRefs = object.type === 'view' || object.type === 'trigger' ? findPotentialObjectReferences(object) : [];
    const mergedRefs = [...new Set([...textualRefs, ...fkRefs, ...potentialRefs])].sort();
    for (const target of mergedRefs) {
      dependencyEdges.push(
        createDependencyEdge(object, target, allByName.get(target), fkRefs.includes(target) ? 'foreign_key' : 'textual'),
      );
    }
  }

  const blockedDependencies = [];
  for (const edge of dependencyEdges) {
    const source = classifications.get(edge.source);
    const target = classifications.get(edge.target);
    const sourceIsCanonical = source?.classification === 'canonical';
    const targetIsExcluded = !target || target.classification === 'excluded';

    if (source?.classification === 'excluded' && edge.via === 'foreign_key' && targetIsExcluded) {
      findings.push({
        severity: 'warn',
        code: 'excluded_fk_to_excluded_or_absent',
        object: edge.source,
        detail: `Excluded ${edge.source_type} ${edge.source} keeps a foreign key to ${target ? 'excluded' : 'absent'} object ${edge.target}.`,
        edge,
      });
      continue;
    }

    if (!sourceIsCanonical || !targetIsExcluded) {
      continue;
    }

    const code = edge.via === 'foreign_key'
      ? 'canonical_fk_to_excluded_or_absent'
      : 'canonical_dependency_on_excluded_or_absent';
    const isDocumentedResidual = EXPLICIT_RESIDUAL_NAMES.has(edge.target);
    const finding = {
      severity: isDocumentedResidual ? 'warn' : 'fail',
      code,
      object: edge.source,
      detail: `Canonical ${edge.source_type} ${edge.source} references ${target ? 'excluded' : 'absent'} object ${edge.target}.${isDocumentedResidual ? ' Target is documented residual (see docs/SCHEMA_OBJECT_CANONICALITY_AUDIT_20260701.md).' : ''}`,
      edge,
    };
    findings.push(finding);
    if (finding.severity === 'fail') {
      blockedDependencies.push(finding);
    }
  }

  findings.push(...collectPre0412Violations(objects).map((violation) => ({ severity: 'fail', ...violation })));

  const canonicalObjects = [...classifications.values()]
    .filter((record) => record.classification === 'canonical')
    .sort(objectSortByIdentity);
  const excludedObjects = [...classifications.values()]
    .filter((record) => record.classification === 'excluded')
    .sort(objectSortByIdentity);
  const renderableObjects = buildRenderOrder(canonicalObjects, dependencyEdges);

  const manifest = {
    stamp: options.stamp || null,
    mode: options.writeSql ? 'audit+sql' : 'audit-only',
    source: {
      label: options.sourceLabel || null,
      database_name: options.sourceDatabaseName || null,
      database_id: options.sourceDatabaseId || null,
    },
    classification_model: {
      canonical: 'included in baseline output',
      excluded: 'excluded from baseline output',
      suspicious: 'risk dimension recorded for policy-excluded residual objects; inspect finalDecision for confirmation',
    },
    counts: {
      all: objects.length,
      canonical: canonicalObjects.length,
      suspicious: suspiciousObjects.length,
      excluded: excludedObjects.length,
      tables: objects.filter((object) => object.type === 'table').length,
      indexes: objects.filter((object) => object.type === 'index').length,
      views: objects.filter((object) => object.type === 'view').length,
      triggers: objects.filter((object) => object.type === 'trigger').length,
    },
    trigger_dml_objects: triggerDmlObjects.sort(),
    findings,
    blocked_dependencies: blockedDependencies,
  };

  return {
    allObjects: objects,
    canonicalObjects,
    suspiciousObjects: suspiciousObjects.sort(objectSortByIdentity),
    excludedObjects,
    dependencyEdges: dependencyEdges.sort((a, b) => `${a.source}:${a.target}:${a.via}`.localeCompare(`${b.source}:${b.target}:${b.via}`)),
    blockedDependencies,
    findings,
    manifest,
    renderableObjects,
  };
}

export function renderSql(objectsForRender) {
  return `${objectsForRender.map((object) => `${trimTrailingSemicolon(object.sql)};`).join('\n\n')}\n`;
}

function renderReport(analysis, options, sqlSha256) {
  const failedFindings = analysis.findings.filter((finding) => finding.severity === 'fail');
  const lines = [
    '# Schema Baseline Report',
    '',
    `- Source: \`${options.sourceLabel}\``,
    `- Database: \`${options.sourceDatabaseName}\``,
    `- Database ID: \`${options.sourceDatabaseId}\``,
    `- Mode: \`${options.writeSql ? 'audit+sql' : 'audit-only'}\``,
    `- Final status: \`${failedFindings.length === 0 ? 'PASS' : 'FAIL'}\``,
    `- Total objects read: ${analysis.manifest.counts.all}`,
    `- Canonical objects: ${analysis.manifest.counts.canonical}`,
    `- Suspicious objects: ${analysis.manifest.counts.suspicious}`,
    `- Excluded objects: ${analysis.manifest.counts.excluded}`,
    `- Blocking findings: ${failedFindings.length}`,
    '',
    '## Guarantees',
    '',
    '- Read-only inventory of `sqlite_master` objects only.',
    '- No data rows exported.',
    '- `d1_migrations`, `_cf_%`, `sqlite_%`, backup/tmp/legacy/old residuals excluded by policy.',
    '- Pre-0412 guard enforced: `qualificacoes_formatos` and 0412 columns cause failure.',
    '- Top-level `INSERT`, `UPDATE`, `DELETE`, `REPLACE`, `UPSERT`, and `DROP` statements outside triggers are forbidden.',
    '- Valid FK clauses such as `ON UPDATE CASCADE` and `ON DELETE CASCADE` remain allowed DDL.',
    '- Trigger-local DML is inventoried and reported, not auto-failed.',
    '- `schema_baseline_pre0412.sql` is written only when `status = PASS` and `--write-sql` is explicitly requested.',
    '',
    '## Classification Model',
    '',
    '- `canonical`: objects included in baseline output.',
    '- `excluded`: objects omitted from baseline output.',
    '- `suspicious`: risk dimension recorded for review; inspect `finalDecision` on each suspicious object.',
    '',
    '## Trigger DML Inventory',
    '',
  ];

  if (analysis.manifest.trigger_dml_objects.length === 0) {
    lines.push('- None');
  } else {
    for (const triggerName of analysis.manifest.trigger_dml_objects) {
      lines.push(`- \`${triggerName}\``);
    }
  }

  lines.push('', '## Blocking Findings', '');
  if (failedFindings.length === 0) {
    lines.push('- None');
  } else {
    for (const finding of failedFindings) {
      lines.push(`- \`${finding.code}\` on \`${finding.object}\`: ${finding.detail}`);
    }
  }

  lines.push('', '## Artifacts', '');
  lines.push('- `all_objects.json`');
  lines.push('- `canonical_objects.json`');
  lines.push('- `suspicious_objects.json`');
  lines.push('- `excluded_objects.json`');
  lines.push('- `dependency_edges.json`');
  lines.push('- `blocked_dependencies.json`');
  lines.push('- `schema_baseline_manifest.json`');
  lines.push('- `schema_baseline_report.md`');

  if (options.writeSql && sqlSha256) {
    lines.push('- `schema_baseline_pre0412.sql`');
    lines.push(`- SQL SHA256: \`${sqlSha256}\``);
  } else if (options.writeSql) {
    lines.push('- `schema_baseline_pre0412.sql` not emitted because final status is `FAIL`.');
  }

  return `${lines.join('\n')}\n`;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeArtifacts(analysis, options) {
  fs.mkdirSync(options.outputDir, { recursive: true });

  const failedFindings = analysis.findings.filter((finding) => finding.severity === 'fail');
  const shouldWriteSql = options.writeSql && failedFindings.length === 0;

  let sqlSha256 = null;
  if (shouldWriteSql) {
    const sql = renderSql(analysis.renderableObjects);
    const sqlPath = path.join(options.outputDir, 'schema_baseline_pre0412.sql');
    fs.writeFileSync(sqlPath, sql);
    sqlSha256 = crypto.createHash('sha256').update(sql).digest('hex');
  }

  writeJson(path.join(options.outputDir, 'all_objects.json'), analysis.allObjects);
  writeJson(path.join(options.outputDir, 'canonical_objects.json'), analysis.canonicalObjects);
  writeJson(path.join(options.outputDir, 'suspicious_objects.json'), analysis.suspiciousObjects);
  writeJson(path.join(options.outputDir, 'excluded_objects.json'), analysis.excludedObjects);
  writeJson(path.join(options.outputDir, 'dependency_edges.json'), analysis.dependencyEdges);
  writeJson(path.join(options.outputDir, 'blocked_dependencies.json'), analysis.blockedDependencies);

  const manifest = {
    ...analysis.manifest,
    status: failedFindings.length === 0 ? 'PASS' : 'FAIL',
    output_dir: options.outputDir,
    sql_sha256: sqlSha256,
    sql_emitted: shouldWriteSql,
    artifact_hash: crypto.createHash('sha256').update(stableStringify(analysis.manifest)).digest('hex'),
  };
  writeJson(path.join(options.outputDir, 'schema_baseline_manifest.json'), manifest);
  fs.writeFileSync(path.join(options.outputDir, 'schema_baseline_report.md'), renderReport(analysis, options, sqlSha256));

  return manifest;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const raw = readJsonFile(args.inputJson);
  const objects = normalizeWranglerResults(raw);
  const analysis = analyzeObjects(objects, args);
  const manifest = writeArtifacts(analysis, args);

  process.stdout.write(
    `${JSON.stringify({
      status: manifest.status,
      output_dir: args.outputDir,
      findings: analysis.findings.filter((finding) => finding.severity === 'fail').length,
      mode: manifest.mode,
      sql_emitted: manifest.sql_emitted,
    })}\n`,
  );
  if (manifest.status !== 'PASS') {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
