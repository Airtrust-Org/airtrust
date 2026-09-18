import { useState } from 'react';
import { Clock3, Plane, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import Card, { CardContent, CardHeader } from '@/react-app/components/Card';
import Button from '@/react-app/components/Button';
import { usePilotLogbook } from '@/react-app/hooks/useControleVoos';

function minutesToHoursDisplay(value: number): string {
  const total = Math.max(0, Number(value || 0));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

function formatDate(value: string): string {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export default function PilotFlightHistory() {
  const [page, setPage] = useState(1);
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const query = usePilotLogbook({
    page,
    limit: 20,
    data_inicio: dataInicio || undefined,
    data_fim: dataFim || undefined,
  });
  const data = query.data;
  const totals = data?.totals;

  const cards = [
    ['TOTAL', totals?.total_min ?? 0],
    ['PIC', totals?.pic_min ?? 0],
    ['SIC', totals?.sic_min ?? 0],
    ['NOTURNA', totals?.noturna_min ?? 0],
    ['IFR', totals?.instrumento_min ?? 0],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-200">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Uma única fonte para o voo realizado</p>
            <p className="mt-1 text-xs leading-5">
              Este histórico é montado automaticamente a partir dos voos com lançamento finalizado e
              aprovado pela Coordenação. Não existe lançamento manual paralelo para o piloto.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map(([label, value]) => (
          <Card key={label} className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-1 font-mono text-xl font-semibold text-slate-900 dark:text-slate-100">
                {minutesToHoursDisplay(value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {totals?.saldo_referencia && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Os totais incluem o saldo histórico registrado até {formatDate(totals.saldo_referencia)};
          depois dessa data, somente voos finalizados no Controle de Voos são somados.
        </p>
      )}

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Plane className="h-5 w-5 text-blue-600" /> Voos confirmados
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Horas de voo, noturno e IFR vêm das pernas registradas no voo e confirmadas pela
                Coordenação.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="text-xs text-slate-500">
                De
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(event) => {
                    setDataInicio(event.target.value);
                    setPage(1);
                  }}
                  className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
              <label className="text-xs text-slate-500">
                Até
                <input
                  type="date"
                  value={dataFim}
                  onChange={(event) => {
                    setDataFim(event.target.value);
                    setPage(1);
                  }}
                  className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading && (
            <p className="py-8 text-center text-sm text-slate-500">Carregando histórico…</p>
          )}
          {query.error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Não foi possível carregar o histórico de voo.
            </p>
          )}
          {!query.isLoading && !query.error && (data?.entries.length ?? 0) === 0 && (
            <div className="py-10 text-center">
              <Clock3 className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-500">
                Nenhum voo finalizado pela Coordenação neste período.
              </p>
            </div>
          )}
          {(data?.entries.length ?? 0) > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-2 pr-3">Data</th>
                    <th className="pr-3">Aeronave</th>
                    <th className="pr-3">Rota</th>
                    <th className="pr-3">Função</th>
                    <th className="pr-3">Voo</th>
                    <th className="pr-3">Noturno</th>
                    <th className="pr-3">IFR</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data?.entries.map((entry) => (
                    <tr key={`${entry.rdv_id}-${entry.funcao}`}>
                      <td className="py-3 pr-3">{formatDate(entry.data_voo)}</td>
                      <td className="pr-3">
                        <span className="font-medium">{entry.prefixo}</span>
                        {entry.modelo_aeronave && (
                          <span className="block text-xs text-slate-500">
                            {entry.modelo_aeronave}
                          </span>
                        )}
                      </td>
                      <td className="pr-3 text-xs">{entry.rota.join(' → ') || '—'}</td>
                      <td className="pr-3 font-semibold">{entry.funcao}</td>
                      <td className="pr-3 font-mono">
                        {minutesToHoursDisplay(entry.tempo_voo_min)}
                      </td>
                      <td className="pr-3 font-mono">
                        {minutesToHoursDisplay(entry.tempo_noturno_min)}
                      </td>
                      <td className="pr-3 font-mono">
                        {minutesToHoursDisplay(entry.tempo_ifr_min)}
                      </td>
                      <td className="text-right">
                        <Link
                          to={`/controle-voos/rdv/${entry.voo_id}`}
                          className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Ver voo
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-500">{data?.meta.total ?? 0} voo(s)</span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-slate-500">
                Página {page} de {Math.max(1, data?.meta.total_pages ?? 1)}
              </span>
              <Button
                variant="secondary"
                disabled={page >= (data?.meta.total_pages || 1)}
                onClick={() => setPage((value) => value + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        Pousos ainda não são creditados automaticamente ao logbook individual porque o lançamento
        atual registra os pousos do voo, mas não identifica qual piloto executou cada pouso. O
        AirTrust não atribui esse crédito por suposição.
      </p>
    </div>
  );
}
