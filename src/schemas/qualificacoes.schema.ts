/**
 * @file qualificacoes.schema.ts
 * @description Schemas de validação Zod para o módulo de Qualificações
 * @module Schemas/Qualificacoes
 */

import { z } from 'zod';

/**
 * Tipos de qualificação permitidos
 */
export const TipoQualificacaoEnum = z.enum(['TREINAMENTO', 'EXAME', 'CHECK']);
export type TipoQualificacao = z.infer<typeof TipoQualificacaoEnum>;

/**
 * Status possíveis de uma qualificação
 */
export const StatusQualificacaoEnum = z.enum([
  'VALIDA',
  'VENCENDO',
  'VENCIDA',
  'CANCELADA',
  'RENOVADA',
]);
export type StatusQualificacao = z.infer<typeof StatusQualificacaoEnum>;

/**
 * Tipos de vencimento
 */
export const TipoVencimentoEnum = z.enum(['DIA_EXATO', 'FIM_DO_MES']);
export type TipoVencimento = z.infer<typeof TipoVencimentoEnum>;

/**
 * Schema para criação de qualificação
 */
/**
 * Schema SIMPLIFICADO para criação de qualificação
 * Alinhado com o formulário atual e tabela do banco
 */
export const CriarQualificacaoSchema = z
  .object({
    funcionario_id: z
      .number({ required_error: 'ID do funcionário é obrigatório.' })
      .int()
      .positive(),
    qualificacao_id: z
      .number({ required_error: 'ID do tipo de qualificação é obrigatório.' })
      .int()
      .positive(),
    data_conclusao: z
      .string({ required_error: 'Data de conclusão é obrigatória.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (esperado: YYYY-MM-DD)'),
    data_vencimento: z
      .string({ required_error: 'Data de vencimento é obrigatória.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data inválido (esperado: YYYY-MM-DD)'),
    numero_certificado: z.string().max(100).optional().nullable(),
    observacoes: z.string().max(1000).optional().nullable(),
  })
  .refine(
    (data) => {
      const conclusao = new Date(data.data_conclusao);
      const vencimento = new Date(data.data_vencimento);
      return vencimento > conclusao;
    },
    {
      message: 'A data de vencimento deve ser posterior à data de conclusão.',
      path: ['data_vencimento'],
    },
  );

export type CriarQualificacaoInput = z.infer<typeof CriarQualificacaoSchema>;

/**
 * Schema para atualização de qualificação (todos os campos opcionais)
 */
export const AtualizarQualificacaoSchema = CriarQualificacaoSchema.innerType()
  .partial()
  .refine(
    (data) => {
      if (data.data_conclusao && data.data_vencimento) {
        const conclusao = new Date(data.data_conclusao);
        const vencimento = new Date(data.data_vencimento);
        return vencimento > conclusao;
      }
      return true;
    },
    {
      message: 'A data de vencimento deve ser posterior à data de conclusão.',
      path: ['data_vencimento'],
    },
  );

export type AtualizarQualificacaoInput = z.infer<typeof AtualizarQualificacaoSchema>;

/**
 * Schema completo de uma qualificação (response da API)
 * Reflete os campos realmente retornados pela API
 */
export const QualificacaoSchema = z.object({
  id: z.number().int().positive(),
  funcionario_id: z.number().int().positive(),
  funcionario_nome: z.string(),
  funcionario_matricula: z.string(),
  funcionario_codigo_anac: z.string().optional().nullable(),
  tipo: TipoQualificacaoEnum,
  codigo: z.string(),
  nome: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  data_realizado: z.string().optional().nullable(), // Alias para data_conclusao
  data_conclusao: z.string().optional().nullable(),
  data_vencimento: z.string().optional().nullable(),
  validade_meses: z.number().int().optional().nullable(),
  dias_para_vencimento: z.number().int().optional().nullable(),
  is_renovada: z.union([z.number(), z.boolean()]).optional(), // DB retorna 0/1
  status: z.string(), // Calculado dinamicamente
  observacoes: z.string().optional().nullable(),
  instrutor: z.string().optional().nullable(), // Ainda existe na tabela
  arquivo_url: z.string().optional().nullable(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  deleted_at: z.string().optional().nullable(),
});

export type Qualificacao = z.infer<typeof QualificacaoSchema>;

/**
 * Schema para lista de qualificações (response da API)
 */
export const ListaQualificacoesSchema = z.object({
  success: z.boolean(),
  data: z.array(QualificacaoSchema),
  stats: z.object({
    total: z.number().int(),
    validas: z.number().int(),
    vencendo: z.number().int(),
    vencidas: z.number().int(),
    renovadas: z.number().int().optional(),
  }),
  page: z.number().int().optional(),
  limit: z.number().int().optional(),
  total: z.number().int().optional(),
});

export type ListaQualificacoesResponse = z.infer<typeof ListaQualificacoesSchema>;

/**
 * Schema para tipo de qualificação
 */
export const TipoQualificacaoSchema = z.object({
  id: z.number().int().positive(),
  codigo: z.string().min(1).max(50),
  nome: z.string().min(1).max(200),
  tipo: TipoQualificacaoEnum,
  validade_meses: z.number().int().min(1).max(120),
  vencimento_tipo: TipoVencimentoEnum.default('DIA_EXATO'),
  categoria: z.string().max(100).optional(),
  descricao: z.string().max(500).optional(),
  status: z.enum(['ATIVO', 'INATIVO']).default('ATIVO'),
  created_at: z.string(),
  updated_at: z.string().optional(),
  deleted_at: z.string().nullable(),
});

export type TipoQualificacaoType = z.infer<typeof TipoQualificacaoSchema>;

/**
 * Schema para criação de tipo de qualificação
 */
export const CriarTipoQualificacaoSchema = z.object({
  codigo: z.string().min(1, 'Código é obrigatório').max(50),
  nome: z.string().min(1, 'Nome é obrigatório').max(200),
  tipo: TipoQualificacaoEnum,
  validade_meses: z.number().int().min(1, 'Validade deve ser no mínimo 1 mês').max(120),
  vencimento_tipo: TipoVencimentoEnum.default('DIA_EXATO'),
  categoria: z.string().max(100).optional(),
  descricao: z.string().max(500).optional(),
  status: z.enum(['ATIVO', 'INATIVO']).default('ATIVO'),
});

export type CriarTipoQualificacaoInput = z.infer<typeof CriarTipoQualificacaoSchema>;

/**
 * Schema para filtros de qualificações
 */
export const FiltrosQualificacoesSchema = z.object({
  busca: z.string().optional(),
  tipo: TipoQualificacaoEnum.optional(),
  status: StatusQualificacaoEnum.optional(),
  funcionario_id: z.number().int().positive().optional(),
  codigo: z.string().optional(),
  data_vencimento_inicio: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  data_vencimento_fim: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  incluir_renovadas: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  orderBy: z.string().default('data_vencimento'),
  orderDir: z.enum(['asc', 'desc']).default('asc'),
});

export type FiltrosQualificacoes = z.infer<typeof FiltrosQualificacoesSchema>;

/**
 * Schema para upload de certificado
 */
export const UploadCertificadoSchema = z.object({
  qualificacao_id: z.number().int().positive('ID da qualificação é obrigatório'),
  file: z.instanceof(File, { message: 'Arquivo é obrigatório' }),
});

export type UploadCertificadoInput = z.infer<typeof UploadCertificadoSchema>;

/**
 * Schema para response de sucesso genérico
 */
export const SuccessResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.any().optional(),
});

/**
 * Schema para response de erro genérico
 */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string().optional(),
  details: z.any().optional(),
});

/**
 * Helper para validar dados de entrada
 */
export function validarQualificacao(data: unknown) {
  return CriarQualificacaoSchema.safeParse(data);
}

/**
 * Helper para validar atualização
 */
export function validarAtualizacaoQualificacao(data: unknown) {
  return AtualizarQualificacaoSchema.safeParse(data);
}

/**
 * Helper para validar tipo de qualificação
 */
export function validarTipoQualificacao(data: unknown) {
  return CriarTipoQualificacaoSchema.safeParse(data);
}

/**
 * Helper para validar filtros
 */
export function validarFiltros(data: unknown) {
  return FiltrosQualificacoesSchema.safeParse(data);
}

/**
 * Helper para validar response da API
 */
export function validarListaQualificacoes(data: unknown) {
  return ListaQualificacoesSchema.safeParse(data);
}
