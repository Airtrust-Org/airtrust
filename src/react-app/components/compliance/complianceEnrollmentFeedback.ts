import { showToast } from '@/react-app/utils/toast';

type EnrollmentFeedback = {
  auto_enrollment?: {
    created?: number;
    reactivated?: number;
    preserved?: number;
    skipped_valid_evidence?: number;
    unavailable_course?: number;
  } | null;
  auto_enrollment_warning?: string | null;
};

export function notifyComplianceSaveWithEnrollment(result: unknown, successMessage: string) {
  const details = result && typeof result === 'object' ? result as EnrollmentFeedback : null;
  if (details?.auto_enrollment_warning) {
    const reason = details.auto_enrollment_warning === 'LMS_COURSE_MAPPING_UNAVAILABLE'
      ? 'Não há um único curso LMS publicado vinculado ao modelo. Verifique o vínculo curso–qualificação.'
      : 'Ocorreu uma falha na sincronização de matrículas. O requisito foi salvo, mas as matrículas exigem verificação.';
    showToast.error(`${successMessage} ${reason}`);
    return;
  }
  const created = Number(details?.auto_enrollment?.created || 0);
  const reactivated = Number(details?.auto_enrollment?.reactivated || 0);
  const total = created + reactivated;
  showToast.success(total > 0
    ? `${successMessage} ${total} matrícula(s) sincronizada(s), sem envio de e-mail.`
    : successMessage);
}
