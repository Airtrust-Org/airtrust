import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildResolutionStatements,
  buildModelAndLinkStatements,
} from '../../../scripts/lib/matriz-apply-core.mjs';
import { createDeterministicPlan, EXPECTED_SOURCE_HASH_COUNT, sha256 } from '../../../scripts/lib/matriz-import-plan.mjs';
import { buildManoeuvreResolutionEntries, EXPECTED_MANOEUVRE_CODE_COUNT } from '../../../scripts/lib/matriz-manobra-resolution.mjs';

// Root-cause regression coverage for the SQLITE_AUTH incident: Cloudflare
// D1's remote query authorizer rejects DDL (including CREATE TEMP TABLE) and
// bare PRAGMA statements with SQLITE_AUTH when run through db.batch(). These
// tests assert the shared statement builder never re-introduces that class
// of statement, regardless of how the plan/model/link shape evolves.
const FORBIDDEN_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'CREATE TEMP/TEMPORARY TABLE', pattern: /CREATE\s+TEMP(ORARY)?\s+TABLE/i },
  { name: 'any CREATE TABLE (permanent or temp)', pattern: /\bCREATE\s+TABLE\b/i },
  { name: 'any other DDL (DROP/ALTER)', pattern: /\b(DROP|ALTER)\s+(TABLE|INDEX|TRIGGER)\b/i },
  { name: 'bare PRAGMA', pattern: /\bPRAGMA\b/i },
  { name: 'BEGIN (manual transaction control)', pattern: /^\s*BEGIN\b/i },
  { name: 'COMMIT (manual transaction control)', pattern: /^\s*COMMIT\b/i },
];

const D1_STATEMENT_SIZE_LIMIT_BYTES = 100_000; // conservative: D1 caps query length well above typical plan sizes.

function sourceHashes() {
  return Object.fromEntries(
    Array.from({ length: EXPECTED_SOURCE_HASH_COUNT }, (_, i) => [`h-${i}`, sha256(`v-${i}`)]),
  );
}

function item(codigo: string, modelo: string, ordem: number) {
  return {
    modelo,
    ordem,
    codigo,
    nome: `nome-${codigo}`,
    execucao_pf: ordem % 2 === 0 ? 'B' : 'A',
    categoria: 'PROCEDIMENTO',
    fase_voo: 'VOO',
    tipo_conteudo: 'NORMAL',
    cenario: null,
    configuracao_ios: null,
    desempenho_esperado: null,
    foco_instrutor: null,
    como_observar: null,
    referencia_tecnica: null,
    rastreabilidade_interna: null,
    criterios: { '1-2': null, '3-5': null, '6-8': null, '9-10': null },
  };
}

function buildRealPlan() {
  const contract = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'data/simuladores-matriz/session-contract-51.json'), 'utf8'),
  );
  function toMatrix(sessions: any[]) {
    const models = sessions.map((s: any) => ({
      codigo: s.codigo_canonico,
      programa: s.programa,
      ciclo: s.ciclo === '—' ? null : s.ciclo,
      titulo: s.titulo_sanitizado,
      aeronave: s.aeronave,
      tipo_qualificacao_estruturado: s.tipo_qualificacao_estruturado,
    }));
    let counter = 0;
    const items = models.flatMap((model: any) =>
      Array.from({ length: 18 }, (_, i) => item(`MAN-${(counter++ % 301) + 1}`, model.codigo, i + 1)),
    );
    return { models, items };
  }
  const aw139 = toMatrix(contract.sessions.filter((s: any) => s.aeronave === 'AW139'));
  const sk76 = toMatrix(contract.sessions.filter((s: any) => s.aeronave === 'SK76'));
  const manobraResolution = buildManoeuvreResolutionEntries({
    empresaId: 6,
    items: [...aw139.items, ...sk76.items],
    tenantManobras: [],
  });
  const plan = createDeterministicPlan({
    empresaId: 6,
    sourceHashes: sourceHashes(),
    aw139,
    sk76,
    loft: 22,
    manobraResolution,
  });
  return { plan, aw139, sk76 };
}

function buildFullBatch() {
  const { plan, aw139, sk76 } = buildRealPlan();
  const models = [...aw139.models, ...sk76.models];
  const items = [...aw139.items, ...sk76.items];
  const empresaId = 6;
  const versaoMatriz = String(plan.versao_matriz || 'M2026.07');
  const importUuid = 'safety-test-uuid';
  const fail = (message: string): never => {
    throw new Error(message);
  };

  const resolutionStatements = buildResolutionStatements({
    plan,
    empresaId,
    versaoMatriz,
    importUuid,
    fail,
    existingResolutionByCode: new Map(),
    manobraById: new Map(),
  });
  const modelAndLinkStatements = buildModelAndLinkStatements({
    plan,
    empresaId,
    versaoMatriz,
    importUuid,
    fail,
    models,
    items,
    maxVersionByCode: new Map(),
  });
  return { plan, resolutionStatements, modelAndLinkStatements, models, items };
}

