import { z } from 'zod';

export const FuncionarioSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  guerra: z.string().optional(),
  matricula: z.string().length(5, 'Matrícula deve ter 5 dígitos'),
  cpf: z
    .string()
    .regex(/^\d{11}$/, 'CPF inválido')
    .optional(),
  codigo_anac: z.string().optional(),
  canac: z.string().optional(),
  funcao: z.string().optional(),
  base: z.string().optional(),
  contrato: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email('Email inválido').optional(),
  nascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  licenca: z.string().optional(),
  sispat: z.string().optional(),
  prestserv: z.string().optional(),
  admissao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  aeronave: z.string().optional(),
  is_instrutor: z.boolean().default(false),
  is_checador: z.boolean().default(false),
  status: z.enum(['ATIVO', 'INATIVO', 'AFASTADO']).default('ATIVO'),
  cargo: z.string().optional(),
  setor: z.string().optional(),
});

export const QualificacaoSchema = z.object({
  funcionario_id: z.number().positive('ID do funcionário inválido'),
  tipo: z.enum(['TREINAMENTO', 'CHECK', 'EXAME']),
  codigo: z.string().min(1, 'Código obrigatório'),
  categoria: z.string().optional(),
  descricao: z.string().optional(),
  instituicao: z.string().optional(),
  instrutor: z.string().optional(),
  carga_horaria: z.number().positive().optional(),
  numero: z.string().optional(),
  data_emissao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  data_conclusao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  observacoes: z.string().optional(),
  status: z.enum(['ATIVO', 'VENCIDO', 'CANCELADO']).default('ATIVO'),
});

export const TreinamentoSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório'),
  nome: z.string().min(1, 'Nome obrigatório'),
  descricao: z.string().optional(),
  categoria: z.string().optional(),
  periodicidade_meses: z.number().positive().default(12),
  instrutor_obrigatorio: z.boolean().default(false),
  nota_minima_aprovacao: z.number().min(0).max(10).default(7.0),
  tipo_vencimento: z.enum(['DIA_EXATO', 'FINAL_MES', 'NAO_VENCE']).default('FINAL_MES'),
  ativo: z.boolean().default(true),
});

export const ExameSchema = z.object({
  funcionario_id: z.number().positive(),
  tipo_exame: z.enum(['CMA', 'ASO', 'TOXICOLOGICO', 'PSICOLOGICO']),
  data_exame: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_vencimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  resultado: z.string().optional(),
  medico: z.string().optional(),
  observacoes: z.string().optional(),
  status: z.enum(['ATIVO', 'VENCIDO', 'CANCELADO']).default('ATIVO'),
});

export const CheckSchema = z.object({
  funcionario_id: z.number().positive(),
  tipo_check: z.enum(['LINE_CHECK', 'PROFICIENCY_CHECK', 'SKILL_TEST']),
  data_check: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data_vencimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  aprovado: z.boolean().default(false),
  instrutor: z.string().optional(),
  observacoes: z.string().optional(),
  status: z.enum(['ATIVO', 'VENCIDO', 'CANCELADO']).default('ATIVO'),
});

export const ImportacaoBatchSchema = z.object({
  csv_data: z.string().min(1, 'CSV vazio'),
  tipo: z.enum(['FUNCIONARIOS', 'QUALIFICACOES', 'TREINAMENTOS']).optional(),
  usuario_id: z.string().optional(),
});

export const ImportacaoQualificacoesSchema = z.object({
  dados: z.array(
    z.object({
      cpf: z.string(),
      tipo: z.string(),
      codigo: z.string(),
      descricao: z.string().optional(),
      data_vencimento: z.union([z.string(), z.number()]),
      categoria: z.string().optional(),
      instituicao: z.string().optional(),
      instrutor: z.string().optional(),
      carga_horaria: z.number().optional(),
      numero: z.string().optional(),
      data_emissao: z.union([z.string(), z.number()]).optional(),
      data_conclusao: z.union([z.string(), z.number()]).optional(),
      observacoes: z.string().optional(),
    }),
  ),
  arquivo_nome: z.string().optional(),
});

export const Schemas = {
  Funcionario: FuncionarioSchema,
  Qualificacao: QualificacaoSchema,
  Treinamento: TreinamentoSchema,
  Exame: ExameSchema,
  Check: CheckSchema,
  ImportacaoBatch: ImportacaoBatchSchema,
  ImportacaoQualificacoes: ImportacaoQualificacoesSchema,
};

export type Funcionario = z.infer<typeof FuncionarioSchema>;
export type Qualificacao = z.infer<typeof QualificacaoSchema>;
export type Treinamento = z.infer<typeof TreinamentoSchema>;
export type Exame = z.infer<typeof ExameSchema>;
export type Check = z.infer<typeof CheckSchema>;
export type ImportacaoBatch = z.infer<typeof ImportacaoBatchSchema>;
export type ImportacaoQualificacoes = z.infer<typeof ImportacaoQualificacoesSchema>;
