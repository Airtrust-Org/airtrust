/**
 * Player 3 — fresh HTML5 presentation host. Never renders generic JSON slides,
 * never infers completion from the iframe, and never gives it LMS credentials.
 *
 * This is an isolated staging component until a tenant-authorized short-lived
 * content URL, Worker assessment endpoints and governed schema are available.
 */
import { useEffect, useMemo, useState } from 'react';
import Player3AssessmentModal, {type P3ExamProps} from './Player3AssessmentModal';
import {makePlayer3VerifiedStageSubmitter} from './submitVerifiedStageAttempt';
import Player3FinalizationControls,{type Player3TerminalScope} from './Player3FinalizationControls';

export type Player3Html5HostProps = {
  title: string;
  contentUrl: string;
  editionSha256: string;
  /** Backend-defined origin distinct from the authenticated application. */
  contentOrigin: string;
  /** Explicitly marks this as a review, never certified completion. */
  reviewOnly?: boolean;
  /** An independently authenticated server session decides when the exam is due.
   * Never derive this prop from untrusted iframe navigation/postMessage. */
  pendingAssessment?: Omit<P3ExamProps,'submitOfficialAttempt'> | null;
  /** Bound by an authenticated server session, never an iframe hint. */
  terminalScope?: Player3TerminalScope | null;
};

const DIGEST = /^[a-f0-9]{64}$/;
export type Player3NavigationHint = Readonly<{
  type: 'AIRTRUST_PLAYER3_NAV_HINT_V1';
  unitId: string;
  editionSha256: string;
}>;

function validContentUrl(raw: string, expectedOrigin: string): boolean {
  try {
    const url = new URL(raw);
    const allowed = new URL(expectedOrigin);
    return url.protocol === 'https:' && allowed.protocol === 'https:' &&
      allowed.pathname === '/' && allowed.search === '' && allowed.hash === '' &&
      url.origin === allowed.origin && url.origin !== window.location.origin &&
      !url.username && !url.password && !allowed.username && !allowed.password &&
      !url.pathname.includes('/../') && !/%(?:2e|2f|5c)/i.test(url.pathname);
  } catch {
    return false;
  }
}

/** Hints are display-only. The server separately authorizes every checkpoint,
 * exam attempt and canonical completion for tenant/enrollment/cycle/edition.
 */
export default function Player3Html5Host({
  title, contentUrl, editionSha256, contentOrigin, reviewOnly = true, pendingAssessment,
  terminalScope,
}: Player3Html5HostProps) {
  const [lastHint, setLastHint] = useState<string | null>(null);
  const safe = useMemo(() =>
    DIGEST.test(editionSha256) && validContentUrl(contentUrl, contentOrigin),
    [contentUrl,contentOrigin,editionSha256],
  );
  useEffect(() => {
    setLastHint(null);
    if (!safe) return;
    const receive = (event: MessageEvent<unknown>) => {
      // A message from the content frame can NEVER grade, pass, complete or
      // issue a certificate. Even its navigation hint is only advisory UI.
      if (event.origin !== new URL(contentOrigin).origin ||
        !event.data || typeof event.data !== 'object') return;
      const msg = event.data as Partial<Player3NavigationHint>;
      if (msg.type !== 'AIRTRUST_PLAYER3_NAV_HINT_V1' ||
          msg.editionSha256 !== editionSha256 ||
          typeof msg.unitId !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(msg.unitId)) return;
      setLastHint(msg.unitId);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [safe,contentOrigin,editionSha256]);

  if (!safe) return (
    <p role="alert">Conteúdo HTML5 indisponível: origem ou edição inválida.
      Nenhum progresso foi alterado.</p>
  );
  return (
    <section aria-label={'Player 3 — ' + title}
      className="flex min-h-[560px] w-full flex-col overflow-hidden rounded-xl border bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h1 className="text-base font-bold">{title}</h1>
        <span className="text-sm text-slate-600">
          {reviewOnly ? 'Prévia HTML5 — sem registro certificador' :
            'Avaliações e conclusão controladas pelo AirTrust'}
        </span>
      </header>
      <iframe
        title={'Conteúdo original — ' + title}
        src={contentUrl}
        sandbox="allow-scripts allow-forms allow-same-origin"
        referrerPolicy="no-referrer"
        className="min-h-[500px] w-full flex-1 border-0"
      />
      <footer className="border-t px-4 py-2 text-xs text-slate-600">
        {lastHint ? 'Unidade exibida: ' + lastHint + '. ' : ''}
        A navegação no conteúdo não confirma aprovação, matrícula ou certificado.
      </footer>
      {!reviewOnly && pendingAssessment &&
        pendingAssessment.context.editionSha256 === editionSha256 &&
        <Player3AssessmentModal {...pendingAssessment}
          // Do not accept a client- or iframe-supplied "persisted" receipt.
          // Bind directly to Worker POST + authenticated session re-read.
          submitOfficialAttempt={(answers) =>
            makePlayer3VerifiedStageSubmitter(pendingAssessment.context)(answers)} />}
      {!reviewOnly && pendingAssessment &&
        pendingAssessment.context.editionSha256 !== editionSha256 &&
        <p role="alert">Avaliação indisponível: edição diferente do conteúdo autenticado.</p>}
      {!reviewOnly && terminalScope && terminalScope.editionSha256 === editionSha256 &&
        <Player3FinalizationControls
          key={terminalScope.matriculaId+':'+terminalScope.cycleId+':'+terminalScope.editionSha256}
          scope={terminalScope} />}
      {!reviewOnly && terminalScope && terminalScope.editionSha256 !== editionSha256 &&
        <p role="alert">Conclusão indisponível: edição diferente do conteúdo autenticado.</p>}
    </section>
  );
}
