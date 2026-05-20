import { z } from 'zod';

export const RelprevSubmissionSchema = z.object({
  client_submission_id: z.string().min(3),
  tipo: z.enum(['OCORRENCIA', 'PERIGO', 'INCIDENTE', 'ACIDENTE']).default('PERIGO'),
  anonimo: z.boolean().default(false),
  relator_id: z.number().int().optional(),
  data_ocorrencia: z.string(),
  local_icao: z.string().optional(),
  local_descricao: z.string().optional(),
  fase_voo: z
    .enum([
      'PREFLIGHT',
      'TAXI',
      'DECOLAGEM',
      'SUBIDA',
      'CRUZEIRO',
      'DESCIDA',
      'APROXIMACAO',
      'POUSO',
      'POS_VOO',
      'SOLO',
      'MANUTENCAO',
      'NAO_APLICAVEL',
    ])
    .optional(),
  condicao_meteorologica: z
    .enum(['VMC', 'IMC', 'NOITE_VMC', 'NOITE_IMC', 'DEGRADADA', 'NAO_APLICAVEL'])
    .optional(),
  categoria_adrep: z.string().optional(),
  aeronave_id: z.number().int().optional(),
  aeronave_matricula: z.string().optional(),
  aeronave_modelo: z.string().optional(),
  o_que: z.string().min(3),
  onde: z.string().min(2),
  quando: z.string().min(2),
  descricao: z.string().optional(),
  consequencia: z.string().optional(),
  accao_imediata: z.string().optional(),
  canal_origem: z.enum(['WEB', 'MOBILE', 'TABLET', 'API', 'IMPORTACAO']).default('WEB'),
  offline_capturado_em: z.string().optional(),
  timezone_offset_minutos: z.number().int().optional(),
  dispositivo_id: z.string().optional(),
  dispositivo_tipo: z.string().optional(),
  app_versao: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  precisao_metros: z.number().optional(),
  metadata_json: z.record(z.string(), z.unknown()).optional(),
  arquivo_url: z.string().optional(),
  arquivo_nome: z.string().optional(),
  privacidade: z
    .object({
      modo_sigilo: z.enum(['IDENTIFICADO', 'CONFIDENCIAL', 'ANONIMIZADO']).default('CONFIDENCIAL'),
      consentimento_contato: z.boolean().default(false),
      relator_ciphertext: z.string().optional(),
      relator_nonce: z.string().optional(),
      relator_hash_busca: z.string().optional(),
      contato_ciphertext: z.string().optional(),
      contato_nonce: z.string().optional(),
      chave_versao: z.string().optional(),
      politica_acesso_json: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export const BowtieScenarioSchema = z.object({
  perigo_id: z.string().optional(),
  perigo_codigo: z.string().optional(),
  perigo_titulo: z.string().min(3),
  perigo_descricao: z.string().optional(),
  categoria_principal: z.string().optional(),
  evento_central: z.string().min(3),
  descricao: z.string().optional(),
  perfil_matriz_id: z.number().int().optional(),
  ameacas: z
    .array(
      z.object({
        codigo: z.string().optional(),
        titulo: z.string().min(2),
        descricao: z.string().optional(),
      }),
    )
    .min(1),
  consequencias: z
    .array(
      z.object({
        codigo: z.string().optional(),
        titulo: z.string().min(2),
        descricao: z.string().optional(),
      }),
    )
    .min(1),
  barreiras: z
    .array(
      z.object({
        codigo: z.string().optional(),
        nome: z.string().min(2),
        descricao: z.string().optional(),
        tipo_barreira: z.enum(['PREVENTIVA', 'RECUPERACAO']),
        origem_tipo: z
          .enum(['PROCEDIMENTO', 'TREINAMENTO', 'AUDITORIA', 'FRAT', 'SISTEMA', 'OUTRO'])
          .optional(),
        status_saude: z
          .enum(['OPERANTE', 'DEGRADADA', 'INOPERANTE', 'EM_REVISAO'])
          .default('OPERANTE'),
        efetividade_percentual: z.number().min(0).max(100).optional(),
        links: z.array(z.string()).default([]),
      }),
    )
    .default([]),
});

export const BowtieBarrierStatusSchema = z.object({
  status_saude: z.enum(['OPERANTE', 'DEGRADADA', 'INOPERANTE', 'EM_REVISAO']),
  motivo_tipo: z.enum(['AUDITORIA', 'NC', 'ACAO_MITIGACAO', 'SISTEMA', 'MANUAL']).optional(),
  motivo_ref_id: z.string().optional(),
  observacao: z.string().optional(),
});

export const FratEvaluationSchema = z.object({
  modelo_id: z.number().int(),
  escala_id: z.string().optional(),
  alocacao_id: z.number().int().optional(),
  tripulante_id: z.number().int().optional(),
  aeronave_id: z.number().int().optional(),
  data_operacao: z.string(),
  origem_vinculo: z.enum(['MANUAL', 'FADIGA_CHECKIN']).optional(),
  frms_fadiga_checkin_id: z.string().optional(),
  justificativa: z.string().optional(),
  respostas: z
    .array(
      z.object({
        fator_id: z.number().int(),
        resposta: z.union([z.string(), z.number(), z.boolean()]),
        observacao: z.string().optional(),
      }),
    )
    .min(1),
});

export const FratApprovalSchema = z.object({
  decisao: z.enum(['APROVAR', 'REJEITAR', 'SOLICITAR_REVISAO']),
  motivo: z.string().optional(),
});

export const WorkflowTransitionSchema = z.object({
  status: z.enum(['EM_TRIAGEM', 'EM_INVESTIGACAO', 'CONCLUIDO']),
  investigador_id: z.number().int().optional(),
  observacao: z.string().max(1000).optional(),
});

// Transições válidas de/para cada status
export const WORKFLOW_VALID_TRANSITIONS: Record<string, string[]> = {
  ABERTO: ['EM_TRIAGEM'],
  EM_TRIAGEM: ['EM_INVESTIGACAO', 'ABERTO'],
  EM_INVESTIGACAO: ['CONCLUIDO', 'EM_TRIAGEM'],
  EM_ANALISE: ['EM_TRIAGEM', 'EM_INVESTIGACAO', 'CONCLUIDO'],
  AGUARDANDO_ACAO: ['EM_INVESTIGACAO', 'CONCLUIDO'],
};

type SimilarCase = {
  id: string;
  numero_protocolo: string;
  categoria_adrep: string | null;
  local_icao: string | null;
  data_ocorrencia: string;
  score: number;
};

export type AiCoValidationResult = {
  provider: string;
  model: string;
  clarityStatus: 'APROVADO' | 'REVISAO_MANUAL';
  clarityScore: number;
  normalizedSummary: string;
  rewriteSuggestion: string | null;
  adrepCode: string;
  adrepConfidence: number;
  eccairs2Code: string;
  eccairs2Confidence: number;
  taxonomy: Record<string, unknown>;
  fingerprint: string;
  trendCluster: string;
  trendSignal: 'SEM_SINAL' | 'EM_OBSERVACAO' | 'TENDENCIA' | 'SURTO';
  similarCases: SimilarCase[];
};

type FratFactorRow = {
  id: number;
  codigo: string;
  tipo_resposta: string;
  peso_base: number;
  regra_score_json: string | null;
};

type FratAnswerInput = z.infer<typeof FratEvaluationSchema>['respostas'][number];

const STOP_WORDS = new Set([
  'a',
  'o',
  'e',
  'de',
  'do',
  'da',
  'em',
  'no',
  'na',
  'para',
  'por',
  'com',
  'uma',
  'um',
  'das',
  'dos',
  'que',
]);

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token && token.length > 2 && !STOP_WORDS.has(token));
}

export function buildSemanticFingerprint(value: string): string {
  const unique = Array.from(new Set(tokenize(value))).sort();
  return unique.slice(0, 12).join('|');
}

function overlapScore(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (!left.size || !right.size) return 0;
  const intersection = Array.from(left).filter((token) => right.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}

const TAXONOMY_RULES = [
  // ── Fatores Humanos ─────────────────────────────────────────────────────────
  {
    keywords: ['fadiga', 'sono', 'cansaco', 'fatigue', 'exausto', 'exaustao'],
    adrep: 'FATIGUE_REPORT',
    eccairs2: 'HF.FATIGUE',
  },
  {
    keywords: [
      'crm',
      'erro humano',
      'briefing',
      'coordenacao',
      'tripulacao',
      'comunicacao interna',
    ],
    adrep: 'HUMAN_ERROR',
    eccairs2: 'HF.CRM',
  },
  {
    keywords: ['distracao', 'distração', 'atencao', 'foco', 'inattention'],
    adrep: 'DISTRACTION',
    eccairs2: 'HF.ATTENTION',
  },
  {
    keywords: ['workload', 'sobrecarga', 'carga de trabalho', 'overload'],
    adrep: 'HIGH_WORKLOAD',
    eccairs2: 'HF.WORKLOAD',
  },
  {
    keywords: ['incapacitacao', 'incapacidade', 'mal-estar', 'doença', 'medico', 'medical'],
    adrep: 'MEDICAL_INCAPACITATION',
    eccairs2: 'HF.MED',
  },
  // ── Colisões e Proximidades ─────────────────────────────────────────────────
  {
    keywords: ['bird', 'passaro', 'ave', 'colisao ave', 'birdstrike', 'bird strike'],
    adrep: 'BIRD_STRIKE',
    eccairs2: 'SCF.BIRD',
  },
  {
    keywords: ['drone', 'rpas', 'vant', 'aeronave nao tripulada', 'suas'],
    adrep: 'DRONE_ENCOUNTER',
    eccairs2: 'AIR.DRONE',
  },
  {
    keywords: ['incursao pista', 'runway incursion', 'pista ocupada', 'invasao pista'],
    adrep: 'RUNWAY_INCURSION',
    eccairs2: 'RUN.INCURSIO',
  },
  {
    keywords: ['tcas', 'ra', 'traffic alert', 'colisao aerea', 'near miss aereo'],
    adrep: 'TCAS_RA',
    eccairs2: 'AIR.TCAS',
  },
  {
    keywords: ['cfit', 'terreno', 'gpws', 'taws', 'ground proximity', 'aproximacao solo'],
    adrep: 'CFIT_RISK',
    eccairs2: 'ARC.CFIT',
  },
  {
    keywords: ['wake turbulence', 'turbulencia de esteira', 'esteira de vortice', 'vortex'],
    adrep: 'WAKE_TURBULENCE',
    eccairs2: 'WX.WAKE',
  },
  // ── Propulsão e Sistemas ────────────────────────────────────────────────────
  {
    keywords: ['motor', 'engine', 'potencia', 'falha motor', 'shutdown motor', 'engine failure'],
    adrep: 'ENGINE_FAILURE',
    eccairs2: 'SCF.PP',
  },
  {
    keywords: ['hidraulico', 'hydraulic', 'flight controls', 'controles de voo', 'atuador'],
    adrep: 'HYDRAULIC_FAILURE',
    eccairs2: 'SCF.HYD',
  },
  {
    keywords: [
      'combustivel',
      'fuel',
      'abastecimento',
      'low fuel',
      'reserva combustivel',
      'desvio combustivel',
    ],
    adrep: 'FUEL_EMERGENCY',
    eccairs2: 'SCF.FUEL',
  },
  {
    keywords: ['pressurização', 'pressurizacao', 'cabin pressure', 'oxigenio', 'hypoxia'],
    adrep: 'PRESSURIZATION_FAILURE',
    eccairs2: 'SCF.PRESS',
  },
  {
    keywords: ['trem pouso', 'landing gear', 'gear failure', 'trem nao saiu', 'trem travado'],
    adrep: 'LANDING_GEAR_FAILURE',
    eccairs2: 'SCF.LG',
  },
  {
    keywords: ['incendio', 'fogo', 'fumaca', 'fumaça', 'fire', 'smoke', 'queimando', 'chamas'],
    adrep: 'FIRE_SMOKE',
    eccairs2: 'SCF.FIRE',
  },
  {
    keywords: ['estrutura', 'estrutural', 'deformação', 'rachado', 'corrosão', 'fratura', 'trinca'],
    adrep: 'STRUCTURAL_FAILURE',
    eccairs2: 'SCF.STR',
  },
  {
    keywords: [
      'gelo',
      'icing',
      'congelamento',
      'anti ice',
      'anti-ice',
      'gelo na aeronave',
      'acumulacao gelo',
    ],
    adrep: 'ICE_ANTI_ICING',
    eccairs2: 'SCF.ICE',
  },
  // ── Condições Meteorológicas ────────────────────────────────────────────────
  {
    keywords: ['clima', 'tempo', 'meteorologica', 'imc', 'meteorologia', 'desvio meteo', 'weather'],
    adrep: 'WEATHER_ENCOUNTER',
    eccairs2: 'WX.WEATHER',
  },
  {
    keywords: ['turbulencia', 'turbulence', 'chop', 'severe turbulence', 'turbulencia severa'],
    adrep: 'TURBULENCE',
    eccairs2: 'WX.TURB',
  },
  {
    keywords: ['windshear', 'cisalhamento', 'shear', 'downburst', 'microburst', 'rajada'],
    adrep: 'WINDSHEAR',
    eccairs2: 'WX.WIND',
  },
  {
    keywords: ['raio', 'lightning', 'trovoadas', 'tempestade', 'descarga eletrica', 'cb'],
    adrep: 'LIGHTNING_STRIKE',
    eccairs2: 'WX.LIGHTNING',
  },
  // ── Navegação e Comunicação ─────────────────────────────────────────────────
  {
    keywords: [
      'navegacao',
      'rota',
      'procedimento',
      'gps',
      'desvio rota',
      'nav',
      'navigation error',
    ],
    adrep: 'NAVIGATION_ERROR',
    eccairs2: 'NAV.NAVIGATION',
  },
  {
    keywords: ['comunicacao', 'radio', 'fonia', 'perda comunicacao', 'radio failure', 'rtf'],
    adrep: 'COMMUNICATION_ERROR',
    eccairs2: 'COM.COMM',
  },
  {
    keywords: [
      'espaço aereo',
      'airspace',
      'infringement',
      'violacao espaco',
      'ctba',
      'tca',
      'classe airspace',
    ],
    adrep: 'AIRSPACE_INFRINGEMENT',
    eccairs2: 'AIR.INFRING',
  },
  // ── Operações em Solo ───────────────────────────────────────────────────────
  {
    keywords: [
      'convés',
      'plataforma',
      'deck',
      'helideck',
      'helidecke',
      'offshore',
      'decolagem offshore',
    ],
    adrep: 'OFFSHORE_DECK',
    eccairs2: 'HEL.OFFSHORE',
  },
  {
    keywords: ['ground handling', 'pushback', 'reboque', 'pátio', 'operacao solo', 'ground ops'],
    adrep: 'GROUND_HANDLING',
    eccairs2: 'GND.HANDLING',
  },
  {
    keywords: ['fod', 'objeto estranho', 'foreign object', 'debris pista', 'objeto na pista'],
    adrep: 'FOD_DEBRIS',
    eccairs2: 'GND.FOD',
  },
  {
    keywords: ['incendio solo', 'fire ground', 'fogo aeronave solo'],
    adrep: 'FIRE_ON_GROUND',
    eccairs2: 'GND.FIRE',
  },
  // ── Pousos e Decolagens ─────────────────────────────────────────────────────
  {
    keywords: ['pouso duro', 'hard landing', 'toque violento', 'bounced landing'],
    adrep: 'HARD_LANDING',
    eccairs2: 'ARC.HARDLAND',
  },
  {
    keywords: ['perda controle', 'loss of control', 'loc-i', 'instabilidade', 'upset', 'stall'],
    adrep: 'LOSS_OF_CONTROL',
    eccairs2: 'ARC.LOC',
  },
  {
    keywords: [
      'pista molhada',
      'aquaplanagem',
      'hydroplane',
      'pista contaminada',
      'runway contamination',
    ],
    adrep: 'RUNWAY_CONTAMINATION',
    eccairs2: 'RUN.CONTAM',
  },
  {
    keywords: [
      'aproximacao desestabilizada',
      'unstable approach',
      'abortar',
      'go around',
      'arremetida',
    ],
    adrep: 'UNSTABILIZED_APPROACH',
    eccairs2: 'ARC.UNST',
  },
  // ── Manutenção ──────────────────────────────────────────────────────────────
  {
    keywords: ['manutencao', 'manutenção', 'maintenance error', 'falha manutencao', 'mxn'],
    adrep: 'MAINTENANCE_ERROR',
    eccairs2: 'MNT.MAINT',
  },
  {
    keywords: [
      'ferramenta',
      'tool left',
      'item nao instalado',
      'missing part',
      'peca nao instalada',
    ],
    adrep: 'MAINTENANCE_FOD',
    eccairs2: 'MNT.FOD',
  },
  // ── ATC ─────────────────────────────────────────────────────────────────────
  {
    keywords: ['atc', 'controle trafego aereo', 'clearance', 'conflito atc', 'autorizacao errada'],
    adrep: 'ATC_ERROR',
    eccairs2: 'AIR.ATC',
  },
  // ── Laser e Iluminação ──────────────────────────────────────────────────────
  {
    keywords: ['laser', 'iluminacao laser', 'apontador laser', 'green laser', 'laser strike'],
    adrep: 'LASER_ILLUMINATION',
    eccairs2: 'GND.LASER',
  },
  // ── Carga Perigosa ──────────────────────────────────────────────────────────
  {
    keywords: ['carga perigosa', 'dangerous goods', 'dg', 'mercadoria perigosa', 'hazmat'],
    adrep: 'DANGEROUS_GOODS',
    eccairs2: 'CAR.DG',
  },
  // ── Evacuação de Emergência ─────────────────────────────────────────────────
  {
    keywords: ['evacuacao', 'evacuation', 'ditching', 'amaragem', 'emergencia declarada', 'mayday'],
    adrep: 'EMERGENCY_EVACUATION',
    eccairs2: 'ARC.EVAC',
  },
];

export function buildTaxonomyClassificationPrompt(summary: string): string {
  return [
    'Classifique o relato aeronáutico abaixo usando ICAO ADREP e ECCAIRS 2.',
    'Retorne: clareza, codigo_adrep, confianca_adrep, codigo_eccairs2, confianca_eccairs2, justificativa_curta.',
    `Relato: ${summary}`,
  ].join('\n');
}

function classifyTaxonomy(summary: string): {
  adrepCode: string;
  adrepConfidence: number;
  eccairs2Code: string;
  eccairs2Confidence: number;
  matchedKeywords: string[];
} {
  const normalized = normalizeText(summary);
  for (const rule of TAXONOMY_RULES) {
    const matched = rule.keywords.filter((keyword) => normalized.includes(normalizeText(keyword)));
    if (matched.length > 0) {
      const confidence = Math.min(0.98, 0.55 + matched.length * 0.12);
      return {
        adrepCode: rule.adrep,
        adrepConfidence: confidence,
        eccairs2Code: rule.eccairs2,
        eccairs2Confidence: Math.max(0.51, confidence - 0.03),
        matchedKeywords: matched,
      };
    }
  }

  return {
    adrepCode: 'OTHER',
    adrepConfidence: 0.35,
    eccairs2Code: 'GEN.OTHER',
    eccairs2Confidence: 0.31,
    matchedKeywords: [],
  };
}

export async function runAiCoValidator(
  db: D1Database,
  empresaId: number,
  summary: string,
  currentRelatoId?: string,
  env?: { AI?: Ai },
): Promise<AiCoValidationResult> {
  const normalizedSummary = normalizeText(summary);
  let clarityScore = Math.min(0.99, Math.max(0.25, normalizedSummary.length / 180));
  const fingerprint = buildSemanticFingerprint(summary);

  // ── Workers AI triage (with heuristic fallback) ──────────────────────────
  let taxonomyResult = classifyTaxonomy(summary);
  let aiProvider = 'heuristic-fallback';
  let aiModel = 'rule-engine-v1';

  if (env?.AI) {
    try {
      const systemPrompt =
        'Você é especialista em segurança aeronáutica ICAO ADREP/ECCAIRS2. ' +
        'Analise o relato e retorne APENAS JSON válido: ' +
        '{"adrepCode":"CODIGO","adrepConfidence":0.0,"eccairs2Code":"COD.ECC","eccairs2Confidence":0.0,"clarityScore":0.0}. ' +
        'Códigos ADREP válidos: FATIGUE_REPORT, HUMAN_ERROR, DISTRACTION, HIGH_WORKLOAD, ' +
        'MEDICAL_INCAPACITATION, BIRD_STRIKE, DRONE_ENCOUNTER, RUNWAY_INCURSION, TCAS_RA, ' +
        'CFIT_RISK, WAKE_TURBULENCE, ENGINE_FAILURE, HYDRAULIC_FAILURE, FUEL_EMERGENCY, ' +
        'PRESSURIZATION_FAILURE, LANDING_GEAR_FAILURE, FIRE_SMOKE, STRUCTURAL_FAILURE, ' +
        'ICE_ANTI_ICING, WEATHER_ENCOUNTER, TURBULENCE, WINDSHEAR, LIGHTNING_STRIKE, ' +
        'NAVIGATION_ERROR, COMMUNICATION_ERROR, AIRSPACE_INFRINGEMENT, OFFSHORE_DECK, ' +
        'GROUND_HANDLING, FOD_DEBRIS, FIRE_ON_GROUND, HARD_LANDING, LOSS_OF_CONTROL, ' +
        'RUNWAY_CONTAMINATION, UNSTABILIZED_APPROACH, MAINTENANCE_ERROR, MAINTENANCE_FOD, ' +
        'LASER_ILLUMINATION, DANGEROUS_GOODS, ATC_ERROR, EMERGENCY_EVACUATION, OTHER.';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const aiResult = (await (env.AI as any).run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Relato: ${summary.slice(0, 800)}` },
        ],
        max_tokens: 256,
      })) as { response?: string };

      if (aiResult?.response) {
        const jsonMatch = aiResult.response.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            adrepCode?: string;
            adrepConfidence?: number;
            eccairs2Code?: string;
            eccairs2Confidence?: number;
            clarityScore?: number;
          };
          if (parsed.adrepCode) {
            taxonomyResult = {
              adrepCode: parsed.adrepCode,
              adrepConfidence: Math.min(0.99, Math.max(0.1, parsed.adrepConfidence ?? 0.6)),
              eccairs2Code: parsed.eccairs2Code ?? 'GEN.OTHER',
              eccairs2Confidence: Math.min(0.99, Math.max(0.1, parsed.eccairs2Confidence ?? 0.55)),
              matchedKeywords: [],
            };
            if (parsed.clarityScore !== undefined) {
              clarityScore = Math.min(0.99, Math.max(0.1, parsed.clarityScore));
            }
            aiProvider = 'cloudflare-workers-ai';
            aiModel = '@cf/meta/llama-3.1-8b-instruct';
          }
        }
      }
    } catch {
      // silently fall through to heuristic result already computed above
    }
  }

  const clarityStatus = clarityScore >= 0.48 ? 'APROVADO' : 'REVISAO_MANUAL';
  const rows = await db
    .prepare(
      `SELECT id, numero_protocolo, descricao, categoria_adrep, local_icao, data_ocorrencia
       FROM sgso_relatos
       WHERE empresa_id = ? AND deleted_at IS NULL ${currentRelatoId ? 'AND id <> ?' : ''}
       ORDER BY data_ocorrencia DESC
       LIMIT 50`,
    )
    .bind(...(currentRelatoId ? [empresaId, currentRelatoId] : [empresaId]))
    .all<{
      id: string;
      numero_protocolo: string;
      descricao: string;
      categoria_adrep: string | null;
      local_icao: string | null;
      data_ocorrencia: string;
    }>();

  const similarCases = rows.results
    .map((row) => ({
      id: row.id,
      numero_protocolo: row.numero_protocolo,
      categoria_adrep: row.categoria_adrep,
      local_icao: row.local_icao,
      data_ocorrencia: row.data_ocorrencia,
      score: overlapScore(summary, row.descricao),
    }))
    .filter((row) => row.score >= 0.18)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5);

  const trendSignal =
    similarCases.length >= 5
      ? 'SURTO'
      : similarCases.length >= 3
        ? 'TENDENCIA'
        : similarCases.length >= 1
          ? 'EM_OBSERVACAO'
          : 'SEM_SINAL';

  return {
    provider: aiProvider,
    model: aiModel,
    clarityStatus,
    clarityScore,
    normalizedSummary,
    rewriteSuggestion:
      clarityStatus === 'REVISAO_MANUAL'
        ? 'Detalhe o evento com ação, contexto operacional e consequência observada antes da submissão final.'
        : null,
    adrepCode: taxonomyResult.adrepCode,
    adrepConfidence: taxonomyResult.adrepConfidence,
    eccairs2Code: taxonomyResult.eccairs2Code,
    eccairs2Confidence: taxonomyResult.eccairs2Confidence,
    taxonomy: {
      matched_keywords: taxonomyResult.matchedKeywords,
      prompt_preview: buildTaxonomyClassificationPrompt(summary),
    },
    fingerprint,
    trendCluster: taxonomyResult.adrepCode,
    trendSignal,
    similarCases,
  };
}

// ─── FRAT Context Multipliers ────────────────────────────────────────────────
// Aplica bônus multiplicadores quando combinações de fatores de risco co-ocorrem.
// Apenas o maior multiplicador aplicável é usado (não empilhado).
const COMPOUND_RISK_RULES: Array<{
  codesA: string[];
  codesB: string[];
  minScoreA: number;
  minScoreB: number;
  multiplier: number;
  label: string;
}> = [
  {
    codesA: ['FADIGA'],
    codesB: ['CLIMA_ADVERSO'],
    minScoreA: 2.0,
    minScoreB: 2.0,
    multiplier: 1.3,
    label: 'FADIGA_x_CLIMA',
  },
  {
    codesA: ['SONO_RESTRITO'],
    codesB: ['JANELA_OPERACIONAL'],
    minScoreA: 2.0,
    minScoreB: 2.0,
    multiplier: 1.25,
    label: 'SONO_x_JANELA',
  },
  {
    codesA: ['CRM_TRIPULACAO'],
    codesB: ['FADIGA'],
    minScoreA: 2.0,
    minScoreB: 2.0,
    multiplier: 1.2,
    label: 'CRM_x_FADIGA',
  },
  {
    codesA: ['AERODROMO_COMPLEXO'],
    codesB: ['CLIMA_ADVERSO'],
    minScoreA: 1.5,
    minScoreB: 2.0,
    multiplier: 1.15,
    label: 'AERODROMO_x_CLIMA',
  },
];

function applyContextMultipliers(
  rawScore: number,
  responseScores: Array<{ fatorId: number; score: number }>,
  factors: FratFactorRow[],
): { adjustedScore: number; appliedRules: string[] } {
  const scoreByCode: Record<string, number> = {};
  for (const rs of responseScores) {
    const factor = factors.find((f) => f.id === rs.fatorId);
    if (factor) scoreByCode[factor.codigo] = (scoreByCode[factor.codigo] ?? 0) + rs.score;
  }

  const appliedRules: string[] = [];
  let maxMultiplier = 1.0;

  for (const rule of COMPOUND_RISK_RULES) {
    const scoreA = rule.codesA.reduce((sum, c) => sum + (scoreByCode[c] ?? 0), 0);
    const scoreB = rule.codesB.reduce((sum, c) => sum + (scoreByCode[c] ?? 0), 0);
    if (scoreA >= rule.minScoreA && scoreB >= rule.minScoreB) {
      appliedRules.push(rule.label);
      if (rule.multiplier > maxMultiplier) maxMultiplier = rule.multiplier;
    }
  }

  return { adjustedScore: rawScore * maxMultiplier, appliedRules };
}

function readRuleScore(ruleScoreJson: string | null): Record<string, number> {
  if (!ruleScoreJson) return {};
  try {
    const parsed = JSON.parse(ruleScoreJson) as Record<string, number>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function answerKey(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function scoreFratResponses(
  factors: FratFactorRow[],
  answers: FratAnswerInput[],
): {
  totalScore: number;
  rawScore: number;
  contextRules: string[];
  level: 'BAIXO' | 'MEDIO' | 'ALTO' | 'CRITICO';
  responseScores: Array<{
    fatorId: number;
    score: number;
    textValue: string | null;
    numberValue: number | null;
  }>;
} {
  const factorMap = new Map(factors.map((factor) => [factor.id, factor]));
  const responseScores = answers.map((answer) => {
    const factor = factorMap.get(answer.fator_id);
    if (!factor) {
      return {
        fatorId: answer.fator_id,
        score: 0,
        textValue: typeof answer.resposta === 'number' ? null : answerKey(answer.resposta),
        numberValue: typeof answer.resposta === 'number' ? answer.resposta : null,
      };
    }

    const rules = readRuleScore(factor.regra_score_json);
    let score = 0;

    if (factor.tipo_resposta === 'NUMERICA' && typeof answer.resposta === 'number') {
      score = answer.resposta * (factor.peso_base || 1);
    } else {
      const key = answerKey(answer.resposta);
      score = rules[key] ?? rules[key.toUpperCase()] ?? rules[key.toLowerCase()] ?? 0;
      if (score === 0 && typeof answer.resposta === 'boolean' && answer.resposta) {
        score = factor.peso_base || 1;
      }
    }

    return {
      fatorId: factor.id,
      score,
      textValue: typeof answer.resposta === 'number' ? null : answerKey(answer.resposta),
      numberValue: typeof answer.resposta === 'number' ? answer.resposta : null,
    };
  });

  const rawScore = responseScores.reduce((acc, item) => acc + item.score, 0);
  const { adjustedScore, appliedRules } = applyContextMultipliers(
    rawScore,
    responseScores,
    factors,
  );
  const totalScore = Math.round(adjustedScore * 10) / 10;
  const level =
    totalScore >= 12 ? 'CRITICO' : totalScore >= 8 ? 'ALTO' : totalScore >= 4 ? 'MEDIO' : 'BAIXO';

  return { totalScore, level, responseScores, rawScore, contextRules: appliedRules };
}
