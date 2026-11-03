import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  buscarImportacaoFiraById,
  deletarImportacaoFira,
  vincularTripulanteFira,
} from '../../lib/frms/fira-service';

describe('FIRA record operations cannot use importer identity to bypass crew tenant', () => {
  it('denies foreign detail, deletion and relink; permits matching and unlinked tenant preview', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const sqlite = new DatabaseSync(':memory:');
    try {
      sqlite.exec('CREATE TABLE funcionarios (id INTEGER PRIMARY KEY, empresa_id INTEGER, nome TEXT, deleted_at TEXT)');
      sqlite.exec('CREATE TABLE frms_importacao_fira (id TEXT PRIMARY KEY, tripulante_id TEXT, importado_por TEXT, preview_json TEXT, status TEXT, total_dias_importados INTEGER, deleted_at TEXT, updated_at TEXT)');
      sqlite.exec("INSERT INTO funcionarios (id, empresa_id, nome) VALUES (70,7,'CREW-7'),(80,8,'CREW-8'),(90,7,'IMPORTER-7')");
      sqlite.exec("INSERT INTO frms_importacao_fira VALUES ('foreign','80','90','{\"empresa_id\":7}','REVISAO',0,NULL,NULL),('mismatch','70','90','{\"empresa_id\":8}','REVISAO',0,NULL,NULL),('own','70','90','{\"empresa_id\":7}','REVISAO',0,NULL,NULL),('unlinked',NULL,'90','{\"empresa_id\":7}','REVISAO',0,NULL,NULL)");
      const db = {
        prepare(sql: string) {
          return {
            bind(...args: unknown[]) {
              const valid = args as (string | number | null)[];
              return {
                async first() { return sqlite.prepare(sql).get(...valid) ?? null; },
                async all() { return { results: sqlite.prepare(sql).all(...valid) }; },
                async run() {
                  const result = sqlite.prepare(sql).run(...valid);
                  return { meta: { changes: result.changes } };
                },
              };
            },
          };
        },
      } as unknown as D1Database;

      expect(await buscarImportacaoFiraById(db, 'foreign', 7)).toBeNull();
      expect(await buscarImportacaoFiraById(db, 'mismatch', 7)).toBeNull();
      await expect(deletarImportacaoFira(db, 'foreign', '90', 7))
        .rejects.toThrow('Importação não encontrada');
      await expect(vincularTripulanteFira(db, 'foreign', '70', 7))
        .rejects.toThrow('Importação não encontrada');
      expect(sqlite.prepare('SELECT deleted_at, tripulante_id FROM frms_importacao_fira WHERE id = ?').get('foreign'))
        .toMatchObject({ deleted_at: null, tripulante_id: '80' });
      expect(await buscarImportacaoFiraById(db, 'own', 7)).toMatchObject({ id: 'own' });
      expect(await buscarImportacaoFiraById(db, 'unlinked', 7)).toMatchObject({ id: 'unlinked' });
      await vincularTripulanteFira(db, 'unlinked', '70', 7);
      expect(await buscarImportacaoFiraById(db, 'unlinked', 7))
        .toMatchObject({ id: 'unlinked', tripulante_id: '70' });
      expect(await buscarImportacaoFiraById(db, 'own', 8)).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
