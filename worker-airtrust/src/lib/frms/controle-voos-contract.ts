/**
 * Contrato versionado Controle de Voos -> FRMS.
 *
 * Formaliza, com schema testável, o payload que o Controle de Voos oferece
 * ao FRMS. Não ativa cutover: nenhuma rota aqui escreve em `frms_jornada`,
 * nenhum score é calculado, e o AirTrust NÃO é promovido a fonte primária
 * nesta etapa — ver `controle-voos-shadow-flag.ts` (o flag que controlaria
 * isso continua com default `false` para todas as empresas).
 *
 * Este módulo é puramente uma camada de SERIALIZAÇÃO sobre
 * `ControleVoosOperationalRecord` (controle-voos-source.ts, já tenant-scoped
 * e testado) — não faz I/O e não recalcula nada que o read-model já resolve.
 *
 * Campos que dependem de evidência ainda não obtida do SIGVOOS real (telas,
 * exportações, regras operacionais) são marcados explicitamente como
 * SIGVOOS_EXTERNAL_EVIDENCE_PENDING em vez de inferidos ou fabricados.
 */
import { z } from 'zod';
import type { ControleVoosOperationalRecord } from './controle-voos-source';

export const FRMS_CONTROLE_VOOS_CONTRACT_VERSION = '1.0.0' as const;

export const SIGVOOS_EXTERNAL_EVIDENCE_PENDING = 'SIGVOOS_EXTERNAL_EVIDENCE_PENDING' as const;

const frmsControleVoosContractStatusValues = [
  'PLANEJADO',
  'CONFIRMADO',
  'REALIZADO',
  'CANCELADO',
  'EXCLUIDO',
  'CORRIGIDO',
  'DUPLICADO',
  'DESCONHECIDO',
] as const;

export type FrmsControleVoosContractStatus = (typeof frmsControleVoosContractStatusValues)[number];

export const frmsControleVoosContractV1Schema = z.object({
  contractVersion: z.literal(FRMS_CONTROLE_VOOS_CONTRACT_VERSION),
  empresaId: z.number().int().positive(),
  vooId: z.number().int().positive(),
  etapaId: z.number().int().positive().nullable(),
  tripulanteId: z.number().int().positive(),
  funcao: z.string().min(1),
  dataOperacional: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  horarios: z.object({
    planejados: z.object({
      partida: z.null(),
      chegada: z.null(),
      fonte: z.literal('NAO_DISPONIVEL_NO_READ_MODEL'),
    }),
    realizados: z.object({
      partida: z.string().nullable(),
      chegada: z.string().nullable(),
    }),
  }),
  timezone: z.string().nullable(),
  timezoneFonte: z.enum(['EXPLICITO', 'INDISPONIVEL']),
  base: z.object({
    codigo: z.null(),
    fonte: z.literal(SIGVOOS_EXTERNAL_EVIDENCE_PENDING),
  }),
  status: z.enum(frmsControleVoosContractStatusValues),
  statusRaw: z.string().nullable(),
  origem: z.literal('CONTROLE_VOOS'),
  origemDados: z.enum(['importado', 'manual_interno', 'editado_airtrust']),
  sourceVersion: z.string().min(1),
  qualidade: z.object({
    dado: z.enum(['completo', 'incompleto', 'pendente_mapeamento', 'divergente']),
    estadoConflito: z
      .enum(['pendente_mapeamento', 'divergente', 'incompleto', 'erro'])
      .nullable(),
  }),
  correcao: z.object({ corrigido: z.boolean() }),
  cancelamento: z.object({ cancelado: z.boolean() }),
  idempotencyKey: z.string().min(1),
  occurredAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export type FrmsControleVoosContractV1 = z.infer<typeof frmsControleVoosContractV1Schema>;

function buildIdempotencyKey(record: ControleVoosOperationalRecord, sourceVersion: string): string {
  return `cv:${FRMS_CONTROLE_VOOS_CONTRACT_VERSION}:${record.empresaId}:${record.identificadorInterno}:${sourceVersion}`;
}

/**
 * `occurredAt` representa o instante do evento operacional (decolagem), não
 * o instante em que o registro foi sincronizado (isso é `updatedAt`). Só é
 * preenchido quando data+hora local E timezone IANA explícito existem —
 * nunca fabrica offset UTC a partir de um horário sem timezone confirmado.
 * O formato retornado é hora LOCAL sem offset (`YYYY-MM-DDTHH:MM:00`); a
 * conversão para UTC é responsabilidade do consumidor, usando `timezone`.
 */
function buildOccurredAt(record: ControleVoosOperationalRecord): string | null {
  if (record.timezoneFonte !== 'EXPLICITO' || !record.horaDecolagem) return null;
  return `${record.dataOperacional}T${record.horaDecolagem}:00`;
}

export function buildFrmsControleVoosContractV1(
  record: ControleVoosOperationalRecord,
): FrmsControleVoosContractV1 {
  const sourceVersion = record.atualizadoEm ?? 'sem-sync';

  const contract: FrmsControleVoosContractV1 = {
    contractVersion: FRMS_CONTROLE_VOOS_CONTRACT_VERSION,
    empresaId: record.empresaId,
    vooId: record.vooId,
    etapaId: record.etapaId,
    tripulanteId: record.tripulanteId,
    funcao: record.funcao,
    dataOperacional: record.dataOperacional,
    horarios: {
      planejados: { partida: null, chegada: null, fonte: 'NAO_DISPONIVEL_NO_READ_MODEL' },
      realizados: { partida: record.horaDecolagem, chegada: record.horaPouso },
    },
    timezone: record.timezone,
    timezoneFonte: record.timezoneFonte,
    base: { codigo: null, fonte: SIGVOOS_EXTERNAL_EVIDENCE_PENDING },
    status: record.statusOperacional,
    statusRaw: record.statusOperacionalRaw,
    origem: record.origem,
    origemDados: record.origemDados,
    sourceVersion,
    qualidade: {
      dado: record.qualidadeDado,
      estadoConflito: record.estadoConflito,
    },
    correcao: { corrigido: record.corrigido },
    cancelamento: { cancelado: record.cancelado },
    idempotencyKey: buildIdempotencyKey(record, sourceVersion),
    occurredAt: buildOccurredAt(record),
    updatedAt: record.atualizadoEm,
  };

  return frmsControleVoosContractV1Schema.parse(contract);
}

export function buildFrmsControleVoosContractV1Batch(
  records: ControleVoosOperationalRecord[],
): FrmsControleVoosContractV1[] {
  return records.map((record) => buildFrmsControleVoosContractV1(record));
}
