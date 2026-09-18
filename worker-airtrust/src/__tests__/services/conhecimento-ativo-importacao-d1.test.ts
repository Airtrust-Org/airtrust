import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { ConhecimentoImportRow } from '../../services/conhecimento-ativo/importacao';
import {
  buildImportPayloadChunks,
  estimateImportD1Queries,
  importacaoD1SqlForTests,
  type DecoratedImportRow,
} from '../../services/conhecimento-ativo/importacao-d1';

const NodeDatabaseSync = createRequire(import.meta.url)('node:sqlite').DatabaseSync as {
  new (location: string): DatabaseSync;
};

function makeRow(index: number): ConhecimentoImportRow {
  const suffix = String(index).padStart(3, '0');
  return {
    linha: index + 1,
    versaoTemplate: '1.0',
    aeronaveModelo: 'AW139',
    fonteTipo: 'RFM',
    fonteTitulo: 'AW139 Rotorcraft Flight Manual',
    fonteRevisao: 'Rev. 10',
    fonteDataRevisao: '2026-01-15',
    fonteSecao: '2',
    fontePagina: '2-' + suffix,
    fonteReferencia: 'Referência técnica ' + suffix,
    topicoCodigo: 'AW139-LIMITACOES',
    topicoNome: 'Limitações',
    itemCodigo: 'CA-AW139-LIM-' + suffix,
    itemTitulo: 'Item ' + suffix,
    itemConceito: 'Conceito técnico validado ' + suffix,
    itemResumoEssencial: 'Resumo ' + suffix,
    criticidade: 'ALTA',
    tempoEstudoSegundos: 60,
    questaoVariante: 'A',
    questaoTipo: 'MULTIPLA_ESCOLHA',
    questaoEnunciado: 'Questão ' + suffix + '?',
    questaoExplicacao: 'Explicação ' + suffix,
    questaoOQueGuardar: 'Guardar ' + suffix,
    dificuldade: 2,
    alternativas: [
      { letra: 'A', texto: 'Opção A ' + suffix, correta: false, ordem: 1 },
      { letra: 'B', texto: 'Opção B ' + suffix, correta: true, ordem: 2 },
      { letra: 'C', texto: 'Opção C ' + suffix, correta: false, ordem: 3 },
      { letra: 'D', texto: 'Opção D ' + suffix, correta: false, ordem: 4 },
    ],
  };
}

function decorate(row: ConhecimentoImportRow): DecoratedImportRow {
  return {
    ...row,
    sourceAction: 'INSERIDO',
    topicAction: 'INSERIDO',
    itemAction: 'INSERIDO',
    questionAction: 'INSERIDO',
  };
}

describe('Conhecimento Ativo — importação D1 em lotes', () => {
  it('mantém 500 questões muito abaixo do limite de 1000 consultas por invocação', () => {
    const rows = Array.from({ length: 500 }, (_, index) => decorate(makeRow(index + 1)));
    const payloads = buildImportPayloadChunks(rows);

    expect(payloads).toHaveLength(5);
    expect(payloads.every((payload) => Buffer.byteLength(payload, 'utf8') < 900_000)).toBe(true);
    expect(estimateImportD1Queries(rows)).toBe(42);
  });

  it('executa os SQLs set-based e preserva lineage em SQLite real', () => {
    const db = new NodeDatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON;');
    db.exec('CREATE TABLE usuarios(id INTEGER PRIMARY KEY);');
    db.exec(
      'CREATE TABLE funcionarios(' +
        'id INTEGER PRIMARY KEY, empresa_id INTEGER NOT NULL, deleted_at TEXT' +
      ');',
    );
    db.exec(readFileSync('migrations/0503_conhecimento_ativo_foundation.sql', 'utf8'));
    db.prepare('INSERT INTO usuarios(id) VALUES (?)').run(77);
    db.prepare(
      'INSERT INTO conhecimento_ativo_importacoes ' +
        '(empresa_id,arquivo_nome,arquivo_sha256,template_versao,status,total_linhas,criado_por_usuario_id) ' +
        "VALUES (6,'teste.xlsx','sha','1.0','APLICANDO',1,77)",
    ).run();

    const payload = JSON.stringify([decorate(makeRow(1))]);
    const sql = importacaoD1SqlForTests;

    db.prepare(sql.INSERT_SOURCES_SQL).run(payload, 6);
    db.prepare(sql.INSERT_TOPICS_SQL).run(payload, 6);
    db.prepare(sql.INSERT_ITEMS_SQL).run(payload, 6, 6);
    db.prepare(sql.INSERT_ITEM_SOURCES_SQL).run(payload, 6, 6, 6);
    db.prepare(sql.INSERT_QUESTIONS_SQL).run(payload, 6, 6);
    db.prepare(sql.INSERT_ALTERNATIVES_SQL).run(payload, 6, 6);
    db.prepare(sql.INSERT_LINEAGE_SQL).run(payload, 6, 6, 6, 6, 6, 6, 1);

    const count = (table: string): number => {
      const result = db.prepare('SELECT COUNT(*) AS total FROM ' + table).get() as {
        total: number;
      };
      return Number(result.total);
    };

    expect(count('conhecimento_ativo_fontes')).toBe(1);
    expect(count('conhecimento_ativo_topicos')).toBe(1);
    expect(count('conhecimento_ativo_itens')).toBe(1);
    expect(count('conhecimento_ativo_item_fontes')).toBe(1);
    expect(count('conhecimento_ativo_questoes')).toBe(1);
    expect(count('conhecimento_ativo_alternativas')).toBe(4);
    expect(count('conhecimento_ativo_importacao_registros')).toBe(8);

    const item = db
      .prepare('SELECT status FROM conhecimento_ativo_itens LIMIT 1')
      .get() as { status: string };
    const question = db
      .prepare('SELECT status FROM conhecimento_ativo_questoes LIMIT 1')
      .get() as { status: string };
    const source = db
      .prepare('SELECT status FROM conhecimento_ativo_fontes LIMIT 1')
      .get() as { status: string };

    expect(source.status).toBe('RASCUNHO');
    expect(item.status).toBe('EM_REVISAO');
    expect(question.status).toBe('EM_REVISAO');
  });
});
