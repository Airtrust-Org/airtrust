import { describe, expect, it } from 'vitest';
import { supportsAdminCoursePreview, getAdminCoursePreviewPath } from '@/react-app/pages/lms/lmsAdminPreview';

describe('supportsAdminCoursePreview — canonical content readiness check', () => {
  it('SCORM with launch file → ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'scorm',
      scorm_launch_file: 'index.html',
    })).toBe(true);
  });

  it('SCORM with empty launch file → not ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'scorm',
      scorm_launch_file: '',
    })).toBe(false);
  });

  it('SCORM with whitespace-only launch file → not ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'scorm',
      scorm_launch_file: '   ',
    })).toBe(false);
  });

  it('SCORM without launch file → not ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'scorm',
      scorm_launch_file: null,
    })).toBe(false);
  });

  it('SCORM with undefined launch file → not ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'scorm',
    } as any)).toBe(false);
  });

  it('H5P with package prefix → ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'h5p',
      scorm_package_r2_prefix: 'lms/h5p/6/1/',
    })).toBe(true);
  });

  it('H5P without package prefix → not ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'h5p',
      scorm_package_r2_prefix: null,
    })).toBe(false);
  });

  it('PDF with r2_key → ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'pdf',
      pdf_r2_key: 'lms/pdf/6/1/slides.pdf',
    })).toBe(true);
  });

  it('PDF without r2_key → not ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'pdf',
      pdf_r2_key: null,
    })).toBe(false);
  });

  it('PPTX with r2_key → ready', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'pptx',
      pptx_r2_key: 'lms/pptx/6/1/deck.pptx',
    })).toBe(true);
  });

  it('Video → never ready (no preview support)', () => {
    expect(supportsAdminCoursePreview({
      tipo_conteudo: 'video',
    } as any)).toBe(false);
  });

  it('Undefined/null tipo_conteudo → not ready', () => {
    expect(supportsAdminCoursePreview({} as any)).toBe(false);
    expect(supportsAdminCoursePreview(null)).toBe(false);
    expect(supportsAdminCoursePreview(undefined)).toBe(false);
  });
});

describe('getAdminCoursePreviewPath', () => {
  it('returns path when content is ready', () => {
    expect(getAdminCoursePreviewPath({
      id: 27,
      tipo_conteudo: 'scorm',
      scorm_launch_file: 'index.html',
    })).toBe('/lms/player/preview/27');
  });

  it('returns null when content is not ready', () => {
    expect(getAdminCoursePreviewPath({
      id: 27,
      tipo_conteudo: 'scorm',
      scorm_launch_file: null,
    })).toBeNull();
  });

  it('returns null when id is missing', () => {
    expect(getAdminCoursePreviewPath({
      tipo_conteudo: 'scorm',
      scorm_launch_file: 'index.html',
    } as any)).toBeNull();
  });

  it('returns path for H5P with package', () => {
    expect(getAdminCoursePreviewPath({
      id: 10,
      tipo_conteudo: 'h5p',
      scorm_package_r2_prefix: 'lms/h5p/6/10/',
    })).toBe('/lms/player/preview/10');
  });
});
