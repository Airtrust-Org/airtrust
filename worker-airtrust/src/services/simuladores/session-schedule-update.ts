import {
  getAgendamentoColumnSupport,
  runAgendamentoUpdate,
  syncPlanejadasDataConclusao,
  type AgendamentoColumnSupport,
} from '../../repositories/simuladores/session-update-repository';
import { findSessaoConflict, resolveTemplateIdSessao, timeToMinutes } from './shared';

/**
 * Fase "dispositivo + horário + conflito + modelo + UPDATE" do PUT /sessoes/:id.
 * Movida de routes/simuladores-sessoes-update.ts sem mudar regras, ordem de escrita nem
 * textos de erro (fixada por simuladores-sessoes-update-schedule.characterization.test).
 */

type Id = string | number;
export type TipoDispositivo = 'SIMULADOR' | 'AERONAVE';

/** Campos do corpo do PUT usados por esta fase. */
export interface SessaoScheduleBody {
  tipo_dispositivo?: unknown;
  simulador_id?: unknown;
  aeronave_id?: unknown;
  data?: unknown;
  horario_inicio?: unknown;
  horario_fim?: unknown;
  duracao_minutos?: unknown;
  instrutor_id?: unknown;
  tipo_sessao?: unknown;
  status?: unknown;
  observacoes?: unknown;
  tema_sessao?: unknown;
}

/** Colunas da sessão (lidas antes do UPDATE) usadas por esta fase. */
export interface SessaoScheduleRow {
  tipo_dispositivo?: unknown;
  simulador_id?: unknown;
  aeronave_id?: unknown;
  data?: unknown;
  hora_inicio?: unknown;
  hora_fim?: unknown;
  duracao_minutos?: unknown;
  instrutor_id?: unknown;
  tipo_sessao?: unknown;
  template_id?: unknown;
  status?: unknown;
  observacoes?: unknown;
  nome?: unknown;
}

export interface SessaoSchedulePlan {
  tipoDispositivoFinal: TipoDispositivo;
  simuladorIdFinal: number;
  dataFinal: string;
  inicioMin: number;
  fimMin: number;
}

export type PlanSessaoScheduleResult =
  | { ok: true; plan: SessaoSchedulePlan }
  | { ok: false; status: 400; error: string };

/** Dispositivo final e janela de horário resultantes do corpo sobre a sessão atual. */
export function planSessaoSchedule(
  body: SessaoScheduleBody,
  sessao: SessaoScheduleRow,
): PlanSessaoScheduleResult {
  // Determinar tipo_dispositivo final
  const tipoDispositivoFinal: TipoDispositivo =
    body.tipo_dispositivo === 'AERONAVE'
      ? 'AERONAVE'
      : sessao.tipo_dispositivo === 'AERONAVE'
        ? 'AERONAVE'
        : 'SIMULADOR';

  // Validação de horário (conflito é checado à parte, só para simuladores)
  const simuladorIdFinal = Number(body.simulador_id ?? sessao.simulador_id);
  const dataFinal = String(body.data ?? sessao.data);
  const inicioStr = body.horario_inicio !== undefined ? body.horario_inicio : sessao.hora_inicio;
  const fimStr = body.horario_fim !== undefined ? body.horario_fim : sessao.hora_fim;

  if (!inicioStr || !fimStr) {
    return { ok: false, status: 400, error: 'Horário de início e fim são obrigatórios' };
  }

  const inicioMin = timeToMinutes(inicioStr);
  const fimMin = timeToMinutes(fimStr);
  if (inicioMin === null || fimMin === null) {
    return { ok: false, status: 400, error: 'Horários inválidos (use HH:MM)' };
  }
  if (fimMin === inicioMin) {
    return { ok: false, status: 400, error: 'Horário final deve ser diferente do horário inicial' };
  }

  return {
    ok: true,
    plan: { tipoDispositivoFinal, simuladorIdFinal, dataFinal, inicioMin, fimMin },
  };
}

/** Mensagem de conflito com outra sessão do simulador, ou null (aeronave não checa). */
export async function findConflitoDeAgendamento(
  db: D1Database,
  plan: SessaoSchedulePlan,
  sessaoId: Id,
): Promise<string | null> {
  if (plan.tipoDispositivoFinal !== 'SIMULADOR' || !plan.simuladorIdFinal) return null;

  const conflito = await findSessaoConflict(db, {
    simuladorId: plan.simuladorIdFinal,
    data: plan.dataFinal,
    inicioMin: plan.inicioMin,
    fimMin: plan.fimMin,
    excludeId: sessaoId,
  });
  if (!conflito) return null;

  const hi = typeof conflito.hora_inicio === 'string' ? conflito.hora_inicio.substring(0, 5) : '';
  const hf = typeof conflito.hora_fim === 'string' ? conflito.hora_fim.substring(0, 5) : '';
  return `Conflito de agendamento: já existe uma sessão neste simulador de ${hi} a ${hf}. Escolha outro horário.`;
}

