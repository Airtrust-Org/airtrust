/**
 * FRMS — Importação FIRA + Heatmap/Timeline
 * Extracted from frms.ts
 */

import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { rateLimiter } from '../middleware/rate-limit';
import { reprocessarTripulanteCompleto } from '../lib/frms/db-service';
import { LIMITES_DEFAULT } from '../lib/frms/types';
import {
  processarUploadFira,
  processarUploadFirasPorPagina,
  confirmarImportacaoFira,
  buscarHistoricoFira,
  buscarImportacaoFiraById,
  deletarImportacaoFira,
  vincularTripulanteFira,
  type FiraImportacaoPreview,
} from '../lib/frms/fira-service';
import { syncHorasVooFromFira } from '../lib/frms/fira-horas-voo';
import {
  safe,
  getEmpresaIdSafe,
  resolveFuncionarioId,
  assertTripulanteEmpresa,
} from './frms-shared';

const firaRoutes = new Hono<{ Bindings: Env; Variables: { userId?: string } }>();

firaRoutes.use('*', auth());

function toStableArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer().then((buffer) => Uint8Array.from(new Uint8Array(buffer)).buffer);
}

function nowSql(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function makeId(): string {
  return crypto.randomUUID();
}

function parseMesCompetencia(ano: unknown, mes: unknown): { ano: number; mes: number } | null {
  const anoNum = Number(ano);
  const mesNum = Number(mes);
  if (!Number.isInteger(anoNum) || !Number.isInteger(mesNum)) return null;
  if (anoNum < 2000 || anoNum > 2100) return null;
  if (mesNum < 1 || mesNum > 12) return null;
  return { ano: anoNum, mes: mesNum };
}

function getFiraEmpresaId(c: Parameters<typeof getEmpresaIdSafe>[0]): number | null {
  const empresaId = getEmpresaIdSafe(c);
  return Number.isInteger(empresaId) && Number(empresaId) > 0 ? Number(empresaId) : null;
}

function invalidFiraTenantResponse(c: Parameters<typeof getEmpresaIdSafe>[0]): Response {
  return c.json(
    { success: false, error: 'Contexto de empresa inválido', code: 'INVALID_TENANT_CONTEXT' },
    403,
  );
}

// ════════════════════════════════════════════════════════
// IMPORTAÇÃO FIRA
// ════════════════════════════════════════════════════════

/**
 * POST /api/frms/importacao/fira/upload
 * Processa um PDF de FIRA e retorna preview para revisão
 */
firaRoutes.post(
  '/importacao/fira/upload',
  rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: 'frms-fira-upload' }),
  safe(async (c) => {
    const operadorId = await resolveFuncionarioId(c);

    // SECURITY: usar tenant do contexto (JWT), não derivar de operadorRow.
    // FAIL-CLOSED: sem tenant válido, bloqueia a operação.
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Contexto de empresa inválido', code: 'INVALID_TENANT_CONTEXT' },
        403,
      );
    }

    const formData = await c.req.formData();
    const arquivo = formData.get('arquivo') as File | null;
    const textoExtraidoRaw = formData.get('texto_extraido');
    const textoExtraido =
      typeof textoExtraidoRaw === 'string' && textoExtraidoRaw.trim().length > 0
        ? textoExtraidoRaw
        : undefined;

    if (!arquivo)
      return c.json(
        { success: false, error: 'Arquivo PDF não enviado', code: 'FIRA_NO_FILE' },
        400,
      );
    if (!arquivo.name.toLowerCase().endsWith('.pdf')) {
      return c.json(
        { success: false, error: 'Apenas arquivos PDF são aceitos', code: 'FIRA_INVALID_TYPE' },
        400,
      );
    }
    const MAX_SIZE = 10 * 1024 * 1024;
    if (arquivo.size > MAX_SIZE) {
      return c.json(
        { success: false, error: 'Arquivo muito grande (máx 10MB)', code: 'FIRA_FILE_TOO_LARGE' },
        400,
      );
    }
    if (!textoExtraido) {
      return c.json(
        {
          success: false,
          error: 'Não foi possível extrair texto do PDF: texto_extraido é obrigatório',
          code: 'FIRA_TEXT_REQUIRED',
        },
        400,
      );
    }

    const buffer = await toStableArrayBuffer(arquivo);
    const preview = await processarUploadFira(
      c.env.DB,
      c.env.BUCKET,
      buffer,
      arquivo.name,
      String(operadorId),
      String(empresaId),
      textoExtraido,
    );

    return c.json({ success: true, data: preview });
  }),
);

