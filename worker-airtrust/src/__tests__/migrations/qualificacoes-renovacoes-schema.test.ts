import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('qualificacoes_renovacoes schema contract', () => {
  const migration = readFileSync(
    resolve(process.cwd(), 'migrations/0487_qualificacoes_renovacoes.sql'),
    'utf8',
  );
  const route = readFileSync(resolve(process.cwd(), 'src/routes/qualificacoes/atribuicao.ts'), 'utf8');

  it('creates the table used by active renewal routes', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS qualificacoes_renovacoes');
    for (const column of [
      'qualificacao_historico_id',
      'data_renovacao_solicitada',
      'status',
      'observacoes',
      'created_at',
      'updated_at',
      'deleted_at',
    ]) {
      expect(migration).toContain(column);
    }
    expect(route).toContain('INSERT INTO qualificacoes_renovacoes');
    expect(route).toContain('FROM qualificacoes_renovacoes qr');
  });

  it('constrains lifecycle status and indexes active lookups', () => {
    expect(migration).toContain("CHECK (status IN ('pendente', 'aprovada', 'rejeitada'))");
    expect(migration).toContain('idx_qualificacoes_renovacoes_historico');
    expect(migration).toContain('idx_qualificacoes_renovacoes_status_data');
    expect(migration).toContain('WHERE deleted_at IS NULL');
  });
});
