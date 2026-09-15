import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  Loader2,
  Plane,
  RefreshCw,
  Repeat2,
  Save,
  Upload,
  UserRoundCog,
  Users,
  X,
} from 'lucide-react';
import { apiEnvelope, apiJson, frontendErrorMessage } from '@/react-app/lib/api-contract';
import { showToast } from '@/react-app/utils/toast';

type PlanningConfig = {
  planning_horizon_days: number;
  roster_policy: 'FOLGA' | 'TRABALHO' | 'AMBAS';
  preferred_sessions_per_day: number;
  preferred_minutes_per_day: number;
  allow_shared_session: boolean;
  source: string;
  warnings: string[];
  equipment_options: string[];
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
  curriculum_cycle?: number | null;
  curriculum_reference_year?: number | null;
  training_program_id?: number | null;
  training_program_type?: string | null;
  training_program_name?: string | null;
  requirement_qualification_type_id?: number | null;
  requirement_qualification_code?: string | null;
  requirement_qualification_name?: string | null;
  coverage_reason?: 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL' | null;
  satisfies_qualification_type_ids?: number[];
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
  equipment_filter?: string | null;
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
    qualification_code?: string | null;
    expiry_date?: string;
    invalid_sessions?: Array<{ code?: string; name?: string }>;
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

type SessionAlternative = {
  kind: 'SESSION_NEED' | 'TRAINING_PROGRAM';
  recommended: boolean;
  label: string;
  reason: string;
  selected_need: SessionNeed;
  replacement_needs: SessionNeed[] | null;
  availability: CandidateOption['availability'] | null;
};

type SessionSwapState = {
  anchor: SessionNeed | null;
  current: SessionNeed;
  alternatives: SessionAlternative[];
  loading: boolean;
};

type RepairResponse = {
  classes: PlanningClass[];
  cae_comparison: Proposal['cae_comparison'];
  summary: Pick<
    Proposal['summary'],
    'session_requirements' | 'paired_blocks' | 'unmatched_blocks' | 'classes'
  >;
};

type DraftWorkflowStatus = 'AGUARDANDO_CAE' | 'CAE_RECEBIDA' | 'PLANEJADO' | 'REPLANEJAR';

type DraftSummary = {
  id: number;
  draft_id: string;
  workflow_status: DraftWorkflowStatus;
  vencimento_inicio: string;
  vencimento_fim: string;
  cae_file_name: string | null;
  classes: number;
  class_names: string[];
  session_requirements: number;
  updated_at: string | null;
};

type SavedDraft = DraftSummary & {
  proposal: Proposal;
  base_needs: SessionNeed[];
  locks: PairLock[];
  cae_file_key: string | null;
  cae_document: CaeAvailabilityDocument | null;
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

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(
    value.endsWith('Z') || value.includes('+') ? value : `${value.replace(' ', 'T')}Z`,
  );
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function rosterPolicyLabel(value?: PlanningConfig['roster_policy']) {
  if (value === 'FOLGA') return 'Fora da quinzena de trabalho (folga)';
  if (value === 'TRABALHO') return 'Dentro da quinzena de trabalho';
  if (value === 'AMBAS') return 'Indiferente — trabalho ou folga';
  return 'Configuração da empresa';
}

function equipmentLabel(value?: string | null) {
  const normalized = String(value || '').toUpperCase();
  if (!normalized || normalized === 'ALL') return 'Todas as aeronaves';
  if (normalized === 'SK76') return 'S-76';
  return value || 'Todas as aeronaves';
}

function sessionCoverageLabel(session: SessionNeed) {
  if (session.coverage_reason !== 'RECORRENTE_PRIORITARIO_SOBRE_SEMESTRAL') return null;
  return `Periódico prioritário · renova ${session.requirement_qualification_name || 'Semestral'}`;
}

function pairingLabel(value: PlanningBlock['pairing']) {
  if (value === 'MESMO_TREINAMENTO') return 'Mesma formação';
  if (value === 'TREINAMENTOS_COMPATIVEIS') return 'Treinamentos compatíveis';
  return 'Aguardando dupla';
}

function blockStatus(block: PlanningBlock) {
  if (block.schedule_status === 'SCHEDULED') return 'Slot confirmado na proposta';
  if (block.schedule_status === 'NO_CAE_SLOT') return 'Sem slot CAE compatível';
  if (block.pairing === 'SEM_DUPLA' || block.schedule_status === 'UNMATCHED_CREW')
    return 'Aguardando dupla';
  return 'Dupla proposta — data a confirmar';
}

function draftStatusLabel(value?: DraftWorkflowStatus | null) {
  if (value === 'AGUARDANDO_CAE') return 'Aguardando resposta da CAE';
  if (value === 'CAE_RECEBIDA') return 'CAE recebida — falta comparar';
  if (value === 'PLANEJADO') return 'Planejamento definido com CAE';
  if (value === 'REPLANEJAR') return 'Requer ajuste após CAE';
  return 'Não salvo';
}

function planningExceptionMessage(item: Proposal['exceptions'][number]) {
  const qualification = item.qualification_code || item.qualification_name || 'treinamento';
  const person = item.employee_name ? ` · ${item.employee_name}` : '';
  const expiry = item.expiry_date ? ` · vence ${formatDate(item.expiry_date)}` : '';
  if (item.type === 'CURRICULO_NAO_CONFIGURADO') {
    return `${qualification}: currículo de sessões ainda não configurado${person}${expiry}.`;
  }
  if (item.type === 'DURACAO_SESSAO_AUSENTE') {
    const sessions = item.invalid_sessions
      ?.map((session) => session.code || session.name)
      .filter(Boolean)
      .join(', ');
    return `${qualification}: há sessão sem duração válida${sessions ? ` (${sessions})` : ''}${person}${expiry}.`;
  }
  if (item.type === 'CURRICULO_AMBIGUO') {
    return `${qualification}: currículo/equipamento ambíguo${person}${expiry}.`;
  }
  return `${qualification}: item requer revisão${person}${expiry}.`;
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
  const [equipment, setEquipment] = useState('ALL');
  const [config, setConfig] = useState<PlanningConfig | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [baseNeeds, setBaseNeeds] = useState<SessionNeed[]>([]);
  const [locks, setLocks] = useState<PairLock[]>([]);
  const [swap, setSwap] = useState<SwapState | null>(null);
  const [sessionSwap, setSessionSwap] = useState<SessionSwapState | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [caeFileName, setCaeFileName] = useState<string | null>(null);
  const [caeFileKey, setCaeFileKey] = useState<string | null>(null);
  const [caeDocument, setCaeDocument] = useState<CaeAvailabilityDocument | null>(null);
  const [exporting, setExporting] = useState(false);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<DraftWorkflowStatus | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const data = await apiJson<PlanningConfig>('/api/simuladores/planejamento-v2/config');
      setConfig(data);
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    }
  }, []);

  const loadDrafts = useCallback(async () => {
    try {
      const data = await apiJson<DraftSummary[]>('/api/simuladores/planejamento-v2/rascunhos');
      setDrafts(data);
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadDrafts();
  }, [loadConfig, loadDrafts]);

  const generateProposal = async (): Promise<Proposal | null> => {
    if (!inicio || !fim || inicio > fim) {
      showToast.error('Informe um período de vencimentos válido.');
      return null;
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
          equipment,
        }),
      });
      setProposal(data);
      setBaseNeeds(uniqueNeeds(data.classes));
      setLocks([]);
      setSwap(null);
      setSessionSwap(null);
      setDraftId(null);
      setDraftStatus(null);
      setCaeFileName(null);
      setCaeFileKey(null);
      setCaeDocument(null);
      showToast.success(`Proposta criada com ${data.summary.session_requirements} sessão(ões).`);
      return data;
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const persistDraft = async (
    workflowStatus: DraftWorkflowStatus,
    overrides?: {
      proposal?: Proposal | null;
      baseNeeds?: SessionNeed[];
      locks?: PairLock[];
      caeFileName?: string | null;
      caeFileKey?: string | null;
      caeDocument?: CaeAvailabilityDocument | null;
    },
    silent = false,
  ): Promise<SavedDraft | null> => {
    const nextProposal = overrides?.proposal ?? proposal;
    const nextBaseNeeds = overrides?.baseNeeds ?? baseNeeds;
    const nextLocks = overrides?.locks ?? locks;
    const nextCaeFileName =
      overrides?.caeFileName !== undefined ? overrides.caeFileName : caeFileName;
    const nextCaeFileKey = overrides?.caeFileKey !== undefined ? overrides.caeFileKey : caeFileKey;
    const nextCaeDocument =
      overrides?.caeDocument !== undefined ? overrides.caeDocument : caeDocument;
    if (!nextProposal || nextBaseNeeds.length === 0) return null;

    try {
      setSavingDraft(true);
      const payload = {
        vencimento_inicio: inicio,
        vencimento_fim: fim,
        workflow_status: workflowStatus,
        proposal: nextProposal,
        base_needs: nextBaseNeeds,
        locks: nextLocks,
        cae_file_name: nextCaeFileName,
        cae_file_key: nextCaeFileKey,
        cae_document: nextCaeDocument,
      };
      const data = await apiJson<SavedDraft>(
        draftId
          ? `/api/simuladores/planejamento-v2/rascunhos/${encodeURIComponent(draftId)}`
          : '/api/simuladores/planejamento-v2/rascunhos',
        {
          method: draftId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      setDraftId(data.draft_id);
      setDraftStatus(data.workflow_status);
      setCaeFileName(data.cae_file_name);
      setCaeFileKey(data.cae_file_key);
      setCaeDocument(data.cae_document);
      await loadDrafts();
      if (!silent)
        showToast.success(
          draftId ? 'Planejamento atualizado.' : 'Proposta salva para retomar depois.',
        );
      return data;
    } catch (error) {
      if (!silent) showToast.error(frontendErrorMessage(error));
      return null;
    } finally {
      setSavingDraft(false);
    }
  };

  const resumeDraft = async (id: string) => {
    try {
      setLoadingDraft(id);
      const data = await apiJson<SavedDraft>(
        `/api/simuladores/planejamento-v2/rascunhos/${encodeURIComponent(id)}`,
      );
      setInicio(data.vencimento_inicio);
      setFim(data.vencimento_fim);
      setEquipment(data.proposal.equipment_filter || 'ALL');
      setProposal(data.proposal);
      setBaseNeeds(data.base_needs);
      setLocks(data.locks);
      setCaeFileName(data.cae_file_name);
      setCaeFileKey(data.cae_file_key);
      setCaeDocument(data.cae_document);
      setDraftId(data.draft_id);
      setDraftStatus(data.workflow_status);
      setSwap(null);
      setSessionSwap(null);
      showToast.success(`Planejamento retomado: ${draftStatusLabel(data.workflow_status)}.`);
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setLoadingDraft(null);
    }
  };

  const rePair = async (
    nextLocks: PairLock[],
    availability?: CaeAvailabilityDocument | null,
    nextNeeds: SessionNeed[] = baseNeeds,
  ): Promise<Proposal | null> => {
    if (nextNeeds.length === 0 || !proposal) return null;
    try {
      setLoading(true);
      const data = await apiJson<RepairResponse>('/api/simuladores/planejamento-v2/reparear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_date: todayIso(),
          session_needs: nextNeeds,
          locks: nextLocks,
          ...(availability ? { cae_availability: availability } : {}),
        }),
      });
      const nextProposal: Proposal = {
        ...proposal,
        classes: data.classes,
        cae_comparison: data.cae_comparison,
        summary: { ...proposal.summary, ...data.summary },
      };
      setBaseNeeds(nextNeeds);
      setLocks(nextLocks);
      setProposal(nextProposal);
      setSwap(null);
      setSessionSwap(null);
      showToast.success('Planejamento atualizado e demais sessões recalculadas.');
      return nextProposal;
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
      return null;
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
      const data = await apiJson<{ candidates: CandidateOption[] }>(
        '/api/simuladores/planejamento-v2/candidatos',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference_date: todayIso(), anchor, candidates }),
        },
      );
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
    const nextProposal = await rePair(nextLocks, caeDocument);
    if (draftId && nextProposal) {
      await persistDraft(
        draftStatus || 'AGUARDANDO_CAE',
        { proposal: nextProposal, locks: nextLocks },
        true,
      );
    }
  };

  const openSessionSwap = async (anchor: SessionNeed | null, current: SessionNeed) => {
    const candidates = baseNeeds.filter(
      (need) => need.employee_id === current.employee_id && need.need_id !== current.need_id,
    );
    setSessionSwap({ anchor, current, alternatives: [], loading: true });
    try {
      const data = await apiJson<{ alternatives: SessionAlternative[] }>(
        '/api/simuladores/planejamento-v2/alternativas-sessao',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference_date: todayIso(),
            anchor,
            current,
            candidates,
          }),
        },
      );
      setSessionSwap({ anchor, current, alternatives: data.alternatives, loading: false });
    } catch (error) {
      setSessionSwap(null);
      showToast.error(frontendErrorMessage(error));
    }
  };

  const selectSessionAlternative = async (alternative: SessionAlternative) => {
    if (!sessionSwap) return;
    const anchor = sessionSwap.anchor;
    const current = sessionSwap.current;
    let nextNeeds = baseNeeds;
    let removedNeedIds = new Set<string>([current.need_id, alternative.selected_need.need_id]);

    if (alternative.kind === 'TRAINING_PROGRAM' && alternative.replacement_needs?.length) {
      const requirementId =
        current.requirement_qualification_type_id || current.qualification_type_id;
      removedNeedIds = new Set(
        baseNeeds
          .filter(
            (need) =>
              need.employee_id === current.employee_id &&
              (need.requirement_qualification_type_id || need.qualification_type_id) ===
                requirementId,
          )
          .map((need) => need.need_id),
      );
      nextNeeds = [
        ...baseNeeds.filter((need) => !removedNeedIds.has(need.need_id)),
        ...alternative.replacement_needs,
      ];
    }

    if (anchor) removedNeedIds.add(anchor.need_id);
    const retainedLocks = locks.filter(
      (lock) =>
        !removedNeedIds.has(lock.anchor_need_id) && !removedNeedIds.has(lock.partner_need_id),
    );
    const nextLocks = anchor
      ? [
          ...retainedLocks,
          { anchor_need_id: anchor.need_id, partner_need_id: alternative.selected_need.need_id },
        ]
      : retainedLocks;
    const nextProposal = await rePair(nextLocks, caeDocument, nextNeeds);
    if (draftId && nextProposal) {
      await persistDraft(
        draftStatus || 'AGUARDANDO_CAE',
        { proposal: nextProposal, baseNeeds: nextNeeds, locks: nextLocks },
        true,
      );
    }
  };

  const resetPairings = async () => {
    if (locks.length === 0) return;
    const nextProposal = await rePair([], caeDocument);
    if (draftId && nextProposal) {
      await persistDraft(
        draftStatus || 'AGUARDANDO_CAE',
        { proposal: nextProposal, locks: [] },
        true,
      );
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
      const envelope = await apiEnvelope<CaeImport>(
        '/api/simuladores/planejamento/cae-disponibilidade/importar',
        { method: 'POST', body: form },
      );
      const imported = envelope.data;
      const fileKey = typeof envelope.file_key === 'string' ? envelope.file_key : null;
      setCaeFileKey(fileKey);
      if (!imported?.document) {
        setCaeDocument(null);
        showToast.warning(
          'PDF recebido, mas a disponibilidade não pôde ser validada automaticamente.',
        );
        return;
      }
      setCaeDocument(imported.document);
      showToast.success(`${imported.document.slots.length} slot(s) CAE lido(s).`);
      if (draftId) {
        await persistDraft(
          'CAE_RECEBIDA',
          {
            caeFileName: file.name,
            caeFileKey: fileKey,
            caeDocument: imported.document,
          },
          true,
        );
      }
    } catch (error) {
      setCaeDocument(null);
      showToast.error(frontendErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const compareCae = async () => {
    if (!caeDocument || !proposal || baseNeeds.length === 0) return;
    try {
      setLoading(true);
      const pairingBlocks = proposal.classes.flatMap((trainingClass) =>
        trainingClass.blocks.map((block) => ({
          need_ids: block.sessions.map((session) => session.need_id),
        })),
      );
      const data = await apiJson<RepairResponse>('/api/simuladores/planejamento-v2/comparar-cae', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_date: todayIso(),
          session_needs: baseNeeds,
          pairing_blocks: pairingBlocks,
          cae_availability: caeDocument,
        }),
      });
      const nextProposal: Proposal = {
        ...proposal,
        classes: data.classes,
        cae_comparison: data.cae_comparison,
        summary: { ...proposal.summary, ...data.summary },
      };
      setProposal(nextProposal);
      const comparison = nextProposal.cae_comparison;
      const status: DraftWorkflowStatus =
        comparison && comparison.no_slot_blocks === 0 && comparison.unmatched_crew_blocks === 0
          ? 'PLANEJADO'
          : 'REPLANEJAR';
      if (draftId) {
        await persistDraft(status, { proposal: nextProposal, baseNeeds }, true);
      }
      showToast.success(
        `${comparison?.scheduled_blocks || 0} sessão(ões) alocada(s) nos slots CAE.`,
      );
    } catch (error) {
      showToast.error(frontendErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const saveCurrent = async () => {
    if (!proposal) return;
    const status: DraftWorkflowStatus = proposal.cae_comparison
      ? proposal.cae_comparison.no_slot_blocks === 0 &&
        proposal.cae_comparison.unmatched_crew_blocks === 0
        ? 'PLANEJADO'
        : 'REPLANEJAR'
      : caeDocument
        ? 'CAE_RECEBIDA'
        : 'AGUARDANDO_CAE';
    await persistDraft(status);
  };

  const scheduledBlocks = useMemo(
    () =>
      proposal?.classes
        .flatMap((item) => item.blocks)
        .filter((block) => block.schedule_status === 'SCHEDULED') || [],
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
      const margin = 12;
      const contentWidth = pageWidth - margin * 2;
      const navy: [number, number, number] = [15, 23, 42];
      const slate: [number, number, number] = [71, 85, 105];
      const lightSlate: [number, number, number] = [241, 245, 249];
      const blue: [number, number, number] = [37, 99, 235];
      const lightBlue: [number, number, number] = [239, 246, 255];
      const green: [number, number, number] = [5, 150, 105];
      const lightGreen: [number, number, number] = [236, 253, 245];
      const amber: [number, number, number] = [217, 119, 6];
      const lightAmber: [number, number, number] = [255, 251, 235];
      let y = 12;

      const setText = (size: number, bold = false, color: [number, number, number] = navy) => {
        doc.setFont('helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.setTextColor(...color);
      };
      const continuationHeader = () => {
        doc.setFillColor(...navy);
        doc.rect(0, 0, pageWidth, 13, 'F');
        setText(8, true, [255, 255, 255]);
        doc.text('AirTrust · Planejamento de Treinamento em Simulador', margin, 8.5);
        y = 19;
      };
      const ensure = (height: number) => {
        if (y + height <= pageHeight - 14) return;
        doc.addPage();
        continuationHeader();
      };
      const compact = (value: unknown, limit = 84) => {
        const normalized = String(value || '')
          .replace(/\s+/g, ' ')
          .trim();
        return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
      };
      const statusPalette = (block: PlanningBlock) => {
        if (block.schedule_status === 'SCHEDULED') return { strong: green, light: lightGreen };
        if (block.pairing === 'SEM_DUPLA' || block.schedule_status === 'UNMATCHED_CREW') {
          return { strong: amber, light: lightAmber };
        }
        return { strong: blue, light: lightBlue };
      };

      doc.setFillColor(...navy);
      doc.rect(0, 0, pageWidth, 34, 'F');
      setText(17, true, [255, 255, 255]);
      doc.text('Planejamento de Treinamento em Simulador', margin, 14);
      setText(9, false, [226, 232, 240]);
      doc.text(`AirTrust · ${formatDate(inicio)} a ${formatDate(fim)}`, margin, 21);
      doc.text(`Aeronaves: ${equipmentLabel(proposal.equipment_filter || equipment)}`, margin, 27);
      y = 42;

      const summaryCards = [
        ['Treinamentos', proposal.summary.trainings, blue, lightBlue],
        ['Sessões', proposal.summary.session_requirements, navy, lightSlate],
        ['Com dupla', proposal.summary.paired_blocks, green, lightGreen],
        ['Sem dupla', proposal.summary.unmatched_blocks, amber, lightAmber],
      ] as const;
      const gap = 3;
      const cardWidth = (contentWidth - gap * 3) / 4;
      summaryCards.forEach(([label, value, strong, light], index) => {
        const x = margin + index * (cardWidth + gap);
        doc.setFillColor(...light);
        doc.roundedRect(x, y, cardWidth, 18, 2, 2, 'F');
        setText(7.5, true, strong);
        doc.text(label.toUpperCase(), x + 3, y + 6);
        setText(15, true, navy);
        doc.text(String(value), x + 3, y + 14);
      });
      y += 24;

      doc.setFillColor(...lightSlate);
      doc.roundedRect(margin, y, contentWidth, 15, 2, 2, 'F');
      setText(7.5, true, slate);
      doc.text('CRITÉRIO OPERACIONAL', margin + 3, y + 5.5);
      setText(8.5, false, navy);
      doc.text(
        `Escala 1/2: ${rosterPolicyLabel(proposal.config.roster_policy)} · CAE confirmada somente na etapa 2`,
        margin + 3,
        y + 11,
      );
      y += 21;

      if (draftId || locks.length > 0) {
        setText(7.5, false, slate);
        const details = [
          draftId ? `Status: ${draftStatusLabel(draftStatus)}` : null,
          locks.length > 0 ? `${locks.length} ajuste(s) manual(is)` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        doc.text(details, margin, y);
        y += 6;
      }

      for (const trainingClass of proposal.classes) {
        ensure(20);
        doc.setFillColor(...navy);
        doc.roundedRect(margin, y, contentWidth, 12, 2, 2, 'F');
        setText(11, true, [255, 255, 255]);
        doc.text(trainingClass.class_name, margin + 4, y + 7.5);
        setText(8, true, [203, 213, 225]);
        doc.text(equipmentLabel(trainingClass.equipment), pageWidth - margin - 4, y + 7.5, {
          align: 'right',
        });
        y += 16;

        for (const block of trainingClass.blocks) {
          const participantRows = Math.max(1, block.sessions.length);
          const cardHeight = 16 + participantRows * 23;
          ensure(cardHeight + 4);
          const palette = statusPalette(block);
          doc.setFillColor(...palette.light);
          doc.roundedRect(margin, y, contentWidth, cardHeight, 2, 2, 'F');
          doc.setFillColor(...palette.strong);
          doc.roundedRect(margin, y, 2.5, cardHeight, 1, 1, 'F');

          const slot = block.scheduled_slot;
          setText(9.5, true, palette.strong);
          doc.text(blockStatus(block), margin + 6, y + 6.5);
          setText(8, false, slate);
          const timing = slot
            ? `${formatDate(slot.date)} · ${slot.start_time}–${slot.end_time}`
            : `Alvo até ${formatDate(block.target_date)} · data a confirmar`;
          doc.text(
            `${timing} · ${block.duration_minutes} min · ${pairingLabel(block.pairing)}`,
            margin + 6,
            y + 12,
          );

          let participantY = y + 16;
          for (const session of block.sessions) {
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(margin + 5, participantY, contentWidth - 10, 20, 1.5, 1.5, 'F');
            setText(8.8, true, navy);
            doc.text(
              `S${session.session_order}/${session.training_session_count} · ${compact(session.employee_name, 54)}`,
              margin + 8,
              participantY + 5.5,
            );
            setText(7.6, false, slate);
            doc.text(
              `${session.employee_role || 'Função não informada'} · venc. ${formatDate(session.expiry_date)}`,
              margin + 8,
              participantY + 10.5,
            );
            const program = session.training_program_name || session.qualification_name;
            setText(7.6, true, navy);
            const trainingLine = compact(
              `${program} · ${session.session_code} ${session.session_name}`,
              105,
            );
            doc.text(trainingLine, margin + 8, participantY + 15.5);
            const coverage = sessionCoverageLabel(session);
            if (coverage) {
              setText(6.8, true, green);
              doc.text(compact(coverage, 100), pageWidth - margin - 7, participantY + 5.5, {
                align: 'right',
              });
            }
            participantY += 23;
          }
          y += cardHeight + 4;
        }
        y += 3;
      }

      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, pageHeight - 11, pageWidth - margin, pageHeight - 11);
        setText(6.7, false, slate);
        doc.text(
          'Proposta operacional. Datas/horários dependem da confirmação CAE e das regras de elegibilidade vigentes.',
          margin,
          pageHeight - 6,
        );
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
      {drafts.length > 0 && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Planejamentos em andamento
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            Retome a proposta exatamente de onde parou, inclusive depois de enviar o pedido à CAE.
          </p>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {drafts.slice(0, 6).map((draft) => (
              <button
                key={draft.draft_id}
                type="button"
                onClick={() => void resumeDraft(draft.draft_id)}
                disabled={loadingDraft === draft.draft_id}
                className="flex min-h-20 items-center justify-between gap-3 rounded-lg border border-blue-200 bg-white px-3 py-3 text-left hover:border-blue-400 disabled:opacity-50 dark:border-blue-900 dark:bg-slate-950"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {draft.class_names.slice(0, 2).join(' · ') || `${draft.classes} turma(s)`}
                  </div>
                  <div className="mt-1 text-xs font-medium text-blue-700">
                    {draftStatusLabel(draft.workflow_status)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDate(draft.vencimento_inicio)}–{formatDate(draft.vencimento_fim)} ·{' '}
                    {draft.session_requirements} sessão(ões) · atualizado{' '}
                    {formatDateTime(draft.updated_at)}
                  </div>
                </div>
                {loadingDraft === draft.draft_id ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                  <FolderOpen className="h-4 w-4 shrink-0 text-blue-600" />
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <CalendarRange className="h-5 w-5 text-emerald-600" />
              Planejamento de simulador
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
              Proposta por sessão, dupla editável, salvamento persistente e definição de datas
              somente após a resposta da CAE.
            </p>
            {draftId && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                <Clock3 className="h-3.5 w-3.5" /> {draftStatusLabel(draftStatus)}
              </div>
            )}
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
              onClick={() => void saveCurrent()}
              disabled={!proposal || savingDraft}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
            >
              {savingDraft ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {draftId
                ? 'Salvar alterações'
                : caeDocument
                  ? 'Salvar planejamento'
                  : 'Salvar e aguardar CAE'}
            </button>
            <button
              type="button"
              onClick={() => void exportPdf()}
              disabled={!proposal || exporting}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Gerar PDF
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_0.9fr_1.35fr_auto] lg:items-end">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Vencimentos — início
            <input
              type="date"
              className={`${inputClass} mt-1 w-full`}
              value={inicio}
              onChange={(event) => setInicio(event.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Vencimentos — fim
            <input
              type="date"
              className={`${inputClass} mt-1 w-full`}
              value={fim}
              onChange={(event) => setFim(event.target.value)}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            Aeronave
            <div className="relative mt-1">
              <Plane className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                className={`${inputClass} w-full pl-9`}
                value={equipment}
                onChange={(event) => setEquipment(event.target.value)}
              >
                <option value="ALL">Todas as aeronaves</option>
                {(config?.equipment_options || []).map((option) => (
                  <option key={option} value={option}>
                    {equipmentLabel(option)}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Regra da empresa
            </div>
            <div className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
              {rosterPolicyLabel(config?.roster_policy)}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              A proposta usa vencimentos, currículo e a Escala 1/2 cadastrada nos funcionários. A
              disponibilidade CAE entra somente na etapa 2.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void generateProposal()}
            disabled={loading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading && !caeDocument ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Gerar proposta
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Salvar preserva a proposta, as turmas e as trocas para retomar depois. O filtro de
          aeronave limita esta análise ao modelo selecionado; “Todas” planeja todos os modelos
          disponíveis. Isso não agenda sessão nem altera qualificação.
        </p>
      </section>

      {proposal && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Treinamentos', proposal.summary.trainings],
            ['Sessões a cumprir', proposal.summary.session_requirements],
            ['Blocos com dupla', proposal.summary.paired_blocks],
            ['Sem dupla', proposal.summary.unmatched_blocks],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="text-xs text-slate-500">{label}</div>
              <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
                {value}
              </div>
            </div>
          ))}
        </section>
      )}

      {proposal && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                1. Proposta de turmas e sessões
              </h3>
              <p className="text-sm text-slate-500">
                A dupla e a sessão podem ser ajustadas separadamente. Quando Periódico e Semestral
                concorrem, o Periódico tem prioridade e renova a obrigação semestral.
              </p>
            </div>
            {locks.length > 0 && (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                {locks.length} ajuste(s) manual(is)
              </span>
            )}
          </div>

          {proposal.classes.map((trainingClass) => (
            <div
              key={trainingClass.class_id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div>
                  <div className="text-base font-semibold text-slate-900 dark:text-white">
                    {trainingClass.class_name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {equipmentLabel(trainingClass.equipment)} · referência{' '}
                    {formatDate(trainingClass.reference_date)}
                  </div>
                </div>
                <div className="text-xs text-slate-500">{trainingClass.blocks.length} bloco(s)</div>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {trainingClass.blocks.map((block) => {
                  const warning =
                    block.pairing === 'SEM_DUPLA' || block.schedule_status === 'NO_CAE_SLOT';
                  return (
                    <div
                      key={block.block_id}
                      className="grid gap-3 px-4 py-4 lg:grid-cols-[150px_1fr_220px]"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {warning ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          )}
                          {block.duration_minutes} min
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {pairingLabel(block.pairing)}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {block.sessions.map((session, index) => {
                          const other =
                            block.sessions.find((_, otherIndex) => otherIndex !== index) || null;
                          return (
                            <div
                              key={session.need_id}
                              className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/60"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                                    S{session.session_order}/{session.training_session_count} ·{' '}
                                    {session.employee_name}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {session.employee_role || 'Função não informada'} · vence{' '}
                                    {formatDate(session.expiry_date)}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                                    {session.training_program_name || session.qualification_name} ·{' '}
                                    {session.session_code}
                                  </div>
                                  {sessionCoverageLabel(session) && (
                                    <div className="mt-1 inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                      {sessionCoverageLabel(session)}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-wrap justify-end gap-1.5">
                                  {other && (
                                    <button
                                      type="button"
                                      onClick={() => void openSwap(other, session)}
                                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                                    >
                                      <UserRoundCog className="h-3.5 w-3.5" /> Trocar participante
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => void openSessionSwap(other, session)}
                                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-blue-300 bg-blue-50 px-2.5 text-xs font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-200"
                                  >
                                    <BookOpenCheck className="h-3.5 w-3.5" /> Trocar sessão
                                  </button>
                                </div>
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
                        <div
                          className={
                            warning ? 'font-medium text-amber-700' : 'font-medium text-emerald-700'
                          }
                        >
                          {blockStatus(block)}
                        </div>
                        {block.scheduled_slot ? (
                          <div className="mt-1 text-slate-700 dark:text-slate-200">
                            {formatDate(block.scheduled_slot.date)} ·{' '}
                            {block.scheduled_slot.start_time}–{block.scheduled_slot.end_time}
                          </div>
                        ) : (
                          <div className="mt-1 text-xs text-slate-500">
                            Alvo: até {formatDate(block.target_date)}
                          </div>
                        )}
                        {block.roster?.map((row) => (
                          <div
                            key={`${row.employee_id}-${row.state}`}
                            className="mt-1 text-xs text-slate-500"
                          >
                            {row.employee_name}: {row.state}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {sessionSwap && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                Trocar sessão de {sessionSwap.current.employee_name}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Escolha outra sessão pendente ou, quando aplicável, o Periódico que também renova a
                obrigação Semestral. As opções já respeitam aeronave, duração, currículo e Escala
                1/2.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSessionSwap(null)}
              className="rounded-lg p-2 text-slate-500 hover:bg-white/70"
              aria-label="Fechar troca de sessão"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {sessionSwap.loading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Validando sessões e programas
              disponíveis…
            </div>
          ) : sessionSwap.alternatives.length === 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
              Não há outra sessão/programa compatível para este bloco.
            </div>
          ) : (
            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {sessionSwap.alternatives.map((alternative) => (
                <button
                  key={`${alternative.kind}-${alternative.selected_need.need_id}`}
                  type="button"
                  onClick={() => void selectSessionAlternative(alternative)}
                  disabled={loading}
                  className={`min-h-24 rounded-lg border bg-white p-3 text-left transition disabled:opacity-50 dark:bg-slate-950 ${
                    alternative.recommended
                      ? 'border-emerald-300 hover:border-emerald-500 dark:border-emerald-800'
                      : 'border-slate-200 hover:border-blue-400 dark:border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {alternative.label}
                    </div>
                    {alternative.recommended && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                        Recomendado
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    {alternative.reason}
                  </div>
                  <div className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                    S{alternative.selected_need.session_order}/
                    {alternative.selected_need.training_session_count} ·{' '}
                    {alternative.selected_need.session_code}
                  </div>
                  {alternative.availability?.common_date && (
                    <div className="mt-1 text-xs font-medium text-emerald-700">
                      Data comum possível: {formatDate(alternative.availability.common_date)}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {swap && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900/50 dark:bg-blue-950/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {swap.replaced
                  ? `Trocar ${swap.replaced.employee_name}`
                  : `Escolher dupla para ${swap.anchor.employee_name}`}
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Mantendo {swap.anchor.employee_name}. A lista já está filtrada por equipamento,
                sessão, horizonte e folga comum derivada da Escala 1/2 cadastrada.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSwap(null)}
              className="rounded-lg p-2 text-slate-500 hover:bg-white/70"
              aria-label="Fechar troca"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {swap.loading ? (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando Escala 1/2 e calendário de
              folgas…
            </div>
          ) : swap.candidates.length === 0 ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-white p-3 text-sm text-amber-800">
              Nenhum tripulante compatível e disponível nesta janela.
            </div>
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
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    {candidate.employee_name}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {candidate.employee_role || 'Função não informada'} ·{' '}
                    {candidate.qualification_name}
                  </div>
                  <div className="mt-2 text-xs font-medium text-emerald-700">
                    Disponível em comum: {formatDate(candidate.availability.window_start)} a{' '}
                    {formatDate(candidate.availability.window_end)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              2. Disponibilidade da CAE
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              A proposta acima é independente da CAE. Quando a resposta chegar, envie o PDF para
              comparar os slots com as duplas já propostas e definir as datas, sem gerar uma nova
              proposta.
            </p>
          </div>
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Enviar PDF CAE
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={uploading}
              onChange={(event) => void uploadCae(event.target.files?.[0] || null)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="text-sm text-slate-600 dark:text-slate-300">
            {caeFileName ? `Arquivo: ${caeFileName}` : 'Nenhum PDF CAE associado a esta proposta.'}
          </div>
          {caeDocument && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              {caeDocument.slots.length} slot(s) lido(s)
            </span>
          )}
          <button
            type="button"
            onClick={() => void compareCae()}
            disabled={!caeDocument || loading}
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading && caeDocument ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            Comparar e definir datas
          </button>
        </div>
        {proposal?.cae_comparison && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
            {proposal.cae_comparison.scheduled_blocks} bloco(s) alocado(s) ·{' '}
            {proposal.cae_comparison.no_slot_blocks} sem slot ·{' '}
            {proposal.cae_comparison.unmatched_crew_blocks} sem dupla. Os horários aparecem
            diretamente nas turmas acima.
          </div>
        )}
      </section>

      {proposal && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">3. Relatório</h3>
          <p className="mt-1 text-sm text-slate-500">
            O PDF usa exatamente as duplas ajustadas acima e os slots CAE confirmados na proposta.
          </p>
          <div className="mt-3 text-xs text-slate-500">
            {scheduledBlocks.length} bloco(s) com horário CAE nesta análise.
          </div>
        </section>
      )}

      {proposal?.exceptions && proposal.exceptions.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4" /> Itens bloqueados na proposta
          </div>
          <div className="mt-2 text-sm text-amber-800 dark:text-amber-300">
            {proposal.exceptions.length} necessidade(s) foram encontrada(s), mas ainda não podem
            virar sessão automaticamente.
          </div>
          <div className="mt-3 space-y-2">
            {proposal.exceptions.map((item, index) => (
              <div
                key={`${item.type || 'REVISAO'}-${item.employee_name || index}-${item.expiry_date || index}`}
                className="rounded-lg border border-amber-200/80 bg-white/70 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-slate-950/40 dark:text-amber-200"
              >
                {planningExceptionMessage(item)}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
