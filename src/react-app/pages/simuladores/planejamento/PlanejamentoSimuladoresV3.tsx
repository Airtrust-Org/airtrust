import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Repeat2,
  Upload,
  UserRoundCog,
  Users,
  X,
} from 'lucide-react';
import { apiJson, frontendErrorMessage } from '@/react-app/lib/api-contract';
import { showToast } from '@/react-app/utils/toast';

type PlanningConfig = {
  planning_horizon_days: number;
  roster_policy: 'FOLGA' | 'TRABALHO' | 'AMBAS';
  preferred_sessions_per_day: number;
  preferred_minutes_per_day: number;
  allow_shared_session: boolean;
  source: string;
  warnings: string[];
};

type SessionNeed = {
  need_id: string;
  employee_id: number;
  employee_name: string;
  employee_role: string | null;
  qualification_type_id: number;
  qualification_code: string | null;
  qualification_name: string;
  expiry_date: string;
  equipment: string;
  session_model_id: number;
  session_code: string;
  session_name: string;
  session_order: number;
  duration_minutes: number;
  training_session_count: number;
};

type CandidateOption = SessionNeed & {
  availability: {
    window_start: string;
    window_end: string;
    common_date: string;
    anchor_state: string;
    candidate_state: string;
  };
};

type PlanningBlock = {
  block_id: string;
  equipment: string;
  duration_minutes: number;
  target_date: string;
  pairing: 'MESMO_TREINAMENTO' | 'TREINAMENTOS_COMPATIVEIS' | 'SEM_DUPLA';
  sessions: SessionNeed[];
  schedule_status?: 'SCHEDULED' | 'UNMATCHED_CREW' | 'NO_CAE_SLOT';
  scheduled_slot?: {
    slot_key: string;
    date: string;
    start_time: string;
    end_time: string;
  } | null;
  roster?: Array<{
    employee_id: number;
    employee_name: string;
    state: string;
    reason: string;
  }>;
};

type PlanningClass = {
  class_id: string;
  class_name: string;
  equipment: string;
  reference_date: string;
  blocks: PlanningBlock[];
};

type Proposal = {
  mode: 'PREVIEW_ONLY';
  generated_at: string;
  reference_date: string;
  config: PlanningConfig;
  summary: {
    trainings: number;
    session_requirements: number;
    paired_blocks: number;
    unmatched_blocks: number;
    classes: number;
  };
  trainings: Array<Record<string, unknown>>;
  classes: PlanningClass[];
  cae_comparison: null | {
    source_slots: number;
    scheduled_blocks: number;
    unmatched_crew_blocks: number;
    no_slot_blocks: number;
    remaining_slots: unknown[];
    warnings: unknown[];
  };
  exceptions: Array<{
    type?: string;
    employee_name?: string;
    qualification_name?: string;
    expiry_date?: string;
  }>;
};

type CaeAvailabilityDocument = {
  schema_version: 'airtrust.cae_availability.v1';
  provider: 'CAE';
  slots: Array<Record<string, unknown>>;
  warnings: string[];
};

type CaeImport = {
  status: string;
  document: CaeAvailabilityDocument | null;
  warnings: Array<{ path: string; code: string; message: string }>;
  errors: Array<{ path: string; code: string; message: string }>;
  requires_human_review: boolean;
  source_file_name: string;
};

type PairLock = {
  anchor_need_id: string;
  partner_need_id: string;
};

type SwapState = {
  anchor: SessionNeed;
  replaced: SessionNeed | null;
  candidates: CandidateOption[];
  loading: boolean;
};

type RepairResponse = {
  classes: PlanningClass[];
  cae_comparison: Proposal['cae_comparison'];
  summary: Pick<Proposal['summary'], 'session_requirements' | 'paired_blocks' | 'unmatched_blocks' | 'classes'>;
};

const inputClass =
  'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function endOfYearIso() {
  return `${new Date().getFullYear()}-12-31`;
}

function formatDate(value?: string | null) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '—';
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
}