/**
 * UPDATE de simulador_agendamentos: com as colunas tipo_dispositivo/aeronave_id (migration
 * 0364) grava também dispositivo e aeronave; sem elas usa o statement legado.
 */
export function buildAgendamentoUpdate(params: {
  support: AgendamentoColumnSupport;
  body: SessaoScheduleBody;
  sessao: SessaoScheduleRow;
  tipoDispositivoFinal: TipoDispositivo;
  templateIdFinal: number | null;
  sessaoId: Id;
  empresaId: number;
}): { sql: string; binds: unknown[] } {
  const { support, body: b, sessao: a, tipoDispositivoFinal, templateIdFinal, sessaoId, empresaId } = params;
  const comColunasNovas = support.hasTipoDispositivo && support.hasAeronaveId;

  const sql = comColunasNovas
    ? "UPDATE simulador_agendamentos SET simulador_id=?,aeronave_id=?,tipo_dispositivo=?,data=?,hora_inicio=?,hora_fim=?,duracao_minutos=?,instrutor_id=?,tipo_sessao=?,template_id=?,status=?,observacoes=?,nome=?,updated_at=datetime('now') WHERE id=? AND empresa_id = ?"
    : "UPDATE simulador_agendamentos SET simulador_id=?,data=?,hora_inicio=?,hora_fim=?,duracao_minutos=?,instrutor_id=?,tipo_sessao=?,template_id=?,status=?,observacoes=?,nome=?,updated_at=datetime('now') WHERE id=? AND empresa_id = ?";

  const binds = comColunasNovas
    ? [
        b.simulador_id !== undefined ? b.simulador_id : a.simulador_id,
        b.aeronave_id !== undefined ? b.aeronave_id : a.aeronave_id,
        tipoDispositivoFinal,
        b.data || a.data,
        b.horario_inicio !== undefined ? b.horario_inicio : a.hora_inicio,
        b.horario_fim !== undefined ? b.horario_fim : a.hora_fim,
        b.duracao_minutos !== undefined ? b.duracao_minutos : a.duracao_minutos,
        b.instrutor_id !== undefined ? b.instrutor_id : a.instrutor_id,
        b.tipo_sessao || a.tipo_sessao,
        templateIdFinal,
        b.status || a.status,
        b.observacoes !== undefined ? b.observacoes : a.observacoes,
        b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
        sessaoId,
        empresaId,
      ]
    : [
        b.simulador_id || a.simulador_id,
        b.data || a.data,
        b.horario_inicio !== undefined ? b.horario_inicio : a.hora_inicio,
        b.horario_fim !== undefined ? b.horario_fim : a.hora_fim,
        b.duracao_minutos !== undefined ? b.duracao_minutos : a.duracao_minutos,
        b.instrutor_id !== undefined ? b.instrutor_id : a.instrutor_id,
        b.tipo_sessao || a.tipo_sessao,
        templateIdFinal,
        b.status || a.status,
        b.observacoes !== undefined ? b.observacoes : a.observacoes,
        b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
        sessaoId,
        empresaId,
      ];

  return { sql, binds };
}

/**
 * Resolve o modelo da sessão, grava o UPDATE e, se a data mudou, leva a nova data às
 * qualificações PLANEJADAS vinculadas.
 */
export async function applySessaoScheduleUpdate(
  db: D1Database,
  params: {
    empresaId: number;
    sessaoId: Id;
    sessao: SessaoScheduleRow;
    body: SessaoScheduleBody;
    templateIdBody: unknown;
    modeloAeronaveSessao: string;
    tipoDispositivoFinal: TipoDispositivo;
  },
): Promise<{ templateIdFinal: number | null }> {
  const { empresaId, sessaoId, sessao: a, body: b, templateIdBody, modeloAeronaveSessao, tipoDispositivoFinal } = params;

  const templateIdFinal = await resolveTemplateIdSessao(db, {
    empresaId,
    templateId: templateIdBody !== undefined ? templateIdBody : a.template_id,
    temaSessao: b.tema_sessao !== undefined ? b.tema_sessao : a.nome,
    tipoSessaoCodigo: b.tipo_sessao !== undefined ? b.tipo_sessao : a.tipo_sessao,
    modeloAeronave: modeloAeronaveSessao,
  });

  // Verificar se as colunas tipo_dispositivo e aeronave_id existem (migration 0364)
  const support = await getAgendamentoColumnSupport(db);
  const { sql, binds } = buildAgendamentoUpdate({
    support,
    body: b,
    sessao: a,
    tipoDispositivoFinal,
    templateIdFinal,
    sessaoId,
    empresaId,
  });

  // UPDATE: incluindo hora_inicio, hora_fim, nome (tema_sessao), tipo_dispositivo, aeronave_id
  await runAgendamentoUpdate(db, sql, binds);

  // Sincronizar data_conclusao nas qualificações PLANEJADAS vinculadas (se a data mudou)
  if (b.data && b.data !== a.data) {
    await syncPlanejadasDataConclusao(db, sessaoId, b.data);
  }

  return { templateIdFinal };
}
