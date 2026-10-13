import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import NativeCoursePreview, { selectNativeLessonTemplate } from '../react-app/pages/lms/native/NativeCoursePreview';
import type { NativeLearnerCourse } from '../../worker-airtrust/src/lib/lms/lms-native-course-contract';
import {
  canReadNativeReviewZipPath,
  isNativeReviewStagingHost,
  isReviewableLegacyScorm,
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

describe('SCORM original and Native review remain separate', () => {
  it('only lists active physical SCORM packages in the read-only legacy player', () => {
    const pkg = { tipo_conteudo: 'scorm', scorm_package_r2_prefix: 'private/tenant/course', ativo: 1 };
    expect(isReviewableLegacyScorm(pkg)).toBe(true);
    expect(isReviewableLegacyScorm({ ...pkg, tipo_conteudo: 'native' })).toBe(false);
    expect(isReviewableLegacyScorm({ ...pkg, tipo_conteudo: 'h5p' })).toBe(false);
    expect(isReviewableLegacyScorm({ ...pkg, ativo: 0 })).toBe(false);
    expect(isReviewableLegacyScorm({ ...pkg, scorm_package_r2_prefix: null })).toBe(false);
  });
});

describe('Native lesson original-style review regression', () => {
  const image = { type: 'image', assetId: 'image-1', alt: 'Equipe de resposta' } as const;
  const sample = (kind: 'lesson' | 'scenario' | 'assessment', template = 'wide-top') => ({
    id: 'unit-1', title: 'Houve derramamento. A resposta muda imediatamente',
    kind, presentationTemplate: template, blocks: [image], questionIds: ['q1'],
  }) as Parameters<typeof selectNativeLessonTemplate>[1];

  it('retains author-defined presentation variants instead of forcing a compact template', () => {
    for (const template of ['wide-top', 'wide-bottom', 'image-overlay', 'banner-list', 'double-crop']) {
      expect(selectNativeLessonTemplate(0, sample('scenario', template))).toBe(template);
    }
    const denseAssessment = { ...sample('assessment', 'wide-top'), questionIds: ['q1', 'q2', 'q3'] };
    expect(selectNativeLessonTemplate(0, denseAssessment)).toBe('editorial-dashboard');
  });

  it('protects readable fallback templates for very long or media-free lessons', () => {
    const withoutMedia = { ...sample('lesson'), blocks: [] } as Parameters<typeof selectNativeLessonTemplate>[1];
    expect(selectNativeLessonTemplate(0, withoutMedia)).toBe('editorial-dashboard');
    expect(selectNativeLessonTemplate(0, sample('lesson', 'wide-top'))).toBe('wide-top');
    const dense = { ...sample('lesson', 'wide-top'), title: 'T'.repeat(900) };
    expect(selectNativeLessonTemplate(0, dense)).toBe('media-right');
  });

  it('renders original-style training typography, preserved question and all answers', () => {
    const title = 'Houve derramamento. A resposta muda imediatamente';
    const course = {
      courseId: 'costa-do-sol-review', packageVersion: 'test', title: 'Resíduos',
      units: [sample('scenario')], assets: [],
      questions: [{ id: 'q1', prompt: title, options: [
        { id: 'a', text: 'Isolar o local' }, { id: 'b', text: 'Ignorar a ocorrência' },
      ] }],
    } as unknown as NativeLearnerCourse;
    const html = renderToStaticMarkup(createElement(NativeCoursePreview, {
      course, resolveAssetHref: () => null,
    }));
    expect(html).toContain('data-native-template="wide-top"');
    expect(html).toContain('text-[clamp(30px,3.3vw,52px)]');
    expect(html).toContain('<legend class="max-w-full');
    expect(html).toContain('Houve derramamento. A resposta muda imediatamente');
    expect(html).toContain('Isolar o local');
    expect(html).toContain('Ignorar a ocorrência');
    expect(html).toContain('aria-label="Posição de navegação"');
    expect(html).toContain('Prévia técnica');
  });
});
