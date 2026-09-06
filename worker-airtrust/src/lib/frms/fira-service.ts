/**
 * FRMS — Serviço de Importação FIRA
 *
 * Orquestra o processo completo de upload, parse, preview,
 * detecção de duplicatas e confirmação de importação de FIRAs.
 */

import type { LimitesMap } from './types';
import { atualizarJornada, salvarJornada } from './db-service';
import {
  parseFira,
  mapFiraSituacaoToFrmsStatus,
  hhmmToMin,
  type FiraParseResult,
  type FiraLinhaDia,
} from './fira-parser';
import {
  avaliarIntegridadeJornadaFrms,
  type FrmsIntegridadeCodigo,
  type FrmsIntegridadeStatus,
} from './integridade';

// ──────────────────────────────────────────────────────────────
// Tipos de domínio FIRA
// ──────────────────────────────────────────────────────────────

export interface FiraLinhPreview {
  dia: number;
  data: string;
  status_fira: string;
  status_frms: string;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  duracao_jornada_min: number;
  horas_voo_min: number;
  local_base: string | null;
  situacao: 'NOVO' | 'DUPLICATA' | 'DIA_VAZIO';
  jornada_existente_id: string | null;
  marcado: boolean;
  integridade_status?: FrmsIntegridadeStatus;
  integridade_codigo?: FrmsIntegridadeCodigo | null;
  integridade_codigos?: FrmsIntegridadeCodigo[];
  integridade_mensagem?: string | null;
  valores_brutos?: {
    duracao_jornada_minutos: number | null;
    horas_voo_minutos: number | null;
    hora_apresentacao: string | null;
    hora_termino: string | null;
  };
}

export interface FiraImportacaoPreview {
  importacao_id: string;
  tripulante_encontrado: boolean;
  tripulante_id: string | null;
  tripulante_nome_fira: string;
  tripulante_nome_sistema: string | null;
  canac: string;
  ano: number;
  mes: number;
  mes_nome: string;
  total_dias: number;
  linhas: FiraLinhPreview[];
  totais_fira: { jornada: string; voo: string };
  totais_calculados: { jornada_min: number; voo_min: number };
  divergencia_totais: boolean;
  avisos: string[];
  erros: string[];
}

export interface FiraImportacaoConfirmarInput {
  dias_selecionados: Array<{ dia: number; forcar_substituicao?: boolean }>;
  observacao?: string;
}

export interface FiraImportacaoResultado {
  importacao_id: string;
  importados: number;
  substituidos: number;
  ignorados: number;
  erros: number;
  erros_detalhes: string[];
  alertas_gerados: number;
}

// ──────────────────────────────────────────────────────────────
// Helpers internos
// ──────────────────────────────────────────────────────────────

function generateId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function cloneArrayBuffer(buffer: ArrayBuffer): ArrayBuffer {
  return Uint8Array.from(new Uint8Array(buffer)).buffer;
}

export function enrichFiraPreviewLineIntegridade(
  linha: Omit<
    FiraLinhPreview,
    | 'integridade_status'
    | 'integridade_codigo'
    | 'integridade_codigos'
    | 'integridade_mensagem'
    | 'valores_brutos'
  >,
): FiraLinhPreview {
  const integridade = avaliarIntegridadeJornadaFrms({
    duracao_jornada_minutos: linha.duracao_jornada_min,
    horas_voo_minutos: linha.horas_voo_min,
    hora_apresentacao: linha.hora_apresentacao,
    hora_termino: linha.hora_termino,
  });

  return {
    ...linha,
    integridade_status: integridade.integridade_status,
    integridade_codigo: integridade.integridade_codigo,
    integridade_codigos: integridade.integridade_codigos,
    integridade_mensagem: integridade.integridade_mensagem,
    valores_brutos: integridade.valores_brutos,
  };
}

interface JornadaExistenteParaMerge {
  id: string;
  data: string;
  origem: string | null;
  empresa_id: number | null;
  hora_apresentacao: string | null;
  hora_termino: string | null;
  horas_voo_minutos: number | null;
  duracao_jornada_minutos: number | null;
}

function linhaTemDadosOperacionais(linha: FiraLinhPreview): boolean {
  return Boolean(
    linha.hora_apresentacao ||
      linha.hora_termino ||
      (linha.horas_voo_min || 0) > 0 ||
      (linha.duracao_jornada_min || 0) > 0,
  );
}

function jornadaExistenteOperacionalmenteVazia(jornada: JornadaExistenteParaMerge): boolean {
  return !Boolean(
    jornada.hora_apresentacao ||
      jornada.hora_termino ||
      (jornada.horas_voo_minutos || 0) > 0 ||
      (jornada.duracao_jornada_minutos || 0) > 0,
  );
}

function shouldMergeIntoExistingManualJornada(params: {
  linha: FiraLinhPreview;
  jornada: JornadaExistenteParaMerge | null;
  empresaId?: number;
}): boolean {
  const { linha, jornada, empresaId } = params;
  if (!jornada) return false;

  if (!linhaTemDadosOperacionais(linha)) return false;

  if (
    empresaId !== undefined &&
    empresaId !== null &&
    jornada.empresa_id !== null &&
    jornada.empresa_id !== empresaId
  ) {
    return false;
  }

  const origem = String(jornada.origem || '').trim().toUpperCase();

  // Canonical re-sync (FIRA/SIGVOOS refreshing its own prior canonical
  // record): buildSelectedDaysForSigvoosImport/processarUploadFira already
  // decided this exact row is safe to overwrite (jornada_existente_id +
  // origem FIRA/SIGVOOS is exactly how they flag it) — always merge in
  // place regardless of whether the existing row already has operational
  // data, otherwise a routine periodic SIGVOOS re-sync over an already
  // -synced period silently duplicates every overlapping day instead of
  // refreshing it.
  if (origem === 'FIRA' || origem === 'SIGVOOS') return true;

  // Manual placeholder merge (unchanged): only safe when the existing
  // MANUAL row has no operational data of its own yet.
  if (origem && origem !== 'MANUAL') return false;
  if (!jornadaExistenteOperacionalmenteVazia(jornada)) return false;

  return true;
}

