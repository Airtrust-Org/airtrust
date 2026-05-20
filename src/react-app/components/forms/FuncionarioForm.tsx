import { useState } from 'react';
import { useFormValidation } from '@/react-app/hooks/useFormValidation';
import { funcionarioSchema, type FuncionarioFormData } from '@/react-app/lib/validations/schemas';
import { Input, TextArea } from '@/react-app/components/UI/Input';
import { Button } from '@/react-app/components/UI/Button';
import { toast } from 'sonner';

const CARGOS = [
  { value: 'piloto', label: 'Piloto' },
  { value: 'instrutor', label: 'Instrutor' },
  { value: 'mecanico', label: 'Mecânico' },
  { value: 'comissario', label: 'Comissário' },
  { value: 'administrativo', label: 'Administrativo' },
];

interface FuncionarioFormProps {
  onSubmit?: (data: FuncionarioFormData) => Promise<void>;
  initialData?: Partial<FuncionarioFormData>;
  isLoading?: boolean;
}

export function FuncionarioForm({
  onSubmit,
  initialData,
  isLoading = false,
}: FuncionarioFormProps) {
  const [submitting, setSubmitting] = useState(false);

  const form = useFormValidation({
    schema: funcionarioSchema,
    defaultValues: (initialData || {
      nome: '',
      matricula: '',
      email: '',
      cpf: '',
      cargo: '',
      admissao: '',
      telefone: '',
      observacoes: '',
    }) as FuncionarioFormData,
  });

  const handleSubmit = form.handleSubmit(async (data) => {
    try {
      setSubmitting(true);

      if (onSubmit) {
        await onSubmit(data);
        toast.success('Funcionário criado com sucesso!');
      }

      form.reset();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao criar funcionário';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Nome"
          {...form.getFieldProps('nome')}
          placeholder="Nome completo"
          required
          disabled={isLoading || submitting}
        />

        <Input
          label="Matrícula"
          {...form.getFieldProps('matricula')}
          placeholder="Número de matrícula"
          required
          disabled={isLoading || submitting}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="Email"
          type="email"
          {...form.getFieldProps('email')}
          placeholder="email@example.com"
          required
          disabled={isLoading || submitting}
        />

        <Input
          label="CPF"
          {...form.getFieldProps('cpf')}
          placeholder="XXX.XXX.XXX-XX"
          required
          disabled={isLoading || submitting}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Cargo <span className="text-red-500 ml-1">*</span>
          </label>
          <select
            {...form.register('cargo')}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            disabled={isLoading || submitting}
          >
            <option value="">Selecione um cargo</option>
            {CARGOS.map((cargo) => (
              <option key={cargo.value} value={cargo.value}>
                {cargo.label}
              </option>
            ))}
          </select>
          {form.getFieldError('cargo') && (
            <p className="mt-1 text-sm font-medium text-red-600">
              <span className="text-red-500">⚠</span> {form.getFieldError('cargo')}
            </p>
          )}
        </div>

        <Input
          label="Data de Admissão"
          type="date"
          {...form.getFieldProps('admissao')}
          required
          disabled={isLoading || submitting}
        />
      </div>

      <Input
        label="Telefone"
        {...form.getFieldProps('telefone')}
        placeholder="(XX) XXXXX-XXXX"
        required
        disabled={isLoading || submitting}
      />

      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <input
          type="checkbox"
          id="ativo"
          {...form.register('ativo')}
          className="w-5 h-5 text-blue-600 bg-white border-slate-300 rounded focus:ring-2 focus:ring-primary/30"
          disabled={isLoading || submitting}
          defaultChecked={initialData?.ativo !== false}
        />
        <label htmlFor="ativo" className="text-sm font-medium text-slate-700 cursor-pointer">
          Funcionário Ativo
          <span className="block text-xs font-normal text-slate-500 mt-0.5">
            Apenas funcionários ativos são considerados no dashboard e compliance
          </span>
        </label>
      </div>

      <TextArea
        label="Observações"
        {...form.getFieldProps('observacoes')}
        placeholder="Observações adicionais (opcional)"
        rows={4}
        disabled={isLoading || submitting}
      />

      <div className="flex gap-3 pt-4">
        <Button type="submit" disabled={submitting || isLoading} isLoading={submitting}>
          Criar Funcionário
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
