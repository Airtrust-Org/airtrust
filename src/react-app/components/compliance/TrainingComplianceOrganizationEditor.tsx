import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Save } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';
import { showToast } from '@/react-app/utils/toast';

type Catalogs = {
  setores: Array<{ id: number; nome: string }>;
  funcoes: Array<{ id: number; nome: string }>;
  setor_funcoes: Array<{ setor_id: number; funcao_id: number }>;
  aeronaves_modelos?: Array<{ modelo: string; aeronaves: number }>;
};

type MatrixRow = {
  qualificacao_tipo_id: number;
  qualificacao_tipo_codigo: string | null;
  qualificacao_tipo_nome: string;
  efetiva: {
    id: number;
    escopo: string;
    obrigatoriedade: string;
    aeronave_modelo?: string | null;
  } | null;
  direta: {
    id: number;
    escopo: string;
    obrigatoriedade: string;
    aeronave_modelo?: string | null;
  } | null;
  impacto: {
    pessoas: number;
    atingidas_neste_nivel: number;
    override_mais_especifico: number;
    com_requisito: number;
    sem_requisito: number;
    conformes: number;
    vencendo: number;
    vencidos: number;
    nunca_realizados: number;
    em_andamento: number;
    matriculados: number;
    sem_matricula: number;
  };
};

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || json.success === false)
    throw new Error(json.error || 'Erro ao carregar matriz');
  return json.data as T;
}

const labels: Record<string, string> = {
  OBRIGATORIA: 'Obrigatório',
  RECOMENDADA: 'Recomendado',
  NAO_APLICA: 'Não se aplica',
};

