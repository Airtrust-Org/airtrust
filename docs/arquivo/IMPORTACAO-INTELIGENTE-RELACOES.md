# 🚀 IMPORTAÇÃO INTELIGENTE DE RELAÇÕES MODELO-MANOBRA

**Data:** 23/10/2025  
**Status:** ✅ **IMPLEMENTADO E FUNCIONANDO**  
**Deploy ID:** `beafd9b1-fe51-4210-88d3-c1ce9d31e368`

---

## 📋 **O QUE FOI IMPLEMENTADO**

Sistema completo de importação inteligente que permite:

✅ **Auto-criação de modelos** se não existirem  
✅ **Auto-criação de manobras** se não existirem  
✅ **Criação de relações** modelo-manobra  
✅ **Checkbox configurável** para habilitar/desabilitar auto-criação  
✅ **Relatório detalhado** com tudo que foi criado  
✅ **Template Excel** para download  
✅ **Validações completas**  
✅ **Auditoria** de todas as importações

---

## 🎯 **VANTAGEM PRINCIPAL**

**ANTES:** 3 importações separadas
1. Importar modelos
2. Importar manobras
3. Importar relações

**AGORA:** 1 importação única
- Tudo em um Excel só
- Sistema cria o que falta automaticamente
- Relaciona tudo de uma vez

---

## 📊 **FORMATO DO EXCEL**

### **Colunas Obrigatórias:**
```
modelo_codigo    | Código do modelo (ex: SESS-001)
manobra_codigo   | Código da manobra (ex: MAN-001)
ordem            | Ordem da manobra no modelo (1, 2, 3...)
```

### **Colunas Opcionais - Auto-criação de Modelo:**
```
modelo_nome      | Nome do modelo (se preenchido, cria automaticamente)
modelo_duracao   | Duração em minutos (padrão: 60)
modelo_tipo      | VFR | IFR | MIXED (padrão: VFR)
```

### **Colunas Opcionais - Auto-criação de Manobra:**
```
manobra_nome     | Nome da manobra (se preenchido, cria automaticamente)
manobra_tipo     | NORMAL | EMERGENCIA (padrão: NORMAL)
manobra_categoria| Categoria da manobra (padrão: GERAL)
```

### **Colunas Opcionais - Relação:**
```
obrigatoria      | SIM | NAO
tempo_estimado_min | Tempo estimado em minutos
```

---

## 🔄 **LÓGICA DE PROCESSAMENTO**

Para cada linha do Excel:

### **PASSO 1: Processar Modelo**
```
if modelo_codigo existe no banco:
  ✅ Usar modelo existente
else if modelo_nome está preenchido:
  ✅ Criar novo modelo automaticamente
  📝 Log: "Modelo SESS-XXX criado automaticamente"
else:
  ❌ Erro: "Modelo não existe e sem dados para criar"
  ⏭️ Pular linha
```

### **PASSO 2: Processar Manobra**
```
if manobra_codigo existe no banco:
  ✅ Usar manobra existente
else if manobra_nome está preenchido:
  ✅ Criar nova manobra automaticamente
  📝 Log: "Manobra MAN-XXX criada automaticamente"
else:
  ❌ Erro: "Manobra não existe e sem dados para criar"
  ⏭️ Pular linha
```

### **PASSO 3: Criar Relação**
```
if modelo_sessao_id AND manobra_id:
  ✅ Inserir relação
  📝 Log: "Relação criada com sucesso"
```

---

## 📡 **ENDPOINTS**

### **1. POST /api/v2/relacoes/importar-inteligente**

**Request:**
```json
{
  "dados": [
    {
      "modelo_codigo": "SESS-001",
      "manobra_codigo": "MAN-001",
      "ordem": 1,
      "modelo_nome": "Sessão VFR Básica",
      "modelo_duracao": 60,
      "modelo_tipo": "VFR",
      "manobra_nome": "Decolagem Normal",
      "manobra_tipo": "NORMAL",
      "manobra_categoria": "DECOLAGEM",
      "obrigatoria": "SIM",
      "tempo_estimado_min": 5
    }
  ],
  "auto_criar": true
}
```

**Response:**
```json
{
  "sucesso": true,
  "resumo": {
    "total_linhas": 10,
    "relacoes_criadas": 8,
    "modelos_auto_criados": 2,
    "manobras_auto_criadas": 3,
    "erros": 2
  },
  "detalhes": {
    "modelos_criados": [
      { "codigo": "SESS-NEW", "nome": "Sessão Nova", "linha": 3 }
    ],
    "manobras_criadas": [
      { "codigo": "NAV-001", "nome": "Navegação VOR", "linha": 2 }
    ],
    "erros": [
      { "linha": 5, "motivo": "Modelo SESS-999 não existe e sem nome fornecido" }
    ]
  }
}
```

### **2. GET /api/v2/relacoes/template-excel**

Retorna estrutura do template Excel com exemplos.

---

## 🖥️ **INTERFACE FRONTEND**

**Página:** `/simuladores/importar-relacoes-inteligente`

### **Funcionalidades:**

1. ✅ **Botão "Baixar Template Excel"**
   - Gera arquivo Excel com colunas corretas
   - Inclui 2 linhas de exemplo

