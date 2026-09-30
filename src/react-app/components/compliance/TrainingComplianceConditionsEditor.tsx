import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { showToast } from '@/react-app/utils/toast';

type Condition = {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  descricao?: string | null;
  referencia_normativa?: string | null;
};

type Employee = {
  id: number;
  nome: string;
  setor_id: number | null;
  setor_nome?: string | null;
  funcao_id: number | null;
  funcao_nome?: string | null;
};

type Assignment = {
  id: number;
  funcionario_id: number;
  funcionario_nome: string;
  setor_id?: number | null;
  condicao_id: number;
  condicao_codigo: string;
  condicao_nome: string;
  tipo: string;
  data_inicio: string | null;
  data_fim: string | null;
  origem: string;
  referencia_normativa: string | null;
  justificativa: string | null;
};

type Catalog = { condicoes: Condition[]; funcionarios: Employee[] };

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || payload.success === false)
    throw new Error(payload.error || 'Erro ao carregar condições de Compliance');
  return payload.data as T;
}

export function TrainingComplianceConditionsEditor() {
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [conditionId, setConditionId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('DESIGNACAO');
  const [newDescription, setNewDescription] = useState('');
  const [newReference, setNewReference] = useState('');

  const catalogs = useQuery({
    queryKey: ['training-compliance', 'condition-catalogs'],
    queryFn: async () =>
      readJson<Catalog>(await fetchWithAuth('/api/compliance-treinamentos/condicoes/catalogos')),
  });
  const assignments = useQuery({
    queryKey: ['training-compliance', 'condition-assignments'],
    queryFn: async () =>
      readJson<Assignment[]>(
        await fetchWithAuth('/api/compliance-treinamentos/condicoes/atribuicoes'),
      ),
  });

  const byType = useMemo(() => {
    const map = new Map<string, Condition[]>();
    for (const condition of catalogs.data?.condicoes || []) {
      const list = map.get(condition.tipo) || [];
      list.push(condition);
      map.set(condition.tipo, list);
    }
    return [...map.entries()];
  }, [catalogs.data?.condicoes]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'condition-catalogs'] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'condition-assignments'] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'summary'] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'people'] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'trainings'] }),
    ]);
  };

  const assign = useMutation({
    mutationFn: async () => {
      if (!employeeId || !conditionId) throw new Error('Selecione funcionário e condição.');
      return readJson<{ id: number }>(
        await fetchWithAuth('/api/compliance-treinamentos/condicoes/atribuicoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            funcionario_id: employeeId,
            condicao_id: conditionId,
            data_inicio: startDate || null,
            data_fim: endDate || null,
            origem: 'EMPRESA',
            referencia_normativa: reference.trim() || null,
            justificativa: reason.trim() || null,
          }),
        }),
      );
    },
    onSuccess: async () => {
      showToast.success('Condição atribuída ao funcionário.');
      setReason('');
      await invalidate();
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao atribuir condição'),
  });

  const remove = useMutation({
    mutationFn: async (id: number) =>
      readJson<Record<string, never>>(
        await fetchWithAuth(`/api/compliance-treinamentos/condicoes/atribuicoes/${id}`, {
          method: 'DELETE',
        }),
      ),
    onSuccess: invalidate,
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao remover condição'),
  });

  const createCondition = useMutation({
    mutationFn: async () => {
      if (!newCode.trim() || !newName.trim()) throw new Error('Informe código e nome da condição.');
      return readJson<{ id: number }>(
        await fetchWithAuth('/api/compliance-treinamentos/condicoes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: newCode,
            nome: newName,
            tipo: newType,
            descricao: newDescription.trim() || null,
            referencia_normativa: newReference.trim() || null,
          }),
        }),
      );
    },
    onSuccess: async () => {
      showToast.success('Condição criada.');
      setNewCode('');
      setNewName('');
      setNewDescription('');
      setNewReference('');
      await invalidate();
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao criar condição'),
  });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-slate-900">Exposição, atividade e designação</h3>
            <p className="text-sm text-slate-500">
              Use estas condições quando função e setor não bastam. A condição pode ter início e fim
              e não altera o histórico já realizado.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            Funcionário
            <select
              value={employeeId ?? ''}
              onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {(catalogs.data?.funcionarios || []).map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.nome}
                  {employee.funcao_nome ? ` · ${employee.funcao_nome}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Condição
            <select
              value={conditionId ?? ''}
              onChange={(e) => setConditionId(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {byType.map(([type, conditions]) => (
                <optgroup key={type} label={type}>
                  {conditions.map((condition) => (
                    <option key={condition.id} value={condition.id}>
                      {condition.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Início
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Fim, se temporária
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600 md:col-span-2">
            Referência normativa
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex.: NR-35; PGR/LAPR; RBAC 120; ato de designação"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium text-slate-600 md:col-span-2">
            Justificativa
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explique por que esta condição se aplica à pessoa."
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => assign.mutate()}
            disabled={assign.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Atribuir condição
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">Condições vigentes</h3>
        <div className="mt-3 space-y-2">
          {(assignments.data || []).map((assignment) => (
            <div
              key={assignment.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:flex-row md:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  {assignment.funcionario_nome} · {assignment.condicao_nome}
                </p>
                <p className="text-xs text-slate-500">
                  {assignment.tipo}
                  {assignment.data_inicio ? ` · desde ${assignment.data_inicio}` : ''}
                  {assignment.data_fim ? ` · até ${assignment.data_fim}` : ''}
                  {assignment.referencia_normativa ? ` · ${assignment.referencia_normativa}` : ''}
                </p>
                {assignment.justificativa ? (
                  <p className="mt-1 text-xs text-slate-600">{assignment.justificativa}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove.mutate(assignment.id)}
                disabled={remove.isPending}
                aria-label="Remover condição"
                className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {!assignments.isLoading && (assignments.data?.length || 0) === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma condição individual vigente.</p>
          ) : null}
        </div>
      </section>

      {isAdmin ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-slate-900">Nova condição</h3>
          <p className="mt-1 text-sm text-slate-500">
            Use somente quando a condição necessária ainda não existir no catálogo.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              Código
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="EX.: DESIGNACAO_ESPECIAL"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Nome
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Tipo
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {['EXPOSICAO_RISCO', 'ATIVIDADE', 'DESIGNACAO', 'CERTIFICACAO', 'OUTRO'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              Referência
              <input
                value={newReference}
                onChange={(e) => setNewReference(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600 md:col-span-2">
              Descrição
              <textarea
                rows={2}
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => createCondition.mutate()}
              disabled={createCondition.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Criar condição
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
