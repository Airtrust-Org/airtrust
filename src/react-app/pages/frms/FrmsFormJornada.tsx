/**
 * FRMS — Modal de Lançamento / Edição de Jornada
 *
 * Campos condicionais por status:
 *  - ES / RE / TV / EX: hora_apresentacao, hora_termino, horas_voo, base_operacional, aeronave
 *  - TS / SA / FE / FR / FS / AM / DM / OT: apenas data + status + observacao
 */
import { useState, useEffect, useRef, FormEvent } from 'react';
import { X, Loader2, AlertTriangle, Info, ChevronDown } from 'lucide-react';
import { useFrmsMutation } from '@/react-app/hooks/useFrms';
import type { FrmsJornadaRow } from '@/react-app/hooks/useFrms';
import { toast } from 'sonner';
import { emitirEventoModulo } from '@/react-app/lib/moduloBus';
import TimeInput from '@/react-app/components/TimeInput';
import { normalizeTimeInput } from '@/react-app/lib/time-input';

function getTodayLocalKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const STATUS_OPTIONS = [
  // Em Serviço
  { value: 'ES', label: 'ES – Escala de Serviço' },
  { value: 'TS', label: 'TS – Treinamento de Solo' },
  { value: 'TV', label: 'TV – Treinamento de Voo' },
  { value: 'EX', label: 'EX – Exame de Voo' },
  { value: 'RE', label: 'RE – Reserva' },
  { value: 'SA', label: 'SA – Sobreaviso' },
  // Fora de Serviço
  { value: 'FE', label: 'FE – Férias' },
  { value: 'FR', label: 'FR – Folga Regulamentar' },
  { value: 'FS', label: 'FS – Folga Social' },
  { value: 'AM', label: 'AM – Atestado Médico' },
  { value: 'DM', label: 'DM – Dispensa Médica' },
  { value: 'OT', label: 'OT – Outra' },
];

const NEEDS_HORARIOS = new Set(['ES', 'RE', 'TV', 'EX']);

interface Props {
  tripulanteId: string;
  tripulanteNome?: string;
  jornada: FrmsJornadaRow | null; // null = novo
  onClose: () => void;
  onSaved: () => void;
}

