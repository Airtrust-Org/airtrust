import type { LmsCurso } from '@/react-app/hooks/useLms';

export type AdminPreviewableCourse = Pick<
  LmsCurso,
  'id' | 'tipo_conteudo' | 'scorm_launch_file' | 'scorm_package_r2_prefix' | 'h5p_conteudo_id' | 'pdf_r2_key' | 'pptx_r2_key'
>;

/**
 * Função CANÔNICA que verifica se um curso tem conteúdo carregado
 * e está pronto para preview. USAR ESTA em todos os lugares:
 * - LmsCatalogo (badge "Player pronto" / "Sem pacote")
 * - LmsAdminCursos (coluna "Conteúdo")
 * - LmsCursoDetalhe (botão "Abrir preview")
 * - getAdminCoursePreviewPath (decisão de rota de preview)
 */
export function supportsAdminCoursePreview(curso?: Partial<AdminPreviewableCourse> | null) {
  if (!curso?.tipo_conteudo) return false;
  if (curso.tipo_conteudo === 'scorm') return Boolean(curso.scorm_launch_file?.trim());
  if (curso.tipo_conteudo === 'h5p') return Boolean(curso.scorm_package_r2_prefix?.trim());
  if (curso.tipo_conteudo === 'pdf') return Boolean(curso.pdf_r2_key?.trim());
  if (curso.tipo_conteudo === 'pptx') return Boolean(curso.pptx_r2_key?.trim());
  return false;
}

export function getAdminCoursePreviewPath(curso?: Partial<AdminPreviewableCourse> | null) {
  if (!curso?.id || !supportsAdminCoursePreview(curso)) return null;
  return `/lms/player/preview/${curso.id}`;
}
