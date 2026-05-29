import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { History, Search } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import { useFrmsFadigaHistorico } from '@/react-app/hooks/useFrms';

const STATUS_OPERACIONAL_LABEL: Record<string, string> = {
  APTO: 'Prontidao normal',
  APTO_COM_RESSALVA: 'Atencao - revisar com gestor',
  INAPTO: 'Requer revisao operacional',
  NAO_APTO: 'Requer revisao imediata',
  RESTRITO: 'Requer revisao operacional',
};

function statusOperacionalLabel(value: unknown): string {
  const key = String(value ?? '').trim().toUpperCase();
  if (!key) return '-';
  return STATUS_OPERACIONAL_LABEL[key] || key;
}

function getTodayLocalKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function FrmsFadigaHistorico() {
  const navigate = useNavigate();
  const hoje = getTodayLocalKey();
  const [inicio, setInicio] = useState(`${hoje.slice(0, 8)}01`);
  const [fim, setFim] = useState(hoje);
  const [funcionarioId, setFuncionarioId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const filtros = useMemo(() => {
    const base: Record<string, string> = {
      data_inicio: inicio,
      data_fim: fim,
      limit: '200',
    };
    if (funcionarioId.trim()) base.funcionario_id = funcionarioId.trim();
    if (searchTerm.trim()) base.search = searchTerm.trim();
    return base;
  }, [fim, funcionarioId, inicio, searchTerm]);

  const { data, loading, refetch } = useFrmsFadigaHistorico(filtros);
  const baseRows = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: unknown } | null)?.data)
      ? ((data as { data?: unknown }).data as unknown[]) || []
      : Array.isArray((data as { data?: { data?: unknown } } | null)?.data?.data)
        ? ((((data as { data?: { data?: unknown } }).data?.data as unknown[]) || []) as unknown[])
        : [];

  const rows = baseRows;

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="Histórico de Check-ins"
          subtitle="Rastro completo de fadiga diária, por período e tripulante"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => navigate('/frms/fadiga-painel')}>
                Painel
              </Button>
              <Button variant="secondary" onClick={() => navigate('/frms/checkin')}>
                Novo Check-in
              </Button>
            </div>
          }
        />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="text-sm text-slate-600 md:col-span-1">
              Início
              <input
                type="date"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="text-sm text-slate-600 md:col-span-1">
              Fim
              <input
                type="date"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="text-sm text-slate-600 md:col-span-1">
              Funcionário ID
              <input
                value={funcionarioId}
                onChange={(e) => setFuncionarioId(e.target.value)}
                placeholder="Ex.: 123"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
              />
            </label>
            <label className="text-sm text-slate-600 md:col-span-1">
              Buscar nome/ID
              <div className="relative mt-1">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tripulante"
                  className="w-full rounded-xl border border-slate-200 py-2 pl-8 pr-3"
                />
              </div>
            </label>
            <div className="md:col-span-1 flex items-end">
              <Button variant="secondary" className="w-full" onClick={() => refetch()}>
                Atualizar
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <History className="h-4 w-4" />
              Registros ({rows.length})
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-slate-400">Carregando histórico...</div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              Nenhum registro encontrado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Tripulante</th>
                    <th className="px-2 py-2">KSS</th>
                    <th className="px-2 py-2">Sono</th>
                    <th className="px-2 py-2">Qualidade do sono</th>
                    <th className="px-2 py-2">Score</th>
                    <th className="px-2 py-2">Nível de alerta informado</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">FRAT</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 text-slate-700">
                      <td className="px-2 py-2">{row.data_checkin}</td>
                      <td className="px-2 py-2">
                        <Link
                          to={`/frms/tripulante/${encodeURIComponent(String(row.funcionario_id || ''))}`}
                          className="text-slate-700 hover:text-blue-700 hover:underline"
                        >
                          {row.funcionario_nome || `#${row.funcionario_id}`}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{row.kss_score}</td>
                      <td className="px-2 py-2">
                        {row.horas_sono}h
                      </td>
                      <td className="px-2 py-2">
                        {row.qualidade_sono}/5
                      </td>
                      <td className="px-2 py-2 font-semibold">{row.score_fadiga}</td>
                      <td className="px-2 py-2">{row.nivel_fadiga}</td>
                      <td className="px-2 py-2">{statusOperacionalLabel(row.status_operacional)}</td>
                      <td className="px-2 py-2">
                        {row.associado_frat_avaliacao_id ? 'Vinculado' : 'Pendente'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
