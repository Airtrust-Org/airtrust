# 🧪 GUIA DE TESTES - AIRTRUST CERTIFICADOS

## ✅ Instruções para Testar o Sistema Completo

---

## 1️⃣ TESTE RÁPIDO - API (5 minutos)

### 1.1 Testar GET Empresas

```bash
curl -s "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/empresas-novo" | jq '.'

# Esperado: Array com empresas
# Exemplo: [{"id": 1, "nome": "Costa do Sol Táxi Aéreo", ...}]
```

### 1.2 Testar POST Empresa

```bash
curl -X POST "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/empresas-novo" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Empresa Teste '"$(date +%s)"'",
    "cnpj": "12.345.678/0001-90",
    "email": "contato@teste.com"
  }' | jq '.'

# Esperado: {"success": true, "id": NUMBER}
```

### 1.3 Testar GET Tipos

```bash
curl -s "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/tipos-qualificacoes-novo" | jq 'length'

# Esperado: 44+ (número de tipos)
```

### 1.4 Testar POST Tipo

```bash
curl -X POST "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/tipos-qualificacoes-novo" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Tipo Teste '"$(date +%s)"'",
    "descricao": "Descrição teste"
  }' | jq '.success'

# Esperado: true
```

### 1.5 Testar GET Certificados

```bash
curl -s "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/certificados-novo/qualificacao/1" | jq '.'

# Esperado: [] (empty array para qualificação sem certificados)
# ou array com certificados se houver
```

---

## 2️⃣ TESTE UI - FRONTEND (10 minutos)

### 2.1 Abrir Página de Qualificação

```
URL: https://seu-dominio.com/qualificacoes/1

Verificar:
✅ Página carrega sem erro
✅ Nome da qualificação aparece em h1
✅ Status badge mostra cor (verde/vermelho/etc)
✅ Info grid mostra 4 cards (hora, conclusão, vencimento, id)
✅ Gerenciador de certificados aparece
✅ Pasta virtual aparece na sidebar
```

### 2.2 Testar Gerar Certificado

```
Na página /qualificacoes/1:
1. Clicar botão "🔧 Gerar"
2. Observar loading (⏳ Gerando...)
3. Esperar 2-3 segundos
4. Ver nova linha na tabela com certificado

Verificar:
✅ Botão fica desabilitado durante
✅ Loading spinner mostra
✅ Certificado aparece na tabela
✅ Tipo "⚙️ Gerado"
```

### 2.3 Testar Upload de Arquivo

```
Na página /qualificacoes/1:
1. Clicar botão "📤 Fazer Upload"
2. Preencher formulário:
   - Arquivo PDF (selecionar qualquer PDF)
   - Data do Documento (opcional)
   - Validade Até (opcional)
   - Observações (opcional)
3. Clicar "✅ Enviar"
4. Esperar upload

Verificar:
✅ Form aparece
✅ Campos são preenchíveis
✅ Botão enviar ativa/desativa
✅ Novo certificado aparece com tipo "📤 Enviado"
```

### 2.4 Testar Download

```
Na tabela de certificados:
1. Clicar botão "📥 Baixar" de qualquer certificado
2. File download começa automaticamente

Verificar:
✅ Arquivo é baixado para pasta Downloads
✅ Nome do arquivo correto
✅ PDF abre normalmente
```

### 2.5 Testar Delete

```
Na tabela de certificados:
1. Clicar botão "🗑️ Deletar"
2. Confirmação aparece
3. Clicar OK para confirmar

Verificar:
✅ Dialog de confirmação
✅ Certificado desaparece da tabela
✅ Sem erro no console
```

### 2.6 Testar Pasta Virtual

```
Na sidebar "📁 Pasta Virtual":
1. Verificar se lista de arquivos aparece
2. Clicar ícone "👁️" para visualizar
3. Clicar ícone "📥" para baixar

Verificar:
✅ Arquivos listados com datas e tamanhos
✅ Links funcionam
✅ Arquivo abre/baixa
```

---

## 3️⃣ TESTE DE INTEGRAÇÃO (15 minutos)

### 3.1 Fluxo Completo

```
Cenário: Criar e gerenciar um certificado

1. Navegar para /qualificacoes/1
2. Clicar "Gerar Certificado"
3. Esperar geração
4. Verificar certificado na tabela
5. Baixar o PDF
6. Abrir PDF para verificar conteúdo
7. Voltar e clicar "Fazer Upload"
8. Upload de arquivo PDF
9. Verificar ambos (gerado + upload)
10. Deletar certificado de upload
11. Verificar apenas gerado permanece
12. Voltar (/qualificacoes)
13. Reentrar qualificação
14. Verificar persistência de dados

Esperado: Tudo funciona, dados persistem
```

### 3.2 Validação de Dados

```
Verificar no browser console:

1. Abrir DevTools (F12)
2. Ir para Network tab
3. Recarregar página
4. Verificar requisições:
   - GET /api/v2/qualificacoes/1 → Status 200
   - GET /api/v2/certificados-novo/qualificacao/1 → Status 200
   - GET /api/v2/pasta-virtual/... → Status 200 ou fallback
5. Clicar "Gerar"
   - POST /api/v2/certificados-novo/1/gerar → Status 200
6. Clicar "Download"
   - GET /api/v2/certificados-novo/X/download → Status 200 (blob)

Esperado: Todos status 200
```

