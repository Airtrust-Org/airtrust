import { describe, it, expect, vi } from 'vitest';
import { detectLmsEditionMismatch } from '../../services/lms-edition-mismatch';

const cmi = (total: number) => JSON.stringify({
  'cmi.core.lesson_location': `${total}/${total}`,
  'airtrust.total_slides': total,
});
function bucket(total: number, malformed = false, version?: string, ids?: string[]): R2Bucket {
  return { get: vi.fn(async () => ({
    size: 900,
    text: async () => malformed
      ? '{invalid'
      : JSON.stringify({
        ...(version ? { packageVersion: version } : {}),
        content: { requiredSlides: ids ?? Array.from({ length: total }, (_, i) => `unit-${i + 1}`) },
      }),
  })) } as unknown as R2Bucket;
}
const base = {
  contentType: 'scorm',
  activePrefix: 'lms/scorm/6/119/_candidates/active/',
  empresaId: 6,
  cursoId: 119,
  cmiJson: cmi(41),
};
describe('published SCORM edition mismatch (CFIT 41 → 37)', () => {
  it('detects the verified older 41/41 state against the R2 37-slide manifest', async () => {
    const b = bucket(37);
    expect(await detectLmsEditionMismatch({ ...base, bucket: b })).toEqual({
      required: true, previous_total: 41, active_total: 37,
    });
    expect(b.get).toHaveBeenCalledWith(
      'lms/scorm/6/119/_candidates/active/airtrust-completion-manifest.json',
    );
  });
  it('never treats 41/41 of the same active 41-slide package as obsolete', async () => {
    expect(await detectLmsEditionMismatch({ ...base, bucket: bucket(41) })).toBeNull();
  });
  it('rejects missing or contradictory persisted position evidence', async () => {
    expect(await detectLmsEditionMismatch({ ...base, cmiJson: null, bucket: bucket(37) })).toBeNull();
    expect(await detectLmsEditionMismatch({
      ...base,
      cmiJson: JSON.stringify({ 'cmi.location': '41/41', 'airtrust.total_slides': 37 }),
      bucket: bucket(37),
    })).toBeNull();
  });
  it('fails closed when R2 is unavailable, manifest malformed or prefix suspicious', async () => {
    expect(await detectLmsEditionMismatch({ ...base, bucket: null })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...base, bucket: bucket(37, true) })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...base, activePrefix: '../secrets', bucket: bucket(37) })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...base, empresaId: 99, bucket: bucket(37) })).toBeNull();
    expect(await detectLmsEditionMismatch({ ...base, contentType: 'pdf', bucket: bucket(37) })).toBeNull();
  });
  it('recognizes MGO-like same-count replacement from native authored version instead of using 35/46 as proof', async () => {
    const previous = JSON.stringify({
      'cmi.core.lesson_location': '35/46',
      'airtrust.total_slides': 46,
      'cmi.suspend_data': JSON.stringify({ v: 4, p: 'mgo-rev14', a: 34, d: [0, 1, 2] }),
    });
    expect(await detectLmsEditionMismatch({
      ...base, cmiJson: previous, bucket: bucket(46, false, 'mgo-rev15'),
    })).toEqual({
      required: true,
      previous_total: 46,
      active_total: 46,
      reason: 'PACKAGE_VERSION_CHANGED',
      previous_version: 'mgo-rev14',
      active_version: 'mgo-rev15',
    });
  });
  it('retains an unchanged edition when packageVersion and totals match', async () => {
    const previous = JSON.stringify({
      'cmi.core.lesson_location': '35/46',
      'cmi.suspend_data': JSON.stringify({ v: 4, p: 'mgo-rev15', a: 34 }),
    });
    expect(await detectLmsEditionMismatch({
      ...base, cmiJson: previous, bucket: bucket(46, false, 'mgo-rev15'),
    })).toBeNull();
  });
  it('detects different stable slide IDs even if total and packageVersion are unchanged', async () => {
    const previous = JSON.stringify({
      'cmi.core.lesson_location': '2/3',
      'cmi.suspend_data': JSON.stringify({ v: 5, p: 'same-name', ids: ['a', 'b', 'c'] }),
    });
    expect(await detectLmsEditionMismatch({
      ...base, cmiJson: previous, bucket: bucket(3, false, 'same-name', ['a', 'changed', 'c']),
    })).toEqual({
      required: true, previous_total: 3, active_total: 3, reason: 'SLIDE_IDS_CHANGED',
    });
  });
  it('does not treat a legacy cursor with no edition identity as proven changed', async () => {
    expect(await detectLmsEditionMismatch({
      ...base,
      cmiJson: JSON.stringify({ 'cmi.core.lesson_location': '35/46', 'cmi.suspend_data': '{bad' }),
      bucket: bucket(46, false, 'mgo-rev15'),
    })).toBeNull();
  });

});
