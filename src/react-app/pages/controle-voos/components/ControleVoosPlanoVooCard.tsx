import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, FileCheck2, FileText, RefreshCw, Save, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/react-app/services/apiClient';

type FlightPlanCommon = {
  identificacao_aeronave: string;
  regra_voo: '' | 'I' | 'V' | 'Y' | 'Z';
  tipo_voo: '' | 'S' | 'N' | 'G' | 'M' | 'X';
  numero_aeronaves: number;
  tipo_aeronave: string;
  categoria_esteira: '' | 'J' | 'H' | 'M' | 'L';
  equipamento: string;
  vigilancia: string;
};

type FlightPlanLeg = {
  ordem: number;
  origem: string;
  data_partida_utc: string;
  eobt_utc: string;
  velocidade_cruzeiro: string;
  nivel_cruzeiro: string;
  rota: string;
  destino: string;
  eet: string;
  alternado_1: string;
  alternado_2: string;
  outros_dados: string;
  autonomia: string;
  pessoas_bordo: string;
};

type FlightPlanPayload = {
  schema_version: 1;
  comuns: FlightPlanCommon;
  pernas: FlightPlanLeg[];
  contato: { responsavel: string; telefone: string };
};

type FlightPlanLegReadiness = {
  ordem: number;
  ready: boolean;
  missing: string[];
  warnings: string[];
  preview: string | null;
};

type FlightPlanReadiness = {
  ready: boolean;
  missing_common: string[];
  warnings: string[];
  pernas: FlightPlanLegReadiness[];
};

type FlightPlanResponse = {
  available: boolean;
  schema_change_id: string;
  transmission: { provider: string; enabled: boolean; reason: string };
  reference: {
    modelo_aeronave: string | null;
    rota: Array<{ codigo: string; codigo_icao?: string | null; nome?: string | null }>;
  };
  plan: null | {
    id: number;
    status: 'rascunho' | 'pronto' | 'submetido' | 'aceito' | 'rejeitado' | 'cancelado';
    versao: number;
    provider: string;
    protocolo_decea: string | null;
    external_id: string | null;
    payload: FlightPlanPayload;
    updated_at: string;
  };
  draft: FlightPlanPayload;
  readiness: FlightPlanReadiness;
};

const inputClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:disabled:bg-slate-800';

function statusLabel(status: FlightPlanResponse['plan'] extends null ? never : string) {
  const labels: Record<string, string> = {
    rascunho: 'Rascunho',
    pronto: 'Pronto para conferência',
    submetido: 'Submetido',
    aceito: 'Aceito',
    rejeitado: 'Rejeitado',
    cancelado: 'Cancelado',
  };
  return labels[status] || status;
}

function routeLabel(reference: FlightPlanResponse['reference']) {
  return reference.rota
    .map((point) => String(point.codigo_icao || point.codigo || '').trim())
    .filter(Boolean)
    .join(' → ');
}

