import { z } from 'zod';

// Funcionário Schema
export const funcionarioSchema = z.object({
  id: z.string().optional(),
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  matricula: z.string().min(3, 'Matrícula deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, 'CPF deve estar no formato XXX.XXX.XXX-XX'),
  cargo: z.string().min(2, 'Cargo é obrigatório'),
  admissao: z.string().date('Data de admissão inválida'),
  telefone: z
    .string()
    .regex(/^\(\d{2}\)\s9?\d{4}-\d{4}$/, 'Telefone deve estar no formato (XX) XXXXX-XXXX'),
  observacoes: z.string().max(500, 'Observações não podem ultrapassar 500 caracteres').optional(),
  ativo: z.boolean().default(true).optional(),
});

export type FuncionarioFormData = z.infer<typeof funcionarioSchema>;

// Agendamento/Simulador Schema
export const agendamentoSchema = z.object({
  id: z.string().optional(),
  simulador: z.string().min(1, 'Simulador é obrigatório'),
  piloto: z.string().min(1, 'Piloto é obrigatório'),
  instrutor: z.string().min(1, 'Instrutor é obrigatório'),
  data: z.string().date('Data inválida'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM'),
  duracao_minutos: z
    .number()
    .min(15, 'Duração mínima é 15 minutos')
    .max(480, 'Duração máxima é 480 minutos (8 horas)'),
  tipo: z.enum(['prova', 'treinamento', 'familiarização'], {
    errorMap: () => ({ message: 'Tipo de agendamento inválido' }),
  }),
  observacoes: z.string().max(500, 'Observações não podem ultrapassar 500 caracteres').optional(),
});

export type AgendamentoFormData = z.infer<typeof agendamentoSchema>;

// Qualificação Schema
export const qualificacaoSchema = z.object({
  id: z.string().optional(),
  codigo: z
    .string()
    .min(2, 'Código deve ter no mínimo 2 caracteres')
    .max(10, 'Código não pode ultrapassar 10 caracteres'),
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  categoria: z.string().min(1, 'Categoria é obrigatória'),
  validade_meses: z
    .number()
    .min(1, 'Validade mínima é 1 mês')
    .max(60, 'Validade máxima é 60 meses'),
  descricao: z.string().max(1000, 'Descrição não pode ultrapassar 1000 caracteres').optional(),
});

export type QualificacaoFormData = z.infer<typeof qualificacaoSchema>;

// Ficha de Voo Schema
export const fichaVooSchema = z.object({
  id: z.string().optional(),
  agendamento_id: z.string().min(1, 'Agendamento é obrigatório'),
  manobra: z.string().min(1, 'Manobra é obrigatória'),
  resultado: z.enum(['aprovado', 'reprovado', 'pendente'], {
    errorMap: () => ({ message: 'Resultado inválido' }),
  }),
  observacoes: z.string().max(500, 'Observações não podem ultrapassar 500 caracteres').optional(),
  temperatura: z
    .number()
    .min(-50, 'Temperatura inválida')
    .max(60, 'Temperatura inválida')
    .optional(),
  pressao: z.number().min(800, 'Pressão inválida').max(1200, 'Pressão inválida').optional(),
  visibilidade: z
    .number()
    .min(0, 'Visibilidade inválida')
    .max(10000, 'Visibilidade inválida')
    .optional(),
});

export type FichaVooFormData = z.infer<typeof fichaVooSchema>;

// Habilitação Schema
export const habilitacaoSchema = z.object({
  id: z.string().optional(),
  funcionario_id: z.string().min(1, 'Funcionário é obrigatório'),
  qualificacao_id: z.string().min(1, 'Qualificação é obrigatória'),
  data_aquisicao: z.string().date('Data de aquisição inválida'),
  data_validade: z.string().date('Data de validade inválida'),
  status: z.enum(['ativo', 'vencido', 'suspenso'], {
    errorMap: () => ({ message: 'Status inválido' }),
  }),
  observacoes: z.string().max(500, 'Observações não podem ultrapassar 500 caracteres').optional(),
});

export type HabilitacaoFormData = z.infer<typeof habilitacaoSchema>;

// Search/Filter Schemas
export const funcionarioFilterSchema = z.object({
  search: z.string().optional(),
  cargo: z.string().optional(),
  status: z.enum(['ativo', 'inativo']).optional(),
});

export type FuncionarioFilterData = z.infer<typeof funcionarioFilterSchema>;

export const agendamentoFilterSchema = z.object({
  search: z.string().optional(),
  tipo: z.string().optional(),
  data_inicio: z.string().date().optional(),
  data_fim: z.string().date().optional(),
});

export type AgendamentoFilterData = z.infer<typeof agendamentoFilterSchema>;

export const qualificacaoFilterSchema = z.object({
  search: z.string().optional(),
  categoria: z.string().optional(),
});

export type QualificacaoFilterData = z.infer<typeof qualificacaoFilterSchema>;
