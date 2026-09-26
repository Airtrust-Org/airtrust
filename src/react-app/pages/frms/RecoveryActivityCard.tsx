import { useMemo, useState } from 'react';
import Button from '@/react-app/components/Button';
import {
  clearPendingFrmsRecoveryActivity,
  previousOperationalDate,
  stagePendingFrmsRecoveryActivity,
  useFrmsRecoveryContext,
  type RecoveryActivityInput,
  type RecoveryActivitySegmentInput,
  type RecoveryActivityType,
} from '@/react-app/hooks/useFrmsRecovery';

const PRIMARY_OPTIONS: Array<{ value: RecoveryActivityType; label: string; description: string }> = [
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
];

const SECONDARY_OPTIONS: Array<{ value: RecoveryActivityType; label: string; description: string }> = [
  {
    value: 'DUTY_TRAVEL',
    label: 'Deslocamento a serviço',
    description: 'Viagem ou deslocamento operacional sem voo como tripulante.',
  },
  {
    value: 'MIXED',
    label: 'Mais de uma situação',
    description: 'O dia teve dois ou mais períodos com condições diferentes.',
  },
  {
    value: 'OTHER',
    label: 'Outra atividade',
    description: 'Use somente se nenhuma das opções acima representar o dia.',
  },
  {
    value: 'FLIGHT_NOT_IN_SOURCE',
    label: 'Houve voo, mas não aparece no sistema',
    description: 'Sinaliza falha de fonte para reconciliação; não cria voo no FRMS.',
  },
];

