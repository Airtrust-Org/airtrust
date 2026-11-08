/**
 * P13-01: o D1 de producao limita a profundidade da arvore de expressao SQL a
 * 100 (o node:sqlite local aceita 1000), entao uma consulta que "passa" nos
 * testes pode falhar em producao com "Expression tree is too large (maximum
 * depth 100)" a cada execucao do cron. Estes testes preparam e EXECUTAM a
 * descoberta de renovacao EAD num SQLite com exprDepth = 100, igual ao D1.
 */
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import {
  buildQualificacoesEadRenovacaoResilienteQuery,
  EAD_RENEWAL_DISCOVERY_BATCH,
} from '../../cron/resilient/ead-renewal';
import {
  TRAINING_COMPLIANCE_AVSEC_SUPERSEDED_CTE,
  TRAINING_COMPLIANCE_OPERATIONAL_DATE_CTE,
  trainingComplianceEffectiveRequirementPredicateSql,
} from '../../services/training-compliance-rule-engine';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string, options?: { limits?: Record<string, number> }): DatabaseSync;
};

const D1_EXPR_DEPTH = 100;
// Folga para evolucao do predicado sem voltar a estourar o limite do D1.
const REQUIRED_HEADROOM_DEPTH = 80;
const TODAY = '2026-11-08';
const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});

const DDL = `
  CREATE TABLE funcionarios (
    id INTEGER PRIMARY KEY, empresa_id INTEGER, setor_id INTEGER, funcao_id INTEGER,
    aeronave TEXT, status TEXT, ativo INTEGER, deleted_at TEXT
  );
  CREATE TABLE qualificacoes_formatos (id INTEGER PRIMARY KEY, codigo TEXT, deleted_at TEXT);
  CREATE TABLE qualificacoes_tipos (
    id INTEGER PRIMARY KEY, empresa_id INTEGER, codigo TEXT, categoria TEXT, validade INTEGER,
    formato_id INTEGER, deleted_at TEXT
  );
  CREATE TABLE qualificacoes_historico (
    id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, qualificacao_id INTEGER,
    qualificacao_codigo TEXT, formato_id INTEGER, renovada INTEGER, validade_meses INTEGER,
    data_vencimento TEXT, data_conclusao TEXT, deleted_at TEXT
  );
  CREATE TABLE lms_cursos (
    id INTEGER PRIMARY KEY, empresa_id INTEGER, titulo TEXT, qualificacao_tipo_id INTEGER,
    ativo INTEGER, publicado INTEGER, deleted_at TEXT
  );
  CREATE TABLE treinamento_requisitos (
    id INTEGER PRIMARY KEY, empresa_id INTEGER, qualificacao_tipo_id INTEGER, escopo TEXT,
    setor_id INTEGER, funcao_id INTEGER, funcionario_id INTEGER, aeronave_modelo TEXT,
    condicao_id INTEGER, perfil_competencia TEXT, obrigatoriedade TEXT, auto_matricular_ead INTEGER,
    vigencia_inicio TEXT, vigencia_fim TEXT, ativo INTEGER, deleted_at TEXT
  );
  CREATE TABLE funcionarios_compliance_condicoes (
    id INTEGER PRIMARY KEY, empresa_id INTEGER, funcionario_id INTEGER, condicao_id INTEGER,
    data_inicio TEXT, data_fim TEXT, ativo INTEGER, deleted_at TEXT
  );
  CREATE TABLE aeronaves (id INTEGER PRIMARY KEY, empresa_id INTEGER, modelo TEXT, deleted_at TEXT);
  -- Producao: funcionarios_aeronaves NAO tem empresa_id.
  CREATE TABLE funcionarios_aeronaves (
    id INTEGER PRIMARY KEY, funcionario_id INTEGER, aeronave_id INTEGER, data_inicio TEXT,
    data_fim TEXT, ativo INTEGER, deleted_at TEXT
  );
`;