/**
 * POST /api/frms/importacao/fira/upload-lote
 * Processa múltiplos PDFs de FIRA e retorna previews individuais
 */
firaRoutes.post(
  '/importacao/fira/upload-lote',
  rateLimiter({ maxRequests: 5, windowSeconds: 60, keyPrefix: 'frms-fira-lote' }),
  safe(async (c) => {
    const operadorId = await resolveFuncionarioId(c);

    // SECURITY: usar tenant do contexto (JWT), não derivar de operadorRow.
    // FAIL-CLOSED: sem tenant válido, bloqueia a operação.
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Contexto de empresa inválido', code: 'INVALID_TENANT_CONTEXT' },
        403,
      );
    }

    const formData = await c.req.formData();
    const arquivosRaw = formData.getAll('arquivos') as unknown[];
    const arquivos: File[] = [];
    for (const item of arquivosRaw) {
      if (item && typeof item !== 'string') {
        arquivos.push(item as File);
      }
    }

    if (arquivos.length === 0) {
      return c.json(
        { success: false, error: 'Nenhum arquivo PDF enviado', code: 'FIRA_NO_FILES' },
        400,
      );
    }

    const MAX_FILES = 20;
    if (arquivos.length > MAX_FILES) {
      return c.json(
        {
          success: false,
          error: `Máximo de ${MAX_FILES} arquivos por lote`,
          code: 'FIRA_TOO_MANY_FILES',
        },
        400,
      );
    }

    const MAX_SIZE = 10 * 1024 * 1024;
    const itens: Array<{
      arquivo_nome: string;
      success: boolean;
      data?: Awaited<ReturnType<typeof processarUploadFira>>;
      error?: string;
      code?: string;
    }> = [];

    for (const arquivo of arquivos) {
      if (!arquivo.name.toLowerCase().endsWith('.pdf')) {
        itens.push({
          arquivo_nome: arquivo.name,
          success: false,
          error: 'Apenas arquivos PDF são aceitos',
          code: 'FIRA_INVALID_TYPE',
        });
        continue;
      }

      if (arquivo.size > MAX_SIZE) {
        itens.push({
          arquivo_nome: arquivo.name,
          success: false,
          error: 'Arquivo muito grande (máx 10MB)',
          code: 'FIRA_FILE_TOO_LARGE',
        });
        continue;
      }

      try {
        const buffer = await toStableArrayBuffer(arquivo);
        const preview = await processarUploadFira(
          c.env.DB,
          c.env.BUCKET,
          buffer,
          arquivo.name,
          String(operadorId),
          String(empresaId),
        );

        itens.push({
          arquivo_nome: arquivo.name,
          success: true,
          data: preview,
        });
      } catch (error) {
        itens.push({
          arquivo_nome: arquivo.name,
          success: false,
          error: (error as Error).message || 'Erro ao processar FIRA',
          code: 'FIRA_PROCESS_ERROR',
        });
      }
    }

    const processados = itens.filter((item) => item.success).length;
    const erros = itens.length - processados;

    return c.json({
      success: true,
      data: {
        total_arquivos: itens.length,
        processados,
        erros,
        itens,
      },
    });
  }),
);

/**
 * POST /api/frms/importacao/fira/upload-multipagina
 * Processa um único PDF com múltiplas FIRAs (uma por página).
 */
