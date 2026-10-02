/**
 * PASTA VIRTUAL R2 ROUTES - Gestão de Documentos
 *
 * Endpoints para upload/download de arquivos no R2:
 * - POST /api/pasta-virtual/upload - Upload arquivo para R2
 * - GET /api/pasta-virtual - Lista documentos (com filtro por funcionario_id)
 * - GET /api/pasta-virtual/download/:id - Gera signed URL para download
 * - DELETE /api/pasta-virtual/:id - Remove documento (soft delete)
 */

import { Hono } from 'hono';
import type { AppEnv, Env, ApiResponse, PaginatedResponse } from '../types';
import { calculatePagination } from '../utils/db';
import { notFound, badRequest } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { registrarAuditoria } from '../utils/auditoria';
import {
  gerarNomeArquivoPadronizado,
  normalizarTipoDocumento,
} from '../utils/nomenclatura-padronizada';
import { getSchemaColumns, hasSchemaTable } from '../utils/db-schema';
import { publishDomainEvent } from '../shared/domainEvents';
import { resolveAllowedOrigin } from '../config/allowed-origins';
import { employeeSectorSql, getEmployeeSectorAccess } from '../services/employee-sector-access';
import pastaVirtualExtraRoutes from './pasta-virtual-extra';

// Cross-tenant and out-of-scope funcionario lookups must both fold into the
// same 404 — assertFuncionarioInScope's 403 would leak that the id exists in
// another tenant, which documentos-tenant-isolation.test.ts guards against.
async function isFuncionarioInScope(
  db: D1Database,
  empresaId: number,
  funcionarioId: number,
  access: Awaited<ReturnType<typeof getEmployeeSectorAccess>>,
): Promise<boolean> {
  const scope = employeeSectorSql(access, 'f');
  const row = await db
    .prepare(
      `SELECT f.id FROM funcionarios f
       WHERE f.id = ? AND f.empresa_id = ? AND f.deleted_at IS NULL AND ${scope.clause}
       LIMIT 1`,
    )
    .bind(funcionarioId, empresaId, ...scope.bindings)
    .first<{ id: number }>();
  return Boolean(row?.id);
}

const app = new Hono<AppEnv>();

function certificateUploadKind(value: unknown): 'qualificacao' | 'profissional' | null {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();
  if (normalized === 'CERTIFICADO_QUALIFICACAO') return 'qualificacao';
  if (normalized === 'CERTIFICADO_PROFISSIONAL' || normalized === 'CERTIFICADO')
    return 'profissional';
  return null;
}

function originalUploadFilename(file: File, fallback: string): string {
  const raw = String(file.name || '').trim();
  return raw.split(/[\\/]/).pop()?.trim() || fallback;
}

interface Documento {
  id: number;
  uuid: string;
  funcionario_id: number;
  nome_arquivo: string;
  tipo: string;
  tamanho: number;
  r2_key: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  funcionario_nome?: string;
}

interface CategorizedDocument {
  id: number;
  uuid: string;
  nome: string;
  tipo: string;
  tamanho: number;
  url: string;
  dataUpload: string;
  status: string;
  versaoAtual?: boolean;
  substituidoPorId?: number | null;
  origem?: 'documentos' | 'pasta_virtual' | 'ficha_sessao';
  fichaId?: number | null;
  proveniencia?: 'gerado' | 'upload';
}

const PASTA_VIRTUAL_CATEGORIA = {
  QUALIFICACOES: 'Treinamentos e Qualificações',
  AVALIACOES: 'FAPs e Checks',
  FTV: 'Fichas de Treinamento de Voo',
  EXAMES: 'Exames Médicos (ASO, CMA)',
  LICENCAS: 'Licenças e Extratos ANAC',
  SIMULADORES: 'Simuladores',
  DESIGNACOES: 'Designações Operacionais',
  EXPERIENCIA: 'Experiência e Horas de Voo',
  INSTRUTOR_EXAMINADOR: 'Instrutor e Examinador',
  VINCULO: 'Vínculo e Registro Funcional',
  PESSOAIS: 'Documentos Pessoais',
  CURRICULO: 'Currículo Profissional',
  OUTROS: 'Outros',
} as const;

export function normalizarCategoriaLegada(categoria: string | null | undefined): string | null {
  const value = String(categoria || '').trim();
  if (!value) return null;
  const aliases: Record<string, string> = {
    'Certificados de Qualificação': PASTA_VIRTUAL_CATEGORIA.QUALIFICACOES,
    'Certificados Profissionais': PASTA_VIRTUAL_CATEGORIA.QUALIFICACOES,
    Treinamento: PASTA_VIRTUAL_CATEGORIA.QUALIFICACOES,
    'Treinamentos e Qualificações': PASTA_VIRTUAL_CATEGORIA.QUALIFICACOES,
    'Avaliações e Checks': PASTA_VIRTUAL_CATEGORIA.AVALIACOES,
    'FAPs e Checks': PASTA_VIRTUAL_CATEGORIA.AVALIACOES,
    'Exames Médicos (ASO, CMA)': PASTA_VIRTUAL_CATEGORIA.EXAMES,
    Licenças: PASTA_VIRTUAL_CATEGORIA.LICENCAS,
    'Licenças e Extratos ANAC': PASTA_VIRTUAL_CATEGORIA.LICENCAS,
    Simuladores: PASTA_VIRTUAL_CATEGORIA.SIMULADORES,
    'Fichas de Treinamento de Voo': PASTA_VIRTUAL_CATEGORIA.FTV,
    'Designações Operacionais': PASTA_VIRTUAL_CATEGORIA.DESIGNACOES,
    'Experiência e Horas de Voo': PASTA_VIRTUAL_CATEGORIA.EXPERIENCIA,
    'Instrutor e Examinador': PASTA_VIRTUAL_CATEGORIA.INSTRUTOR_EXAMINADOR,
    'Vínculo e Registro Funcional': PASTA_VIRTUAL_CATEGORIA.VINCULO,
    'Documentos Pessoais': PASTA_VIRTUAL_CATEGORIA.PESSOAIS,
    'Currículo Profissional': PASTA_VIRTUAL_CATEGORIA.CURRICULO,
    Outros: PASTA_VIRTUAL_CATEGORIA.OUTROS,
  };
  return aliases[value] || null;
}

