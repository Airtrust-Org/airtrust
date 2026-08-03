/**
 * Tests: generateCertificateForHistorico (core certificate-generation logic)
 *
 * All identifiers (funcionário, matrícula, empresa, historicoId) are
 * fictitious — this file is not a reproduction of any real record.
 *
 * Covers the certificate-generation fix requirements:
 * - Successful emission produces a PDF with valid magic bytes, a documento,
 *   a historico link, AND a pasta_virtual link (Pasta 360 postcondition).
 * - Missing template -> CERTIFICATE_TEMPLATE_NOT_CONFIGURED, nothing written.
 * - Missing Browser Rendering config -> CERTIFICATE_BROWSER_RENDERING_NOT_CONFIGURED.
 * - Browser Rendering failure -> CERTIFICATE_BROWSER_RENDERING_FAILED, nothing written.
 * - R2 write failure -> CERTIFICATE_STORAGE_FAILED, no D1 writes at all.
 * - D1 batch failure (documentos+pasta_virtual+historico) -> CERTIFICATE_PERSISTENCE_FAILED,
 *   zero residual rows in documentos/pasta_virtual, historico unchanged, R2 object removed.
 * - A concorrência no vínculo final é detectada por compare-and-set; o perdedor
 *   remove os registros e o objeto R2 que acabou de criar.
 * - Historico not found -> CERTIFICATE_HISTORY_NOT_FOUND.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../types';

const htmlToPdfMock = vi.hoisted(() => vi.fn());
const processTemplateWithQRMock = vi.hoisted(() => vi.fn());
const getCertificadosStorageColumnsMock = vi.hoisted(() => vi.fn());
const backfillCertificadoAtualNaPastaVirtualMock = vi.hoisted(() => vi.fn());
const registrarAuditoriaMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/html-to-pdf', () => ({
  htmlToPdf: htmlToPdfMock,
  processTemplateWithQR: processTemplateWithQRMock,
}));

vi.mock('../../utils/auditoria', () => ({
  registrarAuditoria: registrarAuditoriaMock,
}));

vi.mock('../../routes/qualificacoes-certificados-helpers', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../routes/qualificacoes-certificados-helpers')>();
  return {
    ...actual,
    getCertificadosStorageColumns: getCertificadosStorageColumnsMock,
    backfillCertificadoAtualNaPastaVirtual: backfillCertificadoAtualNaPastaVirtualMock,
  };
});

import { generateCertificateForHistorico } from '../../services/generate-certificate';

// Fictitious identifiers only — do not use real production ids/names here.
const HISTORICO_ID = 42001;
const EMPRESA_ID = 777;
const FUNCIONARIO_ID = 5001;

function pdfBytes(): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.set([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
  return bytes;
}

function makeQualificacaoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: HISTORICO_ID,
    funcionario_id: FUNCIONARIO_ID,
    qualificacao_id: 900,
    data_conclusao: '2026-01-15',
    data_vencimento: null,
    certificado_arquivo_id: null,
    validade_meses: 12,
    carga_horaria: 8,
    instrutor: null,
    local: null,
    nota: null,
    funcionario_nome: 'Tripulante Fictício da Silva',
    funcionario_cpf: '00000000000',
    funcionario_codigo_anac: 'ANAC000',
    funcionario_matricula: '00000',
    funcionario_funcao: 'Tripulante',
    func_empresa_id: EMPRESA_ID,
    qualificacao_nome: 'Qualificação de Teste',
    qualificacao_codigo: 'TST',
    qualificacao_categoria: 'TESTE',
    qualificacao_validade: 12,
    tipo_treinamento: null,
    carga_horaria_historico: 8,
    carga_horaria_padrao: 8,
    carga_horaria_inicial: null,
    carga_horaria_recorrente: null,
    conteudo_programatico: '<p>Conteúdo já resolvido</p>',
    qualificacao_descricao: null,
    vencimento_fim_mes: 0,
    ...overrides,
  };
}

// ── Fake D1 with real db.batch() transactional semantics ───────────────────
//
// Batch is atomic-on-throw only: if any statement in the array throws, the
// whole batch's effect is rolled back (snapshot/restore), matching
// Cloudflare D1's documented behavior and this codebase's own reliance on
// it elsewhere (controle-voos-rdv-workflow.ts, sigvoos-frms.ts). A
// statement that runs without throwing but matches zero rows (e.g. an
// UPDATE with no matching WHERE) is NOT rolled back by batch() itself —
// exactly the gap the code under test explicitly compensates for.
interface DocumentoRow {
  id: number;
  uuid: string;
  funcionario_id: number;
  nome_arquivo: string;
  tipo: string;
  tamanho: number;
  r2_key: string;
  descricao: string;
  empresa_id: number;
}

interface PastaVirtualRow {
  id: number;
  funcionario_id: number;
  documento_id: number;
  certificacao_id: number;
  empresa_id: number;
  caminho_arquivo: string;
  nome_arquivo: string;
}

interface HistoricoLinkState {
  certificado_arquivo_id: number | null;
  arquivo_url: string | null;
  numero_certificado: string | null;
}

function makeFakeD1(options: {
  qualificacao: Record<string, unknown> | null;
  templateHtml?: string | null;
  failDocumentoInsert?: boolean;
  historicoUpdateMatches?: boolean; // false simulates a WHERE that matches 0 rows
}) {
  const { qualificacao, templateHtml = '<html><body>{{qualificacao_nome}}</body></html>' } =
    options;
  const failDocumentoInsert = options.failDocumentoInsert ?? false;
  const historicoUpdateMatches = options.historicoUpdateMatches ?? true;

  const documentos: DocumentoRow[] = [];
  const pastaVirtual: PastaVirtualRow[] = [];
  const historico: HistoricoLinkState = {
    certificado_arquivo_id:
      (qualificacao?.certificado_arquivo_id as number | null | undefined) ?? null,
    arquivo_url: null,
    numero_certificado: null,
  };
  let nextDocumentoId = 9000;
  let nextPastaVirtualId = 9500;
  const calls: string[] = [];

  function execOne(
    sql: string,
    args: unknown[],
  ): { meta: { changes: number; last_row_id: number } } {
    calls.push(sql);

    if (sql.startsWith('INSERT INTO documentos')) {
      if (failDocumentoInsert) {
        throw new Error('simulated D1 insert failure');
      }
      const [uuid, funcionarioId, nomeArquivo, tipo, tamanho, r2Key, descricao, empresaId] =
        args as [string, number, string, string, number, string, string, number];
      const row: DocumentoRow = {
        id: ++nextDocumentoId,
        uuid,
        funcionario_id: funcionarioId,
        nome_arquivo: nomeArquivo,
        tipo,
        tamanho,
        r2_key: r2Key,
        descricao,
        empresa_id: empresaId,
      };
      documentos.push(row);
      return { meta: { changes: 1, last_row_id: row.id } };
    }

    if (sql.startsWith('INSERT INTO pasta_virtual')) {
      // bindings (all storage-columns flags true): [funcionarioId, r2Key(subquery),
      // historicoId, empresaId, 'CERTIFICADO', categoria, r2Key(caminho), nomeArquivo, descricao]
      const [
        funcionarioId,
        r2KeyForDocLookup,
        historicoId,
        empresaId,
        ,
        ,
        caminhoArquivo,
        nomeArquivo,
      ] = args as [number, string, number, number, string, string, string, string, string];
      const documento = documentos.find((d) => d.r2_key === r2KeyForDocLookup);
      const row: PastaVirtualRow = {
        id: ++nextPastaVirtualId,
        funcionario_id: funcionarioId,
        documento_id: documento?.id ?? 0,
        certificacao_id: historicoId,
        empresa_id: empresaId,
        caminho_arquivo: caminhoArquivo,
        nome_arquivo: nomeArquivo,
      };
      pastaVirtual.push(row);
      return { meta: { changes: 1, last_row_id: row.id } };
    }

    if (
      sql.includes('UPDATE qualificacoes_historico') &&
      sql.includes('certificado_arquivo_id = (SELECT')
    ) {
      if (!historicoUpdateMatches) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      const [r2KeyForDocLookup, , numeroCertificado, , , expectedCurrentId] = args as [
        string,
        string,
        string,
        number,
        number,
        number | null,
        number | null,
      ];
      const matchesExpectedCurrentId =
        expectedCurrentId == null
          ? historico.certificado_arquivo_id == null
          : historico.certificado_arquivo_id === expectedCurrentId;
      if (!matchesExpectedCurrentId) {
        return { meta: { changes: 0, last_row_id: 0 } };
      }
      const documento = documentos.find((d) => d.r2_key === r2KeyForDocLookup);
      historico.certificado_arquivo_id = documento?.id ?? null;
      historico.arquivo_url = documento ? `/api/pasta-virtual/stream/${documento.id}` : null;
      historico.numero_certificado = numeroCertificado;
      return { meta: { changes: 1, last_row_id: 0 } };
    }

    if (sql.startsWith('DELETE FROM pasta_virtual')) {
      const [r2Key] = args as [string];
      const before = pastaVirtual.length;
      const remaining = pastaVirtual.filter((row) => row.caminho_arquivo !== r2Key);
      pastaVirtual.length = 0;
      pastaVirtual.push(...remaining);
      return { meta: { changes: before - remaining.length, last_row_id: 0 } };
    }

    if (sql.startsWith('DELETE FROM documentos')) {
      const [r2Key] = args as [string];
      const before = documentos.length;
      const remaining = documentos.filter((row) => row.r2_key !== r2Key);
      documentos.length = 0;
      documentos.push(...remaining);
      return { meta: { changes: before - remaining.length, last_row_id: 0 } };
    }

    return { meta: { changes: 1, last_row_id: 1 } };
  }

  function makeBoundStatement(sql: string, args: unknown[]) {
    return {
      _sql: sql,
      _args: args,
      bind: (...newArgs: unknown[]) => makeBoundStatement(sql, newArgs),
      all: vi.fn(async () => ({ results: [] })), // PRAGMA table_info(...) — no extra columns
      first: vi.fn(async () => {
        if (
          sql.includes('FROM qualificacoes_historico qh') &&
          sql.includes('LEFT JOIN funcionarios')
        ) {
          return qualificacao;
        }
        if (sql.includes('FROM empresas e') && sql.includes('LEFT JOIN empresas_config')) {
          return {
            empresa_nome: 'Empresa Fictícia',
            logo_principal: '',
            certificado_logo_url: '',
            certificado_template_html: templateHtml,
          };
        }
        if (sql.includes('FROM certificados_templates')) {
          return null;
        }
        return null;
      }),
      run: vi.fn(async () => execOne(sql, args)),
    };
  }

  const prepare = vi.fn((sql: string) => makeBoundStatement(sql, []));

  const batch = vi.fn(async (stmts: Array<{ _sql: string; _args: unknown[] }>) => {
    const snapshotDocs = documentos.map((d) => ({ ...d }));
    const snapshotPV = pastaVirtual.map((p) => ({ ...p }));
    const snapshotHist = { ...historico };
    try {
      const results = stmts.map((stmt) => execOne(stmt._sql, stmt._args));
      return results;
    } catch (e) {
      documentos.length = 0;
      documentos.push(...snapshotDocs);
      pastaVirtual.length = 0;
      pastaVirtual.push(...snapshotPV);
      Object.assign(historico, snapshotHist);
      throw e;
    }
  });

  const db = { prepare, batch } as unknown as D1Database;

  return { db, documentos, pastaVirtual, historico, calls };
}

function makeBucket() {
  return {
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    get: vi.fn(async () => null),
  };
}

function makeEnv(
  db: D1Database,
  bucket: ReturnType<typeof makeBucket>,
  hasBrowserRendering = true,
): Env {
  return {
    DB: db,
    BUCKET: bucket,
    CF_ACCOUNT_ID: hasBrowserRendering ? 'acc-fake' : undefined,
    CF_BROWSER_API_TOKEN: hasBrowserRendering ? 'token-fake' : undefined,
  } as unknown as Env;
}

describe('generateCertificateForHistorico', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCertificadosStorageColumnsMock.mockResolvedValue({
      documentosHasEmpresaId: true,
      pastaVirtualHasEmpresaId: true,
      pastaVirtualHasCertificacaoId: true,
      pastaVirtualHasDocumentoId: true,
    });
    backfillCertificadoAtualNaPastaVirtualMock.mockResolvedValue(undefined);
    processTemplateWithQRMock.mockImplementation(async (html: string) => html);
    htmlToPdfMock.mockResolvedValue({ success: true, pdfBytes: pdfBytes() });
  });

  it('gera certificado com sucesso: PDF com magic bytes válidos, documento criado, histórico E pasta_virtual vinculados', async () => {
    const { db, documentos, pastaVirtual, historico } = makeFakeD1({
      qualificacao: makeQualificacaoRow(),
    });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket);

    const result = await generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {});

    // magic bytes
    expect(bucket.put).toHaveBeenCalledTimes(1);
    const putBytes = (bucket.put as ReturnType<typeof vi.fn>).mock.calls[0][1] as Uint8Array;
    const magic = String.fromCharCode(...Array.from(putBytes.slice(0, 4)));
    expect(magic).toBe('%PDF');

    // documento criado
    expect(documentos).toHaveLength(1);
    expect(documentos[0].id).toBe(result.documentoId);
    expect(documentos[0].r2_key).toBe(result.r2Key);

    // Pasta 360 (pasta_virtual) vinculada — postcondição real de sucesso,
    // não apenas um best-effort silencioso.
    expect(pastaVirtual).toHaveLength(1);
    expect(pastaVirtual[0].documento_id).toBe(result.documentoId);
    expect(pastaVirtual[0].certificacao_id).toBe(HISTORICO_ID);

    // histórico vinculado
    expect(historico.certificado_arquivo_id).toBe(result.documentoId);
    expect(historico.numero_certificado).toBe(result.numeroCertificado);

    expect(bucket.delete).not.toHaveBeenCalled();
  });

  it('historico inexistente -> CERTIFICATE_HISTORY_NOT_FOUND', async () => {
    const { db } = makeFakeD1({ qualificacao: null });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket);

    await expect(
      generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {}),
    ).rejects.toMatchObject({
      code: 'CERTIFICATE_HISTORY_NOT_FOUND',
    });
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('sem template configurado -> CERTIFICATE_TEMPLATE_NOT_CONFIGURED, nada é escrito', async () => {
    const { db } = makeFakeD1({ qualificacao: makeQualificacaoRow(), templateHtml: null });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket);

    await expect(
      generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {}),
    ).rejects.toMatchObject({
      code: 'CERTIFICATE_TEMPLATE_NOT_CONFIGURED',
    });
    expect(bucket.put).not.toHaveBeenCalled();
    expect(htmlToPdfMock).not.toHaveBeenCalled();
  });

  it('Browser Rendering não configurado -> CERTIFICATE_BROWSER_RENDERING_NOT_CONFIGURED', async () => {
    const { db } = makeFakeD1({ qualificacao: makeQualificacaoRow() });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket, false);

    await expect(
      generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {}),
    ).rejects.toMatchObject({
      code: 'CERTIFICATE_BROWSER_RENDERING_NOT_CONFIGURED',
    });
    expect(bucket.put).not.toHaveBeenCalled();
    expect(htmlToPdfMock).not.toHaveBeenCalled();
  });

  it('Browser Rendering falha -> CERTIFICATE_BROWSER_RENDERING_FAILED, nada é escrito', async () => {
    htmlToPdfMock.mockResolvedValue({ success: false, error: 'boom' });
    const { db, documentos, pastaVirtual } = makeFakeD1({ qualificacao: makeQualificacaoRow() });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket);

    await expect(
      generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {}),
    ).rejects.toMatchObject({
      code: 'CERTIFICATE_BROWSER_RENDERING_FAILED',
    });
    expect(bucket.put).not.toHaveBeenCalled();
    expect(documentos).toHaveLength(0);
    expect(pastaVirtual).toHaveLength(0);
  });

  it('PDF com magic bytes inválidos -> CERTIFICATE_BROWSER_RENDERING_FAILED', async () => {
    htmlToPdfMock.mockResolvedValue({ success: true, pdfBytes: new Uint8Array([0, 0, 0, 0]) });
    const { db } = makeFakeD1({ qualificacao: makeQualificacaoRow() });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket);

    await expect(
      generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {}),
    ).rejects.toMatchObject({
      code: 'CERTIFICATE_BROWSER_RENDERING_FAILED',
    });
    expect(bucket.put).not.toHaveBeenCalled();
  });

  it('falha ao gravar no R2 -> CERTIFICATE_STORAGE_FAILED, nenhuma escrita no D1', async () => {
    const { db, documentos, pastaVirtual } = makeFakeD1({ qualificacao: makeQualificacaoRow() });
    const bucket = makeBucket();
    bucket.put.mockRejectedValue(new Error('R2 unavailable'));
    const env = makeEnv(db, bucket);

    await expect(
      generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {}),
    ).rejects.toMatchObject({
      code: 'CERTIFICATE_STORAGE_FAILED',
    });
    expect(documentos).toHaveLength(0);
    expect(pastaVirtual).toHaveLength(0);
    expect(bucket.delete).not.toHaveBeenCalled(); // nada foi escrito, nada para reverter
  });

  it('batch D1 falha (documento+pasta_virtual+histórico) -> CERTIFICATE_PERSISTENCE_FAILED, ZERO resíduo em documentos/pasta_virtual, histórico inalterado, R2 removido', async () => {
    const { db, documentos, pastaVirtual, historico } = makeFakeD1({
      qualificacao: makeQualificacaoRow(),
      failDocumentoInsert: true,
    });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket);

    await expect(
      generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {}),
    ).rejects.toMatchObject({
      code: 'CERTIFICATE_PERSISTENCE_FAILED',
    });

    // Postcondição central do bloqueador 2: nenhum resíduo em nenhuma tabela.
    expect(documentos).toHaveLength(0);
    expect(pastaVirtual).toHaveLength(0);
    expect(historico.certificado_arquivo_id).toBeNull();
    expect(historico.numero_certificado).toBeNull();

    expect(bucket.put).toHaveBeenCalledTimes(1);
    const r2KeyWritten = (bucket.put as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(bucket.delete).toHaveBeenCalledTimes(1);
    expect((bucket.delete as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(r2KeyWritten);
  });

  it('compare-and-set perde a corrida -> CERTIFICATE_CONCURRENT_GENERATION e remove todo o resíduo criado pelo perdedor', async () => {
    const existingDocumentoId = 321;
    const { db, documentos, pastaVirtual, historico } = makeFakeD1({
      qualificacao: makeQualificacaoRow({ certificado_arquivo_id: existingDocumentoId }),
    });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket);

    await expect(
      generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {
        expectedCertificadoArquivoId: null,
      }),
    ).rejects.toMatchObject({
      code: 'CERTIFICATE_CONCURRENT_GENERATION',
    });

    expect(documentos).toHaveLength(0);
    expect(pastaVirtual).toHaveLength(0);
    expect(historico.certificado_arquivo_id).toBe(existingDocumentoId);
    expect(bucket.delete).toHaveBeenCalledTimes(1);
  });

  it('compare-and-set permite regeneração quando o vínculo observado ainda é o atual', async () => {
    const existingDocumentoId = 321;
    const { db, historico } = makeFakeD1({
      qualificacao: makeQualificacaoRow({ certificado_arquivo_id: existingDocumentoId }),
    });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket);

    const result = await generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {
      expectedCertificadoArquivoId: existingDocumentoId,
    });

    expect(historico.certificado_arquivo_id).toBe(result.documentoId);
    expect(historico.certificado_arquivo_id).not.toBe(existingDocumentoId);
  });

  it('r2Key gerado é tenant-scoped (empresa/funcionario/historico) e não contém PII', async () => {
    const { db } = makeFakeD1({ qualificacao: makeQualificacaoRow() });
    const bucket = makeBucket();
    const env = makeEnv(db, bucket);

    const result = await generateCertificateForHistorico(env, HISTORICO_ID, EMPRESA_ID, {});

    expect(result.r2Key).toContain(`empresa-${EMPRESA_ID}`);
    expect(result.r2Key).toContain(`funcionario-${FUNCIONARIO_ID}`);
    expect(result.r2Key).toContain(`historico-${HISTORICO_ID}`);
    expect(result.r2Key).not.toMatch(/\d{11}/); // sem CPF cru no path
  });
});
