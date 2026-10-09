import { describe, it, expect, vi } from 'vitest';
import { detectLmsEditionMismatch } from '../../services/lms-edition-mismatch';

const cmi = (total: number) => JSON.stringify({
  'cmi.core.lesson_location': `${total}/${total}`,
  'airtrust.total_slides': total,
});
function bucket(total: number, malformed = false): R2Bucket {
  return { get: vi.fn(async () => ({
    size: 900,
    text: async () => malformed
      ? '{invalid'
      : JSON.stringify({ content: { requiredSlides: Array.from({ length: total }, (_, i) => `unit-${i + 1}`) } }),
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
});
