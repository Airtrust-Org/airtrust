import PageHeader from '@/react-app/components/PageHeader';
import AppLayout from '@/react-app/components/AppLayout';
import React from 'react';
import {
  relatoriosSimuladoresApi,
  RelatorioUsoResponse,
} from '../../../services/relatoriosSimuladoresApi';
import { API_BASE_URL, ensureValidAccessToken } from '../../../config/api';

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
  URL.revokeObjectURL(url);
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
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

  const carregandoRef = React.useRef(false);

  async function carregar() {
    if (carregandoRef.current) return;

    carregandoRef.current = true;
    setLoading(true);
    setErro(null);
    try {
      if (sims.length === 0) {
        const token = await ensureValidAccessToken();
        const res = await fetch(`${API_BASE_URL}/simuladores`, {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error(`Falha ao listar simuladores (HTTP ${res.status})`);
        }
        const js: { success?: boolean; data?: Array<{ id: number; nome: string }> } =
          await res.json();
        if (js.success === false) {
          throw new Error('Falha ao listar simuladores');
        }
        setSims((js.data || []).map((s) => ({ id: s.id, nome: s.nome })));
      }

      const [rUso, rTrip, rDes] = await Promise.all([
        relatoriosSimuladoresApi.uso(filtros),
        relatoriosSimuladoresApi.tripulantes({
          data_inicio: filtros.data_inicio,
          data_fim: filtros.data_fim,
          tipo_sessao: filtros.tipo_sessao,
        }),
        relatoriosSimuladoresApi.desempenho({
          data_inicio: filtros.data_inicio,
          data_fim: filtros.data_fim,
          tipo_sessao: filtros.tipo_sessao,
        }),
      ]);
      setUso(rUso);
      setTrip(rTrip);
      setDesempenho(rDes);
    } catch (e) {
      setErro('Não foi possível carregar os dados de simuladores. Tente novamente em instantes.');
      console.error('Erro ao carregar relatórios de simuladores:', e);
    } finally {
      setLoading(false);
      carregandoRef.current = false;
    }
  }

  React.useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onChange<K extends keyof typeof filtros>(k: K, v: (typeof filtros)[K]) {
    setFiltros((prev) => ({ ...prev, [k]: v }));
  }

  const initialLoading = loading && !uso && !erro;

  return (
    <AppLayout>
      <PageHeader
        className="mb-6"
        title="Simuladores — Análises"
        subtitle="Uso e desempenho dos simuladores no período selecionado"
      />
      <div className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-12 gap-4 text-sm">
            <label className="col-span-12 space-y-1 sm:col-span-6 xl:col-span-3">
              <span>Data início</span>
              <input
                type="date"
                className="w-full rounded border px-2 py-1"
                value={filtros.data_inicio || ''}
                onChange={(e) => onChange('data_inicio', e.target.value || undefined)}
              />
            </label>
            <label className="col-span-12 space-y-1 sm:col-span-6 xl:col-span-3">
              <span>Data fim</span>
              <input
                type="date"
                className="w-full rounded border px-2 py-1"
                value={filtros.data_fim || ''}
                onChange={(e) => onChange('data_fim', e.target.value || undefined)}
              />
            </label>
            <label className="col-span-12 space-y-1 sm:col-span-6 xl:col-span-3">
              <span>Tipo de sessão</span>
              <input
                type="text"
                className="w-full rounded border px-2 py-1"
                placeholder="RECURRENT, PC, etc."
                value={filtros.tipo_sessao || ''}
                onChange={(e) => onChange('tipo_sessao', e.target.value || undefined)}
              />
            </label>
            <label className="col-span-12 space-y-1 sm:col-span-6 xl:col-span-3">
              <span>Simulador</span>
              <select
                className="w-full rounded border px-2 py-1"
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
            <div className="col-span-12 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void carregar()}
                className="rounded bg-primary px-3 py-1.5 text-white disabled:opacity-50"
                disabled={loading}
              >
                {loading ? 'Carregando…' : 'Aplicar'}
              </button>
            </div>
          </div>
        </section>

        {erro && (
          <section
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <p className="font-medium">{erro}</p>
            <button
              type="button"
              onClick={() => void carregar()}
              className="mt-2 rounded border border-red-300 px-3 py-1.5 text-xs font-medium"
            >
              Tentar novamente
            </button>
          </section>
        )}

        {initialLoading ? (
          <section
            className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm"
            aria-live="polite"
          >
            Carregando indicadores de simuladores…
          </section>
        ) : uso ? (
          <section
            className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
            aria-label="Resumo de uso dos simuladores"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Horas</span>
              <span className="text-lg font-semibold">{uso.total_horas.toFixed(1)} h</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Sessões</span>
              <span className="text-lg font-semibold">
                {(uso.por_tipo_sessao || []).reduce((a, b) => a + (b.sessoes || 0), 0)}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs uppercase tracking-wide text-gray-500">Simuladores</span>
              <span className="text-lg font-semibold">{(uso.por_simulador || []).length}</span>
            </div>
          </section>
        ) : null}

        {!initialLoading && !erro && (
          <>
            <div className="grid grid-cols-12 gap-6">
              <div className="col-span-12 overflow-hidden rounded border bg-white xl:col-span-6">
                <div className="flex items-center justify-between p-3">
                  <h2 className="text-sm font-semibold">Uso por simulador</h2>
                  <button
                    type="button"
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
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Simulador</th>
                        <th className="px-2 py-1 text-left">Tipo</th>
                        <th className="px-2 py-1 text-right">Horas</th>
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
                      {uso && uso.por_simulador.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-2 py-4 text-center text-gray-500">
                            Sem dados para o período selecionado
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="col-span-12 overflow-hidden rounded border bg-white xl:col-span-6">
                <div className="flex items-center justify-between p-3">
                  <h2 className="text-sm font-semibold">Uso por tipo de sessão</h2>
                  <button
                    type="button"
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
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-2 py-1 text-left">Tipo</th>
                        <th className="px-2 py-1 text-right">Sessões</th>
                        <th className="px-2 py-1 text-right">Horas</th>
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
                      {uso && uso.por_tipo_sessao.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-2 py-4 text-center text-gray-500">
                            Sem dados para o período selecionado
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {uso?.por_status && uso.por_status.length > 0 && (
              <section className="rounded border bg-white p-3">
                <h2 className="mb-2 text-sm font-semibold">Sessões por status</h2>
                <div className="flex flex-wrap gap-3 text-xs">
                  {uso.por_status.map((s) => (
                    <div key={s.status} className="rounded border bg-gray-100 px-3 py-1">
                      <span className="font-medium">{formatStatus(s.status)}:</span> {s.sessoes}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="overflow-hidden rounded border bg-white">
              <div className="flex items-center justify-between p-3">
                <h2 className="text-sm font-semibold">Top tripulantes por horas</h2>
                <button
                  type="button"
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left">Matrícula</th>
                      <th className="px-2 py-1 text-left">Nome</th>
                      <th className="px-2 py-1 text-left">Função</th>
                      <th className="px-2 py-1 text-right">Sessões</th>
                      <th className="px-2 py-1 text-right">Horas</th>
                      <th className="px-2 py-1 text-right">Aprovados</th>
                      <th className="px-2 py-1 text-right">Reprovados</th>
                      <th className="px-2 py-1 text-right">Faltas</th>
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
                          Sem dados para o período selecionado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded border bg-white">
              <div className="flex items-center justify-between p-3">
                <h2 className="text-sm font-semibold">Desempenho por tipo de sessão</h2>
                <button
                  type="button"
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-1 text-left">Tipo</th>
                      <th className="px-2 py-1 text-right">Sessões</th>
                      <th className="px-2 py-1 text-right">Aprovados</th>
                      <th className="px-2 py-1 text-right">Reprovados</th>
                      <th className="px-2 py-1 text-right">Aprovação %</th>
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
                          Sem dados para o período selecionado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
