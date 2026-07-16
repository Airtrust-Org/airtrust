import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Clock, Plane, Droplets, AlertTriangle, CheckCircle } from 'lucide-react';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosBreadcrumb from './components/ControleVoosBreadcrumb';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import {
  useControleVoosVoo,
  useControleVoosRdv,
  useControleVoosAeroportos,
  useSalvarRdv,
  useFinalizarPreenchimentoRdv,
  type CvRdv,
  type CvAeroporto,
} from '@/react-app/hooks/useControleVoos';
import { formatDate, formatDateTime, formatTime, formatHours, formatCombustivel } from './data/controleVoosUtils';

function buildAeroMap(aeroportos: CvAeroporto[]) {
  return new Map(aeroportos.map((a) => [a.id, a]));
}

type RdvFormState = {
  numero: string;
  data_voo: string;
  horario_decolagem_real: string;
  horario_pouso_real: string;
  horas_voadas: string;
  numero_pousos: string;
  ciclos: string;
  combustivel_decolagem: string;
  combustivel_pouso: string;
  combustivel_consumo: string;
  pob: string;
  carga_kg: string;
  ocorrencias: string;
  divergencias: string;
};

function formatRdvNumero(dataVoo: string, prefixo: string) {
  const compactDate = dataVoo.replace(/-/g, '');
  const compactPrefix = prefixo.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `RDV-${compactDate}-${compactPrefix}`;
}

function normalizeRdvNumero(value: string) {
  return value.trim().toUpperCase();
}

function getSalvarRdvErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');

  if (message.includes('Payload contem termo fora do escopo')) {
    return 'Texto contem termo fora do escopo operacional interno. Remova termos regulatorios ou fiscais e salve novamente.';
  }

  if (message.includes('Combustivel incoerente')) {
    return 'Combustivel incoerente: decolagem menos pouso deve ser igual ao consumo informado.';
  }

  return message || 'Nao foi possivel salvar o RDV.';
}

