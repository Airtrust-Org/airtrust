#!/bin/bash

cat > worker-airtrust/src/routes/simuladores.ts << 'EOF'
import { Hono } from 'hono';
import type { Context } from 'hono';

type Env = { DB: D1Database; R2_BUCKET: R2Bucket; };

const app = new Hono<{ Bindings: Env }>();

async function audit(db: D1Database, params: any) {
  try {
    const exists = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='auditoria_avancada_v2'").first();
    if (!exists) {
      await db.prepare("CREATE TABLE IF NOT EXISTS auditoria_avancada_v2 (id INTEGER PRIMARY KEY AUTOINCREMENT, tabela TEXT, acao TEXT, registro_id TEXT, dados_anteriores TEXT, dados_novos TEXT, created_at TEXT DEFAULT (datetime('now')))").run();
    }
    await db.prepare("INSERT INTO auditoria_avancada_v2 (tabela, acao, registro_id, dados_anteriores, dados_novos) VALUES (?, ?, ?, ?, ?)").bind(params.tabela, params.acao, String(params.registro_id), params.dados_anteriores ? JSON.stringify(params.dados_anteriores) : null, params.dados_novos ? JSON.stringify(params.dados_novos) : null).run();
  } catch (e) { console.error('audit error:', e); }
}

// CRUD Simuladores (5 endpoints)
app.get('/', async (c: Context) => {
  try {
    const status = c.req.query('status') || '';
    let q = "SELECT * FROM simuladores WHERE deleted_at IS NULL";
    const p: any[] = [];
    if (status) { q += " AND status = ?"; p.push(status); }
    q += " ORDER BY created_at DESC";
    const r = await c.env.DB.prepare(q).bind(...p).all();
    return c.json({ success: true, data: r.results, total: r.results.length });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.post('/', async (c: Context) => {
  try {
    const b = await c.req.json();
    if (!b.nome || !b.tipo) return c.json({ success: false, error: 'nome, tipo obrigatórios' }, 400);
    const r = await c.env.DB.prepare("INSERT INTO simuladores (nome, modelo, tipo, fabricante, localizacao, status, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(b.nome, b.modelo || null, b.tipo, b.fabricante || null, b.localizacao || null, b.status || 'DISPONIVEL', b.observacoes || null).run();
    const id = r.meta.last_row_id;
    const created = await c.env.DB.prepare("SELECT * FROM simuladores WHERE id = ?").bind(id).first();
    await audit(c.env.DB, { tabela: 'simuladores', acao: 'INSERT', registro_id: id, dados_novos: created });
    return c.json({ success: true, data: created }, 201);
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.get('/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const s = await c.env.DB.prepare("SELECT * FROM simuladores WHERE id = ? AND deleted_at IS NULL").bind(id).first();
    if (!s) return c.json({ success: false, error: 'Não encontrado' }, 404);
    return c.json({ success: true, data: s });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.put('/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    const ant = await c.env.DB.prepare("SELECT * FROM simuladores WHERE id = ?").bind(id).first();
    if (!ant) return c.json({ success: false, error: 'Não encontrado' }, 404);
    await c.env.DB.prepare("UPDATE simuladores SET nome = ?, modelo = ?, tipo = ?, fabricante = ?, localizacao = ?, status = ?, observacoes = ?, updated_at = datetime('now') WHERE id = ?").bind(b.nome || ant.nome, b.modelo !== undefined ? b.modelo : ant.modelo, b.tipo || ant.tipo, b.fabricante !== undefined ? b.fabricante : ant.fabricante, b.localizacao !== undefined ? b.localizacao : ant.localizacao, b.status || ant.status, b.observacoes !== undefined ? b.observacoes : ant.observacoes, id).run();
    const atu = await c.env.DB.prepare("SELECT * FROM simuladores WHERE id = ?").bind(id).first();
    await audit(c.env.DB, { tabela: 'simuladores', acao: 'UPDATE', registro_id: id, dados_anteriores: ant, dados_novos: atu });
    return c.json({ success: true, data: atu });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.delete('/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const ant = await c.env.DB.prepare("SELECT * FROM simuladores WHERE id = ?").bind(id).first();
    if (!ant) return c.json({ success: false, error: 'Não encontrado' }, 404);
    await c.env.DB.prepare("UPDATE simuladores SET deleted_at = datetime('now') WHERE id = ?").bind(id).run();
    await audit(c.env.DB, { tabela: 'simuladores', acao: 'DELETE', registro_id: id, dados_anteriores: ant });
    return c.json({ success: true, message: 'Excluído' });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

// Sessões (9 endpoints)
app.get('/sessoes', async (c: Context) => {
  try {
    const r = await c.env.DB.prepare("SELECT sa.*, s.nome as simulador_nome, s.tipo as simulador_tipo FROM simulador_agendamentos sa LEFT JOIN simuladores s ON sa.simulador_id = s.id WHERE sa.deleted_at IS NULL ORDER BY sa.data DESC").all();
    return c.json({ success: true, data: r.results });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.post('/sessoes', async (c: Context) => {
  try {
    const b = await c.req.json();
    if (!b.simulador_id || !b.data) return c.json({ success: false, error: 'simulador_id, data obrigatórios' }, 400);
    const r = await c.env.DB.prepare("INSERT INTO simulador_agendamentos (simulador_id, data, duracao_minutos, instrutor_id, tipo_sessao, status, observacoes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(b.simulador_id, b.data, b.duracao_minutos || 60, b.instrutor_id || null, b.tipo_sessao || 'RECURRENT', b.status || 'AGENDADA', b.observacoes || null).run();
    const sid = r.meta.last_row_id;
    const alunos = b.alunos || [];
    for (const aid of alunos) {
      await c.env.DB.prepare("INSERT INTO sessoes_participantes (sessao_id, funcionario_id, funcao, presente) VALUES (?, ?, 'ALUNO', 1)").bind(sid, aid).run();
    }
    if (b.instrutor_id) {
      await c.env.DB.prepare("INSERT INTO sessoes_participantes (sessao_id, funcionario_id, funcao, presente) VALUES (?, ?, 'INSTRUTOR', 1)").bind(sid, b.instrutor_id).run();
    }
    const s = await c.env.DB.prepare("SELECT * FROM simulador_agendamentos WHERE id = ?").bind(sid).first();
    return c.json({ success: true, data: { sessao: s, fichas_criadas: 0 } }, 201);
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.get('/sessoes/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const s = await c.env.DB.prepare("SELECT sa.*, s.nome as simulador_nome FROM simulador_agendamentos sa LEFT JOIN simuladores s ON sa.simulador_id = s.id WHERE sa.id = ? AND sa.deleted_at IS NULL").bind(id).first();
    if (!s) return c.json({ success: false, error: 'Não encontrada' }, 404);
    const p = await c.env.DB.prepare("SELECT sp.*, f.nome as funcionario_nome FROM sessoes_participantes sp LEFT JOIN funcionarios f ON sp.funcionario_id = f.id WHERE sp.sessao_id = ? AND sp.deleted_at IS NULL").bind(id).all();
    return c.json({ success: true, data: { ...s, participantes: p.results } });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.put('/sessoes/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    const ant = await c.env.DB.prepare("SELECT * FROM simulador_agendamentos WHERE id = ?").bind(id).first();
    if (!ant) return c.json({ success: false, error: 'Não encontrada' }, 404);
    await c.env.DB.prepare("UPDATE simulador_agendamentos SET simulador_id = ?, data = ?, duracao_minutos = ?, instrutor_id = ?, tipo_sessao = ?, status = ?, observacoes = ?, updated_at = datetime('now') WHERE id = ?").bind(b.simulador_id || ant.simulador_id, b.data || ant.data, b.duracao_minutos !== undefined ? b.duracao_minutos : ant.duracao_minutos, b.instrutor_id !== undefined ? b.instrutor_id : ant.instrutor_id, b.tipo_sessao || ant.tipo_sessao, b.status || ant.status, b.observacoes !== undefined ? b.observacoes : ant.observacoes, id).run();
    const atu = await c.env.DB.prepare("SELECT * FROM simulador_agendamentos WHERE id = ?").bind(id).first();
    await audit(c.env.DB, { tabela: 'simulador_agendamentos', acao: 'UPDATE', registro_id: id, dados_anteriores: ant, dados_novos: atu });
    return c.json({ success: true, data: atu });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.delete('/sessoes/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const ant = await c.env.DB.prepare("SELECT * FROM simulador_agendamentos WHERE id = ?").bind(id).first();
    if (!ant) return c.json({ success: false, error: 'Não encontrada' }, 404);
    await c.env.DB.prepare("UPDATE simulador_agendamentos SET deleted_at = datetime('now') WHERE id = ?").bind(id).run();
    await c.env.DB.prepare("UPDATE sessoes_participantes SET deleted_at = datetime('now') WHERE sessao_id = ?").bind(id).run();
    await audit(c.env.DB, { tabela: 'simulador_agendamentos', acao: 'DELETE', registro_id: id, dados_anteriores: ant });
    return c.json({ success: true, message: 'Cancelada' });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.get('/sessoes/:id/participantes', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const p = await c.env.DB.prepare("SELECT sp.*, f.nome as funcionario_nome FROM sessoes_participantes sp LEFT JOIN funcionarios f ON sp.funcionario_id = f.id WHERE sp.sessao_id = ? AND sp.deleted_at IS NULL").bind(id).all();
    return c.json({ success: true, data: p.results });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.post('/sessoes/:id/participantes', async (c: Context) => {
  try {
    const sid = c.req.param('id');
    const b = await c.req.json();
    if (!b.funcionario_id || !b.funcao) return c.json({ success: false, error: 'funcionario_id, funcao obrigatórios' }, 400);
    const r = await c.env.DB.prepare("INSERT INTO sessoes_participantes (sessao_id, funcionario_id, funcao, presente) VALUES (?, ?, ?, ?)").bind(sid, b.funcionario_id, b.funcao, b.presente !== undefined ? b.presente : 1).run();
    const p = await c.env.DB.prepare("SELECT * FROM sessoes_participantes WHERE id = ?").bind(r.meta.last_row_id).first();
    return c.json({ success: true, data: p }, 201);
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.put('/participantes/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    const ant = await c.env.DB.prepare("SELECT * FROM sessoes_participantes WHERE id = ?").bind(id).first();
    if (!ant) return c.json({ success: false, error: 'Não encontrado' }, 404);
    await c.env.DB.prepare("UPDATE sessoes_participantes SET funcao = ?, presente = ?, updated_at = datetime('now') WHERE id = ?").bind(b.funcao || ant.funcao, b.presente !== undefined ? b.presente : ant.presente, id).run();
    const atu = await c.env.DB.prepare("SELECT * FROM sessoes_participantes WHERE id = ?").bind(id).first();
    return c.json({ success: true, data: atu });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.delete('/participantes/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare("UPDATE sessoes_participantes SET deleted_at = datetime('now') WHERE id = ?").bind(id).run();
    return c.json({ success: true, message: 'Removido' });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

// Fichas (10 endpoints)
app.get('/fichas', async (c: Context) => {
  try {
    const status = c.req.query('status') || '';
    const ts = c.req.query('tipo_sessao') || '';
    let q = "SELECT f.*, aluno.nome as aluno_nome, aluno.matricula as aluno_matricula, instrutor.nome as instrutor_nome FROM fichas_sessao f LEFT JOIN funcionarios aluno ON f.colaborador_id_aluno = aluno.id LEFT JOIN funcionarios instrutor ON f.instrutor_id = instrutor.id WHERE f.deleted_at IS NULL";
    const p: any[] = [];
    if (status) { q += " AND f.status = ?"; p.push(status); }
    if (ts) { q += " AND f.tipo_sessao = ?"; p.push(ts); }
    q += " ORDER BY f.created_at DESC";
    const r = await c.env.DB.prepare(q).bind(...p).all();
    return c.json({ success: true, data: r.results });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.get('/fichas/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const f = await c.env.DB.prepare("SELECT f.*, aluno.nome as aluno_nome, aluno.matricula as aluno_matricula, instrutor.nome as instrutor_nome FROM fichas_sessao f LEFT JOIN funcionarios aluno ON f.colaborador_id_aluno = aluno.id LEFT JOIN funcionarios instrutor ON f.instrutor_id = instrutor.id WHERE f.id = ? AND f.deleted_at IS NULL").bind(id).first();
    if (!f) return c.json({ success: false, error: 'Não encontrada' }, 404);
    const m = await c.env.DB.prepare("SELECT * FROM fichas_sessao_manobras WHERE ficha_id = ? AND deleted_at IS NULL ORDER BY ordem").bind(id).all();
    return c.json({ success: true, data: { ...f, manobras: m.results } });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.post('/fichas', async (c: Context) => {
  try {
    const b = await c.req.json();
    if (!b.colaborador_id_aluno || !b.tipo_sessao) return c.json({ success: false, error: 'colaborador_id_aluno, tipo_sessao obrigatórios' }, 400);
    const r = await c.env.DB.prepare("INSERT INTO fichas_sessao (agendamento_slot_id, colaborador_id_aluno, instrutor_id, tipo_sessao, tipo_aeronave, status, data_sessao) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(b.agendamento_slot_id || null, b.colaborador_id_aluno, b.instrutor_id || null, b.tipo_sessao, b.tipo_aeronave || null, b.status || 'EM_PREENCHIMENTO', b.data_sessao || new Date().toISOString()).run();
    const f = await c.env.DB.prepare("SELECT * FROM fichas_sessao WHERE id = ?").bind(r.meta.last_row_id).first();
    return c.json({ success: true, data: f }, 201);
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.put('/fichas/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    const ant = await c.env.DB.prepare("SELECT * FROM fichas_sessao WHERE id = ?").bind(id).first();
    if (!ant) return c.json({ success: false, error: 'Não encontrada' }, 404);
    await c.env.DB.prepare("UPDATE fichas_sessao SET status = ?, resultado_final = ?, nota_final = ?, aprovado = ?, observacoes = ?, updated_at = datetime('now') WHERE id = ?").bind(b.status || ant.status, b.resultado_final !== undefined ? b.resultado_final : ant.resultado_final, b.nota_final !== undefined ? b.nota_final : ant.nota_final, b.aprovado !== undefined ? b.aprovado : ant.aprovado, b.observacoes !== undefined ? b.observacoes : ant.observacoes, id).run();
    const atu = await c.env.DB.prepare("SELECT * FROM fichas_sessao WHERE id = ?").bind(id).first();
    await audit(c.env.DB, { tabela: 'fichas_sessao', acao: 'UPDATE', registro_id: id, dados_anteriores: ant, dados_novos: atu });
    return c.json({ success: true, data: atu });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.delete('/fichas/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const ant = await c.env.DB.prepare("SELECT * FROM fichas_sessao WHERE id = ?").bind(id).first();
    if (!ant) return c.json({ success: false, error: 'Não encontrada' }, 404);
    await c.env.DB.prepare("UPDATE fichas_sessao SET deleted_at = datetime('now') WHERE id = ?").bind(id).run();
    await audit(c.env.DB, { tabela: 'fichas_sessao', acao: 'DELETE', registro_id: id, dados_anteriores: ant });
    return c.json({ success: true, message: 'Excluída' });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.post('/fichas/:id/assinar', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    if (!b.tipo || !['ALUNO', 'INSTRUTOR'].includes(b.tipo)) return c.json({ success: false, error: 'tipo: ALUNO ou INSTRUTOR' }, 400);
    const f = await c.env.DB.prepare("SELECT * FROM fichas_sessao WHERE id = ?").bind(id).first();
    if (!f) return c.json({ success: false, error: 'Não encontrada' }, 404);
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Real-IP') || 'unknown';
    const ts = new Date().toISOString();
    let ns = f.status;
    if (b.tipo === 'ALUNO') {
      await c.env.DB.prepare("UPDATE fichas_sessao SET assinatura_aluno_ip = ?, assinatura_aluno_timestamp = ?, status = 'ASSINADA_ALUNO' WHERE id = ?").bind(ip, ts, id).run();
      ns = 'ASSINADA_ALUNO';
    } else if (b.tipo === 'INSTRUTOR') {
      if (!f.assinatura_aluno_timestamp) return c.json({ success: false, error: 'Aluno ainda não assinou' }, 400);
      await c.env.DB.prepare("UPDATE fichas_sessao SET assinatura_instrutor_ip = ?, assinatura_instrutor_timestamp = ?, status = 'ASSINADA_TOTAL' WHERE id = ?").bind(ip, ts, id).run();
      ns = 'ASSINADA_TOTAL';
    }
    const fa = await c.env.DB.prepare("SELECT * FROM fichas_sessao WHERE id = ?").bind(id).first();
    await audit(c.env.DB, { tabela: 'fichas_sessao', acao: 'UPDATE', registro_id: id, dados_anteriores: f, dados_novos: fa });
    return c.json({ success: true, message: `Assinatura registrada (${b.tipo})`, data: { status: ns, ip, timestamp: ts } });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.get('/fichas-simulador/:id/manobras', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const m = await c.env.DB.prepare("SELECT * FROM fichas_sessao_manobras WHERE ficha_id = ? AND deleted_at IS NULL ORDER BY ordem").bind(id).all();
    return c.json({ success: true, data: m.results });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.post('/fichas-simulador/:id/popular-manobras', async (c: Context) => {
  try {
    const fid = c.req.param('id');
    const f = await c.env.DB.prepare("SELECT * FROM fichas_sessao WHERE id = ?").bind(fid).first();
    if (!f) return c.json({ success: false, error: 'Não encontrada' }, 404);
    const m = await c.env.DB.prepare("SELECT codigo, descricao, categoria, ordem FROM cadastro_manobras WHERE tipo_sessao = ? AND tipo_aeronave = ? AND deleted_at IS NULL ORDER BY ordem").bind(f.tipo_sessao, f.tipo_aeronave || '').all();
    let pop = 0;
    for (const ma of m.results as any[]) {
      await c.env.DB.prepare("INSERT INTO fichas_sessao_manobras (ficha_id, codigo, descricao, categoria, ordem) VALUES (?, ?, ?, ?, ?)").bind(fid, ma.codigo, ma.descricao, ma.categoria, ma.ordem).run();
      pop++;
    }
    return c.json({ success: true, message: `${pop} manobras populadas`, total: pop });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.post('/fichas-simulador/:id/gerar-qualificacao', async (c: Context) => {
  try {
    const fid = c.req.param('id');
    const f = await c.env.DB.prepare("SELECT f.*, aluno.nome as aluno_nome FROM fichas_sessao f LEFT JOIN funcionarios aluno ON f.colaborador_id_aluno = aluno.id WHERE f.id = ?").bind(fid).first();
    if (!f) return c.json({ success: false, error: 'Não encontrada' }, 404);
    if (f.status !== 'ASSINADA_TOTAL') return c.json({ success: false, error: 'Status precisa ser ASSINADA_TOTAL' }, 400);
    if (f.aprovado !== 1) return c.json({ success: false, error: 'Precisa estar aprovado' }, 400);
    const qe = await c.env.DB.prepare("SELECT id FROM qualificacoes_historico WHERE funcionario_id = ? AND tipo_qualificacao = ? AND data_validade > date('now') AND deleted_at IS NULL").bind(f.colaborador_id_aluno, `${f.tipo_sessao}_${f.tipo_aeronave || 'GERAL'}`).first();
    if (qe) return c.json({ success: false, error: 'Já existe qualificação vigente' }, 400);
    const dobt = new Date();
    const dval = new Date(dobt);
    dval.setFullYear(dval.getFullYear() + 1);
    const rq = await c.env.DB.prepare("INSERT INTO qualificacoes_historico (funcionario_id, tipo_qualificacao, data_obtencao, data_validade, origem, observacoes) VALUES (?, ?, ?, ?, ?, ?)").bind(f.colaborador_id_aluno, `${f.tipo_sessao}_${f.tipo_aeronave || 'GERAL'}`, dobt.toISOString().split('T')[0], dval.toISOString().split('T')[0], 'AUTO_FICHA_SIMULADOR', `Gerado da ficha #${fid}`).run();
    const qid = rq.meta.last_row_id;
    const q = await c.env.DB.prepare("SELECT * FROM qualificacoes_historico WHERE id = ?").bind(qid).first();
    await audit(c.env.DB, { tabela: 'qualificacoes_historico', acao: 'INSERT', registro_id: qid, dados_novos: q });
    return c.json({ success: true, message: 'Qualificação gerada', data: { qualificacao_id: qid, funcionario: f.aluno_nome, tipo: `${f.tipo_sessao}_${f.tipo_aeronave || 'GERAL'}`, valida_ate: dval.toISOString().split('T')[0] } }, 201);
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.get('/fichas-simulador/:id/gerar-pdf', async (c: Context) => {
  return c.json({ success: false, error: 'PDF não implementado', nota: 'Use Puppeteer/jsPDF futuramente' }, 501);
});

// Manobras (4 endpoints)
app.get('/manobras', async (c: Context) => {
  try {
    const ts = c.req.query('tipo_sessao') || '';
    const ta = c.req.query('tipo_aeronave') || '';
    let q = "SELECT * FROM cadastro_manobras WHERE deleted_at IS NULL";
    const p: any[] = [];
    if (ts) { q += " AND tipo_sessao = ?"; p.push(ts); }
    if (ta) { q += " AND tipo_aeronave = ?"; p.push(ta); }
    q += " ORDER BY ordem, codigo";
    const r = await c.env.DB.prepare(q).bind(...p).all();
    return c.json({ success: true, data: r.results });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.post('/manobras', async (c: Context) => {
  try {
    const b = await c.req.json();
    if (!b.codigo || !b.descricao) return c.json({ success: false, error: 'codigo, descricao obrigatórios' }, 400);
    const r = await c.env.DB.prepare("INSERT INTO cadastro_manobras (codigo, descricao, categoria, tipo_sessao, tipo_aeronave, ordem, ativo) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(b.codigo, b.descricao, b.categoria || null, b.tipo_sessao || null, b.tipo_aeronave || null, b.ordem || 0, b.ativo !== undefined ? b.ativo : 1).run();
    const m = await c.env.DB.prepare("SELECT * FROM cadastro_manobras WHERE id = ?").bind(r.meta.last_row_id).first();
    return c.json({ success: true, data: m }, 201);
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.put('/manobras/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    const b = await c.req.json();
    const ant = await c.env.DB.prepare("SELECT * FROM cadastro_manobras WHERE id = ?").bind(id).first();
    if (!ant) return c.json({ success: false, error: 'Não encontrada' }, 404);
    await c.env.DB.prepare("UPDATE cadastro_manobras SET codigo = ?, descricao = ?, categoria = ?, tipo_sessao = ?, tipo_aeronave = ?, ordem = ?, ativo = ?, updated_at = datetime('now') WHERE id = ?").bind(b.codigo || ant.codigo, b.descricao || ant.descricao, b.categoria !== undefined ? b.categoria : ant.categoria, b.tipo_sessao !== undefined ? b.tipo_sessao : ant.tipo_sessao, b.tipo_aeronave !== undefined ? b.tipo_aeronave : ant.tipo_aeronave, b.ordem !== undefined ? b.ordem : ant.ordem, b.ativo !== undefined ? b.ativo : ant.ativo, id).run();
    const atu = await c.env.DB.prepare("SELECT * FROM cadastro_manobras WHERE id = ?").bind(id).first();
    return c.json({ success: true, data: atu });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.delete('/manobras/:id', async (c: Context) => {
  try {
    const id = c.req.param('id');
    await c.env.DB.prepare("UPDATE cadastro_manobras SET deleted_at = datetime('now') WHERE id = ?").bind(id).run();
    return c.json({ success: true, message: 'Excluída' });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

// Relatórios (3 endpoints)
app.get('/relatorios/uso', async (c: Context) => {
  try {
    const di = c.req.query('data_inicio') || '2000-01-01';
    const df = c.req.query('data_fim') || '2099-12-31';
    const r = await c.env.DB.prepare("SELECT s.nome as simulador, s.tipo, COUNT(sa.id) as total_sessoes, SUM(sa.duracao_minutos) / 60.0 as horas_uso, SUM(CASE WHEN sa.tipo_sessao = 'RECURRENT' THEN 1 ELSE 0 END) as recurrent, SUM(CASE WHEN sa.tipo_sessao = 'PC' THEN 1 ELSE 0 END) as pc, SUM(CASE WHEN sa.tipo_sessao = 'OPC' THEN 1 ELSE 0 END) as opc FROM simuladores s LEFT JOIN simulador_agendamentos sa ON s.id = sa.simulador_id WHERE s.deleted_at IS NULL AND sa.deleted_at IS NULL AND sa.data BETWEEN ? AND ? GROUP BY s.id, s.nome, s.tipo ORDER BY horas_uso DESC").bind(di, df).all();
    return c.json({ success: true, data: r.results });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.get('/relatorios/tripulantes', async (c: Context) => {
  try {
    const lim = parseInt(c.req.query('limit') || '50');
    const r = await c.env.DB.prepare("SELECT f.matricula, f.nome, COUNT(DISTINCT fs.id) as sessoes, SUM(CASE WHEN fs.aprovado = 1 THEN 1 ELSE 0 END) as aprovados, SUM(CASE WHEN fs.aprovado = 0 AND fs.resultado_final != 'PENDENTE' THEN 1 ELSE 0 END) as reprovados FROM funcionarios f INNER JOIN fichas_sessao fs ON f.id = fs.colaborador_id_aluno WHERE fs.deleted_at IS NULL GROUP BY f.id, f.matricula, f.nome HAVING sessoes > 0 ORDER BY sessoes DESC LIMIT ?").bind(lim).all();
    return c.json({ success: true, data: r.results });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

app.get('/relatorios/desempenho', async (c: Context) => {
  try {
    const r = await c.env.DB.prepare("SELECT tipo_sessao, COUNT(*) as total, SUM(CASE WHEN aprovado = 1 THEN 1 ELSE 0 END) as aprovados, SUM(CASE WHEN aprovado = 0 THEN 1 ELSE 0 END) as reprovados, ROUND(SUM(CASE WHEN aprovado = 1 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) as taxa_aprovacao FROM fichas_sessao WHERE deleted_at IS NULL GROUP BY tipo_sessao ORDER BY total DESC").all();
    return c.json({ success: true, data: r.results });
  } catch (e: any) { return c.json({ success: false, error: e.message }, 500); }
});

// Health
app.get('/health', async (c: Context) => {
  return c.json({ success: true, message: 'Módulo Simuladores online', endpoints: 31, timestamp: new Date().toISOString() });
});

export default app;
EOF

echo "✅ Arquivo criado com sucesso"