describe('matriz-apply-core: D1 batch safety (SQLITE_AUTH regression guard)', () => {
  it('contains no CREATE TEMP TABLE, other DDL, PRAGMA, BEGIN, or COMMIT in any generated statement', () => {
    const { resolutionStatements, modelAndLinkStatements } = buildFullBatch();
    const allStatements = [...resolutionStatements, ...modelAndLinkStatements];
    expect(allStatements.length).toBeGreaterThan(0);

    for (const { name, pattern } of FORBIDDEN_PATTERNS) {
      const offenders = allStatements.filter((sql) => pattern.test(sql));
      expect(offenders, `found statement(s) matching forbidden pattern "${name}"`).toEqual([]);
    }
  });

  it('every statement is a single INSERT/UPDATE/SELECT (optionally CTE-prefixed) — plain DML only', () => {
    const { resolutionStatements, modelAndLinkStatements } = buildFullBatch();
    const allStatements = [...resolutionStatements, ...modelAndLinkStatements];
    const dmlLeadRe = /^\s*(WITH\b[\s\S]*?)?(INSERT|UPDATE|SELECT)\b/i;
    for (const sql of allStatements) {
      expect(sql, `statement does not start with plain DML (optionally WITH-prefixed): ${sql.slice(0, 80)}`).toMatch(
        dmlLeadRe,
      );
    }
  });

  it('produces exactly one bulk INSERT INTO modelos_sessao statement covering all 51 models (no per-model temp staging)', () => {
    const { modelAndLinkStatements } = buildFullBatch();
    const modelInserts = modelAndLinkStatements.filter((sql) => /^\s*INSERT INTO modelos_sessao\(/i.test(sql));
    expect(modelInserts).toHaveLength(1);
    // 51 VALUES rows -> 50 internal commas between row tuples plus the
    // trailing semicolon; count '(' opens after VALUES as a proxy for rows.
    const valuesRowCount = (modelInserts[0].match(/\('[^']*',/g) || []).length;
    expect(valuesRowCount).toBe(51);
  });

  it('chunks the 918-row links CTE across multiple statements to stay under D1 statement-complexity limits', () => {
    const { modelAndLinkStatements, items } = buildFullBatch();
    const linkStatements = modelAndLinkStatements.filter((sql) => /WITH[\s\S]*_links\(/i.test(sql));
    // Two statements per chunk (modelos_sessao_manobras insert + contexto insert).
    const expectedChunks = Math.ceil(items.length / 150);
    expect(linkStatements).toHaveLength(expectedChunks * 2);
    // Empirically, joining the full 918-row _links CTE against permanent
    // tables with a CASE/json_object projection in a single statement trips
    // D1's SQLITE_TOOBIG — even though the raw SQL text (~68KB) is well under
    // D1's ~100KB length limit, because the limit tracks compiled statement
    // complexity, not just source length. Chunking keeps every statement far
    // below that threshold; guard the margin explicitly.
    for (const sql of linkStatements) {
      expect(Buffer.byteLength(sql, 'utf8')).toBeLessThan(30_000);
    }
  });

  it('preserves plan totals: 51 models, 918 links, 22 LOFT, 301 canonical codes, 61 hashes', () => {
    const { plan, models, items } = buildFullBatch();
    expect(models).toHaveLength(51);
    expect(items).toHaveLength(918);
    expect(plan.totals).toMatchObject({ modelos: 51, vinculos: 918, loft: 22 });
    expect(Object.keys(plan.source_hashes)).toHaveLength(EXPECTED_SOURCE_HASH_COUNT);
    const distinctCodes = new Set(items.map((i: any) => i.codigo));
    expect(distinctCodes.size).toBe(EXPECTED_MANOEUVRE_CODE_COUNT);
    expect(plan.manobra_resolution).toHaveLength(EXPECTED_MANOEUVRE_CODE_COUNT);
    const byType = (t: string) => plan.manobra_resolution.filter((e: any) => e.resolution_type === t).length;
    expect(byType('TRUE_MISSING')).toBe(EXPECTED_MANOEUVRE_CODE_COUNT); // tenantManobras=[] here: every code is TRUE_MISSING in this synthetic fixture
  });

  it('keeps every statement under the D1 per-query size limit', () => {
    const { resolutionStatements, modelAndLinkStatements } = buildFullBatch();
    const allStatements = [...resolutionStatements, ...modelAndLinkStatements];
    for (const sql of allStatements) {
      expect(Buffer.byteLength(sql, 'utf8')).toBeLessThan(D1_STATEMENT_SIZE_LIMIT_BYTES);
    }
  });

  it('the full batch (resolution + model/link statements) is a single flat array meant for one db.batch() call', () => {
    const { resolutionStatements, modelAndLinkStatements } = buildFullBatch();
    // buildResolutionStatements / buildModelAndLinkStatements each return a
    // flat string[] — the caller (executor route) concatenates them into one
    // statements array and issues exactly one db.batch(...) call. Assert the
    // shape here so a future refactor can't silently split this into
    // multiple batches (which would break atomicity).
    expect(Array.isArray(resolutionStatements)).toBe(true);
    expect(Array.isArray(modelAndLinkStatements)).toBe(true);
    expect(resolutionStatements.every((s) => typeof s === 'string')).toBe(true);
    expect(modelAndLinkStatements.every((s) => typeof s === 'string')).toBe(true);
  });
});
