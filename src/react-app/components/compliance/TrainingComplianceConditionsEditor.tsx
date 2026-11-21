import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { showToast } from '@/react-app/utils/toast';
import { confirmDialog } from '@/react-app/utils/confirmDialog';

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

function complianceDesignationLabel(code: string, name: string): string {
  return code === 'GESTOR' ? 'Grupo de Gestores' : name;
}

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

// Compliance operational dates follow the company's São Paulo calendar, not UTC.
// At 21:00–23:59 BRT, toISOString() already points to tomorrow.
export function todayComplianceIso(referenceDate: Date = new Date()): string {
  const dateParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(referenceDate);
  const value = (kind: string) => dateParts.find((part) => part.type === kind)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function TrainingComplianceConditionsEditor() {
  const queryClient = useQueryClient();
  const { isAdmin } = usePermissions();
  const [cargoFilterId, setCargoFilterId] = useState<number | null>(null);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [conditionId, setConditionId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(() => todayComplianceIso());
  const [endDate, setEndDate] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('DESIGNACAO');
  const [newDescription, setNewDescription] = useState('');
  const [newReference, setNewReference] = useState('');
  const [editingConditionId, setEditingConditionId] = useState<number | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null);

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

  const cargos = useMemo(() => {
    const active = new Map<number, string>();
    for (const employee of catalogs.data?.funcionarios || []) {
      if (employee.funcao_id && employee.funcao_nome) {
        active.set(employee.funcao_id, employee.funcao_nome);
      }
    }
    return [...active.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [catalogs.data?.funcionarios]);

  const employeesForCargo = useMemo(
    () => (catalogs.data?.funcionarios || []).filter(
      (employee) => cargoFilterId === null || employee.funcao_id === cargoFilterId,
    ),
    [catalogs.data?.funcionarios, cargoFilterId],
  );

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
      return readJson<{ id:number; auto_enrollment:{created:number;reactivated:number;preserved:number;skipped_valid_evidence:number;unavailable_course:number}|null; auto_enrollment_warning:string|null }>(
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
    onSuccess: async (result) => {
      const enrolled=Number(result.auto_enrollment?.created||0)+Number(result.auto_enrollment?.reactivated||0);
      const incomplete=Boolean(result.auto_enrollment_warning) || Number(result.auto_enrollment?.unavailable_course||0)>0;
      if(!incomplete) showToast.success(enrolled>0?
        `Designação atribuída. ${enrolled} treinamento(s) disponibilizado(s) automaticamente.`:
        'Designação atribuída ao funcionário.');
      if(result.auto_enrollment_warning==='ENROLLMENT_DIAGNOSTIC_UNAVAILABLE')
        showToast.warning(enrolled>0
          ? `Designação salva e ${enrolled} matrícula(s) processada(s), mas a verificação complementar está indisponível. Confira o LMS.`
          : 'Designação salva; verificação complementar de matrícula indisponível. Confira o LMS.');
      else if(result.auto_enrollment_warning==='UNMAPPED_MANDATORY_QUALIFICATION')
        showToast.warning('Designação registrada, mas existe qualificação obrigatória sem curso vinculado. Verifique se exige treinamento EAD.');
      else if(result.auto_enrollment_warning==='NO_EAD_POLICY')
        showToast.warning('Designação registrada, mas a regra obrigatória não habilita matrícula EAD automática.');
      else if(Number(result.auto_enrollment?.unavailable_course||0)>0)
        showToast.warning('Designação registrada, mas não há um único curso EAD publicado e vinculado.');
      else if(result.auto_enrollment_warning)
        showToast.warning('Designação registrada com pendência: matrícula automática não confirmada; reconciliação necessária.');
      setReason(''); setEditingAssignmentId(null); await invalidate();
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

  const beginEditAssignment = (assignment: Assignment) => {
    setEditingAssignmentId(assignment.id);
    setCargoFilterId(null);
    setEmployeeId(assignment.funcionario_id);
    setConditionId(assignment.condicao_id);
    setStartDate(assignment.data_inicio || todayComplianceIso());
    setEndDate(assignment.data_fim || '');
    setReference(assignment.referencia_normativa || '');
    setReason(assignment.justificativa || '');
  };
  const cancelEditAssignment = () => {
    setEditingAssignmentId(null);
    setEmployeeId(null);
    setConditionId(null);
    setStartDate(todayComplianceIso());
    setEndDate('');
    setReference('');
    setReason('');
  };

  const beginEditCondition = (condition: Condition) => {
    setEditingConditionId(condition.id);
    setNewCode(condition.codigo);
    setNewName(condition.nome);
    setNewType(condition.tipo);
    setNewDescription(condition.descricao || '');
    setNewReference(condition.referencia_normativa || '');
  };
  const cancelEditCondition = () => {
    setEditingConditionId(null);
    setNewCode('');
    setNewName('');
    setNewType('DESIGNACAO');
    setNewDescription('');
    setNewReference('');
  };

  const updateCondition = useMutation({
    mutationFn: async () => {
      if (!editingConditionId) throw new Error('Selecione a condição.');
      if (!newCode.trim() || !newName.trim()) throw new Error('Informe código e nome.');
      return readJson<{ id: number }>(
        await fetchWithAuth(`/api/compliance-treinamentos/condicoes/${editingConditionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: newCode, nome: newName, tipo: newType,
            descricao: newDescription.trim() || null,
            referencia_normativa: newReference.trim() || null,
          }),
        }),
      );
    },
    onSuccess: async () => {
      showToast.success('Designação atualizada.');
      cancelEditCondition();
      await invalidate();
    },
    onError: (error) => showToast.error(error instanceof Error ? error.message : 'Erro ao editar designação'),
  });
  const deleteCondition = useMutation({
    mutationFn: async (id: number) => readJson<unknown>(
      await fetchWithAuth(`/api/compliance-treinamentos/condicoes/${id}`, { method: 'DELETE' }),
    ),
    onSuccess: async () => {
      showToast.success('Designação excluída do catálogo.');
      cancelEditCondition();
      await invalidate();
    },
    onError: (error) => showToast.error(error instanceof Error ? error.message : 'Erro ao excluir designação'),
  });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-slate-900">
              Condições e designações de aplicabilidade
            </h3>
            <p className="text-sm text-slate-500">
              Escolha o cargo para localizar os funcionários e selecione a designação correspondente.
              A seleção do cargo é apenas um filtro: ela não atribui automaticamente a designação
              nem torna o treinamento obrigatório para todos os ocupantes. As marcações individuais
              podem ter início e fim.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-600">
            Cargo (filtro opcional)
            <select
              aria-label="Filtrar funcionários por cargo"
              value={cargoFilterId ?? ''}
              onChange={(e) => {
                setCargoFilterId(e.target.value ? Number(e.target.value) : null);
                setEmployeeId(null);
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Todos os cargos</option>
              {cargos.map(([id, nome]) => (
                <option key={id} value={id}>{nome}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-600">
            Funcionário
            <select
              value={employeeId ?? ''}
              disabled={editingAssignmentId !== null}
              onChange={(e) => setEmployeeId(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {employeesForCargo.map((employee) => (
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
              disabled={editingAssignmentId !== null}
              onChange={(e) => setConditionId(e.target.value ? Number(e.target.value) : null)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione</option>
              {byType.map(([type, conditions]) => (
                <optgroup key={type} label={type}>
                  {conditions.map((condition) => (
                    <option key={condition.id} value={condition.id}>
                      {complianceDesignationLabel(condition.codigo, condition.nome)}
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
        <div className="mt-3 flex justify-end gap-2">
          {editingAssignmentId ? <button type="button" onClick={cancelEditAssignment} className="rounded-lg border px-3 py-2 text-sm">Cancelar edição</button> : null}
          <button
            type="button"
            onClick={() => assign.mutate()}
            disabled={assign.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {editingAssignmentId ? 'Salvar designação existente' : 'Atribuir condição/designação'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-slate-900">Condições e designações vigentes</h3>
        <div className="mt-3 space-y-2">
          {(assignments.data || []).map((assignment) => (
            <div
              key={assignment.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:flex-row md:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  {assignment.funcionario_nome} · {complianceDesignationLabel(assignment.condicao_codigo, assignment.condicao_nome)}
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
              <button type="button" onClick={() => beginEditAssignment(assignment)} aria-label={`Editar atribuição de ${assignment.funcionario_nome}: ${assignment.condicao_nome}`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
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
          <h3 className="font-semibold text-slate-900">{editingConditionId ? 'Editar condição ou designação' : 'Nova condição ou designação'}</h3>
          <p className="mt-1 text-sm text-slate-500">
            Selecione uma designação existente abaixo para editar. A exclusão só é permitida quando não houver regras ou atribuições ativas.
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
          <div className="mt-3 flex justify-end gap-2">
            {editingConditionId ? <button type="button" onClick={cancelEditCondition} className="rounded-lg border px-3 py-2 text-sm">Cancelar edição</button> : null}
            <button
              type="button"
              onClick={() => editingConditionId ? updateCondition.mutate() : createCondition.mutate()}
              disabled={createCondition.isPending || updateCondition.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> {editingConditionId ? 'Salvar alterações' : 'Criar condição'}
            </button>
          </div>
          <div className="mt-5 border-t border-slate-200 pt-4">
            <h4 className="text-sm font-semibold text-slate-800">Designações cadastradas</h4>
            <div className="mt-2 space-y-2">
              {(catalogs.data?.condicoes || []).map((condition) => (
                <div key={condition.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{condition.nome} <span className="text-xs text-slate-500">({condition.codigo})</span></p>
                    <p className="text-xs text-slate-500">{condition.tipo}{condition.descricao ? ` · ${condition.descricao}` : ''}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" aria-label={`Editar ${condition.nome}`} onClick={() => beginEditCondition(condition)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Excluir ${condition.nome}`} disabled={deleteCondition.isPending} onClick={async () => {
                      if ((await confirmDialog(`Excluir a designação "${condition.nome}"? Só será permitido se não houver regras ou atribuições ativas.`, { confirmText: 'Excluir' }))) deleteCondition.mutate(condition.id);
                    }} className="rounded-md p-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