// Nota: mapSituacaoFira → removida, usa mapFiraSituacaoToFrmsStatus de fira-parser

// ──────────────────────────────────────────────────────────────
// processarUploadFira
// ──────────────────────────────────────────────────────────────

export async function processarUploadFira(
  db: D1Database,
  bucket: R2Bucket,
  pdfBuffer: ArrayBuffer,
  arquivoNome: string,
  operadorId: string,
  empresaId: string,
  /** Opcional: texto já extraído externamente (usado para multi-página) */
  _textoPreExtraido?: string,
): Promise<FiraImportacaoPreview> {
  const pdfBufferEstavel = cloneArrayBuffer(pdfBuffer);

  // 1. Validar texto pré-extraído (extração ocorre no frontend)
  const texto = typeof _textoPreExtraido === 'string' ? _textoPreExtraido.trim() : '';
  if (!texto) {
    throw new Error(
      'Não foi possível extrair texto do PDF: texto_extraido é obrigatório para importação FIRA',
    );
  }

  // 2. Parsear FIRA
  let parseResult: FiraParseResult;
  try {
    parseResult = parseFira(texto);
  } catch (e) {
    throw new Error(`Falha no parse da FIRA: ${(e as Error).message}`);
  }

  const { cabecalho, dias, totalJornadaMes, totalVooMes, erros: parseErros } = parseResult;

  // 3. Buscar tripulante pelo CANAC (na tabela funcionarios)
  const cols = (await db.prepare("PRAGMA table_info('funcionarios')").all<{ name: string }>())
    .results as Array<{ name: string }>;
  const hasCodigoAnac = cols.some((col) => col.name === 'codigo_anac');
  const hasCanac = cols.some((col) => col.name === 'canac');

  const colunaCanac = hasCodigoAnac ? 'codigo_anac' : hasCanac ? 'canac' : null;
  if (!colunaCanac) {
    throw new Error('Schema inválido: tabela funcionarios sem coluna codigo_anac/canac');
  }

  // Normalizar ANAC/CANAC para comparação robusta:
  // - remove tudo que não é dígito
  // - remove zeros à esquerda
  // Ex: '095168-1' / '95.168-1' / '951681' → '951681'
  const normCanac = (v: string) => (v || '').replace(/\D/g, '').replace(/^0+/, '') || '0';
  const canacNormalizado = normCanac(cabecalho.canac);

  const empresaIdNum = Number(empresaId) || null;
  const colunaCanacNormExpr = `IFNULL(NULLIF(LTRIM(REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(${colunaCanac}, ''), '-', ''), '.', ''), '/', ''), ' ', ''), '0'), ''), '0')`;

  const canacBase =
    canacNormalizado.length > 1 ? canacNormalizado.slice(0, canacNormalizado.length - 1) : '';

  const normDbCanac = (v: string) => (v || '').replace(/\D/g, '').replace(/^0+/, '') || '0';

  // 1) Busca candidatos na empresa atual (ou todos, quando empresaId não informado)
  const candidatosEmpresa = await db
    .prepare(
      `SELECT id, nome, ${colunaCanac} as canac_db
       FROM funcionarios
       WHERE deleted_at IS NULL
         AND (? IS NULL OR empresa_id = ?)
         AND ${colunaCanac} IS NOT NULL
       LIMIT 2000`,
    )
    .bind(empresaIdNum, empresaIdNum)
    .all<{ id: string; nome: string; canac_db: string }>();

  let tripRow = (candidatosEmpresa.results || []).find(
    (c) => normDbCanac(c.canac_db) === canacNormalizado,
  ) as { id: string; nome: string; canac_db: string } | undefined;

  // 2) Fallback por ANAC base (sem dígito verificador)
  if (!tripRow && canacBase) {
    tripRow = (candidatosEmpresa.results || []).find((c) => {
      const n = normDbCanac(c.canac_db);
      return n.length > 1 && n.slice(0, n.length - 1) === canacBase;
    }) as { id: string; nome: string; canac_db: string } | undefined;
  }

  // 3) Fallback global (fora da empresa)
  if (!tripRow) {
    const candidatosGlobais = await db
      .prepare(
        `SELECT id, nome, ${colunaCanac} as canac_db
         FROM funcionarios
         WHERE deleted_at IS NULL
           AND ${colunaCanac} IS NOT NULL
         LIMIT 5000`,
      )
      .all<{ id: string; nome: string; canac_db: string }>();

    tripRow = (candidatosGlobais.results || []).find(
      (c) => normDbCanac(c.canac_db) === canacNormalizado,
    ) as { id: string; nome: string; canac_db: string } | undefined;

    if (!tripRow && canacBase) {
      tripRow = (candidatosGlobais.results || []).find((c) => {
        const n = normDbCanac(c.canac_db);
        return n.length > 1 && n.slice(0, n.length - 1) === canacBase;
      }) as { id: string; nome: string; canac_db: string } | undefined;
    }
  }

  // 4) Fallback: busca por nome completo quando CANAC não bate
  //    Normaliza nome da FIRA e do banco (sem acentos, uppercase, espaços simples)
  if (!tripRow && cabecalho.nome && cabecalho.nome.length >= 4) {
    const normNome = (n: string) =>
      (n || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();

    const nomeFira = normNome(cabecalho.nome);
    if (nomeFira.length >= 4) {
      const candidatosPorNome = await db
        .prepare(
          `SELECT id, nome FROM funcionarios
           WHERE deleted_at IS NULL
             AND (? IS NULL OR empresa_id = ?)
           LIMIT 5000`,
        )
        .bind(empresaIdNum, empresaIdNum)
        .all<{ id: string; nome: string }>();

      // Match exato por nome normalizado
      const palavrasFira = nomeFira.split(' ').filter((p) => p.length >= 2);
      tripRow = (candidatosPorNome.results || []).find((c) => {
        const nomeDb = normNome(c.nome);
        return nomeDb === nomeFira;
      }) as { id: string; nome: string; canac_db: string } | undefined;

      // Match parcial: pelo menos 3 palavras em comum (primeiro e último nome obrigatórios)
      if (!tripRow && palavrasFira.length >= 2) {
        const primeiro = palavrasFira[0];
        const ultimo = palavrasFira[palavrasFira.length - 1];
        tripRow = (candidatosPorNome.results || []).find((c) => {
          const nomeDb = normNome(c.nome);
          const palavrasDb = nomeDb.split(' ').filter((p) => p.length >= 2);
          const coincidencias = palavrasFira.filter((p) => palavrasDb.includes(p));
          const temPrimeiro = palavrasDb.includes(primeiro);
          const temUltimo = palavrasDb.includes(ultimo);
          return (
            temPrimeiro && temUltimo && coincidencias.length >= Math.min(3, palavrasFira.length)
          );
        }) as { id: string; nome: string; canac_db: string } | undefined;
      }
    }
  }

  const tripulanteId = tripRow ? String(tripRow.id) : null;
  const tripulanteNomeSistema = tripRow?.nome ?? null;

  // 4. Verificar importação anterior (cumulativa — NÃO bloqueia)
  const importacaoAnterior = await db
    .prepare(
      `SELECT id, status FROM frms_importacao_fira
       WHERE canac = ? AND ano = ? AND mes = ? AND status = 'IMPORTADO'
       AND EXISTS (
         SELECT 1 FROM funcionarios op
         WHERE op.id = CAST(frms_importacao_fira.importado_por AS INTEGER)
           AND op.deleted_at IS NULL
           AND (? IS NULL OR op.empresa_id = ?)
       )
       AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
    )
    .bind(
      cabecalho.canac,
      cabecalho.ano,
      cabecalho.mes,
      Number(empresaId) || null,
      Number(empresaId) || null,
    )
    .first<{ id: string; status: string }>();

  // 5. Verificar duplicatas em batch (todos os dias do mês de uma vez)
  const mesStr = String(cabecalho.mes).padStart(2, '0');
  const dataInicio = `${cabecalho.ano}-${mesStr}-01`;
  const dataFim = `${cabecalho.ano}-${mesStr}-31`;

  let datasExistentes = new Map<string, string>();
  if (tripulanteId) {
    const existentes = await db
      .prepare(
        `SELECT data, id FROM frms_jornada
         WHERE tripulante_id = ? AND data >= ? AND data <= ?
         AND deleted_at IS NULL`,
      )
      .bind(tripulanteId, dataInicio, dataFim)
      .all<{ data: string; id: string }>();
    datasExistentes = new Map((existentes.results || []).map((j) => [j.data, j.id]));
  }

  // 6. Classificar linhas
  const linhas: FiraLinhPreview[] = dias.map((d: FiraLinhaDia) => {
    const diaStr = String(d.dia).padStart(2, '0');
    const data = `${cabecalho.ano}-${mesStr}-${diaStr}`;
    const temJornada = !!(d.inicio && d.termino);
    const statusFrms = mapFiraSituacaoToFrmsStatus(d.situacao, temJornada);

    const eDiaVazio =
      !temJornada && !d.local && (!d.situacao || d.situacao === '-') && !d.totalJornada;

    let situacao: FiraLinhPreview['situacao'];
    let jornadaExistenteId: string | null = null;

    if (eDiaVazio && !temJornada) {
      situacao = 'DIA_VAZIO';
    } else if (datasExistentes.has(data)) {
      situacao = 'DUPLICATA';
      jornadaExistenteId = datasExistentes.get(data) ?? null;
    } else {
      situacao = 'NOVO';
    }

    return enrichFiraPreviewLineIntegridade({
      dia: d.dia,
      data,
      status_fira: d.situacao,
      status_frms: statusFrms,
      hora_apresentacao: d.inicio ?? null,
      hora_termino: d.termino ?? null,
      duracao_jornada_min: hhmmToMin(d.totalJornada ?? ''),
      horas_voo_min: hhmmToMin(d.totalVoo ?? ''),
      local_base: d.local ?? null,
      situacao,
      jornada_existente_id: jornadaExistenteId,
      marcado: situacao === 'NOVO',
    });
  });

  // 7. Calcular totais
  const totaisCalculados = linhas.reduce(
    (acc, l) => {
      acc.jornada_min += l.duracao_jornada_min;
      acc.voo_min += l.horas_voo_min;
      return acc;
    },
    { jornada_min: 0, voo_min: 0 },
  );

  const totalVooFiraMin = hhmmToMin(totalVooMes);
  const temMovimentoOperacional = linhas.some(
    (l) =>
      !!(l.hora_apresentacao || l.hora_termino || l.duracao_jornada_min > 0 || l.horas_voo_min > 0),
  );
  const divergencia =
    temMovimentoOperacional &&
    totalVooFiraMin > 0 &&
    Math.abs(totaisCalculados.voo_min - totalVooFiraMin) > 5;

  // 8. Salvar PDF no R2
  const r2Key = `fira/${empresaId}/${cabecalho.canac}/${cabecalho.ano}-${mesStr}/${arquivoNome}`;
  let arquivo_r2_key: string | null = null;
  try {
    await bucket.put(r2Key, pdfBufferEstavel, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: {
        canac: cabecalho.canac,
        nome: cabecalho.nome,
        periodo: `${cabecalho.ano}-${mesStr}`,
        empresa_id: empresaId,
        uploaded_at: new Date().toISOString(),
      },
    });
    arquivo_r2_key = r2Key;
  } catch (e) {
    console.warn('[FIRA] Falha ao salvar PDF no R2:', (e as Error).message);
  }

  // 9. Criar registro em frms_importacao_fira
  //    Limpar registros antigos (REVISAO ou IMPORTADO sem jornadas) para o mesmo canac/ano/mes
  const novoTimestamp = now();
  await db
    .prepare(
      `UPDATE frms_importacao_fira
         SET deleted_at = ?, updated_at = ?
       WHERE canac = ? AND ano = ? AND mes = ? AND deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM funcionarios op
           WHERE op.id = CAST(frms_importacao_fira.importado_por AS INTEGER)
             AND op.deleted_at IS NULL
             AND (? IS NULL OR op.empresa_id = ?)
         )
         AND (status = 'REVISAO' OR (status = 'IMPORTADO' AND total_dias_importados = 0))`,
    )
    .bind(
      novoTimestamp,
      novoTimestamp,
      cabecalho.canac,
      cabecalho.ano,
      cabecalho.mes,
      Number(empresaId) || null,
      Number(empresaId) || null,
    )
    .run();

  const importacaoId = generateId();
  const timestamp = novoTimestamp;
  const preview: FiraImportacaoPreview = {
    importacao_id: importacaoId,
    tripulante_encontrado: !!tripulanteId,
    tripulante_id: tripulanteId,
    tripulante_nome_fira: cabecalho.nome,
    tripulante_nome_sistema: tripulanteNomeSistema,
    canac: cabecalho.canac,
    ano: cabecalho.ano,
    mes: cabecalho.mes,
    mes_nome: cabecalho.mesNome,
    total_dias: dias.length,
    linhas,
    totais_fira: { jornada: totalJornadaMes, voo: totalVooMes },
    totais_calculados: totaisCalculados,
    divergencia_totais: divergencia,
    avisos: parseErros,
    erros: [],
  };

  await db
    .prepare(
      `INSERT INTO frms_importacao_fira (
        id, tripulante_id, canac, nome_fira, ano, mes,
        arquivo_nome, arquivo_r2_key, status,
        total_dias_extraidos, importado_por,
        importacao_anterior_id, preview_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REVISAO', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      importacaoId,
      tripulanteId ?? null,
      cabecalho.canac,
      cabecalho.nome,
      cabecalho.ano,
      cabecalho.mes,
      arquivoNome,
      arquivo_r2_key ?? null,
      dias.length,
      operadorId,
      importacaoAnterior?.id ?? null,
      JSON.stringify(preview),
      timestamp,
      timestamp,
    )
    .run();

  return preview;
}

// ──────────────────────────────────────────────────────────────
// processarUploadFirasPorPagina
// Recebe um único PDF com múltiplas FIRAs (uma por página) e
// retorna um preview por FIRA detectada — mesma interface que
// upload-lote para reaproveitar o fluxo de confirmação.
// ──────────────────────────────────────────────────────────────

export interface FiraMultipaginaItem {
  arquivo_nome: string;
  success: boolean;
  data?: FiraImportacaoPreview;
  error?: string;
  code?: string;
}

export interface FiraMultipaginaResponse {
  total_arquivos: number; // quantas FIRAs detectadas (páginas válidas)
  processados: number;
  erros: number;
  itens: FiraMultipaginaItem[];
}

function segmentarPossiveisFiras(texto: string): string[] {
  const bruto = (texto ?? '').replace(/\r\n/g, '\n').trim();
  if (!bruto) return [];

  const porFormFeed = bruto
    .split(/[\f\x0c]+/g)
    .map((p) => p.trim())
    .filter((p) => p.length >= 50);
  if (porFormFeed.length > 1) return porFormFeed;

  const lines = bruto.split('\n');
  const idxTripulante: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/\bTRIPULANTE\b/i.test(lines[i])) idxTripulante.push(i);
  }

  if (idxTripulante.length <= 1) return [bruto];

  const blocos: string[] = [];
  for (let i = 0; i < idxTripulante.length; i++) {
    const start = Math.max(0, idxTripulante[i] - 8);
    const end =
      i + 1 < idxTripulante.length ? Math.max(start, idxTripulante[i + 1] - 8) : lines.length;
    const bloco = lines.slice(start, end).join('\n').trim();
    if (bloco.length >= 50) blocos.push(bloco);
  }

  const unicos = [...new Set(blocos)];
  return unicos.length > 0 ? unicos : [bruto];
}

