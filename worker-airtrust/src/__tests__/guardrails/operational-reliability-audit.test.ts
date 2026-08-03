import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../../..');
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8');

describe('operational reliability audit ratchets', () => {
  it('keeps employee imports tenant-scoped in every destructive path', () => {
    const source = read('worker-airtrust/src/services/importacao/FuncionarioImportacao.ts');

    expect(source).toContain('WHERE empresa_id = ? AND deleted_at IS NULL');
    expect(source).toContain('WHERE cpf = ? AND empresa_id = ? LIMIT 1');
    expect(source).toContain('WHERE id = ? AND empresa_id = ?');
    expect(source).not.toContain(
      "UPDATE funcionarios SET deleted_at = datetime('now') WHERE deleted_at IS NULL",
    );
    expect(source).not.toContain(
      "UPDATE funcionarios SET ${updateFields.join(', ')} WHERE cpf = ?",
    );
  });

  it('persists and confirms FRMS journey date and crew edits', () => {
    const source = read('worker-airtrust/src/lib/frms/db-service-jornadas-safe.ts');
    const barrel = read('worker-airtrust/src/lib/frms/db-service.ts');

    expect(source).toContain('tripulante_id = ?, data = ?, status = ?');
    expect(source).toContain('Jornada atualizada não pôde ser confirmada');
    expect(source).toContain('const persisted = await db');
    expect(source).not.toContain(
      'JOIN funcionarios f ON f.id = fj.tripulante_id AND f.deleted_at IS NULL',
    );
    expect(barrel).toContain('atualizarJornadaConfiavel as atualizarJornada');
    expect(barrel).toContain('deletarJornadaConfiavel as deletarJornada');
  });

  it('does not expose decorative employee quick actions', () => {
    const source = read('src/react-app/pages/funcionarios/AbaAcoesRapidas.tsx');

    expect(source).toContain('fetchWithAuth');
    expect(source).toContain("method: 'DELETE'");
    expect(source).toContain("abrirAba('documentos')");
    expect(source).toContain("abrirAba('treinamentos')");
    expect(source).not.toContain("toast.warning('Desativado')");
    expect(source).not.toContain("toast.warning('Abrir modal de edição')");
  });

  it('keeps employee mutations tenant-scoped and reports certification drift', () => {
    const source = read('worker-airtrust/src/routes/funcionarios-mutations.ts');

    expect(source).toContain('cpf = ? AND empresa_id = ?');
    expect(source).toContain("addInsertValue('is_examinador'");
    expect(source).toContain("addUpdate('is_examinador'");
    expect(source).toContain("app.post('/:id/reativar'");
    expect(source).toContain('certificacoes_sincronizadas');
    expect(source).toContain('syncStatus.sincronizadas ? 200 : 207');
  });
  it('atomically compensates failed simulator-session creation', () => {
    const route = read('worker-airtrust/src/routes/simuladores-sessoes.ts');
    const cleanup = read('worker-airtrust/src/routes/simuladores-shared-session-cancellation.ts');

    expect(route).toContain('let createdSessaoId: number | null = null');
    expect(route).toContain('await cleanupFailedSharedCreate(c.env.DB, createdSessaoId)');
    expect(route).toContain('createdSessaoId = null');
    expect(route).not.toContain('return c.json({ success: false, error: msg }, 500)');
    expect(cleanup).toContain('await db.batch([');
    expect(cleanup).toContain('DELETE FROM sessoes_checks WHERE sessao_id = ?');
    expect(cleanup).toContain("WHERE origem = 'simuladores'");
    expect(cleanup).toContain('DELETE FROM simulador_agendamentos WHERE id = ?');
  });
});
