import { Fragment, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import ControleVoosStatCards from './ControleVoosStatCards';
import { frmsBrazilOperationalTodayIso } from '@/react-app/pages/frms/frmsOperationalDate';
import {
  useFrmsOperacionalPainel,
  type CvFrmsCrewDispatchAssessment,
  type CvFrmsFlightDispatchItem,
  type FrmsDispatchGateReasonCode,
  type FrmsDispatchReadinessStatus,
} from '@/react-app/hooks/useControleVoos';

/**
 * Painel operacional compacto (Controle Operacional FRMS / Gate de
 * Despacho V1), agora consultivo. Traduz o snapshot FRMS do backend
 * (LIBERAVEL/ATENCAO_COORDENACAO/NAO_LIBERADO) — nao mostra KSS, WOCL,
 * rolling ou thresholds aqui; detalhe tecnico fica no drill-down por
 * tripulante (expandir a linha).
 */

const REASON_LABELS: Record<FrmsDispatchGateReasonCode, string> = {
  TRIPULACAO_AUSENTE: 'Tripulação não cadastrada',
  CHECKIN_DIARIO_PENDENTE: 'Check-in diário pendente',
  CHECKIN_INCONSISTENTE: 'Check-in inconsistente',
  DECISAO_FRMS_CRITICA: 'Violação crítica de FRMS',
  DECISAO_FRMS_MITIGACAO_NECESSARIA: 'Mitigação necessária',
  DECISAO_FRMS_NAO_AVALIADO: 'Análise operacional FRMS inconclusiva (não significa check-in pendente)',
  FADIGA_ACUMULADA_CRITICA: 'Fadiga acumulada crítica',
  SNAPSHOT_FRMS_AUSENTE: 'Dado FRMS ausente',
  SNAPSHOT_FRMS_INCONSISTENTE: 'Dado FRMS inconsistente',
  DECISAO_FRMS_ATENCAO: 'Atenção na decisão FRMS diária',
  FADIGA_ACUMULADA_ATENCAO: 'Fadiga acumulada em atenção',
  DADO_ESTIMADO: 'Dado estimado (não confirmado)',
};

const SITUACAO_LABELS: Record<FrmsDispatchReadinessStatus, string> = {
  LIBERAVEL: 'SEM ALERTAS',
  ATENCAO_COORDENACAO: 'ATENÇÃO FRMS',
  NAO_LIBERADO: 'ALERTA FRMS',
};

const SITUACAO_STYLES: Record<FrmsDispatchReadinessStatus, string> = {
  LIBERAVEL: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  ATENCAO_COORDENACAO: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  NAO_LIBERADO: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const FADIGA_LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  ATENCAO: 'Atenção',
  CRITICO: 'Crítico',
  INDISPONIVEL: 'Sem conclusão',
};

const CHECKIN_LABELS: Record<string, string> = {
  RECEBIDO: 'Recebido',
  PENDENTE: 'Pendente',
  AUSENTE: 'Ausente',
  NAO_APLICAVEL: 'Não confirmado',
  INDISPONIVEL: 'Indisponível',
};

/**
 * O backend transmite instante ISO com UTC/offset. Na fila operacional
 * mostramos a hora de Brasília, nunca o valor ISO cru. Se o fuso não vier,
 * não presumimos conversão para evitar horário operacional incorreto.
 */
function formatDepartureTime(value: string | null | undefined): string {
  if (!value) return 'Horário não informado';
  const raw = value.trim();
  if (!/(?:Z|[+-]\\d{2}:\\d{2})$/i.test(raw)) return `${raw} (fuso não informado)`;
  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return 'Horário inválido — conferir programação';
  const local = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(parsed);
  return `${local} (Brasília)`;
}

function fadigaClass(nivel: string): string {
  if (nivel === 'CRITICO') return 'text-red-600 dark:text-red-400 font-semibold';
  if (nivel === 'ATENCAO') return 'text-amber-600 dark:text-amber-400 font-semibold';
  if (nivel === 'NORMAL') return 'text-emerald-600 dark:text-emerald-400';
  return 'text-slate-400 dark:text-slate-500';
}

function VooStatusIcon({ status }: { status: FrmsDispatchReadinessStatus }) {
  if (status === 'LIBERAVEL') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'ATENCAO_COORDENACAO') return <AlertTriangle className="h-4 w-4 text-amber-500" />;
  return <XCircle className="h-4 w-4 text-red-500" />;
}

