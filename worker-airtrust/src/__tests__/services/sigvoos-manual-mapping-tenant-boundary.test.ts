import { describe, expect, it } from 'vitest';
import { upsertSigvoosManualMapping, listSigvoosManualMappings } from '../../services/sigvoos-frms';

// Regression coverage for P0-SIG-001: upsertSigvoosManualMapping must prove
// funcionarios.id belongs to empresa_id before writing sigvoos_mapeamento_manual /
// integracoes_sigvoos_mapeamentos, and loadSigvoosManualMappings must never
// surface a mapping whose funcionario belongs to a different empresa.

interface StubFuncionario {
  id: number;
  empresa_id: number;
  nome: string;
  matricula?: string | null;
  deleted_at?: string | null;
}

interface StubMapping {
  id: string;
  empresa_id: number | null;
  nome_sigvoos: string;
  canac_sigvoos: string | null;
  inscricao_sigvoos?: string | null;
  funcionario_id: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

function createTenantAwareSigvoosDb({
  funcionarios,
  mappings = [],
}: {
  funcionarios: StubFuncionario[];
  mappings?: StubMapping[];
}) {
  const legacyMappings: StubMapping[] = [];

  function bindImpl(sql: string, args: unknown[]) {
    const all = async () => {
      if (sql.includes("PRAGMA table_info('funcionarios')")) {
        return { results: [{ name: 'id' }, { name: 'empresa_id' }, { name: 'nome' }, { name: 'matricula' }] };
      }
      if (sql.includes('FROM sigvoos_mapeamento_manual m') && sql.includes('UNION ALL')) {
        const [empresaA, empresaB, empresaC, empresaD] = args as (number | null)[];
        const joinScoped = (rows: StubMapping[], empresaBind: number | null) =>
          rows
            .filter((m) => m.deleted_at === null)
            .filter((m) => {
              const f = funcionarios.find((fx) => fx.id === m.funcionario_id);
              if (!f || f.deleted_at) return false;
              // defense-in-depth JOIN: m.empresa_id IS NULL OR f.empresa_id = m.empresa_id
              if (m.empresa_id !== null && f.empresa_id !== m.empresa_id) return false;
              return m.empresa_id === empresaBind || (m.empresa_id === null && empresaBind === null);
            })
            .map((m) => {
              const f = funcionarios.find((fx) => fx.id === m.funcionario_id)!;
              return {
                id: m.id,
                nome_sigvoos: m.nome_sigvoos,
                canac_sigvoos: m.canac_sigvoos,
                funcionario_id: String(m.funcionario_id),
                funcionario_nome: f.nome,
                funcionario_matricula: f.matricula ?? null,
                created_at: m.created_at,
                updated_at: m.updated_at,
              };
            });
        const primary = joinScoped(mappings, empresaA as number | null);
        const legacy = joinScoped(legacyMappings, empresaC as number | null).filter(
          (row) =>
            !primary.some(
              (p) => p.funcionario_id === row.funcionario_id && p.nome_sigvoos === row.nome_sigvoos,
            ),
        );
        void empresaB;
        void empresaD;
        return { results: [...primary, ...legacy] };
      }
      return { results: [] };
    };

    const first = async () => {
      if (sql.includes('SELECT COUNT(*) AS total') && sql.includes('integracoes_sigvoos_config')) {
        return { total: 1 };
      }
      if (
        sql.includes('SELECT id') &&
        sql.includes('FROM funcionarios') &&
        sql.includes('empresa_id = ?')
      ) {
        const [funcionarioId, empresaId] = args as [number, number | null];
        const match = funcionarios.find(
          (f) => f.id === funcionarioId && f.empresa_id === empresaId && !f.deleted_at,
        );
        return match ? { id: match.id } : null;
      }
      return null;
    };

    const run = async () => {
      if (sql.includes('INSERT INTO sigvoos_mapeamento_manual')) {
        const [id, empresaId, nomeSigvoos, inscricao, canac, funcionarioId] = args as [
          string,
          number | null,
          string,
          string | null,
          string | null,
          number,
        ];
        mappings.push({
          id,
          empresa_id: empresaId,
          nome_sigvoos: nomeSigvoos,
          canac_sigvoos: canac,
          inscricao_sigvoos: inscricao,
          funcionario_id: funcionarioId,
          created_at: 'now',
          updated_at: 'now',
          deleted_at: null,
        });
      }
      if (sql.includes('INSERT INTO integracoes_sigvoos_mapeamentos')) {
        const [id, empresaId, nomeSigvoos, canac, funcionarioId] = args as [
          string,
          number | null,
          string,
          string | null,
          number,
        ];
        legacyMappings.push({
          id,
          empresa_id: empresaId,
          nome_sigvoos: nomeSigvoos,
          canac_sigvoos: canac,
          funcionario_id: funcionarioId,
          created_at: 'now',
          updated_at: 'now',
          deleted_at: null,
        });
      }
      return { success: true };
    };

    return { all, first, run };
  }

  return {
    batch: async () => [],
    prepare: (sql: string) => ({
      all: () => bindImpl(sql, []).all(),
      first: () => bindImpl(sql, []).first(),
      run: () => bindImpl(sql, []).run(),
      bind: (...args: unknown[]) => bindImpl(sql, args),
    }),
  } as unknown as D1Database;
}

describe('P0-SIG-001: sigvoos manual mapping tenant boundary', () => {
  it('A_ADMIN mapping A_F1 (own tenant employee) succeeds', async () => {
    const db = createTenantAwareSigvoosDb({
      funcionarios: [{ id: 1, empresa_id: 10, nome: 'Piloto A' }],
    });

    const mapping = await upsertSigvoosManualMapping(db, 10, {
      nomeSigvoos: 'PILOTO A',
      canacSigvoos: 'CANAC1',
      funcionarioId: 1,
    });

    expect(mapping?.funcionario_id).toBe('1');
  });

  it('A_ADMIN mapping B_F1 (other tenant employee) fails before write', async () => {
    const db = createTenantAwareSigvoosDb({
      funcionarios: [{ id: 2, empresa_id: 20, nome: 'Piloto B' }],
    });

    await expect(
      upsertSigvoosManualMapping(db, 10, {
        nomeSigvoos: 'PILOTO B',
        canacSigvoos: 'CANAC2',
        funcionarioId: 2,
      }),
    ).rejects.toThrow('SIGVOOS_MAPPING_TARGET_OUT_OF_SCOPE');

    const mappingsForA = await listSigvoosManualMappings(db, 10);
    expect(mappingsForA).toHaveLength(0);
  });

  it('A_MANAGER (same tenant context) mapping B_F1 also fails', async () => {
    const db = createTenantAwareSigvoosDb({
      funcionarios: [{ id: 3, empresa_id: 30, nome: 'Piloto B2' }],
    });

    await expect(
      upsertSigvoosManualMapping(db, 10, {
        nomeSigvoos: 'PILOTO B2',
        canacSigvoos: 'CANAC3',
        funcionarioId: 3,
      }),
    ).rejects.toThrow('SIGVOOS_MAPPING_TARGET_OUT_OF_SCOPE');
  });

  it('GET mappings for A never returns a mapping pointing at a B employee (defense-in-depth JOIN)', async () => {
    // Simulates a corrupt pre-existing row: mapping tagged empresa_id=10 but
    // funcionario_id actually belongs to empresa 20 (e.g. written before this fix).
    const db = createTenantAwareSigvoosDb({
      funcionarios: [{ id: 4, empresa_id: 20, nome: 'Piloto Corrupto' }],
      mappings: [
        {
          id: 'm-corrupt',
          empresa_id: 10,
          nome_sigvoos: 'PILOTO CORRUPTO',
          canac_sigvoos: 'CANACX',
          funcionario_id: 4,
          created_at: 'now',
          updated_at: 'now',
          deleted_at: null,
        },
      ],
    });

    const mappingsForA = await listSigvoosManualMappings(db, 10);
    expect(mappingsForA).toHaveLength(0);
  });

  it('does not leak B mapping into A GET after a legitimate A mapping is created', async () => {
    const db = createTenantAwareSigvoosDb({
      funcionarios: [
        { id: 5, empresa_id: 10, nome: 'Piloto A2' },
        { id: 6, empresa_id: 20, nome: 'Piloto B3' },
      ],
    });

    await upsertSigvoosManualMapping(db, 10, {
      nomeSigvoos: 'PILOTO A2',
      canacSigvoos: 'CANACA2',
      funcionarioId: 5,
    });
    await upsertSigvoosManualMapping(db, 20, {
      nomeSigvoos: 'PILOTO B3',
      canacSigvoos: 'CANACB3',
      funcionarioId: 6,
    });

    const mappingsForA = await listSigvoosManualMappings(db, 10);
    expect(mappingsForA).toHaveLength(1);
    expect(mappingsForA[0].funcionario_id).toBe('5');
  });
});
