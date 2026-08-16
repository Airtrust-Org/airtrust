import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

import { FICHA_HORAS_VOO_SOURCE_SQL } from '../../shared/handlers/horasVooFromSimulador.handler';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function queryForFixture(): string {
  return FICHA_HORAS_VOO_SOURCE_SQL.replace('?', '277').replace('?', '6');
}

describe('horasVooFromSimulador schema contract', () => {
  it('executa a query real contra o schema canônico de ficha/agendamento/modelo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'airtrust-horas-simulador-'));
    tempDirs.push(dir);
    const dbPath = join(dir, 'fixture.sqlite');

    const setup = `
CREATE TABLE fichas_sessao (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  colaborador_id_aluno INTEGER,
  status TEXT,
  deleted_at TEXT,
  data_sessao TEXT,
  instrutor_id INTEGER,
  agendamento_slot_id INTEGER,
  template_id INTEGER,
  tipo_sessao TEXT
);
CREATE TABLE simulador_agendamentos (
  id INTEGER PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  deleted_at TEXT,
  data TEXT,
  duracao_minutos INTEGER,
  template_id INTEGER,
  nome TEXT
);
CREATE TABLE modelos_sessao (
  id INTEGER PRIMARY KEY,
  deleted_at TEXT,
  duracao_estimada INTEGER,
  nome TEXT
);
INSERT INTO modelos_sessao VALUES (9, NULL, 120, 'CHECK AW139');
INSERT INTO simulador_agendamentos VALUES (77, 6, NULL, '2026-08-15', 130, 9, 'Sessão 77');
INSERT INTO fichas_sessao VALUES (277, 6, 42, 'CONCLUIDA', NULL, NULL, 99, 77, 9, 'CHECK');
${queryForFixture()};
`;

    const run = spawnSync('sqlite3', [dbPath], {
      input: setup,
      encoding: 'utf8',
    });

    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain('277|42|CONCLUIDA');
    expect(run.stdout).toContain('130|CHECK AW139');
  });

  it('não reintroduz nomes de coluna legados que não existem em fichas_sessao', () => {
    expect(FICHA_HORAS_VOO_SOURCE_SQL).toContain('fs.colaborador_id_aluno');
    expect(FICHA_HORAS_VOO_SOURCE_SQL).toContain('fs.agendamento_slot_id');
    expect(FICHA_HORAS_VOO_SOURCE_SQL).toContain('fs.empresa_id = ?');
    expect(FICHA_HORAS_VOO_SOURCE_SQL).not.toContain('fs.funcionario_id');
    expect(FICHA_HORAS_VOO_SOURCE_SQL).not.toContain('fs.modelo_sessao_id');
    expect(FICHA_HORAS_VOO_SOURCE_SQL).not.toContain('fs.duracao_min');
    expect(FICHA_HORAS_VOO_SOURCE_SQL).not.toContain('modelos_sessao.duracao_min');
  });
});
