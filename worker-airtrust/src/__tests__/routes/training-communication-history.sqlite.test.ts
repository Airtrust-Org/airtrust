import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { employeeSectorSql } from '../../middleware/employee-sector-access';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
import { readSameDayTrainingAlerts } from '../../services/training-alert-same-day';
import {
  listTrainingCommunications,
  runCommunicationsQuery,
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
      usuario_id INTEGER,
      new_values TEXT,
      created_at TEXT
    );
    -- Mesmos indices relevantes de producao (migration 0332).
    CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX idx_audit_logs_empresa_usuario ON audit_logs(empresa_id, usuario_id);
    CREATE TABLE notificacoes_log (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      tipo TEXT, destinatario TEXT, assunto TEXT, corpo TEXT, notification_key TEXT,
      status TEXT, erro_mensagem TEXT, enviado_em TEXT, created_at TEXT
    );
    CREATE INDEX idx_notificacoes_log_empresa_assunto ON notificacoes_log(empresa_id, assunto);
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
    const sql = calls.find((call) => call.includes('communications AS (')) || '';
    expect(sql).toContain('audit_rel AS MATERIALIZED');
    const plan = db.database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(1, 101, 0) as
      Array<{ detail: string }>;
    // #2078: a leitura de audit_logs acontece uma unica vez, pelo indice de action,
    // sem varrer a tabela nem usar os indices por tenant/entidade (~24k linhas).
    const auditPlan = plan.filter((row) => /audit_logs|a0/.test(row.detail));
    expect(auditPlan.some((row) => row.detail.includes('idx_audit_logs_action'))).toBe(true);
    expect(plan.some((row) => /SCAN (a0|audit_logs)/.test(row.detail))).toBe(false);
    expect(plan.some((row) => row.detail.includes('idx_audit_logs_empresa_usuario'))).toBe(false);
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

  describe('caminho rapido top-N exato (#2078)', () => {
    const tables = { notifications: true, audit: true };
    function seedVolume() {
      db.database.exec(`
        WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 1500)
        INSERT INTO notificacoes_log(id,empresa_id,tipo,destinatario,assunto,corpo,status,enviado_em,created_at)
        SELECT 1000+n, CASE WHEN n % 11 = 0 THEN 2 ELSE 1 END,
               'EMAIL_COMPLIANCE','x@example.com',
               CASE WHEN n % 7 = 0 THEN '[OUTRO:1]' WHEN n % 5 = 0 THEN '[COMPLIANCE_GESTOR:1]' ELSE '[COMPLIANCE_TREINAMENTO:100]' END,
               CASE WHEN n % 9 = 0 THEN 'nao-json'
                    WHEN n % 13 = 0 THEN '{"funcionario_id":999999,"qualificacao_nome":"orfao"}'
                    ELSE '{"funcionario_id":' || (1000 + (n % 2)) || ',"qualificacao_tipo_id":100,"qualificacao_nome":"MGO"}' END,
               'enviada',
               CASE WHEN n % 17 = 0 THEN NULL ELSE datetime('2026-10-01 00:00:00', '+' || (n % 400) || ' minutes') END,
               datetime('2026-10-01 00:00:00', '+' || (n % 300) || ' minutes')
        FROM seq;
      `);
    }
    it('rapido e completo retornam exatamente as mesmas linhas e has_more', async () => {
      seedVolume();
      for (const [limit, offset] of [[50, 0], [50, 50], [30, 200], [100, 0]]) {
        const f = { limit, offset };
        const fast = await runCommunicationsQuery(db.asD1(), 1, all, tables, f, true);
        const full = await runCommunicationsQuery(db.asD1(), 1, all, tables, f, false);
        expect(fast).not.toBeNull();
        expect(fast).toEqual(full);
      }
    });
    it('quando a janela nao cobre a pagina, devolve null e a API cai na consulta completa', async () => {
      seedVolume();
      const f = { limit: 100, offset: 0, funcionario_q: 'nome-inexistente-xyz' };
      expect(await runCommunicationsQuery(db.asD1(), 1, all, tables, f, true)).toBeNull();
      const viaApi = await listTrainingCommunications(db.asD1(), 1, all, tables, f);
      const full = await runCommunicationsQuery(db.asD1(), 1, all, tables, f, false);
      expect(viaApi).toEqual(full);
    });
    it('isolamento: nunca devolve notificacao de outra empresa', async () => {
      seedVolume();
      const r = await listTrainingCommunications(db.asD1(), 2, all, tables, { limit: 50, offset: 0 });
      expect(r.rows.every((row) => row.funcionario_id >= 2000 || row.id.startsWith('lms:'))).toBe(true);
    });
  });

  describe('trilha de auditoria LMS: equivalencia com a consulta legada e plano (#2078)', () => {
    // Consulta anterior ao #2078 (subconsulta correlacionada sobre audit_logs inteiro),
    // mantida aqui apenas como oraculo de equivalencia.
    type Access = typeof all | { mode: 'restricted'; setorIds: number[]; funcionarioId: null };
    function legacyAuditRows(empresaId: number, access: Access, limit: number, offset: number) {
      const scope = employeeSectorSql(access as never, 'f');
      const sql = `WITH communications AS (
        SELECT 'lms:' || a.id || ':' || channel.canal AS id,
               f.id AS funcionario_id, f.nome AS funcionario_nome, NULL AS setor_nome,
               c.qualificacao_tipo_id AS qualificacao_tipo_id,
               CAST(json_extract(a.new_values, '$.curso_id') AS INTEGER) AS curso_id,
               COALESCE(json_extract(a.new_values, '$.curso_titulo'), c.titulo) AS qualificacao_nome,
               json_extract(a.new_values, '$.status_matricula') AS status_compliance,
               channel.canal AS tipo,
               CASE WHEN channel.canal = 'EMAIL' THEN
                   COALESCE(json_extract(a.new_values, '$.email_destinatario_mascarado'), f.email)
                 ELSE COALESCE(json_extract(a.new_values, '$.whatsapp_destinatario_mascarado'), f.telefone)
               END AS destinatario,
               CASE WHEN (channel.canal = 'EMAIL' AND json_extract(a.new_values, '$.email_destinatario_mascarado') IS NOT NULL)
                      OR (channel.canal = 'WHATSAPP' AND json_extract(a.new_values, '$.whatsapp_destinatario_mascarado') IS NOT NULL)
                 THEN 'REGISTRO_ENVIO' ELSE 'CADASTRO_ATUAL' END AS destinatario_fonte,
               CASE json_extract(a.new_values, channel.result_path)
                 WHEN 'ENVIADO' THEN 'enviada' WHEN 'FALHA' THEN 'erro' WHEN 'PENDENTE' THEN 'pendente'
                 WHEN 'SEM_EMAIL' THEN 'sem_contato' WHEN 'SEM_WHATSAPP' THEN 'sem_contato'
                 ELSE 'desconhecido' END AS status_envio,
               NULL AS erro, a.created_at AS enviado_em, 0 AS gestor,
               CASE WHEN a.action IN ('LMS_MATRICULA_ALERTA', 'LMS_MATRICULA_ALERTA_PREPARADO') THEN 'LMS_ALERTA'
                    ELSE 'LMS_CONVITE' END AS origem,
               f.setor_id AS setor_id, f.funcao_id AS funcao_id
          FROM audit_logs a
          JOIN funcionarios f ON f.empresa_id = a.empresa_id
            AND f.id = CAST(CASE WHEN json_valid(a.new_values) THEN json_extract(a.new_values, '$.funcionario_id') END AS INTEGER)
          LEFT JOIN lms_cursos c ON c.id = CAST(CASE WHEN json_valid(a.new_values)
            THEN json_extract(a.new_values, '$.curso_id') END AS INTEGER)
            AND c.empresa_id = a.empresa_id
          JOIN (SELECT 'EMAIL' AS canal, '$.email_resultado' AS result_path
                UNION ALL SELECT 'WHATSAPP', '$.whatsapp_resultado') channel
            ON json_extract(a.new_values, channel.result_path) IS NOT NULL
         WHERE a.empresa_id = ?
           AND a.action IN ('LMS_MATRICULA_ALERTA', 'LMS_MATRICULA_CONVITE_EMAIL',
                            'LMS_MATRICULA_ALERTA_PREPARADO', 'LMS_MATRICULA_CONVITE_EMAIL_PREPARADO')
           AND (a.action NOT LIKE '%_PREPARADO' OR NOT EXISTS (
             SELECT 1 FROM audit_logs done
              WHERE done.empresa_id = a.empresa_id
                AND done.action = REPLACE(a.action, '_PREPARADO', '')
                AND done.entity_type = a.entity_type
                AND done.entity_id = a.entity_id
                AND json_valid(done.new_values) = 1
                AND json_extract(done.new_values, '$.tentativa_id') = json_extract(a.new_values, '$.tentativa_id')))
           AND a.entity_type = 'lms_matriculas'
           AND json_valid(a.new_values) = 1
           AND ${scope.clause})
        SELECT * FROM communications WHERE funcionario_id > 0
         ORDER BY enviado_em DESC, id DESC LIMIT ? OFFSET ?`;
      const raw = db.database.prepare(sql).all(empresaId, ...scope.bindings, limit + 1, offset) as Array<Record<string, unknown>>;
      return {
        rows: raw.slice(0, limit).map((row) => ({
          ...row,
          gestor: Boolean(row.gestor),
          destinatario: maskTrainingContact((row.destinatario as string | null) ?? null),
        })),
        has_more: raw.length > limit,
      };
    }

    function seedAudit() {
      db.database.exec(`
        WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 900)
        INSERT INTO audit_logs(empresa_id,action,entity_type,entity_id,usuario_id,new_values,created_at)
        SELECT
          CASE WHEN n % 6 = 0 THEN 2 ELSE 1 END,
          CASE n % 5 WHEN 0 THEN 'LMS_MATRICULA_ALERTA_PREPARADO' WHEN 1 THEN 'LMS_MATRICULA_ALERTA'
                     WHEN 2 THEN 'LMS_MATRICULA_CONVITE_EMAIL_PREPARADO' WHEN 3 THEN 'LMS_MATRICULA_CONVITE_EMAIL'
                     ELSE 'OUTRA_ACAO' END,
          CASE WHEN n % 23 = 0 THEN 'outra_entidade' ELSE 'lms_matriculas' END,
          CASE WHEN n % 19 = 0 THEN NULL ELSE 5000 + (n / 5) END,
          n % 3,
          CASE
            WHEN n % 29 = 0 THEN 'nao-json'
            WHEN n % 31 = 0 THEN '{"funcionario_id":999999,"curso_id":30,"email_resultado":"ENVIADO"}'
            ELSE json_object(
              'tentativa_id', CASE WHEN n % 17 = 0 THEN NULL ELSE 't' || (n / 5) END,
              'funcionario_id', CASE n % 4 WHEN 0 THEN 1000 WHEN 1 THEN 1001 WHEN 2 THEN 1002 ELSE 2000 END,
              'curso_id', CASE WHEN n % 7 = 0 THEN 31 ELSE 30 END,
              'email_resultado', CASE n % 3 WHEN 0 THEN 'ENVIADO' WHEN 1 THEN 'PENDENTE' ELSE 'FALHA' END,
              'whatsapp_resultado', CASE WHEN n % 2 = 0 THEN 'SEM_WHATSAPP' END)
          END,
          datetime('2026-10-01 00:00:00', '+' || (n % 40) || ' minutes')
        FROM seq;
      `);
    }

    it('devolve exatamente as mesmas linhas, ordem e has_more que a consulta legada (empates, orfaos, JSON invalido, NULLs, 2 tenants, offsets profundos)', async () => {
      seedAudit();
      const accesses: Access[] = [all, { mode: 'restricted', setorIds: [10], funcionarioId: null }];
      for (const empresa of [1, 2]) {
        for (const access of accesses) {
          for (const [limit, offset] of [[25, 0], [100, 0], [40, 40], [200, 300], [50, 5000]]) {
            const expected = legacyAuditRows(empresa, access, limit, offset);
            const actual = await runCommunicationsQuery(
              db.asD1(), empresa, access, { notifications: false, audit: true }, { limit, offset }, false,
            );
            expect(actual).toEqual(expected);
          }
        }
      }
      // O oraculo precisa exercitar de fato a pagina (nao e comparacao de vazios).
      expect(legacyAuditRows(1, all, 100, 0).rows.length).toBeGreaterThan(50);
    });

    it('PREPARADO de outro tenant, outro entity_id ou outra entidade nao suprime nem e suprimido', async () => {
      db.database.exec(`
        INSERT INTO audit_logs(id,empresa_id,action,entity_type,entity_id,new_values,created_at) VALUES
        (50,1,'LMS_MATRICULA_ALERTA_PREPARADO','lms_matriculas',77,'{"tentativa_id":"x","funcionario_id":1000,"curso_id":30,"email_resultado":"PENDENTE"}','2026-11-06 10:00:00'),
        (51,2,'LMS_MATRICULA_ALERTA','lms_matriculas',77,'{"tentativa_id":"x","funcionario_id":2000,"curso_id":31,"email_resultado":"ENVIADO"}','2026-11-06 10:01:00'),
        (52,1,'LMS_MATRICULA_ALERTA','lms_matriculas',78,'{"tentativa_id":"x","funcionario_id":1000,"curso_id":30,"email_resultado":"ENVIADO"}','2026-11-06 10:02:00'),
        (53,1,'LMS_MATRICULA_CONVITE_EMAIL_PREPARADO','lms_matriculas',79,'{"tentativa_id":"y","funcionario_id":1000,"curso_id":30,"email_resultado":"PENDENTE"}','2026-11-06 10:03:00'),
        (54,1,'LMS_MATRICULA_CONVITE_EMAIL','outra_entidade',79,'{"tentativa_id":"y","funcionario_id":1000,"curso_id":30,"email_resultado":"ENVIADO"}','2026-11-06 10:04:00');
      `);
      const result = await runCommunicationsQuery(
        db.asD1(), 1, all, { notifications: false, audit: true }, { limit: 100, offset: 0 }, false,
      );
      const ids = result!.rows.map((row) => row.id);
      expect(ids).toContain('lms:50:EMAIL');
      expect(ids).toContain('lms:53:EMAIL');
      expect(ids).toContain('lms:52:EMAIL');
      expect(ids).not.toContain('lms:51:EMAIL');
      expect(ids).not.toContain('lms:54:EMAIL');
      expect(result).toEqual(legacyAuditRows(1, all, 100, 0));
    });

    it('plano completo (notificacoes + auditoria): sem varredura de tabela e uma unica leitura de audit_logs por action', async () => {
      seedAudit();
      const calls: string[] = [];
      const original = db.asD1();
      const wrapper = {
        prepare: (sql: string) => {
          calls.push(sql);
          return original.prepare(sql);
        },
      } as unknown as D1Database;
      for (const fast of [true, false]) {
        calls.length = 0;
        await runCommunicationsQuery(wrapper, 1, all, { notifications: true, audit: true }, { limit: 50, offset: 0 }, fast);
        const sql = calls.find((call) => call.includes('communications AS (')) || '';
        const binds = fast ? [1, 1, 1, 500, 500, 1, 51, 0] : [1, 1, 1, 1, 51, 0];
        const plan = db.database.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds) as Array<{ detail: string }>;
        const details = plan.map((row) => row.detail);
        const scans = details.filter((d) => /^SCAN (n0|notificacoes_log|a0|audit_logs|done)\b/.test(d));
        expect(scans).toEqual([]);
        expect(details.filter((d) => d.includes('idx_audit_logs_action'))).toHaveLength(1);
        expect(details.some((d) => d.includes('idx_audit_logs_empresa_usuario'))).toBe(false);
      }
    });
  });
});
