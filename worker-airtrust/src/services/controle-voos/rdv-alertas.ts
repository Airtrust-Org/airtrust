/**
 * Motor de alertas do RDV. Conjunto inicial e propositalmente enxuto:
 * regras estruturais e auto-contidas em Controle de Voos (não cruza com o
 * domínio de Qualificações/ASO nesta entrega — ver documentação para o
 * backlog).
 */
import type { FlightRow, RdvRow } from '../../repositories/controle-voos/rdv-repository';

export type RdvAlertSeveridade = 'INFORMATIVO' | 'ATENCAO' | 'IMPEDE_ENVIO' | 'IMPEDE_APROVACAO';

export type RdvAlertRule = {
  regra: string;
  tipo: string;
  severidade: RdvAlertSeveridade;
  mensagem: string;
  etapaId?: number | null;
};

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
      SELECT id, numero_etapa, horario_decolagem, horario_pouso
      FROM cv_voo_etapas
      WHERE voo_id = ? AND empresa_id = ? AND deleted_at IS NULL
      ORDER BY numero_etapa ASC
    `,
    )
    .bind(voo.id, empresaId)
    .all<{
      id: number;
      numero_etapa: number;
      horario_decolagem: string | null;
      horario_pouso: string | null;
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

  for (let i = 1; i < legs.length; i += 1) {
    const previous = legs[i - 1];
    const current = legs[i];
    if (
      previous.horario_pouso &&
      current.horario_decolagem &&
      current.horario_decolagem < previous.horario_pouso
    ) {
      rules.push({
        regra: 'TRECHOS_SOBREPOSTOS',
        tipo: 'trechos',
        severidade: 'IMPEDE_ENVIO',
        mensagem: `Trecho ${current.numero_etapa} inicia antes do pouso do trecho ${previous.numero_etapa}`,
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
  }

  return rules;
}

// Recalcula os alertas e sincroniza com cv_rdv_alertas: resolve
// automaticamente regras que deixaram de se aplicar e insere as novas
// ainda não registradas. Nunca duplica uma regra já aberta.
export async function syncRdvAlerts(
  db: D1Database,
  empresaId: number,
  voo: FlightRow,
  rdv: RdvRow,
): Promise<Array<RdvAlertRule & { id: number }>> {
  const fresh = await computeRdvAlertRules(db, empresaId, voo, rdv);
  const freshRegras = new Set(fresh.map((r) => r.regra));

  const existingOpen = await db
    .prepare(
      `SELECT id, regra FROM cv_rdv_alertas WHERE rdv_id = ? AND empresa_id = ? AND resolvido = 0 AND deleted_at IS NULL`,
    )
    .bind(rdv.id, empresaId)
    .all<{ id: number; regra: string }>();
  const openRows = existingOpen.results || [];
  const openRegras = new Set(openRows.map((r) => r.regra));

  for (const row of openRows) {
    if (!freshRegras.has(row.regra)) {
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
    if (openRegras.has(rule.regra)) continue;
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
      SELECT id, tipo, severidade, mensagem, regra, impeditivo_envio, impeditivo_aprovacao
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
      impeditivo_envio: number;
      impeditivo_aprovacao: number;
    }>();

  return (stillOpen.results || []).map((r) => ({
    id: r.id,
    tipo: r.tipo,
    severidade: r.severidade,
    mensagem: r.mensagem,
    regra: r.regra,
  }));
}
