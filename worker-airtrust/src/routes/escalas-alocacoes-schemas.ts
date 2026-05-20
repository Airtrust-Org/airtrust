/**
 * Schemas Zod e tipos compartilhados para alocações operacionais.
 * Extraído de escalas-alocacoes.ts para reduzir tamanho do arquivo principal.
 */
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────────────────────

export type AlocacaoDetalhadaRow = {
  id: string;
  escala_id: string;
  funcionario_id: string;
  aeronave_id: number | null;
  funcao: FuncaoAlocacao | null;
  situacao_tipo: SituacaoTipoCodigo | null;
  situacao_cor: string | null;
  situacao_nome: string | null;
  situacao_icone: string | null;
  situacao_bloqueia_alocacao: number | null;
  quinzena_id: number | null;
  data_inicio: string;
  data_fim: string;
  padrao_escala_id: string | null;
  base: string | null;
  observacoes: string | null;
  status: 'planejado' | 'confirmado' | 'cancelado';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  funcionario_nome: string | null;
  funcionario_guerra: string | null;
  funcionario_matricula: string | null;
  funcionario_role: string | null;
  funcionario_quinzena: string | null;
  funcionario_is_instrutor: number | null;
  aeronave_prefixo: string | null;
  aeronave_modelo: string | null;
  modelo_aeronave: string | null;
  funcionario_modelo_aeronave: string | null;
};

export const FUNCOES_ALOCACAO = ['PIC', 'SIC', 'PIC_CHK', 'SIC_CHK', 'INSTRUTOR', 'FLEX'] as const;
export type FuncaoAlocacao = (typeof FUNCOES_ALOCACAO)[number];

export const SITUACOES_TIPO = ['FERIAS', 'SIM', 'CURSO', 'MED', 'AFT', 'STB', 'FOLGA'] as const;
export type SituacaoTipoCodigo = (typeof SITUACOES_TIPO)[number];

export type SituacaoTipoRow = {
  id: number;
  codigo: SituacaoTipoCodigo;
  nome: string;
  cor: string;
  icone: string | null;
  bloqueia_alocacao: number;
  ativo: number;
  ordem: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// SCHEMAS ZOD
// ─────────────────────────────────────────────────────────────────────────────

export const IsoDateSchema = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const m = v.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return v.trim();
  },
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
);

export const AlocacaoCreateSchema = z
  .object({
    funcionario_id: z.coerce.string().min(1),
    aeronave_id: z.coerce.number().int().positive().optional().nullable(),
    modelo_aeronave: z.string().max(100).optional().nullable(),
    funcao: z.enum(FUNCOES_ALOCACAO),
    quinzena_id: z.coerce.number().int().positive().optional().nullable(),
    data_inicio: IsoDateSchema,
    data_fim: IsoDateSchema,
    padrao_escala_id: z.string().optional().nullable(),
    base: z.string().max(100).optional().nullable(),
    observacoes: z.string().max(500).optional().nullable(),
    cma_override: z.coerce.number().int().min(0).max(1).optional().default(0),
    conflito_override: z.coerce.number().int().min(0).max(1).optional().default(0),
  })
  .refine((d) => d.data_fim >= d.data_inicio, {
    message: 'data_fim deve ser >= data_inicio',
    path: ['data_fim'],
  });

export const AlocacaoUpdateSchema = z
  .object({
    funcionario_id: z.coerce.string().min(1).optional(),
    funcao: z.enum(FUNCOES_ALOCACAO).optional(),
    data_inicio: IsoDateSchema.optional(),
    data_fim: IsoDateSchema.optional(),
    status: z.enum(['planejado', 'confirmado', 'cancelado']).optional(),
    base: z.string().max(100).optional().nullable(),
    observacoes: z.string().max(500).optional().nullable(),
    quinzena_id: z.coerce.number().int().positive().optional().nullable(),
    padrao_escala_id: z.string().optional().nullable(),
    conflito_override: z.coerce.number().int().min(0).max(1).optional(),
  })
  .refine(
    (d) => {
      if (d.data_inicio && d.data_fim) return d.data_fim >= d.data_inicio;
      return true;
    },
    { message: 'data_fim deve ser >= data_inicio', path: ['data_fim'] },
  );

export const AlocacaoLoteItemSchema = z
  .object({
    slot_key: z.string().max(100).optional().nullable(),
    alocacao_id: z.string().uuid().optional().nullable(),
    funcionario_id: z.coerce.string().min(1),
    aeronave_id: z.coerce.number().int().positive().optional().nullable(),
    modelo_aeronave: z.string().max(100).optional().nullable(),
    funcao: z.enum(FUNCOES_ALOCACAO),
    quinzena_id: z.coerce.number().int().positive().optional().nullable(),
    data_inicio: IsoDateSchema,
    data_fim: IsoDateSchema,
    padrao_escala_id: z.string().optional().nullable(),
    base: z.string().max(100).optional().nullable(),
    observacoes: z.string().max(500).optional().nullable(),
    cma_override: z.coerce.number().int().min(0).max(1).optional().default(0),
    conflito_override: z.coerce.number().int().min(0).max(1).optional().default(0),
  })
  .refine((d) => d.data_fim >= d.data_inicio, {
    message: 'data_fim deve ser >= data_inicio',
    path: ['data_fim'],
  });

export const AlocacoesLoteSaveSchema = z.object({
  itens: z.array(AlocacaoLoteItemSchema).min(1).max(8),
});

export type AlocacaoLoteItemInput = z.infer<typeof AlocacaoLoteItemSchema>;
export type AlocacoesLoteSaveInput = z.infer<typeof AlocacoesLoteSaveSchema>;

export const SituacaoCreateSchema = z
  .object({
    funcionario_id: z.coerce.string().min(1),
    situacao_tipo: z.enum(SITUACOES_TIPO),
    quinzena_id: z.coerce.number().int().positive().optional().nullable(),
    data_inicio: IsoDateSchema,
    data_fim: IsoDateSchema,
    observacoes: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.data_fim >= d.data_inicio, {
    message: 'data_fim deve ser >= data_inicio',
    path: ['data_fim'],
  });

export const SituacaoUpdateSchema = z
  .object({
    funcionario_id: z.coerce.string().min(1).optional(),
    situacao_tipo: z.enum(SITUACOES_TIPO).optional(),
    quinzena_id: z.coerce.number().int().positive().optional().nullable(),
    data_inicio: IsoDateSchema.optional(),
    data_fim: IsoDateSchema.optional(),
    observacoes: z.string().max(500).optional().nullable(),
    status: z.enum(['planejado', 'confirmado', 'cancelado']).optional(),
  })
  .refine(
    (d) => {
      if (d.data_inicio && d.data_fim) return d.data_fim >= d.data_inicio;
      return true;
    },
    { message: 'data_fim deve ser >= data_inicio', path: ['data_fim'] },
  );
