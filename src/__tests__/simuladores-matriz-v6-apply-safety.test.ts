import { describe, expect, it } from 'vitest';

import {
  CONFIRM_TEXT,
  buildApplySql,
} from '../../scripts/maintenance/apply-simuladores-matriz-v6-costa-do-sol.mjs';
import { loadSimuladoresMatrizV6Data } from '../../scripts/maintenance/lib/simuladores-matriz-v6-data.mjs';

describe('simuladores matriz v6.2 apply safety', () => {
  it('gera SQL com soft-delete e atualizacao de nome dos modelos-alvo', () => {
    const data = loadSimuladoresMatrizV6Data();
    const sql = buildApplySql(data, 6);

    expect(CONFIRM_TEXT).toBe(
      'APLICAR MATRIZ V6.2 TRE-INST CRED-EXA E NOMES SEM ALTERAR FICHAS EXISTENTES',
    );
    expect(sql).toContain('UPDATE modelos_sessao');
    expect(sql).toContain('SET nome =');
    expect(sql).toContain("UPDATE modelos_sessao_manobras\nSET deleted_at = datetime('now')");
    expect(sql).not.toContain('DELETE FROM modelos_sessao_manobras');
    expect(sql).not.toContain('DELETE FROM modelos_sessao');
    expect(sql).not.toContain('DELETE FROM manobras');
  });
});
