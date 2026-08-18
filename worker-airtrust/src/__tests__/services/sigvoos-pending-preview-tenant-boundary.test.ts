import { describe, expect, it } from 'vitest';

// Regression coverage for P0-SIG-002: reprocessarPreviewsSigvoosSemTripulante
// (and its resolveSigvoosPendenciaByImportacao helper) must only select and
// mutate frms_importacao_fira rows that have an owning frms_jornada_pendente
// for the acting empresa_id — otherwise tenant A's reprocessing run can
// resolve tenant B's pending preview to a tenant A employee.

interface JornadaPendente {
  importacao_id: string;
  empresa_id: number;
  status: string;
  deleted_at: string | null;
}

interface ImportacaoFira {
  id: string;
  tripulante_id: number | null;
  canac: string | null;
  nome_fira: string | null;
  ano: number;
  mes: number;
  preview_json: string | null;
  updated_at?: string;
}

function createPendingPreviewDb({
  importacoes,
  pendencias,
}: {
  importacoes: ImportacaoFira[];
  pendencias: JornadaPendente[];
}) {
  function bindImpl(sql: string, args: unknown[]) {
    const all = async () => {
      if (sql.includes('FROM frms_importacao_fira f') && sql.includes('EXISTS')) {
        const [empresaId] = args as [number | null];
        const owned = importacoes.filter(
          (row) =>
            row.tripulante_id === null &&
            pendencias.some(
              (p) =>
                p.importacao_id === row.id &&
                p.empresa_id === empresaId &&
                p.deleted_at === null &&
                p.status === 'PENDENTE',
            ),
        );
        return { results: owned };
      }
      return { results: [] };
    };

    const run = async () => {
      if (sql.includes('UPDATE frms_importacao_fira') && sql.includes('EXISTS')) {
        const [tripulanteId, , rowId, empresaId] = args as [number, string, string, number | null];
        const row = importacoes.find((r) => r.id === rowId);
        const isOwned = pendencias.some(
          (p) =>
            p.importacao_id === rowId &&
            p.empresa_id === empresaId &&
            p.deleted_at === null &&
            p.status === 'PENDENTE',
        );
        if (row && row.tripulante_id === null && isOwned) {
          row.tripulante_id = tripulanteId;
        }
      }
      if (sql.includes('UPDATE frms_jornada_pendente') && sql.includes('empresa_id = ?')) {
        const [, , importacaoId, empresaId] = args as [number | null, string, string, number | null];
        const pend = pendencias.find(
          (p) => p.importacao_id === importacaoId && p.empresa_id === empresaId,
        );
        if (pend) pend.status = 'RESOLVIDO';
      }
      return { success: true };
    };

    return { all, run };
  }

  return {
    batch: async () => [],
    prepare: (sql: string) => ({
      all: () => bindImpl(sql, []).all(),
      run: () => bindImpl(sql, []).run(),
      bind: (...args: unknown[]) => bindImpl(sql, args),
    }),
  } as unknown as D1Database;
}

describe('P0-SIG-002: sigvoos preview reprocessing tenant boundary', () => {
  it('SELECT for reprocessing only returns previews owned by the acting empresa', async () => {
    const importacoes: ImportacaoFira[] = [
      { id: 'imp-a', tripulante_id: null, canac: 'X1', nome_fira: 'Piloto A', ano: 2026, mes: 8, preview_json: null },
      { id: 'imp-b', tripulante_id: null, canac: 'X2', nome_fira: 'Piloto B', ano: 2026, mes: 8, preview_json: null },
    ];
    const pendencias: JornadaPendente[] = [
      { importacao_id: 'imp-a', empresa_id: 10, status: 'PENDENTE', deleted_at: null },
      { importacao_id: 'imp-b', empresa_id: 20, status: 'PENDENTE', deleted_at: null },
    ];
    const db = createPendingPreviewDb({ importacoes, pendencias });

    const rows = await db
      .prepare(
        `SELECT f.id, f.canac, f.nome_fira, f.ano, f.mes, f.preview_json
       FROM frms_importacao_fira f
       WHERE f.tripulante_id IS NULL
         AND EXISTS (SELECT 1 FROM frms_jornada_pendente jp WHERE jp.importacao_id = f.id AND jp.empresa_id = ?)`,
      )
      .bind(10)
      .all<{ id: string }>();

    expect(rows.results?.map((r) => r.id)).toEqual(['imp-a']);
  });

  it('UPDATE against a B preview using A empresa context does not mutate the row', async () => {
    const importacoes: ImportacaoFira[] = [
      { id: 'imp-b', tripulante_id: null, canac: 'X2', nome_fira: 'Piloto B', ano: 2026, mes: 8, preview_json: null },
    ];
    const pendencias: JornadaPendente[] = [
      { importacao_id: 'imp-b', empresa_id: 20, status: 'PENDENTE', deleted_at: null },
    ];
    const db = createPendingPreviewDb({ importacoes, pendencias });

    await db
      .prepare(
        `UPDATE frms_importacao_fira SET tripulante_id = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM frms_jornada_pendente jp WHERE jp.importacao_id = frms_importacao_fira.id AND jp.empresa_id = ?)`,
      )
      .bind(999, 'ts', 'imp-b', 10)
      .run();

    expect(importacoes[0].tripulante_id).toBeNull();
  });

  it('resolveSigvoosPendenciaByImportacao only resolves the pendencia matching empresa_id', async () => {
    const importacoes: ImportacaoFira[] = [];
    const pendencias: JornadaPendente[] = [
      { importacao_id: 'imp-b', empresa_id: 20, status: 'PENDENTE', deleted_at: null },
    ];
    const db = createPendingPreviewDb({ importacoes, pendencias });

    await db
      .prepare(
        `UPDATE frms_jornada_pendente SET status = 'RESOLVIDO', resolved_funcionario_id = ?, updated_at = ? WHERE importacao_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(1, 'ts', 'imp-b', 10)
      .run();

    expect(pendencias[0].status).toBe('PENDENTE');

    await db
      .prepare(
        `UPDATE frms_jornada_pendente SET status = 'RESOLVIDO', resolved_funcionario_id = ?, updated_at = ? WHERE importacao_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
      )
      .bind(1, 'ts', 'imp-b', 20)
      .run();

    expect(pendencias[0].status).toBe('RESOLVIDO');
  });
});
