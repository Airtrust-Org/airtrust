import { describe, expect, it } from 'vitest';
import {
  findTripulanteByCanacOrName,
  reprocessarPreviewsSigvoosSemTripulante,
} from '../../services/sigvoos-frms';

// Regression coverage for P1-SIG-003: a NOME_FUZZY match (name-similarity
// only, no CANAC/matricula/manual mapping backing it) must never
// auto-confirm into an official FRMS import. It must stay pending until a
// human creates a manual mapping.

function createReprocessingDbStub({
  funcionarios,
  importacoes,
}: {
  funcionarios: Array<{ id: string; nome: string; funcao?: string; cargo?: string }>;
  importacoes: Array<{
    id: string;
    canac: string | null;
    nome_fira: string;
    ano: number;
    mes: number;
    preview_json: string | null;
  }>;
}) {
  let updateFrmsImportacaoFiraCalled = false;
  let resolvePendenciaCalled = false;

  const bind = (sql: string, args: unknown[]) => {
    const all = async () => {
      if (sql.includes("PRAGMA table_info('funcionarios')")) {
        return { results: [{ name: 'id' }, { name: 'nome' }, { name: 'funcao' }, { name: 'cargo' }] };
      }
      if (sql.includes('FROM frms_configuracao_limites')) {
        return { results: [] };
      }
      if (sql.includes('FROM frms_importacao_fira') && sql.includes('EXISTS')) {
        return { results: importacoes };
      }
      if (sql.includes('FROM funcionarios')) {
        return { results: funcionarios.map((f) => ({ ...f, codigo_anac: null, matricula: null })) };
      }
      return { results: [] };
    };
    const run = async () => {
      if (sql.includes('UPDATE frms_importacao_fira')) {
        updateFrmsImportacaoFiraCalled = true;
      }
      if (sql.includes('UPDATE frms_jornada_pendente')) {
        resolvePendenciaCalled = true;
      }
      return { success: true };
    };
    const first = async () => {
      if (sql.includes('SELECT COUNT(*) AS total') && sql.includes('integracoes_sigvoos_config')) {
        return { total: 0 };
      }
      return null;
    };
    return { all, run, first };
  };

  const db = {
    batch: async () => [],
    prepare: (sql: string) => ({
      all: () => bind(sql, []).all(),
      run: () => bind(sql, []).run(),
      first: () => bind(sql, []).first(),
      bind: (...args: unknown[]) => bind(sql, args),
    }),
  } as unknown as D1Database;

  return {
    db,
    wasUpdateCalled: () => updateFrmsImportacaoFiraCalled,
    wasPendenciaResolved: () => resolvePendenciaCalled,
  };
}

describe('P1-SIG-003: NOME_FUZZY requires manual review before FRMS confirmation', () => {
  it('findTripulanteByCanacOrName still reports NOME_FUZZY as elegivelFrms=true (matching, not gating, stays here)', async () => {
    const { db } = createReprocessingDbStub({
      funcionarios: [{ id: '77', nome: 'Jether Pontes e Silva', funcao: 'PILOTO', cargo: 'COMANDANTE' }],
      importacoes: [],
    });

    const matched = await findTripulanteByCanacOrName(db, 1, {
      canac: null,
      identificadorSigvoos: null,
      name: 'JETHER PONTES E SILVA JR.',
    });

    expect(matched).toMatchObject({ fonteResolucao: 'NOME_FUZZY', elegivelFrms: true });
  });

  it('reprocessing does NOT confirm a NOME_FUZZY-only match into FRMS', async () => {
    const { db, wasUpdateCalled, wasPendenciaResolved } = createReprocessingDbStub({
      funcionarios: [{ id: '77', nome: 'Jether Pontes e Silva', funcao: 'PILOTO', cargo: 'COMANDANTE' }],
      importacoes: [
        {
          id: 'imp-1',
          canac: null,
          nome_fira: 'JETHER PONTES E SILVA JR.',
          ano: 2026,
          mes: 8,
          preview_json: JSON.stringify({ linhas: [] }),
        },
      ],
    });

    const result = await reprocessarPreviewsSigvoosSemTripulante(db, 1, 'importador-teste');

    expect(result.totalResolvidos).toBe(0);
    expect(result.detalhes[0]).toMatchObject({ importacao_id: 'imp-1', resolved: false });
    expect(result.detalhes[0].error).toMatch(/Identidade por nome/);
    expect(wasUpdateCalled()).toBe(false);
    expect(wasPendenciaResolved()).toBe(false);
  });
});
