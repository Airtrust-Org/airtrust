/**
 * BOA crew check-in — development/staging only until governance acceptance.
 * Distinct from the offshore FRMS form. No employee/tenant ID supplied by UI.
 */
import { useState } from 'react';
import AppLayout from '@/react-app/components/AppLayout';
import { useAuth } from '@/react-app/hooks/useAuth';
import { useApi, useApiMutation } from '@/react-app/hooks/useApi';

const MISSIONS = [
  ['RESGATE', 'Resgate'],
  ['SALVAMENTO', 'Salvamento'],
  ['TRANSPORTE_AEROMEDICO', 'Transporte aeromédico'],
  ['COMBATE_AEREO_INCENDIO', 'Combate aéreo a incêndio'],
  ['TREINAMENTO', 'Treinamento'],
  ['OUTRA', 'Outra missão'],
] as const;
type Mission = (typeof MISSIONS)[number][0];
type TriState = 'DESCONHECIDO' | 'SIM' | 'NAO';
const decode = (v: TriState): boolean | null =>
  v === 'SIM' ? true : v === 'NAO' ? false : null;
type Result = {
  accepted: boolean; checkin_id: string | null; case_id: string | null;
  status: string; dispatch_permission: string; method_version: string;
};

export default function BombeirosCheckinPage() {
  const { empresas, empresaAtualId, user } = useAuth();
  const active = empresas.find(x => x.id === empresaAtualId);
  const role = String(user?.role || '').toUpperCase();
  const allowed = Boolean(active?.codigo === 'bombeiros' && empresaAtualId && empresaAtualId !== 6
    && !['ADMIN', 'ADMINISTRADOR'].includes(role));
  const [mission, setMission] = useState<Mission>('RESGATE');
  const [duty, setDuty] = useState<'DIURNO'|'NOTURNO'|'MISTO'|'DESCONHECIDO'>('DESCONHECIDO');
  const [standby, setStandby] = useState<TriState>('DESCONHECIDO');
  const [critical, setCritical] = useState<TriState>('DESCONHECIDO');
  const [sleep, setSleep] = useState('');
  const [fragmented, setFragmented] = useState<TriState>('DESCONHECIDO');
  const [kss, setKss] = useState('');
  const [pvt, setPvt] = useState<TriState>('DESCONHECIDO');
  const [unfit, setUnfit] = useState<TriState>('DESCONHECIDO');
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const { mutate, loading, error } = useApiMutation<Result>();
  const {
    data: receiptResponse, error: receiptError,
    loading: checkingReceipt, refetch: refetchReceipt,
  } = useApi<{ success: boolean; data: {
    received: boolean; checkin_id: string | null; case_id: string | null;
    human_review_required: boolean; dispatch_permission: 'NOT_GRANTED';
  } }>('/api/bombeiros/frms/checkin/status', {
    enabled: allowed, requireAuth: true, bypassGetCache: true, staleTime: 0,
  });
  const received = Boolean(receiptResponse?.success && receiptResponse.data.received);
  const tri = (label: string, v: TriState, change: (v: TriState) => void) =>
    <label className="block text-sm">{label}
      <select className="mt-1 block w-full rounded border p-2" value={v}
        onChange={e => change(e.target.value as TriState)}>
        <option value="DESCONHECIDO">Não informado</option>
        <option value="SIM">Sim</option>
        <option value="NAO">Não</option>
      </select>
    </label>;

  const submit = async () => {
    setResult(null);
    if (!allowed || !consent || received || receiptError || checkingReceipt) return;
    try {
      const saved = await mutate('/api/bombeiros/frms/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission_type: mission, duty_period: duty,
          standby_activation: decode(standby), critical_mission: decode(critical),
          sleep_hours_24h: sleep.trim() === '' ? null : Number(sleep),
          sleep_fragmented: decode(fragmented),
          kss_reported: kss === '' ? null : Number(kss),
          pvt_60s_completed: decode(pvt),
          self_declared_unfit: decode(unfit),
          acknowledge_confidentiality: true,
        }),
      });
      setResult(saved);
      void refetchReceipt();
    } catch { /* API error shown below, never infer check-in success. */ }
  };

  return <AppLayout>
    {!allowed ? (
      <div role="alert" className="rounded border border-red-300 p-4">
        Check-in exclusivo da tripulação vinculada à empresa Bombeiros.
      </div>
    ) : (
      <main className="space-y-4 p-3">
        <h1 className="text-2xl font-bold">BOA — Registro de fadiga antes da missão</h1>
        <p className="text-sm text-slate-700">
          Fluxo próprio dos Bombeiros para testes em staging/desenvolvimento.
          Utilize exclusivamente contas e registros fictícios homologados para QA.
          Este preenchimento não libera missão, não determina aptidão e não calcula
          pontuações utilizadas pela operação offshore.
        </p>
        <section className="space-y-2 rounded border border-slate-300 p-3 text-sm"
          aria-label="Situação do recibo BOA">
          {checkingReceipt && <p role="status">Conferindo recibo existente…</p>}
          {receiptError && <p role="alert">
            Não foi possível verificar o recibo anterior: {receiptError}.
            O envio fica indisponível até revalidar a situação.
          </p>}
          {received && <div>
            <p>Check-in do dia já recebido. Não reenviar nem interpretar como aptidão.</p>
            <p>Recibo: {receiptResponse?.data.checkin_id ?? 'indisponível'}</p>
            <p>Ocorrência para revisão humana: {receiptResponse?.data.case_id ?? 'indisponível'}</p>
          </div>}
          {!received && !checkingReceipt && !receiptError &&
            <p>Nenhum recibo identificado hoje. A submissão, se aceita, exige revisão humana.</p>}
        </section>
        <section className="grid gap-3 rounded border p-4 md:grid-cols-2" aria-label="Avaliação inicial BOA">
          <label className="text-sm">Tipo de missão
            <select aria-label="Tipo de missão" value={mission}
              onChange={e => setMission(e.target.value as Mission)}
              className="mt-1 block w-full rounded border p-2">
              {MISSIONS.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-sm">Período da missão
            <select aria-label="Período da missão" value={duty}
              onChange={e => setDuty(e.target.value as typeof duty)}
              className="mt-1 block w-full rounded border p-2">
              {['DESCONHECIDO','DIURNO','NOTURNO','MISTO'].map(value =>
                <option key={value} value={value}>{value === 'DESCONHECIDO' ? 'Não informado' : value}</option>)}
            </select>
          </label>
          {tri('Acionamento durante sobreaviso',standby,setStandby)}
          {tri('Missão considerada crítica pela tripulação',critical,setCritical)}
          <label className="text-sm">Horas de sono autorrelatadas nas últimas 24 horas
            <input aria-label="Horas de sono em 24 horas" type="number" min="0" max="24" step="0.5"
              value={sleep} onChange={e=>setSleep(e.target.value)}
              className="mt-1 block w-full rounded border p-2" />
          </label>
          {tri('Sono fragmentado ou interrompido',fragmented,setFragmented)}
          <label className="text-sm">Sonolência KSS autorrelatada (1–9)
            <select aria-label="Sonolência KSS" value={kss}
              onChange={e=>setKss(e.target.value)}
              className="mt-1 block w-full rounded border p-2">
              <option value="">Não informada</option>
              {Array.from({length:9},(_,i)=>i+1).map(n=>
                <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {tri('PVT-B de 60 segundos adaptado realizado (somente autorrelato)',pvt,setPvt)}
          {tri('Declaro impedimento ou indisponibilidade operacional',unfit,setUnfit)}
        </section>
        <label className="flex gap-2 text-sm">
          <input aria-label="Confirmar ciência e confidencialidade" type="checkbox" checked={consent}
            onChange={e=>setConsent(e.target.checked)} />
          Declaro ciência de que os dados são restritos, não substituem avaliação profissional
          e serão usados somente no ambiente de validação autorizado.
        </label>
        <button type="button" disabled={!consent || loading || checkingReceipt || Boolean(receiptError) || received}
          className="rounded border border-slate-500 px-4 py-2 font-semibold disabled:opacity-50"
          onClick={() => void submit()}>
          {loading ? 'Registrando evidência…' : 'Enviar para revisão humana'}
        </button>
        {error && <p role="alert" className="text-sm text-red-800">
          Registro não confirmado: {error}. Não suponha conclusão de check-in.
        </p>}
        {result && <section role="status" className="rounded border p-4 text-sm">
          <p>Recibo de envio: <strong>{result.checkin_id ?? 'indisponível'}</strong></p>
          <p>Ocorrência para revisão humana: <strong>{result.case_id ?? 'indisponível'}</strong></p>
          <p>Situação: <strong>{result.status}</strong>.</p>
          <p>Liberação operacional: <strong>não concedida</strong>.
            A coordenação deve registrar tratamento e avaliação de eficácia.</p>
        </section>}
      </main>
    )}
  </AppLayout>;
}
