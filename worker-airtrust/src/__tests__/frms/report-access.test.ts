import { describe, expect, it } from 'vitest';
import { resolveEmployeeSectorAccess } from '../../services/employee-sector-access';
import { loadFrmsReportCrewScope } from '../../lib/frms/report-access';
import { aggregateAuthorizedComplianceReport, summarizeReportRestEvidence } from '../../lib/frms/db-service-relatorios';
import type { FrmsOperationalSnapshotItem } from '../../lib/frms/operational-snapshot';

type Employee = { id: number; empresa: number; setor: number };
const people: Employee[] = [
  { id: 11, empresa: 6, setor: 10 },
  { id: 12, empresa: 6, setor: 20 },
  { id: 13, empresa: 7, setor: 10 },
];

/** Tiny D1 fixture; asserts bound tenant+sector SQL is actually supplied on reads. */
function fixture() {
  const state = { managed: [10], executed: [] as Array<{ sql: string; args: unknown[] }> };
  const db = {
    prepare(sql: string) {
      const exec = (args: unknown[]) => {
        state.executed.push({ sql, args });
        if (sql.includes('pragma_table_info')) {
          return { results: [{ name: 'usuario_id' }] };
        }
        if (sql.includes('SELECT DISTINCT sg.setor_id')) {
          return { results: state.managed.map((setor_id) => ({ setor_id })) };
        }
        if (sql.includes('SELECT f.id FROM funcionarios f')) {
          if (!sql.includes('f.empresa_id = ?') || !sql.includes('f.deleted_at IS NULL')) {
            throw Error('REPORT_SCOPE_NOT_TENANT_SAFE');
          }
          const empresa = Number(args[0]);
          return {
            results: people.filter((p) =>
              p.empresa === empresa
              && (sql.includes('1 = 0') ? false : true)
              && (sql.includes('f.id = ?') ? p.id === Number(args[1]) : true)
              && (sql.includes('f.setor_id IN') ? args.slice(1).includes(p.setor) : true)
            ).map((p) => ({ id: p.id })),
          };
        }
        return { results: [] };
      };
      return {
        all: async () => exec([]),
        bind(...args: unknown[]) {
          return {
            all: async () => exec(args),
            first: async () => {
              if (sql.includes('FROM funcionarios') && sql.includes('setor_id')) {
                const row = people.find((p) => p.id === Number(args[0]) && p.empresa === Number(args[1]));
                return row ? { id: row.id, setor_id: row.setor } : null;
              }
              return null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, state };
}

async function visible(db: D1Database, role: string, empresa: number, options?: { funcionarioId: number }) {
  const access = await resolveEmployeeSectorAccess(db, empresa, 901, role, options);
  return [...(await loadFrmsReportCrewScope(db, empresa, access)).ids].sort((a, b) => a - b);
}

describe('FRMS report authorization — canonical employee sector policy', () => {
  it('admin sees current tenant only, never cross-tenant even for the same sector', async () => {
    const { db, state } = fixture();
    expect(await visible(db, 'admin', 6)).toEqual([11, 12]);
    expect(await visible(db, 'admin', 7)).toEqual([13]);
    expect(state.executed.filter((q) => q.sql.includes('SELECT f.id FROM funcionarios f')).every((q) => q.args.length >= 1)).toBe(true);
  });

  it('manager sees only live assigned sector; sector revocation takes effect next request', async () => {
    const { db, state } = fixture();
    expect(await visible(db, 'gestor', 6)).toEqual([11]);
    state.managed = [];
    expect(await visible(db, 'gestor', 6)).toEqual([]);
    state.managed = [20];
    expect(await visible(db, 'gestor', 6)).toEqual([12]);
  });

  it('self sees only linked employee, never another employee in the same sector', async () => {
    const { db } = fixture();
    expect(await visible(db, 'tripulante', 6, { funcionarioId: 11 })).toEqual([11]);
    expect(await visible(db, 'tripulante', 6, { funcionarioId: 13 })).toEqual([]);
  });

  it('unknown role with no matching employee cannot read reports', async () => {
    const { db } = fixture();
    expect(await visible(db, 'none', 6)).toEqual([]);
    await expect(loadFrmsReportCrewScope(db, 0, { mode: 'all', setorIds: [], funcionarioId: null }))
      .rejects.toThrow('FRMS_REPORT_TENANT_REQUIRED');
  });

  it('aggregation filters before counting; missing compliance is not conformance', () => {
    const items = [
      { funcionario_id: 11, nome: 'A', data_operacional: '2026-10-10', compliance_status: 'COMPLIANT', estado_operacional: 'NORMAL' },
      { funcionario_id: 12, nome: 'B', data_operacional: '2026-10-10', compliance_status: 'VIOLATION', estado_operacional: 'MITIGACAO_NECESSARIA' },
      { funcionario_id: 11, nome: 'A', data_operacional: '2026-10-11', compliance_status: 'UNKNOWN', estado_operacional: 'NAO_AVALIADO' },
    ] as FrmsOperationalSnapshotItem[];
    const rows = aggregateAuthorizedComplianceReport(items, new Set([11]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tripulante_id: '11', dias_conformes: 1, dias_violacao: 0, dias_nao_avaliados: 1 });
    expect(aggregateAuthorizedComplianceReport(items, new Set())).toEqual([]);
  });
});

describe('FRMS rest evidence in report', () => {
  it('missing and negative rest remain unknown — never default to sufficient', () => {
    expect(summarizeReportRestEvidence()).toEqual({
      repouso_suficiente: null, repouso_estado: 'DESCONHECIDO', repouso_referencia: null,
      repouso_atualidade: 'AUSENTE',
    });
    expect(summarizeReportRestEvidence({
      repouso_suficiente: 1, repouso_anterior_min: -1, data_referencia: '2026-10-11',
    })).toEqual({
      repouso_suficiente: null, repouso_estado: 'DESCONHECIDO', repouso_referencia: '2026-10-11',
      repouso_atualidade: 'DESATUALIZADO',
    });
  });
  it('retains verified status and its own source date', () => {
    expect(summarizeReportRestEvidence({
      repouso_suficiente: 0, repouso_anterior_min: 540, data_referencia: '2026-10-14',
    }, '2026-10-14')).toMatchObject({ repouso_estado: 'INSUFICIENTE', repouso_suficiente: 0, repouso_referencia: '2026-10-14', repouso_atualidade: 'ATUAL' });
    expect(summarizeReportRestEvidence({
      repouso_suficiente: 1, repouso_anterior_min: 780, data_referencia: '2026-10-14',
    }, '2026-10-14')).toMatchObject({ repouso_estado: 'SUFICIENTE', repouso_suficiente: 1, repouso_atualidade: 'ATUAL' });
  });
  it('historical sufficient rest never becomes a green current-day assessment', () => {
    expect(summarizeReportRestEvidence({
      repouso_suficiente: 1, repouso_anterior_min: 840, data_referencia: '2026-10-14',
    }, '2026-10-19')).toMatchObject({
      repouso_suficiente: null, repouso_estado: 'DESCONHECIDO', repouso_referencia: '2026-10-14',
      repouso_atualidade: 'DESATUALIZADO',
    });
    expect(summarizeReportRestEvidence({
      repouso_suficiente: 1, repouso_anterior_min: 840, data_referencia: '2026-10-20',
    }, '2026-10-19')).toMatchObject({
      repouso_suficiente: null, repouso_estado: 'DESCONHECIDO', repouso_atualidade: 'DESATUALIZADO',
    });
  });
});