export async function processarUploadFirasPorPagina(
  db: D1Database,
  bucket: R2Bucket,
  pdfBuffer: ArrayBuffer,
  arquivoNome: string,
  operadorId: string,
  empresaId: string,
  textosPaginas: string[],
): Promise<FiraMultipaginaResponse> {
  const pdfBufferEstavel = cloneArrayBuffer(pdfBuffer);

  // 1. Usar texto extraído no cliente para cada página
  const paginas = (textosPaginas || [])
    .map((p) => String(p ?? '').trim())
    .filter((p) => p.length >= 20);
  if (paginas.length === 0) {
    throw new Error(
      'Não foi possível extrair texto do PDF: textos_paginas é obrigatório para upload multipágina',
    );
  }

  const itens: FiraMultipaginaItem[] = [];
  const nomeBase = arquivoNome.replace(/\.pdf$/i, '');

  // 2. Para cada página, segmentar em possíveis FIRAs e tentar parsear cada bloco
  for (let i = 0; i < paginas.length; i++) {
    const textoPagina = paginas[i];
    const paginaNum = i + 1;
    const blocos = segmentarPossiveisFiras(textoPagina);

    for (let b = 0; b < blocos.length; b++) {
      const texto = blocos[b];
      if (!/TRIPULANTE/i.test(texto)) continue;

      const nomeArquivoPagina =
        blocos.length > 1
          ? `${nomeBase}_pag${paginaNum}_fira${b + 1}.pdf`
          : `${nomeBase}_pag${paginaNum}.pdf`;

      try {
        const preview = await processarUploadFira(
          db,
          bucket,
          cloneArrayBuffer(pdfBufferEstavel),
          nomeArquivoPagina,
          operadorId,
          empresaId,
          texto,
        );
        itens.push({ arquivo_nome: nomeArquivoPagina, success: true, data: preview });
      } catch (e) {
        itens.push({
          arquivo_nome: nomeArquivoPagina,
          success: false,
          error: (e as Error).message || 'Erro ao processar página',
          code: 'FIRA_PARSE_ERROR',
        });
      }
    }
  }

  // 3. Se nenhuma página foi identificada como FIRA, tentar o texto consolidado como fallback
  if (itens.length === 0) {
    try {
      const textoConsolidado = paginas.join('\n\n');
      const preview = await processarUploadFira(
        db,
        bucket,
        cloneArrayBuffer(pdfBufferEstavel),
        arquivoNome,
        operadorId,
        empresaId,
        textoConsolidado,
      );
      itens.push({ arquivo_nome: arquivoNome, success: true, data: preview });
    } catch (e) {
      itens.push({
        arquivo_nome: arquivoNome,
        success: false,
        error: (e as Error).message || 'Nenhuma FIRA detectada no PDF',
        code: 'FIRA_NO_FIRA_FOUND',
      });
    }
  }

  const processados = itens.filter((x) => x.success).length;
  return {
    total_arquivos: itens.length,
    processados,
    erros: itens.length - processados,
    itens,
  };
}

