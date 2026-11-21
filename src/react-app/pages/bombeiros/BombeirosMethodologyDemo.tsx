/**
 * BOA tender walkthrough: fixed, entirely synthetic comparison.
 * This component accepts no personal health entries and cannot grant duty.
 */
import { useState } from 'react';
import { useApiMutation } from '@/react-app/hooks/useApi';

type Scenario = {
  mode: 'SYNTHETIC';
  mission_type: 'RESGATE';
  duty_period: 'DIURNO' | 'NOTURNO';
  standby_activation: boolean;
  critical_mission: boolean;
  sleep_hours_24h: number;
  sleep_fragmented: boolean;
  kss_reported: number;
  pvt_60s_completed: boolean;
  self_declared_unfit: boolean;
};
type Assessment = {
  method_version: string;
  status: 'INCOMPLETE_EVIDENCE' | 'HUMAN_REVIEW_REQUIRED';
  dispatch_permission: 'NOT_GRANTED';
  persisted: false;
  evidence: Array<{ factor: string; state: 'PRESENT' | 'MISSING'; description: string }>;
  actions: string[];
  references: string[];
  limitations: string[];
};
const PRESETS = {
  A: {
    mode: 'SYNTHETIC', mission_type: 'RESGATE', duty_period: 'DIURNO',
    standby_activation: false, critical_mission: false, sleep_hours_24h: 8,
    sleep_fragmented: false, kss_reported: 2, pvt_60s_completed: true,
    self_declared_unfit: false,
  },
  B: {
    mode: 'SYNTHETIC', mission_type: 'RESGATE', duty_period: 'NOTURNO',
    standby_activation: true, critical_mission: true, sleep_hours_24h: 4,
    sleep_fragmented: true, kss_reported: 8, pvt_60s_completed: false,
    self_declared_unfit: true,
  },
} as const satisfies Record<string, Scenario>;

export default function BombeirosMethodologyDemo() {
  const [scenario, setScenario] = useState<'A' | 'B'>('A');
  const [result, setResult] = useState<Assessment | null>(null);
  const { mutate, loading, error } = useApiMutation<Assessment>();

  const run = async () => {
    setResult(null);
    try {
      const next = await mutate('/api/bombeiros/frms/simulacao/metodologia', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(PRESETS[scenario]),
      });
      setResult(next);
    } catch {
      // Display only the safe error returned by the authenticated API client.
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-slate-300 bg-white p-4"
      aria-label="Demonstração metodológica sintética BOA">
      <div>
        <h2 className="text-lg font-semibold">Metodologia em teste — aviação dos Bombeiros</h2>
        <p className="text-sm text-slate-700">
          Dois cenários totalmente fictícios demonstram a coleta de evidências, limitações
          científicas e a necessidade de revisão humana. Não constituem avaliação de pessoas,
          check-in registrado, laudo, liberação de voo ou prova de conceito homologada.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Cenários fictícios">
        <button type="button" aria-pressed={scenario === 'A'}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          onClick={() => { setScenario('A'); setResult(null); }}>
          Cenário A: missão diurna, evidências presentes
        </button>
        <button type="button" aria-pressed={scenario === 'B'}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
          onClick={() => { setScenario('B'); setResult(null); }}>
          Cenário B: acionamento noturno e revisão prioritária
        </button>
      </div>
      <p className="text-sm text-slate-700">
        Referência: {scenario === 'A'
          ? '8 horas de sono autorrelatado, KSS 2, simulação de PVT-B 60s preenchida.'
          : '4 horas de sono autorrelatado, KSS 8, sono fragmentado, PVT-B pendente e declaração fictícia de impedimento.'}
        {' '}Esses valores são somente exemplos sintéticos, sem inferência individual.
      </p>
      <button type="button" disabled={loading} onClick={() => void run()}
        className="rounded-lg border border-slate-500 px-4 py-2 text-sm font-semibold disabled:opacity-50">
        {loading ? 'Analisando evidências fictícias…' : 'Executar análise sintética'}
      </button>
      {error && <p role="alert" className="text-sm text-rose-800">
        Simulação não disponível: {error}. O perfil do BOA precisa estar aprovado e
        o ambiente deve ser staging/desenvolvimento.
      </p>}
      {result && <div className="space-y-3 text-sm">
        <p><strong>Resultado:</strong> {result.status === 'INCOMPLETE_EVIDENCE'
          ? 'Evidências insuficientes — revisão humana obrigatória'
          : 'Revisão humana obrigatória'}.</p>
        <p><strong>Liberação operacional:</strong> não concedida.
          <strong> Gravação:</strong> nenhuma.</p>
        <h3 className="font-semibold">Rastreabilidade dos fatores do cenário</h3>
        <ul className="list-disc pl-5">
          {result.evidence.map(factor => <li key={factor.factor}>
            {factor.factor}: {factor.state === 'PRESENT' ? 'informado' : 'não informado'} —
            {' '}{factor.description}
          </li>)}
        </ul>
        <h3 className="font-semibold">Providências e escalonamento</h3>
        <ul className="list-disc pl-5">
          {result.actions.map((value, i) => <li key={i}>{value}</li>)}
        </ul>
        <h3 className="font-semibold">Fontes e limites do método</h3>
        <ul className="list-disc pl-5">
          {[...result.references, ...result.limitations].map((value, i) =>
            <li key={i}>{value}</li>)}
        </ul>
        <p className="text-xs text-slate-600">Método: {result.method_version}</p>
      </div>}
    </section>
  );
}
