import { describe, expect, it } from 'vitest';
import { shouldSaveScormMetadataWithoutZip } from '../lmsScormCandidateIntent';

describe('existing-course SCORM upload intent', () => {
  it.each(['airtrust.online', 'staging.airtrust.pages.dev'])(
    'keeps SCORM ZIP out of the metadata submit on %s',
    (hostname) => {
      expect(shouldSaveScormMetadataWithoutZip({
        isEditing: true, tipoConteudo: 'scorm', hostname,
      })).toBe(true);
    },
  );

  it('does not change new-course uploads, H5P, PDFs or unrelated hosts', () => {
    for (const [isEditing, tipoConteudo, hostname] of [
      [false, 'scorm', 'airtrust.online'],
      [true, 'h5p', 'airtrust.online'],
      [true, 'pdf', 'staging.airtrust.pages.dev'],
      [true, 'scorm', 'localhost'],
      [true, 'scorm', 'qa.example.test'],
    ] as const) {
      expect(shouldSaveScormMetadataWithoutZip({
        isEditing, tipoConteudo, hostname,
      })).toBe(false);
    }
  });
});
