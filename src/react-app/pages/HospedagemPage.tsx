/**
 * Hospedagem — Gerenciamento de acomodações de tripulantes
 * CRUD simples: hotel, plataforma, base, outro
 */

import { useState, useEffect, useCallback } from 'react';
import AppLayout from '../components/AppLayout';
import { API_BASE_URL } from '../config/api';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  LogOut,
  RefreshCw,
  Building2,
  Layers,
  Home,
  MapPin,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { confirmDialog } from '../utils/confirmDialog';
import FuncionarioLink from '../components/funcionarios/FuncionarioLink';
import RowActionsMenu from '../components/UI/RowActionsMenu';

// ─── Types ───────────────────────────────────────────────────────────────────

type TipoHospedagem = 'HOTEL' | 'PLATAFORMA' | 'BASE' | 'OUTRO';

interface Hospedagem {
  id: number;
  funcionario_id: number;
  funcionario_nome?: string;
  funcionario_matricula?: string;
  tipo: TipoHospedagem;
  local: string;
  cidade?: string;
  estado?: string;
  data_checkin: string;
  data_checkout?: string | null;
  numero_quarto?: string | null;
  custo_diaria?: number | null;
  moeda: string;
  escala_id?: number | null;
  observacoes?: string | null;
}

interface Funcionario {
  id: number;
  nome: string;
  matricula: string;
}

interface Stats {
  total: number;
  ativos: number;
  total_hotel: number;
  total_plataforma: number;
  total_base: number;
  total_outro: number;
}

const TIPO_LABELS: Record<TipoHospedagem, string> = {
  HOTEL: 'Hotel',
  PLATAFORMA: 'Plataforma',
  BASE: 'Base',
  OUTRO: 'Outro',
};

const TIPO_ICONS: Record<TipoHospedagem, typeof Building2> = {
  HOTEL: Building2,
  PLATAFORMA: Layers,
  BASE: Home,
  OUTRO: MapPin,
};

const TIPO_COLORS: Record<TipoHospedagem, string> = {
  HOTEL: 'bg-blue-100 text-blue-700',
  PLATAFORMA: 'bg-orange-100 text-orange-700',
  BASE: 'bg-green-100 text-green-700',
  OUTRO: 'bg-gray-100 text-gray-600',
};

function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy');
  } catch {
    return iso;
  }
}

function fmtCurrency(value?: number | null, moeda = 'BRL') {
  if (value == null) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda }).format(value);
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  hospedagem: Partial<Hospedagem> | null;
  funcionarios: Funcionario[];
  onClose: () => void;
  onSaved: () => void;
}

