import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Droplets,
  Plus,
  Send,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/react-app/components/AppLayout';
import ControleVoosPageShell from './components/ControleVoosPageShell';
import ControleVoosPageHeader from './components/ControleVoosPageHeader';
import ControleVoosBreadcrumb from './components/ControleVoosBreadcrumb';
import ControleVoosStatusBadge from './components/ControleVoosStatusBadge';
import ControleVoosRdvWorkflowPanel from './components/ControleVoosRdvWorkflowPanel';
import ControleVoosRdvStepper from './components/ControleVoosRdvStepper';
import ControleVoosRdvSaveStatus from './components/ControleVoosRdvSaveStatus';
import ControleVoosRdvTrechoCard from './components/ControleVoosRdvTrechoCard';
import {
  useControleVoosVoo,
  useControleVoosRdv,
  useControleVoosAeroportos,
  useSalvarRdv,
  useFinalizarPreenchimentoRdv,
  useTripulantes,
  useAbastecimentos,
  useCriarAbastecimento,
  useRemoverAbastecimento,
  useRemoverTripulante,
  useEnviarRdv,
  useRdvAlertas,
  type CvAeroporto,
  type CvRdv,
} from '@/react-app/hooks/useControleVoos';
import { usePermissions } from '@/react-app/hooks/usePermissions';
import {
  formatCombustivel,
  formatDate,
  formatDateTime,
  formatHours,
} from './data/controleVoosUtils';
import {
  RDV_PILOT_STEPS,
  buildFormState,
  calcConsumoCombustivel,
  calcHorasVoadas,
  collectFieldErrors,
  computeProgressPercent,
  formatRdvNumero,
  getSalvarRdvErrorMessage,
  getStepIndex,
  isStepComplete,
  isVersionConflictError,
  parseNumber,
  validateField,
  type RdvFormState,
  type RdvPilotStepId,
} from './data/rdvPilotFlow';
import { useRdvAutosave } from './hooks/useRdvAutosave';
import { useUnsavedChangesGuard } from './hooks/useUnsavedChangesGuard';
import { usePersistedEtapas } from './hooks/usePersistedEtapas';

function buildAeroMap(aeroportos: CvAeroporto[]) {
  return new Map(aeroportos.map((a) => [a.id, a]));
}

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red-600 dark:text-red-400">{message}</p>;
}

function canEditRdv(rdv: CvRdv | null | undefined) {
  if (!rdv) return true;
  if (rdv.status === 'cancelado') return false;
  if (
    rdv.status === 'preenchimento_finalizado' &&
    !['devolvido', 'reaberto'].includes(rdv.workflow_status)
  ) {
    return false;
  }
  return rdv.status === 'rascunho' || ['devolvido', 'reaberto'].includes(rdv.workflow_status);
}

