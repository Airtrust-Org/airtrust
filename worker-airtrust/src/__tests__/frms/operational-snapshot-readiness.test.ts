import { describe, expect, it, vi } from 'vitest';
import { buildFrmsOperationalSnapshot, loadReadinessSnapshotRows, type BuildOperationalSnapshotInput } from '../../lib/frms/operational-snapshot';

function fixture(): BuildOperationalSnapshotInput {
  return {
    empresaId: 42, hoje: '2026-11-08',
    rows: {
      escalas: [], jornadas: [], effectiveness: [],
      funcionarios: [{ id: 10, nome: 'Sintético', nome_guerra: null, funcao: 'PIC', cargo: 'PIC', base: null, aeronave: null }],
      checkins: [{
        data_operacional: '2026-11-08', funcionario_id: 10, hora_checkin: '07:00',
        hora_apresentacao: '08:00', kss_score: 3, kss_provenance: 'CREW_REPORTED',
        horas_sono: 8, qualidade_sono: 4, wake_time: '06:30',
        score_fadiga: 12, nivel_fadiga: 'VERDE', status_operacional: 'APTO',
        computed_risk_level: 'normal',
      }],
    },
  };
}
describe('FRMS readiness posterior ao check-in', () => {
  it.each(['attention', 'operational_review'])('não oculta %s com check-in normal', (classification) => {
    const input = fixture();
    input.rows.readiness = [{ data_operacional: '2026-11-08', funcionario_id: 10, classification, protocol_version: 'airtrust-attention-v1' }];
    const item = buildFrmsOperationalSnapshot(input).items[0];
    expect(item.checkin_status).toBe('RECEBIDO');
    expect(item.alertas).toContain('READINESS_REVISAO');
    expect(item.snapshot_status).not.toBe('OK');
    expect(item.readiness_classification).toBe(classification);
    expect(item.causa).toContain('readiness');
    expect(item.motivos_principais).toEqual(expect.arrayContaining([
      expect.stringContaining('readiness'),
    ]));
  });
  it('não promove baseline em construção nem readiness de outro dia', () => {
    const input = fixture();
    input.rows.readiness = [
      { data_operacional: '2026-11-08', funcionario_id: 10, classification: 'baseline_building', protocol_version: 'airtrust-attention-v1' },
      { data_operacional: '2026-11-07', funcionario_id: 10, classification: 'operational_review', protocol_version: 'airtrust-attention-v1' },
    ];
    const item = buildFrmsOperationalSnapshot(input).items[0];
    expect(item.alertas).not.toContain('READINESS_REVISAO');
    expect(item.readiness_classification).toBe('baseline_building');
  });
  it.each([
    ['operational_review', 'preserved'],
    ['preserved', 'operational_review'],
    ['attention', 'baseline_building'],
    ['baseline_building', 'attention'],
  ])('preserva sinal adverso independente da ordem: %s / %s', (first, second) => {
    const input = fixture();
    input.rows.readiness = [first, second].map(classification => ({
      data_operacional: '2026-11-08', funcionario_id: 10, classification,
      protocol_version: 'airtrust-brief-v1',
    }));
    const item = buildFrmsOperationalSnapshot(input).items[0];
    expect(item.alertas).toContain('READINESS_REVISAO');
    expect(item.readiness_classification).toBe(
      first === 'operational_review' || second === 'operational_review' ? 'operational_review' : 'attention',
    );
  });

  it('não permite que readiness de outro funcionário ou dia contamine a observação', () => {
    const input = fixture();
    input.rows.readiness = [
      { data_operacional: '2026-11-08', funcionario_id: 99, classification: 'operational_review', protocol_version: 'airtrust-brief-v1' },
      { data_operacional: '2026-11-07', funcionario_id: 10, classification: 'attention', protocol_version: 'airtrust-brief-v1' },
      { data_operacional: '2026-11-08', funcionario_id: 10, classification: 'preserved', protocol_version: 'airtrust-brief-v1' },
    ];
    const item = buildFrmsOperationalSnapshot(input).items[0];
    expect(item.readiness_classification).toBe('preserved');
    expect(item.alertas).not.toContain('READINESS_REVISAO');
  });

  it('classificação desconhecida exige revisão, não é normalizada silenciosamente', () => {
    const input = fixture();
    input.rows.readiness = [
      { data_operacional: '2026-11-08', funcionario_id: 10, classification: 'unknown_future_state', protocol_version: 'airtrust-brief-v1' },
      { data_operacional: '2026-11-08', funcionario_id: 10, classification: 'preserved', protocol_version: 'airtrust-brief-v1' },
    ];
    const item = buildFrmsOperationalSnapshot(input).items[0];
    expect(item.alertas).toContain('READINESS_REVISAO');
    expect(item.readiness_classification).toBe('unknown_future_state');
  });

  it('ignora readiness com identificador ou data inválidos sem contaminar a fila', () => {
    const input = fixture();
    input.rows.readiness = [
      { data_operacional: '2026-11-08-extra', funcionario_id: 10, classification: 'operational_review', protocol_version: 'airtrust-brief-v1' },
      { data_operacional: '2026-11-08', funcionario_id: 0, classification: 'operational_review', protocol_version: 'airtrust-brief-v1' },
      { data_operacional: '2026-11-08', funcionario_id: 10.5, classification: 'operational_review', protocol_version: 'airtrust-brief-v1' },
      { data_operacional: '2026-11-08', funcionario_id: 10, classification: 'preserved', protocol_version: 'airtrust-brief-v1' },
    ];
    const item = buildFrmsOperationalSnapshot(input).items[0];
    expect(item.readiness_classification).toBe('preserved');
    expect(item.alertas).not.toContain('READINESS_REVISAO');
  });

  it('não interpreta ausência de avaliação objetiva como resultado preserved', () => {
    const item = buildFrmsOperationalSnapshot(fixture()).items[0];
    expect(item.readiness_classification).toBeNull();
    expect(item.readiness_protocol_version).toBeNull();
  });

});

