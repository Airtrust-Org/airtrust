// src/react-app/pages/escalas/ConfiguracaoEscalaPage.tsx
// Página de configurações do módulo de escalas

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CalendarDays,
  Calendar,
  Check,
  ClipboardList,
  Info,
  Pencil,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import { Button } from '@/react-app/components/UI';
import { mutateApi } from './hooks/queries/useEscalasQuery';
import {
  useEscalaPreferenciasMutations,
  useEscalaPreferenciasQuery,
  useQuinzenasQuery,
  useTemplatesQuery,
  useTemplatesMutations,
  useTiposEventoConfigMutations,
  type QuinzenaEscala,
} from './hooks/queries/useEscalasQuery';
import { useEscalaStore } from './hooks/useEscalaStore';
import { Q1, Q2 } from './constants/escalaTokens';
import {
  normalizeTipoEventoCodigo,
  useTiposEventoResolvidos,
} from './hooks/useTiposEventoResolvidos';
import { formatDate } from '@/react-app/utils/formatDate';
import { getDefaultQuinzenaRange } from './utils/quinzenas';
import CompactColorPicker from './components/CompactColorPicker';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

// ─────────────────────────────────────────────────────────────────────────────
// ABA QUINZENAS
// ─────────────────────────────────────────────────────────────────────────────
function AbaQuinzenas({ ano, setAno }: { ano: number; setAno: (a: number) => void }) {
  const [saving, setSaving] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editando, setEditando] = useState<Record<string, { inicio: string; fim: string }>>({});
  const [gerandoAno, setGerandoAno] = useState(false);

  const { data: quinzenasRaw, loading, refetch } = useQuinzenasQuery(ano);
  const quinzenas = quinzenasRaw ?? [];

  // Indexar por mes_numero
  const idx = useMemo(() => {
    const m = new Map<string, QuinzenaEscala>();
    quinzenas.forEach((q) => m.set(`${q.mes}_${q.numero}`, q));
    return m;
  }, [quinzenas]);

  const getDefaultDate = (mes: number, num: 1 | 2, field: 'inicio' | 'fim') => {
    const range = getDefaultQuinzenaRange(ano, mes, num);
    return field === 'inicio' ? range.inicio : range.fim;
  };

  const getValor = (mes: number, num: 1 | 2, field: 'inicio' | 'fim') => {
    const key = `${mes}_${num}`;
    if (editando[key]) return field === 'inicio' ? editando[key].inicio : editando[key].fim;
    const q = idx.get(key);
    if (q) return field === 'inicio' ? q.data_inicio : q.data_fim;
    return getDefaultDate(mes, num, field);
  };

  const calcDias = (inicioIso: string, fimIso: string) => {
    const ini = new Date(`${inicioIso}T00:00:00`);
    const fim = new Date(`${fimIso}T00:00:00`);
    if (isNaN(ini.getTime()) || isNaN(fim.getTime()) || fim < ini) return 0;
    return Math.floor((fim.getTime() - ini.getTime()) / 86400000) + 1;
  };

  const hoje = new Date();

  const iniciarEdicao = (mes: number, num: 1 | 2) => {
    const key = `${mes}_${num}`;
    setEditando((e) => ({
      ...e,
      [key]: { inicio: getValor(mes, num, 'inicio'), fim: getValor(mes, num, 'fim') },
    }));
  };

  const cancelarEdicao = (mes: number, num: 1 | 2) => {
    const key = `${mes}_${num}`;
    setEditando((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
  };

  const salvar = async (mes: number, num: 1 | 2) => {
    const key = `${mes}_${num}`;
    const vals = editando[key];
    if (!vals) return;
    setSavingKey(key);
    setSaving(true);
    try {
      const existente = idx.get(key);
      if (existente) {
        await mutateApi(`/api/escalas/quinzenas/${existente.id}`, 'PUT', {
          data_inicio: vals.inicio,
          data_fim: vals.fim,
        });
      } else {
        await mutateApi('/api/escalas/quinzenas', 'POST', {
          ano,
          mes,
          numero: num,
          data_inicio: vals.inicio,
          data_fim: vals.fim,
        });
      }
      toast.success(`${MESES[mes - 1]} — ${num}ª Quinzena salva`);
      cancelarEdicao(mes, num);
      refetch?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSavingKey(null);
      setSaving(false);
    }
  };

  const gerarPadrao = async () => {
    setGerandoAno(true);
    setSaving(true);
    try {
      await mutateApi('/api/escalas/quinzenas/gerar-ano', 'POST', { ano });
      toast.success(`Quinzenas padrão geradas para ${ano}`);
      refetch?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar quinzenas');
    } finally {
      setGerandoAno(false);
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Quinzenas do Ano</h3>
          <p className="text-sm text-slate-500 mt-0.5">
            Defina as datas exatas de Q1 e Q2 por mês — podem variar por feriados
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Navegação de ano */}
          <div className="flex items-center gap-1 border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setAno(ano - 1)}
              className="px-3 py-2 hover:bg-slate-50 text-slate-600 text-sm transition-colors"
            >
              ‹
            </button>
            <span className="px-4 text-sm font-bold text-slate-800 min-w-[56px] text-center border-x border-slate-200">
              {ano}
            </span>
            <button
              onClick={() => setAno(ano + 1)}
              className="px-3 py-2 hover:bg-slate-50 text-slate-600 text-sm transition-colors"
            >
              ›
            </button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            isLoading={gerandoAno}
            leftIcon={<Sparkles className="w-4 h-4" />}
            onClick={gerarPadrao}
          >
            Gerar Padrão {ano}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 w-36">Mês</th>
                <th className="text-left px-4 py-3 font-semibold text-sky-700">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-fuchsia-400 inline-block" />
                    1ª Quinzena
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-violet-700">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    2ª Quinzena
                  </span>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700 w-36">Dias</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MESES.map((nomeMes, i) => {
                const mes = i + 1;
                const key1 = `${mes}_1`;
                const key2 = `${mes}_2`;
                const tem1 = !!idx.get(key1);
                const tem2 = !!idx.get(key2);
                const edit1 = !!editando[key1];
                const edit2 = !!editando[key2];
                const q1Inicio = getValor(mes, 1, 'inicio');
                const q1Fim = getValor(mes, 1, 'fim');
                const q2Inicio = getValor(mes, 2, 'inicio');
                const q2Fim = getValor(mes, 2, 'fim');
                const hojeNaQ1 =
                  hoje >= new Date(`${q1Inicio}T00:00:00`) && hoje <= new Date(`${q1Fim}T23:59:59`);
                const hojeNaQ2 =
                  hoje >= new Date(`${q2Inicio}T00:00:00`) && hoje <= new Date(`${q2Fim}T23:59:59`);

                return (
                  <tr key={mes} className="hover:bg-slate-50/60 transition-colors">
                    {/* Mês */}
                    <td className="px-4 py-3">
                      <span className="font-semibold text-slate-800">{nomeMes}</span>
                    </td>

                    {/* Q1 */}
                    <td className="px-4 py-3">
                      {edit1 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input
                            type="date"
                            value={editando[key1].inicio}
                            onChange={(e) =>
                              setEditando((ed) => ({
                                ...ed,
                                [key1]: { ...ed[key1], inicio: e.target.value },
                              }))
                            }
                            className="border border-fuchsia-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-300 bg-white"
                          />
                          <span className="text-slate-400 text-xs">→</span>
                          <input
                            type="date"
                            value={editando[key1].fim}
                            onChange={(e) =>
                              setEditando((ed) => ({
                                ...ed,
                                [key1]: { ...ed[key1], fim: e.target.value },
                              }))
                            }
                            className="border border-fuchsia-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-fuchsia-300 bg-white"
                          />
                          <button
                            onClick={() => salvar(mes, 1)}
                            disabled={savingKey === key1}
                            className="p-1.5 bg-fuchsia-500 text-white rounded-lg hover:bg-fuchsia-600 disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => cancelarEdicao(mes, 1)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <span
                            className={[
                              'text-xs font-mono px-2.5 py-1 rounded-lg',
                              hojeNaQ1
                                ? 'ring-1 ring-fuchsia-300 bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200'
                                : '',
                              tem1
                                ? 'bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200'
                                : 'bg-slate-50 text-slate-400 border border-dashed border-slate-200',
                            ].join(' ')}
                          >
                            {formatDate(q1Inicio)} → {formatDate(q1Fim)}
                          </span>
                          <button
                            onClick={() => iniciarEdicao(mes, 1)}
                            className="p-1.5 text-slate-400 hover:text-fuchsia-500 rounded-lg hover:bg-fuchsia-50"
                            title={tem1 ? 'Editar' : 'Definir'}
                          >
                            {tem1 ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>
                      )}
                    </td>

                    {/* Q2 */}
                    <td className="px-4 py-3">
                      {edit2 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input
                            type="date"
                            value={editando[key2].inicio}
                            onChange={(e) =>
                              setEditando((ed) => ({
                                ...ed,
                                [key2]: { ...ed[key2], inicio: e.target.value },
                              }))
                            }
                            className="border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                          />
                          <span className="text-slate-400 text-xs">→</span>
                          <input
                            type="date"
                            value={editando[key2].fim}
                            onChange={(e) =>
                              setEditando((ed) => ({
                                ...ed,
                                [key2]: { ...ed[key2], fim: e.target.value },
                              }))
                            }
                            className="border border-amber-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                          />
                          <button
                            onClick={() => salvar(mes, 2)}
                            disabled={savingKey === key2}
                            className="p-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => cancelarEdicao(mes, 2)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <span
                            className={[
                              'text-xs font-mono px-2.5 py-1 rounded-lg',
                              hojeNaQ2
                                ? 'ring-1 ring-amber-300 bg-amber-50 text-amber-700 border-amber-200'
                                : '',
                              tem2
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-50 text-slate-400 border border-dashed border-slate-200',
                            ].join(' ')}
                          >
                            {formatDate(q2Inicio)} → {formatDate(q2Fim)}
                          </span>
                          <button
                            onClick={() => iniciarEdicao(mes, 2)}
                            className="p-1.5 text-slate-400 hover:text-amber-500 rounded-lg hover:bg-amber-50"
                            title={tem2 ? 'Editar' : 'Definir'}
                          >
                            {tem2 ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                          </button>
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div className="space-y-1">
                        <p>
                          Q1:{' '}
                          <span className="font-semibold">{calcDias(q1Inicio, q1Fim)} dias</span>
                        </p>
                        <p>
                          Q2:{' '}
                          <span className="font-semibold">{calcDias(q2Inicio, q2Fim)} dias</span>
                        </p>
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA TIPOS DE EVENTO
// ─────────────────────────────────────────────────────────────────────────────
const CORES_PRESET = [
  '#1D4ED8',
  '#2563EB',
  '#3B82F6',
  '#60A5FA',
  '#93C5FD',
  '#1E40AF',
  '#4338CA',
  '#4F46E5',
  '#6366F1',
  '#818CF8',
  '#A5B4FC',
  '#312E81',
  '#6D28D9',
  '#7C3AED',
  '#8B5CF6',
  '#A855F7',
  '#C084FC',
  '#E879F9',
  '#BE185D',
  '#DB2777',
  '#EC4899',
  '#F472B6',
  '#FB7185',
  '#E11D48',
  '#DC2626',
  '#EF4444',
  '#F87171',
  '#FCA5A5',
  '#EA580C',
  '#F97316',
  '#FB923C',
  '#FDBA74',
  '#D97706',
  '#F59E0B',
  '#FBBF24',
  '#FCD34D',
  '#65A30D',
  '#84CC16',
  '#A3E635',
  '#BEF264',
  '#15803D',
  '#16A34A',
  '#22C55E',
  '#4ADE80',
  '#86EFAC',
  '#047857',
  '#10B981',
  '#34D399',
  '#6EE7B7',
  '#0F766E',
  '#14B8A6',
  '#2DD4BF',
  '#5EEAD4',
  '#0E7490',
  '#06B6D4',
  '#22D3EE',
  '#67E8F9',
  '#334155',
  '#475569',
  '#64748B',
  '#6B7280',
  '#111827',
];

function AbaTiposEvento() {
  const {
    data: rowsData,
    configMap,
    tiposAtivos,
    loading: loadingTiposConfig,
    refetch: refetchTiposConfig,
  } = useTiposEventoResolvidos();
  const rows = Array.isArray(rowsData) ? rowsData : [];
  const {
    atualizar: atualizarTipoConfig,
    criar: criarTipoConfig,
    remover: removerTipoConfig,
    loading: savingTipoConfig,
  } = useTiposEventoConfigMutations();

  // Edit state
  const [editandoId, setEditandoId] = useState<string | null>(null); // row.id
  const [editLabel, setEditLabel] = useState('');
  const [editSigla, setEditSigla] = useState('');
  const [editCor, setEditCor] = useState('');

  const [confirmDeletar, setConfirmDeletar] = useState<string | null>(null); // row.id

  // New type state
  const [novoTipoAberto, setNovoTipoAberto] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState('');
  const [novoLabel, setNovoLabel] = useState('');
  const [novoSigla, setNovoSigla] = useState('');
  const [novoCor, setNovoCor] = useState('#6366F1');

  const normalizeSigla = (value: string) =>
    value
      .trim()
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 2);

  const normalizeCodigo = (value: string) =>
    value
      .trim()
      .replace(/[^A-Za-z0-9_]/g, '')
      .toUpperCase()
      .slice(0, 8);

  const iniciarEdicao = (row: (typeof rows)[number]) => {
    setEditLabel(row.label);
    setEditSigla(row.sigla);
    setEditCor(row.cor);
    setEditandoId(row.id);
  };

  const salvarEdicao = async () => {
    if (!editandoId) return;
    try {
      await atualizarTipoConfig(editandoId, {
        label: editLabel.trim() || undefined,
        sigla: normalizeSigla(editSigla) || undefined,
        cor: editCor || undefined,
      });
      await refetchTiposConfig();
      toast.success('Tipo de evento atualizado');
      setEditandoId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar tipo');
    }
  };

  const handleToggleAtivo = async (row: (typeof rows)[number]) => {
    try {
      await atualizarTipoConfig(row.id, { ativo: row.ativo === 1 ? 0 : 1 });
      await refetchTiposConfig();
      toast.success(row.ativo === 1 ? 'Tipo desativado' : 'Tipo ativado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar tipo');
    }
  };

  const handleDeletar = async (row: (typeof rows)[number]) => {
    try {
      await removerTipoConfig(row.id);
      await refetchTiposConfig();
      toast.success(`Tipo "${row.label}" removido`);
      setConfirmDeletar(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover tipo');
    }
  };

  const handleCriarNovoTipo = async () => {
    const codigoFinal = normalizeCodigo(novoCodigo);
    if (!codigoFinal || !novoLabel.trim()) {
      toast.error('Código e nome são obrigatórios');
      return;
    }
    if (rows.some((r) => normalizeTipoEventoCodigo(r.codigo) === codigoFinal)) {
      toast.error(`Código "${codigoFinal}" já existe`);
      return;
    }
    try {
      await criarTipoConfig({
        codigo: codigoFinal,
        label: novoLabel.trim(),
        sigla: normalizeSigla(novoSigla) || codigoFinal.slice(0, 2),
        cor: novoCor,
        ativo: 1,
        ordem: rows.length + 1,
      });
      await refetchTiposConfig();
      toast.success('Novo tipo criado');
      setNovoTipoAberto(false);
      setNovoCodigo('');
      setNovoLabel('');
      setNovoSigla('');
      setNovoCor('#6366F1');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar tipo');
    }
  };

  const ativosCount = rows.filter((r) => r.ativo === 1).length;
  const inativosCount = rows.length - ativosCount;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold text-slate-800">Tipos de Evento</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Configure as categorias usadas na grade de escalas. Crie e apague livremente.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setNovoTipoAberto(true)}
            disabled={novoTipoAberto || savingTipoConfig}
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Novo tipo
          </Button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700">
            {ativosCount} ativos
          </span>
          {inativosCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500">
              {inativosCount} inativos
            </span>
          )}
        </div>
      </div>

      {/* Confirmation: deletar */}
      {confirmDeletar &&
        (() => {
          const row = rows.find((r) => r.id === confirmDeletar);
          if (!row) return null;
          return (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-sm font-medium text-red-900">
                Apagar permanentemente &ldquo;{row.label}&rdquo;?
              </p>
              <p className="text-xs text-red-700">
                O tipo será removido do sistema. Eventos existentes com este código permanecerão,
                mas aparecerão sem configuração visual.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConfirmDeletar(null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleDeletar(row)}
                  disabled={savingTipoConfig}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Apagar
                </button>
              </div>
            </div>
          );
        })()}

      {/* Novo tipo form */}
      {novoTipoAberto && (
        <div className="rounded-xl border-2 border-blue-300 bg-white p-4 shadow-sm space-y-3">
          <p className="text-sm font-semibold text-slate-800">Novo tipo de evento</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">Código</span>
              <input
                value={novoCodigo}
                onChange={(e) => setNovoCodigo(normalizeCodigo(e.target.value))}
                placeholder="ex: CRS"
                maxLength={8}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </label>
            <label className="col-span-2">
              <span className="mb-1 block text-xs font-medium text-slate-600">Nome</span>
              <input
                value={novoLabel}
                onChange={(e) => setNovoLabel(e.target.value)}
                placeholder="Nome do tipo"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </label>
            <label className="col-span-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">Sigla</span>
              <input
                value={novoSigla}
                onChange={(e) => setNovoSigla(normalizeSigla(e.target.value))}
                placeholder="ex: CR"
                maxLength={2}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono text-slate-700 text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </label>
          </div>
          <div className="flex flex-col gap-3">
            <CompactColorPicker value={novoCor} onChange={setNovoCor} />
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg border border-slate-200 shadow-sm flex items-center justify-center text-[11px] font-bold"
                style={{ backgroundColor: novoCor, color: '#FFFFFF' }}
              >
                {novoSigla || (normalizeCodigo(novoCodigo) || '?').slice(0, 2)}
              </div>
              <input
                type="text"
                value={novoCor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setNovoCor(v);
                }}
                className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="#000000"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => {
                setNovoTipoAberto(false);
                setNovoCodigo('');
                setNovoLabel('');
                setNovoSigla('');
                setNovoCor('#6366F1');
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleCriarNovoTipo}
              disabled={!novoCodigo || !novoLabel || savingTipoConfig}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              Criar tipo
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5 xl:flex-row">
        {/* Card list */}
        <div className="flex-1 space-y-2">
          {loadingTiposConfig ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <SlidersHorizontal className="w-12 h-12 mb-2" />
              <p className="text-sm font-medium text-slate-600">Nenhum tipo configurado</p>
              <p className="text-xs mt-1">Clique em &ldquo;Novo tipo&rdquo; para começar.</p>
            </div>
          ) : (
            rows.map((row) => {
              const codigo = normalizeTipoEventoCodigo(row.codigo);
              const corAtual = row.cor;
              const siglaTextColor = '#FFFFFF';
              const ativo = row.ativo === 1;
              const editando = editandoId === row.id;

              if (editando) {
                return (
                  <div
                    key={row.id}
                    className="rounded-xl border-2 border-blue-300 bg-white p-4 shadow-sm space-y-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold tracking-tight shadow-sm transition-colors"
                        style={{
                          backgroundColor: editCor || corAtual,
                          color: '#FFFFFF',
                        }}
                      >
                        {editSigla || row.sigla}
                      </div>
                      <div className="flex flex-1 items-center gap-3">
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          placeholder="Nome do tipo"
                          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-300"
                          autoFocus
                        />
                        <input
                          value={editSigla}
                          onChange={(e) => setEditSigla(normalizeSigla(e.target.value))}
                          placeholder="Sigla"
                          maxLength={2}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          className="w-20 rounded-lg border border-slate-200 px-3 py-2 text-center text-sm font-semibold tracking-wide text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Sigla exibida no quadrado da escala. Use 1 ou 2 caracteres.
                    </p>
                    <div className="flex flex-col gap-3">
                      <CompactColorPicker value={editCor || corAtual} onChange={setEditCor} />
                      <div className="flex items-center gap-2">
                        <div
                          className="h-8 w-8 rounded-lg border border-slate-200 shadow-sm"
                          style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(editCor || '') ? editCor : corAtual }}
                        />
                        <input
                          type="text"
                          value={editCor || corAtual}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setEditCor(v);
                          }}
                          className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-mono text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                          placeholder="#000000"
                        />
                        <p className="text-[11px] text-slate-400">
                          Arraste o cursor na palheta para escolher qualquer tom.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">
                        Código: {codigo} (readonly)
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <button
                          onClick={() => setEditandoId(null)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={salvarEdicao}
                          disabled={savingTipoConfig}
                          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={row.id}
                  className={[
                    'group relative flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors',
                    ativo
                      ? 'border-slate-200 bg-white hover:border-slate-300'
                      : 'border-slate-100 bg-slate-50/80',
                  ].join(' ')}
                >
                  {/* Color square */}
                  <div
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border border-slate-200/60 text-[10px] font-bold tracking-tight shadow-sm"
                    style={{ backgroundColor: corAtual, color: siglaTextColor }}
                  >
                    {row.sigla}
                  </div>

                  {/* Name + code */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 truncate">
                        {row.label}
                      </span>
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-700">
                        {row.sigla}
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">
                        {codigo}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Cor: {corAtual}</div>
                  </div>

                  {/* Status badge */}
                  {ativo ? (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold flex-shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Ativo
                    </span>
                  ) : (
                    <button
                      onClick={() => handleToggleAtivo(row)}
                      disabled={savingTipoConfig}
                      className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold flex-shrink-0 bg-slate-100 text-slate-500 border border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-colors disabled:opacity-50 cursor-pointer"
                      title="Clique para ativar"
                    >
                      Inativo — Ativar
                    </button>
                  )}

                  {/* Edit button */}
                  <button
                    onClick={() => iniciarEdicao(row)}
                    className="p-1.5 text-slate-400 hover:text-blue-500 rounded-lg hover:bg-blue-50 transition-colors"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => setConfirmDeletar(row.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                    title="Apagar permanentemente"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Live preview panel */}
        <div className="xl:w-64 flex-shrink-0 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Preview da Legenda
            </h4>
            <div className="space-y-2">
              {tiposAtivos.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Nenhum tipo ativo</p>
              ) : (
                tiposAtivos.map((codigo) => {
                  const conf = configMap[codigo];
                  if (!conf) return null;
                  return (
                    <div key={codigo} className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold tracking-tight"
                        style={{
                          backgroundColor: conf.cor,
                          color: '#FFFFFF',
                        }}
                      >
                        {conf.sigla}
                      </span>
                      <span className="text-sm text-gray-700">{conf.label}</span>
                      <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-700">
                        {conf.sigla}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-3">
              A legenda mostra nome e a sigla exibida no quadrado.
            </p>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <Info className="w-4 h-4 text-blue-400 mb-2" />
            <p className="text-xs text-blue-600 leading-relaxed">
              Tipos <strong>ativos</strong> aparecem na grade e nos dropdowns de evento. Tipos{' '}
              <strong>inativos</strong> ficam ocultos mas eventos existentes permanecem. Tipos
              apagados desaparecem completamente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA TEMPLATES
// ─────────────────────────────────────────────────────────────────────────────
function AbaTemplates() {
  const navigate = useNavigate();
  const { data: templatesRaw, loading, refetch } = useTemplatesQuery();
  const { remover } = useTemplatesMutations();
  const templates = templatesRaw ?? [];

  async function handleRemover(id: string, nome: string) {
    if (!window.confirm(`Remover template "${nome}"?`)) return;
    try {
      await remover(id);
      toast.success('Template removido');
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover template');
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-semibold text-slate-800">Templates de Alocação</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Templates criados ao salvar uma alocação ficam disponíveis para reuso rápido.
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <ClipboardList className="w-12 h-12 mb-2" />
          <p className="text-sm font-medium text-slate-600">
            Templates aparecem aqui após salvar uma alocação
          </p>
          <p className="text-xs mt-1">
            Crie uma alocação e marque a opção de salvar como template.
          </p>
          <Button
            className="mt-4"
            size="sm"
            onClick={() => navigate('/escalas')}
            leftIcon={<ArrowRight className="w-4 h-4" />}
          >
            Abrir escala e criar alocação
          </Button>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 group">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-slate-800 text-sm">{t.nome}</p>
                <p className="text-[11px] text-slate-400 mt-0.5 truncate flex items-center gap-1.5 flex-wrap">
                  {t.aeronave ? `✈️ ${t.aeronave} · ` : ''}
                  {t.pic_nome ? `PIC: ${t.pic_nome}` : ''}
                  {t.sic_nome ? ` · SIC: ${t.sic_nome}` : ''}
                  {t.quinzena ? (
                    <span className={t.quinzena === 1 ? Q1.pill : Q2.pill}>
                      {t.quinzena === 1 ? '1ª Q' : '2ª Q'}
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[11px] text-slate-400">
                  <span className="font-medium text-slate-600">{t.usos}</span> uso
                  {t.usos !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => navigate('/escalas')}
                  className="text-[10px] px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Usar agora
                </button>
                <button
                  onClick={() => handleRemover(t.id, t.nome)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50"
                  title="Remover template"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
        <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-600 leading-relaxed">
          Templates são salvos no servidor e disponíveis para todos os usuários da empresa. Para
          criar um novo, abra o modal de adição de alocação e use um template salvo.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ABA GERAL
// ─────────────────────────────────────────────────────────────────────────────
function AbaGeral() {
  const { exibirNome, setExibirNome } = useEscalaStore();
  const { data: preferencias } = useEscalaPreferenciasQuery();
  const { salvarPreferencias, loading: salvandoPreferencias } = useEscalaPreferenciasMutations();
  const preferenciasHidratadasRef = useRef<string>('');
  const [padraoQuinzena, setPadraoQuinzena] = useState<'padrao' | 'custom'>('padrao');
  const [turnoAInicio, setTurnoAInicio] = useState('07:00');
  const [turnoAFim, setTurnoAFim] = useState('19:00');
  const [turnoBInicio, setTurnoBInicio] = useState('19:00');
  const [turnoBFim, setTurnoBFim] = useState('07:00');
  const [limiteDia, setLimiteDia] = useState(14);
  const [limiteNoite, setLimiteNoite] = useState(11);
  const [alertaCmaAtivo, setAlertaCmaAtivo] = useState(true);
  const [alertaCmaDias, setAlertaCmaDias] = useState(30);

  useEffect(() => {
    if (!preferencias?.exibir_nome) return;
    const snapshot = JSON.stringify({
      exibir_nome: preferencias.exibir_nome,
      padrao_quinzena: preferencias.padrao_quinzena,
      turno_a_inicio: preferencias.turno_a_inicio,
      turno_a_fim: preferencias.turno_a_fim,
      turno_b_inicio: preferencias.turno_b_inicio,
      turno_b_fim: preferencias.turno_b_fim,
      limite_fdp_dia: preferencias.limite_fdp_dia,
      limite_fdp_noite: preferencias.limite_fdp_noite,
      alerta_cma_ativo: preferencias.alerta_cma_ativo,
      alerta_cma_dias: preferencias.alerta_cma_dias,
    });

    if (preferenciasHidratadasRef.current === snapshot) {
      return;
    }

    preferenciasHidratadasRef.current = snapshot;

    if (preferencias.exibir_nome !== exibirNome) setExibirNome(preferencias.exibir_nome);
    setPadraoQuinzena(preferencias.padrao_quinzena);
    setTurnoAInicio(preferencias.turno_a_inicio);
    setTurnoAFim(preferencias.turno_a_fim);
    setTurnoBInicio(preferencias.turno_b_inicio);
    setTurnoBFim(preferencias.turno_b_fim);
    setLimiteDia(preferencias.limite_fdp_dia);
    setLimiteNoite(preferencias.limite_fdp_noite);
    setAlertaCmaAtivo(preferencias.alerta_cma_ativo);
    setAlertaCmaDias(preferencias.alerta_cma_dias);
  }, [exibirNome, preferencias, setExibirNome]);

  const handleExibirNomeChange = (valor: 'completo' | 'guerra') => {
    if (valor === exibirNome) return;
    setExibirNome(valor);
  };

  const handleSalvarPreferencias = async () => {
    try {
      await salvarPreferencias({
        exibir_nome: exibirNome,
        padrao_quinzena: padraoQuinzena,
        turno_a_inicio: turnoAInicio,
        turno_a_fim: turnoAFim,
        turno_b_inicio: turnoBInicio,
        turno_b_fim: turnoBFim,
        limite_fdp_dia: limiteDia,
        limite_fdp_noite: limiteNoite,
        alerta_cma_ativo: alertaCmaAtivo,
        alerta_cma_dias: alertaCmaDias,
      });
      toast.success('Preferências gerais salvas');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar preferências');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-slate-800">Preferências de Exibição</h3>
        <p className="text-sm text-slate-500 mt-0.5">
          Personalize como as informações aparecem na grade de escala.
        </p>
      </div>

      <div className="border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <UserCheck className="w-4 h-4 text-slate-500" />
          <div>
            <p className="font-medium text-slate-800 text-sm">Nome dos Tripulantes</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Escolha como o nome é exibido na grade Gantt
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => handleExibirNomeChange('completo')}
            className={[
              'flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left',
              exibirNome === 'completo'
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 hover:border-slate-300',
            ].join(' ')}
          >
            <div
              className={[
                'w-4 h-4 rounded-full border-2 flex-shrink-0',
                exibirNome === 'completo' ? 'border-blue-500 bg-blue-500' : 'border-slate-300',
              ].join(' ')}
            />
            <div>
              <p className="font-medium text-slate-800 text-sm">Nome Completo</p>
              <p className="text-xs text-slate-400">Ex: João da Silva Oliveira</p>
            </div>
          </button>
          <button
            onClick={() => handleExibirNomeChange('guerra')}
            className={[
              'flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left',
              exibirNome === 'guerra'
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 hover:border-slate-300',
            ].join(' ')}
          >
            <div
              className={[
                'w-4 h-4 rounded-full border-2 flex-shrink-0',
                exibirNome === 'guerra' ? 'border-blue-500 bg-blue-500' : 'border-slate-300',
              ].join(' ')}
            />
            <div>
              <p className="font-medium text-slate-800 text-sm">Nome de Guerra</p>
              <p className="text-xs text-slate-400">Ex: SILVA — se cadastrado</p>
            </div>
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Quando "Nome de Guerra" está selecionado e o tripulante não tem nome cadastrado, o nome
          completo é exibido automaticamente.
        </p>
      </div>

      <div className="border border-slate-200 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Padrão de Quinzena
        </h4>
        <div className="flex gap-3">
          <button
            onClick={() => setPadraoQuinzena('padrao')}
            className={[
              'px-4 py-2 rounded-lg border text-sm',
              padraoQuinzena === 'padrao'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600',
            ].join(' ')}
          >
            Calendário operacional
          </button>
          <button
            onClick={() => setPadraoQuinzena('custom')}
            className={[
              'px-4 py-2 rounded-lg border text-sm',
              padraoQuinzena === 'custom'
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-slate-200 text-slate-600',
            ].join(' ')}
          >
            Personalizado
          </button>
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Turnos Padrão
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">
            Turno A
            <div className="flex items-center gap-2 mt-1">
              <input
                type="time"
                value={turnoAInicio}
                onChange={(e) => setTurnoAInicio(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
              />
              <span>às</span>
              <input
                type="time"
                value={turnoAFim}
                onChange={(e) => setTurnoAFim(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
              />
            </div>
          </label>
          <label className="text-xs text-slate-500">
            Turno B
            <div className="flex items-center gap-2 mt-1">
              <input
                type="time"
                value={turnoBInicio}
                onChange={(e) => setTurnoBInicio(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
              />
              <span>às</span>
              <input
                type="time"
                value={turnoBFim}
                onChange={(e) => setTurnoBFim(e.target.value)}
                className="border border-slate-200 rounded-lg px-2 py-1 text-sm"
              />
            </div>
          </label>
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl p-5 space-y-4">
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Limite FDP (horas)
        </h4>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            Dia
            <input
              type="number"
              value={limiteDia}
              min={1}
              max={24}
              onChange={(e) => setLimiteDia(Number(e.target.value || 0))}
              className="w-20 border border-slate-200 rounded-lg px-2 py-1"
            />
            h
          </label>
          <label className="flex items-center gap-2">
            Noite
            <input
              type="number"
              value={limiteNoite}
              min={1}
              max={24}
              onChange={(e) => setLimiteNoite(Number(e.target.value || 0))}
              className="w-20 border border-slate-200 rounded-lg px-2 py-1"
            />
            h
          </label>
        </div>
      </div>

      <div className="border border-slate-200 rounded-xl p-5 space-y-3">
        <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          Alertas CMA
        </h4>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={alertaCmaAtivo}
            onChange={(e) => setAlertaCmaAtivo(e.target.checked)}
            className="rounded border-slate-300 text-blue-600"
          />
          Alertar quando CMA vence em menos de
          <input
            type="number"
            value={alertaCmaDias}
            min={1}
            max={365}
            onChange={(e) => setAlertaCmaDias(Number(e.target.value || 0))}
            className="w-20 border border-slate-200 rounded-lg px-2 py-1"
          />
          dias
        </label>
      </div>

      <div className="flex justify-end pt-2">
        <Button onClick={() => void handleSalvarPreferencias()} loading={salvandoPreferencias}>
          Salvar Preferências
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINA PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
type Aba = 'quinzenas' | 'eventos' | 'geral' | 'templates';

export default function ConfiguracaoEscalaPage() {
  const navigate = useNavigate();
  const [aba, setAba] = useState<Aba>('quinzenas');
  const [ano, setAno] = useState(new Date().getFullYear());

  const abas: { id: Aba; label: string; Icon: LucideIcon }[] = [
    { id: 'quinzenas', label: 'Quinzenas', Icon: CalendarDays },
    { id: 'eventos', label: 'Tipos de Evento', Icon: Calendar },
    { id: 'templates', label: 'Templates', Icon: Bookmark },
    { id: 'geral', label: 'Geral', Icon: SlidersHorizontal },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Configurações de Escala"
        subtitle="Quinzenas do ano, personalização de tipos de evento e visualizações."
        actions={
          <Button
            variant="secondary"
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            onClick={() => navigate('/escalas')}
          >
            Voltar às Escalas
          </Button>
        }
      />

      {/* Tabs */}
      <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 md:grid-cols-4">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={[
              'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-center text-sm font-medium transition-all',
              aba === a.id
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700',
            ].join(' ')}
          >
            <a.Icon className="w-4 h-4" />
            {a.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {aba === 'quinzenas' && <AbaQuinzenas ano={ano} setAno={setAno} />}
        {aba === 'eventos' && <AbaTiposEvento />}
        {aba === 'templates' && <AbaTemplates />}
        {aba === 'geral' && <AbaGeral />}
      </div>
    </AppLayout>
  );
}