### 3.3 Erro Handling

```
Testar cenários de erro:

1. Desativar internet (dev tools → offline)
   - Página deve mostrar erro
   - Mensagem legível

2. Tentar acessar qualificação inexistente (/qualificacoes/99999)
   - Mostrar mensagem "não encontrada"
   - Botão voltar funcionar

3. Fazer upload de arquivo não-PDF
   - Form validar tipo
   - Rejeitar arquivo

Esperado: Erros tratados graciosamente
```

---

## 4️⃣ TESTE DE RESPONSIVIDADE (5 minutos)

### 4.1 Mobile (320px)

```
1. Abrir DevTools
2. Modo responsivo (Ctrl+Shift+M)
3. Selecionar iPhone 12 (390x844)
4. Verificar:
   ✅ Layout 1 coluna
   ✅ Botões clicáveis
   ✅ Tabela scrollável horizontal
   ✅ Sem overflow
   ✅ Fonts legíveis
```

### 4.2 Tablet (768px)

```
1. Selecionar iPad (768x1024)
2. Verificar:
   ✅ Layout 1 coluna
   ✅ Elementos centralizados
   ✅ Botões espaçados
```

### 4.3 Desktop (1920px)

```
1. Selecionar Desktop (1920x1080)
2. Verificar:
   ✅ Layout 2 colunas
   ✅ Certificados + Pasta Virtual lado a lado
   ✅ Conteúdo programático embaixo
   ✅ Tudo visível sem scroll horizontal
```

---

## 5️⃣ TESTE DE PERFORMANCE (5 minutos)

### 5.1 Lighthouse

```
1. Abrir DevTools
2. Ir para Lighthouse
3. Audit para Performance
4. Verificar scores:
   ✅ Performance: > 80
   ✅ Accessibility: > 90
   ✅ Best Practices: > 90
```

### 5.2 Network Speed

```
1. DevTools → Network
2. Throttle → Slow 4G
3. Recarregar página
4. Verificar:
   ✅ Página ainda funcional
   ✅ Loading states aparecem
   ✅ Sem timeout
```

---

## 6️⃣ CHECKLIST FINAL

```
API TESTS:
☐ GET /empresas-novo      - Status 200
☐ POST /empresas-novo     - Status 201 + id retornado
☐ PUT /empresas-novo/:id  - Status 200
☐ DELETE /empresas-novo/:id - Status 200
☐ GET /tipos-qualificacoes-novo - Status 200
☐ POST /tipos-qualificacoes-novo - Status 201
☐ GET /certificados-novo/qualificacao/:id - Status 200
☐ POST /certificados-novo/upload - Status 201
☐ GET /certificados-novo/:id/download - Status 200 (blob)

UI TESTS:
☐ Página /qualificacoes/:id carrega
☐ Info grid mostra 4 cards
☐ Gerenciador certificados renderiza
☐ Pasta virtual mostra arquivos
☐ Gerar certificado funciona
☐ Upload arquivo funciona
☐ Download PDF funciona
☐ Deletar certificado funciona

RESPONSIVE:
☐ Mobile (320px) OK
☐ Tablet (768px) OK
☐ Desktop (1920px) OK

PERFORMANCE:
☐ Build time < 5s
☐ Deploy time < 30s
☐ Page load < 2s
☐ Lighthouse score > 80

ERROR HANDLING:
☐ Erro de conexão tratado
☐ Qualificação não encontrada
☐ Upload arquivo inválido
☐ Sem erro no console (excepto expected)
```

---

## 🔧 Troubleshooting

### Problema: Página 404 em /qualificacoes/1

```
Solução:
1. Verificar se rota está em App.tsx
2. Checar console para erros
3. Recarregar página (Ctrl+F5)
4. Limpar cache do navegador
```

### Problema: Certificados não carregam

```
Solução:
1. Verificar Network tab (GET certificados-novo/qualificacao/1)
2. Se 404: endpoint não existe
3. Se 500: erro no servidor (ver logs do worker)
4. Se timeout: performance issue
```

### Problema: Upload falha

```
Solução:
1. Verificar tamanho do arquivo (< 100MB)
2. Verificar formato (deve ser PDF)
3. Ver erro no DevTools Console
4. Checar Network tab para POST request
```

### Problema: PDF não abre

```
Solução:
1. Verificar se arquivo é PDF válido
2. Tentar com outro navegador
3. Verificar permissões de download
4. Checar se R2 storage tem arquivo
```

---

## 📞 Contato & Suporte

Se encontrar problemas:

1. Verificar console do browser (F12)
2. Checar Network tab para requisições
3. Verificar versão produção (v c239d220)
4. Consultar documentação CONCLUSAO-FINAL.md

---

## ✅ Teste Rápido (2 minutos)

Se sem tempo, fazer este teste mínimo:

```bash
# 1. Teste API
curl -s "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/empresas-novo" | jq '.[] | .nome'

# Esperado: Mostra nomes de empresas

# 2. Teste UI
# Abrir: https://seu-dominio.com/qualificacoes/1
# Verificar: Página carrega, tabela vazia, botões funcionam

# 3. Teste Gerar
# Clicar: "Gerar Certificado"
# Esperar: 3 segundos
# Verificar: Novo item na tabela

# PRONTO! Sistema funcional ✅
```

---

**Boa sorte nos testes!** 🚀
