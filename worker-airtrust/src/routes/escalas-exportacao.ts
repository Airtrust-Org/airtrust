/**
 * ESCALAS — Exportação (CSV/HTML)
 * GET /:id/export?format=csv|html
 */

import { Hono } from 'hono';
import type { Env } from '../types';
import { auth } from '../middleware/auth';
import { getEmpresaIdSafe, getEscalaVerificada } from './escalas-shared';

const exportacao = new Hono<{ Bindings: Env }>();

// GET /:id/export — exportar escala em CSV ou HTML
exportacao.get('/:id/export', auth(), async (c) => {
  const { id } = c.req.param();
  const db = c.env.DB;
  const empresaId = getEmpresaIdSafe(c);
  const format = (c.req.query('format') || 'csv').toLowerCase();

  try {
    const escala = (await getEscalaVerificada(db, id, empresaId)) as Record<string, unknown> | null;
    if (!escala) return c.json({ success: false, error: 'Escala não encontrada' }, 404);

    const [tripRows, evtRows] = await Promise.all([
      db
        .prepare(
          `SELECT et.data_inicio, et.data_fim, et.aeronave, et.base, et.observacoes,
                fpic.nome AS pic_nome, fpic.guerra AS pic_guerra,
                fsic.nome AS sic_nome, fsic.guerra AS sic_guerra,
                pe.nome AS padrao_nome
         FROM escala_tripulacoes et
         JOIN escalas_mensais em ON em.id = et.escala_id
         LEFT JOIN funcionarios fpic ON fpic.id = et.pic_id AND (fpic.empresa_id IS NULL OR fpic.empresa_id = em.empresa_id)
         LEFT JOIN funcionarios fsic ON fsic.id = et.sic_id AND (fsic.empresa_id IS NULL OR fsic.empresa_id = em.empresa_id)
         LEFT JOIN padroes_escala pe ON pe.id = et.padrao_escala_id
         WHERE et.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND et.deleted_at IS NULL
         ORDER BY et.data_inicio, et.aeronave`,
        )
        .bind(id, empresaId)
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT ee.tipo_evento, ee.data_inicio, ee.data_fim, ee.turno, ee.local, ee.aeronave,
                ee.status, ee.observacoes, f.nome AS funcionario_nome
         FROM escala_eventos ee
         JOIN escalas_mensais em ON em.id = ee.escala_id
         LEFT JOIN funcionarios f ON f.id = ee.funcionario_id AND (f.empresa_id IS NULL OR f.empresa_id = em.empresa_id)
         WHERE ee.escala_id = ? AND em.empresa_id = ? AND em.deleted_at IS NULL AND ee.deleted_at IS NULL
         ORDER BY ee.data_inicio, f.nome`,
        )
        .bind(id, empresaId)
        .all<Record<string, unknown>>(),
    ]);

    const titulo = String(escala.titulo || `Escala ${escala.mes}/${escala.ano}`);
    const mesAno = `${String(escala.mes).padStart(2, '0')}-${escala.ano}`;
    const safeTitle = titulo
      .replace(/[^a-zA-Z0-9\- ]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    if (format === 'csv') {
      const lines: string[] = [
        '# Tripulações',
        'Início,Fim,Aeronave,Base,PIC,PIC (Guerra),SIC,SIC (Guerra),Padrão,Observações',
        ...(tripRows.results || []).map((r) =>
          [
            r.data_inicio,
            r.data_fim,
            r.aeronave ?? '',
            r.base ?? '',
            r.pic_nome ?? '',
            r.pic_guerra ?? '',
            r.sic_nome ?? '',
            r.sic_guerra ?? '',
            r.padrao_nome ?? '',
            String(r.observacoes ?? '').replace(/,/g, ';'),
          ]
            .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
            .join(','),
        ),
        '',
        '# Eventos',
        'Tipo,Início,Fim,Turno,Local,Aeronave,Funcionário,Status,Observações',
        ...(evtRows.results || []).map((r) =>
          [
            r.tipo_evento,
            r.data_inicio,
            r.data_fim,
            r.turno ?? '',
            r.local ?? '',
            r.aeronave ?? '',
            r.funcionario_nome ?? '',
            r.status ?? '',
            String(r.observacoes ?? '').replace(/,/g, ';'),
          ]
            .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
            .join(','),
        ),
      ];
      const csv = lines.join('\n');
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="escala-${safeTitle}-${mesAno}.csv"`,
        },
      });
    }

    // HTML — template para impressão/PDF via Ctrl+P
    const tripulacoesHTML = (tripRows.results || [])
      .map(
        (r) => `
      <tr>
        <td>${r.data_inicio}</td><td>${r.data_fim}</td>
        <td>${r.aeronave ?? '-'}</td><td>${r.base ?? '-'}</td>
        <td><strong>${r.pic_nome ?? '-'}</strong>${r.pic_guerra ? ` (${r.pic_guerra})` : ''}</td>
        <td>${r.sic_nome ?? '-'}${r.sic_guerra ? ` (${r.sic_guerra})` : ''}</td>
        <td>${r.padrao_nome ?? '-'}</td>
        <td>${r.observacoes ?? ''}</td>
      </tr>`,
      )
      .join('');

    const eventosHTML = (evtRows.results || [])
      .map(
        (r) => `
      <tr>
        <td>${r.tipo_evento}</td><td>${r.data_inicio}</td><td>${r.data_fim}</td>
        <td>${r.turno ?? '-'}</td><td>${r.local ?? '-'}</td>
        <td>${r.aeronave ?? '-'}</td><td>${r.funcionario_nome ?? '-'}</td>
        <td>${r.status ?? '-'}</td><td>${r.observacoes ?? ''}</td>
      </tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${titulo}</title>
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #1a1a1a; margin: 20px; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 10px; margin-bottom: 20px; }
    h2 { font-size: 13px; margin: 20px 0 6px; border-bottom: 2px solid #334155; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #334155; color: #fff; text-align: left; padding: 5px 6px; font-size: 10px; }
    td { padding: 4px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 9px; font-weight: bold; }
    .badge-pub { background: #7c3aed; color: #fff; }
    .badge-apr { background: #059669; color: #fff; }
    @media print { body { margin: 8mm; } .no-print { display: none; } }
  </style>
</head>
<body>
  <h1>${titulo}</h1>
  <p class="meta">
    Período: ${mesAno} &nbsp;|&nbsp;
    Status: <span class="badge ${escala.status === 'publicada' ? 'badge-pub' : 'badge-apr'}">${String(escala.status).toUpperCase()}</span> &nbsp;|&nbsp;
    Gerado em: ${new Date().toLocaleString('pt-BR')}
  </p>
  <p class="no-print" style="background:#fef9c3;padding:8px;border-radius:4px;margin-bottom:16px;">
    Para salvar como PDF, pressione <strong>Ctrl+P</strong> → Salvar como PDF
  </p>

  <h2>Tripulações</h2>
  <table>
    <thead><tr>
      <th>Início</th><th>Fim</th><th>Aeronave</th><th>Base</th>
      <th>PIC</th><th>SIC</th><th>Padrão</th><th>Obs.</th>
    </tr></thead>
    <tbody>${tripulacoesHTML || '<tr><td colspan="8" style="color:#888">Sem tripulações</td></tr>'}</tbody>
  </table>

  <h2>Eventos</h2>
  <table>
    <thead><tr>
      <th>Tipo</th><th>Início</th><th>Fim</th><th>Turno</th><th>Local</th>
      <th>Aeronave</th><th>Funcionário</th><th>Status</th><th>Obs.</th>
    </tr></thead>
    <tbody>${eventosHTML || '<tr><td colspan="9" style="color:#888">Sem eventos</td></tr>'}</tbody>
  </table>

  <p style="margin-top:30px;font-size:9px;color:#888;border-top:1px solid #e2e8f0;padding-top:8px;">
    AirTrust — Documento gerado automaticamente | ${new Date().toLocaleDateString('pt-BR')}
  </p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition':
          format === 'html-download'
            ? `attachment; filename="escala-${safeTitle}-${mesAno}.html"`
            : 'inline',
      },
    });
  } catch (e) {
    return c.json({ success: false, error: 'Erro interno do servidor' }, 500);
  }
});

export default exportacao;
