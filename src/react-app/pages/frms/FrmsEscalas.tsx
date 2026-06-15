/**
 * FRMS — Escalas Quinzenais (/frms/escalas)
 *
 * Gerenciamento das escalas de embarque/folga por tripulante.
 * Backend: POST/GET/PUT /api/frms/escalas
 */
import { useState, useCallback, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Calendar,
  Pencil,
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  CalendarX,
} from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { EmptyState } from '@/react-app/components/UI/EmptyState';
import { useApi } from '@/react-app/hooks/useApi';
import { useFrmsEscalas, useFrmsMutation } from '@/react-app/hooks/useFrms';
import type { FrmsEscalaRow } from '@/react-app/hooks/useFrms';
import { toast } from 'sonner';

function getTodayLocalKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ── Tipos ────────────────────────────────────────────────
interface Funcionario {
  id: number;
  nome: string;
  cargo?: string;
}

const STATUS_CICLO_LABELS: Record<string, { label: string; color: string }> = {
  ATIVO: { label: 'Ativo', color: 'bg-emerald-100 text-emerald-800' },
  ENCERRADO: { label: 'Encerrado', color: 'bg-gray-100 text-gray-600' },
  CANCELADO: { label: 'Cancelado', color: 'bg-red-100 text-red-700' },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function diffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round(Math.abs((db.getTime() - da.getTime()) / 86400000)) + 1;
}

// ── Modal de Formulário ──────────────────────────────────
interface FormModalProps {
  tripulanteId: string;
  escala: FrmsEscalaRow | null;
  onClose: () => void;
  onSaved: () => void;
}

