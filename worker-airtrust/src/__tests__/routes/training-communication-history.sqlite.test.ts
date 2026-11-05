import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';
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
      new_values TEXT,
      created_at TEXT
    );
    CREATE TABLE notificacoes_log (
      id INTEGER PRIMARY KEY,
      empresa_id INTEGER NOT NULL,
      tipo TEXT, destinatario TEXT, assunto TEXT, corpo TEXT,
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
      destinatario: null,
    });
    expect(result.rows.find((row) => row.id === 'lms:10:WHATSAPP')?.status_envio)
      .toBe('sem_contato');
    expect(result.rows[0].destinatario).toBe('p***@example.com');
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

  it('masks contact values and does not invent a historical LMS destination', () => {
    expect(maskTrainingContact('someone@example.com')).toBe('s***@example.com');
    expect(maskTrainingContact('+55 (21) 99999-8888')).toBe('***8888');
    expect(maskTrainingContact(null)).toBe(null);
  });
});
