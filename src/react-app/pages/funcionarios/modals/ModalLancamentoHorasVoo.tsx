import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import Button from '@/react-app/components/Button';
import type { LancamentoHorasVooDTO } from '@/react-app/hooks/useHorasVoo';

const schema = z
  .object({
    data_voo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    modelo_aeronave: z.string().optional(),
    prefixo_aeronave: z.string().optional(),
    origem: z.string().optional(),
    destino: z.string().optional(),
    duracao_total: z.string().min(1),
    duracao_noturna: z.string().default('0:00'),
    duracao_instrumento: z.string().default('0:00'),
    duracao_instrucao: z.string().default('0:00'),
    funcao: z.enum(['PIC', 'SIC']),
    tipo_operacao: z
      .enum(['OFFSHORE', 'SAR', 'TAXI', 'INSTRUCAO', 'SIMULADOR'])
      .default('OFFSHORE'),
    pousos_dia: z.coerce.number().int().min(0).default(0),
    pousos_noite: z.coerce.number().int().min(0).default(0),
    hoist_cycles: z.coerce.number().int().min(0).default(0),
    observacoes: z.string().optional(),
  })
  .refine((v) => parseDuration(v.duracao_total) > 0, {
    path: ['duracao_total'],
    message: 'Informe duração total válida.',
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: LancamentoHorasVooDTO) => Promise<void> | void;
  submitting?: boolean;
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

export default function ModalLancamentoHorasVoo({ isOpen, onClose, onSubmit, submitting }: Props) {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      data_voo: new Date().toISOString().slice(0, 10),
      funcao: 'PIC',
      tipo_operacao: 'OFFSHORE',
      duracao_total: '0:00',
      duracao_noturna: '0:00',
      duracao_instrumento: '0:00',
      duracao_instrucao: '0:00',
      pousos_dia: 0,
      pousos_noite: 0,
      hoist_cycles: 0,
      observacoes: '',
    },
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Novo lançamento manual" size="lg">
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          const v = values as FormValues;
          const total = parseDuration(v.duracao_total);
          const noturna = parseDuration(v.duracao_noturna);
          const instrumento = parseDuration(v.duracao_instrumento);
          const instrucao = parseDuration(v.duracao_instrucao);
          await onSubmit({
            data_voo: v.data_voo,
            modelo_aeronave: v.modelo_aeronave || null,
            prefixo_aeronave: v.prefixo_aeronave || null,
            origem: v.origem || null,
            destino: v.destino || null,
            duracao_total_min: total,
            duracao_pic_min: v.funcao === 'PIC' ? total : 0,
            duracao_sic_min: v.funcao === 'SIC' ? total : 0,
            duracao_noturna_min: noturna,
            duracao_instrumento_min: instrumento,
            duracao_instrucao_min: instrucao,
            pousos_dia: v.pousos_dia,
            pousos_noite: v.pousos_noite,
            hoist_cycles: v.hoist_cycles,
            funcao: v.funcao,
            tipo_operacao: v.tipo_operacao,
            is_simulador: v.tipo_operacao === 'SIMULADOR' ? 1 : 0,
            observacoes: v.observacoes || null,
          });
          onClose();
          form.reset();
        })}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Data do voo">
            <input
              type="date"
              className="w-full border rounded px-3 py-2"
              {...form.register('data_voo')}
            />
          </Field>
          <Field label="Duração total (h:mm)">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('duracao_total')}
            />
          </Field>
          <Field label="Equipamento">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('modelo_aeronave')}
            />
          </Field>
          <Field label="Prefixo da aeronave">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('prefixo_aeronave')}
            />
          </Field>
          <Field label="Origem">
            <input className="w-full border rounded px-3 py-2" {...form.register('origem')} />
          </Field>
          <Field label="Destino">
            <input className="w-full border rounded px-3 py-2" {...form.register('destino')} />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Noturna (h:mm)">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('duracao_noturna')}
            />
          </Field>
          <Field label="Instrumento (h:mm)">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('duracao_instrumento')}
            />
          </Field>
          <Field label="Instrucao (h:mm)">
            <input
              className="w-full border rounded px-3 py-2"
              {...form.register('duracao_instrucao')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Função">
            <select className="w-full border rounded px-3 py-2" {...form.register('funcao')}>
              <option value="PIC">PIC</option>
              <option value="SIC">SIC</option>
            </select>
          </Field>
          <Field label="Tipo operação">
            <select className="w-full border rounded px-3 py-2" {...form.register('tipo_operacao')}>
              <option value="OFFSHORE">OFFSHORE</option>
              <option value="SAR">SAR</option>
              <option value="TAXI">TAXI</option>
              <option value="INSTRUCAO">INSTRUCAO</option>
              <option value="SIMULADOR">SIMULADOR</option>
            </select>
          </Field>
          <Field label="Pousos dia">
            <input
              type="number"
              className="w-full border rounded px-3 py-2"
              {...form.register('pousos_dia')}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Pousos noite">
            <input
              type="number"
              className="w-full border rounded px-3 py-2"
              {...form.register('pousos_noite')}
            />
          </Field>
          <Field label="Hoist cycles">
            <input
              type="number"
              className="w-full border rounded px-3 py-2"
              {...form.register('hoist_cycles')}
            />
          </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block mb-1 text-gray-700">{label}</span>
      {children}
    </label>
  );
}
