#!/bin/bash
# AirTrust: Quick Commands Reference
# 
# Este arquivo documenta todos os comandos necessários para
# desenvolvimento local. Copie e cole quando precisar!

cat << 'EOF'

╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║                 AIRTRUST: Quick Commands Reference                        ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 INICIAR DESENVOLVIMENTO (3 etapas)

   1. Backend (Terminal 1):
      npm run restart:all

   2. Frontend (Terminal 2):
      npm run dev

   3. Abra no navegador:
      http://localhost:3000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔧 COMANDOS ESSENCIAIS

   # Desenvolvimento
   npm run dev              # Frontend (hot reload)
   npm run dev:worker      # Backend (hot reload)
   npm run dev:all         # Ambos simultaneamente
   npm run restart:all     # Reiniciar tudo

   # Monitoramento
   npm run health          # Status da API
   npm run validate        # Validar sistema
   npm run test:endpoints  # Testar endpoints

   # Build & Deploy
   npm run build           # Build para produção
   npm run preview         # Simular produção localmente
   npm run deploy          # Deploy (use com cuidado!)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 VERIFICAÇÕES & DEBUGGING

   # Verificar saúde do backend
   curl http://localhost:8787/health | jq '.'

   # Contar registros
   curl http://localhost:8787/api/v2/habilitacoes?limit=1 | jq '.total'

   # Ver logs do backend
   tail -f /tmp/wrangler-dev.log

   # Ver logs do frontend
   tail -f /tmp/vite-dev.log

   # Testar conexão
   npm run health

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠️ TROUBLESHOOTING

   # Porta já em uso?
   lsof -i :8787
   lsof -i :3000

   # Matar processo
   kill -9 <PID>

   # Limpar cache e reconstruir
   npm run clean
   npm run build

   # Reiniciar tudo do zero
   npm run restart:all

   # Ver configuração
   cat .env.local

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 DADOS DISPONÍVEIS

   # Habilitações (916 registros)
   curl http://localhost:8787/api/v2/habilitacoes

   # Qualificações (77 registros)
   curl http://localhost:8787/api/v2/qualificacoes

   # Funcionários (24 registros)
   curl http://localhost:8787/api/v2/funcionarios

   # Certificados
   curl http://localhost:8787/api/v2/certificados

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 FASES SEGUINTES

   # Quando terminar desenvolvimento local:
   
   FASE 2A: Database Optimization
   $ cat FASE2A_DATABASE_OPTIMIZATION.md
   
   FASE 2B: Frontend Virtualization
   $ cat FASE2B_FRONTEND_VIRTUALIZATION.md
   
   FASE 2C: Cache Strategy
   $ cat FASE2C_CACHE_STRATEGY.md
   
   FASE 3: UX Improvements
   $ cat FASE3_UX_IMPROVEMENTS.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 DOCUMENTAÇÃO

   LOCAL_DEV_SETUP_COMPLETE.md      # Status final completo
   SETUP_LOCAL_COMPLETO.md          # Guia detalhado
   GUIA_LOCAL_VS_PRODUCAO.md        # Como usar local vs produção
   RESUMO_EXECUTIVO.md              # Resumo do que foi feito

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 VARIÁVEIS DE AMBIENTE

   # .env.local já foi criado automaticamente com:
   
   VITE_API_URL=http://localhost:8787
   VITE_API_TIMEOUT=30000
   VITE_APP_NAME=AirTrust Local
   VITE_ENVIRONMENT=development
   VITE_DEBUG=true

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ STATUS

   ✅ Backend:   http://localhost:8787 (Wrangler)
   ✅ Frontend:  http://localhost:3000 (React + Vite)
   ✅ Database:  D1 Local (SQLite)
   ✅ Dados:     916+ habilitações sincronizadas
   ✅ Hot Reload: Ativado
   ✅ CORS:      Configurado para localhost

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 COMEÇAR AGORA

   Terminal 1:
   $ npm run restart:all

   Terminal 2:
   $ npm run dev

   Navegador:
   http://localhost:3000 ✨

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Versão: 2.0.0-dev | Data: 4 de Novembro de 2025
EOF
