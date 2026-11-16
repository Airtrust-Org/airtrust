import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cvRecords: unknown[] = [];
vi.mock('../../lib/frms/controle-voos-source', () => ({
  fetchControleVoosOperationalRecords: vi.fn(async (_db: unknown, empresaId: number) =>
    cvRecords.filter((record) => (record as { empresaId: number }).empresaId === empresaId)),
}));
vi.mock('../../middleware/auth', () => ({ auth: () => async (_c: unknown, next: () => Promise<void>) => next() }));
// Tenant e papel vêm de cabeçalhos do teste; a autorização real depende de RBAC em D1 e já tem testes próprios.
vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: (c: { req: { header: (name: string) => string | undefined } }) => Number(c.req.header('x-empresa') ?? 7),
}));
vi.mock('../../middleware/frms-access', () => ({
  canSeeFrmsTeamScopeForContext: vi.fn(async (c: { get: (key: string) => unknown }) =>
    ['manager', 'admin'].includes(String(c.get('userRole')))),
}));
vi.mock('../../middleware/employee-sector-access', () => ({
  getEmployeeSectorAccess: vi.fn(async () => ({ mode: 'all' })),
  buildFuncionarioScopeWhere: vi.fn(() => ({ clause: '1=1', bindings: [] })),
}));

import router from '../../routes/frms-fadiga-checkin-legacy';
import { createCheckinObligationFixture, sqliteAsD1, type Sqlite } from '../frms/helpers/checkin-obligation-fixture';

/**
 * Escalas -> EVD -> FRMS -> API do dia, por HTTP, com a rota REAL e SQL real sobre SQLite.
 * Cobre alterações retroativas, folga, férias, voo cancelado, atividade em dia de ausência,
 * check-in feito antes da correção da escala, e papéis diferentes (gestor, tripulante, visualizador).
 */
let sqlite: Sqlite;
beforeEach(() => { sqlite = createCheckinObligationFixture(); });
afterEach(() => { sqlite.close(); cvRecords.length = 0; });

type Item = Record<string, any>;
const call = async (path: string, headers: Record<string, string>) => {
  const app = new Hono();
  app.use('*', async (c, next) => {
    c.set('userRole' as never, (headers['x-role'] ?? 'viewer') as never);
    c.set('userId' as never, 1 as never);
    if (headers['x-funcionario']) c.set('funcionarioId' as never, Number(headers['x-funcionario']) as never);
    await next();
  });
  app.route('/', router);
  const response = await app.request(`http://localhost${path}`, { headers }, { DB: sqliteAsD1(sqlite) } as never);
  return { status: response.status, body: await response.json() as { success: boolean; data: any; error?: string } };
};
const manager = { 'x-role': 'manager', 'x-empresa': '7' };
const crew = (id: number, role = 'crew') => ({ 'x-role': role, 'x-empresa': '7', 'x-funcionario': String(id) });
const team = async (date: string, headers = manager) => (await call(`/daily-fatigue?date=${date}&scope=team`, headers)).body.data.items as Item[];
const self = async (id: number, date: string) => (await call(`/daily-fatigue?date=${date}`, crew(id))).body.data as Item;
const find = (items: Item[], id: number) => items.find((item) => item.funcionario_id === id);