function database(exprDepth: number): DatabaseSync {
  const db = new NodeDatabaseSync(':memory:', { limits: { exprDepth } });
  opened.push(db);
  db.exec(DDL);
  return db;
}

/**
 * Tipos: 1 EAD generico; 2 AVSEC_CONSC (corporativo); 3 D1 (regra especial AVSEC).
 * Funcionarios (empresa 1): 101 setor 10, 102 setor 20, 103 setor 10 (regra auto=0),
 * 104 setor 10 tipo 1 com regra auto=1, 105 setor 10 com qualificacao ainda valida.
 * Empresa 2: 201 com regra propria (nao herda nem vaza regras da empresa 1).
 */
function seed(db: DatabaseSync) {
  db.exec(`
    INSERT INTO qualificacoes_formatos VALUES (1,'EAD',NULL);
    INSERT INTO qualificacoes_tipos VALUES
      (1,1,'EAD_GEN','EAD',12,1,NULL),
      (2,1,'AVSEC_CONSC','EAD',12,1,NULL),
      (3,1,'D1','EAD',12,1,NULL),
      (4,1,'EAD_MANUAL','EAD',12,1,NULL),
      (5,2,'EAD_GEN','EAD',12,1,NULL);
    INSERT INTO funcionarios VALUES
      (101,1,10,1,NULL,'ATIVO',1,NULL),(102,1,20,1,NULL,'ATIVO',1,NULL),
      (103,1,10,1,NULL,'ATIVO',1,NULL),(104,1,10,1,NULL,'ATIVO',1,NULL),(105,1,10,1,NULL,'ATIVO',1,NULL),
      (201,2,10,1,NULL,'ATIVO',1,NULL);
    INSERT INTO lms_cursos VALUES
      (1,1,'Curso EAD',1,1,1,NULL),(2,1,'Curso AVSEC',2,1,1,NULL),
      (4,1,'Curso Manual',4,1,1,NULL),(5,2,'Curso EAD t2',5,1,1,NULL);
    -- Regra geral: EMPRESA, obrigatoria, auto-matricula (tipo 1) -> 104 deve ser descoberto.
    INSERT INTO treinamento_requisitos VALUES
      (1,1,1,'EMPRESA',NULL,NULL,NULL,NULL,NULL,NULL,'OBRIGATORIA',1,NULL,NULL,1,NULL),
      -- Tipo 4: obrigatoria mas SEM auto-matricula -> nunca descoberto.
      (2,1,4,'EMPRESA',NULL,NULL,NULL,NULL,NULL,NULL,'OBRIGATORIA',0,NULL,NULL,1,NULL),
      -- AVSEC_CONSC corporativo (EMPRESA) com auto-matricula.
      (3,1,2,'EMPRESA',NULL,NULL,NULL,NULL,NULL,NULL,'OBRIGATORIA',1,NULL,NULL,1,NULL),
      -- Regra especial D1/AVSEC_ apenas para o setor 10: substitui o corporativo ali.
      (4,1,3,'SETOR',10,NULL,NULL,NULL,NULL,'AVSEC_OPERACIONAL','OBRIGATORIA',1,NULL,NULL,1,NULL),
      -- Mesma coisa para tenant 2: nao pode vazar para a empresa 1.
      (5,2,5,'EMPRESA',NULL,NULL,NULL,NULL,NULL,NULL,'OBRIGATORIA',1,NULL,NULL,1,NULL);
    INSERT INTO qualificacoes_historico VALUES
      (1001,1,104,1,'EAD_GEN',1,0,NULL,'2026-10-01',NULL,NULL),
      (1002,1,101,2,'AVSEC_CONSC',1,0,NULL,'2026-10-01',NULL,NULL),
      (1003,1,102,2,'AVSEC_CONSC',1,0,NULL,'2026-10-01',NULL,NULL),
      (1004,1,103,4,'EAD_MANUAL',1,0,NULL,'2026-10-01',NULL,NULL),
      (1005,2,201,5,'EAD_GEN',1,0,NULL,'2026-10-01',NULL,NULL),
      -- Ainda valida (vence depois de hoje): fora da janela de renovacao.
      (1006,1,105,1,'EAD_GEN',1,0,NULL,'2027-10-01',NULL,NULL);
  `);
}

