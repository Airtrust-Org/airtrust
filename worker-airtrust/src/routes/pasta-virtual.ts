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
import { jsonOk, jsonError } from '../middleware/response';
import { AppError } from '../utils/errors';
import type { Env, ApiResponse, PaginatedResponse } from '../types';
import { calculatePagination } from '../utils/db';
import { notFound, badRequest } from '../middleware/error-handler';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { getEmpresaId } from '../middleware/tenant';
import { registrarAuditoria } from '../utils/auditoria';
import type { TipoDocumento } from '../utils/nomenclatura-padronizada';
import { publishDomainEvent } from '../shared/domainEvents';
import { resolveAllowedOrigin } from '../config/allowed-origins';
import pastaVirtualExtraRoutes from './pasta-virtual-extra';

const app = new Hono<{ Bindings: Env }>();

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

async function tableHasColumn(
  db: Env['DB'],
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const columns = await db.prepare(`PRAGMA table_info(${tableName})`).all<{ name: string }>();
  return (columns.results || []).some((column) => column.name === columnName);
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

  try {
    const pvCols = await db.prepare("PRAGMA table_info('pasta_virtual')").all<{ name: string }>();
    const pvColumns = new Set((pvCols.results || []).map((col) => col.name));
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
        'pasta_virtual' as origem
      FROM pasta_virtual pv
      INNER JOIN funcionarios f ON pv.funcionario_id = f.id AND f.deleted_at IS NULL
      WHERE pv.funcionario_id = ? AND pv.deleted_at IS NULL AND f.empresa_id = ?
      ORDER BY pv.created_at DESC
    `;

    const [docsResult, pvResult] = await Promise.all([
      db.prepare(queryDocumentos).bind(funcionarioId, empresaId).all<{
        id: number;
        uuid: string;
        nome_arquivo: string;
        tipo: string;
        tamanho: number;
        r2_key: string;
        dataUpload: string;
        descricao?: string;
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
        origem: string;
      }>(),
    ]);

    // Agrupar por categoria baseado no nome do arquivo
    interface CategorizedDocs {
      [category: string]: Array<{
        id: number;
        uuid: string;
        nome: string;
        tipo: string;
        tamanho: number;
        url: string;
        dataUpload: string;
        status: string;
      }>;
    }

    const categorized: CategorizedDocs = {
      'Certificados de Qualificação': [],
      'Exames Médicos (ASO, CMA)': [],
      'Certificados Profissionais': [],
      'Documentos Pessoais': [],
      Simuladores: [],
      Licenças: [],
      Treinamento: [],
      Outros: [],
    };

    // Usar Map para deduplica por nome_arquivo (prioriza documentos)
    const filesMap = new Map<string, { doc: any; categoria: string }>();

    // Processar documentos da tabela documentos primeiro
    (docsResult.results || []).forEach((doc) => {
      const nomeUpper = doc.nome_arquivo.toUpperCase();
      let categoria = 'Outros';

      if (nomeUpper.startsWith('CERT-')) {
        categoria = 'Certificados de Qualificação';
      } else if (nomeUpper.startsWith('EXAME-')) {
        categoria = 'Exames Médicos (ASO, CMA)';
      } else if (nomeUpper.startsWith('LIC-')) {
        categoria = 'Licenças';
      } else if (nomeUpper.startsWith('TREIN-')) {
        categoria = 'Treinamento';
      } else if (nomeUpper.startsWith('SIM-')) {
        categoria = 'Simuladores';
      } else if (nomeUpper.startsWith('DOC-OUTROS-')) {
        categoria = 'Documentos Pessoais';
      } else if (nomeUpper.startsWith('DOC-')) {
        categoria = 'Documentos Pessoais';
      }

      filesMap.set(doc.nome_arquivo, {
        doc: {
          id: doc.id,
          uuid: doc.uuid,
          nome: doc.nome_arquivo,
          tipo: doc.tipo,
          tamanho: doc.tamanho,
          url: doc.r2_key,
          dataUpload: doc.dataUpload,
          status: 'Válido',
        },
        categoria,
      });
    });

    // Processar documentos da tabela pasta_virtual (apenas se não existirem em documentos)
    (pvResult.results || []).forEach((doc) => {
      // Pular se já existe em documentos
      if (filesMap.has(doc.nome_arquivo)) {
        return;
      }

      // Usar categoria do registro ou inferir do nome
      let categoria = doc.categoria || 'Outros';

      if (!doc.categoria) {
        const nomeUpper = (doc.nome_arquivo || '').toUpperCase();
        if (nomeUpper.startsWith('SIM-') || doc.tipo === 'SIMULADOR') {
          categoria = 'Simuladores';
        } else if (nomeUpper.startsWith('CERT-')) {
          categoria = 'Certificados de Qualificação';
        }
      }

      filesMap.set(doc.nome_arquivo, {
        doc: {
          id: doc.id,
          uuid: doc.uuid || `pv-${doc.id}`,
          nome: doc.nome_arquivo || 'Documento',
          tipo: doc.tipo || 'OUTROS',
          tamanho: doc.tamanho || 0,
          url: doc.r2_key || '',
          dataUpload: doc.dataUpload || '',
          status: 'Válido',
        },
        categoria,
      });
    });

    // Agrupar documentos por categoria
    filesMap.forEach(({ doc, categoria }) => {
      if (!categorized[categoria]) {
        categorized[categoria] = [];
      }
      categorized[categoria].push(doc);
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

    const { results } = await db.prepare(query).bind(funcionarioId, empresaId).all();

    // Adicionar URL de streaming para cada documento
    const arquivosComUrl = (results || []).map((doc: any) => ({
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
app.delete('/delete/:id', auth(), async (c) => {
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
      const userId = String((c.get as any)('userId') || '0');
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
      const userId = String((c.get as any)('userId') || '0');
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

  const whereClauses: string[] = ['d.deleted_at IS NULL', 'f.empresa_id = ?'];
  const bindings: unknown[] = [empresaId];

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

  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const funcionarioIdStr = formData.get('funcionario_id') as string | null;
    const tipoDocumento = (formData.get('tipo_documento') as string) || 'OUTRO';
    const subTipo = (formData.get('sub_tipo') as string) || null;
    const descricao = (formData.get('descricao') as string) || null;
    const dataRealizacaoStr = (formData.get('data_realizacao') as string) || null;

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
    const { validarPDF } = await import('../utils/nomenclatura-padronizada');
    const validacao = validarPDF(file);
    if (!validacao.valido) {
      return c.json({ success: false, error: validacao.erro }, 400);
    }

    // Buscar funcionário dentro do tenant antes de qualquer operação R2.
    const empresaId = getEmpresaId(c);
    const funcionario = await db
      .prepare('SELECT cpf, nome FROM funcionarios WHERE id = ? AND empresa_id = ? AND deleted_at IS NULL')
      .bind(funcionarioId, empresaId)
      .first<{ cpf: string; nome: string }>();

    if (!funcionario) {
      return c.json({ success: false, error: 'Funcionário não encontrado' }, 404);
    }

    // Remover formatação do CPF (deixar apenas números)
    const cpfLimpo = funcionario.cpf.replace(/\D/g, '');

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
    const nomeArquivoPadronizado = gerarNomeArquivoPadronizado({
      tipo: tipoDocumento as TipoDocumento,
      nomeFuncionario: nomeFuncionario, // Novo padrão
      cpf: cpfLimpo, // Mantido para compatibilidade
      data: dataRealizacao, // Usa data de realização da qualificação
      codigo: subTipo || undefined, // Para CERTIFICADO_QUALIFICACAO
      subTipo: subTipo || undefined, // Para outros tipos
      uuid,
    });

    // Gerar chave R2
    const r2Key = gerarChaveR2(funcionarioId, nomeArquivoPadronizado);

    // Converter File para Uint8Array (mantém PDF original em binário puro)
    const fileBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(fileBuffer);
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
        original_name: file.name,
        nome_padronizado: nomeArquivoPadronizado,
        tipo_documento: tipoDocumento,
        uploaded_at: new Date().toISOString(),
        file_size: fileSize.toString(),
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
      result = await db
        .prepare(query)
        .bind(
          uuid,
          funcionarioId,
          nomeArquivoPadronizado,
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
      // Se coluna sha256_hash não existir, tentar sem ela
      if (errorMsg.includes('no column named sha256_hash')) {
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
            nomeArquivoPadronizado,
            fileType,
            fileSize,
            r2Key,
            descricao,
            empresaId,
          )
          .run();
      } else {
        throw insertError;
      }
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
      const userId = String((c.get as any)('userId') || '0');
      await registrarAuditoria({
        db,
        tabela: 'documentos',
        acao: 'INSERT',
        registro_id: result.meta.last_row_id,
        usuario_id: userId,
        dados_novos: { nome_arquivo: nomeArquivoPadronizado, tipo: fileType, r2_key: r2Key },
        ip_address: c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for'),
        user_agent: c.req.header('user-agent'),
      });
    } catch {
      /* audit never fails main op */
    }

    try {
      const userId = String((c.get as any)('userId') || '0');
      await publishDomainEvent(db, 'pasta_virtual', 'DOCUMENTO_ENVIADO', {
        empresa_id: String(empresaId),
        origem_modulo: 'pasta_virtual',
        origem_usuario_id: userId,
        funcionario_id: String(funcionarioId),
        documento_id: String(result.meta.last_row_id),
        r2_key: r2Key,
        tipo_documento: tipoDocumento,
      });

      if (String(tipoDocumento).toUpperCase() === 'CMA') {
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

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Buscar documento
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

  if (isNaN(id)) {
    badRequest('ID inválido');
  }

  // Buscar documento
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
    const object = await bucket.get(documento.r2_key);

    if (!object) {
      notFound('Arquivo não encontrado no R2');
    }

    // Ler o conteúdo do arquivo
    let fileBuffer: Uint8Array;

    if (object.body instanceof ReadableStream) {
      // Se for stream, ler como Uint8Array
      const reader = object.body.getReader();
      const chunks: Uint8Array[] = [];
      let result = await reader.read();

      while (!result.done) {
        chunks.push(result.value);
        result = await reader.read();
      }

      // Combinar chunks em um único Uint8Array
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      fileBuffer = combined;
    } else {
      // Se for Blob ou ArrayBuffer direto, converter para Uint8Array
      fileBuffer = new Uint8Array(await object.arrayBuffer());
    }

    // Retornar stream direto do R2 (o conteúdo já é binário puro)
    // NOTA: Removida lógica de decode base64 que causava corrupção de PDFs
    const contentType = documento.tipo || 'application/octet-stream';
    const isPdf = contentType.toLowerCase().includes('pdf');
    const safeFileName = String(documento.nome_arquivo || 'arquivo').replace(/"/g, '');
    const encodedFileName = encodeURIComponent(safeFileName);
    const forceDownload = c.req.query('download') === '1';
    const origin = c.req.header('Origin');
    const resolvedOrigin = resolveAllowedOrigin(origin, c.env.CORS_ORIGINS);

    return new Response(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${!forceDownload && isPdf ? 'inline' : 'attachment'}; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`,
        'Content-Length': fileBuffer.byteLength.toString(),
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

    // Delete físico no R2
    await bucket.delete(documento.r2_key);

    try {
      const userId = String((c.get as any)('userId') || '0');
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