describe('obrigação diária de check-in por HTTP (rota real, SQLite real)', () => {
  it('voo da EVD: pendente; cancelado retroativamente: dispensa o tripulante; check-in anterior preserva a evidência', async () => {
    // 106 não tem quinzena-base; só a EVD PUBLICADA de 06/11 o coloca no dia.
    expect(find(await team('2026-11-06'), 106)).toMatchObject({
      status: 'not_submitted', checkin_obrigacao: { status: 'PENDENTE', base: 'VOO_PROGRAMADO' } });
    expect(await self(106, '2026-11-06')).toMatchObject({
      status: 'not_submitted', requires_operational_review: true, checkin_obrigacao: { status: 'PENDENTE' } });

    // Alteração retroativa da escala: voo cancelado depois da publicação.
    sqlite.exec("UPDATE escala_voo_diaria SET status = 'CANCELADA' WHERE id = 'v-pub'");
    expect(find(await team('2026-11-06'), 106)).toBeUndefined();
    const afterCancel = await self(106, '2026-11-06');
    expect(afterCancel).toMatchObject({ status: 'no_duty', requires_operational_review: false });
    expect(afterCancel.message).toMatch(/não exigido/i);

    // Voo volta, o tripulante envia o check-in, e só então a escala é corrigida: evidência preservada.
    sqlite.exec("UPDATE escala_voo_diaria SET status = 'PUBLICADA' WHERE id = 'v-pub'");
    sqlite.exec("INSERT INTO frms_fadiga_checkin (id, empresa_id, funcionario_id, data_checkin, kss_score, fit_for_duty) VALUES ('c106', 7, 106, '2026-11-06', 3, 1)");
    sqlite.exec("UPDATE escala_voo_diaria SET status = 'CANCELADA' WHERE id = 'v-pub'");
    const kept = find(await team('2026-11-06'), 106);
    expect(kept?.checkin_id).toBe('c106');
    expect(kept?.checkin_obrigacao).toMatchObject({ status: 'RECEBIDO', exigivel: false });
    expect(kept?.status).not.toBe('not_submitted');
  });

  it('férias dispensam; voo na EVD durante férias volta a exigir e sinaliza divergência', async () => {
    const vacation = find(await team('2026-11-05'), 104);
    expect(vacation).toMatchObject({ status: 'no_duty', checkin_obrigacao: { status: 'DISPENSADO', base: 'AUSENCIA_PROGRAMADA' } });
    const own = await self(104, '2026-11-05');
    expect(own).toMatchObject({ status: 'no_duty', requires_operational_review: false });

    sqlite.exec("INSERT INTO escala_voo_diaria (id, empresa_id, data, pic_id, status) VALUES ('v-ferias', 7, '2026-11-05', 104, 'PUBLICADA')");
    expect(find(await team('2026-11-05'), 104)?.checkin_obrigacao).toMatchObject({
      status: 'PENDENTE', base: 'VOO_PROGRAMADO', divergencias: ['VOO_PROGRAMADO_EM_AUSENCIA'] });
  });

  it('quinzena quebrada: dias da lacuna sem obrigação; atividade lançada na lacuna exige só aquele dia', async () => {
    const gapDay = find(await team('2026-11-07'), 103);
    expect(gapDay?.status).toBe('no_duty');
    expect(gapDay?.checkin_obrigacao).toMatchObject({ status: 'NAO_APLICAVEL', exigivel: false });
    expect(find(await team('2026-11-12'), 103)?.checkin_obrigacao).toMatchObject({ status: 'PENDENTE', base: 'ALOCACAO_OPERACIONAL' });

    sqlite.exec("INSERT INTO simulador_agendamentos (id, empresa_id, data, status, nome, funcionario_id) VALUES (950, 7, '2026-11-07', 'CONCLUIDO', 'Simulador na lacuna', 103)");
    expect(find(await team('2026-11-07'), 103)?.checkin_obrigacao).toMatchObject({ status: 'PENDENTE', base: 'ATIVIDADE_REGISTRADA' });
    expect(find(await team('2026-11-08'), 103)?.checkin_obrigacao).toMatchObject({ status: 'NAO_APLICAVEL' });
  });

  it('voo do Controle de Voos sem EVD nem jornada exige check-in (integração CV -> FRMS)', async () => {
    cvRecords.push({
      empresaId: 7, identificadorInterno: 'cv-1', identificadorExterno: null, identificadorExternoTripulante: null,
      origem: 'CONTROLE_VOOS', origemDados: 'manual_interno', tripulanteId: 116, funcao: 'PIC',
      horaApresentacao: '06:30', horaDispensa: '12:00', horaMotorLigado: '07:00', horaDecolagem: '07:10',
      horaPouso: '11:00', horaMotorDesligado: '11:10', timezone: null, timezoneFonte: 'INDISPONIVEL',
      vooId: 1, etapaId: 1, aeronaveIdentificador: null, origemIcao: null, destinoIcao: null,
      minutosVoo: 230, minutosTotal: 240, cancelado: false, statusOperacional: 'CONFIRMADO', qualidadeDado: 'ok',
      dataOperacional: '2026-11-27',
    });
    // Sem obrigação o tripulante nem entra na lista; com a atividade do CV, entra como pendente.
    expect(find(await team('2026-11-27'), 116)?.checkin_obrigacao).toMatchObject({ status: 'PENDENTE', base: 'ATIVIDADE_REGISTRADA' });
    expect((await self(116, '2026-11-27')).status).toBe('not_submitted');
    cvRecords.length = 0;
    expect((await self(116, '2026-11-27')).status).toBe('no_duty');
  });

  it('quinzena-base sem escala publicada é "escala a confirmar", não pendência', async () => {
    const base = find(await team('2026-11-05'), 109);
    expect(base).toMatchObject({ status: 'no_duty', checkin_obrigacao: { status: 'INDETERMINADO', base: 'QUINZENA_BASE_SEM_ESCALA' } });
    expect(base?.status_label).toMatch(/confirmar/i);
    expect((await self(109, '2026-11-05')).message).toMatch(/confirme a escala/i);
  });

  it('papéis: gestor vê a equipe; tripulante e visualizador só veem o próprio dia; outra empresa não vaza', async () => {
    const managerItems = await team('2026-11-05');
    expect(managerItems.length).toBeGreaterThan(5);
    expect(managerItems.map((item) => item.funcionario_id)).not.toContain(801);
    expect(managerItems.map((item) => item.funcionario_id)).not.toContain(114);

    // scope=team sem permissão cai no escopo individual: só o próprio tripulante, nunca a equipe.
    for (const role of ['crew', 'viewer']) {
      const response = await call('/daily-fatigue?date=2026-11-05&scope=team', crew(101, role));
      expect(response.status).toBe(200);
      expect(response.body.data.items).toBeUndefined();
      expect(response.body.data).toMatchObject({ funcionario_id: 101, checkin_obrigacao: { status: 'PENDENTE' } });
    }
    // Sem vínculo com tripulante, não há dado algum.
    const orphan = await call('/daily-fatigue?date=2026-11-05&scope=team', { 'x-role': 'viewer', 'x-empresa': '7' });
    expect(orphan.status).toBe(404);

    // Gestor de outra empresa nunca enxerga a equipe da empresa 7.
    const otherTenant = await team('2026-11-05', { 'x-role': 'manager', 'x-empresa': '8' });
    expect(otherTenant.map((item) => item.funcionario_id)).toEqual([801]);
    expect(otherTenant[0].checkin_obrigacao).toMatchObject({ status: 'PENDENTE' });
  });
});
