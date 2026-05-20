# 📚 Contexto Permanente do Projeto AirTrust

## 🎯 Visão Geral do Projeto
O AirTrust é um sistema corporativo integrado para gestão de treinamentos, certificações e compliance aeronáutico. Desenvolvido para operadoras de aviação civil e helicópteros offshore.

## 🏗️ Arquitetura Atual
**Stack**: 
- React 19, TypeScript, Tailwind CSS, Vite (Frontend)
- Cloudflare Workers, Hono, D1, R2 (Backend)

**Padrão**: 
- Serverless architecture
- API REST completa
- Frontend SPA
- Banco SQLite distribuído (D1)

## 📦 Módulos Implementados
1. **Funcionários**: CRUD completo, cadastro com dados ANAC, ASO, CMA
2. **Certificações**: Sistema unificado V3 com vencimentos automáticos
3. **Treinamentos**: Catálogo com periodicidade, categorias
4. **Simuladores**: Agendamento, sessões, fichas de avaliação, PDF
5. **Pasta Virtual**: Upload/download, sincronização R2
6. **Compliance**: Status automático, matriz de vencimentos
7. **Dashboard**: Métricas, KPIs em tempo real
8. **Auditoria**: Logs detalhados de todas operações

## 📋 Estrutura de Banco de Dados
**15+ tabelas principais**:
- funcionarios
- catalogo_treinamentos_v2
- historico_certificacoes_v2
- certificado_anexos_v2
- compliance_status_v2
- simuladores
- agendamento_slots
- fichas_sessao
- fichas_manobras_executadas
- manobras_catalogo
- sessoes_template
- pasta_virtual_sync_log
- funcoes
- setores
- audit_logs

**Convenções**:
- snake_case para nomes de colunas
- Todas tabelas têm created_at, updated_at, deleted_at
- IDs INTEGER PRIMARY KEY AUTOINCREMENT
- Foreign keys com ON DELETE CASCADE quando aplicável

## 🔌 Endpoints Principais
- /api/health
- /api/v2/funcionarios
- /api/v2/certificacoes
- /api/v2/treinamentos
- /api/v2/simuladores
- /api/v2/simulador/ficha/:uuid/dados-pdf
- /api/v2/pasta-virtual/dashboard
- /api/certificacoes/:id/upload-certificado
- /api/certificacoes/:id/download-certificado

## 🎨 Padrões de UI
**Componentes**: shadcn/ui + Tailwind CSS
**Ícones**: lucide-react
**Cores**: 
- Azul primário (#3B82F6)
- Cinza neutro (#64748B)
- Verde sucesso (#10B981)
- Vermelho erro (#EF4444)

**Layout**: 
- Sidebar fixa esquerda
- Content area direita
- Header com breadcrumbs
- Modais para formulários

## 🚀 Comandos Importantes
- `npm run dev` (inicia frontend em localhost:3000)
- `wrangler dev` (inicia backend em localhost:8787)
- `npm run build` (build de produção)
- `wrangler deploy` (deploy para Cloudflare)

## 📝 Problemas Conhecidos Resolvidos
1. **Nomes mock em fichas**: RESOLVIDO (usa nomes reais do banco)
2. **Loop infinito em agendamentos**: RESOLVIDO (proteção contra duplo clique)
3. **PDF genérico em certificados**: RESOLVIDO (retorna arquivo real do R2)
4. **Botões importar não funcionavam**: RESOLVIDO (modal universal criado)

## 🔄 Próximas Implementações Planejadas
1. Módulo FRMS (gestão de fadiga)
2. Módulo Hospedagem (quartos e hotéis)
3. Sistema de notificações em tempo real
4. Dashboard executivo com gráficos
5. Relatórios customizáveis
6. Integração com sistemas externos (ERP, RH)