describe('FRMS readiness D1 loader — isolamento e falha fechada', () => {
  function fakeDb(result: unknown, reject = false) {
    const all = vi.fn().mockImplementation(() => reject ? Promise.reject(new Error('D1 unavailable')) : Promise.resolve(result));
    const bind = vi.fn().mockReturnValue({ all });
    const prepare = vi.fn().mockReturnValue({ bind });
    return { db: { prepare } as unknown as D1Database, prepare, bind, all };
  }

  it('filtra empresa, data e registros removidos na própria consulta', async () => {
    const fake = fakeDb({ results: [{ data_operacional: '2026-11-08', funcionario_id: 10, classification: 'attention', protocol_version: 'brief-v1' }] });
    const rows = await loadReadinessSnapshotRows(fake.db, 42, '2026-11-07', '2026-11-08');
    expect(rows).toHaveLength(1);
    const sql = fake.prepare.mock.calls[0][0] as string;
    expect(sql).toMatch(/empresa_id\s*=\s*\?/);
    expect(sql).toMatch(/deleted_at\s+IS\s+NULL/i);
    expect(sql).toMatch(/reference_date\s*>=\s*\?/);
    expect(sql).toMatch(/reference_date\s*<=\s*\?/);
    expect(fake.bind).toHaveBeenCalledWith(42, '2026-11-07', '2026-11-08');
  });

  it('não transforma falha D1 em readiness normal ou ausente', async () => {
    const fake = fakeDb(null, true);
    await expect(loadReadinessSnapshotRows(fake.db, 42, '2026-11-08', '2026-11-08')).rejects.toThrow('D1 unavailable');
  });

  it.each([undefined, null, {}, { results: null }, { results: {} }])(
    'não transforma resultado D1 incompleto (%s) em lista vazia', async (response) => {
      const fake = fakeDb(response);
      await expect(loadReadinessSnapshotRows(fake.db, 42, '2026-11-08', '2026-11-08'))
        .rejects.toThrow('FRMS_READINESS_QUERY_INCOMPLETE');
    },
  );

  it('aceita lista vazia explicitamente confirmada pelo D1', async () => {
    const fake = fakeDb({ results: [] });
    await expect(loadReadinessSnapshotRows(fake.db, 42, '2026-11-08', '2026-11-08')).resolves.toEqual([]);
  });
});
