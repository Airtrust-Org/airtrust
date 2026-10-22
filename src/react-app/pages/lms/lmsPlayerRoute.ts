import type { TipoConteudo } from '@/react-app/hooks/useLms';

/** One canonical route for catalog cards, enrolments and review links. */
export function getLmsPlayerRoute(
  contentType: TipoConteudo, matriculaId: number, review = false,
): string {
  if (!Number.isSafeInteger(matriculaId) || matriculaId <= 0) {
    throw new Error('INVALID_LMS_ENROLLMENT_ROUTE');
  }
  const variant = contentType === 'native' ? 'native/'
    : contentType === 'h5p' ? 'h5p/'
      : contentType === 'pdf' ? 'pdf/'
        : contentType === 'pptx' ? 'pptx/' : '';
  return `/lms/player/${variant}${matriculaId}${review ? '?review=1' : ''}`;
}
