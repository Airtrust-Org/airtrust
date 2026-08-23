import { describe, expect, it } from 'vitest';
import { matchCaeAvailabilityToNeed, type CaePlanningNeed } from '../../services/cae-planning-matcher';
import { SIMULATOR_PLANNING_FALLBACKS } from '../../services/cae-planning-policy';
import type { CaeAvailabilitySlotV1 } from '../../services/cae-availability';

function slot(
  equipment: 'AW139' | 'SK76',
  date: string,
  start: string,
  end: string,
  minutes: number,
): CaeAvailabilitySlotV1 {
  return {
    equipment,
    date,
    start_time: start,
    end_date: date,
    end_time: end,
    duration_minutes: minutes,
    state: 'OFFERED',
    confidence: 1,
  };
}

describe('CAE deterministic planning matcher', () => {
  it('packs three 2h curriculum sessions into a 2h + 4h CAE offer', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'SK76-periodico',
        equipment: 'SK76',
        expiry_date: '2026-09-30',
        planning_start_date: '2026-08-01',
        preferred_window_start: '2026-09-01',
        preferred_window_end: '2026-09-15',
        session_durations_minutes: [120, 120, 120],
      },
      [
        slot('SK76', '2026-09-01', '03:50', '05:50', 120),
        slot('SK76', '2026-09-02', '03:50', '07:50', 240),
      ],
    );

    expect(result.status).toBe('MATCHED');
    expect(result.selected_slots).toHaveLength(2);
    expect(result.assignments).toHaveLength(3);
    expect(result.total_required_minutes).toBe(360);
    expect(result.unused_reserved_minutes).toBe(0);
    expect(result.outside_preferred_window).toBe(false);
  });

  it('does not split a 2h curriculum session across two 1h slots', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'AW139-session',
        equipment: 'AW139',
        expiry_date: '2026-09-30',
        session_durations_minutes: [120],
      },
      [
        slot('AW139', '2026-09-01', '06:00', '07:00', 60),
        slot('AW139', '2026-09-01', '07:00', '08:00', 60),
      ],
    );

    expect(result.status).toBe('INSUFFICIENT_AVAILABILITY');
  });


  it('fails closed when the AirTrust planning candidate has ambiguous equipment', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'ambiguous-equipment',
        equipment: 'A_DEFINIR',
        expiry_date: '2026-09-30',
        session_durations_minutes: [120],
      },
      [slot('AW139', '2026-09-01', '06:00', '08:00', 120)],
    );

    expect(result.status).toBe('INVALID_NEED');
  });

  it('rejects availability after the qualification expiry', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'AW139-expired',
        equipment: 'AW139',
        expiry_date: '2026-09-05',
        session_durations_minutes: [120],
      },
      [slot('AW139', '2026-09-06', '06:00', '08:00', 120)],
    );

    expect(result.status).toBe('INSUFFICIENT_AVAILABILITY');
  });


  it('rejects an overnight slot that starts on expiry but ends after expiry', () => {
    const overnight: CaeAvailabilitySlotV1 = {
      equipment: 'AW139',
      date: '2026-09-05',
      start_time: '23:00',
      end_date: '2026-09-06',
      end_time: '01:00',
      duration_minutes: 120,
      state: 'OFFERED',
      confidence: 1,
    };
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'AW139-overnight-expiry',
        equipment: 'AW139',
        expiry_date: '2026-09-05',
        session_durations_minutes: [120],
      },
      [overnight],
    );

    expect(result.status).toBe('INSUFFICIENT_AVAILABILITY');
  });

  it('uses a before-expiry fallback only when the preferred window is insufficient', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'AW139-fallback',
        equipment: 'AW139',
        expiry_date: '2026-09-30',
        preferred_window_start: '2026-08-15',
        preferred_window_end: '2026-08-31',
        session_durations_minutes: [120, 120],
      },
      [
        slot('AW139', '2026-08-20', '06:00', '08:00', 120),
        slot('AW139', '2026-09-02', '00:00', '02:00', 120),
      ],
    );

    expect(result.status).toBe('MATCHED');
    expect(result.outside_preferred_window).toBe(true);
    expect(result.days_before_expiry).toBe(28);
  });

  it('PREFERÊNCIA (90 DIAS): deve preferir a solução que conclui mais perto do vencimento, se ambas forem válidas', () => {
    // vencimento 2026-11-30, antecedência 90 (planning_horizon_days=90)
    // duas disponibilidades: 2026-09-15 e 2026-11-20
    // -> 2026-11-20 deve vencer, pois 2026-11-20 está mais perto do vencimento.
    
    const config = {
      ...SIMULATOR_PLANNING_FALLBACKS,
      planning_horizon_days: 90,
      source: 'FALLBACK' as const,
      warnings: [] as string[]
    };

    const need: CaePlanningNeed = {
      id: 90,
      equipment: 'AW139',
      expiry_date: '2026-11-30',
      session_durations_minutes: [120],
      config,
    };

    const slots = [
      slot('AW139', '2026-09-15', '08:00', '10:00', 120),
      slot('AW139', '2026-11-20', '08:00', '10:00', 120),
    ];

    const result = matchCaeAvailabilityToNeed(need, slots);
    expect(result.status).toBe('MATCHED');
    expect(result.selected_slots[0].date).toBe('2026-11-20');
  });

  it('PREFERÊNCIA: deve vencer disponibilidade perfeita com 2 sessões/dia e ordem consecutiva', () => {
    // 4 sessões de 2h
    // Cenário A: Disponibilidade espalhada e com gap grande, 1 por dia.
    // Cenário B: Disponibilidade perfeita, 2 por dia (4h block) em dias consecutivos.
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'SK76-inicial',
        equipment: 'SK76',
        expiry_date: '2026-10-31',
        preferred_window_start: '2026-10-01',
        preferred_window_end: '2026-10-15',
        session_durations_minutes: [120, 120, 120, 120],
      },
      [
        // Cenário A (Espalhado: 4 slots isolados)
        slot('SK76', '2026-10-01', '10:00', '12:00', 120),
        slot('SK76', '2026-10-04', '10:00', '12:00', 120),
        slot('SK76', '2026-10-08', '10:00', '12:00', 120),
        slot('SK76', '2026-10-12', '10:00', '12:00', 120),

        // Cenário B (Perfeito: 2 slots de 4h, dias consecutivos)
        slot('SK76', '2026-10-02', '14:00', '18:00', 240),
        slot('SK76', '2026-10-03', '14:00', '18:00', 240),
      ],
    );

    expect(result.status).toBe('MATCHED');
    expect(result.selected_slots).toHaveLength(2); // Deve ter escolhido os dois blocos de 4h
    expect(result.assignments).toHaveLength(4);
    
    // As datas das assinalações devem ser 10-02 e 10-03
    const dates = result.selected_slots.map((s) => s.date).sort();
    expect(dates).toEqual(['2026-10-02', '2026-10-03']);
  });

  it('PREFERÊNCIA: ordem das sessões - sessão 1 antes da sessão 2', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'SK76-ordem',
        equipment: 'SK76',
        expiry_date: '2026-10-31',
        preferred_window_start: '2026-10-01',
        preferred_window_end: '2026-10-15',
        session_durations_minutes: [240, 120], // S1=4h, S2=2h
      },
      [
        // Slot 1 no dia 05, capacidade para 2h (só cabe S2)
        slot('SK76', '2026-10-05', '10:00', '12:00', 120),
        // Slot 2 no dia 06, capacidade para 4h (cabe S1)
        slot('SK76', '2026-10-06', '14:00', '18:00', 240),
        
        // Slot alternativo: Dia 10 e 11 em ordem correta
        slot('SK76', '2026-10-10', '14:00', '18:00', 240),
        slot('SK76', '2026-10-11', '10:00', '12:00', 120),
      ],
    );

    expect(result.status).toBe('MATCHED');
    const assignments = result.assignments.sort((a, b) => a.session_index - b.session_index);
    
    // Sessão de índice 0 deve ter data <= Sessão de índice 1
    const date0 = assignments[0].slot_key.split('|')[1];
    const date1 = assignments[1].slot_key.split('|')[1];
    
    expect(date0).toBe('2026-10-10');
    expect(date1).toBe('2026-10-11');
  });

  it('PREFERÊNCIA: deve continuar retornando match válido para disponibilidade espalhada', () => {
    const result = matchCaeAvailabilityToNeed(
      {
        id: 'AW139-espalhado',
        equipment: 'AW139',
        expiry_date: '2026-10-31',
        preferred_window_start: '2026-10-01',
        preferred_window_end: '2026-10-15',
        session_durations_minutes: [120, 120],
      },
      [
        slot('AW139', '2026-10-01', '10:00', '12:00', 120),
        slot('AW139', '2026-10-12', '10:00', '12:00', 120),
      ],
    );

    expect(result.status).toBe('MATCHED');
    expect(result.assignments).toHaveLength(2);
  });
});
