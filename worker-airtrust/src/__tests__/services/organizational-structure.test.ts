import { describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import {
  isCanonicalSectorFunctionPair,
  resolveCanonicalFunction,
  resolveCanonicalSector,
  tenantHasCanonicalSectorFunctionMap,
} from '../../services/organizational-structure';

describe('organizational structure canonical resolution', () => {
  it('resolves legacy aliases and validates canonical sector/function pairs by tenant', async () => {
    const sqlite = new SqliteD1Database();
    sqlite.database.exec(`
      ALTER TABLE setores ADD COLUMN nome TEXT;
      ALTER TABLE setores ADD COLUMN codigo TEXT;
      CREATE TABLE setores_aliases (
        id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, alias TEXT NOT NULL,
        setor_id INTEGER NOT NULL, ativo INTEGER DEFAULT 1, deleted_at TEXT
      );
      CREATE TABLE funcoes (
        id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, codigo TEXT NOT NULL,
        nome TEXT NOT NULL, ativo INTEGER DEFAULT 1, deleted_at TEXT
      );
      CREATE TABLE funcoes_aliases (
        id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, alias TEXT NOT NULL,
        funcao_id INTEGER NOT NULL, ativo INTEGER DEFAULT 1, deleted_at TEXT
      );
      CREATE TABLE setores_funcoes (
        id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, setor_id INTEGER NOT NULL,
        funcao_id INTEGER NOT NULL, ativo INTEGER DEFAULT 1, deleted_at TEXT
      );
      UPDATE setores SET nome='Manutenção' WHERE id=10 AND empresa_id=1;
      UPDATE setores SET nome='Operações' WHERE id=11 AND empresa_id=1;
      INSERT INTO funcoes VALUES (1,1,'MEC','Mecânico',1,NULL),(2,1,'SIC','Copiloto',1,NULL),(20,2,'MEC','Mecânico T2',1,NULL);
      INSERT INTO setores_aliases VALUES (1,1,'CTM',10,1,NULL);
      INSERT INTO funcoes_aliases VALUES (1,1,'1º Oficial',2,1,NULL);
      INSERT INTO setores_funcoes VALUES (1,1,10,1,1,NULL),(2,1,11,2,1,NULL);
    `);
    const db = sqlite.asD1();

    await expect(resolveCanonicalSector(db, 1, { setorText: 'CTM' })).resolves.toEqual({
      id: 10,
      nome: 'Manutenção',
    });
    await expect(
      resolveCanonicalFunction(db, 1, { funcaoText: 'Comandante', cargoText: '1º Oficial' }),
    ).resolves.toEqual({ id: 2, nome: 'Copiloto' });
    await expect(tenantHasCanonicalSectorFunctionMap(db, 1)).resolves.toBe(true);
    await expect(isCanonicalSectorFunctionPair(db, 1, 10, 1)).resolves.toBe(true);
    await expect(isCanonicalSectorFunctionPair(db, 1, 10, 2)).resolves.toBe(false);
    await expect(resolveCanonicalFunction(db, 1, { funcaoId: 20 })).resolves.toBeNull();
  });
});
