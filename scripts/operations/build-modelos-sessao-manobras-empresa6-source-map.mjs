#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

const OUTPUT_PATH = path.join(
  ROOT,
  'scripts',
  'operations',
  'modelos-sessao-manobras-empresa6-source-map.json',
);

const DUMP_PATH = path.join(ROOT, 'scripts', 'legacy', 'd1-prod-20260315-193839.sql');
const BACKUP_PRE_MULTITENANT_PATH = path.join(
  ROOT,
  'scripts',
  'legacy',
  'backup_pre_multitenant_20251207_142032.sql',
);
const MIGRATION_0297_PATH = path.join(
  ROOT,
  'worker-airtrust',
  'migrations',
  '0297_tripulante_ab_distribution.sql',
);
const MIGRATION_0299_PATH = path.join(
  ROOT,
  'worker-airtrust',
  'migrations',
  '0299_loft_chk_manobras.sql',
);
const PTO_REV10_OCR_PATH = path.join(ROOT, 'docs', 'vendor', 'pto', 'relacao_manobras_pto_rev10_ocr.md');

const STATUS_HISTORICAL_DB_VERIFIED = 'historical_db_verified';
const STATUS_MIGRATION_VERIFIED = 'migration_verified';
const STATUS_PTO_VISUAL_VERIFIED = 'pto_visual_verified';
const STATUS_CATALOG_EQUIVALENCE_VERIFIED = 'catalog_equivalence_verified';
const STATUS_OPERATIONAL_CONFIRMED = 'responsavel_operacional_confirmado';
const STATUS_OPERATIONAL_INFERENCE_CONFIRMED = 'operational_inference_confirmed';
const STATUS_MISSING = 'missing';
const STATUS_AMBIGUOUS = 'ambiguous';
const VERIFIED_STATUSES = new Set([
  STATUS_HISTORICAL_DB_VERIFIED,
  STATUS_MIGRATION_VERIFIED,
  STATUS_PTO_VISUAL_VERIFIED,
  STATUS_OPERATIONAL_CONFIRMED,
  STATUS_OPERATIONAL_INFERENCE_CONFIRMED,
]);

const USER_CONFIRMED_AB_SOURCE = 'responsavel_operacional_confirmado_2026-06-16:AB';
const A139_OPERATIONAL_CONFIRMED_AB_SOURCE =
  'responsavel_operacional_confirmado_2026-06-16:A139-I-11/12:AB';
const A139_PC1_IFR_ORDER10_SOURCE =
  'operational_inference_confirmed_2026-06-16:A139-P-C1/IFR:ordem_10:derived_from_similar_A139_IFR_cycle';
const USER_CONFIRMED_AB_MODELS = new Set(['A139-REQ-01', 'S76-REQ-01', 'TRE-INST', 'CRED-EXA']);
const EXPLICIT_CLASSIFICATION_SOURCE_FRAGMENTS = [
  'worker-airtrust/migrations/0299_loft_chk_manobras.sql',
  'worker-airtrust/migrations/0300_loft_off_not_e_fap_refs.sql',
  'worker-airtrust/migrations/0375_redistribuir_pf_sk76_inicial.sql',
  'worker-airtrust/migrations/0382_create_sk76_semestral_sessions.sql',
  'worker-airtrust/migrations/0383_split_night_training_onshore_offshore.sql',
];

const DUMP_MODEL_SPECS = [
  { currentCode: 'A139-I-01/12', dumpModelId: 16 },
  { currentCode: 'A139-I-02/12', dumpModelId: 17 },
  { currentCode: 'A139-I-03/12', dumpModelId: 18 },
  { currentCode: 'A139-I-04/12', dumpModelId: 19 },
  { currentCode: 'A139-I-05/12', dumpModelId: 20 },
  { currentCode: 'A139-I-06/12', dumpModelId: 21 },
  { currentCode: 'A139-I-07/12', dumpModelId: 22 },
  { currentCode: 'A139-I-08/12', dumpModelId: 23 },
  { currentCode: 'A139-I-09/12', dumpModelId: 24 },
  { currentCode: 'A139-I-10/12', dumpModelId: 25 },
  { currentCode: 'A139-P-C1/VFR', dumpModelId: 28 },
  { currentCode: 'A139-P-C1/IFR', dumpModelId: 29 },
  { currentCode: 'A139-P-C2/VFR', dumpModelId: 30 },
  { currentCode: 'A139-P-C2/IFR', dumpModelId: 31 },
  { currentCode: 'A139-P-C3/VFR', dumpModelId: 32 },
  { currentCode: 'A139-P-C3/IFR', dumpModelId: 33 },
  { currentCode: 'S76-P-C1/VFR', dumpModelId: 45 },
  { currentCode: 'S76-P-C1/IFR', dumpModelId: 46 },
  { currentCode: 'S76-P-C2/VFR', dumpModelId: 47 },
  { currentCode: 'S76-P-C2/IFR', dumpModelId: 48 },
  { currentCode: 'S76-P-C3/VFR', dumpModelId: 49 },
  { currentCode: 'S76-P-C3/IFR', dumpModelId: 50 },
];

const ID_TO_MODEL_CODE = new Map([
  [27, 'A139-I-12/12'],
  [34, 'A139-P-LOFT/CHECK'],
  [44, 'SK76-P-CHECK'],
  [51, 'A139-P-LOFT/OFFSHORE'],
  [52, 'A139-S-01/02'],
  [53, 'A139-S-02/02'],
  [54, 'TRE-INST'],
  [55, 'CRED-EXA'],
]);

const CLASSIFICATION_MODEL_ID_TO_CODE = new Map([
  ...DUMP_MODEL_SPECS.map((spec) => [spec.dumpModelId, spec.currentCode]),
  ...ID_TO_MODEL_CODE.entries(),
]);

