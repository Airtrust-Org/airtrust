import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { showToast } from '@/react-app/utils/toast';

type Scope = 'EMPRESA' | 'SETOR' | 'FUNCAO' | 'SETOR_FUNCAO';
type Obrigatoriedade = 'OBRIGATORIA' | 'RECOMENDADA' | 'NAO_APLICA';

type Rule = {
  id: number;
  qualificacao_tipo_id: number;
  escopo: Scope | 'FUNCIONARIO';
  setor_id: number | null;
  setor_nome?: string | null;
  funcao_id: number | null;
  funcao_nome?: string | null;
  funcionario_id: number | null;
  aeronave_modelo?: string | null;
  obrigatoriedade: Obrigatoriedade;
  critico_operacional: number;
  origem: string;
  referencia_normativa?: string | null;
};

type Catalogs = {
  setores: Array<{ id: number; codigo?: string | null; nome: string }>;
  funcoes: Array<{ id: number; codigo?: string | null; nome: string }>;
  setor_funcoes: Array<{ setor_id: number; funcao_id: number }>;
  aeronaves_modelos?: Array<{ modelo: string; aeronaves: number }>;
  access_mode: 'all' | 'restricted' | 'self';
};

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || json.success === false)
    throw new Error(json.error || 'Erro ao carregar compliance');
  return json.data as T;
}

const scopeOptions: Array<{ value: Scope; label: string }> = [
  { value: 'EMPRESA', label: 'Toda a empresa' },
  { value: 'SETOR', label: 'Todo o setor' },
  { value: 'FUNCAO', label: 'Cargo / função em qualquer setor' },
  { value: 'SETOR_FUNCAO', label: 'Setor + cargo / função' },
];

