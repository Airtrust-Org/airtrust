
import { z } from 'zod';

export const FuncionarioSchema = z.object({
  nome: z.string()
    .min(3, 'Nome deve ter pelo menos 3 caracteres')
    .max(100, 'Nome muito longo'),
  
  guerra: z.string()
    .max(50, 'Nome de guerra muito longo')
    .optional(),
  
  cpf: z.string()
    .regex(/^\d{11}$/, 'CPF deve conter 11 dígitos')
    .refine((cpf) => {
      if (cpf.split('').every(c => c === cpf[0])) return false;
      return true;
    }, 'CPF inválido'),
  
  matricula: z.string()
    .min(1, 'Matrícula é obrigatória')
    .max(20, 'Matrícula muito longa'),
  
  email: z.string()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  
  telefone: z.string()
    .regex(/^\d{10,11}$/, 'Telefone deve ter 10 ou 11 dígitos')
    .optional()
    .or(z.literal('')),
  
  funcao: z.string()
    .min(1, 'Função é obrigatória'),
  
  aeronave: z.string()
    .optional(),
  
  status: z.enum(['ativo', 'inativo', 'afastado'])
    .default('ativo')
});

export type FuncionarioInput = z.infer<typeof FuncionarioSchema>;

export const validateFuncionario = (data: unknown) => {
  try {
    const validated = FuncionarioSchema.parse(data);
    return { success: true, data: validated, errors: {} };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors: Record<string, string> = {};
      error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      return { success: false, data: null, errors };
    }
    return { 
      success: false, 
      data: null, 
      errors: { general: 'Erro de validação' } 
    };
  }
};