function rosterPolicyLabel(value?: PlanningConfig['roster_policy']) {
  if (value === 'FOLGA') return 'Fora da quinzena de trabalho (folga)';
  if (value === 'TRABALHO') return 'Dentro da quinzena de trabalho';
  if (value === 'AMBAS') return 'Indiferente — trabalho ou folga';
  return 'Configuração da empresa';
}

function pairingLabel(value: PlanningBlock['pairing']) {
  if (value === 'MESMO_TREINAMENTO') return 'Mesma formação';
  if (value === 'TREINAMENTOS_COMPATIVEIS') return 'Periódico / Semestral compatíveis';
  return 'Aguardando dupla';
}

function blockStatus(block: PlanningBlock) {
  if (block.schedule_status === 'SCHEDULED') return 'Slot confirmado na proposta';
  if (block.schedule_status === 'NO_CAE_SLOT') return 'Sem slot CAE compatível';
  if (block.pairing === 'SEM_DUPLA' || block.schedule_status === 'UNMATCHED_CREW') return 'Aguardando dupla';
  return 'Dupla proposta — data a confirmar';
}

function uniqueNeeds(classes: PlanningClass[]): SessionNeed[] {
  const byId = new Map<string, SessionNeed>();
  for (const trainingClass of classes) {
    for (const block of trainingClass.blocks) {
      for (const need of block.sessions) byId.set(need.need_id, need);
    }
  }
  return [...byId.values()];
}

