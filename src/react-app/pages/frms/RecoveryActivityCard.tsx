import { useMemo, useState } from 'react';
import Button from '@/react-app/components/Button';
import {
  previousOperationalDate,
  useFrmsRecoveryContext,
  useSubmitFrmsRecoveryActivity,
  type RecoveryActivitySegmentInput,
  type RecoveryActivityType,
} from '@/react-app/hooks/useFrmsRecovery';
import { toast } from 'sonner';
import { safeRecoveryActivityErrorMessage } from './recoveryActivityUi';

const OPTIONS: Array<{ value: RecoveryActivityType; label: string; description: string }> = [
  {
    value: 'OFF_DUTY',
    label: 'Folga / descanso',
    description: 'Sem obrigação operacional relevante durante o dia.',
  },
  {
    value: 'STANDBY_HOME_HOTEL',
    label: 'Standby em hotel ou residência',
    description: 'Disponível para acionamento, sem permanência presencial na base.',
  },
  {
    value: 'STANDBY_ONSITE',
    label: 'Standby na base / aeroporto',
    description: 'Disponibilidade presencial para a operação.',
  },
  {
    value: 'ADMIN_TRAINING',
    label: 'Administrativo / treinamento',
    description: 'Houve trabalho sem atividade de voo.',
  },
  {
    value: 'DUTY_TRAVEL',
    label: 'Deslocamento a serviço / viagem',
    description: 'Deslocamento operacional sem etapa de voo registrada como tripulante.',
  },
  {
    value: 'MIXED',
    label: 'Mais de uma situação',
    description: 'O dia teve dois ou mais períodos com condições diferentes.',
  },
  {
    value: 'OTHER',
    label: 'Outro',
    description: 'Outra condição operacional não contemplada acima.',
  },
  {
    value: 'FLIGHT_NOT_IN_SOURCE',
    label: 'Houve voo, mas não aparece no sistema',
    description: 'Registra uma possível falha de integração do SIGVOOS; não gera recuperação.',
  },
];

const SEGMENT_OPTIONS: Array<{ value: RecoveryActivitySegmentInput['activity_type']; label: string }> = [
  { value: 'OFF_DUTY', label: 'Livre / descanso' },
  { value: 'STANDBY_HOME_HOTEL', label: 'Standby hotel/residência' },
  { value: 'STANDBY_ONSITE', label: 'Standby base/aeroporto' },
  { value: 'ADMIN_TRAINING', label: 'Administrativo/treinamento' },
  { value: 'DUTY_TRAVEL', label: 'Deslocamento a serviço' },
  { value: 'OTHER', label: 'Outro' },
];

const LABELS = Object.fromEntries(OPTIONS.map((option) => [option.value, option.label]));

function defaultSegments(): RecoveryActivitySegmentInput[] {
  return [
    { activity_type: 'ADMIN_TRAINING', start_time: '08:00', end_time: '12:00' },
    { activity_type: 'OFF_DUTY', start_time: '12:00', end_time: '20:00' },
  ];
}

