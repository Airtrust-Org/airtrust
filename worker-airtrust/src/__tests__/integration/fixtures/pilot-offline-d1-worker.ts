// Test-only Worker. The schema is a synthetic subset of the deployed contract;
// no migration files or remote bindings are used.
import { Hono } from 'hono';
import { auth } from '../../../middleware/auth';
import { tenantMiddleware } from '../../../middleware/tenant';
import { errorHandler } from '../../../middleware/error-handler';
import pilotOffline from '../../../routes/controle-voos-pilot-offline-core';
import type { Env } from '../../../types';

const schema = [
  `CREATE TABLE empresas (id INTEGER PRIMARY KEY, codigo TEXT, nome TEXT, plano TEXT, ativo INTEGER, deleted_at TEXT)`,
  `CREATE TABLE usuarios (id INTEGER PRIMARY KEY, perfil TEXT, funcionario_id INTEGER, deleted_at TEXT)`,
  `CREATE TABLE usuarios_empresas (usuario_id INTEGER, empresa_id INTEGER, role TEXT, is_primary INTEGER)`,
  `CREATE TABLE usuario_permissoes (usuario_id INTEGER, permissao TEXT, tipo TEXT)`,
  `CREATE TABLE token_blocklist (jti TEXT, expires_at TEXT)`,
  `CREATE TABLE cv_voos (id INTEGER PRIMARY KEY, empresa_id INTEGER, prefixo TEXT, data_programacao TEXT, origem_id INTEGER, destino_id INTEGER, numero_voo TEXT, numero_db TEXT, petrobras_equipamento TEXT, petrobras_atendimento TEXT, contrato_id INTEGER, tipo_voo_id INTEGER, natureza_voo_id INTEGER, aeronave_id INTEGER, horario_previsto_partida TEXT, horario_previsto_chegada TEXT, horario_real_partida TEXT, horario_real_chegada TEXT, status TEXT, observacoes TEXT, cancelado_motivo_id INTEGER, alternado_destino_id INTEGER, versao INTEGER, created_by INTEGER, updated_by INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)`,
  `CREATE TABLE cv_rdv_operacional (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, voo_id INTEGER NOT NULL, numero TEXT NOT NULL, data_voo TEXT NOT NULL, horario_decolagem_real TEXT, horario_pouso_real TEXT, horas_voadas REAL, numero_pousos INTEGER, ciclos INTEGER, combustivel_decolagem REAL, combustivel_pouso REAL, combustivel_consumo REAL, pob INTEGER, carga_kg REAL, ocorrencias TEXT, divergencias TEXT, status TEXT NOT NULL DEFAULT 'rascunho', responsavel_preenchimento_id INTEGER, preenchido_em TEXT, finalizado_operacionalmente_por INTEGER, finalizado_operacionalmente_em TEXT, workflow_status TEXT NOT NULL DEFAULT 'rascunho', versao INTEGER NOT NULL DEFAULT 1, enviado_por INTEGER, enviado_em TEXT, revisao_iniciada_por INTEGER, revisao_iniciada_em TEXT, devolvido_por INTEGER, devolvido_em TEXT, aprovado_coordenacao_por INTEGER, aprovado_coordenacao_em TEXT, finalizado_workflow_em TEXT, reaberto_por INTEGER, reaberto_em TEXT, motivo_devolucao TEXT, motivo_cancelamento TEXT, created_by INTEGER, updated_by INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)`,
  `CREATE UNIQUE INDEX fixture_active_rdv ON cv_rdv_operacional(empresa_id, voo_id) WHERE deleted_at IS NULL AND status <> 'cancelado'`,
  `CREATE TABLE cv_voo_etapas (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, voo_id INTEGER, numero_etapa INTEGER, sigvoos_leg_number INTEGER, origem_icao TEXT, destino_icao TEXT, horario_motor_ligado TEXT, horario_decolagem TEXT, horario_pouso TEXT, horario_motor_desligado TEXT, tempo_decolagem_pouso TEXT, tempo_total TEXT, tempo_navegacao TEXT, tempo_ifr TEXT, tempo_noturno TEXT, pousos_diurnos INTEGER, pousos_noturnos INTEGER, starts INTEGER, pax INTEGER, payload REAL, combustivel_inicio REAL, combustivel_fim REAL, unidade_combustivel TEXT, peso_passageiros REAL, peso_bagagem REAL, peso_tripulacao REAL, peso_vazio REAL, peso_total REAL, unidade_peso TEXT, observacoes TEXT, origem_dados TEXT, created_by INTEGER, updated_by INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)`,
  `CREATE UNIQUE INDEX fixture_active_stage ON cv_voo_etapas(empresa_id, voo_id, numero_etapa) WHERE deleted_at IS NULL`,
  `CREATE TABLE cv_voo_tripulantes (id INTEGER PRIMARY KEY, empresa_id INTEGER, voo_id INTEGER, funcionario_id INTEGER, deleted_at TEXT)`,
  `CREATE TABLE cv_voo_abastecimentos (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, voo_id INTEGER, etapa_id INTEGER, fornecedor TEXT, localidade TEXT, combustivel_solicitado REAL, unidade TEXT, combustivel_abastecido REAL, numero_ce TEXT, anexo_r2_key TEXT, responsavel_id INTEGER, data_hora TEXT, observacoes TEXT, client_local_id TEXT, supplier_code_at_acceptance TEXT, created_by INTEGER, updated_by INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT)`,
  `CREATE UNIQUE INDEX uq_cv_voo_abastecimentos_client_event ON cv_voo_abastecimentos (empresa_id, voo_id, client_local_id) WHERE client_local_id IS NOT NULL`,
  `CREATE TRIGGER fixture_supplier_immutable BEFORE UPDATE OF supplier_code_at_acceptance ON cv_voo_abastecimentos WHEN NEW.supplier_code_at_acceptance IS NOT OLD.supplier_code_at_acceptance BEGIN SELECT RAISE(ABORT, 'PILOT_FUELING_SUPPLIER_CODE_IMMUTABLE'); END`,
  `CREATE TABLE cv_empresas_abastecimento (id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, nome TEXT, ativo INTEGER, deleted_at TEXT)`,
  `CREATE TABLE cv_justificativas_voo (id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, ativo INTEGER, deleted_at TEXT)`,
  `CREATE TABLE cv_voo_justificativas (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, voo_id INTEGER, justificativa_id INTEGER, minutos INTEGER, observacao TEXT, created_by INTEGER, updated_by INTEGER, created_at TEXT, updated_at TEXT, deleted_at TEXT, UNIQUE(empresa_id, voo_id, justificativa_id))`,
  `CREATE TABLE cv_voo_eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER, voo_id INTEGER, tipo_evento TEXT, status_anterior TEXT, status_novo TEXT, descricao TEXT, motivo_id INTEGER, metadata_json TEXT, usuario_id INTEGER, created_by INTEGER, updated_by INTEGER, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE cv_offline_sync_receipts (id INTEGER PRIMARY KEY AUTOINCREMENT, empresa_id INTEGER NOT NULL, client_operation_id TEXT NOT NULL, voo_id INTEGER NOT NULL, usuario_id INTEGER NOT NULL, funcionario_id INTEGER, device_id TEXT NOT NULL, command_type TEXT NOT NULL, entity_type TEXT NOT NULL, canonical_entity_id TEXT, payload_hash TEXT NOT NULL, base_server_version INTEGER, server_entity_version INTEGER, result_status TEXT NOT NULL CHECK(result_status IN ('accepted','conflict','rejected_retriable','rejected_permanent')), result_code TEXT, result_json TEXT, received_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(empresa_id, client_operation_id))`,
];
const seed = [
  `INSERT INTO empresas VALUES (7,'test-a','Test A','test',1,NULL),(8,'test-b','Test B','test',1,NULL)`,
  `INSERT INTO usuarios VALUES (70,'ALUNO',77,NULL),(71,'ALUNO',78,NULL),(80,'ALUNO',88,NULL)`,
  `INSERT INTO usuarios_empresas VALUES (70,7,'student',1),(71,7,'student',1),(80,8,'student',1)`,
  `INSERT INTO cv_voos (id,empresa_id,prefixo,data_programacao,origem_id,destino_id,tipo_voo_id,natureza_voo_id,horario_previsto_partida,horario_previsto_chegada,status,versao,created_at,updated_at) VALUES (42,7,'PR-TST','2026-09-09',1,2,1,1,'2026-09-09T10:00:00Z','2026-09-09T11:00:00Z','planejado',6,'before','before')`,
  `INSERT INTO cv_rdv_operacional (id,empresa_id,voo_id,numero,data_voo,ocorrencias,status,workflow_status,versao,created_at,updated_at) VALUES (90,7,42,'RDV-TEST','2026-09-09','original','rascunho','rascunho',3,'before','before')`,
  `INSERT INTO cv_voo_etapas (id,empresa_id,voo_id,numero_etapa,origem_icao,destino_icao,pax,peso_vazio,origem_dados,created_at,updated_at) VALUES (10,7,42,1,'SBME','9PCP',1,9000,'MANUAL','before','revision-1')`,
  `INSERT INTO cv_voo_tripulantes VALUES (1,7,42,77,NULL),(2,7,42,78,NULL)`,
  `INSERT INTO cv_empresas_abastecimento VALUES (1,7,'TEST','Synthetic supplier',1,NULL),(2,7,'OTHER','Other supplier',1,NULL)`,
  `INSERT INTO cv_justificativas_voo VALUES (1,7,'TEST',1,NULL),(2,7,'OTHER',0,NULL)`,
  `INSERT INTO cv_voo_justificativas (empresa_id,voo_id,justificativa_id,minutos,observacao,created_at,updated_at) VALUES (7,42,1,5,'before','before','before')`,
];

