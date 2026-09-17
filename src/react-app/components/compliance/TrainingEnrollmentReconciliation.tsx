import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Link2, UserPlus } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';
import { showToast } from '@/react-app/utils/toast';

type Reconciliation = {
  resumo: {
    matriculas_ativas: number;
    matriculas_alinhadas: number;
    requisitos_sem_matricula: number;
    gaps_matricula_acionaveis: number;
    matriculados_sem_requisito: number;
    nao_aplica_matriculados: number;
    cursos_sem_modelo: number;
    matriculas_avulsas_reconciliadas: number;
  };
  gaps_matricula: Array<{
    qualificacao_tipo_id: number;
    qualificacao_tipo_nome: string;
    qualificacao_tipo_codigo?: string | null;
    pessoas: number;
    vencendo: number;
    vencidos: number;
    nunca_realizados: number;
    funcionarios: Array<{ id: number; nome: string; status_compliance: string }>;
    cursos_ead: Array<{ id: number; titulo: string }>;
  }>;
  convites_matricula: Array<{
    matricula_id: number;
    funcionario_id: number;
    funcionario_nome: string;
    curso_id: number;
    curso_titulo: string;
    qualificacao_tipo_id: number | null;
    qualificacao_tipo_nome: string | null;
    setor_id: number | null;
    setor_nome: string | null;
    funcao_id: number | null;
    funcao_nome: string | null;
  }>;
  matriculas_revisao: Array<{
    matricula_id: number;
    funcionario_id: number;
    funcionario_nome: string;
    setor_id: number | null;
    setor_nome: string | null;
    funcao_id: number | null;
    funcao_nome: string | null;
    curso_titulo: string;
    qualificacao_tipo_id: number | null;
    qualificacao_tipo_nome: string | null;
    matricula_status: string;
    situacao: string;
    regra_efetiva: { id: number; escopo: string; obrigatoriedade: string } | null;
  }>;
};

async function readJson<T>(response: Response): Promise<T> {
  const json = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    data?: T;
    error?: string;
  };
  if (!response.ok || json.success === false)
    throw new Error(json.error || 'Erro na reconciliação');
  return json.data as T;
}

const situationLabels: Record<string, string> = {
  MATRICULADO_SEM_REQUISITO: 'Matriculado sem requisito',
  NAO_APLICA_MATRICULADO: 'Não aplicável, mas matriculado',
  CURSO_SEM_MODELO: 'Curso sem modelo de qualificação',
  MATRICULA_AVULSA_RECONCILIADA: 'Matrícula avulsa conciliada',
};

type Props = { setorId: number | null; funcaoId: number | null };

