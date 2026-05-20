import { z } from 'zod';

/**
 * SECURITY & VALIDATION FIXES:
 * - Added ISO 8601 date format validation
 * - Cross-field validation: data_vencimento must be after data_emissao
 * - Date range validation: vencimento within reasonable future range (10 years max)
 * - Stronger input validation for all fields
 * - Explicit timezone handling (UTC)
 */

// ===== HELPER: ISO 8601 DATE VALIDATION =====
function isValidISO8601(dateString: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(dateString)) {
    return false;
  }
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

export const QualificacaoSchema = z.object({
  funcionario_id: z.number()
    .int('Funcionário deve ser um número inteiro')
    .positive('Funcionário é obrigatório'),
  
  categoria: z.enum([
    'Habilitacao',
    'Medico',
    'Treinamento',
    'Licenca',
    'Certificado'
  ], {
    errorMap: () => ({ message: 'Categoria deve ser uma das opções válidas' })
  }),
  
  numero: z.string()
    .regex(/^[A-Za-z0-9\-\/.]{1,50}$/, 'Número deve conter apenas letras, números, hífen, barra e ponto')
    .max(50, 'Número muito longo')
    .optional(),
  
  data_emissao: z.string()
    .optional()
    .refine((date) => {
      if (!date) return true;
      return isValidISO8601(date);
    }, 'Data de emissão deve estar em formato ISO 8601 (YYYY-MM-DD)'),
  
  data_vencimento: z.string()
    .refine((date) => isValidISO8601(date), 'Data de validade deve estar em formato ISO 8601 (YYYY-MM-DD)')
    .refine((date) => {
      const validade = new Date(date + 'T00:00:00Z');
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      return validade > hoje;
    }, 'Data de validade deve ser posterior a hoje')
    .refine((date) => {
      // Não aceitar datas mais de 10 anos no futuro (possível erro de input)
      const validade = new Date(date + 'T00:00:00Z');
      const maxFuturo = new Date();
      maxFuturo.setFullYear(maxFuturo.getFullYear() + 10);
      return validade < maxFuturo;
    }, 'Data de validade não pode ser mais de 10 anos no futuro'),
  
  observacoes: z.string()
    .max(500, 'Observações muito longas (máximo 500 caracteres)')
    .optional()
}).refine(
  (data) => {
    // Cross-field validation: se ambas as datas existem, vencimento > emissão
    if (data.data_emissao && data.data_vencimento) {
      const emissao = new Date(data.data_emissao + 'T00:00:00Z');
      const vencimento = new Date(data.data_vencimento + 'T00:00:00Z');
      return vencimento > emissao;
    }
    return true;
  },
  {
    message: 'Data de validade deve ser após data de emissão',
    path: ['data_vencimento'] // Indicate which field has the error
  }
);

export type QualificacaoInput = z.infer<typeof QualificacaoSchema>;

export const validateQualificacao = (data: unknown) => {
  try {
    const validated = QualificacaoSchema.parse(data);
    return { success: true, data: validated, errors: {} };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err) => {
        const path = err.path[0]?.toString() || 'general';
        errors[path] = err.message;
      });
      return { success: false, data: null, errors };
    }
    return { 
      success: false, 
      data: null, 
      errors: { general: 'Erro de validação desconhecido' } 
    };
  }
};
