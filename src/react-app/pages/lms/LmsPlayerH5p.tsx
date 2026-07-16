/**
 * LmsPlayerH5p — Player H5P
 * Rota: /lms/player/h5p/:matriculaId
 *
 * Inicializa h5p-standalone em um div container, servindo os arquivos via
 * /api/lms/h5p/assets/:h5pId/*
 * Captura eventos xAPI via H5P.externalDispatcher e os envia para o backend.
 */
import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { useMatriculaDetalhe, usePostXapiStatement } from '@/react-app/hooks/useLms';
import type { PostXapiStatementResult } from '@/react-app/hooks/useLms';
import {
  API_BASE_URL,
  AUTH_TOKEN_CHANGED_EVENT,
  ensureValidAccessToken,
  fetchWithAuth,
  getAccessToken,
} from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';

type H5PStandaloneClass = new (
  el: HTMLElement,
  opts: Record<string, unknown>,
) => { xAPIEventDispatcher?: unknown };

interface H5PStandaloneModule {
  default?: H5PStandaloneClass | { H5PStandalone?: H5PStandaloneClass };
  H5PStandalone?: H5PStandaloneClass;
}

interface H5PStatement {
  actor?: Record<string, unknown>;
  verb?: { id?: string; display?: Record<string, string> };
  object?: { id?: string; objectType?: string };
  result?: PostXapiStatementResult | Record<string, unknown>;
  context?: Record<string, unknown>;
  timestamp?: string;
}

interface H5PEventEnvelope {
  data?: {
    statement?: H5PStatement;
  };
  statement?: H5PStatement;
}

interface H5PWindowWithDispatcher extends Window {
  H5P?: {
    externalDispatcher?: {
      on?: (eventName: string, handler: (event: H5PEventEnvelope) => void) => void;
    };
  };
}

function getStandaloneAssetPath(path: string): string {
  const basePath = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  return `${normalizedBase}${path.replace(/^\/+/, '')}`;
}

interface CompletionInfo {
  qualificacao: boolean;
  qualificacao_id?: number;
}

function resolveH5PStandaloneCtor(module: unknown): H5PStandaloneClass {
  const candidate = module as H5PStandaloneModule;
  const direct = candidate.H5PStandalone;
  if (direct) return direct;

  if (typeof candidate.default === 'function') {
    return candidate.default as H5PStandaloneClass;
  }

  if (
    candidate.default &&
    'H5PStandalone' in candidate.default &&
    candidate.default.H5PStandalone
  ) {
    return candidate.default.H5PStandalone;
  }

  throw new Error('H5PStandalone constructor not found');
}

function extractStatement(event: H5PEventEnvelope): H5PStatement | null {
  return event.data?.statement ?? event.statement ?? null;
}