export default function FrmsFormJornada({
  tripulanteId,
  tripulanteNome,
  jornada,
  onClose,
  onSaved,
}: Props) {
  const { mutate, loading } = useFrmsMutation();
  const isEditing = !!jornada;

  const [data, setData] = useState(jornada?.data || getTodayLocalKey());
  const [status, setStatus] = useState(jornada?.status || 'ES');
  const [horaApres, setHoraApres] = useState(jornada?.hora_apresentacao || '');
  const [horaTerm, setHoraTerm] = useState(jornada?.hora_termino || '');
  const [horasVoo, setHorasVoo] = useState(
    jornada?.horas_voo_minutos ? minToHHMM(jornada.horas_voo_minutos) : '',
  );
  const [observacao, setObservacao] = useState(jornada?.observacao || '');
  const [result, setResult] = useState<{
    bloqueado?: boolean;
    alertas?: Array<{ nivel: string; mensagem: string }>;
  } | null>(null);

  // ── Preview em Tempo Real ──────────────────────────────
  const [preview, setPreview] = useState<{
    alertas: Array<{ nivel: string; mensagem: string }>;
    violacoes: Array<{ tipo_limite: string; percentual: number }>;
    bloqueado: boolean;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHorarios = NEEDS_HORARIOS.has(status);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Dispara preview ao mudar campos relevantes
  useEffect(() => {
    const horaApresNormalizada = normalizeTimeInput(horaApres);
    const horaTermNormalizada = normalizeTimeInput(horaTerm);
    if (!showHorarios || !horaApresNormalizada || !horaTermNormalizada) {
      setPreview(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const apresMin = hhmmToMin(horaApresNormalizada);
      const termMin = hhmmToMin(horaTermNormalizada);
      if (apresMin < 0 || termMin < 0) return;
      const duracao = termMin >= apresMin ? termMin - apresMin : 1440 - apresMin + termMin;
      const hvParsed = horasVoo ? hhmmToMin(horasVoo) : 0;
      const hv = hvParsed >= 0 ? hvParsed : 0;
      try {
        setLoadingPreview(true);
        const d = (await mutate('/api/frms/validar-escala', {
          method: 'POST',
          body: JSON.stringify({
            tripulante_id: tripulanteId,
            periodos: [{ data, status, duracao_estimada_min: duracao, hv_estimada_min: hv }],
          }),
        })) as {
          violacoes: Array<{ tipo_limite: string; percentual: number }>;
          alertas: Array<{ nivel: string; mensagem: string }>;
        } | null;
        if (d) {
          const todasViolacoes = d.violacoes ?? [];
          const todosAlertas = d.alertas ?? [];
          setPreview({
            alertas: todosAlertas,
            violacoes: todasViolacoes,
            bloqueado: todosAlertas.some((a) => a.nivel === 'CRITICO'),
          });
        } else {
          setPreview(null);
        }
      } catch {
        setPreview(null);
      } finally {
        setLoadingPreview(false);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [horaApres, horaTerm, horasVoo, data, status, tripulanteId, showHorarios, mutate]);

  function hhmmToMin(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return -1;
    return h * 60 + m;
  }

  function minToHHMM(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const body: Record<string, unknown> = {
      tripulante_id: tripulanteId,
      data,
      status,
      observacao: observacao || null,
    };

    if (showHorarios) {
      const horaApresNormalizada = normalizeTimeInput(horaApres);
      const horaTermNormalizada = normalizeTimeInput(horaTerm);
      if (!horaApresNormalizada || !horaTermNormalizada) {
        toast.error('Informe horários válidos no formato HH:mm (00:00 até 23:59).');
        return;
      }
      body.hora_apresentacao = horaApresNormalizada;
      body.hora_termino = horaTermNormalizada;
      const hvMin = horasVoo ? hhmmToMin(horasVoo) : null;
      body.horas_voo_minutos = hvMin !== null && hvMin >= 0 ? hvMin : null;
    }

    try {
      let resp: {
        bloqueado?: boolean;
        alertas?: Array<{ nivel: string; mensagem: string }>;
      } | null = null;
      if (isEditing) {
        const raw = await mutate(`/api/frms/jornadas/${jornada!.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        resp = (raw ?? null) as {
          bloqueado?: boolean;
          alertas?: Array<{ nivel: string; mensagem: string }>;
        } | null;
      } else {
        const raw = await mutate('/api/frms/jornadas', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        resp = (raw ?? null) as {
          bloqueado?: boolean;
          alertas?: Array<{ nivel: string; mensagem: string }>;
        } | null;
      }

      // Mostra alertas se houver (mutate retorna result.data já desembrulhado)
      if ((resp?.alertas?.length ?? 0) > 0 || resp?.bloqueado) {
        setResult({
          bloqueado: resp?.bloqueado,
          alertas: resp?.alertas,
        });
        if (resp?.bloqueado) {
          toast.error('Jornada bloqueada por limites excedidos!');
          return;
        }
      }

      toast.success(isEditing ? 'Jornada atualizada' : 'Jornada lançada');
      emitirEventoModulo({
        modulo: 'frms',
        tipo: 'FRMS_ATUALIZADO',
        funcionarioIds: [tripulanteId],
      });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao salvar jornada';
      toast.error(message || 'Erro ao salvar jornada');
    }
  };

  const handleDelete = async () => {
    if (!jornada) return;
    try {
      await mutate(`/api/frms/jornadas/${jornada.id}`, { method: 'DELETE' });
      toast.success('Jornada excluída');
      emitirEventoModulo({
        modulo: 'frms',
        tipo: 'FRMS_ATUALIZADO',
        funcionarioIds: [tripulanteId],
      });
      onSaved();
    } catch {
      toast.error('Erro ao excluir jornada');
    }
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEditing ? 'Editar Jornada' : 'Lançar Jornada'}
            </h2>
            {tripulanteNome && (
              <p className="text-sm text-primary font-medium mt-0.5">{tripulanteNome}</p>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100 transition-colors">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Data + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data</label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-gray-200 pl-3 pr-8 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>

          {/* Horários (apenas para ES, RE, TV e EX) */}
          {showHorarios && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Hora Apresentação
                  </label>
                  <TimeInput
                    value={horaApres}
                    onChange={setHoraApres}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Hora Término
                  </label>
                  <TimeInput
                    value={horaTerm}
                    onChange={setHoraTerm}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Horas de Voo
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={horasVoo}
                    onChange={(e) => setHorasVoo(e.target.value)}
                    placeholder="ex: 3:00"
                    pattern="^\d{1,2}:[0-5]\d$"
                    title="Formato HH:MM (ex: 3:00, 1:30)"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>
              </div>
            </>
          )}

          {/* Observação */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Observações opcionais..."
            />
          </div>

          {/* Preview em Tempo Real */}
          {showHorarios && normalizeTimeInput(horaApres) && normalizeTimeInput(horaTerm) && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-1">
                {loadingPreview ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                ) : (
                  <Info className="h-3.5 w-3.5 text-gray-400" />
                )}
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  {loadingPreview ? 'Calculando projeção...' : 'Projeção de limites'}
                </span>
              </div>
              {!loadingPreview && preview && (
                <>
                  {preview.violacoes.map((v, i) => {
                    const labels: Record<string, string> = {
                      FDP_DIARIO: 'FDP Diário',
                      HV_DIARIA: 'HV Diária',
                      HV_7D: 'HV 7 Dias',
                      HV_MES: 'HV Mês',
                      HV_365D: 'HV 365 Dias',
                      REPOUSO: 'Repouso',
                    };
                    return (
                      <p key={i} className="text-xs text-red-700">
                        <span className="font-semibold">
                          ⛔ {labels[v.tipo_limite] ?? v.tipo_limite}
                        </span>{' '}
                        {v.percentual.toFixed(1)}% — violação projetada
                      </p>
                    );
                  })}
                  {preview.alertas.map((a, i) => {
                    const color =
                      a.nivel === 'CRITICO'
                        ? 'text-red-600'
                        : a.nivel === 'ATENCAO'
                          ? 'text-amber-700'
                          : 'text-yellow-700';
                    return (
                      <p key={i} className={`text-xs ${color}`}>
                        <span className="font-semibold">[{a.nivel}]</span> {a.mensagem}
                      </p>
                    );
                  })}
                  {preview.alertas.length === 0 && preview.violacoes.length === 0 && (
                    <p className="text-xs text-emerald-600">✓ Dentro dos limites operacionais</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Alertas do resultado pós-save */}
          {result?.alertas && result.alertas.length > 0 && (
            <div
              className={`rounded-lg border p-3 space-y-1 ${
                result.bloqueado ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`h-4 w-4 ${result.bloqueado ? 'text-red-500' : 'text-amber-500'}`}
                />
                <span className="text-xs font-semibold text-gray-700">
                  {result.bloqueado
                    ? 'Limites excedidos — jornada bloqueada'
                    : 'Atenção aos limites'}
                </span>
              </div>
              {result.alertas.map((a, i) => (
                <p key={i} className="text-xs text-gray-600">
                  <span className="font-semibold">[{a.nivel}]</span> {a.mensagem}
                </p>
              ))}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-2">
            {isEditing && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Excluir
              </button>
            )}
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || preview?.bloqueado === true}
              title={
                preview?.bloqueado ? 'Limite CRÍTICO atingido — lançamento bloqueado' : undefined
              }
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-primary to-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:from-primary/90 hover:to-emerald-600/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {preview?.bloqueado ? '🔒 Bloqueado' : isEditing ? 'Salvar Alterações' : 'Lançar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
