# 📘 GUIA ARQUITETURAL DEFINITIVO V3.0 - AirTrust

> **Fonte da Verdade** | **Data:** 14 de Novembro de 2025  
> **Banco de Produção:** `airtrust-db` (UUID: `7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae`)  
> **Schema Extraído de:** `migrations/data-export/prod_fresh_full.sql`

---

## 🎯 PROMPT OTIMIZADO PARA GITHUB COPILOT

````markdown
# CONTEXTO AIRTRUST - Sistema de Gestão Aeronáutica

## STACK TECNOLÓGICA

- **Backend:** Cloudflare Workers + Hono v4 + D1 (SQLite) + R2 (Object Storage)
- **Frontend:** React 19 + Vite 6 + TanStack Query + TypeScript
- **Database:** Cloudflare D1 (62 tabelas em produção)
- **Design:** Design System estilo Apple (Tokens + Components)

## PADRÕES OBRIGATÓRIOS

1. **Services Pattern:** Toda lógica de negócio em `src/worker/services/`
2. **DTOs com Zod:** Validação em `src/react-app/schemas/`
3. **Soft Delete:** Todas as tabelas têm `deleted_at` (nunca DELETE hard)
4. **Auditoria:** Log completo em `auditoria` table
5. **Response Padronizado:** `{ success: boolean, data?: T, error?: string, code?: number }`
6. **AppError:** Erros customizados com códigos HTTP corretos

## TABELAS PRINCIPAIS (62 no total)

### 📋 CORE - Funcionários & Qualificações

- `funcionarios` (17 colunas) → Tabela central do sistema
- `qualificacoes` (13 colunas) → Certificações/treinamentos dos funcionários
- `qualificacoes_historico` → Versionamento de qualificações
- `qualificacoes_categorias` → Tipos de qualificações (CMA, ASO, ICAO, etc.)

### 🎓 SIMULADORES & TREINAMENTO

- `simuladores` → Equipamentos de simulação
- `fichas_sessao` → Fichas de avaliação de sessões
- `sessoes_fichas` → Relacionamento sessão ↔ ficha
- `manobras` → Manobras executadas em simulador
- `sessao_manobras` → Avaliação de manobras por sessão
- `manobras_avaliacoes` → Notas e observações
- `sessoes_template` → Templates de sessões padrão
- `treinamentos` → Catálogo de treinamentos

### 🏢 GESTÃO & COMPLIANCE

- `empresas` → Multi-tenant (empresas clientes)
- `empresa_config` → Configurações por empresa
- `certificados` → Certificados gerados (PDF)
- `certificados_templates` → Templates de certificados
- `compliance_status` → Status de compliance por funcionário
- `auditoria` → Log completo de ações (quem, o que, quando)

### 📁 ARQUIVOS & DOCUMENTOS

- `pasta_virtual` → Arquivos armazenados no R2
- `certificado_anexos` → Anexos de certificados
- `arquivos` → Arquivos gerais

### 👥 USUÁRIOS & PERMISSÕES

- `usuarios` → Usuários do sistema
- `papeis` (roles) → Perfis de acesso
- `pessoas_papeis` → Relacionamento usuário ↔ papel
- `credenciais` → Credenciais de acesso
- `pessoas_auditoria_acessos` → Log de acessos

### 🗂️ AUXILIARES & CATÁLOGOS

- `funcoes` → Funções dos funcionários (Piloto, Copiloto, Instrutor, etc.)
- `setores` → Setores da empresa
- `aeronaves` → Aeronaves cadastradas
- `funcionarios_aeronaves` → Habilitação por aeronave
- `tipos_sessao` → Tipos de sessões (Check, Recorrente, etc.)
- `modelos_sessao` → Modelos de sessões padrão

## RELACIONAMENTOS CHAVE

