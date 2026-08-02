import { type FormEvent, useState } from 'react';
import { Download, FileCheck2, Loader2, ShieldAlert } from 'lucide-react';
import { z } from 'zod';
import { fetchWithAuth } from '@/react-app/config/api';

const evidenceSchema = z
  .object({
    schemaVersion: z.literal('edb.shadow-review-evidence.v1'),
    classification: z.literal('NON_OFFICIAL_SHADOW_REVIEW_EVIDENCE'),
    evidenceId: z.string().uuid(),
    generatedAt: z.string(),
    caseReference: z.string(),
    reviewerReference: z.string(),
    flightReference: z.string(),
    contracts: z.object({
      draft: z.literal('edb.draft.v1'),
      assessment: z.literal('edb.shadow-assessment.v1'),
      technicalStatus: z.literal('edb.technical-status.shadow.v1'),
    }),
    review: z.object({
      outcome: z.enum(['continue', 'needs_correction', 'stop']),
      paperComparison: z.enum([
        'not_compared',
        'compared_no_material_divergence',
        'compared_divergence_found',
      ]),
      usability: z.enum(['clear', 'minor_friction', 'blocked']),
      reviewDurationSeconds: z.number().int().positive(),
      selectedFindingCodes: z.array(z.string()),
    }),
    assessment: z.object({
      fingerprint: z.string(),
      recommendation: z.enum(['continue', 'review', 'stop']),
      readinessScore: z.number(),
      readinessStatus: z.enum(['ready', 'review', 'not_ready']),
      maxSeverity: z.enum(['NONE', 'OBSERVATION', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      technicalStatus: z.enum([
        'source_unavailable',
        'requires_review',
        'preliminarily_available',
      ]),
    }),
    notices: z.object({
      officialLogbook: z.literal(false),
      replacesPaper: z.literal(false),
      containsSignature: z.literal(false),
      persistsInAirTrust: z.literal(false),
      persistsRegulatedRecord: z.literal(false),
      authorizesReturnToService: z.literal(false),
      officialReferenceContentIncluded: z.literal(false),
      exportRequired: z.literal(true),
    }),
    integrityFingerprint: z.string(),
  })
  .strict();

type Evidence = z.infer<typeof evidenceSchema>;
type SubmitState = 'idle' | 'submitting' | 'ready' | 'error';

export default function EdbShadowReviewEvidencePanel({ flightId }: { flightId: string }) {
  const [outcome, setOutcome] = useState<'continue' | 'needs_correction' | 'stop'>(
    'needs_correction',
  );
  const [paperComparison, setPaperComparison] = useState<
    'not_compared' | 'compared_no_material_divergence' | 'compared_divergence_found'
  >('not_compared');
  const [usability, setUsability] = useState<'clear' | 'minor_friction' | 'blocked'>('clear');
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [paperOfficial, setPaperOfficial] = useState(false);
  const [notSignature, setNotSignature] = useState(false);
  const [noReturnToService, setNoReturnToService] = useState(false);
  const [authorizedRepository, setAuthorizedRepository] = useState(false);
  const [state, setState] = useState<SubmitState>('idle');
  const [evidence, setEvidence] = useState<Evidence | null>(null);

  const validFlight = /^\d+$/.test(flightId) && Number(flightId) > 0;
  const allAcknowledged =
    paperOfficial && notSignature && noReturnToService && authorizedRepository;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validFlight || !allAcknowledged) return;
    setState('submitting');
    setEvidence(null);

    try {
      const response = await fetchWithAuth(`/api/edb/shadow-review/${flightId}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          outcome,
          paperComparison,
          usability,
          reviewDurationSeconds: Math.round(durationMinutes * 60),
          selectedFindingCodes: [],
          acknowledgments: {
            paperRemainsOfficial: true,
            notASignature: true,
            noReturnToService: true,
            exportToAuthorizedRepository: true,
          },
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const parsed = z
        .object({ success: z.literal(true), data: evidenceSchema })
        .strict()
        .safeParse(payload);
      if (!response.ok || !parsed.success) throw new Error('invalid-evidence');
      setEvidence(parsed.data.data);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  function downloadEvidence() {
    if (!evidence) return;
    const blob = new Blob([`${JSON.stringify(evidence, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `edb-shadow-review-evidence-${evidence.evidenceId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!validFlight) return null;

  return (
    <section className="mx-auto mt-6 max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      <div className="rounded-xl border border-indigo-200 bg-white p-5 dark:border-indigo-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <FileCheck2 className="mt-0.5 h-5 w-5 text-indigo-700 dark:text-indigo-300" />
          <div>
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              Revisão shadow e evidência exportável
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Este fluxo registra somente uma simulação não oficial. Ele não assina, não persiste no
              AirTrust e não altera o Controle de Voos. O arquivo deve ser guardado em repositório
              autorizado do piloto.
            </p>
          </div>
        </div>

        <form className="mt-5 space-y-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Resultado</span>
              <select
                value={outcome}
                onChange={(event) =>
                  setOutcome(event.target.value as 'continue' | 'needs_correction' | 'stop')
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="continue">Continuar piloto</option>
                <option value="needs_correction">Corrigir e retestar</option>
                <option value="stop">Interromper caso</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                Comparação com o papel
              </span>
              <select
                value={paperComparison}
                onChange={(event) =>
                  setPaperComparison(
                    event.target.value as
                      | 'not_compared'
                      | 'compared_no_material_divergence'
                      | 'compared_divergence_found',
                  )
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="not_compared">Ainda não comparado</option>
                <option value="compared_no_material_divergence">Sem divergência material</option>
                <option value="compared_divergence_found">Divergência encontrada</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Usabilidade</span>
              <select
                value={usability}
                onChange={(event) =>
                  setUsability(event.target.value as 'clear' | 'minor_friction' | 'blocked')
                }
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="clear">Fluxo claro</option>
                <option value="minor_friction">Pequena dificuldade</option>
                <option value="blocked">Fluxo bloqueado</option>
              </select>
            </label>
          </div>

          <label className="block max-w-xs space-y-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-200">
              Tempo de revisão, em minutos
            </span>
            <input
              type="number"
              min={1}
              max={1440}
              value={durationMinutes}
              onChange={(event) => setDurationMinutes(Number(event.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
            />
          </label>

          <fieldset className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950/20">
            <legend className="px-1 font-medium text-amber-950 dark:text-amber-100">
              Confirmações obrigatórias
            </legend>
            {[
              ['paper', paperOfficial, setPaperOfficial, 'O Diário de Bordo em papel permanece oficial.'],
              ['signature', notSignature, setNotSignature, 'Esta ação não é assinatura nem ciência oficial do PIC.'],
              ['rts', noReturnToService, setNoReturnToService, 'Esta ação não autoriza retorno ao serviço ou liberação de voo.'],
              ['repository', authorizedRepository, setAuthorizedRepository, 'A evidência será armazenada somente em repositório autorizado.'],
            ].map(([id, checked, setter, label]) => (
              <label key={String(id)} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(checked)}
                  onChange={(event) => (setter as (value: boolean) => void)(event.target.checked)}
                  className="mt-0.5"
                />
                <span>{String(label)}</span>
              </label>
            ))}
          </fieldset>

          {outcome === 'continue' && paperComparison === 'not_compared' && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              Não é possível continuar o caso antes da comparação com o papel oficial.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={
                state === 'submitting' ||
                !allAcknowledged ||
                (outcome === 'continue' && paperComparison === 'not_compared')
              }
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === 'submitting' && <Loader2 className="h-4 w-4 animate-spin" />}
              Gerar evidência não oficial
            </button>
            {evidence && (
              <button
                type="button"
                onClick={downloadEvidence}
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-4 py-2 text-sm font-medium text-indigo-800 dark:border-indigo-700 dark:text-indigo-200"
              >
                <Download className="h-4 w-4" /> Baixar evidência JSON
              </button>
            )}
          </div>

          {state === 'ready' && evidence && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              Evidência gerada sem persistência no AirTrust. Identificador: {evidence.evidenceId}
            </p>
          )}
          {state === 'error' && (
            <p role="alert" className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
              <ShieldAlert className="h-4 w-4" /> Não foi possível gerar a evidência. Nenhum
              registro foi alterado.
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