const AW139_PERIODIC_RENAMES = new Map([
  ['AW139-C1-VFR', 'A139-P-C1/VFR'],
  ['AW139-C1-IFR', 'A139-P-C1/IFR'],
  ['AW139-C2-VFR', 'A139-P-C2/VFR'],
  ['AW139-C2-IFR', 'A139-P-C2/IFR'],
  ['AW139-C3-VFR', 'A139-P-C3/VFR'],
  ['AW139-C3-IFR', 'A139-P-C3/IFR'],
]);

const SK76_PERIODIC_RENAMES = new Map([
  ['SK76-C1-VFR', 'S76-P-C1/VFR'],
  ['SK76-C1-IFR', 'S76-P-C1/IFR'],
  ['SK76-C2-VFR', 'S76-P-C2/VFR'],
  ['SK76-C2-IFR', 'S76-P-C2/IFR'],
  ['SK76-C3-VFR', 'S76-P-C3/VFR'],
  ['SK76-C3-IFR', 'S76-P-C3/IFR'],
]);

const UNRESOLVED_MODEL_CODES = new Set([]);
const OUT_OF_SCOPE_MODELS = ['PILOT-MODELO-001'];
const EXPECTED_MODELS_TOTAL = 51;
const EXPECTED_RELATIONS_PER_MODEL = 22;
const EXPECTED_RELATION_ROWS_TOTAL = EXPECTED_MODELS_TOTAL * EXPECTED_RELATIONS_PER_MODEL;
const EXPECTED_BLOCKED_MODELS = [];
const BLOCKED_BY_PRIMARY_SOURCE_CONFLICT = 'blocked_by_primary_source_conflict:missing_order_10';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function sqliteJson(dbPath, sql) {
  const output = execFileSync('sqlite3', ['-json', dbPath, sql], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return output.trim() ? JSON.parse(output) : [];
}

function sqliteExec(dbPath, input) {
  execFileSync('sqlite3', [dbPath], {
    input,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
}

function relative(filePath) {
  return path.relative(ROOT, filePath);
}

function normalizeTripulante(value) {
  if (!value) return 'AB';
  const normalized = String(value).replace(/^PF:/, '').trim().toUpperCase();
  return normalized === 'A' || normalized === 'B' || normalized === 'AB' ? normalized : 'AB';
}

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => {
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    return String(left).localeCompare(String(right));
  });
}

function splitSources(source) {
  return String(source)
    .split(' | ')
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceContains(source, fragment) {
  return splitSources(source).some((item) => item.includes(fragment));
}

function getDumpRows() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airtrust-modelo-manobra-'));
  const dbPath = path.join(tmpDir, 'historical.db');
  sqliteExec(dbPath, `.read ${DUMP_PATH}\n`);

  const columns = sqliteJson(dbPath, 'PRAGMA table_info(modelos_sessao_manobras);');
  const hasTripulante = columns.some((column) => column.name === 'tripulante');

  const tripulanteExpr = hasTripulante
    ? "COALESCE(NULLIF(msm.tripulante, ''), CASE WHEN msm.observacoes LIKE 'PF:%' THEN REPLACE(msm.observacoes, 'PF:', '') ELSE 'AB' END, 'AB')"
    : "CASE WHEN msm.observacoes LIKE 'PF:%' THEN REPLACE(msm.observacoes, 'PF:', '') ELSE 'AB' END";

  const rows = [];

  for (const spec of DUMP_MODEL_SPECS) {
    const result = sqliteJson(
      dbPath,
      `
        SELECT
          ${JSON.stringify(spec.currentCode)} AS modelo_codigo,
          m.codigo AS manobra_codigo,
          msm.ordem AS ordem,
          ${tripulanteExpr} AS tripulante,
          msm.observacoes AS observacoes
        FROM modelos_sessao_manobras msm
        INNER JOIN manobras m
          ON m.id = msm.manobra_id
        WHERE msm.modelo_id = ${spec.dumpModelId}
          AND msm.deleted_at IS NULL
        ORDER BY msm.ordem;
      `,
    );

    if (result.length === 0) {
      throw new Error(`Historical dump returned no rows for ${spec.currentCode} (modelo_id ${spec.dumpModelId})`);
    }

    for (const row of result) {
      rows.push({
        empresa_id: 6,
        modelo_codigo: row.modelo_codigo,
        manobra_codigo: row.manobra_codigo,
        ordem: Number(row.ordem),
        tripulante: normalizeTripulante(row.tripulante),
        observacoes: row.observacoes ?? null,
        source: `scripts/legacy/d1-prod-20260315-193839.sql:modelo_id=${spec.dumpModelId}`,
      });
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return rows;
}

function parseTupleFamilies(filePath, allowedModels) {
  const text = read(filePath);
  const rows = [];
  const tupleRegex = /\('([^']+)',\s*(\d+),\s*'([^']+)',\s*'([^']+)'\)/g;
  let match;

  while ((match = tupleRegex.exec(text)) !== null) {
    const [, modeloCodigo, ordem, manobraCodigo, pf] = match;
    if (!allowedModels.has(modeloCodigo)) continue;
    rows.push({
      empresa_id: 6,
      modelo_codigo: modeloCodigo,
      manobra_codigo: manobraCodigo,
      ordem: Number(ordem),
      tripulante: normalizeTripulante(pf),
      observacoes: pf,
      source: relative(filePath),
    });
  }

  return rows;
}

function parseAw139SeedModel(filePath, modelCode) {
  const text = read(filePath);
  const rows = [];
  const tupleRegex = /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*(\d+)\)/g;
  let match;

  while ((match = tupleRegex.exec(text)) !== null) {
    const [, modeloCodigo, , manobraCodigo, descricao, categoria, ordem] = match;
    if (modeloCodigo !== modelCode) continue;
    rows.push({
      empresa_id: 6,
      modelo_codigo: modeloCodigo,
      manobra_codigo: manobraCodigo,
      ordem: Number(ordem),
      tripulante: 'AB',
      observacoes: `${categoria}:${descricao}`,
      source: relative(filePath),
    });
  }

  return rows;
}

function parsePtoRev10Aw13911_12(filePath) {
  const text = read(filePath);
  const blockMatch = text.match(
    /## Página PDF 106 — A139-1-11\/12[^\n]*\n\n```text\n([\s\S]*?)```/,
  );

  if (!blockMatch) {
    throw new Error(`Could not parse PTO Rev.10 page 106 block from ${relative(filePath)}`);
  }

  const rows = [];
  for (const rawLine of blockMatch[1].split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(/(LOFT-CHK-(\d{2}))\s+(.+)$/);
    if (!match) continue;

    const [, manobraCodigo, ordemRaw, descricao] = match;
    rows.push({
      empresa_id: 6,
      modelo_codigo: 'A139-I-11/12',
      manobra_codigo: manobraCodigo,
      ordem: Number(ordemRaw),
      tripulante: 'AB',
      descricao: descricao.trim(),
      observacoes: null,
      source: `${relative(filePath)}:page=106`,
    });
  }

  rows.sort((left, right) => left.ordem - right.ordem);
  if (rows.length !== EXPECTED_RELATIONS_PER_MODEL) {
    throw new Error(
      `PTO Rev.10 page 106 returned ${rows.length} rows for A139-I-11/12; expected ${EXPECTED_RELATIONS_PER_MODEL}`,
    );
  }

  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].ordem !== index + 1) {
      throw new Error(`PTO Rev.10 page 106 returned non-contiguous ordens for A139-I-11/12`);
    }
  }

  return rows;
}

