import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import { useEscalaStore } from '../../hooks/useEscalaStore';
import type { EscalaCoberturaTripulante } from '../../hooks/queries/useEscalasQuery';
import { getQuinzenaBadgeClasses, getQuinzenaShortLabel } from '../../quinzena-tokens';

interface Props {
  tripulantes: EscalaCoberturaTripulante[];
  onSelect: (tripulanteId: string) => void;
  onClose: () => void;
}

function getStatusPriority(status: EscalaCoberturaTripulante['status_geral']) {
  if (status === 'livre') return 0;
  if (status === 'parcial') return 1;
  return 2;
}

function getStatusDot(status: EscalaCoberturaTripulante['status_geral']) {
  if (status === 'completo') return 'bg-green-500';
  if (status === 'parcial') return 'bg-amber-400';
  return 'bg-red-500 animate-pulse';
}

function getFuncaoGrupo(tripulante: EscalaCoberturaTripulante): 'PIC' | 'SIC' {
  return tripulante.cargo === 'copiloto' ? 'SIC' : 'PIC';
}

function getModelosGrupo(tripulante: EscalaCoberturaTripulante): string[] {
  const modelos = Array.from(
    new Set(
      (tripulante.modelos_habilitados || [])
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return modelos.length > 0 ? modelos : ['Sem equipamento'];
}

export default function ModalSelecionarTripulante({ tripulantes, onSelect, onClose }: Props) {
  const { exibirNome } = useEscalaStore();
  const [busca, setBusca] = useState('');

  const itensOrdenados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return [...tripulantes]
      .filter((tripulante) => {
        if (!termo) return true;
        return [tripulante.nome, tripulante.nome_guerra || '', tripulante.matricula || '']
          .join(' ')
          .toLowerCase()
          .includes(termo);
      })
      .sort((a, b) => {
        const nomeA = exibirNome === 'guerra' && a.nome_guerra ? a.nome_guerra : a.nome;
        const nomeB = exibirNome === 'guerra' && b.nome_guerra ? b.nome_guerra : b.nome;
        return (
          getStatusPriority(a.status_geral) - getStatusPriority(b.status_geral) ||
          nomeA.localeCompare(nomeB, 'pt-BR')
        );
      });
  }, [busca, exibirNome, tripulantes]);

  const grupos = useMemo(() => {
    const gruposMap = new Map<
      string,
      {
        key: string;
        modelo: string;
        funcoes: Record<'PIC' | 'SIC', EscalaCoberturaTripulante[]>;
      }
    >();

    for (const tripulante of itensOrdenados) {
      const funcao = getFuncaoGrupo(tripulante);

      for (const modelo of getModelosGrupo(tripulante)) {
        const key = modelo;
        const grupo = gruposMap.get(key) || {
          key,
          modelo,
          funcoes: { PIC: [], SIC: [] },
        };

        grupo.funcoes[funcao].push(tripulante);
        gruposMap.set(key, grupo);
      }
    }

    return [...gruposMap.values()].sort((a, b) => a.modelo.localeCompare(b.modelo, 'pt-BR'));
  }, [itensOrdenados]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="👤 Quem você quer alocar?"
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <input
          type="text"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar tripulante..."
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        />

        <div className="max-h-[520px] space-y-3 overflow-y-auto">
          {grupos.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
              Nenhum tripulante encontrado para os filtros atuais.
            </div>
          )}

          {grupos.map((grupo) => {
            const totalTripulantes = grupo.funcoes.PIC.length + grupo.funcoes.SIC.length;

            return (
              <section
                key={grupo.key}
                className="rounded-2xl border border-slate-200 bg-slate-50/70"
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Equipamento
                    </p>
                    <p className="text-sm font-semibold text-slate-900">{grupo.modelo}</p>
                  </div>
                  <span className="text-xs text-slate-400">{totalTripulantes}</span>
                </div>

                <div className="space-y-3 p-3">
                  {(['PIC', 'SIC'] as const).map((funcao) => {
                    const tripulantesFuncao = grupo.funcoes[funcao];

                    if (tripulantesFuncao.length === 0) {
                      return null;
                    }

                    return (
                      <div key={`${grupo.key}-${funcao}`} className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${funcao === 'PIC' ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-sky-100 text-sky-700'}`}
                          >
                            {funcao}
                          </span>
                          <span className="text-xs text-slate-400">{tripulantesFuncao.length}</span>
                        </div>

                        <div className="space-y-2">
                          {tripulantesFuncao.map((tripulante) => {
                            const nome =
                              exibirNome === 'guerra' && tripulante.nome_guerra
                                ? tripulante.nome_guerra
                                : tripulante.nome;

                            return (
                              <button
                                key={`${grupo.key}-${funcao}-${tripulante.id}`}
                                type="button"
                                onClick={() => onSelect(tripulante.id)}
                                className={`flex w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left transition-colors ${tripulante.status_geral === 'livre' ? 'border-red-100 hover:bg-red-50' : 'border-transparent hover:bg-gray-50'}`}
                              >
                                <span
                                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${getStatusDot(tripulante.status_geral)}`}
                                />
                                <div className="min-w-0 flex-1 text-left">
                                  <p className="truncate text-sm font-medium text-gray-900">
                                    {nome}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {tripulante.cargo === 'comandante' ? 'CMD' : 'COP'}
                                    {tripulante.matricula ? ` · ${tripulante.matricula}` : ''}
                                  </p>
                                </div>
                                <div className="flex flex-shrink-0 items-center gap-1">
                                  <span
                                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tripulante.quinzena_numero ? getQuinzenaBadgeClasses(tripulante.quinzena_numero) : 'bg-slate-100 text-slate-500'}`}
                                  >
                                    {getQuinzenaShortLabel(tripulante.quinzena_numero) ?? 'Sem Q'}
                                  </span>
                                </div>
                                <span className="text-sm text-gray-300">›</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