firaRoutes.post(
  '/importacao/fira/upload-multipagina',
  rateLimiter({ maxRequests: 10, windowSeconds: 60, keyPrefix: 'frms-fira-multi' }),
  safe(async (c) => {
    const operadorId = await resolveFuncionarioId(c);

    // SECURITY: usar tenant do contexto (JWT), não derivar de operadorRow.
    // FAIL-CLOSED: sem tenant válido, bloqueia a operação.
    const empresaId = getEmpresaIdSafe(c);
    if (!empresaId) {
      return c.json(
        { success: false, error: 'Contexto de empresa inválido', code: 'INVALID_TENANT_CONTEXT' },
        403,
      );
    }

    const formData = await c.req.formData();
    const arquivo = formData.get('arquivo') as File | null;
    const textosPaginasRaw = formData.get('textos_paginas');
    let textosPaginas: string[] = [];
    if (typeof textosPaginasRaw === 'string') {
      try {
        textosPaginas = (JSON.parse(textosPaginasRaw) as unknown[])
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length > 0);
      } catch {
        return c.json(
          {
            success: false,
            error: 'Campo textos_paginas inválido (JSON esperado)',
            code: 'FIRA_INVALID_TEXT_PAGES',
          },
          400,
        );
      }
    }

    if (!arquivo) {
      return c.json(
        { success: false, error: 'Arquivo PDF não enviado', code: 'FIRA_NO_FILE' },
        400,
      );
    }
    if (!arquivo.name.toLowerCase().endsWith('.pdf')) {
      return c.json(
        { success: false, error: 'Apenas arquivos PDF são aceitos', code: 'FIRA_INVALID_TYPE' },
        400,
      );
    }
    const MAX_SIZE = 20 * 1024 * 1024; // 20 MB para PDFs com múltiplas páginas
    if (arquivo.size > MAX_SIZE) {
      return c.json(
        { success: false, error: 'Arquivo muito grande (máx 20MB)', code: 'FIRA_FILE_TOO_LARGE' },
        400,
      );
    }
    if (textosPaginas.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Não foi possível extrair texto do PDF: textos_paginas é obrigatório',
          code: 'FIRA_TEXT_REQUIRED',
        },
        400,
      );
    }

    const buffer = await toStableArrayBuffer(arquivo);
    const resultado = await processarUploadFirasPorPagina(
      c.env.DB,
      c.env.BUCKET,
      buffer,
      arquivo.name,
      String(operadorId),
      String(empresaId),
      textosPaginas,
    );

    return c.json({ success: true, data: resultado });
  }),
);

/**
 * POST /api/frms/importacao/fira/:importacaoId/confirmar
 * Confirma a importação dos dias selecionados
 */
firaRoutes.post(
  '/importacao/fira/:importacaoId/confirmar',
  requireRole('admin'),
  safe(async (c) => {
    const importacaoId = c.req.param('importacaoId') ?? '';
    const empresaId = getEmpresaIdSafe(c);
    const operadorId = await resolveFuncionarioId(c);
    const body = await c.req.json<{
      dias_selecionados: Array<{ dia: number; forcar_substituicao?: boolean }>;
      observacao?: string;
    }>();

    const confirmarSchema = z.object({
      dias_selecionados: z
        .array(
          z.object({
            dia: z.number().int().min(1).max(31),
            forcar_substituicao: z.boolean().optional().default(false),
          }),
        )
        .min(1),
      observacao: z.string().optional(),
    });

    const parsed = confirmarSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: 'Dados inválidos',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    // confirmarImportacaoFira -> salvarJornada/atualizarJornada self-resolve governed context; this param is inert.
    const resultado = await confirmarImportacaoFira(
      c.env.DB,
      importacaoId,
      parsed.data,
      operadorId,
      LIMITES_DEFAULT,
      empresaId,
    );

    if (empresaId) {
      await syncHorasVooFromFira(c.env.DB, Number(importacaoId), empresaId);
    }

    return c.json({ success: true, data: resultado });
  }),
);

/**
 * PATCH /api/frms/importacao/fira/:importacaoId/vincular-tripulante
 * Vincula um tripulante manualmente a uma importação
 */
firaRoutes.patch(
  '/importacao/fira/:importacaoId/vincular-tripulante',
  safe(async (c) => {
    const importacaoId = c.req.param('importacaoId') ?? '';
    const empresaId = getFiraEmpresaId(c);
    if (!empresaId) return invalidFiraTenantResponse(c);
    const body = await c.req.json<{ tripulante_id: string }>();
    if (!body.tripulante_id) {
      return c.json({ success: false, error: 'tripulante_id obrigatório' }, 400);
    }
    const denied = await assertTripulanteEmpresa(c, String(body.tripulante_id));
    if (denied) return denied;

    await vincularTripulanteFira(c.env.DB, importacaoId, String(body.tripulante_id), empresaId);
    const updated = await buscarImportacaoFiraById(c.env.DB, importacaoId, empresaId);
    return c.json({ success: true, data: updated });
  }),
);

/**
 * GET /api/frms/importacao/fira
 * Histórico de importações FIRA paginado
 */
