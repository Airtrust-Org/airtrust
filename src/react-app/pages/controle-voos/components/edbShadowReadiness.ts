export type EdbShadowReadinessStatus = 'ready' | 'review' | 'not_ready';
export type EdbShadowTechnicalStatus =
  | 'source_unavailable'
  | 'requires_review'
  | 'preliminarily_available';

export interface EdbShadowReadinessAssessment {
  classification: 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT';
  officialReferenceCompared: false;
  paperReferenceRequired: true;
  notices: {
    officialLogbook: false;
    replacesPaper: false;
    containsSignature: false;
    persistsRegulatedRecord: false;
    authorizesReturnToService: false;
  };
  divergence: {
    caseResult: 'matched' | 'divergent' | 'interrupted';
    recommendation: 'continue' | 'review' | 'stop';
    maxSeverity: string;
    findings: Array<{ category: string; severity: string; causeCode: string; field: string }>;
    readiness: {
      score: number;
      status: EdbShadowReadinessStatus;
      fieldAgreementPercent: number;
      completenessPercent: number;
    };
  };
  technicalStatus: {
    sourceAvailable: boolean;
    detailedContractLoaded: false;
    discrepancyDetailsAvailable: false;
    officialEffect: 'NONE';
    status: EdbShadowTechnicalStatus;
    findingCodes: string[];
  };
}

export interface EdbShadowReadinessSummary {
  title: string;
  tone: 'ok' | 'warning' | 'blocked';
  reviewRequired: boolean;
  findingCount: number;
  readinessScore: number;
  completenessPercent: number;
  technicalMessage: string;
}

export function summarizeEdbShadowReadiness(
  assessment: EdbShadowReadinessAssessment,
): EdbShadowReadinessSummary {
  const readiness = assessment.divergence.readiness;
  const reviewRequired =
    readiness.status !== 'ready' ||
    assessment.divergence.recommendation !== 'continue' ||
    assessment.technicalStatus.status !== 'preliminarily_available';

  const tone: EdbShadowReadinessSummary['tone'] =
    readiness.status === 'not_ready' || assessment.divergence.recommendation === 'stop'
      ? 'blocked'
      : reviewRequired
        ? 'warning'
        : 'ok';

  const technicalMessage = !assessment.technicalStatus.sourceAvailable
    ? 'Situação técnica não disponível na fonte shadow.'
    : assessment.technicalStatus.status === 'requires_review'
      ? 'Situação técnica exige revisão humana.'
      : 'Situação técnica preliminar disponível.';

  return {
    title:
      tone === 'ok'
        ? 'Pré-avaliação shadow disponível'
        : tone === 'blocked'
          ? 'Pré-avaliação shadow bloqueada'
          : 'Pré-avaliação shadow requer revisão',
    tone,
    reviewRequired,
    findingCount: assessment.divergence.findings.length,
    readinessScore: readiness.score,
    completenessPercent: readiness.completenessPercent,
    technicalMessage,
  };
}
