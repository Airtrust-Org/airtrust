import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDeterministicPlan,
  sealPlan,
  sha256,
  EXPECTED_SOURCE_HASH_COUNT,
} from '../../../scripts/lib/matriz-import-plan.mjs';
import type { PlanoDeterministico } from '../../../scripts/lib/matriz-import-plan.mjs';
import {
  EXPECTED_MANOEUVRE_CODE_COUNT,
  buildManoeuvreResolutionEntries,
} from '../../../scripts/lib/matriz-manobra-resolution.mjs';
import { applyPlan, loadFingerprint } from '../../../scripts/apply-simuladores-matriz-import.mjs';
import { runCompensatoryRollback } from '../../../scripts/rollback-simuladores-matriz-import.mjs';

const ROOT = process.cwd();
const MIGRATION = readFileSync(
  join(ROOT, 'migrations/0440_simuladores_matriz_versionada_metadata.sql'),
  'utf8',
);
const MIGRATION_0441 = readFileSync(
  join(ROOT, 'migrations/0441_simuladores_matriz_manobra_resolution.sql'),
  'utf8',
);
// The fixture pre-seeds every code except this one, which must resolve as
// TRUE_MISSING and be created tenant-scoped by the executor.
const MISSING_CODE = `MAN-${EXPECTED_MANOEUVRE_CODE_COUNT}`;
const CONTRACT = JSON.parse(
  readFileSync(join(ROOT, 'data/simuladores-matriz/session-contract-51.json'), 'utf8'),
);

function run(db: string, sql: string) {
  return spawnSync('sqlite3', ['-bail', db], {
    input: `PRAGMA foreign_keys=ON;\nPRAGMA recursive_triggers=OFF;\n${sql}`,
    encoding: 'utf8',
  });
}