// ──────────────────────────────────────────────────────────────
// confirmarImportacaoFira
// ──────────────────────────────────────────────────────────────

export async function confirmarImportacaoFira(
  db: D1Database,
  importacaoId: string,
  input: FiraImportacaoConfirmarInput,
  operadorId: string,
  limites: LimitesMap,
  empresaId?: number,
): Promise<FiraImportacaoResultado> {
  // 1. Buscar importação
  const importacao = await db
    .prepare(
      `SELECT f.*
         FROM frms_importacao_fira f
         LEFT JOIN funcionarios p ON p.id = CAST(f.tripulante_id AS INTEGER)
         LEFT JOIN funcionarios op ON op.id = CAST(f.importado_por AS INTEGER)
        WHERE f.id = ? AND f.deleted_at IS NULL AND (? IS NULL OR p.empresa_id = ? OR op.empresa_id = ? OR (f.tripulante_id IS NULL AND (f.importado_por IS NULL OR op.id IS NULL)))`,
    )
    .bind(importacaoId, empresaId ?? null, empresaId ?? null, empresaId ?? null)
    .first<{
      id: string;
      tripulante_id: string | null;
      canac: string;
      ano: number;
      mes: number;
      preview_json: string;
      status: string;
      total_dias_importados: number;
    }>();

  if (!importacao) throw new Error('Importação FIRA não encontrada');

  // Permite re-confirmação se IMPORTADO mas 0 jornadas salvas (falha silenciosa anterior)
  if (importacao.status === 'IMPORTADO' && importacao.total_dias_importados === 0) {
    await db
      .prepare(`UPDATE frms_importacao_fira SET status = 'REVISAO', updated_at = ? WHERE id = ?`)
      .bind(now(), importacaoId)
      .run();
    importacao.status = 'REVISAO';
  }

  if (importacao.status !== 'REVISAO') {
    throw new Error(
      `Importação já processada com sucesso (${importacao.status}). Para reimportar, faça um novo upload.`,
    );
  }
  if (!importacao.tripulante_id) {
    throw new Error('Tripulante não vinculado. Vincule o tripulante antes de confirmar.');
  }

  // 2. Recuperar preview
  const preview: FiraImportacaoPreview = JSON.parse(importacao.preview_json);
  preview.linhas = preview.linhas.map((linha) => enrichFiraPreviewLineIntegridade(linha));

  // 3. Processar dias selecionados
  const diasMap = new Map(
    input.dias_selecionados.map((d) => [d.dia, d.forcar_substituicao ?? false]),
  );

  let importados = 0;
  let substituidos = 0;
  let ignorados = 0;
  let erros = 0;
  const errosDetalhes: string[] = [];
  let alertasGerados = 0;

  const mesStr = String(importacao.mes).padStart(2, '0');

  const linhaPorDia = new Map(preview.linhas.map((linha) => [linha.dia, linha]));
  const linhasProcessar: Array<{ linha: FiraLinhPreview; forcarSubstituicao: boolean }> = [];

  for (const diaSel of input.dias_selecionados) {
    const linha = linhaPorDia.get(diaSel.dia);
    if (!linha) {
      ignorados++;
      continue;
    }

    if (linha.situacao === 'DIA_VAZIO') {
      ignorados++;
      continue;
    }

    const forcarSubstituicao = diasMap.get(linha.dia) ?? false;
    if (linha.situacao === 'DUPLICATA' && !forcarSubstituicao) {
      ignorados++;
      continue;
    }

    linhasProcessar.push({ linha, forcarSubstituicao });
  }

  linhasProcessar.sort((a, b) => a.linha.data.localeCompare(b.linha.data));

  const datasSemJornadaExistente = linhasProcessar
    .filter(({ linha }) => !linha.jornada_existente_id)
    .map(({ linha }) => linha.data);

  const jornadasExistentesPorData = new Map<string, string>();
  if (datasSemJornadaExistente.length > 0) {
    const placeholders = datasSemJornadaExistente.map(() => '?').join(', ');
    const existentes = await db
      .prepare(
        `SELECT id, data
           FROM frms_jornada
          WHERE deleted_at IS NULL
            AND tripulante_id = ?
            AND data IN (${placeholders})`,
      )
      .bind(importacao.tripulante_id, ...datasSemJornadaExistente)
      .all<{ id: string; data: string }>();

    for (const row of existentes.results || []) {
      jornadasExistentesPorData.set(row.data, row.id);
    }
  }

  const linhasPreparadas = linhasProcessar.map(({ linha, forcarSubstituicao }) => ({
    linha,
    forcarSubstituicao,
    jornadaExistenteId:
      linha.jornada_existente_id || jornadasExistentesPorData.get(linha.data) || null,
  }));

  const datasLinhasPreparadas = [
    ...new Set(linhasPreparadas.map((item) => item.linha.data).filter(Boolean)),
  ] as string[];
  const jornadaExistenteIds = [
    ...new Set(linhasPreparadas.map((item) => item.jornadaExistenteId).filter(Boolean)),
  ] as string[];

  const jornadasExistentesMap = new Map<string, JornadaExistenteParaMerge>();
  const jornadasExistentesPorDataComDetalhe = new Map<string, JornadaExistenteParaMerge[]>();

  if (datasLinhasPreparadas.length > 0) {
    const placeholders = datasLinhasPreparadas.map(() => '?').join(', ');
    const rowsByDate = await db
      .prepare(
        `SELECT id,
                data,
                origem,
                empresa_id,
                hora_apresentacao,
                hora_termino,
                horas_voo_minutos,
                duracao_jornada_minutos
           FROM frms_jornada
          WHERE tripulante_id = ?
            AND data IN (${placeholders})
            AND deleted_at IS NULL`,
      )
      .bind(importacao.tripulante_id, ...datasLinhasPreparadas)
      .all<JornadaExistenteParaMerge>();

    for (const row of rowsByDate.results || []) {
      const list = jornadasExistentesPorDataComDetalhe.get(row.data) || [];
      list.push(row);
      jornadasExistentesPorDataComDetalhe.set(row.data, list);
      jornadasExistentesMap.set(String(row.id), row);
    }
  }

  if (jornadaExistenteIds.length > 0) {
    const placeholders = jornadaExistenteIds.map(() => '?').join(', ');
    const rows = await db
      .prepare(
        `SELECT id,
                data,
                origem,
                empresa_id,
                hora_apresentacao,
                hora_termino,
                horas_voo_minutos,
                duracao_jornada_minutos
           FROM frms_jornada
          WHERE id IN (${placeholders})
            AND deleted_at IS NULL`,
      )
      .bind(...jornadaExistenteIds)
      .all<JornadaExistenteParaMerge>();

    for (const row of rows.results || []) {
      jornadasExistentesMap.set(String(row.id), row);
    }
  }

  const linhasPreparadasComMerge = linhasPreparadas.map((item) => {
    const jornadaExistenteOriginal = item.jornadaExistenteId
      ? jornadasExistentesMap.get(String(item.jornadaExistenteId)) || null
      : null;
    const hasDateMismatch =
      Boolean(jornadaExistenteOriginal) && jornadaExistenteOriginal?.data !== item.linha.data;
    const jornadaExistente =
      hasDateMismatch
        ? (jornadasExistentesPorDataComDetalhe.get(item.linha.data)?.[0] ?? null)
        : jornadaExistenteOriginal;
    const jornadaExistenteId = jornadaExistente?.id ?? null;
    const hasTenantConflict =
      empresaId !== undefined &&
      empresaId !== null &&
      jornadaExistente?.empresa_id !== null &&
      jornadaExistente?.empresa_id !== undefined &&
      jornadaExistente.empresa_id !== empresaId;
    const shouldMerge = item.forcarSubstituicao
      ? shouldMergeIntoExistingManualJornada({
          linha: item.linha,
          jornada: jornadaExistente,
          empresaId,
        })
      : false;

    return {
      ...item,
      jornadaExistenteId,
      hasDateMismatch,
      hasTenantConflict,
      shouldMerge,
    };
  });

  const substituicoes = linhasPreparadasComMerge.filter(
    ({ forcarSubstituicao, jornadaExistenteId, shouldMerge, hasTenantConflict }) =>
      forcarSubstituicao && Boolean(jornadaExistenteId) && !shouldMerge && !hasTenantConflict,
  );

  if (substituicoes.length > 0) {
    const timestampSubstituicao = now();
    const stmtDelete = db.prepare(
      `UPDATE frms_jornada SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    );
    const stmtDeleteAlertas = db.prepare(
      `UPDATE frms_alerta SET deleted_at = ?, updated_at = ? WHERE jornada_id = ? AND deleted_at IS NULL`,
    );
    const stmtDeleteFat = db.prepare(
      `UPDATE frms_fatorizacao_jornada SET deleted_at = ?, updated_at = ? WHERE jornada_id = ? AND deleted_at IS NULL`,
    );

    await db.batch([
      ...substituicoes.map(({ jornadaExistenteId }) =>
        stmtDelete.bind(timestampSubstituicao, timestampSubstituicao, jornadaExistenteId!),
      ),
      ...substituicoes.map(({ jornadaExistenteId }) =>
        stmtDeleteAlertas.bind(timestampSubstituicao, timestampSubstituicao, jornadaExistenteId!),
      ),
      ...substituicoes.map(({ jornadaExistenteId }) =>
        stmtDeleteFat.bind(timestampSubstituicao, timestampSubstituicao, jornadaExistenteId!),
      ),
    ]);

    const stmtAuditoria = db.prepare(
      `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos)
       VALUES ('frms_jornada', 'FRMS_JORNADA_SUBSTITUIDA_FIRA', ?, ?, ?)`,
    );

    await db.batch(
      substituicoes.map(({ linha, jornadaExistenteId }) =>
        stmtAuditoria.bind(
          jornadaExistenteId!,
          JSON.stringify({ id: jornadaExistenteId }),
          JSON.stringify({
            canac: importacao.canac,
            data: linha.data,
            motivo: 'Substituição forçada na importação FIRA',
          }),
        ),
      ),
    );
  }

  for (const {
    linha,
    forcarSubstituicao,
    jornadaExistenteId,
    shouldMerge,
    hasDateMismatch,
    hasTenantConflict,
  } of linhasPreparadasComMerge) {
    try {
      if (hasDateMismatch) {
        errosDetalhes.push(
          `Dia ${linha.dia} (${linha.data}): jornada duplicada apontada para outra data, usando jornada do mesmo dia`,
        );
      }

      if (hasTenantConflict) {
        erros++;
        errosDetalhes.push(
          `Dia ${linha.dia} (${linha.data}): conflito de empresa na jornada duplicada existente`,
        );
        continue;
      }

      if (jornadaExistenteId && !forcarSubstituicao) {
        ignorados++;
        continue;
      }

      if (jornadaExistenteId && shouldMerge) {
        const result = await atualizarJornada(
          db,
          jornadaExistenteId,
          {
            status: linha.status_frms,
            hora_apresentacao: linha.hora_apresentacao,
            hora_termino: linha.hora_termino,
            horas_voo_minutos: linha.horas_voo_min || null,
            observacao: null,
            origem: 'SIGVOOS',
            local_base: linha.local_base ?? null,
            empresa_id: empresaId ?? null,
          },
          limites,
        );
        alertasGerados += result.alertas.length;
        substituidos++;
        continue;
      }

      const jornadaInput = {
        tripulante_id: importacao.tripulante_id!,
        empresa_id: empresaId ?? null,
        data: linha.data,
        status: linha.status_frms,
        hora_apresentacao: linha.hora_apresentacao,
        hora_termino: linha.hora_termino,
        horas_voo_minutos: linha.horas_voo_min || null,
        hora_primeiro_acionamento: null,
        hora_primeira_decolagem: null,
        hora_ultimo_pouso: null,
        hora_corte_motor: null,
        observacao: null,
        registrado_por: operadorId,
        origem: String(linha.status_fira || '').trim().toUpperCase() === 'SIGVOOS' ? ('SIGVOOS' as const) : ('FIRA' as const),
        local_base: linha.local_base ?? null,
      };

      const result = await salvarJornada(db, jornadaInput, limites);
      alertasGerados += result.alertas.length;

      if (forcarSubstituicao && jornadaExistenteId) {
        substituidos++;
      } else {
        importados++;
      }
    } catch (e) {
      erros++;
      errosDetalhes.push(`Dia ${linha.dia} (${linha.data}): ${(e as Error).message}`);
    }
  }

  // 4. Atualizar registro de importação
  const timestamp = now();
  await db
    .prepare(
      `UPDATE frms_importacao_fira SET
        status = 'IMPORTADO',
        total_dias_importados = ?,
        total_dias_substituidos = ?,
        total_dias_ignorados = ?,
        total_dias_erro = ?,
        erros_json = ?,
        revisado_por = ?,
        revisado_em = ?,
        importado_em = ?,
        updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      importados,
      substituidos,
      ignorados,
      erros,
      errosDetalhes.length > 0 ? JSON.stringify(errosDetalhes) : null,
      operadorId,
      timestamp,
      timestamp,
      timestamp,
      importacaoId,
    )
    .run();

  // 5. Log de auditoria
  await db
    .prepare(
      `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos)
       VALUES ('frms_importacao_fira', 'FRMS_IMPORTACAO_FIRA_CONFIRMAR', ?, null, ?)`,
    )
    .bind(
      importacaoId,
      JSON.stringify({
        canac: importacao.canac,
        periodo: `${importacao.ano}-${mesStr}`,
        importados,
        substituidos,
        ignorados,
        erros,
      }),
    )
    .run();

  return {
    importacao_id: importacaoId,
    importados,
    substituidos,
    ignorados,
    erros,
    erros_detalhes: errosDetalhes,
    alertas_gerados: alertasGerados,
  };
}