```sql
-- Funcionários ↔ Qualificações (1:N)
qualificacoes.funcionario_id → funcionarios.id

-- Funcionários ↔ Aeronaves (N:N)
funcionarios_aeronaves.funcionario_id → funcionarios.id
funcionarios_aeronaves.aeronave_id → aeronaves.id

-- Fichas ↔ Sessões ↔ Manobras
fichas_sessao.id → sessoes_fichas.ficha_id
sessoes_fichas.sessao_id → sessoes_template.id
sessao_manobras.ficha_id → fichas_sessao.id
sessao_manobras.manobra_id → manobras.id

-- Certificados ↔ Qualificações
certificados.qualificacao_id → qualificacoes.id
certificados.funcionario_id → funcionarios.id

-- Empresa Multi-tenant
empresa_config.empresa_id → empresas.id
funcionarios.empresa_id → empresas.id (campo implícito)
```
````

## ENDPOINTS DA API (196 endpoints mapeados)

### 🔐 AUTH

- `POST /api/auth/login` → Login com rate limit
- `GET /api/auth/profile` → Perfil do usuário autenticado
- `GET /api/auth/csrf-token` → Token CSRF

### 👤 FUNCIONÁRIOS

- `GET /api/funcionarios` → Listar (com filtros, paginação)
- `POST /api/funcionarios` → Criar
- `GET /api/funcionarios/:id` → Detalhes
- `PUT /api/funcionarios/:id` → Atualizar
- `DELETE /api/funcionarios/:id` → Soft delete
- `GET /api/funcionarios/instrutores` → Listar instrutores
- `GET /api/funcionarios/schema` → Schema Zod para formulário

### 📜 QUALIFICAÇÕES

- `GET /api/qualificacoes` → Listar
- `POST /api/qualificacoes` → Criar
- `GET /api/qualificacoes/:id` → Detalhes
- `PUT /api/qualificacoes/:id` → Atualizar
- `DELETE /api/qualificacoes/:id` → Soft delete

### 🎓 HABILITAÇÕES (Qualificações Funcionários)

- `GET /api/habilitacoes` → Listar todas
- `POST /api/habilitacoes` → Criar nova habilitação
- `GET /api/habilitacoes/:id` → Detalhes completos
- `PUT /api/habilitacoes/:id` → Atualizar
- `DELETE /api/habilitacoes/:id` → Soft delete
- `GET /api/habilitacoes/stats` → Estatísticas
- `GET /api/habilitacoes/:funcionarioId/:qualificacaoId/renovacoes` → Histórico

### 🎮 SIMULADORES & SESSÕES

- `GET /api/simuladores` → Listar simuladores
- `POST /api/simuladores` → Criar
- `PUT /api/simuladores/:id` → Atualizar
- `DELETE /api/simuladores/:id` → Soft delete
- `POST /api/simuladores-complete/sessoes` → Criar sessão completa
- `GET /api/simuladores-complete/sessoes/funcionario/:id` → Sessões por funcionário
- `PUT /api/simuladores-complete/sessoes/:id/finalizar` → Finalizar sessão
- `GET /api/simuladores-complete/relatorios/horas/:funcionarioId` → Horas de voo

### 📋 MANOBRAS

- `GET /api/manobras` → Listar
- `POST /api/manobras` → Criar
- `PUT /api/manobras/:id` → Atualizar
- `DELETE /api/manobras/:id` → Soft delete

### 🏢 EMPRESAS

- `GET /api/empresas` → Listar
- `POST /api/empresas` → Criar
- `GET /api/empresas/:id` → Detalhes
- `PUT /api/empresas/:id` → Atualizar
- `DELETE /api/empresas/:id` → Soft delete
- `GET /api/empresas/:id/config` → Configurações
- `PUT /api/empresas/:id/config` → Atualizar configurações
- `POST /api/empresas/:id/logo/upload` → Upload logo (multipart)
- `GET /api/empresas/:id/certificados` → Certificados da empresa
- `POST /api/empresas/:id/certificados` → Criar certificado

### 📄 CERTIFICADOS

- `GET /api/certificados/funcionario/:funcionarioId/qualificacao/:qualificacaoId`
- `GET /api/certificados/qualificacao/:id`
- `GET /api/certificados/habilitacao/:id`
- `POST /api/certificados/upload` → Upload arquivo (multipart)
- `POST /api/certificados/:habilitacao_id/gerar` → Gerar PDF
- `DELETE /api/certificados/:id` → Soft delete
- `GET /api/certificados/download/:id` → Download do R2
- `GET /api/certificados/funcionario/:id` → Todos os certificados

