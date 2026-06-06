import { describe, expect, it } from 'vitest';

// @ts-expect-error Script operacional .mjs fora do pacote worker, importado aqui só para testes puros.
import {
  buildOrphanAlertCleanupSql,
  buildPlan,
  dedupeSigvoosRows,
  isValidSigvoosLine,
  parseArgs,
} from '../../../../scripts/frms-rebuild-from-sigvoos-2026.mjs';

const baseSigvoos = {
  importacao_id: 'imp-old',
  tripulante_id: '7',
  empresa_id: 6,
  nome_sigvoos: 'DIETER',
  data: '2026-06-02',
  status_frms: 'ES',
  hora_apresentacao: '10:55',
  hora_termino: '17:10',
  duracao_jornada_min: 375,
  horas_voo_min: 189,
  local_base: 'SBME',
  created_at: '2026-06-02 21:00:00',
  updated_at: '2026-06-02 21:00:00',
  line_json: '{}',
};

describe('frms-rebuild-from-sigvoos-2026 script guards', () => {
  it('blocks execution without explicit dry-run or execute mode', () => {
    expect(() =>
      parseArgs(['--from', '2026-01-01', '--to', '2026-06-05', '--all-tripulantes']),
    ).toThrow(/exactly one/);
  });

  it('requires an explicit tripulante scope or all-tripulantes', () => {
    expect(() =>
      parseArgs(['--dry-run', '--from', '2026-01-01', '--to', '2026-06-05']),
    ).toThrow(/Scope is required/);
  });
});

describe('frms-rebuild-from-sigvoos-2026 planning', () => {
  it('rejects invalid SIGVOOS where flight time exceeds journey duration', () => {
    expect(
      isValidSigvoosLine({
        ...baseSigvoos,
        duracao_jornada_min: 655,
        horas_voo_min: 1537,
      }),
    ).toBe(false);
  });

  it('keeps the latest SIGVOOS row per tripulante/date', () => {
    const latest = { ...baseSigvoos, importacao_id: 'imp-new', created_at: '2026-06-03 21:00:00' };
    const rows = dedupeSigvoosRows([baseSigvoos, latest]);
    expect(rows).toHaveLength(1);
    expect(rows[0].importacao_id).toBe('imp-new');
  });

  it('classifies FIRA as replaceable by valid SIGVOOS', () => {
    const plan = buildPlan({
      sigvoosRows: [baseSigvoos],
      jornadasRows: [
        {
          id: 'old-fira',
          tripulante_id: 7,
          data: '2026-06-02',
          origem: 'FIRA',
          hora_apresentacao: '10:55',
          hora_termino: '17:10',
          duracao_jornada_minutos: 315,
          horas_voo_minutos: 189,
          local_base: 'SBME',
        },
      ],
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].type).toBe('replace_noncanonical_with_sigvoos');
    expect(plan.pendingRows).toHaveLength(0);
  });

  it('is idempotent when the active row is already matching SIGVOOS', () => {
    const plan = buildPlan({
      sigvoosRows: [baseSigvoos],
      jornadasRows: [
        {
          id: 'sigvoos-existing',
          tripulante_id: 7,
          data: '2026-06-02',
          origem: 'SIGVOOS',
          hora_apresentacao: '10:55',
          hora_termino: '17:10',
          duracao_jornada_minutos: 375,
          horas_voo_minutos: 189,
          local_base: 'SBME',
        },
      ],
    });

    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0].type).toBe('preserve_sigvoos');
  });

  it('keeps noncanonical rows pending when SIGVOOS is invalid', () => {
    const plan = buildPlan({
      sigvoosRows: [{ ...baseSigvoos, duracao_jornada_min: 130, horas_voo_min: 281 }],
      jornadasRows: [
        {
          id: 'old-fira',
          tripulante_id: 7,
          data: '2026-06-02',
          origem: 'FIRA',
        },
      ],
    });

    expect(plan.invalidSigvoos).toHaveLength(1);
    expect(plan.actions).toHaveLength(0);
    expect(plan.pendingRows).toHaveLength(1);
  });

  it('soft-deletes orphan active alerts without a physical delete', () => {
    const statements = buildOrphanAlertCleanupSql(
      [
        {
          id: 'orphan-alert',
          tripulante_id: 7,
          tipo_limite: 'HV_MES',
          created_at: '2026-04-30 08:00:38',
        },
      ],
      '2026-06-06 00:00:00',
    );

    expect(statements.join('\n')).toContain('UPDATE frms_alerta SET deleted_at');
    expect(statements.join('\n')).toContain('FRMS_SIGVOOS_GLOBAL_REBUILD_ORPHAN_ALERT_SOFT_DELETE');
    expect(statements.join('\n')).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
