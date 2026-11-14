import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

vi.mock('../../middleware/auth', () => ({
  auth: () => async (c: {set(key:string,value:unknown):void},next:()=>Promise<void>) => {
    c.set('userId','7');
    c.set('userRole','admin');
    c.set('tenantContext',{
      empresaId:6,empresaCodigo:'COSTA',empresaNome:'Costa',
      role:'admin',plano:'pro',permissions:['sgso.write'],
    });
    await next();
  },
}));
vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
  normalizeTenantRole: (value:unknown) => String(value),
}));
import sgsoRoutes from '../../routes/sgso';

function fixture() {
  const db = new SqliteD1Database();
  db.database.exec(`
    CREATE TABLE sgso_protocolo_sequencia (
      empresa_id INTEGER NOT NULL, ano INTEGER NOT NULL,
      ultimo_numero INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(empresa_id, ano)
    );
    CREATE TABLE sgso_relatos (
      id TEXT PRIMARY KEY, empresa_id INTEGER, numero_protocolo TEXT,
      tipo TEXT, anonimo INTEGER, relator_id INTEGER,
      aeronave_id INTEGER, aeronave_matricula TEXT, aeronave_modelo TEXT,
      data_ocorrencia TEXT, local_icao TEXT, local_descricao TEXT,
      fase_voo TEXT, condicao_meteorologica TEXT, descricao TEXT,
      consequencia TEXT, accao_imediata TEXT, categoria_adrep TEXT,
      subcategoria_adrep TEXT, status TEXT, escala_id TEXT,
      escala_quinzena INTEGER, frms_jornada_id INTEGER,
      efetividade_cognitiva REAL, horas_acumuladas_7d REAL,
      horas_acumuladas_28d REAL, arquivo_url TEXT, arquivo_nome TEXT,
      created_by INTEGER, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE sgso_relatos_historico_status (
      relato_id TEXT REFERENCES sgso_relatos(id),
      empresa_id INTEGER, status_anterior TEXT, status_novo TEXT,
      motivo TEXT, alterado_por INTEGER, alterado_em TEXT
    );
  `);
  const app = new Hono<{ Bindings: Env; Variables: Record<string,unknown> }>();
  app.route('/api/sgso',sgsoRoutes);
  const submit = () => app.request(
    '/api/sgso/relatos',
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        tipo:'PERIGO',anonimo:true,data_ocorrencia:'2026-11-14',
        descricao:'Perigo de solo durante operação de helicóptero',
      }),
    },
    { DB:db.asD1() } as Env,
  );
  return {db,submit};
}

describe('F14-09 — SGSO legado cria relato e estado inicial na mesma transação', () => {
  it('histórico rejeitado reverte INSERT pai, inclusive escopo da empresa',async()=>{
    const {db,submit}=fixture();
    const batchSpy=vi.spyOn(db,'batch');
    try {
      db.database.exec(`
        CREATE TRIGGER reject_legacy_relato_status
        BEFORE INSERT ON sgso_relatos_historico_status
        BEGIN SELECT RAISE(ABORT, 'SGSO_STATUS_FAILED'); END
      `);
      const response=await submit();
      expect(response.status).toBe(500);
      const payload=await response.json() as {success:boolean};
      expect(payload.success).toBe(false);
      expect(batchSpy).toHaveBeenCalledTimes(1);
      expect(batchSpy.mock.calls[0][0]).toHaveLength(2);
      for (const table of ['sgso_relatos','sgso_relatos_historico_status']) {
        const count=db.database.prepare(`SELECT COUNT(*) AS total FROM ${table}`)
          .get() as {total:number};
        expect(count.total,table).toBe(0);
      }
    } finally { db.close(); }
  });

  it('o caminho válido cria pai e status ABERTO para a mesma empresa',async()=>{
    const {db,submit}=fixture();
    try {
      const response=await submit();
      expect(response.status).toBe(201);
      const result=await response.json() as {success:boolean;data:{id:string}};
      expect(result.success).toBe(true);
      const status=db.database.prepare(`
        SELECT r.id,r.empresa_id,r.status,s.status_novo
        FROM sgso_relatos r
        JOIN sgso_relatos_historico_status s
          ON s.relato_id=r.id AND s.empresa_id=r.empresa_id
      `).get() as Record<string,unknown> | undefined;
      expect(status).toMatchObject({
        id:result.data.id,empresa_id:6,status:'ABERTO',status_novo:'ABERTO',
      });
    } finally { db.close(); }
  });
});