export default function LmsPlayerH5p() {
  const { matriculaId } = useParams<{ matriculaId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const [completed, setCompleted] = useState(false);
  const [completionInfo, setCompletionInfo] = useState<CompletionInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [playerToken, setPlayerToken] = useState<string | null>(() => getAccessToken() ?? token);
  const [assetSessionReady, setAssetSessionReady] = useState(false);

  const id = Number(matriculaId);
  const { data: matricula, isLoading } = useMatriculaDetalhe(id);
  const postStatement = usePostXapiStatement();

  const h5pId = matricula?.h5p_conteudo_id ?? null;

  useEffect(() => {
    let cancelled = false;

    async function syncAssetSession() {
      try {
        const nextToken = await ensureValidAccessToken();
        if (cancelled) return;

        setPlayerToken(nextToken ?? null);
        if (!nextToken) {
          setAssetSessionReady(false);
          return;
        }

        const response = await fetchWithAuth('/api/lms/assets/session', { method: 'POST' });
        if (!cancelled) {
          setAssetSessionReady(response.ok);
        }
      } catch {
        if (!cancelled) {
          setAssetSessionReady(false);
          setPlayerToken(null);
        }
      }
    }

    void syncAssetSession();

    const onTokenChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ token?: string | null }>).detail;
      setPlayerToken(detail?.token ?? getAccessToken());
      void syncAssetSession();
    };

    const intervalId = window.setInterval(
      () => {
        void syncAssetSession();
      },
      10 * 60 * 1000,
    );

    window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged as EventListener);
    };
  }, [token]);

  useEffect(() => {
    if (
      isLoading ||
      !matricula ||
      !containerRef.current ||
      initializedRef.current ||
      !assetSessionReady ||
      !playerToken
    ) {
      return;
    }

    // If no h5p content associated, fall back to SCORM player
    if (!h5pId) {
      setLoadError('Nenhum conteúdo H5P vinculado a este curso.');
      setInitializing(false);
      return;
    }

    initializedRef.current = true;

    async function init() {
      let dispatcherPollTimer: number | null = null;

      try {
        // Dynamic import of h5p-standalone
        const H5PModule = await import('h5p-standalone');
        const H5PStandalone = resolveH5PStandaloneCtor(H5PModule);

        const baseUrl = API_BASE_URL;
        const standaloneFrameJs = getStandaloneAssetPath('h5p-standalone/frame.bundle.js');
        const standaloneFrameCss = getStandaloneAssetPath('h5p-standalone/styles/h5p.css');

        const instance = new H5PStandalone(containerRef.current!, {
          h5pJsonPath: `${baseUrl}/api/lms/h5p/assets/${h5pId}`,
          frameJs: standaloneFrameJs,
          frameCss: standaloneFrameCss,
          contentJsonPath: `${baseUrl}/api/lms/h5p/assets/${h5pId}/content`,
          librariesPath: `${baseUrl}/api/lms/h5p/assets/${h5pId}`,
          frame: true,
          fullScreen: true,
          // xAPI integration
          xAPIObjectIRI: `https://airtrust.app/lms/matricula/${id}`,
        });

        // Listen for xAPI events dispatched by H5P content
        // h5p-standalone patches H5P.externalDispatcher
        const win = window as H5PWindowWithDispatcher;

        function onXapiEvent(event: H5PEventEnvelope) {
          try {
            const stmt = extractStatement(event);
            if (!stmt?.verb?.id) return;

            const dto = {
              matricula_id: id,
              actor: stmt.actor ?? {
                mbox: 'mailto:anon@airtrust.app',
              },
              verb: {
                id: stmt.verb.id,
                display: stmt.verb.display,
              },
              object: {
                id: stmt.object?.id ?? `h5p:${h5pId}`,
                objectType: stmt.object?.objectType ?? 'Activity',
              },
              result: stmt.result as PostXapiStatementResult | undefined,
              context: stmt.context,
              timestamp: stmt.timestamp ?? new Date().toISOString(),
            };

            postStatement
              .mutateAsync(dto)
              .then((res) => {
                if (res.novo_status === 'CONCLUIDO' && !completed) {
                  setCompleted(true);
                  setCompletionInfo({
                    qualificacao: !!res.qualificacao_gerada,
                    qualificacao_id: (res.qualificacao_gerada as Record<string, unknown>)
                      ?.qualificacao_id as number | undefined,
                  });
                }
              })
              .catch(() => undefined);
          } catch {
            return;
          }
        }

        // H5P.externalDispatcher is available after instance init
        const checkDispatcher = () => {
          if (win.H5P?.externalDispatcher) {
            win.H5P.externalDispatcher.on('xAPI', onXapiEvent);
          } else {
            dispatcherPollTimer = window.setTimeout(checkDispatcher, 300);
          }
        };
        checkDispatcher();

        // Also listen for postMessage from iframe (some H5P content uses this)
        function onMessage(evt: MessageEvent) {
          if (!evt.data || typeof evt.data !== 'object') return;
          if ('statement' in evt.data) {
            onXapiEvent(evt.data as H5PEventEnvelope);
          }
        }
        window.addEventListener('message', onMessage);

        // Store cleanup ref
        (containerRef.current as HTMLDivElement & { _h5pCleanup?: () => void })._h5pCleanup =
          () => {
            if (win.H5P?.externalDispatcher) {
              // H5P dispatcher doesn't have .off in h5p-standalone, just null-guard
            }
            if (dispatcherPollTimer !== null) {
              window.clearTimeout(dispatcherPollTimer);
            }
            window.removeEventListener('message', onMessage);
          };

        void instance;
        setInitializing(false);
      } catch {
        setLoadError('Erro ao inicializar o conteúdo H5P. Tente recarregar a página.');
        setInitializing(false);
      }
    }

    void init();

    return () => {
      const el = containerRef.current as (HTMLDivElement & { _h5pCleanup?: () => void }) | null;
      el?._h5pCleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetSessionReady, h5pId, id, isLoading, matricula, playerToken, postStatement]);

  // ── Token guard ─────────────────────────────────────────────────────────────

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

  if (isLoading) {
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
          onClick={() => navigate('/lms/cursos')}
          className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar ao catálogo
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 backdrop-blur border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/lms/cursos')}
            className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {matricula.titulo ?? 'Curso'}
          </button>
          <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-medium text-orange-400">
            H5P
          </span>
        </div>

        <div className="flex items-center gap-3">
          {completed && (
            <span className="flex items-center gap-1.5 rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-medium text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Concluído
            </span>
          )}
        </div>
      </div>

      {/* H5P container */}
      <div className="flex-1 relative overflow-auto bg-white">
        {(initializing || isLoading) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950 z-10">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-white/50 mx-auto" />
              <p className="text-sm text-white/40">Carregando conteúdo H5P...</p>
            </div>
          </div>
        )}

        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-10 gap-4">
            <AlertTriangle className="h-10 w-10 text-amber-400" />
            <p className="text-sm text-white/70 max-w-sm text-center">{loadError}</p>
            <button
              onClick={() => navigate('/lms/cursos')}
              className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao catálogo
            </button>
          </div>
        )}

        {/* H5P mounts here */}
        <div
          ref={containerRef}
          className="w-full min-h-full p-4"
          style={{ minHeight: 'calc(100vh - 48px)' }}
        />
      </div>

      {/* Completion overlay */}
      {completed && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4 text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-4">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Conteúdo concluído!</h2>
            {completionInfo?.qualificacao && (
              <p className="text-sm text-slate-500">
                Qualificação gerada automaticamente com sucesso.
              </p>
            )}
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => navigate('/lms/cursos')}
                className="w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Voltar ao catálogo
              </button>
              <button
                onClick={() => setCompleted(false)}
                className="w-full rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                Continuar revisando
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
