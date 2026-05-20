import { useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import { useEscalaStore } from '../../hooks/useEscalaStore';
import { getQuinzenaBadgeClasses, getQuinzenaShortLabel } from '../../quinzena-tokens';
import type {
  EscalaCoberturaTripulante,
  QuinzenaEscala,
} from '../../hooks/queries/useEscalasQuery';

interface Props {
  tripulante: EscalaCoberturaTripulante;
  quinzenas: QuinzenaEscala[];
  escalaMes: number;
  escalaAno: number;
  quinzenaNumeroInicial?: 1 | 2;
  quinzenaIdInicial?: number;
  dataInicioInicial?: string;
  dataFimInicial?: string;
  onAlocarAeronave: (payload: {
    tripulanteId: string;
    quinzenaNumero: 1 | 2;
    quinzenaId?: number;
    dataInicio: string;
    dataFim: string;
  }) => void;
  onRegistrarSituacao: (payload: {
    tripulanteId: string;
    quinzenaNumero: 1 | 2;
    quinzenaId?: number;
    dataInicio: string;
    dataFim: string;
  }) => void;
  onClose: () => void;
}

function formatarData(value: string) {
  const [ano, mes, dia] = value.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return value;
  return `${dia}/${mes}`;
}

export default function ModalAlocarTripulante({
  tripulante,
  quinzenas,
  escalaMes,
  escalaAno,
  quinzenaNumeroInicial,
  quinzenaIdInicial,
  dataInicioInicial,
  dataFimInicial,
  onAlocarAeronave,
  onRegistrarSituacao,
  onClose,
}: Props) {
  const { exibirNome } = useEscalaStore();

  const quinzenasMes = useMemo(
    () =>
      [...quinzenas]
        .filter((item) => item.mes === escalaMes && item.ano === escalaAno)
        .sort((a, b) => a.numero - b.numero),
    [escalaAno, escalaMes, quinzenas],
  );

  const quinzenaNumero = useMemo(() => {
    if (quinzenaNumeroInicial) return quinzenaNumeroInicial;

    if (quinzenaIdInicial) {
      const quinzenaPorId = quinzenasMes.find((item) => item.id === quinzenaIdInicial);
      if (quinzenaPorId?.numero === 1 || quinzenaPorId?.numero === 2) {
        return quinzenaPorId.numero;
      }
    }

    if (dataInicioInicial && dataFimInicial) {
      const quinzenaPorPeriodo = quinzenasMes.find(
        (item) => !(dataFimInicial < item.data_inicio || dataInicioInicial > item.data_fim),
      );
      if (quinzenaPorPeriodo?.numero === 1 || quinzenaPorPeriodo?.numero === 2) {
        return quinzenaPorPeriodo.numero;
      }
    }

    return tripulante.quinzena_numero;
  }, [
    dataFimInicial,
    dataInicioInicial,
    quinzenaIdInicial,
    quinzenaNumeroInicial,
    quinzenasMes,
    tripulante.quinzena_numero,
  ]);

  const quinzenaSelecionada = useMemo(() => {
    if (quinzenaIdInicial) {
      const quinzenaPorId = quinzenasMes.find((item) => item.id === quinzenaIdInicial) || null;
      if (quinzenaPorId) return quinzenaPorId;
    }

    if (!quinzenaNumero) return null;
    return quinzenasMes.find((item) => item.numero === quinzenaNumero) || null;
  }, [quinzenaIdInicial, quinzenaNumero, quinzenasMes]);

  const dataInicio = dataInicioInicial || quinzenaSelecionada?.data_inicio || '';
  const dataFim = dataFimInicial || quinzenaSelecionada?.data_fim || '';
  const podeProsseguir = Boolean(quinzenaNumero && quinzenaSelecionada && dataInicio && dataFim);
  const periodoOrigemNaFolgaOposta =
    quinzenaNumero != null &&
    tripulante.quinzena_numero != null &&
    quinzenaNumero !== tripulante.quinzena_numero;
  const nome =
    exibirNome === 'guerra' && tripulante.nome_guerra ? tripulante.nome_guerra : tripulante.nome;

  const payloadBase = {
    tripulanteId: tripulante.id,
    quinzenaNumero: quinzenaNumero || 1,
    quinzenaId: quinzenaSelecionada?.id,
    dataInicio,
    dataFim,
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="👤 Alocar Tripulante"
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">{nome}</p>
          <p className="mt-1 text-xs text-slate-500">
            {tripulante.cargo === 'comandante' ? 'CMD' : 'COP'}
            {tripulante.matricula ? ` · ${tripulante.matricula}` : ''}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${quinzenaNumero ? getQuinzenaBadgeClasses(quinzenaNumero, true) : 'bg-slate-200 text-slate-600'}`}
            >
              {getQuinzenaShortLabel(quinzenaNumero) ?? 'Sem quinzena'}
            </span>
            <span className="text-xs text-slate-500">
              {periodoOrigemNaFolgaOposta
                ? 'Período iniciado a partir da folga da quinzena oposta'
                : 'Quinzena fixa no cadastro do tripulante'}
            </span>
          </div>
          {dataInicio && dataFim ? (
            <p className="mt-3 text-xs text-slate-500">
              {quinzenaNumero}ª quinzena · {formatarData(dataInicio)} → {formatarData(dataFim)}
            </p>
          ) : (
            <p className="mt-3 text-xs text-amber-700">
              Defina a quinzena no cadastro do funcionário para permitir novas alocações.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            O que fazer com este tripulante?
          </p>
          <div className="space-y-3">
            <button
              type="button"
              disabled={!podeProsseguir}
              onClick={() => onAlocarAeronave(payloadBase)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
            >
              <div className="text-sm font-semibold text-slate-900">🚁 Alocar em Aeronave</div>
              <div className="mt-1 text-xs text-slate-500">
                Designar para PIC ou SIC em uma aeronave da frota.
              </div>
            </button>

            <button
              type="button"
              disabled={!podeProsseguir}
              onClick={() => onRegistrarSituacao(payloadBase)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-4 text-left transition-colors hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:bg-white"
            >
              <div className="text-sm font-semibold text-slate-900">📋 Registrar Situação</div>
              <div className="mt-1 text-xs text-slate-500">
                Férias, simulador, curso, médico, afastamento ou standby.
              </div>
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
