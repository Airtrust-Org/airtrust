import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { trainingComplianceHistoricalModalitySql } from '../../services/training-compliance-history-identity';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (path: string): DatabaseSyncType;
};

describe('historical qualification modality from a tenant-scoped canonical model', () => {
  it('recognizes the existing TREINAMENTO EAD model category when the LMS history format is NULL', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE qualificacoes_historico (formato_codigo TEXT);
        CREATE TABLE qualificacoes_tipos (tipo TEXT, categoria TEXT);
        INSERT INTO qualificacoes_historico (formato_codigo) VALUES (NULL);
        INSERT INTO qualificacoes_tipos (tipo, categoria) VALUES ('TREINAMENTO', 'TREINAMENTO EAD');
      `);
      const expression = trainingComplianceHistoricalModalitySql(true, true, false, true);
      const read = () => (db.prepare(`SELECT ${expression} AS modality
        FROM qualificacoes_historico qh CROSS JOIN qualificacoes_tipos qt_history_id`).get() as { modality: string }).modality;

      // The real QA #41689153132 saved an expired LMS-issued history with this exact
      // model category. Without this mapping, an EAD-only rule skips the expiry
      // and instead selects an LMS completion without its historical validity date.
      expect(read()).toBe('EAD');

      // Explicit historical formats always prevail over the model's default.
      db.exec("UPDATE qualificacoes_historico SET formato_codigo='PRESENCIAL'");
      expect(read()).toBe('PRESENCIAL');

      db.exec("UPDATE qualificacoes_historico SET formato_codigo='NAO_CLASSIFICADO'");
      expect(read()).toBe('EAD');

      // Do not infer modalities from arbitrary strings containing the letters EAD.
      db.exec("UPDATE qualificacoes_historico SET formato_codigo=NULL");
      db.exec("UPDATE qualificacoes_tipos SET categoria='OUTRO EAD'");
      expect(read()).toBe('');
    } finally {
      db.close();
    }
  });
});