function normalizePtoCodeToken(value) {
  return String(value).replace(/^[~—-]+/, '').replace(/[_~]+$/, '').trim();
}

function parsePtoRev10Aw139Pc1Ifr(filePath) {
  const text = read(filePath);
  const blockMatch = text.match(
    /## Página PDF 109 — A139-P-IFR\/C1[^\n]*\n\n```text\n([\s\S]*?)```/,
  );

  if (!blockMatch) {
    throw new Error(`Could not parse PTO Rev.10 page 109 block from ${relative(filePath)}`);
  }

  const rows = [];
  for (const rawLine of blockMatch[1].split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(/(\d{2})\s+([A-Z0-9~—_-]+?)[\s_]+(.+)$/);
    if (!match) continue;

    const [, ordemRaw, manobraCodigoRaw, descricao] = match;
    rows.push({
      empresa_id: 6,
      modelo_codigo: 'A139-P-C1/IFR',
      manobra_codigo: normalizePtoCodeToken(manobraCodigoRaw),
      ordem: Number(ordemRaw),
      tripulante: 'AB',
      descricao: descricao.trim(),
      observacoes: null,
      source: `${relative(filePath)}:page=109`,
    });
  }

  rows.sort((left, right) => left.ordem - right.ordem);
  const hasOrder10 = rows.some((row) => row.ordem === 10);
  const hasCauDcb56 = rows.some((row) => row.manobra_codigo === 'CAU-DCB-56');

  if (!hasOrder10 && !hasCauDcb56) {
    rows.push({
      empresa_id: 6,
      modelo_codigo: 'A139-P-C1/IFR',
      manobra_codigo: 'CAU-DCB-56',
      ordem: 10,
      tripulante: 'AB',
      descricao: 'DC bus failure',
      observacoes: null,
      source: `${A139_PC1_IFR_ORDER10_SOURCE} | ${relative(filePath)}:page=111:analog=A139-P-C2/IFR:ordem_10`,
      status_codigo: STATUS_OPERATIONAL_INFERENCE_CONFIRMED,
      fonte_codigo: A139_PC1_IFR_ORDER10_SOURCE,
    });
  }

  rows.sort((left, right) => left.ordem - right.ordem);
  return rows;
}

function parseInsertSelectFamilies(filePath) {
  const text = read(filePath);
  const rows = [];
  const regex =
    /SELECT ms\.id,\s*m\.id,\s*(\d+),\s*1 FROM modelos_sessao ms, manobras m\s+WHERE ms\.codigo = '([^']+)' AND m\.codigo = '([^']+)';/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const [, ordem, modeloCodigo, manobraCodigo] = match;
    rows.push({
      empresa_id: 6,
      modelo_codigo: modeloCodigo,
      manobra_codigo: manobraCodigo,
      ordem: Number(ordem),
      tripulante: 'AB',
      observacoes: null,
      source: relative(filePath),
    });
  }

  return rows;
}

function parse0296(filePath) {
  const text = read(filePath);
  const ordemByCodigo = new Map();
  const rows = [];

  const manobraRegex =
    /\('([^']+)',\s*'[^']*',\s*'[^']*',\s*'[^']*',\s*'CHECK',\s*NULL,\s*(\d+)\)/g;
  let match;

  while ((match = manobraRegex.exec(text)) !== null) {
    ordemByCodigo.set(match[1], Number(match[2]));
  }

  const modelBlocks = [
    { modelId: 54, modelCode: 'TRE-INST' },
    { modelId: 55, modelCode: 'CRED-EXA' },
  ];

  for (const block of modelBlocks) {
    const blockRegex = new RegExp(
      `SELECT ${block.modelId}, id, ordem, 1 FROM manobras WHERE codigo IN \\(([\\s\\S]*?)\\);`,
      'm',
    );
    const blockMatch = text.match(blockRegex);
    if (!blockMatch) {
      throw new Error(`Could not parse model block ${block.modelCode} from ${relative(filePath)}`);
    }

    const codeRegex = /'([^']+)'/g;
    let codeMatch;
    while ((codeMatch = codeRegex.exec(blockMatch[1])) !== null) {
      const manobraCodigo = codeMatch[1];
      const ordem = ordemByCodigo.get(manobraCodigo);
      if (!ordem) {
        throw new Error(`Missing ordem for ${manobraCodigo} in ${relative(filePath)}`);
      }
      rows.push({
        empresa_id: 6,
        modelo_codigo: block.modelCode,
        manobra_codigo: manobraCodigo,
        ordem,
        tripulante: 'AB',
        observacoes: null,
        source: relative(filePath),
      });
    }
  }

  return rows;
}

