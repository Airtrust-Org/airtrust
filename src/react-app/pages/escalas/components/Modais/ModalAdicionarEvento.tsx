// src/react-app/pages/escalas/components/Modais/ModalAdicionarEvento.tsx

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import { useEscalaMutations } from '../../hooks/queries/useEscalasQuery';
import { useTiposEventoResolvidos } from '../../hooks/useTiposEventoResolvidos';
import { getAccessToken } from '@/react-app/config/api';
import { apiFetch } from '@/react-app/lib/apiFetch';

interface Props {
  escalaId: string;
  funcionarioId: string;
  dataInicial?: string;
  onSaved?: () => void | Promise<void>;
  onClose: () => void;
}

const TURNOS = [
  { value: 'dia_todo', label: 'Dia todo' },
  { value: 'manha', label: 'Manhã' },
  { value: 'tarde', label: 'Tarde' },
  { value: 'noite', label: 'Noite' },
];

export default function ModalAdicionarEvento({
  escalaId,
  funcionarioId,
  dataInicial = '',
  onSaved,
  onClose,
}: Props) {
  const { configMap, tiposAtivos } = useTiposEventoResolvidos();
  const [tipoEvento, setTipoEvento] = useState<string>('VOO');
  const [dataInicio, setDataInicio] = useState(dataInicial);
  const [dataFim, setDataFim] = useState(dataInicial);
  const [turno, setTurno] = useState('dia_todo');
  const [local, setLocal] = useState('');
  const [aeronave, setAeronave] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [simuladorId, setSimuladorId] = useState('');

  // Auto-select first active type if current selection is not active
  React.useEffect(() => {
    if (tiposAtivos.length > 0 && !tiposAtivos.includes(tipoEvento)) {
      setTipoEvento(tiposAtivos[0]);
    }
  }, [tiposAtivos, tipoEvento]);

  // INT-05: Fetch simulators when type is treinamento_simulador
  const [simuladores, setSimuladores] = useState<Array<{ id: string; nome: string; tipo: string }>>(
    [],
  );
  React.useEffect(() => {
    if (tipoEvento === 'SIM') {
      const token = getAccessToken();
      apiFetch('/api/simuladores?limit=50', { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => {
          if (d.success && d.data) setSimuladores(d.data);
        })
        .catch(() => {});
    }
  }, [tipoEvento]);

  const { adicionarEvento, loading } = useEscalaMutations();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dataInicio || !dataFim) {
      toast.error('Preencha as datas');
      return;
    }
    if (dataFim < dataInicio) {
      toast.error('Data fim deve ser posterior ao início');
      return;
    }

    try {
      await adicionarEvento(escalaId, {
        funcionario_id: funcionarioId,
        tipo_evento: tipoEvento,
        data_inicio: dataInicio,
        data_fim: dataFim,
        turno,
        local: local || undefined,
        aeronave: aeronave || undefined,
        simulador_id: simuladorId || undefined,
        observacoes: observacoes || undefined,
      });
      await onSaved?.();
      toast.success('Evento adicionado!');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao adicionar evento');
    }
  }

  const confAtual = configMap[tipoEvento];
  const INP =
    'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Adicionar Evento"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            isLoading={loading}
            style={{ backgroundColor: confAtual.cor }}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
          >
            Adicionar
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo de Evento */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            Tipo de Evento *
          </label>
          <div className="grid grid-cols-4 gap-2">
            {tiposAtivos.map((tipo) => {
              const conf = configMap[tipo];
              const ativo = tipoEvento === tipo;
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setTipoEvento(tipo)}
                  className={[
                    'flex flex-col items-center gap-1 p-2 rounded-md border text-[10px] font-medium transition-all',
                    ativo
                      ? 'text-white border-transparent shadow-sm'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  ].join(' ')}
                  style={ativo ? { backgroundColor: conf.cor, borderColor: conf.cor } : undefined}
                >
                  <span>{conf.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Período */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Data Início *
            </label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                if (!dataFim || dataFim < e.target.value) setDataFim(e.target.value);
              }}
              className={INP}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Data Fim *</label>
            <input
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
              min={dataInicio}
              className={INP}
            />
          </div>
        </div>

        {/* Turno */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">Turno</label>
          <div className="flex gap-2">
            {TURNOS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTurno(t.value)}
                className={[
                  'flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                  turno === t.value
                    ? 'bg-primary text-white border-primary'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Local + Aeronave */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Local (opcional)
            </label>
            <input
              type="text"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              className={INP}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Aeronave (opcional)
            </label>
            <input
              type="text"
              value={aeronave}
              onChange={(e) => setAeronave(e.target.value)}
              className={INP}
            />
          </div>
        </div>

        {/* INT-05: Simulador selector (when type is treinamento_simulador) */}
        {tipoEvento === 'treinamento_simulador' && simuladores.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Simulador</label>
            <select
              value={simuladorId}
              onChange={(e) => setSimuladorId(e.target.value)}
              className={INP}
            >
              <option value="">— Selecionar simulador —</option>
              {simuladores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome} ({s.tipo})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Observações */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Observações (opcional)
          </label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={2}
            className={INP + ' resize-none'}
          />
        </div>
      </form>
    </Modal>
  );
}