const app = new Hono<{ Bindings: Env }>();
app.onError(errorHandler);
app.use('*', auth(), tenantMiddleware());
app.route('/', pilotOffline);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/__fixture/setup') {
      for (const sql of [...schema, ...seed]) await env.DB.prepare(sql).run();
      return Response.json({ ok: true });
    }
    if (url.pathname === '/__fixture/state') {
      const tables = ['cv_voos', 'cv_rdv_operacional', 'cv_voo_etapas', 'cv_voo_abastecimentos', 'cv_voo_justificativas', 'cv_voo_eventos', 'cv_offline_sync_receipts'];
      const state: Record<string, unknown> = {};
      for (const table of tables) state[table] = (await env.DB.prepare(`SELECT * FROM ${table} ORDER BY id`).all()).results;
      return Response.json(state);
    }
    if (url.pathname === '/__fixture/catalog') {
      const action = url.searchParams.get('action');
      const updates: Record<string, string> = {
        'rename-supplier': "UPDATE cv_empresas_abastecimento SET nome='Renamed supplier' WHERE empresa_id=7 AND codigo='TEST'",
        'disable-supplier': "UPDATE cv_empresas_abastecimento SET ativo=0 WHERE empresa_id=7 AND codigo='TEST'",
        'disable-justification': "UPDATE cv_justificativas_voo SET ativo=0 WHERE empresa_id=7 AND codigo='TEST'",
        'legacy-fueling': "UPDATE cv_voo_abastecimentos SET supplier_code_at_acceptance=NULL WHERE empresa_id=7 AND client_local_id='fuel-1'",
      };
      if (!action || !updates[action]) return Response.json({ error: 'unknown synthetic action' }, { status: 400 });
      await env.DB.prepare(updates[action]).run();
      return Response.json({ ok: true });
    }
    if (url.pathname === '/__fixture/no-rdv') {
      await env.DB.prepare('DELETE FROM cv_rdv_operacional WHERE id = 90').run();
      return Response.json({ ok: true });
    }
    if (url.pathname === '/__fixture/fail-stage') {
      await env.DB.prepare(`CREATE TRIGGER fixture_reject_stage BEFORE INSERT ON cv_voo_etapas BEGIN SELECT RAISE(ABORT, 'fixture stage failure'); END`).run();
      return Response.json({ ok: true });
    }
    const race = request.headers.get('X-Test-Race');
    if (race === 'rdv' || race === 'duplicate' || race === 'new-rdv') {
      // Commit an independent change exactly after preflight and before the
      // genuine D1 batch. All SQL still runs against the real local D1 engine.
      const db = env.DB;
      const originalEnv = env;
      const competingRequest = request.clone();
      env = { ...env, DB: new Proxy(db, { get(target, key) {
        if (key === 'batch') return async (statements: D1PreparedStatement[]) => {
          if (race === 'rdv') {
            await target.prepare(`UPDATE cv_rdv_operacional SET versao = 4, ocorrencias = 'coordination change' WHERE id = 90 AND empresa_id = 7`).run();
          } else if (race === 'new-rdv') {
            await target.prepare(`INSERT INTO cv_rdv_operacional (id,empresa_id,voo_id,numero,data_voo,ocorrencias,status,workflow_status,versao) VALUES (91,7,42,'OTHER','2026-09-09','coordination change','rascunho','rascunho',1)`).run();
          } else {
            const response = await app.fetch(competingRequest, originalEnv);
            if (response.status !== 200) throw new Error(`fixture competing request failed: ${response.status}`);
          }
          return target.batch(statements);
        };
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } }) };
    }
    const response = await app.fetch(request, env);
    // Hold the response after the real route has finished its D1 commit. The
    // client can disconnect while the committed state remains observable.
    if (request.headers.get('X-Test-Lose-Response') === '1') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return response;
  },
};
