import { describe, expect, it, vi } from 'vitest';

import {
  adaptTemplateHtmlForInstrutor,
  adaptTemplateHtmlForSinglePageA4,
  buildConteudoProgramaticoCertificadoHtml,
  resolveCargaHorariaCertificado,
  resolveFuncionarioInstrutorNaEmpresa,
  resolveInstrutorCertificadoData,
  resolveConteudoProgramaticoCertificado,
} from '../../routes/qualificacoes-certificados-helpers';

type QueryHandler = {
  first?: (args: unknown[]) => Promise<unknown> | unknown;
  all?: (args: unknown[]) => Promise<unknown> | unknown;
};

function createMockDb(handlers: Array<[string, QueryHandler]>) {
  const calls: Array<{ query: string; args: unknown[]; method: 'first' | 'all' }> = [];

  const db = {
    prepare: vi.fn((query: string) => {
      const entry = handlers.find(([matcher]) => query.includes(matcher));
      if (!entry) {
        throw new Error(`Unhandled query: ${query}`);
      }

      const [, handler] = entry;
      const executeAll = async (args: unknown[]) => {
        calls.push({ query, args, method: 'all' });
        return handler.all ? handler.all(args) : { results: [] };
      };

      const executeFirst = async (args: unknown[]) => {
        calls.push({ query, args, method: 'first' });
        return handler.first ? handler.first(args) : null;
      };

      return {
        all: async () => executeAll([]),
        first: async () => executeFirst([]),
        bind: (...args: unknown[]) => ({
          all: async () => executeAll(args),
          first: async () => executeFirst(args),
        }),
      };
    }),
  } as unknown as D1Database;

  return { db, calls };
}

