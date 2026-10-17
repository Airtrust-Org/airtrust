/**
 * CardMeusEAD — card "Meus Treinamentos EAD" para HomePerfil (ALUNO / INSTRUTOR)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  Award,
  Download,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMinhasEAD, type LmsMatriculaEAD } from '@/react-app/hooks/useLms';
import { API_BASE_URL, fetchWithAuth } from '@/react-app/config/api';
import { parseJsonResponse } from '@/react-app/lib/parseJsonResponse';
import {
  baixarCertificadoCanonico,
  resolveCertificadoDocumentoId,
  type CertificadoDownloadSource,
} from '@/react-app/utils/certificadoDownload';
import {
  getLmsRowCardBorderClasses,
  getLmsActionButtonClasses,
  getLmsActionLabel,
  getLmsProgressBarFillClasses,
  getLmsProgressLabel,
} from '@/react-app/pages/lms/lmsUi';

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * data_vencimento_qualificacao é uma data civil (YYYY-MM-DD), sem componente de
 * hora. Comparar via `new Date(iso).getTime() - Date.now()` mistura uma data
 * civil (interpretada como meia-noite UTC) com um instante real: em fusos com
 * offset negativo (ex.: America/Sao_Paulo, UTC-3), o próprio dia do vencimento
 * já aparecia como "vencido" horas antes da meia-noite local. A comparação
 * correta é civil-a-civil, tratando o dia do vencimento como ainda válido.
 */
function parseIsoDateOnlyToUtcMs(dataIso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dataIso);
  if (!match) return null;
  const [, y, m, d] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

function getTodaySaoPauloUtcMs(): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const d = Number(parts.find((p) => p.type === 'day')?.value);
  return Date.UTC(y, m - 1, d);
}

function diasParaVencer(dataIso: string | null): number | null {
  if (!dataIso) return null;
  const targetMs = parseIsoDateOnlyToUtcMs(dataIso);
  if (targetMs === null) return null;
  const todayMs = getTodaySaoPauloUtcMs();
  return Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
}

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return '—';
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}

function statusLabel(s: LmsMatriculaEAD['status']) {
  const map: Record<LmsMatriculaEAD['status'], string> = {
    NAO_INICIADO: 'Não iniciado',
    EM_ANDAMENTO: 'Em andamento',
    CONCLUIDO: 'Concluído',
    REPROVADO: 'Reprovado',
    CANCELADO: 'Cancelado',
  };
  return map[s] ?? s;
}

function isCertificadosResponse(
  data: unknown,
): data is { success: boolean; data: CertificadoDownloadSource[] } {
  if (typeof data !== 'object' || data === null) return false;
  const body = data as Record<string, unknown>;
  if (typeof body.success !== 'boolean' || !Array.isArray(body.data)) return false;
  return body.data.every((item) => typeof item === 'object' && item !== null);
}

function StatusIcon({ status }: { status: LmsMatriculaEAD['status'] }) {
  if (status === 'CONCLUIDO') return <CheckCircle2 className="w-4 h-4 text-slate-400 shrink-0" />;
  if (status === 'EM_ANDAMENTO') return <Play className="w-4 h-4 text-amber-500 shrink-0" />;
  if (status === 'REPROVADO') return <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />;
  if (status === 'NAO_INICIADO') return <Circle className="w-4 h-4 text-emerald-500 shrink-0" />;
  return <Circle className="w-4 h-4 text-slate-400 shrink-0" />;
}

// ─── botão de certificado ─────────────────────────────────────────────────────