export function inferirCategoriaDocumento(
  nomeArquivo: string | null | undefined,
  categoriaLegada?: string | null,
  tipoLegado?: string | null,
  r2Key?: string | null,
  qualificacaoIsCheck?: boolean | number | null,
): string {
  if (qualificacaoIsCheck === true || Number(qualificacaoIsCheck || 0) === 1) {
    return PASTA_VIRTUAL_CATEGORIA.AVALIACOES;
  }

  const categoriaNormalizada = normalizarCategoriaLegada(categoriaLegada);
  if (categoriaNormalizada) return categoriaNormalizada;

  const nomeUpper = String(nomeArquivo || '').toUpperCase();
  const tipoUpper = String(tipoLegado || '').toUpperCase();
  const r2KeyLower = String(r2Key || '').toLowerCase();
  if (
    nomeUpper.startsWith('CERT-') ||
    nomeUpper.startsWith('TREIN-') ||
    r2KeyLower.startsWith('certificados/') ||
    r2KeyLower.includes('/certificados-upload/qualificacao/') ||
    r2KeyLower.includes('/certificados-upload/profissional/')
  ) {
    return PASTA_VIRTUAL_CATEGORIA.QUALIFICACOES;
  }
  if (nomeUpper.startsWith('AVAL-')) return PASTA_VIRTUAL_CATEGORIA.AVALIACOES;
  if (nomeUpper.startsWith('FTV-')) return PASTA_VIRTUAL_CATEGORIA.FTV;
  if (nomeUpper.startsWith('EXAME-')) return PASTA_VIRTUAL_CATEGORIA.EXAMES;
  if (nomeUpper.startsWith('LIC-')) return PASTA_VIRTUAL_CATEGORIA.LICENCAS;
  if (nomeUpper.startsWith('SIM-') || tipoUpper === 'SIMULADOR') {
    return PASTA_VIRTUAL_CATEGORIA.SIMULADORES;
  }
  if (nomeUpper.startsWith('DESIG-')) return PASTA_VIRTUAL_CATEGORIA.DESIGNACOES;
  if (nomeUpper.startsWith('EXP-')) return PASTA_VIRTUAL_CATEGORIA.EXPERIENCIA;
  if (nomeUpper.startsWith('INST-')) return PASTA_VIRTUAL_CATEGORIA.INSTRUTOR_EXAMINADOR;
  if (nomeUpper.startsWith('VINC-')) return PASTA_VIRTUAL_CATEGORIA.VINCULO;
  if (nomeUpper.startsWith('CURR-')) return PASTA_VIRTUAL_CATEGORIA.CURRICULO;
  if (nomeUpper.startsWith('DOC-OUTROS-')) return PASTA_VIRTUAL_CATEGORIA.OUTROS;
  if (nomeUpper.startsWith('DOC-')) return PASTA_VIRTUAL_CATEGORIA.PESSOAIS;
  return PASTA_VIRTUAL_CATEGORIA.OUTROS;
}

type FichaSessaoPastaVirtualRow = {
  id: number;
  uuid: string;
  tipo_sessao: string | null;
  tipo_aeronave: string | null;
  data_sessao: string | null;
  status: string | null;
  aprovado: number | null;
  caminho_arquivo?: string | null;
};

function sanitizeFtvToken(value: string | null | undefined, fallback: string): string {
  return (
    String(value || fallback)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toUpperCase() || fallback
  );
}

export function buildFichaSessaoPastaVirtualDocument(
  ficha: FichaSessaoPastaVirtualRow,
): CategorizedDocument {
  const dataSessao = String(ficha.data_sessao || '').slice(0, 10);
  const dataToken = dataSessao.replace(/-/g, '') || 'SEM_DATA';
  const aeronave = sanitizeFtvToken(ficha.tipo_aeronave, 'AERONAVE');
  const sessao = sanitizeFtvToken(ficha.tipo_sessao, 'SESSAO');

  return {
    id: ficha.id,
    uuid: ficha.uuid || `ftv-${ficha.id}`,
    nome: `FTV-${aeronave}-${sessao}-${dataToken}-${ficha.id}.pdf`,
    tipo: 'FTV',
    tamanho: -1,
    url: `/simuladores/fichas/${ficha.id}/pdf`,
    dataUpload: dataSessao,
    status: 'Válido',
    origem: 'ficha_sessao',
    fichaId: ficha.id,
    proveniencia: 'gerado',
  };
}

function documentVersionKey(document: CategorizedDocument): string {
  if (document.origem === 'ficha_sessao') return `UNVERSIONED:FTV:${document.id}`;

  const cleanName = String(document.nome || '')
    .replace(/\.pdf$/i, '')
    .toUpperCase();
  const parts = cleanName.split('-').filter(Boolean);
  const prefix = parts[0] || String(document.tipo || 'OUTROS').toUpperCase();
  const r2KeyLower = String(document.url || '').toLowerCase();

  if (
    prefix !== 'CERT' &&
    (r2KeyLower.includes('/certificados-upload/qualificacao/') ||
      r2KeyLower.includes('/certificados-upload/profissional/'))
  ) {
    return `UNVERSIONED:${document.id}`;
  }
  if (prefix === 'CERT') return `CERT:${parts[2] || 'SEM_CODIGO'}`;
  if (
    ['AVAL', 'EXAME', 'DOC', 'LIC', 'TREIN', 'VINC', 'DESIG', 'EXP', 'INST', 'CURR'].includes(
      prefix,
    )
  ) {
    const subtype = parts[1] || String(document.tipo || 'OUTROS').toUpperCase();
    if (subtype === 'OUTROS' || subtype === 'OUTRO') return `UNVERSIONED:${document.id}`;
    return `${prefix}:${subtype}`;
  }
  if (prefix === 'FTV') return `UNVERSIONED:FTV:${document.id}`;
  if (prefix === 'SIM') return cleanName.replace(/-\d{8}(?:-[A-Z0-9]{1,12})?$/, '');
  return `${String(document.tipo || prefix).toUpperCase()}:${prefix}`;
}

interface DocumentoListaRow {
  id: number;
  uuid: string;
  nome: string;
  tipo: string;
  tamanho: number;
  r2_key: string;
  dataUpload: string;
  data_vencimento: string | null;
  status: string;
}

async function tableHasColumn(
  db: Env['DB'],
  tableName: string,
  columnName: string,
): Promise<boolean> {
  return (await getSchemaColumns(db, tableName)).has(columnName);
}

/**
 * GET /api/pasta-virtual/by-category/:funcionario_id
 * Retorna documentos agrupados por categoria real (baseado no nome do arquivo)
 */
