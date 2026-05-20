import { format, getDay, isToday } from 'date-fns';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/react-app/lib/utils';
import { useEscalaStore } from '../../hooks/useEscalaStore';
import type { EscalaAlocacao } from '../../hooks/queries/useEscalasQuery';
import { getQuinzenaBadgeClasses, getQuinzenaShortLabel } from '../../quinzena-tokens';
import { getFuncaoVisualToken } from '../../funcao-tokens';
import { DayCell } from './DayCell';
import { GEOMETRY_TOKENS } from '../../constants/escala-theme';
import { CELL } from '../../constants/escalaTokens';

const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

function formatarDataCurta(value: string) {
  const [ano, mes, dia] = value.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return value;
  return `${dia}/${mes}/${ano}`;
}

function inferirQuinzenasSituacao(
  dataInicio: string,
  dataFim: string,
  q1Fim?: string,
): Array<1 | 2> {
  if (!q1Fim) {
    const inicioDia = Number(dataInicio.slice(8, 10));
    const fimDia = Number(dataFim.slice(8, 10));
    if (fimDia <= 16) return [1];
    if (inicioDia >= 17) return [2];
    return [1, 2];
  }

  if (dataFim <= q1Fim) return [1];
  if (dataInicio > q1Fim) return [2];
  return [1, 2];
}

function mapSituacaoPlaceholderType(situacao: EscalaAlocacao) {
  switch (situacao.situacao_tipo) {
    case 'FOLGA':
      return 'FOLGA' as const;
    case 'FERIAS':
      return 'FERIAS' as const;
    case 'SIM':
      return 'SIMULADOR' as const;
    case 'CURSO':
      return 'CURSO' as const;
    case 'MED':
      return 'EXAME_MEDICO' as const;
    case 'STB':
      return 'STANDBY' as const;
    default:
      return 'LICENCA' as const;
  }
}

function inferirFuncaoBadge(
  value: string | null | undefined,
): { token: 'PIC' | 'SIC'; label: 'CMD' | 'COP' } | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (!normalized) return null;
  if (normalized.startsWith('PIC') || normalized.includes('COMAND')) {
    return { token: 'PIC', label: 'CMD' };
  }
  if (normalized.startsWith('SIC') || normalized.includes('COP')) {
    return { token: 'SIC', label: 'COP' };
  }

  return null;
}

function getSituacaoPrioridade(situacao: EscalaAlocacao): number {
  switch (situacao.situacao_tipo) {
    case 'FERIAS':
      return 0;
    case 'SIM':
    case 'CURSO':
    case 'MED':
    case 'AFT':
      return 1;
    case 'FOLGA':
      return 2;
    case 'STB':
      return 3;
    default:
      return 4;
  }
}

function escolherMelhorSituacao(atual: EscalaAlocacao, candidata: EscalaAlocacao): EscalaAlocacao {
  const prioridadeAtual = getSituacaoPrioridade(atual);
  const prioridadeCandidata = getSituacaoPrioridade(candidata);

  if (prioridadeCandidata !== prioridadeAtual) {
    return prioridadeCandidata < prioridadeAtual ? candidata : atual;
  }

  const atualTemQuinzena = atual.quinzena_id != null;
  const candidataTemQuinzena = candidata.quinzena_id != null;
  if (atualTemQuinzena !== candidataTemQuinzena) {
    return candidataTemQuinzena ? candidata : atual;
  }

  const atualManual = !(atual.auto_gerado === 1 || atual.auto_gerado === true);
  const candidataManual = !(candidata.auto_gerado === 1 || candidata.auto_gerado === true);
  if (atualManual !== candidataManual) {
    return candidataManual ? candidata : atual;
  }

  return candidata.updated_at > atual.updated_at ? candidata : atual;
}

export interface LinhaSituacaoTripulante {
  funcionarioId: string;
  nome: string;
  nomeGuerra: string | null;
  matricula: string | null;
  funcao: string | null;
  modelo: string | null;
  quinzenaPreferencial: 1 | 2 | null;
  situacoes: EscalaAlocacao[];
  situacaoReferencia: EscalaAlocacao | null;
  situacoesVisiveis: EscalaAlocacao[];
}

interface Props {
  q1Fim?: string;
  tripulante: LinhaSituacaoTripulante;
  diasDoMes: Date[];
  mesReferencia: number;
  anoReferencia: number;
  onEditarSituacao?: (situacaoId: string) => void;
  onRegistrarSituacao?: () => void;
  onRemover?: () => void;
}

