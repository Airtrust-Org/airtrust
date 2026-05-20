# 🔍 AUDITORIA COMPLETA - SISTEMA DE CERTIFICADOS

**Data**: 2025-11-29 21:15:56
**Branch**: fix/importacao-completa-limpeza

---

## 1️⃣ SCHEMA D1 - Tabela documentos

### Estrutura Atual:
```sql
CREATE TABLE documentos_backup AS SELECT * FROM documentos;
DROP TABLE documentos;
CREATE TABLE documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  funcionario_id INTEGER NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  tamanho INTEGER NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT DEFAULT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id)
);
INSERT INTO documentos SELECT * FROM documentos_backup;
DROP TABLE documentos_backup;

-- ==========================================
```

## 2️⃣ SCHEMA D1 - Tabela qualificacoes_historico

### Estrutura Atual:
```sql
CREATE TABLE qualificacoes_historico (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  funcionario_id INTEGER, -- AGORA NULLABLE
  qualificacao_id INTEGER, -- AGORA NULLABLE
  tipo_codigo TEXT,
  codigo TEXT,
  categoria TEXT,
  validade TEXT,
  numero_certificado TEXT,
  observacoes TEXT,
  arquivo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT,
  data_conclusao TEXT,
  validade_meses INTEGER,
  instrutor TEXT,
  local TEXT,
  modalidade TEXT CHECK(modalidade IS NULL OR modalidade IN ('PRESENCIAL', 'EAD', 'HIBRIDO')),
  nota REAL CHECK(nota IS NULL OR (nota >= 1.0 AND nota <= 5.0)),
  carga_horaria REAL CHECK(carga_horaria IS NULL OR carga_horaria > 0),
  data_vencimento TEXT,
  renovada INTEGER DEFAULT 0,
  certificado_arquivo_id TEXT,
  funcionario_cpf TEXT, -- Nova coluna v2
  qualificacao_codigo TEXT COLLATE NOCASE -- Nova coluna v2
);

-- 4. Restaurar dados
INSERT INTO qualificacoes_historico SELECT * FROM qualificacoes_historico_new;

-- 5. Limpar temporária
DROP TABLE qualificacoes_historico_new;

-- 6. Recriar índices
CREATE INDEX IF NOT EXISTS idx_historico_func_cpf ON qualificacoes_historico(funcionario_cpf) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_qual_codigo ON qualificacoes_historico(qualificacao_codigo) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_conclusao ON qualificacoes_historico(data_conclusao) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historico_data_vencimento ON qualificacoes_historico(data_vencimento) WHERE deleted_at IS NULL;

```

## 3️⃣ BACKEND - Rotas de Certificados

### Arquivo: worker-airtrust/src/routes/qualificacoes-certificados.ts
```
106:app.get('/historico/:id/certificados', auth(), async (c) => {
136:app.post(
221:app.post(
346:app.delete('/historico/:id/certificados/:certId', auth(), requireRole('admin'), async (c) => {
385:app.get('/funcionario/:id', auth(), async (c) => {
451:app.get('/download/:id', auth(), async (c) => {
503:app.get('/stream/:id', auth(), async (c) => {
```

## 4️⃣ BACKEND - Registro de Rotas no index.ts

```typescript
import pastaVirtualRoutes from './routes/pasta-virtual';
import qualificacoesReclassRoutes from './routes/qualificacoes-reclass';
import qualificacoesCertificadosRoutes from './routes/qualificacoes-certificados';
import categoriasRoutes from './routes/categorias';
import dashboardRoutes from './routes/dashboard';
/**
 * Rotas de Certificados de Qualificações
 * GET    /api/certificados/funcionario/:id
 * GET    /api/certificados/historico/:id/certificados
 * POST   /api/certificados/historico/:id/certificados
 * DELETE /api/certificados/historico/:id/certificados/:certId
 */
app.route('/api/certificados', qualificacoesCertificadosRoutes);

// ===== 404 HANDLER =====
```

## 5️⃣ FRONTEND - Componente CertificadoGestaoModal.tsx

### Endpoints Chamados:
```typescript
        `${API_BASE_URL}/certificados/historico/${qualificacaoId}/certificados`,
        `${API_BASE_URL}/certificados/historico/${qualificacaoId}/certificados/upload`,
        `${API_BASE_URL}/certificados/historico/${qualificacaoId}/certificados/gerar`,
      const res = await fetch(`${API_BASE_URL}/certificados/download/${certId}`, {
```

## 6️⃣ R2 BUCKET - Configuração wrangler.toml

```toml
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage"
preview_bucket_name = "airtrust-storage"
--
[[env.staging.r2_buckets]]
binding = "BUCKET"
bucket_name = "airtrust-storage"
```

## 7️⃣ NOMENCLATURA R2 - Utilitário

### Arquivo: worker-airtrust/src/lib/nomenclatura-padronizada.ts
❌ Arquivo não encontrado!

## 8️⃣ ENDPOINTS BACKEND - Resumo

| Método | Rota | Descrição |
|--------|------|-----------|
| GET/HISTORICO/:ID/CERTIFICADOS |  | |
| POST |  | |
| POST |  | |
| DELETE/HISTORICO/:ID/CERTIFICADOS/:CERTID |  | |
| GET/FUNCIONARIO/:ID |  | |
| GET/DOWNLOAD/:ID |  | |
| GET/STREAM/:ID |  | |

## 9️⃣ ARQUIVO ATUAL - CertificadoGestaoModal.tsx

### Linhas de Interesse:
```typescript
113:  async function handleUpload() {
161:  async function handleGerar() {
198:  async function handleBaixar(certId: number, nome: string) {
207:      const res = await fetch(`${API_BASE_URL}/certificados/download/${certId}`, {
315:                  onClick={handleGerar}
399:                  onClick={handleUpload}
452:                      onClick={() => handleBaixar(cert.id, cert.nome_arquivo)}
```

## 🔟 CHECKLIST DE VALIDAÇÃO

### Backend Routes:
- ❌ GET /historico/:id/certificados (listar)
- ❌ POST /historico/:id/certificados/upload
- ❌ POST /historico/:id/certificados/gerar
- ✅ GET /download/:id
- ✅ GET /stream/:id

### Frontend Endpoints:
- ✅ Usando path correto /api/certificados/

### R2 Configuration:
- ✅ R2 bucket configurado (binding: BUCKET)

### Nomenclatura Padrão:
- ❌ Utilitário de nomenclatura não encontrado

---

## 📋 PRÓXIMOS PASSOS

1. **Revisar este relatório** e identificar gaps
2. **Testar endpoints manualmente** com curl/Postman
3. **Verificar tabela documentos** no D1 (se tem dados)
4. **Validar nomenclatura R2** no bucket airtrust-storage
5. **Criar prompt de correção** baseado nos gaps identificados

