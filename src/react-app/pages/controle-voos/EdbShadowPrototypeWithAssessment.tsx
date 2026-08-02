import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  Loader2,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { z } from 'zod';
import { fetchWithAuth } from '@/react-app/config/api';
import EdbShadowPrototype from './EdbShadowPrototype';

const ASSESSMENT_CLASSIFICATION = 'NON_OFFICIAL_PRELIMINARY_SHADOW_ASSESSMENT';

const assessmentFindingSchema = z
  .object({
    category: z.string(),
    severity: z.string(),
    causeCode: z.string(),
    field: z.string(),
  })
  .strict();

const assessmentDataSchema = z
  .object({
    schemaVersion: z.literal('edb.shadow-assessment.v1'),
    classification: z.literal(ASSESSMENT_CLASSIFICATION),
    officialReferenceCompared: z.literal(false),
    paperReferenceRequired: z.literal(true),
    comparisonBasis: z.literal('SELF_BASELINE_WITH_SANITIZED_PROJECTION_FINDINGS'),
    notices: z
      .object({
        officialLogbook: z.literal(false),
        replacesPaper: z.literal(false),
        containsSignature: z.literal(false),
        persistsRegulatedRecord: z.literal(false),
        authorizesReturnToService: z.literal(false),
      })
      .strict(),
    divergence: z
      .object({
        recommendation: z.enum(['continue', 'review', 'stop']),
        maxSeverity: z.enum([
          'NONE',
          'OBSERVATION',
          'LOW',
          'MEDIUM',
          'HIGH',
          'CRITICAL',
        ]),
        findings: z.array(assessmentFindingSchema),
        metrics: z
          .object({
            comparisonFieldCount: z.number().finite().nonnegative(),
            matchingFieldCount: z.number().finite().nonnegative(),
            divergenceCount: z.number().finite().nonnegative(),
            completenessFindingCount: z.number().finite().nonnegative(),
            projectionFindingCount: z.number().finite().nonnegative(),
            unknownFieldCount: z.number().finite().nonnegative(),
          })
          .strict(),
        readiness: z
          .object({
            score: z.number().finite().min(0).max(100),
            status: z.enum(['ready', 'review', 'not_ready']),
            fieldAgreementPercent: z.number().finite().min(0).max(100),
            completenessPercent: z.number().finite().min(0).max(100),
          })
          .strict(),
        evidence: z
          .object({ fingerprint: z.string().regex(/^fnv1a32:[0-9a-f]{8}$/) })
          .strict(),
      })
      .passthrough(),
    technicalStatus: z
      .object({
        targetSchemaVersion: z.literal('edb.technical-status.shadow.v1'),
        officialEffect: z.literal('NONE'),
        sourceAvailable: z.boolean(),
        detailedContractLoaded: z.literal(false),
        discrepancyDetailsAvailable: z.literal(false),
        status: z.enum([
          'source_unavailable',
          'requires_review',
          'preliminarily_available',
        ]),
        findingCodes: z.array(z.string()),
      })
      .strict(),
  })
  .strict();

type AssessmentData = z.infer<typeof assessmentDataSchema>;
type LoadState = 'idle' | 'loading' | 'loaded' | 'unavailable';

function parseAssessment(payload: unknown): AssessmentData | null {
  const envelope = z
    .object({ success: z.literal(true), data: assessmentDataSchema })
    .strict()
    .safeParse(payload);
  return envelope.success ? envelope.data.data : null;
}

function recommendationLabel(
  value: AssessmentData['divergence']['recommendation'],
): string {
  if (value === 'stop') return 'Interromper o caso';
  if (value === 'review') return 'Revisão necessária';
  return 'Pode seguir para comparação controlada';
}

function technicalStatusLabel(
  value: AssessmentData['technicalStatus']['status'],
): string {
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
              <dd>
                {technicalStatus.discrepancyDetailsAvailable ? 'Disponíveis' : 'Não disponíveis'}
              </dd>
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
