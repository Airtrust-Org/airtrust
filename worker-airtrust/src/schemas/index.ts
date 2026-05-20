/**
 * SCHEMAS ZOD - VALIDAÇÃO DE ENTRADA
 *
 * Schemas para validar dados de entrada em endpoints POST/PUT
 * Garante tipagem e validação consistente
 */

import { z } from 'zod';

// ========================================
// FUNCIONÁRIOS
// ========================================

export const funcionarioCreateSchema = z.object({
  matricula: z.string().optional(),
  nome: z.string().min(1, 'Nome obrigatório'),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos'),
  email: z.string().email('Email inválido').optional(),
  funcao: z.string().optional(),
  cargo: z.string().optional(),
  setor: z.string().optional(),
  endereco: z.string().optional(),
  telefone: z.string().optional(),
  escala: z.string().optional(),
  status: z.enum(['ATIVO', 'INATIVO', 'AFASTADO', 'DEMITIDO']).default('ATIVO'),
  is_instrutor: z.boolean().default(false),
  is_checador: z.boolean().default(false),
  codigo_anac: z.string().optional(),
});

export const funcionarioUpdateSchema = funcionarioCreateSchema.partial();

// ========================================
// QUALIFICAÇÕES - TIPOS
// ========================================

export const qualificacaoTipoCreateSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  descricao: z.string().optional(),
  codigo: z.string().min(1, 'Código obrigatório'),
  categoria: z.string().min(1, 'Categoria obrigatória'),
  carga_horaria: z.number().positive().optional(),
  conteudo_programatico: z.string().optional(),
  validade_meses: z.number().int().positive().optional(),
  tipo_vencimento: z.enum(['MENSAL', 'ANUAL', 'CUSTOM']).optional(),
  ativo: z.boolean().default(true),
});

export const qualificacaoTipoUpdateSchema = qualificacaoTipoCreateSchema.partial();

// ========================================
// QUALIFICAÇÕES - HISTÓRICO
// ========================================

export const qualificacaoHistoricoCreateSchema = z.object({
  funcionario_id: z.number().int().positive('Funcionário ID deve ser número positivo'),
  qualificacao_id: z.number().int().positive('Qualificação ID deve ser número positivo'),
  data_conclusao: z.string().datetime('data_conclusao deve ser ISO8601 datetime'),
  data_vencimento: z.string().datetime('data_vencimento deve ser ISO8601 datetime'),
  numero_certificado: z.string().optional().nullable(),
  observacoes: z.string().optional().nullable(),
  arquivo_url: z.string().url().optional().nullable(),
  instrutor: z.string().optional().nullable(),
  local: z.string().optional().nullable(),
  carga_horaria: z.number().int().min(0).optional().nullable(),
  modalidade: z.string().optional().nullable(),
  nota: z.number().int().min(0).max(100).optional().nullable(),
});

export const qualificacaoHistoricoUpdateSchema = qualificacaoHistoricoCreateSchema.partial();

// ========================================
// SIMULADORES
// ========================================

export const simuladorCreateSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório'),
  codigo: z.string().optional(),
  modelo: z.string().optional(),
  tipo: z.string().optional(),
  modelo_aeronave: z.string().min(1, 'Modelo de aeronave obrigatório'),
  fabricante: z.string().optional(),
  numero_serie: z.string().optional(),
  ano_fabricacao: z.number().int().positive().optional(),
  localizacao: z.string().optional(),
  status: z.enum(['ATIVO', 'INATIVO', 'MANUTENCAO']).default('ATIVO'),
});

export const simuladorUpdateSchema = simuladorCreateSchema.partial();

// ========================================
// SESSÕES (AGENDAMENTOS)
// ========================================

export const sessaoCreateSchema = z.object({
  simulador_id: z.number().int().positive(),
  funcionario_id: z.string().optional(),
  instrutor_id: z.number().int().positive().optional(),
  checador_id: z.number().int().positive().optional(),
  template_id: z.number().int().positive().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  hora_inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM'),
  hora_fim: z.string().regex(/^\d{2}:\d{2}$/, 'Hora deve estar no formato HH:MM'),
  duracao_minutos: z.number().int().positive().optional(),
  status: z
    .enum(['AGENDADO', 'CONFIRMADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO'])
    .default('AGENDADO'),
  tipo_sessao: z.string().optional(),
  observacoes: z.string().optional(),
});

export const sessaoUpdateSchema = sessaoCreateSchema.partial();

// ========================================
// FICHAS DE SESSÃO
// ========================================