### 📁 PASTA VIRTUAL (R2 Storage)

- `GET /api/pasta-virtual/` → Listar todos
- `GET /api/pasta-virtual/:funcionarioId` → Por funcionário
- `POST /api/pasta-virtual/upload` → Upload (multipart: file, funcionarioId, tipo)
- `DELETE /api/pasta-virtual/:arquivoId` → Remover arquivo

### 📊 DASHBOARD & RELATÓRIOS

- `GET /api/dashboard/` → Dashboard principal
- `GET /api/dashboard/status-certificacoes`
- `GET /api/dashboard/treinamentos-criticos`
- `GET /api/dashboard/rastreabilidade`
- `GET /api/dashboard/metricas`
- `GET /api/dashboard/graficos/:tipo`
- `GET /api/relatorios/certificacoes-mes`
- `GET /api/relatorios/compliance-setor`
- `GET /api/relatorios/simuladores-uso`
- `GET /api/relatorios/dashboard-executivo`
- `GET /api/relatorios/exportar-csv`

### 💾 BACKUP & SISTEMA

- `POST /api/backup/criar` → Criar backup completo
- `GET /api/backup/listar` → Listar backups
- `GET /api/backup/:id/download` → Download backup do R2
- `POST /api/backup/:id/restore` → Restaurar backup
- `DELETE /api/backup/:id` → Remover backup
- `GET /api/sistema/health` → Health check
- `GET /api/sistema/info` → Informações do sistema
- `POST /api/sistema/backup` → Backup manual
- `GET /api/sistema/audit` → Logs de auditoria

### 📥 IMPORTAÇÃO

- `POST /api/import/funcionarios` → Importar via CSV/Excel
- `GET /api/import/template/funcionarios` → Template de importação
- `POST /api/import-funcionarios/` → Importar (multipart)
- `GET /api/importacoes/` → Histórico de importações

### 🔍 COMPLIANCE & AUDITORIA

- `GET /api/compliance/` → Status geral
- `GET /api/compliance/dashboard`
- `GET /api/compliance/matriz`
- `GET /api/compliance/alertas`
- `GET /api/auditoria/` → Logs gerais
- `GET /api/auditoria/logs` → Logs detalhados

### 🔔 NOTIFICAÇÕES

- `GET /api/notificacoes/qualificacoes-vencendo`
- `POST /api/notificacoes/enviar-alertas`
- `GET /api/notificacoes/resumo`

### ⚙️ AUXILIARES

- `GET /api/funcoes` → Funções (Piloto, Copiloto, etc.)
- `POST /api/funcoes` → Criar função
- `GET /api/setores` → Setores
- `POST /api/setores` → Criar setor
- `GET /api/aeronaves` → Aeronaves
- `POST /api/aeronaves` → Criar aeronave
- `GET /api/categorias` → Categorias de qualificações
- `GET /api/categorias-qualificacoes` → Categorias detalhadas
- `GET /api/treinamentos/catalogo-treinamentos`
- `GET /api/treinamentos/dropdown` → Para dropdowns

## DTOs & SCHEMAS ZOD

### Funcionário

```typescript
// src/react-app/schemas/funcionario.schema.ts
{
  id?: number,
  matricula: string,
  nome: string,
  cpf: string,
  email?: string,
  funcao?: string,
  cargo?: string,
  endereco?: string,
  telefone?: string,
  escala?: string,
  status: 'ATIVO' | 'INATIVO',
  is_instrutor?: boolean,
  is_checador?: boolean,
  codigo_anac?: string,
  created_at?: string,
  updated_at?: string,
  deleted_at?: string
}
```

### Qualificação

```typescript
// src/react-app/schemas/qualificacao.schema.ts
{
  id?: number,
  funcionario_id: number,
  tipo: string, // CHECK, TREINAMENTO, EXAME, CMA, ASO, ICAO
  codigo?: string,
  nome: string,
  categoria?: string,
  data_emissao?: string,
  data_validade?: string,
  status: 'ATIVO' | 'VENCIDO' | 'A_VENCER',
  observacoes?: string,
  created_at?: string,
  updated_at?: string,
  deleted_at?: string
}
```

