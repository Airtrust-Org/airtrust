/**
 * Operational mitigation for BOA coordinators.
 * Deliberately separate from the admin aggregate dashboard and from offshore.
 */
import { useState } from 'react';
import AppLayout from '@/react-app/components/AppLayout';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useApi, useApiMutation } from '@/react-app/hooks/useApi';

type CaseStatus = {
  case_id: string;
  state: 'ABERTO' | 'EM_TRATAMENTO' | 'RESOLVIDO';
  created_at: string | null;
  closed_at: string | null;
  treatment_recorded: boolean;
};
type CaseEnvelope = {
  success: boolean;
  data: CaseStatus;
  meta?: { tenant_id: number };
};
type EvidenceCoverage = {
  case_id: string;
  source: 'BOA_AUTHENTICATED_CHECKIN_EVENT';
  sleep_evidence: 'SELF_REPORTED_UNVERIFIED' | 'NOT_REPORTED';
  kss_evidence: 'SUBJECTIVE_SELF_REPORT' | 'NOT_REPORTED';
  mission_context: 'CREW_DECLARATION_UNVERIFIED' | 'NOT_REPORTED';
  pvt_evidence: 'NO_PERFORMANCE_MEASUREMENT';
  duty_roster: 'NOT_LINKED_TO_AUTHORIZED_BOA_SOURCE';
  actual_mission_times: 'NOT_LINKED_TO_AUTHORIZED_BOA_SOURCE';
  scientific_risk_estimate: null;
  requires_human_review: true;
  dispatch_permission: 'NOT_GRANTED';
};

