/**
 * External examination and compliance are separate from SCORM study.
 * A trusted Worker projection must supply receipts and qualification history:
 * this pure reducer does not authenticate a student or mint certificates.
 */
export type TrainingScope = Readonly<{
  empresaId: number;
  funcionarioId: number;
  matriculaId: number;
  cicloId: number;
  courseEditionSha256: string;
}>;

export type StudyReceipt = Readonly<{
  scope: TrainingScope;
  validatedByWorker: true;
  completedAt: string;
}>;

export type ExamReceipt = Readonly<{
  scope: TrainingScope;
  validatedByWorker: true;
  examSha256: string;
  policySha256: string;
  result: 'PASSED' | 'FAILED';
  completedAt: string;
}>;

export type QualificationStatus = Readonly<{
  // From the existing canonical qualification history, not from study progress.
  issuedAt: string;
  expiresAt: string | null;
  isActive: boolean;
}>;

export type TrainingComplianceInput = Readonly<{
  scope: TrainingScope;
  today: string; // Date in canonical company/reporting timezone, YYYY-MM-DD.
  study: StudyReceipt | null;
  exam: ExamReceipt | null;
  enrolledCycleCompleted: boolean;
  qualificationForThisCycle: QualificationStatus | null;
  previousQualification: QualificationStatus | null;
  operationalDeadline: string | null;
}>;

export type TrainingComplianceProjection = Readonly<{
  learning:
    | 'STUDY_IN_PROGRESS' | 'EXAM_PENDING' | 'EXAM_FAILED'
    | 'AWAITING_OFFICIAL_ISSUANCE' | 'ENROLLMENT_COMPLETED';
  compliance: 'VALID' | 'EXPIRED' | 'NOT_QUALIFIED';
  validUntil: string | null;
  renewalExtendsValidity: false;
  trainingDeadline: 'NOT_SET' | 'ON_TIME' | 'OVERDUE';
  examEligible: boolean;
  qualificationIssuanceEligible: boolean;
  warnings: readonly string[];
}>;

const SHA = /^[a-f0-9]{64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (v: string): boolean => {
  if (!DATE.test(v)) return false;
  const date = new Date(v + 'T00:00:00.000Z');
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === v;
};
const positive = (v: number): boolean => Number.isSafeInteger(v) && v > 0;
const sameScope = (a: TrainingScope, b: TrainingScope): boolean =>
  a.empresaId === b.empresaId && a.funcionarioId === b.funcionarioId &&
  a.matriculaId === b.matriculaId && a.cicloId === b.cicloId &&
  a.courseEditionSha256 === b.courseEditionSha256;

function validScope(s: TrainingScope): boolean {
  return Boolean(s) && positive(s.empresaId) && positive(s.funcionarioId) &&
    positive(s.matriculaId) && positive(s.cicloId) &&
    typeof s.courseEditionSha256 === 'string' && SHA.test(s.courseEditionSha256);
}

function validQualification(q: QualificationStatus | null, today: string): boolean {
  // An old qualification remains effective on renewal until its real expiry,
  // not until completion of the study or the external exam.
  return !!q && q.isActive === true && validDate(q.issuedAt) &&
    q.issuedAt <= today && (q.expiresAt === null ||
      (validDate(q.expiresAt) && q.expiresAt >= today));
}

export function projectExternalExamCompliance(
  input: TrainingComplianceInput,
): TrainingComplianceProjection {
  if (!validScope(input.scope) || !validDate(input.today) ||
      (input.operationalDeadline !== null && !validDate(input.operationalDeadline))) {
    throw new Error('TRAINING_COMPLIANCE_SCOPE_OR_DATE_INVALID');
  }
  const study = input.study !== null && input.study.validatedByWorker === true &&
    sameScope(input.study.scope, input.scope) && validDate(input.study.completedAt);
  const exam = study && input.exam !== null &&
    input.exam.validatedByWorker === true &&
    sameScope(input.exam.scope, input.scope) &&
    SHA.test(input.exam.examSha256) && SHA.test(input.exam.policySha256) &&
    validDate(input.exam.completedAt) &&
    input.exam.completedAt >= input.study!.completedAt;
  const examPassed = Boolean(exam && input.exam?.result === 'PASSED');
  const examFailed = Boolean(exam && input.exam?.result === 'FAILED');
  const qualificationIssuanceEligible = examPassed && !input.enrolledCycleCompleted;
  const learning = input.enrolledCycleCompleted
    ? 'ENROLLMENT_COMPLETED'
    : examPassed ? 'AWAITING_OFFICIAL_ISSUANCE'
    : examFailed ? 'EXAM_FAILED'
    : study ? 'EXAM_PENDING'
    : 'STUDY_IN_PROGRESS';

  // Never claim qualification compliance from a STUDY_COMPLETED receipt, exam
  // attempt, or an unissued passed exam. Use canonical issued qualification.
  const current = input.enrolledCycleCompleted &&
    validQualification(input.qualificationForThisCycle, input.today)
    ? input.qualificationForThisCycle : null;
  const previous = validQualification(input.previousQualification, input.today)
    ? input.previousQualification : null;
  const recognized = current ?? previous;
  const expired = [input.qualificationForThisCycle, input.previousQualification]
    .some(q => q && q.isActive && q.expiresAt !== null &&
      validDate(q.expiresAt) && q.expiresAt < input.today);
  const warnings: string[] = [];
  if (input.enrolledCycleCompleted && !examPassed) {
    warnings.push('ENROLLMENT_COMPLETION_REQUIRES_VERIFIED_EXTERNAL_EXAM');
  }
  if (examPassed && !input.enrolledCycleCompleted) {
    warnings.push('EXAM_PASSED_AWAITING_CANONICAL_COMPLETION');
  }
  if (!recognized) {
    warnings.push('NO_VALID_ISSUED_QUALIFICATION');
  }
  const trainingDeadline = input.operationalDeadline === null
    ? 'NOT_SET' : input.today > input.operationalDeadline &&
      !input.enrolledCycleCompleted ? 'OVERDUE' : 'ON_TIME';
  return {
    learning,
    compliance: recognized ? 'VALID' : expired ? 'EXPIRED' : 'NOT_QUALIFIED',
    validUntil: recognized?.expiresAt ?? null,
    renewalExtendsValidity: false,
    trainingDeadline,
    examEligible: study,
    qualificationIssuanceEligible,
    warnings,
  };
}