function ModalHospedagem({ hospedagem, funcionarios, onClose, onSaved }: ModalProps) {
  const isEdit = !!hospedagem?.id;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const [form, setForm] = useState({
    funcionario_id: hospedagem?.funcionario_id ?? 0,
    tipo: (hospedagem?.tipo ?? 'HOTEL') as TipoHospedagem,
    local: hospedagem?.local ?? '',
    cidade: hospedagem?.cidade ?? '',
    estado: hospedagem?.estado ?? '',
    data_checkin: hospedagem?.data_checkin ?? new Date().toISOString().split('T')[0],
    data_checkout: hospedagem?.data_checkout ?? '',
    numero_quarto: hospedagem?.numero_quarto ?? '',
    custo_diaria: hospedagem?.custo_diaria != null ? String(hospedagem.custo_diaria) : '',
    moeda: hospedagem?.moeda ?? 'BRL',
    observacoes: hospedagem?.observacoes ?? '',
  });

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.funcionario_id) return toast.error('Selecione o tripulante');
    if (!form.local.trim()) return toast.error('Informe o local de hospedagem');
    if (!form.data_checkin) return toast.error('Informe a data de check-in');

    setSaving(true);
    const payload = {
      funcionario_id: form.funcionario_id,
      tipo: form.tipo,
      local: form.local.trim(),
      cidade: form.cidade.trim() || null,
      estado: form.estado.trim() || null,
      data_checkin: form.data_checkin,
      data_checkout: form.data_checkout || null,
      numero_quarto: form.numero_quarto.trim() || null,
      custo_diaria: form.custo_diaria ? parseFloat(form.custo_diaria) : null,
      moeda: form.moeda,
      observacoes: form.observacoes.trim() || null,
    };

    try {
      const url = isEdit
        ? `${API_BASE_URL}/hospedagem/${hospedagem!.id}`
        : `${API_BASE_URL}/hospedagem`;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Erro ao salvar');
      toast.success(isEdit ? 'Hospedagem atualizada' : 'Hospedagem registrada');
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Editar Hospedagem' : 'Nova Hospedagem'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Tripulante */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tripulante *</label>
            <select
              value={form.funcionario_id}
              onChange={(e) => set('funcionario_id', parseInt(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={isEdit}
            >
              <option value={0}>Selecione…</option>
              {funcionarios.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome} ({f.matricula})
                </option>
              ))}
            </select>
          </div>

          {/* Tipo + Local */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
              <select
                value={form.tipo}
                onChange={(e) => set('tipo', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {Object.entries(TIPO_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Local *</label>
              <input
                type="text"
                value={form.local}
                onChange={(e) => set('local', e.target.value)}
                placeholder="Nome do hotel / plataforma"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Cidade + Estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
              <input
                type="text"
                value={form.cidade}
                onChange={(e) => set('cidade', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <input
                type="text"
                value={form.estado}
                onChange={(e) => set('estado', e.target.value)}
                placeholder="RJ, SP…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-in *</label>
              <input
                type="date"
                value={form.data_checkin}
                onChange={(e) => set('data_checkin', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
              <input
                type="date"
                value={form.data_checkout ?? ''}
                onChange={(e) => set('data_checkout', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Quarto + Custo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nº Quarto</label>
              <input
                type="text"
                value={form.numero_quarto}
                onChange={(e) => set('numero_quarto', e.target.value)}
                placeholder="101"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Custo/diária</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.custo_diaria}
                onChange={(e) => set('custo_diaria', e.target.value)}
                placeholder="0,00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={form.observacoes}
              onChange={(e) => set('observacoes', e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HospedagemPage() {
  const [hospedagens, setHospedagens] = useState<Hospedagem[]>([]);
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; data: Partial<Hospedagem> | null }>({
    open: false,
    data: null,
  });
  const [filtroAtivo, setFiltroAtivo] = useState<'' | '1' | '0'>('');
  const [filtroTipo, setFiltroTipo] = useState<TipoHospedagem | ''>('');

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtroAtivo) params.set('ativo', filtroAtivo);
      if (filtroTipo) params.set('tipo', filtroTipo);

      const [hosRes, statsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/hospedagem?${params}`, { credentials: 'include' }),
        fetch(`${API_BASE_URL}/hospedagem/stats/resumo`, { credentials: 'include' }),
      ]);

      const hosData = await hosRes.json();
      const statsData = await statsRes.json();

      if (hosData.success) setHospedagens(hosData.data ?? []);
      if (statsData.success) setStats(statsData.data);
    } catch {
      toast.error('Erro ao carregar hospedagens');
    } finally {
      setLoading(false);
    }
  }, [filtroAtivo, filtroTipo]);

  const carregarFuncionarios = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/funcionarios?ativo=true&limit=500`, {
      credentials: 'include',
    });
    const data = await res.json();
    if (data.success) setFuncionarios(data.data?.funcionarios ?? data.data ?? []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useEffect(() => {
    carregarFuncionarios();
  }, [carregarFuncionarios]);

  const handleCheckout = async (h: Hospedagem) => {
    const ok = await confirmDialog(
      `Confirmar checkout de ${h.funcionario_nome ?? 'tripulante'} de "${h.local}"?`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE_URL}/hospedagem/${h.id}/checkout`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Erro');
      toast.success('Checkout registrado');
      carregar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao fazer checkout');
    }
  };

  const handleDelete = async (h: Hospedagem) => {
    const ok = await confirmDialog(`Remover registro de "${h.local}"?`);
    if (!ok) return;
    try {
      const res = await fetch(`${API_BASE_URL}/hospedagem/${h.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error ?? 'Erro');
      toast.success('Hospedagem removida');
      carregar();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover');
    }
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hospedagem</h1>
            <p className="text-sm text-gray-500 mt-0.5">Acomodações de tripulantes em missão</p>
          </div>
          <button
            onClick={() => setModal({ open: true, data: {} })}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Hospedagem
          </button>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total', value: stats.total, color: 'bg-gray-50 text-gray-700' },
              { label: 'Ativos', value: stats.ativos, color: 'bg-blue-50 text-blue-700' },
              { label: 'Hotel', value: stats.total_hotel, color: 'bg-indigo-50 text-indigo-700' },
              {
                label: 'Plataforma',
                value: stats.total_plataforma,
                color: 'bg-orange-50 text-orange-700',
              },
              { label: 'Base', value: stats.total_base, color: 'bg-green-50 text-green-700' },
              { label: 'Outro', value: stats.total_outro, color: 'bg-gray-50 text-gray-600' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`${color} rounded-xl p-4`}>
                <p className="text-2xl font-bold">{value ?? 0}</p>
                <p className="text-xs font-medium mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={filtroAtivo}
            onChange={(e) => setFiltroAtivo(e.target.value as '' | '1' | '0')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Todos os status</option>
            <option value="1">Hospedados agora</option>
            <option value="0">Com checkout</option>
          </select>
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoHospedagem | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(TIPO_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button
            onClick={carregar}
            disabled={loading}
            title="Atualizar"
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {loading && hospedagens.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">Carregando…</div>
          ) : hospedagens.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">Nenhuma hospedagem encontrada</p>
              <button
                onClick={() => setModal({ open: true, data: {} })}
                className="mt-3 text-blue-600 hover:underline text-sm"
              >
                + Registrar primeira hospedagem
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">Tripulante</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Local</th>
                    <th className="px-4 py-3">Check-in</th>
                    <th className="px-4 py-3">Check-out</th>
                    <th className="px-4 py-3">Custo/dia</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {hospedagens.map((h) => {
                    const TipoIcon = TIPO_ICONS[h.tipo] ?? MapPin;
                    const tipoColor = TIPO_COLORS[h.tipo] ?? 'bg-gray-100 text-gray-600';
                    const ativo = !h.data_checkout;
                    return (
                      <tr key={h.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <FuncionarioLink
                            funcionarioId={h.funcionario_id}
                            nome={h.funcionario_nome ?? `#${h.funcionario_id}`}
                            className="font-medium text-gray-900 hover:text-primary hover:underline"
                          />
                          {h.funcionario_matricula && (
                            <p className="text-xs text-gray-400">{h.funcionario_matricula}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tipoColor}`}
                          >
                            <TipoIcon className="w-3 h-3" />
                            {TIPO_LABELS[h.tipo]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-800">{h.local}</p>
                          {(h.cidade || h.estado) && (
                            <p className="text-xs text-gray-400">
                              {[h.cidade, h.estado].filter(Boolean).join(', ')}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{fmtDate(h.data_checkin)}</td>
                        <td className="px-4 py-3">
                          {ativo ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                              Hospedado
                            </span>
                          ) : (
                            <span className="text-gray-500 text-xs">
                              {fmtDate(h.data_checkout)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {fmtCurrency(h.custo_diaria, h.moeda)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {ativo && (
                              <button
                                onClick={() => handleCheckout(h)}
                                title="Registrar checkout"
                                className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                              >
                                <LogOut className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => setModal({ open: true, data: h })}
                              title="Editar"
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <RowActionsMenu
                              label={`Ações da hospedagem ${h.local}`}
                              actions={[
                                {
                                  label: 'Remover hospedagem',
                                  destructive: true,
                                  icon: Trash2,
                                  onSelect: () => handleDelete(h),
                                },
                              ]}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal.open && (
        <ModalHospedagem
          hospedagem={modal.data}
          funcionarios={funcionarios}
          onClose={() => setModal({ open: false, data: null })}
          onSaved={() => {
            setModal({ open: false, data: null });
            carregar();
          }}
        />
      )}
    </AppLayout>
  );
}
