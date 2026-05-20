// src/react-app/pages/escalas/components/Modais/ModalCriarEscala.tsx

import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/react-app/components/UI';
import { useEscalaMutations } from '../../hooks/queries/useEscalasQuery';

interface Props {
  onClose: () => void;
  onSuccess?: () => void;
}

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const INPUT_CLASS =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary';

export default function ModalCriarEscala({ onClose, onSuccess }: Props) {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [titulo, setTitulo] = useState('');
  const [observacoes, setObservacoes] = useState('');

  const { criarEscala, loading } = useEscalaMutations();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await criarEscala({
        mes,
        ano,
        titulo: titulo || `Escala ${mes}/${ano}`,
        observacoes: observacoes || undefined,
      });
      toast.success('Escala criada com sucesso!');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar escala');
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Nova Escala"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            isLoading={loading}
            onClick={(e) => handleSubmit(e as unknown as React.FormEvent)}
          >
            Criar Escala
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Mês + Ano */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Mês *</label>
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className={INPUT_CLASS}
            >
              {MESES.map((m, i) => (
                <option key={i + 1} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Ano *</label>
            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className={INPUT_CLASS}
            >
              {[-1, 0, 1, 2].map((offset) => {
                const y = hoje.getFullYear() + offset;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Título */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Título <span className="text-slate-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder={`Escala ${mes}/${ano}`}
            className={INPUT_CLASS}
          />
        </div>

        {/* Observações */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Observações <span className="text-slate-400 font-normal">(opcional)</span>
          </label>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className={INPUT_CLASS + ' resize-none'}
            placeholder="Observações sobre esta escala..."
          />
        </div>
      </form>
    </Modal>
  );
}
