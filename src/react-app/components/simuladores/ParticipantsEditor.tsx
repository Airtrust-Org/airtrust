import React from 'react';
import { ParticipanteSessao, DefinirParticipantesPayload } from '../../types/simuladores';
import { simuladoresApi } from '../../services/simuladoresApi';

interface Props {
  sessaoId: number;
  participantes: ParticipanteSessao[];
  onChanged: (lista: ParticipanteSessao[]) => void;
}

export const ParticipantsEditor: React.FC<Props> = ({ sessaoId, participantes, onChanged }) => {
  const [draft, setDraft] = React.useState<
    Array<{ funcionario_id: number; papel: ParticipanteSessao['papel'] }>
  >(participantes.map((p) => ({ funcionario_id: p.funcionario_id, papel: p.papel })));
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function updateField(idx: number, field: 'funcionario_id' | 'papel', value: string) {
    setDraft((prev) => {
      const copy = [...prev];
      copy[idx] = {
        ...copy[idx],
        [field]:
          field === 'funcionario_id' ? Number(value) : (value as ParticipanteSessao['papel']),
      };
      return copy;
    });
  }

  function addRow() {
    setDraft((prev) => [...prev, { funcionario_id: 0, papel: 'ALUNO' }]);
  }

  function removeRow(i: number) {
    setDraft((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function salvar() {
    setLoading(true);
    setError(null);
    try {
      const payload: DefinirParticipantesPayload = { participantes: [...draft] };
      const res = await simuladoresApi.definirParticipantes(sessaoId, payload);
      onChanged(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Participantes</h3>
        <button
          type="button"
          onClick={addRow}
          className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-xs"
        >
          + Adicionar
        </button>
      </div>
      <div className="space-y-2">
        {draft.map((row, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input
              type="number"
              value={row.funcionario_id || ''}
              onChange={(e) => updateField(i, 'funcionario_id', e.target.value)}
              placeholder="Funcionario ID"
              className="col-span-3 border rounded px-2 py-1 text-xs"
            />
            <select
              value={row.papel}
              onChange={(e) => updateField(i, 'papel', e.target.value)}
              className="col-span-3 border rounded px-2 py-1 text-xs"
            >
              <option value="ALUNO">ALUNO</option>
              <option value="INSTRUTOR">INSTRUTOR</option>
              <option value="OBSERVADOR">OBSERVADOR</option>
              <option value="EXAMINADOR">EXAMINADOR</option>
            </select>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="col-span-2 text-red-600 text-xs hover:underline"
            >
              remover
            </button>
          </div>
        ))}
        {draft.length === 0 && <div className="text-xs text-gray-500">Nenhum participante.</div>}
      </div>
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={loading}
          onClick={salvar}
          className="px-3 py-1.5 rounded bg-primary text-white text-xs disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Salvar Participantes'}
        </button>
      </div>
    </div>
  );
};

export default ParticipantsEditor;