firaRoutes.get(
  '/importacao/fira',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const q = c.req.query();
    const result = await buscarHistoricoFira(c.env.DB, {
      empresa_id: empresaId,
      tripulante_id: q.tripulante_id,
      status: q.status,
      ano: q.ano ? parseInt(q.ano) : undefined,
      mes: q.mes ? parseInt(q.mes) : undefined,
      page: q.page ? parseInt(q.page) : 1,
      per_page: q.per_page ? parseInt(q.per_page) : 20,
    });
    return c.json({ success: true, ...result });
  }),
);

/**
 * GET /api/frms/importacao/fira/:importacaoId
 * Detalhe de uma importação específica
 */
firaRoutes.get(
  '/importacao/fira/:importacaoId',
  safe(async (c) => {
    const importacaoId = c.req.param('importacaoId') ?? '';
    const empresaId = getFiraEmpresaId(c);
    if (!empresaId) return invalidFiraTenantResponse(c);
    const row = await buscarImportacaoFiraById(c.env.DB, importacaoId, empresaId);
    if (!row) return c.json({ success: false, error: 'Não encontrado', code: 'NOT_FOUND' }, 404);
    return c.json({ success: true, data: row });
  }),
);

/**
 * DELETE /api/frms/importacao/fira/:importacaoId
 * Soft delete (apenas status REVISAO, REJEITADO ou ERRO)
 */
firaRoutes.delete(
  '/importacao/fira/:importacaoId',
  safe(async (c) => {
    const importacaoId = c.req.param('importacaoId') ?? '';
    const empresaId = getFiraEmpresaId(c);
    if (!empresaId) return invalidFiraTenantResponse(c);
    const operadorId = await resolveFuncionarioId(c);
    await deletarImportacaoFira(c.env.DB, importacaoId, operadorId, empresaId);
    return c.json({ success: true });
  }),
);

/**
 * GET /api/frms/importacao/fira/:importacaoId/comparativo-fontes
 * Compara os dados da prévia da FIRA com o que já existe da origem SIGVOOS.
 */
