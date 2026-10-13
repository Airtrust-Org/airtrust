import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NativeCoursePreview, { selectNativeLessonTemplate } from '../react-app/pages/lms/native/NativeCoursePreview';
import type { NativeLearnerCourse } from '../../worker-airtrust/src/lib/lms/lms-native-course-contract';
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

describe('Native responsive training viewport', () => {
  const image = { type: 'image', assetId: 'image-1', alt: 'Equipe de resposta' } as const;
  const sample = (kind: 'lesson' | 'scenario' | 'assessment', template = 'wide-top') => ({
    id: 'unit-1', title: 'Houve derramamento. A resposta muda imediatamente',
    kind, presentationTemplate: template, blocks: [image], questionIds: ['q1'],
  }) as Parameters<typeof selectNativeLessonTemplate>[1];

  it('keeps scenario and assessment options ahead of wide hero media', () => {
    for (const template of ['wide-top', 'wide-bottom', 'image-overlay', 'banner-list', 'double-crop']) {
      expect(selectNativeLessonTemplate(0, sample('scenario', template))).toBe('media-right');
      expect(selectNativeLessonTemplate(0, sample('assessment', template))).toBe('media-right');
    }
  });

  it('retains editorial and compact media layouts for content lessons', () => {
    const withoutMedia = { ...sample('lesson'), blocks: [] } as Parameters<typeof selectNativeLessonTemplate>[1];
    expect(selectNativeLessonTemplate(0, withoutMedia)).toBe('editorial-dashboard');
    expect(selectNativeLessonTemplate(0, sample('lesson', 'wide-top'))).toBe('wide-top');
    const dense = { ...sample('lesson', 'wide-top'), title: 'T'.repeat(900) };
    expect(selectNativeLessonTemplate(0, dense)).toBe('media-right');
  });

  it('renders a full-viewport scenario, compact title and a single visible duplicate prompt', () => {
    const title = 'Houve derramamento. A resposta muda imediatamente';
    const course = {
      courseId: 'costa-do-sol-review', packageVersion: 'test', title: 'Resíduos',
      units: [sample('scenario')], assets: [],
      questions: [{ id: 'q1', prompt: title, options: [
        { id: 'a', text: 'Isolar o local' }, { id: 'b', text: 'Ignorar a ocorrência' },
      ] }],
    } as unknown as NativeLearnerCourse;
    const html = renderToStaticMarkup(createElement(NativeCoursePreview, {
      course, resolveAssetHref: () => null, fullscreen: true,
    }));
    expect(html).toContain('data-native-template="media-right"');
    expect(html).toContain('h-full min-h-0 w-full max-w-none');
    expect(html).toContain('text-[clamp(24px,2.3vw,34px)]');
    expect(html).toContain('<legend class="sr-only">' + title + '</legend>');
    expect(html).toContain('Isolar o local');
    expect(html).toContain('Ignorar a ocorrência');
  });
});