export const fichaCreateSchema = z.object({
  agendamento_slot_id: z.number().int().positive(),
  colaborador_id_aluno: z.string().min(1, 'Aluno obrigatório'),
  funcao_na_sessao: z.enum(['PF', 'PM', 'PIC', 'SIC', 'OBSERVADOR']).default('PF'),
  template_id: z.number().int().positive().optional(),
  instrutor_id: z.number().int().positive().optional(),
  instrutor_codigo_anac: z.string().optional(),
  carga_horaria_total: z.number().positive().default(2.0),
  tempo_acumulado: z.number().nonnegative().default(0),
  status: z
    .enum([
      'PENDENTE',
      'EM_ANDAMENTO',
      'CONCLUIDA',
      'ASSINADA_PARCIAL',
      'ASSINADA_TOTAL',
      'CANCELADA',
    ])
    .default('PENDENTE'),
  resultado_final: z.enum(['PENDENTE', 'APROVADO', 'REPROVADO']).default('PENDENTE'),
  nota_final: z.number().int().min(0).max(100).optional(),
  aprovado: z.boolean().optional(),
  observacoes: z.string().optional(),
});

export const fichaUpdateSchema = fichaCreateSchema.partial();

// ========================================
// MANOBRAS (CATÁLOGO)
// ========================================

export const manobraCreateSchema = z.object({
  tipo_sessao: z.string().min(1, 'Tipo de sessão obrigatório'),
  tipo_aeronave: z.string().min(1, 'Tipo de aeronave obrigatório'),
  codigo: z.string().min(1, 'Código obrigatório'),
  descricao: z.string().min(1, 'Descrição obrigatória'),
  categoria: z.string().optional(),
  ordem: z.number().int().positive().optional(),
  obrigatoria: z.boolean().default(false),
});

export const manobraUpdateSchema = manobraCreateSchema.partial();

// ========================================
// MODELOS DE SESSÃO (TEMPLATES)
// ========================================

export const modeloSessaoCreateSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório'),
  nome: z.string().min(1, 'Nome obrigatório'),
  descricao: z.string().optional(),
  tipo: z.string().optional(),
  modelo_aeronave: z.string().min(1, 'Modelo de aeronave obrigatório'),
  duracao_minutos: z.number().int().positive().default(120),
  ativo: z.boolean().default(true),
});

export const modeloSessaoUpdateSchema = modeloSessaoCreateSchema.partial();

// ========================================
// ASSINATURA DE FICHA
// ========================================

export const assinarFichaSchema = z.object({
  papel: z.enum(['ALUNO', 'INSTRUTOR', 'EXAMINADOR', 'CHECADOR']),
  info: z.string().optional(),
  funcionario_id: z.string().optional(),
  codigo_anac: z.string().optional(),
});

// ========================================
// ATUALIZAR MANOBRAS DA FICHA
// ========================================

export const atualizarManobrasSchema = z.object({
  manobras: z.array(
    z.object({
      id: z.number().int().positive().optional(),
      codigo: z.string().min(1),
      descricao: z.string(),
      categoria: z.string().optional(),
      resultado: z.enum(['SATISFATORIO', 'INSATISFATORIO', 'NAO_REALIZADO']).optional(),
      nota: z.number().int().min(0).max(100).optional(),
      observacoes: z.string().optional(),
      ordem: z.number().int().positive().optional(),
    }),
  ),
});

// ========================================
// EXPORTS DE TIPOS INFERIDOS
// ========================================

export type FuncionarioCreateInput = z.infer<typeof funcionarioCreateSchema>;
export type FuncionarioUpdateInput = z.infer<typeof funcionarioUpdateSchema>;

export type QualificacaoTipoCreateInput = z.infer<typeof qualificacaoTipoCreateSchema>;
export type QualificacaoTipoUpdateInput = z.infer<typeof qualificacaoTipoUpdateSchema>;

export type QualificacaoHistoricoCreateInput = z.infer<typeof qualificacaoHistoricoCreateSchema>;
export type QualificacaoHistoricoUpdateInput = z.infer<typeof qualificacaoHistoricoUpdateSchema>;

export type SimuladorCreateInput = z.infer<typeof simuladorCreateSchema>;
export type SimuladorUpdateInput = z.infer<typeof simuladorUpdateSchema>;

export type SessaoCreateInput = z.infer<typeof sessaoCreateSchema>;
export type SessaoUpdateInput = z.infer<typeof sessaoUpdateSchema>;

export type FichaCreateInput = z.infer<typeof fichaCreateSchema>;
export type FichaUpdateInput = z.infer<typeof fichaUpdateSchema>;

export type ManobraCreateInput = z.infer<typeof manobraCreateSchema>;
export type ManobraUpdateInput = z.infer<typeof manobraUpdateSchema>;

export type ModeloSessaoCreateInput = z.infer<typeof modeloSessaoCreateSchema>;
export type ModeloSessaoUpdateInput = z.infer<typeof modeloSessaoUpdateSchema>;

export type AssinarFichaInput = z.infer<typeof assinarFichaSchema>;
export type AtualizarManobrasInput = z.infer<typeof atualizarManobrasSchema>;
