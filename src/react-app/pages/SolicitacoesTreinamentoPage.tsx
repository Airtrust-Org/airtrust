/**
 * SolicitacoesTreinamentoPage — Fluxo completo de solicitações de treinamento
 * Workflow: SOLICITADA → APROVADA_GESTOR → APROVADA_OPS → AGENDADA → CONCLUIDA | REJEITADA
 * Rota: /treinamentos/solicitacoes
 */
import { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  CalendarCheck,
  AlertTriangle,
  Plus,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import PageHeader from '@/react-app/components/PageHeader';
import Button from '@/react-app/components/Button';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useTiposQualificacao } from '@/react-app/hooks/qualificacoes/useTiposQualificacao';
import { useFuncionariosAtivos } from '@/react-app/hooks/qualificacoes/useFuncionariosAtivos';
import {
  useSolicitacoesList,
  useSolicitacoesStats,
  useCreateSolicitacao,
  useAprovarGestor,
  useAprovarOps,
  useRejeitar,
  useAgendar,
  useConcluir,
  type Solicitacao,
  type SolicitacaoStatus,
  type TipoTreinamentoType,
  type PrioridadeType,
} from '@/react-app/hooks/useSolicitacoesTreinamento';

// ── helpers de estilo ────────────────────────────────────────────────────────

const STATUS_LABEL: Record<SolicitacaoStatus, string> = {
  SOLICITADA: 'Solicitada',
  APROVADA_GESTOR: 'Aprovada Gestor',
  APROVADA_OPS: 'Aprovada OPS',
  AGENDADA: 'Agendada',
  CONCLUIDA: 'Concluída',
  REJEITADA: 'Rejeitada',
};

const STATUS_CLASSES: Record<SolicitacaoStatus, string> = {
  SOLICITADA: 'bg-amber-50 text-amber-700 border-amber-200',
  APROVADA_GESTOR: 'bg-blue-50 text-blue-700 border-blue-200',
  APROVADA_OPS: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  AGENDADA: 'bg-purple-50 text-purple-700 border-purple-200',
  CONCLUIDA: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJEITADA: 'bg-red-50 text-red-700 border-red-200',
};

const PRIORIDADE_CLASSES: Record<PrioridadeType, string> = {
  BAIXA: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-blue-50 text-blue-600',
  ALTA: 'bg-amber-50 text-amber-700',
  URGENTE: 'bg-red-50 text-red-700',
};

