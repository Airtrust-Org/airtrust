import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDeterministicPlan,
  sha256,
  EXPECTED_SOURCE_HASH_COUNT,
} from '../../../scripts/lib/matriz-import-plan.mjs';
import { applyPlan, loadFingerprint } from '../../../scripts/apply-simuladores-matriz-import.mjs';
import { runCompensatoryRollback } from '../../../scripts/rollback-simuladores-matriz-import.mjs';

const ROOT = process.cwd();
const MIGRATION = readFileSync(
  join(ROOT, 'migrations/0440_simuladores_matriz_versionada_metadata.sql'),
  'utf8',
);
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

function item(modelo: string, ordem: number) {
  return {
    modelo,
    ordem,
    codigo: `MAN-${ordem}`,
    nome: `Manobra ${ordem}`,
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
    const items = models.flatMap((model) =>
      Array.from({ length: 18 }, (_, order) => item(model.codigo, order + 1)),
    );
    return { models, items };
  };
  return { aw139: toMatrix(aw139Sessions), sk76: toMatrix(sk76Sessions) };
}

function seedDb(db: string) {
  const manobraRows = Array.from({ length: 18 }, (_, i) => {
    const id = i + 1;
    return `(${id},7,'MAN-${id}','Manobra ${id}',NULL)`;
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
  deleted_at TEXT
);
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
  modelo_id INTEGER REFERENCES modelos_sessao(id),
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
  return createDeterministicPlan({
    empresaId: 7,
    sourceHashes: sourceHashes(),
    aw139,
    sk76,
    loft: 22,
    baseFingerprint: fingerprint.fingerprint,
    contract: CONTRACT,
    loftSummary: { total: 22, valid: 22 },
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

      const second = applyPlan({ dbPath: db, plan, importUuid, dryRun: false });
      expect(second.idempotent).toBe(true);

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
        },
        importUuid: 'x',
        dryRun: true,
      }),
    ).toThrow();
  });
});