function parse0299or0300(filePath) {
  const text = read(filePath);
  const rows = [];
  const regex =
    /SELECT (\d+), id, ordem, 1, 'AB', datetime\('now'\), datetime\('now'\) FROM manobras WHERE codigo = '([^']+)' AND deleted_at IS NULL;/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const [, modelIdRaw, manobraCodigo] = match;
    const modelId = Number(modelIdRaw);
    const modeloCodigo = ID_TO_MODEL_CODE.get(modelId);
    if (!modeloCodigo) continue;
    rows.push({
      empresa_id: 6,
      modelo_codigo: modeloCodigo,
      manobra_codigo: manobraCodigo,
      ordem: inferOrdinalFromCode(manobraCodigo),
      tripulante: 'AB',
      observacoes: null,
      source: relative(filePath),
    });
  }

  return rows;
}

function inferOrdinalFromCode(code) {
  const match = code.match(/-(\d{2})$/);
  if (!match) {
    throw new Error(`Could not infer ordem from code ${code}`);
  }
  return Number(match[1]);
}

function parse0180(filePath) {
  const text = read(filePath);
  const rows = [];
  const regex =
    /SELECT \(SELECT id FROM modelos_sessao WHERE codigo = '([^']+)'\), id, (\d+) FROM manobras WHERE codigo = '([^']+)';/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const [, legacyCode, ordem, manobraCodigo] = match;
    const currentCode = AW139_PERIODIC_RENAMES.get(legacyCode);
    if (!currentCode) continue;
    if (currentCode === 'A139-P-C1/IFR' && Number(ordem) === 10 && manobraCodigo === 'CAU-AHR-47') {
      continue;
    }
    rows.push({
      empresa_id: 6,
      modelo_codigo: currentCode,
      manobra_codigo: manobraCodigo,
      ordem: Number(ordem),
      tripulante: 'AB',
      observacoes: null,
      source: relative(filePath),
    });
  }

  return rows;
}

function parse0262(filePath) {
  const text = read(filePath);
  const rows = [];
  const valuesRegex =
    /\(\(SELECT id FROM modelos_sessao WHERE codigo='([^']+)'\),\s*\(SELECT id FROM manobras WHERE codigo='([^']+)'[^)]*\),\s*(\d+),\s*1\)/g;
  let match;

  while ((match = valuesRegex.exec(text)) !== null) {
    const [, legacyCode, manobraCodigo, ordem] = match;
    const currentCode = SK76_PERIODIC_RENAMES.get(legacyCode);
    if (!currentCode) continue;
    rows.push({
      empresa_id: 6,
      modelo_codigo: currentCode,
      manobra_codigo: manobraCodigo,
      ordem: Number(ordem),
      tripulante: 'AB',
      observacoes: null,
      source: relative(filePath),
    });
  }

  const selectRegex =
    /SELECT \(SELECT id FROM modelos_sessao WHERE codigo='([^']+)'\), id,\s*(\d+) FROM manobras WHERE codigo='([^']+)';/g;
  while ((match = selectRegex.exec(text)) !== null) {
    const [, legacyCode, ordem, manobraCodigo] = match;
    const currentCode = SK76_PERIODIC_RENAMES.get(legacyCode);
    if (!currentCode) continue;
    rows.push({
      empresa_id: 6,
      modelo_codigo: currentCode,
      manobra_codigo: manobraCodigo,
      ordem: Number(ordem),
      tripulante: 'AB',
      observacoes: null,
      source: relative(filePath),
    });
  }

  return rows;
}

function parse0284(filePath) {
  const text = read(filePath);
  const blockMatch = text.match(
    /ON m\.codigo IN \(([\s\S]*?)\)\s*WHERE ms\.nome = 'SK76 - PERIÓDICO - 03\/03: LOFT E CHECK'/m,
  );

  if (!blockMatch) {
    throw new Error(`Could not parse SK76-P-CHECK relation block from ${relative(filePath)}`);
  }

  const rows = [];
  const codeRegex = /'([^']+)'/g;
  let match;

  while ((match = codeRegex.exec(blockMatch[1])) !== null) {
    const manobraCodigo = match[1];
    rows.push({
      empresa_id: 6,
      modelo_codigo: 'SK76-P-CHECK',
      manobra_codigo: manobraCodigo,
      ordem: inferOrdinalFromCode(manobraCodigo),
      tripulante: 'AB',
      observacoes: null,
      source: relative(filePath),
    });
  }

  return rows;
}

