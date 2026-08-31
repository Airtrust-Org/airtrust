import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
  Users,
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
  reasons?: string[];
};

type PlanningClass = {
  class_id: string;
  class_name: string;
  equipment: string;
  reference_date: string;
  blocks: PlanningBlock[];
};

type Training = {
  employee_id: number;
  employee_name: string;
  employee_role: string | null;
  qualification_name: string;
  expiry_date: string;
  equipment: string;
  total_sessions: number;
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
  trainings: Training[];
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

const inputClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

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

export default function PlanejamentoSimuladoresV2() {
  const [inicio, setInicio] = useState(todayIso);
  const [fim, setFim] = useState(endOfYearIso);
  const [config, setConfig] = useState<PlanningConfig | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
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
      if (availability && data.cae_comparison) {
        showToast.success(
          `${data.cae_comparison.scheduled_blocks} sessão(ões) alocada(s) nos slots CAE; ${data.cae_comparison.no_slot_blocks} sem slot e ${data.cae_comparison.unmatched_crew_blocks} sem dupla.`,
        );
      } else {
        showToast.success(
          `Proposta criada: ${data.summary.trainings} treinamento(s), ${data.summary.session_requirements} sessão(ões) e ${data.summary.classes} turma(s).`,
        );
      }
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setLoading(false);
    }
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
      showToast.success(`${imported.document.slots.length} slot(s) CAE lido(s). Agora compare com a proposta.`);
    } catch (error) {
      setCaeDocument(null);
      showToast.error(frontendErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const scheduledBlocks = useMemo(
    () =>
      proposal?.classes.flatMap((trainingClass) => trainingClass.blocks).filter((block) => block.schedule_status === 'SCHEDULED') || [],
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
      text(`Vencimentos considerados: ${formatDate(inicio)} a ${formatDate(fim)}`);
      text(`Regra de escala: ${rosterPolicyLabel(proposal.config.roster_policy)}`);
      text(`Gerado em: ${new Date(proposal.generated_at).toLocaleString('pt-BR')}`);
      y += 2;

      for (const trainingClass of proposal.classes) {
        ensure(20);
        doc.setDrawColor(210, 215, 220);
        doc.line(margin, y, pageWidth - margin, y);
        y += 6;
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
          if (block.schedule_status === 'NO_CAE_SLOT') text('Pendência: sem slot CAE compatível com validade e escala.', 8);
          if (block.pairing === 'SEM_DUPLA') text('Pendência: sessão ainda sem tripulante compatível para formar dupla.', 8);
          y += 2;
        }
      }

      if (proposal.exceptions.length > 0) {
        y += 3;
        text('Exceções que exigem revisão', 11, true);
        for (const item of proposal.exceptions) {
          text(`${item.employee_name || 'Tripulante'} · ${item.qualification_name || item.type || 'pendência'} · ${formatDate(item.expiry_date)}`, 8);
        }
      }

      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setFont('helvetica', 'normal');
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
              O AirTrust monta o treinamento completo por sessões, sugere as duplas e depois encaixa cada sessão na disponibilidade real da CAE.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void exportPdf()}
            disabled={!proposal || exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Gerar PDF
          </button>
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
            <div className="mt-0.5 text-xs text-slate-500">Horizonte: {config?.planning_horizon_days ?? '—'} dias · {config?.preferred_sessions_per_day ?? '—'} sessão(ões)/dia</div>
          </div>
          <button
            type="button"
            onClick={() => void generateProposal(null)}
            disabled={loading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading && !caeDocument ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Gerar proposta
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Prévia somente leitura. A configuração de folga/trabalho vem da empresa; não precisa ser escolhida novamente a cada planejamento.</p>
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">1. Proposta de turmas e sessões</h3>
              <p className="text-sm text-slate-500">Cada linha abaixo é uma sessão real do currículo. A dupla pode mudar entre sessões.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{proposal.summary.classes} turma(s)</span>
          </div>

          {proposal.classes.map((trainingClass) => (
            <div key={trainingClass.class_id} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div>
                  <div className="text-base font-semibold text-slate-900 dark:text-white">{trainingClass.class_name}</div>
                  <div className="text-xs text-slate-500">{trainingClass.equipment} · referência {formatDate(trainingClass.reference_date)}</div>
                </div>
                <div className="text-xs text-slate-500">{trainingClass.blocks.length} bloco(s) de sessão</div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {trainingClass.blocks.map((block) => {
                  const warning = block.pairing === 'SEM_DUPLA' || block.schedule_status === 'NO_CAE_SLOT';
                  return (
                    <div key={block.block_id} className="grid gap-3 px-4 py-4 lg:grid-cols-[170px_1fr_220px]">
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {warning ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                          {block.duration_minutes} min
                        </div>
                        <div className="mt-1 text-xs text-slate-500">{pairingLabel(block.pairing)}</div>
                      </div>
                      <div className="space-y-2">
                        {block.sessions.map((session) => (
                          <div key={session.need_id} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">S{session.session_order}/{session.training_session_count} · {session.employee_name}</span>
                              <span className="text-xs text-slate-500">{session.employee_role || 'Função não informada'}</span>
                            </div>
                            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{session.qualification_name}</div>
                            <div className="mt-0.5 text-xs text-slate-500">{session.session_code} — {session.session_name} · vence {formatDate(session.expiry_date)}</div>
                          </div>
                        ))}
                      </div>
                      <div className="text-sm">
                        <div className={warning ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'}>{blockStatus(block)}</div>
                        {block.scheduled_slot ? (
                          <div className="mt-1 text-slate-700 dark:text-slate-200">{formatDate(block.scheduled_slot.date)} · {block.scheduled_slot.start_time}–{block.scheduled_slot.end_time}</div>
                        ) : (
                          <div className="mt-1 text-xs text-slate-500">Alvo: até {formatDate(block.target_date)}</div>
                        )}
                        {block.roster && block.roster.length > 0 && (
                          <div className="mt-2 space-y-1 text-xs text-slate-500">
                            {block.roster.map((row) => <div key={`${row.employee_id}-${row.state}`}>{row.employee_name}: {row.state}</div>)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">2. Disponibilidade da CAE</h3>
            <p className="mt-1 text-sm text-slate-500">Depois da proposta, envie o PDF da CAE. O AirTrust encaixa cada sessão nos slots e confere a escala publicada conforme a regra da empresa.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
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
            onClick={() => void generateProposal(caeDocument)}
            disabled={!caeDocument || loading}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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

      {proposal && proposal.exceptions.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4" /> Exceções para revisão</div>
          <div className="mt-3 space-y-2 text-sm text-amber-900/80 dark:text-amber-200/80">
            {proposal.exceptions.map((item, index) => (
              <div key={`${item.type}-${item.employee_name}-${index}`}>{item.employee_name || 'Tripulante'} · {item.qualification_name || item.type || 'Pendência'} · {formatDate(item.expiry_date)}</div>
            ))}
          </div>
        </section>
      )}

      {proposal && scheduledBlocks.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
          <strong>3. Relatório:</strong> use “Gerar PDF” no topo para enviar à CAE ou ao responsável pela escala. O relatório contém nome da turma, sessões de cada tripulante e os slots já encontrados.
        </section>
      )}
    </div>
  );
}
