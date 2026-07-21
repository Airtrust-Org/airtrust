/**
 * Motor de alertas do RDV. Conjunto inicial e propositalmente enxuto:
 * regras estruturais e auto-contidas em Controle de Voos (não cruza com o
 * domínio de Qualificações/ASO nesta entrega — ver documentação para o
 * backlog).
 *
 * Trechos: valida etapas persistidas em `cv_voo_etapas` (realizado). Horários
 * previstos do voo não entram nestas regras.
 */
import type { FlightRow, RdvRow } from '../../repositories/controle-voos/rdv-repository';
import { parseEtapaInstant } from './rdv-etapas';

export type RdvAlertSeveridade = 'INFORMATIVO' | 'ATENCAO' | 'IMPEDE_ENVIO' | 'IMPEDE_APROVACAO';

export type RdvAlertRule = {
  regra: string;
  tipo: string;
  severidade: RdvAlertSeveridade;
  mensagem: string;
  etapaId?: number | null;
};

function alertKey(rule: Pick<RdvAlertRule, 'regra' | 'etapaId'>): string {
  return `${rule.regra}:${rule.etapaId ?? 'global'}`;
}

function durationMs(start: Date, end: Date): number {
  let diff = end.getTime() - start.getTime();
  if (diff < 0 && start.getUTCFullYear() === 1970 && end.getUTCFullYear() === 1970) {
    diff += 24 * 60 * 60 * 1000;
  }
  return diff;
}

