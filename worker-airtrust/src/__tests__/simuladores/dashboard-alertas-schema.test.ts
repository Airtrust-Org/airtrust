import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workerRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const routeSource = readFileSync(
  join(workerRoot, 'src', 'routes', 'simuladores-fichas-extras.ts'),
  'utf8',
);
const alertMigration = readFileSync(
  join(workerRoot, 'migrations', '0146_historico_notas_manobras.sql'),
  'utf8',
);

describe('simulator performance reinforcement-alert schema contract', () => {
  it('keeps the historical alert table contract explicit', () => {
    const createTable = alertMigration.match(
      /CREATE TABLE IF NOT EXISTS alertas_reforco\s*\(([\s\S]*?)\);/i,
    );

    expect(createTable).not.toBeNull();
    expect(createTable?.[1]).not.toMatch(/\bempresa_id\b/i);
    expect(createTable?.[1]).toMatch(/\bfuncionario_id\b/i);
    expect(createTable?.[1]).toMatch(/\bobservacoes_resolucao\b/i);
  });

  it('does not query or insert the nonexistent alert empresa_id column', () => {
    expect(routeSource).not.toContain('AND ar.empresa_id = ?');
    expect(routeSource).not.toMatch(/status\s*,\s*empresa_id/);
    expect(routeSource).not.toMatch(/alertas_reforco[\s\S]{0,180}empresa_id\s*\)/i);
  });

  it('scopes active alerts through the canonical employee tenant', () => {
    expect(routeSource).toContain('INNER JOIN funcionarios f');
    expect(routeSource).toContain('ON ar.funcionario_id = f.id');
    expect(routeSource).toContain('AND f.empresa_id = ?');
    expect(routeSource).toContain('AND f.deleted_at IS NULL');
  });

  it('keeps the dashboard response aliases aligned with the frontend contract', () => {
    expect(routeSource).toContain('COUNT(*) as total_tentativas');
    expect(routeSource).toContain('MAX(fs.data_sessao) as ultima_sessao');
    expect(routeSource).toContain('COUNT(DISTINCT fsm.codigo) as total_manobras_unicas');
    expect(routeSource).toContain('MAX(fs.tipo_sessao) as tipo_sessao');
    expect(routeSource).toContain('MAX(fs.tipo_aeronave) as tipo_aeronave');
  });

  it('provides a tenant-scoped resolver for the dashboard action', () => {
    expect(routeSource).toContain("app.put('/alertas/:alertaId/resolver'");
    expect(routeSource).toContain("SET status = 'RESOLVIDO'");
    expect(routeSource).toContain("data_resolucao = datetime('now')");
    expect(routeSource).toContain('observacoes_resolucao = ?');
  });
});
