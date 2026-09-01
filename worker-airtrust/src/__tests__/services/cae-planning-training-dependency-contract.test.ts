import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../../..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('training dependency -> complete simulator planning contract', () => {
  it('feeds open dependency obligations into Planning V2 and resolves the current full curriculum', () => {
    const route = read('worker-airtrust/src/routes/simuladores-planejamento-v2.ts');
    const source = read('worker-airtrust/src/services/cae-planning-dependency-source.ts');

    expect(route).toContain('loadPendingTrainingDependencyQualifications');
    expect(route).toContain('resolveIndividualRemainingModels');
    expect(route).toContain('const ordered = [...remainingRows].sort');
    expect(route).toContain('ordered.forEach((model, index) =>');
    expect(route).toContain('training_session_count: ordered.length');
    expect(route).toContain("planning_source: qualification.planning_source || 'QUALIFICATION_HISTORY'");

    expect(source).toContain("'TRAINING_DEPENDENCY' AS planning_source");
    expect(source).toContain('t.empresa_id = ?');
    expect(source).toContain('f.empresa_id = t.empresa_id');
    expect(source).toContain('qt.empresa_id = t.empresa_id');
    expect(source).toContain("'PROPOSTO', 'PLANEJADO', 'AGUARDANDO_DISPONIBILIDADE', 'CONFIRMADO', 'REPLANEJAR'");
    expect(source).toContain('NOT EXISTS (');
    expect(source).toContain("UPPER(COALESCE(qh_done.status, '')) = 'CONCLUIDA'");
  });

  it('blocks direct partial materialization of a raw dependency seed', () => {
    const materialization = read('worker-airtrust/src/services/cae-planning-materialization.ts');
    const guardAt = materialization.indexOf("code: 'TRAINING_PLAN_REQUIRED'");
    const participantMaterializationAt = materialization.indexOf('const snapshotParticipants');

    expect(materialization).toContain("snapshot.generated_by === 'TRAINING_DEPENDENCY'");
    expect(materialization).toContain("snapshot.materialization_strategy === 'TRAINING_PLAN_REQUIRED'");
    expect(guardAt).toBeGreaterThan(0);
    expect(participantMaterializationAt).toBeGreaterThan(guardAt);
  });

  it('keeps exact CAE time selection a second-stage step after day-level proposal generation', () => {
    const route = read('worker-airtrust/src/routes/simuladores-planejamento-v2.ts');
    const scheduler = read('worker-airtrust/src/services/cae-planning-session-scheduler.ts');

    expect(route).toContain('if (body?.cae_availability !== undefined');
    expect(route).toContain('scheduleSimulatorTrainingBlocks');
    expect(scheduler).toContain('simulatorTrainingTimeQualityRank');
    expect(scheduler).toContain("timeQuality: SimulatorTrainingTimeQuality");
    expect(scheduler).toContain('time_quality: chosen.timeQuality');
  });
});
