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
} from '../../services/controle-voos/controle-voos-jornadas';

/** Origens de dados operacionais reconhecidas pelo Controle de Voos. */
export type ControleVoosRecordOrigin = 'CONTROLE_VOOS';

/**
 * Contrato canônico dos dados operacionais que o Controle de Voos oferece ao FRMS.
 *
 * Campos com lacuna confirmada hoje (ver `CONTROLE_VOOS_FRMS_KNOWN_GAPS` — não
 * inventar paridade, documentar e seguir):
 * - `statusCancelamentoConfirmado`: `listControleVoosJornadas` (o read-model
 *   canônico reaproveitado aqui) não seleciona `cv_voos.status`, logo não é
 *   possível hoje distinguir com certeza um voo cancelado a partir deste
 *   contrato. Consumidores NÃO devem assumir que os registros retornados
 *   excluem voos cancelados.
 */
export interface ControleVoosOperationalRecord {
  empresaId: number;
  /** Identificador interno estável (voo + etapa + tripulante), vindo de `jornada_id`. */
  identificadorInterno: string;
  /** Identificador externo de proveniência (id do flight report no SIGVOOS), quando disponível. */
  identificadorExterno: string | null;
  origem: ControleVoosRecordOrigin;
  /** Como o dado chegou ao Controle de Voos (importado do SIGVOOS, manual, ou editado). */
  origemDados: ControleVoosJornadaOrigemDados;
  tripulanteId: number;
  /** Data operacional no formato YYYY-MM-DD. */
  dataOperacional: string;
  /** Horários no formato HH:MM (hora local), quando disponíveis. Não são timestamps ISO completos. */
  horaDecolagem: string | null;
  horaPouso: string | null;
  /** Fuso horário de referência dos horários armazenados (ver lacuna: não há coluna de timezone explícita). */
  timezone: 'America/Sao_Paulo';
  vooId: number;
  etapaId: number | null;
  aeronaveIdentificador: string | null;
  origemIcao: string | null;
  destinoIcao: string | null;
  /** Nunca `true` com certeza absoluta — ver lacuna de cancelamento no cabeçalho deste arquivo. */
  statusCancelamentoConfirmado: false;
  minutosVoo: number;
  /** `last_sync_at` do read-model — usado para detectar mudanças retroativas / idempotência. */
  atualizadoEm: string | null;
}

/**
 * Lacunas conhecidas e CONFIRMADAS por investigação real do código/schema (não
 * inferidas por nome de função) entre o que o SIGVOOS/legado fornece ao FRMS e
 * o que o Controle de Voos consegue oferecer hoje via `listControleVoosJornadas`.
 * Não inventar paridade: estes pontos permanecem como lacuna até resolução futura.
 */
export const CONTROLE_VOOS_FRMS_KNOWN_GAPS: readonly string[] = [
  'Cancelamento: listControleVoosJornadas não seleciona cv_voos.status; não há como confirmar, a partir deste contrato, que um voo cancelado foi excluído. Risco: comparação em shadow-mode pode contar minutos de voos cancelados como se fossem válidos.',
  'Matrícula do tripulante: o read-model expõe apenas `nome` (PII), não `matricula`; o contrato do FRMS aqui deliberadamente NÃO expõe nome (ver função de mapeamento) para evitar PII em logs de shadow-mode, mas também não oferece um identificador estável alternativo além de `tripulante_id`.',
  'Timezone explícito: os horários (`engine_start`, `takeoff_time`, etc.) são strings HH:MM sem coluna de fuso horário própria; assume-se America/Sao_Paulo por convenção do restante do domínio FRMS, não por garantia de schema.',
];

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
  return fimMin >= inicioMin ? fimMin - inicioMin : 0;
}

function mapJornadaItemToOperationalRecord(
  item: ControleVoosJornadaItem,
  empresaId: number,
): ControleVoosOperationalRecord {
  return {
    empresaId,
    identificadorInterno: item.jornada_id,
    identificadorExterno: item.external_id_sigvoos != null ? String(item.external_id_sigvoos) : null,
    origem: 'CONTROLE_VOOS',
    origemDados: item.origem_dados,
    tripulanteId: item.tripulante_id,
    dataOperacional: item.data_operacional,
    horaDecolagem: item.takeoff_time,
    horaPouso: item.landing_time,
    timezone: 'America/Sao_Paulo',
    vooId: item.voo_id,
    etapaId: item.etapa_id,
    aeronaveIdentificador: item.aeronave,
    origemIcao: item.origem_icao,
    destinoIcao: item.destino_icao,
    statusCancelamentoConfirmado: false,
    minutosVoo: minutosEntre(item.takeoff_time, item.landing_time),
    atualizadoEm: item.last_sync_at,
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
    throw new Error('fetchControleVoosOperationalRecords requer empresaId válido da identidade autenticada.');
  }

  const { items } = await listControleVoosJornadas(db, empresaId, {
    dataInicio: from,
    dataFim: to,
  });

  return items.map((item) => mapJornadaItemToOperationalRecord(item, empresaId));
}
