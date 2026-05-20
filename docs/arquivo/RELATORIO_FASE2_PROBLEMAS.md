# 📋 RELATÓRIO FASE 2 - PROBLEMAS ENCONTRADOS

**Data**: 2 de novembro de 2025  
**Status**: 🔴 CRÍTICO - 4 Arquivos Órfãos + 8 Routes Inválidas + 1 Arquivo Gigante

---

## 🚨 CRÍTICOS - PRECISAM SER CORRIGIDOS AGORA

### PROBLEMA 1: 4 IMPORTS ÓRFÃOS EM `routes/index.ts`

Estes arquivos foram **deletados** mas ainda são importados:

```typescript
❌ Line 36: import certificadosUploadFixed from '../api/v2/certificados-upload-fixed';
   └─ ARQUIVO DELETADO ❌

❌ Line 39: import templatesAirtrust from '../api/v2/templates-airtrust';
   └─ ARQUIVO DELETADO ❌

❌ Line 40: import funcionariosAdvanced from '../api/v2/funcionarios-advanced';
   └─ ARQUIVO DELETADO ❌

❌ Line 41: import funcionariosSearch from '../api/v2/funcionarios-search';
   └─ ARQUIVO DELETADO ❌
```

**Impacto**: Se o build ainda não falhou, está na sorte. Quando o build rodar, vai quebrar.

---

### PROBLEMA 2: 8 ROUTES ÓRFÃS EM `routes/index.ts`

Estas rotas usam variáveis não definidas:

```typescript
❌ Line 60: app.route('/api/v2/funcionarios/search', funcionariosSearch);
   └─ Variável não existe (import deletado)

❌ Line 65: app.delete('/api/v2/funcionarios/:id', ...);
   └─ Depois há app.route('/api/v2/funcionarios', funcionariosCrud);
   └─ Há conflito potencial de rotas

❌ Line 142: app.route('/api/v2/fichas-pdf', fichasPdfStorage);
   └─ fichasPdfStorage não importado, provavelmente deletado

❌ Line 145: app.route('/api/v2/compliance/dashboard', complianceDashboard);
   └─ complianceDashboard não importado

❌ Line 158: app.route('/api/v2', treinamentosSessoes);
   └─ treinamentosSessoes não importado

❌ Line 159: app.route('/api/v2/catalogo-treinamentos', catalogoTreinamentos);
   └─ catalogoTreinamentos não importado

❌ Line 175: app.route('/api/v2/agendamentos', agendamentos);
   └─ agendamentos não importado

❌ Line 180: app.route('/api/v2/simuladores/modelos', simuladoresModelos);
   └─ simuladoresModelos não importado

+ VÁRIOS OUTROS problemas potenciais
```

---

### PROBLEMA 3: ARQUIVO GIGANTE - `funcionarios-crud.ts`

📊 **Estatísticas**:
- **Tamanho**: 1,292 linhas
- **Endpoints**: 11 (GET /, GET /listar, GET /exportar, GET /export, GET /instrutores, GET /examinadores, GET /:id, POST /, PUT /:id, POST /batch, DELETE /:id)
- **Responsabilidades**: CRUD + Export + Integração CMA/ASO/ICAO + Dashboard

**Problema**: Arquivo muito grande, difícil manutenção. Deveria ser dividido em:

```
├─ funcionarios.ts (CRUD básico: ~250 linhas)
│  └─ GET /, POST /, PUT /:id, DELETE /:id, GET /:id
│
├─ funcionarios-export.ts (exportação: ~200 linhas)
│  └─ GET /exportar, GET /export
│
├─ funcionarios-roles.ts (instrutores/examinadores: ~150 linhas)
│  └─ GET /instrutores, GET /examinadores, GET /listar
│
└─ funcionarios-integracoes.ts (CMA/ASO/ICAO: ~200 linhas)
   └─ Lógica de sincronização com qualificações
```

---

## 📌 RESUMO DOS PROBLEMAS

| Problema | Severidade | Impacto | Status |
|----------|-----------|--------|--------|
| 4 imports órfãos | 🔴 CRÍTICO | Build vai falhar | ❌ NÃO CORRIGIDO |
| 8 routes órfãs | 🔴 CRÍTICO | Endpoints 404 em produção | ❌ NÃO CORRIGIDO |
| Arquivo gigante (1,292 linhas) | 🟡 MÉDIO | Manutenção difícil | ⏳ PENDENTE |

---

## ✅ PRÓXIMOS PASSOS

### Fase 2.1: Corrigir Imports Órfãos (10 minutos)
1. Remover import de `certificadosUploadFixed`
2. Remover import de `templatesAirtrust`
3. Remover import de `funcionariosAdvanced`
4. Remover import de `funcionariosSearch`
5. Remover routes órfãs correspondentes
6. Build + Deploy

### Fase 2.2: Dividir `funcionarios-crud.ts` (30 minutos)
1. Extrair exports em `funcionarios-export.ts`
2. Extrair roles em `funcionarios-roles.ts`
3. Extrair integrações em `funcionarios-integracoes.ts`
4. Manter CRUD básico em `funcionarios.ts`
5. Build + Deploy

### Fase 2.3: Testar Endpoints (10 minutos)
1. Curl qualificacoes
2. Curl certificados
3. Curl funcionarios
4. Curl simuladores
5. Curl templates

---

## 🔗 Arquivos Afetados

- `/src/worker/routes/index.ts` - 12+ imports órfãos + routes órfãs
- `/src/worker/api/v2/funcionarios-crud.ts` - 1,292 linhas (GIGANTE!)
- `/src/worker/api/v2/` - 22 módulos (após limpeza)

---

## 📝 Notas

- Não há build recente para confirmar se vai quebrar
- Os imports órfãos vão causar erro `Cannot find module` quando tentar build
- As routes órfãs vão retornar 404 em produção
- `funcionarios-crud.ts` é responsável por múltiplas funcionalidades misturadas
