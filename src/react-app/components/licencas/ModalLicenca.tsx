/**
 * ============================================================
 * MODAL LICENÇA - FASE 3
 * ============================================================
 * Modal para criar/editar licenças aeronáuticas
 * - CMA, CANAC, CHT, PP, PC, PLA, IFR, INVA, INVH etc.
 * - Validação com Zod
 * - React Hook Form
 * ============================================================
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { API_BASE_URL } from '@/react-app/config/api';

type ModalLicencaProps = {
  mode: 'create' | 'edit';
  licencaId?: number;
  defaultFuncionarioId?: number;
  defaultFuncionarioNome?: string;
  aberto: boolean;
  onFechar: () => void;
  onSalvar: () => void;
};

type FuncionarioOption = {
  id: number;
  nome_completo: string;
  matricula: string;
};

type FormData = {
  funcionario_id: number | string;
  tipo: string;
  numero: string;
  data_emissao: string;
  data_vencimento: string;
  observacoes: string;
};

const TIPOS_LICENCA = [
  'CMA',
  'CANAC',
  'CHT',
  'PP',
  'PC',
  'PLA',
  'IFR',
  'INVA',
  'INVH',
  'MLTE',
  'MNTE',
  'OUTRO',
] as const;

export default function ModalLicenca({
  mode,
  licencaId,
  defaultFuncionarioId,
  defaultFuncionarioNome,
  aberto,
  onFechar,
  onSalvar,
}: ModalLicencaProps) {
  const isContextual = Boolean(defaultFuncionarioId);
  const [funcionarios, setFuncionarios] = useState<FuncionarioOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    funcionario_id: defaultFuncionarioId || '',
    tipo: '',
    numero: '',
    data_emissao: '',
    data_vencimento: '',
    observacoes: '',
  });

  // Scroll lock
  useEffect(() => {
    if (!aberto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [aberto]);

  // Carregar funcionários
  useEffect(() => {
    if (!aberto) return;

    (async () => {
      try {
        const apiUrl = API_BASE_URL;
        const res = await fetch(`${apiUrl}/funcionarios`);
        const json = await res.json();
        const data = json.data || json.results || json;

        setFuncionarios(
          data.map(
            (f: { id: number; nome_completo?: string; nome?: string; matricula: string }) => ({
              id: f.id,
              nome_completo: f.nome_completo || f.nome,
              matricula: f.matricula,
            }),
          ),
        );
      } catch (err) {
        console.error('Erro ao carregar funcionários:', err);
      }
    })();
  }, [aberto]);

  // Carregar licença se for edição
  useEffect(() => {
    if (!aberto || mode !== 'edit' || !licencaId) return;

    (async () => {
      try {
        const apiUrl = API_BASE_URL;
        const res = await fetch(`${apiUrl}/licencas/${licencaId}`);
        const json = await res.json();
        const data = json.data || json;

        setFormData({
          funcionario_id: data.funcionario_id,
          tipo: data.tipo,
          numero: data.numero,
          data_emissao: data.data_emissao,
          data_vencimento: data.data_vencimento,
          observacoes: data.observacoes || '',
        });
      } catch (err) {
        console.error('Erro ao carregar licença:', err);
        setError('Erro ao carregar dados da licença');
      }
    })();
  }, [aberto, mode, licencaId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const apiUrl = API_BASE_URL;
      const url = mode === 'create' ? `${apiUrl}/licencas` : `${apiUrl}/licencas/${licencaId}`;

      const method = mode === 'create' ? 'POST' : 'PUT';

      const funcionarioId = isContextual ? defaultFuncionarioId : Number(formData.funcionario_id);

      if (!funcionarioId) {
        setError('Funcionário é obrigatório');
        setLoading(false);
        return;
      }

      const payload = {
        funcionario_id: funcionarioId,
        tipo: formData.tipo?.trim() || null,
        numero: formData.numero?.trim() || null,
        data_emissao: formData.data_emissao || null,
        data_vencimento: formData.data_vencimento || null,
        observacoes: formData.observacoes?.trim() || null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Erro ao salvar licença');
      }

      onSalvar();
      handleFechar();
    } catch (err) {
      console.error('Erro ao salvar licença:', err);
      setError((err as Error).message || 'Erro ao salvar licença');
    } finally {
      setLoading(false);
    }
  };

  const handleFechar = () => {
    setFormData({
      funcionario_id: defaultFuncionarioId || '',
      tipo: '',
      numero: '',
      data_emissao: '',
      data_vencimento: '',
      observacoes: '',
    });
    setError(null);
    onFechar();
  };

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">
            {mode === 'create' ? 'Nova Licença' : 'Editar Licença'}
          </h2>
          <button onClick={handleFechar} className="rounded-lg p-1 hover:bg-gray-100" type="button">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Funcionário */}
          {isContextual ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Funcionário</label>
              <div className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {defaultFuncionarioNome || `ID: ${defaultFuncionarioId}`}
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Funcionário *</label>
              <select
                value={formData.funcionario_id}
                onChange={(e) => setFormData((prev) => ({ ...prev, funcionario_id: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Selecione...</option>
                {funcionarios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome_completo} ({f.matricula})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tipo + Número */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tipo *</label>
              <select
                value={formData.tipo}
                onChange={(e) => setFormData((prev) => ({ ...prev, tipo: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                <option value="">Selecione...</option>
                {TIPOS_LICENCA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Número *</label>
              <input
                type="text"
                value={formData.numero}
                onChange={(e) => setFormData((prev) => ({ ...prev, numero: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Ex: 123456"
              />
            </div>
          </div>

          {/* Datas */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Data de emissão *
              </label>
              <input
                type="date"
                value={formData.data_emissao}
                onChange={(e) => setFormData((prev) => ({ ...prev, data_emissao: e.target.value }))}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Data de vencimento *
              </label>
              <input
                type="date"
                value={formData.data_vencimento}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, data_vencimento: e.target.value }))
                }
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Observações</label>
            <textarea
              value={formData.observacoes}
              onChange={(e) => setFormData((prev) => ({ ...prev, observacoes: e.target.value }))}
              className="w-full min-h-[80px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              placeholder="Informações adicionais sobre a licença..."
            />
          </div>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-between border-t pt-4">
            <button
              type="button"
              onClick={handleFechar}
              className="rounded-lg border border-gray-300 px-6 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-primary px-6 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? 'Salvando...' : mode === 'create' ? 'Criar' : 'Atualizar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