function EscalaFormModal({ tripulanteId, escala, onClose, onSaved }: FormModalProps) {
  const { mutate, loading } = useFrmsMutation();
  const isEdit = !!escala;

  const hoje = getTodayLocalKey();
  const [dataInicioEmb, setDataInicioEmb] = useState(escala?.data_inicio_embarque ?? hoje);
  const [dataFimEmb, setDataFimEmb] = useState(escala?.data_fim_embarque ?? hoje);
  const [dataInicioFolga, setDataInicioFolga] = useState(escala?.data_inicio_folga ?? hoje);
  const [dataFimFolga, setDataFimFolga] = useState(escala?.data_fim_folga ?? hoje);
  const [statusCiclo, setStatusCiclo] = useState(escala?.status_ciclo ?? 'ATIVO');
  const [obs, setObs] = useState(escala?.observacao ?? '');

  const diasEmb = dataInicioEmb && dataFimEmb ? diffDays(dataInicioEmb, dataFimEmb) : 0;
  const diasFolga = dataInicioFolga && dataFimFolga ? diffDays(dataInicioFolga, dataFimFolga) : 0;
  const anoAtual = new Date().getFullYear();
  // Ciclo estimado pelo mês de início
  const cicloEstimado = dataInicioEmb
    ? Math.ceil(
        new Date(dataInicioEmb + 'T00:00:00').getMonth() * 2 +
          (new Date(dataInicioEmb).getDate() <= 15 ? 1 : 2),
      )
    : 1;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = {
      tripulante_id: tripulanteId,
      ano: anoAtual,
      ciclo: escala?.ciclo ?? cicloEstimado,
      data_inicio_embarque: dataInicioEmb,
      data_fim_embarque: dataFimEmb,
      data_inicio_folga: dataInicioFolga,
      data_fim_folga: dataFimFolga,
      observacao: obs || null,
      ...(isEdit ? { status_ciclo: statusCiclo } : {}),
    };
    try {
      if (isEdit) {
        await mutate(`/api/frms/escalas/${escala!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        toast.success('Escala atualizada');
      } else {
        await mutate('/api/frms/escalas', { method: 'POST', body: JSON.stringify(body) });
        toast.success('Escala criada');
      }
      onSaved();
    } catch {
      toast.error('Erro ao salvar escala');
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-base font-bold text-gray-900">
            {isEdit ? 'Editar Escala' : 'Nova Escala Quinzenal'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Embarque */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-2">
              Período de Embarque
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Início</label>
                <input
                  type="date"
                  value={dataInicioEmb}
                  onChange={(e) => setDataInicioEmb(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fim</label>
                <input
                  type="date"
                  value={dataFimEmb}
                  onChange={(e) => setDataFimEmb(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            {diasEmb > 0 && (
              <p className="text-[11px] text-blue-600 mt-1">{diasEmb} dias de embarque</p>
            )}
          </div>

          {/* Folga */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 mb-2">
              Período de Folga
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Início</label>
                <input
                  type="date"
                  value={dataInicioFolga}
                  onChange={(e) => setDataInicioFolga(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Fim</label>
                <input
                  type="date"
                  value={dataFimFolga}
                  onChange={(e) => setDataFimFolga(e.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            {diasFolga > 0 && (
              <p className="text-[11px] text-emerald-600 mt-1">{diasFolga} dias de folga</p>
            )}
          </div>

          {/* Status (só na edição) */}
          {isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Status do Ciclo
              </label>
              <div className="relative">
                <select
                  value={statusCiclo}
                  onChange={(e) => setStatusCiclo(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-200 pl-3 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
                >
                  <option value="ATIVO">Ativo</option>
                  <option value="ENCERRADO">Encerrado</option>
                  <option value="CANCELADO">Cancelado</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>
          )}

          {/* Observação */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Observação</label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Observações opcionais..."
            />
          </div>

          {/* Resumo */}
          {diasEmb > 0 && diasFolga > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
              Ciclo {cicloEstimado}/{anoAtual} — {diasEmb}d embarcado + {diasFolga}d folga ={' '}
              {diasEmb + diasFolga}d totais
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-emerald-600 px-5 py-2 text-sm font-medium text-white hover:from-primary/90 hover:to-emerald-600/90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? 'Salvar Alterações' : 'Criar Escala'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Página Principal ─────────────────────────────────────
export default function FrmsEscalas() {
  const navigate = useNavigate();
  const [tripulanteId, setTripulanteId] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [editingEscala, setEditingEscala] = useState<FrmsEscalaRow | null>(null);

  // Buscar apenas Comandantes e Copilotos para o seletor
  const { data: funcData } = useApi<{ data: Funcionario[] }>(
    '/api/funcionarios?limit=200&page=1&status=ativos&orderBy=nome&order=ASC',
    { requireAuth: true },
  );
  const funcionarios: Funcionario[] = ((funcData as any)?.data ?? []).filter(
    (f: Funcionario) =>
      f.cargo?.toLowerCase().includes('comandante') || f.cargo?.toLowerCase().includes('copiloto'),
  );

  const { data: escalasRaw, loading, refetch } = useFrmsEscalas(tripulanteId || undefined);
  const escalas: FrmsEscalaRow[] = Array.isArray(escalasRaw) ? escalasRaw : [];

  const handleSaved = useCallback(() => {
    setShowForm(false);
    setEditingEscala(null);
    refetch();
  }, [refetch]);

  const tripulanteNome = funcionarios.find((f) => String(f.id) === tripulanteId)?.nome;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/frms')}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Escalas Quinzenais</h1>
            <p className="text-sm text-gray-500">
              Gestão dos ciclos de embarque e folga por tripulante
            </p>
          </div>
          {tripulanteId && (
            <button
              onClick={() => {
                setEditingEscala(null);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" /> Incluir Escala
            </button>
          )}
        </div>

        {/* Seletor de Tripulante */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Selecionar Tripulante
          </label>
          <div className="relative max-w-sm">
            <select
              value={tripulanteId}
              onChange={(e) => setTripulanteId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-gray-200 bg-white pl-3 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer"
            >
              <option value="">— Escolha um tripulante —</option>
              {funcionarios.map((f) => (
                <option key={f.id} value={String(f.id)}>
                  {f.nome} {f.cargo ? `(${f.cargo})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          </div>
        </div>

        {/* Lista de Escalas */}
        {tripulanteId && (
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold text-gray-700">
                Escalas de {tripulanteNome ?? `#${tripulanteId}`}
              </span>
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-500">
                {escalas.length}
              </span>
            </div>

            {loading ? (
              <div className="p-10 text-center text-gray-400 text-sm">Carregando escalas...</div>
            ) : escalas.length === 0 ? (
              <div className="py-10">
                <EmptyState
                  icon={<CalendarX size={48} className="text-slate-300" />}
                  title="Nenhuma escala"
                  description="Nenhuma escala cadastrada para este tripulante."
                  action={{
                    label: 'Cadastrar primeira escala',
                    onClick: () => {
                      setEditingEscala(null);
                      setShowForm(true);
                    },
                    icon: <Plus className="h-4 w-4" />,
                  }}
                />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/70 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase text-gray-500">
                      Ciclo
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase text-gray-500">
                      Embarque
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase text-gray-500">
                      Folga
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase text-gray-500">
                      Dias Emb
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase text-gray-500">
                      Dias Folga
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase text-gray-500">
                      Obs.
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {escalas.map((e) => {
                    const st = STATUS_CICLO_LABELS[e.status_ciclo] ?? {
                      label: e.status_ciclo,
                      color: 'bg-gray-100 text-gray-600',
                    };
                    return (
                      <tr key={e.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-700 font-medium tabular-nums">
                          {e.ciclo}/{e.ano}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {formatDate(e.data_inicio_embarque)} → {formatDate(e.data_fim_embarque)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {formatDate(e.data_inicio_folga)} → {formatDate(e.data_fim_folga)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-bold">
                            {e.dias_embarcado}d
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs font-bold">
                            {e.dias_folga}d
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${st.color}`}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400 text-xs truncate max-w-[160px]">
                          {e.observacao ?? '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => {
                              setEditingEscala(e);
                              setShowForm(true);
                            }}
                            className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-100 transition-colors"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5 text-gray-500" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Instruções iniciais se não selecionado */}
        {!tripulanteId && (
          <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
            <Calendar className="h-10 w-10 text-gray-300" />
            Selecione um tripulante acima para visualizar e gerenciar suas escalas quinzenais.
          </div>
        )}

        {/* Modal de formulário */}
        {showForm && tripulanteId && (
          <EscalaFormModal
            tripulanteId={tripulanteId}
            escala={editingEscala}
            onClose={() => {
              setShowForm(false);
              setEditingEscala(null);
            }}
            onSaved={handleSaved}
          />
        )}
      </div>
    </AppLayout>
  );
}
