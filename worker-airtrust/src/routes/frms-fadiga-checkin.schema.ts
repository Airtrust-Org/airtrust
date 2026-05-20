import { z } from 'zod';

export const SintomasSchema = z
  .object({
    fadiga_fisica: z.number().int().min(0).max(3).optional(),
    fadiga_mental: z.number().int().min(0).max(3).optional(),
    dificuldade_concentracao: z.number().int().min(0).max(3).optional(),
    sonolencia_diurna: z.number().int().min(0).max(3).optional(),
    irritabilidade: z.number().int().min(0).max(3).optional(),
    dor_fisica: z.number().int().min(0).max(3).optional(),
    descricao_dor: z.string().max(500).optional(),
    ambiente_inadequado: z.number().int().min(0).max(1).optional(),
    ruido_excessivo: z.number().int().min(0).max(1).optional(),
  })
  .optional();

export const CheckinCreateSchema = z
  .object({
    data_checkin: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    hora_dormiu: z.string().regex(/^\d{2}:\d{2}$/),
    hora_acordou: z.string().regex(/^\d{2}:\d{2}$/),
    qualidade_sono: z.number().int().min(1).max(5),
    kss_score: z.number().int().min(1).max(9),
    sintomas: SintomasSchema,
    apto: z.number().int().min(0).max(1),
    motivo_inaptidao: z.string().max(1000).optional(),
    meds_ult_12h: z.number().int().min(0).max(1).default(0),
    alcool_ult_12h: z.number().int().min(0).max(1).default(0),
    risco_autoavaliado: z.number().int().min(1).max(10).optional(),
    observacoes: z.string().max(2000).optional(),
    jornada_inicio_prevista: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    aceite_termos: z.literal(true),
    aceite_privacidade: z.literal(true),
  })
  .refine((data) => !(data.apto === 0 && !data.motivo_inaptidao), {
    message: 'motivo_inaptidao é obrigatório quando apto=0',
    path: ['motivo_inaptidao'],
  });

export const GestorRespostaSchema = z.object({
  resposta: z.string().min(2).max(1200),
});

export type CheckinCreateInput = z.infer<typeof CheckinCreateSchema>;
