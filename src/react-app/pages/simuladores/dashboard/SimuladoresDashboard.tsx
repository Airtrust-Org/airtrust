import PageHeader from '@/react-app/components/PageHeader';
import AppLayout from '@/react-app/components/AppLayout';
import React from 'react';
import {
  relatoriosSimuladoresApi,
  RelatorioUsoResponse,
} from '../../../services/relatoriosSimuladoresApi';
import { API_BASE_URL } from '../../../config/api';

import { ChartColumn } from 'lucide-react';

type SimuladorLite = { id: number; nome: string };

function exportCSV(filename: string, rows: Array<Record<string, unknown>>) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(';'),
    ...rows.map((r) => headers.map((h) => String(r[h] ?? '')).join(';')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function getAuthHeaders(): Record<string, string> {
  const tokenKeys = [
    'airtrust_token',
    'token',
    'auth_token',
    'accessToken',
    'access_token',
    'airtrust_access_token',
  ];
  let token: string | null = null;
  for (const k of tokenKeys) {
    const v = localStorage.getItem(k);
    if (v) {
      token = v;
      break;
    }
  }
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export default function SimuladoresDashboard() {
  const [filtros, setFiltros] = React.useState<{
    data_inicio?: string;
    data_fim?: string;
    tipo_sessao?: string;
    simulador_id?: number;
  }>({});
  const [loading, setLoading] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [uso, setUso] = React.useState<RelatorioUsoResponse | null>(null);
  const [trip, setTrip] = React.useState<
    Array<{
      funcionario_id: number;
      nome: string;
      matricula: string;
      funcao: string;
      sessoes_totais: number;
      horas: number;
      aprovados: number;
      reprovados: number;
      faltas: number;
    }>
  >([]);
  const [sims, setSims] = React.useState<SimuladorLite[]>([]);
  const [desempenho, setDesempenho] = React.useState<
    Array<{
      tipo_sessao: string;
      sessoes: number;
      aprovados: number;
      reprovados: number;
      aprovacao_percent: number;
    }>
  >([]);

  // Prevenir múltiplas chamadas simultâneas
  const carregandoRef = React.useRef(false);

  async function carregar() {
    // Se já está carregando, não fazer nada
    if (carregandoRef.current) {
      return;
    }

    carregandoRef.current = true;
    setLoading(true);
    setErro(null);
    try {
      // listar simuladores (para filtros)
      if (sims.length === 0) {
        const res = await fetch(`${API_BASE_URL}/simuladores`, {
          headers: getAuthHeaders(),
          credentials: 'include',
        });
        const js: { success?: boolean; data?: Array<{ id: number; nome: string }> } =
          await res.json();
        setSims((js.data || []).map((s) => ({ id: s.id, nome: s.nome })));
      }
      const rUso = await relatoriosSimuladoresApi.uso(filtros);
      const rTrip = await relatoriosSimuladoresApi.tripulantes({
        data_inicio: filtros.data_inicio,
        data_fim: filtros.data_fim,
        tipo_sessao: filtros.tipo_sessao,
      });
      const rDes = await relatoriosSimuladoresApi.desempenho({
        data_inicio: filtros.data_inicio,
        data_fim: filtros.data_fim,
        tipo_sessao: filtros.tipo_sessao,
      });
      setUso(rUso);
      setTrip(rTrip);
      setDesempenho(rDes);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha nos relatórios');
      console.error('Erro ao carregar relatórios:', e);
    } finally {
      setLoading(false);
      carregandoRef.current = false;
    }
  }

  React.useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange<K extends keyof typeof filtros>(k: K, v: (typeof filtros)[K]) {
    setFiltros((prev) => ({ ...prev, [k]: v }));
  }

  return (
    <AppLayout>
      <PageHeader
        className="mb-6"
        title="Dashboard de Simuladores"
        subtitle="Análise de uso e desempenho dos simuladores"
      />
      <div className="space-y-4">
        {/* Filtros */}
        <div className="grid grid-cols-12 gap-4 text-sm">
          <label className="col-span-3 space-y-1">
            <span>Data início</span>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={filtros.data_inicio || ''}
              onChange={(e) => onChange('data_inicio', e.target.value || undefined)}
            />
          </label>
          <label className="col-span-3 space-y-1">
            <span>Data fim</span>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={filtros.data_fim || ''}
              onChange={(e) => onChange('data_fim', e.target.value || undefined)}
            />
          </label>
          <label className="col-span-3 space-y-1">
            <span>Tipo de sessão</span>
            <input
              type="text"
              className="w-full border rounded px-2 py-1"
              placeholder="RECURRENT, PC, etc."
              value={filtros.tipo_sessao || ''}
              onChange={(e) => onChange('tipo_sessao', e.target.value || undefined)}
            />
          </label>
          <label className="col-span-3 space-y-1">
            <span>Simulador</span>
            <select
              className="w-full border rounded px-2 py-1"
              value={filtros.simulador_id || ''}
              onChange={(e) =>
                onChange('simulador_id', e.target.value ? Number(e.target.value) : undefined)
              }
            >
              <option value="">Todos</option>
              {sims.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
          <div className="col-span-12 flex gap-2 justify-end">
            <button
              onClick={carregar}
              className="px-3 py-1.5 rounded bg-primary text-white disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Carregando...' : 'Aplicar'}
            </button>
          </div>
        </div>

        {erro && <div className="text-sm text-red-600">{erro}</div>}

        {/* Cards resumo */}
        {uso && (
          <div className="grid grid-cols-12 gap-4">
            <a
              href="/simuladores?tab=sessoes"
              className="col-span-4 p-4 bg-white rounded border hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer"
            >
              <div className="text-xs text-gray-500">Horas totais no período</div>
              <div className="text-2xl font-bold">{uso.total_horas.toFixed(1)} h</div>
            </a>
            <a
              href="/simuladores?tab=sessoes"
              className="col-span-4 p-4 bg-white rounded border hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer"
            >
              <div className="text-xs text-gray-500">Sessões</div>
              <div className="text-2xl font-bold">
                {(uso.por_tipo_sessao || []).reduce((a, b) => a + (b.sessoes || 0), 0)}
              </div>
            </a>
            <a
              href="/simuladores?tab=sessoes"
              className="col-span-4 p-4 bg-white rounded border hover:bg-blue-50 hover:border-blue-300 transition-all cursor-pointer"
            >
              <div className="text-xs text-gray-500">Simuladores utilizados</div>
              <div className="text-2xl font-bold">{(uso.por_simulador || []).length}</div>
            </a>
          </div>
        )}

        {/* Tabelas */}
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-6 bg-white border rounded">
            <div className="p-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Uso por simulador</h2>
              <button
                className="text-xs text-blue-600"
                onClick={() =>
                  uso &&
                  exportCSV(
                    `simuladores-uso-${Date.now()}.csv`,
                    uso.por_simulador as unknown as Array<Record<string, unknown>>,
                  )
                }
              >
                Exportar CSV
              </button>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1">Simulador</th>
                  <th className="text-left px-2 py-1">Tipo</th>
                  <th className="text-right px-2 py-1">Horas</th>
                </tr>
              </thead>
              <tbody>
                {(uso?.por_simulador || []).map((r) => (
                  <tr key={r.simulador_id} className="border-t">
                    <td className="px-2 py-1">{r.codigo}</td>
                    <td className="px-2 py-1">{r.tipo_aeronave || '—'}</td>
                    <td className="px-2 py-1 text-right">{r.horas?.toFixed(1)}</td>
                  </tr>
                ))}
                {(!uso || uso.por_simulador.length === 0) && (
                  <tr>
                    <td colSpan={3} className="px-2 py-4 text-center text-gray-500">
                      Sem dados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="col-span-6 bg-white border rounded">
            <div className="p-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Uso por tipo de sessão</h2>
              <button
                className="text-xs text-blue-600"
                onClick={() =>
                  uso &&
                  exportCSV(
                    `simuladores-tipos-${Date.now()}.csv`,
                    uso.por_tipo_sessao as unknown as Array<Record<string, unknown>>,
                  )
                }
              >
                Exportar CSV
              </button>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1">Tipo</th>
                  <th className="text-right px-2 py-1">Sessões</th>
                  <th className="text-right px-2 py-1">Horas</th>
                </tr>
              </thead>
              <tbody>
                {(uso?.por_tipo_sessao || []).map((r) => (
                  <tr key={r.tipo_sessao} className="border-t">
                    <td className="px-2 py-1">{r.tipo_sessao}</td>
                    <td className="px-2 py-1 text-right">{r.sessoes}</td>
                    <td className="px-2 py-1 text-right">{r.horas?.toFixed(1)}</td>
                  </tr>
                ))}
                {(!uso || uso.por_tipo_sessao.length === 0) && (
                  <tr>
                    <td colSpan={3} className="px-2 py-4 text-center text-gray-500">
                      Sem dados
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border rounded">
          {uso?.por_status && uso.por_status.length > 0 && (
            <div className="p-3">
              <h2 className="text-sm font-semibold mb-2">Sessões por status</h2>
              <div className="flex flex-wrap gap-3 text-xs">
                {uso.por_status.map((s) => (
                  <div key={s.status} className="px-3 py-1 rounded bg-gray-100 border">
                    <span className="font-medium">{s.status}:</span> {s.sessoes}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white border rounded">
          <div className="p-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Top tripulantes por horas</h2>
            <button
              className="text-xs text-blue-600"
              onClick={() =>
                exportCSV(
                  `simuladores-tripulantes-${Date.now()}.csv`,
                  trip as unknown as Array<Record<string, unknown>>,
                )
              }
            >
              Exportar CSV
            </button>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-2 py-1">Matrícula</th>
                <th className="text-left px-2 py-1">Nome</th>
                <th className="text-left px-2 py-1">Função</th>
                <th className="text-right px-2 py-1">Sessões</th>
                <th className="text-right px-2 py-1">Horas</th>
                <th className="text-right px-2 py-1">Aprovados</th>
                <th className="text-right px-2 py-1">Reprovados</th>
                <th className="text-right px-2 py-1">Faltas</th>
              </tr>
            </thead>
            <tbody>
              {trip.map((t) => (
                <tr key={t.funcionario_id} className="border-t">
                  <td className="px-2 py-1">{t.matricula}</td>
                  <td className="px-2 py-1">{t.nome}</td>
                  <td className="px-2 py-1">{t.funcao || '—'}</td>
                  <td className="px-2 py-1 text-right">{t.sessoes_totais}</td>
                  <td className="px-2 py-1 text-right">{Number(t.horas || 0).toFixed(1)}</td>
                  <td className="px-2 py-1 text-right">{t.aprovados}</td>
                  <td className="px-2 py-1 text-right">{t.reprovados}</td>
                  <td className="px-2 py-1 text-right">{t.faltas}</td>
                </tr>
              ))}
              {trip.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-center text-gray-500">
                    Sem dados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white border rounded">
          <div className="p-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Desempenho por tipo de sessão</h2>
            <button
              className="text-xs text-blue-600"
              onClick={() =>
                exportCSV(
                  `simuladores-desempenho-${Date.now()}.csv`,
                  desempenho as unknown as Array<Record<string, unknown>>,
                )
              }
            >
              Exportar CSV
            </button>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-2 py-1">Tipo</th>
                <th className="text-right px-2 py-1">Sessões</th>
                <th className="text-right px-2 py-1">Aprovados</th>
                <th className="text-right px-2 py-1">Reprovados</th>
                <th className="text-right px-2 py-1">Aprovação %</th>
              </tr>
            </thead>
            <tbody>
              {desempenho.map((d) => (
                <tr key={d.tipo_sessao} className="border-t">
                  <td className="px-2 py-1">{d.tipo_sessao}</td>
                  <td className="px-2 py-1 text-right">{d.sessoes}</td>
                  <td className="px-2 py-1 text-right">{d.aprovados}</td>
                  <td className="px-2 py-1 text-right">{d.reprovados}</td>
                  <td className="px-2 py-1 text-right">{d.aprovacao_percent.toFixed(1)}%</td>
                </tr>
              ))}
              {desempenho.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-gray-500">
                    Sem dados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
