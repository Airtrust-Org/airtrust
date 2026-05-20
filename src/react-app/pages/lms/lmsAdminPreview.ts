import type { LmsCurso } from '@/react-app/hooks/useLms';

export type AdminPreviewableCourse = Pick<
  LmsCurso,
  'id' | 'tipo_conteudo' | 'scorm_launch_file' | 'h5p_conteudo_id' | 'pdf_r2_key' | 'pptx_r2_key'
>;

export function supportsAdminCoursePreview(curso?: Partial<AdminPreviewableCourse> | null) {
  if (!curso?.tipo_conteudo) return false;
  if (curso.tipo_conteudo === 'scorm') return Boolean(curso.scorm_launch_file?.trim());
  if (curso.tipo_conteudo === 'pdf') return Boolean(curso.pdf_r2_key?.trim());
  if (curso.tipo_conteudo === 'pptx') return Boolean(curso.pptx_r2_key?.trim());
  return false;
}

export function getAdminCoursePreviewPath(curso?: Partial<AdminPreviewableCourse> | null) {
  if (!curso?.id || !supportsAdminCoursePreview(curso)) return null;
  return `/lms/player/preview/${curso.id}`;
}