2. ✅ **Upload de Arquivo**
   - Drag & drop ou clique para selecionar
   - Aceita .xlsx e .xls

3. ✅ **Checkbox "Criar automaticamente"**
   - ☑️ Marcado (padrão): Cria modelos/manobras que não existem
   - ☐ Desmarcado: Apenas relações com existentes

4. ✅ **Botão "Importar Relações"**
   - Processa arquivo
   - Mostra progresso

5. ✅ **Relatório Detalhado**
   - Cards com resumo (total, criados, erros)
   - Lista de modelos criados
   - Lista de manobras criadas
   - Lista de erros com linha e motivo

---

## 📝 **EXEMPLO DE USO**

### **Cenário: Criar sessão completa do zero**

**Excel:**
```
modelo_codigo | manobra_codigo | ordem | modelo_nome      | manobra_nome        | obrigatoria
SESS-NEW      | MAN-NEW-01     | 1     | Sessão Completa  | Decolagem Normal    | SIM
SESS-NEW      | MAN-NEW-02     | 2     |                  | Navegação VOR       | SIM
SESS-NEW      | MAN-NEW-03     | 3     |                  | Pouso Normal        | SIM
```

**Resultado:**
- ✅ 1 modelo criado: SESS-NEW "Sessão Completa"
- ✅ 3 manobras criadas: MAN-NEW-01, MAN-NEW-02, MAN-NEW-03
- ✅ 3 relações criadas

**Tudo em uma única importação!** 🎉

---

## 🔍 **VALIDAÇÕES**

### **Modelo Auto-criado:**
- ✅ Código formato SESS-XXX (obrigatório)
- ✅ Nome (obrigatório)
- ✅ Duração (padrão: 60 se não fornecido)
- ✅ Tipo (padrão: VFR se não fornecido)

### **Manobra Auto-criada:**
- ✅ Código formato MAN-XXX (obrigatório)
- ✅ Nome (obrigatório)
- ✅ Tipo (padrão: NORMAL se não fornecido)
- ✅ Categoria (padrão: GERAL se não fornecido)

---

## 📊 **AUDITORIA**

Cada importação registra em `auditoria`:

```json
{
  "tipo": "RELACOES_AUTO_CRIACAO",
  "detalhes": {
    "modelos_criados": ["SESS-001", "SESS-002"],
    "manobras_criadas": ["MAN-001", "MAN-002", "MAN-003"],
    "relacoes_criadas": 15,
    "auto_criar_habilitado": true,
    "duracao_ms": 1234
  },
  "usuario_id": 1,
  "created_at": "2025-10-23 17:00:00"
}
```

---

## 🎯 **CASOS DE USO**

### **1. Importar relações com modelos/manobras existentes**
- ☐ Desmarcar "Criar automaticamente"
- ✅ Apenas cria relações
- ❌ Erro se modelo/manobra não existir

### **2. Criar tudo do zero**
- ☑️ Marcar "Criar automaticamente"
- ✅ Preencher modelo_nome e manobra_nome
- ✅ Sistema cria tudo automaticamente

### **3. Misto (alguns existem, outros não)**
- ☑️ Marcar "Criar automaticamente"
- ✅ Deixar nome em branco para existentes
- ✅ Preencher nome para novos
- ✅ Sistema identifica e cria apenas o necessário

---

## 🚀 **COMO USAR**

1. **Acesse:** `https://[seu-dominio]/simuladores/importar-relacoes-inteligente`

2. **Baixe o template:**
   - Clique em "Baixar Template Excel"
   - Arquivo: `template_relacoes_completas.xlsx`

3. **Preencha o Excel:**
   - Colunas obrigatórias: `modelo_codigo`, `manobra_codigo`, `ordem`
   - Para criar novo: preencha `modelo_nome` e/ou `manobra_nome`
   - Para usar existente: deixe nome em branco

4. **Faça upload:**
   - Selecione arquivo
   - Marque/desmarque "Criar automaticamente"
   - Clique em "Importar Relações"

5. **Veja o resultado:**
   - Resumo com totais
   - Detalhes de tudo que foi criado
   - Lista de erros (se houver)

---

## ✅ **ARQUIVOS CRIADOS**

### **Backend:**
- `src/worker/api/v2/relacoes-import-inteligente.ts` (325 linhas)
  - POST /importar-inteligente
  - GET /template-excel
  - Lógica completa de auto-criação

### **Frontend:**
- `src/react-app/pages/simuladores/ImportarRelacoesInteligente.tsx` (300 linhas)
  - Interface completa
  - Upload de arquivo
  - Checkbox configurável
  - Relatório detalhado

### **Rotas:**
- `src/worker/routes/index.ts`
  - Registro da rota `/api/v2/relacoes`

---

## 🎉 **CONCLUSÃO**

**Sistema completo de importação inteligente implementado e funcionando!**

✅ Backend completo  
✅ Frontend completo  
✅ Validações  
✅ Auditoria  
✅ Template Excel  
✅ Relatório detalhado  
✅ Deploy em produção

**Pronto para uso!** 🚀

---

**URL de Produção:**  
`https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/relacoes/importar-inteligente`
