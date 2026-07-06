/**
 * EXPORTAÇÃO DE DADOS PARA EXCEL
 *
 * Endpoints:
 * - GET /api/exportacao/funcionarios - Exporta todos os funcionários
 * - GET /api/exportacao/qualificacoes-historico - Exporta histórico de qualificações
 * - GET /api/exportacao/qualificacoes-tipos - Exporta tipos de qualificações
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { calcularDataVencimento } from '../utils/qualificacoes-expiration';
import { getEmpresaId } from '../middleware/tenant';
import { createLogger } from '../utils/logger';
import {
  appendEmployeeSectorFilter,
  getEmployeeSectorAccess,
} from '../services/employee-sector-access';
import {
  getQualificacoesAlertaDias,
  getTodayIsoSaoPaulo,
} from '../utils/qualificacoes-alerta-config';

const app = new Hono<{ Bindings: Env }>();

async function loadExcelJS(): Promise<typeof import('exceljs')> {
  return (await import('exceljs/dist/es5/exceljs.browser.js')) as unknown as typeof import('exceljs');
}

/**
 * GET /api/exportacao/funcionarios
 * Exporta todos os funcionários em formato XLSX
 */
app.get('/funcionarios', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);
    const conditions = ['f.deleted_at IS NULL', 'f.empresa_id = ?'];
    const bindings: unknown[] = [empresaId];
    appendEmployeeSectorFilter(conditions, bindings, access, 'f');

    const funcionarios = await db
      .prepare(
        `SELECT 
          f.id,
          f.nome,
          f.matricula,
          f.cpf,
          f.email,
          f.telefone,
          f.nascimento,
          f.admissao,
          f.cargo,
          f.funcao,
          COALESCE(ma.modelo, ma.codigo, ma.nome) as aeronave,
          f.codigo_anac,
          f.licenca,
          f.is_instrutor,
          COALESCE(f.is_examinador, f.is_checador, 0) as is_examinador,
          COALESCE(f.ativo, CASE WHEN UPPER(COALESCE(f.status, 'ATIVO')) = 'ATIVO' THEN 1 ELSE 0 END, 1) as ativo,
          f.created_at,
          f.updated_at
        FROM funcionarios f
        LEFT JOIN modelos_aeronave ma ON CAST(ma.id AS TEXT) = f.modelo_aeronave_id AND ma.deleted_at IS NULL
        WHERE ${conditions.join('\n          AND ')}
        ORDER BY f.nome`,
      )
      .bind(...bindings)
      .all();

    if (!funcionarios.success) {
      return c.json({ success: false, error: 'Erro ao buscar funcionários' }, 500);
    }

    const rows = funcionarios.results || [];
    if (rows.length === 0) {
      return c.json({ success: false, error: 'Nenhum funcionário encontrado' }, 404);
    }

    // Criar workbook Excel
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Funcionários');

    // Definir colunas
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Nome', key: 'nome', width: 30 },
      { header: 'Matrícula', key: 'matricula', width: 15 },
      { header: 'CPF', key: 'cpf', width: 15 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Telefone', key: 'telefone', width: 15 },
      { header: 'Nascimento', key: 'nascimento', width: 12 },
      { header: 'Admissão', key: 'admissao', width: 12 },
      { header: 'Cargo', key: 'cargo', width: 20 },
      { header: 'Função', key: 'funcao', width: 20 },
      { header: 'Aeronave', key: 'aeronave', width: 15 },
      { header: 'Código ANAC', key: 'codigo_anac', width: 15 },
      { header: 'Licença', key: 'licenca', width: 15 },
      { header: 'Instrutor', key: 'is_instrutor', width: 10 },
      { header: 'Examinador', key: 'is_examinador', width: 12 },
      { header: 'Ativo', key: 'ativo', width: 10 },
      { header: 'Criado em', key: 'created_at', width: 20 },
      { header: 'Atualizado em', key: 'updated_at', width: 20 },
    ];

    // Estilizar cabeçalho
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Adicionar dados
    for (const row of rows as any[]) {
      worksheet.addRow({
        id: row.id || '',
        nome: row.nome || '',
        matricula: row.matricula || '',
        cpf: row.cpf || '',
        email: row.email || '',
        telefone: row.telefone || '',
        nascimento: row.nascimento || '',
        admissao: row.admissao || '',
        cargo: row.cargo || '',
        funcao: row.funcao || '',
        aeronave: row.aeronave || '',
        codigo_anac: row.codigo_anac || '',
        licenca: row.licenca || '',
        is_instrutor: row.is_instrutor ? 'Sim' : 'Não',
        is_examinador: row.is_examinador ? 'Sim' : 'Não',
        ativo: row.ativo ? 'Sim' : 'Não',
        created_at: row.created_at || '',
        updated_at: row.updated_at || '',
      });
    }

    // Gerar buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().split('T')[0];

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="funcionarios_${timestamp}.xlsx"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    createLogger(c, 'ExportacaoRoutes').error('Erro ao exportar funcionarios', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

/**
 * GET /api/exportacao/qualificacoes-historico
 * Exporta histórico de qualificações em formato XLSX — dados completos de todas as tabelas
 */
app.get('/qualificacoes-historico', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);
    const access = await getEmployeeSectorAccess(c, empresaId);

    // MODELO_AERONAVE_EXPR idêntico ao historico.ts — inclui funcionarios_aeronaves
    const MODELO_AERONAVE_EXPR = `COALESCE(
      NULLIF(
        (
          SELECT REPLACE(
            GROUP_CONCAT(DISTINCT COALESCE(ma_multi.modelo, ma_multi.codigo, ma_multi.nome)),
            ',',
            ' / '
          )
          FROM modelos_aeronave ma_multi
          WHERE ma_multi.deleted_at IS NULL
            AND INSTR(
              ',' || REPLACE(COALESCE(f.modelo_aeronave_id, ''), ' ', '') || ',',
              ',' || CAST(ma_multi.id AS TEXT) || ','
            ) > 0
        ),
        ''
      ),
      NULLIF(
        (
          SELECT REPLACE(
            GROUP_CONCAT(DISTINCT UPPER(TRIM(COALESCE(a.modelo, '')))),
            ',',
            ' / '
          )
          FROM funcionarios_aeronaves fa
          JOIN aeronaves a
            ON a.id = fa.aeronave_id
           AND COALESCE(a.deleted_at, '') = ''
          WHERE fa.funcionario_id = f.id
            AND COALESCE(fa.deleted_at, '') = ''
            AND TRIM(COALESCE(a.modelo, '')) <> ''
        ),
        ''
      ),
      COALESCE(ma.modelo, ma.codigo, ma.nome),
      NULLIF(REPLACE(REPLACE(COALESCE(f.modelo_aeronave_id, ''), ',', ' / '), ' ', ''), '')
    )`;

    const conditions = ['qh.deleted_at IS NULL', 'f.empresa_id = ?'];
    const params: unknown[] = [empresaId];
    appendEmployeeSectorFilter(conditions, params, access, 'f');

    const { results } = await db
      .prepare(
        `
      SELECT
        qh.id,
        f.nome                                                             AS funcionario_nome,
        f.matricula                                                        AS funcionario_matricula,
        f.codigo_anac                                                      AS funcionario_codigo_anac,
        f.cpf                                                              AS funcionario_cpf,
        f.funcao                                                           AS funcionario_funcao,
        f.nascimento                                                       AS funcionario_nascimento,
        ${MODELO_AERONAVE_EXPR}                                            AS modelo_aeronave,
        qh.qualificacao_id                                                 AS tipo_id,
        qt.nome                                                            AS tipo_nome,
        COALESCE(qh.tipo, qt.nome)                                         AS qualificacao_nome,
        COALESCE(qh.qualificacao_codigo, qt.codigo)                        AS qualificacao_codigo,
        COALESCE(qh.categoria, qt.categoria)                               AS categoria,
        COALESCE(qh.validade_meses, qt.validade, 12)                       AS validade_meses,
        qt.vencimento_fim_mes                                              AS vencimento_fim_mes,
        qh.data_conclusao                                                  AS data_realizacao,
        COALESCE(qh.data_vencimento, date(qh.data_conclusao, '+' || COALESCE(qh.validade_meses, qt.validade, 12) || ' months'))
                                                                           AS data_vencimento_raw,
        qh.renovada,
        qh.status                                                          AS qualificacao_status,
        qh.numero_certificado,
        qh.instrutor,
        qh.carga_horaria,
        qh.nota,
        qh.observacoes,
        qh.created_at
      FROM qualificacoes_historico qh
      LEFT JOIN funcionarios f         ON f.id = qh.funcionario_id AND f.deleted_at IS NULL
      LEFT JOIN qualificacoes_tipos qt ON qt.id = qh.qualificacao_id AND qt.deleted_at IS NULL
      LEFT JOIN modelos_aeronave ma    ON CAST(ma.id AS TEXT) = f.modelo_aeronave_id AND ma.deleted_at IS NULL
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY qh.data_conclusao DESC, f.nome ASC
    `,
      )
      .bind(...params)
      .all();

    if (!results || results.length === 0) {
      return c.json({ success: false, error: 'Nenhum registro encontrado' }, 404);
    }

    // ─── Enriquecimento igual ao historico.ts ───────────────────────────────
    const thresholdDias = await getQualificacoesAlertaDias(db, empresaId);
    const today = getTodayIsoSaoPaulo();
    const dThreshold = new Date(today + 'T00:00:00');
    dThreshold.setDate(dThreshold.getDate() + thresholdDias);
    const todayThreshold = dThreshold.toISOString().split('T')[0];

    const enriched = (results as any[]).map((r) => {
      let validadeMesesEfetiva = Number(r.validade_meses || 12);

      // Ajuste especial para CMA acima de 60 anos
      const codigoQ = String(r.qualificacao_codigo || '').toUpperCase();
      if (codigoQ === 'CMA' && r.funcionario_nascimento && r.data_realizacao) {
        const birthDate = new Date(String(r.funcionario_nascimento) + 'T00:00:00Z');
        const refDate = new Date(String(r.data_realizacao) + 'T00:00:00Z');
        const sixtiethBirthday = new Date(birthDate);
        sixtiethBirthday.setFullYear(sixtiethBirthday.getFullYear() + 60);
        if (sixtiethBirthday <= refDate) validadeMesesEfetiva = 6;
      }

      const vencimentoFimMes = Number(r.vencimento_fim_mes || 0) === 1 ? 1 : 0;
      let dataVencimento = r.data_vencimento_raw as string | null;
      if (r.data_realizacao && validadeMesesEfetiva > 0) {
        try {
          dataVencimento = calcularDataVencimento(
            String(r.data_realizacao),
            validadeMesesEfetiva,
            vencimentoFimMes,
          );
        } catch {
          // mantém data_vencimento_raw como fallback
        }
      }

      // Derivar status — mesma lógica do historico.ts
      // RENOVADA: NUNCA derivar baseado apenas em renovada=1.
      // Só é RENOVADA se existe sucessora real (não é vigente operacional).
      const dbStatus = (r.qualificacao_status as string | null)?.toUpperCase();
      let status: string;
      if (dbStatus === 'PLANEJADA' || (!r.data_realizacao && !dataVencimento)) {
        status = 'PLANEJADA';
      } else if (!dataVencimento) {
        status = 'INDEFINIDA';
      } else if (dataVencimento < today) {
        status = 'VENCIDA';
      } else if (dataVencimento <= todayThreshold) {
        status = 'VENCENDO_30';
      } else {
        status = 'VALIDA';
      }

      return {
        ...r,
        data_vencimento: dataVencimento,
        validade_meses: validadeMesesEfetiva,
        status_derivado: status,
      };
    });

    // ─── Label de status para exibição ──────────────────────────────────────
    const STATUS_LABEL: Record<string, string> = {
      VALIDA: 'Válida',
      VENCIDA: 'Vencida',
      VENCENDO_30: 'Vencendo',
      PLANEJADA: 'Planejada',
      RENOVADA: 'Renovada',
      CANCELADA: 'Cancelada',
      INDEFINIDA: 'Indefinida',
    };

    function fmtDate(d: string | null | undefined): string {
      if (!d) return '';
      const parts = d.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
      return d;
    }

    function diasRestantes(venc: string | null | undefined): string {
      if (!venc) return '';
      const diff = Math.floor(
        (new Date(venc + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
      );
      if (diff < 0) return `${Math.abs(diff)} dias atrás`;
      if (diff === 0) return 'Hoje';
      return `${diff} dias`;
    }

    // ─── Workbook ────────────────────────────────────────────────────────────
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AirTrust';
    workbook.created = new Date();
    const ws = workbook.addWorksheet('Qualificações');

    ws.columns = [
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Funcionário', key: 'funcionario', width: 32 },
      { header: 'CANAC', key: 'canac', width: 12 },
      { header: 'Matrícula', key: 'matricula', width: 13 },
      { header: 'CPF', key: 'cpf', width: 15 },
      { header: 'Função', key: 'funcao', width: 18 },
      { header: 'Aeronave', key: 'aeronave', width: 14 },
      { header: 'Qualificação', key: 'qualificacao', width: 38 },
      { header: 'Código', key: 'codigo', width: 16 },
      { header: 'Categoria', key: 'categoria', width: 16 },
      { header: 'Realizado', key: 'realizado', width: 13 },
      { header: 'Validade (meses)', key: 'validade', width: 14 },
      { header: 'Vencimento', key: 'vencimento', width: 13 },
      { header: 'Dias Restantes', key: 'dias', width: 14 },
      { header: 'Nº Certificado', key: 'certificado', width: 20 },
      { header: 'Instrutor', key: 'instrutor', width: 28 },
      { header: 'Carga Horária', key: 'carga_h', width: 13 },
      { header: 'Nota', key: 'nota', width: 8 },
      { header: 'Observações', key: 'observacoes', width: 35 },
      { header: 'Criado em', key: 'criado_em', width: 18 },
    ];

    // Cabeçalho estilizado
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    headerRow.height = 22;

    const STATUS_COLORS: Record<string, { bg: string; font: string }> = {
      Válida: { bg: 'FFD1FAE5', font: 'FF065F46' },
      Vencida: { bg: 'FFFEE2E2', font: 'FF991B1B' },
      Vencendo: { bg: 'FFFFF7ED', font: 'FF92400E' },
      Planejada: { bg: 'FFFEF9C3', font: 'FF854D0E' },
      Renovada: { bg: 'FFDBEAFE', font: 'FF1E40AF' },
      Cancelada: { bg: 'FFF3F4F6', font: 'FF6B7280' },
      Indefinida: { bg: 'FFF3F4F6', font: 'FF6B7280' },
    };

    for (const r of enriched) {
      const statusLabel = STATUS_LABEL[r.status_derivado] ?? r.status_derivado ?? '';
      const qualNome = r.qualificacao_nome || r.tipo_nome || r.qualificacao_codigo || '';

      const dataRow = ws.addRow({
        status: statusLabel,
        funcionario: r.funcionario_nome || '',
        canac: r.funcionario_codigo_anac || '',
        matricula: r.funcionario_matricula || '',
        cpf: r.funcionario_cpf || '',
        funcao: r.funcionario_funcao || '',
        aeronave: r.modelo_aeronave || '',
        qualificacao: qualNome,
        codigo: r.qualificacao_codigo || '',
        categoria: r.categoria || '',
        realizado: fmtDate(r.data_realizacao),
        validade: r.validade_meses || '',
        vencimento: fmtDate(r.data_vencimento),
        dias: diasRestantes(r.data_vencimento),
        certificado: r.numero_certificado || '',
        instrutor: r.instrutor || '',
        carga_h: r.carga_horaria || '',
        nota: r.nota || '',
        observacoes: r.observacoes || '',
        criado_em: fmtDate((r.created_at || '').split('T')[0] || r.created_at),
      });

      // Colorir célula de status
      const colors = STATUS_COLORS[statusLabel];
      if (colors) {
        const cell = dataRow.getCell('status');
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
        cell.font = { bold: true, color: { argb: colors.font }, size: 10 };
        cell.alignment = { horizontal: 'center' };
      }

      // Zebra stripes leves nas linhas pares
      if (dataRow.number % 2 === 0) {
        dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
          if (colNum === 1) return;
          if (
            !(cell.fill as any)?.fgColor?.argb ||
            (cell.fill as any).fgColor.argb === 'FFFFFFFF'
          ) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
          }
        });
      }
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };

    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().split('T')[0];

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="qualificacoes_${timestamp}.xlsx"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    createLogger(c, 'ExportacaoRoutes').error('Erro ao exportar qualificacoes', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

/**
 * GET /api/exportacao/qualificacoes-tipos
 * Exporta tipos de qualificações em formato XLSX
 */
app.get('/qualificacoes-tipos', auth(), async (c) => {
  try {
    const db = c.env.DB;
    const empresaId = getEmpresaId(c);

    const tipos = await db
      .prepare(
        `SELECT 
          id,
          tipo,
          codigo,
          nome,
          descricao,
          categoria,
          carga_horaria,
          validade,
          observacoes,
          ativo,
          created_at,
          updated_at
        FROM qualificacoes_tipos
        WHERE deleted_at IS NULL
          AND empresa_id = ?
        ORDER BY codigo`,
      )
      .bind(empresaId)
      .all();

    if (!tipos.success) {
      return c.json({ success: false, error: 'Erro ao buscar tipos' }, 500);
    }

    const rows = tipos.results || [];
    if (rows.length === 0) {
      return c.json({ success: false, error: 'Nenhum tipo encontrado' }, 404);
    }

    // Criar workbook Excel
    const ExcelJS = await loadExcelJS();
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Tipos de Qualificações');

    // Definir colunas
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Tipo', key: 'tipo', width: 15 },
      { header: 'Código', key: 'codigo', width: 15 },
      { header: 'Nome', key: 'nome', width: 40 },
      { header: 'Descrição', key: 'descricao', width: 40 },
      { header: 'Categoria', key: 'categoria', width: 15 },
      { header: 'Carga Horária', key: 'carga_horaria', width: 15 },
      { header: 'Validade (meses)', key: 'validade', width: 15 },
      { header: 'Observações', key: 'observacoes', width: 30 },
      { header: 'Ativo', key: 'ativo', width: 10 },
      { header: 'Criado em', key: 'created_at', width: 20 },
      { header: 'Atualizado em', key: 'updated_at', width: 20 },
    ];

    // Estilizar cabeçalho
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Adicionar dados
    for (const row of rows as any[]) {
      worksheet.addRow({
        id: row.id || '',
        tipo: row.tipo || '',
        codigo: row.codigo || '',
        nome: row.nome || '',
        descricao: row.descricao || '',
        categoria: row.categoria || '',
        carga_horaria: row.carga_horaria || '',
        validade: row.validade || '',
        observacoes: row.observacoes || '',
        ativo: row.ativo ? 'Sim' : 'Não',
        created_at: row.created_at || '',
        updated_at: row.updated_at || '',
      });
    }

    // Gerar buffer
    const buffer = await workbook.xlsx.writeBuffer();
    const timestamp = new Date().toISOString().split('T')[0];

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="qualificacoes_tipos_${timestamp}.xlsx"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    createLogger(c, 'ExportacaoRoutes').error('Erro ao exportar tipos de qualificacao', error);
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default app;