app.get('/by-category/:funcionario_id', auth(), async (c) => {
  const db = c.env.DB;
  const funcionarioId = parseInt(c.req.param('funcionario_id'));
  const empresaId = getEmpresaId(c);

  if (isNaN(funcionarioId)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const access = await getEmployeeSectorAccess(c, empresaId);
  if (!(await isFuncionarioInScope(db, empresaId, funcionarioId, access))) {
    return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
  }

  try {
    const pvColumns = await getSchemaColumns(db, 'pasta_virtual');
    const pvTipoExpr = pvColumns.has('tipo_documento')
      ? 'pv.tipo_documento'
      : pvColumns.has('tipo')
        ? 'pv.tipo'
        : "'OUTROS'";
    const pvTamanhoExpr = pvColumns.has('tamanho')
      ? 'pv.tamanho'
      : pvColumns.has('arquivo_tamanho')
        ? 'pv.arquivo_tamanho'
        : '0';
    const pvDataUploadExpr = pvColumns.has('dataupload')
      ? 'pv.dataupload'
      : pvColumns.has('created_at')
        ? 'pv.created_at'
        : "datetime('now')";
    const pvDescricaoExpr = pvColumns.has('descricao') ? 'pv.descricao' : 'NULL';
    const pvCategoriaExpr = pvColumns.has('categoria') ? 'pv.categoria' : 'NULL';
    const pvDocumentoIdExpr = pvColumns.has('documento_id') ? 'pv.documento_id' : 'NULL';
    const pvR2KeyExpr = pvColumns.has('caminho_arquivo')
      ? 'pv.caminho_arquivo'
      : pvColumns.has('r2_key')
        ? 'pv.r2_key'
        : "''";

    // Buscar documentos da tabela documentos
    const queryDocumentos = `
      SELECT 
        d.id,
        d.uuid,
        d.nome_arquivo,
        d.tipo,
        d.tamanho,
        d.r2_key,
        d.created_at as dataUpload,
        d.descricao,
        CASE WHEN EXISTS (
          SELECT 1
            FROM qualificacoes_historico qh_check
            JOIN qualificacoes_tipos qt_check
              ON qt_check.id = qh_check.qualificacao_id
             AND qt_check.empresa_id = f.empresa_id
             AND qt_check.deleted_at IS NULL
           WHERE qh_check.certificado_arquivo_id = d.id
             AND qh_check.funcionario_id = d.funcionario_id
             AND qh_check.empresa_id = f.empresa_id
             AND qh_check.deleted_at IS NULL
             AND COALESCE(qt_check.is_check, 0) = 1
        ) THEN 1 ELSE 0 END as qualificacao_is_check,
        'documentos' as origem
      FROM documentos d
      INNER JOIN funcionarios f ON d.funcionario_id = f.id AND f.deleted_at IS NULL
      WHERE d.funcionario_id = ? AND d.deleted_at IS NULL AND f.empresa_id = ?
      ORDER BY d.created_at DESC
    `;

    // Buscar documentos da tabela pasta_virtual (incluindo fichas de simulador)
    const queryPastaVirtual = `
      SELECT 
        pv.id,
        NULL as uuid,
        pv.nome_arquivo,
        ${pvTipoExpr} as tipo,
        ${pvTamanhoExpr} as tamanho,
        ${pvR2KeyExpr} as r2_key,
        ${pvDataUploadExpr} as dataUpload,
        ${pvDescricaoExpr} as descricao,
        ${pvCategoriaExpr} as categoria,
        ${pvDocumentoIdExpr} as documento_id,
        CASE WHEN EXISTS (
          SELECT 1
            FROM qualificacoes_historico qh_check
            JOIN qualificacoes_tipos qt_check
              ON qt_check.id = qh_check.qualificacao_id
             AND qt_check.empresa_id = f.empresa_id
             AND qt_check.deleted_at IS NULL
           WHERE qh_check.id = pv.certificacao_id
             AND qh_check.funcionario_id = pv.funcionario_id
             AND qh_check.empresa_id = f.empresa_id
             AND qh_check.deleted_at IS NULL
             AND COALESCE(qt_check.is_check, 0) = 1
        ) THEN 1 ELSE 0 END as qualificacao_is_check,
        'pasta_virtual' as origem
      FROM pasta_virtual pv
      INNER JOIN funcionarios f ON pv.funcionario_id = f.id AND f.deleted_at IS NULL
      LEFT JOIN documentos canonical_doc
        ON canonical_doc.r2_key = ${pvR2KeyExpr}
       AND canonical_doc.funcionario_id = pv.funcionario_id
       AND canonical_doc.empresa_id = f.empresa_id
      WHERE pv.funcionario_id = ?
        AND pv.deleted_at IS NULL
        AND f.empresa_id = ?
        AND (canonical_doc.id IS NULL OR canonical_doc.deleted_at IS NULL)
      ORDER BY pv.created_at DESC
    `;

    const fichasSessaoTable = await hasSchemaTable(db, 'fichas_sessao');

    const queryFichasTreinamentoVoo = `
      SELECT
        fs.id,
        fs.uuid,
        fs.tipo_sessao,
        fs.tipo_aeronave,
        COALESCE(fs.data_sessao, fs.data_conclusao, substr(fs.created_at, 1, 10)) AS data_sessao,
        fs.status,
        fs.aprovado,
        fs.caminho_arquivo
      FROM fichas_sessao fs
      INNER JOIN funcionarios f ON f.id = fs.colaborador_id_aluno AND f.deleted_at IS NULL
      WHERE fs.colaborador_id_aluno = ?
        AND fs.empresa_id = ?
        AND f.empresa_id = ?
        AND fs.deleted_at IS NULL
        AND (
          COALESCE(fs.aprovado, 0) = 1
          OR UPPER(COALESCE(fs.status, '')) IN ('APROVADO', 'CONCLUIDA', 'CONCLUIDO', 'ARQUIVADA', 'ARQUIVADO')
        )
      ORDER BY date(COALESCE(fs.data_sessao, fs.data_conclusao, fs.created_at)) DESC, fs.id DESC
    `;

    const [docsResult, pvResult, fichasResult] = await Promise.all([
      db.prepare(queryDocumentos).bind(funcionarioId, empresaId).all<{
        id: number;
        uuid: string;
        nome_arquivo: string;
        tipo: string;
        tamanho: number;
        r2_key: string;
        dataUpload: string;
        descricao?: string;
        qualificacao_is_check?: number;
        origem: string;
      }>(),
      db.prepare(queryPastaVirtual).bind(funcionarioId, empresaId).all<{
        id: number;
        uuid: string | null;
        nome_arquivo: string;
        tipo: string;
        tamanho: number;
        r2_key: string;
        dataUpload: string;
        descricao?: string;
        categoria?: string;
        documento_id?: number | null;
        qualificacao_is_check?: number;
        origem: string;
      }>(),
      fichasSessaoTable
        ? db
            .prepare(queryFichasTreinamentoVoo)
            .bind(funcionarioId, empresaId, empresaId)
            .all<FichaSessaoPastaVirtualRow>()
        : Promise.resolve({ results: [] as FichaSessaoPastaVirtualRow[] }),
    ]);

    // Agrupar por categoria baseado no nome do arquivo
    interface CategorizedDocs {
      [category: string]: CategorizedDocument[];
    }

    const categorized: CategorizedDocs = {
      [PASTA_VIRTUAL_CATEGORIA.QUALIFICACOES]: [],
      [PASTA_VIRTUAL_CATEGORIA.AVALIACOES]: [],
      [PASTA_VIRTUAL_CATEGORIA.FTV]: [],
      [PASTA_VIRTUAL_CATEGORIA.EXAMES]: [],
      [PASTA_VIRTUAL_CATEGORIA.LICENCAS]: [],
      [PASTA_VIRTUAL_CATEGORIA.SIMULADORES]: [],
      [PASTA_VIRTUAL_CATEGORIA.DESIGNACOES]: [],
      [PASTA_VIRTUAL_CATEGORIA.EXPERIENCIA]: [],
      [PASTA_VIRTUAL_CATEGORIA.INSTRUTOR_EXAMINADOR]: [],
      [PASTA_VIRTUAL_CATEGORIA.VINCULO]: [],
      [PASTA_VIRTUAL_CATEGORIA.PESSOAIS]: [],
      [PASTA_VIRTUAL_CATEGORIA.CURRICULO]: [],
      [PASTA_VIRTUAL_CATEGORIA.OUTROS]: [],
    };

    // Deduplicate only by canonical linkage/record identity. Generic filenames such as
    // certificado.pdf must not hide unrelated legacy documents.
    const filesMap = new Map<string, { doc: CategorizedDocument; categoria: string }>();
    const canonicalDocumentoIds = new Set((docsResult.results || []).map((doc) => Number(doc.id)));
    const canonicalFichaR2Keys = new Set(
      (fichasResult.results || [])
        .map((ficha) => String(ficha.caminho_arquivo || '').trim())
        .filter(Boolean),
    );
    const canonicalR2Keys = new Set(
      (docsResult.results || []).map((doc) => String(doc.r2_key || '').trim()).filter(Boolean),
    );

    // Processar documentos da tabela documentos primeiro. A classificação é
    // derivada de prefixos canônicos e mantém compatibilidade com nomes antigos.
    (docsResult.results || []).forEach((doc) => {
      if (doc.r2_key && canonicalFichaR2Keys.has(String(doc.r2_key).trim())) return;

      const categoria = inferirCategoriaDocumento(
        doc.nome_arquivo,
        null,
        doc.tipo,
        doc.r2_key,
        doc.qualificacao_is_check,
      );

      filesMap.set(`documentos:${doc.id}`, {
        doc: {
          id: doc.id,
          uuid: doc.uuid,
          nome: doc.nome_arquivo,
          tipo: doc.tipo,
          tamanho: doc.tamanho,
          url: doc.r2_key,
          dataUpload: doc.dataUpload,
          status: 'Válido',
          origem: 'documentos',
          proveniencia: String(doc.r2_key || '').startsWith('certificados/empresa-')
            ? 'gerado'
            : 'upload',
        },
        categoria,
      });
    });

    // Processar documentos da tabela pasta_virtual (apenas se não existirem em documentos).
    (pvResult.results || []).forEach((doc) => {
      // Skip compatibility mirrors of the canonical documentos row. Newer schemas use
      // documento_id; older production schemas are reconciled by exact R2 identity only.
      if (doc.documento_id && canonicalDocumentoIds.has(Number(doc.documento_id))) return;
      if (doc.r2_key && canonicalR2Keys.has(String(doc.r2_key).trim())) return;
      if (doc.r2_key && canonicalFichaR2Keys.has(String(doc.r2_key).trim())) return;

      const categoria = inferirCategoriaDocumento(
        doc.nome_arquivo,
        doc.categoria,
        doc.tipo,
        doc.r2_key,
        doc.qualificacao_is_check,
      );

      filesMap.set(`pasta_virtual:${doc.id}`, {
        doc: {
          id: doc.id,
          uuid: doc.uuid || `pv-${doc.id}`,
          nome: doc.nome_arquivo || 'Documento',
          tipo: doc.tipo || 'OUTROS',
          tamanho: doc.tamanho || 0,
          url: doc.r2_key || '',
          dataUpload: doc.dataUpload || '',
          status: 'Válido',
          origem: 'pasta_virtual',
          proveniencia: String(doc.r2_key || '').startsWith('certificados/empresa-')
            ? 'gerado'
            : 'upload',
        },
        categoria,
      });
    });

    // Fichas finalizadas no módulo de Treinamento de Voo são uma fonte canônica própria.
    // Elas aparecem na Pasta Virtual sem criar uma segunda cópia em documentos/R2.
    (fichasResult.results || []).forEach((ficha) => {
      filesMap.set(`ficha_sessao:${ficha.id}`, {
        doc: buildFichaSessaoPastaVirtualDocument(ficha),
        categoria: PASTA_VIRTUAL_CATEGORIA.FTV,
      });
    });

    // Agrupar documentos por categoria. Dentro de cada categoria/tipo, o upload
    // mais recente é a versão atual; versões anteriores continuam visíveis.
    filesMap.forEach(({ doc, categoria }) => {
      if (!categorized[categoria]) categorized[categoria] = [];
      categorized[categoria].push(doc);
    });

    Object.values(categorized).forEach((documents) => {
      documents.sort((a, b) => String(b.dataUpload).localeCompare(String(a.dataUpload)));
      const latestByType = new Map<string, CategorizedDocument>();
      documents.forEach((document) => {
        const versionKey = documentVersionKey(document);
        const latest = latestByType.get(versionKey);
        if (!latest) {
          document.versaoAtual = true;
          document.substituidoPorId = null;
          latestByType.set(versionKey, document);
        } else {
          document.versaoAtual = false;
          document.status = 'Substituído';
          document.substituidoPorId = latest.id;
        }
      });
    });

    return c.json({
      success: true,
      data: categorized,
    });
  } catch (error) {
    console.error('Erro ao buscar documentos por categoria:', error);
    return c.json({ success: false, error: 'Erro ao buscar documentos' }, 500);
  }
});

/**
 * GET /api/pasta-virtual/:id
 * Busca documentos de um funcionário específico (compatível com hook)
 */
app.get('/:id', auth(), async (c) => {
  const db = c.env.DB;
  const funcionarioId = parseInt(c.req.param('id'));
  const empresaId = getEmpresaId(c);

  if (isNaN(funcionarioId)) {
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  const access = await getEmployeeSectorAccess(c, empresaId);
  if (!(await isFuncionarioInScope(db, empresaId, funcionarioId, access))) {
    return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
  }

  try {
    // Buscar documentos do funcionário
    const query = `
      SELECT 
        d.id,
        d.uuid,
        d.nome_arquivo as nome,
        d.tipo,
        d.tamanho,
        d.r2_key,
        d.created_at as dataUpload,
        d.descricao as data_vencimento,
        'ATIVO' as status
      FROM documentos d
      INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
      WHERE d.funcionario_id = ? AND d.deleted_at IS NULL AND f.empresa_id = ?
      ORDER BY d.created_at DESC
    `;

    const { results } = await db
      .prepare(query)
      .bind(funcionarioId, empresaId)
      .all<DocumentoListaRow>();

    // Adicionar URL de streaming para cada documento
    const arquivosComUrl = (results || []).map((doc) => ({
      ...doc,
      url: `/api/pasta-virtual/stream/${doc.id}`,
      arquivo_url: `/api/pasta-virtual/stream/${doc.id}`,
    }));

    const response: ApiResponse<{ arquivos: unknown[] }> = {
      success: true,
      data: {
        arquivos: arquivosComUrl,
      },
    };

    return c.json(response);
  } catch (error) {
    console.error('Erro ao buscar documentos:', error);
    return c.json({ success: false, error: 'Erro ao buscar documentos' }, 500);
  }
});

/**
 * DELETE /api/pasta-virtual/delete/:id
 * Remove documento (compatível com hook que usa /delete/:id)
 * Tenta deletar de ambas as tabelas: documentos e pasta_virtual
 * EXCLUSÃO EM CASCATA: Remove também de qualificacoes_historico
 */
app.delete('/delete/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const id = parseInt(c.req.param('id'));
  const empresaId = getEmpresaId(c);

  console.log(`[PASTA-VIRTUAL DELETE CASCATA] Iniciando delete do documento ID=${id}`);

  if (isNaN(id)) {
    console.warn('[PASTA-VIRTUAL DELETE] ID inválido');
    return c.json({ success: false, error: 'ID inválido' }, 400);
  }

  // Primeiro, tentar buscar na tabela documentos
  const documento = await db
    .prepare(
      `SELECT d.*
       FROM documentos d
       INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
       WHERE d.id = ? AND d.deleted_at IS NULL AND f.empresa_id = ?`,
    )
    .bind(id, empresaId)
    .first<Documento>();

  let tabela = 'documentos';
  let r2Key: string | null = null;

  if (!documento) {
    // Se não encontrou em documentos, tentar na tabela pasta_virtual
    const pvDoc = await db
      .prepare(
        `SELECT pv.id, pv.caminho_arquivo as r2_key
         FROM pasta_virtual pv
         INNER JOIN funcionarios f ON f.id = pv.funcionario_id AND f.deleted_at IS NULL
         WHERE pv.id = ? AND pv.deleted_at IS NULL AND f.empresa_id = ?`,
      )
      .bind(id, empresaId)
      .first<{ id: number; r2_key: string }>();

    if (pvDoc) {
      tabela = 'pasta_virtual';
      r2Key = pvDoc.r2_key;
    } else {
      console.warn(`[PASTA-VIRTUAL DELETE] Documento ID=${id} não encontrado`);
      return c.json({ success: false, error: 'Documento não encontrado' }, 404);
    }
  } else {
    r2Key = documento.r2_key;
  }

  try {
    const pastaVirtualHasDocumentoId = await tableHasColumn(db, 'pasta_virtual', 'documento_id');

    // EXCLUSÃO EM CASCATA:
    // 1. Soft delete na tabela principal (documentos ou pasta_virtual)
    await db
      .prepare(
        `UPDATE ${tabela}
            SET deleted_at = datetime('now'),
                updated_at = datetime('now')
          WHERE id = ?
            AND empresa_id = ?
            AND deleted_at IS NULL`,
      )
      .bind(id, empresaId)
      .run();

    // 2. Se for documentos, também soft delete em pasta_virtual
    if (tabela === 'documentos' && pastaVirtualHasDocumentoId) {
      console.log(`🗑️  [CASCATA] Verificando pasta_virtual para documento ID ${id}...`);
      const pastaVirtualResult = await db
        .prepare(
          "UPDATE pasta_virtual SET deleted_at = datetime('now') WHERE documento_id = ? AND empresa_id = ? AND deleted_at IS NULL",
        )
        .bind(id, empresaId)
        .run();

      if (pastaVirtualResult.meta.changes > 0) {
        console.log(
          `✅ [CASCATA] ${pastaVirtualResult.meta.changes} registro(s) removido(s) de pasta_virtual`,
        );
      }

      // 3. Limpar referência em qualificacoes_historico
      console.log(
        `🗑️  [CASCATA] Limpando referência de certificado_arquivo_id em qualificacoes_historico...`,
      );
      const historicoResult = await db
        .prepare(
          'UPDATE qualificacoes_historico SET certificado_arquivo_id = NULL WHERE certificado_arquivo_id = ? AND empresa_id = ? AND deleted_at IS NULL',
        )
        .bind(id, empresaId)
        .run();

      if (historicoResult.meta.changes > 0) {
        console.log(
          `✅ [CASCATA] ${historicoResult.meta.changes} registro(s) atualizado(s) em qualificacoes_historico`,
        );
      }
    } else if (tabela === 'documentos') {
      console.log('[CASCATA] pasta_virtual sem coluna documento_id; cascata relacional ignorada');

      const historicoResult = await db
        .prepare(
          'UPDATE qualificacoes_historico SET certificado_arquivo_id = NULL WHERE certificado_arquivo_id = ? AND empresa_id = ? AND deleted_at IS NULL',
        )
        .bind(id, empresaId)
        .run();

      if (historicoResult.meta.changes > 0) {
        console.log(
          `✅ [CASCATA] ${historicoResult.meta.changes} registro(s) atualizado(s) em qualificacoes_historico`,
        );
      }
    } else if (pastaVirtualHasDocumentoId) {
      // Se for pasta_virtual, verificar se há documento relacionado
      const pvDocRef = await db
        .prepare(
          'SELECT documento_id FROM pasta_virtual WHERE id = ? AND empresa_id = ? AND deleted_at IS NOT NULL',
        )
        .bind(id, empresaId)
        .first<{ documento_id: number | null }>();

      if (pvDocRef?.documento_id) {
        console.log(`🗑️  [CASCATA] Removendo documento relacionado ID ${pvDocRef.documento_id}...`);
        await db
          .prepare(
            "UPDATE documentos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
          )
          .bind(pvDocRef.documento_id, empresaId)
          .run();

        // Limpar referência em qualificacoes_historico
        await db
          .prepare(
            'UPDATE qualificacoes_historico SET certificado_arquivo_id = NULL WHERE certificado_arquivo_id = ? AND empresa_id = ? AND deleted_at IS NULL',
          )
          .bind(pvDocRef.documento_id, empresaId)
          .run();
      }
    } else {
      console.log(
        '[CASCATA] pasta_virtual sem coluna documento_id; documento relacionado indisponível',
      );
    }

    // Delete físico no R2 (se tiver r2_key)
    if (r2Key) {
      try {
        await bucket.delete(r2Key);
        console.log(`✅ [R2] Arquivo deletado: ${r2Key}`);
      } catch {
        console.warn('⚠️  Arquivo não encontrado no R2:', r2Key);
      }
    }

    console.log(`✅ [PASTA-VIRTUAL DELETE] Documento ID=${id} removido com cascata completa`);

    try {
      const userId = String(c.get('userId') || '0');
      await registrarAuditoria({
        db,
        tabela,
        acao: 'DELETE',
        registro_id: id,
        usuario_id: userId,
        ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
        user_agent: c.req.header('user-agent'),
      });
    } catch {
      /* audit never fails main op */
    }

    try {
      const userId = String(c.get('userId') || '0');
      await publishDomainEvent(db, 'pasta_virtual', 'DOCUMENTO_EXCLUIDO', {
        empresa_id: String(empresaId),
        origem_modulo: 'pasta_virtual',
        origem_usuario_id: userId,
        funcionario_id: documento?.funcionario_id ? String(documento.funcionario_id) : undefined,
        documento_id: id,
        r2_key: r2Key,
      });
    } catch (error) {
      console.error('domain_event_error', error);
    }

    const response: ApiResponse = {
      success: true,
      message: 'Documento removido com sucesso (exclusão em cascata)',
    };

    return c.json(response);
  } catch (error) {
    console.error('[PASTA-VIRTUAL DELETE] Erro:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Erro ao remover documento',
    };
    return c.json(response, 500);
  }
});

/**
 * GET /api/pasta-virtual
 * Lista documentos com filtros
 *
 * Query params:
 * - funcionario_id: filtrar por funcionário
 * - tipo: filtrar por tipo (pdf, image, etc)
 * - page, limit: paginação
 */
app.get('/', auth(), async (c) => {
  const db = c.env.DB;
  const empresaId = getEmpresaId(c);

  const funcionarioId = c.req.query('funcionario_id');
  const tipo = c.req.query('tipo');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');

  const access = await getEmployeeSectorAccess(c, empresaId);
  const employeeScope = employeeSectorSql(access, 'f');
  const whereClauses: string[] = ['d.deleted_at IS NULL', 'f.empresa_id = ?', employeeScope.clause];
  const bindings: unknown[] = [empresaId, ...employeeScope.bindings];

  if (funcionarioId) {
    whereClauses.push('d.funcionario_id = ?');
    bindings.push(parseInt(funcionarioId));
  }

  if (tipo) {
    whereClauses.push('d.tipo LIKE ?');
    bindings.push(`${tipo}%`);
  }

  const whereClause = whereClauses.join(' AND ');

  // Contar total
  const totalQuery = `
    SELECT COUNT(*) as total
    FROM documentos d
    INNER JOIN funcionarios f ON d.funcionario_id = f.id AND f.deleted_at IS NULL
    WHERE ${whereClause}
  `;

  const totalResult = await db
    .prepare(totalQuery)
    .bind(...bindings)
    .first<{ total: number }>();

  const total = totalResult?.total || 0;
  const pagination = calculatePagination({ page, limit }, total);

  // Query principal com JOIN
  const query = `
    SELECT 
      d.*,
      f.nome as funcionario_nome
    FROM documentos d
    INNER JOIN funcionarios f ON d.funcionario_id = f.id AND f.deleted_at IS NULL
    WHERE ${whereClause}
    ORDER BY d.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await db
    .prepare(query)
    .bind(...bindings, pagination.limit, pagination.offset)
    .all<Documento>();

  // Adicionar URL de streaming para cada documento
  const documentosComUrl = (results || []).map((doc) => ({
    ...doc,
    url: `/api/pasta-virtual/stream/${doc.id}`,
    arquivo_url: `/api/pasta-virtual/stream/${doc.id}`,
  }));

  const response: PaginatedResponse = {
    success: true,
    data: documentosComUrl,
    pagination,
  };

  return c.json(response);
});

/**
 * POST /api/pasta-virtual/upload
 * Upload arquivo para R2 e registra no D1
 *
 * Body (multipart/form-data):
 * - file: arquivo (obrigatório)
 * - funcionario_id: número (obrigatório)
 * - descricao: string (opcional)
 */
app.post('/upload', auth(), async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const employeeScope = employeeSectorSql(access, 'f');

  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const funcionarioIdStr = formData.get('funcionario_id') as string | null;
    const tipoDocumento = (formData.get('tipo_documento') as string) || 'OUTRO';
    const subTipo = (formData.get('sub_tipo') as string) || null;
    const descricao = (formData.get('descricao') as string) || null;
    const dataRealizacaoStr = (formData.get('data_realizacao') as string) || null;
    const uploadOriginalSize = String(formData.get('upload_original_size') || '').trim();
    const uploadFinalSize = String(formData.get('upload_final_size') || '').trim();
    const uploadOptimized = String(formData.get('upload_optimized') || '') === '1';
    const uploadPreservedSignature =
      String(formData.get('upload_preserved_signature') || '') === '1';

    if (!file) {
      return c.json({ success: false, error: 'Campo "file" é obrigatório' }, 400);
    }

    if (!funcionarioIdStr) {
      return c.json({ success: false, error: 'Campo "funcionario_id" é obrigatório' }, 400);
    }

    const funcionarioId = parseInt(funcionarioIdStr);

    if (isNaN(funcionarioId)) {
      return c.json({ success: false, error: 'funcionario_id deve ser um número válido' }, 400);
    }

    // Validar PDF
    const { validarPDF, validarAssinaturaPDF } = await import('../utils/nomenclatura-padronizada');
    const validacao = validarPDF(file);
    if (!validacao.valido) {
      return c.json({ success: false, error: validacao.erro }, 400);
    }

    // Buscar funcionário dentro do tenant e do escopo autorizado antes de qualquer operação R2.
    const funcionario = await db
      .prepare(
        `SELECT f.cpf, f.nome
           FROM funcionarios f
          WHERE f.id = ?
            AND f.empresa_id = ?
            AND f.deleted_at IS NULL
            AND ${employeeScope.clause}
          LIMIT 1`,
      )
      .bind(funcionarioId, empresaId, ...employeeScope.bindings)
      .first<{ cpf: string | null; nome: string | null }>();

    if (!funcionario) {
      return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
    }

    // Remover formatação do CPF (deixar apenas números se presente)
    const cpfLimpo = (funcionario.cpf || '').replace(/\D/g, '');

    // Parse data de realização (se fornecida, senão usa data atual do upload)
    let dataRealizacao: Date;
    if (dataRealizacaoStr) {
      dataRealizacao = new Date(dataRealizacaoStr);
      // Validar se é data válida
      if (isNaN(dataRealizacao.getTime())) {
        return c.json({ success: false, error: 'data_realizacao inválida' }, 400);
      }
    } else {
      // Para uploads na pasta virtual sem data específica, usa data do upload
      // (diferente de certificados de qualificação que DEVEM ter data da qualificação)
      dataRealizacao = new Date();
    }

    // Gerar nome padronizado
    const { gerarNomeArquivoPadronizado, gerarChaveR2 } =
      await import('../utils/nomenclatura-padronizada');

    const nomeFuncionario = funcionario.nome || 'SEM_NOME';

    const uuid = crypto.randomUUID();
    const tipoNormalizado = normalizarTipoDocumento(tipoDocumento);
    const kindCertificado = certificateUploadKind(tipoDocumento);
    const nomeArquivoPadronizado = gerarNomeArquivoPadronizado({
      tipo: tipoNormalizado,
      nomeFuncionario: nomeFuncionario,
      cpf: cpfLimpo,
      data: dataRealizacao,
      codigo: subTipo || undefined,
      subTipo: subTipo || undefined,
      uuid,
    });
    const nomeArquivoPersistido = nomeArquivoPadronizado;

    const r2Key = kindCertificado
      ? `funcionarios/${funcionarioId}/certificados-upload/${kindCertificado}/${uuid}.pdf`
      : gerarChaveR2(funcionarioId, nomeArquivoPadronizado);

    // Converter File para Uint8Array (mantém PDF original em binário puro)
    const fileBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(fileBuffer);
    const validacaoConteudo = validarAssinaturaPDF(uint8Array);
    if (!validacaoConteudo.valido) {
      return c.json({ success: false, error: validacaoConteudo.erro }, 400);
    }

    const fileType = 'application/pdf';
    const fileSize = uint8Array.byteLength;

    // Calcular hash SHA-256 para verificar integridade
    const hashBuffer = await crypto.subtle.digest('SHA-256', uint8Array);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Upload para R2 (preserva conteúdo original do PDF em formato binário)
    await bucket.put(r2Key, uint8Array, {
      httpMetadata: {
        contentType: fileType,
      },
      customMetadata: {
        funcionario_id: funcionarioIdStr,
        original_name: originalUploadFilename(file, nomeArquivoPersistido),
        nome_padronizado: nomeArquivoPersistido,
        tipo_documento: tipoDocumento,
        sub_tipo: subTipo || '',
        categoria_funcional: normalizarTipoDocumento(tipoDocumento),
        uploaded_at: new Date().toISOString(),
        file_size: fileSize.toString(),
        original_file_size: uploadOriginalSize || fileSize.toString(),
        optimized_file_size: uploadFinalSize || fileSize.toString(),
        pdf_optimized: uploadOptimized ? '1' : '0',
        preserved_digital_signature: uploadPreservedSignature ? '1' : '0',
        sha256_hash: hashHex,
      },
    });

    // Verificar se tabela documentos existe antes de inserir
    const tableCheck = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='documentos'")
      .first();

    if (!tableCheck) {
      // Tabela não existe - fazer rollback do objeto no R2 para evitar órfãos
      await bucket.delete(r2Key);
      console.warn('[pasta-virtual/upload] Tabela documentos não existe - upload revertido no R2');
      return c.json(
        {
          success: false,
          error: 'Tabela documentos não encontrada',
          details:
            'Upload revertido no R2 para evitar inconsistência. Execute a migration CREATE_TABLE_DOCUMENTOS_R2.sql',
        },
        500,
      );
    }

    // Registrar no D1
    const query = `
      INSERT INTO documentos (
        uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key, 
        descricao, sha256_hash, empresa_id, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;

    let result;
    try {
      try {
        result = await db
          .prepare(query)
          .bind(
            uuid,
            funcionarioId,
            nomeArquivoPersistido,
            fileType,
            fileSize,
            r2Key,
            descricao,
            hashHex,
            empresaId,
          )
          .run();
      } catch (insertError) {
        const errorMsg = String(insertError);
        if (!errorMsg.includes('no column named sha256_hash')) throw insertError;

        console.warn(
          '[pasta-virtual/upload] Coluna sha256_hash não existe ainda, inserindo sem hash',
        );
        const queryNoHash = `
          INSERT INTO documentos (
            uuid, funcionario_id, nome_arquivo, tipo, tamanho, r2_key,
            descricao, empresa_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `;
        result = await db
          .prepare(queryNoHash)
          .bind(
            uuid,
            funcionarioId,
            nomeArquivoPersistido,
            fileType,
            fileSize,
            r2Key,
            descricao,
            empresaId,
          )
          .run();
      }
    } catch (insertError) {
      try {
        await bucket.delete(r2Key);
      } catch (rollbackError) {
        console.error('[pasta-virtual/upload] Falha ao reverter objeto R2:', rollbackError);
      }
      throw insertError;
    }

    const response: ApiResponse<{ id: number; uuid: string; r2_key: string }> = {
      success: true,
      data: {
        id: result.meta.last_row_id,
        uuid,
        r2_key: r2Key,
      },
      message: 'Arquivo enviado com sucesso',
    };

    try {
      const userId = String(c.get('userId') || '0');
      await registrarAuditoria({
        db,
        tabela: 'documentos',
        acao: 'INSERT',
        registro_id: result.meta.last_row_id,
        usuario_id: userId,
        dados_novos: { nome_arquivo: nomeArquivoPersistido, tipo: fileType, r2_key: r2Key },
        ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
        user_agent: c.req.header('user-agent'),
      });
    } catch {
      /* audit never fails main op */
    }

    try {
      const userId = String(c.get('userId') || '0');
      await publishDomainEvent(db, 'pasta_virtual', 'DOCUMENTO_ENVIADO', {
        empresa_id: String(empresaId),
        origem_modulo: 'pasta_virtual',
        origem_usuario_id: userId,
        funcionario_id: String(funcionarioId),
        documento_id: String(result.meta.last_row_id),
        r2_key: r2Key,
        tipo_documento: tipoDocumento,
      });

      if (
        normalizarTipoDocumento(tipoDocumento) === 'EXAME_MEDICO' &&
        String(subTipo || '').toUpperCase() === 'CMA'
      ) {
        await publishDomainEvent(db, 'pasta_virtual', 'DOCUMENTO_CMA_DETECTADO', {
          empresa_id: empresaId,
          origem_modulo: 'pasta_virtual',
          origem_usuario_id: userId,
          funcionario_id: String(funcionarioId),
          documento_id: String(result.meta.last_row_id),
          r2_key: r2Key,
          tipo_documento: tipoDocumento,
        });
      }
    } catch (error) {
      console.error('domain_event_error', error);
    }

    return c.json(response, 201);
  } catch (error) {
    console.error('[pasta-virtual/upload] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    // Se for erro de "no such table", tentar criar a tabela
    if (errorMessage.includes('no such table: documentos')) {
      console.error('[pasta-virtual/upload] Tabela documentos não existe');
      return c.json(
        {
          success: false,
          error: 'Tabela documentos não encontrada',
          details: 'Execute a migration CREATE_TABLE_DOCUMENTOS_R2.sql',
        },
        500,
      );
    }

    const response: ApiResponse = {
      success: false,
      error: `Erro ao enviar arquivo: ${errorMessage}`,
    };
    return c.json(response, 500);
  }
});

/**
 * GET /api/pasta-virtual/download/:id
 * Gera signed URL para download do arquivo
 */
app.get('/download/:id', auth(), async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const id = parseInt(c.req.param('id'));
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const employeeScope = employeeSectorSql(access, 'f');

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Buscar documento
  const documento = await db
    .prepare(
      `SELECT d.*
       FROM documentos d
       INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
       WHERE d.id = ?
         AND d.deleted_at IS NULL
         AND f.empresa_id = ?
         AND ${employeeScope.clause}`,
    )
    .bind(id, empresaId, ...employeeScope.bindings)
    .first<Documento>();

  if (!documento) {
    notFound('Documento não encontrado');
  }

  try {
    // Gerar signed URL (válida por 1 hora)
    const object = await bucket.get(documento.r2_key);

    if (!object) {
      notFound('Arquivo não encontrado no R2');
    }

    // R2 não tem signed URLs nativas, retornar stream direto
    // Alternativa: retornar presigned URL via custom domain
    const response: ApiResponse<{
      url: string;
      nome_arquivo: string;
      tipo: string;
      tamanho: number;
    }> = {
      success: true,
      data: {
        url: `pasta-virtual/stream/${id}`, // Endpoint auxiliar para streaming (sem /api, será adicionado pelo frontend via API_BASE_URL)
        nome_arquivo: documento.nome_arquivo,
        tipo: documento.tipo,
        tamanho: documento.tamanho,
      },
      message: 'Use a URL retornada para download',
    };

    return c.json(response);
  } catch (error) {
    console.error('Erro ao gerar URL:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Erro ao gerar URL de download',
    };
    return c.json(response, 500);
  }
});

/**
 * GET /api/pasta-virtual/stream/:id
 * Faz streaming direto do arquivo (auxiliar para download)
 */
app.get('/stream/:id', auth(), async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const id = parseInt(c.req.param('id'));
  const empresaId = getEmpresaId(c);
  const access = await getEmployeeSectorAccess(c, empresaId);
  const employeeScope = employeeSectorSql(access, 'f');

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Buscar documento
  const documento = await db
    .prepare(
      `SELECT d.*
       FROM documentos d
       INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
       WHERE d.id = ?
         AND d.deleted_at IS NULL
         AND f.empresa_id = ?
         AND ${employeeScope.clause}`,
    )
    .bind(id, empresaId, ...employeeScope.bindings)
    .first<Documento>();

  if (!documento) {
    notFound('Documento não encontrado');
  }

  try {
    const object = await bucket.get(documento.r2_key);

    if (!object) {
      notFound('Arquivo não encontrado no R2');
    }

    // Preserve the R2 body as a stream instead of buffering the whole object.
    const responseBody = object.body || new Uint8Array(await object.arrayBuffer());

    // Retornar stream direto do R2 (o conteúdo já é binário puro)
    // NOTA: Removida lógica de decode base64 que causava corrupção de PDFs
    const contentType = documento.tipo || 'application/octet-stream';
    const isPdf = contentType.toLowerCase().includes('pdf');
    const safeFileName = String(documento.nome_arquivo || 'arquivo').replace(/"/g, '');
    const encodedFileName = encodeURIComponent(safeFileName);
    const forceDownload = c.req.query('download') === '1';
    const origin = c.req.header('Origin');
    const resolvedOrigin = resolveAllowedOrigin(origin, c.env.CORS_ORIGINS);

    return new Response(responseBody, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${!forceDownload && isPdf ? 'inline' : 'attachment'}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`,
        'Content-Length': String(documento.tamanho || object.size),
        'Cache-Control': 'private, max-age=3600',
        'Access-Control-Allow-Origin': resolvedOrigin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Content-Type',
        Vary: 'Origin',
      },
    });
  } catch (error) {
    console.error('Erro no streaming:', error);
    return c.json({ success: false, error: 'Erro ao baixar arquivo' }, 500);
  }
});

/**
 * POST /api/pasta-virtual/:id/rename-canonical
 * Normaliza somente o nome visível/baixado do documento histórico.
 * O r2_key permanece estável para preservar vínculos, hashes e objetos físicos.
 */
app.post('/:id/rename-canonical', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param('id'));
  const empresaId = getEmpresaId(c);
  if (!Number.isInteger(id) || id <= 0) badRequest('ID inválido');

  const body = await c.req.json<{
    tipo_documento?: string;
    data_documento?: string;
    codigo?: string;
    sub_tipo?: string;
    expected_current_name?: string;
  }>();
  const dataDocumento = new Date(String(body.data_documento || ''));
  if (Number.isNaN(dataDocumento.getTime())) badRequest('Data do documento inválida');

  const documento = await db
    .prepare(
      `SELECT d.id, d.uuid, d.funcionario_id, d.nome_arquivo, d.tipo, d.tamanho, d.r2_key,
              f.nome AS funcionario_nome
         FROM documentos d
         INNER JOIN funcionarios f ON f.id = d.funcionario_id
        WHERE d.id = ? AND d.empresa_id = ? AND f.empresa_id = ?
          AND d.deleted_at IS NULL AND f.deleted_at IS NULL
        LIMIT 1`,
    )
    .bind(id, empresaId, empresaId)
    .first<Documento & { funcionario_nome: string }>();
  if (!documento) notFound('Documento não encontrado');

  const expectedCurrentName = String(body.expected_current_name || '').trim();
  if (expectedCurrentName && expectedCurrentName !== documento.nome_arquivo) {
    return c.json(
      { success: false, error: 'Documento mudou durante o preflight; operação cancelada' },
      409,
    );
  }

  const tipo = normalizarTipoDocumento(body.tipo_documento || documento.tipo);
  const nomeArquivo = gerarNomeArquivoPadronizado({
    tipo,
    nomeFuncionario: documento.funcionario_nome,
    codigo: String(body.codigo || '').trim() || undefined,
    subTipo: String(body.sub_tipo || '').trim() || undefined,
    data: dataDocumento,
    uuid: documento.uuid,
  });
  if (nomeArquivo === documento.nome_arquivo) {
    return c.json({
      success: true,
      data: { id, nome_arquivo: nomeArquivo, r2_key: documento.r2_key, renamed: false },
    });
  }

  const update = await db
    .prepare(
      `UPDATE documentos
          SET nome_arquivo = ?, updated_at = datetime('now')
        WHERE id = ? AND empresa_id = ? AND nome_arquivo = ? AND deleted_at IS NULL`,
    )
    .bind(nomeArquivo, id, empresaId, documento.nome_arquivo)
    .run();
  if (Number(update.meta?.changes || 0) !== 1) {
    return c.json(
      { success: false, error: 'Documento mudou durante a renomeação; operação cancelada' },
      409,
    );
  }

  await registrarAuditoria({
    db,
    tabela: 'documentos',
    acao: 'UPDATE',
    registro_id: id,
    usuario_id: String(c.get('userId') || '0'),
    dados_anteriores: { nome_arquivo: documento.nome_arquivo, r2_key: documento.r2_key },
    dados_novos: {
      nome_arquivo: nomeArquivo,
      r2_key: documento.r2_key,
      motivo: 'RENOMEACAO_CANONICA',
    },
    ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
    user_agent: c.req.header('user-agent'),
  });

  return c.json({
    success: true,
    data: { id, nome_arquivo: nomeArquivo, r2_key: documento.r2_key, renamed: true },
  });
});

/**
 * DELETE /api/pasta-virtual/:id
 * Remove documento (soft delete no D1 + delete no R2)
 */
app.delete('/:id', auth(), requireRole('admin'), async (c) => {
  const db = c.env.DB;
  const bucket = c.env.BUCKET;
  const id = parseInt(c.req.param('id'));
  const empresaId = getEmpresaId(c);

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Buscar documento antes de deletar
  const documento = await db
    .prepare(
      `SELECT d.*
       FROM documentos d
       INNER JOIN funcionarios f ON f.id = d.funcionario_id AND f.deleted_at IS NULL
       WHERE d.id = ? AND d.deleted_at IS NULL AND f.empresa_id = ?`,
    )
    .bind(id, empresaId)
    .first<Documento>();

  if (!documento) {
    notFound('Documento não encontrado');
  }

  try {
    // Soft delete no D1
    await db
      .prepare(
        "UPDATE documentos SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL",
      )
      .bind(id, empresaId)
      .run();

    // D1 is the source of visibility. A transient R2 cleanup failure must not
    // turn a successful soft-delete into a false failure response.
    try {
      await bucket.delete(documento.r2_key);
    } catch (r2Error) {
      console.error('pasta_virtual_r2_delete_failed', {
        documentoId: id,
        r2Key: documento.r2_key,
        error: r2Error instanceof Error ? r2Error.message : String(r2Error),
      });
    }

    try {
      const userId = String(c.get('userId') || '0');
      await registrarAuditoria({
        db,
        tabela: 'documentos',
        acao: 'DELETE',
        registro_id: id,
        usuario_id: userId,
        dados_anteriores: { nome_arquivo: documento.nome_arquivo, r2_key: documento.r2_key },
        ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
        user_agent: c.req.header('user-agent'),
      });
    } catch {
      /* audit never fails main op */
    }

    const response: ApiResponse = {
      success: true,
      message: 'Documento removido com sucesso',
    };

    return c.json(response);
  } catch (error) {
    console.error('Erro ao deletar:', error);
    const response: ApiResponse = {
      success: false,
      error: 'Erro ao remover documento',
    };
    return c.json(response, 500);
  }
});

app.route('/', pastaVirtualExtraRoutes);

export default app;