function summarize(rows) {
  const byModel = new Map();

  for (const row of rows) {
    if (!byModel.has(row.modelo_codigo)) {
      byModel.set(row.modelo_codigo, []);
    }
    byModel.get(row.modelo_codigo).push(row);
  }

  const summary = [];
  for (const [modeloCodigo, modelRows] of [...byModel.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ordered = [...modelRows].sort((a, b) => a.ordem - b.ordem);
    summary.push({
      modelo_codigo: modeloCodigo,
      relacoes: ordered.length,
      primeira_manobra: ordered[0]?.manobra_codigo ?? null,
      ultima_manobra: ordered[ordered.length - 1]?.manobra_codigo ?? null,
      sources: [...new Set(ordered.map((row) => row.source))],
    });
  }

  return summary;
}

function dedupeRows(rows) {
  const byKey = new Map();

  for (const row of rows) {
    const key = `${row.modelo_codigo}#${String(row.ordem).padStart(2, '0')}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, {
        ...row,
        source: [row.source],
      });
      continue;
    }

    const isSameRelation =
      existing.manobra_codigo === row.manobra_codigo &&
      existing.tripulante === row.tripulante &&
      (existing.observacoes ?? null) === (row.observacoes ?? null);

    if (!isSameRelation) {
      throw new Error(
        `Conflicting duplicate ordem for ${row.modelo_codigo} ordem ${row.ordem}: ` +
          `${existing.manobra_codigo} vs ${row.manobra_codigo}`,
      );
    }

    if (!existing.source.includes(row.source)) {
      existing.source.push(row.source);
    }
  }

  return [...byKey.values()].map((row) => ({
    ...row,
    source: row.source.sort().join(' | '),
  }));
}

function findDuplicateModelManobras(rows) {
  const seen = new Map();
  const duplicates = [];

  for (const row of rows) {
    const key = `${row.modelo_codigo}#${row.manobra_codigo}`;
    if (!seen.has(key)) {
      seen.set(key, []);
    }
    seen.get(key).push(row);
  }

  for (const [key, duplicateRows] of seen.entries()) {
    if (duplicateRows.length < 2) continue;
    const [modeloCodigo, manobraCodigo] = key.split('#');
    duplicates.push({
      modelo_codigo: modeloCodigo,
      manobra_codigo: manobraCodigo,
      ordens: sortedUnique(duplicateRows.map((row) => row.ordem)),
      sources: [...new Set(duplicateRows.map((row) => row.source))].sort(),
    });
  }

  duplicates.sort((left, right) => {
    if (left.modelo_codigo === right.modelo_codigo) {
      return left.manobra_codigo.localeCompare(right.manobra_codigo);
    }
    return left.modelo_codigo.localeCompare(right.modelo_codigo);
  });

  return duplicates;
}

function load0297ClassificationMap() {
  const text = read(MIGRATION_0297_PATH);
  const map = new Map();

  const caseRegex =
    /UPDATE modelos_sessao_manobras SET tripulante = CASE ordem([\s\S]*?)END WHERE modelo_id = (\d+) AND deleted_at IS NULL;/g;
  let caseMatch;

  while ((caseMatch = caseRegex.exec(text)) !== null) {
    const [, body, modelIdRaw] = caseMatch;
    const modelId = Number(modelIdRaw);
    const modelCode = CLASSIFICATION_MODEL_ID_TO_CODE.get(modelId);
    if (!modelCode) continue;

    const ordens = new Map();
    const whenRegex = /WHEN\s+(\d+)\s+THEN\s+'(A|B|AB)'/g;
    let whenMatch;
    while ((whenMatch = whenRegex.exec(body)) !== null) {
      ordens.set(Number(whenMatch[1]), whenMatch[2]);
    }

    map.set(modelCode, {
      defaultTripulante: 'AB',
      ordens,
      fonte: `${relative(MIGRATION_0297_PATH)}:modelo_id=${modelId}`,
      status: STATUS_MIGRATION_VERIFIED,
    });
  }

  const allAbRegex =
    /UPDATE modelos_sessao_manobras SET tripulante = 'AB'\s+WHERE modelo_id(?: IN \(([^)]+)\)| = (\d+)) AND deleted_at IS NULL;/g;
  let allAbMatch;

  while ((allAbMatch = allAbRegex.exec(text)) !== null) {
    const [, modelIdsList, singleModelId] = allAbMatch;
    const modelIds = modelIdsList
      ? modelIdsList.split(',').map((value) => Number(value.trim()))
      : [Number(singleModelId)];

    for (const modelId of modelIds) {
      const modelCode = CLASSIFICATION_MODEL_ID_TO_CODE.get(modelId);
      if (!modelCode) continue;
      map.set(modelCode, {
        defaultTripulante: 'AB',
        ordens: new Map(),
        fonte: `${relative(MIGRATION_0297_PATH)}:modelo_id=${modelId}`,
        status: STATUS_MIGRATION_VERIFIED,
      });
    }
  }

  return map;
}

function classifyRow(row, classificationMap) {
  const base = {
    ...row,
    classificacao_tripulante: null,
    fonte_classificacao: null,
    status_classificacao: STATUS_MISSING,
  };

  if (row.fonte_codigo === A139_PC1_IFR_ORDER10_SOURCE || sourceContains(row.source, A139_PC1_IFR_ORDER10_SOURCE)) {
    return {
      ...base,
      tripulante: 'AB',
      classificacao_tripulante: 'AB',
      fonte_classificacao: `${relative(MIGRATION_0297_PATH)}:modelo_id=29:ordem_10_default_AB | ${A139_PC1_IFR_ORDER10_SOURCE}`,
      status_classificacao: STATUS_OPERATIONAL_INFERENCE_CONFIRMED,
    };
  }

  const explicitMigrationSource = EXPLICIT_CLASSIFICATION_SOURCE_FRAGMENTS.find((fragment) =>
    sourceContains(row.source, fragment),
  );

  if (explicitMigrationSource) {
    const classificacao = normalizeTripulante(row.tripulante);
    return {
      ...base,
      tripulante: classificacao,
      classificacao_tripulante: classificacao,
      fonte_classificacao: splitSources(row.source)
        .filter((source) => source.includes(explicitMigrationSource))
        .join(' | '),
      status_classificacao: STATUS_MIGRATION_VERIFIED,
    };
  }

  const migrationRule = classificationMap.get(row.modelo_codigo);
  if (migrationRule) {
    const classificacao = normalizeTripulante(
      migrationRule.ordens.get(row.ordem) ?? migrationRule.defaultTripulante,
    );
    return {
      ...base,
      tripulante: classificacao,
      classificacao_tripulante: classificacao,
      fonte_classificacao: migrationRule.fonte,
      status_classificacao: migrationRule.status,
    };
  }

  if (USER_CONFIRMED_AB_MODELS.has(row.modelo_codigo)) {
    return {
      ...base,
      tripulante: 'AB',
      classificacao_tripulante: 'AB',
      fonte_classificacao: USER_CONFIRMED_AB_SOURCE,
      status_classificacao: STATUS_PTO_VISUAL_VERIFIED,
    };
  }

  if (row.modelo_codigo === 'A139-I-11/12' && /^LOFT-CHK-\d{2}$/.test(row.manobra_codigo)) {
    return {
      ...base,
      tripulante: 'AB',
      classificacao_tripulante: 'AB',
      fonte_classificacao: A139_OPERATIONAL_CONFIRMED_AB_SOURCE,
      status_classificacao: STATUS_OPERATIONAL_CONFIRMED,
    };
  }

  if (sourceContains(row.source, 'scripts/seed-12-sessoes-aw139-COMPLETO.sql')) {
    return {
      ...base,
      tripulante: 'AB',
      classificacao_tripulante: 'AB',
      fonte_classificacao: 'scripts/seed-12-sessoes-aw139-COMPLETO.sql:sem_PF_explicito',
      status_classificacao: STATUS_AMBIGUOUS,
    };
  }

  if (sourceContains(row.source, 'scripts/seed-12-sessoes-aw139.sql')) {
    return {
      ...base,
      tripulante: 'AB',
      classificacao_tripulante: 'AB',
      fonte_classificacao: 'scripts/seed-12-sessoes-aw139.sql:sem_PF_explicito',
      status_classificacao: STATUS_AMBIGUOUS,
    };
  }

  return base;
}

