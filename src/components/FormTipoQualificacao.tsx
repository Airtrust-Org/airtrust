import { useState } from 'react';
import { useTiposQualificacoes } from '../hooks/useTiposQualificacoes';

export function FormTipoQualificacao() {
  const { criar, loading, error } = useTiposQualificacoes();
  const [formData, setFormData] = useState({
    nome: '',
    codigo: '',
    categoria: 'Nenhuma' as const,
    descricao: '',
    carga_horaria: 8,
    conteudo_programatico: '',
    validade_meses: 12,
    tipo_vencimento: 'Dia Exato' as const,
  });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSubmitError(null);
      setSubmitLoading(true);
      await criar(formData);
      setFormData({
        nome: '',
        codigo: '',
        categoria: 'Nenhuma',
        descricao: '',
        carga_horaria: 8,
        conteudo_programatico: '',
        validade_meses: 12,
        tipo_vencimento: 'Dia Exato',
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao criar qualificação');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-bold text-gray-900">Nova Qualificação</h2>

      {error && <div className="bg-red-100 text-red-800 p-3 rounded text-sm">{error}</div>}
      {submitError && (
        <div className="bg-red-100 text-red-800 p-3 rounded text-sm">{submitError}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <input
            type="text"
            value={formData.nome}
            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            required
            maxLength={100}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Ex: CMA - Certificado Médico"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
          <input
            type="text"
            value={formData.codigo}
            onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
            required
            pattern="^[A-Z0-9-]+$"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            placeholder="Ex: CMA-001"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <select
            value={formData.categoria}
            onChange={(e) => setFormData({ ...formData, categoria: e.target.value as any })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option>Nenhuma</option>
            <option>Profissional</option>
            <option>Periódico</option>
            <option>Especial</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Carga Horária</label>
          <input
            type="number"
            value={formData.carga_horaria}
            onChange={(e) => setFormData({ ...formData, carga_horaria: parseInt(e.target.value) })}
            min="1"
            max="500"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
        <textarea
          value={formData.descricao}
          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
          maxLength={500}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          rows={2}
          placeholder="Descrição da qualificação"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Conteúdo Programático
        </label>
        <textarea
          value={formData.conteudo_programatico}
          onChange={(e) => setFormData({ ...formData, conteudo_programatico: e.target.value })}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          rows={4}
          placeholder="Um tópico por linha"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Validade (meses)</label>
          <input
            type="number"
            value={formData.validade_meses}
            onChange={(e) => setFormData({ ...formData, validade_meses: parseInt(e.target.value) })}
            min="1"
            max="120"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Vencimento</label>
          <select
            value={formData.tipo_vencimento}
            onChange={(e) => setFormData({ ...formData, tipo_vencimento: e.target.value as any })}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option>Dia Exato</option>
            <option>Aniversário</option>
            <option>Mês Seguinte</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || submitLoading}
          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded transition"
        >
          {submitLoading ? '⏳ Criando...' : '✅ Criar Qualificação'}
        </button>
        <button
          type="reset"
          className="px-4 py-2 text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition"
        >
          Limpar
        </button>
      </div>
    </form>
  );
}
