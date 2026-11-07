import { createRequire } from 'node:module';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { marcarAlertaVisualizado, registrarTratamentoAlerta, marcarAlertaResolvido } from '../../lib/frms/db-service-alertas';
import { buildFrmsCaseTreatmentNotes, buildFrmsCaseResolutionNotes, readFrmsPendingTreatment } from '../../lib/frms/case-resolution';

// source_reference: #1426; QA tenant 999013; operational FRMS case service SQL.
// operational_decision: real D1 service SQL on disposable in-memory SQLite only.
// dry_run_required: no remote D1 or HTTP writes; no production credentials.
// rollback_plan_required: dispose DatabaseSync at test end.
const Db= createRequire(import.meta.url)('node:sqlite').DatabaseSync as {new(s:string):DatabaseSync};
const opened:DatabaseSync[]=[];
function fixture(){
  const sqlite=new Db(':memory:');opened.push(sqlite);
  sqlite.exec([
    'CREATE TABLE funcionarios(id INTEGER PRIMARY KEY,empresa_id INTEGER,deleted_at TEXT,ativo INTEGER DEFAULT 1,status TEXT DEFAULT "ATIVO")',
    'CREATE TABLE frms_alerta(id TEXT PRIMARY KEY,tripulante_id INTEGER,jornada_id TEXT,resolvido INTEGER DEFAULT 0,visualizado INTEGER DEFAULT 0,visualizado_em TEXT,visualizado_por TEXT,resolvido_em TEXT,resolvido_por TEXT,notas_resolucao TEXT,deleted_at TEXT,updated_at TEXT)',
    'CREATE TABLE auditoria_avancada_v2(tabela TEXT,acao TEXT,registro_id TEXT,dados_anteriores TEXT,dados_novos TEXT)',
    'INSERT INTO funcionarios(id,empresa_id) VALUES(101,999013),(201,999014)',
    "INSERT INTO frms_alerta(id,tripulante_id,jornada_id) VALUES('qa-frms-f0c-case',101,'qa-frms-f0c-journey'),('other-tenant-case',201,'other-journey')",
  ].join(';')+';');
  const d1={prepare(sql:string){return {bind(...args:unknown[]){
    return {async first<T>(){return (sqlite.prepare(sql).get(...args as [])??null) as T|null;},
      async run(){const r=sqlite.prepare(sql).run(...args as []);return {success:true,meta:{changes:Number(r.changes)}};}};
  }};}} as unknown as D1Database;
  const row=(id='qa-frms-f0c-case')=>sqlite.prepare('SELECT * FROM frms_alerta WHERE id=?').get(id) as Record<string,unknown>;
  const audit=(id='qa-frms-f0c-case')=>sqlite.prepare('SELECT acao FROM auditoria_avancada_v2 WHERE registro_id=? ORDER BY rowid').all(id) as Array<{acao:string}>;
  return {d1,row,audit};
}
afterEach(()=>{for(const db of opened.splice(0))db.close();});
const treatment={responsavel:'Coordenação QA FRMS',prazo:'2026-11-20',
  acao_mitigacao:'Reprogramar escala sintética e confirmar oportunidade de repouso.',
  justificativa:'Ensaio controlado da validação e do registro de mitigação.',
  evidencia_referencia:'QA-FRMS-F0C-SYNTHETIC'};
const efficacy='Validação sintética por conferência documental após a mitigação registrada.';

describe('FRMS F0C — full case lifecycle using real service SQL and isolated SQLite',()=>{
  it('records acknowledgement, treatment, efficacy and closure with audit entries',async()=>{
    const {d1,row,audit}=fixture();
    expect(await marcarAlertaVisualizado(d1,'qa-frms-f0c-case','QA_ACTOR',999013)).toBe(true);
    expect(row().visualizado).toBe(1);
    expect(row().resolvido).toBe(0);
    expect(audit().map(x=>x.acao)).toEqual(['VISUALIZADO']);
    const notes=buildFrmsCaseTreatmentNotes(treatment,'QA_ACTOR')!;
    expect(await registrarTratamentoAlerta(d1,'qa-frms-f0c-case','QA_ACTOR',notes,999013)).toBe(true);
    expect(row().resolvido).toBe(0);
    expect(readFrmsPendingTreatment(row().notas_resolucao)).toMatchObject(treatment);
    expect(audit().map(x=>x.acao)).toEqual(['VISUALIZADO','TRATAMENTO_REGISTRADO']);
    const pending=readFrmsPendingTreatment(row().notas_resolucao)!;
    const closure=buildFrmsCaseResolutionNotes({...pending,avaliacao_eficacia:efficacy},'QA_ACTOR')!;
    expect(await marcarAlertaResolvido(d1,'qa-frms-f0c-case','QA_ACTOR',closure,999013)).toBe(true);
    expect(row().resolvido).toBe(1);
    expect(row().resolvido_por).toBe('QA_ACTOR');
    expect(JSON.parse(String(row().notas_resolucao))).toMatchObject({
      schema:'FRMS_CASE_RESOLUTION_V1',avaliacao_eficacia:efficacy,responsavel:treatment.responsavel});
    expect(audit().map(x=>x.acao)).toEqual(['VISUALIZADO','TRATAMENTO_REGISTRADO','RESOLVIDO']);
    expect(await marcarAlertaResolvido(d1,'qa-frms-f0c-case','QA_ACTOR',closure,999013)).toBe(false);
    expect(await registrarTratamentoAlerta(d1,'qa-frms-f0c-case','QA_ACTOR',notes,999013)).toBe(false);
    expect(audit()).toHaveLength(3);
  });
  it('denies direct-ID cross-tenant write even with otherwise valid payload',async()=>{
    const {d1,row,audit}=fixture();
    const notes=buildFrmsCaseTreatmentNotes(treatment,'QA_ACTOR')!;
    const closure=buildFrmsCaseResolutionNotes({...treatment,avaliacao_eficacia:efficacy},'QA_ACTOR')!;
    expect(await marcarAlertaVisualizado(d1,'other-tenant-case','QA_ACTOR',999013)).toBe(false);
    expect(await registrarTratamentoAlerta(d1,'other-tenant-case','QA_ACTOR',notes,999013)).toBe(false);
    expect(await marcarAlertaResolvido(d1,'other-tenant-case','QA_ACTOR',closure,999013)).toBe(false);
    expect(row('other-tenant-case').resolvido).toBe(0);
    expect(row('other-tenant-case').notas_resolucao).toBeNull();
    expect(audit('other-tenant-case')).toHaveLength(0);
  });
  it('rejects missing treatment and undocumented effectiveness',()=>{
    fixture();
    expect(readFrmsPendingTreatment(null)).toBeNull();
    expect(readFrmsPendingTreatment('not-json')).toBeNull();
    expect(buildFrmsCaseResolutionNotes({...treatment,avaliacao_eficacia:'curta'},'QA_ACTOR')).toBeNull();
    expect(buildFrmsCaseTreatmentNotes({...treatment,responsavel:''},'QA_ACTOR')).toBeNull();
  });
});
