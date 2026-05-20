import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import Button from '@/react-app/components/Button';
import type { SaldoInicialDTO } from '@/react-app/hooks/useHorasVoo';

const schema = z
  .object({
    horas_total: z.string().min(1),
    horas_pic: z.string().default('0'),
    horas_sic: z.string().default('0'),
    horas_noturna: z.string().default('0'),
    horas_instrumento: z.string().default('0'),
    horas_simulador: z.string().default('0'),
    horas_instrucao: z.string().default('0'),
    horas_aw139: z.string().default('0'),
    horas_sk76: z.string().default('0'),
    horas_outros_modelos: z.string().default('0'),
    data_referencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    observacoes: z.string().optional(),
  })
  .refine(
    (v) => {
      const pic = parseDuration(v.horas_pic);
      const sic = parseDuration(v.horas_sic);
      const total = parseDuration(v.horas_total);
      return pic + sic <= total;
    },
    {
      path: ['horas_pic'],
      message: 'PIC + SIC precisa ser menor ou igual ao total.',
    },
  );

type FormValues = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    horas_total_min?: number;
    horas_pic_min?: number;
    horas_sic_min?: number;
    horas_noturna_min?: number;
    horas_instrumento_min?: number;
    horas_simulador_min?: number;
    horas_instrucao_min?: number;
    horas_aw139_min?: number;
    horas_sk76_min?: number;
    horas_outros_modelos_min?: number;
    data_referencia?: string;
    observacoes?: string | null;
  } | null;
  onSubmit: (data: SaldoInicialDTO) => Promise<void> | void;
  submitting?: boolean;
}

function toDisplay(min: number | undefined): string {
  const value = Number(min || 0);
  const h = Math.floor(value / 60);
  const m = value % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function parseDuration(input: string): number {
  const raw = String(input || '')
    .trim()
    .toLowerCase();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const hhmm = raw.match(/^(\d{1,4}):(\d{1,2})$/);
  if (hhmm) return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  const hm = raw.match(/^(\d+)h\s*(\d+)?/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] || 0);
  return 0;
}

export default function ModalSaldoInicial({
  isOpen,
  onClose,
  initialData,
  onSubmit,
  submitting,
}: Props) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      horas_total: '0:00',
      horas_pic: '0:00',
      horas_sic: '0:00',
      horas_noturna: '0:00',
      horas_instrumento: '0:00',
      horas_simulador: '0:00',
      horas_instrucao: '0:00',
      horas_aw139: '0:00',
      horas_sk76: '0:00',
      horas_outros_modelos: '0:00',
      data_referencia: new Date().toISOString().slice(0, 10),
      observacoes: '',
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    form.reset({
      horas_total: toDisplay(initialData?.horas_total_min),
      horas_pic: toDisplay(initialData?.horas_pic_min),
      horas_sic: toDisplay(initialData?.horas_sic_min),
      horas_noturna: toDisplay(initialData?.horas_noturna_min),
      horas_instrumento: toDisplay(initialData?.horas_instrumento_min),
      horas_simulador: toDisplay(initialData?.horas_simulador_min),
      horas_instrucao: toDisplay(initialData?.horas_instrucao_min),
      horas_aw139: toDisplay(initialData?.horas_aw139_min),
      horas_sk76: toDisplay(initialData?.horas_sk76_min),
      horas_outros_modelos: toDisplay(initialData?.horas_outros_modelos_min),
      data_referencia: initialData?.data_referencia || new Date().toISOString().slice(0, 10),
      observacoes: initialData?.observacoes || '',
    });
  }, [form, initialData, isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Saldo inicial da caderneta" size="lg">
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          const v = values as FormValues;
          await onSubmit({
            horas_total_min: parseDuration(v.horas_total),
            horas_pic_min: parseDuration(v.horas_pic),
            horas_sic_min: parseDuration(v.horas_sic),
            horas_noturna_min: parseDuration(v.horas_noturna),
            horas_instrumento_min: parseDuration(v.horas_instrumento),
            horas_simulador_min: parseDuration(v.horas_simulador),
            horas_instrucao_min: parseDuration(v.horas_instrucao),
            horas_aw139_min: parseDuration(v.horas_aw139),
            horas_sk76_min: parseDuration(v.horas_sk76),
            horas_outros_modelos_min: parseDuration(v.horas_outros_modelos),
            data_referencia: v.data_referencia,
            observacoes: v.observacoes || null,
          });
          onClose();
        })}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Total (h:mm)" error={form.formState.errors.horas_total?.message}>
            <input className="w-full border rounded px-3 py-2" {...form.register('horas_total')} />
          </Field>
          <Field label="Data de referência" error={form.formState.errors.data_referencia?.message}>
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              {...form.register('data_referencia')}
            />
          </Field>
          <Field label="PIC (h:mm)">
            <input className="w-full border rounded px-3 py-2" {...form.register('horas_pic')} />
          </Field>
          <Field label="SIC (h:mm)">
            <input className="w-full border rounded px-3 py-2" {...form.register('horas_sic')} />
          </Field>
          <Field label="Noturna (h:mm)">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('horas_noturna')}
            />
          </Field>
          <Field label="Instrumento (h:mm)">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('horas_instrumento')}
            />
          </Field>
          <Field label="Simulador (h:mm)">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('horas_simulador')}
            />
          </Field>
          <Field label="Instrucao (h:mm)">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('horas_instrucao')}
            />
          </Field>
        </div>

        <div className="border rounded-md p-3">
          <p className="text-sm font-medium mb-2">Por equipamento</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="AW139 (h:mm)">
              <input
                className="w-full border rounded px-3 py-2"
                {...form.register('horas_aw139')}
              />
            </Field>
            <Field label="SK76 (h:mm)">
              <input className="w-full border rounded px-3 py-2" {...form.register('horas_sk76')} />
            </Field>
            <Field label="Outros (h:mm)">
              <input
                className="w-full border rounded px-3 py-2"
                {...form.register('horas_outros_modelos')}
              />
            </Field>
          </div>
        </div>

        <Field label="Observações">
          <textarea
            className="w-full border rounded px-3 py-2"
            rows={3}
            {...form.register('observacoes')}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 text-gray-700">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-600 mt-1 block">{error}</span> : null}
    </label>
  );
}