export default function LinhaSituacao({
  tripulante,
  diasDoMes,
  mesReferencia,
  anoReferencia,
  onEditarSituacao,
  onRegistrarSituacao,
  onRemover,
  q1Fim,
}: Props) {
  const { exibirNome, modoEdicao } = useEscalaStore();
  const nomeExibido =
    exibirNome === 'guerra' && tripulante.nomeGuerra ? tripulante.nomeGuerra : tripulante.nome;
  const funcaoBadge = inferirFuncaoBadge(
    tripulante.funcao ||
      tripulante.situacaoReferencia?.funcao ||
      tripulante.situacaoReferencia?.funcionario_role,
  );
  const legendas = Array.from(
    new Set(
      tripulante.situacoesVisiveis.map(
        (situacao) => situacao.situacao_nome || situacao.situacao_tipo || 'Situação',
      ),
    ),
  );
  const titleLinha = [
    nomeExibido,
    legendas.join(' / ') || 'Sem situação registrada',
    ...tripulante.situacoesVisiveis.map(
      (situacao) =>
        `${situacao.situacao_nome || situacao.situacao_tipo || 'Situação'}: ${formatarDataCurta(situacao.data_inicio)} → ${formatarDataCurta(situacao.data_fim)}`,
    ),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <tr className="group border-b border-slate-100 last:border-b-0">
      <td
        className={cn(
          'sticky left-0 z-10 border-r border-slate-200 bg-white align-top',
          CELL.labelWidth,
          CELL.labelPadding,
        )}
        title={titleLinha}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-800">{nomeExibido}</p>
            <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap">
              {tripulante.quinzenaPreferencial != null && (
                <span
                  key={`${tripulante.funcionarioId}-q-${tripulante.quinzenaPreferencial}`}
                  className={cn(
                    'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-semibold leading-none',
                    getQuinzenaBadgeClasses(tripulante.quinzenaPreferencial),
                  )}
                >
                  {getQuinzenaShortLabel(tripulante.quinzenaPreferencial)}
                </span>
              )}
              {funcaoBadge && (
                <span
                  className={`rounded px-1 py-px text-[9px] font-semibold ${getFuncaoVisualToken(funcaoBadge.token).badgeClassName}`}
                >
                  {funcaoBadge.label}
                </span>
              )}
              {tripulante.modelo && (
                <span className="rounded bg-slate-100 px-1 py-px text-[9px] font-mono text-slate-500">
                  {tripulante.modelo}
                </span>
              )}
            </div>
            {tripulante.situacoesVisiveis.length === 0 && (
              <p className="mt-1 text-[11px] text-slate-400">Sem situação registrada no período</p>
            )}
          </div>

          {modoEdicao && (
            <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {tripulante.situacaoReferencia && onEditarSituacao && (
                <button
                  type="button"
                  onClick={() => onEditarSituacao(tripulante.situacaoReferencia!.id)}
                  title="Editar situação"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  data-export-hide="true"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
              {onRegistrarSituacao && (
                <button
                  type="button"
                  onClick={onRegistrarSituacao}
                  title="Registrar nova situação"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  data-export-hide="true"
                >
                  <Plus className="h-4 w-4" />
                </button>
              )}
              {onRemover && (
                <button
                  type="button"
                  onClick={onRemover}
                  title="Remover situação"
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  data-export-hide="true"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </td>

      {diasDoMes.map((dia) => {
        const diaIso = format(dia, 'yyyy-MM-dd');
        const situacaoAtiva = tripulante.situacoesVisiveis.reduce<EscalaAlocacao | null>(
          (melhor, atual) => {
            const ativaNoDia = atual.data_inicio <= diaIso && atual.data_fim >= diaIso;
            if (!ativaNoDia) return melhor;
            if (!melhor) return atual;
            return escolherMelhorSituacao(melhor, atual);
          },
          null,
        );
        const legenda = situacaoAtiva?.situacao_nome || situacaoAtiva?.situacao_tipo || 'Situação';
        return (
          <DayCell
            key={`${tripulante.funcionarioId}-${diaIso}`}
            date={dia}
            isBoundary={diaIso === q1Fim}
            mesReferencia={mesReferencia}
            anoReferencia={anoReferencia}
            ativo={!!situacaoAtiva}
            corAtivo={situacaoAtiva?.situacao_cor || '#6b7280'}
            eventos={[]}
            placeholderType={situacaoAtiva ? mapSituacaoPlaceholderType(situacaoAtiva) : undefined}
            placeholderLabel={situacaoAtiva ? legenda : undefined}
            placeholderExtra={nomeExibido}
            onClick={
              situacaoAtiva && onEditarSituacao
                ? () => onEditarSituacao(situacaoAtiva.id)
                : undefined
            }
          />
        );
      })}
    </tr>
  );
}

export function CabecalhoDiasSituacao({ diasDoMes, q1Fim }: { diasDoMes: Date[]; q1Fim?: string }) {
  return (
    <tr className="border-b border-slate-200 bg-white">
      <th
        className={cn(
          'sticky left-0 z-10 border-r border-slate-200 bg-white text-left text-slate-600',
          CELL.labelWidth,
          CELL.labelPadding,
        )}
      >
        Tripulante
      </th>
      {diasDoMes.map((dia) => {
        const diaIso = format(dia, 'yyyy-MM-dd');
        const fimDeSemana = [0, 6].includes(getDay(dia));
        return (
          <th
            key={`situacao-header-${diaIso}`}
            className={`${GEOMETRY_TOKENS.DAY_CELL_WIDTH} border-r border-slate-100 px-0 py-2 text-center ${isToday(dia) ? 'bg-sky-500 text-white' : fimDeSemana ? 'bg-slate-50 text-slate-500' : 'text-slate-600'}`}
          >
            <div className="text-[9px] font-medium">{DIAS_SEMANA_CURTO[getDay(dia)]}</div>
            <div className="text-xs font-bold">{format(dia, 'd')}</div>
          </th>
        );
      })}
    </tr>
  );
}
