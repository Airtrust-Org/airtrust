/**
 * EvdPage — Escala de Voo Diária (PRC-OPS-009 §4.3)
 *
 * Interface para gerenciar a programação diária de voos derivada da EST mensal.
 * Visualização por dia com cards de voo, criação inline e publicação.
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plane,
  Plus,
  Calendar,
  Clock,
  Users,
  MapPin,
  Edit3,
  Trash2,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Send,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import Button from '@/react-app/components/Button';
import { useApi } from '@/react-app/hooks/useApi';
import { apiFetch } from '@/react-app/lib/apiFetch';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface EvdVoo {
  id: string;
  data: string;
  status: string;
  pic_id: number | null;
  sic_id: number | null;
  pic_nome: string | null;
  pic_guerra: string | null;
  sic_nome: string | null;
  sic_guerra: string | null;
  pic_funcao: string | null;
  sic_funcao: string | null;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
  hora_apresentacao: string | null;
  hora_decolagem_prevista: string | null;
  hora_pouso_previsto: string | null;
  hora_decolagem_real: string | null;
  hora_pouso_real: string | null;
  hora_corte_motor: string | null;
  repouso_anterior_minutos: number | null;
  repouso_minimo_ok: number;
  origem: string | null;
  destino: string | null;
  tipo_missao: string;
  observacoes: string | null;
}

interface FrmsDailyFatigueItem {
  funcionario_id: number | string;
  funcionario_nome?: string;
  status:
    | 'normal'
    | 'attention'
    | 'critical'
    | 'unfit_for_duty'
    | 'not_submitted'
    | 'no_duty';
  status_label?: string;
  requires_operational_review?: number | boolean;
  data_source?: 'crew_reported' | 'default_estimate' | 'not_applicable' | string;
}

interface FrmsDailyFatigueAlertItem {
  tripulante_id: number | string;
  nivel?: string;
  tipo_limite?: string;
  alert_type?: string;
  requires_operational_review?: number | boolean;
}

interface FrmsTripulanteSignal {
  status: FrmsDailyFatigueItem['status'];
  statusLabel: string;
  dataSource: string;
  requiresReview: boolean;
  hasAlert: boolean;
}

interface EvdJustificativaPayload {
  funcionario_id?: number | null;
  papel?: 'PIC' | 'SIC' | 'OUTRO' | null;
  origem_alerta: 'FRMS' | 'REPOUSO' | 'DUPLICIDADE' | 'OPERACIONAL' | 'OUTRO';
  tipo_alerta?: string | null;
  nivel_alerta?: string | null;
  decisao:
    | 'MANTER_ESCALA'
    | 'SUBSTITUIR'
    | 'ACIONAR_STANDBY'
    | 'ADICIONAR_OBSERVACAO'
    | 'OUTRO';
  justificativa: string;
  alerta_ref_id?: string | null;
}

function toLocalDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateBR(dateStr: string) {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function statusBadge(status: string) {
  switch (status) {
    case 'PUBLICADA':
      return 'bg-emerald-100 text-emerald-700';
    case 'CANCELADA':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function toNumericId(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function isFrmsRelevant(signal: FrmsTripulanteSignal | null | undefined): boolean {
  if (!signal) return false;
  return (
    signal.status === 'attention' ||
    signal.status === 'critical' ||
    signal.status === 'unfit_for_duty' ||
    signal.requiresReview ||
    signal.hasAlert
  );
}

function frmsTone(status: FrmsDailyFatigueItem['status']) {
  if (status === 'critical' || status === 'unfit_for_duty') {
    return 'bg-red-50 text-red-700 border-red-200';
  }
  if (status === 'attention') {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (status === 'not_submitted') {
    return 'bg-violet-50 text-violet-700 border-violet-200';
  }
  return 'bg-slate-50 text-slate-600 border-slate-200';
}

function frmsSeverity(signal: FrmsTripulanteSignal | null | undefined): string {
  if (!signal) return 'NONE';
  if (signal.status === 'unfit_for_duty') return 'UNFIT_FOR_DUTY';
  if (signal.status === 'critical') return 'CRITICAL';
  if (signal.status === 'attention') return 'ATTENTION';
  if (signal.requiresReview) return 'REVIEW_REQUIRED';
  if (signal.hasAlert) return 'ALERT';
  return 'NORMAL';
}

function buildFrmsJustificativaPayload(params: {
  justificativa: string;
  picId: number | null;
  sicId: number | null;
  picSignal: FrmsTripulanteSignal | null | undefined;
  sicSignal: FrmsTripulanteSignal | null | undefined;
}): EvdJustificativaPayload {
  let funcionarioId: number | null = null;
  let papel: 'PIC' | 'SIC' | 'OUTRO' = 'OUTRO';
  let signal: FrmsTripulanteSignal | null | undefined = null;

  if (isFrmsRelevant(params.picSignal) && params.picId) {
    funcionarioId = params.picId;
    papel = 'PIC';
    signal = params.picSignal;
  } else if (isFrmsRelevant(params.sicSignal) && params.sicId) {
    funcionarioId = params.sicId;
    papel = 'SIC';
    signal = params.sicSignal;
  }

  return {
    funcionario_id: funcionarioId,
    papel,
    origem_alerta: 'FRMS',
    tipo_alerta: signal?.hasAlert ? 'DAILY_ALERT' : 'DAILY_STATUS_REVIEW',
    nivel_alerta: frmsSeverity(signal),
    decisao: 'MANTER_ESCALA',
    justificativa: params.justificativa.trim(),
    alerta_ref_id: null,
  };
}

export default function EvdPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [data, setData] = useState(toLocalDateStr(new Date()));
  const [showForm, setShowForm] = useState(false);

  const { data: voosRaw, loading } = useApi<{ success: boolean; data: EvdVoo[] }>(
    `/api/evd?data=${data}`,
  );
  const voos = voosRaw?.data || [];
  const { data: frmsDailyRaw } = useApi<{
    success: boolean;
    data?: { items?: FrmsDailyFatigueItem[] };
  }>(`/api/frms/daily-fatigue?date=${data}&scope=team`);
  const { data: frmsAlertsRaw } = useApi<{
    success: boolean;
    data?: { items?: FrmsDailyFatigueAlertItem[] };
  }>(`/api/frms/daily-fatigue/alerts?date=${data}`);

  const selectedDate = new Date(data + 'T12:00:00');
  const weekday = WEEKDAY_LABELS[selectedDate.getDay()];
  const frmsDailyItems = frmsDailyRaw?.data?.items || [];
  const frmsAlertItems = frmsAlertsRaw?.data?.items || [];

  const frmsByTripulante = useMemo(() => {
    const map = new Map<number, FrmsTripulanteSignal>();

    for (const item of frmsDailyItems) {
      const id = toNumericId(item.funcionario_id);
      if (!id) continue;
      map.set(id, {
        status: item.status,
        statusLabel: item.status_label || item.status,
        dataSource: String(item.data_source || 'not_applicable'),
        requiresReview:
          item.requires_operational_review === true || Number(item.requires_operational_review) === 1,
        hasAlert: false,
      });
    }

    for (const alert of frmsAlertItems) {
      const id = toNumericId(alert.tripulante_id);
      if (!id) continue;
      const existing = map.get(id);
      if (existing) {
        existing.hasAlert = true;
        map.set(id, existing);
        continue;
      }
      map.set(id, {
        status: 'attention',
        statusLabel: 'Atenção',
        dataSource: 'not_applicable',
        requiresReview:
          alert.requires_operational_review === true ||
          Number(alert.requires_operational_review) === 1,
        hasAlert: true,
      });
    }

    return map;
  }, [frmsAlertItems, frmsDailyItems]);

  function changeDay(delta: number) {
    const d = new Date(data + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setData(toLocalDateStr(d));
  }

  // Publicar voo
  const publicarMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload?: {
        require_justificativa?: boolean;
        justificativa?: EvdJustificativaPayload;
      };
    }) => {
      const res = await apiFetch(`/api/evd/${id}/publicar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Erro ao publicar');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/evd'] });
      toast.success('Escala diária publicada');
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao publicar');
    },
  });

  // Delete voo
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/evd/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/evd'] });
      toast.success('Registro removido');
    },
    onError: () => {
      toast.error('Erro ao excluir');
    },
  });

  async function handlePublish(voo: EvdVoo) {
    const picSignal = toNumericId(voo.pic_id) ? frmsByTripulante.get(Number(voo.pic_id)) : null;
    const sicSignal = toNumericId(voo.sic_id) ? frmsByTripulante.get(Number(voo.sic_id)) : null;
    const needsJustificativa = isFrmsRelevant(picSignal) || isFrmsRelevant(sicSignal);

    let publishPayload: { require_justificativa?: boolean; justificativa?: EvdJustificativaPayload } = {};
    if (needsJustificativa) {
      const existingRes = await apiFetch(`/api/evd/${voo.id}/justificativas`);
      const existingJson = (await existingRes.json().catch(() => ({}))) as {
        success?: boolean;
        data?: unknown[];
      };
      const hasStructured = existingRes.ok && existingJson.success && (existingJson.data || []).length > 0;

      if (!hasStructured) {
        const justificativaTxt = window.prompt(
          'FRMS requer revisão operacional para este tripulante. Informe justificativa operacional estruturada para publicar:',
        );
        if (!justificativaTxt || justificativaTxt.trim().length < 10) {
          toast.error('Justificativa operacional obrigatória (mínimo 10 caracteres).');
          return;
        }
        publishPayload.justificativa = buildFrmsJustificativaPayload({
          justificativa: justificativaTxt,
          picId: toNumericId(voo.pic_id),
          sicId: toNumericId(voo.sic_id),
          picSignal,
          sicSignal,
        });
      }

      publishPayload.require_justificativa = true;
    }

    publicarMutation.mutate({ id: voo.id, payload: publishPayload });
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/escalas')}
              className="p-2 rounded-lg hover:bg-slate-100 transition"
            >
              <ArrowLeft className="h-5 w-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Plane className="h-5 w-5 text-blue-600" />
                Escala Diária de Voo
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">PRC-OPS-009 §4.3</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Novo Voo
          </Button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
              FRMS Diário (placeholder)
            </span>
            <span className="text-xs text-slate-500">
              Status de risco será integrado de forma não invasiva nas próximas fases.
            </span>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>Defina PIC/SIC por aeronave para a operação diária.</li>
            <li>A escala diária usa a escala mensal como base de disponibilidade.</li>
            <li>Status de fadiga/FRMS será usado como apoio à decisão operacional.</li>
          </ul>
          <p className="mt-3 text-xs text-slate-500">
            A escala não exibe dados sensíveis do check-in de fadiga. Apenas status resumido e
            necessidade de revisão operacional.
          </p>
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => changeDay(-1)}
            className="p-2 rounded-lg hover:bg-slate-100 transition"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="text-center">
            <input
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              className="text-lg font-bold text-slate-900 bg-transparent border-none text-center cursor-pointer"
            />
            <p className="text-sm text-slate-500">
              {weekday}, {formatDateBR(data)}
            </p>
          </div>
          <button
            onClick={() => changeDay(1)}
            className="p-2 rounded-lg hover:bg-slate-100 transition"
          >
            <ChevronRight className="h-5 w-5 text-slate-600" />
          </button>
        </div>

        {/* Create form (simple inline) */}
        {showForm && (
          <EvdCreateForm
            data={data}
            onClose={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              queryClient.invalidateQueries({ queryKey: ['/api/evd'] });
            }}
            frmsByTripulante={frmsByTripulante}
          />
        )}

        {/* Voos list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : voos.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Plane className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Nenhum voo programado para {formatDateBR(data)}</p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 text-blue-600 hover:underline text-sm"
            >
              Criar primeiro voo do dia
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {voos.map((voo) => (
              <div
                key={voo.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: details */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Route + missao */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadge(voo.status)}`}
                      >
                        {voo.status}
                      </span>
                      <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        {voo.tipo_missao}
                      </span>
                      {voo.aeronave_prefixo && (
                        <span className="text-xs font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                          {voo.aeronave_prefixo}
                        </span>
                      )}
                    </div>

                    {/* Route */}
                    <div className="flex items-center gap-2 text-sm text-slate-700">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{voo.origem || '—'}</span>
                      <span className="text-slate-400">→</span>
                      <span>{voo.destino || '—'}</span>
                    </div>

                    {/* Crew */}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <Users className="h-3.5 w-3.5" />
                      <span>
                        <strong>PIC:</strong> {voo.pic_guerra || voo.pic_nome || '—'}{' '}
                        {voo.pic_funcao && `(${voo.pic_funcao})`}
                      </span>
                      <span>
                        <strong>SIC:</strong> {voo.sic_guerra || voo.sic_nome || '—'}{' '}
                        {voo.sic_funcao && `(${voo.sic_funcao})`}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {toNumericId(voo.pic_id) && frmsByTripulante.get(Number(voo.pic_id)) ? (
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 font-medium ${frmsTone(frmsByTripulante.get(Number(voo.pic_id))!.status)}`}
                        >
                          PIC FRMS: {frmsByTripulante.get(Number(voo.pic_id))!.statusLabel}
                          {frmsByTripulante.get(Number(voo.pic_id))!.requiresReview ? ' • revisão' : ''}
                          {frmsByTripulante.get(Number(voo.pic_id))!.hasAlert ? ' • alerta' : ''}
                        </span>
                      ) : null}
                      {toNumericId(voo.sic_id) && frmsByTripulante.get(Number(voo.sic_id)) ? (
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 font-medium ${frmsTone(frmsByTripulante.get(Number(voo.sic_id))!.status)}`}
                        >
                          SIC FRMS: {frmsByTripulante.get(Number(voo.sic_id))!.statusLabel}
                          {frmsByTripulante.get(Number(voo.sic_id))!.requiresReview ? ' • revisão' : ''}
                          {frmsByTripulante.get(Number(voo.sic_id))!.hasAlert ? ' • alerta' : ''}
                        </span>
                      ) : null}
                    </div>

                    {(isFrmsRelevant(
                      toNumericId(voo.pic_id) ? frmsByTripulante.get(Number(voo.pic_id)) : null,
                    ) ||
                      isFrmsRelevant(
                        toNumericId(voo.sic_id) ? frmsByTripulante.get(Number(voo.sic_id)) : null,
                      )) && (
                      <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded-lg w-fit">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        FRMS requer revisão operacional para este tripulante. A fadiga não bloqueia
                        automaticamente a escala, mas exige justificativa.
                      </div>
                    )}

                    {/* Times */}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <Clock className="h-3.5 w-3.5" />
                      {voo.hora_apresentacao && <span>Apres: {voo.hora_apresentacao}</span>}
                      {voo.hora_decolagem_prevista && (
                        <span>Dec: {voo.hora_decolagem_prevista}</span>
                      )}
                      {voo.hora_pouso_previsto && <span>Pouso: {voo.hora_pouso_previsto}</span>}
                      {voo.hora_decolagem_real && (
                        <span className="text-emerald-600">
                          Real dec: {voo.hora_decolagem_real}
                        </span>
                      )}
                      {voo.hora_pouso_real && (
                        <span className="text-emerald-600">Real pouso: {voo.hora_pouso_real}</span>
                      )}
                    </div>

                    {/* Rest warning */}
                    {voo.repouso_minimo_ok === 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg w-fit">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Repouso insuficiente (&lt;12h30) — PRC-OPS-009 §6.1.6
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex flex-col gap-1.5">
                    {voo.status === 'RASCUNHO' && (
                      <>
                        <button
                          onClick={() => handlePublish(voo)}
                          disabled={publicarMutation.isPending}
                          className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 transition px-2 py-1 rounded hover:bg-emerald-50"
                        >
                          <Send className="h-3 w-3" /> Publicar
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(voo.id)}
                          disabled={deleteMutation.isPending}
                          className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition px-2 py-1 rounded hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" /> Excluir
                        </button>
                      </>
                    )}
                    {voo.status === 'PUBLICADA' && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle className="h-3.5 w-3.5" /> Publicada
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

// ── Inline Create Form ────────────────────────

function EvdCreateForm({
  data,
  onClose,
  onCreated,
  frmsByTripulante,
}: {
  data: string;
  onClose: () => void;
  onCreated: () => void;
  frmsByTripulante: Map<number, FrmsTripulanteSignal>;
}) {
  const [form, setForm] = useState({
    pic_id: '',
    sic_id: '',
    aeronave_prefixo: '',
    hora_apresentacao: '',
    hora_decolagem_prevista: '',
    hora_pouso_previsto: '',
    origem: '',
    destino: '',
    tipo_missao: 'OFFSHORE',
    observacoes: '',
    justificativa_operacional: '',
  });
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load funcionarios for picker
  const { data: funcRaw } = useApi<{
    data: { id: number; nome: string; guerra: string | null; funcao: string | null }[];
  }>('/api/funcionarios?limit=200&page=1&status=ativos&orderBy=nome&order=ASC');
  const pilotos = useMemo(() => {
    const all = funcRaw?.data || [];
    return all.filter((f) => {
      const fn = (f.funcao || '').toUpperCase();
      return (
        fn.includes('PILOT') || fn.includes('COMAND') || fn === 'PIC' || fn === 'SIC' || !f.funcao
      );
    });
  }, [funcRaw]);

  const selectedPicId = form.pic_id ? Number(form.pic_id) : null;
  const selectedSicId = form.sic_id ? Number(form.sic_id) : null;
  const frmsPic = selectedPicId ? frmsByTripulante.get(selectedPicId) : null;
  const frmsSic = selectedSicId ? frmsByTripulante.get(selectedSicId) : null;
  const needsStructuredJustificativa = isFrmsRelevant(frmsPic) || isFrmsRelevant(frmsSic);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setWarnings([]);
    setSubmitting(true);

    try {
      const picId = form.pic_id ? Number(form.pic_id) : null;
      const sicId = form.sic_id ? Number(form.sic_id) : null;
      const needsJustificativa = isFrmsRelevant(frmsPic) || isFrmsRelevant(frmsSic);

      if (needsJustificativa && form.justificativa_operacional.trim().length < 10) {
        setError(
          'FRMS requer revisão operacional para PIC/SIC selecionado. Informe justificativa operacional (mínimo 10 caracteres).',
        );
        setSubmitting(false);
        return;
      }

      const body = {
        data,
        pic_id: form.pic_id ? Number(form.pic_id) : undefined,
        sic_id: form.sic_id ? Number(form.sic_id) : undefined,
        aeronave_prefixo: form.aeronave_prefixo || undefined,
        hora_apresentacao: form.hora_apresentacao || undefined,
        hora_decolagem_prevista: form.hora_decolagem_prevista || undefined,
        hora_pouso_previsto: form.hora_pouso_previsto || undefined,
        origem: form.origem || undefined,
        destino: form.destino || undefined,
        tipo_missao: form.tipo_missao,
        observacoes: form.observacoes || undefined,
      };

      const res = await apiFetch('/api/evd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        data?: { id: string; warnings?: string[] };
      };

      if (!res.ok || !json.success) {
        setError(json.error || 'Erro ao criar voo');
        return;
      }

      if (json.data?.warnings?.length) {
        setWarnings(json.data.warnings);
      }

      if (needsJustificativa && json.data?.id) {
        const justificativaPayload = buildFrmsJustificativaPayload({
          justificativa: form.justificativa_operacional,
          picId,
          sicId,
          picSignal: frmsPic,
          sicSignal: frmsSic,
        });
        const justRes = await apiFetch(`/api/evd/${json.data.id}/justificativas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(justificativaPayload),
        });
        if (!justRes.ok) {
          const err = await justRes.json().catch(() => ({}));
          setError(
            (err as { error?: string }).error ||
              'Voo criado, mas falhou ao registrar justificativa operacional estruturada.',
          );
          setSubmitting(false);
          return;
        }
        toast.success('Escala criada com justificativa operacional estruturada.');
      }

      onCreated();
    } catch (err) {
      setError('Erro de rede');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
        <Plus className="h-4 w-4 text-blue-600" />
        Novo Voo — {formatDateBR(data)}
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* PIC */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">PIC</label>
            <select
              value={form.pic_id}
              onChange={(e) => setForm({ ...form, pic_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {pilotos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.guerra || p.nome} {p.funcao ? `(${p.funcao})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* SIC */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">SIC</label>
            <select
              value={form.sic_id}
              onChange={(e) => setForm({ ...form, sic_id: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {pilotos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.guerra || p.nome} {p.funcao ? `(${p.funcao})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Aeronave */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Aeronave (prefixo)</label>
            <input
              type="text"
              value={form.aeronave_prefixo}
              onChange={(e) => setForm({ ...form, aeronave_prefixo: e.target.value.toUpperCase() })}
              placeholder="PR-ABC"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Hora apresentação */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Apresentação</label>
            <input
              type="time"
              value={form.hora_apresentacao}
              onChange={(e) => setForm({ ...form, hora_apresentacao: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Decolagem prevista */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Decolagem prevista</label>
            <input
              type="time"
              value={form.hora_decolagem_prevista}
              onChange={(e) => setForm({ ...form, hora_decolagem_prevista: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Pouso previsto */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Pouso previsto</label>
            <input
              type="time"
              value={form.hora_pouso_previsto}
              onChange={(e) => setForm({ ...form, hora_pouso_previsto: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Origem */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Origem</label>
            <input
              type="text"
              value={form.origem}
              onChange={(e) => setForm({ ...form, origem: e.target.value.toUpperCase() })}
              placeholder="SBCB"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Destino */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Destino</label>
            <input
              type="text"
              value={form.destino}
              onChange={(e) => setForm({ ...form, destino: e.target.value.toUpperCase() })}
              placeholder="Plataforma / ICAO"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          {/* Tipo missão */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tipo missão</label>
            <select
              value={form.tipo_missao}
              onChange={(e) => setForm({ ...form, tipo_missao: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="OFFSHORE">Offshore</option>
              <option value="INSTRUCAO">Instrução</option>
              <option value="CHECK">Check</option>
              <option value="FERRY">Ferry</option>
              <option value="OUTRO">Outro</option>
            </select>
          </div>
        </div>

        {/* Observações */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Observações gerais</label>
          <textarea
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {needsStructuredJustificativa && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">
              Justificativa operacional FRMS (estruturada)
            </label>
            <textarea
              value={form.justificativa_operacional}
              onChange={(e) => setForm({ ...form, justificativa_operacional: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-amber-300 bg-amber-50/40 px-3 py-2 text-sm"
              placeholder="Descreva decisão operacional sem incluir dados sensíveis do check-in."
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        {warnings.length > 0 && (
          <div className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
            <p className="font-medium">Avisos:</p>
            {warnings.map((w, i) => (
              <p key={i}>• {w}</p>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
          >
            Cancelar
          </button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Criando...' : 'Criar Voo'}
          </Button>
        </div>
      </form>
    </div>
  );
}
