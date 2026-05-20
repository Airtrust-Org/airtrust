import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftCircle,
  ArrowRightCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Presentation,
  ShieldCheck,
} from 'lucide-react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import {
  useFinalizarMatricula,
  useMatriculaDetalhe,
  useSalvarProgresso,
} from '@/react-app/hooks/useLms';
import { pptxToHtml } from '@jvmr/pptx-to-html';
import { fetchPptxViewerSession, type PptxViewerSession } from './pptxViewer';

export default function LmsPlayerPptx() {
  const { matriculaId } = useParams<{ matriculaId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const id = Number(matriculaId);
  const { data: matricula, isLoading: matriculaLoading } = useMatriculaDetalhe(id);
  const finalizarMatricula = useFinalizarMatricula();
  const salvarProgresso = useSalvarProgresso();

  const [viewerSession, setViewerSession] = useState<PptxViewerSession | null>(null);
  const [slides, setSlides] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPptx, setLoadingPptx] = useState(true);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [qualificacaoGerada, setQualificacaoGerada] = useState(false);
  const [slideScale, setSlideScale] = useState(1);
  const [slideViewport, setSlideViewport] = useState({ width: 1280, height: 720 });
  const positionRestored = useRef(false);
  const latestProgressRef = useRef<{ slideIndex: number; totalSlides: number } | null>(null);
  const slideFrameRef = useRef<HTMLDivElement | null>(null);
  const slideContentRef = useRef<HTMLDivElement | null>(null);

  const alreadyConcluded = matricula?.status === 'CONCLUIDO';
  const allSlidesViewed = slides !== null && maxReached >= slides.length - 1;
  const canConclude = alreadyConcluded || allSlidesViewed;
  const done = completed || alreadyConcluded;

  const loadRenderedSlides = useCallback(
    async (cursoId: number) => {
      const activeToken = getAccessToken() ?? token ?? '';
      const url = `${API_BASE_URL}/lms/pptx/asset/${cursoId}`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${activeToken}` },
      });
      if (!resp.ok) throw new Error(`Falha ao carregar apresentação (${resp.status})`);
      const arrayBuffer = await resp.arrayBuffer();
      return pptxToHtml(arrayBuffer, {
        width: 1280,
        height: 720,
        scaleToFit: true,
        letterbox: true,
      });
    },
    [token],
  );

  useEffect(() => {
    if (!matricula?.curso_id) return;
    let cancelled = false;

    async function loadPptx() {
      try {
        setLoadingPptx(true);
        setLoadError(null);
        setSlides(null);
        setIframeLoaded(false);
        positionRestored.current = false;

        // Try to fetch an Office viewer session in the background for the "preview" link
        fetchPptxViewerSession(matricula!.curso_id)
          .then((session) => {
            if (!cancelled) setViewerSession(session);
          })
          .catch(() => {
            // Office viewer unavailable — that's fine, preview link won't show
          });

        const parsed = await loadRenderedSlides(matricula!.curso_id);
        if (!cancelled) {
          setSlides(parsed);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Falha ao carregar PPTX');
      } finally {
        if (!cancelled) setLoadingPptx(false);
      }
    }

    void loadPptx();
    return () => {
      cancelled = true;
    };
  }, [loadRenderedSlides, matricula?.curso_id]);

  // Restore saved slide position once slides are loaded (once per session)
  useEffect(() => {
    if (slides && matricula && !positionRestored.current) {
      positionRestored.current = true;
      const savedSlide = Math.max(0, matricula.ultimo_slide ?? 0);
      const clamped = Math.min(savedSlide, slides.length - 1);
      if (clamped > 0) {
        setCurrentSlide(clamped);
        setMaxReached(clamped);
      }
    }
  }, [slides, matricula]);

  const saveProgress = useCallback(
    (slideIndex: number, totalSlides: number) => {
      latestProgressRef.current = { slideIndex, totalSlides };
      const pct = Math.round(((slideIndex + 1) / totalSlides) * 100);
      salvarProgresso.mutate({
        matriculaId: id,
        progresso_pct: pct,
        ultimo_slide: slideIndex,
      });
    },
    [id, salvarProgresso],
  );

  const flushLatestProgress = useCallback(async () => {
    const latest = latestProgressRef.current;
    if (!latest) return;

    const activeToken = getAccessToken() ?? token ?? '';
    if (!activeToken) return;

    const pct = Math.round(((latest.slideIndex + 1) / latest.totalSlides) * 100);
    await fetch(`${API_BASE_URL}/lms/matriculas/${id}/progresso`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${activeToken}`,
      },
      body: JSON.stringify({
        progresso_pct: pct,
        ultimo_slide: latest.slideIndex,
      }),
      keepalive: true,
    }).catch(() => {
      // Best effort flush on navigation/unload.
    });
  }, [id, token]);

  const slideHtml = slides?.[currentSlide];

  // Flush latest progress when user reloads/closes quickly.
  useEffect(() => {
    const flushOnHide = () => {
      void flushLatestProgress();
    };

    window.addEventListener('pagehide', flushOnHide);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushLatestProgress();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushOnHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [flushLatestProgress]);

  useEffect(() => {
    if (!slideHtml) return;

    const measure = () => {
      const frame = slideFrameRef.current;
      const contentRoot = slideContentRef.current?.firstElementChild as HTMLElement | null;
      if (!frame || !contentRoot) return;

      const width = Math.max(contentRoot.scrollWidth, contentRoot.offsetWidth, 1);
      const height = Math.max(contentRoot.scrollHeight, contentRoot.offsetHeight, 1);
      const frameWidth = Math.max(frame.clientWidth, 1);
      const frameHeight = Math.max(frame.clientHeight, 1);
      const scale = Math.min(frameWidth / width, frameHeight / height);

      setSlideViewport({ width, height });
      setSlideScale(Number.isFinite(scale) && scale > 0 ? scale : 1);
    };

    const rafId = window.requestAnimationFrame(measure);
    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(measure);
    });

    if (slideFrameRef.current) resizeObserver.observe(slideFrameRef.current);
    if (slideContentRef.current?.firstElementChild) {
      resizeObserver.observe(slideContentRef.current.firstElementChild as Element);
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [slideHtml]);

  const goToSlide = useCallback(
    (index: number) => {
      if (!slides) return;
      const clamped = Math.max(0, Math.min(index, slides.length - 1));
      setCurrentSlide(clamped);
      setMaxReached((prev) => Math.max(prev, clamped));
      saveProgress(clamped, slides.length);
    },
    [slides, saveProgress],
  );

  const handleConclude = useCallback(() => {
    if (completed || alreadyConcluded) return;
    finalizarMatricula.mutate(id, {
      onSuccess: (data) => {
        setCompleted(true);
        if (data.qualificacao_gerada?.qualificacao_historico_id) setQualificacaoGerada(true);
      },
    });
  }, [completed, alreadyConcluded, finalizarMatricula, id]);

  const handleLeave = useCallback(async () => {
    const shouldConfirm = !done;
    if (shouldConfirm) {
      const confirmed = window.confirm(
        'A apresentação ainda não foi concluída. Deseja sair mesmo assim?',
      );
      if (!confirmed) return;
    }
    await flushLatestProgress();
    navigate('/lms/cursos');
  }, [done, flushLatestProgress, navigate]);

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-white">
        <AlertTriangle className="h-10 w-10 text-amber-400 mx-auto mb-3" />
        <p>Sessão expirada. Faça login novamente.</p>
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

  if (!matricula || matricula.tipo_conteudo !== 'pptx') {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-white gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-sm">Conteúdo PowerPoint não disponível para esta matrícula.</p>
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

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-20 border-b border-white/10 bg-slate-900/95 backdrop-blur-sm">
        <div className="flex flex-col gap-3 px-3 py-3 sm:px-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-3 md:flex-1">
            <button
              onClick={handleLeave}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Sair
            </button>
            <div className="flex min-w-0 items-start gap-2">
              <Presentation className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
              <span className="text-sm font-medium leading-5 text-white sm:text-base">
                {matricula.titulo ?? 'Apresentação'}
              </span>
            </div>
            {matricula.qualificacao_tipo_nome ? (
              <span className="inline-flex max-w-full items-center rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium leading-5 text-amber-200">
                Qualificação {matricula.qualificacao_tipo_nome}
                {matricula.qualificacao_validade
                  ? ` · ${matricula.qualificacao_validade} meses`
                  : ''}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col items-stretch gap-2 md:min-w-[280px] md:items-end">
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70">
              {alreadyConcluded ? 'Status: concluído' : 'Status: em consumo'}
            </span>

            {slides ? (
              <span className="text-xs text-white/50 md:text-right">
                {currentSlide + 1} / {slides.length}
                {!allSlidesViewed && ` · veja todos para concluir`}
              </span>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* Optional link to see original high-fidelity in Office Online */}
              {viewerSession ? (
                <button
                  type="button"
                  onClick={() => {
                    setIframeLoaded(false);
                    setPreviewOpen(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
                  title="Ver apresentação original no PowerPoint Online"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver original
                </button>
              ) : null}

              {done ? (
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Concluído
                  {qualificacaoGerada && (
                    <span className="ml-1 flex items-center gap-0.5 text-amber-400">
                      <ShieldCheck className="h-3 w-3" />
                      Qualificação gerada
                    </span>
                  )}
                </div>
              ) : canConclude ? (
                <button
                  disabled={finalizarMatricula.isPending}
                  onClick={handleConclude}
                  className="hidden items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex"
                >
                  {finalizarMatricula.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Marcar como concluído
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="relative flex-1 overflow-auto p-3 sm:p-6">
        {loadingPptx && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-10 w-10 animate-spin text-white/30" />
            <p className="text-sm text-white/50">Carregando apresentação...</p>
          </div>
        )}

        {loadError && (
          <div className="flex flex-col items-center gap-3">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <p className="text-sm text-white/70">{loadError}</p>
            <button
              onClick={() => navigate('/lms/cursos')}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            >
              Voltar ao catálogo
            </button>
          </div>
        )}

        {/* Office preview overlay (optional) */}
        {previewOpen && viewerSession && (
          <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
            <div className="flex items-center justify-between border-b border-white/10 bg-slate-900 px-4 py-3">
              <span className="text-sm text-white/80">
                Visualização original (PowerPoint Online)
              </span>
              <button
                onClick={() => setPreviewOpen(false)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10"
              >
                Fechar
              </button>
            </div>
            {!iframeLoaded && (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-white/30" />
              </div>
            )}
            <iframe
              src={viewerSession.embedUrl}
              title="Apresentação PowerPoint"
              className={`flex-1 border-0 bg-white ${iframeLoaded ? 'block' : 'hidden'}`}
              allow="fullscreen"
              onLoad={() => setIframeLoaded(true)}
            />
          </div>
        )}

        {!loadingPptx && !loadError && slideHtml && (
          <div className="mx-auto w-full max-w-4xl">
            {/* Slide card */}
            <div className="overflow-hidden rounded-xl bg-white text-slate-900 shadow-2xl sm:rounded-2xl">
              <div
                ref={slideFrameRef}
                className="relative aspect-video w-full overflow-hidden bg-white"
              >
                <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white">
                  <div
                    style={{
                      width: `${slideViewport.width}px`,
                      height: `${slideViewport.height}px`,
                      transform: `scale(${slideScale})`,
                      transformOrigin: 'center center',
                    }}
                  >
                    <div
                      ref={slideContentRef}
                      className="h-full w-full bg-white [&>*]:m-0 [&>*]:max-w-none [&>*]:shadow-none"
                      dangerouslySetInnerHTML={{ __html: slideHtml }}
                    />
                  </div>
                </div>
              </div>

              {/* Slide footer */}
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 sm:px-8">
                <span className="text-xs text-slate-400">
                  Slide {currentSlide + 1} de {slides!.length}
                </span>
                {done && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Concluído
                  </span>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
              <button
                disabled={currentSlide === 0}
                onClick={() => goToSlide(currentSlide - 1)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 sm:w-auto"
              >
                <ArrowLeftCircle className="h-4 w-4" />
                Anterior
              </button>

              {/* Slide dots */}
              <div className="flex max-w-full items-center gap-1 overflow-x-auto px-1">
                {slides!.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goToSlide(idx)}
                    className={`rounded-full transition-all ${
                      idx === currentSlide
                        ? 'h-2.5 w-2.5 bg-white'
                        : idx <= maxReached
                          ? 'h-2 w-2 bg-white/50 hover:bg-white/70'
                          : 'h-2 w-2 bg-white/20'
                    }`}
                    aria-label={`Slide ${idx + 1}`}
                  />
                ))}
              </div>

              <button
                disabled={currentSlide >= slides!.length - 1}
                onClick={() => goToSlide(currentSlide + 1)}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-medium transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30 sm:w-auto"
              >
                Próximo
                <ArrowRightCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating conclude button (mobile) */}
      {!done && canConclude ? (
        <div className="border-t border-white/10 bg-slate-900 px-3 py-3 sm:hidden">
          <button
            disabled={finalizarMatricula.isPending}
            onClick={handleConclude}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {finalizarMatricula.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Marcar como concluído
          </button>
        </div>
      ) : null}
    </div>
  );
}