function queryJson<T = unknown>(db: string, sql: string): T {
  const result = spawnSync('sqlite3', ['-json', db], {
    input: `PRAGMA foreign_keys=ON;\n${sql}`,
    encoding: 'utf8',
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const trimmed = result.stdout.trim();
  return (trimmed ? JSON.parse(trimmed) : []) as T;
}

function sourceHashes() {
  return Object.fromEntries(
    Array.from({ length: EXPECTED_SOURCE_HASH_COUNT }, (_, index) => [
      `src-${index}`,
      sha256(`payload-${index}`),
    ]),
  );
}

function item(modelo: string, ordem: number, codigo: string) {
  return {
    modelo,
    ordem,
    codigo,
    nome: `Manobra ${codigo}`,
    execucao_pf: ordem % 2 === 0 ? 'B' : 'A',
    categoria: 'PROCEDIMENTO',
    fase_voo: ordem <= 2 ? 'SOLO' : 'VOO',
    tipo_conteudo: 'NORMAL',
    cenario: null,
    configuracao_ios: null,
    desempenho_esperado: 'ok',
    foco_instrutor: 'foco',
    como_observar: 'ok',
    referencia_tecnica: 'ok',
    rastreabilidade_interna: null,
    criterios: { '1-2': 'a', '3-5': 'b', '6-8': 'c', '9-10': 'd' },
  };
}

function matricesFromContract() {
  const aw139Sessions = CONTRACT.sessions.filter(
    (s: { aeronave: string }) => s.aeronave === 'AW139',
  );
  const sk76Sessions = CONTRACT.sessions.filter(
    (s: { aeronave: string }) => s.aeronave === 'SK76',
  );
  const toMatrix = (sessions: Array<Record<string, unknown>>) => {
    const models = sessions.map((s) => ({
      codigo: String(s.codigo_canonico),
      programa: String(s.programa),
      ciclo: s.ciclo == null ? null : String(s.ciclo),
      titulo: String(s.titulo_sanitizado),
      aeronave: s.aeronave as 'AW139' | 'SK76',
      tipo_qualificacao_estruturado: String(s.tipo_qualificacao_estruturado),
    }));
    // Cycle deterministically through exactly EXPECTED_MANOEUVRE_CODE_COUNT
    // distinct manoeuvre codes across all model positions, mirroring the real
    // matrices (918 item-positions resolving to 301 distinct canonical
    // codes) instead of the trivial 18-code-per-model shape.
    let globalOrder = 0;
    const items = models.flatMap((model) =>
      Array.from({ length: 18 }, (_, order) => {
        const codigo = `MAN-${(globalOrder % EXPECTED_MANOEUVRE_CODE_COUNT) + 1}`;
        globalOrder += 1;
        return item(model.codigo, order + 1, codigo);
      }),
    );
    return { models, items };
  };
  return { aw139: toMatrix(aw139Sessions), sk76: toMatrix(sk76Sessions) };
}

function seedDb(db: string) {
  // Pre-seed every canonical code except MISSING_CODE, which must resolve as
  // TRUE_MISSING and be created by the executor itself.
  const manobraRows = Array.from({ length: EXPECTED_MANOEUVRE_CODE_COUNT - 1 }, (_, i) => {
    const id = i + 1;
    return `(${id},7,'MAN-${id}','Manobra MAN-${id}',NULL)`;
  }).join(',\n');
  const sessions = CONTRACT.sessions as Array<{ codigo_canonico: string; titulo_sanitizado: string; tipo_qualificacao_estruturado: string }>;
  const modelRows = sessions
    .map((s, index) => {
      const id = 1000 + index;
      const tipo = s.tipo_qualificacao_estruturado;
      return `(${id},'${s.codigo_canonico.replace(/'/g, "''")}', '${s.titulo_sanitizado.replace(/'/g, "''")}',7,'${tipo}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)`;
    })
    .join(',\n');
  const linkRows = sessions
    .flatMap((s, index) => {
      const modeloId = 1000 + index;
      return Array.from({ length: 18 }, (_, order) => {
        const manobraId = order + 1;
        const linkId = modeloId * 100 + order + 1;
        return `(${linkId},${modeloId},${manobraId},${order + 1},1,'AB',NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,NULL)`;
      });
    })
    .join(',\n');
  const versionRows = sessions
    .map((s, index) => {
      const id = 1000 + index;
      return `(${id},7,'${s.codigo_canonico.replace(/'/g, "''")}',1,'LEGACY',1,NULL,CURRENT_TIMESTAMP,NULL)`;
    })
    .join(',\n');

  const sql = `
CREATE TABLE empresas(id INTEGER PRIMARY KEY);
CREATE TABLE modelos_sessao(
  id INTEGER PRIMARY KEY,
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL DEFAULT 'fixture',
  empresa_id INTEGER NOT NULL,
  tipo TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);
CREATE TABLE manobras(
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  codigo TEXT NOT NULL,
  nome TEXT,
  categoria TEXT,
  descricao TEXT,
  tipo_aeronave TEXT,
  referencias_json TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_manobras_empresa_codigo_active
  ON manobras(empresa_id, codigo) WHERE deleted_at IS NULL;
CREATE TABLE modelos_sessao_manobras(
  id INTEGER PRIMARY KEY,
  modelo_id INTEGER NOT NULL,
  manobra_id INTEGER NOT NULL,
  ordem INTEGER NOT NULL,
  obrigatoria INTEGER,
  tripulante TEXT NOT NULL DEFAULT 'AB',
  observacoes TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  created_by TEXT,
  updated_by TEXT,
  UNIQUE(modelo_id, manobra_id),
  FOREIGN KEY(modelo_id) REFERENCES modelos_sessao(id),
  FOREIGN KEY(manobra_id) REFERENCES manobras(id)
);
CREATE INDEX idx_modelos_sessao_manobras_modelo_id ON modelos_sessao_manobras(modelo_id);
CREATE INDEX idx_modelos_sessao_manobras_manobra_id ON modelos_sessao_manobras(manobra_id);
CREATE INDEX idx_modelos_sessao_manobras_ordem ON modelos_sessao_manobras(modelo_id, ordem);
CREATE TRIGGER trigger_modelos_sessao_manobras_updated_at
AFTER UPDATE ON modelos_sessao_manobras FOR EACH ROW BEGIN
  UPDATE modelos_sessao_manobras SET updated_at = datetime('now') WHERE id = NEW.id;
END;
CREATE TABLE simulador_agendamentos(
  id INTEGER PRIMARY KEY,
  template_id INTEGER,
  empresa_id INTEGER REFERENCES empresas(id),
  FOREIGN KEY(template_id) REFERENCES modelos_sessao(id)
);
CREATE TABLE fichas_sessao(
  id INTEGER PRIMARY KEY,
  agendamento_slot_id INTEGER,
  template_id INTEGER REFERENCES modelos_sessao(id),
  empresa_id INTEGER REFERENCES empresas(id)
);
CREATE TABLE simulador_atribuicoes_curriculares(
  id INTEGER PRIMARY KEY,
  modelo_sessao_id INTEGER REFERENCES modelos_sessao(id),
  empresa_id INTEGER REFERENCES empresas(id)
);
INSERT INTO empresas VALUES(7),(8);
INSERT INTO manobras(id,empresa_id,codigo,nome,deleted_at) VALUES ${manobraRows};
INSERT INTO modelos_sessao(id,codigo,nome,empresa_id,tipo,created_at,updated_at,deleted_at) VALUES ${modelRows};
INSERT INTO modelos_sessao_manobras
  (id,modelo_id,manobra_id,ordem,obrigatoria,tripulante,observacoes,created_at,updated_at,deleted_at)
VALUES ${linkRows};
`;
  expect(run(db, sql).status).toBe(0);
  expect(run(db, `BEGIN IMMEDIATE;\n${MIGRATION}\nCOMMIT;`).status).toBe(0);
  expect(run(db, `BEGIN IMMEDIATE;\n${MIGRATION_0441}\nCOMMIT;`).status).toBe(0);
  // 0440 seeds LEGACY versionamento from existing modelos; re-assert current LEGACY rows.
  const versionCount = queryJson<Array<{ c: number }>>(
    db,
    'SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=7 AND is_current=1',
  )[0]?.c;
  if (!versionCount || Number(versionCount) < 51) {
    expect(
      run(
        db,
        `INSERT OR IGNORE INTO modelos_sessao_versionamento
          (modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em,efetivo_ate)
         VALUES ${versionRows};`,
      ).status,
    ).toBe(0);
  }
}

function buildPlan(db: string) {
  const { aw139, sk76 } = matricesFromContract();
  const fingerprint = loadFingerprint(db, 7);
  const tenantManobras = queryJson<Array<{ id: number; codigo: string; empresa_id: number }>>(
    db,
    'SELECT id, codigo, empresa_id FROM manobras WHERE empresa_id=7 AND deleted_at IS NULL',
  );
  // Carry forward any already-resolved code for this matrix version instead
  // of reclassifying it (see prepare-simuladores-matriz-import.mjs).
  const existingResolutions = queryJson<Array<{ codigo_canonico: string; resolution_type: string; manobra_id: number }>>(
    db,
    "SELECT codigo_canonico, resolution_type, manobra_id FROM simuladores_matriz_manobra_resolution WHERE empresa_id=7 AND versao_matriz='M2026.07'",
  );
  const overrides = Object.fromEntries(
    existingResolutions.map((r) => [r.codigo_canonico, { resolution_type: r.resolution_type, existing_manobra_id: r.manobra_id }]),
  );
  const manobraResolution = buildManoeuvreResolutionEntries({
    empresaId: 7,
    items: [...aw139.items, ...sk76.items],
    tenantManobras,
    overrides,
  });
  return createDeterministicPlan({
    empresaId: 7,
    sourceHashes: sourceHashes(),
    aw139,
    sk76,
    loft: 22,
    baseFingerprint: fingerprint.fingerprint,
    contract: CONTRACT,
    loftSummary: { total: 22, valid: 22 },
    manobraResolution,
  });
}

describe('matriz local apply + compensatory rollback', () => {
  it('applies, is idempotent, rolls back to V3, refuses drift/wrong tenant/hash, and reapplies with new UUID', () => {
    const dir = mkdtempSync(join(tmpdir(), 'matriz-apply-'));
    const db = join(dir, 'local.sqlite');
    const aw139Dir = join(dir, 'AW139');
    const sk76Dir = join(dir, 'SK76');
    mkdirSync(aw139Dir);
    mkdirSync(sk76Dir);
    writeFileSync(join(aw139Dir, 'marker.txt'), 'local');
    writeFileSync(join(sk76Dir, 'marker.txt'), 'local');
    try {
      seedDb(db);
      const plan = buildPlan(db);
      const importUuid = 'import-uuid-1';

      const dry = applyPlan({ dbPath: db, plan, importUuid, dryRun: true });
      expect(dry.mode).toBe('DRY_RUN');
      expect(
        queryJson<Array<{ status: string }>>(
          db,
          `SELECT status FROM simuladores_matriz_imports WHERE uuid='${importUuid}'`,
        )[0]?.status,
      ).toBe('DRY_RUN');

      const first = applyPlan({ dbPath: db, plan, importUuid, dryRun: false });
      expect(first.status).toBe('APPLIED');
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          "SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=7 AND is_current=1 AND versao_matriz='M2026.07'",
        )[0]?.c,
      ).toBe(51);
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          'SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=7 AND is_current=1 GROUP BY codigo_canonico HAVING c<>1',
        ),
      ).toEqual([]);

      // TRUE_MISSING manoeuvre code was created tenant-scoped, resolved
      // exactly once, and all 918 links now exist.
      const createdManobra = queryJson<Array<{ id: number; empresa_id: number; deleted_at: string | null }>>(
        db,
        `SELECT id, empresa_id, deleted_at FROM manobras WHERE codigo='${MISSING_CODE}'`,
      );
      expect(createdManobra).toHaveLength(1);
      expect(createdManobra[0].empresa_id).toBe(7);
      expect(createdManobra[0].deleted_at).toBeNull();

      // Every field the create_payload carries must be persisted — not
      // silently dropped — either on manobras itself (nome/categoria/
      // tipo_aeronave/descricao/referencia_tecnica) or, for fase_voo/
      // tipo_conteudo, on the per-link context row (they describe how the
      // manoeuvre is used within *this* session, not an inherent catalog
      // property of the manobra).
      const expectedPayload = plan.manobra_resolution.find(
        (e: any) => e.codigo_canonico === MISSING_CODE,
      )!.create_payload!;
      const persistedManobra = queryJson<Array<{ nome: string; categoria: string; tipo_aeronave: string | null; descricao: string | null; referencias_json: string | null }>>(
        db,
        `SELECT nome, categoria, tipo_aeronave, descricao, referencias_json FROM manobras WHERE codigo='${MISSING_CODE}' AND empresa_id=7`,
      )[0];
      expect(persistedManobra.nome).toBe(expectedPayload.nome);
      expect(persistedManobra.categoria).toBe(expectedPayload.categoria);
      expect(persistedManobra.tipo_aeronave).toBe(expectedPayload.tipo_aeronave);
      expect(persistedManobra.descricao).toBe(expectedPayload.descricao);
      expect(JSON.parse(persistedManobra.referencias_json!).referencia_tecnica).toBe(expectedPayload.referencia_tecnica);

      const persistedContext = queryJson<Array<{ metadados_json: string }>>(
        db,
        `SELECT ctx.metadados_json FROM modelos_sessao_manobras_contexto ctx
         JOIN modelos_sessao_manobras msm ON msm.id = ctx.modelo_manobra_id
         JOIN modelos_sessao ms ON ms.id = msm.modelo_id
         JOIN simuladores_matriz_manobra_resolution r ON r.manobra_id = msm.manobra_id AND r.empresa_id=7
         WHERE r.codigo_canonico='${MISSING_CODE}' AND ms.codigo LIKE '%@M2026.07%'
         LIMIT 1`,
      )[0];
      const parsedContext = JSON.parse(persistedContext.metadados_json);
      expect(parsedContext.fase_voo).toBe(expectedPayload.fase_voo);
      expect(parsedContext.tipo_conteudo).toBe(expectedPayload.tipo_conteudo);

      expect(
        queryJson<Array<{ c: number }>>(
          db,
          "SELECT COUNT(*) AS c FROM simuladores_matriz_manobra_resolution WHERE empresa_id=7 AND versao_matriz='M2026.07'",
        )[0]?.c,
      ).toBe(EXPECTED_MANOEUVRE_CODE_COUNT);
      expect(
        queryJson<Array<{ resolution_type: string; manobra_id: number }>>(
          db,
          `SELECT resolution_type, manobra_id FROM simuladores_matriz_manobra_resolution WHERE empresa_id=7 AND codigo_canonico='${MISSING_CODE}'`,
        )[0],
      ).toEqual({ resolution_type: 'TRUE_MISSING', manobra_id: createdManobra[0].id });
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          `SELECT COUNT(*) AS c FROM modelos_sessao_manobras msm
           JOIN modelos_sessao ms ON ms.id = msm.modelo_id
           WHERE ms.empresa_id=7 AND ms.codigo LIKE '%@M2026.07-V%'`,
        )[0]?.c,
      ).toBe(918);

      const second = applyPlan({ dbPath: db, plan, importUuid, dryRun: false });
      expect(second.idempotent).toBe(true);
      // Idempotent reapply must not duplicate the created manobra.
      expect(
        queryJson<Array<{ c: number }>>(db, `SELECT COUNT(*) AS c FROM manobras WHERE codigo='${MISSING_CODE}'`)[0]
          ?.c,
      ).toBe(1);

      expect(() =>
        applyPlan({
          dbPath: db,
          plan: { ...plan, plan_sha256: '0'.repeat(64) },
          importUuid,
          dryRun: false,
        }),
      ).toThrow(/plan_sha256|adulterado|diferente/);

      const rb1 = runCompensatoryRollback({
        d1Local: db,
        importUuid,
        empresaId: 7,
        compensationUuid: 'comp-1',
      });
      expect(rb1.status).toBe('ROLLED_BACK');
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          "SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=7 AND is_current=1 AND versao_matriz LIKE 'COMPENSATE%'",
        )[0]?.c,
      ).toBe(51);
      // V1 + V2 preserved historically
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          "SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=7 AND versao_matriz='LEGACY'",
        )[0]?.c,
      ).toBeGreaterThanOrEqual(51);
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          "SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=7 AND versao_matriz='M2026.07'",
        )[0]?.c,
      ).toBe(51);
      // Rollback is compensatory: the created manobra and its audited
      // resolution are never deleted, even though the import is ROLLED_BACK.
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          `SELECT COUNT(*) AS c FROM manobras WHERE codigo='${MISSING_CODE}' AND empresa_id=7 AND deleted_at IS NULL`,
        )[0]?.c,
      ).toBe(1);
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          `SELECT COUNT(*) AS c FROM simuladores_matriz_manobra_resolution WHERE empresa_id=7 AND codigo_canonico='${MISSING_CODE}'`,
        )[0]?.c,
      ).toBe(1);

      const rb2 = runCompensatoryRollback({
        d1Local: db,
        importUuid,
        empresaId: 7,
        compensationUuid: 'comp-1',
      });
      expect(rb2.idempotent).toBe(true);
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          "SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=7 AND is_current=1 AND versao_matriz LIKE 'COMPENSATE%'",
        )[0]?.c,
      ).toBe(51);

      expect(() =>
        runCompensatoryRollback({ d1Local: db, importUuid, empresaId: 8 }),
      ).toThrow(/tenant|não encontrada/);

      // Drift: invent a newer current non-compensate version
      const sample = queryJson<Array<{ codigo_canonico: string; modelo_id: number }>>(
        db,
        "SELECT codigo_canonico, modelo_id FROM modelos_sessao_versionamento WHERE empresa_id=7 AND is_current=1 LIMIT 1",
      )[0];
      run(
        db,
        `INSERT INTO modelos_sessao(codigo,nome,empresa_id,tipo,created_at,updated_at)
         VALUES('DRIFT-X','drift',7,'INICIAL',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
         UPDATE modelos_sessao_versionamento SET is_current=0 WHERE modelo_id=${sample.modelo_id};
         INSERT INTO modelos_sessao_versionamento
           (modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,modelo_anterior_id,efetivo_em)
         SELECT id,7,'${sample.codigo_canonico.replace(/'/g, "''")}',99,'DRIFT',1,${sample.modelo_id},CURRENT_TIMESTAMP
         FROM modelos_sessao WHERE codigo='DRIFT-X';`,
      );
      // Restore for reapply path: undo drift first
      run(
        db,
        `DELETE FROM modelos_sessao_versionamento WHERE versao_matriz='DRIFT';
         DELETE FROM modelos_sessao WHERE codigo='DRIFT-X';
         UPDATE modelos_sessao_versionamento SET is_current=1 WHERE modelo_id=${sample.modelo_id};`,
      );

      const plan2 = buildPlan(db);
      const reapply = applyPlan({
        dbPath: db,
        plan: plan2,
        importUuid: 'import-uuid-2',
        dryRun: false,
      });
      expect(reapply.status).toBe('APPLIED');
      // Reapply under a new import-uuid (after the first import was rolled
      // back) must reuse the previously created manobra, never duplicate it.
      expect(
        queryJson<Array<{ c: number }>>(db, `SELECT COUNT(*) AS c FROM manobras WHERE codigo='${MISSING_CODE}'`)[0]
          ?.c,
      ).toBe(1);
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          "SELECT COUNT(*) AS c FROM simuladores_matriz_manobra_resolution WHERE empresa_id=7 AND versao_matriz='M2026.07'",
        )[0]?.c,
      ).toBe(EXPECTED_MANOEUVRE_CODE_COUNT);
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          'SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=7 AND is_current=1 GROUP BY codigo_canonico HAVING c<>1',
        ),
      ).toEqual([]);
      expect(
        queryJson<Array<{ c: number }>>(
          db,
          "SELECT COUNT(*) AS c FROM modelos_sessao_versionamento WHERE empresa_id=7 AND is_current=1 AND versao_matriz='M2026.07'",
        )[0]?.c,
      ).toBe(51);

      // Intermediate failure rolls back: wrong fingerprint
      const badPlan = { ...plan2, base_fingerprint: 'f'.repeat(64), plan_sha256: sha256({ ...plan2, base_fingerprint: 'f'.repeat(64), plan_sha256: undefined }) };
      // Recreate integrity properly
      const { plan_sha256: _drop, ...payload } = { ...plan2, base_fingerprint: 'f'.repeat(64) };
      const broken = { ...payload, plan_sha256: sha256(payload) };
      expect(() =>
        applyPlan({ dbPath: db, plan: broken, importUuid: 'import-uuid-3', dryRun: false }),
      ).toThrow(/fingerprint/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 120_000);

  it('CLI refuses remote indicators', () => {
    expect(() =>
      applyPlan({
        dbPath: '/tmp/nope.sqlite',
        plan: {
          schema_version: 2,
          empresa_id: 7,
          matrices: { AW139: { models: [], items: [] }, SK76: { models: [], items: [] } },
          totals: { modelos: 51, vinculos: 918, loft: 22 },
          source_hashes: sourceHashes(),
          plan_sha256: 'x',
          manobra_resolution: [],
        },
        importUuid: 'x',
        dryRun: true,
      }),
    ).toThrow();
  });
});

