/**
 * Fonte de dados operacionais do Controle de Voos para o FRMS.
 *
 * Arquitetura canônica decidida (em transição, ver docs/frms-controle-voos-migracao.md):
 *
 *   SIGVOOS/SIGI → Controle de Voos → FRMS
 *
 * Este módulo é a camada de LEITURA que o FRMS deve consumir para obter dados
 * operacionais normalizados a partir do Controle de Voos. Ele é um adaptador
 * fino sobre `services/controle-voos/controle-voos-jornadas.ts` — o read-model
 * canônico já existente, tenant-scoped e testado, usado hoje pelo dashboard de
 * Controle de Voos (`routes/controle-voos.ts`). Não recriamos a query aqui:
 * reaproveitamos a mesma fonte da verdade em vez de duplicá-la.
 *
 * IMPORTANTE: este módulo é somente leitura e aditivo. Ele NÃO substitui o
 * caminho legado (`services/sigvoos-frms.ts`), NÃO grava em `frms_jornada` e
 * NÃO altera nenhum score, alerta ou jornada oficial. Uso atual: apenas
 * comparação em shadow-mode (ver `controle-voos-shadow-comparator.ts`).
 */

import type { D1Database } from '@cloudflare/workers-types';
import {
  listControleVoosJornadas,
  type ControleVoosJornadaItem,
  type ControleVoosJornadaOrigemDados,
  type ControleVoosJornadaQualidadeDado,
  type ControleVoosJornadaEstadoConflito,
} from '../../services/controle-voos/controle-voos-jornadas';

/** Origens de dados operacionais reconhecidas pelo Controle de Voos. */
export type ControleVoosRecordOrigin = 'CONTROLE_VOOS';
export type ControleVoosOperationalStatus =
  | 'PLANEJADO'
  | 'CONFIRMADO'
  | 'REALIZADO'
  | 'CANCELADO'
  | 'EXCLUIDO'
  | 'CORRIGIDO'
  | 'DUPLICADO'
  | 'DESCONHECIDO';

/**
 * Contrato canônico dos dados operacionais que o Controle de Voos oferece ao FRMS.
 *
 * Campos ainda parcialmente lacunares são expostos explicitamente como
 * indisponíveis/`null`, em vez de receber fallback silencioso.
 */
export interface ControleVoosOperationalRecord {
  empresaId: number;
  /** Identificador interno estável (voo + etapa + tripulante), vindo de `jornada_id`. */
  identificadorInterno: string;
  /** Identificador externo de proveniência (id do flight report no SIGVOOS), quando disponível. */
  identificadorExterno: string | null;
  /** Identificador externo estável do tripulante quando existir dos dois lados. */
  identificadorExternoTripulante: string | null;
  origem: ControleVoosRecordOrigin;
  /** Como o dado chegou ao Controle de Voos (importado do SIGVOOS, manual, ou editado). */
  origemDados: ControleVoosJornadaOrigemDados;
  tripulanteId: number;
  /** Função a bordo (PIC/SIC/COM/MEC/OUTRO), como registrada em `cv_voo_tripulantes.funcao`. */
  funcao: string;
  /** Crew duty boundaries captured by Controle de Voos. */
  horaApresentacao?: string | null;
  horaDispensa?: string | null;
  /** Data operacional no formato YYYY-MM-DD. */
  dataOperacional: string;
  /** Horários locais normalizados HH:MM, sem inferir UTC quando o timezone não existe no schema. */
  horaMotorLigado?: string | null;
  horaDecolagem: string | null;
  horaPouso: string | null;
  horaMotorDesligado?: string | null;
  timezone: string | null;
  timezoneFonte: 'EXPLICITO' | 'INDISPONIVEL';
  vooId: number;
  etapaId: number | null;
  aeronaveIdentificador: string | null;
  origemIcao: string | null;
  destinoIcao: string | null;
  statusOperacional: ControleVoosOperationalStatus;
  statusOperacionalRaw: string | null;
  cancelado: boolean;
  corrigido: boolean;
  minutosVoo: number;
  minutosTotal?: number;
  pousos?: number;
  /** `last_sync_at` do read-model — usado para detectar mudanças retroativas / idempotência. */
  atualizadoEm: string | null;
  /** Qualidade do dado conforme já computada pelo read-model (não recalculada aqui). */
  qualidadeDado: ControleVoosJornadaQualidadeDado;
  /** Estado de conflito de importação/reconciliação, quando houver (null = sem conflito aberto). */
  estadoConflito: ControleVoosJornadaEstadoConflito;
}

/**
 * Lacunas conhecidas e CONFIRMADAS por investigação real do código/schema (não
 * inferidas por nome de função) entre o que o SIGVOOS/legado fornece ao FRMS e
 * o que o Controle de Voos consegue oferecer hoje via `listControleVoosJornadas`.
 * Não inventar paridade: estes pontos permanecem como lacuna até resolução futura.
 *
 * Futuro (ainda NÃO ativo): qualquer transformação FRMS a partir do Controle de
 * Voos deve consumir as **etapas persistidas** em `cv_voo_etapas` (horários,
 * ICAO, combustível, tempos por perna) como fonte canônica do realizado. Os
 * campos agregados de `cv_rdv_operacional` são compatibilidade/legado e não
 * devem substituir as etapas quando estas existirem. Este módulo permanece
 * somente leitura e não escreve no FRMS.
 */
