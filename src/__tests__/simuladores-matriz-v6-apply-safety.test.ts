import { describe, expect, it } from 'vitest';

import {
  CONFIRM_TEXT,
  buildApplySql,
} from '../../scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs';
import { loadSimuladoresMatrizV6Data } from '../../scripts/maintenance/lib/simuladores-matriz-v6-data.mjs';

const ALLOWED_DML_TABLES = ['modelos_sessao', 'manobras', 'modelos_sessao_manobras'];
const FORBIDDEN_TABLES = [
  'fichas_sessao',
  'fichas_sessao_manobras',
  'simulador_agendamentos',
  'avaliacoes_manobras',
  'fichas_manobras_historico',
];

describe('simuladores matriz v6.2 apply safety', () => {
  it('gera SQL com soft-delete, sem hard delete e sem tocar tabelas historicas', () => {
    const data = loadSimuladoresMatrizV6Data();
    const sql = buildApplySql(data, 6);
    const dmlTables = [...sql.matchAll(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+([a-z_]+)/g)].map((match) => match[1]);

    expect(CONFIRM_TEXT).toBe(
      'APLICAR MATRIZ V6.2 TRE-INST CRED-EXA E NOMES SEM ALTERAR FICHAS EXISTENTES',
    );
    expect(sql).toContain('UPDATE modelos_sessao');
    expect(sql).toContain('SET nome =');
    expect(sql).toContain("UPDATE modelos_sessao_manobras\nSET deleted_at = datetime('now')");
    expect(sql).not.toContain('DELETE FROM modelos_sessao_manobras');
    expect(sql).not.toContain('DELETE FROM modelos_sessao');
    expect(sql).not.toContain('DELETE FROM manobras');

    expect(new Set(dmlTables)).toEqual(new Set(ALLOWED_DML_TABLES));

    for (const tableName of FORBIDDEN_TABLES) {
      expect(sql).not.toContain(tableName);
    }
  });
});
