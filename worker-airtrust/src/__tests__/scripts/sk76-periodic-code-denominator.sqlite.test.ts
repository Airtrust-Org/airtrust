import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  SK76_PERIODIC_CODE_RENAMES,
  applySk76PeriodicMatrixCodeCorrections,
  canonicalSk76PeriodicCode,
  legacySk76PeriodicCode,
} from '../../../scripts/lib/sk76-periodic-code-contract.mjs';
import {
  loadSessionContract,
  validateSessionContract,
} from '../../../scripts/lib/matriz-session-contract.mjs';
import { resolveGuiaLinks } from '../../../scripts/lib/matriz-guia-resolution.mjs';

const migration = readFileSync('migrations/0459_sk76_periodic_code_denominator.sql', 'utf8');

function buildDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE empresas (id INTEGER PRIMARY KEY);
    INSERT INTO empresas(id) VALUES (6),(7);

    CREATE TABLE modelos_sessao (
      id INTEGER PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      empresa_id INTEGER NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE modelos_sessao_versionamento (
      modelo_id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      codigo_canonico TEXT NOT NULL COLLATE NOCASE,
      versao_numero INTEGER NOT NULL,
      versao_matriz TEXT NOT NULL,
      is_current INTEGER NOT NULL,
      modelo_anterior_id INTEGER,
      efetivo_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      efetivo_ate TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX uq_modelo_canonico_corrente_tenant
      ON modelos_sessao_versionamento(empresa_id,codigo_canonico) WHERE is_current=1;
    CREATE UNIQUE INDEX uq_modelo_canonico_versao_tenant
      ON modelos_sessao_versionamento(empresa_id,codigo_canonico,versao_numero);

    CREATE TABLE modelos_sessao_manobras (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      modelo_id INTEGER NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE simuladores_guias_instrutor (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      programa TEXT,
      ciclo TEXT,
      sessao_numero INTEGER,
      sessao_total INTEGER,
      modelo_aeronave_id INTEGER,
      deleted_at TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE d1_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  SK76_PERIODIC_CODE_RENAMES.forEach(([legacy], index) => {
    const id = index + 1;
    db.prepare('INSERT INTO modelos_sessao(id,codigo,empresa_id) VALUES (?,?,6)').run(
      id,
      `${legacy}@M2026.07-V1`,
    );
    db.prepare(`INSERT INTO modelos_sessao_versionamento(
      modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,
      modelo_anterior_id,efetivo_em,efetivo_ate,created_at,updated_at
    ) VALUES (?,6,?,1,'M2026.07',1,NULL,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(
      id,
      legacy,
    );
    for (let ordem = 1; ordem <= 18; ordem += 1) {
      db.prepare('INSERT INTO modelos_sessao_manobras(modelo_id,deleted_at) VALUES (?,NULL)').run(id);
    }
    db.prepare(`INSERT INTO simuladores_guias_instrutor(
      id,empresa_id,codigo,programa,ciclo,sessao_numero,sessao_total,deleted_at
    ) VALUES (?,6,?,'PERIODICO',NULL,NULL,NULL,NULL)`).run(id, legacy);
  });

  db.prepare('INSERT INTO modelos_sessao(id,codigo,empresa_id) VALUES (100,?,7)').run(
    'S76-P-01/04-C1@TENANT7-V1',
  );
  db.prepare(`INSERT INTO modelos_sessao_versionamento(
    modelo_id,empresa_id,codigo_canonico,versao_numero,versao_matriz,is_current,
    modelo_anterior_id,efetivo_em,efetivo_ate,created_at,updated_at
  ) VALUES (100,7,'S76-P-01/04-C1',1,'M2026.07',1,NULL,CURRENT_TIMESTAMP,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run();
  db.prepare(`INSERT INTO simuladores_guias_instrutor(
    id,empresa_id,codigo,programa,deleted_at
  ) VALUES (100,7,'S76-P-01/04-C1','PERIODICO',NULL)`).run();

  return db;
}

describe('S-76 periódico — denominador canônico /03', () => {
  it('normaliza exatamente os seis códigos periódicos e mantém o Check separado', () => {
    for (const [legacy, canonical] of SK76_PERIODIC_CODE_RENAMES) {
      expect(canonicalSk76PeriodicCode(legacy)).toBe(canonical);
      expect(legacySk76PeriodicCode(canonical)).toBe(legacy);
    }
    expect(canonicalSk76PeriodicCode('SK76-P-CHECK')).toBe('SK76-P-CHECK');
    expect(legacySk76PeriodicCode('SK76-P-CHECK')).toBeNull();
  });

  it('expõe /03 no contrato efetivo mesmo com o snapshot-fonte histórico ainda em /04', () => {
    const contract = loadSessionContract('data/simuladores-matriz/session-contract-51.json');
    expect(() => validateSessionContract(contract)).not.toThrow();
    const codes = contract.sessions.map((session: { codigo_canonico: string }) => session.codigo_canonico);
    expect(codes.filter((code: string) => /^S76-P-0[12]\/03-C[123]$/.test(code))).toHaveLength(6);
    expect(codes.some((code: string) => /^S76-P-0[12]\/04-C[123]$/.test(code))).toBe(false);
    expect(codes).toContain('SK76-P-CHECK');
  });

  it('normaliza modelos e vínculos do plano sem alterar manobras', () => {
    const matrix = applySk76PeriodicMatrixCodeCorrections({
      models: [{ codigo: 'S76-P-01/04-C1', titulo: 'Periódico C1' }],
      items: [{ modelo: 'S76-P-01/04-C1', ordem: 1, codigo: 'S76-PAR-01' }],
    });
    expect(matrix.models[0].codigo).toBe('S76-P-01/03-C1');
    expect(matrix.items[0]).toMatchObject({ modelo: 'S76-P-01/03-C1', codigo: 'S76-PAR-01' });
  });

  it('aceita guia legado /04 apenas pelo alias explícito para o modelo /03', () => {
    const resolutions = resolveGuiaLinks({
      sessions: [
        {
          codigo_canonico: 'S76-P-02/03-C1',
          aeronave: 'SK76',
          programa: 'Periódico',
          tipo_qualificacao_estruturado: 'PERIODICO',
          ciclo: null,
          html_relpath: 'SK76/html/Guia_Instrutor_Simulador_S76_S76-P-02-04-C1.html',
        },
      ],
      guias: [
        {
          id: 77,
          codigo: 'S76-P-02/04-C1',
          aeronave: 'SK76',
          programa: 'PERIODICO',
          ciclo: null,
        },
      ],
    });
    expect(resolutions).toEqual([
      {
        codigo_canonico: 'S76-P-02/03-C1',
        guia_id: 77,
        match_type: 'EXACT_LEGACY_CODE_ALIAS',
      },
    ]);
  });

  it('migration 0459 preserva IDs e vínculos e corrige somente o tenant 6', () => {
    const db = buildDatabase();
    const beforeLinks = db.prepare('SELECT COUNT(*) AS c FROM modelos_sessao_manobras').get() as {
      c: number;
    };

    db.exec(migration);

    const currentCodes = db
      .prepare(
        'SELECT codigo_canonico FROM modelos_sessao_versionamento WHERE empresa_id=6 AND is_current=1 ORDER BY codigo_canonico',
      )
      .all() as Array<{ codigo_canonico: string }>;
    expect(currentCodes.map((row) => row.codigo_canonico)).toEqual(
      SK76_PERIODIC_CODE_RENAMES.map(([, canonical]) => canonical).sort(),
    );

    const physical = db
      .prepare('SELECT id,codigo FROM modelos_sessao WHERE empresa_id=6 ORDER BY id')
      .all() as Array<{ id: number; codigo: string }>;
    expect(physical.map((row) => row.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(physical.every((row) => row.codigo.includes('/03'))).toBe(true);

    const guides = db
      .prepare('SELECT codigo FROM simuladores_guias_instrutor WHERE empresa_id=6 ORDER BY id')
      .all() as Array<{ codigo: string }>;
    expect(guides.every((row) => row.codigo.includes('/03'))).toBe(true);

    const afterLinks = db.prepare('SELECT COUNT(*) AS c FROM modelos_sessao_manobras').get() as {
      c: number;
    };
    expect(afterLinks.c).toBe(beforeLinks.c);

    const tenant7 = db
      .prepare(
        'SELECT codigo_canonico FROM modelos_sessao_versionamento WHERE empresa_id=7 AND modelo_id=100',
      )
      .get() as { codigo_canonico: string };
    expect(tenant7.codigo_canonico).toBe('S76-P-01/04-C1');

    expect(() =>
      db
        .prepare(
          "UPDATE modelos_sessao_versionamento SET codigo_canonico='ALTERADO' WHERE empresa_id=6 AND modelo_id=1",
        )
        .run(),
    ).toThrow(/identidade de versão é imutável/);
  });
});
