# 📊 TABELAS DO BANCO DE PRODUÇÃO

**Data:** 21 de outubro de 2025, 21:20  
**Banco:** airtrust-db (7c8a788e-a4c4-4d5d-8208-ff7ff55e84ae)  
**Ambiente:** PRODUÇÃO

---

## 📋 LISTA COMPLETA DE TABELAS

### 1. **usuarios**
- **Tipo:** Tabela Principal
- **Descrição:** Usuários do sistema (login e autenticação)
- **Registros:** 1
- **Colunas:** 8
  - id, email, password_hash, nome, perfil, funcionario_id, ativo, created_at, updated_at

### 2. **funcionarios**
- **Tipo:** Tabela Principal
- **Descrição:** Cadastro de funcionários/colaboradores
- **Registros:** 5
- **Colunas:** 34
  - id, matricula, nome, cpf, email, telefone
  - data_nascimento, data_admissao, cargo, setor, status
  - guerra, codigo_anac, codigo_canac, funcao, base, contrato
  - licenca_aeronautica, anv, codigo_sispat, codigo_prestserv
  - cma_numero, cma_data_vencimento, cma_status
  - aso_data_vencimento, nivel_icao, nivel_icao_data_vencimento, nivel_icao_status
  - aeronave_principal, is_instrutor, is_checador
  - created_at, updated_at, deleted_at

### 3. **qualificacoes**
- **Tipo:** Tabela Principal (UNIFICADA)
- **Descrição:** Treinamentos, Exames e Checks
- **Registros:** 11
- **Colunas:** 28
  - id, funcionario_id, tipo, codigo, nome
  - data_realizacao, data_validade, resultado, nota, instrutor
  - local, observacoes, certificado_url, status, superseded_by
  - is_superseded, descricao, categoria
  - periodicidade_meses, nota_minima, carga_horaria, ativo
  - data_conclusao, data_vencimento, nota_final, checador, arquivo_url
  - created_at, updated_at, deleted_at

### 4. **certificados**
- **Tipo:** Tabela Principal
- **Descrição:** Certificados PDF (metadados)
- **Registros:** 0
- **Colunas:** 16
  - id, qualificacao_id, funcionario_id
  - arquivo_nome, arquivo_nome_original
  - arquivo_tamanho, arquivo_tamanho_original, arquivo_tamanho_comprimido
  - compressao_percentual, arquivo_hash, arquivo_r2_key, arquivo_url
  - tipo, data_documento, uploaded_by, uploaded_at
  - created_at, updated_at, deleted_at

### 5. **certificados_auditoria**
- **Tipo:** Tabela de Auditoria
- **Descrição:** Log de ações em certificados
- **Registros:** 0
- **Colunas:** 6
  - id, certificado_id, acao, usuario_id, detalhes, created_at

### 6. **importacoes_log**
- **Tipo:** Tabela de Log
- **Descrição:** Histórico de importações
- **Registros:** 2
- **Colunas:** 8
  - id, tipo, arquivo_nome, total_registros, sucesso, erros, detalhes, usuario_id, created_at

### 7. **aeronaves**
- **Tipo:** Tabela Auxiliar
- **Descrição:** Cadastro de aeronaves
- **Registros:** 0
- **Colunas:** ~8
  - id, codigo, modelo, fabricante, ano, status, created_at, updated_at

### 8. **funcoes**
- **Tipo:** Tabela Auxiliar
- **Descrição:** Funções/cargos disponíveis
- **Registros:** 0
- **Colunas:** ~6
  - id, nome, descricao, ativo, created_at, updated_at

### 9. **setores**
- **Tipo:** Tabela Auxiliar
- **Descrição:** Setores da empresa
- **Registros:** 0
- **Colunas:** ~6
  - id, nome, descricao, ativo, created_at, updated_at

### 10. **arquivos**
- **Tipo:** Tabela Auxiliar
- **Descrição:** Controle de arquivos gerais
- **Registros:** 0
- **Colunas:** ~10
  - id, nome, tipo, tamanho, r2_key, url, created_at, updated_at

### 11. **backups**
- **Tipo:** Tabela de Sistema
- **Descrição:** Controle de backups
- **Registros:** 0
- **Colunas:** ~12
  - id, filename, r2_path, tamanho, hash_md5, tipo, modulos, status, created_at

### 12. **_cf_KV**
- **Tipo:** Tabela Interna Cloudflare
- **Descrição:** Metadados do Cloudflare
- **Registros:** N/A
- **Uso:** Sistema interno

### 13. **d1_migrations**
- **Tipo:** Tabela de Sistema
- **Descrição:** Controle de migrações
- **Registros:** 2
- **Colunas:** 3
  - id, name, applied_at

