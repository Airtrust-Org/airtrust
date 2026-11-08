import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { readSameDayTrainingAlerts } from '../../services/training-alert-same-day';
import {
  listTrainingCommunications,
  maskTrainingContact,
  type TrainingCommunicationFilters,
} from '../../services/training-communication-history';

const all = { mode: 'all' as const, setorIds: [] as [], funcionarioId: null };
const filters: TrainingCommunicationFilters = { limit: 100, offset: 0 };
let db: SqliteD1Database;

beforeEach(() => {
  db = new SqliteD1Database();
  db.database.exec(`
    ALTER TABLE funcionarios ADD COLUMN funcao_id INTEGER;
    ALTER TABLE funcionarios ADD COLUMN email TEXT;
    ALTER TABLE funcionarios ADD COLUMN telefone TEXT;
    UPDATE funcionarios SET email='ana@example.com', telefone='+5521999993333' WHERE id=1000;
    UPDATE funcionarios SET funcao_id = 5 WHERE id IN (1000, 1001);
    CREATE TABLE lms_cursos (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      titulo TEXT,
      qualificacao_tipo_id INTEGER
    );
    INSERT INTO lms_cursos(id,empresa_id,titulo,qualificacao_tipo_id)
      VALUES (30,1,'CRM - Gestores',100), (31,2,'Curso externo',200);
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      action TEXT,
      entity_type TEXT,
      entity_id INTEGER,
      new_values TEXT,
      created_at TEXT
    );
    CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE TABLE notificacoes_log (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      tipo TEXT, destinatario TEXT, assunto TEXT, corpo TEXT, notification_key TEXT,
      status TEXT, erro_mensagem TEXT, enviado_em TEXT, created_at TEXT
    );
    INSERT INTO audit_logs(id,empresa_id,action,entity_type,new_values,created_at)
      VALUES
      (10,1,'LMS_MATRICULA_ALERTA','lms_matriculas',
        '{"funcionario_id":1000,"curso_id":30,"curso_titulo":"CRM - Gestores","email_resultado":"ENVIADO","whatsapp_resultado":"SEM_WHATSAPP"}',
        '2026-11-04 14:20:00'),
      (11,1,'LMS_MATRICULA_CONVITE_EMAIL','lms_matriculas',
        '{"funcionario_id":1000,"curso_id":30,"email_resultado":"FALHA"}',
        '2026-11-04 14:10:00'),
      (12,2,'LMS_MATRICULA_ALERTA','lms_matriculas',
        '{"funcionario_id":2000,"curso_id":31,"email_resultado":"ENVIADO"}',
        '2026-11-04 14:30:00'),
      (13,1,'OUTRA_ACAO','lms_matriculas',
        '{"funcionario_id":1000,"curso_id":30,"email_resultado":"ENVIADO"}',
        '2026-11-04 14:40:00');
    INSERT INTO notificacoes_log(
      id,empresa_id,tipo,destinatario,assunto,corpo,status,enviado_em
    ) VALUES (
      10,1,'EMAIL_COMPLIANCE','piloto@example.com',
      '[COMPLIANCE_TREINAMENTO:100]', '{"funcionario_id":1001,"qualificacao_tipo_id":100,"qualificacao_nome":"MGO"}',
      'enviada','2026-11-04 15:00:00'
    );
  `);
});

afterEach(() => db.close());

const read = (
  overrides: Partial<TrainingCommunicationFilters> = {},
  access: Parameters<typeof listTrainingCommunications>[2] = all,
) => listTrainingCommunications(
  db.asD1(),
  1,
  access,
  { notifications: true, audit: true },
  { ...filters, ...overrides },
);

