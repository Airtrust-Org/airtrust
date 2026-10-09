import { describe, expect, it } from 'vitest';
import {
  buildSimulatorTrainingClasses,
  attachSimulatorSupportCrew,
  canManuallyShareSimulatorTrainingSessions,
  canShareSimulatorTrainingSessions,
  pairSimulatorTrainingSessions,
  type SimulatorTrainingSessionNeed,
} from '../../services/cae-planning-session-proposal';

function need(
  id: string,
  employeeId: number,
  qualificationId: number,
  qualificationName: string,
  order: number,
  expiry: string,
  role: string,
): SimulatorTrainingSessionNeed {
  return {
    need_id: id,
    employee_id: employeeId,
    employee_name: `Piloto ${employeeId}`,
    employee_role: role,
    qualification_type_id: qualificationId,
    qualification_code: qualificationId === 1 ? 'G1' : 'G1-SEM',
    qualification_name: qualificationName,
    expiry_date: expiry,
    equipment: 'AW139',
    session_model_id: qualificationId * 100 + order,
    session_code: `S${order}`,
    session_name: `Sessão ${order}`,
    session_order: order,
    duration_minutes: 120,
    training_session_count: 4,
  };
}

describe('session-level simulator proposal', () => {
  it('pairs all four sessions of a recurrent training instead of only the first', () => {
    const needs = [1, 2, 3, 4].flatMap((order) => [
      need(
        `a-${order}`,
        10,
        1,
        'AW139 — Currículo de Voo - Anual (FFS)',
        order,
        '2027-03-15',
        'Comandante',
      ),
      need(
        `b-${order}`,
        20,
        1,
        'AW139 — Currículo de Voo - Anual (FFS)',
        order,
        '2027-03-15',
        'Copiloto',
      ),
    ]);
    const blocks = pairSimulatorTrainingSessions(needs, 60);
    expect(blocks).toHaveLength(4);
    expect(blocks.every((block) => block.sessions.length === 2)).toBe(true);
    expect(blocks.map((block) => block.sessions[0].session_order).sort()).toEqual([1, 2, 3, 4]);
  });

  it('keeps Irene with Nery across the periodic cycle instead of choosing lower-id Caio promoted from Semestral', () => {
    const needs = [1, 2, 3, 4].flatMap((order) => {
      const irene = need(
        `irene-s${order}`,
        71,
        33,
        'AW139 — Currículo de Voo - Periódico Anual (FFS)',
        order,
        '2026-09-23',
        'Copiloto',
      );
      irene.requirement_qualification_type_id = 33;

      const caioPromoted = need(
        `caio-s${order}`,
        5,
        33,
        'AW139 — Currículo de Voo - Periódico Anual (FFS)',
        order,
        '2026-09-30',
        'Comandante',
      );
      caioPromoted.requirement_qualification_type_id = 106;
      caioPromoted.coverage_reason = 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL';

      const nery = need(
        `nery-s${order}`,
        33,
        33,
        'AW139 — Currículo de Voo - Periódico Anual (FFS)',
        order,
        '2026-09-30',
        'Comandante',
      );
      nery.requirement_qualification_type_id = 33;
      return [caioPromoted, irene, nery];
    });

    const blocks = pairSimulatorTrainingSessions(needs, 90);
    const ireneBlocks = blocks.filter((block) =>
      block.sessions.some((session) => session.employee_id === 71),
    );

    expect(ireneBlocks).toHaveLength(4);
    expect(
      ireneBlocks.every(
        (block) =>
          block.sessions.map((session) => session.employee_id).sort().join(',') === '33,71',
      ),
    ).toBe(true);
    expect(
      blocks.filter(
        (block) => block.pairing === 'SEM_DUPLA' && block.sessions[0].employee_id === 5,
      ),
    ).toHaveLength(4);
  });

  it('keeps the full curriculum denominator when only later sessions remain', () => {
    const late = need(
      'late',
      10,
      1,
      'AW139 — Currículo de Voo - Anual (FFS)',
      4,
      '2027-03-15',
      'Comandante',
    );
    late.training_session_count = 2;
    const [block] = pairSimulatorTrainingSessions([late], 60);
    expect(block.sessions[0].session_order).toBe(4);
    expect(block.sessions[0].training_session_count).toBe(4);
  });

  it('allows an annual session to share with a semestral session when duration/equipment match', () => {
    const blocks = pairSimulatorTrainingSessions(
      [
        need(
          'per-1',
          10,
          1,
          'AW139 — Currículo de Voo - Anual (FFS)',
          1,
          '2027-03-15',
          'Comandante',
        ),
        need(
          'sem-1',
          20,
          2,
          'AW139 — Currículo de Voo - Semestral (FFS)',
          1,
          '2027-03-30',
          'Copiloto',
        ),
      ],
      60,
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].pairing).toBe('TREINAMENTOS_COMPATIVEIS');
    expect(blocks[0].sessions.map((session) => session.qualification_type_id).sort()).toEqual([
      1, 2,
    ]);
  });

  it('keeps automatic pairing strict by session order but allows an explicit manual session reassignment', () => {
    const first = need(
      'a',
      10,
      1,
      'AW139 — Currículo de Voo - Anual (FFS)',
      1,
      '2027-03-15',
      'Comandante',
    );
    const second = need(
      'b',
      20,
      1,
      'AW139 — Currículo de Voo - Anual (FFS)',
      2,
      '2027-03-15',
      'Copiloto',
    );
    expect(canShareSimulatorTrainingSessions(first, second)).toBe(false);
    expect(canManuallyShareSimulatorTrainingSessions(first, second)).toBe(true);
  });

  it('does not cross-pair annual and semestral when shared sessions are disabled by company policy', () => {
    const blocks = pairSimulatorTrainingSessions(
      [
        need(
          'per-1',
          10,
          1,
          'AW139 — Currículo de Voo - Anual (FFS)',
          1,
          '2027-03-15',
          'Comandante',
        ),
        need(
          'sem-1',
          20,
          2,
          'AW139 — Currículo de Voo - Semestral (FFS)',
          1,
          '2027-03-30',
          'Copiloto',
        ),
      ],
      60,
      false,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.pairing === 'SEM_DUPLA')).toBe(true);
  });

  it('does not anticipate a partner beyond the configured horizon', () => {
    const blocks = pairSimulatorTrainingSessions(
      [
        need('a', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-01-01', 'Comandante'),
        need('b', 20, 2, 'AW139 — Currículo de Voo - Semestral (FFS)', 1, '2027-06-01', 'Copiloto'),
      ],
      60,
    );
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.pairing === 'SEM_DUPLA')).toBe(true);
  });

  it('applies an operational predicate without weakening curricular compatibility', () => {
    const primary = need(
      'a',
      10,
      1,
      'AW139 — Currículo de Voo - Anual (FFS)',
      1,
      '2027-06-17',
      'Comandante',
    );
    const unavailable = need(
      'b',
      20,
      1,
      'AW139 — Currículo de Voo - Anual (FFS)',
      1,
      '2027-06-17',
      'Copiloto',
    );
    const available = need(
      'c',
      30,
      1,
      'AW139 — Currículo de Voo - Anual (FFS)',
      1,
      '2027-06-17',
      'Copiloto',
    );

    const blocks = pairSimulatorTrainingSessions(
      [primary, unavailable, available],
      60,
      true,
      (_left, right) => right.employee_id !== 20,
    );

    const paired = blocks.find((block) =>
      block.sessions.some((session) => session.employee_id === 10),
    );
    expect(paired?.sessions.map((session) => session.employee_id).sort()).toEqual([10, 30]);
    expect(
      blocks.some((block) => block.pairing === 'SEM_DUPLA' && block.sessions[0].employee_id === 20),
    ).toBe(true);
  });

  it('creates a stable class name by equipment and target month', () => {
    const blocks = pairSimulatorTrainingSessions(
      [
        need('a', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-17', 'Comandante'),
        need('b', 20, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-17', 'Copiloto'),
      ],
      60,
    );
    const classes = buildSimulatorTrainingClasses(blocks);
    expect(classes[0].class_name).toBe('AW139-2027.06');
  });

  it('emits A/B suffixes for independent operational cohorts in the same equipment/month', () => {
    const blocks = pairSimulatorTrainingSessions(
      [
        need('a1', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-17', 'Comandante'),
        need('a2', 20, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-17', 'Copiloto'),
        need('b1', 30, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-24', 'Comandante'),
        need('b2', 40, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-24', 'Copiloto'),
      ],
      10,
    );

    const classes = buildSimulatorTrainingClasses(blocks);
    expect(classes.map((item) => item.class_name)).toEqual(['AW139-2027.06A', 'AW139-2027.06B']);
    expect(classes.map((item) => item.blocks.length)).toEqual([1, 1]);
  });

  it('permits two copilots to share an identical simulator session', () => {
    const a = need('a', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-03-20', 'Copiloto');
    const b = need('b', 20, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-03-20', 'Copiloto');
    const [block] = pairSimulatorTrainingSessions([a, b], 90);
    expect(block.pairing).toBe('MESMO_TREINAMENTO');
    expect(block.sessions).toHaveLength(2);
  });

  it('prefers a nearby same-role pilot over a far-ahead complementary role', () => {
    const a = need('a', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-01-10', 'Comandante');
    const distant = need('b', 20, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-03-20', 'Copiloto');
    const nearby = need('c', 30, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-01-20', 'Comandante');
    const blocks = pairSimulatorTrainingSessions([a, distant, nearby], 90);
    const pair = blocks.find((block) => block.pairing !== 'SEM_DUPLA');
    expect(pair?.sessions.map((session) => session.employee_id).sort()).toEqual([10, 30]);
  });

  it('uses nearby compatible semestral instead of anticipating a periodic by more than 60 days', () => {
    const annual = need('a', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-01-10', 'Comandante');
    const distantAnnual = need('b', 20, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-03-20', 'Copiloto');
    const nearbySemestral = need('c', 30, 2, 'AW139 — Currículo de Voo - Semestral (FFS)', 1, '2027-01-20', 'Copiloto');
    const blocks = pairSimulatorTrainingSessions([annual, distantAnnual, nearbySemestral], 90);
    const pair = blocks.find((block) => block.pairing !== 'SEM_DUPLA');
    expect(pair?.pairing).toBe('TREINAMENTOS_COMPATIVEIS');
    expect(pair?.sessions.map((session) => session.employee_id).sort()).toEqual([10, 30]);
    expect(annual.qualification_type_id).toBe(1);
    expect(nearbySemestral.qualification_type_id).toBe(2);
  });

  it('repairs a stranded pair into two valid pairs without crossing eligibility restrictions', () => {
    const needs = [10, 20, 30, 40].map((employeeId, index) =>
      need(String.fromCharCode(97 + index), employeeId, 1, 'AW139 — Currículo de Voo - Anual (FFS)',
        1, '2027-03-20', 'Comandante'),
    );
    const compatible = new Set(['10:20', '10:30', '20:40']);
    const blocks = pairSimulatorTrainingSessions(needs, 45, true, (left, right) =>
      compatible.has([left.employee_id, right.employee_id].sort((a, b) => a - b).join(':')),
    );
    expect(blocks).toHaveLength(2);
    expect(blocks.every((block) => block.sessions.length === 2)).toBe(true);
    expect(blocks.flatMap((block) => block.sessions.map((item) => item.need_id)).sort())
      .toEqual(['a', 'b', 'c', 'd']);
    expect(blocks.map((block) =>
      block.sessions.map((item) => item.employee_id).sort((a, b) => a - b).join(':'),
    ).sort()).toEqual(['10:30', '20:40']);
  });

  it('keeps a cohort connected when the partner changes between sessions', () => {
    const s1 = pairSimulatorTrainingSessions(
      [
        need('a1', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-17', 'Comandante'),
        need('b1', 20, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 1, '2027-06-17', 'Copiloto'),
      ],
      60,
    );
    const s2 = pairSimulatorTrainingSessions(
      [
        need('a2', 10, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 2, '2027-06-17', 'Comandante'),
        need('c2', 30, 1, 'AW139 — Currículo de Voo - Anual (FFS)', 2, '2027-06-17', 'Copiloto'),
      ],
      60,
    );

    const classes = buildSimulatorTrainingClasses([...s1, ...s2]);
    expect(classes).toHaveLength(1);
    expect(classes[0].class_name).toBe('AW139-2027.06');
    expect(classes[0].blocks).toHaveLength(2);
  });
  it('rotates three pilots across successive compatible curricular sessions without inventing needs', () => {
    const people = [10, 20, 30];
    const needs = [1, 2, 3, 4].flatMap((order) => people.map((employeeId) =>
      need(`${employeeId}-${order}`, employeeId, 1, 'AW139 — Periódico Anual', order, '2027-03-20', 'Copiloto'),
    ));
    const blocks = pairSimulatorTrainingSessions(needs, 60);
    expect(blocks.flatMap((b) => b.sessions.map((n) => n.need_id)).sort())
      .toEqual(needs.map((n) => n.need_id).sort());
    const pairKeys = new Set(blocks.filter((b) => b.sessions.length === 2)
      .map((b) => b.sessions.map((n) => n.employee_id).sort().join('-')));
    expect(pairKeys.size).toBeGreaterThan(1);
    const classes = buildSimulatorTrainingClasses(blocks);
    expect(classes.some((trainingClass) =>
      new Set(trainingClass.blocks.flatMap((b) => b.sessions.map((n) => n.employee_id))).size >= 3,
    )).toBe(true);
  });

  it('marks an operational support member without crediting a new training need', () => {
    const solo = need('solo', 10, 1, 'AW139 — Periódico', 1, '2027-03-20', 'Copiloto');
    const peer = need('peer', 20, 1, 'AW139 — Periódico', 2, '2027-03-20', 'Copiloto');
    const blocks = pairSimulatorTrainingSessions([solo], 60);
    const [updated] = attachSimulatorSupportCrew({
      blocks,
      needs: [solo, peer],
      assignments: [{ anchor_need_id: solo.need_id, support_employee_id: 20 }],
    });
    expect(updated.pairing).toBe('APOIO_SEM_RENOVACAO');
    expect(updated.sessions.map((n) => n.employee_id)).toEqual([10]);
    expect(updated.support).toEqual({
      employee_id: 20, employee_name: 'Piloto 20', employee_role: 'Copiloto',
    });
    // Support connects an operational 3+ cohort without becoming a second training need.
    const peerBlock = pairSimulatorTrainingSessions([peer], 60)[0];
    const cohorts = buildSimulatorTrainingClasses([updated, peerBlock]);
    expect(cohorts).toHaveLength(1);
    expect(cohorts[0].blocks).toHaveLength(2);

    expect(() => attachSimulatorSupportCrew({
      blocks,
      needs: [solo, peer],
      assignments: [{ anchor_need_id: solo.need_id, support_employee_id: 10 }],
    })).toThrow(/apoio/i);
  });

});