### Response Padrão

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: number; // HTTP status code
  meta?: {
    total?: number;
    page?: number;
    per_page?: number;
  };
}
```

## QUERIES SQL DE EXEMPLO

### 1. Listar Funcionários com Qualificações Ativas

```sql
SELECT
  f.id,
  f.matricula,
  f.nome,
  f.funcao,
  f.cargo,
  COUNT(q.id) as total_qualificacoes,
  SUM(CASE WHEN q.status = 'A_VENCER' THEN 1 ELSE 0 END) as a_vencer
FROM funcionarios f
LEFT JOIN qualificacoes q ON q.funcionario_id = f.id AND q.deleted_at IS NULL
WHERE f.deleted_at IS NULL
GROUP BY f.id
ORDER BY f.nome;
```

### 2. Qualificações Vencendo (30 dias)

```sql
SELECT
  f.nome as funcionario_nome,
  f.matricula,
  q.tipo,
  q.nome as qualificacao_nome,
  q.data_validade,
  julianday(q.data_validade) - julianday('now') as dias_restantes
FROM qualificacoes q
INNER JOIN funcionarios f ON q.funcionario_id = f.id
WHERE q.deleted_at IS NULL
  AND f.deleted_at IS NULL
  AND q.data_validade IS NOT NULL
  AND julianday(q.data_validade) - julianday('now') BETWEEN 0 AND 30
ORDER BY dias_restantes ASC;
```

### 3. Dashboard de Compliance por Setor

```sql
SELECT
  s.nome as setor,
  COUNT(DISTINCT f.id) as total_funcionarios,
  COUNT(q.id) as total_qualificacoes,
  SUM(CASE WHEN q.status = 'ATIVO' THEN 1 ELSE 0 END) as ativas,
  SUM(CASE WHEN q.status = 'VENCIDO' THEN 1 ELSE 0 END) as vencidas,
  SUM(CASE WHEN q.status = 'A_VENCER' THEN 1 ELSE 0 END) as a_vencer
FROM setores s
LEFT JOIN funcionarios f ON f.setor_id = s.id AND f.deleted_at IS NULL
LEFT JOIN qualificacoes q ON q.funcionario_id = f.id AND q.deleted_at IS NULL
WHERE s.deleted_at IS NULL
GROUP BY s.id
ORDER BY s.nome;
```

### 4. Sessões de Simulador com Avaliações

```sql
SELECT
  fs.id as ficha_id,
  fs.data_sessao,
  fs.tipo_sessao,
  f_piloto.nome as piloto_nome,
  f_instrutor.nome as instrutor_nome,
  s.nome as simulador,
  COUNT(sm.id) as total_manobras,
  AVG(ma.nota) as nota_media
FROM fichas_sessao fs
INNER JOIN funcionarios f_piloto ON fs.piloto_id = f_piloto.id
LEFT JOIN funcionarios f_instrutor ON fs.instrutor_id = f_instrutor.id
INNER JOIN simuladores s ON fs.simulador_id = s.id
LEFT JOIN sessao_manobras sm ON sm.ficha_id = fs.id
LEFT JOIN manobras_avaliacoes ma ON ma.sessao_manobra_id = sm.id
WHERE fs.deleted_at IS NULL
GROUP BY fs.id
ORDER BY fs.data_sessao DESC;
```

## MAPEAMENTO TABELA → FRONTEND

| Tabela                  | Componente React                                               | Rota Frontend                     |
| ----------------------- | -------------------------------------------------------------- | --------------------------------- |
| `funcionarios`          | `FuncionarioList.tsx`, `FuncionarioForm.tsx`                   | `/funcionarios`                   |
| `qualificacoes`         | `QualificacoesCard.tsx`                                        | `/funcionarios/:id/qualificacoes` |
| `qualificacoes` (tipos) | Dropdown em forms                                              | N/A (componente interno)          |
| `simuladores`           | `EquipamentoForm.tsx`                                          | `/simuladores`                    |
| `fichas_sessao`         | `FormularioAgendamento.tsx`                                    | `/sessoes`                        |
| `manobras`              | `FormularioManobra.tsx`, `ReordenarManobras.tsx`               | `/manobras`                       |
| `empresas`              | Admin panel (empresas)                                         | `/admin/empresas`                 |
| `pasta_virtual`         | `PastaVirtualCompleta.tsx`, `UploadDocumentosPastaVirtual.tsx` | `/funcionarios/:id/documentos`    |
| `certificados`          | `AbaCertificados.tsx`, `AddCertificacaoModal.tsx`              | `/funcionarios/:id/certificados`  |
| `dashboard` (views)     | Dashboard components                                           | `/dashboard`                      |

## REGRAS DE NEGÓCIO CRÍTICAS

### 1. Soft Delete Obrigatório

```typescript
// ❌ NUNCA fazer isso:
await db.prepare('DELETE FROM funcionarios WHERE id = ?').bind(id).run();

