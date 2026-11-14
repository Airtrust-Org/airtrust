import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (_c:unknown,next:()=>Promise<void>) => next(),
}));
vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));

import licencasRoutes from '../../routes/licencas';

function fixture() {
  const db = new SqliteD1Database();
  db.database.exec(`
    ALTER TABLE funcionarios ADD COLUMN matricula TEXT;
    CREATE TABLE licencas (
      id INTEGER PRIMARY KEY, funcionario_id INTEGER, empresa_id INTEGER,
      tipo TEXT, numero TEXT, data_emissao TEXT, data_vencimento TEXT,
      observacoes TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT
    );
    INSERT INTO funcionarios (id,empresa_id,nome,matricula)
      VALUES (6000,6,'Comandante teste','COM-6'),(7000,7,'Outro tenant','COM-7');
    INSERT INTO licencas VALUES
      (1,6000,6,'CMA','A','2025-01-01','2026-11-13',NULL,NULL,NULL,NULL),
      (2,6000,6,'CMA','B','2025-01-01','2026-11-14',NULL,NULL,NULL,NULL),
      (3,6000,6,'CMA','C','2025-01-01','2026-11-15',NULL,NULL,NULL,NULL),
      (4,6000,6,'CMA','D','2025-01-01','2027-02-01',NULL,NULL,NULL,NULL),
      (5,7000,7,'CMA','E','2025-01-01','2026-11-13',NULL,NULL,NULL,NULL),
      (6,6000,6,'CMA','F','2025-01-01','2026-11-13',NULL,NULL,NULL,'2026-11-01'),
      (7,6000,6,'CMA','G','2025-01-01','2026-12-16',NULL,NULL,NULL,NULL);
  `);
  const app = new Hono<{Bindings:Env}>();
  app.route('/api/licencas', licencasRoutes);
  const fetchList = async (status:string) => {
    const response = await app.request(
      '/api/licencas?status='+status,{}, {DB:db.asD1()} as Env,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as {success:boolean;data:Array<{id:number}>};
    expect(body.success).toBe(true);
    return body.data.map(x=>x.id);
  };
  const fetchDashboard = async () => {
    const response = await app.request('/api/licencas/dashboard/licencas',{}, {DB:db.asD1()} as Env);
    expect(response.status).toBe(200);
    const body = await response.json() as {
      success:boolean;
      data:{total_ativas:number;vencidas:number;a_vencer_60_dias:number;validas:number};
    };
    return body.data;
  };
  return {db,fetchList,fetchDashboard};
}

afterEach(() => vi.useRealTimers());

describe('F14-07 — licença vence por data civil de São Paulo, sem antecipar pelo UTC', () => {
  it('às 23h30 BRT o vencimento de hoje permanece vigente até a meia-noite brasileira',async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T02:30:00Z'));
    const {db,fetchList,fetchDashboard}=fixture();
    try {
      expect(await fetchList('vencida')).toEqual([1]);
      expect(await fetchList('a_vencer')).toEqual([2,3]);
      expect(await fetchList('valida')).toEqual([7,4]);
      expect(await fetchDashboard()).toEqual(expect.objectContaining({
        total_ativas:5,vencidas:1,a_vencer_60_dias:3,validas:1,
      }));
    } finally {db.close();}
  });

  it('às 00h30 BRT o vencimento do dia anterior passa a vencido nas duas telas',async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T03:30:00Z'));
    const {db,fetchList,fetchDashboard}=fixture();
    try {
      expect(await fetchList('vencida')).toEqual([1,2]);
      expect(await fetchList('a_vencer')).toEqual([3]);
      expect(await fetchList('valida')).toEqual([7,4]);
      expect(await fetchDashboard()).toEqual(expect.objectContaining({
        total_ativas:5,vencidas:2,a_vencer_60_dias:2,validas:1,
      }));
    } finally {db.close();}
  });
});