export default function PlanejamentoSimuladoresV3() {
  const [inicio, setInicio] = useState(todayIso);
  const [fim, setFim] = useState(endOfYearIso);
  const [config, setConfig] = useState<PlanningConfig | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [baseNeeds, setBaseNeeds] = useState<SessionNeed[]>([]);
  const [locks, setLocks] = useState<PairLock[]>([]);
  const [swap, setSwap] = useState<SwapState | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [caeFileName, setCaeFileName] = useState<string | null>(null);
  const [caeDocument, setCaeDocument] = useState<CaeAvailabilityDocument | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const data = await apiJson<PlanningConfig>('/api/simuladores/planejamento-v2/config');
      setConfig(data);
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const generateProposal = async (availability?: CaeAvailabilityDocument | null) => {
    if (!inicio || !fim || inicio > fim) {
      showToast.error('Informe um período de vencimentos válido.');
      return;
    }
    try {
      setLoading(true);
      const data = await apiJson<Proposal>('/api/simuladores/planejamento-v2/proposta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vencimento_inicio: inicio,
          vencimento_fim: fim,
          data_referencia: todayIso(),
          ...(availability ? { cae_availability: availability } : {}),
        }),
      });
      setProposal(data);
      setBaseNeeds(uniqueNeeds(data.classes));
      setLocks([]);
      setSwap(null);
      if (availability && data.cae_comparison) {
        showToast.success(`${data.cae_comparison.scheduled_blocks} sessão(ões) alocada(s) nos slots CAE.`);
      } else {
        showToast.success(`Proposta criada com ${data.summary.session_requirements} sessão(ões).`);
      }
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const rePair = async (nextLocks: PairLock[], availability?: CaeAvailabilityDocument | null) => {
    if (baseNeeds.length === 0) return;
    try {
      setLoading(true);
      const data = await apiJson<RepairResponse>('/api/simuladores/planejamento-v2/reparear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_date: todayIso(),
          session_needs: baseNeeds,
          locks: nextLocks,
          ...(availability ? { cae_availability: availability } : {}),
        }),
      });
      setLocks(nextLocks);
      setProposal((current) =>
        current
          ? {
              ...current,
              classes: data.classes,
              cae_comparison: data.cae_comparison,
              summary: { ...current.summary, ...data.summary },
            }
          : current,
      );
      setSwap(null);
      showToast.success('Dupla atualizada e restante do planejamento recalculado.');
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const openSwap = async (anchor: SessionNeed, replaced: SessionNeed | null) => {
    const candidates = baseNeeds.filter(
      (need) => need.need_id !== anchor.need_id && need.need_id !== replaced?.need_id,
    );
    setSwap({ anchor, replaced, candidates: [], loading: true });
    try {
      const data = await apiJson<{ candidates: CandidateOption[] }>('/api/simuladores/planejamento-v2/candidatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference_date: todayIso(), anchor, candidates }),
      });
      setSwap({ anchor, replaced, candidates: data.candidates, loading: false });
    } catch (error) {
      setSwap(null);
      showToast.error(frontendErrorMessage(error));
    }
  };

  const selectReplacement = async (candidate: CandidateOption) => {
    if (!swap) return;
    const involved = new Set([
      swap.anchor.need_id,
      candidate.need_id,
      ...(swap.replaced ? [swap.replaced.need_id] : []),
    ]);
    const retained = locks.filter(
      (lock) => !involved.has(lock.anchor_need_id) && !involved.has(lock.partner_need_id),
    );
    const nextLocks = [
      ...retained,
      { anchor_need_id: swap.anchor.need_id, partner_need_id: candidate.need_id },
    ];
    await rePair(nextLocks, caeDocument);
  };

  const resetPairings = async () => {
    if (locks.length === 0) return;
    await rePair([], caeDocument);
  };

  const uploadCae = async (file: File | null) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && !file.type.toLowerCase().includes('pdf')) {
      showToast.error('Selecione o PDF de disponibilidade recebido da CAE.');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    try {
      setUploading(true);
      setCaeFileName(file.name);
      const imported = await apiJson<CaeImport>(
        '/api/simuladores/planejamento/cae-disponibilidade/importar',
        { method: 'POST', body: form },
      );
      if (!imported.document) {
        setCaeDocument(null);
        showToast.warning('PDF recebido, mas a disponibilidade não pôde ser validada automaticamente.');
        return;
      }
      setCaeDocument(imported.document);
      showToast.success(`${imported.document.slots.length} slot(s) CAE lido(s).`);
    } catch (error) {
      setCaeDocument(null);
      showToast.error(frontendErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const compareCae = async () => {
    if (!caeDocument) return;
    if (locks.length > 0) await rePair(locks, caeDocument);
    else await generateProposal(caeDocument);
  };

  const scheduledBlocks = useMemo(
    () => proposal?.classes.flatMap((item) => item.blocks).filter((block) => block.schedule_status === 'SCHEDULED') || [],
    [proposal],
  );

  const exportPdf = async () => {
    if (!proposal) return;
    try {
      setExporting(true);
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 14;
      let y = 15;
      const ensure = (height: number) => {
        if (y + height > pageHeight - 14) {
          doc.addPage();
          y = 15;
        }
      };
      const text = (value: string, size = 9, bold = false) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(value, pageWidth - margin * 2);
        ensure(lines.length * 4 + 2);
        doc.text(lines, margin, y);
        y += lines.length * 4 + 2;
      };

      text('AirTrust — Planejamento de Treinamento em Simulador', 15, true);
      text(`Vencimentos: ${formatDate(inicio)} a ${formatDate(fim)}`);
      text(`Regra de escala: ${rosterPolicyLabel(proposal.config.roster_policy)}`);
      if (locks.length > 0) text(`${locks.length} ajuste(s) manual(is) de dupla aplicado(s)`, 8, true);
      y += 2;

      for (const trainingClass of proposal.classes) {
        ensure(20);
        text(`${trainingClass.class_name} — ${trainingClass.equipment}`, 12, true);
        for (const block of trainingClass.blocks) {
          const slot = block.scheduled_slot;
          text(
            slot
              ? `${formatDate(slot.date)} ${slot.start_time}–${slot.end_time} · ${block.duration_minutes} min · ${pairingLabel(block.pairing)}`
              : `Data a confirmar · alvo até ${formatDate(block.target_date)} · ${block.duration_minutes} min · ${pairingLabel(block.pairing)}`,
            9,
            true,
          );
          for (const session of block.sessions) {
            text(
              `S${session.session_order}/${session.training_session_count} · ${session.employee_name} (${session.employee_role || 'função não informada'}) · ${session.qualification_name} · ${session.session_code} ${session.session_name} · venc. ${formatDate(session.expiry_date)}`,
              8,
            );
          }
        }
        y += 2;
      }

      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setFontSize(7);
        doc.text('AirTrust · Proposta operacional — não substitui confirmação da CAE', margin, pageHeight - 6);
        doc.text(`Página ${page}/${pages}`, pageWidth - margin, pageHeight - 6, { align: 'right' });
      }
      doc.save(`planejamento-simulador-${todayIso()}.pdf`);
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Falha ao gerar PDF.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <CalendarRange className="h-5 w-5 text-emerald-600" />
              Planejamento de simulador
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Proposta por sessão, dupla editável e validação de disponibilidade antes de enviar à CAE.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {locks.length > 0 && (
              <button
                type="button"
                onClick={() => void resetPairings()}
                disabled={loading}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
              >
                <Repeat2 className="h-4 w-4" /> Recalcular automático
              </button>
            )}
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={!proposal || exporting}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Gerar PDF
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_1.35fr_auto] lg:items-end">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Vencimentos — início
            <input type="date" className={`${inputClass} mt-1 w-full`} value={inicio} onChange={(event) => setInicio(event.target.value)} />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Vencimentos — fim
            <input type="date" className={`${inputClass} mt-1 w-full`} value={fim} onChange={(event) => setFim(event.target.value)} />
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Regra da empresa</div>
            <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{rosterPolicyLabel(config?.roster_policy)}</div>
            <div className="mt-0.5 text-xs text-slate-500">Só aparecem trocas com equipamento/sessão compatíveis e disponibilidade comum na quinzena.</div>
          </div>
          <button
            type="button"
            onClick={() => void generateProposal(null)}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading && !caeDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Gerar proposta
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Prévia somente leitura: trocar a dupla aqui não grava planejamento nem altera qualificação.</p>
      </section>

      {proposal && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Treinamentos', proposal.summary.trainings],
            ['Sessões a cumprir', proposal.summary.session_requirements],
            ['Blocos com dupla', proposal.summary.paired_blocks],
            ['Sem dupla', proposal.summary.unmatched_blocks],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">{value}</div>
            </div>
          ))}
        </section>
      )}

      {proposal && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">1. Proposta de turmas e sessões</h3>
              <p className="text-sm text-slate-500">A dupla pode mudar entre sessões. Use “Trocar” para ajustar a proposta à disponibilidade operacional.</p>
            </div>
            {locks.length > 0 && <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">{locks.length} ajuste(s) manual(is)</span>}
          </div>

          {proposal.classes.map((trainingClass) => (
            <div key={trainingClass.class_id} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div>
                  <div className="text-base font-semibold text-slate-900 dark:text-white">{trainingClass.class_name}</div>
                  <div className="text-xs text-slate-500">{trainingClass.equipment} · referência {formatDate(trainingClass.reference_date)}</div>
                </div>
                <div className="text-xs text-slate-500">{trainingClass.blocks.length} bloco(s)</div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {trainingClass.blocks.map((block) => {
                  const warning = block.pairing === 'SEM_DUPLA' || block.schedule_status === 'NO_CAE_SLOT';
                  return (
                    <div key={block.block_id} className="grid gap-3 px-4 py-4 lg:grid-cols-[150px_1fr_220px]">
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {warning ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                          {block.duration_minutes} min
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{pairingLabel(block.pairing)}</div>
                      </div>

                      <div className="space-y-2">
                        {block.sessions.map((session, index) => {
                          const other = block.sessions.find((_, otherIndex) => otherIndex !== index) || null;
                          return (
                            <div key={session.need_id} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900 dark:text-white">S{session.session_order}/{session.training_session_count} · {session.employee_name}</div>
                                  <div className="text-xs text-slate-500">{session.employee_role || 'Função não informada'} · vence {formatDate(session.expiry_date)}</div>
                                  <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">{session.qualification_name} · {session.session_code}</div>
                                </div>
                                {other && (
                                  <button
                                    type="button"
                                    onClick={() => void openSwap(other, session)}
                                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                  >
                                    <UserRoundCog className="h-3.5 w-3.5" /> Trocar
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {block.sessions.length === 1 && (
                          <button
                            type="button"
                            onClick={() => void openSwap(block.sessions[0], null)}
                            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 text-sm font-medium text-amber-800"
                          >
                            <Users className="h-4 w-4" /> Escolher dupla disponível
                          </button>
                        )}
                      </div>

                      <div className="text-sm">
                        <div className={warning ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>{blockStatus(block)}</div>
                        {block.scheduled_slot ? (
                          <div className="mt-1 text-slate-700 dark:text-slate-200">{formatDate(block.scheduled_slot.date)} · {block.scheduled_slot.start_time}–{block.scheduled_slot.end_time}</div>
                        ) : (
                          <div className="mt-1 text-xs text-slate-500">Alvo: até {formatDate(block.target_date)}</div>
                        )}
                        {block.roster?.map((row) => <div key={`${row.employee_id}-${row.state}`} className="mt-1 text-xs text-slate-500">{row.employee_name}: {row.state}</div>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {swap && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {swap.replaced ? `Trocar ${swap.replaced.employee_name}` : `Escolher dupla para ${swap.anchor.employee_name}`}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Mantendo {swap.anchor.employee_name}. A lista já está filtrada por equipamento, sessão, horizonte e disponibilidade comum na quinzena publicada.
              </p>
            </div>
            <button type="button" onClick={() => setSwap(null)} className="rounded-lg p-2 text-slate-500 hover:bg-white/70" aria-label="Fechar troca">
              <X className="h-4 w-4" />
            </button>
          </div>

          {swap.loading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Verificando escala publicada…</div>
          ) : swap.candidates.length === 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-800">Nenhum tripulante compatível e disponível nesta janela.</div>
          ) : (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {swap.candidates.map((candidate) => (
                <button
                  key={candidate.need_id}
                  type="button"
                  onClick={() => void selectReplacement(candidate)}
                  disabled={loading}
                  className="min-h-20 rounded-lg border border-blue-200 bg-white p-3 text-left transition hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-900 dark:bg-slate-950"
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{candidate.employee_name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{candidate.employee_role || 'Função não informada'} · {candidate.qualification_name}</div>
                  <div className="mt-2 text-xs font-medium text-emerald-700">Disponível em comum: {formatDate(candidate.availability.window_start)} a {formatDate(candidate.availability.window_end)}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">2. Disponibilidade da CAE</h3>
            <p className="mt-1 text-sm text-slate-500">Envie o PDF da CAE depois de ajustar as duplas. O AirTrust revalida a escala na data exata de cada slot.</p>
          </div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Enviar PDF CAE
            <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={uploading} onChange={(event) => void uploadCae(event.target.files?.[0] || null)} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">{caeFileName ? `Arquivo: ${caeFileName}` : 'Nenhum PDF enviado nesta análise.'}</div>
          {caeDocument && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{caeDocument.slots.length} slot(s) lido(s)</span>}
          <button
            type="button"
            onClick={() => void compareCae()}
            disabled={!caeDocument || loading}
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading && caeDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Comparar e definir datas
          </button>
        </div>
        {proposal?.cae_comparison && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
            {proposal.cae_comparison.scheduled_blocks} bloco(s) alocado(s) · {proposal.cae_comparison.no_slot_blocks} sem slot · {proposal.cae_comparison.unmatched_crew_blocks} sem dupla. Os horários aparecem diretamente nas turmas acima.
          </div>
        )}
      </section>

      {proposal && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">3. Relatório</h3>
          <p className="mt-1 text-sm text-slate-500">O PDF usa exatamente as duplas ajustadas acima e os slots CAE confirmados na proposta.</p>
          <div className="mt-3 text-xs text-slate-500">{scheduledBlocks.length} bloco(s) com horário CAE nesta análise.</div>
        </section>
      )}

      {proposal?.exceptions && proposal.exceptions.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4" /> Exceções para revisão</div>
          <div className="mt-2 text-sm text-amber-800 dark:text-amber-300">{proposal.exceptions.length} item(ns) não puderam entrar automaticamente na proposta.</div>
        </section>
      )}
    </div>
  );
}