describe('qualificacoes-certificados-helpers', () => {
  it('reaproveita o conteudo direto sem consultar fallback', async () => {
    const db = {
      prepare: vi.fn(() => {
        throw new Error('db nao deveria ser consultado');
      }),
    } as unknown as D1Database;

    const result = await resolveConteudoProgramaticoCertificado(db, {
      conteudoProgramatico: 'Item 1\nItem 2',
      qualificacaoCodigo: 'G1-SEM',
      empresaId: 6,
    });

    expect(result).toBe('Item 1\nItem 2');
  });

  it('faz fallback de G1-SEM para G1 na mesma empresa quando o conteudo vier vazio', async () => {
    const { db, calls } = createMockDb([
      [
        'PRAGMA table_info(qualificacoes_tipos)',
        { all: () => ({ results: [{ name: 'empresa_id' }] }) },
      ],
      [
        'FROM qualificacoes_tipos',
        {
          first: (args) => {
            const [empresaId, codigo] = args as [number, string];
            if (empresaId === 6 && codigo === 'G1-SEM') {
              return null;
            }
            if (empresaId === 6 && codigo === 'G1') {
              return {
                conteudo_programatico: 'Familiarizacao com cabine\nDecolagens e pousos',
              };
            }
            return null;
          },
        },
      ],
    ]);

    const result = await resolveConteudoProgramaticoCertificado(db, {
      conteudoProgramatico: null,
      qualificacaoCodigo: 'G1-SEM',
      empresaId: 6,
    });

    expect(result).toBe('Familiarizacao com cabine\nDecolagens e pousos');
    expect(
      calls
        .filter(
          (call) => call.method === 'first' && call.query.includes('FROM qualificacoes_tipos'),
        )
        .map((call) => call.args[1]),
    ).toEqual(['G1-SEM', 'G1']);
  });

  it('formata o conteudo programatico como spans HTML', () => {
    const html = buildConteudoProgramaticoCertificadoHtml('Item 1\nItem 2;Item 3');

    expect(html).toContain('<span class="program-item">• Item 1</span>');
    expect(html).toContain('<span class="program-item">• Item 2</span>');
    expect(html).toContain('<span class="program-item">• Item 3</span>');
  });

  it('resolve os dados do instrutor pelo nome na empresa e faz fallback para nome livre', async () => {
    const { db } = createMockDb([
      [
        'FROM funcionarios',
        {
          all: (args) => {
            const [empresaId] = args as [number];
            if (empresaId === 6) {
              return {
                results: [
                  {
                    id: 41,
                    nome: 'Filipe Passaroni Daumas',
                    cpf: '123.456.789-00',
                    codigo_anac: '12694-7',
                    matricula: '00353',
                    funcao: 'Instrutor',
                  },
                ],
              };
            }
            return { results: [] };
          },
        },
      ],
    ]);

    await expect(
      resolveInstrutorCertificadoData(db, {
        empresaId: 6,
        nomeInstrutor: 'Filipe Passaroni Daumas',
      }),
    ).resolves.toEqual({
      nome: 'Filipe Passaroni Daumas',
      cpf: '123.456.789-00',
      codigoAnac: '12694-7',
      matricula: '00353',
      funcao: 'Instrutor',
    });

    await expect(
      resolveInstrutorCertificadoData(db, {
        empresaId: 6,
        nomeInstrutor: 'Instrutor Externo',
        fallbackFuncao: 'Instrutor Convidado',
      }),
    ).resolves.toEqual({
      nome: 'Instrutor Externo',
      cpf: '',
      codigoAnac: '',
      matricula: '',
      funcao: 'Instrutor Convidado',
    });
  });

  it('resolve o funcionario do instrutor por nome e evita cair no aluno do historico', async () => {
    const { db } = createMockDb([
      [
        'FROM funcionarios',
        {
          all: (args) => {
            const [empresaId] = args as [number];
            if (empresaId === 6) {
              return {
                results: [
                  {
                    id: 25,
                    nome: 'Ramon Godinho Bastos',
                    cpf: '093.127.887-28',
                    codigo_anac: '',
                    matricula: '00264',
                    funcao: 'Aluno',
                  },
                  {
                    id: 41,
                    nome: 'Filipe Passaroni Daumas',
                    cpf: '083.286.227-42',
                    codigo_anac: '12694-7',
                    matricula: '00353',
                    funcao: 'Instrutor',
                  },
                ],
              };
            }
            return { results: [] };
          },
        },
      ],
    ]);

    await expect(
      resolveFuncionarioInstrutorNaEmpresa(db, {
        empresaId: 6,
        nomeInstrutor: 'Filipe Passaroni Daumas',
      }),
    ).resolves.toMatchObject({
      id: 41,
      nome: 'Filipe Passaroni Daumas',
    });

    await expect(
      resolveFuncionarioInstrutorNaEmpresa(db, {
        empresaId: 6,
        cpfInstrutor: '08328622742',
      }),
    ).resolves.toMatchObject({
      id: 41,
      nome: 'Filipe Passaroni Daumas',
    });
  });

  it('adapta o template do instrutor com texto correto, label e css A4', () => {
    const html = adaptTemplateHtmlForInstrutor(`
      <html>
        <head></head>
        <body>
          <div>Certificamos que o profissional abaixo ministrou, como instrutor, o seguinte treinamento:o treinamento descrito neste documento.</div>
          <div class="main-sub">Certificamos que o(a) profissional abaixo concluiu com aproveitamento:</div>
          <span>FUNCIONÁRIO</span>
        </body>
      </html>
    `);

    expect(html).toContain(
      'Certificamos que o profissional abaixo ministrou, como instrutor, o treinamento descrito neste documento.',
    );
    expect(html).not.toContain('o seguinte treinamento:o');
    expect(html).not.toContain('concluiu com aproveitamento:');
    expect(html).not.toContain(
      'Certificamos que o profissional abaixo ministrou, como instrutor, o treinamento descrito neste documento. o treinamento descrito neste documento.',
    );
    expect(html).toContain('>INSTRUTOR<');
    expect(html).toContain('airtrust-instrutor-a4-fix');
    expect(html).toContain('@page { size: A4 portrait; margin: 0; }');
    expect(html).toContain('.cert-page');
    expect(html).toContain('height: 297mm !important;');
    expect(html).toContain('margin-top: auto !important;');
  });

  it('prioriza a carga horaria gravada no historico ao emitir o certificado', () => {
    expect(
      resolveCargaHorariaCertificado({
        tipoTreinamento: 'RECORRENTE',
        cargaHistorico: 7,
        cargaInicial: 10,
        cargaRecorrente: 4,
        cargaPadrao: 3,
      }),
    ).toBe(7);

    expect(
      resolveCargaHorariaCertificado({
        tipoTreinamento: 'INICIAL',
        cargaHistorico: null,
        cargaInicial: 12,
        cargaRecorrente: 6,
        cargaPadrao: 8,
      }),
    ).toBe(12);
  });

  it('normaliza qualquer template para caber em uma unica folha A4', () => {
    const html = adaptTemplateHtmlForSinglePageA4(`
      <html>
        <head></head>
        <body>
          <div class="cert-page">
            <div class="program-section"><div class="program-content">conteudo</div></div>
            <div class="footer">rodape</div>
          </div>
        </body>
      </html>
    `);

    expect(html).toContain('airtrust-instrutor-a4-fix');
    expect(html).toContain('height: 297mm !important;');
    expect(html).toContain('font-size: 6.8pt !important;');
    expect(html).toContain('margin-top: auto !important;');
  });

  it('preserva o layout estruturado do certificado no padrao antigo', () => {
    const html = adaptTemplateHtmlForSinglePageA4(`
      <html>
        <head></head>
        <body>
          <div class="cert-page">
            <div class="header"></div>
            <div class="info-grid"></div>
            <div class="training-box"></div>
            <div class="program-section"><div class="program-content">conteudo</div></div>
            <div class="footer">rodape</div>
          </div>
        </body>
      </html>
    `);

    expect(html).toContain('airtrust-instrutor-a4-fix');
    expect(html).toContain('display: grid !important;');
    expect(html).toContain(
      'grid-template-rows: auto auto auto auto minmax(0, 1fr) auto !important;',
    );
    expect(html).toContain('font-size: 6.6pt !important;');
    expect(html).toContain('margin-top: 12px !important;');
    expect(html).toContain('box-shadow: none !important;');
  });
});
