import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { ENGAGED_CASE_SQL, alertsNotCoveredByCases } from '../../lib/frms/alert-case-preservation';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

function seed(): DatabaseSync {
  const db = new NodeDatabaseSync(':memory:');
  db.exec(`CREATE TABLE frms_alerta (
    id TEXT PRIMARY KEY, jornada_id TEXT, tipo_limite TEXT, nivel TEXT,
    resolvido INTEGER DEFAULT 0, visualizado INTEGER DEFAULT 0, notas_resolucao TEXT,
    deleted_at TEXT, updated_at TEXT)`);
  const insert = db.prepare(
    'INSERT INTO frms_alerta (id, jornada_id, tipo_limite, nivel, resolvido, visualizado, notas_resolucao) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  insert.run('novo', 'J1', 'FDP', 'AVISO', 0, 0, null);
  insert.run('ciente', 'J1', 'REPOUSO', 'ATENCAO', 0, 1, null);
  insert.run('tratamento', 'J1', 'HV_DIARIA', 'CRITICO', 0, 1, '{"responsavel":"Coordenação"}');
  insert.run('resolvido', 'J1', 'HV_MES', 'VIOLACAO', 1, 1, '{"avaliacao_eficacia":"ok"}');
  return db;
}

describe('AUD-019 — recálculo preserva casos trabalhados pela coordenação', () => {
  it('o soft-delete do recálculo atinge só o alerta ainda não trabalhado', () => {
    const db = seed();
    db.prepare(
      `UPDATE frms_alerta SET deleted_at = 'x', updated_at = 'x'
        WHERE jornada_id = ? AND deleted_at IS NULL AND NOT ${ENGAGED_CASE_SQL}`,
    ).run('J1');
    const ativos = db.prepare('SELECT id FROM frms_alerta WHERE deleted_at IS NULL ORDER BY id').all()
      .map((row) => (row as { id: string }).id);
    expect(ativos).toEqual(['ciente', 'resolvido', 'tratamento']);
  });

  it('a mesma condição não vira caso novo; só piora de nível gera alerta', () => {
    const preservados = [
      { tipo_limite: 'REPOUSO', nivel: 'ATENCAO' },
      { tipo_limite: 'HV_MES', nivel: 'VIOLACAO' },
    ];
    const gerados = [
      { tipo_limite: 'REPOUSO', nivel: 'ATENCAO' },
      { tipo_limite: 'REPOUSO', nivel: 'AVISO' },
      { tipo_limite: 'HV_MES', nivel: 'VIOLACAO' },
      { tipo_limite: 'REPOUSO', nivel: 'CRITICO' },
      { tipo_limite: 'FDP', nivel: 'AVISO' },
    ];
    expect(alertsNotCoveredByCases(gerados, preservados)).toEqual([
      { tipo_limite: 'REPOUSO', nivel: 'CRITICO' },
      { tipo_limite: 'FDP', nivel: 'AVISO' },
    ]);
  });
});
