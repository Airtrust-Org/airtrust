import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sqlPath = path.resolve(
  process.cwd(),
  'sql/audit/2026-08-01-edapp-retirement-readiness.sql',
);
const source = readFileSync(sqlPath, 'utf8');
const executable = source
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');
const statements = executable
  .split(';')
  .map((statement) => statement.trim())
  .filter(Boolean);

describe('auditoria de aposentadoria do EdApp', () => {
  it('permanece estritamente somente leitura', () => {
    for (const statement of statements) {
      expect(statement).toMatch(/^(SELECT|WITH|PRAGMA|EXPLAIN)\b/i);
    }

    expect(executable).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|ATTACH|DETACH|VACUUM)\b/i,
    );
  });

  it('cobre histórico, mapeamentos externos e artefatos internos', () => {
    for (const table of [
      'lms_historico_importado',
      'integracoes_edapp_eventos',
      'integracoes_edapp_usuarios',
      'integracoes_edapp_cursos',
      'funcionarios',
      'lms_cursos',
      'qualificacoes_historico',
      'documentos',
    ]) {
      expect(source).toMatch(new RegExp(`\\b${table}\\b`));
    }
  });

  it('retorna evidência agregada sem registros pessoais ou payloads brutos', () => {
    expect(executable).not.toMatch(/\bSELECT\s+\*/i);
    expect(executable).not.toMatch(
      /\b(cpf|email|nome_arquivo|numero_certificado)\s+AS\b/i,
    );
    expect(executable).not.toMatch(/payload_json\s+AS\b/i);
    expect(source).toMatch(/retirement_gate/);
    expect(source).toMatch(/qualification_certificate_dependencies/);
    expect(source).toMatch(/completion_events_without_imported_history/);
    expect(source).toMatch(/PRAGMA foreign_key_check/);
  });
});