function classifyRows(rows, classificationMap) {
  return rows.map((row) => classifyRow(row, classificationMap));
}

function summarizeClassification(rows) {
  const summary = {
    total_rows: rows.length,
    with_classificacao: 0,
    missing: 0,
    ambiguous: 0,
    by_status: {},
  };

  for (const row of rows) {
    const status = row.status_classificacao ?? STATUS_MISSING;
    summary.by_status[status] = (summary.by_status[status] ?? 0) + 1;

    if (row.classificacao_tripulante) {
      summary.with_classificacao += 1;
    } else {
      summary.missing += 1;
    }

    if (status === STATUS_AMBIGUOUS) {
      summary.ambiguous += 1;
    }
    if (status === STATUS_MISSING) {
      summary.missing += 1;
    }
  }

  return summary;
}

function validateStructuralRows(rows) {
  const modelKey = (row) => `${row.modelo_codigo}#${String(row.ordem).padStart(2, '0')}`;
  const sourceRows = new Map();
  const byModel = new Map();

  for (const row of rows) {
    if (row.empresa_id !== 6) {
      throw new Error(`Unexpected empresa_id outside scope for ${row.modelo_codigo}`);
    }

    const key = modelKey(row);
    if (sourceRows.has(key)) {
      const previous = sourceRows.get(key);
      throw new Error(
        `Duplicate ordem for ${row.modelo_codigo} ordem ${row.ordem}: ${previous.manobra_codigo} vs ${row.manobra_codigo}`,
      );
    }

    sourceRows.set(key, row);

    if (!byModel.has(row.modelo_codigo)) {
      byModel.set(row.modelo_codigo, []);
    }
    byModel.get(row.modelo_codigo).push(row);
  }

  const expectedModels = new Set([
    'A139-I-01/12',
    'A139-I-02/12',
    'A139-I-03/12',
    'A139-I-04/12',
    'A139-I-05/12',
    'A139-I-06/12',
    'A139-I-07/12',
    'A139-I-08/12',
    'A139-I-09/12',
    'A139-I-10/12',
    'A139-I-11/12',
    'A139-I-12/12',
    'A139-P-C1/VFR',
    'A139-P-C1/IFR',
    'A139-P-C2/VFR',
    'A139-P-C2/IFR',
    'A139-P-C3/VFR',
    'A139-P-C3/IFR',
    'A139-P-LOFT/CHECK',
    'SK76-P-CHECK',
    'S76-P-C1/VFR',
    'S76-P-C1/IFR',
    'S76-P-C2/VFR',
    'S76-P-C2/IFR',
    'S76-P-C3/VFR',
    'S76-P-C3/IFR',
    'A139-P-LOFT/OFFSHORE',
    'A139-S-01/02',
    'A139-S-02/02',
    'TRE-INST',
    'CRED-EXA',
    'A139-NOT-01',
    'S76-NOT-01',
    'S76-REQ-01',
    'A139-REQ-01',
    'SK76-I-01/12',
    'SK76-I-02/12',
    'SK76-I-03/12',
    'SK76-I-04/12',
    'SK76-I-05/12',
    'SK76-I-06/12',
    'SK76-I-07/12',
    'SK76-I-08/12',
    'SK76-I-09/12',
    'SK76-I-10/12',
    'SK76-I-11/12',
    'SK76-I-12/12',
    'SK76-S-01/02',
    'SK76-S-02/02',
    'A139-NOT-02',
    'S76-NOT-02',
  ]);

  const actualModels = new Set(byModel.keys());
  for (const expectedModel of expectedModels) {
    if (!actualModels.has(expectedModel)) {
      throw new Error(`Missing source rows for ${expectedModel}`);
    }
  }

  if (actualModels.size !== expectedModels.size) {
    const extra = [...actualModels].filter((model) => !expectedModels.has(model));
    throw new Error(`Unexpected model codes in source map: ${extra.join(', ')}`);
  }

  for (const unresolvedModelCode of UNRESOLVED_MODEL_CODES) {
    if (actualModels.has(unresolvedModelCode)) {
      throw new Error(`Unresolved model unexpectedly present in resolved map: ${unresolvedModelCode}`);
    }
  }

  for (const [modeloCodigo, modelRows] of byModel) {
    const duplicateManobras = findDuplicateModelManobras(modelRows);
    if (duplicateManobras.length > 0) {
      const sample = duplicateManobras
        .slice(0, 5)
        .map((item) => `${item.modelo_codigo}:${item.manobra_codigo}:${item.ordens.join('/')}`)
        .join(', ');
      throw new Error(`Duplicate modelo/manobra relations detected in resolved map: ${sample}`);
    }

    const ordens = [...new Set(modelRows.map((row) => row.ordem))].sort((a, b) => a - b);
    for (let index = 0; index < ordens.length; index += 1) {
      if (ordens[index] !== index + 1) {
        throw new Error(`Non contiguous ordem for ${modeloCodigo}: ${ordens.join(', ')}`);
      }
    }

    if (ordens.length !== EXPECTED_RELATIONS_PER_MODEL) {
      throw new Error(
        `Unexpected relation count for ${modeloCodigo}: expected ${EXPECTED_RELATIONS_PER_MODEL}, got ${ordens.length}`,
      );
    }
  }
}