firaRoutes.get(
  '/importacao/fira/:importacaoId/comparativo-fontes',
  safe(async (c) => {
    const importacaoId = c.req.param('importacaoId');
    const empresaId = getEmpresaIdSafe(c);

    const row = await c.env.DB.prepare(
      `SELECT id, tripulante_id, ano, mes, preview_json
           FROM frms_importacao_fira
          WHERE id = ?
            AND deleted_at IS NULL`,
    )
      .bind(importacaoId)
      .first<{
        id: string;
        tripulante_id: string | null;
        ano: number;
        mes: number;
        preview_json: string | null;
      }>();

    if (!row) {
      return c.json({ success: false, error: 'Importação não encontrada', code: 'NOT_FOUND' }, 404);
    }

    let preview: FiraImportacaoPreview | null = null;
    try {
      preview = row.preview_json ? (JSON.parse(row.preview_json) as FiraImportacaoPreview) : null;
    } catch {
      preview = null;
    }

    if (!preview) {
      return c.json(
        { success: false, error: 'Preview da importação inválido', code: 'INVALID_PREVIEW' },
        400,
      );
    }

    const tripulanteId = preview.tripulante_id || row.tripulante_id || null;
    if (!tripulanteId) {
      return c.json({
        success: true,
        data: {
          ano: preview.ano,
          mes: preview.mes,
          tripulante_id: null,
          fonte_preferida: null,
          totais: {
            fira_preview: {
              dias: preview.linhas.filter((l) => l.situacao !== 'DIA_VAZIO').length,
              jornada_min: preview.totais_calculados.jornada_min,
              voo_min: preview.totais_calculados.voo_min,
            },
            sigvoos: { dias: 0, jornada_min: 0, voo_min: 0 },
          },
          dias: {
            somente_fira_preview: preview.linhas
              .filter((l) => l.situacao !== 'DIA_VAZIO')
              .map((l) => ({
                data: l.data,
                jornada_min: l.duracao_jornada_min,
                voo_min: l.horas_voo_min,
              })),
            somente_sigvoos: [],
            divergentes: [],
          },
        },
      });
    }

    const preferencia = await c.env.DB.prepare(
      `SELECT fonte_escolhida
           FROM frms_fonte_calculo_competencia
          WHERE tripulante_id = ?
            AND ano = ?
            AND mes = ?
            AND deleted_at IS NULL
            AND (? IS NULL OR empresa_id = ?)
          ORDER BY updated_at DESC
          LIMIT 1`,
    )
      .bind(Number(tripulanteId), preview.ano, preview.mes, empresaId ?? null, empresaId ?? null)
      .first<{ fonte_escolhida: 'SIGVOOS' | 'FIRA' }>();

    const sigRows = await c.env.DB.prepare(
      `SELECT data, duracao_jornada_minutos, horas_voo_minutos
           FROM frms_jornada
          WHERE tripulante_id = ?
            AND origem = 'SIGVOOS'
            AND deleted_at IS NULL
            AND strftime('%Y', data) = ?
            AND strftime('%m', data) = ?`,
    )
      .bind(Number(tripulanteId), String(preview.ano), String(preview.mes).padStart(2, '0'))
      .all<{
        data: string;
        duracao_jornada_minutos: number | null;
        horas_voo_minutos: number | null;
      }>();

    const firaMap = new Map(
      preview.linhas
        .filter((l) => l.situacao !== 'DIA_VAZIO')
        .map((l) => [l.data, { jornada_min: l.duracao_jornada_min, voo_min: l.horas_voo_min }]),
    );
    const sigMap = new Map(
      (sigRows.results || []).map((r) => [
        r.data,
        {
          jornada_min: Number(r.duracao_jornada_minutos || 0),
          voo_min: Number(r.horas_voo_minutos || 0),
        },
      ]),
    );

    const somenteFira = [...firaMap.entries()]
      .filter(([data]) => !sigMap.has(data))
      .map(([data, valores]) => ({ data, ...valores }));

    const somenteSig = [...sigMap.entries()]
      .filter(([data]) => !firaMap.has(data))
      .map(([data, valores]) => ({ data, ...valores }));

    const divergentes = [...firaMap.entries()]
      .filter(([data, fira]) => {
        const sig = sigMap.get(data);
        if (!sig) return false;
        return sig.jornada_min !== fira.jornada_min || sig.voo_min !== fira.voo_min;
      })
      .map(([data, fira]) => {
        const sig = sigMap.get(data)!;
        return {
          data,
          fira_preview: fira,
          sigvoos: sig,
          delta_jornada_min: fira.jornada_min - sig.jornada_min,
          delta_voo_min: fira.voo_min - sig.voo_min,
        };
      });

    const totalSig = [...sigMap.values()].reduce(
      (acc, item) => {
        acc.jornada_min += item.jornada_min;
        acc.voo_min += item.voo_min;
        return acc;
      },
      { jornada_min: 0, voo_min: 0 },
    );

    return c.json({
      success: true,
      data: {
        ano: preview.ano,
        mes: preview.mes,
        tripulante_id: String(tripulanteId),
        fonte_preferida: preferencia?.fonte_escolhida ?? null,
        totais: {
          fira_preview: {
            dias: firaMap.size,
            jornada_min: preview.totais_calculados.jornada_min,
            voo_min: preview.totais_calculados.voo_min,
          },
          sigvoos: {
            dias: sigMap.size,
            jornada_min: totalSig.jornada_min,
            voo_min: totalSig.voo_min,
          },
        },
        dias: {
          somente_fira_preview: somenteFira,
          somente_sigvoos: somenteSig,
          divergentes,
        },
      },
    });
  }),
);

/**
 * POST /api/frms/importacao/fira/fonte-calculo
 * Aplica a fonte escolhida (SIGVOOS/FIRA) para uma competência e reprocessa o tripulante.
 */
