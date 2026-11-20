import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/routes/compliance-treinamentos-conditions.ts'), 'utf8');

describe('Compliance designation catalog safety', () => {
  it('allows administrators to explicitly clear optional metadata without restoring old values', () => {
    expect(source).toContain("Object.prototype.hasOwnProperty.call(body, 'descricao')");
    expect(source).toContain("Object.prototype.hasOwnProperty.call(body, 'referencia_normativa')");
    // The frontend sends null to clear both fields and the server converts it to SQL NULL.
    expect(source).toContain("(body.descricao ?? '')");
    expect(source).toContain("(body.referencia_normativa ?? '')");
  });

  it('prevents a soft delete when an assignment is inserted after the preliminary usage read', () => {
    const sqlMatch = source.match(/const deletion = await db\.prepare\(\s*`(UPDATE compliance_condicoes[\s\S]*?)`\s*,?\s*\)/);
    expect(sqlMatch).not.toBeNull();
    const sql = sqlMatch![1];
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`
        CREATE TABLE compliance_condicoes (id INTEGER PRIMARY KEY, empresa_id INTEGER, ativo INTEGER, deleted_at TEXT, updated_at TEXT);
        CREATE TABLE treinamento_requisitos (id INTEGER PRIMARY KEY, empresa_id INTEGER, condicao_id INTEGER, ativo INTEGER, deleted_at TEXT);
        CREATE TABLE funcionarios_compliance_condicoes (id INTEGER PRIMARY KEY, empresa_id INTEGER, condicao_id INTEGER, ativo INTEGER, deleted_at TEXT);
        INSERT INTO compliance_condicoes VALUES (10,6,1,NULL,NULL);
      `);
      // An initial read would report no references. A second request inserts one.
      expect(db.prepare('SELECT COUNT(*) n FROM funcionarios_compliance_condicoes WHERE condicao_id=10').get()).toMatchObject({ n: 0 });
      db.exec('INSERT INTO funcionarios_compliance_condicoes VALUES (30,6,10,1,NULL)');
      expect(db.prepare(sql).run(10, 6).changes).toBe(0);
      expect(db.prepare('SELECT ativo FROM compliance_condicoes WHERE id=10').get()).toMatchObject({ ativo: 1 });
      db.exec('DELETE FROM funcionarios_compliance_condicoes WHERE id=30');
      db.exec('INSERT INTO treinamento_requisitos VALUES (40,6,10,1,NULL)');
      expect(db.prepare(sql).run(10, 6).changes).toBe(0);
      db.exec('DELETE FROM treinamento_requisitos WHERE id=40');
      expect(db.prepare(sql).run(10, 6).changes).toBe(1);
      expect(db.prepare('SELECT ativo FROM compliance_condicoes WHERE id=10').get()).toMatchObject({ ativo: 0 });
    } finally {
      db.close();
    }
  });
});