function validateResolvedClassification(rows) {
  const invalid = rows.filter((row) => !VERIFIED_STATUSES.has(row.status_classificacao));
  if (invalid.length > 0) {
    const sample = invalid
      .slice(0, 10)
      .map((row) => `${row.modelo_codigo}:${row.ordem}:${row.manobra_codigo}:${row.status_classificacao}`)
      .join(', ');
    throw new Error(`Resolved source map contains non-deterministic classification rows: ${sample}`);
  }
}

function buildStructuralRows() {
  const rows = [
    ...getDumpRows(),
    ...parse0299or0300(path.join(ROOT, 'worker-airtrust', 'migrations', '0299_loft_chk_manobras.sql')),
    ...parse0299or0300(path.join(ROOT, 'worker-airtrust', 'migrations', '0300_loft_off_not_e_fap_refs.sql')),
    ...parse0296(path.join(ROOT, 'worker-airtrust', 'migrations', '0296_fap07_fap13_manobras.sql')),
    ...parseInsertSelectFamilies(
      path.join(ROOT, 'worker-airtrust', 'migrations', '0367_sk76_reaquisicao_experiencia_recente.sql'),
    ),
    ...parseInsertSelectFamilies(
      path.join(ROOT, 'worker-airtrust', 'migrations', '0368_aw139_reaquisicao_experiencia_recente.sql'),
    ),
    ...parseTupleFamilies(
      path.join(ROOT, 'worker-airtrust', 'migrations', '0375_redistribuir_pf_sk76_inicial.sql'),
      new Set([
        'SK76-I-01/12',
        'SK76-I-02/12',
        'SK76-I-03/12',
        'SK76-I-04/12',
        'SK76-I-05/12',
        'SK76-I-06/12',
        'SK76-I-07/12',
        'SK76-I-08/12',
        'SK76-I-09/12',
        'SK76-I-10/12',
        'SK76-I-11/12',
        'SK76-I-12/12',
      ]),
    ),
    ...parseTupleFamilies(
      path.join(ROOT, 'worker-airtrust', 'migrations', '0382_create_sk76_semestral_sessions.sql'),
      new Set(['SK76-S-01/02', 'SK76-S-02/02']),
    ),
    ...parseTupleFamilies(
      path.join(ROOT, 'worker-airtrust', 'migrations', '0383_split_night_training_onshore_offshore.sql'),
      new Set(['A139-NOT-01', 'A139-NOT-02', 'S76-NOT-01', 'S76-NOT-02']),
    ),
    ...parse0180(path.join(ROOT, 'worker-airtrust', 'migrations', '0180_implement_periodico_aw139.sql')),
    ...parsePtoRev10Aw139Pc1Ifr(PTO_REV10_OCR_PATH),
    ...parse0262(path.join(ROOT, 'worker-airtrust', 'migrations', '0262_sk76_periodico_ciclos.sql')),
    ...parse0284(path.join(ROOT, 'worker-airtrust', 'migrations', '0284_fix_sk76_loft_check_0303.sql')),
    ...parsePtoRev10Aw13911_12(PTO_REV10_OCR_PATH),
  ];

  const dedupedRows = dedupeRows(rows);
  dedupedRows.sort((a, b) => {
    if (a.modelo_codigo === b.modelo_codigo) {
      return a.ordem - b.ordem;
    }
    return a.modelo_codigo.localeCompare(b.modelo_codigo);
  });

  return dedupedRows;
}

function buildUnresolvedModels(structuralRows, classificationMap) {
  const unresolvedModels = [];

  if (EXPECTED_BLOCKED_MODELS.includes('A139-P-C1/IFR')) {
    const preferredRows = classifyRows(parsePtoRev10Aw139Pc1Ifr(PTO_REV10_OCR_PATH), classificationMap).map(
      (row) => ({
        ...row,
        status_codigo: row.status_codigo ?? STATUS_CATALOG_EQUIVALENCE_VERIFIED,
        fonte_codigo: row.fonte_codigo ?? row.source,
      }),
    );

    const allModelRows = structuralRows.filter((row) => row.modelo_codigo === 'A139-P-C1/IFR');
    const dumpRows = allModelRows.filter((row) =>
      sourceContains(row.source, `${relative(DUMP_PATH)}:modelo_id=29`),
    );
    const migration0180Rows = allModelRows.filter((row) =>
      sourceContains(row.source, 'worker-airtrust/migrations/0180_implement_periodico_aw139.sql'),
    );
    const duplicateRelations = findDuplicateModelManobras(allModelRows);
    const preferredOrdens = sortedUnique(preferredRows.map((row) => row.ordem));
    const missingOrdens = Array.from(
      { length: EXPECTED_RELATIONS_PER_MODEL },
      (_, index) => index + 1,
    ).filter((ordem) => !preferredOrdens.includes(ordem));

    unresolvedModels.push({
      modelo_codigo: 'A139-P-C1/IFR',
      reason: BLOCKED_BY_PRIMARY_SOURCE_CONFLICT,
      source_candidates: {
        preferred_complete_source: {
          source: `${relative(PTO_REV10_OCR_PATH)}:page=109`,
          relation_rows: preferredRows.length,
          ordens: preferredOrdens,
          missing_ordens: missingOrdens,
        },
        rejected_sources: [
          {
            source: 'worker-airtrust/migrations/0180_implement_periodico_aw139.sql',
            reason: 'duplicate_modelo_manobra_relation',
            duplicate_relations: duplicateRelations,
          },
        ],
      },
      evidence: {
        pto_visual_reference: 'tmp/pdfs/pto_rev10_p109-109.png',
        historical_dump_relation_rows: dumpRows.length,
        historical_dump_ordens: sortedUnique(dumpRows.map((row) => row.ordem)),
        migration_0180_relation_rows: migration0180Rows.length,
        migration_0180_duplicate_relations: duplicateRelations,
      },
      candidate_rows: preferredRows,
    });
  }

  return unresolvedModels;
}