export default function ControleVoosPlanoVooCard({
  vooId,
  canEdit,
}: {
  vooId: string | number;
  canEdit: boolean;
}) {
  const [data, setData] = useState<FlightPlanResponse | null>(null);
  const [payload, setPayload] = useState<FlightPlanPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get<FlightPlanResponse>(`/controle-voos/voos/${vooId}/plano-voo`);
      if (!response.success || !response.data) throw new Error(response.error || 'Falha ao carregar plano de voo');
      setData(response.data);
      setPayload(response.data.plan?.payload || response.data.draft);
      if (!response.data.plan && canEdit) setExpanded(true);
    } catch (error) {
      console.error('[Controle de Voos] Falha ao carregar plano estruturado', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vooId]);

  const readiness = data?.readiness;
  const missingCount = useMemo(() => {
    if (!readiness) return 0;
    return readiness.missing_common.length + readiness.pernas.reduce((sum, leg) => sum + leg.missing.length, 0);
  }, [readiness]);

  const updateCommon = <K extends keyof FlightPlanCommon>(key: K, value: FlightPlanCommon[K]) => {
    setPayload((current) => current ? { ...current, comuns: { ...current.comuns, [key]: value } } : current);
  };

  const updateLeg = <K extends keyof FlightPlanLeg>(index: number, key: K, value: FlightPlanLeg[K]) => {
    setPayload((current) => {
      if (!current) return current;
      const pernas = current.pernas.map((leg, legIndex) => legIndex === index ? { ...leg, [key]: value } : leg);
      return { ...current, pernas };
    });
  };

  const updateContact = (key: 'responsavel' | 'telefone', value: string) => {
    setPayload((current) => current ? { ...current, contato: { ...current.contato, [key]: value } } : current);
  };

  const refreshPreview = async () => {
    if (!payload) return;
    setPreviewing(true);
    try {
      const response = await apiClient.post<{
        payload: FlightPlanPayload;
        readiness: FlightPlanReadiness;
      }>(`/controle-voos/voos/${vooId}/plano-voo/preview`, { payload });
      if (!response.success || !response.data) throw new Error(response.error || 'Falha ao gerar prévia');
      setPayload(response.data.payload);
      setData((current) => current ? { ...current, draft: response.data!.payload, readiness: response.data!.readiness } : current);
      if (response.data.readiness.ready) toast.success('Prévia FPL atualizada e pronta para conferência.');
      else toast.info('Prévia atualizada. Existem campos obrigatórios pendentes.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao gerar prévia FPL');
    } finally {
      setPreviewing(false);
    }
  };

  const save = async (status: 'rascunho' | 'pronto') => {
    if (!payload || !data || saving) return;
    setSaving(true);
    try {
      const response = await apiClient.put<FlightPlanResponse>(`/controle-voos/voos/${vooId}/plano-voo`, {
        payload,
        status,
        ...(data.plan ? { versao: data.plan.versao } : {}),
      });
      if (!response.success || !response.data) throw new Error(response.error || 'Falha ao salvar plano de voo');
      setData(response.data);
      setPayload(response.data.plan?.payload || response.data.draft);
      toast.success(status === 'pronto' ? 'Plano marcado como pronto para conferência.' : 'Rascunho do plano salvo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao salvar plano de voo');
    } finally {
      setSaving(false);
    }
  };

  const copyPreview = async (preview: string | null) => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview);
      toast.success('Prévia FPL copiada.');
    } catch {
      toast.error('Não foi possível copiar a prévia.');
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-sm text-slate-500">Carregando plano de voo estruturado…</p>
      </div>
    );
  }

  if (!data || !payload) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900" data-testid="structured-flight-plan-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-cyan-600" />
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Plano de voo</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Preenchimento estruturado conforme o fluxo FPL. Uma prévia é gerada para cada perna do voo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            data.plan?.status === 'pronto'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
          }`}>
            {data.plan ? statusLabel(data.plan.status) : 'Ainda não salvo'}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {expanded ? 'Fechar edição' : 'Editar plano'}
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/40">
          <p className="text-xs text-slate-500">Rota operacional</p>
          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{routeLabel(data.reference) || '—'}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/40">
          <p className="text-xs text-slate-500">Pernas FPL</p>
          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{payload.pernas.length}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/40">
          <p className="text-xs text-slate-500">Completude</p>
          <p className={`mt-1 text-sm font-semibold ${readiness?.ready ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}>
            {readiness?.ready ? 'Pronto para conferência' : `${missingCount} pendência(s)`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-200">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {data.transmission.reason} O AirTrust não considera a prévia como plano aceito pelo DECEA.
        </p>
      </div>

      {!data.available && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800 dark:border-orange-900/60 dark:bg-orange-950/20 dark:text-orange-200">
          O schema governado <strong>{data.schema_change_id}</strong> ainda não está aplicado neste ambiente. A prévia pode ser conferida, mas o rascunho não pode ser persistido.
        </div>
      )}

      {expanded && canEdit && (
        <div className="mt-5 space-y-5 border-t border-slate-200 pt-5 dark:border-slate-800">
          <section>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Dados comuns do FPL</h3>
            {data.reference.modelo_aeronave && (
              <p className="mt-1 text-xs text-slate-500">Modelo cadastrado no AirTrust: {data.reference.modelo_aeronave}. Confira o designador ICAO antes de marcar como pronto.</p>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Identificação da aeronave
                <input aria-label="Identificação da aeronave" className={inputClass} value={payload.comuns.identificacao_aeronave} onChange={(e) => updateCommon('identificacao_aeronave', e.target.value.toUpperCase() as FlightPlanCommon['identificacao_aeronave'])} />
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Regra de voo
                <select aria-label="Regra de voo" className={inputClass} value={payload.comuns.regra_voo} onChange={(e) => updateCommon('regra_voo', e.target.value as FlightPlanCommon['regra_voo'])}>
                  <option value="">Selecione</option><option value="I">I</option><option value="V">V</option><option value="Y">Y</option><option value="Z">Z</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Tipo de voo
                <select aria-label="Tipo de voo FPL" className={inputClass} value={payload.comuns.tipo_voo} onChange={(e) => updateCommon('tipo_voo', e.target.value as FlightPlanCommon['tipo_voo'])}>
                  <option value="">Selecione</option><option value="S">S</option><option value="N">N</option><option value="G">G</option><option value="M">M</option><option value="X">X</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Nº aeronaves
                <input aria-label="Número de aeronaves" type="number" min="1" max="99" className={inputClass} value={payload.comuns.numero_aeronaves} onChange={(e) => updateCommon('numero_aeronaves', Number(e.target.value) || 1)} />
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Tipo/designador ICAO da aeronave
                <input aria-label="Tipo ICAO da aeronave" className={inputClass} value={payload.comuns.tipo_aeronave} onChange={(e) => updateCommon('tipo_aeronave', e.target.value.toUpperCase())} placeholder="Ex.: A139" />
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Categoria de esteira
                <select aria-label="Categoria de esteira" className={inputClass} value={payload.comuns.categoria_esteira} onChange={(e) => updateCommon('categoria_esteira', e.target.value as FlightPlanCommon['categoria_esteira'])}>
                  <option value="">Selecione</option><option value="L">L</option><option value="M">M</option><option value="H">H</option><option value="J">J</option>
                </select>
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Equipamento/capacidades
                <input aria-label="Equipamento FPL" className={inputClass} value={payload.comuns.equipamento} onChange={(e) => updateCommon('equipamento', e.target.value.toUpperCase())} placeholder="Campo 10a" />
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Vigilância
                <input aria-label="Vigilância FPL" className={inputClass} value={payload.comuns.vigilancia} onChange={(e) => updateCommon('vigilancia', e.target.value.toUpperCase())} placeholder="Campo 10b" />
              </label>
            </div>
          </section>

          {payload.pernas.map((leg, index) => {
            const legReadiness = readiness?.pernas.find((item) => item.ordem === leg.ordem);
            return (
              <section key={leg.ordem} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Perna {leg.ordem}: {leg.origem || '—'} → {leg.destino || '—'}</h3>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${legReadiness?.ready ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                    {legReadiness?.ready ? 'Completa' : `${legReadiness?.missing.length || 0} pendência(s)`}
                  </span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Partida
                    <input aria-label={`Partida perna ${leg.ordem}`} className={inputClass} value={leg.origem} onChange={(e) => updateLeg(index, 'origem', e.target.value.toUpperCase())} />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Data UTC
                    <input aria-label={`Data UTC perna ${leg.ordem}`} type="date" className={inputClass} value={leg.data_partida_utc} onChange={(e) => updateLeg(index, 'data_partida_utc', e.target.value)} />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">EOBT UTC (HHMM)
                    <input aria-label={`EOBT perna ${leg.ordem}`} className={inputClass} maxLength={4} value={leg.eobt_utc} onChange={(e) => updateLeg(index, 'eobt_utc', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1430" />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Destino
                    <input aria-label={`Destino perna ${leg.ordem}`} className={inputClass} value={leg.destino} onChange={(e) => updateLeg(index, 'destino', e.target.value.toUpperCase())} />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Velocidade de cruzeiro
                    <input aria-label={`Velocidade perna ${leg.ordem}`} className={inputClass} value={leg.velocidade_cruzeiro} onChange={(e) => updateLeg(index, 'velocidade_cruzeiro', e.target.value.toUpperCase())} placeholder="Ex.: N0130" />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Nível/altitude
                    <input aria-label={`Nível perna ${leg.ordem}`} className={inputClass} value={leg.nivel_cruzeiro} onChange={(e) => updateLeg(index, 'nivel_cruzeiro', e.target.value.toUpperCase())} placeholder="Ex.: A015" />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">Rota
                    <input aria-label={`Rota perna ${leg.ordem}`} className={inputClass} value={leg.rota} onChange={(e) => updateLeg(index, 'rota', e.target.value.toUpperCase())} />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">EET (HHMM)
                    <input aria-label={`EET perna ${leg.ordem}`} className={inputClass} maxLength={4} value={leg.eet} onChange={(e) => updateLeg(index, 'eet', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0115" />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Alternado 1
                    <input aria-label={`Alternado 1 perna ${leg.ordem}`} className={inputClass} value={leg.alternado_1} onChange={(e) => updateLeg(index, 'alternado_1', e.target.value.toUpperCase())} />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Alternado 2
                    <input aria-label={`Alternado 2 perna ${leg.ordem}`} className={inputClass} value={leg.alternado_2} onChange={(e) => updateLeg(index, 'alternado_2', e.target.value.toUpperCase())} />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Autonomia (HHMM)
                    <input aria-label={`Autonomia perna ${leg.ordem}`} className={inputClass} maxLength={4} value={leg.autonomia} onChange={(e) => updateLeg(index, 'autonomia', e.target.value.replace(/\D/g, '').slice(0, 4))} />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Pessoas a bordo
                    <input aria-label={`Pessoas a bordo perna ${leg.ordem}`} className={inputClass} value={leg.pessoas_bordo} onChange={(e) => updateLeg(index, 'pessoas_bordo', e.target.value.toUpperCase())} />
                  </label>
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-300 sm:col-span-2 lg:col-span-3">Outros dados / Campo 18
                    <textarea aria-label={`Campo 18 perna ${leg.ordem}`} className={`${inputClass} min-h-20`} value={leg.outros_dados} onChange={(e) => updateLeg(index, 'outros_dados', e.target.value.toUpperCase())} />
                  </label>
                </div>
                {legReadiness && legReadiness.missing.length > 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    <strong>Pendências:</strong> {legReadiness.missing.join(' · ')}
                  </div>
                )}
                {legReadiness?.preview && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-950 p-3 dark:border-slate-700">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200">Prévia da mensagem FPL</span>
                      <button type="button" onClick={() => void copyPreview(legReadiness.preview)} className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800">
                        <Clipboard className="h-3.5 w-3.5" /> Copiar
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap break-words text-xs text-emerald-300">{legReadiness.preview}</pre>
                  </div>
                )}
              </section>
            );
          })}

          <section>
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Contato operacional</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Responsável
                <input aria-label="Responsável pelo plano" className={inputClass} value={payload.contato.responsavel} onChange={(e) => updateContact('responsavel', e.target.value)} />
              </label>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">Telefone
                <input aria-label="Telefone do responsável" className={inputClass} value={payload.contato.telefone} onChange={(e) => updateContact('telefone', e.target.value)} />
              </label>
            </div>
          </section>

          {readiness && readiness.missing_common.length > 0 && (
            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
              <strong>Dados comuns pendentes:</strong> {readiness.missing_common.join(' · ')}
            </div>
          )}

          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={() => void refreshPreview()} disabled={previewing} className="inline-flex items-center gap-2 rounded-lg border border-cyan-600 px-3 py-2 text-sm font-medium text-cyan-700 disabled:opacity-50 dark:text-cyan-300">
              <RefreshCw className={`h-4 w-4 ${previewing ? 'animate-spin' : ''}`} /> Atualizar prévia
            </button>
            <button type="button" onClick={() => void save('rascunho')} disabled={saving || !data.available} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
              <Save className="h-4 w-4" /> Salvar rascunho
            </button>
            <button type="button" onClick={() => void save('pronto')} disabled={saving || !data.available || !readiness?.ready} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              <FileCheck2 className="h-4 w-4" /> Marcar pronto para conferência
            </button>
          </div>
        </div>
      )}

      {!expanded && readiness?.ready && (
        <div className="mt-4 flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Todas as pernas têm os campos mínimos para gerar a prévia FPL.
        </div>
      )}
    </div>
  );
}
