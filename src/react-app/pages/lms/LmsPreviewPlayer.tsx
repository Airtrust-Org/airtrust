import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftCircle,
  ArrowRightCircle,
  Eye,
  ExternalLink,
  FileText,
  Loader2,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  Presentation,
} from 'lucide-react';
import {
  API_BASE_URL,
  AUTH_TOKEN_CHANGED_EVENT,
  ensureValidAccessToken,
  getAccessToken,
} from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useLmsCurso } from '@/react-app/hooks/useLms';
import { parsePptx, type ParsedSlide } from './pptxParsing';
import {
  canUseOfficePptxViewer,
  fetchPptxViewerSession,
  type PptxViewerSession,
} from './pptxViewer';

function formatMinutes(value: number | null | undefined) {
  if (!value) return 'Sem carga horária definida';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}min`;
}

export default function LmsPreviewPlayer() {
  const { cursoId } = useParams<{ cursoId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const blobRef = useRef<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewToken, setPreviewToken] = useState<string | null>(() => getAccessToken() ?? token);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [pptxViewerSession, setPptxViewerSession] = useState<PptxViewerSession | null>(null);
  const [slides, setSlides] = useState<ParsedSlide[] | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const id = Number(cursoId);
  const { data: curso, isLoading } = useLmsCurso(id);
  const previewType = curso?.tipo_conteudo ?? null;
  const launchUrl =
    previewType === 'scorm' && previewToken && id
      ? `${API_BASE_URL}/lms/scorm/preview/${id}?token=${encodeURIComponent(previewToken)}`
      : null;

  useEffect(() => {
    let cancelled = false;

    async function syncToken() {
      try {
        const nextToken = await ensureValidAccessToken();
        if (!cancelled) {
          setPreviewToken(nextToken ?? null);
        }
      } catch {
        if (!cancelled) {
          setPreviewToken(null);
        }
      }
    }

    void syncToken();

    const onTokenChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string | null }>).detail;
      setPreviewToken(detail?.token ?? getAccessToken());
    };

    window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged as EventListener);

    return () => {
      cancelled = true;
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged as EventListener);
    };
  }, [token]);

  useEffect(() => {
    setIframeLoaded(false);
  }, [launchUrl]);

  useEffect(() => {
    if (!curso || !previewToken) return;
    if (previewType !== 'pdf' && previewType !== 'pptx') {
      setLoadingAsset(false);
      setLoadError(null);
      setSlides(null);
      setBlobUrl(null);
      setPptxViewerSession(null);
      return;
    }

    let cancelled = false;
    setLoadingAsset(true);
    setLoadError(null);
    setSlides(null);
    setBlobUrl(null);
    setPptxViewerSession(null);
    setCurrentSlide(0);
    setIframeLoaded(false);

    async function loadAsset() {
      if (!curso) return;
      try {
        if (previewType === 'pptx' && canUseOfficePptxViewer()) {
          try {
            const session = await fetchPptxViewerSession(curso.id);
            if (cancelled) return;
            setPptxViewerSession(session);
            return;
          } catch {
            // Fallback local parser.
          }
        }

        const endpoint =
          previewType === 'pdf'
            ? `${API_BASE_URL}/lms/pdf/asset/${curso.id}`
            : `${API_BASE_URL}/lms/pptx/asset/${curso.id}`;
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${previewToken}` },
        });

        if (!response.ok) {
          throw new Error(`Falha ao carregar preview (${response.status})`);
        }

        if (previewType === 'pdf') {
          const blob = await response.blob();
          if (cancelled) return;
          const nextBlobUrl = URL.createObjectURL(blob);
          blobRef.current = nextBlobUrl;
          setBlobUrl(nextBlobUrl);
        } else {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (cancelled) return;
          setSlides(parsePptx(bytes));
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Falha ao carregar preview');
        }
      } finally {
        if (!cancelled) setLoadingAsset(false);
      }
    }

    void loadAsset();

    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [curso, previewToken, previewType]);

  const heroMeta = useMemo(
    () => [
      curso?.categoria || 'Sem categoria',
      formatMinutes(curso?.carga_horaria_minutos),
      previewType === 'pdf'
        ? 'PDF'
        : previewType === 'pptx'
          ? 'PowerPoint'
          : curso?.scorm_versao
            ? `SCORM ${curso.scorm_versao}`
            : 'Conteúdo interativo',
    ],
    [curso, previewType],
  );

  const currentSlideData = slides?.[currentSlide] ?? null;

  function sendSlideCommand(direction: 'prev' | 'next') {
    const element = frameRef.current;
    if (!element?.contentWindow) return;
    element.contentWindow.postMessage(
      {
        type: 'lms:navigate',
        direction,
      },
      window.location.origin,
    );
  }

  function handleExit() {
    const historyIndex = window.history.state?.idx;
    const hasValidHistory = typeof historyIndex === 'number' ? historyIndex > 0 : window.history.length > 1;
    if (hasValidHistory) {
      navigate(-1);
      return;
    }
    const fallbackRoute =
      typeof location.state === 'object' &&
      location.state &&
      'from' in location.state &&
      typeof (location.state as { from?: unknown }).from === 'string'
        ? (location.state as { from: string }).from
        : '/lms';
    navigate(fallbackRoute, { replace: true });
  }

  function handleFullscreen() {
    const element = surfaceRef.current ?? frameRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void element.requestFullscreen();
  }

  const goToSlide = useCallback(
    (nextIndex: number) => {
      if (!slides) return;
      const clamped = Math.max(0, Math.min(nextIndex, slides.length - 1));
      setCurrentSlide(clamped);
    },
    [slides],
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (!curso) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-white">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-sm text-white/70">Curso não encontrado para pré-visualização.</p>
        <button
          onClick={handleExit}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          Voltar
        </button>
      </div>
    );
  }

  if (!token && !previewToken) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-slate-950 text-white">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-sm text-white/70">Sessão expirada. Faça login novamente.</p>
        <button
          onClick={handleExit}
          className="rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <aside
        className={`border-r border-white/10 bg-slate-900/95 backdrop-blur transition-all ${
          sidebarOpen ? 'w-[320px]' : 'w-[76px]'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                onClick={handleExit}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {sidebarOpen ? 'Voltar' : ''}
              </button>
              <button
                onClick={() => setSidebarOpen((value) => !value)}
                className="rounded-full border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10"
                title={sidebarOpen ? 'Recolher painel' : 'Expandir painel'}
              >
                {sidebarOpen ? (
                  <PanelRightClose className="h-4 w-4" />
                ) : (
                  <PanelRightOpen className="h-4 w-4" />
                )}
              </button>
            </div>

            {sidebarOpen && (
              <>
                <div className="mb-4 rounded-[28px] border border-sky-400/20 bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-900 p-5 shadow-2xl shadow-blue-950/50">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
                      Player de teste
                    </span>
                    <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
                      Sem matrícula ativa
                    </span>
                  </div>
                  <h1 className="text-xl font-semibold leading-tight">{curso.titulo}</h1>
                  {curso.descricao ? (
                    <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-white/80">
                      {curso.descricao}
                    </p>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm text-white/70 sm:grid-cols-2 lg:grid-cols-1">
                  {heroMeta.map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {sidebarOpen && (
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <Eye className="h-4 w-4 text-sky-300" />
                  Ações rápidas
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {previewType === 'scorm' ? (
                    <>
                      <button
                        onClick={() => sendSlideCommand('prev')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10"
                      >
                        Voltar slide
                      </button>
                      <button
                        onClick={() => sendSlideCommand('next')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/20 hover:bg-orange-400"
                      >
                        Próximo
                      </button>
                    </>
                  ) : previewType === 'pptx' ? (
                    pptxViewerSession ? (
                      <a
                        href={pptxViewerSession.openUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Abrir no PowerPoint Online
                      </a>
                    ) : (
                      <>
                        <button
                          onClick={() => goToSlide(currentSlide - 1)}
                          disabled={currentSlide <= 0}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Voltar slide
                        </button>
                        <button
                          onClick={() => goToSlide(currentSlide + 1)}
                          disabled={!slides || currentSlide >= slides.length - 1}
                          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-orange-950/20 hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Próximo
                        </button>
                      </>
                    )
                  ) : blobUrl ? (
                    <a
                      href={blobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="col-span-2 inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir arquivo
                    </a>
                  ) : null}
                  <button
                    onClick={handleFullscreen}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 ${blobUrl || pptxViewerSession ? 'col-span-2' : ''}`}
                  >
                    Tela cheia
                  </button>
                </div>
              </section>

              <section className="rounded-3xl border border-sky-400/15 bg-sky-400/10 p-4 text-sm text-sky-50">
                <div className="mb-2 font-semibold">Modo de revisão</div>
                <p className="leading-relaxed text-sky-50/85">
                  Use este painel para validar navegação, leitura visual e ações do pacote antes de
                  publicar. Aqui não há gravação de progresso nem qualificação.
                </p>
              </section>

              <section className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">O que está sendo testado</div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-white/50">
                    Checklist
                  </span>
                </div>
                <ul className="space-y-2 text-sm text-white/70">
                  <li>Execução do conteúdo pelo mesmo arquivo armazenado no curso.</li>
                  <li>Validação visual, navegação e leitura antes de publicar.</li>
                  <li>Revisão sem progresso nem qualificação operacional.</li>
                </ul>
              </section>

              <section className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-50">
                Esta visualização não grava progresso nem gera qualificação. Use-a para revisar o
                conteúdo antes de publicar.
              </section>
            </div>
          )}
        </div>
      </aside>

      <main className="relative flex-1">
        <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/70 px-4 py-3 backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/45">Player de teste</p>
            <p className="text-sm text-white/75">Execução do curso sem matrícula ativa</p>
          </div>
          <button
            onClick={handleFullscreen}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-white/80 hover:bg-white/10"
            title="Alternar tela cheia"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {((previewType === 'scorm' && !iframeLoaded && launchUrl) ||
          (previewType !== 'scorm' && loadingAsset)) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
            <div className="text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-white/40" />
              <p className="mt-3 text-sm text-white/60">Montando ambiente de preview...</p>
            </div>
          </div>
        )}

        {loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <p className="text-sm text-white/70">{loadError}</p>
          </div>
        ) : null}

        {previewType === 'scorm' && launchUrl ? (
          <iframe
            ref={frameRef}
            src={launchUrl}
            title={`${curso.titulo} · Preview`}
            className="h-[calc(100vh-61px)] w-full border-0 bg-white"
            allow="autoplay; fullscreen; clipboard-write"
            allowFullScreen
            onLoad={() => setIframeLoaded(true)}
          />
        ) : null}

        {previewType === 'pdf' && blobUrl ? (
          <div ref={surfaceRef} className="h-[calc(100vh-61px)] w-full bg-white">
            <iframe
              src={blobUrl}
              className="h-full w-full border-0"
              title={`${curso.titulo} · Preview PDF`}
            />
          </div>
        ) : null}

        {previewType === 'pptx' && pptxViewerSession ? (
          <div ref={surfaceRef} className="h-[calc(100vh-61px)] w-full bg-white">
            <iframe
              src={pptxViewerSession.embedUrl}
              className="h-full w-full border-0"
              title={`${curso.titulo} · Preview PowerPoint`}
              allow="fullscreen"
              onLoad={() => setIframeLoaded(true)}
            />
          </div>
        ) : null}

        {previewType === 'pptx' && !pptxViewerSession && currentSlideData ? (
          <div
            ref={surfaceRef}
            className="h-[calc(100vh-61px)] overflow-auto bg-slate-950 p-4 sm:p-8"
          >
            <div className="mx-auto max-w-5xl space-y-4">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-white/50">
                <span>Slide {currentSlide + 1}</span>
                <span>{slides?.length ?? 0} no total</span>
              </div>
              <div className="rounded-[28px] border border-white/10 bg-white p-6 text-slate-900 shadow-2xl shadow-slate-950/40">
                <div className="mb-4 flex items-center gap-3 text-slate-500">
                  <Presentation className="h-5 w-5 text-orange-500" />
                  <span className="text-sm font-medium">Preview do slide atual</span>
                </div>

                <div className="space-y-4">
                  {currentSlideData.texts.length > 0 ? (
                    currentSlideData.texts.map((text, index) => (
                      <p key={`${currentSlide}-${index}`} className="text-base leading-7">
                        {text}
                      </p>
                    ))
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      <FileText className="h-4 w-4" />
                      Este slide não possui texto extraível.
                    </p>
                  )}

                  {currentSlideData.imageObjectUrls.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {currentSlideData.imageObjectUrls.map((src, index) => (
                        <img
                          key={`${currentSlide}-image-${index}`}
                          src={src}
                          alt={`Slide ${currentSlide + 1} imagem ${index + 1}`}
                          className="w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain"
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-between gap-3">
                <button
                  type="button"
                  onClick={() => goToSlide(currentSlide - 1)}
                  disabled={currentSlide <= 0}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/85 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeftCircle className="h-4 w-4" />
                  Slide anterior
                </button>
                <button
                  type="button"
                  onClick={() => goToSlide(currentSlide + 1)}
                  disabled={!slides || currentSlide >= slides.length - 1}
                  className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Próximo slide
                  <ArrowRightCircle className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {previewType !== 'scorm' &&
        previewType !== 'pdf' &&
        previewType !== 'pptx' &&
        !loadError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 px-6 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <p className="text-sm text-white/70">
              Este formato ainda não possui preview administrativo por curso.
            </p>
          </div>
        ) : null}
      </main>
    </div>
  );
}
