import { useState } from 'react';
import { useFormValidation } from '@/react-app/hooks/useFormValidation';
import { agendamentoSchema, type AgendamentoFormData } from '@/react-app/lib/validations/schemas';
import { Input, Select, TextArea } from '@/react-app/components/UI/Input';
import { Button } from '@/react-app/components/UI/Button';
import { normalizeTimeInput, sanitizeTimeInputForTyping } from '@/react-app/lib/time-input';
import { toast } from 'sonner';

const TIPOS_AGENDAMENTO = [
  { value: 'prova', label: 'Prova' },
  { value: 'treinamento', label: 'Treinamento' },
  { value: 'familiarização', label: 'Familiarização' },
];

const INSTRUTORES = [
  { value: 'instrutor_1', label: 'Instrutor João Silva' },
  { value: 'instrutor_2', label: 'Instrutor Maria Santos' },
  { value: 'instrutor_3', label: 'Instrutor Pedro Costa' },
];

const SIMULADORES = [
  { value: 'sim_1', label: 'Simulador 1 - Boeing 737' },
  { value: 'sim_2', label: 'Simulador 2 - Airbus A320' },
  { value: 'sim_3', label: 'Simulador 3 - Cessna 172' },
];

interface AgendamentoFormProps {
  onSubmit?: (data: AgendamentoFormData) => Promise<void>;
  initialData?: Partial<AgendamentoFormData>;
  isLoading?: boolean;
}

export function AgendamentoForm({
  onSubmit,
  initialData,
  isLoading = false,
}: AgendamentoFormProps) {
  const [submitting, setSubmitting] = useState(false);

  const form = useFormValidation({
    schema: agendamentoSchema,
    defaultValues: (initialData || {
      simulador: '',
      piloto: '',
      instrutor: '',
      data: '',
      hora: '',
      duracao_minutos: 60,
      tipo: 'treinamento',
      observacoes: '',
    }) as AgendamentoFormData,
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    try {
      setSubmitting(true);

      if (onSubmit) {
        await onSubmit(data);
        toast.success('Agendamento criado com sucesso!');
      }

      form.reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar agendamento';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  });
  const horaField = form.getFieldProps('hora');

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Simulador"
          {...form.getFieldProps('simulador')}
          options={SIMULADORES}
          required
          disabled={isLoading || submitting}
        />

        <Input
          label="Piloto"
          {...form.getFieldProps('piloto')}
          placeholder="Nome do piloto"
          required
          disabled={isLoading || submitting}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="Instrutor"
          {...form.getFieldProps('instrutor')}
          options={INSTRUTORES}
          required
          disabled={isLoading || submitting}
        />

        <Select
          label="Tipo de Agendamento"
          {...form.getFieldProps('tipo')}
          options={TIPOS_AGENDAMENTO}
          required
          disabled={isLoading || submitting}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Input
          label="Data"
          type="date"
          {...form.getFieldProps('data')}
          required
          disabled={isLoading || submitting}
        />

        <Input
          label="Hora"
          type="text"
          {...horaField}
          inputMode="numeric"
          placeholder="HH:mm"
          maxLength={5}
          pattern="([01]\\d|2[0-3]):[0-5]\\d"
          title="Formato HH:mm (00:00 até 23:59)"
          onChange={(event) => {
            event.currentTarget.setCustomValidity('');
            event.target.value = sanitizeTimeInputForTyping(event.target.value);
            horaField.onChange(event);
          }}
          onBlur={(event) => {
            const raw = event.target.value.trim();
            if (!raw) {
              event.currentTarget.setCustomValidity('');
              horaField.onBlur(event);
              return;
            }
            const normalized = normalizeTimeInput(raw);
            if (!normalized) {
              event.currentTarget.setCustomValidity(
                'Informe um horário válido no formato HH:mm (00:00 até 23:59).',
              );
              event.currentTarget.reportValidity();
              return;
            }
            event.currentTarget.setCustomValidity('');
            form.setValue('hora', normalized, {
              shouldDirty: true,
              shouldValidate: true,
              shouldTouch: true,
            });
            horaField.onBlur(event);
          }}
          required
          disabled={isLoading || submitting}
        />

        <Input
          label="Duração (minutos)"
          type="number"
          {...form.getFieldProps('duracao_minutos')}
          inputMode="numeric"
          required
          disabled={isLoading || submitting}
        />
      </div>

      <TextArea
        label="Observações"
        {...form.getFieldProps('observacoes')}
        placeholder="Observações adicionais (opcional)"
        rows={4}
        disabled={isLoading || submitting}
      />

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={submitting || isLoading} loading={submitting}>
          Criar Agendamento
        </Button>

        <Button
          type="button"
          variant="secondary"
          onClick={() => form.reset()}
          disabled={submitting || isLoading}
        >
          Limpar
        </Button>
      </div>

      {form.formState.isSubmitting && <div className="text-sm text-slate-500">Salvando...</div>}
    </form>
  );
}