export function TrainingComplianceOrganizationEditor() {
  const queryClient = useQueryClient();
  const [setorId, setSetorId] = useState<number | null>(null);
  const [funcaoId, setFuncaoId] = useState<number | null>(null);
  const [aeronaveModelo, setAeronaveModelo] = useState<string>('');
  const catalogs = useQuery({
    queryKey: ['training-compliance', 'catalogs'],
    queryFn: async () =>
      readJson<Catalogs>(await fetchWithAuth('/api/compliance-treinamentos/catalogos')),
  });
  const functions = useMemo(() => {
    if (!setorId) return [];
    const ids = new Set(
      (catalogs.data?.setor_funcoes || [])
        .filter((p) => p.setor_id === setorId)
        .map((p) => p.funcao_id),
    );
    return (catalogs.data?.funcoes || []).filter((f) => ids.has(f.id));
  }, [catalogs.data, setorId]);
  const matrix = useQuery({
    queryKey: ['training-compliance', 'org-matrix', setorId, funcaoId, aeronaveModelo],
    enabled: Boolean(setorId),
    queryFn: async () => {
      const params = new URLSearchParams({ setor_id: String(setorId) });
      if (funcaoId) params.set('funcao_id', String(funcaoId));
      if (aeronaveModelo) params.set('aeronave_modelo', aeronaveModelo);
      return readJson<MatrixRow[]>(
        await fetchWithAuth(`/api/compliance-treinamentos/matriz-organizacao?${params}`),
      );
    },
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['training-compliance'] }),
      queryClient.invalidateQueries({ queryKey: ['qualification-types'] }),
    ]);
  };
  const save = useMutation({
    mutationFn: async ({ row, value }: { row: MatrixRow; value: string }) => {
      if (!setorId) throw new Error('Selecione o setor.');
      if (value === 'HERDAR') {
        if (!row.direta) return;
        return readJson(
          await fetchWithAuth(`/api/compliance-treinamentos/regras/${row.direta.id}`, {
            method: 'DELETE',
          }),
        );
      }
      const body = {
        qualificacao_tipo_id: row.qualificacao_tipo_id,
        escopo: funcaoId ? 'SETOR_FUNCAO' : 'SETOR',
        setor_id: setorId,
        funcao_id: funcaoId,
        aeronave_modelo: aeronaveModelo || null,
        obrigatoriedade: value,
        origem: 'EMPRESA',
        referencia_normativa: 'Matriz organizacional de treinamentos',
      };
      if (row.direta) {
        return readJson(
          await fetchWithAuth(`/api/compliance-treinamentos/regras/${row.direta.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
        );
      }
      return readJson(
        await fetchWithAuth('/api/compliance-treinamentos/regras', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: async () => {
      showToast.success('Matriz atualizada.');
      await invalidate();
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao atualizar matriz'),
  });

  return (
    <section className="space-y-4">
      <div className="flex items-start gap-2">
        <Building2 className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold text-slate-900">Matriz por organização</h3>
          <p className="text-sm text-slate-500">
            Defina o setor, opcionalmente o cargo e, para tripulantes, o equipamento. A regra mais
            específica prevalece. Tripulantes vinculados a mais de uma aeronave recebem as regras
            de todos os equipamentos que operam.
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Setor
          <select
            value={setorId ?? ''}
            onChange={(e) => {
              setSetorId(e.target.value ? Number(e.target.value) : null);
              setFuncaoId(null);
              setAeronaveModelo('');
            }}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Selecione o setor</option>
            {(catalogs.data?.setores || []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Cargo / função
          <select
            value={funcaoId ?? ''}
            disabled={!setorId}
            onChange={(e) => setFuncaoId(e.target.value ? Number(e.target.value) : null)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
          >
            <option value="">Todo o setor</option>
            {functions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Aeronave / equipamento
          <select
            value={aeronaveModelo}
            disabled={!setorId}
            onChange={(e) => setAeronaveModelo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
          >
            <option value="">Todos os equipamentos</option>
            {(catalogs.data?.aeronaves_modelos || []).map((item) => (
              <option key={item.modelo} value={item.modelo}>
                {item.modelo}
              </option>
            ))}
          </select>
          <span className="mt-1 block normal-case font-normal tracking-normal text-slate-400">
            Use para treinamentos específicos de AW139, SK76 ou outro modelo cadastrado.
          </span>
        </label>
      </div>
      {!setorId ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">
          Selecione um setor para ver e editar todos os treinamentos aplicáveis.
        </div>
      ) : null}
      {setorId ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Treinamento</th>
                <th className="px-3 py-3 text-left">Regra efetiva</th>
                <th className="px-3 py-3 text-left">Impacto antes de salvar</th>
                <th className="px-3 py-3 text-left">Regra desta seleção</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(matrix.data || []).map((row) => (
                <tr key={row.qualificacao_tipo_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{row.qualificacao_tipo_nome}</div>
                    <div className="text-xs text-slate-400">
                      {row.qualificacao_tipo_codigo || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-slate-600">
                    {row.efetiva ? (
                      <>
                        {`${labels[row.efetiva.obrigatoriedade] || row.efetiva.obrigatoriedade} · ${row.efetiva.escopo.replace('_', ' + ')}`}
                        {row.efetiva.aeronave_modelo ? (
                          <span className="ml-1 text-xs text-slate-400">
                            · {row.efetiva.aeronave_modelo}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      'Sem regra'
                    )}
                  </td>
                  <td className="min-w-[260px] px-3 py-3 text-xs text-slate-600">
                    <div className="font-medium text-slate-800">
                      {row.impacto.atingidas_neste_nivel}/{row.impacto.pessoas} pessoa(s) seriam
                      afetadas neste nível
                    </div>
                    {row.impacto.override_mais_especifico > 0 ? (
                      <div className="mt-0.5 text-amber-700">
                        {row.impacto.override_mais_especifico} preservada(s) por regra mais
                        específica
                      </div>
                    ) : null}
                    <div className="mt-1 text-slate-500">
                      {row.impacto.matriculados} matriculada(s) · {row.impacto.sem_matricula} sem
                      matrícula
                    </div>
                    <div className="mt-0.5 text-slate-500">
                      Atual: {row.impacto.com_requisito} com requisito · {row.impacto.sem_requisito}{' '}
                      sem requisito/N/A
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={row.direta?.obrigatoriedade || 'HERDAR'}
                        disabled={save.isPending}
                        onChange={(e) => save.mutate({ row, value: e.target.value })}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="HERDAR">Herdar / sem override</option>
                        <option value="OBRIGATORIA">Obrigatório</option>
                        <option value="RECOMENDADA">Recomendado</option>
                        <option value="NAO_APLICA">Não se aplica</option>
                      </select>
                      <Save className="h-4 w-4 text-slate-400" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
