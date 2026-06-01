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
    reference_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    data_checkin: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    hora_dormiu: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    hora_acordou: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    wake_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    horas_sono_24h: z.number().min(0).max(24).optional(),
    horas_sono_48h: z.number().min(0).max(48).optional(),
    qualidade_sono: z.number().int().min(1).max(5).optional(),
    kss_score: z.number().int().min(1).max(9).optional(),
    subjective_fatigue_level: z.number().int().min(0).max(10).optional(),
    sleepiness_level: z.number().int().min(0).max(10).optional(),
    sintomas: SintomasSchema,
    fit_for_duty: z.boolean().optional(),
    apto: z.number().int().min(0).max(1).optional(),
    motivo_inaptidao: z.string().max(1000).optional(),
    meds_ult_12h: z.union([z.boolean(), z.number().int().min(0).max(1), z.null()]).optional(),
    alcool_ult_12h: z.union([z.boolean(), z.number().int().min(0).max(1), z.null()]).optional(),
    risco_autoavaliado: z.number().int().min(1).max(10).optional(),
    sleepiness_text: z.string().max(500).optional(),
    symptoms_text: z.string().max(500).optional(),
    free_text_notes: z.string().max(2000).optional(),
    observacoes: z.string().max(2000).optional(),
    jornada_inicio_prevista: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    aceite_termos: z.literal(true).optional(),
    aceite_privacidade: z.literal(true).optional(),
  })
  .refine((data) => {
    const temHoras = typeof data.horas_sono_24h === 'number';
    const temHorarioCompleto = Boolean(data.hora_dormiu && data.hora_acordou);
    return temHoras || temHorarioCompleto;
  }, {
    message: 'Informe horas_sono_24h ou hora_dormiu + hora_acordou',
    path: ['horas_sono_24h'],
  })
  .refine((data) => {
    const hasFitForDuty = typeof data.fit_for_duty === 'boolean';
    const hasApto = typeof data.apto === 'number';
    return hasFitForDuty || hasApto;
  }, {
    message: 'Informe fit_for_duty ou apto',
    path: ['fit_for_duty'],
  })
  .refine((data) => {
    // fit_for_duty is canonical; apto is legacy fallback
    const fitForDutyNorm =
      typeof data.fit_for_duty === 'boolean'
        ? data.fit_for_duty
        : typeof data.apto === 'number'
          ? data.apto === 1
          : true;
    return !(fitForDutyNorm === false && !data.motivo_inaptidao);
  }, {
    message: 'motivo_inaptidao é obrigatório quando fit_for_duty/apto indicar inaptidão',
    path: ['motivo_inaptidao'],
  });

export const GestorRespostaSchema = z.object({
  resposta: z.string().min(2).max(1200),
});

export type CheckinCreateInput = z.infer<typeof CheckinCreateSchema>;