function CrewRow({ voo, membro }: { voo: CvFrmsFlightDispatchItem; membro: CvFrmsCrewDispatchAssessment }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
        onClick={() => setExpanded((v) => !v)}
        data-testid={`frms-gate-row-${voo.voo_id}-${membro.funcionario_id}`}
      >
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1 text-slate-400 dark:text-slate-500">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
        </td>
        <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">
          {membro.nome || `#${membro.funcionario_id}`}
          {membro.funcao && (
            <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">
              {membro.funcao}
            </span>
          )}
        </td>
        <td className="px-3 py-2 text-slate-600 dark:text-slate-400"><span className="block font-semibold">{voo.prefixo}</span><span className="block text-xs">{voo.modelo_aeronave || 'Modelo não informado'}</span></td>
        <td className="px-3 py-2">
          <span
            className={cn(
              'inline-flex rounded-md px-2 py-1 text-xs font-bold',
              membro.checkin_status === 'RECEBIDO'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
            )}
          >
            {CHECKIN_LABELS[membro.checkin_status] ?? membro.checkin_status}
          </span>
        </td>
        <td className={cn('px-3 py-2', fadigaClass(membro.fadiga_diaria))}>
          {FADIGA_LABELS[membro.fadiga_diaria] ?? membro.fadiga_diaria}
        </td>
        <td className={cn('px-3 py-2', fadigaClass(membro.fadiga_acumulada))}>
          {FADIGA_LABELS[membro.fadiga_acumulada] ?? membro.fadiga_acumulada}
        </td>
        <td className="px-3 py-2">
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
              SITUACAO_STYLES[membro.frms_status],
            )}
          >
            {SITUACAO_LABELS[membro.frms_status]}
          </span>
        </td>
        <td className="max-w-sm px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200">
          {membro.recommended_action || 'Consultar decisão FRMS.'}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 dark:bg-slate-800/40">
          <td colSpan={8} className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300">
            {membro.reasons.length === 0 ? (
              <span className="text-slate-400 dark:text-slate-500">
                Sem pendências — dados normais recebidos.
              </span>
            ) : (
              <ul className="space-y-1">
                {membro.reasons.map((reason) => (
                  <li key={reason} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        reason === membro.primary_reason ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600',
                      )}
                    />
                    {REASON_LABELS[reason] ?? reason}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function ControleOperacionalFrmsPanel() {
  const [data, setData] = useState(() => frmsBrazilOperationalTodayIso());
  const { data: painel, isLoading, error } = useFrmsOperacionalPainel(data);

  const resumo = painel?.resumo;
  const voos = painel?.voos ?? [];

  return (
    <div className="mb-6 space-y-4" data-testid="controle-operacional-frms-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Controle operacional — alertas consultivos de fadiga
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Os check-ins realizados e as condições do FRMS aparecem separadamente. Os alertas não impedem automaticamente a liberação pela Coordenação; siga os procedimentos operacionais aplicáveis.
          </p>
        </div>
        <label className="space-y-1 text-xs">
          <span className="block font-medium text-slate-500 dark:text-slate-400">
            Data da operação
          </span>
          <input
            type="date"
            value={data}
            onChange={(event) => setData(event.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            data-testid="frms-gate-date-input"
          />
        </label>
      </div>

      {resumo && (
        <ControleVoosStatCards
          cards={[
            {
              label: 'Voos com alerta FRMS',
              value: resumo.voos_nao_liberados,
              icon: <XCircle className="h-5 w-5" />,
              variant: resumo.voos_nao_liberados > 0 ? 'danger' : 'default',
            },
            {
              label: 'Tripulantes com check-in pendente',
              value: resumo.tripulantes_checkin_pendente,
              icon: <AlertTriangle className="h-5 w-5" />,
              variant: resumo.tripulantes_checkin_pendente > 0 ? 'warning' : 'default',
            },
            {
              label: 'Requerem revisão',
              value: resumo.voos_requerem_revisao,
              icon: <AlertTriangle className="h-5 w-5" />,
              variant: resumo.voos_requerem_revisao > 0 ? 'warning' : 'default',
            },
            {
              label: 'Sem alertas FRMS',
              value: resumo.voos_liberaveis,
              icon: <CheckCircle2 className="h-5 w-5" />,
              variant: 'success',
            },
          ]}
        />
      )}

      {isLoading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">Carregando painel operacional…</p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950/20">
          <p className="text-sm text-red-700 dark:text-red-300">
            Erro ao carregar o painel operacional: {error.message}
          </p>
        </div>
      )}

      {!isLoading && !error && voos.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhum voo programado para esta data.
          </p>
        </div>
      )}

      {!isLoading && !error && voos.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <tr>
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                    Tripulante
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                    Voo
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                    Check-in diário
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                    Avaliação FRMS diária
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                    Fadiga acumulada
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                    Alerta consultivo FRMS
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-600 dark:text-slate-300">
                    Providência recomendada
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {voos.map((voo) => (
                  <Fragment key={voo.voo_id}>
                    <tr className="bg-slate-50/60 dark:bg-slate-800/20">
                      <td className="px-3 py-1.5">
                        <VooStatusIcon status={voo.frms_status} />
                      </td>
                      <td
                        colSpan={7}
                        className="px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400"
                      >
                        {voo.prefixo}{voo.modelo_aeronave ? ` · ${voo.modelo_aeronave}` : ''} — {formatDepartureTime(voo.horario_previsto_partida)}
                        {voo.frms_primary_reason && (
                          <span className="ml-2 font-normal text-slate-400 dark:text-slate-500">
                            {REASON_LABELS[voo.frms_primary_reason]}
                          </span>
                        )}
                      </td>
                    </tr>
                    {voo.tripulacao.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-2 text-xs text-slate-400 dark:text-slate-500">
                          Sem tripulação cadastrada para este voo.
                        </td>
                      </tr>
                    ) : (
                      voo.tripulacao.map((membro) => (
                        <CrewRow key={`${voo.voo_id}-${membro.funcionario_id}`} voo={voo} membro={membro} />
                      ))
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
