import { createRequire } from 'node:module';
import type { DatabaseSync as DatabaseSyncType } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { appendQualificationTypeCatalogReadScope } from '../../services/qualificacoes/tipos-operational-read-scope';

const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (path: string): DatabaseSyncType;
};

describe('shared qualification model operational read scope (D4)', () => {
  it('permits a manager only via its own managed active sector, without cross-tenant disclosure', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE qualificacoes_tipos(id INTEGER PRIMARY KEY,empresa_id INTEGER,deleted_at TEXT,categoria TEXT);
        CREATE TABLE qualificacoes_tipos_setores(id INTEGER PRIMARY KEY,tipo_id INTEGER,empresa_id INTEGER,setor_id INTEGER,deleted_at TEXT);
        CREATE TABLE setores(id INTEGER PRIMARY KEY,empresa_id INTEGER,ativo INTEGER,deleted_at TEXT);
        CREATE TABLE qualificacoes_categorias(nome TEXT PRIMARY KEY,dominio_codigo TEXT);
        INSERT INTO qualificacoes_tipos VALUES
          (25,6,NULL,'Teórico'),(137,6,'2026-11-14','Técnico'),(26,6,NULL,'Teórico'),
          (725,7,NULL,'Teórico');
        INSERT INTO qualificacoes_tipos_setores VALUES
          (16,25,6,11,NULL),(27,25,6,10,NULL),(28,26,6,10,NULL),(700,725,7,11,NULL);
        INSERT INTO setores VALUES (10,6,1,NULL),(11,6,1,NULL),(111,7,1,NULL);
        INSERT INTO qualificacoes_categorias VALUES ('Teórico','OPERACOES'),('Técnico','MANUTENCAO');
      `);
      const scopes = [
        { domains: ['MANUTENCAO'], setorIds: [11], expected: [25] },
        { domains: ['OPERACOES'], setorIds: [10], expected: [25, 26] },
        { domains: [], setorIds: [], expected: [] },
      ];
      for (const scope of scopes) {
        const conditions = ['qt.empresa_id = ?', 'qt.deleted_at IS NULL'];
        const params: unknown[] = [6];
        appendQualificationTypeCatalogReadScope(conditions, params, {
          restricted: true,
          domains: scope.domains as ('OPERACOES' | 'MANUTENCAO')[],
          setorIds: scope.setorIds,
        }, 'qc.dominio_codigo', true);
        const rows = db.prepare(`
           SELECT qt.id FROM qualificacoes_tipos qt
           JOIN qualificacoes_categorias qc ON qc.nome=qt.categoria
           WHERE ${conditions.join(' AND ')} ORDER BY qt.id
        `).all(...params as (string | number)[]) as {id:number}[];
        expect(rows.map((row) => row.id)).toEqual(scope.expected);
      }
    } finally {
      db.close();
    }
  });

  it('does not widen a restricted domain without a sector-link table', () => {
    const conditions: string[] = [];
    const bindings: unknown[] = [];
    appendQualificationTypeCatalogReadScope(conditions, bindings,
      { restricted: true, domains: ['MANUTENCAO'], setorIds: [11] },
      'qc.dominio_codigo', false);
    expect(conditions).toEqual(["((qc.dominio_codigo IN (?)) OR (0 = 1))"]);
    expect(bindings).toEqual(['MANUTENCAO']);
  });
});