describe('consolidated training communication history', () => {
  it('recovers historical LMS alerts and invites per channel without duplicating compliance records', async () => {
    const result = await read();
    expect(result.has_more).toBe(false);
    expect(result.rows).toHaveLength(4);
    expect(result.rows.map((row) => row.id)).toEqual([
      'compliance:10', 'lms:10:WHATSAPP', 'lms:10:EMAIL', 'lms:11:EMAIL',
    ]);
    expect(result.rows.find((row) => row.id === 'lms:10:EMAIL')).toMatchObject({
      funcionario_id: 1000,
      qualificacao_nome: 'CRM - Gestores',
      origem: 'LMS_ALERTA',
      status_envio: 'enviada',
      destinatario: 'a***@example.com',
      destinatario_fonte: 'CADASTRO_ATUAL',
    });
    expect(result.rows.find((row) => row.id === 'lms:10:WHATSAPP')?.status_envio)
      .toBe('sem_contato');
    expect(result.rows[0].destinatario).toBe('p***@example.com');
    expect(result.rows[0].destinatario_fonte).toBe('REGISTRO_ENVIO');
  });


  it('shows completed manual EAD/CMA alerts in central history without duplicating bulk reservations', async () => {
    db.database.exec(
      "INSERT INTO notificacoes_log " +
      "(id,empresa_id,tipo,destinatario,assunto,corpo,notification_key,status,enviado_em,created_at) VALUES " +
      "(48,1,'WHATSAPP_COMPLIANCE','***3333'," +
      "'[COMPLIANCE_TREINAMENTO:RESERVA:TRAINING_ALERT:2026-11-04:1000:q:100:WHATSAPP]'," +
      "'{\"funcionario_id\":1000,\"qualificacao_tipo_id\":100,\"qualificacao_nome\":\"CMA sintetico\",\"origem\":\"COMPLIANCE\",\"manual\":true}'," +
      "'TRAINING_ALERT:2026-11-04:1000:q:100:WHATSAPP','enviada','2026-11-04 16:30:00','2026-11-04 16:30:00')",
    );
    const sent = await read({ origem: 'COMPLIANCE', resultado: 'enviada' });
    const manual = sent.rows.find((row) => row.id === 'compliance:48');
    expect(manual).toMatchObject({
      funcionario_id: 1000,
      qualificacao_tipo_id: 100,
      qualificacao_nome: 'CMA sintetico',
      origem: 'COMPLIANCE',
      tipo: 'WHATSAPP_COMPLIANCE',
      status_envio: 'enviada',
      destinatario: '***3333',
      destinatario_fonte: 'REGISTRO_ENVIO',
    });
    expect(sent.rows.some((row) => row.id === 'compliance:10')).toBe(true);
    const sameDay = await readSameDayTrainingAlerts(
      db.asD1(), 1, all, new Date('2026-11-04T19:30:00Z'),
    );
    expect(sameDay.wasSent({ funcionario_id: 1000, qualificacao_tipo_id: 100 }, 'WHATSAPP'))
      .toBe(true);
    const restricted = await read({ origem: 'COMPLIANCE' }, {
      mode: 'restricted', setorIds: [11], funcionarioId: null,
    });
    expect(restricted.rows.some((row) => row.id === 'compliance:48')).toBe(false);
  });

  it('counts delivery once and preserves only indeterminate reservation as a separate warning', async () => {
    db.database.exec(`
      INSERT INTO notificacoes_log(
        id,empresa_id,tipo,destinatario,assunto,corpo,notification_key,status,created_at
      ) VALUES
      (41,1,'EMAIL_COMPLIANCE','p***@example.com',
       '[COMPLIANCE_TREINAMENTO:RESERVA:sent]',
       '{"funcionario_id":1001,"qualificacao_tipo_id":100,"qualificacao_nome":"MGO"}',
       'TRAINING_ALERT:2026-11-04:1001:q:100:EMAIL','enviada','2026-11-04 15:00:00'),
      (42,1,'WHATSAPP_COMPLIANCE','***3333',
       '[COMPLIANCE_TREINAMENTO:RESERVA:pending]',
       '{"funcionario_id":1001,"qualificacao_tipo_id":100,"qualificacao_nome":"MGO"}',
       'TRAINING_ALERT:2026-11-04:1001:q:100:WHATSAPP','pendente','2026-11-04 15:01:00');
    `);
    const sent = await read({ resultado: 'enviada' });
    expect(sent.rows.filter((row) => row.origem === 'COMPLIANCE')).toHaveLength(1);
    expect(sent.rows.some((row) => row.id === 'compliance:41')).toBe(false);
    const pending = await read({ resultado: 'pendente' });
    expect(pending.rows.map((row) => row.id)).toEqual(['compliance:42']);
  });


  it('exposes only pending LMS reservation as a separate warning without inflating completed sends', async () => {
    db.database.exec(`
      INSERT INTO notificacoes_log (
        id, empresa_id, tipo, destinatario, assunto, corpo, notification_key,
        status, created_at
      ) VALUES (
        43, 1, 'LMS_MATRICULA_ALERTA_EMAIL', 'a***@example.com',
        '[LMS_MATRICULA_RESERVA:TRAINING_ALERT:2026-11-04:1000:q:100:EMAIL]',
        '{"funcionario_id":1000,"curso_id":30,"qualificacao_tipo_id":100,"origem":"LMS_ALERTA"}',
        'TRAINING_ALERT:2026-11-04:1000:q:100:EMAIL', 'pendente', '2026-11-04 15:01:00'
      ), (
        44, 1, 'LMS_MATRICULA_ALERTA_WHATSAPP', '***3333',
        '[LMS_MATRICULA_RESERVA:TRAINING_ALERT:2026-11-04:1000:q:100:WHATSAPP]',
        '{"funcionario_id":1000,"curso_id":30,"qualificacao_tipo_id":100,"origem":"LMS_ALERTA"}',
        'TRAINING_ALERT:2026-11-04:1000:q:100:WHATSAPP', 'enviada', '2026-11-04 15:02:00'
      );
    `);
    const pending = await read({
      resultado: 'pendente', origem: 'LMS_ALERTA', canal: 'EMAIL',
      inicio: '2026-11-04', fim: '2026-11-04',
    });
    expect(pending.rows).toHaveLength(1);
    expect(pending.rows[0]).toMatchObject({
      id: 'lms-reservation:43', funcionario_id: 1000, curso_id: 30,
      qualificacao_nome: 'CRM - Gestores', status_envio: 'pendente',
      origem: 'LMS_ALERTA', tipo: 'EMAIL', destinatario_fonte: 'REGISTRO_RESERVA',
      destinatario: 'a***@example.com',
    });
    const sent = await read({ resultado: 'enviada', origem: 'LMS_ALERTA' });
    expect(sent.rows.some((row) => row.id === 'lms-reservation:44')).toBe(false);
    const history = await readSameDayTrainingAlerts(
      db.asD1(), 1, all, new Date('2026-11-04T18:00:00Z'),
    );
    const target = { funcionario_id: 1000, qualificacao_tipo_id: 100, curso_id: 30 };
    expect(history.isPending(target, 'EMAIL')).toBe(true);
    const restricted = await read({ resultado: 'pendente' }, {
      mode: 'restricted', setorIds: [11], funcionarioId: null,
    });
    expect(restricted.rows).toHaveLength(0);
  });

  it('filters training, employee, source, channel, outcome, date and pages on the server', async () => {
    const result = await read({
      treinamento_q: 'gestores',
      funcionario_q: 'Antes',
      origem: 'LMS_ALERTA',
      canal: 'WHATSAPP',
      resultado: 'sem_contato',
      inicio: '2026-11-04',
      fim: '2026-11-04',
    });
    expect(result.rows.map((row) => row.id)).toEqual(['lms:10:WHATSAPP']);

    const first = await read({ limit: 2, offset: 0 });
    expect(first.rows).toHaveLength(2);
    expect(first.has_more).toBe(true);
    const second = await read({ limit: 2, offset: 2 });
    expect(second.rows).toHaveLength(2);
    expect(second.has_more).toBe(false);
    expect(first.rows.map((row) => row.id).filter((id) =>
      second.rows.some((other) => other.id === id))).toHaveLength(0);
  });

  it('never leaks other tenants or employee sectors and handles missing historical tables', async () => {
    const restricted = await read({}, {
      mode: 'restricted', setorIds: [11], funcionarioId: null,
    });
    expect(restricted.rows).toHaveLength(0);
    const empty = await listTrainingCommunications(
      db.asD1(), 1, all, { notifications: false, audit: false }, filters,
    );
    expect(empty).toEqual({ rows: [], has_more: false });
  });

  it('exibe tentativas preparadas ainda sem resultado e oculta as que já possuem audit final', async () => {
    db.database.exec(`
      INSERT INTO audit_logs(id,empresa_id,action,entity_type,new_values,created_at)
      VALUES
      (14,1,'LMS_MATRICULA_ALERTA_PREPARADO','lms_matriculas',
       '{"tentativa_id":"attempt-pending","funcionario_id":1000,"curso_id":30,"email_resultado":"PENDENTE"}',
       '2026-11-04 16:00:00'),
      (15,1,'LMS_MATRICULA_ALERTA_PREPARADO','lms_matriculas',
       '{"tentativa_id":"attempt-done","funcionario_id":1000,"curso_id":30,"email_resultado":"PENDENTE"}',
       '2026-11-04 17:00:00'),
      (16,1,'LMS_MATRICULA_ALERTA','lms_matriculas',
       '{"tentativa_id":"attempt-done","funcionario_id":1000,"curso_id":30,"email_resultado":"ENVIADO"}',
       '2026-11-04 17:01:00');
      UPDATE audit_logs SET entity_id = 900 WHERE id IN (14,15,16);
    `);
    const report = await read({ resultado: 'pendente' });
    expect(report.rows.map((row) => row.id)).toEqual(['lms:14:EMAIL']);
    expect(report.rows[0]).toMatchObject({ status_envio: 'pendente', origem: 'LMS_ALERTA' });
    const allRows = await read();
    expect(allRows.rows.some((row) => row.id === 'lms:15:EMAIL')).toBe(false);
    expect(allRows.rows.some((row) => row.id === 'lms:16:EMAIL')).toBe(true);
  });

  it('mantém deduplicação indexada com mil tentativas encerradas', async () => {
    for (const action of ['LMS_MATRICULA_ALERTA_PREPARADO', 'LMS_MATRICULA_ALERTA']) {
      db.database.exec(`
        WITH RECURSIVE seq(n) AS (
          SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 1000
        )
        INSERT INTO audit_logs(empresa_id,action,entity_type,entity_id,new_values,created_at)
        SELECT 1, '${action}', 'lms_matriculas', 10000+n,
          json_object('tentativa_id','volume-'||n,'funcionario_id',1000,
            'curso_id',30,'email_resultado','${action.endsWith('_PREPARADO') ? 'PENDENTE' : 'ENVIADO'}'),
          '2026-11-04 17:00:00'
        FROM seq
      `);
    }
    const calls: string[] = [];
    const original = db.asD1();
    const wrapper = {
      prepare: (sql: string) => {
        calls.push(sql);
        return original.prepare(sql);
      },
    } as unknown as D1Database;
    const result = await listTrainingCommunications(wrapper, 1, all,
      { notifications: false, audit: true }, { limit: 100, offset: 0 });
    expect(result.rows).toHaveLength(100);
    expect(result.rows.every((row) => row.status_envio === 'enviada')).toBe(true);
    const sql = calls.find((call) => call.includes('WITH communications AS')) || '';
    expect(sql).toContain('done.entity_id = a.entity_id');
    const plan = db.database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(1, 101, 0) as
      Array<{ detail: string }>;
    expect(plan.some((row) => row.detail.includes('SEARCH done USING INDEX idx_audit_logs_entity'))).toBe(true);
  });

it('bloqueia reenvio do dia quando há PREPARADO pendente; falha final não bloqueia', async () => {
    db.database.exec(`
      INSERT INTO audit_logs(id,empresa_id,action,entity_type,new_values,created_at)
      VALUES
      (20,1,'LMS_MATRICULA_ALERTA_PREPARADO','lms_matriculas',
       '{"tentativa_id":"pending-today","funcionario_id":1000,"curso_id":30,"email_resultado":"PENDENTE"}',
       '2026-11-05 18:00:00'),
      (21,1,'LMS_MATRICULA_ALERTA_PREPARADO','lms_matriculas',
       '{"tentativa_id":"failed-today","funcionario_id":1000,"curso_id":30,"whatsapp_resultado":"PENDENTE"}',
       '2026-11-05 18:01:00'),
      (22,1,'LMS_MATRICULA_ALERTA','lms_matriculas',
       '{"tentativa_id":"failed-today","funcionario_id":1000,"curso_id":30,"whatsapp_resultado":"FALHA"}',
       '2026-11-05 18:02:00');
      UPDATE audit_logs SET entity_id=900 WHERE id IN (20,21,22);
    `);
    const history = await readSameDayTrainingAlerts(
      db.asD1(), 1, all, new Date('2026-11-05T19:00:00Z'),
    );
    const identity = { funcionario_id: 1000, qualificacao_tipo_id: 100, curso_id: 30 };
    expect(history.wasSent(identity, 'EMAIL')).toBe(true);
    expect(history.wasSent(identity, 'WHATSAPP')).toBe(false);
    expect(history.wasSent({ ...identity, funcionario_id: 1001 }, 'EMAIL')).toBe(false);
    const pending = await read({ resultado: 'pendente', inicio: '2026-11-05' });
    expect(pending.rows.map((row) => row.id)).toEqual(['lms:20:EMAIL']);
  });

  it('masks contact values and does not invent a historical LMS destination', () => {
    expect(maskTrainingContact('someone@example.com')).toBe('s***@example.com');
    expect(maskTrainingContact('+55 (21) 99999-8888')).toBe('***8888');
    expect(maskTrainingContact(null)).toBe(null);
  });
});
