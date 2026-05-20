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
import { useApi, useApiMutation } from '@/react-app/hooks/useApi';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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

export default function EvdPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [data, setData] = useState(toLocalDateStr(new Date()));
  const [showForm, setShowForm] = useState(false);

  const { data: voosRaw, loading } = useApi<{ success: boolean; data: EvdVoo[] }>(
    `/api/evd?data=${data}`,
  );
  const voos = voosRaw?.data || [];

  const selectedDate = new Date(data + 'T12:00:00');
  const weekday = WEEKDAY_LABELS[selectedDate.getDay()];

  function changeDay(delta: number) {
    const d = new Date(data + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setData(toLocalDateStr(d));
  }

  // Publicar voo
  const publicarMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/evd/${id}/publicar`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Erro ao publicar');
      }
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/evd'] }),
  });

  // Delete voo
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/evd/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/evd'] }),
  });

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
                Escala de Voo Diária (EVD)
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">PRC-OPS-009 §4.3</p>
            </div>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Novo Voo
          </Button>
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
                          onClick={() => publicarMutation.mutate(voo.id)}
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
}: {
  data: string;
  onClose: () => void;
  onCreated: () => void;
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setWarnings([]);
    setSubmitting(true);

    try {
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
          <label className="block text-xs text-slate-500 mb-1">Observações</label>
          <textarea
            value={form.observacoes}
            onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

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