function buildPayload() {
  const classificationMap = load0297ClassificationMap();
  const structuralRows = buildStructuralRows();
  const unresolvedModels = buildUnresolvedModels(structuralRows, classificationMap);
  const resolvedStructuralRows = structuralRows.filter(
    (row) => !UNRESOLVED_MODEL_CODES.has(row.modelo_codigo),
  );

  validateStructuralRows(resolvedStructuralRows);

  const rows = classifyRows(resolvedStructuralRows, classificationMap);
  validateResolvedClassification(rows);

  const modelSummary = summarize(rows);
  const unresolvedCandidateRows = unresolvedModels.flatMap((model) => model.candidate_rows ?? []);
  const candidateRows = [...rows, ...unresolvedCandidateRows];
  const allowlistModels = modelSummary.map((model) => model.modelo_codigo);
  const blockedModels = unresolvedModels.map((model) => model.modelo_codigo);

  const modelsWithExpected22 = modelSummary.filter((model) => model.relacoes === EXPECTED_RELATIONS_PER_MODEL).length;
  const resolvedClassification = summarizeClassification(rows);
  const candidateClassification = summarizeClassification(candidateRows);
  const expectedPartialModels = EXPECTED_MODELS_TOTAL - EXPECTED_BLOCKED_MODELS.length;
  const expectedPartialRelations = expectedPartialModels * EXPECTED_RELATIONS_PER_MODEL;
  const partialClassificationReady =
    resolvedClassification.total_rows === expectedPartialRelations &&
    resolvedClassification.with_classificacao === expectedPartialRelations &&
    resolvedClassification.missing === 0 &&
    resolvedClassification.ambiguous === 0;
  const blockedModelsMatchExpected =
    blockedModels.length === EXPECTED_BLOCKED_MODELS.length &&
    blockedModels.every((model, index) => model === EXPECTED_BLOCKED_MODELS[index]);

  const classificationReady =
    candidateClassification.total_rows === EXPECTED_RELATION_ROWS_TOTAL &&
    candidateClassification.with_classificacao === EXPECTED_RELATION_ROWS_TOTAL &&
    candidateClassification.missing === 0 &&
    candidateClassification.ambiguous === 0;

  const readyForPartialRestore =
    modelSummary.length === expectedPartialModels &&
    allowlistModels.length === expectedPartialModels &&
    modelsWithExpected22 === expectedPartialModels &&
    rows.length === expectedPartialRelations &&
    partialClassificationReady &&
    blockedModelsMatchExpected;

  const readyForFullRestore =
    unresolvedModels.length === 0 &&
    modelSummary.length === EXPECTED_MODELS_TOTAL &&
    modelsWithExpected22 === EXPECTED_MODELS_TOTAL &&
    rows.length === EXPECTED_RELATION_ROWS_TOTAL &&
    classificationReady;

  return {
    meta: {
      generated_at: new Date().toISOString(),
      empresa_id: 6,
      models_covered: modelSummary.length,
      models_expected: EXPECTED_MODELS_TOTAL,
      unresolved_models: unresolvedModels.length,
      blocked_models_count: blockedModels.length,
      restorableModels: modelSummary.length,
      modelsWithExpected22,
      modelsWithSourceConflict: unresolvedModels.length,
      outOfScopeModels: OUT_OF_SCOPE_MODELS,
      expectedRelationRows: EXPECTED_RELATION_ROWS_TOTAL,
      expectedRelationsPerModel: EXPECTED_RELATIONS_PER_MODEL,
      expectedPartialModels: expectedPartialModels,
      expectedPartialRelationRows: expectedPartialRelations,
      relation_rows: rows.length,
      candidate_relation_rows: candidateRows.length,
      classification_present_rows: candidateClassification.with_classificacao,
      classification_missing_rows: candidateClassification.missing,
      classification_ambiguous_rows: candidateClassification.ambiguous,
      ready_for_restore: readyForPartialRestore,
      ready_for_partial_restore: readyForPartialRestore,
      ready_for_full_restore: readyForFullRestore,
      coverage_status: readyForFullRestore
        ? 'READY_FOR_FULL_RESTORE'
        : readyForPartialRestore
          ? 'READY_FOR_PARTIAL_RESTORE'
        : candidateClassification.ambiguous > 0 || candidateClassification.missing > 0
          ? 'BLOCKED_CLASSIFICACAO_A_B_AB_NAO_DETERMINISTICA'
          : 'BLOCKED_SOURCE_AMBIGUITY',
      source_dump: relative(DUMP_PATH),
      source_files: [...new Set(candidateRows.map((row) => row.source))].sort(),
      classification_sources: [...new Set(candidateRows.map((row) => row.fonte_classificacao).filter(Boolean))].sort(),
    },
    classification_summary: {
      resolved_rows: resolvedClassification,
      candidate_rows: candidateClassification,
    },
    allowlist_models: allowlistModels,
    blocked_models: blockedModels,
    models: modelSummary,
    unresolved_models: unresolvedModels,
    rows,
  };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const payload = buildPayload();

  if (args.has('--stdout')) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(
    [
      `Wrote ${relative(OUTPUT_PATH)}`,
      `models_covered=${payload.meta.models_covered}`,
      `models_expected=${payload.meta.models_expected}`,
      `unresolved_models=${payload.meta.unresolved_models}`,
      `classification_present_rows=${payload.meta.classification_present_rows}`,
      `classification_missing_rows=${payload.meta.classification_missing_rows}`,
      `classification_ambiguous_rows=${payload.meta.classification_ambiguous_rows}`,
      `ready_for_restore=${payload.meta.ready_for_restore}`,
      `relation_rows=${payload.meta.relation_rows}`,
      `candidate_relation_rows=${payload.meta.candidate_relation_rows}`,
    ].join('\n') + '\n',
  );
}

main();
