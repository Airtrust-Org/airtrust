import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, BarChart3, Loader2, ShieldAlert, Wrench } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';
import EdbShadowPrototype from './EdbShadowPrototype';

const ASSESSMENT_CLASSIFICATION = 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT';

type AssessmentFinding = {
  category: string;
  severity: string;
  causeCode: string;
  field: string;
};

type AssessmentData = {
  schemaVersion: 'edb.shadow-assessment.v1';
  classification: typeof ASSESSMENT_CLASSIFICATION;
  officialReferenceCompared: false;
  paperReferenceRequired: true;
  comparisonBasis: 'SELF_BASELINE_WITH_SANITIZED_PROJECTION_FINDINGS';
  notices: {
    officialLogbook: false;
    replacesPaper: false;
    containsSignature: false;
    persistsRegulatedRecord: false;
    authorizesReturnToService: false;
  };
  divergence: {
    recommendation: 'continue' | 'review' | 'stop';
    maxSeverity: 'NONE' | 'OBSERVATION' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    findings: AssessmentFinding[];
    metrics: {
      comparisonFieldCount: number;
      matchingFieldCount: number;
      divergenceCount: number;
      completenessFindingCount: number;
      projectionFindingCount: number;
      unknownFieldCount: number;
    };
    readiness: {
      score: number;
      status: 'ready' | 'review' | 'not_ready';
      fieldAgreementPercent: number;
      completenessPercent: number;
    };
    evidence: { fingerprint: string };
  };
  technicalStatus: {
    targetSchemaVersion: 'edb.technical-status.shadow.v1';
    officialEffect: 'NONE';
    sourceAvailable: boolean;
    detailedContractLoaded: false;
    discrepancyDetailsAvailable: false;
    status: 'source_unavailable' | 'requires_review' | 'preliminarily_available';
    findingCodes: string[];
  };
};

type LoadState = 'idle' | 'loading' | 'loaded' | 'unavailable';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseAssessment(payload: unknown): AssessmentData | null {
  if (!isRecord(payload) || payload.success !== true || !isRecord(payload.data)) return null;
  const data = payload.data;
  if (
    data.schemaVersion !== 'edb.shadow-assessment.v1' ||
    data.classification !== ASSESSMENT_CLASSIFICATION ||
    data.officialReferenceCompared !== false ||
    data.paperReferenceRequired !== true ||
    !isRecord(data.divergence) ||
    !isRecord(data.technicalStatus)
  ) {
    return null;
  }
  const divergence = data.divergence;
  if (
    !isRecord(divergence.metrics) ||
    !isRecord(divergence.readiness) ||
    !isRecord(divergence.evidence) ||
    !Array.isArray(divergence.findings) ||
    !isNumber(divergence.metrics.divergenceCount) ||
    !isNumber(divergence.metrics.completenessFindingCount) ||
    !isNumber(divergence.metrics.projectionFindingCount) ||
    !isNumber(divergence.readiness.score) ||
    typeof divergence.readiness.status !== 'string' ||
    typeof divergence.recommendation !== 'string' ||
    typeof divergence.maxSeverity !== 'string' ||
    typeof divergence.evidence.fingerprint !== 'string'
  ) {
    return null;
  }
  return data as unknown as AssessmentData;
}

function recommendationLabel(value: AssessmentData['divergence']['recommendation']): string {
  if (value === 'stop') return 'Interromper o caso';
  if (value === 'review') return 'Revisão necessária';
  return 'Pode seguir para comparação controlada';
}

function technicalStatusLabel(value: AssessmentData['technicalStatus']['status']): string {
  if (value === 'source_unavailable') return 'Fonte técnica detalhada indisponível';
  if (value === 'requires_review') return 'Situação técnica requer revisão';
  return 'Situação técnica preliminar disponível';
}

function displayCode(value: string): string {
  return value.split('_').join(' ').toLowerCase();
}

