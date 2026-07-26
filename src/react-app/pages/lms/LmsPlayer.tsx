import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Gauge,
  Loader2,
  Maximize2,
} from 'lucide-react';
import {
  API_BASE_URL,
  AUTH_TOKEN_CHANGED_EVENT,
  ensureValidAccessToken,
  fetchWithAuth,
  getAccessToken,
} from '@/react-app/config/api';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/react-app/hooks/useAuth';
import { lmsKeys, useLmsCurso, useMatriculaDetalhe } from '@/react-app/hooks/useLms';
import { formatMinutes } from './lmsUi';

function inferProgressFromLocation(location: string | null | undefined): number | null {
  if (!location) return null;
  const slash = location.match(/(\d+)\s*\/\s*(\d+)/);
  if (slash) {
    const current = Number(slash[1]);
    const total = Number(slash[2]);
    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
    }
  }
  const ofMatch = location.match(/(\d+)\s*of\s*(\d+)/i);
  if (ofMatch) {
    const current = Number(ofMatch[1]);
    const total = Number(ofMatch[2]);
    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
    }
  }
  return null;
}

function readLocationFromCmiJson(cmiJson: string | null | undefined): string | null {
  if (!cmiJson) return null;
  try {
    const parsed = JSON.parse(cmiJson) as Record<string, unknown>;
    const location =
      (parsed['cmi.location'] as string | undefined) ??
      (parsed['cmi.core.lesson_location'] as string | undefined);
    return typeof location === 'string' && location.trim() ? location.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Quantas vezes toleramos um diagnóstico "candidate" (SCORM ainda não
 * confirmou status explícito) antes de parar de tentar e mostrar o
 * estado terminal. Evita spinner/toast infinito quando o pacote nunca
 * envia passed/failed.
 */
const MAX_SCORM_CANDIDATE_ATTEMPTS = 2;

const SCORM_UNRESOLVED_MESSAGE =
  'O conteúdo chegou ao fim, mas não enviou a confirmação SCORM. Seu progresso foi preservado.';

function parseSlideLocation(
  location: string | null | undefined,
): { current: number; total: number } | null {
  if (!location) return null;
  const slash = location.match(/(\d+)\s*\/\s*(\d+)/);
  if (slash) {
    const current = Number(slash[1]);
    const total = Number(slash[2]);
    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      return { current, total };
    }
  }

  const ofMatch = location.match(/(\d+)\s*of\s*(\d+)/i);
  if (ofMatch) {
    const current = Number(ofMatch[1]);
    const total = Number(ofMatch[2]);
    if (Number.isFinite(current) && Number.isFinite(total) && total > 0) {
      return { current, total };
    }
  }

  return null;
}

export default function LmsPlayer() {
  const { matriculaId } = useParams<{ matriculaId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [searchParams] = useSearchParams();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [completed, setCompleted] = useState(false);
  const [qualificacaoGerada, setQualificacaoGerada] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [liveProgress, setLiveProgress] = useState<number | null>(null);
  const [liveLocation, setLiveLocation] = useState<string | null>(null);
  const [maxVisitedSlide, setMaxVisitedSlide] = useState(0);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [playerToken, setPlayerToken] = useState<string | null>(() => getAccessToken() ?? token);
  const [launchToken, setLaunchToken] = useState<string | null>(null);
  const [completionState, setCompletionState] = useState<
    'idle' | 'saving' | 'pending' | 'error' | 'unresolved'
  >('idle');
  const [completionMessage, setCompletionMessage] = useState<string | null>(null);

  const qc = useQueryClient();
  const id = Number(matriculaId);
  const completionToastIdRef = useRef(`lms-scorm-completion-${id}`);
  const candidateStreakRef = useRef(0);
  const unresolvedRef = useRef(false);
  const {
    data: matricula,
    isLoading: matriculaLoading,
    refetch: refetchMatricula,
  } = useMatriculaDetalhe(id);
  const { data: curso } = useLmsCurso(matricula?.curso_id ?? 0);
  const reviewParam = searchParams.get('review') === '1';
  const effectiveReviewMode = reviewParam || matricula?.status === 'CONCLUIDO';
  const persistedLocation = readLocationFromCmiJson(
    (matricula?.scorm_progresso as { cmi_json?: string | null } | null | undefined)?.cmi_json,
  );
  const currentLocation = liveLocation ?? persistedLocation;
  const parsedCurrentLocation = parseSlideLocation(currentLocation);
  const currentSlideIndex = parsedCurrentLocation?.current ?? null;
  const inferredLocationProgress = inferProgressFromLocation(liveLocation);
  const inferredPersistedLocationProgress = inferProgressFromLocation(persistedLocation);
  const mergedProgress = Math.max(
    matricula?.progresso_pct ?? 0,
    liveProgress ?? 0,
    inferredLocationProgress ?? 0,
    inferredPersistedLocationProgress ?? 0,
  );
  const completionDiagnostic = matricula?.completion_diagnostic ?? null;
  const hasCompletionDate = Boolean(matricula?.data_conclusao);
  const isCompletedState = completed || matricula?.status === 'CONCLUIDO' || hasCompletionDate;
  const displayProgress = completed || matricula?.status === 'CONCLUIDO' ? 100 : mergedProgress;
  const isScormContent = (matricula?.tipo_conteudo ?? 'scorm') === 'scorm';
  const canFinalize =
    !isCompletedState &&
    matricula?.status !== 'CONCLUIDO' &&
    !isScormContent &&
    completionDiagnostic?.can_finalize === true &&
    !isFinalizing;
  const remainingProgress = Math.max(0, 100 - displayProgress);
  const canGoPrev = (currentSlideIndex ?? 1) > 1;
  const canGoNextViewedOnly =
    currentSlideIndex != null && maxVisitedSlide > 0 && currentSlideIndex < maxVisitedSlide;
  const launchUrl =
    launchToken && matricula && matricula.tipo_conteudo !== 'h5p'
      ? `${API_BASE_URL}/lms/scorm/launch/${id}?token=${encodeURIComponent(launchToken)}${reviewParam ? '&review=1' : ''}`
      : null;
  const launchOrigin = API_BASE_URL.replace(/\/api$/, '');

  function invalidateLmsDashboardCaches() {
    void qc.invalidateQueries({ queryKey: lmsKeys.minhasMatriculas() });
    void qc.invalidateQueries({ queryKey: lmsKeys.minhasEAD() });
  }

  function showCompletionToast(
    phase: 'saving' | 'pending' | 'error' | 'success',
    message: string,
    options?: { qualificationGenerated?: boolean },
  ) {
    const toastId = completionToastIdRef.current;
    if (phase === 'success') {
      const detail = options?.qualificationGenerated
        ? `${message} A qualificacao foi gerada automaticamente.`
        : message;
      toast.success(detail, { id: toastId });
      setCompletionState('idle');
      setCompletionMessage(null);
      return;
    }

    if (phase === 'error') {
      toast.error(message, { id: toastId });
      setCompletionState('error');
      setCompletionMessage(message);
      return;
    }

    toast.loading(message, { id: toastId, duration: Infinity });
    setCompletionState(phase);
    setCompletionMessage(message);
  }

  useEffect(() => {
    let cancelled = false;

    async function syncToken() {
      try {
        const nextToken = await ensureValidAccessToken();
        if (!cancelled) {
          setPlayerToken(nextToken ?? null);
        }
      } catch {
        if (!cancelled) {
          setPlayerToken(null);
        }
      }
    }

    void syncToken();

    const onTokenChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string | null }>).detail;
      setPlayerToken(detail?.token ?? getAccessToken());
    };

    const intervalId = window.setInterval(() => {
      void syncToken();
    }, 45_000);

    window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged as EventListener);
      toast.dismiss(completionToastIdRef.current);
      invalidateLmsDashboardCaches();
    };
  }, [qc, token]);

  useEffect(() => {
    setIframeLoaded(false);
  }, [launchUrl]);

  useEffect(() => {
    if (playerToken && !launchToken) {
      setLaunchToken(playerToken);
    } else if (!playerToken && launchToken) {
      setLaunchToken(null);
    }
  }, [playerToken, launchToken]);

  useEffect(() => {
    const persisted = parseSlideLocation(persistedLocation);
    if (persisted?.current) {
      setMaxVisitedSlide((prev) => Math.max(prev, persisted.current));
    }
  }, [persistedLocation]);

  useEffect(() => {
    if (matricula?.status === 'CONCLUIDO') {
      unresolvedRef.current = false;
      candidateStreakRef.current = 0;
      showCompletionToast('success', 'Curso concluído e registrado com sucesso.', {
        qualificationGenerated: Boolean(matricula.qualificacao_historico_id || qualificacaoGerada),
      });
      return;
    }

    // Estado terminal já alcançado: não reabrir spinner/toast, não refazer
    // tentativas. Só sai daqui quando a matrícula virar CONCLUIDO (acima).
    if (unresolvedRef.current) {
      return;
    }

    if (completionDiagnostic?.status === 'candidate') {
      candidateStreakRef.current += 1;

      if (isScormContent && candidateStreakRef.current > MAX_SCORM_CANDIDATE_ATTEMPTS) {
        unresolvedRef.current = true;
        toast.dismiss(completionToastIdRef.current);
        setCompletionState('unresolved');
        setCompletionMessage(SCORM_UNRESOLVED_MESSAGE);
        return;
      }

      showCompletionToast(
        completionDiagnostic.final_commit_observed ? 'pending' : 'saving',
        completionDiagnostic.final_commit_observed
          ? 'Conclusão recebida, mas ainda não confirmada pelo servidor.'
          : 'Conclusão recebida. Salvando progresso...',
      );
      return;
    }

    candidateStreakRef.current = 0;

    if (
      completionState !== 'idle' &&
      completionDiagnostic &&
      completionDiagnostic.code !== 'SCORM_NONE' &&
      completionDiagnostic.status !== 'accepted' &&
      completionDiagnostic.status !== 'candidate'
    ) {
      showCompletionToast(
        'error',
        'Conclusão recebida, mas ainda não confirmada pelo servidor.',
      );
    }
  }, [
    completionDiagnostic,
    completionState,
    isScormContent,
    matricula?.qualificacao_historico_id,
    matricula?.status,
    qualificacaoGerada,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function syncFrameToken() {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow) return;

      try {
        const nextToken = await ensureValidAccessToken();
        if (cancelled) return;

        const resolvedToken = nextToken ?? getAccessToken() ?? null;
        setPlayerToken(resolvedToken);
        frameWindow.postMessage(
          {
            type: 'lms:auth-token',
            matriculaId: id,
            previewMode: false,
            token: resolvedToken,
          },
          launchOrigin,
        );
      } catch {
        if (!cancelled) {
          frameWindow.postMessage(
            {
              type: 'lms:auth-token',
              matriculaId: id,
              previewMode: false,
              token: null,
            },
            launchOrigin,
          );
        }
      }
    }

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== launchOrigin) return;
      if (
        effectiveReviewMode &&
        event.data &&
        typeof event.data === 'object' &&
        (event.data.type === 'lms:completed' ||
          event.data.type === 'lms:completion-pending' ||
          event.data.type === 'lms:completion-error')
      ) {
        return;
      }
      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'lms:completed' &&
        event.data.matriculaId === id
      ) {
        setCompleted(true);
        if (event.data.qualificacao_gerada) setQualificacaoGerada(true);
        showCompletionToast('success', 'Curso concluído e registrado com sucesso.', {
          qualificationGenerated: Boolean(event.data.qualificacao_gerada),
        });
        void refetchMatricula();
        return;
      }

      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'lms:completion-pending' &&
        event.data.matriculaId === id
      ) {
        // Estado terminal já alcançado: ignora novos sinais de "pending" do
        // pacote para não reabrir o ciclo de refetch/spinner.
        if (unresolvedRef.current) return;
        showCompletionToast(
          event.data.stage === 'saving' ? 'saving' : 'pending',
          typeof event.data.message === 'string' && event.data.message.trim()
            ? event.data.message
            : 'Conclusão recebida, mas ainda não confirmada pelo servidor.',
        );
        void refetchMatricula();
        return;
      }

      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'lms:completion-error' &&
        event.data.matriculaId === id
      ) {
        showCompletionToast(
          'error',
          typeof event.data.message === 'string' && event.data.message.trim()
            ? event.data.message
            : 'Conclusão recebida, mas ainda não confirmada pelo servidor.',
        );
        void refetchMatricula();
        return;
      }

      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'lms:progress' &&
        event.data.matriculaId === id
      ) {
        if (typeof event.data.progresso_pct === 'number') {
          setLiveProgress(event.data.progresso_pct);
        }
        if (typeof event.data.location === 'string' && event.data.location.trim()) {
          setLiveLocation(event.data.location.trim());
          const parsed = parseSlideLocation(event.data.location);
          if (parsed?.current) {
            setMaxVisitedSlide((prev) => Math.max(prev, parsed.current));
          }
        }
        if (typeof event.data.slide_current === 'number' && Number.isFinite(event.data.slide_current)) {
          setMaxVisitedSlide((prev) => Math.max(prev, event.data.slide_current));
        }
        if (event.data.novo_status === 'CONCLUIDO' && !effectiveReviewMode) {
          setCompleted(true);
          showCompletionToast('success', 'Curso concluído e registrado com sucesso.');
        }
        void refetchMatricula();
        return;
      }

      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'lms:auth-token-request' &&
        event.data.matriculaId === id
      ) {
        void syncFrameToken();
        return;
      }

      if (
        event.data &&
        typeof event.data === 'object' &&
        event.data.type === 'lms:navigate:ack' &&
        event.data.matriculaId === id &&
        event.data.moved === false
      ) {
        toast.warning('Não foi possível navegar para este slide.');
      }
    };

    window.addEventListener('message', handleMessage);
    const intervalId = window.setInterval(() => {
      if (iframeLoaded) void syncFrameToken();
    }, 45_000);

    if (iframeLoaded) {
      void syncFrameToken();
    }

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('message', handleMessage);
    };
  }, [id, iframeLoaded, launchOrigin, refetchMatricula]);

  async function handleFullscreen() {
    const el = iframeRef.current;
    if (!el) return;

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
      msFullscreenElement?: Element | null;
      msExitFullscreen?: () => Promise<void> | void;
    };

    const root = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
      msRequestFullscreen?: () => Promise<void> | void;
    };

    const inFullscreen = Boolean(
      doc.fullscreenElement || doc.webkitFullscreenElement || doc.msFullscreenElement,
    );

    try {
      if (inFullscreen) {
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
          return;
        }
        if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
          return;
        }
        if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
          return;
        }
      } else {
        if (root.requestFullscreen) {
          await root.requestFullscreen();
          return;
        }
        if (root.webkitRequestFullscreen) {
          await root.webkitRequestFullscreen();
          return;
        }
        if (root.msRequestFullscreen) {
          await root.msRequestFullscreen();
          return;
        }
      }
    } catch {
      // Fallback below handles browsers with partial fullscreen support.
    }

    // Fallback para WebViews/mobile onde fullscreen da página principal falha.
    if (launchOrigin && el.contentWindow) {
      el.contentWindow.postMessage({ type: 'lms:fullscreen' }, launchOrigin);
    }
  }

  function navigateSlide(direction: 'prev' | 'next') {
    if (direction === 'prev' && !canGoPrev) {
      return;
    }

    if (direction === 'next' && !canGoNextViewedOnly) {
      toast.warning('Avanço bloqueado: você só pode avançar para slides já vistos.');
      return;
    }

    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow || !launchOrigin) return;
    frameWindow.postMessage(
      {
        type: 'lms:navigate',
        direction,
      },
      launchOrigin,
    );
  }

  function handleLeave() {
    const shouldConfirm = !completed && matricula?.status !== 'CONCLUIDO';
    if (shouldConfirm) {
      const confirmed = window.confirm(
        'O curso ainda não foi concluído. Deseja sair agora mesmo assim?',
      );
      if (!confirmed) return;
    }
    navigate('/lms/cursos');
  }

  async function handleFinalizeAndGenerateQualification() {
    if (!matricula) return;
    // Conclusão SCORM nunca é aceita por finalização manual: exige status
    // explícito passed/completed vindo do próprio pacote.
    if (isScormContent) return;
    setIsFinalizing(true);
    try {
      showCompletionToast('saving', 'Conclusão recebida. Salvando progresso...');
      const res = await fetchWithAuth(`/api/lms/matriculas/${id}/finalizar`, {
        method: 'POST',
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { qualificacao_gerada?: unknown; completion_diagnostic?: { can_finalize?: boolean } };
        error?: string;
        code?: string;
      };
      if (!res.ok || !json.success) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }

      setCompleted(true);
      setLiveProgress(100);
      setQualificacaoGerada(Boolean(json.data?.qualificacao_gerada));
      void refetchMatricula();
      showCompletionToast('success', 'Curso concluído e registrado com sucesso.', {
        qualificationGenerated: Boolean(json.data?.qualificacao_gerada),
      });
    } catch (error) {
      showCompletionToast(
        'error',
        error instanceof Error
          ? error.message
          : 'Conclusão recebida, mas ainda não confirmada pelo servidor.',
      );
    } finally {
      setIsFinalizing(false);
    }
  }

  if (!token && !playerToken) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto" />
          <p>Sessão expirada. Faça login novamente.</p>
        </div>
      </div>
    );
  }

  if (matriculaLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/50" />
      </div>
    );
  }

  if (!matricula) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-white gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-sm">Matrícula não encontrada.</p>
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>
    );
  }

  // Redirect non-SCORM types to their own players
  if (matricula.tipo_conteudo === 'h5p') {
    navigate(`/lms/player/h5p/${id}`, { replace: true });
    return null;
  }
  if (matricula.tipo_conteudo === 'pdf') {
    navigate(`/lms/player/pdf/${id}`, { replace: true });
    return null;
  }
  if (matricula.tipo_conteudo === 'pptx') {
    navigate(`/lms/player/pptx/${id}`, { replace: true });
    return null;
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-950 text-white">
      <header className="border-b border-white/10 bg-slate-900/85 px-3 py-2 backdrop-blur sm:px-4">
        <div className="flex items-center gap-2">
          <button
            onClick={handleLeave}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-white/85 hover:bg-white/10"
            title="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{matricula.titulo ?? 'Curso SCORM'}</p>
            <p className="truncate text-[11px] text-white/60">
              {liveLocation || persistedLocation
                ? `Onde você está: ${liveLocation ?? persistedLocation}`
                : 'Onde você está: início do curso'}
            </p>
          </div>

          <button
            onClick={() => navigateSlide('prev')}
            disabled={!canGoPrev}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            title="Voltar slide"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Voltar slide</span>
          </button>

          <button
            onClick={() => navigateSlide('next')}
            disabled={!canGoNextViewedOnly}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-medium text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            title="Próximo slide"
          >
            <ChevronRight className="h-4 w-4" />
            <span className="hidden sm:inline">Próximo</span>
          </button>

          <button
            onClick={handleFullscreen}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-white/85 hover:bg-white/10"
            title="Tela cheia"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {effectiveReviewMode && (
        <div className="flex items-center gap-3 bg-blue-950/80 border-b border-blue-500/30 px-4 py-2.5 flex-shrink-0">
          <Eye className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <div>
            <p className="text-xs font-medium text-blue-300">Modo consulta — somente leitura</p>
            <p className="text-[10px] text-blue-400/70">
              Você está visualizando um curso já concluído. O progresso não será alterado.
            </p>
          </div>
        </div>
      )}

      <main className="relative flex-1">
        <div className="flex h-full min-h-0">
          <div className="relative min-w-0 flex-1">
            {!iframeLoaded && launchUrl ? (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
                <div className="text-center">
                  <Loader2 className="mx-auto h-10 w-10 animate-spin text-white/30" />
                  <p className="mt-3 text-sm text-white/60">Montando o ambiente do curso...</p>
                </div>
              </div>
            ) : null}

            {launchUrl ? (
              <iframe
                ref={iframeRef}
                src={launchUrl}
                className="absolute inset-0 h-full w-full border-none bg-white"
                allow="autoplay; fullscreen; clipboard-write"
                allowFullScreen
                onLoad={() => {
                  setIframeLoaded(true);
                }}
                title={matricula.titulo ?? 'Curso SCORM'}
              />
            ) : null}
          </div>

          <aside className="hidden w-[340px] shrink-0 border-l border-white/10 bg-slate-900/70 p-4 md:flex md:flex-col md:gap-4">
            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-white/90">
                <BookOpen className="h-4 w-4 text-sky-300" />
                Conteúdo programático
              </h3>
              <div className="max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-white/75">
                {curso?.conteudo_programatico?.trim() ||
                  curso?.descricao?.trim() ||
                  'Conteúdo sem descrição detalhada cadastrada para este curso.'}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-white/90">
                <Gauge className="h-4 w-4 text-emerald-300" />
                Progresso e sessão
              </h3>
              <div className="space-y-1.5 text-xs text-white/75">
                <p>Progresso: {displayProgress}%</p>
                <p>Restante: {remainingProgress}%</p>
                <p>Posição: {liveLocation || persistedLocation || 'sem marcador'}</p>
                <p>
                  Carga horária:{' '}
                  {formatMinutes(curso?.carga_horaria_minutos ?? matricula.carga_horaria_minutos)}
                </p>
                {matricula.score_final != null ? <p>Nota: {matricula.score_final}%</p> : null}
                {completionDiagnostic?.code && completionDiagnostic.code !== 'SCORM_NONE' ? (
                  <p>Diagnóstico: {completionDiagnostic.code}</p>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="mb-2 inline-flex items-center gap-2 text-sm font-semibold text-white/90">
                <Clock3 className="h-4 w-4 text-amber-300" />
                Ações
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleFullscreen}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs hover:bg-white/10"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                  Tela cheia
                </button>
              </div>
            </section>

            {canFinalize ? (
              <button
                onClick={handleFinalizeAndGenerateQualification}
                disabled={isFinalizing}
                className="mt-auto w-full rounded-xl bg-emerald-500 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFinalizing
                  ? 'Confirmando...'
                  : matricula?.gerar_qualificacao_ao_concluir === 1
                    ? 'Confirmar conclusao e gerar qualificacao'
                    : 'Confirmar conclusao'}
              </button>
            ) : null}
          </aside>
        </div>
      </main>
      {(canFinalize ||
        completionState === 'saving' ||
        completionState === 'pending' ||
        completionState === 'error' ||
        completionState === 'unresolved') && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-emerald-300/30 bg-slate-900/90 p-3 shadow-2xl backdrop-blur">
            <div className="mb-2 text-xs text-emerald-200/90">
              {completionMessage || 'Conclusão recebida, mas ainda não confirmada pelo servidor.'}
            </div>
            {completionState === 'unresolved' ? (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20"
                >
                  Sair e reabrir o curso
                </button>
                <button
                  onClick={() => navigate('/lms/cursos')}
                  className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white hover:bg-white/20"
                >
                  Voltar ao catálogo
                </button>
              </div>
            ) : canFinalize ? (
              <button
                onClick={handleFinalizeAndGenerateQualification}
                disabled={isFinalizing}
                className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isFinalizing
                  ? 'Confirmando...'
                  : matricula?.gerar_qualificacao_ao_concluir === 1
                    ? 'Confirmar conclusao e gerar qualificacao'
                    : 'Confirmar conclusao'}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Overlay de conclusão */}
      {completed && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center space-y-5 text-white max-w-sm px-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500">
              <CheckCircle2 className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold">Curso concluído</h2>
            <p className="text-white/70 text-sm">
              Curso concluído e registrado com sucesso.
              {qualificacaoGerada ? ' A qualificacao foi gerada automaticamente.' : ''}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate(`/lms/cursos/${matricula.curso_id}`)}
                className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
              >
                Ver detalhes do curso
              </button>
              <button
                onClick={() => navigate('/lms/cursos')}
                className="w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm text-white hover:bg-white/20"
              >
                Voltar ao catálogo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
