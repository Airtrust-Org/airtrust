import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Clock, FileText, CheckCircle, XCircle, Upload, MessageCircle, Pencil } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import { apiClient } from '@/react-app/services/apiClient';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import { toast } from 'sonner';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosBreadcrumb from './components/ControleVoosBreadcrumb';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import EdbShadowReadinessCard from './components/EdbShadowReadinessCard';
import ControleVoosTripulacaoCard from './components/ControleVoosTripulacaoCard';
import ControleVoosEditarVooDialog from './components/ControleVoosEditarVooDialog';
import ControleVoosEdicaoRapida from './components/ControleVoosEdicaoRapida';
import ControleVoosFadigaCard from './components/ControleVoosFadigaCard';
import ControleVoosQualificacoesCard from './components/ControleVoosQualificacoesCard';
import ControleVoosStatusActions from './components/ControleVoosStatusActions';
import ControleVoosPlanoVooCard from './components/ControleVoosPlanoVooCard';
import {
  useControleVoosVoo,
  useControleVoosRdv,
  useControleVoosAeroportos,
  type CvAeroporto,
  type CvFlightStatus,
} from '@/react-app/hooks/useControleVoos';
import { formatDate, formatDateTime } from './data/controleVoosUtils';
import { flightOperationalRouteLabel, flightOperationalDestinationLabel , flightPresentationStatus } from './data/controleVoosFlightIdentity';


type FlightDocument = {
  id: number;
  type: 'WEATHER_REPORT' | 'PLANO_VOO' | 'MTA_EMBARQUE' | 'MTA_DESEMBARQUE' | 'OUTROS';
  label: string;
  file_name: string;
  content_type: string;
  size: number;
  created_at: string;
  download_url: string;
};

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildAeroMap(aeroportos: CvAeroporto[]) {
  return new Map(aeroportos.map((a) => [a.id, a]));
}

const N1_STATUS_ORDER: CvFlightStatus[] = [
  'planejado',
  'liberado_operacionalmente',
  'em_andamento',
  'pousado',
  'concluido_operacionalmente',
];

function StatusTimeline({ status }: { status: CvFlightStatus }) {
  const isCanceled = status === 'cancelado';
  const isAlternated = status === 'alternado_divergido';
  const currentIdx = N1_STATUS_ORDER.indexOf(status);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {N1_STATUS_ORDER.map((step, i) => {
        const done = isCanceled ? i === 0 : isAlternated ? i <= 3 : currentIdx >= i;
        const isTerminal = i === N1_STATUS_ORDER.length - 1;
        return (
          <span key={step} className="flex items-center gap-2">
            {i > 0 && (
              <span className={`h-0.5 w-8 ${done ? 'bg-emerald-300 dark:bg-emerald-600' : 'bg-slate-200 dark:bg-slate-700'}`} />
            )}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              done
                ? isTerminal
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
            }`}>
              {done ? <CheckCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
              <ControleVoosStatusBadge status={step} className="bg-transparent text-inherit px-0 py-0 text-xs" />
            </span>
          </span>
        );
      })}
      {(isCanceled || isAlternated) && (
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-8 bg-red-300 dark:bg-red-600" />
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
            isCanceled
              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }`}>
            <XCircle className="h-3.5 w-3.5" />
            {isCanceled ? 'Cancelado' : 'Alternado/Divergido'}
          </span>
        </span>
      )}
    </div>
  );
}