function AssessmentPanel({ flightId }: { flightId: string }) {
  const [state, setState] = useState<LoadState>('idle');
  const [assessment, setAssessment] = useState<AssessmentData | null>(null);

  useEffect(() => {
    let active = true;
    if (!/^\d+$/.test(flightId) || Number(flightId) <= 0) {
      setState('idle');
      setAssessment(null);
      return () => {
        active = false;
      };
    }

    setState('loading');
    setAssessment(null);
    void fetchWithAuth(`/api/edb/shadow-assessment/${flightId}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null);
        const parsed = response.ok ? parseAssessment(payload) : null;
        if (!active) return;
        if (!parsed) {
          setState('unavailable');
          return;
        }
        setAssessment(parsed);
        setState('loaded');
      })
      .catch(() => {
        if (active) setState('unavailable');
      });

    return () => {
      active = false;
    };
  }, [flightId]);

  if (state === 'idle') {
    return (
      <section className="mx-auto mt-6 max-w-7xl rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        Carregue um voo para exibir a avaliação preliminar de prontidão e situação técnica.
      </section>
    );
  }

  if (state === 'loading') {
    return (
      <section className="mx-auto mt-6 flex max-w-7xl items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/20 dark:text-blue-200">
        <Loader2 className="h-4 w-4 animate-spin" /> Calculando avaliação preliminar sanitizada…
      </section>
    );
  }

  if (!assessment || state === 'unavailable') {
    return (
      <section
        role="alert"
        className="mx-auto mt-6 max-w-7xl rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200"
      >
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Avaliação preliminar indisponível. Nenhum dado operacional foi alterado.
        </div>
      </section>
    );
  }

  const { divergence, technicalStatus } = assessment;
  return (
    <section className="mx-auto mt-6 max-w-7xl space-y-5 px-4 pb-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-700 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h2 className="font-semibold text-amber-950 dark:text-amber-100">
              Avaliação preliminar — referência oficial ainda não comparada
            </h2>
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              O resultado usa somente completude do rascunho e achados sanitizados da projeção.
              A comparação com o Diário de Bordo em papel continua obrigatória e o papel permanece
              como fonte oficial.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Prontidão', `${divergence.readiness.score}%`],
          ['Recomendação', recommendationLabel(divergence.recommendation)],
          ['Divergências sanitizadas', divergence.metrics.divergenceCount],
          ['Campos incompletos', divergence.metrics.completenessFindingCount],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          >
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <BarChart3 className="h-5 w-5" /> Achados agregados
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Severidade máxima: {divergence.maxSeverity}. Achados de projeção:{' '}
            {divergence.metrics.projectionFindingCount}. A evidência técnica é identificada por{' '}
            <code>{divergence.evidence.fingerprint}</code>.
          </p>
          {divergence.findings.length === 0 ? (
            <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">
              Nenhum achado sanitizado nesta avaliação preliminar.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {divergence.findings.slice(0, 20).map((finding, index) => (
                <li
                  key={`${finding.category}-${finding.field}-${index}`}
                  className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700"
                >
                  <p className="font-medium text-slate-800 dark:text-slate-100">
                    {displayCode(finding.category)} · {finding.severity}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                    {finding.field}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
            <Wrench className="h-5 w-5" /> Situação técnica shadow
          </h2>
          <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">
            {technicalStatusLabel(technicalStatus.status)}
          </p>
          <dl className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex justify-between gap-3">
              <dt>Contrato-alvo</dt>
              <dd className="font-mono text-xs">{technicalStatus.targetSchemaVersion}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Efeito oficial</dt>
              <dd>{technicalStatus.officialEffect}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Detalhes de discrepâncias</dt>
              <dd>{technicalStatus.discrepancyDetailsAvailable ? 'Disponíveis' : 'Não disponíveis'}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-red-700 dark:text-red-300">
            Esta seção não declara retorno ao serviço, liberação da aeronave, ciência do PIC ou ato
            de manutenção.
          </p>
          {technicalStatus.findingCodes.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-700 dark:text-amber-300">
              {technicalStatus.findingCodes.map((code) => (
                <li key={code}>{displayCode(code)}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

export default function EdbShadowPrototypeWithAssessment() {
  const [searchParams] = useSearchParams();
  const flightId = searchParams.get('flightId') || '';
  return (
    <>
      <EdbShadowPrototype />
      <AssessmentPanel flightId={flightId} />
    </>
  );
}