function toInputDateTime(value: string | null | undefined) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function fromInputDateTime(value: string) {
  if (!value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
}

function toInputNumber(value: number | null | undefined) {
  return value == null ? '' : String(value);
}

function buildFormState(voo: { prefixo: string; data_programacao: string }, rdv: CvRdv | null): RdvFormState {
  return {
    numero: rdv?.numero || formatRdvNumero(voo.data_programacao, voo.prefixo),
    data_voo: rdv?.data_voo || voo.data_programacao,
    horario_decolagem_real: toInputDateTime(rdv?.horario_decolagem_real),
    horario_pouso_real: toInputDateTime(rdv?.horario_pouso_real),
    horas_voadas: toInputNumber(rdv?.horas_voadas),
    numero_pousos: toInputNumber(rdv?.numero_pousos),
    ciclos: toInputNumber(rdv?.ciclos),
    combustivel_decolagem: toInputNumber(rdv?.combustivel_decolagem),
    combustivel_pouso: toInputNumber(rdv?.combustivel_pouso),
    combustivel_consumo: toInputNumber(rdv?.combustivel_consumo),
    pob: toInputNumber(rdv?.pob),
    carga_kg: toInputNumber(rdv?.carga_kg),
    ocorrencias: rdv?.ocorrencias || '',
    divergencias: rdv?.divergencias || '',
  };
}

export default function ControleVoosRdvDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [finalizarConfirm, setFinalizarConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState<RdvFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: voo, isLoading: vooLoading, error: vooError } = useControleVoosVoo(id);
  const { data: rdv, isLoading: rdvLoading } = useControleVoosRdv(id);
  const { data: aeroportos = [] } = useControleVoosAeroportos();
  const salvarMutation = useSalvarRdv();
  const finalizarMutation = useFinalizarPreenchimentoRdv();

  const aeroMap = buildAeroMap(aeroportos);
  const isLoading = vooLoading || rdvLoading;

  useEffect(() => {
    if (!voo) return;
    setFormState(buildFormState(voo, rdv ?? null));
    setIsEditing(rdv?.status === 'rascunho');
    setFinalizarConfirm(false);
  }, [voo, rdv]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center dark:border-slate-700 dark:bg-slate-900">
              <p className="text-sm text-slate-500 dark:text-slate-400">Carregando RDV…</p>
            </div>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  if (vooError || !voo) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <ControleVoosPageHeader title="Voo não encontrado" />
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              {vooError ? `Erro: ${vooError.message}` : 'O voo solicitado não existe.'}
            </p>
            <Link to="/controle-voos/rdv" className="text-blue-600 hover:underline text-sm dark:text-blue-400">
              ← Voltar para lista de RDVs
            </Link>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  const origem = aeroMap.get(voo.origem_id);
  const destino = aeroMap.get(voo.destino_id);
  const form = formState ?? buildFormState(voo, rdv ?? null);
  const isLocked = rdv?.status === 'preenchimento_finalizado';
  const hasDraft = rdv?.status === 'rascunho';
  const canSave = Boolean(id) && !isLocked && isEditing && !isSaving && !salvarMutation.isPending;
  const canStart = !rdv && !isEditing;

  const canFinalizar = hasDraft && !finalizarMutation.isPending;

  function updateField<K extends keyof RdvFormState>(field: K, value: RdvFormState[K]) {
    setSaveError(null);
    setFormState((current) => ({
      ...(current ?? buildFormState(voo!, rdv ?? null)),
      [field]: value,
    }));
  }

  function parseNumber(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return Number(trimmed);
  }

  function parseInteger(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return Number.parseInt(trimmed, 10);
  }

  function validateBeforeSave() {
    if (!voo) return 'Voo não carregado.';
    const expectedNumero = formatRdvNumero(form.data_voo || voo.data_programacao, voo.prefixo);
    const normalizedNumero = normalizeRdvNumero(form.numero);

    if (!normalizedNumero.startsWith(expectedNumero)) {
      return `Numero do RDV deve comecar com ${expectedNumero} para este voo.`;
    }

    const combustivelDecolagem = parseNumber(form.combustivel_decolagem);
    const combustivelPouso = parseNumber(form.combustivel_pouso);
    const combustivelConsumo = parseNumber(form.combustivel_consumo);

    if (combustivelDecolagem != null && combustivelPouso != null) {
      if (combustivelPouso > combustivelDecolagem) {
        return 'Combustivel incoerente: pouso nao pode ser maior que decolagem.';
      }

      if (combustivelConsumo != null) {
        const expectedConsumo = Number((combustivelDecolagem - combustivelPouso).toFixed(3));
        const actualConsumo = Number(combustivelConsumo.toFixed(3));
        if (actualConsumo !== expectedConsumo) {
          return `Combustivel incoerente: consumo deve ser ${expectedConsumo}.`;
        }
      }
    }

    return null;
  }

  async function handleSave() {
    if (!id) return;
    const validationError = validateBeforeSave();
    if (validationError) {
      setSaveError(validationError);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      await salvarMutation.mutateAsync({
        vooId: id,
        dados: {
          numero: form.numero.trim(),
          data_voo: form.data_voo,
          horario_decolagem_real: fromInputDateTime(form.horario_decolagem_real),
          horario_pouso_real: fromInputDateTime(form.horario_pouso_real),
          horas_voadas: parseNumber(form.horas_voadas),
          numero_pousos: parseInteger(form.numero_pousos),
          ciclos: parseInteger(form.ciclos),
          combustivel_decolagem: parseNumber(form.combustivel_decolagem),
          combustivel_pouso: parseNumber(form.combustivel_pouso),
          combustivel_consumo: parseNumber(form.combustivel_consumo),
          pob: parseInteger(form.pob),
          carga_kg: parseNumber(form.carga_kg),
          ocorrencias: form.ocorrencias.trim() || null,
          divergencias: form.divergencias.trim() || null,
        },
      });
      setIsEditing(true);
      setFinalizarConfirm(false);
    } catch (error) {
      setSaveError(getSalvarRdvErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  function handleFinalizar() {
    if (!finalizarConfirm) {
      setFinalizarConfirm(true);
      return;
    }
    if (!id) return;
    finalizarMutation.mutate(id, {
      onSuccess: () => setFinalizarConfirm(false),
      onError: () => setFinalizarConfirm(false),
    });
  }

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosBreadcrumb items={[
            { label: 'Controle de Voos', to: '/controle-voos' },
            { label: 'RDVs', to: '/controle-voos/rdv' },
            { label: rdv ? rdv.numero : `Voo ${voo.prefixo}` },
          ]} />
          <ControleVoosPageHeader
            title={rdv ? rdv.numero : `RDV — Voo ${voo.prefixo}`}
            description={`Voo ${voo.prefixo} | ${formatDate(rdv?.data_voo || voo.data_programacao)}`}
          >
            {rdv && <ControleVoosStatusBadge status={rdv.status} className="text-sm px-3 py-1" />}
          </ControleVoosPageHeader>

          {!rdv && !isEditing && (
            <div className="mb-6 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700 dark:bg-amber-950/20">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">RDV ainda não preenchido.</p>
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Inicie o preenchimento operacional para criar o rascunho deste voo.</p>
              <button
                onClick={() => setIsEditing(true)}
                className="mt-4 inline-flex items-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600"
              >
                Iniciar preenchimento
              </button>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Coluna principal */}
            <div className="lg:col-span-2 space-y-6">
              {/* Dados do voo */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Plane className="h-4 w-4 text-blue-500" /> Dados do voo
                </h2>
                <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Voo</dt>
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
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Destino</dt>
                    <dd className="text-slate-800 dark:text-slate-200">
                      {destino ? `${destino.codigo_icao} — ${destino.nome}` : `ID:${voo.destino_id}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Horário previsto (saída)</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_partida)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Chegada prevista</dt>
                    <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatDateTime(voo.horario_previsto_chegada)}</dd>
                  </div>
                </dl>
              </div>

              {/* Dados realizados */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-emerald-500" /> Dados realizados
                </h2>
                {isEditing && !isLocked ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Número do RDV</span>
                      <input
                        value={form.numero}
                        onChange={(event) => updateField('numero', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                        Deve comecar com {formatRdvNumero(form.data_voo || voo.data_programacao, voo.prefixo)}.
                      </span>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Data do voo</span>
                      <input
                        type="date"
                        value={form.data_voo}
                        onChange={(event) => updateField('data_voo', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Horário de decolagem real</span>
                      <input
                        type="datetime-local"
                        value={form.horario_decolagem_real}
                        onChange={(event) => updateField('horario_decolagem_real', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Horário de pouso real</span>
                      <input
                        type="datetime-local"
                        value={form.horario_pouso_real}
                        onChange={(event) => updateField('horario_pouso_real', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Horas voadas</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.horas_voadas}
                        onChange={(event) => updateField('horas_voadas', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Número de pousos</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.numero_pousos}
                        onChange={(event) => updateField('numero_pousos', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ciclos</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.ciclos}
                        onChange={(event) => updateField('ciclos', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">POB</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={form.pob}
                        onChange={(event) => updateField('pob', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Carga</span>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={form.carga_kg}
                        onChange={(event) => updateField('carga_kg', event.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </label>
                  </div>
                ) : rdv ? (
                  <dl className="grid gap-3 sm:grid-cols-2 text-sm">
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Decolagem real</dt>
                      <dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatTime(rdv.horario_decolagem_real)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Pouso real</dt>
                      <dd className="text-emerald-700 dark:text-emerald-300 font-mono">{formatTime(rdv.horario_pouso_real)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Horas voadas</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatHours(rdv.horas_voadas)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Pousos</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{rdv.numero_pousos ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Ciclos</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{rdv.ciclos ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">POB</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{rdv.pob ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Carga</dt>
                      <dd className="text-slate-800 dark:text-slate-200 font-mono">{rdv.carga_kg != null ? `${rdv.carga_kg} kg` : '—'}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Aguardando preenchimento do RDV.</p>
                )}
              </div>

              {/* Combustível */}
              {(rdv || (isEditing && !isLocked)) && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-amber-500" /> Combustível
                  </h2>
                  {isEditing && !isLocked ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <label className="space-y-1 text-sm">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Combustível decolagem</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={form.combustivel_decolagem}
                            onChange={(event) => updateField('combustivel_decolagem', event.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Combustível pouso</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={form.combustivel_pouso}
                            onChange={(event) => updateField('combustivel_pouso', event.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Combustível consumo</span>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={form.combustivel_consumo}
                            onChange={(event) => updateField('combustivel_consumo', event.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                          />
                        </label>
                      </div>
                      <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
                        Regra operacional: decolagem menos pouso deve ser igual ao consumo.
                      </p>
                    </>
                  ) : rdv ? (
                    <dl className="grid gap-3 sm:grid-cols-3 text-sm">
                      <div>
                        <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Decolagem</dt>
                        <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatCombustivel(rdv.combustivel_decolagem)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Pouso</dt>
                        <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatCombustivel(rdv.combustivel_pouso)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-400 dark:text-slate-500">Consumo total</dt>
                        <dd className="text-slate-800 dark:text-slate-200 font-mono">{formatCombustivel(rdv.combustivel_consumo)}</dd>
                      </div>
                    </dl>
                  ) : null}
                </div>
              )}

              {/* Ocorrências e Divergências */}
              {(rdv || (isEditing && !isLocked)) && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Ocorrências e divergências
                  </h2>
                  {isEditing && !isLocked ? (
                    <div className="space-y-4">
                      <label className="block space-y-1 text-sm">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Ocorrências</span>
                        <textarea
                          value={form.ocorrencias}
                          onChange={(event) => updateField('ocorrencias', event.target.value)}
                          rows={4}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </label>
                      <label className="block space-y-1 text-sm">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Divergências</span>
                        <textarea
                          value={form.divergencias}
                          onChange={(event) => updateField('divergencias', event.target.value)}
                          rows={4}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                      </label>
                    </div>
                  ) : rdv ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1">Ocorrências</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 rounded-lg p-3 dark:bg-slate-800">
                          {rdv.ocorrencias || 'Nenhuma ocorrência registrada.'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-400 dark:text-slate-500 mb-1">Divergências do planejado</p>
                        <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 rounded-lg p-3 dark:bg-slate-800">
                          {rdv.divergencias || 'Nenhuma divergência registrada.'}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Coluna lateral */}
            <div className="space-y-6">
              {/* Preenchimento operacional */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Preenchimento operacional</h2>
                <div className="space-y-3 text-sm">
                  {rdv?.responsavel_preenchimento_id && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Responsável (ID)</span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">{rdv.responsavel_preenchimento_id}</span>
                    </div>
                  )}
                  {rdv?.preenchido_em && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Preenchido em</span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">{formatDateTime(rdv.preenchido_em)}</span>
                    </div>
                  )}
                  {rdv?.finalizado_operacionalmente_em && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Finalizado em</span>
                      <span className="text-slate-800 dark:text-slate-200 font-medium">{formatDateTime(rdv.finalizado_operacionalmente_em)}</span>
                    </div>
                  )}
                  <p className="text-xs text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2 mt-2">
                    Uso operacional interno. Não regulado. Não substitui registros oficiais da operação.
                  </p>
                </div>
              </div>

              {/* Botões */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">Ações</h2>
                <div className="space-y-2">
                  {isEditing && !isLocked && (
                    <button
                      onClick={handleSave}
                      disabled={!canSave}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        canSave
                          ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500'
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      {isSaving || salvarMutation.isPending ? 'Salvando…' : hasDraft ? 'Salvar rascunho' : 'Criar rascunho'}
                    </button>
                  )}

                  {canFinalizar ? (
                    <button
                      onClick={handleFinalizar}
                      disabled={finalizarMutation.isPending}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        finalizarConfirm
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-800/40'
                      }`}
                    >
                      <CheckCircle className="h-4 w-4" />
                      {finalizarMutation.isPending ? 'Finalizando…' : finalizarConfirm ? 'Confirmar finalização' : 'Finalizar preenchimento'}
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500"
                      title={rdv?.status === 'preenchimento_finalizado' ? 'RDV já finalizado' : 'Nenhum RDV para finalizar'}
                    >
                      <CheckCircle className="h-4 w-4" />Finalizar preenchimento
                    </button>
                  )}

                  {finalizarConfirm && (
                    <button
                      onClick={() => setFinalizarConfirm(false)}
                      className="w-full rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                    >
                      Cancelar
                    </button>
                  )}

                  {finalizarMutation.isError && (
                    <p className="text-xs text-red-600 dark:text-red-400">{finalizarMutation.error?.message}</p>
                  )}

                  {(saveError || salvarMutation.isError) && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                      {saveError || getSalvarRdvErrorMessage(salvarMutation.error)}
                    </p>
                  )}

                  {isLocked && (
                    <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                      Preenchimento finalizado. Edição bloqueada para este RDV.
                    </p>
                  )}

                  {!rdv && canStart && (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
                      Inicie o preenchimento para habilitar o salvamento do rascunho.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <Link to={`/controle-voos/voos/${voo.id}`} className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
                  ← Ver detalhe do voo
                </Link>
              </div>
            </div>
          </div>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