function isTripulacaoSector(setor?: { codigo?: string | null; nome: string } | null) {
  if (!setor) return false;
  const canonical = `${setor.codigo || ''} ${setor.nome}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return canonical.includes('TRIPUL');
}

function scopeLabel(rule: Rule) {
  const aircraft = rule.aeronave_modelo ? ` · ${rule.aeronave_modelo}` : '';
  if (rule.escopo === 'EMPRESA') return `Toda a empresa${aircraft}`;
  if (rule.escopo === 'SETOR') return `${rule.setor_nome || 'Setor'}${aircraft}`;
  if (rule.escopo === 'FUNCAO') return `${rule.funcao_nome || 'Cargo / função'}${aircraft}`;
  if (rule.escopo === 'SETOR_FUNCAO') {
    return `${rule.setor_nome || 'Setor'} · ${rule.funcao_nome || 'Cargo'}${aircraft}`;
  }
  return `Funcionário específico${aircraft}`;
}

export function TrainingComplianceApplicabilityEditor({
  qualificacaoTipoId,
  title = 'Aplicabilidade e Compliance',
  compact = false,
}: {
  qualificacaoTipoId: number | string | null | undefined;
  title?: string;
  compact?: boolean;
}) {
  const tipoId = Number(qualificacaoTipoId || 0);
  const enabled = Number.isInteger(tipoId) && tipoId > 0;
  const { isAdmin, isGestor } = usePermissions();
  const canEdit = isAdmin || isGestor;
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<Scope>('SETOR_FUNCAO');
  const [setorId, setSetorId] = useState<number | null>(null);
  const [funcaoId, setFuncaoId] = useState<number | null>(null);
  const [aeronaveModelo, setAeronaveModelo] = useState('');
  const [obrigatoriedade, setObrigatoriedade] = useState<Obrigatoriedade>('OBRIGATORIA');
  const [origem, setOrigem] = useState('REGULATORIO');
  const [critico, setCritico] = useState(false);
  const [referencia, setReferencia] = useState('');

  const capabilities = useQuery({
    queryKey: ['training-compliance', 'capabilities'],
    queryFn: async () =>
      readJson<{ schema_ready: boolean; aircraft_scope_ready?: boolean }>(
        await fetchWithAuth('/api/compliance-treinamentos/capabilities'),
      ),
  });
  const schemaReady = capabilities.data?.schema_ready === true;
  const aircraftScopeReady = capabilities.data?.aircraft_scope_ready === true;

  const catalogs = useQuery({
    queryKey: ['training-compliance', 'catalogs'],
    enabled: schemaReady && canEdit,
    queryFn: async () =>
      readJson<Catalogs>(await fetchWithAuth('/api/compliance-treinamentos/catalogos')),
  });
  const rules = useQuery({
    queryKey: ['training-compliance', 'rules', tipoId],
    enabled: schemaReady && enabled && canEdit,
    queryFn: async () =>
      readJson<Rule[]>(
        await fetchWithAuth(`/api/compliance-treinamentos/regras?qualificacao_tipo_id=${tipoId}`),
      ),
  });

  const sectors = catalogs.data?.setores || [];
  const functions = catalogs.data?.funcoes || [];
  const selectedSector = sectors.find((item) => item.id === setorId) || null;
  const tripulacaoSelected = isTripulacaoSector(selectedSector);
  const allowedFunctionIds = useMemo(() => {
    if (!setorId || scope !== 'SETOR_FUNCAO') return null;
    return new Set(
      (catalogs.data?.setor_funcoes || [])
        .filter((pair) => pair.setor_id === setorId)
        .map((pair) => pair.funcao_id),
    );
  }, [catalogs.data?.setor_funcoes, scope, setorId]);
  const visibleFunctions = useMemo(
    () => functions.filter((item) => !allowedFunctionIds || allowedFunctionIds.has(item.id)),
    [allowedFunctionIds, functions],
  );

  useEffect(() => {
    if (scope !== 'SETOR' && scope !== 'SETOR_FUNCAO') setSetorId(null);
    if (scope !== 'FUNCAO' && scope !== 'SETOR_FUNCAO') setFuncaoId(null);
  }, [scope]);
  useEffect(() => {
    if (funcaoId && allowedFunctionIds && !allowedFunctionIds.has(funcaoId)) setFuncaoId(null);
  }, [allowedFunctionIds, funcaoId]);
  useEffect(() => {
    if (!tripulacaoSelected) setAeronaveModelo('');
  }, [tripulacaoSelected]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'rules', tipoId] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'summary'] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'people'] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'trainings'] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'sectors'] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'reconciliation'] }),
      queryClient.invalidateQueries({ queryKey: ['training-compliance', 'org-matrix'] }),
    ]);
  };

  const createRule = useMutation({
    mutationFn: async () => {
      if (!enabled) throw new Error('Salve primeiro o modelo de qualificação.');
      if ((scope === 'SETOR' || scope === 'SETOR_FUNCAO') && !setorId)
        throw new Error('Selecione o setor.');
      if ((scope === 'FUNCAO' || scope === 'SETOR_FUNCAO') && !funcaoId)
        throw new Error('Selecione o cargo/função.');
      const response = await fetchWithAuth('/api/compliance-treinamentos/regras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qualificacao_tipo_id: tipoId,
          escopo: scope,
          setor_id: setorId,
          funcao_id: funcaoId,
          aeronave_modelo:
            tripulacaoSelected && aircraftScopeReady ? aeronaveModelo || null : null,
          obrigatoriedade,
          critico_operacional: critico,
          origem,
          referencia_normativa: referencia.trim() || null,
        }),
      });
      return readJson<{ id: number }>(response);
    },
    onSuccess: async () => {
      showToast.success('Aplicabilidade de compliance atualizada.');
      setReferencia('');
      await invalidate();
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao salvar requisito'),
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Record<string, unknown> }) => {
      const response = await fetchWithAuth(`/api/compliance-treinamentos/regras/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      await readJson<Record<string, never>>(response);
    },
    onSuccess: invalidate,
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao atualizar requisito'),
  });

  const deleteRule = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetchWithAuth(`/api/compliance-treinamentos/regras/${id}`, {
        method: 'DELETE',
      });
      await readJson<Record<string, never>>(response);
    },
    onSuccess: async () => {
      showToast.success('Requisito removido da aplicabilidade.');
      await invalidate();
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao remover requisito'),
  });

  if (!enabled) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <ShieldCheck className="h-4 w-4" /> {title}
        </div>
        <p className="mt-1">Salve o modelo para configurar quem precisa deste treinamento.</p>
      </div>
    );
  }

  if (capabilities.isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">
        Carregando compliance...
      </div>
    );
  }
  if (!schemaReady) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <div className="flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4" /> {title}
        </div>
        <p className="mt-1">
          A matriz V2 está preparada no código, mas o schema governado ainda não foi aplicado neste
          ambiente.
        </p>
      </div>
    );
  }
  if (!canEdit) return null;

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white ${compact ? 'p-3' : 'p-4'} shadow-sm`}
    >
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
          <p className="text-xs text-slate-500">
            A mesma regra alimenta a matriz, o EAD e o cálculo de compliance por pessoa.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">
          Aplicação
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as Scope)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {scopeOptions
              .filter((item) => isAdmin || !['EMPRESA', 'FUNCAO'].includes(item.value))
              .map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
          </select>
        </label>
        {(scope === 'SETOR' || scope === 'SETOR_FUNCAO') && (
          <label className="text-xs font-medium text-slate-600">
            Setor
            <select
              value={setorId ?? ''}
              onChange={(event) =>
                setSetorId(event.target.value ? Number(event.target.value) : null)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione o setor</option>
              {sectors.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {(scope === 'FUNCAO' || scope === 'SETOR_FUNCAO') && (
          <label className="text-xs font-medium text-slate-600">
            Cargo / função
            <select
              value={funcaoId ?? ''}
              onChange={(event) =>
                setFuncaoId(event.target.value ? Number(event.target.value) : null)
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Selecione o cargo</option>
              {visibleFunctions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        {tripulacaoSelected && aircraftScopeReady ? (
          <label className="text-xs font-medium text-slate-600">
            Aeronave / equipamento
            <select
              value={aeronaveModelo}
              onChange={(event) => setAeronaveModelo(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Todos os equipamentos</option>
              {(catalogs.data?.aeronaves_modelos || []).map((item) => (
                <option key={item.modelo} value={item.modelo}>
                  {item.modelo}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-xs font-medium text-slate-600">
          Obrigatoriedade
          <select
            value={obrigatoriedade}
            onChange={(event) => setObrigatoriedade(event.target.value as Obrigatoriedade)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="OBRIGATORIA">Obrigatório</option>
            <option value="RECOMENDADA">Recomendado</option>
            <option value="NAO_APLICA">Não se aplica (exceção)</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Origem
          <select
            value={origem}
            onChange={(event) => setOrigem(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            {['REGULATORIO', 'PTO', 'MANUAL', 'SGSO', 'RH', 'CLIENTE', 'EMPRESA', 'OUTRO'].map(
              (value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ),
            )}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600 md:col-span-2">
          Base / referência
          <input
            value={referencia}
            onChange={(event) => setReferencia(event.target.value)}
            placeholder="Ex.: PTO Parte A, RBAC 135, requisito cliente"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={critico}
            onChange={(event) => setCritico(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Crítico operacional
        </label>
        <button
          type="button"
          onClick={() => createRule.mutate()}
          disabled={createRule.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Adicionar requisito
        </button>
      </div>

      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Regras vigentes
        </p>
        {rules.isLoading ? <p className="text-sm text-slate-500">Carregando regras...</p> : null}
        {!rules.isLoading && (rules.data?.length || 0) === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma obrigação configurada para este treinamento.
          </p>
        ) : null}
        {(rules.data || []).map((rule) => {
          const globalBlocked = !isAdmin && (rule.escopo === 'EMPRESA' || rule.escopo === 'FUNCAO');
          return (
            <div
              key={rule.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:flex-row md:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">{scopeLabel(rule)}</span>
                  {rule.critico_operacional ? (
                    <span className="rounded bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">
                      Crítico
                    </span>
                  ) : null}
                  {globalBlocked ? (
                    <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">
                      Regra global
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {rule.origem}
                  {rule.referencia_normativa ? ` · ${rule.referencia_normativa}` : ''}
                </p>
              </div>
              <select
                value={rule.obrigatoriedade}
                disabled={globalBlocked || updateRule.isPending}
                onChange={(event) =>
                  updateRule.mutate({ id: rule.id, patch: { obrigatoriedade: event.target.value } })
                }
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs disabled:bg-slate-100"
              >
                <option value="OBRIGATORIA">Obrigatório</option>
                <option value="RECOMENDADA">Recomendado</option>
                <option value="NAO_APLICA">N/A</option>
              </select>
              <button
                type="button"
                disabled={globalBlocked || deleteRule.isPending}
                onClick={() => deleteRule.mutate(rule.id)}
                className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                aria-label="Remover requisito"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
