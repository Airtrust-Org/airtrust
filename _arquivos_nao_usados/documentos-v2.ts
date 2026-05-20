import { Hono } from 'hono';
import { verify } from 'hono/jwt';
import type { Env } from '../../types/env';

const app = new Hono<{ Bindings: Env }>();

// Middleware de autenticação JWT
app.use('*', async (c, next) => {
  try {
    const auth = c.req.header('Authorization');

    if (!auth || !auth.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    const token = auth.substring(7);
    const secret = process.env.JWT_SECRET || 'dev-secret-key';

    try {
      await verify(token, secret);
    } catch {
      return c.json({ success: false, error: 'Invalid token' }, 401);
    }
  } catch {
    return c.json({ success: false, error: 'Authentication failed' }, 401);
  }
  await next();
});

// DTOs
interface DocumentoDTO {
  id: number | string;
  funcionario_id: number;
  tipo_documento: string;
  nome_arquivo: string;
  caminho_r2: string;
  tamanho_bytes: number;
  mime_type: string;
  descricao?: string | null;
  data_upload: string;
  uploaded_by?: string;
  created_at: string;
}

interface ResponseAPI<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// Funções auxiliares
async function uploadArquivoR2(env: Env, arquivo: File, chave: string): Promise<void> {
  const r2 = env.AIRTRUST_STORAGE;
  if (!r2) throw new Error('R2 não configurado');

  const buffer = await arquivo.arrayBuffer();
  await r2.put(chave, buffer, {
    httpMetadata: {
      contentType: arquivo.type || 'application/octet-stream',
    },
  });
}

async function baixarArquivoR2(env: Env, chave: string): Promise<ArrayBuffer> {
  const r2 = env.AIRTRUST_STORAGE;
  if (!r2) throw new Error('R2 não configurado');

  const objeto = await r2.get(chave);
  if (!objeto) throw new Error('Arquivo não encontrado');

  return objeto.arrayBuffer();
}

async function deletarArquivoR2(env: Env, chave: string): Promise<void> {
  const r2 = env.AIRTRUST_STORAGE;
  if (!r2) throw new Error('R2 não configurado');

  await r2.delete(chave);
}

// GET /v2/funcionarios/:id/documentos - Listar documentos de um funcionário
app.get('/funcionarios/:id/documentos', async (c) => {
  try {
    const funcionarioId = parseInt(c.req.param('id'));

    if (!funcionarioId || isNaN(funcionarioId)) {
      return c.json(
        {
          success: false,
          error: 'ID do funcionário inválido',
        } as ResponseAPI<null>,
        400,
      );
    }

    const db = c.env.DB;
    const documentos = await db
      .prepare(
        `
      SELECT 
        id,
        funcionario_id,
        tipo_documento,
        nome_arquivo,
        caminho_r2,
        tamanho_bytes,
        mime_type,
        descricao,
        data_upload,
        uploaded_by,
        created_at
      FROM funcionario_documentos
      WHERE funcionario_id = ? AND deleted_at IS NULL
      ORDER BY data_upload DESC
      `,
      )
      .bind(funcionarioId)
      .all();

    return c.json(
      {
        success: true,
        data: (documentos.results || []) as unknown as DocumentoDTO[],
      } as ResponseAPI<DocumentoDTO[]>,
      200,
    );
  } catch (error) {
    console.error('Erro ao listar documentos:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao listar documentos',
      } as ResponseAPI<null>,
      500,
    );
  }
});

