import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('simulator future-planning fixed Escala 1/2 contract', () => {
  it('proposal, crew scheduling and approval use employee fixed fortnight instead of published monthly roster', () => {
    const proposal = read('src/routes/simuladores-planejamento-v2.ts');
    const crew = read('src/routes/simuladores-planejamento-v2-crew.ts');
    const approval = read('src/services/cae-planning-approval.ts');
    const legacyPersistence = read('src/routes/simuladores-planejamento.ts');

    expect(proposal).toContain('createEmployeeFortnightPairEligibility');
    expect(proposal).toContain('loadEmployeeFortnightAssignments');
    expect(proposal).not.toContain('loadPublishedRosterAllocations');
    expect(proposal).not.toContain('createRosterAwarePairEligibility');

    expect(crew).toContain('resolveEmployeeFortnightDayFromD1');
    expect(crew).toContain('createEmployeeFortnightPairEligibility');
    expect(crew).not.toContain('resolvePublishedRosterDayFromD1');
    expect(crew).not.toContain('FROM escala_alocacoes');

    expect(approval).toContain('resolveEmployeeFortnightDayFromD1');
    expect(approval).not.toContain('resolvePublishedRosterDayFromD1');
    expect(legacyPersistence).toContain('resolveEmployeeFortnightDayFromD1');
  });

  it('keeps monthly published roster only as a non-blocking advisory conflict in legacy persistence', () => {
    const legacyPersistence = read('src/routes/simuladores-planejamento.ts');
    expect(legacyPersistence).toContain('loadPublishedRosterConflicts');
    expect(legacyPersistence).toContain('Há conflito com escala publicada; revisar antes de agendar.');
    expect(legacyPersistence).toContain('funcionarios.quinzena + escalas_quinzenas');
  });
});