export async function computeRdvAlertRules(
  db: D1Database,
  empresaId: number,
  voo: FlightRow,
  rdv: RdvRow,
): Promise<RdvAlertRule[]> {
  const rules: RdvAlertRule[] = [];

  const camposObrigatoriosAusentes: string[] = [];
  if (!rdv.numero) camposObrigatoriosAusentes.push('numero');
  if (!rdv.data_voo) camposObrigatoriosAusentes.push('data_voo');
  if (!rdv.horario_decolagem_real) camposObrigatoriosAusentes.push('horario_decolagem_real');
  if (!rdv.horario_pouso_real) camposObrigatoriosAusentes.push('horario_pouso_real');
  if (rdv.combustivel_decolagem === null) camposObrigatoriosAusentes.push('combustivel_decolagem');
  if (rdv.combustivel_pouso === null) camposObrigatoriosAusentes.push('combustivel_pouso');
  if (camposObrigatoriosAusentes.length > 0) {
    rules.push({
      regra: 'CAMPOS_OBRIGATORIOS_AUSENTES',
      tipo: 'preenchimento',
      severidade: 'IMPEDE_ENVIO',
      mensagem: `Campos obrigatorios ausentes: ${camposObrigatoriosAusentes.join(', ')}`,
    });
  }

  const tripulantes = await db
    .prepare(
      `SELECT id, funcao FROM cv_voo_tripulantes WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL`,
    )
    .bind(voo.id, empresaId)
    .all<{ id: number; funcao: string }>();
  const crew = tripulantes.results || [];

  if (crew.length === 0) {
    rules.push({
      regra: 'TRIPULACAO_AUSENTE',
      tipo: 'tripulacao',
      severidade: 'IMPEDE_ENVIO',
      mensagem: 'Nenhum tripulante cadastrado para este voo',
    });
  }

  const comandantes = crew.filter((t) => t.funcao === 'PIC').length;
  if (comandantes > 1) {
    rules.push({
      regra: 'COMANDANTE_DUPLICADO',
      tipo: 'tripulacao',
      severidade: 'IMPEDE_ENVIO',
      mensagem: `Mais de um comandante (PIC) cadastrado (${comandantes})`,
    });
  }

  const etapas = await db
    .prepare(
      `
      SELECT id, numero_etapa, origem_icao, destino_icao,
             horario_decolagem, horario_pouso, horario_motor_desligado,
             combustivel_inicio, combustivel_fim
      FROM cv_voo_etapas
      WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
      ORDER BY numero_etapa ASC, id ASC
    `,
    )
    .bind(voo.id, empresaId)
    .all<{
      id: number;
      numero_etapa: number;
      origem_icao: string | null;
      destino_icao: string | null;
      horario_decolagem: string | null;
      horario_pouso: string | null;
      horario_motor_desligado: string | null;
      combustivel_inicio: number | null;
      combustivel_fim: number | null;
    }>();
  const legs = etapas.results || [];

  if (legs.length === 0) {
    rules.push({
      regra: 'TRECHOS_AUSENTES',
      tipo: 'trechos',
      severidade: 'ATENCAO',
      mensagem: 'Nenhum trecho cadastrado para este voo',
    });
  }

  for (const leg of legs) {
    if (!leg.origem_icao) {
      rules.push({
        regra: 'TRECHO_ORIGEM_AUSENTE',
        tipo: 'trechos',
        severidade: 'IMPEDE_ENVIO',
        mensagem: `Trecho ${leg.numero_etapa} sem origem ICAO`,
        etapaId: leg.id,
      });
    }
    if (!leg.destino_icao) {
      rules.push({
        regra: 'TRECHO_DESTINO_AUSENTE',
        tipo: 'trechos',
        severidade: 'IMPEDE_ENVIO',
        mensagem: `Trecho ${leg.numero_etapa} sem destino ICAO`,
        etapaId: leg.id,
      });
    }
    if (leg.horario_decolagem && leg.horario_pouso) {
      const start = parseEtapaInstant(leg.horario_decolagem);
      const end = parseEtapaInstant(leg.horario_pouso);
      if (start && end && durationMs(start, end) < 0) {
        rules.push({
          regra: 'TRECHO_POUSO_ANTES_DECOLAGEM',
          tipo: 'trechos',
          severidade: 'IMPEDE_ENVIO',
          mensagem: `Trecho ${leg.numero_etapa}: pouso anterior a decolagem`,
          etapaId: leg.id,
        });
      }
    }
    if (leg.horario_pouso && leg.horario_motor_desligado) {
      const pouso = parseEtapaInstant(leg.horario_pouso);
      const corte = parseEtapaInstant(leg.horario_motor_desligado);
      if (pouso && corte && durationMs(pouso, corte) < 0) {
        rules.push({
          regra: 'TRECHO_CORTE_ANTES_POUSO',
          tipo: 'trechos',
          severidade: 'IMPEDE_ENVIO',
          mensagem: `Trecho ${leg.numero_etapa}: corte (motor desligado) anterior ao pouso`,
          etapaId: leg.id,
        });
      }
    }
    if (
      leg.combustivel_inicio != null &&
      leg.combustivel_fim != null &&
      leg.combustivel_fim > leg.combustivel_inicio
    ) {
      rules.push({
        regra: 'TRECHO_COMBUSTIVEL_INCOERENTE',
        tipo: 'trechos',
        severidade: 'IMPEDE_ENVIO',
        mensagem: `Trecho ${leg.numero_etapa}: combustivel fim maior que inicio`,
        etapaId: leg.id,
      });
    }
    if (
      (leg.combustivel_inicio != null && leg.combustivel_inicio < 0) ||
      (leg.combustivel_fim != null && leg.combustivel_fim < 0)
    ) {
      rules.push({
        regra: 'TRECHO_COMBUSTIVEL_NEGATIVO',
        tipo: 'trechos',
        severidade: 'IMPEDE_ENVIO',
        mensagem: `Trecho ${leg.numero_etapa}: combustivel negativo`,
        etapaId: leg.id,
      });
    }
  }

  for (let i = 1; i < legs.length; i += 1) {
    const previous = legs[i - 1];
    const current = legs[i];
    if (previous.horario_pouso && current.horario_decolagem) {
      const prevPouso = parseEtapaInstant(previous.horario_pouso);
      const currDec = parseEtapaInstant(current.horario_decolagem);
      if (prevPouso && currDec && durationMs(prevPouso, currDec) < 0) {
        rules.push({
          regra: 'TRECHOS_SOBREPOSTOS',
          tipo: 'trechos',
          severidade: 'IMPEDE_ENVIO',
          mensagem: `Trecho ${current.numero_etapa} inicia antes do pouso do trecho ${previous.numero_etapa}`,
          etapaId: current.id,
        });
      }
    }

    if (
      previous.destino_icao &&
      current.origem_icao &&
      previous.destino_icao.toUpperCase() !== current.origem_icao.toUpperCase()
    ) {
      rules.push({
        regra: 'TRECHOS_CONTINUIDADE_ICAO',
        tipo: 'trechos',
        severidade: 'ATENCAO',
        mensagem: `Trecho ${current.numero_etapa} origem (${current.origem_icao}) difere do destino do trecho ${previous.numero_etapa} (${previous.destino_icao})`,
        etapaId: current.id,
      });
    }
  }

  if (legs.length > 0) {
    const abastecimentosSemTrecho = await db
      .prepare(
        `
        SELECT COUNT(*) AS total FROM cv_voo_abastecimentos
        WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL AND etapa_id IS NULL
      `,
      )
      .bind(voo.id, empresaId)
      .first<{ total: number }>();
    if ((abastecimentosSemTrecho?.total ?? 0) > 0) {
      rules.push({
        regra: 'ABASTECIMENTO_SEM_TRECHO',
        tipo: 'abastecimento',
        severidade: 'ATENCAO',
        mensagem: 'Existe abastecimento sem trecho vinculado',
      });
    }

    const abastecimentosOrfaos = await db
      .prepare(
        `
        SELECT a.id, a.etapa_id
        FROM cv_voo_abastecimentos a
        WHERE a.voo_id = ? AND a.empresa_id = ? AND a.deleted_at IS NULL
          AND a.etapa_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM cv_voo_etapas e
            WHERE e.id = a.etapa_id
              AND e.voo_id = a.voo_id
              AND e.empresa_id = a.empresa_id
              AND e.deleted_at IS NULL
          )
      `,
      )
      .bind(voo.id, empresaId)
      .all<{ id: number; etapa_id: number }>();
    for (const orphan of abastecimentosOrfaos.results || []) {
      rules.push({
        regra: 'ABASTECIMENTO_ETAPA_INVALIDA',
        tipo: 'abastecimento',
        severidade: 'IMPEDE_ENVIO',
        mensagem: `Abastecimento ${orphan.id} aponta para etapa inexistente ou excluida (${orphan.etapa_id})`,
        etapaId: orphan.etapa_id,
      });
    }
  }

  return rules;
}

