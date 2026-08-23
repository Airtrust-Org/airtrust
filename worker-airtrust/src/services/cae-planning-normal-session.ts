import type { D1Database } from '@cloudflare/workers-types';
import {
  audit,
  criarQualificacoesPlanejadas,
  findSessaoConflict,
  timeToMinutes,
} from '../routes/simuladores-shared';

export type NormalSimulatorSessionInput = {
  date: string;
  start_time: string;
  end_time: string;
  simulator_id: number;
  instructor_id: number;
  session_type?: string | null;
  theme?: string | null;
  notes?: string | null;
  session_model_id: number;
  participants: Array<{ employee_id: number; role?: string }>;
};

/**
 * Persistência canônica de sessão NORMAL (mesmo núcleo de POST /sessoes):
 * conflito + INSERT simulador_agendamentos + participantes + qualificações planejadas.
 */
export async function executeNormalSessionCreation(
  db: D1Database,
  empresaId: number,
  input: NormalSimulatorSessionInput,
): Promise<{ sessaoId: number }> {
  if (!Number.isInteger(input.simulator_id) || input.simulator_id <= 0) {
    throw new Error('NORMAL_SESSION_REQUIRES_SIMULATOR_ID');
  }
  if (!Number.isInteger(input.instructor_id) || input.instructor_id <= 0) {
    throw new Error('NORMAL_SESSION_REQUIRES_INSTRUCTOR_ID');
  }
  if (!input.participants.length) {
    throw new Error('NORMAL_SESSION_REQUIRES_PARTICIPANTS');
  }

  const startMin = timeToMinutes(input.start_time);
  const endMin = timeToMinutes(input.end_time);
  if (startMin === null || endMin === null || endMin === startMin) {
    throw new Error('NORMAL_SESSION_INVALID_TIME');
  }

  const conflict = await findSessaoConflict(db, {
    simuladorId: input.simulator_id,
    data: input.date,
    inicioMin: startMin,
    fimMin: endMin,
  });
  if (conflict) {
    throw new Error('SCHEDULE_CONFLICT');
  }

  const duration = endMin > startMin ? endMin - startMin : 24 * 60 - startMin + endMin;
  const uuid = crypto.randomUUID();
  const primaryEmployeeId = input.participants[0].employee_id;
  const sessionType = String(input.session_type || 'TREINAMENTO');

  const inserted = await db
    .prepare(
      `INSERT INTO simulador_agendamentos (
         uuid, simulador_id, funcionario_id, data, hora_inicio, hora_fim, duracao_minutos,
         instrutor_id, examinador_id, is_check, tipo_sessao, template_id, status, observacoes, nome, empresa_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, 'AGENDADO', ?, ?, ?)`,
    )
    .bind(
      uuid,
      input.simulator_id,
      primaryEmployeeId,
      input.date,
      input.start_time,
      input.end_time,
      duration,
      input.instructor_id,
      sessionType,
      input.session_model_id,
      input.notes || null,
      input.theme || null,
      empresaId,
    )
    .run();

  const sessaoId = Number(inserted.meta.last_row_id || 0);
  if (!sessaoId) {
    throw new Error('NORMAL_SESSION_INSERT_FAILED');
  }

  const participantStmts = input.participants.map((participant, index) =>
    db
      .prepare(
        `INSERT INTO sessoes_participantes (uuid, sessao_id, funcionario_id, funcao, status)
         VALUES (?, ?, ?, ?, 'CONFIRMADO')`,
      )
      .bind(
        crypto.randomUUID(),
        sessaoId,
        participant.employee_id,
        participant.role || (index === 0 ? 'PIC' : 'SIC'),
      ),
  );
  if (participantStmts.length > 0) {
    await db.batch(participantStmts);
  }

  await criarQualificacoesPlanejadas(db, {
    sessaoId,
    modeloId: Number(input.session_model_id),
    tipoSessao: sessionType,
    data: input.date,
    participantes: input.participants.map((participant) => ({ funcionario_id: participant.employee_id })),
    empresaId,
  });

  await audit(db, {
    tabela: 'simulador_agendamentos',
    acao: 'INSERT',
    registro_id: sessaoId,
    dados_novos: { source: 'cae-planning', ...input },
  }).catch(() => undefined);

  return { sessaoId };
}
