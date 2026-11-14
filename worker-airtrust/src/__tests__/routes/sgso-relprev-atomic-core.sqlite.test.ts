import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../../types';
import { SqliteD1Database } from '../helpers/qualification-history-sqlite-d1';

vi.mock('../../middleware/tenant', () => ({
  getEmpresaId: () => 6,
}));
import sgsoNextGen from '../../routes/sgso-next-gen';

function setup() {
  const db = new SqliteD1Database();
  db.database.exec(`
    CREATE TABLE sgso_protocolo_sequencia (
      empresa_id INTEGER NOT NULL, ano INTEGER NOT NULL, ultimo_numero INTEGER DEFAULT 0,
      PRIMARY KEY(empresa_id, ano)
    );
    CREATE TABLE sgso_relatos (
      id TEXT PRIMARY KEY, empresa_id INTEGER NOT NULL, numero_protocolo TEXT,
      tipo TEXT, anonimo INTEGER, relator_id INTEGER,
      aeronave_id INTEGER, aeronave_matricula TEXT, aeronave_modelo TEXT,
      data_ocorrencia TEXT, local_icao TEXT, local_descricao TEXT,
      fase_voo TEXT, condicao_meteorologica TEXT,
      descricao TEXT, consequencia TEXT, accao_imediata TEXT,
      categoria_adrep TEXT, status TEXT, arquivo_url TEXT, arquivo_nome TEXT,
      created_by INTEGER, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE sgso_relatos_historico_status (
      relato_id TEXT REFERENCES sgso_relatos(id), empresa_id INTEGER,
      status_anterior TEXT, status_novo TEXT, motivo TEXT,
      alterado_por INTEGER, alterado_em TEXT
    );
    CREATE TABLE sgso_relato_capturas (
      relato_id TEXT REFERENCES sgso_relatos(id), empresa_id INTEGER,
      client_submission_id TEXT, canal_origem TEXT, sync_status TEXT,
      sync_tentativas INTEGER, offline_capturado_em TEXT, sincronizado_em TEXT,
      o_que_resumo TEXT, onde_resumo TEXT, quando_resumo TEXT, timezone_offset_minutos INTEGER,
      dispositivo_id TEXT, dispositivo_tipo TEXT, app_versao TEXT,
      latitude REAL, longitude REAL, precisao_metros REAL,
      metadata_json TEXT, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE sgso_relato_privacidade (
      relato_id TEXT REFERENCES sgso_relatos(id), empresa_id INTEGER,
      modo_sigilo TEXT, consentimento_contato INTEGER, relator_ciphertext TEXT,
      relator_nonce TEXT, relator_hash_busca TEXT, contato_ciphertext TEXT,
      contato_nonce TEXT, chave_versao TEXT, politica_acesso_json TEXT,
      created_at TEXT, updated_at TEXT
    );
  `);
  const app = new Hono<{ Bindings: Env; Variables: Record<string, unknown> }>();
  app.use('*', async(c,next) => {
    c.set('userId', '7');
    c.set('tenantContext', {
      empresaId:6,role:'admin',empresaCodigo:'COSTA',empresaNome:'Costa',
      plano:'pro',permissions:['sgso.write'],
    } as never);
    await next();
  });
  app.route('/api/sgso/next',sgsoNextGen);
  const submit = () => app.request(
    '/api/sgso/next/relprev/submissoes',
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        client_submission_id:'F14-SGSO-123',
        tipo:'PERIGO',
        anonimo:true,
        data_ocorrencia:'2026-11-14',
        o_que:'Perigo real identificado no hangar',
        onde:'Hangar Rio',
        quando:'Durante turno',
        canal_origem:'WEB',
        privacidade:{modo_sigilo:'ANONIMIZADO',consentimento_contato:false},
      }),
    },
    {DB:db.asD1()} as Env,
  );
  return {db,submit};
}

const TABLES = [
  'sgso_relatos',
  'sgso_relatos_historico_status',
  'sgso_relato_capturas',
  'sgso_relato_privacidade',
] as const;

describe('F14-09 — RELPREV: as quatro tabelas essenciais são um commit atômico', () => {
  it.each(TABLES.slice(1))(
    'falha na tabela %s não deixa relato órfão nem vaza evidência',
    async (target) => {
      const {db,submit} = setup();
      const errorSpy = vi.spyOn(console,'error').mockImplementation(() => {});
      const batchSpy = vi.spyOn(db, 'batch');
      try {
        db.database.exec(`
          CREATE TRIGGER reject_sgso_core
          BEFORE INSERT ON ${target}
          BEGIN SELECT RAISE(ABORT, 'SIMULATED_SGSO_CORE_WRITE_FAILURE'); END
        `);
        const response = await submit();
        expect(response.status).toBe(500);
        const result = await response.json() as {success:boolean};
        expect(result.success).toBe(false);
        // Proves the failure occurred IN the transaction, not during
        // validation, protocol allocation or route initialization.
        expect(batchSpy).toHaveBeenCalledTimes(1);
        expect(batchSpy.mock.calls[0][0]).toHaveLength(4);
        const protocol = db.database.prepare(
          'SELECT ultimo_numero FROM sgso_protocolo_sequencia WHERE empresa_id=6',
        ).get() as { ultimo_numero:number } | undefined;
        expect(protocol?.ultimo_numero).toBe(1);
        for (const name of TABLES) {
          const row = db.database.prepare(`SELECT COUNT(*) AS total FROM ${name}`)
            .get() as {total:number};
          expect(row.total, name).toBe(0);
        }
      } finally {errorSpy.mockRestore();db.close();}
    },
  );
});
