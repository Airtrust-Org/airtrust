import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock, FileText, Shield, CheckCircle, XCircle, Upload, MessageCircle, Pencil } from 'lucide-react';
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
  type: 'WEATHER_REPORT' | 'PLANO_VOO';
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
  const { can } = usePermissions();
  const canCoordinate = can('controle_voos.edit');
  const { data: voo, isLoading, error, refetch: refetchVoo } = useControleVoosVoo(id);
  const { data: rdv } = useControleVoosRdv(id);
  const { data: aeroportos = [] } = useControleVoosAeroportos();
  const [documents, setDocuments] = useState<FlightDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploadingType, setUploadingType] = useState<FlightDocument['type'] | null>(null);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [sharingFlightLog, setSharingFlightLog] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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

  const uploadDocument = async (type: FlightDocument['type'], file: File | null) => {
    if (!id || !file) return;
    setUploadingType(type);
    try {
      const form = new FormData();
      form.set('tipo', type);
      form.set('file', file);
      const response = await apiClient(`/controle-voos/voos/${id}/documentos`, { method: 'POST', body: form });
      if (!response.success) throw new Error(response.error || 'Falha ao anexar documento');
      toast.success(`${type === 'WEATHER_REPORT' ? 'Weather report' : 'Planejamento de voo'} anexado. Pilotos verão a atualização do voo.`);
      await Promise.all([loadDocuments(), refetchVoo()]);
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : 'Falha ao anexar documento');
    } finally {
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
      const response = await apiClient.post<{ sent: number; failed: number }>(`/controle-voos/voos/${id}/whatsapp`, {});
      if (!response.success) throw new Error(response.error || 'Falha ao enviar WhatsApp');
      toast.success(`Programação enviada por WhatsApp para ${response.data?.sent ?? 0} tripulante(s).`);
    } catch (sendError) {
      toast.error(sendError instanceof Error ? sendError.message : 'Falha ao enviar WhatsApp');
    } finally {
      setSendingWhatsapp(false);
    }
  };

  const shareFlightLog = async () => {
    if (!id || sharingFlightLog) return;
    const shareWindow = window.open('', '_blank');
    setSharingFlightLog(true);
    try {
      const response = await apiClient.get<{ message: string }>(
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

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Dados gerais</h2>
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Prefixo</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-medium">{voo.prefixo}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Aeronave (ID)</dt>
                    <dd className="text-slate-800 dark:text-slate-200">{voo.aeronave_id ?? '—'}</dd>
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
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Horário previsto (saída)</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_partida)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada prevista</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_chegada)}</dd>
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
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-500" /> Verificações (demonstrativo)
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Qualificações</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">CMA / ASO</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 dark:text-slate-400">FRMS</span>
                    <span className="text-slate-400 dark:text-slate-500 text-xs">—</span>
                  </div>
                  <p className="text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2 mt-2">
                    Verificações automáticas não disponíveis no N1 — implementação futura.
                  </p>
                </div>
              </div>

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
                <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                  <FileText className="h-4 w-4 text-cyan-600" /> Documentos do voo
                </h2>
                {canCoordinate && (
                  <div className="mb-4 grid gap-2">
                    {(['WEATHER_REPORT', 'PLANO_VOO'] as const).map((type) => (
                      <label key={type} className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800 hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-950/20 dark:text-cyan-300">
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingType === type ? 'Enviando…' : type === 'WEATHER_REPORT' ? 'Anexar Weather Report' : 'Anexar Planejamento de Voo'}
                        <input
                          type="file"
                          className="sr-only"
                          accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif"
                          disabled={uploadingType !== null}
                          onChange={(event) => {
                            const file = event.currentTarget.files?.[0] || null;
                            event.currentTarget.value = '';
                            void uploadDocument(type, file);
                          }}
                        />
                      </label>
                    ))}
                  </div>
                )}
                {documentsLoading ? (
                  <p className="text-xs text-slate-500">Carregando documentos…</p>
                ) : documents.length === 0 ? (
                  <p className="text-xs text-slate-500">Nenhum Weather Report ou planejamento anexado.</p>
                ) : (
                  <div className="space-y-2">
                    {documents.map((document) => (
                      <button
                        type="button"
                        key={document.id}
                        onClick={() => void openDocument(document)}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                      >
                        <span className="block font-semibold text-slate-800 dark:text-slate-100">{document.label}</span>
                        <span className="mt-0.5 block text-slate-500">{document.file_name} · {formatFileSize(document.size)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <EdbShadowReadinessCard flightId={voo.id} />

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Ações</h2>
                <div className="space-y-2">
                  {canCoordinate && (
                    <button
                      type="button"
                      onClick={() => void sendWhatsapp()}
                      disabled={sendingWhatsapp}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      <MessageCircle className="h-4 w-4" /> {sendingWhatsapp ? 'Enviando…' : 'Enviar programação aos tripulantes'}
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
                  <a href="#tripulacao" className="block w-full rounded-lg bg-cyan-700 px-4 py-2 text-center text-sm font-medium text-white">Alterar Tripulação</a>
                  {canCoordinate ? (
                    <ControleVoosStatusActions voo={voo} onChanged={() => void refetchVoo()} />
                  ) : null}
                </div>
              </div>
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
