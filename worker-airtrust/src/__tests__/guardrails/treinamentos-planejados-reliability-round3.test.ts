import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('treinamentos planejados reliability round 3 guards', () => {
  it('propagates scale synchronization failures and reports backfill partial failure', () => {
    const integration = read('src/services/treinamentos-planejados-integration.ts');
    const route = read('src/routes/treinamentos-planejados.ts');
    expect(integration).not.toContain('Escala sync is non-critical');
    expect(integration).not.toMatch(/syncTreinamentoToEscalaEventos\([\s\S]*?\.catch\(/);
    expect(route).toContain('BACKFILL_PARTIAL_FAILURE');
  });

  it('commits PATCH child writes in one D1 batch without unbounded NOT IN binds', () => {
    const route = read('src/routes/treinamentos-planejados.ts');
    expect(route).toContain('const statements: D1PreparedStatement[] = []');
    expect(route).toContain('await db.batch(statements)');
    expect(route).toContain('INSERT OR IGNORE INTO treinamentos_participantes');
    expect(route).toContain('participanteRowIdsToDelete');
    expect(route).toContain('prepareByBindChunks(participanteRowIdsToDelete');
    expect(route).not.toMatch(/funcionario_id NOT IN \(\$\{placeholders\}\)/);
  });

  it('uses tenant timezone and exposes both partial-source diagnostics surfaces to the UI', () => {
    const route = read('src/routes/treinamentos-planejados.ts');
    const hook = read('../src/react-app/hooks/useTreinamentosPlanejados.ts');
    const page = read('../src/react-app/pages/TreinamentosPlanejadosPage.tsx');
    expect(route).toContain('getTodayYmdForTenant');
    expect(route).toContain('SELECT timezone FROM empresas_config WHERE empresa_id = ?');
    expect(route).toContain('diagnostics: Object.values(diagnostics)');
    expect(hook).toContain('TreinamentosPlanejadosDiagnostics');
    expect(hook).toMatch(/TreinamentosPlanejadosCalendarioResponse[\s\S]*diagnostics\?:/);
    expect(page).toContain('treinamentosQuery.data?.diagnostics');
    expect(page).toContain('calendarioQuery.data?.diagnostics');
    expect(page).toContain('role="alert"');
    expect(page).toContain('A lista está incompleta');
  });
});
