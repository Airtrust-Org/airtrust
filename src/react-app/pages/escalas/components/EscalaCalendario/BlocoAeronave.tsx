// FIX: [BUG 5] - Aircraft blocks now keep a fixed-width sticky slot column and horizontal scrollable day grid.
// FIX: [BUG 4] - Sem-aeronave rows are labeled as avulsas instead of generic operational allocations.

import { Fragment, useEffect, useMemo } from 'react';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { format, getDay, isSameMonth, isToday, parseISO } from 'date-fns';
import { cn } from '@/react-app/lib/utils';
import { useEscalaStore } from '../../hooks/useEscalaStore';
import type {
  CMAStatus,
  EscalaEvento,
  EscalaCoberturaAeronave,
  QuinzenaEscala,
} from '../../hooks/queries/useEscalasQuery';
import { SEM_AERONAVE_LABEL, SEM_AERONAVE_VALUE } from '../../alocacao-operacional-constants';
import { getFuncaoVisualToken } from '../../funcao-tokens';
import { isQ1, fmtDateShort } from '../../quinzena-tokens';
import { DayCell } from './DayCell';
import { GEOMETRY_TOKENS } from '../../constants/escala-theme';
import { CELL, Q1, Q2 } from '../../constants/escalaTokens';

const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function isEventoOperacionalVisual(evento: EscalaEvento): boolean {
  const tipo = String(evento.tipo_evento || '')
    .trim()
    .toLowerCase();
  return tipo === 'voo' || tipo === 'alocacao' || tipo === 'avulsa';
}

export interface LinhaAlocacaoGantt {
  id: string;
  funcionarioId: string;
  nome: string;
  matricula: string | null;
  nomeGuerra: string | null;
  aeronavePrefixo?: string | null;
  funcao: string;
  quinzenaId: number | null;
  dataInicio: string;
  dataFim: string;
  observacoes: string | null;
  status: string;
  isInstrutor?: boolean;
}

interface SlotFixo {
  key: string;
  quinzenaId: number;
  quinzenaLabel: string;
  funcao: 'PIC' | 'SIC';
  dataInicio: string;
  dataFim: string;
  linha: LinhaAlocacaoGantt | null;
}

interface Props {
  escala: {
    id: string;
    mes: number;
    ano: number;
    status: string;
  };
  prefixo: string;
  modelo: string | null;
  aeronaveId: number | string;
  cor: string;
  linhas: LinhaAlocacaoGantt[];
  quinzenas?: QuinzenaEscala[];
  diasDoMes: Date[];
  cobertura?: EscalaCoberturaAeronave | null;
  cmaMap?: Map<string, CMAStatus>;
  highlight?: boolean;
  eventosPorFuncData: Map<string, EscalaEvento[]>;
  eventosPorFuncDataTodos: Map<string, EscalaEvento[]>;
  onAdicionarAlocacao?: (payload: {
    aeronaveLabel: string;
    funcao: string;
    aeronaveId: number | string;
    modoGestaoAeronave?: boolean;
    modoFluxoB?: boolean;
    funcionarioInicialId?: string | null;
    quinzenaId?: number;
    dataInicioInicial?: string;
    dataFimInicial?: string;
  }) => void;
  onEditarFuncionario?: (funcionarioId: string) => void;
  onEditarAlocacao?: (alocacaoId: string) => void;
  onRemoverAlocacao?: (alocacaoId: string, nome: string) => void;
  onMoverEvento?: (eventoId: string, novaDataInicio: string, novaDataFim: string) => void;
}

function formatarIntervalos(dias: string[]) {
  if (dias.length === 0) return [] as string[];
  const sorted = [...dias].sort();
  const blocos: string[] = [];
  let inicio = sorted[0];
  let anterior = sorted[0];

  for (let index = 1; index < sorted.length; index += 1) {
    const atual = sorted[index];
    const dataAnterior = new Date(`${anterior}T00:00:00`);
    dataAnterior.setDate(dataAnterior.getDate() + 1);
    const consecutivo = dataAnterior.toISOString().slice(0, 10) === atual;

    if (!consecutivo) {
      blocos.push(
        inicio === anterior
          ? fmtDateShort(inicio)
          : `${fmtDateShort(inicio)} → ${fmtDateShort(anterior)}`,
      );
      inicio = atual;
    }

    anterior = atual;
  }

  blocos.push(
    inicio === anterior
      ? fmtDateShort(inicio)
      : `${fmtDateShort(inicio)} → ${fmtDateShort(anterior)}`,
  );
  return blocos;
}

