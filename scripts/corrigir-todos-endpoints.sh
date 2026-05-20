#!/bin/bash

echo "🔧 CORRIGINDO TODOS OS ENDPOINTS IDENTIFICADOS NA AUDITORIA"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Criar arquivo temporário para patches
PATCH_DIR="/tmp/airtrust-patches"
mkdir -p "$PATCH_DIR"

echo "📝 Criando patches para endpoints faltantes..."
echo ""

# 1. AGENDAMENTOS - Adicionar GET /:id
cat > "$PATCH_DIR/agendamentos-get-id.patch" << 'EOF'
--- a/src/worker/api/v2/agendamentos.ts
+++ b/src/worker/api/v2/agendamentos.ts
@@ -45,6 +45,43 @@ app.get('/', async (c) => {
   }
 });
 
+// GET /:id - Buscar agendamento específico por ID
+app.get('/:id', async (c) => {
+  try {
+    const db = c.env.DB;
+    const id = c.req.param('id');
+    
+    console.log(`🔍 Buscando agendamento ID/UUID: ${id}`);
+    
+    const agendamento = await db.prepare(`
+      SELECT 
+        a.*,
+        s.nome as simulador_nome,
+        i.nome as instrutor_nome,
+        f.nome as funcionario_nome
+      FROM agendamentos_simulador a
+      LEFT JOIN simuladores s ON a.simulador_id = s.id
+      LEFT JOIN funcionarios i ON a.instrutor_id = i.id
+      LEFT JOIN funcionarios f ON a.funcionario_id = f.id
+      WHERE (a.id = ? OR a.uuid = ?) AND a.deleted_at IS NULL
+    `).bind(id, id).first();
+    
+    if (!agendamento) {
+      return c.json({
+        success: false,
+        error: 'Agendamento não encontrado'
+      }, 404);
+    }
+    
+    return c.json({
+      success: true,
+      data: agendamento
+    });
+    
+  } catch (error: any) {
+    console.error('Erro ao buscar agendamento:', error);
+    return c.json({ success: false, error: error.message }, 500);
+  }
+});
+
 // POST / - Criar novo agendamento
 app.post('/', async (c) => {
   try {
EOF

echo "✅ Patch criado: agendamentos GET /:id"

# 2. DASHBOARD-STATS - Criar endpoint
cat > "$PATCH_DIR/dashboard-stats.ts" << 'EOF'
// @ts-nocheck
import { Hono } from 'hono';
import type { Env } from '../../types/index';

const app = new Hono<{ Bindings: Env }>();

// GET / - Estatísticas do dashboard
app.get('/', async (c) => {
  try {
    const db = c.env.DB;
    
    // Contar funcionários ativos
    const funcionarios = await db.prepare(`
      SELECT COUNT(*) as total FROM funcionarios WHERE deleted_at IS NULL
    `).first();
    
    // Contar qualificações ativas
    const qualificacoes = await db.prepare(`
      SELECT COUNT(*) as total FROM qualificacoes WHERE deleted_at IS NULL
    `).first();
    
    // Contar qualificações vencidas
    const vencidas = await db.prepare(`
      SELECT COUNT(*) as total 
      FROM qualificacoes 
      WHERE data_vencimento < date('now') AND deleted_at IS NULL
    `).first();
    
    // Contar qualificações a vencer (30 dias)
    const aVencer = await db.prepare(`
      SELECT COUNT(*) as total 
      FROM qualificacoes 
      WHERE data_vencimento BETWEEN date('now') AND date('now', '+30 days')
        AND deleted_at IS NULL
    `).first();
    
    // Contar agendamentos futuros
    const agendamentos = await db.prepare(`
      SELECT COUNT(*) as total 
      FROM agendamentos_simulador 
      WHERE data_inicio >= date('now') AND deleted_at IS NULL
    `).first();
    
    return c.json({
      success: true,
      data: {
        funcionarios: funcionarios?.total || 0,
        qualificacoes: qualificacoes?.total || 0,
        qualificacoes_vencidas: vencidas?.total || 0,
        qualificacoes_a_vencer: aVencer?.total || 0,
        agendamentos_futuros: agendamentos?.total || 0
      }
    });
    
  } catch (error: any) {
    console.error('Erro ao buscar estatísticas:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

export default app;
EOF

echo "✅ Arquivo criado: dashboard-stats.ts"

# 3. SIMULADOR/FICHA/:uuid - Criar alias
cat > "$PATCH_DIR/simulador-ficha-alias.ts" << 'EOF'
// @ts-nocheck
/**
 * ALIAS: /api/v2/simulador/ficha/:uuid
 * Redireciona para /api/v2/fichas/:uuid
 */
import { Hono } from 'hono';
import type { Env } from '../../types/index';

const app = new Hono<{ Bindings: Env }>();

// GET /:uuid - Alias para /api/v2/fichas/:uuid
app.get('/:uuid', async (c) => {
  const uuid = c.req.param('uuid');
  
  // Buscar ficha usando mesma lógica de fichas-avaliacao
  try {
    const fichaId = uuid;
    const env = c.env;
    
    const sessaoResult = await env.DB.prepare(`
      SELECT 
        a.*,
        s.nome as simulador_nome,
        i.nome as instrutor_nome,
        i.codigo_anac as instrutor_codigo_anac
      FROM agendamentos_simulador a
      LEFT JOIN simuladores s ON a.simulador_id = s.id
      LEFT JOIN funcionarios i ON a.instrutor_id = i.id
      WHERE (a.id = ? OR a.uuid = ?)
        AND a.deleted_at IS NULL
    `).bind(fichaId, fichaId).first();

    if (!sessaoResult) {
      return c.json({
        sucesso: false,
        erro: 'Sessão não encontrada'
      }, 404);
    }

    const funcionarioResult = await env.DB.prepare(`
      SELECT 
        f.id as funcionario_id,
        f.nome as funcionario_nome,
        f.matricula as funcionario_matricula,
        f.codigo_anac as funcionario_codigo_anac,
        'PIC' as funcao
      FROM funcionarios f
      WHERE f.id = ? AND f.deleted_at IS NULL
    `).bind(sessaoResult.funcionario_id).first();
    
    const participantes = funcionarioResult ? [funcionarioResult] : [];

    const manobrasResult = await env.DB.prepare(`
      SELECT 
        m.id as manobra_id,
        m.codigo as manobra_codigo,
        m.nome as manobra_nome,
        m.categoria as manobra_categoria,
        m.descricao as manobra_descricao
      FROM manobras m
      WHERE m.deleted_at IS NULL
      ORDER BY m.codigo ASC
      LIMIT 20
    `).all();

    let avaliacoesResult = { results: [] };
    try {
      avaliacoesResult = await env.DB.prepare(`
        SELECT 
          av.*,
          avaliador.nome as avaliador_nome
        FROM avaliacoes_manobras av
        LEFT JOIN funcionarios avaliador ON av.avaliador_id = avaliador.id
        WHERE av.agendamento_id = ? AND av.deleted_at IS NULL
      `).bind(sessaoResult.id).all();
    } catch (tableError) {
      console.warn('⚠️ Tabela avaliacoes_manobras não existe');
    }

    const fichaCompleta = {
      sessao: sessaoResult,
      participantes: participantes,
      manobras: manobrasResult.results || [],
      avaliacoes: avaliacoesResult.results || []
    };

    return c.json({
      sucesso: true,
      dados: fichaCompleta
    });

  } catch (error) {
    console.error('❌ Erro ao buscar ficha:', error);
    return c.json({
      sucesso: false,
      erro: 'Erro ao buscar ficha',
      detalhes: error.message
    }, 500);
  }
});

export default app;
EOF

echo "✅ Arquivo criado: simulador-ficha-alias.ts"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "📦 PATCHES E ARQUIVOS CRIADOS"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Patches criados em: $PATCH_DIR"
echo ""
echo "Próximos passos:"
echo "1. Aplicar patch de agendamentos"
echo "2. Copiar dashboard-stats.ts para src/worker/api/v2/"
echo "3. Copiar simulador-ficha-alias.ts para src/worker/api/v2/"
echo "4. Registrar rotas no index.ts"
echo "5. Build e deploy"
echo ""
