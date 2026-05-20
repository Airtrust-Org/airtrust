import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, User } from 'lucide-react';

interface QualificacaoItem {
  id: number;
  data_conclusao?: string;
  data_realizacao?: string;
  data_vencimento?: string;
  qualificacao_nome?: string;
  qualificacao_codigo?: string;
  funcionario_nome?: string;
  qualificacao_status?: string;
  instrutor?: string | null;
  observacoes?: string | null;
  tipo_treinamento?: string;
}

interface Props {
  qualificacoes: QualificacaoItem[];
  onOpenQualificacao?: (qualificacao: QualificacaoItem) => void;
}

interface CalendarCell {
  date: string;
  outside: boolean;
}

function buildCalendarCells(month: string): CalendarCell[] {
  if (!/^\d{4}-\d{2}$/.test(month)) return [];

  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const lastDay = new Date(year, monthNumber, 0);
  const offset = (firstDay.getDay() + 6) % 7;
  const totalDays = lastDay.getDate();
  const cells: CalendarCell[] = [];

  const format = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  for (let index = offset; index > 0; index -= 1) {
    const date = new Date(year, monthNumber - 1, 1 - index);
    cells.push({ date: format(date), outside: true });
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthNumber - 1, day);
    cells.push({ date: format(date), outside: false });
  }

  while (cells.length % 7 !== 0 || cells.length < 35) {
    const lastDate = new Date(`${cells[cells.length - 1].date}T12:00:00`);
    lastDate.setDate(lastDate.getDate() + 1);
    cells.push({ date: format(lastDate), outside: true });
  }

  return cells;
}

function obterMesAnterior(mes: string): string {
  const [year, month] = mes.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

function obterProximoMes(mes: string): string {
  const [year, month] = mes.split('-').map(Number);
  if (month === 12) {
    return `${year + 1}-01`;
  }
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month;
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthNumber - 1, 1),
  );
}

function formatDateLabel(value?: string): string {
  if (!value) return 'Sem data';
  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function getEventoData(item: QualificacaoItem): string {
  return (item.data_realizacao || item.data_conclusao || '').slice(0, 10);
}

function getTipoBadgeClass(tipo?: string): string {
  if (tipo === 'INICIAL') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
  if (tipo === 'SEMESTRAL') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
  return 'bg-sky-50 text-sky-700 ring-1 ring-sky-200';
}

function getTipoLabel(tipo?: string): string {
  if (tipo === 'INICIAL') return 'Inicial';
  if (tipo === 'SEMESTRAL') return 'Semestral';
  return 'Periodico';
}

function sortQualificacoes(left: QualificacaoItem, right: QualificacaoItem): number {
  const leftName = `${left.qualificacao_nome || ''}${left.funcionario_nome || ''}`;
  const rightName = `${right.qualificacao_nome || ''}${right.funcionario_nome || ''}`;
  return leftName.localeCompare(rightName, 'pt-BR');
}

export function QualificacoesCalendario({ qualificacoes, onOpenQualificacao }: Props) {
  const hoje = new Date().toISOString().split('T')[0];
  const [mesReferencia, setMesReferencia] = useState(() => {
    const primeiraData = [...qualificacoes]
      .map((item) => getEventoData(item))
      .filter(Boolean)
      .sort()[0];
    return (primeiraData || hoje).slice(0, 7);
  });

  const calendarCells = useMemo(() => buildCalendarCells(mesReferencia), [mesReferencia]);

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, QualificacaoItem[]>();
    qualificacoes.forEach((item) => {
      const data = getEventoData(item);
      if (!data) return;

      const current = map.get(data) || [];
      current.push(item);
      current.sort(sortQualificacoes);
      map.set(data, current);
    });
    return map;
  }, [qualificacoes]);

  const diasSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

  return (
    <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-lg font-semibold capitalize text-slate-900">
            {formatMonthLabel(mesReferencia)}
          </p>
          <p className="text-sm text-slate-500">
            {qualificacoes.length === 0
              ? 'Sem qualificacoes planejadas para exibir.'
              : `${qualificacoes.length} qualificacao(oes) planejada(s) acompanhadas neste calendario`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMesReferencia(obterMesAnterior(mesReferencia))}
            className="rounded-xl p-2 transition hover:bg-slate-100"
            title="Mes anterior"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <button
            type="button"
            onClick={() => setMesReferencia(obterProximoMes(mesReferencia))}
            className="rounded-xl p-2 transition hover:bg-slate-100"
            title="Proximo mes"
          >
            <ChevronRight className="h-5 w-5 text-slate-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {diasSemana.map((dia) => (
          <div key={dia} className="rounded-xl bg-slate-100 px-2 py-2">
            {dia}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {calendarCells.map((cell) => {
          const eventos = eventosPorDia.get(cell.date) || [];
          const isToday = cell.date === hoje;

          return (
            <div
              key={cell.date}
              className={`min-h-[150px] rounded-2xl border p-2.5 transition ${
                cell.outside ? 'border-slate-100 bg-slate-50/70' : 'border-slate-200 bg-white'
              } ${isToday ? 'ring-2 ring-primary-200' : ''}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-sm font-semibold ${
                    isToday ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {cell.date.slice(-2)}
                </span>
                {eventos.length > 0 && (
                  <span className="text-[11px] font-medium text-slate-500">
                    {eventos.length} evento(s)
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {eventos.slice(0, 3).map((evento) => (
                  <button
                    key={evento.id}
                    type="button"
                    onClick={() => onOpenQualificacao?.(evento)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:border-primary-200 hover:bg-primary-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {evento.qualificacao_nome || 'Qualificacao planejada'}
                      </p>
                      <span
                        className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getTipoBadgeClass(
                          evento.tipo_treinamento,
                        )}`}
                      >
                        {getTipoLabel(evento.tipo_treinamento)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {evento.qualificacao_codigo || 'Sem codigo'}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <User className="h-3 w-3" />
                      <span className="truncate">
                        {evento.funcionario_nome || 'Funcionario nao informado'}
                      </span>
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                      <Clock3 className="h-3 w-3" />
                      <span>{formatDateLabel(getEventoData(evento))}</span>
                    </p>
                  </button>
                ))}

                {eventos.length > 3 && (
                  <p className="px-1 text-xs font-medium text-slate-500">
                    +{eventos.length - 3} evento(s) neste dia
                  </p>
                )}

                {eventos.length === 0 && !cell.outside && (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-xs text-slate-400">
                    Sem qualificacoes planejadas
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 border-t border-slate-200 pt-4 md:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4 text-center">
          <div className="text-2xl font-bold text-slate-900">{qualificacoes.length}</div>
          <div className="text-xs text-slate-600">Total de qualificacoes</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-center">
          <div className="text-2xl font-bold text-sky-600">
            {
              qualificacoes.filter((item) => {
                const data = getEventoData(item);
                return data > hoje;
              }).length
            }
          </div>
          <div className="text-xs text-slate-600">Futuras</div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">
            {
              qualificacoes.filter((item) => {
                const data = getEventoData(item);
                return data <= hoje;
              }).length
            }
          </div>
          <div className="text-xs text-slate-600">Atrasadas</div>
        </div>
      </div>

      {qualificacoes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          <CalendarDays className="mx-auto mb-3 h-6 w-6 text-slate-300" />
          Nenhuma qualificacao planejada encontrada para o periodo atual.
        </div>
      )}
    </div>
  );
}