export const CONTROLE_VOOS_FRMS_KNOWN_GAPS: readonly string[] = [
  'Timezone explícito: os horários (`engine_start`, `takeoff_time`, etc.) continuam sem coluna IANA própria no schema CV/SIGVOOS atual; o contrato agora expõe `timezone=null` e falha de forma conservadora no comparador em vez de presumir America/Sao_Paulo.',
  'Matrícula do tripulante permanece fora do contrato CV -> FRMS por não ser necessária à identidade canônica e por risco de PII. Quando houver chave externa estável, usa-se `sigvoos_staff_id`.',
  'Transformação futura deve preferir cv_voo_etapas persistidas sobre campos agregados do RDV quando houver etapas; agregados do formulário não são origem definitiva.',
  'Horários PLANEJADOS (cv_voos.horario_previsto_partida/chegada) não são expostos por `listControleVoosJornadas` — o read-model agrega apenas o REALIZADO. O contrato FRMS v1 (controle-voos-contract.ts) expõe planejados=null com fonte explícita até o read-model ser estendido.',
  'Base operacional (aeroporto/plataforma de origem do tripulante) não existe como coluna própria em cv_voos nem no read-model — permanece SIGVOOS_EXTERNAL_EVIDENCE_PENDING no contrato FRMS v1.',
];

function normalizeStatus(value: string | null): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  return normalized || null;
}

function mapOperationalStatus(item: ControleVoosJornadaItem): ControleVoosOperationalStatus {
  const raw = normalizeStatus(item.voo_status);
  if (!raw) return 'DESCONHECIDO';
  if (raw.includes('cancel')) return 'CANCELADO';
  if (raw.includes('exclu')) return 'EXCLUIDO';
  if (raw.includes('duplic')) return 'DUPLICADO';
  if (raw.includes('corrig')) return 'CORRIGIDO';
  if (raw === 'planejado') return 'PLANEJADO';
  if (raw.includes('confirm') || raw.includes('liberado_operacionalmente')) return 'CONFIRMADO';
  if (raw.includes('realiz') || raw.includes('conclu') || raw.includes('fechado'))
    return 'REALIZADO';
  return 'DESCONHECIDO';
}

function minutosEntre(horaInicio: string | null, horaFim: string | null): number {
  if (!horaInicio || !horaFim) return 0;
  const parse = (value: string): number | null => {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  };
  const inicioMin = parse(horaInicio);
  const fimMin = parse(horaFim);
  if (inicioMin === null || fimMin === null) return 0;
  return fimMin >= inicioMin ? fimMin - inicioMin : 24 * 60 - inicioMin + fimMin;
}

function duracaoHhmmEmMinutos(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/^(\d{1,3}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function mapJornadaItemToOperationalRecord(
  item: ControleVoosJornadaItem,
  empresaId: number,
): ControleVoosOperationalRecord {
  const statusOperacional = mapOperationalStatus(item);
  const timezone = item.timezone_iana;
  return {
    empresaId,
    identificadorInterno: item.jornada_id,
    identificadorExterno:
      item.external_id_sigvoos != null ? String(item.external_id_sigvoos) : null,
    identificadorExternoTripulante:
      item.sigvoos_staff_id != null ? String(item.sigvoos_staff_id) : null,
    origem: 'CONTROLE_VOOS',
    origemDados: item.origem_dados,
    tripulanteId: item.tripulante_id,
    funcao: item.funcao,
    horaApresentacao: item.horario_apresentacao,
    horaDispensa: item.horario_dispensa,
    dataOperacional: item.data_operacional,
    horaMotorLigado: item.engine_start,
    horaDecolagem: item.takeoff_time,
    horaPouso: item.landing_time,
    horaMotorDesligado: item.engine_shutoff,
    timezone,
    timezoneFonte: timezone ? 'EXPLICITO' : 'INDISPONIVEL',
    vooId: item.voo_id,
    // Futuro FRMS (ainda inativo): preferir etapas persistidas em cv_voo_etapas
    // sobre campos agregados do RDV quando houver pernas — não alterar runtime aqui.
    etapaId: item.etapa_id,
    aeronaveIdentificador: item.aeronave,
    origemIcao: item.origem_icao,
    destinoIcao: item.destino_icao,
    statusOperacional,
    statusOperacionalRaw: item.voo_status,
    cancelado: statusOperacional === 'CANCELADO',
    corrigido: statusOperacional === 'CORRIGIDO',
    minutosVoo: duracaoHhmmEmMinutos(item.tempo_navegacao) ?? minutosEntre(item.takeoff_time, item.landing_time),
    minutosTotal: duracaoHhmmEmMinutos(item.tempo_total) ?? minutosEntre(item.engine_start, item.engine_shutoff),
    pousos: Math.max(0, Number(item.pousos_diurnos ?? 0)) + Math.max(0, Number(item.pousos_noturnos ?? 0)),
    atualizadoEm: item.last_sync_at,
    qualidadeDado: item.qualidade_dado,
    estadoConflito: item.estado_conflito,
  };
}

/**
 * Busca dados operacionais normalizados do Controle de Voos para uso pelo FRMS,
 * dentro de uma janela de datas, escopados estritamente à empresa autenticada.
 *
 * Isolamento multi-tenant: `empresaId` deve vir da identidade autenticada
 * (nunca do cliente) e é repassado integralmente para `listControleVoosJornadas`,
 * que já filtra `empresa_id` em todas as tabelas envolvidas.
 */
export async function fetchControleVoosOperationalRecords(
  db: D1Database,
  empresaId: number,
  from: string,
  to: string,
): Promise<ControleVoosOperationalRecord[]> {
  if (!Number.isFinite(empresaId) || empresaId <= 0) {
    throw new Error(
      'fetchControleVoosOperationalRecords requer empresaId válido da identidade autenticada.',
    );
  }

  const { items } = await listControleVoosJornadas(db, empresaId, {
    dataInicio: from,
    dataFim: to,
  });

  return items.map((item) => mapJornadaItemToOperationalRecord(item, empresaId));
}