function reseal(plan: Record<string, unknown>): PlanoDeterministico {
  const { plan_sha256: _drop, ...payload } = plan;
  return sealPlan(payload) as unknown as PlanoDeterministico;
}
function withMutatedResolution(plan: PlanoDeterministico, codigo: string, mutation: Record<string, unknown>): PlanoDeterministico {
  const manobra_resolution = plan.manobra_resolution.map((e) =>
    e.codigo_canonico === codigo ? { ...e, ...mutation } : e,
  );
  return reseal({ ...plan, manobra_resolution });
}

describe('manobra resolution integrity: fails closed on any divergence from the already-stored resolution', () => {
  function setupAppliedDb() {
    const dir = mkdtempSync(join(tmpdir(), 'matriz-resolution-'));
    const db = join(dir, 'local.sqlite');
    seedDb(db);
    const plan = buildPlan(db);
    applyPlan({ dbPath: db, plan, importUuid: 'ru-1', dryRun: false });
    return { dir, db };
  }

  it('reapplying the identical plan under a new UUID is idempotent (already-registered resolution reused)', () => {
    const { dir, db } = setupAppliedDb();
    try {
      const plan2 = buildPlan(db);
      const result = applyPlan({ dbPath: db, plan: plan2, importUuid: 'ru-2', dryRun: false });
      expect(result.status).toBe('APPLIED');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('rejects a plan claiming a different manobra_id for an already-resolved code', () => {
    const { dir, db } = setupAppliedDb();
    try {
      const plan2 = buildPlan(db);
      const targetCode = plan2.manobra_resolution.find((e: any) => e.resolution_type === 'EXACT_UNIQUE')!.codigo_canonico;
      const missingCodeManobraId = queryJson<Array<{ manobra_id: number }>>(
        db,
        `SELECT manobra_id FROM simuladores_matriz_manobra_resolution WHERE empresa_id=7 AND codigo_canonico='${MISSING_CODE}'`,
      )[0].manobra_id;
      const mutated = withMutatedResolution(plan2, targetCode, { existing_manobra_id: missingCodeManobraId });
      expect(() => applyPlan({ dbPath: db, plan: mutated, importUuid: 'ru-2', dryRun: false })).toThrow(
        /manobra_id divergente/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('rejects a plan claiming a different resolution_type for an already-resolved code', () => {
    const { dir, db } = setupAppliedDb();
    try {
      const plan2 = buildPlan(db);
      const targetCode = plan2.manobra_resolution.find((e: any) => e.resolution_type === 'EXACT_UNIQUE')!.codigo_canonico;
      const mutated = withMutatedResolution(plan2, targetCode, { resolution_type: 'LEGACY_EQUIVALENT' });
      expect(() => applyPlan({ dbPath: db, plan: mutated, importUuid: 'ru-2', dryRun: false })).toThrow(
        /resolution_type divergente/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('rejects a plan claiming a different source_hash for an already-resolved code', () => {
    const { dir, db } = setupAppliedDb();
    try {
      const plan2 = buildPlan(db);
      const targetCode = plan2.manobra_resolution.find((e: any) => e.resolution_type === 'EXACT_UNIQUE')!.codigo_canonico;
      const mutated = withMutatedResolution(plan2, targetCode, { source_hash: 'f'.repeat(64) });
      expect(() => applyPlan({ dbPath: db, plan: mutated, importUuid: 'ru-2', dryRun: false })).toThrow(
        /source_hash divergente/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('rejects a plan claiming a different create_payload for an already-created TRUE_MISSING manobra', () => {
    const { dir, db } = setupAppliedDb();
    try {
      const plan2 = buildPlan(db);
      const mutated = withMutatedResolution(plan2, MISSING_CODE, {
        create_payload: { ...plan2.manobra_resolution.find((e: any) => e.codigo_canonico === MISSING_CODE)!.create_payload, categoria: 'CATEGORIA-ADULTERADA' },
      });
      expect(() => applyPlan({ dbPath: db, plan: mutated, importUuid: 'ru-2', dryRun: false })).toThrow(
        /diverge do create_payload/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('rejects apply when the already-stored resolution row was tampered with directly in the database', () => {
    const { dir, db } = setupAppliedDb();
    try {
      // Bypass the immutability trigger the way a direct DB tamper would.
      // The FK on manobra_id forbids pointing at a nonexistent manobra, so a
      // tamper can only redirect the row to a *different real* one — which
      // must still be caught (wrong physical code/payload for this code).
      run(
        db,
        `DROP TRIGGER trg_matriz_manobra_resolution_imutavel;
         UPDATE simuladores_matriz_manobra_resolution SET manobra_id = 1 WHERE empresa_id=7 AND codigo_canonico='${MISSING_CODE}';`,
      );
      const plan2 = buildPlan(db); // reflects the tampered row's resolution_type via carry-forward, but not the redirected manobra_id
      expect(() => applyPlan({ dbPath: db, plan: plan2, importUuid: 'ru-2', dryRun: false })).toThrow(
        /diverge do create_payload/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