export default function ControleVoosVooDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const canCoordinate = can('controle_voos.edit');
  const { data: voo, isLoading, error, refetch: refetchVoo } = useControleVoosVoo(id);
  const { data: rdv } = useControleVoosRdv(id);
  const { data: aeroportos = [] } = useControleVoosAeroportos();
  const [documents, setDocuments] = useState<FlightDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploadingType, setUploadingType] = useState<FlightDocument['type'] | null>(null);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [sharingWhatsapp, setSharingWhatsapp] = useState(false);
  const [sharingFlightLog, setSharingFlightLog] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [quickEditOpen, setQuickEditOpen] = useState(false);
  const [confirmingPlan, setConfirmingPlan] = useState(false);
  const [showDeleteFlight, setShowDeleteFlight] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingFlight, setDeletingFlight] = useState(false);

  const loadDocuments = async () => {
    if (!id) return;
    setDocumentsLoading(true);
    try {
      const response = await apiClient.get<FlightDocument[]>(`/controle-voos/voos/${id}/documentos`);
      if (!response.success) throw new Error(response.error || 'Falha ao carregar anexos');
      setDocuments(Array.isArray(response.data) ? response.data : []);
    } catch (loadError) {
      console.error('[Controle de Voos] Falha ao carregar documentos do voo', loadError);
    } finally {
      setDocumentsLoading(false);
    }
  };

  useEffect(() => {
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const uploadDocuments = async (type: FlightDocument['type'], files: File[]) => {
    if (!id || files.length === 0 || uploadingType !== null) return;
    setUploadingType(type);
    let uploaded = 0;
    try {
      // Sequential uploads preserve the flight version sequence and individual R2 audit records.
      for (const file of files) {
        const form = new FormData();
        form.set('tipo', type);
        form.set('file', file);
        const response = await apiClient(`/controle-voos/voos/${id}/documentos`, { method: 'POST', body: form });
        if (!response.success) throw new Error(response.error || 'Falha ao anexar ' + file.name);
        uploaded++;
      }
      toast.success(`${uploaded} documento(s) anexado(s). A tripulação receberá aviso para atualizar o pacote offline.`);
    } catch (uploadError) {
      toast.error(`${uploaded} arquivo(s) enviado(s). ` +
        (uploadError instanceof Error ? uploadError.message : 'Falha ao anexar documento'));
    } finally {
      await Promise.all([loadDocuments(), refetchVoo()]);
      setUploadingType(null);
    }
  };

  const openDocument = async (document: FlightDocument) => {
    if (!id) return;
    try {
      const blob = await apiClient.getBlob(`/controle-voos/voos/${id}/documentos/${document.id}`);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (openError) {
      toast.error(openError instanceof Error ? openError.message : 'Falha ao abrir documento');
    }
  };

  const sendWhatsapp = async () => {
    if (!id || sendingWhatsapp) return;
    setSendingWhatsapp(true);
    try {
      const response = await apiClient.post<{
        success: boolean;
        data?: { sent: number; failed: number };
        error?: string;
      }>(`/controle-voos/voos/${id}/whatsapp`, {});
      // HTTP client preserves the backend envelope; POST must retain the
      // centralized CSRF and authentication headers.
      if (!response.success || response.data?.success !== true) {
        throw new Error(response.data?.error || response.error || 'Falha ao enviar WhatsApp');
      }
      const sent = response.data.data?.sent ?? 0;
      const failed = response.data.data?.failed ?? 0;
      if (failed > 0) toast.warning(`Enviado para ${sent} tripulante(s); falhou para ${failed}.`);
      else toast.success(`Programação enviada por WhatsApp para ${sent} tripulante(s).`);
    } catch (sendError) {
      toast.error(sendError instanceof Error ? sendError.message : 'Falha ao enviar WhatsApp');
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const shareProgramming = async () => {
    if (!id || sharingWhatsapp) return;
    const shareWindow = window.open('', '_blank');
    setSharingWhatsapp(true);
    try {
      const response = await apiClient<{message: string}>(`/controle-voos/voos/${id}/whatsapp-share?tipo=programacao`);
      if (!response.success || !response.data?.message) throw new Error(response.error || 'Não foi possível preparar a mensagem.');
      const url = `https://wa.me/?text=${encodeURIComponent(response.data.message)}`;
      if (shareWindow) shareWindow.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      shareWindow?.close();
      toast.error(error instanceof Error ? error.message : 'Falha ao compartilhar a programação.');
    } finally {
      setSharingWhatsapp(false);
    }
  };

  const shareFlightLog = async () => {
    if (!id || sharingFlightLog) return;
    const shareWindow = window.open('', '_blank');
    setSharingFlightLog(true);
    try {
      const response = await apiClient<{ message: string }>(
        `/controle-voos/voos/${id}/whatsapp-share?tipo=flight_log`,
      );
      if (!response.success || !response.data?.message) {
        throw new Error(response.error || 'Não foi possível preparar o Flight Log');
      }
      const shareUrl = `https://wa.me/?text=${encodeURIComponent(response.data.message)}`;
      if (shareWindow) shareWindow.location.href = shareUrl;
      else window.open(shareUrl, '_blank', 'noopener,noreferrer');
    } catch (shareError) {
      shareWindow?.close();
      toast.error(shareError instanceof Error ? shareError.message : 'Falha ao preparar o Flight Log');
    } finally {
      setSharingFlightLog(false);
    }
  };

  const confirmPlanning = async () => {
    if (!voo || confirmingPlan) return;
    setConfirmingPlan(true);
    try {
      const result = await apiClient.post(`/controle-voos/voos/${voo.id}/confirmar-planejamento`, { versao: voo.versao });
      if (!result.success) throw new Error(result.error || 'Falha ao confirmar planejamento.');
      toast.success('Planejamento confirmado. O Pilot App identificará a nova versão ao conectar.');
      await refetchVoo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Não foi possível confirmar planejamento.');
    } finally {
      setConfirmingPlan(false);
    }
  };

  const deletePreliminaryFlight = async () => {
    if (!voo || deletingFlight || deleteReason.trim().length < 10) return;
    setDeletingFlight(true);
    try {
      const query = new URLSearchParams({ versao: String(voo.versao), motivo: deleteReason.trim() });
      const response = await apiClient.delete(`/controle-voos/voos/${voo.id}?${query.toString()}`);
      if (!response.success) throw new Error(response.error || 'Não foi possível excluir este lançamento.');
      toast.success('Lançamento excluído do planejamento. Registro preservado para auditoria.');
      navigate('/controle-voos/voos');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Use o cancelamento para voos já distribuídos ou executados.');
    } finally {
      setDeletingFlight(false);
    }
  };

  const aeroMap = buildAeroMap(aeroportos);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando voo…</p>
            </div>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  if (error || !voo) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <ControleVoosPageHeader title="Voo não encontrado" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {error ? `Erro: ${error.message}` : 'O voo solicitado não existe.'}
            </p>
            <Link to="/controle-voos/voos" className="text-blue-600 hover:underline text-sm dark:text-blue-400">
              ← Voltar para lista de voos
            </Link>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  const origem = aeroMap.get(voo.origem_id);
  const currentDocuments = ([
    { type: 'WEATHER_REPORT', label: 'Weather Report' },
    { type: 'PLANO_VOO', label: 'Planejamento de voo' },
    { type: 'MTA_EMBARQUE', label: 'MTA de embarque' },
    { type: 'MTA_DESEMBARQUE', label: 'MTA de desembarque' },
  ] as const).map(({ type, label }) => ({
    type,
    label,
    current: documents.find((document) => document.type === type) ?? null,
  }));
  const otherDocuments = documents.filter((document) => document.type === 'OUTROS');
  const currentDocumentIds = new Set(currentDocuments.map((entry) => entry.current?.id).filter((id): id is number => typeof id === 'number'));
  const historicalDocuments = documents.filter((document) =>
    document.type !== 'OUTROS' && !currentDocumentIds.has(document.id));

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosBreadcrumb items={[
            { label: 'Controle de Voos', to: '/controle-voos' },
            { label: 'Voos', to: '/controle-voos/voos' },
            { label: voo.prefixo },
          ]} />
          <ControleVoosPageHeader
            title={`Voo ${voo.prefixo}`}
            description={`${flightOperationalRouteLabel(voo, aeroportos)} | ${formatDate(voo.data_programacao)}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <ControleVoosStatusBadge status={flightPresentationStatus(voo)} className="text-sm px-3 py-1" />
              {voo.status === 'planejado' ? <span className="rounded-lg border border-cyan-300 px-3 py-1 text-xs font-semibold text-cyan-700">{voo.planejamento_status === 'confirmado' ? 'Planejamento confirmado' : 'Planejamento prévio'}</span> : null}
              {canCoordinate ? (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Pencil className="h-4 w-4" />
                  Editar programação
                </button>
              ) : null}
            </div>
          </ControleVoosPageHeader>

          <div className="grid items-start gap-5 xl:grid-cols-5">
            <div className="min-w-0 space-y-5 xl:col-span-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Dados gerais</h2>
                  {canCoordinate && <button type="button" onClick={() => setQuickEditOpen((open) => !open)}
                    className="inline-flex items-center gap-1 rounded-lg border border-cyan-300 px-2.5 py-1.5 text-xs font-medium text-cyan-800 hover:bg-cyan-50">
                    <Pencil className="h-3.5 w-3.5" /> {quickEditOpen ? "Fechar edição" : "Editar dados aqui"}
                  </button>}
                </div>
                {quickEditOpen && canCoordinate && <ControleVoosEdicaoRapida voo={voo}
                  onCancel={() => setQuickEditOpen(false)} onSaved={() => {
                    setQuickEditOpen(false);
                    toast.success("Dados gerais atualizados.");
                    void refetchVoo();
                  }} />}
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Prefixo</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-medium">{voo.prefixo}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Modelo da aeronave</dt>
                    <dd className="text-slate-800 dark:text-slate-200">{voo.modelo_aeronave || 'Modelo não informado'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Origem</dt>
                    <dd className="text-slate-800 dark:text-slate-200">
                      {origem ? `${origem.codigo_icao} — ${origem.nome}` : `ID:${voo.origem_id}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Destino operacional</dt>
                    <dd className="text-slate-800 dark:text-slate-200">
                      {flightOperationalDestinationLabel(voo, aeroportos)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Tipo de voo (ID)</dt>
                    <dd className="text-slate-800 dark:text-slate-200">{voo.tipo_voo_id}</dd>
                  </div>
                  <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Partida prevista</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_partida)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada prevista</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_chegada)}</dd>
                    </div>
                  </div>
                  {voo.horario_real_partida && (
                    <>
                      <div>
                        <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Partida real</dt>
                        <dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatDateTime(voo.horario_real_partida)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada real</dt>
                        <dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatDateTime(voo.horario_real_chegada)}</dd>
                      </div>
                    </>
                  )}
                </dl>
                {voo.observacoes && (
                  <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 dark:bg-amber-950/20 dark:border-amber-800">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      <strong>Observações:</strong> {voo.observacoes}
                    </p>
                  </div>
                )}
              </div>

              <ControleVoosPlanoVooCard vooId={voo.id} canEdit={canCoordinate} />

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Status do voo</h2>
                <StatusTimeline status={voo.status} />
              </div>

              <ControleVoosTripulacaoCard
                vooId={voo.id}
                aeronaveId={voo.aeronave_id}
                rdvVersion={rdv?.versao}
              />

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-purple-500" /> RDV
                </h2>
                {rdv ? (
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600 dark:text-slate-400">Nº {rdv.numero}</p>
                    <ControleVoosStatusBadge status={rdv.status} />
                    <div className="mt-3">
                      <Link
                        to={`/controle-voos/rdv/${voo.id}`}
                        className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Abrir RDV →
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-400 dark:text-slate-500">Nenhum RDV criado para este voo.</p>
                    <Link
                      to={`/controle-voos/rdv/${voo.id}`}
                      className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Ir para RDV →
                    </Link>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                  <FileText className="h-4 w-4 text-cyan-600" /> Preparação para saída
                </h2>
                <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                  Anexe Weather Report, planejamento de voo, MTAs de embarque e desembarque e outros documentos. Todos os arquivos disponíveis são baixados automaticamente quando a tripulação prepara ou atualiza o voo para uso offline.
                </p>
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                  Dados do voo · versão {voo.versao} · atualizados em {formatDateTime(voo.updated_at)}
                </div>
                {documentsLoading ? (
                  <p className="text-xs text-slate-500">Carregando documentos…</p>
                ) : (
                  <div className="space-y-3">
                    {currentDocuments.map(({ type, label, current }) => (
                      <div key={type}>
                      {type === 'MTA_EMBARQUE' && (
                        <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">MTAs — embarque e desembarque</h3>
                      )}
                      <div key={type} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${current ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                                {current ? 'Anexado' : 'Ainda não disponível'}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {current ? `${current.file_name} · ${formatFileSize(current.size)}` : 'O piloto poderá preparar e realizar o voo normalmente sem este documento.'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {current ? (
                              <button
                                type="button"
                                onClick={() => void openDocument(current)}
                                className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Abrir
                              </button>
                            ) : null}
                            {canCoordinate ? (
                              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/20 dark:text-cyan-300">
                                <Upload className="h-3.5 w-3.5" />
                                {uploadingType === type ? 'Enviando…' : current ? 'Substituir' : 'Anexar'}
                                <input
                                  type="file"
                                  className="sr-only"
                                  accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
                                  disabled={uploadingType !== null}
                                  onChange={(event) => {
                                    const files = Array.from(event.currentTarget.files || []);
                                    event.currentTarget.value = '';
                                    void uploadDocuments(type, files);
                                  }}
                                />
                              </label>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      </div>
                    ))}
                    <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Outros documentos</h3>
                        {canCoordinate && (
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-cyan-300 bg-cyan-50 px-2.5 py-1.5 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/20 dark:text-cyan-300">
                            <Upload className="h-3.5 w-3.5" /> {uploadingType === 'OUTROS' ? 'Enviando…' : 'Adicionar documentos'}
                            <input type="file" multiple className="sr-only"
                              accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
                              disabled={uploadingType !== null}
                              onChange={(event) => {
                                const files = Array.from(event.currentTarget.files || []);
                                event.currentTarget.value = '';
                                void uploadDocuments('OUTROS', files);
                              }} />
                          </label>
                        )}
                      </div>
                      {otherDocuments.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-500">Nenhum documento adicional.</p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {otherDocuments.map((document) => (
                            <button key={document.id} type="button" onClick={() => void openDocument(document)}
                              className="block w-full rounded-md border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                              <span className="block font-semibold">{document.file_name}</span>
                              <span className="text-slate-500">{formatFileSize(document.size)} · {formatDateTime(document.created_at)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="mt-2 text-xs text-slate-500">É possível adicionar vários arquivos; os anteriores permanecem disponíveis para os pilotos.</p>
                    </div>
                    {historicalDocuments.length > 0 ? (
                      <details className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                        <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">
                          Histórico de documentos ({historicalDocuments.length})
                        </summary>
                        <div className="mt-2 space-y-2">
                          {historicalDocuments.map((document) => (
                            <button
                              type="button"
                              key={document.id}
                              onClick={() => void openDocument(document)}
                              className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                            >
                              <span className="block font-semibold text-slate-700 dark:text-slate-200">{document.label}</span>
                              <span className="mt-0.5 block text-slate-500">{document.file_name} · {formatFileSize(document.size)} · {formatDateTime(document.created_at)}</span>
                            </button>
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </div>
                )}
              </div>

              <EdbShadowReadinessCard flightId={voo.id} />

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Ações</h2>
                <div className="space-y-2">
                  {canCoordinate && voo.status === 'planejado' && voo.planejamento_status !== 'confirmado' ? (
                    <button type="button" onClick={() => void confirmPlanning()} disabled={confirmingPlan}
                      className="flex w-full justify-center rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {confirmingPlan ? 'Confirmando…' : 'Confirmar planejamento para a tripulação'}
                    </button>
                  ) : null}
                  {canCoordinate && (
                    <button
                      type="button"
                      onClick={() => void sendWhatsapp()}
                      disabled={sendingWhatsapp}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      <MessageCircle className="h-4 w-4" /> {sendingWhatsapp ? 'Enviando…' : 'Enviar automaticamente por WhatsApp aos tripulantes'}
                    </button>
                  )}
                  {canCoordinate && (
                    <button type="button" onClick={() => void shareProgramming()} disabled={sharingWhatsapp}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-600 px-4 py-2 text-sm font-medium text-cyan-700 disabled:opacity-50">
                      <MessageCircle className="h-4 w-4" /> {sharingWhatsapp ? 'Preparando…' : 'Abrir WhatsApp para compartilhar programação'}
                    </button>
                  )}
                  {canCoordinate && voo.status === 'concluido_operacionalmente' && (
                    <button
                      type="button"
                      onClick={() => void shareFlightLog()}
                      disabled={sharingFlightLog}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-700 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50 dark:bg-emerald-950/20 dark:text-emerald-300"
                    >
                      <MessageCircle className="h-4 w-4" /> {sharingFlightLog ? 'Preparando…' : 'Compartilhar Flight Log no WhatsApp'}
                    </button>
                  )}
                  {canCoordinate ? (
                    <ControleVoosStatusActions voo={voo} onChanged={() => void refetchVoo()} />
                  ) : null}
                  {canCoordinate && voo.status === 'planejado' && !rdv ? (
                    <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                      <button type="button" className="text-sm text-red-700 underline" onClick={() => setShowDeleteFlight(state => !state)}>Excluir lançamento incorreto</button>
                      {showDeleteFlight ? <div className="space-y-2">
                        <p className="text-xs text-slate-600">Disponível somente antes da distribuição e da execução. Caso contrário, cancele o voo.</p>
                        <textarea aria-label="Motivo da exclusão" rows={2} className="w-full rounded border border-slate-300 p-2 text-sm" placeholder="Motivo da exclusão (mínimo 10 caracteres)" value={deleteReason} onChange={event => setDeleteReason(event.target.value)} />
                        <button type="button" className="w-full rounded bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-50" disabled={deletingFlight || deleteReason.trim().length < 10} onClick={() => void deletePreliminaryFlight()}>{deletingFlight ? 'Excluindo…' : 'Confirmar exclusão do lançamento'}</button>
                      </div> : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="min-w-0 space-y-5 xl:col-span-2">
              <ControleVoosFadigaCard vooId={voo.id} versao={voo.versao} />

              <ControleVoosQualificacoesCard vooId={voo.id} versao={voo.versao} />

            </div>
          </div>
        </ControleVoosPageShell>
        {canCoordinate ? (
          <ControleVoosEditarVooDialog
            open={editOpen}
            voo={voo}
            onClose={() => setEditOpen(false)}
            onSaved={() => {
              toast.success('Voo atualizado. O Pilot App receberá a nova versão.');
              void refetchVoo();
            }}
          />
        ) : null}
      </div>
    </AppLayout>
  );
}
