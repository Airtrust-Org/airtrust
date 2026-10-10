import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Link2, UserPlus } from 'lucide-react';
import { fetchWithAuth } from '@/react-app/config/api';
import { showToast } from '@/react-app/utils/toast';
import { notifyComplianceSaveWithEnrollment } from './complianceEnrollmentFeedback';
import {
  nextComplianceTableSort,
  sortComplianceRows,
  SortableComplianceTableHeader,
  type TableSortState,
} from '@/react-app/components/compliance/SortableComplianceTableHeader';

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
    qualificacao_tipo_codigo?: string | null;
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
type GapSortKey = 'training' | 'people' | 'expired' | 'never' | 'course';
type ReviewSortKey = 'person' | 'sector' | 'enrollment' | 'situation' | 'action';

export function TrainingEnrollmentReconciliation({ setorId, funcaoId }: Props) {
  const queryClient = useQueryClient();
  const [courses, setCourses] = useState<Record<number, number>>({});
  const [actions, setActions] = useState<Record<number, string>>({});
  const [syncPreview, setSyncPreview] = useState<{ pendentes: number; sem_curso_unico: number } | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<{
    elegiveis: Array<{ matricula_id: number; status: string }>;
    bloqueadas: Array<{ matricula_id: number; motivo: string }>;
  } | null>(null);
  const [section, setSection] = useState<'gaps' | 'convites' | 'revisao'>('gaps');
  const [gapSort, setGapSort] = useState<TableSortState<GapSortKey>>({
    key: 'training',
    direction: 'asc',
  });
  const [reviewSort, setReviewSort] = useState<TableSortState<ReviewSortKey>>({
    key: 'person',
    direction: 'asc',
  });
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
      return readJson<{
        enviados: number;
        sem_email: number;
        falhas: number;
        nao_encontradas: number;
      }>(response);
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
    onSuccess: async (result) => {
      notifyComplianceSaveWithEnrollment(result, 'Reconciliação aplicada.');
      await invalidate();
    },
    onError: (error) =>
      showToast.error(error instanceof Error ? error.message : 'Erro ao reconciliar matrícula'),
  });

  const syncPending = useMutation({
    mutationFn: async (aplicar: boolean) => {
      const call = async () => readJson<{
        modo: string; pendentes: number; matriculadas: number;
        restantes_estimadas: number; sem_curso_unico: number;
      }>(await fetchWithAuth('/api/compliance-treinamentos/reconciliacao/matricular-pendentes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aplicar }),
      }));
      if (!aplicar) return call();
      let total = 0;
      let finalResult = await call();
      total += finalResult.matriculadas;
      // Cada chamada executa no maximo 40 ciclos; parar se nao houve progresso.
      for (let lote = 1; lote < 50 && finalResult.restantes_estimadas > 0; lote += 1) {
        if (!finalResult.matriculadas) throw new Error('Sincronizacao sem progresso; rever bloqueios no LMS.');
        finalResult = await call();
        total += finalResult.matriculadas;
      }
      if (finalResult.restantes_estimadas > 0)
        throw new Error('Ainda existem pendencias; execute uma nova conciliacao.');
      return { ...finalResult, matriculadas: total };
    },
    onSuccess: async (result, aplicar) => {
      if (!aplicar) {
        setSyncPreview({ pendentes: result.pendentes, sem_curso_unico: result.sem_curso_unico });
        return;
      }
      setSyncPreview(null);
      showToast.success(`${result.matriculadas} ciclo(s) LMS criado(s) ou renovado(s) sem e-mail.`);
      await invalidate();
    },
    onError: (error) => {
      setSyncPreview(null);
      showToast.error(error instanceof Error ? error.message : 'Erro ao criar matriculas pendentes');
      void invalidate();
    },
  });

  const cleanup = useMutation({
    mutationFn: async (args: { ids: number[]; aplicar: boolean }) => {
      const result = {
        elegiveis: [] as Array<{ matricula_id: number; status: string }>,
        bloqueadas: [] as Array<{ matricula_id: number; motivo: string }>,
        canceladas: 0,
      };
      // O backend aceita no maximo 100 por transacao; executar todos os lotes
      // existentes na revisao sem exigir que o administrador repita manualmente.
      for (let i = 0; i < args.ids.length; i += 100) {
        const data = await readJson<typeof result>(
          await fetchWithAuth('/api/compliance-treinamentos/reconciliacao/limpeza', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ matricula_ids: args.ids.slice(i, i + 100), aplicar: args.aplicar }),
          }),
        );
        result.elegiveis.push(...data.elegiveis);
        result.bloqueadas.push(...data.bloqueadas);
        result.canceladas += data.canceladas;
      }
      return result;
    },
    onSuccess: async (result, args) => {
      if (!args.aplicar) {
        setCleanupPreview(result);
        return;
      }
      setCleanupPreview(null);
      showToast.success(`${result.canceladas} matrícula(s) indevida(s) cancelada(s) logicamente. Histórico preservado.`);
      await invalidate();
    },
    onError: (error) => {
      setCleanupPreview(null);
      showToast.error(error instanceof Error ? error.message : 'Falha na limpeza de matrículas');
      void invalidate();
    },
  });

  const data = reconciliation.data;
  const sortedGaps = useMemo(
    () =>
      sortComplianceRows(data?.gaps_matricula || [], gapSort, (row, key) => {
        if (key === 'training') return row.qualificacao_tipo_nome;
        if (key === 'people') return row.pessoas;
        if (key === 'expired') return row.vencidos;
        if (key === 'never') return row.nunca_realizados;
        return row.cursos_ead.map((course) => course.titulo).join(' ');
      }),
    [data?.gaps_matricula, gapSort],
  );
  const cleanupCandidates = (data?.matriculas_revisao || []).filter(
    (row) =>
      ['MATRICULADO_SEM_REQUISITO', 'NAO_APLICA_MATRICULADO'].includes(row.situacao) &&
      ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(String(row.matricula_status || '').trim().toUpperCase()),
  );
  const cleanupIds = cleanupCandidates.map((row) => row.matricula_id);
  const sortedReviews = useMemo(
    () =>
      sortComplianceRows(data?.matriculas_revisao || [], reviewSort, (row, key) => {
        if (key === 'person') return row.funcionario_nome;
        if (key === 'sector') return `${row.setor_nome || ''} ${row.funcao_nome || ''}`;
        if (key === 'enrollment') return row.curso_titulo;
        if (key === 'situation') return row.situacao;
        return actions[row.matricula_id] || '';
      }),
    [actions, data?.matriculas_revisao, reviewSort],
  );
  if (reconciliation.isLoading)
    return <div className="p-6 text-sm text-slate-500">Analisando matrículas e matriz...</div>;
  if (!data) return null;
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:flex-row lg:items-center lg:justify-between">
        <p className="text-sm text-slate-600">
          <strong className="text-slate-800">Matrícula não define obrigação.</strong> Use esta área
          apenas para corrigir divergências entre a matriz e o LMS.
        </p>
        <span className="whitespace-nowrap text-xs font-medium text-emerald-700">
          {data.resumo.matriculas_alinhadas} matrícula(s) alinhada(s)
        </span>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
        {(
          [
            ['gaps', 'A matricular', data.resumo.gaps_matricula_acionaveis],
            ['convites', 'Convites', data.convites_matricula.length],
            ['revisao', 'Revisar', data.matriculas_revisao.length],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSection(value)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
              section === value ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                section === value ? 'bg-white/80 text-primary' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {section === 'gaps' ? (
        <section>
          <h3 className="font-semibold text-slate-900">A matricular</h3>
          <div className="my-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-medium text-slate-900">Conciliar requisitos e matrículas de todos os cargos</p>
            <p className="mt-1 text-slate-600">
              Usa o histórico de qualificações para matricular quem nunca fez, está vencido ou
              entrou na janela de renovação de 60 dias. Conserva treinamentos concluídos e
              matrículas em andamento. Cursos presenciais e sem vínculo EAD único são sinalizados.
            </p>
            {!syncPreview ? (
              <button type="button"
                disabled={syncPending.isPending}
                onClick={() => syncPending.mutate(false)}
                className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">
                Analisar matrículas pendentes
              </button>
            ) : (
              <div className="mt-3 space-y-2">
                <p>{syncPreview.pendentes} novo(s) ciclo(s) necessário(s);
                  {' '}{syncPreview.sem_curso_unico} pendência(s) sem curso EAD publicado único.</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button"
                    disabled={syncPending.isPending || syncPreview.pendentes === 0}
                    onClick={() => syncPending.mutate(true)}
                    className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                    Confirmar matrículas pendentes
                  </button>
                  <button type="button" onClick={() => setSyncPreview(null)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs">
                    Voltar sem alterar
                  </button>
                </div>
              </div>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Requisitos sem matrícula correspondente. A matrícula é criada sem envio de e-mail.
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <SortableComplianceTableHeader
                    column="training"
                    label="Treinamento"
                    sort={gapSort}
                    onSort={(key) => setGapSort((current) => nextComplianceTableSort(current, key))}
                    className="px-4 py-3 text-left"
                  />
                  <SortableComplianceTableHeader
                    column="people"
                    label="Pessoas"
                    sort={gapSort}
                    onSort={(key) => setGapSort((current) => nextComplianceTableSort(current, key))}
                    className="px-3 py-3 text-right"
                  />
                  <SortableComplianceTableHeader
                    column="expired"
                    label="Vencidos"
                    sort={gapSort}
                    onSort={(key) => setGapSort((current) => nextComplianceTableSort(current, key))}
                    className="px-3 py-3 text-right"
                  />
                  <SortableComplianceTableHeader
                    column="never"
                    label="Nunca fez"
                    sort={gapSort}
                    onSort={(key) => setGapSort((current) => nextComplianceTableSort(current, key))}
                    className="px-3 py-3 text-right"
                  />
                  <SortableComplianceTableHeader
                    column="course"
                    label="Curso EAD"
                    sort={gapSort}
                    onSort={(key) => setGapSort((current) => nextComplianceTableSort(current, key))}
                  />
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedGaps.map((gap) => (
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
                        aria-label={`Curso EAD para ${gap.qualificacao_tipo_nome}`}
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
                        className="max-w-[280px] rounded-md border border-slate-300 px-2 py-1.5 text-xs leading-5 text-slate-700"
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
                        aria-label="Matricular gaps (sem e-mail)"
                        disabled={!gap.cursos_ead.length || enroll.isPending}
                        onClick={() => enroll.mutate(gap)}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        <UserPlus className="h-4 w-4" /> Matricular
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
      ) : null}

      {section === 'convites' ? (
        <section>
          <h3 className="font-semibold text-slate-900">Convites de matrícula</h3>
          <p className="mt-1 text-sm text-slate-500">
            Matrículas já criadas que ainda não foram iniciadas.
          </p>
          <div className="mt-3 space-y-2">
            {Array.from(
              (data.convites_matricula || []).reduce((map, row) => {
                const current = map.get(row.curso_id) || {
                  titulo: row.curso_titulo,
                  ids: [] as number[],
                };
                current.ids.push(row.matricula_id);
                map.set(row.curso_id, current);
                return map;
              }, new Map<number, { titulo: string; ids: number[] }>()),
            ).map(([cursoId, group]) => (
              <div
                key={cursoId}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-800">{group.titulo}</div>
                  <div className="text-xs text-slate-500">
                    {group.ids.length} matrícula(s) ainda não iniciada(s)
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Enviar/re-enviar convite por e-mail"
                  disabled={invite.isPending}
                  onClick={() => invite.mutate(group.ids)}
                  className="rounded-lg border border-primary px-3 py-2 text-xs font-semibold text-primary disabled:opacity-40"
                >
                  Enviar convite
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
      ) : null}

      {section === 'revisao' ? (
        <section>
          <h3 className="font-semibold text-slate-900">Revisar matrículas</h3>
          <p className="mt-1 text-sm text-slate-500">
            Vincule a matrícula à necessidade correta ou confirme que ela deve permanecer avulsa.
          </p>
          {cleanupIds.length ? (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-semibold text-slate-900">Limpeza de matrículas sem requisito</p>
              <p className="mt-1 text-slate-600">
                Processa todas as matrículas em lotes transacionais de até 100. Apenas QSMS/Segurança Operacional sem requisito
                vigente podem ser canceladas. Cursos fora dessa matriz, designações mantidas e
                conclusões históricas permanecem preservados. O progresso existente não é apagado.
              </p>
              {!cleanupPreview ? (
                <button
                  type="button"
                  disabled={cleanup.isPending}
                  onClick={() => cleanup.mutate({ ids: cleanupIds, aplicar: false })}
                  className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  Analisar limpeza ({cleanupIds.length} matrícula(s))
                </button>
              ) : (
                <div className="mt-3 space-y-2">
                  <p>
                    {cleanupPreview.elegiveis.length} elegível(is) para cancelamento lógico;
                    {' '}{cleanupPreview.bloqueadas.length} bloqueada(s)/preservada(s).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!cleanupPreview.elegiveis.length || cleanup.isPending}
                      onClick={() => cleanup.mutate({
                        ids: cleanupPreview.elegiveis.map((item) => item.matricula_id),
                        aplicar: true,
                      })}
                      className="rounded-md bg-red-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Confirmar cancelamento das {cleanupPreview.elegiveis.length} elegível(is)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCleanupPreview(null)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs"
                    >
                      Voltar sem alterar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <SortableComplianceTableHeader
                    column="person"
                    label="Pessoa"
                    sort={reviewSort}
                    onSort={(key) =>
                      setReviewSort((current) => nextComplianceTableSort(current, key))
                    }
                    className="px-4 py-3 text-left"
                  />
                  <SortableComplianceTableHeader
                    column="sector"
                    label="Setor / função"
                    sort={reviewSort}
                    onSort={(key) =>
                      setReviewSort((current) => nextComplianceTableSort(current, key))
                    }
                  />
                  <SortableComplianceTableHeader
                    column="enrollment"
                    label="Matrícula"
                    sort={reviewSort}
                    onSort={(key) =>
                      setReviewSort((current) => nextComplianceTableSort(current, key))
                    }
                  />
                  <SortableComplianceTableHeader
                    column="situation"
                    label="Situação"
                    sort={reviewSort}
                    onSort={(key) =>
                      setReviewSort((current) => nextComplianceTableSort(current, key))
                    }
                  />
                  <SortableComplianceTableHeader
                    column="action"
                    label="Ação"
                    sort={reviewSort}
                    onSort={(key) =>
                      setReviewSort((current) => nextComplianceTableSort(current, key))
                    }
                  />
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedReviews.map((row) => (
                  <tr key={row.matricula_id}>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.funcionario_nome}</td>
                    <td className="px-3 py-3 text-slate-600">
                      {row.setor_nome || 'Sem setor'}
                      <div className="text-xs text-slate-400">
                        {row.funcao_nome || 'Sem função'}
                      </div>
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
                              <option value="VINCULAR_FUNCAO">Obrigatório para a função</option>
                            ) : null}
                            {row.setor_id && row.funcao_id ? (
                              <option value="VINCULAR_SETOR_FUNCAO">
                                Obrigatório para setor + função
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
      ) : null}
    </div>
  );
}
