import { useState } from 'react';
import { toast } from 'sonner';
import Button from '@/react-app/components/Button';
import {
  useActivateScormPackageVersion,
  useApproveFormativePackage,
  useImportFormativeAttestation,
  useRollbackScormPackage,
  useRunScormPackageConformance,
  useReplaceValidatedScormDirect,
  useScormActivationPreflight,
} from '@/react-app/hooks/useLms';
import type { ScormPackageVersionRow } from '@/react-app/hooks/useLms';

const FORMATIVE = 'FORMATIVE_NO_EXAM_V1';
const MAX_ATTESTATION_BYTES = 24_576;

const CHECK_LABEL: Record<string, string> = {
  COURSE_IDENTITY: 'Curso SCORM correto',
  CANDIDATE_VALIDATED: 'Pacote validado (estrutura, manifesto e diagnóstico)',
  NOT_ALREADY_ACTIVE: 'Edição ainda não ativa',
  PROFILE_ELIGIBLE: 'Contrato formativo sem prova final',
  JOURNEY_EVIDENCE: 'Homologação: jornada real do aluno em staging',
  ADMIN_APPROVAL: 'Aprovação administrativa vinculada a este SHA',
  SCORED_THRESHOLD_PRESENT: 'Nota mínima positiva no curso',
};

const sha12 = (sha?: string) => String(sha ?? '').slice(0, 12);
const errorText = (error: unknown) => (error instanceof Error ? error.message : 'Falha inesperada');

function Step({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden className={ok ? 'text-emerald-600' : 'text-amber-600'}>{ok ? '✔' : '○'}</span>
      <span>
        <span className="font-medium">{label}</span>
        <span className="sr-only">{ok ? ' — concluído' : ' — pendente'}</span>
        {detail ? <span className="block text-xs opacity-70">{detail}</span> : null}
      </span>
    </li>
  );
}

function ConfirmSha({ sha, value, onChange }: { sha: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      Para confirmar, digite os 12 primeiros caracteres do SHA-256 ({sha12(sha)}):
      <input
        className="mt-1 block w-full rounded border px-2 py-1 font-mono"
        value={value}
        onChange={(event) => onChange(event.target.value.trim().toLowerCase())}
        autoComplete="off"
        spellCheck={false}
        aria-label="Confirmação do SHA-256"
      />
    </label>
  );
}