function discover(db: DatabaseSync, cursor = 0) {
  return db
    .prepare(buildQualificacoesEadRenovacaoResilienteQuery())
    .all(TODAY, 0, cursor, EAD_RENEWAL_DISCOVERY_BATCH) as Array<{
    qualificacao_historico_id: number;
    funcionario_id: number;
    empresa_id: number;
  }>;
}

describe('P13-01 - descoberta de renovacao EAD respeita exprDepth=100 do D1', () => {
  it('o limite do SQLite local realmente e aplicado (guarda do proprio teste)', () => {
    const db = database(D1_EXPR_DEPTH);
    const deep = `SELECT ${Array.from({ length: 120 }, () => '1').join(' + ')}`;
    expect(() => db.prepare(deep)).toThrow(/too large|depth/i);
  });

  it('compila com folga de profundidade (nao so no limite)', () => {
    const db = database(REQUIRED_HEADROOM_DEPTH);
    expect(() => db.prepare(buildQualificacoesEadRenovacaoResilienteQuery())).not.toThrow();
  });

  it('executa com profundidade 100 e descobre apenas registros com requisito efetivo auto-matricula', () => {
    const db = database(D1_EXPR_DEPTH);
    seed(db);
    const ids = discover(db).map((row) => row.qualificacao_historico_id);
    // 1001: regra geral auto=1 -> descoberto. 1002: setor 10 tem regra D1/AVSEC_ que
    // substitui o corporativo -> fora. 1003: setor 20 sem regra especial -> corporativo vale.
    // 1004: regra obrigatoria sem auto-matricula -> fora. 1005 (outra empresa) tem regra
    // propria auto=1 -> descoberto, sem herdar nem vazar regras entre tenants.
    // 1006: ainda valida -> fora.
    expect(ids).toEqual([1001, 1003, 1005]);
  });

  it('respeita cursor keyset e tenant', () => {
    const db = database(D1_EXPR_DEPTH);
    seed(db);
    expect(discover(db, 1001).map((row) => row.qualificacao_historico_id)).toEqual([1003, 1005]);
    expect(discover(db, 1005)).toEqual([]);
  });

  it('o ramo por CTE e equivalente ao predicado inline (referencia, sem limite de profundidade)', () => {
    const reference = database(1000);
    seed(reference);
    const inline = trainingComplianceEffectiveRequirementPredicateSql({
      qualificationExpr: 'qt.id',
      empresaExpr: 'qh.empresa_id',
      requireAutoEnrollment: true,
    });
    const referenceIds = (
      reference
        .prepare(
          `WITH ${TRAINING_COMPLIANCE_OPERATIONAL_DATE_CTE}
           SELECT qh.id FROM qualificacoes_historico qh
             JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id
             JOIN funcionarios f ON f.id = qh.funcionario_id
            WHERE qh.data_vencimento <= ? AND ${inline} ORDER BY qh.id`,
        )
        .all(TODAY, TODAY) as Array<{ id: number }>
    ).map((row) => row.id);

    const limited = database(D1_EXPR_DEPTH);
    seed(limited);
    expect(discover(limited).map((row) => row.qualificacao_historico_id)).toEqual(referenceIds);
  });

  it('CTE de substituicao AVSEC compila isolada sob exprDepth=100', () => {
    const db = database(D1_EXPR_DEPTH);
    expect(() =>
      db.prepare(
        `WITH ${TRAINING_COMPLIANCE_OPERATIONAL_DATE_CTE}, ${TRAINING_COMPLIANCE_AVSEC_SUPERSEDED_CTE}
         SELECT empresa_id, funcionario_id FROM training_compliance_avsec_superseded`,
      ),
    ).not.toThrow();
  });
});