export default function BlocoAeronave({
  escala,
  prefixo,
  modelo,
  aeronaveId,
  cor,
  linhas,
  quinzenas,
  diasDoMes,
  cobertura,
  cmaMap,
  highlight = false,
  eventosPorFuncData,
  eventosPorFuncDataTodos,
  onAdicionarAlocacao,
  onEditarFuncionario,
  onEditarAlocacao,
  onRemoverAlocacao,
  onMoverEvento,
}: Props) {
  const { abrirModal, modoEdicao, exibirNome } = useEscalaStore();
  const semAeronave = String(aeronaveId) === SEM_AERONAVE_VALUE;

  const gapsPic = (cobertura?.dias || [])
    .filter((dia) => dia.status_cobertura === 'gap_pic' || dia.status_cobertura === 'gap_total')
    .map((dia) => dia.data);
  const gapsSic = (cobertura?.dias || [])
    .filter((dia) => dia.status_cobertura === 'gap_sic' || dia.status_cobertura === 'gap_total')
    .map((dia) => dia.data);

  const dragHandlers = onMoverEvento
    ? {
        onDragStart: (event: React.DragEvent, evento: EscalaEvento) => {
          if (escala.status === 'publicada') return;
          event.dataTransfer.setData(
            'text/plain',
            JSON.stringify({ id: evento.id, inicio: evento.data_inicio, fim: evento.data_fim }),
          );
          event.dataTransfer.effectAllowed = 'move';
        },
        onDragEnd: () => undefined,
      }
    : undefined;

  const { slotsFixos, linhasExtras } = useMemo(() => {
    if (semAeronave) {
      return { slotsFixos: [] as SlotFixo[], linhasExtras: linhas };
    }

    if (!quinzenas || quinzenas.length === 0) {
      return { slotsFixos: [] as SlotFixo[], linhasExtras: linhas };
    }

    const consumidos = new Set<string>();
    const slots: SlotFixo[] = [];

    for (const q of quinzenas) {
      for (const funcao of ['PIC', 'SIC'] as const) {
        let match: LinhaAlocacaoGantt | undefined = linhas.find(
          (l) => !consumidos.has(l.id) && l.quinzenaId === q.id && l.funcao === funcao,
        );
        if (!match) {
          match = linhas.find(
            (l) =>
              !consumidos.has(l.id) &&
              l.funcao === funcao &&
              !l.quinzenaId &&
              l.dataInicio <= q.data_fim &&
              l.dataFim >= q.data_inicio,
          );
        }

        if (match) consumidos.add(match.id);

        slots.push({
          key: `q${q.numero}-${funcao}`,
          quinzenaId: q.id,
          quinzenaLabel: `Q${q.numero}`,
          funcao,
          dataInicio: q.data_inicio,
          dataFim: q.data_fim,
          linha: match || null,
        });
      }
    }

    return { slotsFixos: slots, linhasExtras: linhas.filter((l) => !consumidos.has(l.id)) };
  }, [linhas, quinzenas, semAeronave]);

  const q1Fim = quinzenas?.find((q) => q.numero === 1)?.data_fim;

  const tableMinWidth = useMemo(() => `${diasDoMes.length * 28 + 160}px`, [diasDoMes.length]);

  function getNomeExibido(linha: LinhaAlocacaoGantt | null | undefined): string {
    if (!linha) return '(Sem nome)';
    const nomeGuerra = String(linha.nomeGuerra || '').trim();
    // Sempre preferir nome de guerra (curto). Se não houver, usar primeiro nome.
    if (nomeGuerra.length >= 2) return nomeGuerra;
    if (exibirNome === 'guerra') {
      // Fallback: primeiro nome do nome completo
      return linha.nome.split(' ')[0] || linha.nome;
    }
    return linha.nome;
  }

  function renderLinhaPreenchida(
    linha: LinhaAlocacaoGantt | null | undefined,
    key: string,
    slotLabel?: string,
  ) {
    if (!linha) return null;
    const nomeExibido = getNomeExibido(linha);
    const slotToken = slotLabel && isQ1(slotLabel) ? Q1 : Q2;
    const cma = cmaMap?.get(linha.funcionarioId);
    const cmaExpirado = cma?.status === 'expirado' || cma?.status === 'sem_cma';
    const instrutorEmVoo = Boolean(linha.isInstrutor && linha.funcao !== 'INSTRUTOR');
    const resumoPeriodo = `${fmtDateShort(linha.dataInicio)} -> ${fmtDateShort(linha.dataFim)}`;
    const prefixoLinha =
      linha.aeronavePrefixo && linha.aeronavePrefixo !== prefixo ? linha.aeronavePrefixo : null;
    const rowTitle = linha.observacoes
      ? `${nomeExibido} | ${prefixoLinha || prefixo} | ${resumoPeriodo} | ${linha.observacoes}${instrutorEmVoo ? ' | Instrutor em voo' : ''}`
      : `${nomeExibido} | ${prefixoLinha || prefixo} | ${resumoPeriodo}${instrutorEmVoo ? ' | Instrutor em voo' : ''}`;
    return (
      <tr key={key} className="border-b border-slate-100">
        <td
          className={cn(
            'sticky left-0 z-10 border-r border-slate-200 align-top',
            instrutorEmVoo ? 'bg-amber-50/80 border-r-amber-200' : 'bg-white',
            CELL.labelWidth,
            CELL.labelPadding,
          )}
          title={rowTitle}
        >
          <div
            className={cn(
              'flex items-center justify-between gap-2 rounded-lg px-1.5 py-1',
              instrutorEmVoo && 'bg-amber-50',
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className={cn(
                    'truncate font-semibold text-[11px]',
                    instrutorEmVoo ? 'text-amber-950' : 'text-slate-800',
                  )}
                  title={nomeExibido}
                >
                  {nomeExibido}
                </span>
                {instrutorEmVoo && (
                  <span
                    className="inline-flex h-4 min-w-[1.15rem] shrink-0 items-center justify-center rounded-full bg-amber-500 px-1 text-[8px] font-bold leading-none text-amber-950 shadow-sm"
                    title="Instrutor em voo"
                  >
                    IN
                  </span>
                )}
                {prefixoLinha && (
                  <span className="flex-shrink-0 rounded bg-slate-100 px-1 py-px text-[9px] font-medium text-slate-500">
                    {prefixoLinha}
                  </span>
                )}
                {cma && cma.status !== 'ok' && (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center rounded px-1 py-px text-[9px] font-semibold leading-none',
                      cmaExpirado ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700',
                    )}
                    title={
                      cmaExpirado
                        ? 'CMA vencido'
                        : `CMA vencendo em ${cma.dias_restantes ?? '?'} dias`
                    }
                  >
                    {cmaExpirado ? 'CMA' : `${cma.dias_restantes ?? '?'}d`}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-1 min-w-0 whitespace-nowrap overflow-hidden text-[9px] text-slate-500">
                {slotLabel && (
                  <span
                    className={cn(
                      'inline-flex min-w-[1.75rem] items-center justify-center whitespace-nowrap rounded-full px-1 py-px text-[9px] font-semibold leading-none',
                      slotToken.pill,
                    )}
                  >
                    {slotLabel}
                  </span>
                )}
                <span
                  className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${getFuncaoVisualToken(linha.funcao).badgeClassName}`}
                >
                  {linha.funcao}
                </span>
              </div>
            </div>
            {modoEdicao && (
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {onEditarFuncionario && (
                  <button
                    type="button"
                    onClick={() => onEditarFuncionario(linha.funcionarioId)}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Editar funcionário"
                    data-export-hide="true"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                {onEditarAlocacao && (
                  <button
                    type="button"
                    onClick={() => onEditarAlocacao(linha.id)}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Editar alocação"
                    data-export-hide="true"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onRemoverAlocacao?.(linha.id, nomeExibido)}
                  className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  data-export-hide="true"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </td>

        {diasDoMes.map((dia) => {
          const diaIso = format(dia, 'yyyy-MM-dd');
          const ativo = linha.dataInicio <= diaIso && linha.dataFim >= diaIso;
          // foraQuinzena: day is outside this slot's quinzena period → show FOLGA only when no specific events exist
          const foraQuinzena = !ativo;
          const eventosOperacionais = (
            eventosPorFuncData.get(`${linha.funcionarioId}__${diaIso}`) || []
          ).filter(isEventoOperacionalVisual);
          // Apenas eventos realmente bloqueantes (férias, médico, licença, simulador, cheque)
          // têm prioridade visual sobre a alocação. Standby NÃO é bloqueante.
          const eventosTodos =
            eventosPorFuncDataTodos.get(`${linha.funcionarioId}__${diaIso}`) || [];
          const eventosBloqueantes = eventosTodos.filter((e) => {
            const tipo = String(e.tipo_evento || '')
              .trim()
              .toLowerCase();
            return [
              'ferias',
              'licenca',
              'medico',
              'treinamento_simulador',
              'treinamento_solo',
              'cheque',
            ].includes(tipo);
          });
          // Usar bloqueante como prioridade visual se existir; senão usar operacional
          const eventos = eventosBloqueantes.length > 0 ? eventosBloqueantes : eventosOperacionais;
          const eventosDoDia = eventosTodos.length > 0 ? eventosTodos : eventosOperacionais;
          // Off-quinzena → always FOLGA in this aeronave view (events from other slots are irrelevant here)
          const usarFolgaOff = foraQuinzena;
          const coberturaDia = cobertura?.dias?.find((item) => item.data === diaIso);
          const gapDoSlot =
            coberturaDia &&
            ((linha.funcao.startsWith('PIC') &&
              (coberturaDia.status_cobertura === 'gap_pic' ||
                coberturaDia.status_cobertura === 'gap_total')) ||
              (linha.funcao.startsWith('SIC') &&
                (coberturaDia.status_cobertura === 'gap_sic' ||
                  coberturaDia.status_cobertura === 'gap_total')));

          return (
            <DayCell
              key={`${linha.id}-${diaIso}`}
              date={dia}
              isBoundary={diaIso === q1Fim}
              mesReferencia={escala.mes}
              anoReferencia={escala.ano}
              ativo
              corAtivo={cor}
              isAvulsa={usarFolgaOff ? false : semAeronave}
              eventos={usarFolgaOff ? [] : eventos}
              placeholderType={usarFolgaOff ? 'FOLGA' : undefined}
              gapDoSlot={gapDoSlot}
              draggable={modoEdicao && !usarFolgaOff && eventos.length > 0}
              onDragStart={
                dragHandlers?.onDragStart && !usarFolgaOff && eventos.length > 0
                  ? (e) => dragHandlers.onDragStart!(e, eventos[0])
                  : undefined
              }
              onDragEnd={dragHandlers?.onDragEnd}
              onClick={() => {
                if (usarFolgaOff) return; // off-quinzena folga cells are not interactive
                if (eventosDoDia.length > 0) {
                  abrirModal({ tipo: 'detalhes-evento', eventoId: eventosDoDia[0].id });
                  return;
                }
                if (modoEdicao) {
                  abrirModal({
                    tipo: 'adicionar-evento',
                    escalaId: escala.id,
                    funcionarioId: linha.funcionarioId,
                    data: diaIso,
                  });
                }
              }}
              onDragOver={(event) => {
                if (!onMoverEvento) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!onMoverEvento) return;
                event.preventDefault();
                try {
                  const payload: { id: string; inicio: string; fim: string } = JSON.parse(
                    event.dataTransfer.getData('text/plain'),
                  );
                  const inicioAnterior = parseISO(payload.inicio);
                  const fimAnterior = parseISO(payload.fim);
                  const duracao = Math.max(
                    0,
                    Math.round((fimAnterior.getTime() - inicioAnterior.getTime()) / 86400000),
                  );
                  const novoFim = new Date(`${diaIso}T00:00:00`);
                  novoFim.setDate(novoFim.getDate() + duracao);
                  onMoverEvento(payload.id, diaIso, novoFim.toISOString().slice(0, 10));
                } catch {
                  return;
                }
              }}
            />
          );
        })}
      </tr>
    );
  }

  function renderSlotVazio(slot: SlotFixo) {
    const q1 = isQ1(slot.quinzenaLabel);
    const slotToken = q1 ? Q1 : Q2;
    const slotResumoPeriodo = `${fmtDateShort(slot.dataInicio)} -> ${fmtDateShort(slot.dataFim)}`;
    return (
      <tr key={slot.key} className="border-b border-dashed border-slate-200 bg-slate-50/30">
        <td
          className={cn(
            'sticky left-0 z-10 border-r border-slate-200 bg-slate-50/30 align-top',
            CELL.labelWidth,
            CELL.labelPadding,
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="truncate text-[11px] italic text-slate-400">Nao alocado</span>
              </div>
              <div
                className="mt-0.5 flex items-center gap-1 whitespace-nowrap overflow-hidden text-[9px] text-slate-500"
                title={slotResumoPeriodo}
              >
                <span
                  className={cn(
                    'inline-flex min-w-[1.75rem] items-center justify-center whitespace-nowrap rounded-full px-1 py-px text-[9px] font-semibold leading-none',
                    slotToken.pill,
                  )}
                >
                  {slot.quinzenaLabel}
                </span>
                <span
                  className={`rounded-full px-1.5 py-px text-[9px] font-semibold ${getFuncaoVisualToken(slot.funcao).badgeClassName}`}
                >
                  {slot.funcao}
                </span>
              </div>
            </div>
            {modoEdicao && (
              <button
                type="button"
                onClick={() =>
                  onAdicionarAlocacao?.({
                    aeronaveLabel: prefixo,
                    funcao: slot.funcao,
                    aeronaveId,
                    modoGestaoAeronave: true,
                    quinzenaId: slot.quinzenaId,
                  })
                }
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-500 transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                data-export-hide="true"
              >
                <Plus className="h-3 w-3" />
                {slot.funcao}
              </button>
            )}
          </div>
        </td>
        {diasDoMes.map((dia) => {
          const diaIso = format(dia, 'yyyy-MM-dd');
          const dentroQuinzena = diaIso >= slot.dataInicio && diaIso <= slot.dataFim;
          return (
            <DayCell
              key={`${slot.key}-${diaIso}`}
              date={dia}
              isBoundary={diaIso === q1Fim}
              mesReferencia={escala.mes}
              anoReferencia={escala.ano}
              ativo
              eventos={[]}
              placeholderType={dentroQuinzena ? 'ALOCACAO' : 'FOLGA'}
              placeholderOnly
              gapDoSlot={dentroQuinzena}
              onClick={() => {
                if (modoEdicao && dentroQuinzena) {
                  onAdicionarAlocacao?.({
                    aeronaveLabel: prefixo,
                    funcao: slot.funcao,
                    aeronaveId,
                    modoGestaoAeronave: true,
                    quinzenaId: slot.quinzenaId,
                  });
                }
              }}
            />
          );
        })}
      </tr>
    );
  }

  useEffect(() => {
    if (!highlight) return;
    window.setTimeout(() => {
      document.getElementById(`bloco-aeronave-${String(aeronaveId)}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 50);
  }, [aeronaveId, highlight]);

  return (
    <div
      id={`bloco-aeronave-${String(aeronaveId)}`}
      data-testid={`bloco-aeronave-${String(aeronaveId)}`}
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-all ${highlight ? 'border-sky-400 ring-2 ring-sky-100' : 'border-slate-200'}`}
    >
      {/* Cabeçalho compacto: prefixo + modelo como subtítulo */}
      <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ backgroundColor: cor }}
          />
          <div className="min-w-0 flex-1 flex items-center gap-1.5">
            <h3 className="truncate text-xs font-bold text-slate-900">
              {semAeronave ? SEM_AERONAVE_LABEL : prefixo}
            </h3>
            {!semAeronave && modelo && modelo !== prefixo && (
              <span className="text-[10px] font-medium text-slate-400">{modelo}</span>
            )}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5" data-export-hide="true">
            {!semAeronave &&
              (cobertura?.resumo.dias_cobertos ?? 0) > 0 &&
              (cobertura?.resumo.dias_cobertos ?? 0) ===
                (cobertura?.resumo.total_dias ?? diasDoMes.length) && (
                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                  ✓
                </span>
              )}
            {!semAeronave && gapsPic.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onAdicionarAlocacao?.({
                    aeronaveLabel: prefixo,
                    funcao: 'PIC',
                    aeronaveId,
                    modoGestaoAeronave: true,
                  })
                }
                className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-700 hover:bg-red-100"
                title={`PIC descoberto: ${formatarIntervalos(gapsPic).join(', ')}`}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                PIC
              </button>
            )}
            {!semAeronave && gapsSic.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  onAdicionarAlocacao?.({
                    aeronaveLabel: prefixo,
                    funcao: 'SIC',
                    aeronaveId,
                    modoGestaoAeronave: true,
                  })
                }
                className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 hover:bg-amber-100"
                title={`SIC descoberto: ${formatarIntervalos(gapsSic).join(', ')}`}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                SIC
              </button>
            )}
            {modoEdicao && (
              <button
                type="button"
                onClick={() =>
                  onAdicionarAlocacao?.({
                    aeronaveLabel: semAeronave ? SEM_AERONAVE_LABEL : prefixo,
                    funcao: 'PIC',
                    aeronaveId,
                    modoGestaoAeronave: true,
                  })
                }
                className="inline-flex items-center gap-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-primary/90"
              >
                <Plus className="h-2.5 w-2.5" />
                Alocar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="w-full overflow-x-auto overflow-y-visible">
        <table
          className="w-full table-fixed border-collapse text-xs"
          style={{ minWidth: tableMinWidth }}
        >
          <thead>
            <tr className="border-b border-slate-200 bg-white">
              <th
                className={cn(
                  'sticky left-0 z-10 border-r border-slate-200 bg-white text-left text-slate-600',
                  CELL.labelWidth,
                  CELL.labelPadding,
                )}
              >
                Slot / Tripulante
              </th>
              {diasDoMes.map((dia) => {
                const diaIso = format(dia, 'yyyy-MM-dd');
                const fimDeSemana = [0, 6].includes(getDay(dia));
                return (
                  <th
                    key={`${prefixo}-${diaIso}`}
                    data-testid={`coluna-dia-${format(dia, 'd')}`}
                    className={cn(
                      GEOMETRY_TOKENS.DAY_CELL_WIDTH,
                      'whitespace-nowrap border-r border-slate-100 px-0 py-2 text-center',
                      isToday(dia)
                        ? 'bg-sky-500 text-white'
                        : fimDeSemana
                          ? 'bg-slate-50 text-slate-500'
                          : 'text-slate-600',
                      diaIso === q1Fim && 'border-r-[3px] border-r-slate-300',
                    )}
                  >
                    <div className="text-[9px] font-medium">{DIAS_SEMANA_CURTO[getDay(dia)]}</div>
                    <div className="text-xs font-bold">{format(dia, 'd')}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slotsFixos.length > 0 ? (
              <>
                {slotsFixos.map((slot) =>
                  slot.linha
                    ? renderLinhaPreenchida(slot.linha, slot.key, slot.quinzenaLabel)
                    : renderSlotVazio(slot),
                )}
                {linhasExtras.map((linha) => renderLinhaPreenchida(linha, linha.id))}
              </>
            ) : (
              linhas.map((linha) => renderLinhaPreenchida(linha, linha.id))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
