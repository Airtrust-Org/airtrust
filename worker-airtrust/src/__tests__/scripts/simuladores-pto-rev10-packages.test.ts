import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  durationMinutesFromCanonicalLoad,
  loadCanonicalAircraftPackage,
  structuredSessionType,
} from '../../../scripts/lib/simuladores-pto-rev10-packages.mjs';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeJson(dir: string, name: string, value: unknown): string {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(path.join(dir, name), content, 'utf8');
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('PTO Rev10 package loader', () => {
  it('maps only canonical operational fields and strips historical provenance', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pto-rev10-'));
    tempDirs.push(dir);

    const technical = Array.from({ length: 18 }, (_, index) => ({
      programa: 'Inicial',
      sessao: 'A139-I-01/12',
      ordem: String(index + 1),
      perna_pf: index < 9 ? '1 - PF A' : '2 - PF B',
      codigo: `A139-TST-${String(index + 1).padStart(3, '0')}`,
      manobra_procedimento: `Item ${index + 1}`,
      descricao_canonica: `Item ${index + 1}`,
      familia: 'TST',
      categoria: 'Teste',
      tipo_conteudo: 'PROCEDIMENTO / MANOBRA',
      fase: 'Fase de teste',
      sessao_anterior: 'LEGACY-01',
      codigo_anterior: `OLD-${index + 1}`,
      descricao_anterior: 'Não importar',
      alias_substituicao: 'Não importar',
    }));
    const catalog = technical.map((item) => ({
      codigo: item.codigo,
      descricao_canonica: item.descricao_canonica,
      familia: item.familia,
      categoria: item.categoria,
      tipo_conteudo: item.tipo_conteudo,
      fase: item.fase,
      identificador_pane_checklist: '',
      codigo_anterior: item.codigo_anterior,
      descricao_anterior: item.descricao_anterior,
      alias_substituicao: item.alias_substituicao,
    }));
    const notechs = Array.from({ length: 15 }, (_, index) => ({
      codigo: `NTS-${index < 4 ? 'TEM' : index < 7 ? 'LDR' : index === 7 ? 'WLM' : index < 11 ? 'SA' : 'DEC'}-${String(index + 1).padStart(2, '0')}`,
      competencia: `Competência ${index + 1}`,
      categoria: 'NOTECHS',
      evidencia_observavel: `Evidência ${index + 1}`,
    }));

    const files: Record<string, string> = {};
    files['sessoes.json'] = writeJson(dir, 'sessoes.json', [
      {
        sessao: 'A139-I-01/12',
        titulo: 'Sessão canônica',
        programa: 'Inicial',
        natureza_sessao: 'Instrução',
        carga_sessao: '2 horas',
        itens_tecnicos: 18,
        itens_notechs: 15,
      },
    ]);
    files['matriz_tecnica.json'] = writeJson(dir, 'matriz_tecnica.json', technical);
    files['catalogo_codigos.json'] = writeJson(dir, 'catalogo_codigos.json', catalog);
    files['catalogo_notechs.json'] = writeJson(dir, 'catalogo_notechs.json', notechs);
    files['matriz_notechs.json'] = writeJson(
      dir,
      'matriz_notechs.json',
      notechs.map((item) => ({ sessao: 'A139-I-01/12', codigo_notechs: item.codigo })),
    );
    files['catalogo_codigos_instrutor_examinador.json'] = writeJson(
      dir,
      'catalogo_codigos_instrutor_examinador.json',
      {
        regra: 'Regra de teste',
        codigos_canonicos: [
          { codigo: 'INST-ACT-001', categoria: 'Instrutor', atividade: 'Planejamento' },
        ],
        relacoes_por_sessao: [
          { sessao: 'INST-E01', ordem: 1, codigo: 'INST-ACT-001', atividade: 'Planejamento' },
        ],
      },
    );
    files['MAPEAMENTO_IMPORTACAO_AIRTRUST.json'] = writeJson(
      dir,
      'MAPEAMENTO_IMPORTACAO_AIRTRUST.json',
      {
        campos_de_proveniencia_nao_operacionais: [
          'sessao_anterior',
          'codigo_anterior',
          'descricao_anterior',
          'alias_substituicao',
        ],
      },
    );
    files['VALIDACAO_PTO_REV10.json'] = writeJson(dir, 'VALIDACAO_PTO_REV10.json', {
      status: 'VALIDAÇÃO ESTRUTURAL E EQUIVALÊNCIA PTO/AIRTRUST CONCLUÍDAS',
    });

    const result = loadCanonicalAircraftPackage({
      aircraft: 'AW139',
      packageDir: dir,
      packageManifest: { files },
      expected: { sessions: 1, technicalLinks: 18, notechsLinks: 15 },
    });

    expect(result.sessoes).toHaveLength(1);
    expect(result.sessoes[0].duracao_estimada_minutos).toBe(120);
    expect(result.sessoes[0].itens_tecnicos).toHaveLength(18);
    expect(result.sessoes[0].itens_tecnicos[0].tripulante).toBe('A');
    expect(result.sessoes[0].itens_tecnicos[17].tripulante).toBe('B');
    expect(result.sessoes[0].legacy_source_codes).toEqual(['LEGACY-01']);
    expect(JSON.stringify(result)).not.toContain('codigo_anterior');
    expect(JSON.stringify(result)).not.toContain('descricao_anterior');
    expect(JSON.stringify(result)).not.toContain('alias_substituicao');
  });

  it('centralizes canonical loads without inferring them from titles', () => {
    expect(durationMinutesFromCanonicalLoad('2 horas')).toBe(120);
    expect(durationMinutesFromCanonicalLoad('3 horas')).toBe(180);
    expect(durationMinutesFromCanonicalLoad('90 minutos (mínimo)')).toBe(90);
    expect(durationMinutesFromCanonicalLoad('1 hora prática (mínimo); 1 hora de solo associada')).toBe(60);
    expect(
      durationMinutesFromCanonicalLoad('Integrada às 9 horas do ciclo; sem carga adicional de FFS'),
    ).toBe(0);
  });

  it('maps program and verification nature to structured session types', () => {
    expect(structuredSessionType('Inicial', 'Instrução')).toBe('INICIAL');
    expect(structuredSessionType('Periódico', 'Instrução')).toBe('PERIODICO');
    expect(structuredSessionType('Periódico', 'Verificação progressiva')).toBe('CHECK');
    expect(structuredSessionType('Treinamento noturno', 'Instrução')).toBe('NOTURNO');
  });
});