// ✅ SEMPRE fazer isso:
await db
  .prepare('UPDATE funcionarios SET deleted_at = datetime("now") WHERE id = ?')
  .bind(id)
  .run();
```

### 2. Auditoria Automática

```typescript
// Após qualquer UPDATE/DELETE:
await db
  .prepare(
    `
  INSERT INTO auditoria (usuario_id, acao, tabela_afetada, registro_id, dados_antes, dados_depois)
  VALUES (?, ?, ?, ?, ?, ?)
`,
  )
  .bind(user.id, 'UPDATE', 'funcionarios', id, JSON.stringify(before), JSON.stringify(after))
  .run();
```

### 3. Validação de Data de Validade

```typescript
// Atualizar status automaticamente:
if (qualificacao.data_validade) {
  const dias = differenceInDays(parseISO(qualificacao.data_validade), new Date());
  qualificacao.status = dias < 0 ? 'VENCIDO' : dias <= 30 ? 'A_VENCER' : 'ATIVO';
}
```

### 4. Upload para R2

```typescript
// Sempre gerar caminho único:
const caminhoR2 = `pasta-virtual/${funcionarioId}/${Date.now()}-${file.name}`;
await env.BUCKET.put(caminhoR2, await file.arrayBuffer(), {
  customMetadata: {
    uploadedBy: user.id,
    funcionarioId: String(funcionarioId),
    tipo: tipo,
  },
});
```

## COMANDOS ÚTEIS

### Listar todas as tabelas:

```sql
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
```

### Ver estrutura de uma tabela:

```sql
SELECT sql FROM sqlite_master WHERE type='table' AND name='funcionarios';
```

### Contar registros ativos:

```sql
SELECT COUNT(*) FROM funcionarios WHERE deleted_at IS NULL;
```

### Ver últimas alterações (auditoria):

```sql
SELECT * FROM auditoria ORDER BY created_at DESC LIMIT 50;
```

## ÍNDICES CRÍTICOS (Performance)

```sql
-- Funcionários
CREATE INDEX IF NOT EXISTS idx_funcionarios_deleted ON funcionarios(deleted_at);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cpf ON funcionarios(cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_funcionarios_matricula ON funcionarios(matricula) WHERE deleted_at IS NULL;

-- Qualificações
CREATE INDEX IF NOT EXISTS idx_qualificacoes_funcionario ON qualificacoes(funcionario_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_validade ON qualificacoes(data_validade) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_qualificacoes_status ON qualificacoes(status) WHERE deleted_at IS NULL;

-- Certificados
CREATE INDEX IF NOT EXISTS idx_certificados_funcionario ON certificados(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_certificados_qualificacao ON certificados(qualificacao_id);

-- Auditoria
CREATE INDEX IF NOT EXISTS idx_auditoria_created ON auditoria(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_tabela ON auditoria(tabela_afetada);
```

## LEMBRE-SE SEMPRE

✅ **SOFT DELETE ONLY** - Nunca deletar dados fisicamente  
✅ **AUDITORIA COMPLETA** - Registrar quem, o quê, quando  
✅ **VALIDAÇÃO ZOD** - Frontend e Backend  
✅ **RESPONSE PADRONIZADO** - { success, data?, error?, code? }  
✅ **ÍNDICES CRÍTICOS** - deleted_at em todas as queries WHERE  
✅ **MULTI-TENANT** - Sempre filtrar por empresa quando aplicável  
✅ **R2 STORAGE** - Arquivos grandes no R2, metadados no D1  
✅ **STATUS AUTOMÁTICO** - Recalcular status de qualificações automaticamente

```

---

## 📊 ESTATÍSTICAS DO SISTEMA

- **Total de Tabelas:** 62
- **Total de Endpoints API:** 196+
- **Services Implementados:** 33
- **Rotas do Backend:** 37 arquivos
- **Componentes React:** 100+
- **Schema Migrations:** 25 aplicadas (em produção)

---

## 🗂️ ESTRUTURA DE DIRETÓRIOS

### Backend (Worker)
```

src/worker/
├── routes/ # 37 arquivos de rotas HTTP
│ ├── index.ts # Roteador principal
│ ├── funcionarios.ts # CRUD funcionários
│ ├── qualificacoes.ts # CRUD qualificações
│ ├── habilitacoes.ts # Qualificações ↔ Funcionários
│ ├── certificados.ts # Geração de certificados PDF
│ ├── simuladores.ts # CRUD simuladores
│ ├── manobras.ts # CRUD manobras
│ ├── empresas.ts # Multi-tenant
│ ├── pasta-virtual.ts # Upload R2
│ ├── dashboard.ts # Dashboards
│ ├── relatorios.ts # Relatórios
│ ├── backup.ts # Backup/Restore
│ ├── auth-simple.ts # Autenticação
│ ├── compliance.ts # Compliance
│ ├── auditoria.ts # Logs
│ ├── notificacoes.ts # Alertas
│ └── ... (24+ outros)
│
├── services/ # 33 services (lógica de negócio)
│ ├── funcionariosService.ts
│ ├── qualificacoesService.ts
│ ├── habilitacoesService.ts
│ ├── certificadosService.ts
│ ├── auth-service.ts
│ ├── backup.ts
│ ├── compliance.ts
│ ├── csv-parser.ts
│ ├── pdf-generator.ts
│ ├── r2.service.ts
│ ├── query-optimization.ts
│ └── ... (22+ outros)
│
├── database/
│ └── migrations/ # Migrations do banco
│
└── index.ts # Entry point do Worker

```

### Frontend (React)
```

src/react-app/
├── components/
│ ├── funcionarios/
│ │ ├── FuncionarioList.tsx
│ │ ├── FuncionarioForm.tsx
│ │ ├── QualificacoesCard.tsx
│ │ ├── PastaVirtualCompleta.tsx
│ │ └── AbaCertificados.tsx
│ ├── simuladores/
│ │ ├── EquipamentoForm.tsx
│ │ ├── FormularioManobra.tsx
│ │ └── FormularioAgendamento.tsx
│ ├── UI/
│ │ ├── AdvancedDataTable.tsx
│ │ ├── Button.tsx
│ │ ├── Input.tsx
│ │ ├── Card.tsx
│ │ └── ... (20+ componentes)
│ └── ... (outros)
│
├── schemas/ # Validação Zod
│ ├── funcionario.schema.ts
│ └── qualificacao.schema.ts
│
├── utils/
│ ├── api-client.ts # Client HTTP
│ ├── formatters.ts # Formatação de dados
│ ├── validators.ts # Validações
│ └── ... (outros)
│
├── styles/
│ ├── design-system.ts # Tokens do Design System
│ └── design-tokens.ts # Variáveis CSS
│
└── App.tsx # App principal

````

---

## 🎨 DESIGN SYSTEM TOKENS

```typescript
// src/react-app/styles/design-tokens.ts
export const tokens = {
  colors: {
    primary: '#007AFF',      // Azul Apple
    success: '#34C759',      // Verde
    warning: '#FF9500',      // Laranja
    danger: '#FF3B30',       // Vermelho
    gray: {
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB',
      // ...
      900: '#111827'
    }
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px'
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display"',
    fontSize: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem'
    }
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    full: '9999px'
  },
  shadows: {
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
  }
};
````

---

## 🔄 FLUXO DE DADOS COMPLETO

### Exemplo: Criar Novo Funcionário

```
1. Frontend (FuncionarioForm.tsx)
   ↓ valida com Zod (funcionario.schema.ts)
   ↓ envia POST /api/funcionarios

2. Backend (routes/funcionarios.ts)
   ↓ recebe request
   ↓ valida dados novamente
   ↓ chama service

3. Service (services/funcionariosService.ts)
   ↓ aplica regras de negócio
   ↓ executa SQL INSERT
   ↓ registra auditoria
   ↓ retorna { success: true, data: funcionario }

4. Frontend
   ↓ recebe response
   ↓ invalida cache (TanStack Query)
   ↓ exibe toast de sucesso
   ↓ redireciona para lista
```

---

## 🚨 ERROS COMUNS E SOLUÇÕES

### ❌ Erro: "NOT NULL constraint failed"

**Causa:** Campo obrigatório não enviado  
**Solução:** Validar schema Zod antes de enviar

### ❌ Erro: "FOREIGN KEY constraint failed"

**Causa:** Tentando deletar registro referenciado  
**Solução:** Usar soft delete (`deleted_at`)

### ❌ Erro: "UNIQUE constraint failed"

**Causa:** CPF/matrícula duplicado  
**Solução:** Verificar existência antes de inserir

### ❌ Erro: 404 em endpoints

**Causa:** Rota não montada no `index.ts`  
**Solução:** Importar e montar rota em `src/worker/routes/index.ts`

---

## 📝 CHECKLIST DE DESENVOLVIMENTO

Ao criar um novo módulo:

- [ ] Criar tabela no D1 com `created_at`, `updated_at`, `deleted_at`
- [ ] Criar migration em `src/worker/migrations/`
- [ ] Criar service em `src/worker/services/`
- [ ] Criar rotas em `src/worker/routes/`
- [ ] Montar rotas em `src/worker/routes/index.ts`
- [ ] Criar schema Zod em `src/react-app/schemas/`
- [ ] Criar componentes React em `src/react-app/components/`
- [ ] Implementar auditoria (log de ações)
- [ ] Criar índices para performance
- [ ] Testar soft delete
- [ ] Documentar endpoints neste guia

---

## 📚 REFERÊNCIAS RÁPIDAS

### Tipos de Qualificações Padrão

- `CMA` → Certificado Médico Aeronáutico
- `ASO` → Atestado de Saúde Ocupacional
- `ICAO` → Proficiência em Inglês ICAO
- `CHECK` → Check de proficiência
- `TREINAMENTO` → Treinamento geral
- `EXAME` → Exame médico

### Status de Qualificações

- `ATIVO` → Dentro da validade
- `A_VENCER` → Vence em até 30 dias
- `VENCIDO` → Data de validade expirada

### Perfis de Usuário

- `ADMIN` → Acesso total
- `COMPLIANCE` → Visualização e relatórios
- `GESTOR` → Gestão de equipe
- `USUARIO` → Acesso básico

---

## 🎯 PROMPTS SUGERIDOS PARA GITHUB COPILOT

### Para criar novo endpoint:

```
Crie um endpoint POST /api/[recurso] seguindo o padrão AirTrust:
- Service em services/[recurso]Service.ts
- Rota em routes/[recurso].ts
- Validação Zod
- Soft delete obrigatório
- Auditoria completa
- Response padrão { success, data?, error? }
```

### Para criar componente React:

```
Crie componente [Nome] seguindo Design System AirTrust:
- Usar tokens do design-system.ts
- Importar de components/UI/
- Validação com Zod schema
- TanStack Query para data fetching
- Toast para feedback
- Loading e error states
```

### Para query SQL complexa:

```
Crie query SQL para [objetivo] considerando:
- Soft delete (WHERE deleted_at IS NULL)
- JOINs com qualificacoes/funcionarios
- Performance (usar índices)
- Paginação se necessário
- Schema do AirTrust (62 tabelas)
```

---

**✅ Documento atualizado com fonte da verdade de produção (14/11/2025)**

_Este guia é a referência definitiva para desenvolvimento no AirTrust. Mantenha-o sempre atualizado ao adicionar novas funcionalidades._
