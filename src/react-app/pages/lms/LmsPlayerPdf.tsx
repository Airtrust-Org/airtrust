import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { API_BASE_URL, getAccessToken } from '@/react-app/config/api';
import { useAuth } from '@/react-app/hooks/useAuth';
import {
  useFinalizarMatricula,
  useMatriculaDetalhe,
  useSalvarProgresso,
} from '@/react-app/hooks/useLms';

const CONCLUDE_DELAY_SECONDS = 30;

export default function LmsPlayerPdf() {
  const { matriculaId } = useParams<{ matriculaId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();

  const id = Number(matriculaId);
  const { data: matricula, isLoading: matriculaLoading } = useMatriculaDetalhe(id);
  const finalizarMatricula = useFinalizarMatricula();
  const salvarProgresso = useSalvarProgresso();

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(true);
  // Restore elapsed from saved progress so the countdown resumes where it left off
  const [elapsed, setElapsed] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [qualificacaoGerada, setQualificacaoGerada] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blobRef = useRef<string | null>(null);
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestElapsedRef = useRef<number>(0);

  const alreadyConcluded = matricula?.status === 'CONCLUIDO';
  const canConclude = alreadyConcluded || elapsed >= CONCLUDE_DELAY_SECONDS;

  // Load PDF from protected R2 endpoint
  useEffect(() => {
    if (!matricula?.curso_id) return;

    let cancelled = false;
    setLoadingPdf(true);
    setLoadError(null);

    async function loadPdf() {
      try {
        const tkn = getAccessToken() ?? token ?? '';
        const url = `${API_BASE_URL}/lms/pdf/asset/${matricula!.curso_id}`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${tkn}` },
        });
        if (!resp.ok) throw new Error(`Falha ao carregar PDF (${resp.status})`);
        const blob = await resp.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        blobRef.current = objectUrl;
        setBlobUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Falha ao carregar PDF');
        }
      } finally {
        if (!cancelled) setLoadingPdf(false);
      }
    }

    void loadPdf();

    return () => {
      cancelled = true;
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
  }, [matricula?.curso_id, token]);

  // Start elapsed timer once PDF is loaded
  // Restore elapsed time from previously saved progress (proportional estimate)
  useEffect(() => {
    if (!blobUrl || alreadyConcluded) return;

    // Estimate elapsed from saved progresso_pct so countdown resumes
    if (matricula?.progresso_pct && matricula.progresso_pct > 0 && elapsed === 0) {
      const estimated = Math.round((matricula.progresso_pct / 100) * CONCLUDE_DELAY_SECONDS);
      setElapsed(Math.min(estimated, CONCLUDE_DELAY_SECONDS));
    }

    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobUrl, alreadyConcluded]);

  // Save progress every 5 seconds while the PDF is being consumed
  useEffect(() => {
    if (!blobUrl || alreadyConcluded || elapsed === 0) return;
    latestElapsedRef.current = elapsed;
    if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
    progressSaveRef.current = setTimeout(() => {
      const pct = Math.min(Math.round((elapsed / CONCLUDE_DELAY_SECONDS) * 100), 99);
      salvarProgresso.mutate({ matriculaId: id, progresso_pct: pct });
    }, 5000);
    return () => {
      if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  // Flush progress when user closes/hides the tab (best-effort with keepalive)
  useEffect(() => {
    if (!id || alreadyConcluded) return;

    const flush = () => {
      const elapsed = latestElapsedRef.current;
      if (elapsed <= 0) return;
      const pct = Math.min(Math.round((elapsed / CONCLUDE_DELAY_SECONDS) * 100), 99);
      const activeToken = getAccessToken() ?? token ?? '';
      if (!activeToken) return;
      void fetch(`${API_BASE_URL}/lms/matriculas/${id}/progresso`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ progresso_pct: pct }),
        keepalive: true,
      }).catch(() => {
        /* best-effort */
      });
    };

    window.addEventListener('pagehide', flush);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, alreadyConcluded, token]);

  const handleConclude = useCallback(() => {
    if (completed || alreadyConcluded) return;
    finalizarMatricula.mutate(id, {
      onSuccess: (data) => {
        setCompleted(true);
        if (data.qualificacao_gerada?.qualificacao_historico_id) setQualificacaoGerada(true);
        if (timerRef.current) clearInterval(timerRef.current);
      },
    });
  }, [completed, alreadyConcluded, finalizarMatricula, id]);

  const handleLeave = useCallback(() => {
    const shouldConfirm = !completed && !alreadyConcluded;
    if (shouldConfirm) {
      const confirmed = window.confirm('O curso ainda não foi concluído. Deseja sair mesmo assim?');
      if (!confirmed) return;
    }
    navigate('/lms/cursos');
  }, [completed, alreadyConcluded, navigate]);

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

  if (!matricula || matricula.tipo_conteudo !== 'pdf') {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 text-white gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-sm">Conteúdo PDF não disponível para esta matrícula.</p>
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

  const done = completed || alreadyConcluded;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      {/* Header bar */}
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
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
              <span className="text-sm font-medium leading-5 text-white sm:text-base">
                {matricula.titulo ?? 'Curso PDF'}
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
            {!done && (
              <div className="flex items-center gap-1.5 text-xs text-white/50">
                <Clock3 className="h-3.5 w-3.5" />
                {elapsed < CONCLUDE_DELAY_SECONDS
                  ? `Disponível em ${CONCLUDE_DELAY_SECONDS - elapsed}s`
                  : 'Pronto para concluir'}
              </div>
            )}
            {blobUrl ? (
              <a
                href={blobUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10 md:justify-start"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir documento
              </a>
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
            ) : (
              <button
                disabled={!canConclude || finalizarMatricula.isPending}
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
            )}
          </div>
        </div>
      </div>

      {/* PDF area */}
      <div className="relative flex-1 bg-slate-950 sm:p-4">
        {loadingPdf && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-white/30" />
          </div>
        )}

        {loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
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

        {blobUrl && !loadingPdf && !loadError && (
          <div className="h-full overflow-hidden bg-white sm:rounded-xl sm:border sm:border-slate-200">
            <iframe
              src={blobUrl}
              className="h-full w-full"
              title={matricula.titulo ?? 'Documento PDF'}
            />
          </div>
        )}
      </div>

      {!done ? (
        <div className="border-t border-white/10 bg-slate-900 px-3 py-3 sm:hidden">
          <button
            disabled={!canConclude || finalizarMatricula.isPending}
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