export default function ControleVoosRdvDetalhe() {
  const { id } = useParams<{ id: string }>();
  const [step, setStep] = useState<RdvPilotStepId>('identificacao');
  const [formState, setFormState] = useState<RdvFormState | null>(null);
  const [touched, setTouched] = useState<Partial<Record<keyof RdvFormState, boolean>>>({});
  const [finalizarConfirm, setFinalizarConfirm] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const hydratedKeyRef = useRef<string | null>(null);

  const {
    data: voo,
    isLoading: vooLoading,
    error: vooError,
    refetch: refetchVoo,
  } = useControleVoosVoo(id);
  const { data: rdv, isLoading: rdvLoading, refetch: refetchRdv } = useControleVoosRdv(id);
  const { data: aeroportos = [] } = useControleVoosAeroportos();
  const { data: tripulantes = [] } = useTripulantes(id);
  const { data: abastecimentos = [] } = useAbastecimentos(id);
  const { data: alertas = [] } = useRdvAlertas(rdv ? id : undefined);

  const salvarMutation = useSalvarRdv();
  const finalizarMutation = useFinalizarPreenchimentoRdv();
  const criarAbastecimento = useCriarAbastecimento();
  const removerAbastecimento = useRemoverAbastecimento();
  const removerTripulante = useRemoverTripulante();
  const enviar = useEnviarRdv();

  const { isAdmin, isGestor } = usePermissions();
  const isCoordenacao = isAdmin || isGestor;

  const aeroMap = buildAeroMap(aeroportos);
  const isLoading = vooLoading || rdvLoading;
  const editable = canEditRdv(rdv);
  const form = formState;

  const origemIcao = voo ? aeroMap.get(voo.origem_id)?.codigo_icao || '' : '';
  const destinoIcao = voo ? aeroMap.get(voo.destino_id)?.codigo_icao || '' : '';

  const etapasState = usePersistedEtapas({
    vooId: id,
    rdv,
    editable,
    origemIcao,
    destinoIcao,
  });
  const trechos = etapasState.drafts;

  const autosave = useRdvAutosave({
    vooId: id,
    form,
    enabled: Boolean(id && form && editable && hydrated),
    debounceMs: 800,
    saveFn: async ({ vooId, dados }) =>
      salvarMutation.mutateAsync({ vooId, dados: { ...dados, versao: rdv?.versao } }),
  });

  useUnsavedChangesGuard((autosave.hasPending || etapasState.hasPending) && editable);

  function hydrateFromServer(nextVoo: NonNullable<typeof voo>, nextRdv: CvRdv | null | undefined) {
    const nextForm = buildFormState(nextVoo, nextRdv ?? null);
    setFormState(nextForm);
    autosave.resetBaseline(nextForm);
    setHydrated(true);
    setFinalizarConfirm(false);
  }

  // Hydrate form once per voo / first RDV id — etapas vêm da API via usePersistedEtapas
  useEffect(() => {
    if (!voo) return;
    const key = `${voo.id}:${rdv?.id ?? 'new'}`;
    if (hydratedKeyRef.current === key) return;
    hydratedKeyRef.current = key;
    hydrateFromServer(voo, rdv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voo?.id, rdv?.id, id]);

  const stepOptions = useMemo(
    () => ({
      tripulantesCount: tripulantes.length,
      abastecimentosCount: abastecimentos.length,
      trechosCount: etapasState.serverCount || trechos.length,
    }),
    [abastecimentos.length, etapasState.serverCount, trechos.length, tripulantes.length],
  );

  const completedSteps = useMemo(() => {
    if (!form) return new Set<RdvPilotStepId>();
    return new Set(
      RDV_PILOT_STEPS.filter((s) => isStepComplete(s.id, form, stepOptions)).map((s) => s.id),
    );
  }, [form, stepOptions]);

  const progressPercent = form ? computeProgressPercent(form, stepOptions) : 0;
  const fieldErrors = form && voo ? collectFieldErrors(form, voo, trechos) : {};

  if (isLoading || !hydrated) {
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

  if (vooError || !voo || !form) {
    return (
      <AppLayout>
        <div className="w-full">
          <ControleVoosPageShell>
            <ControleVoosPageHeader title="Voo não encontrado" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {vooError ? `Erro: ${vooError.message}` : 'O voo solicitado não existe.'}
            </p>
            <Link
              to="/controle-voos/rdv"
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              ← Voltar para lista de RDVs
            </Link>
          </ControleVoosPageShell>
        </div>
      </AppLayout>
    );
  }

  const origem = aeroMap.get(voo.origem_id);
  const destino = aeroMap.get(voo.destino_id);
  const stepIndex = getStepIndex(step);
  const bloqueiosEnvio = alertas.filter((a) => a.severidade === 'IMPEDE_ENVIO');
  const canEnviar =
    Boolean(rdv) &&
    rdv!.status === 'preenchimento_finalizado' &&
    (rdv!.workflow_status === 'rascunho' || rdv!.workflow_status === 'devolvido') &&
    bloqueiosEnvio.length === 0;

  function updateField<K extends keyof RdvFormState>(field: K, value: RdvFormState[K]) {
    setFormState((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };

      if (field === 'horario_decolagem_real' || field === 'horario_pouso_real') {
        const horas = calcHorasVoadas(
          field === 'horario_decolagem_real' ? String(value) : next.horario_decolagem_real,
          field === 'horario_pouso_real' ? String(value) : next.horario_pouso_real,
        );
        if (horas != null) next.horas_voadas = String(horas);
      }

      if (field === 'combustivel_decolagem' || field === 'combustivel_pouso') {
        const consumo = calcConsumoCombustivel(
          parseNumber(
            field === 'combustivel_decolagem' ? String(value) : next.combustivel_decolagem,
          ),
          parseNumber(field === 'combustivel_pouso' ? String(value) : next.combustivel_pouso),
        );
        if (consumo != null) next.combustivel_consumo = String(consumo);
      }

      return next;
    });
    setTouched((t) => ({ ...t, [field]: true }));
  }

  async function handleManualSave() {
    if (!id || !form) return;
    const errors = collectFieldErrors(form, voo, trechos);
    if (Object.keys(errors).length > 0) {
      toast.error(
        errors.trechos || Object.values(errors)[0] || 'Corrija os campos antes de salvar.',
      );
      return;
    }
    const ok = await autosave.saveNow();
    if (ok) toast.success('Rascunho salvo');
    else if (autosave.error && isVersionConflictError(new Error(autosave.error))) {
      setVersionConflict(true);
    }
  }

  async function handleFinalizar() {
    if (!finalizarConfirm) {
      setFinalizarConfirm(true);
      return;
    }
    if (!id || !form) return;
    const errors = collectFieldErrors(form, voo, trechos);
    if (
      errors.numero ||
      errors.horario_decolagem_real ||
      errors.combustivel_consumo ||
      errors.trechos
    ) {
      toast.error('Corrija os erros antes de finalizar.');
      setStep('revisao');
      return;
    }
    try {
      await autosave.saveNow();
      await finalizarMutation.mutateAsync(id);
      toast.success('Preenchimento finalizado');
      setFinalizarConfirm(false);
    } catch (error) {
      if (isVersionConflictError(error)) setVersionConflict(true);
      toast.error(getSalvarRdvErrorMessage(error));
      setFinalizarConfirm(false);
    }
  }

  async function handleEnviar() {
    if (!id || !rdv) return;
    try {
      await enviar.mutateAsync({ vooId: id, body: { versao: rdv.versao } });
      toast.success('RDV enviado à Coordenação');
    } catch (error) {
      if (isVersionConflictError(error)) setVersionConflict(true);
      toast.error(getSalvarRdvErrorMessage(error));
    }
  }

  async function handleReloadAfterConflict() {
    setVersionConflict(false);
    const [vooResult, rdvResult] = await Promise.all([
      refetchVoo(),
      refetchRdv(),
      etapasState.reloadFromServer(),
    ]);
    const nextVoo = vooResult.data;
    if (nextVoo) {
      hydratedKeyRef.current = null;
      hydrateFromServer(nextVoo, rdvResult.data);
    }
    toast.message('Dados recarregados. Continue a partir da versão atual.');
  }

  function goNext() {
    const next = RDV_PILOT_STEPS[stepIndex + 1];
    if (next) setStep(next.id);
  }

  function goPrev() {
    const prev = RDV_PILOT_STEPS[stepIndex - 1];
    if (prev) setStep(prev.id);
  }

  return (
    <AppLayout>
      <div className="w-full">
        <ControleVoosPageShell>
          <ControleVoosBreadcrumb
            items={[
              { label: 'Controle de Voos', to: '/controle-voos' },
              { label: 'RDVs', to: '/controle-voos/rdv' },
              { label: rdv ? rdv.numero : `Voo ${voo.prefixo}` },
            ]}
          />
          <ControleVoosPageHeader
            title={rdv ? rdv.numero : `RDV — Voo ${voo.prefixo}`}
            description={`Voo ${voo.prefixo} · ${formatDate(rdv?.data_voo || voo.data_programacao)} · Preenchimento piloto`}
          >
            <div className="flex flex-wrap items-center gap-2">
              {rdv && <ControleVoosStatusBadge status={rdv.status} className="text-sm px-3 py-1" />}
              {rdv?.workflow_status && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Fluxo: {rdv.workflow_status}
                </span>
              )}
            </div>
          </ControleVoosPageHeader>

          {rdv?.motivo_devolucao &&
            (rdv.workflow_status === 'devolvido' || rdv.workflow_status === 'rascunho') && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                <strong>Devolvido pela Coordenação:</strong> {rdv.motivo_devolucao}
              </div>
            )}

          {versionConflict && (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-red-900/60 dark:bg-red-950/20">
              <p className="text-sm text-red-800 dark:text-red-200">
                Conflito de versão: outro usuário atualizou este RDV. Recarregue antes de continuar.
              </p>
              <button
                type="button"
                onClick={handleReloadAfterConflict}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white hover:bg-red-700"
              >
                Recarregar dados
              </button>
            </div>
          )}

          <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <ControleVoosRdvStepper
              currentStep={step}
              completedSteps={completedSteps}
              onStepChange={setStep}
              progressPercent={progressPercent}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {step === 'identificacao' && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">
                    Identificação
                  </h2>
                  <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-400">Voo</dt>
                      <dd className="font-medium text-slate-800 dark:text-slate-200">
                        {voo.prefixo}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Rota programada</dt>
                      <dd className="text-slate-800 dark:text-slate-200">
                        {origem?.codigo_icao || `ID:${voo.origem_id}`} →{' '}
                        {destino?.codigo_icao || `ID:${voo.destino_id}`}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Partida prevista</dt>
                      <dd className="font-mono text-slate-800 dark:text-slate-200">
                        {formatDateTime(voo.horario_previsto_partida)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-400">Chegada prevista</dt>
                      <dd className="font-mono text-slate-800 dark:text-slate-200">
                        {formatDateTime(voo.horario_previsto_chegada)}
                      </dd>
                    </div>
                  </dl>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500">Número do RDV</span>
                      <input
                        value={form.numero}
                        disabled={!editable}
                        onChange={(e) => updateField('numero', e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, numero: true }))}
                        className={inputClass}
                      />
                      <FieldError
                        message={
                          touched.numero
                            ? validateField('numero', form, voo) || undefined
                            : undefined
                        }
                      />
                      <span className="block text-[11px] text-slate-400">
                        Prefixo esperado:{' '}
                        {formatRdvNumero(form.data_voo || voo.data_programacao, voo.prefixo)}
                      </span>
                    </label>
                    <label className="space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500">Data do voo</span>
                      <input
                        type="date"
                        value={form.data_voo}
                        disabled={!editable}
                        onChange={(e) => updateField('data_voo', e.target.value)}
                        className={inputClass}
                      />
                    </label>
                  </div>
                </section>
              )}

              {step === 'tripulacao' && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                    <Users className="h-4 w-4 text-blue-500" /> Tripulação
                  </h2>
                  <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                    Tripulantes vinculados a este voo. O envio exige ao menos um tripulante.
                  </p>
                  {tripulantes.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                      Nenhum tripulante cadastrado ainda. Peça à Coordenação o vínculo ou cadastre
                      via API operacional.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {tripulantes.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-center justify-between gap-3 py-3 text-sm"
                        >
                          <div>
                            <p className="font-medium text-slate-800 dark:text-slate-100">
                              {t.funcionario_nome || `Funcionário #${t.funcionario_id}`}
                            </p>
                            <p className="text-xs text-slate-500">
                              {t.funcao}
                              {t.funcionario_codigo_anac
                                ? ` · ANAC ${t.funcionario_codigo_anac}`
                                : ''}
                            </p>
                          </div>
                          {editable && (
                            <button
                              type="button"
                              onClick={() =>
                                id && removerTripulante.mutate({ vooId: id, tripulanteId: t.id })
                              }
                              className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                            >
                              Remover
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {step === 'trechos' && (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      Trechos
                    </h2>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            if (!rdv && form) {
                              const ok = await autosave.saveNow();
                              if (!ok) {
                                toast.error(
                                  autosave.error || 'Salve a identificação antes dos trechos.',
                                );
                                return;
                              }
                              await refetchRdv();
                            }
                            await etapasState.addEtapa();
                          })();
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        <Plus className="h-3.5 w-3.5" /> Adicionar trecho
                      </button>
                    )}
                  </div>
                  {(etapasState.versionConflict || versionConflict) && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                      Conflito de versão nos trechos.{' '}
                      <button
                        type="button"
                        className="font-semibold underline"
                        onClick={() => void handleReloadAfterConflict()}
                      >
                        Recarregar do servidor
                      </button>
                    </p>
                  )}
                  {fieldErrors.trechos && (
                    <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300">
                      {fieldErrors.trechos}
                    </p>
                  )}
                  {trechos.map((trecho, index) => (
                    <ControleVoosRdvTrechoCard
                      key={trecho.localId}
                      index={index}
                      trecho={trecho}
                      readOnly={!editable}
                      saveStatus={etapasState.statusByLocalId[trecho.localId] || 'idle'}
                      saveError={etapasState.errorByLocalId[trecho.localId]}
                      canRemove={trechos.length > 1}
                      onChange={(next) => etapasState.updateDraft(trecho.localId, next)}
                      onDuplicate={() => void etapasState.duplicateEtapa(trecho.localId)}
                      onRemove={() => void etapasState.removeEtapa(trecho.localId)}
                    />
                  ))}
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Trechos são gravados em `cv_voo_etapas` (fonte canônica). Horas e consumo do
                    cartão são preview; totais oficiais vêm do backend após o save.
                  </p>
                </section>
              )}

              {step === 'abastecimentos' && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                    <Droplets className="h-4 w-4 text-amber-500" /> Abastecimentos
                  </h2>
                  <p className="mb-4 text-xs text-slate-500">
                    Opcional nesta etapa. Registre reabastecimentos do voo.
                  </p>
                  {abastecimentos.length === 0 ? (
                    <p className="mb-4 text-sm text-slate-500">Nenhum abastecimento registrado.</p>
                  ) : (
                    <ul className="mb-4 divide-y divide-slate-100 dark:divide-slate-800">
                      {abastecimentos.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium text-slate-800 dark:text-slate-100">
                              {a.localidade || a.fornecedor || 'Abastecimento'} ·{' '}
                              {a.combustivel_abastecido ?? a.combustivel_solicitado ?? '—'}{' '}
                              {a.unidade}
                            </p>
                            <p className="text-xs text-slate-500">{formatDateTime(a.data_hora)}</p>
                          </div>
                          {editable && (
                            <button
                              type="button"
                              onClick={() =>
                                id &&
                                removerAbastecimento.mutate({ vooId: id, abastecimentoId: a.id })
                              }
                              className="text-xs font-medium text-red-600 hover:underline"
                            >
                              Remover
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {editable && (
                    <button
                      type="button"
                      disabled={criarAbastecimento.isPending}
                      onClick={() => {
                        if (!id) return;
                        criarAbastecimento.mutate({
                          vooId: id,
                          data_hora: new Date().toISOString(),
                          localidade: origem?.codigo_icao || undefined,
                          unidade: 'kg',
                        });
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                    >
                      <Plus className="h-3.5 w-3.5" /> Registrar abastecimento rápido
                    </button>
                  )}
                </section>
              )}

              {step === 'observacoes' && (
                <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-800 dark:text-slate-100">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Observações
                  </h2>
                  <div className="space-y-4">
                    <label className="block space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500">Ocorrências</span>
                      <textarea
                        value={form.ocorrencias}
                        disabled={!editable}
                        onChange={(e) => updateField('ocorrencias', e.target.value)}
                        rows={4}
                        className={inputClass}
                        placeholder="Eventos operacionais relevantes…"
                      />
                    </label>
                    <label className="block space-y-1 text-sm">
                      <span className="text-xs font-medium text-slate-500">
                        Divergências do planejado
                      </span>
                      <textarea
                        value={form.divergencias}
                        disabled={!editable}
                        onChange={(e) => updateField('divergencias', e.target.value)}
                        rows={4}
                        className={inputClass}
                        placeholder="Alterações de rota, horário, destinos…"
                      />
                    </label>
                  </div>
                </section>
              )}

              {step === 'revisao' && (
                <section className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                    <h2 className="mb-4 text-base font-semibold text-slate-800 dark:text-slate-100">
                      Resumo antes do envio
                    </h2>
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-slate-400">RDV</dt>
                        <dd className="font-medium">{form.numero}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Data</dt>
                        <dd>{formatDate(form.data_voo)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Decolagem</dt>
                        <dd className="font-mono">{form.horario_decolagem_real || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Pouso</dt>
                        <dd className="font-mono">{form.horario_pouso_real || '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Horas</dt>
                        <dd className="font-mono">{formatHours(parseNumber(form.horas_voadas))}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Pousos / ciclos</dt>
                        <dd>
                          {form.numero_pousos || '—'} / {form.ciclos || '—'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Combustível</dt>
                        <dd className="font-mono">
                          {formatCombustivel(parseNumber(form.combustivel_decolagem))} →{' '}
                          {formatCombustivel(parseNumber(form.combustivel_pouso))} (consumo{' '}
                          {formatCombustivel(parseNumber(form.combustivel_consumo))})
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Tripulação</dt>
                        <dd>{tripulantes.length} tripulante(s)</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Trechos</dt>
                        <dd>{trechos.length}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-400">Abastecimentos</dt>
                        <dd>{abastecimentos.length}</dd>
                      </div>
                    </dl>
                    {(form.ocorrencias || form.divergencias) && (
                      <div className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
                        {form.ocorrencias && (
                          <p>
                            <span className="text-xs text-slate-400">Ocorrências: </span>
                            {form.ocorrencias}
                          </p>
                        )}
                        {form.divergencias && (
                          <p>
                            <span className="text-xs text-slate-400">Divergências: </span>
                            {form.divergencias}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {alertas.length > 0 && (
                    <div className="space-y-2">
                      {alertas.map((alerta) => (
                        <div
                          key={alerta.id}
                          className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>{alerta.mensagem}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={stepIndex === 0}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-800 dark:text-slate-200"
                >
                  <ChevronLeft className="h-4 w-4" /> Anterior
                </button>
                {stepIndex < RDV_PILOT_STEPS.length - 1 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Próximo <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">
                    Revise e use as ações ao lado para finalizar/enviar.
                  </span>
                )}
              </div>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
              {editable && (
                <ControleVoosRdvSaveStatus
                  status={autosave.status}
                  error={autosave.error}
                  lastSavedAt={autosave.lastSavedAt}
                />
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                <h2 className="mb-3 text-base font-semibold text-slate-800 dark:text-slate-100">
                  Ações
                </h2>
                <div className="space-y-2">
                  {editable && (
                    <button
                      type="button"
                      onClick={handleManualSave}
                      disabled={autosave.status === 'salvando'}
                      className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {autosave.status === 'salvando' ? 'Salvando…' : 'Salvar agora'}
                    </button>
                  )}

                  {editable && rdv?.status === 'rascunho' && (
                    <button
                      type="button"
                      onClick={handleFinalizar}
                      disabled={finalizarMutation.isPending}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${
                        finalizarConfirm
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300'
                      }`}
                    >
                      <CheckCircle className="h-4 w-4" />
                      {finalizarConfirm ? 'Confirmar finalização' : 'Finalizar preenchimento'}
                    </button>
                  )}

                  {canEnviar && (
                    <button
                      type="button"
                      onClick={handleEnviar}
                      disabled={enviar.isPending}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      <Send className="h-4 w-4" />
                      {enviar.isPending ? 'Enviando…' : 'Enviar para Coordenação'}
                    </button>
                  )}

                  {!editable && (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                      Preenchimento bloqueado neste status do fluxo.
                    </p>
                  )}
                </div>
              </div>

              {rdv && id && (
                <ControleVoosRdvWorkflowPanel vooId={id} rdv={rdv} isCoordenacao={isCoordenacao} />
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <Link
                  to={`/controle-voos/voos/${voo.id}`}
                  className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  ← Ver detalhe do voo
                </Link>
              </div>

              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Uso operacional interno. Não regulado. Breakpoints: mobile (&lt;sm select),
                tablet/desktop (stepper horizontal).
              </p>
            </aside>
          </div>
        </ControleVoosPageShell>
      </div>
    </AppLayout>
  );
}