// ──────────────────────────────────────────────────────────────
// Buscar histórico de importações FIRA
// ──────────────────────────────────────────────────────────────

export interface FiraImportacaoHistoricoQuery {
  empresa_id?: number;
  tripulante_id?: string;
  status?: string;
  ano?: number;
  mes?: number;
  page?: number;
  per_page?: number;
}

export async function buscarHistoricoFira(
  db: D1Database,
  query: FiraImportacaoHistoricoQuery,
): Promise<{ data: unknown[]; total: number; page: number; per_page: number }> {
  const page = query.page ?? 1;
  const perPage = query.per_page ?? 20;
  const offset = (page - 1) * perPage;

  const conds: string[] = ['f.deleted_at IS NULL'];
  const bindings: unknown[] = [];

  if (query.empresa_id !== undefined) {
    conds.push(
      '(p.empresa_id = ? OR op.empresa_id = ? OR (f.tripulante_id IS NULL AND (f.importado_por IS NULL OR op.id IS NULL)))',
    );
    bindings.push(query.empresa_id, query.empresa_id);
  }

  if (query.tripulante_id) {
    conds.push('f.tripulante_id = ?');
    bindings.push(query.tripulante_id);
  }
  if (query.status) {
    conds.push('f.status = ?');
    bindings.push(query.status);
  }
  if (query.ano) {
    conds.push('f.ano = ?');
    bindings.push(query.ano);
  }
  if (query.mes) {
    conds.push('f.mes = ?');
    bindings.push(query.mes);
  }

  const where = conds.join(' AND ');

  const countRow = await db
    .prepare(
      `SELECT COUNT(*) as total
         FROM frms_importacao_fira f
         LEFT JOIN funcionarios p ON p.id = CAST(f.tripulante_id AS INTEGER)
         LEFT JOIN funcionarios op ON op.id = CAST(f.importado_por AS INTEGER)
        WHERE ${where}`,
    )
    .bind(...bindings)
    .first<{ total: number }>();

  const rows = await db
    .prepare(
      `SELECT f.id, f.tripulante_id, f.canac, f.nome_fira, f.ano, f.mes,
              f.arquivo_nome, f.status,
              f.total_dias_extraidos, f.total_dias_importados,
              f.total_dias_substituidos, f.total_dias_ignorados, f.total_dias_erro,
              f.importado_por, f.importado_em, f.revisado_por, f.revisado_em,
              f.importacao_anterior_id, f.created_at,
              p.nome as tripulante_nome,
              op.nome as operador_nome
       FROM frms_importacao_fira f
       LEFT JOIN funcionarios p ON p.id = CAST(f.tripulante_id AS INTEGER)
       LEFT JOIN funcionarios op ON op.id = CAST(f.importado_por AS INTEGER)
       WHERE ${where}
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .bind(...bindings, perPage, offset)
    .all();

  return {
    data: rows.results || [],
    total: countRow?.total ?? 0,
    page,
    per_page: perPage,
  };
}

// ──────────────────────────────────────────────────────────────
// Buscar importação FIRA por ID
// ──────────────────────────────────────────────────────────────

function requireFiraEmpresaId(empresaId: number | undefined): number {
  if (!Number.isInteger(empresaId) || Number(empresaId) <= 0) {
    throw new Error('Contexto de empresa inválido');
  }
  return Number(empresaId);
}

export async function buscarImportacaoFiraById(
  db: D1Database,
  importacaoId: string,
  empresaId: number,
): Promise<unknown | null> {
  const tenantEmpresaId = requireFiraEmpresaId(empresaId);
  const row = await db
    .prepare(
      `SELECT f.*, p.nome as tripulante_nome, op.nome as operador_nome
       FROM frms_importacao_fira f
       LEFT JOIN funcionarios p ON p.id = CAST(f.tripulante_id AS INTEGER)
       LEFT JOIN funcionarios op ON op.id = CAST(f.importado_por AS INTEGER)
      WHERE f.id = ?
        AND f.deleted_at IS NULL
        AND (p.empresa_id = ? OR op.empresa_id = ?)`,
    )
    .bind(importacaoId, tenantEmpresaId, tenantEmpresaId)
    .first();

  return row ?? null;
}

// ──────────────────────────────────────────────────────────────
// Soft delete de importação FIRA
// ──────────────────────────────────────────────────────────────

export async function deletarImportacaoFira(
  db: D1Database,
  importacaoId: string,
  operadorId: string,
  empresaId: number,
): Promise<void> {
  const tenantEmpresaId = requireFiraEmpresaId(empresaId);
  const row = await db
    .prepare(
      `SELECT f.status, f.total_dias_importados
         FROM frms_importacao_fira f
        WHERE f.id = ?
          AND f.deleted_at IS NULL
          AND (
            EXISTS (
              SELECT 1 FROM funcionarios p
               WHERE p.id = CAST(f.tripulante_id AS INTEGER) AND p.empresa_id = ?
            )
            OR EXISTS (
              SELECT 1 FROM funcionarios op
               WHERE op.id = CAST(f.importado_por AS INTEGER) AND op.empresa_id = ?
            )
          )`,
    )
    .bind(importacaoId, tenantEmpresaId, tenantEmpresaId)
    .first<{ status: string; total_dias_importados: number }>();

  if (!row) throw new Error('Importação não encontrada');

  const isZombieImportado = row.status === 'IMPORTADO' && row.total_dias_importados === 0;
  if (!['REVISAO', 'REJEITADO', 'ERRO'].includes(row.status) && !isZombieImportado) {
    throw new Error(`Não é possível deletar importação com status ${row.status}`);
  }

  const timestamp = now();
  const deleted = await db
    .prepare(
      `UPDATE frms_importacao_fira
          SET deleted_at = ?, updated_at = ?
        WHERE id = ?
          AND deleted_at IS NULL
          AND (
            EXISTS (
              SELECT 1 FROM funcionarios p
               WHERE p.id = CAST(frms_importacao_fira.tripulante_id AS INTEGER)
                 AND p.empresa_id = ?
            )
            OR EXISTS (
              SELECT 1 FROM funcionarios op
               WHERE op.id = CAST(frms_importacao_fira.importado_por AS INTEGER)
                 AND op.empresa_id = ?
            )
          )`,
    )
    .bind(timestamp, timestamp, importacaoId, tenantEmpresaId, tenantEmpresaId)
    .run();

  if (Number(deleted.meta?.changes ?? 0) !== 1) {
    throw new Error('Importação não encontrada');
  }

  await db
    .prepare(
      `INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos)
       VALUES ('frms_importacao_fira', 'DELETE', ?, ?, null)`,
    )
    .bind(importacaoId, JSON.stringify({ deletado_por: operadorId }))
    .run();
}

// ──────────────────────────────────────────────────────────────
// Vincular tripulante a uma importação FIRA
// ──────────────────────────────────────────────────────────────

export async function vincularTripulanteFira(
  db: D1Database,
  importacaoId: string,
  tripulanteId: string,
  empresaId: number,
): Promise<void> {
  const tenantEmpresaId = requireFiraEmpresaId(empresaId);
  const importacao = await buscarImportacaoFiraById(db, importacaoId, tenantEmpresaId);
  if (!importacao) throw new Error('Importação não encontrada');

  // Validar existência do tripulante
  const tripRow = await db
    .prepare(
      `SELECT id FROM funcionarios WHERE id = ? AND deleted_at IS NULL AND empresa_id = ? LIMIT 1`,
    )
    .bind(tripulanteId, tenantEmpresaId)
    .first<{ id: number }>();
  if (!tripRow) {
    throw new Error(`Tripulante #${tripulanteId} não encontrado`);
  }

  const timestamp = now();
  // Atualizar importação com o tripulante vinculado
  const updated = await db
    .prepare(
      `UPDATE frms_importacao_fira
          SET tripulante_id = ?, updated_at = ?
        WHERE id = ?
          AND deleted_at IS NULL
          AND (
            EXISTS (
              SELECT 1 FROM funcionarios p
               WHERE p.id = CAST(frms_importacao_fira.tripulante_id AS INTEGER)
                 AND p.empresa_id = ?
            )
            OR EXISTS (
              SELECT 1 FROM funcionarios op
               WHERE op.id = CAST(frms_importacao_fira.importado_por AS INTEGER)
                 AND op.empresa_id = ?
            )
          )`,
    )
    .bind(tripulanteId, timestamp, importacaoId, tenantEmpresaId, tenantEmpresaId)
    .run();

  if (Number(updated.meta?.changes ?? 0) !== 1) {
    throw new Error('Importação não encontrada');
  }

  // Atualizar preview_json com o novo tripulante_id
  const row = await db
    .prepare(
      `SELECT f.preview_json
         FROM frms_importacao_fira f
        WHERE f.id = ?
          AND f.deleted_at IS NULL
          AND (f.tripulante_id = ? OR EXISTS (
            SELECT 1 FROM funcionarios op
             WHERE op.id = CAST(f.importado_por AS INTEGER) AND op.empresa_id = ?
          ))`,
    )
    .bind(importacaoId, tripulanteId, tenantEmpresaId)
    .first<{ preview_json: string }>();

  if (row?.preview_json) {
    const preview: FiraImportacaoPreview = JSON.parse(row.preview_json);
    preview.tripulante_id = tripulanteId;
    preview.tripulante_encontrado = true;

    // Buscar nome
    const pessoa = await db
      .prepare(`SELECT nome FROM funcionarios WHERE id = ? AND deleted_at IS NULL`)
      .bind(tripulanteId)
      .first<{ nome: string }>();
    if (pessoa) preview.tripulante_nome_sistema = pessoa.nome;

    await db
      .prepare(
        `UPDATE frms_importacao_fira
            SET preview_json = ?, updated_at = ?
          WHERE id = ?
            AND deleted_at IS NULL
            AND (tripulante_id = ? OR EXISTS (
              SELECT 1 FROM funcionarios op
               WHERE op.id = CAST(frms_importacao_fira.importado_por AS INTEGER)
                 AND op.empresa_id = ?
            ))`,
      )
      .bind(JSON.stringify(preview), timestamp, importacaoId, tripulanteId, tenantEmpresaId)
      .run();
  }
}