// POST /v2/funcionarios/:id/documentos - Upload de documento
app.post('/funcionarios/:id/documentos', async (c) => {
  try {
    const funcionarioId = parseInt(c.req.param('id'));

    if (!funcionarioId || isNaN(funcionarioId)) {
      return c.json(
        {
          success: false,
          error: 'ID do funcionário inválido',
        } as ResponseAPI<null>,
        400,
      );
    }

    const formData = await c.req.formData();
    const arquivo = formData.get('file') as File;
    const tipoDocumento = formData.get('tipo') as string;
    const descricao = (formData.get('descricao') as string) || null;

    // Validações
    if (!arquivo) {
      return c.json(
        {
          success: false,
          error: 'Arquivo não fornecido',
        } as ResponseAPI<null>,
        400,
      );
    }

    if (!tipoDocumento) {
      return c.json(
        {
          success: false,
          error: 'Tipo de documento não fornecido',
        } as ResponseAPI<null>,
        400,
      );
    }

    // Tipos permitidos
    const tiposPermitidos = [
      'RG',
      'CPF',
      'CNH',
      'CMA',
      'ASO',
      'ICAO',
      'Contrato',
      'Certificado',
      'Outro',
    ];
    if (!tiposPermitidos.includes(tipoDocumento)) {
      return c.json(
        {
          success: false,
          error: `Tipo de documento inválido. Permitidos: ${tiposPermitidos.join(', ')}`,
        } as ResponseAPI<null>,
        400,
      );
    }

    // Limite de tamanho (10MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (arquivo.size > MAX_SIZE) {
      return c.json(
        {
          success: false,
          error: 'Arquivo muito grande (máximo 10MB)',
        } as ResponseAPI<null>,
        400,
      );
    }

    // Tipos MIME permitidos
    const mimePermitidos = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!mimePermitidos.includes(arquivo.type)) {
      return c.json(
        {
          success: false,
          error: `Tipo de arquivo não permitido. Aceitos: PDF, JPG, PNG, DOC, DOCX`,
        } as ResponseAPI<null>,
        400,
      );
    }

    // Verificar se funcionário existe
    const db = c.env.DB;
    const funcionario = await db
      .prepare('SELECT id FROM funcionarios WHERE id = ?')
      .bind(funcionarioId)
      .first();

    if (!funcionario) {
      return c.json(
        {
          success: false,
          error: 'Funcionário não encontrado',
        } as ResponseAPI<null>,
        404,
      );
    }

    // Gerar caminho único no R2
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const nomeArmazenado = `${timestamp}-${randomId}-${arquivo.name}`;
    const caminhoR2 = `documentos/${funcionarioId}/${nomeArmazenado}`;

    // Upload para R2
    await uploadArquivoR2(c.env, arquivo, caminhoR2);

    // Registrar no banco de dados
    const uploadPor = c.req.header('X-User-Id') || 'sistema';

    const result = await db
      .prepare(
        `
      INSERT INTO funcionario_documentos (
        funcionario_id,
        tipo_documento,
        nome_arquivo,
        caminho_r2,
        tamanho_bytes,
        mime_type,
        descricao,
        uploaded_by,
        data_upload,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      )
      .bind(
        funcionarioId,
        tipoDocumento,
        arquivo.name,
        caminhoR2,
        arquivo.size,
        arquivo.type,
        descricao,
        uploadPor,
      )
      .run();

    return c.json(
      {
        success: true,
        data: {
          id: result.meta.last_row_id,
          funcionario_id: funcionarioId,
          tipo_documento: tipoDocumento,
          nome_arquivo: arquivo.name,
          caminho_r2: caminhoR2,
          tamanho_bytes: arquivo.size,
          mime_type: arquivo.type,
          descricao,
          data_upload: new Date().toISOString(),
          uploaded_by: uploadPor,
          created_at: new Date().toISOString(),
        } as DocumentoDTO,
      } as ResponseAPI<DocumentoDTO>,
      201,
    );
  } catch (error) {
    console.error('Erro ao fazer upload de documento:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao fazer upload do documento',
      } as ResponseAPI<null>,
      500,
    );
  }
});

// GET /v2/documentos/:id/download - Download de documento
app.get('/documentos/:id/download', async (c) => {
  try {
    const documentoId = parseInt(c.req.param('id'));

    if (!documentoId || isNaN(documentoId)) {
      return c.json(
        {
          success: false,
          error: 'ID do documento inválido',
        } as ResponseAPI<null>,
        400,
      );
    }

    const db = c.env.DB;

    // Buscar documento
    const documento = await db
      .prepare(
        `
      SELECT id, caminho_r2, nome_arquivo, mime_type
      FROM funcionario_documentos
      WHERE id = ? AND deleted_at IS NULL
      `,
      )
      .bind(documentoId)
      .first();

    if (!documento) {
      return c.json(
        {
          success: false,
          error: 'Documento não encontrado',
        } as ResponseAPI<null>,
        404,
      );
    }

    // Baixar do R2
    const buffer = await baixarArquivoR2(c.env, documento.caminho_r2 as string);

    // Retornar arquivo
    return new Response(buffer, {
      headers: {
        'Content-Type': (documento.mime_type as string) || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${documento.nome_arquivo}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error) {
    console.error('Erro ao baixar documento:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao baixar documento',
      } as ResponseAPI<null>,
      500,
    );
  }
});

// DELETE /v2/documentos/:id - Deletar documento
app.delete('/documentos/:id', async (c) => {
  try {
    const documentoId = parseInt(c.req.param('id'));

    if (!documentoId || isNaN(documentoId)) {
      return c.json(
        {
          success: false,
          error: 'ID do documento inválido',
        } as ResponseAPI<null>,
        400,
      );
    }

    const db = c.env.DB;

    // Buscar documento
    const documento = await db
      .prepare(
        `
      SELECT id, caminho_r2
      FROM funcionario_documentos
      WHERE id = ? AND deleted_at IS NULL
      `,
      )
      .bind(documentoId)
      .first();

    if (!documento) {
      return c.json(
        {
          success: false,
          error: 'Documento não encontrado',
        } as ResponseAPI<null>,
        404,
      );
    }

    // Deletar do R2
    try {
      await deletarArquivoR2(c.env, documento.caminho_r2 as string);
    } catch (r2Error) {
      console.warn('Erro ao deletar arquivo do R2:', r2Error);
      // Continuar mesmo se falhar o R2
    }

    // Soft delete no banco
    await db
      .prepare(
        `
      UPDATE funcionario_documentos
      SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
      )
      .bind(documentoId)
      .run();

    return c.json(
      {
        success: true,
        data: { id: documentoId },
      } as ResponseAPI<{ id: number }>,
      200,
    );
  } catch (error) {
    console.error('Erro ao deletar documento:', error);
    return c.json(
      {
        success: false,
        error: 'Erro ao deletar documento',
      } as ResponseAPI<null>,
      500,
    );
  }
});

export default app;
