import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Contrato de regressão para o incidente de staging de 2026-07-21: a rota
 * `GET /voos/:id/rdv/relatorio-petrobras` fazia
 * `SELECT razao_social, nome_fantasia FROM empresas` e retornava 500
 * (`SQLITE_ERROR: no such column: nome_fantasia`) em staging E produção.
 *
 * `nome_fantasia` é definida em `migrations/0150_multi_tenant_empresas.sql`,
 * mas o schema real das bases (staging `airtrust-db-staging-baseline-20260701`
 * e produção `airtrust-db`) seguiu a definição concorrente de
 * `migrations/0161_multi_tenant_empresas.sql` (que não tem essa coluna) —
 * confirmado empiricamente via `PRAGMA table_info(empresas)` remoto contra os
 * dois ambientes em 2026-07-21. Os testes de rota do RDV mascararam o bug
 * porque criavam seu próprio schema sintético local de `empresas` incluindo
 * `nome_fantasia`.
 *
 * Este teste não substitui uma reconstrução completa da cadeia de migrations
 * (documentada como quebrada por dívida técnica pré-existente — ver
 * docs internos sobre o incidente de rebuild de staging de 2026-07-01).
 * Em vez disso, mantém uma lista de colunas CONFIRMADAS reais via
 * introspecção remota, e falha se qualquer query do RDV referenciar uma
 * coluna de `empresas` fora dessa lista.
 */

// Capturado via `wrangler d1 execute ... --command="PRAGMA table_info(empresas)"`
// contra airtrust-db-staging-baseline-20260701 E airtrust-db (produção) em
// 2026-07-21. Deliberadamente NÃO inclui `nome_fantasia`.
const EMPRESAS_CONFIRMED_REAL_COLUMNS = new Set([
  'id',
  'nome',
  'razao_social',
  'cnpj',
  'logo_url',
  'logo_hash',
  'assinatura_diretor_url',
  'assinatura_diretor_hash',
  'assinatura_diretor_nome',
  'telefone',
  'email',
  'endereco',
  'ativo',
  'created_at',
  'updated_at',
  'deleted_at',
  'codigo',
  'plano',
  'max_funcionarios',
  'max_storage_mb',
  'dominio',
]);

const RDV_SOURCE_FILES = [
  '../../routes/controle-voos.ts',
  '../../routes/controle-voos-rdv-workflow.ts',
  '../../routes/controle-voos-rdv-etapas.ts',
  '../../services/controle-voos/rdv-workflow.ts',
  '../../services/controle-voos/rdv-pdf.ts',
  '../../services/controle-voos/rdv-alertas.ts',
  '../../services/controle-voos/rdv-etapas.ts',
  '../../repositories/controle-voos/rdv-repository.ts',
];

function readSource(relativePath: string): string {
  const testDir = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(testDir, relativePath), 'utf8');
}

/**
 * Remove comentários de bloco `/* ... *\/`, de linha `//` e de linha SQL
 * `--` antes de procurar por `nome_fantasia` — o objetivo é detectar o
 * padrão de bug (a coluna citada em SQL/DDL real), não a prosa explicativa
 * deste próprio hotfix, que cita o nome da coluna em comentários.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const sqlCommentIdx = line.indexOf('--');
      const jsCommentIdx = line.indexOf('//');
      const idx = [sqlCommentIdx, jsCommentIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0];
      return idx === undefined ? line : line.slice(0, idx);
    })
    .join('\n');
}

/**
 * Extrai os nomes de coluna de um `SELECT <cols> FROM empresas` simples
 * (sem JOIN, sem alias de tabela) — é exatamente o padrão usado hoje pelas
 * queries do RDV que tocam `empresas` diretamente. Não tenta ser um parser
 * SQL genérico; propositalmente estreito ao padrão real do código.
 */
function extractSelectedEmpresasColumns(source: string): string[] {
  const found: string[] = [];
  // O grupo de captura recusa cruzar outro `FROM` — sem isso, um `SELECT`
  // não relacionado mais cedo no arquivo (ex.: `FROM cv_voos v`) casaria
  // preguiçosamente até o próximo `FROM empresas` real, absorvendo colunas
  // de outra tabela como se fossem de `empresas`.
  const selectFromEmpresas = /SELECT\s+((?:(?!\bFROM\b)[\s\S])*?)\s+FROM\s+empresas\b(?!\s*\.)/gi;
  let match: RegExpExecArray | null;
  while ((match = selectFromEmpresas.exec(source))) {
    const columnList = match[1];
    for (const rawCol of columnList.split(',')) {
      const col = rawCol.trim().split(/\s+AS\s+/i)[0].trim();
      if (col === '*') continue;
      found.push(col);
    }
  }
  return found;
}

describe('contrato: queries de empresas do RDV usam apenas colunas reais confirmadas', () => {
  for (const file of RDV_SOURCE_FILES) {
    it(`${file} não referencia coluna inexistente de 'empresas'`, () => {
      const source = readSource(file);
      const columns = extractSelectedEmpresasColumns(source);
      for (const column of columns) {
        expect(
          EMPRESAS_CONFIRMED_REAL_COLUMNS.has(column),
          `Coluna '${column}' referenciada em ${file} não está na lista de colunas reais confirmadas de 'empresas'. ` +
            `Se a coluna foi adicionada de verdade ao schema real (nova migration aditiva), atualize ` +
            `EMPRESAS_CONFIRMED_REAL_COLUMNS neste teste. Se não, a query vai quebrar em staging/produção.`,
        ).toBe(true);
      }
    });
  }

  it('nenhum arquivo de rota/serviço/repositório do RDV referencia nome_fantasia', () => {
    for (const file of RDV_SOURCE_FILES) {
      const source = readSource(file);
      expect(
        stripComments(source).includes('nome_fantasia'),
        `${file} referencia 'nome_fantasia', coluna que nunca existiu no schema real (staging/produção) — ` +
          'causa raiz do 500 reproduzido no smoke de staging de 2026-07-21.',
      ).toBe(false);
    }
  });

  it('os testes de rota do RDV não recriam nome_fantasia no schema sintético local', () => {
    const testDir = dirname(fileURLToPath(import.meta.url));
    const routesTestDir = join(testDir, '../routes');
    const files = readdirSync(routesTestDir).filter(
      (f) => f.startsWith('controle-voos-rdv') && f.endsWith('.test.ts'),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(routesTestDir, file), 'utf8');
      expect(
        stripComments(source).includes('nome_fantasia'),
        `${file} recria 'nome_fantasia' no schema sintético local — isso mascara o incidente ` +
          'de staging de 2026-07-21 (500 por coluna inexistente).',
      ).toBe(false);
    }
  });
});
