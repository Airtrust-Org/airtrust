import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDemandaTreinamento } from '../../services/dashboardService';

type Sqlite = {
  exec(sql:string):void;
  prepare(sql:string):{
    all(...args:(number|string|null)[]):Record<string,unknown>[];
    get(...args:(number|string|null)[]):Record<string,unknown>|undefined;
  };
  close():void;
};
const DatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as
  new (file:string)=>Sqlite;

function setup() {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE simulador_agendamentos (
      id INTEGER PRIMARY KEY, empresa_id INTEGER, data TEXT, status TEXT,
      deleted_at TEXT, tipo_sessao TEXT, duracao_minutos INTEGER,
      simulador_id INTEGER, instrutor_id INTEGER
    );
    CREATE TABLE simuladores (id INTEGER PRIMARY KEY,nome TEXT,empresa_id INTEGER,deleted_at TEXT);
    CREATE TABLE funcionarios (id INTEGER PRIMARY KEY,nome TEXT,empresa_id INTEGER,deleted_at TEXT);
    INSERT INTO simuladores VALUES(10,'AW139',6,NULL),(20,'S76',6,NULL);
    INSERT INTO funcionarios VALUES(7,'Instrutor A',6,NULL),(8,'Instrutor B',6,NULL);
    INSERT INTO simulador_agendamentos VALUES
      (1,6,'2026-11-14','AGENDADO',NULL,'INICIAL',120,10,7),
      (2,6,'2026-11-15','AGENDADO',NULL,'PERIODICO',120,10,7),
      (3,6,'2027-02-13','AGENDADO',NULL,'TRANSICAO',60,20,8),
      (4,7,'2026-11-14','AGENDADO',NULL,'INICIAL',300,10,7),
      (5,6,'2026-11-14','CANCELADO',NULL,'INICIAL',180,10,7),
      (6,6,'2026-11-14','AGENDADO','2026-10-01','INICIAL',180,10,7);
  `);
  const logged:Array<{sql:string;binds:unknown[]}>= [];
  const db = {
    prepare:(sql:string)=>({
      bind:(...binds:(number|string|null)[])=>{
        logged.push({sql,binds});
        return {
          first:async()=>sqlite.prepare(sql).get(...binds)??null,
          all:async()=>({results:sqlite.prepare(sql).all(...binds)}),
        };
      },
    }),
  } as unknown as D1Database;
  return {sqlite,db,logged};
}
afterEach(()=>vi.useRealTimers());

describe('F14-07 — demanda de simulador usa data civil operacional SP nos 4 consumidores',()=>{
  it('às 23h30 BRT de 14/11 inclui treino do próprio dia e não antecipa horizonte de 90 dias',async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T02:30:00Z'));
    const {sqlite,db,logged}=setup();
    try {
      const demand=await getDemandaTreinamento(db,6);
      expect(demand.total).toBe(2);
      expect(demand.porPeriodo).toEqual({proximos30Dias:2,dias31a60:0,dias61a90:0});
      expect(demand.porTipo.inicial).toBe(1);
      expect(demand.porTipo.recorrente).toBe(1);
      expect(demand.porTipo.transicao).toBe(0);
      expect(demand.porSimulador.map(x=>[x.simuladorNome,x.quantidade])).toEqual([['AW139',2]]);
      expect(logged).toHaveLength(4);
      expect(logged.every(x=>x.binds[0]==='2026-11-14'&&x.binds[1]===6)).toBe(true);
    }finally{sqlite.close();}
  });

  it('às 00h30 BRT de 15/11 remove treino de ontem e inclui sessão no 90º dia',async()=>{
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T03:30:00Z'));
    const {sqlite,db,logged}=setup();
    try {
      const demand=await getDemandaTreinamento(db,6);
      expect(demand.total).toBe(2);
      expect(demand.porPeriodo).toEqual({proximos30Dias:1,dias31a60:0,dias61a90:1});
      expect(demand.porTipo.inicial).toBe(0);
      expect(demand.porTipo.recorrente).toBe(1);
      expect(demand.porTipo.transicao).toBe(1);
      expect(demand.porSimulador.map(x=>[x.simuladorNome,x.quantidade]))
        .toEqual([['AW139',1],['S76',1]]);
      expect(logged.every(x=>x.binds[0]==='2026-11-15'&&x.binds[1]===6)).toBe(true);
    }finally{sqlite.close();}
  });
});