function EditionCard({ cursoId, pkg, versions, isAdmin }: {
  cursoId: number;
  pkg: ScormPackageVersionRow;
  versions: ScormPackageVersionRow[];
  isAdmin: boolean;
}) {
  const sha = String(pkg.packageSha256 ?? '');
  const formative = pkg.certificationProfile === FORMATIVE;
  const validated = pkg.status === 'VALIDATED';
  const preflight = useScormActivationPreflight(cursoId, pkg.packageId, validated);
  const runConformance = useRunScormPackageConformance(cursoId);
  const importEvidence = useImportFormativeAttestation(cursoId);
  const approve = useApproveFormativePackage(cursoId);
  const activate = useActivateScormPackageVersion(cursoId);
  const directReplace = useReplaceValidatedScormDirect(cursoId);
  const rollback = useRollbackScormPackage(cursoId);

  const [note, setNote] = useState('');
  const [reviewRef, setReviewRef] = useState('');
  const [approveConfirm, setApproveConfirm] = useState('');
  const [activateConfirm, setActivateConfirm] = useState('');
  const [ackInProgress, setAckInProgress] = useState(false);
  const [rollbackConfirm, setRollbackConfirm] = useState('');
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const data = preflight.data;
  const checks = data?.checks ?? [];
  const pending = new Set(checks.filter((check) => !check.ok).map((check) => check.id));
  const evidenceOk = formative && !pending.has('JOURNEY_EVIDENCE') && !pending.has('PROFILE_ELIGIBLE');
  const approvalOk = formative && !pending.has('ADMIN_APPROVAL');
  const policyMoves = data?.incomingPolicy != null;
  const inProgress = data?.impact.inProgress ?? 0;
  const previous = versions.find((item) => item.packageId === pkg.previousActivePackageId);
  const awaitingEvidence = pending.has('JOURNEY_EVIDENCE') || pending.has('PROFILE_ELIGIBLE');
  const awaitingApproval = pending.has('ADMIN_APPROVAL');
  const activationReady = Boolean(data?.canActivate && (formative || pkg.publishable));

  async function onEvidenceFile(file: File | undefined) {
    setEvidenceError(null);
    if (!file) return;
    if (file.size > MAX_ATTESTATION_BYTES) {
      setEvidenceError('Arquivo de evidência maior que o limite permitido.');
      return;
    }
    try {
      await importEvidence.mutateAsync({ packageId: pkg.packageId, attestationJson: await file.text() });
      toast.success('Evidência de homologação verificada e registrada.');
    } catch (error) {
      setEvidenceError(errorText(error));
    }
  }

  return (
    <div className="rounded-lg border p-3 text-sm" data-testid={`edition-${pkg.packageId}`}>
      <p className="font-medium">
        {pkg.status === 'ACTIVE' ? 'Conteúdo atual' : pkg.status === 'VALIDATED' ? 'Nova edição recebida' : pkg.status === 'REJECTED' ? 'ZIP recusado' : 'Edição anterior'} · SHA {sha12(sha)}
        {formative ? <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-900">Formativo · sem prova final</span> : null}
        {pkg.assessmentPolicy === 'SCORED' ? <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs">Avaliativo</span> : null}
      </p>
      {pkg.arquivoNome ? <p className="text-xs opacity-70">{pkg.arquivoNome}</p> : null}
      <p className="font-mono text-xs break-all opacity-70">{sha}</p>
      <p>
        Estático: {pkg.structural?.status ?? '—'}
        {formative ? null : <> · Runtime: {pkg.runtime?.status ?? pkg.conformance?.status ?? 'PENDENTE'} · Certificação funcional: {pkg.functionalCertification?.status === 'CERTIFIED' ? 'certificada' : 'pendente'} · Publicável: {pkg.publishable ? 'sim' : 'não'}</>}
      </p>
      {(pkg.runtime?.errors ?? pkg.completionManifest?.errors ?? []).map((reason: string) => (
        <p key={reason} className="text-rose-600">{reason}</p>
      ))}

      {validated && preflight.isPending ? <p role="status">Verificando se a nova edição pode substituir a atual…</p> : null}
      {validated && preflight.isError ? (
        <div role="alert" className="mt-2 text-rose-700">
          Falha ao consultar as condições da substituição. A edição atual não foi alterada.
          <Button type="button" variant="secondary" onClick={() => void preflight.refetch()}>Tentar novamente</Button>
        </div>
      ) : null}
      {validated && formative && data ? (
        <div className="mt-3 space-y-2 rounded border border-emerald-300 bg-emerald-50 p-3 text-emerald-950">
          <p className="font-semibold">Pronto para solicitar substituição com validação automática</p>
          <p className="text-xs">A validação do servidor confere estrutura, manifesto, atividades, SHA e arquivos no armazenamento antes de trocar o conteúdo. Não é necessário importar JSON ou obter homologação manual.</p>
          {data.incomingPolicy === 'FORMATIVE' ? (
            <p className="text-xs">O curso passará a ser formativo, sem prova final. Conclusões anteriores são preservadas. Matrículas em andamento: {inProgress}.</p>
          ) : null}
          <Button variant="primary" loading={directReplace.isPending} disabled={!isAdmin || directReplace.isPending}
            onClick={() => {
              if (!window.confirm(`Substituir o conteúdo do curso #${cursoId} pelo ZIP SHA ${sha12(sha)}? Conclusões anteriores serão preservadas; ${inProgress} matrícula(s) em andamento usarão a nova edição.`)) return;
              void directReplace.mutateAsync({
                packageId: pkg.packageId,
                confirm: { cursoId, packageSha256: sha,
                  ...(inProgress ? { acknowledgeInProgress: inProgress } : {}) },
              }).then(() => toast.success('Conteúdo substituído. Histórico preservado.'))
                .catch((error: unknown) => toast.error(errorText(error)));
            }}>
            Substituir agora — validação automática
          </Button>
          {!isAdmin ? <p className="text-xs">Somente administradores podem substituir o curso.</p> : null}
        </div>
      ) : null}

      {validated && data ? (
        <details open={!formative} className="mt-3 rounded border p-2">
          <summary className="cursor-pointer text-xs font-medium">{formative ? 'Detalhes técnicos (opcional)' : 'Detalhes de ativação'}</summary>
        <div className="mt-3 space-y-3">
          <p className="font-medium" role="status">
            {activationReady
              ? 'Pronto para substituir o conteúdo do curso.'
              : awaitingEvidence
                ? 'Novo ZIP recebido. Aguardando homologação técnica assinada.'
                : awaitingApproval
                  ? 'Homologação recebida. Aguardando aprovação administrativa.'
                  : 'Novo ZIP recebido. Existem verificações pendentes.'}
          </p>
          <p className="text-xs">
            Curso <strong>#{data.course.id} · {data.course.titulo}</strong>
            {data.active ? <> · edição ativa hoje: {sha12(data.active.packageSha256)}</> : null}
          </p>
          <details className="rounded border p-2 text-xs">
            <summary className="cursor-pointer font-medium">Ver verificações da substituição ({checks.filter((check) => check.ok).length}/{checks.length})</summary>
            <ul className="mt-2 space-y-1" aria-label="Pré-checagem de ativação">
              {checks.map((check) => (
                <Step key={check.id} ok={check.ok} label={CHECK_LABEL[check.id] ?? check.id} detail={check.ok ? undefined : check.detail} />
              ))}
            </ul>
          </details>

          {formative && (!evidenceOk || !approvalOk) ? (
            <div className="rounded border border-dashed p-2">
              <label className="block text-xs font-medium">
                Importar evidência assinada da homologação (JSON gerado pelo CI governado)
                <input
                  type="file"
                  accept="application/json,.json"
                  className="mt-1 block text-xs"
                  disabled={!isAdmin || importEvidence.isPending}
                  onChange={(event) => { void onEvidenceFile(event.target.files?.[0]); event.target.value = ''; }}
                />
              </label>
              {evidenceError ? <p className="mt-1 text-xs text-rose-600" role="alert">{evidenceError}</p> : null}
            </div>
          ) : null}

          {formative && evidenceOk && !approvalOk ? (
            <div className="space-y-2 rounded border p-2">
              <p className="text-xs font-medium">Aprovação administrativa (registrada com seu usuário, curso e SHA)</p>
              <textarea
                className="block w-full rounded border px-2 py-1 text-xs"
                rows={2}
                maxLength={500}
                placeholder="Justificativa (mín. 10 caracteres): revisão editorial e jornada real conferidas…"
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <input
                className="block w-full rounded border px-2 py-1 text-xs"
                placeholder="Referência da revisão editorial independente (obrigatória)"
                maxLength={200}
                value={reviewRef}
                onChange={(event) => setReviewRef(event.target.value)}
              />
              <ConfirmSha sha={sha} value={approveConfirm} onChange={setApproveConfirm} />
              <Button
                variant="primary"
                loading={approve.isPending}
                disabled={!isAdmin || note.trim().length < 10 || reviewRef.trim().length < 6 || approveConfirm !== sha12(sha)}
                onClick={() => void approve
                  .mutateAsync({ packageId: pkg.packageId, packageSha256: sha, note: note.trim(), editorialReviewRef: reviewRef.trim() || null })
                  .then(() => toast.success('Aprovação administrativa registrada.'))
                  .catch((error: unknown) => toast.error(errorText(error)))}
              >
                Aprovar este pacote
              </Button>
              {!isAdmin ? <p className="text-xs opacity-70">Somente administradores aprovam.</p> : null}
            </div>
          ) : null}

          {policyMoves ? (
            <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
              A ativação muda a política do curso para <strong>{data.incomingPolicy === 'FORMATIVE' ? 'formativa (sem prova final)' : 'avaliativa (com nota mínima)'}</strong>.
              Conclusões e ciclos já encerrados ({data.impact.terminalToFreeze}) mantêm as regras sob as quais terminaram;
              matrículas em andamento ({inProgress}) e não iniciadas ({data.impact.notStarted}) passam a seguir a nova edição.
            </p>
          ) : null}

          {policyMoves && !formative ? (
            <Button
              variant="secondary"
              loading={runConformance.isPending}
              onClick={() => void runConformance.mutateAsync(pkg.packageId)}
            >
              Executar conformance
            </Button>
          ) : null}

          {policyMoves ? (
            <div className="space-y-2">
              {data.canActivate ? <ConfirmSha sha={sha} value={activateConfirm} onChange={setActivateConfirm} /> : null}
              {data.canActivate && inProgress > 0 ? (
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={ackInProgress} onChange={(event) => setAckInProgress(event.target.checked)} />
                  Estou ciente de que {inProgress} matrícula(s) em andamento seguirão a nova edição.
                </label>
              ) : null}
              <Button
                variant="primary"
                loading={activate.isPending}
                disabled={!isAdmin || !activationReady ||
                  activateConfirm !== sha12(sha) || (inProgress > 0 && !ackInProgress)}
                onClick={() => void activate
                  .mutateAsync({
                    packageId: pkg.packageId,
                    confirm: { cursoId, packageSha256: sha, ...(inProgress > 0 ? { acknowledgeInProgress: inProgress } : {}) },
                  })
                  .then(() => toast.success('Edição ativada. Confira o resultado no curso.'))
                  .catch((error: unknown) => toast.error(errorText(error)))}
              >
                Substituir conteúdo do curso
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" loading={runConformance.isPending} onClick={() => void runConformance.mutateAsync(pkg.packageId)}>Executar conformance</Button>
              <Button variant="primary" disabled={!pkg.publishable} loading={activate.isPending} onClick={() => void activate.mutateAsync(pkg.packageId)}>Ativar versão</Button>
            </div>
          )}
        </div>
        </details>
      ) : null}

      {pkg.status === 'ACTIVE' ? (
        <div className="mt-3 space-y-2 text-xs">
          <p>Conferência: curso #{cursoId} · SHA {sha12(sha)} · política {pkg.assessmentPolicy ?? 'herdada do curso'}.</p>
          {isAdmin && previous ? (
            <div className="space-y-2 rounded border p-2">
              <p className="font-medium">Restaurar a edição anterior ({sha12(previous.packageSha256)})</p>
              <ConfirmSha sha={previous.packageSha256 ?? ''} value={rollbackConfirm} onChange={setRollbackConfirm} />
              <Button
                variant="secondary"
                loading={rollback.isPending}
                disabled={rollbackConfirm !== sha12(previous.packageSha256)}
                onClick={() => void rollback
                  .mutateAsync(previous.packageId)
                  .then(() => toast.success('Edição anterior restaurada.'))
                  .catch((error: unknown) => toast.error(errorText(error)))}
              >
                Restaurar edição anterior
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function ScormEditionPanel({ cursoId, versions, isAdmin }: {
  cursoId: number;
  versions: ScormPackageVersionRow[];
  isAdmin: boolean;
}) {
  if (versions.length === 0) return <p className="text-sm opacity-70">Nenhuma edição enviada ainda.</p>;
  return (
    <div className="space-y-2">
      {versions.map((pkg) => (
        <EditionCard key={pkg.packageId} cursoId={cursoId} pkg={pkg} versions={versions} isAdmin={isAdmin} />
      ))}
    </div>
  );
}