// Recalcula os alertas e sincroniza com cv_rdv_alertas: resolve
// automaticamente regras que deixaram de se aplicar e insere as novas
// ainda não registradas. Chave lógica = regra + etapa_id (evita colapsar
// alertas por-trecho distintos).
export async function syncRdvAlerts(
  db: D1Database,
  empresaId: number,
  voo: FlightRow,
  rdv: RdvRow,
): Promise<Array<RdvAlertRule & { id: number }>> {
  const fresh = await computeRdvAlertRules(db, empresaId, voo, rdv);
  const freshKeys = new Set(fresh.map((r) => alertKey(r)));

  const existingOpen = await db
    .prepare(
      `SELECT id, regra, etapa_id FROM cv_rdv_alertas WHERE rdv_id = ? AND empresa_id = ? AND resolvido = 0 AND deleted_at IS NULL`,
    )
    .bind(rdv.id, empresaId)
    .all<{ id: number; regra: string; etapa_id: number | null }>();
  const openRows = existingOpen.results || [];
  const openKeys = new Set(openRows.map((r) => alertKey({ regra: r.regra, etapaId: r.etapa_id })));

  for (const row of openRows) {
    if (!freshKeys.has(alertKey({ regra: row.regra, etapaId: row.etapa_id }))) {
      await db
        .prepare(
          `
          UPDATE cv_rdv_alertas
          SET resolvido = 1, resolvido_em = datetime('now'),
              justificativa_resolucao = 'Regra nao mais aplicavel (recalculo automatico)',
              updated_at = datetime('now')
          WHERE id = ? AND empresa_id = ?
        `,
        )
        .bind(row.id, empresaId)
        .run();
    }
  }

  const created: Array<RdvAlertRule & { id: number }> = [];
  for (const rule of fresh) {
    if (openKeys.has(alertKey(rule))) continue;
    const result = await db
      .prepare(
        `
        INSERT INTO cv_rdv_alertas (
          empresa_id, rdv_id, etapa_id, tipo, severidade, mensagem, regra,
          impeditivo_envio, impeditivo_aprovacao, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      )
      .bind(
        empresaId,
        rdv.id,
        rule.etapaId ?? null,
        rule.tipo,
        rule.severidade,
        rule.mensagem,
        rule.regra,
        rule.severidade === 'IMPEDE_ENVIO' ? 1 : 0,
        rule.severidade === 'IMPEDE_APROVACAO' ? 1 : 0,
      )
      .run();
    created.push({ ...rule, id: Number(result.meta.last_row_id) });
  }

  const stillOpen = await db
    .prepare(
      `
      SELECT id, tipo, severidade, mensagem, regra, etapa_id, impeditivo_envio, impeditivo_aprovacao
      FROM cv_rdv_alertas
      WHERE rdv_id = ? AND empresa_id = ? AND resolvido = 0 AND deleted_at IS NULL
      ORDER BY severidade DESC, created_at ASC
    `,
    )
    .bind(rdv.id, empresaId)
    .all<{
      id: number;
      tipo: string;
      severidade: RdvAlertSeveridade;
      mensagem: string;
      regra: string;
      etapa_id: number | null;
      impeditivo_envio: number;
      impeditivo_aprovacao: number;
    }>();

  return (stillOpen.results || []).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    severidade: r.severidade,
    mensagem: r.mensagem,
    regra: r.regra,
    etapaId: r.etapa_id,
  }));
}