export default function RecoveryActivityCard({ today }: { today: string }) {
  const referenceDate = useMemo(() => previousOperationalDate(today), [today]);
  const { data: context, isLoading, isError } = useFrmsRecoveryContext(referenceDate);
  const submit = useSubmitFrmsRecoveryActivity();
  const [editing, setEditing] = useState(false);
  const [activityType, setActivityType] = useState<RecoveryActivityType | null>(null);
  const [standbyLocation, setStandbyLocation] = useState<'HOME' | 'HOTEL' | 'BASE_AIRPORT' | 'OTHER'>('HOTEL');
  const [immediateCallout, setImmediateCallout] = useState<boolean | null>(null);
  const [dutyStart, setDutyStart] = useState('');
  const [dutyEnd, setDutyEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [segments, setSegments] = useState<RecoveryActivitySegmentInput[]>(defaultSegments());

  if (isLoading || isError || !context?.schema_ready) return null;
  if (context.flight.detected) return null;

  const existingType = String(context.activity?.activity_type || '') as RecoveryActivityType;
  if (context.activity && !editing) {
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-emerald-900">Atividade de ontem registrada</h2>
            <p className="mt-1 text-sm text-emerald-800">
              {LABELS[existingType] || existingType || 'Classificação registrada'}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              Esta informação qualifica a oportunidade de recuperação; ela não cria bônus automático de efetividade.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Corrigir classificação
          </Button>
        </div>
      </section>
    );
  }

  const needsStandbyDetail = activityType === 'STANDBY_HOME_HOTEL' || activityType === 'STANDBY_ONSITE';
  const needsDutyWindow =
    activityType === 'ADMIN_TRAINING' || activityType === 'DUTY_TRAVEL' || activityType === 'OTHER';

  const save = async () => {
    if (!activityType) {
      toast.error('Informe como foi sua condição operacional ontem.');
      return;
    }
    try {
      const result = await submit.mutateAsync({
        reference_date: referenceDate,
        activity_type: activityType,
        standby_location:
          activityType === 'STANDBY_ONSITE'
            ? 'BASE_AIRPORT'
            : activityType === 'STANDBY_HOME_HOTEL'
              ? standbyLocation
              : undefined,
        immediate_callout_required: needsStandbyDetail ? immediateCallout : undefined,
        duty_start_time: needsDutyWindow && dutyStart ? dutyStart : undefined,
        duty_end_time: needsDutyWindow && dutyEnd ? dutyEnd : undefined,
        notes: notes.trim() || undefined,
        segments: activityType === 'MIXED' ? segments : undefined,
      });
      if (result.source_discrepancy) {
        toast.warning('Possível falha de origem SIGVOOS registrada para revisão.');
      } else {
        toast.success('Condição operacional de ontem registrada.');
      }
      setEditing(false);
    } catch (error) {
      console.error('[RecoveryActivityCard] Falha ao registrar condição operacional', error);
      toast.error(safeRecoveryActivityErrorMessage(error));
    }
  };

  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Atividade de ontem</h2>
        <p className="mt-1 text-xs text-slate-600">
          Não encontramos atividade de voo no SIGVOOS em {referenceDate}. Como foi sua condição operacional?
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = activityType === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setActivityType(option.value)}
              className={`rounded-xl border p-3 text-left transition-colors ${
                selected
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
              <span className="mt-1 block text-xs text-slate-500">{option.description}</span>
            </button>
          );
        })}
      </div>

      {needsStandbyDetail && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {activityType === 'STANDBY_HOME_HOTEL' && (
            <label className="text-sm font-medium text-slate-700">
              Onde permaneceu?
              <select
                value={standbyLocation}
                onChange={(event) => setStandbyLocation(event.target.value as typeof standbyLocation)}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <option value="HOTEL">Hotel / alojamento</option>
                <option value="HOME">Residência</option>
                <option value="OTHER">Outro local</option>
              </select>
            </label>
          )}
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Precisava ficar disponível para acionamento imediato?</legend>
            <div className="mt-1 flex gap-2">
              <Button variant={immediateCallout === true ? 'primary' : 'secondary'} onClick={() => setImmediateCallout(true)}>
                Sim
              </Button>
              <Button variant={immediateCallout === false ? 'primary' : 'secondary'} onClick={() => setImmediateCallout(false)}>
                Não
              </Button>
            </div>
          </fieldset>
        </div>
      )}

      {needsDutyWindow && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Início aproximado
            <input
              type="time"
              value={dutyStart}
              onChange={(event) => setDutyStart(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Fim aproximado
            <input
              type="time"
              value={dutyEnd}
              onChange={(event) => setDutyEnd(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
        </div>
      )}

      {activityType === 'MIXED' && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-slate-700">Períodos aproximados</p>
          {segments.map((segment, index) => (
            <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-3">
              <select
                value={segment.activity_type}
                onChange={(event) => {
                  const next = [...segments];
                  next[index] = {
                    ...next[index],
                    activity_type: event.target.value as RecoveryActivitySegmentInput['activity_type'],
                  };
                  setSegments(next);
                }}
                className="min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {SEGMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                type="time"
                value={segment.start_time || ''}
                onChange={(event) => {
                  const next = [...segments];
                  next[index] = { ...next[index], start_time: event.target.value };
                  setSegments(next);
                }}
                className="min-h-11 rounded-xl border border-slate-200 px-3 py-2"
                aria-label={`Início do período ${index + 1}`}
              />
              <input
                type="time"
                value={segment.end_time || ''}
                onChange={(event) => {
                  const next = [...segments];
                  next[index] = { ...next[index], end_time: event.target.value };
                  setSegments(next);
                }}
                className="min-h-11 rounded-xl border border-slate-200 px-3 py-2"
                aria-label={`Fim do período ${index + 1}`}
              />
            </div>
          ))}
          {segments.length < 3 && (
            <Button
              variant="secondary"
              onClick={() => setSegments([...segments, { activity_type: 'OFF_DUTY' }])}
            >
              Adicionar período
            </Button>
          )}
        </div>
      )}

      {(activityType === 'OTHER' || activityType === 'FLIGHT_NOT_IN_SOURCE') && (
        <label className="mt-4 block text-sm font-medium text-slate-700">
          Observação
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={2}
            maxLength={1000}
            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            placeholder={
              activityType === 'FLIGHT_NOT_IN_SOURCE'
                ? 'Se possível, informe rota, aeronave ou horário para facilitar a reconciliação.'
                : 'Descreva brevemente a condição.'
            }
          />
        </label>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={!activityType || submit.isPending}>
          {submit.isPending ? 'Salvando...' : 'Salvar condição de ontem'}
        </Button>
        {editing && (
          <Button variant="secondary" onClick={() => setEditing(false)} disabled={submit.isPending}>
            Cancelar
          </Button>
        )}
      </div>
    </section>
  );
}
