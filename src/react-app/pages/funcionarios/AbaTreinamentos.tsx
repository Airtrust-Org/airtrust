import { AlertCircle, BookOpen, CheckCircle2, Clock3, PlayCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchWithAuth } from '@/react-app/config/api';

type Treinamento = {
  id: number;
  status: 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REPROVADO' | 'CANCELADO';
  progresso_pct: number;
  data_conclusao?: string | null;
  prazo_conclusao?: string | null;
  titulo: string;
  tipo_conteudo: 'scorm' | 'h5p' | 'video';
};

type RequisitoMatriz = {
  matriz_id: number;
  qualificacao_tipo_id: number;
  qualificacao_tipo_nome: string;
  qualificacao_tipo_codigo?: string | null;
  obrigatoriedade: 'OBRIGATORIA' | 'RECOMENDADA' | 'NAO_APLICA';
  critico_operacional: boolean;
  origem: string;
  data_validade?: string | null;
  status: 'EM_DIA' | 'VENCIDO' | 'EM_FALTA';
  dias_para_vencer?: number | null;
};

function statusLabel(status: Treinamento['status']) {
  switch (status) {
    case 'CONCLUIDO':
      return { label: 'Concluído', cls: 'bg-emerald-50 text-emerald-700' };
    case 'EM_ANDAMENTO':
      return { label: 'Em andamento', cls: 'bg-amber-50 text-amber-700' };
    case 'REPROVADO':
      return { label: 'Reprovado', cls: 'bg-red-50 text-red-700' };
    case 'CANCELADO':
      return { label: 'Cancelado', cls: 'bg-slate-100 text-slate-600' };
    default:
      return { label: 'Pendente', cls: 'bg-blue-50 text-blue-700' };
  }
}

function tipoLabel(tipo: Treinamento['tipo_conteudo']) {
  switch (tipo) {
    case 'h5p':
      return 'H5P';
    case 'video':
      return 'Vídeo';
    default:
      return 'SCORM';
  }
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}

export default function AbaTreinamentos({
  treinamentos,
  funcionarioId,
}: {
  treinamentos: Treinamento[];
  funcionarioId: number | string;
}) {
  const requisitosQuery = useQuery({
    queryKey: ['matriz-treinamento', 'requisitos-funcionario', funcionarioId],
    enabled: Boolean(funcionarioId),
    queryFn: async (): Promise<RequisitoMatriz[]> => {
      const response = await fetchWithAuth(
        `/api/matriz-treinamento/requisitos/${funcionarioId}?t=${Date.now()}`,
      );
      const json = (await response.json().catch(() => ({}))) as { data?: RequisitoMatriz[] };
      return json.data || [];
    },
  });

  const requisitos = requisitosQuery.data || [];
  const requisitosEmDia = requisitos.filter((item) => item.status === 'EM_DIA').length;
  const requisitosVencidos = requisitos.filter((item) => item.status === 'VENCIDO').length;
  const requisitosEmFalta = requisitos.filter((item) => item.status === 'EM_FALTA').length;
  const concluidos = treinamentos.filter((item) => item.status === 'CONCLUIDO').length;
  const emAndamento = treinamentos.filter((item) => item.status === 'EM_ANDAMENTO').length;
  const pendentes = treinamentos.filter((item) => item.status === 'NAO_INICIADO').length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Concluídos
              </p>
              <p className="text-2xl font-bold text-slate-900">{concluidos}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-amber-50 p-2 text-amber-700">
              <PlayCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Em andamento
              </p>
              <p className="text-2xl font-bold text-slate-900">{emAndamento}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-50 p-2 text-blue-700">
              <Clock3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Pendentes
              </p>
              <p className="text-2xl font-bold text-slate-900">{pendentes}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <BookOpen className="h-4 w-4 text-slate-500" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Matriz da Função</h3>
            <p className="text-xs text-slate-500">
              Requisitos da função atual com status de aderência por qualificação.
            </p>
          </div>
        </div>

        {requisitosQuery.isLoading ? (
          <div className="px-4 py-6 text-sm text-slate-500">Carregando requisitos da matriz...</div>
        ) : requisitos.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-500">
            Sem requisitos de matriz para a função atual.
          </div>
        ) : (
          <div className="space-y-3 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Em dia: <strong>{requisitosEmDia}</strong>
              </div>
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Vencido: <strong>{requisitosVencidos}</strong>
              </div>
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Em falta: <strong>{requisitosEmFalta}</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Qualificação</th>
                    <th className="px-3 py-2 text-left font-semibold">Obrigatoriedade</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                    <th className="px-3 py-2 text-left font-semibold">Validade</th>
                    <th className="px-3 py-2 text-right font-semibold">Dias</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {requisitos.map((item) => {
                    const statusClass =
                      item.status === 'EM_DIA'
                        ? 'bg-emerald-50 text-emerald-700'
                        : item.status === 'VENCIDO'
                          ? 'bg-red-50 text-red-700'
                          : 'bg-amber-50 text-amber-700';
                    return (
                      <tr key={item.matriz_id}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-900">
                            {item.qualificacao_tipo_nome}
                          </div>
                          {item.qualificacao_tipo_codigo ? (
                            <div className="text-xs text-slate-400">
                              {item.qualificacao_tipo_codigo}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-slate-700">{item.obrigatoriedade}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {formatDate(item.data_validade)}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-700">
                          {item.dias_para_vencer ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
          <BookOpen className="h-4 w-4 text-slate-500" />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Treinamentos</h3>
            <p className="text-xs text-slate-500">
              Histórico LMS do funcionário com progresso, status e prazo atual.
            </p>
          </div>
        </div>

        {treinamentos.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-8 text-slate-500">
            <AlertCircle className="h-5 w-5 text-slate-400" />
            <p className="text-sm">Nenhum treinamento LMS vinculado a este funcionário.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Curso</th>
                  <th className="px-4 py-3 text-left font-semibold">Tipo</th>
                  <th className="px-4 py-3 text-right font-semibold">Progresso</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Prazo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {treinamentos.map((item) => {
                  const badge = statusLabel(item.status);
                  return (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{item.titulo}</div>
                        <div className="text-xs text-slate-400">
                          Conclusão: {formatDate(item.data_conclusao)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{tipoLabel(item.tipo_conteudo)}</td>
                      <td className="px-4 py-3 text-right font-medium text-slate-700">
                        {Number(item.progresso_pct || 0)}%
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(item.prazo_conclusao)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