export default function BombeirosCaseManagementPage() {
  const { empresas, empresaAtualId } = useAuth();
  const active = empresas.find(company => company.id === empresaAtualId);
  const validTenant = Boolean(active?.codigo === 'bombeiros' && empresaAtualId && empresaAtualId !== 6);
  const [draftId, setDraftId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [prazo, setPrazo] = useState('');
  const [acao, setAcao] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [eficacia, setEficacia] = useState('');
  const [notice, setNotice] = useState('');
  const [queueCursor, setQueueCursor] = useState<{ created_at: string; id: string } | null>(null);
  const { data, loading, error, refetch } = useApi<CaseEnvelope>(
    `/api/bombeiros/frms/casos/${encodeURIComponent(caseId)}`,
    { enabled: validTenant && Boolean(caseId), bypassGetCache: true, staleTime: 0, requireAuth: true },
  );
  const {
    data: evidenceEnvelope, loading: evidenceLoading, error: evidenceError,
  } = useApi<{ success: boolean; data: EvidenceCoverage }>(
    `/api/bombeiros/frms/casos/${encodeURIComponent(caseId)}/evidencias`,
    { enabled: validTenant && Boolean(caseId), bypassGetCache: true, staleTime: 0, requireAuth: true },
  );
  const evidence = evidenceEnvelope?.success && evidenceEnvelope.data.case_id === caseId
    ? evidenceEnvelope.data : null;
  const queueQuery = queueCursor
    ? `&cursor_at=${encodeURIComponent(queueCursor.created_at)}&cursor_id=${encodeURIComponent(queueCursor.id)}`
    : '';
  const { data: caseQueue, loading: queueLoading, error: queueError, refetch: refetchQueue } =
    useApi<{ success: boolean; data: {
      items: CaseStatus[]; next_cursor: { created_at: string; id: string } | null;
    } }>(
      `/api/bombeiros/frms/casos?limit=50${queueQuery}`,
      { enabled: validTenant, bypassGetCache: true, staleTime: 0, requireAuth: true },
    );
  const visibleCases = caseQueue?.success && Array.isArray(caseQueue.data?.items)
    ? caseQueue.data.items : [];

  const { mutate, loading: saving, error: mutationError } = useApiMutation<{
    success: boolean; status: string;
  }>();
  const status = data?.success && data.data?.case_id === caseId ? data.data : null;

  const findCase = () => {
    setCaseId(draftId.trim());
    setResponsavel('');
    setPrazo('');
    setAcao('');
    setJustificativa('');
    setEficacia('');
    setNotice('');
  };
  const submitTreatment = async () => {
    if (!caseId) return;
    setNotice('');
    try {
      await mutate(`/api/bombeiros/frms/casos/${encodeURIComponent(caseId)}/tratamento`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responsavel, prazo, acao_mitigacao: acao, justificativa,
        }),
      });
      setNotice('Tratamento registrado. O caso permanece aberto até verificação de eficácia.');
      void refetch();
      void refetchQueue();
    } catch { /* Safe error from authenticated API displayed below. */ }
  };
  const closeCase = async () => {
    if (!caseId) return;
    setNotice('');
    try {
      await mutate(`/api/bombeiros/frms/casos/${encodeURIComponent(caseId)}/resolver`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avaliacao_eficacia: eficacia }),
      });
      setNotice('Fechamento registrado com verificação de eficácia.');
      void refetch();
    } catch { /* Safe error from authenticated API displayed below. */ }
  };

  return (
    <AppLayout>
      {!validTenant ? (
        <div role="alert" className="rounded border border-red-300 p-4">
          Esta gestão de ocorrências é exclusiva da empresa Bombeiros.
        </div>
      ) : (
        <main className="space-y-4 p-2">
          <header>
            <p className="text-xs font-semibold uppercase">BOA — coordenação operacional</p>
            <h1 className="text-2xl font-semibold">Tratamento e eficácia das medidas FRMS</h1>
            <p className="text-sm text-slate-700">
              Apenas ocorrências BOA registradas no tenant e nos setores autorizados.
              Nenhuma informação clínica individual é exibida; os registros de tratamento
              possuem responsável, prazo, medida, justificativa e auditoria.
            </p>
          </header>
          <section className="rounded border border-slate-300 bg-white p-4 space-y-3"
            aria-label="Fila de revisão BOA">
            <h2 className="font-semibold">Fila de ocorrências da equipe autorizada</h2>
            <p className="text-sm text-slate-700">
              Apenas código, data e situação. Dados individuais de fadiga não são publicados
              nesta lista. A fila não inclui pessoas de outros setores ou empresas.
            </p>
            {queueLoading && <p role="status">Consultando fila de revisão…</p>}
            {queueError && <p role="alert" className="text-sm text-rose-800">
              Fila indisponível para o escopo autorizado: {queueError}
            </p>}
            {!queueLoading && !queueError && visibleCases.length === 0 &&
              <p className="text-sm">Nenhuma ocorrência disponível neste recorte.</p>}
            <ul className="space-y-2">
              {visibleCases.map(item => <li key={item.case_id}
                className="flex flex-wrap justify-between gap-2 rounded border border-slate-200 p-2 text-sm">
                <div><strong>{item.case_id}</strong>
                  <span className="ml-2">{item.state} · {item.created_at ?? 'data indisponível'}</span>
                </div>
                <button type="button" className="rounded border px-3 py-1"
                  onClick={() => {
                    setDraftId(item.case_id); setCaseId(item.case_id);
                    setNotice('');
                  }}>Abrir caso</button>
              </li>)}
            </ul>
            <div className="flex gap-2">
              <button type="button" className="rounded border px-3 py-2 text-sm"
                disabled={!queueCursor} onClick={() => setQueueCursor(null)}>Primeira página</button>
              <button type="button" className="rounded border px-3 py-2 text-sm"
                disabled={!caseQueue?.data?.next_cursor}
                onClick={() => setQueueCursor(caseQueue?.data?.next_cursor ?? null)}>Próxima página</button>
            </div>
          </section>
          <section className="rounded border border-slate-300 bg-white p-4 space-y-3">
            <h2 className="font-semibold">Consultar ocorrência previamente registrada</h2>
            <div className="flex flex-wrap gap-2">
              <input aria-label="Identificador da ocorrência BOA"
                value={draftId} onChange={e => setDraftId(e.target.value)}
                placeholder="Código da ocorrência BOA"
                className="min-w-60 flex-1 rounded border border-slate-300 p-2" />
              <button type="button" onClick={findCase}
                className="rounded border border-slate-500 px-4 py-2">Consultar</button>
            </div>
            {loading && <p role="status">Consultando caso…</p>}
            {error && <p role="alert" className="text-sm text-rose-800">
              Caso indisponível, fora do escopo autorizado ou configuração BOA não aprovada: {error}
            </p>}
            {status && <div className="space-y-2 text-sm">
              <p>Ocorrência: <strong>{status.case_id}</strong></p>
              <p>Estado registrado: <strong>{status.state}</strong></p>
              <p>Tratamento já registrado: {status.treatment_recorded ? 'sim' : 'não'}</p>
              <section className="space-y-2 rounded border border-slate-200 bg-slate-50 p-3"
                aria-label="Evidências do check-in de origem">
                <h3 className="font-semibold">Cobertura das evidências recebidas</h3>
                <p>Esta avaliação da disponibilidade de fontes vem do recibo autenticado
                  vinculado à ocorrência, sem valores pessoais de sono, KSS ou desempenho.</p>
                {evidenceLoading && <p role="status">Verificando fontes do check-in…</p>}
                {evidenceError && <p role="alert">
                  Cobertura indisponível. Não presumir que o dado foi coletado: {evidenceError}
                </p>}
                {!evidenceLoading && !evidenceError && !evidence &&
                  <p>Não foi possível comprovar as evidências desta ocorrência.</p>}
                {evidence && <>
                  <ul className="space-y-1">
                    <li>Sono: {evidence.sleep_evidence === 'SELF_REPORTED_UNVERIFIED'
                      ? 'autorrelato recebido, não aferido' : 'não informado'}</li>
                    <li>Sonolência KSS: {evidence.kss_evidence === 'SUBJECTIVE_SELF_REPORT'
                      ? 'escala subjetiva declarada' : 'não informada'}</li>
                    <li>Missão e período: {evidence.mission_context === 'CREW_DECLARATION_UNVERIFIED'
                      ? 'declarados, sem confirmação da escala' : 'contexto não comprovado'}</li>
                    <li>Desempenho cognitivo: sem teste PVT mensurado.</li>
                    <li>Escala operacional: não conectada a fonte BOA autorizada.</li>
                    <li>Horários reais da missão: não conectados a fonte BOA autorizada.</li>
                  </ul>
                  <p className="font-medium">Revisão humana obrigatória. Estimativa científica
                    de risco indisponível. Liberação de voo não concedida.</p>
                </>}
              </section>
              {status.state === 'ABERTO' && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Registrar mitigação sem encerrar</h3>
                  <input aria-label="Responsável pela mitigação" placeholder="Responsável"
                    value={responsavel} onChange={e => setResponsavel(e.target.value)}
                    className="block w-full rounded border p-2" />
                  <label className="block">Prazo
                    <input aria-label="Prazo da mitigação" type="date"
                      value={prazo} onChange={e => setPrazo(e.target.value)}
                      className="ml-2 rounded border p-2" />
                  </label>
                  <textarea aria-label="Medida de mitigação" placeholder="Medida executada/planejada"
                    value={acao} onChange={e => setAcao(e.target.value)}
                    className="w-full rounded border p-2" rows={3} />
                  <textarea aria-label="Justificativa da mitigação" placeholder="Justificativa"
                    value={justificativa} onChange={e => setJustificativa(e.target.value)}
                    className="w-full rounded border p-2" rows={3} />
                  <button type="button" disabled={saving} onClick={() => void submitTreatment()}
                    className="rounded border border-slate-500 px-4 py-2 disabled:opacity-50">
                    Registrar tratamento
                  </button>
                </div>
              )}
              {status.state === 'EM_TRATAMENTO' && (
                <div className="space-y-2">
                  <h3 className="font-semibold">Avaliação de eficácia antes do encerramento</h3>
                  <textarea aria-label="Verificação documentada de eficácia"
                    value={eficacia} onChange={e => setEficacia(e.target.value)}
                    className="w-full rounded border p-2" rows={4}
                    placeholder="Descreva a evidência verificável de eficácia" />
                  <button type="button" disabled={saving} onClick={() => void closeCase()}
                    className="rounded border border-slate-500 px-4 py-2 disabled:opacity-50">
                    Encerrar com eficácia documentada
                  </button>
                </div>
              )}
              {status.state === 'RESOLVIDO' &&
                <p>Encerrado em: {status.closed_at ?? 'data de encerramento indisponível'}.</p>}
            </div>}
            {notice && <p role="status">{notice}</p>}
            {mutationError && <p role="alert" className="text-sm text-rose-800">{mutationError}</p>}
          </section>
          <p className="text-sm text-slate-600">
            Esta interface utiliza alertas BOA_* existentes. A geração automática de ocorrências
            a partir de avaliações reais depende do protocolo BOA homologado e ainda não foi liberada.
          </p>
        </main>
      )}
    </AppLayout>
  );
}
