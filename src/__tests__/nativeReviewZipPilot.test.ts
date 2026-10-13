import { describe, expect, it } from 'vitest';
import {
  canReadNativeReviewZipPath,
  isNativeReviewStagingHost,
  loadPrivateNativeReviewArchive,
} from '../react-app/pages/lms/NativeReviewZipPilot';

describe('Native staging private ZIP review', () => {
  it('limits the review host to exact staging or local development', () => {
    expect(isNativeReviewStagingHost('staging.airtrust.pages.dev')).toBe(true);
    expect(isNativeReviewStagingHost('airtrust.online')).toBe(false);
    expect(isNativeReviewStagingHost('staging.airtrust.pages.dev.evil.example')).toBe(false);
    expect(isNativeReviewStagingHost('airtrust-api-staging.airtrust.workers.dev')).toBe(false);
  });
  it('only extracts candidate JSON and their local media', () => {
    expect(canReadNativeReviewZipPath('Curso/candidate/native-private-candidate.json')).toBe(true);
    expect(canReadNativeReviewZipPath('Curso/draft/media/media/s01.jpg')).toBe(true);
    expect(canReadNativeReviewZipPath('Curso/draft/media/assets/logo.png')).toBe(true);
    expect(canReadNativeReviewZipPath('Curso/candidate/conversion-review.json')).toBe(false);
    expect(canReadNativeReviewZipPath('Curso/legacyAuthoringModel.json')).toBe(false);
    expect(canReadNativeReviewZipPath('../Curso/candidate/native-private-candidate.json')).toBe(false);
    expect(canReadNativeReviewZipPath('/Curso/draft/media/media/s01.jpg')).toBe(false);
    expect(canReadNativeReviewZipPath('Curso\\draft\\media\\media\\s01.jpg')).toBe(false);
  });
  it('rejects arbitrary or untrusted ZIP files before any decompression', async () => {
    const file = new File(['not an approved archive'], 'my-courses.zip', { type: 'application/zip' });
    await expect(loadPrivateNativeReviewArchive(file)).rejects.toThrow(/pacote privado de nove cursos/);
  });
});