### 14. **sqlite_sequence**
- **Tipo:** Tabela de Sistema SQLite
- **Descrição:** Controle de AUTO_INCREMENT
- **Registros:** N/A
- **Uso:** Sistema interno

---

## 📊 RESUMO ESTATÍSTICO

### Tabelas por Tipo
```
Principais:  5 (usuarios, funcionarios, qualificacoes, certificados, certificados_auditoria)
Auxiliares:  4 (aeronaves, funcoes, setores, arquivos)
Log/Sistema: 2 (importacoes_log, backups)
Internas:    3 (_cf_KV, d1_migrations, sqlite_sequence)
TOTAL:       14 tabelas
```

### Dados Armazenados
```
✅ usuarios:                1 registro
✅ funcionarios:            5 registros
✅ qualificacoes:          11 registros
✅ certificados:            0 registros
✅ certificados_auditoria:  0 registros
✅ importacoes_log:         2 registros
✅ aeronaves:               0 registros
✅ funcoes:                 0 registros
✅ setores:                 0 registros
✅ arquivos:                0 registros
✅ backups:                 0 registros
✅ d1_migrations:           2 registros

TOTAL: 21 registros de dados
```

### Colunas Totais
```
usuarios:                   8 colunas
funcionarios:              34 colunas (EXPANDIDA)
qualificacoes:             28 colunas (EXPANDIDA)
certificados:              16 colunas
certificados_auditoria:     6 colunas
importacoes_log:            8 colunas
aeronaves:                 ~8 colunas
funcoes:                   ~6 colunas
setores:                   ~6 colunas
arquivos:                 ~10 colunas
backups:                  ~12 colunas

TOTAL: ~142 colunas
```

---

## 🔑 ÍNDICES CRIADOS

### funcionarios
```sql
idx_funcionarios_matricula (matricula)
idx_funcionarios_nome (nome)
idx_funcionarios_status (status)
idx_funcionarios_deleted (deleted_at)
```

### qualificacoes
```sql
idx_qualificacoes_funcionario (funcionario_id)
idx_qualificacoes_tipo (tipo)
idx_qualificacoes_codigo (codigo)
idx_qualificacoes_validade (data_validade)
idx_qualificacoes_deleted (deleted_at)
idx_qualificacoes_unique (funcionario_id, tipo, codigo, data_realizacao) WHERE deleted_at IS NULL
```

### certificados
```sql
idx_certificados_qualificacao (qualificacao_id)
idx_certificados_funcionario (funcionario_id)
idx_certificados_hash (arquivo_hash)
idx_certificados_deleted (deleted_at)
```

### certificados_auditoria
```sql
idx_certificados_auditoria_certificado (certificado_id)
idx_certificados_auditoria_acao (acao)
```

### usuarios
```sql
idx_usuarios_email (email)
idx_usuarios_perfil (perfil)
```

---

## 🔗 RELACIONAMENTOS (FOREIGN KEYS)

### qualificacoes
```sql
funcionario_id → funcionarios(id) ON DELETE CASCADE
superseded_by → qualificacoes(id)
```

### certificados
```sql
qualificacao_id → qualificacoes(id) ON DELETE CASCADE
funcionario_id → funcionarios(id) ON DELETE CASCADE
```

### certificados_auditoria
```sql
certificado_id → certificados(id) ON DELETE CASCADE
```

### usuarios
```sql
funcionario_id → funcionarios(id)
```

---

## 📈 TAMANHO DO BANCO

```
Tamanho Total: 0.23 MB
Região: ENAM (East North America)
Status: ✅ OPERACIONAL
```

---

## 🎯 TABELAS MAIS IMPORTANTES

### 1. **funcionarios** (34 colunas)
- Núcleo do sistema
- Todas as informações de colaboradores
- Inclui CMA, ASO, ICAO, etc.

### 2. **qualificacoes** (28 colunas)
- Tabela UNIFICADA
- Treinamentos + Exames + Checks
- Sistema de supersedência

### 3. **certificados** (16 colunas)
- Metadados de PDFs
- Compressão automática
- Integração com R2

---

## ✅ VERIFICAÇÃO DE INTEGRIDADE

```
✅ Todas as 14 tabelas existem
✅ Índices criados corretamente
✅ Foreign Keys configuradas
✅ Constraints aplicadas
✅ Dados consistentes
✅ Migrações aplicadas (2)
```

---

## 🚀 PRÓXIMOS PASSOS

### Tabelas a Popular
```
⚠️ aeronaves (0 registros)
⚠️ funcoes (0 registros)
⚠️ setores (0 registros)
```

### Funcionalidades Pendentes
```
⚠️ R2 Storage (certificados PDF)
⚠️ Backups automáticos
⚠️ Auditoria avançada
```

---

**Versão:** 1.0.0  
**Data:** 21/10/2025, 21:20  
**Status:** ✅ **COMPLETO**