function BotaoCertificado({ matricula }: { matricula: LmsMatriculaEAD }) {
  const [baixando, setBaixando] = useState(false);

  const historicoId = matricula.qualificacao_historico_id;
  if (!historicoId) return null;

  const handleBaixar = async () => {
    setBaixando(true);
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/certificados/historico/${historicoId}/certificados`,
      );
      const json = await parseJsonResponse(res, isCertificadosResponse);
      const certs = json.data ?? [];
      if (!certs.length) {
        toast.error('Nenhum certificado disponível para download.');
        return;
      }
      // Baixar o mais recente (primeiro da lista)
      const cert = certs[0];
      if (!resolveCertificadoDocumentoId(cert)) {
        toast.error('Certificado sem identificador de documento válido.');
        return;
      }
      await baixarCertificadoCanonico(cert);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao baixar certificado.');
    } finally {
      setBaixando(false);
    }
  };

  return (
    <button
      onClick={handleBaixar}
      disabled={baixando}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-60"
    >
      <Download className="w-3.5 h-3.5" />
      {baixando ? 'Baixando…' : 'Baixar certificado'}
    </button>
  );
}

// ─── linha de matrícula ───────────────────────────────────────────────────────

function LinhaMatricula({
  matricula,
  onAbrir,
}: {
  matricula: LmsMatriculaEAD;
  onAbrir: () => void;
}) {
  const dias = diasParaVencer(matricula.data_vencimento_qualificacao);
  const urgente = dias !== null && dias <= 7 && dias >= 0;
  const vencida = dias !== null && dias < 0;
  const concluido = matricula.status === 'CONCLUIDO';
  const emAndamento = matricula.status === 'EM_ANDAMENTO';
  const naoIniciado = matricula.status === 'NAO_INICIADO';
  const borderCls = getLmsRowCardBorderClasses(matricula.status);
  const btnCls = getLmsActionButtonClasses(matricula.status);
  const btnLabel = getLmsActionLabel(matricula.status);
  const progressFillCls = getLmsProgressBarFillClasses(matricula.status);
  // Nunca usar progresso_pct bruto diretamente como exibição — só CONCLUIDO
  // é 100%; progresso_efetivo (do backend) já aplica essa regra.
  const progressoExibido = matricula.progresso_efetivo ?? matricula.progresso_pct ?? 0;
  const progressLabel = getLmsProgressLabel(matricula.status, progressoExibido);
  // Fallback para respostas antigas sem certificate_state: preserva o
  // comportamento anterior (AVAILABLE quando tem_certificado=1).
  const certificateState = matricula.certificate_state ?? (matricula.tem_certificado === 1 ? 'AVAILABLE' : 'NOT_REQUIRED');

  return (
    <div
      className={`rounded-xl border transition-all ${
        urgente || vencida
          ? 'border-orange-200 bg-orange-50/60'
          : borderCls
      }`}
    >
      <div className="px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="flex items-start gap-3">
          {/* ícone de status */}
          <StatusIcon status={matricula.status} />

          {/* nome em linha própria no mobile */}
          <button
            onClick={onAbrir}
            className="flex-1 min-w-0 text-sm font-semibold text-slate-800 hover:text-primary transition-colors text-left leading-snug break-words dark:text-slate-200 dark:hover:text-primary"
            title={matricula.titulo ?? `Curso #${matricula.curso_id}`}
          >
            {matricula.titulo ?? `Curso #${matricula.curso_id}`}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span
            className={`text-xs font-medium ${
              concluido
                ? 'text-slate-500 dark:text-slate-400'
                : emAndamento
                  ? 'text-amber-600 dark:text-amber-400'
                  : naoIniciado
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400'
            }`}
          >
            {statusLabel(matricula.status)}
          </span>

          {/* ação principal + certificado (conclusão) */}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {concluido ? (
              <>
                <button
                  onClick={onAbrir}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnCls}`}
                >
                  {btnLabel}
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                {certificateState === 'AVAILABLE' ? (
                  <BotaoCertificado matricula={matricula} />
                ) : certificateState === 'PENDING' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    Certificado em processamento
                  </span>
                ) : null}
              </>
            ) : (
              <button
                onClick={onAbrir}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${btnCls}`}
              >
                {btnLabel}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* subtexto para concluído */}
        {concluido && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Disponível para consulta
          </p>
        )}

        {/* barra de progresso — sempre visível para todos os status */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden max-w-[160px] sm:max-w-[220px]">
            <div
              className={`h-full rounded-full transition-all ${progressFillCls}`}
              style={{ width: `${Math.min(progressoExibido, 100)}%` }}
            />
          </div>
          <span className="text-xs text-slate-500">{progressLabel}</span>
        </div>

        {/* vencimento */}
        {matricula.data_vencimento_qualificacao && (
          <div
            className={`mt-1 flex items-center gap-1 text-xs ${
              vencida
                ? 'text-red-600 font-medium'
                : urgente
                  ? 'text-orange-600 font-medium'
                  : 'text-slate-500'
            }`}
          >
            {(urgente || vencida) && <AlertTriangle className="w-3.5 h-3.5" />}
            {vencida
              ? `Vencida em ${formatarData(matricula.data_vencimento_qualificacao)}`
              : urgente
                ? `Vence em ${dias} dia${dias !== 1 ? 's' : ''}`
                : `Válida até ${formatarData(matricula.data_vencimento_qualificacao)}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── componente principal ─────────────────────────────────────────────────────

type AbaEad = 'andamento' | 'naoIniciados' | 'finalizados';

export function CardMeusEAD({ showOpenPageLink = true }: { showOpenPageLink?: boolean }) {
  const navigate = useNavigate();
  const { data: matriculas, isLoading, error } = useMinhasEAD();
  const [abaSelecionada, setAbaSelecionada] = useState<AbaEad | null>(null);

  // Matrículas canceladas não representam treinamento ativo ou concluído.
  // Reprovados ficam na aba de ação pendente, com seu status real preservado.
  const grupos: Record<AbaEad, LmsMatriculaEAD[]> = {
    andamento: (matriculas ?? []).filter(
      (m) => m.status === 'EM_ANDAMENTO' || m.status === 'REPROVADO',
    ),
    naoIniciados: (matriculas ?? []).filter((m) => m.status === 'NAO_INICIADO'),
    finalizados: (matriculas ?? []).filter((m) => m.status === 'CONCLUIDO'),
  };
  const total = grupos.andamento.length + grupos.naoIniciados.length + grupos.finalizados.length;
  // Ao carregar, abrir a primeira categoria que requer atenção, sem alterar
  // a escolha manual do usuário (inclusive quando uma categoria está vazia).
  const abaAtiva: AbaEad = abaSelecionada ??
    (grupos.andamento.length ? 'andamento' : grupos.naoIniciados.length ? 'naoIniciados' : 'finalizados');

  const abas = [
    { id: 'andamento', label: 'Em andamento', count: grupos.andamento.length, Icon: Play },
    { id: 'naoIniciados', label: 'Não iniciado', count: grupos.naoIniciados.length, Icon: Circle },
    { id: 'finalizados', label: 'Finalizados', count: grupos.finalizados.length, Icon: CheckCircle2 },
  ] as const;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5 sm:py-5 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700 sm:h-10 sm:w-10 dark:bg-sky-500/20 dark:text-sky-300">
              <BookOpen className="h-5 w-5" />
            </span>
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg dark:text-slate-100">Meus treinamentos EAD</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 sm:text-sm dark:text-slate-400">
            {total} treinamento{total !== 1 ? 's' : ''} · Acompanhe o andamento e acesse seus certificados.
          </p>
        </div>
        {showOpenPageLink && (
          <button
            type="button"
            onClick={() => navigate('/lms')}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-sky-300 dark:hover:bg-slate-800"
          >
            Abrir em página completa
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-2" aria-label="Carregando treinamentos">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            Erro ao carregar treinamentos.
          </div>
        ) : total === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-800">
            <Award className="mx-auto mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Nenhum treinamento EAD encontrado.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Quando houver cursos atribuídos a você, eles aparecerão aqui.
            </p>
          </div>
        ) : (
          <>
            <div role="group" aria-label="Filtrar treinamentos EAD por situação" className="grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1.5 dark:bg-slate-800">
              {abas.map(({ id, label, count, Icon }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={abaAtiva === id}
                  onClick={() => setAbaSelecionada(id)}
                  className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2.5 text-center text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                    abaAtiva === id
                      ? 'bg-white text-sky-800 shadow-sm ring-1 ring-sky-200 dark:bg-slate-700 dark:text-sky-200 dark:ring-sky-500/40'
                      : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700/70'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="leading-tight">{label}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                    abaAtiva === id ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200' : 'bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-100'
                  }`}>{count}</span>
                </button>
              ))}
            </div>
            <p className="my-3 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              {grupos[abaAtiva].length} treinamento{grupos[abaAtiva].length !== 1 ? 's' : ''} nesta categoria
            </p>
            {grupos[abaAtiva].length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                Nenhum treinamento nesta situação.
              </div>
            ) : (
              <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
                {grupos[abaAtiva].map((m) => (
                  <LinhaMatricula
                    key={m.id}
                    matricula={m}
                    onAbrir={() =>
                      navigate(
                        m.status === 'CONCLUIDO'
                          ? `/lms/player/${m.id}?review=1`
                          : `/lms/player/${m.id}`,
                      )
                    }
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