function StatusBadge({ status }: { status: SolicitacaoStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function PrioridadeBadge({ prioridade }: { prioridade: PrioridadeType }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${PRIORIDADE_CLASSES[prioridade]}`}
    >
      {prioridade}
    </span>
  );
}

// ── modal de criação ─────────────────────────────────────────────────────────

interface CriarModalProps {
  onClose: () => void;
  selfId: number | null;
  canAdmin: boolean;
}

interface TipoQualificacaoOption {
  id: number;
  nome: string;
  codigo?: string | null;
}

function CriarModal({ onClose, selfId, canAdmin }: CriarModalProps) {
  const { data: funcionarios = [] } = useFuncionariosAtivos();
  const { data: tiposQualificacao = [], isLoading: tiposLoading } = useTiposQualificacao();
  const createMutation = useCreateSolicitacao();

  const [solicitanteId, setSolicitanteId] = useState<number>(selfId ?? 0);
  const [qualificacaoId, setQualificacaoId] = useState('');
  const [tipo, setTipo] = useState<TipoTreinamentoType>('RECORRENTE');
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [prioridade, setPrioridade] = useState<PrioridadeType>('NORMAL');
  const [dataPrevista, setDataPrevista] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.error('Título é obrigatório');
      return;
    }
    if (!solicitanteId) {
      toast.error('Selecione o solicitante');
      return;
    }
    if (!qualificacaoId) {
      toast.error('Selecione a qualificação para manter a solicitação integrada ao planejamento.');
      return;
    }
    try {
      await createMutation.mutateAsync({
        solicitante_id: solicitanteId,
        qualificacao_id: Number(qualificacaoId),
        tipo_treinamento: tipo,
        titulo: titulo.trim(),
        descricao: descricao || undefined,
        justificativa: justificativa || undefined,
        prioridade,
        data_prevista: dataPrevista || undefined,
      });
      toast.success('Solicitação criada com sucesso');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar solicitação');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
        data-testid="solicitacao-criar-modal"
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          Nova Solicitação de Treinamento
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="solicitacao-form">
          {canAdmin && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Solicitante</label>
              <select
                value={solicitanteId}
                onChange={(e) => setSolicitanteId(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="solicitacao-solicitante"
                required
              >
                <option value="">Selecione</option>
                {(funcionarios as Array<{ id: number; nome: string }>).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Qualificação</label>
            <select
              value={qualificacaoId}
              onChange={(e) => {
                const nextId = e.target.value;
                const selected = (tiposQualificacao as TipoQualificacaoOption[]).find(
                  (tipoItem) => String(tipoItem.id) === nextId,
                );
                setQualificacaoId(nextId);
                if (selected && !titulo.trim()) {
                  setTitulo(selected.nome);
                }
              }}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={tiposLoading}
              data-testid="solicitacao-qualificacao"
            >
              <option value="">{tiposLoading ? 'Carregando...' : 'Selecione'}</option>
              {(tiposQualificacao as TipoQualificacaoOption[]).map((tipoItem) => (
                <option key={tipoItem.id} value={tipoItem.id}>
                  {tipoItem.codigo ? `${tipoItem.codigo} · ${tipoItem.nome}` : tipoItem.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Tipo de treinamento
            </label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoTreinamentoType)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="solicitacao-tipo"
            >
              {(
                [
                  'INICIAL',
                  'RECORRENTE',
                  'SEMESTRAL',
                  'UPGRADE',
                  'ESPECIFICO',
                ] as TipoTreinamentoType[]
              ).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Título *</label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Renovação CMA Classe 1"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="solicitacao-titulo"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Prioridade</label>
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value as PrioridadeType)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="solicitacao-prioridade"
              >
                {(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] as PrioridadeType[]).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Data prevista</label>
              <input
                type="date"
                value={dataPrevista}
                onChange={(e) => setDataPrevista(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="solicitacao-data-prevista"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Justificativa</label>
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              placeholder="Por que este treinamento é necessário?"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              data-testid="solicitacao-justificativa"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              data-testid="solicitacao-criar-submit"
            >
              Criar Solicitação
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── modal de detalhe + ações ─────────────────────────────────────────────────

interface DetalheModalProps {
  item: Solicitacao;
  canAdmin: boolean;
  onClose: () => void;
}

function DetalheModal({ item, canAdmin, onClose }: DetalheModalProps) {
  const [motivo, setMotivo] = useState('');
  const [dataAgendada, setDataAgendada] = useState(item.data_prevista ?? '');
  const [confirmRejeitar, setConfirmRejeitar] = useState(false);

  const aprovarGestor = useAprovarGestor();
  const aprovarOps = useAprovarOps();
  const rejeitar = useRejeitar();
  const agendar = useAgendar();
  const concluir = useConcluir();

  const act = async (fn: () => Promise<unknown>, successMsg: string) => {
    try {
      await fn();
      toast.success(successMsg);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro na operação');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"
        data-testid="solicitacao-detalhe-modal"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{item.titulo}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Solicitado por{' '}
              <span className="font-medium">
                {item.solicitante_nome ?? `ID ${item.solicitante_id}`}
              </span>
              {item.solicitante_guerra ? ` (${item.solicitante_guerra})` : ''}
            </p>
          </div>
          <StatusBadge status={item.status} />
        </div>

        <dl className="grid gap-2 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Tipo</dt>
            <dd className="font-medium text-slate-800">{item.tipo_treinamento}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Prioridade</dt>
            <dd>
              <PrioridadeBadge prioridade={item.prioridade} />
            </dd>
          </div>
          {item.qualificacao_nome && (
            <div className="col-span-2">
              <dt className="text-slate-500">Qualificação</dt>
              <dd className="font-medium text-slate-800">
                {item.qualificacao_nome} ({item.qualificacao_codigo})
              </dd>
            </div>
          )}
          {item.data_prevista && (
            <div>
              <dt className="text-slate-500">Data prevista</dt>
              <dd className="font-medium text-slate-800">{item.data_prevista}</dd>
            </div>
          )}
          {item.data_agendada && (
            <div>
              <dt className="text-slate-500">Data agendada</dt>
              <dd className="font-medium text-slate-800">{item.data_agendada}</dd>
            </div>
          )}
        </dl>

        {item.justificativa && (
          <div className="mt-4">
            <p className="mb-1 text-sm font-medium text-slate-700">Justificativa</p>
            <p className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
              {item.justificativa}
            </p>
          </div>
        )}

        {item.motivo_rejeicao && (
          <div className="mt-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            <span className="font-medium">Motivo da rejeição: </span>
            {item.motivo_rejeicao}
          </div>
        )}

        {/* Workflow: Histórico de timestamps */}
        <div className="mt-4 space-y-1 text-xs text-slate-500">
          {item.aprovado_gestor_em && <p>✅ Aprovado pelo gestor em {item.aprovado_gestor_em}</p>}
          {item.aprovado_ops_em && <p>✅ Aprovado por OPS em {item.aprovado_ops_em}</p>}
          {item.rejeitado_em && <p>❌ Rejeitado em {item.rejeitado_em}</p>}
        </div>

        {/* Ações do workflow (somente admins/gestores) */}
        {canAdmin && (
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            {/* Aprovar como gestor */}
            {item.status === 'SOLICITADA' && (
              <Button
                className="w-full"
                onClick={() =>
                  act(() => aprovarGestor.mutateAsync({ id: item.id }), 'Aprovado como gestor')
                }
                loading={aprovarGestor.isPending}
                data-testid="solicitacao-aprovar-gestor"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Aprovar como Gestor
              </Button>
            )}

            {/* Aprovar como OPS */}
            {item.status === 'APROVADA_GESTOR' && (
              <Button
                className="w-full"
                onClick={() =>
                  act(() => aprovarOps.mutateAsync({ id: item.id }), 'Aprovado por OPS')
                }
                loading={aprovarOps.isPending}
                data-testid="solicitacao-aprovar-ops"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Aprovação OPS
              </Button>
            )}

            {/* Agendar */}
            {item.status === 'APROVADA_OPS' && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  Data do treinamento
                </label>
                <input
                  type="date"
                  value={dataAgendada}
                  onChange={(e) => setDataAgendada(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  data-testid="solicitacao-agendar-data"
                />
                <Button
                  className="w-full"
                  disabled={!dataAgendada}
                  onClick={() =>
                    act(
                      () =>
                        agendar.mutateAsync({ id: item.id, body: { data_prevista: dataAgendada } }),
                      'Treinamento agendado',
                    )
                  }
                  loading={agendar.isPending}
                  data-testid="solicitacao-agendar-confirmar"
                >
                  <CalendarCheck className="mr-2 h-4 w-4" />
                  Confirmar Agendamento
                </Button>
              </div>
            )}

            {/* Concluir */}
            {item.status === 'AGENDADA' && (
              <Button
                className="w-full"
                onClick={() =>
                  act(() => concluir.mutateAsync({ id: item.id }), 'Treinamento concluído!')
                }
                loading={concluir.isPending}
                data-testid="solicitacao-concluir"
              >
                <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" />
                Marcar como Concluído
              </Button>
            )}

            {/* Rejeitar — disponível até APROVADA_OPS */}
            {['SOLICITADA', 'APROVADA_GESTOR', 'APROVADA_OPS'].includes(item.status) && (
              <div className="space-y-2">
                {confirmRejeitar ? (
                  <>
                    <textarea
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Motivo da rejeição (opcional)"
                      rows={2}
                      className="w-full rounded-xl border border-red-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        className="flex-1"
                        onClick={() =>
                          act(
                            () => rejeitar.mutateAsync({ id: item.id, body: { motivo } }),
                            'Solicitação rejeitada',
                          )
                        }
                        loading={rejeitar.isPending}
                      >
                        Confirmar Rejeição
                      </Button>
                      <Button variant="secondary" onClick={() => setConfirmRejeitar(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button
                    variant="danger"
                    className="w-full"
                    onClick={() => setConfirmRejeitar(true)}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Rejeitar
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onClose} data-testid="solicitacao-fechar-detalhe">
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── página principal ─────────────────────────────────────────────────────────

export default function SolicitacoesTreinamentoPage() {
  const { user } = useAuth();
  const { isAdmin, isGestor } = usePermissions();
  const canAdmin = isAdmin || isGestor;
  const selfId = user?.funcionario_id ? Number(user.funcionario_id) : null;

  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showCriar, setShowCriar] = useState(false);
  const [detailItem, setDetailItem] = useState<Solicitacao | null>(null);

  const { data: solicitacoes = [], isLoading } = useSolicitacoesList(filterStatus || undefined);
  const { data: stats } = useSolicitacoesStats();

  const ALL_STATUSES: Array<{ value: string; label: string }> = [
    { value: '', label: 'Todas' },
    { value: 'SOLICITADA', label: 'Solicitadas' },
    { value: 'APROVADA_GESTOR', label: 'Aprovadas Gestor' },
    { value: 'APROVADA_OPS', label: 'Aprovadas OPS' },
    { value: 'AGENDADA', label: 'Agendadas' },
    { value: 'CONCLUIDA', label: 'Concluídas' },
    { value: 'REJEITADA', label: 'Rejeitadas' },
  ];

  return (
    <AppLayout>
      <div className="space-y-4">
        <PageHeader
          title="Solicitações de Treinamento"
          subtitle="Fluxo de aprovação gestor → OPS → agendamento → conclusão (PRG-OPS-001)"
          actions={
            <Button onClick={() => setShowCriar(true)} data-testid="solicitacoes-nova">
              <Plus className="mr-2 h-4 w-4" />
              Nova Solicitação
            </Button>
          }
        />

        {/* KPI Cards */}
        {stats && (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Abertas', value: stats.solicitadas, icon: Clock, color: 'amber' },
              { label: 'Gestor', value: stats.aprovadas_gestor, icon: ChevronRight, color: 'blue' },
              { label: 'OPS', value: stats.aprovadas_ops, icon: ChevronRight, color: 'indigo' },
              { label: 'Agendadas', value: stats.agendadas, icon: CalendarCheck, color: 'purple' },
              {
                label: 'Concluídas',
                value: stats.concluidas,
                icon: CheckCircle2,
                color: 'emerald',
              },
              { label: 'Rejeitadas', value: stats.rejeitadas, icon: XCircle, color: 'red' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className={`mb-1 text-xs font-medium text-${color}-600`}>{label}</div>
                <div className="text-2xl font-bold text-slate-900">{value ?? 0}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          {ALL_STATUSES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFilterStatus(s.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                filterStatus === s.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Tabela */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {isLoading ? (
            <div className="py-20 text-center text-sm text-slate-400">Carregando…</div>
          ) : solicitacoes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <AlertTriangle className="mb-3 h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-400">Nenhuma solicitação encontrada.</p>
              <button
                className="mt-3 text-sm text-blue-600 hover:underline"
                onClick={() => setShowCriar(true)}
              >
                Criar a primeira solicitação →
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {(solicitacoes as Solicitacao[]).map((item) => (
                <div
                  key={item.id}
                  className="flex cursor-pointer items-start gap-4 px-5 py-4 hover:bg-slate-50"
                  onClick={() => setDetailItem(item)}
                  data-testid={`solicitacao-item-${item.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">{item.titulo}</span>
                      <PrioridadeBadge prioridade={item.prioridade} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span>{item.solicitante_nome ?? `ID ${item.solicitante_id}`}</span>
                      <span className="hidden sm:inline">·</span>
                      <span>{item.tipo_treinamento}</span>
                      {item.data_prevista && (
                        <>
                          <span className="hidden sm:inline">·</span>
                          <span>Previsto: {item.data_prevista}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCriar && (
        <CriarModal onClose={() => setShowCriar(false)} selfId={selfId} canAdmin={canAdmin} />
      )}

      {detailItem && (
        <DetalheModal item={detailItem} canAdmin={canAdmin} onClose={() => setDetailItem(null)} />
      )}
    </AppLayout>
  );
}