const OPTIONS = [...PRIMARY_OPTIONS, ...SECONDARY_OPTIONS];

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
  const [editing, setEditing] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [activityType, setActivityType] = useState<RecoveryActivityType | null>(null);
  const [standbyLocation, setStandbyLocation] = useState<'HOME' | 'HOTEL' | 'BASE_AIRPORT' | 'OTHER'>('HOTEL');
  const [immediateCallout, setImmediateCallout] = useState<boolean | null>(null);
  const [dutyStart, setDutyStart] = useState('');
  const [dutyEnd, setDutyEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [segments, setSegments] = useState<RecoveryActivitySegmentInput[]>(defaultSegments());

  const needsStandbyDetail =
    activityType === 'STANDBY_HOME_HOTEL' || activityType === 'STANDBY_ONSITE';
  const needsDutyWindow =
    activityType != null &&
    !['OFF_DUTY', 'MIXED', 'FLIGHT_NOT_IN_SOURCE', 'UNKNOWN'].includes(activityType);

  const stageActivity = (nextType: RecoveryActivityType | null) => {
    setActivityType(nextType);
    if (!nextType) {
      stagePendingFrmsRecoveryActivity(referenceDate, null, true);
      return;
    }
    const input: RecoveryActivityInput = {
      reference_date: referenceDate,
      activity_type: nextType,
      standby_location:
        nextType === 'STANDBY_ONSITE'
          ? 'BASE_AIRPORT'
          : nextType === 'STANDBY_HOME_HOTEL'
            ? standbyLocation
            : undefined,
      immediate_callout_required:
        nextType === 'STANDBY_HOME_HOTEL' || nextType === 'STANDBY_ONSITE'
          ? immediateCallout
          : undefined,
      duty_start_time:
        !['OFF_DUTY', 'MIXED', 'FLIGHT_NOT_IN_SOURCE', 'UNKNOWN'].includes(nextType)
          ? dutyStart || undefined
          : undefined,
      duty_end_time:
        !['OFF_DUTY', 'MIXED', 'FLIGHT_NOT_IN_SOURCE', 'UNKNOWN'].includes(nextType)
          ? dutyEnd || undefined
          : undefined,
      notes: notes.trim() || undefined,
      segments: nextType === 'MIXED' ? segments : undefined,
    };
    stagePendingFrmsRecoveryActivity(referenceDate, input, true);
  };

  if (isLoading || isError || !context?.schema_ready) return null;
  if (context.flight.detected) {
    clearPendingFrmsRecoveryActivity(referenceDate);
    return null;
  }

  const existingType = String(context.activity?.activity_type || '') as RecoveryActivityType;
  if (context.activity && !editing) {
    clearPendingFrmsRecoveryActivity(referenceDate);
    return (
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-emerald-900">Atividade de ontem registrada</h2>
            <p className="mt-1 text-sm text-emerald-800">
              {LABELS[existingType] || existingType || 'Classificação registrada'}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              Esta informação entra como evidência de carga/recuperação. Folga não cria bônus automático; standby e atividade de trabalho seguem critérios próprios de duração, sono e disponibilidade.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Corrigir classificação
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Atividade de ontem</h2>
        <p className="mt-1 text-xs text-slate-600">
          Não encontramos atividade de voo no SIGVOOS em {referenceDate}. Como foi sua condição operacional?
        </p>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {PRIMARY_OPTIONS.map((option) => {
          const selected = activityType === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => stageActivity(option.value)}
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

      <div className="mt-3 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={() => setShowMoreOptions((value) => !value)}
          className="text-xs font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          {showMoreOptions ? 'Ocultar outras situações' : 'Outras situações'}
        </button>
        {showMoreOptions ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
          {SECONDARY_OPTIONS.map((option) => {
            const selected = activityType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => stageActivity(option.value)}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  selected
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
              </button>
            );
          })}
          </div>
        ) : null}
      </div>

      {needsStandbyDetail && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {activityType === 'STANDBY_HOME_HOTEL' && (
            <label className="text-sm font-medium text-slate-700">
              Onde permaneceu?
              <select
                value={standbyLocation}
                onChange={(event) => {
                  const value = event.target.value as typeof standbyLocation;
                  setStandbyLocation(value);
                  const input: RecoveryActivityInput = {
                    reference_date: referenceDate,
                    activity_type: 'STANDBY_HOME_HOTEL',
                    standby_location: value,
                    immediate_callout_required: immediateCallout,
                    duty_start_time: dutyStart || undefined,
                    duty_end_time: dutyEnd || undefined,
                  };
                  stagePendingFrmsRecoveryActivity(referenceDate, input, true);
                }}
                className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2"
              >
                <option value="HOTEL">Hotel / alojamento</option>
                <option value="HOME">Residência</option>
                <option value="OTHER">Outro local</option>
              </select>
            </label>
          )}
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">
              Precisava ficar disponível para acionamento imediato?
            </legend>
            <div className="mt-1 flex gap-2">
              <Button
                variant={immediateCallout === true ? 'primary' : 'secondary'}
                onClick={() => {
                  setImmediateCallout(true);
                  stagePendingFrmsRecoveryActivity(
                    referenceDate,
                    {
                      reference_date: referenceDate,
                      activity_type: activityType!,
                      standby_location:
                        activityType === 'STANDBY_ONSITE' ? 'BASE_AIRPORT' : standbyLocation,
                      immediate_callout_required: true,
                      duty_start_time: dutyStart || undefined,
                      duty_end_time: dutyEnd || undefined,
                    },
                    true,
                  );
                }}
              >
                Sim
              </Button>
              <Button
                variant={immediateCallout === false ? 'primary' : 'secondary'}
                onClick={() => {
                  setImmediateCallout(false);
                  stagePendingFrmsRecoveryActivity(
                    referenceDate,
                    {
                      reference_date: referenceDate,
                      activity_type: activityType!,
                      standby_location:
                        activityType === 'STANDBY_ONSITE' ? 'BASE_AIRPORT' : standbyLocation,
                      immediate_callout_required: false,
                      duty_start_time: dutyStart || undefined,
                      duty_end_time: dutyEnd || undefined,
                    },
                    true,
                  );
                }}
              >
                Não
              </Button>
            </div>
          </fieldset>
        </div>
      )}

      {needsDutyWindow && (
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
          <p className="mb-3 text-xs text-slate-600">
            Informe o início e o fim da atividade. Esses horários definem a janela de trabalho/standby do dia anterior e evitam inferir jornada pelo voo.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Início aproximado
            <input
              type="time"
              value={dutyStart}
              onChange={(event) => {
                setDutyStart(event.target.value);
                stagePendingFrmsRecoveryActivity(
                  referenceDate,
                  {
                    reference_date: referenceDate,
                    activity_type: activityType!,
                    standby_location:
                      activityType === 'STANDBY_ONSITE'
                        ? 'BASE_AIRPORT'
                        : activityType === 'STANDBY_HOME_HOTEL'
                          ? standbyLocation
                          : undefined,
                    immediate_callout_required:
                      activityType === 'STANDBY_HOME_HOTEL' || activityType === 'STANDBY_ONSITE'
                        ? immediateCallout
                        : undefined,
                    duty_start_time: event.target.value || undefined,
                    duty_end_time: dutyEnd || undefined,
                    notes: notes.trim() || undefined,
                  },
                  true,
                );
              }}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Fim aproximado
            <input
              type="time"
              value={dutyEnd}
              onChange={(event) => {
                setDutyEnd(event.target.value);
                stagePendingFrmsRecoveryActivity(
                  referenceDate,
                  {
                    reference_date: referenceDate,
                    activity_type: activityType!,
                    standby_location:
                      activityType === 'STANDBY_ONSITE'
                        ? 'BASE_AIRPORT'
                        : activityType === 'STANDBY_HOME_HOTEL'
                          ? standbyLocation
                          : undefined,
                    immediate_callout_required:
                      activityType === 'STANDBY_HOME_HOTEL' || activityType === 'STANDBY_ONSITE'
                        ? immediateCallout
                        : undefined,
                    duty_start_time: dutyStart || undefined,
                    duty_end_time: event.target.value || undefined,
                    notes: notes.trim() || undefined,
                  },
                  true,
                );
              }}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 py-2"
            />
          </label>
          </div>
        </div>
      )}

      {activityType === 'MIXED' && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-slate-700">Períodos aproximados</p>
          {segments.map((segment, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-3"
            >
              <select
                value={segment.activity_type}
                onChange={(event) => {
                  const next = [...segments];
                  next[index] = {
                    ...next[index],
                    activity_type: event.target.value as RecoveryActivitySegmentInput['activity_type'],
                  };
                  setSegments(next);
                  stagePendingFrmsRecoveryActivity(
                    referenceDate,
                    { reference_date: referenceDate, activity_type: 'MIXED', segments: next },
                    true,
                  );
                }}
                className="min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                {SEGMENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={segment.start_time || ''}
                onChange={(event) => {
                  const next = [...segments];
                  next[index] = { ...next[index], start_time: event.target.value };
                  setSegments(next);
                  stagePendingFrmsRecoveryActivity(
                    referenceDate,
                    { reference_date: referenceDate, activity_type: 'MIXED', segments: next },
                    true,
                  );
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
                  stagePendingFrmsRecoveryActivity(
                    referenceDate,
                    { reference_date: referenceDate, activity_type: 'MIXED', segments: next },
                    true,
                  );
                }}
                className="min-h-11 rounded-xl border border-slate-200 px-3 py-2"
                aria-label={`Fim do período ${index + 1}`}
              />
            </div>
          ))}
          {segments.length < 3 && (
            <Button
              variant="secondary"
              onClick={() => {
                const next = [...segments, { activity_type: 'OFF_DUTY' as const }];
                setSegments(next);
                stagePendingFrmsRecoveryActivity(
                  referenceDate,
                  { reference_date: referenceDate, activity_type: 'MIXED', segments: next },
                  true,
                );
              }}
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
            onChange={(event) => {
              setNotes(event.target.value);
              stagePendingFrmsRecoveryActivity(
                referenceDate,
                {
                  reference_date: referenceDate,
                  activity_type: activityType,
                  duty_start_time: needsDutyWindow && dutyStart ? dutyStart : undefined,
                  duty_end_time: needsDutyWindow && dutyEnd ? dutyEnd : undefined,
                  notes: event.target.value.trim() || undefined,
                },
                true,
              );
            }}
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

      <div className="mt-4 flex flex-col gap-2 rounded-xl bg-slate-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-600">
          Esta resposta será salva junto com as demais informações quando você concluir o check-in.
        </p>
        {editing && (
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(false);
              clearPendingFrmsRecoveryActivity(referenceDate);
            }}
          >
            Cancelar correção
          </Button>
        )}
      </div>
    </section>
  );
}
