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
  Clock,
  CheckCircle2,
  Circle,
  Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { useMinhasEAD, type LmsMatriculaEAD } from '@/react-app/hooks/useLms';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { API_BASE_URL } from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';

// ─── helpers ──────────────────────────────────────────────────────────────────

function diasParaVencer(dataIso: string | null): number | null {
  if (!dataIso) return null;
  const diff = new Date(dataIso).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(iso));
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

function StatusIcon({ status }: { status: LmsMatriculaEAD['status'] }) {
  if (status === 'CONCLUIDO') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />;
  if (status === 'EM_ANDAMENTO') return <Play className="w-4 h-4 text-blue-500 shrink-0" />;
  if (status === 'REPROVADO') return <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />;
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
      const res = await apiFetch(
        `${API_BASE_URL}/certificados/historico/${historicoId}/certificados`,
      );
      const json = await res.json<{
        success: boolean;
        data: Array<{ r2_key: string; nome_arquivo: string }>;
      }>();
      const certs = json.data ?? [];
      if (!certs.length) {
        toast.error('Nenhum certificado disponível para download.');
        return;
      }
      // Baixar o mais recente (primeiro da lista)
      const cert = certs[0];
      const streamRes = await apiFetch(
        `${API_BASE_URL}/documentos/download/${encodeURIComponent(cert.r2_key)}`,
      );
      if (!streamRes.ok) throw new Error('Falha ao baixar certificado.');
      const blob = await streamRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = cert.nome_arquivo ?? 'certificado.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao baixar certificado.');
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

  return (
    <div
      className={`rounded-xl border transition-all ${
        urgente || vencida
          ? 'border-orange-200 bg-orange-50/60'
          : concluido
            ? 'border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-900/40'
            : emAndamento
              ? 'border-emerald-300 bg-emerald-50/30 border-l-4 border-l-emerald-500 dark:border-emerald-800 dark:bg-emerald-950/15 dark:border-l-emerald-600'
              : 'border-slate-100 bg-slate-50/50 hover:bg-white hover:border-slate-200'
      }`}
    >
      <div className="px-3 sm:px-4 py-2.5 sm:py-3">
        <div className="flex items-start gap-3">
          {/* ícone de status */}
          <StatusIcon status={matricula.status} />

          {/* nome em linha própria no mobile */}
          <button
            onClick={onAbrir}
            className="flex-1 min-w-0 text-sm font-semibold text-slate-800 hover:text-primary transition-colors text-left leading-snug truncate dark:text-slate-200 dark:hover:text-primary"
            title={matricula.titulo ?? `Curso #${matricula.curso_id}`}
          >
            {matricula.titulo ?? `Curso #${matricula.curso_id}`}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3">
          <span
            className={`text-xs font-medium ${
              concluido
                ? 'text-emerald-700 dark:text-emerald-300'
                : matricula.status === 'EM_ANDAMENTO'
                  ? 'text-blue-600'
                  : 'text-slate-400'
            }`}
          >
            {statusLabel(matricula.status)}
          </span>

          {/* certificado ou abrir */}
          <div className="shrink-0 flex items-center gap-2">
            {matricula.tem_certificado === 1 ? (
              <BotaoCertificado matricula={matricula} />
            ) : concluido ? (
              <button
                onClick={onAbrir}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Rever conteúdo
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={onAbrir}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                {matricula.status === 'NAO_INICIADO'
                  ? 'Iniciar'
                  : 'Continuar'}
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

        {/* barra de progresso */}
        {matricula.status !== 'NAO_INICIADO' && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden max-w-[160px] sm:max-w-[220px]">
              <div
                className={`h-full rounded-full transition-all ${
                  concluido ? 'bg-emerald-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(matricula.progresso_pct ?? 0, 100)}%` }}
              />
            </div>
            <span className="text-xs text-slate-500">{matricula.progresso_pct ?? 0}%</span>
          </div>
        )}

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

export function CardMeusEAD() {
  const navigate = useNavigate();
  const { isAluno, isInstrutor } = usePermissions();
  const { data: matriculas, isLoading, error } = useMinhasEAD();

  const emAndamento = (matriculas ?? []).filter(
    (m) => m.status !== 'CANCELADO' && m.status !== 'CONCLUIDO',
  );
  const concluidos = (matriculas ?? []).filter((m) => m.status === 'CONCLUIDO');
  const lista = [...emAndamento, ...concluidos];

  return (
    <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* cabeçalho */}
      <div className="px-4 py-4 sm:px-5 sm:py-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
              </span>
              <h2 className="text-base sm:text-lg font-semibold text-slate-900">Meus Treinamentos EAD</h2>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">Seus cursos, progresso e certificados.</p>
          </div>
        {lista.length > 0 && (
          <button
            onClick={() => navigate('/lms')}
            className="hidden sm:inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 hover:text-primary transition-colors"
          >
            Ver todos
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
      </div>

      {/* corpo */}
      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 sm:h-14 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
            Erro ao carregar treinamentos.
          </div>
        ) : lista.length === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-6 sm:py-8 text-center">
            <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">Nenhum treinamento EAD encontrado.</p>
            <p className="text-xs text-slate-400 mt-1">
              Quando houver cursos disponíveis, eles aparecerão aqui.
            </p>
            <button
              onClick={() => navigate('/lms/cursos')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Ver catálogo de cursos
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {lista.slice(0, 10).map((m) => (
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
            {lista.length > 10 && (
              <button
                onClick={() => navigate('/lms')}
                className="w-full py-2 text-sm text-slate-500 hover:text-primary transition-colors"
              >
                +{lista.length - 10} mais → Ver todos
              </button>
            )}
          </div>
        )}
      </div>

      {/* rodapé mobile */}
      {lista.length > 0 && (
        <div className="sm:hidden border-t border-slate-100 px-4 py-3">
          <button
            onClick={() => navigate('/lms')}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium text-primary"
          >
            Ver todos os treinamentos
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
}