firaRoutes.post(
  '/importacao/fira/fonte-calculo',
  requireRole('admin'),
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const operadorId = await resolveFuncionarioId(c);
    const body = await c.req.json<{
      tripulante_id: string;
      ano: number;
      mes: number;
      fonte: 'SIGVOOS' | 'FIRA';
    }>();

    const schema = z.object({
      tripulante_id: z.string().min(1),
      ano: z.number().int().min(2000).max(2100),
      mes: z.number().int().min(1).max(12),
      fonte: z.enum(['SIGVOOS', 'FIRA']),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          success: false,
          error: 'Payload inválido',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten(),
        },
        400,
      );
    }

    const denied = await assertTripulanteEmpresa(c, parsed.data.tripulante_id);
    if (denied) return denied;

    const competencia = parseMesCompetencia(parsed.data.ano, parsed.data.mes);
    if (!competencia) {
      return c.json(
        { success: false, error: 'Competência inválida', code: 'VALIDATION_ERROR' },
        400,
      );
    }

    const timestamp = nowSql();
    const mesIso = String(competencia.mes).padStart(2, '0');
    const tripIdNum = Number(parsed.data.tripulante_id);

    const toDelete = parsed.data.fonte === 'SIGVOOS' ? 'FIRA' : 'SIGVOOS';

    // 1) Ativa a fonte escolhida e desativa a alternativa na competência.
    await c.env.DB.prepare(
      `UPDATE frms_jornada
            SET deleted_at = ?, updated_at = ?
          WHERE tripulante_id = ?
            AND origem = ?
            AND deleted_at IS NULL
            AND strftime('%Y', data) = ?
            AND strftime('%m', data) = ?`,
    )
      .bind(timestamp, timestamp, tripIdNum, toDelete, String(competencia.ano), mesIso)
      .run();

    await c.env.DB.prepare(
      `UPDATE frms_jornada
            SET deleted_at = NULL,
                updated_at = ?
          WHERE tripulante_id = ?
            AND origem = ?
            AND strftime('%Y', data) = ?
            AND strftime('%m', data) = ?`,
    )
      .bind(timestamp, tripIdNum, parsed.data.fonte, String(competencia.ano), mesIso)
      .run();

    // 2) Persiste a decisão operacional para auditoria e consistência de leitura.
    const updated = await c.env.DB.prepare(
      `UPDATE frms_fonte_calculo_competencia
            SET fonte_escolhida = ?,
                escolhido_por = ?,
                updated_at = ?,
                deleted_at = NULL
          WHERE tripulante_id = ?
            AND ano = ?
            AND mes = ?
            AND (? IS NULL OR empresa_id = ?)
            AND deleted_at IS NULL`,
    )
      .bind(
        parsed.data.fonte,
        operadorId,
        timestamp,
        tripIdNum,
        competencia.ano,
        competencia.mes,
        empresaId ?? null,
        empresaId ?? null,
      )
      .run();

    if ((updated.meta.changes ?? 0) === 0) {
      await c.env.DB.prepare(
        `INSERT INTO frms_fonte_calculo_competencia (
            id, empresa_id, tripulante_id, ano, mes, fonte_escolhida, escolhido_por, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          makeId(),
          empresaId ?? null,
          tripIdNum,
          competencia.ano,
          competencia.mes,
          parsed.data.fonte,
          operadorId,
          timestamp,
          timestamp,
        )
        .run();
    }

    // 3) Reprocessa para refletir cálculo/alertas com a fonte ativa escolhida.
    // reprocessarTripulanteCompleto's limites parameter is inert (recalcularPipeline self-resolves).
    const jornadasReprocessadas = await reprocessarTripulanteCompleto(c.env.DB, tripIdNum, LIMITES_DEFAULT);

    return c.json({
      success: true,
      data: {
        tripulante_id: String(parsed.data.tripulante_id),
        ano: competencia.ano,
        mes: competencia.mes,
        fonte: parsed.data.fonte,
        jornadas_reprocessadas: jornadasReprocessadas,
      },
    });
  }),
);

// ════════════════════════════════════════════════════════
// HEATMAP (dashboard Fase 3)
// ════════════════════════════════════════════════════════

/**
 * GET /api/frms/heatmap
 * Retorna dados de fadiga por tripulante × dia para o heatmap visual
 */
firaRoutes.get(
  '/heatmap',
  safe(async (c) => {
    const empresaId = getEmpresaIdSafe(c);
    const mes = c.req.query('mes') ?? undefined;
    const periodo = Math.min(Math.max(Number(c.req.query('periodo') ?? '30'), 7), 365);
    const [inicio, fim] =
      mes && /^\d{4}-\d{2}$/.test(mes)
        ? [
            `${mes}-01`,
            `${mes}-${String(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()).padStart(2, '0')}`,
          ]
        : [null, null];

    const rows = await c.env.DB.prepare(
      `WITH jornadas_lancadas AS (
         SELECT
           j.id,
           j.tripulante_id,
           j.data
         FROM frms_jornada j
         WHERE j.deleted_at IS NULL
           AND (
             j.hora_apresentacao IS NOT NULL
             OR j.hora_termino IS NOT NULL
             OR COALESCE(j.horas_voo_minutos, 0) > 0
             OR COALESCE(j.duracao_jornada_minutos, 0) > 0
           )
       ),
       daily_effectiveness AS (
         SELECT
           jl.tripulante_id,
           jl.data,
           fj.effectiveness_pct,
           fj.effectiveness_nivel,
           ROW_NUMBER() OVER (
             PARTITION BY jl.tripulante_id, jl.data
             ORDER BY fj.created_at DESC, fj.id DESC
           ) AS rn
         FROM frms_fatorizacao_jornada fj
         JOIN jornadas_lancadas jl ON jl.id = fj.jornada_id
         WHERE fj.deleted_at IS NULL
       )
       SELECT
         ar.tripulante_id,
         f.nome,
         NULLIF(f.guerra, '') as nome_guerra,
         f.cargo,
         ar.data_referencia,
         ar.pct_limite_7d,
         ar.pct_limite_28d,
         ar.hv_7_dias_min,
         ar.hv_28_dias_min,
         ar.hv_dia_min,
         ar.pct_limite_dia,
         1 as teve_jornada,
         de.effectiveness_pct,
         de.effectiveness_nivel
       FROM frms_acumulo_rolling ar
       JOIN funcionarios f ON f.id = CAST(ar.tripulante_id AS INTEGER)
       JOIN jornadas_lancadas jl
         ON jl.tripulante_id = ar.tripulante_id
        AND jl.data = ar.data_referencia
       LEFT JOIN daily_effectiveness de
         ON de.tripulante_id = ar.tripulante_id
        AND de.data = ar.data_referencia
        AND de.rn = 1
       WHERE (? IS NULL OR f.empresa_id = ?)
         AND ((? IS NOT NULL AND ar.data_referencia >= ? AND ar.data_referencia <= ?)
          OR (? IS NULL AND ar.data_referencia >= date('now', '-' || ? || ' days') AND ar.data_referencia <= date('now')))
         AND ar.deleted_at IS NULL
         AND f.deleted_at IS NULL
         AND COALESCE(f.ativo, 1) = 1
         AND UPPER(COALESCE(NULLIF(TRIM(f.status), ''), 'ATIVO')) = 'ATIVO'
       ORDER BY f.nome, ar.data_referencia`,
    )
      .bind(empresaId ?? null, empresaId ?? null, inicio, inicio, fim, inicio, periodo)
      .all();

    const tripMap = new Map<
      string,
      {
        tripulante_id: string;
        nome: string;
        nome_guerra: string | null;
        cargo: string | null;
        dias: Record<
          string,
          {
            pct: number;
            pct7d: number;
            pct28d: number;
            hv7d: number;
            hv28d: number;
            hvDia: number;
            pctDia: number;
            compliance_source: 'DIA' | '7D' | '28D' | null;
            teve_jornada: number;
            effectiveness_pct: number | null;
            effectiveness_nivel: string | null;
          }
        >;
        maxPct: number;
      }
    >();

    for (const r of (rows.results || []) as Array<Record<string, unknown>>) {
      const tid = String(r.tripulante_id);
      if (!tripMap.has(tid)) {
        tripMap.set(tid, {
          tripulante_id: tid,
          nome: r.nome as string,
          nome_guerra: (r.nome_guerra as string | null) ?? null,
          cargo: (r.cargo as string | null) ?? null,
          dias: {},
          maxPct: 0,
        });
      }
      const entry = tripMap.get(tid)!;
      const pctDia = (r.pct_limite_dia as number) ?? 0;
      const pct7d = (r.pct_limite_7d as number) ?? 0;
      const pct28d = (r.pct_limite_28d as number) ?? 0;

      // Compliance operacional: usa a pior janela entre dia / 7d / 28d.
      // Em empate, prioriza a janela mais longa para refletir fadiga acumulada.
      const complianceCandidates: Array<{ source: 'DIA' | '7D' | '28D'; pct: number }> = [
        { source: '28D', pct: pct28d },
        { source: '7D', pct: pct7d },
        { source: 'DIA', pct: pctDia },
      ];
      let compliancePct = 0;
      let complianceSource: 'DIA' | '7D' | '28D' | null = null;
      for (const candidate of complianceCandidates) {
        if (candidate.pct > compliancePct || complianceSource === null) {
          compliancePct = candidate.pct;
          complianceSource = candidate.source;
        }
      }

      entry.dias[r.data_referencia as string] = {
        pct: compliancePct,
        pct7d,
        pct28d,
        hv7d: (r.hv_7_dias_min as number) ?? 0,
        hv28d: (r.hv_28_dias_min as number) ?? 0,
        hvDia: (r.hv_dia_min as number) ?? 0,
        pctDia,
        compliance_source: complianceSource,
        teve_jornada: (r.teve_jornada as number) ?? 0,
        effectiveness_pct: (r.effectiveness_pct as number | null) ?? null,
        effectiveness_nivel: (r.effectiveness_nivel as string | null) ?? null,
      };
      if (compliancePct > entry.maxPct) entry.maxPct = compliancePct;
    }

    const heatmapData = Array.from(tripMap.values()).sort((a, b) => b.maxPct - a.maxPct);
    return c.json({ success: true, data: heatmapData });
  }),
);

/**
 * GET /api/frms/tripulante/:id/timeline
 * Retorna série temporal de fadiga para um tripulante (gráfico de timeline)
 */
firaRoutes.get(
  '/tripulante/:id/timeline',
  safe(async (c) => {
    const tripulanteId = c.req.param('id') ?? '';
    const empresaId = getFiraEmpresaId(c);
    if (!empresaId) return invalidFiraTenantResponse(c);
    const denied = await assertTripulanteEmpresa(c, tripulanteId);
    if (denied) return denied;
    const mes = c.req.query('mes') ?? undefined;
    const periodo = Math.min(Math.max(Number(c.req.query('periodo') ?? '30'), 7), 365);
    const [inicio, fim] =
      mes && /^\d{4}-\d{2}$/.test(mes)
        ? [
            `${mes}-01`,
            `${mes}-${String(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()).padStart(2, '0')}`,
          ]
        : [null, null];

    const rows = await c.env.DB.prepare(
      `WITH jornadas_lancadas AS (
         SELECT
           j.id,
           j.tripulante_id,
           j.data,
           j.hora_apresentacao,
           j.hora_termino
         FROM frms_jornada j
         WHERE j.deleted_at IS NULL
           AND (
             j.hora_apresentacao IS NOT NULL
             OR j.hora_termino IS NOT NULL
             OR COALESCE(j.horas_voo_minutos, 0) > 0
             OR COALESCE(j.duracao_jornada_minutos, 0) > 0
           )
       )
       SELECT
        ar.data_referencia,
        ar.pct_limite_7d,
        ar.hv_7_dias_min,
        ar.hv_28_dias_min,
        ar.hv_dia_min,
        ar.pct_limite_dia,
        j.hora_apresentacao,
        j.hora_termino,
        CASE WHEN j.id IS NOT NULL THEN 1 ELSE 0 END as teve_jornada
      FROM frms_acumulo_rolling ar
      JOIN jornadas_lancadas j
        ON j.tripulante_id = ar.tripulante_id
       AND j.data = ar.data_referencia
      WHERE ar.tripulante_id = ?
        AND ((? IS NOT NULL AND ar.data_referencia >= ? AND ar.data_referencia <= ?)
          OR (? IS NULL AND ar.data_referencia >= date('now', '-' || ? || ' days')))
        AND ar.deleted_at IS NULL
      ORDER BY ar.data_referencia ASC`,
    )
      .bind(tripulanteId, inicio, inicio, fim, inicio, periodo)
      .all();

    const timeline = (rows.results || []).map((r: Record<string, unknown>) => ({
      data: r.data_referencia as string,
      pct_fadiga: (r.pct_limite_7d as number) ?? 0,
      hv_7d: (r.hv_7_dias_min as number) ?? 0,
      hv_28d: (r.hv_28_dias_min as number) ?? 0,
      hv_dia: (r.hv_dia_min as number) ?? 0,
      pct_dia: (r.pct_limite_dia as number) ?? 0,
      teve_jornada: (r.teve_jornada as number) === 1,
      hora_apresentacao: (r.hora_apresentacao as string | null) ?? null,
      hora_termino: (r.hora_termino as string | null) ?? null,
    }));

    return c.json({ success: true, data: timeline });
  }),
);

export default firaRoutes;
