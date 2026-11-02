import { describe, expect, it } from 'vitest';
import {
  blocksUnsafeScormTypeConversion,
  shouldSaveScormMetadataWithoutZip,
} from '../lmsScormCandidateIntent';

describe('SCORM upload intent for existing courses', () => {
  it.each(['airtrust.online', 'staging.airtrust.pages.dev'])(
    'edits existing SCORM without automatically uploading or activating on %s',
    (hostname) => {
      const input = {
        isEditing: true, storedTipoConteudo: 'scorm',
        tipoConteudo: 'scorm', hostname,
      };
      expect(shouldSaveScormMetadataWithoutZip(input)).toBe(true);
      expect(blocksUnsafeScormTypeConversion(input)).toBe(false);
    },
  );

  it.each(['pdf', 'h5p', 'video', 'pptx'])(
    'refuses conversion from existing %s to SCORM without an active package',
    (storedTipoConteudo) => {
      const input = {
        isEditing: true, storedTipoConteudo,
        tipoConteudo: 'scorm', hostname: 'airtrust.online',
      };
      expect(blocksUnsafeScormTypeConversion(input)).toBe(true);
      expect(shouldSaveScormMetadataWithoutZip(input)).toBe(false);
    },
  );

  it('preserves new-course creation, non-SCORM uploads and local preview', () => {
    for (const [isEditing, storedTipoConteudo, tipoConteudo, hostname] of [
      [false, undefined, 'scorm', 'airtrust.online'],
      [true, 'h5p', 'h5p', 'airtrust.online'],
      [true, 'pdf', 'pdf', 'staging.airtrust.pages.dev'],
      [true, 'scorm', 'scorm', 'localhost'],
      [true, 'pdf', 'scorm', 'localhost'],
    ] as const) {
      const input = { isEditing, storedTipoConteudo, tipoConteudo, hostname };
      expect(shouldSaveScormMetadataWithoutZip(input)).toBe(false);
      expect(blocksUnsafeScormTypeConversion(input)).toBe(false);
    }
  });
});