export function TrainingEnrollmentReconciliation({ setorId, funcaoId }: Props) {
  const queryClient = useQueryClient();
  const [courses, setCourses] = useState<Record<number, number>>({});
  const [actions, setActions] = useState<Record<number, string>>({});
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (setorId) p.set('setor_id', String(setorId));
    if (funcaoId) p.set('funcao_id', String(funcaoId));
    return p.toString();
  }, [funcaoId, setorId]);
  const reconciliation = useQuery({
    queryKey: ['training-compliance', 'reconciliation', setorId, funcaoId],
    queryFn: async () =>
      readJson<Reconciliation>(
        await fetchWithAuth(
          `/api/compliance-treinamentos/reconciliacao${params ? `?${params}` : ''}`,
        ),
      ),
  });
  const invalidate = async () =>
    queryClient.invalidateQueries({ queryKey: ['training-compliance'] });

  const enroll = useMutation({
    mutationFn: async (gap: Reconciliation['gaps_matricula'][number]) => {
      const cursoId =
        courses[gap.qualificacao_tipo_id] ||
        (gap.cursos_ead.length === 1 ? gap.cursos_ead[0].id : 0);
      if (!cursoId) throw new Error('Selecione qual curso EAD será usado para a matrícula.');
      const response = await fetchWithAuth('/api/lms/matriculas/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funcionario_ids: gap.funcionarios.map((f) => f.id),
          curso_id: cursoId,
          observacoes: 'Matrícula criada pela reconciliação do Compliance de Treinamentos.',
          enviar_convite_email: false,
        }),
      });
      return readJson<{ criadas: number; ignoradas: number; erros: number }>(response);
    },
    onSuccess: async (data) => {
      showToast.success(
        `${data.criadas} matrícula(s) criada(s); ${data.ignoradas} já existente(s).`,
      );
      await invalidate();
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao matricular gaps'),
  });

  const invite = useMutation({
    mutationFn: async (matriculaIds: number[]) => {
      const response = await fetchWithAuth('/api/lms/matriculas/convites/lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricula_ids: matriculaIds }),
      });
      return readJson<{ enviados: number; sem_email: number; falhas: number; nao_encontradas: number }>(
        response,
      );
    },
    onSuccess: (data) => {
      showToast.success(
        `${data.enviados} convite(s) enviado(s); ${data.sem_email} sem e-mail; ${data.falhas} falha(s).`,
      );
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao enviar convites'),
  });

  const reconcile = useMutation({
    mutationFn: async (row: Reconciliation['matriculas_revisao'][number]) => {
      const action = actions[row.matricula_id] || '';
      if (!action) throw new Error('Escolha uma ação de reconciliação.');
      if (action === 'REABRIR') {
        return readJson(
          await fetchWithAuth(
            `/api/compliance-treinamentos/reconciliacao/${row.matricula_id}/decisao`,
            { method: 'DELETE' },
          ),
        );
      }
      if (action === 'MANTER_AVULSA') {
        return readJson(
          await fetchWithAuth(
            `/api/compliance-treinamentos/reconciliacao/${row.matricula_id}/decisao`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ decisao: 'MANTER_AVULSA' }),
            },
          ),
        );
      }
      if (!row.qualificacao_tipo_id)
        throw new Error('Este curso precisa primeiro ser vinculado a um modelo de qualificação.');
      const body: Record<string, unknown> = {
        qualificacao_tipo_id: row.qualificacao_tipo_id,
        obrigatoriedade: action === 'RECOMENDAR_PESSOA' ? 'RECOMENDADA' : 'OBRIGATORIA',
        origem: 'EMPRESA',
        referencia_normativa: 'Reconciliação de matrícula LMS',
      };
      if (action === 'VINCULAR_SETOR')
        Object.assign(body, { escopo: 'SETOR', setor_id: row.setor_id });
      if (action === 'VINCULAR_FUNCAO')
        Object.assign(body, { escopo: 'FUNCAO', funcao_id: row.funcao_id });
      if (action === 'VINCULAR_SETOR_FUNCAO')
        Object.assign(body, {
          escopo: 'SETOR_FUNCAO',
          setor_id: row.setor_id,
          funcao_id: row.funcao_id,
        });
      if (action === 'RECOMENDAR_PESSOA')
        Object.assign(body, { escopo: 'FUNCIONARIO', funcionario_id: row.funcionario_id });
      if (!body.escopo) throw new Error('Ação inválida.');
      const sameEffectiveScope = row.regra_efetiva?.escopo === body.escopo;
      const endpoint = sameEffectiveScope
        ? `/api/compliance-treinamentos/regras/${row.regra_efetiva?.id}`
        : '/api/compliance-treinamentos/regras';
      return readJson(
        await fetchWithAuth(endpoint, {
          method: sameEffectiveScope ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    },
    onSuccess: async () => {
      showToast.success('Reconciliação aplicada.');
      await invalidate();
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao reconciliar matrícula'),
  });

  const data = reconciliation.data;
  if (reconciliation.isLoading)
    return <div className="p-6 text-sm text-slate-500">Analisando matrículas e matriz...</div>;
  if (!data) return null;
  return (
    <div className="space-y-5 p-4">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <strong>Matrícula não define obrigação.</strong> Esta tela identifica divergências; nenhuma
        matrícula histórica vira requisito automaticamente.
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Mini label="Matrículas alinhadas" value={data.resumo.matriculas_alinhadas} good />
        <Mini label="Gaps sem matrícula" value={data.resumo.gaps_matricula_acionaveis} />
        <Mini label="Matriculados sem requisito" value={data.resumo.matriculados_sem_requisito} />
        <Mini label="N/A matriculados" value={data.resumo.nao_aplica_matriculados} />
      </div>

      <section>
        <h3 className="font-semibold text-slate-900">Necessidades sem matrícula</h3>
        <p className="mt-1 text-sm text-slate-500">
          Inclui requisitos obrigatórios e recomendados que precisam de matrícula. A matrícula em lote só acontece quando você clicar em “Matricular gaps”. Nenhum e-mail é enviado nessa etapa.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Treinamento</th>
                <th className="px-3 py-3 text-right">Pessoas</th>
                <th className="px-3 py-3 text-right">Vencidos</th>
                <th className="px-3 py-3 text-right">Nunca fez</th>
                <th className="px-3 py-3 text-left">Curso EAD</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.gaps_matricula.map((gap) => (
                <tr key={gap.qualificacao_tipo_id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{gap.qualificacao_tipo_nome}</div>
                    <div className="text-xs text-slate-400">
                      {gap.qualificacao_tipo_codigo || '—'}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">{gap.pessoas}</td>
                  <td className="px-3 py-3 text-right text-red-700">{gap.vencidos}</td>
                  <td className="px-3 py-3 text-right text-orange-700">{gap.nunca_realizados}</td>
                  <td className="px-3 py-3">
                    <select
                      value={
                        courses[gap.qualificacao_tipo_id] ??
                        (gap.cursos_ead.length === 1 ? gap.cursos_ead[0].id : '')
                      }
                      onChange={(e) =>
                        setCourses((old) => ({
                          ...old,
                          [gap.qualificacao_tipo_id]: Number(e.target.value),
                        }))
                      }
                      className="max-w-[280px] rounded-md border border-slate-300 px-2 py-1.5"
                      disabled={!gap.cursos_ead.length}
                    >
                      {!gap.cursos_ead.length ? (
                        <option value="">Sem EAD vinculado</option>
                      ) : (
                        <option value="">Selecione o curso</option>
                      )}
                      {gap.cursos_ead.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.titulo}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      disabled={!gap.cursos_ead.length || enroll.isPending}
                      onClick={() => enroll.mutate(gap)}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      <UserPlus className="h-4 w-4" /> Matricular gaps (sem e-mail)
                    </button>
                  </td>
                </tr>
              ))}
              {!data.gaps_matricula.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Nenhum gap de matrícula acionável.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="font-semibold text-slate-900">Convites de matrícula por e-mail</h3>
        <p className="mt-1 text-sm text-slate-500">
          A matrícula e o convite são etapas separadas. Envie o e-mail somente quando a matriz já estiver revisada.
        </p>
        <div className="mt-3 space-y-2">
          {Array.from(
            (data.convites_matricula || []).reduce((map, row) => {
              const current = map.get(row.curso_id) || { titulo: row.curso_titulo, ids: [] as number[] };
              current.ids.push(row.matricula_id);
              map.set(row.curso_id, current);
              return map;
            }, new Map<number, { titulo: string; ids: number[] }>()),
          ).map(([cursoId, group]) => (
            <div key={cursoId} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium text-slate-800">{group.titulo}</div>
                <div className="text-xs text-slate-500">{group.ids.length} matrícula(s) ainda não iniciada(s)</div>
              </div>
              <button
                type="button"
                disabled={invite.isPending}
                onClick={() => invite.mutate(group.ids)}
                className="rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary disabled:opacity-40"
              >
                Enviar/re-enviar convite por e-mail
              </button>
            </div>
          ))}
          {!data.convites_matricula?.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Nenhuma matrícula não iniciada disponível para convite.
            </div>
          ) : null}
        </div>
      </section>

      <section>
        <h3 className="font-semibold text-slate-900">Matrículas para revisar</h3>
        <p className="mt-1 text-sm text-slate-500">
          Vincule a matrícula à necessidade correta ou confirme que ela deve permanecer avulsa.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Pessoa</th>
                <th className="px-3 py-3 text-left">Setor / cargo</th>
                <th className="px-3 py-3 text-left">Matrícula</th>
                <th className="px-3 py-3 text-left">Situação</th>
                <th className="px-3 py-3 text-left">Ação</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.matriculas_revisao.map((row) => (
                <tr key={row.matricula_id}>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.funcionario_nome}</td>
                  <td className="px-3 py-3 text-slate-600">
                    {row.setor_nome || 'Sem setor'}
                    <div className="text-xs text-slate-400">{row.funcao_nome || 'Sem cargo'}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div>{row.curso_titulo}</div>
                    <div className="text-xs text-slate-400">
                      {row.qualificacao_tipo_nome || 'Sem modelo'} · {row.matricula_status}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded px-2 py-1 text-xs font-medium ${row.situacao === 'MATRICULA_AVULSA_RECONCILIADA' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}
                    >
                      {situationLabels[row.situacao] || row.situacao}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={actions[row.matricula_id] || ''}
                      onChange={(e) =>
                        setActions((old) => ({ ...old, [row.matricula_id]: e.target.value }))
                      }
                      className="rounded-md border border-slate-300 px-2 py-1.5"
                    >
                      <option value="">Selecione...</option>
                      {row.situacao === 'MATRICULA_AVULSA_RECONCILIADA' ? (
                        <option value="REABRIR">Reabrir revisão</option>
                      ) : (
                        <>
                          {row.setor_id ? (
                            <option value="VINCULAR_SETOR">Obrigatório para o setor</option>
                          ) : null}
                          {row.funcao_id ? (
                            <option value="VINCULAR_FUNCAO">Obrigatório para o cargo</option>
                          ) : null}
                          {row.setor_id && row.funcao_id ? (
                            <option value="VINCULAR_SETOR_FUNCAO">
                              Obrigatório para setor + cargo
                            </option>
                          ) : null}
                          {row.qualificacao_tipo_id ? (
                            <option value="RECOMENDAR_PESSOA">
                              Recomendado só para esta pessoa
                            </option>
                          ) : null}
                          <option value="MANTER_AVULSA">Manter matrícula avulsa</option>
                        </>
                      )}
                    </select>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      disabled={!actions[row.matricula_id] || reconcile.isPending}
                      onClick={() => reconcile.mutate(row)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      <Link2 className="h-4 w-4" /> Aplicar
                    </button>
                  </td>
                </tr>
              ))}
              {!data.matriculas_revisao.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-emerald-700">
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> Nenhuma matrícula pendente de revisão.
                    </span>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {data.resumo.cursos_sem_modelo ? (
          <div className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {data.resumo.cursos_sem_modelo}{' '}
            matrícula(s) usam curso sem modelo de qualificação e precisam ser vinculadas antes de
            virar requisito.
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Mini({ label, value, good = false }: { label: string; value: number; good?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${good ? 'text-emerald-700' : 'text-slate-900'}`}>
        {value}
      </div>
    </div>
  );
}
