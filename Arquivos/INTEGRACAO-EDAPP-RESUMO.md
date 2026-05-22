# ✅ Integração EdApp - Resumo Executivo

## 🎯 Como Funciona (Sem Intervenção Manual)

### Processo Automático 100%

```
Funcionário completa curso no EdApp
           ↓
EdApp envia webhook automático
           ↓
AirTrust recebe em /api/integracoes/edapp/webhook
           ↓
Sistema verifica mapeamentos (usuário + curso)
           ↓
Busca validade configurada no tipo de qualificação (DINÂMICA)
           ↓
Verifica se já existe qualificação vigente:
  ├─ SIM → RENOVA (soma validade_meses à data atual)
  └─ NÃO → CRIA nova (data + validade_meses)
           ↓
✅ Qualificação criada/renovada AUTOMATICAMENTE
  - Data de conclusão: dia do evento
  - Data de vencimento: baseado em validade_meses (dinâmica)
  - Observação: "EdApp: course_id:ABC | Válido por X meses"
```

**VOCÊ NÃO PRECISA FAZER NADA!**

---

## 🔍 Como Ter Certeza que Está Funcionando

### Método 1: Dashboard Visual (RECOMENDADO)

1. Acesse: **Configurações → Integrações → EdApp**
2. Verifique:
   - ✅ **Webhook Ativo** (com ID)
   - 📊 **Métricas em Tempo Real**:
     - Eventos Recebidos
     - Processados (= qualificações criadas)
     - Erros (mapeamentos faltando)
     - Usuários Mapeados

### Método 2: Log de Eventos em Tempo Real

1. Clique no botão **"Ver Log Eventos"**
2. Veja TODOS os webhooks recebidos:
   - ✅ **Verde** = Processado com sucesso
   - ❌ **Vermelho** = Erro (usuário ou curso não mapeado)
   - ⏳ **Cinza** = Pendente
3. Cada evento mostra:
   - Usuário (edapp_user_id)
   - Curso (edapp_course_id)
   - Data/Hora
   - Erro (se houver)

### Método 3: Botão de Teste

1. Clique em **"Testar Webhook"**
2. Sistema simula evento
3. Veja aparecer no log em tempo rA validadeeal
4. Confirma que sistema está recebendo

### Método 4: Verificar Qualificações

1. **Funcionários → Pasta Virtual**
2. Procure qualificações com:
   - **Observação**: "EdApp: course_id:..."
3. Confirme datas automáticas

---

## ⚙️ Configuração Inicial (Só Uma Vez)

### 1. Criar Webhook (Automático)

Clique em **"Criar Webhook Automaticamente"**
✅ Pronto! Webhook configurado no EdApp.

### 2. Mapear Usuários

Para cada funcionário que usa EdApp:

- **Integrações → EdApp → Usuários → Adicionar**
- Preencher:
  - Funcionário ID (AirTrust)
  - EdApp User ID
  - Email (opcional)

### 3. Mapear Cursos

Para cada curso que gera qualificação:

- **Integrações → EdApp → Cursos → Adicionar**
- Preencher:
  - EdApp Course ID
  - Nome do Curso
  - Qualificação AirTrust (dropdown)

---

## 🚨 Resolução de Problemas

### Erro: "Usuário não mapeado"

**Solução**: Adicionar mapeamento em **Usuários**

### Erro: "Curso não mapeado"

**Solução**: Adicionar mapeamento em **Cursos**

### ✅ "Qualificação Renovada"

**Comportamento**: Quando o funcionário faz o curso novamente, o sistema **renova automaticamente** a qualificação existente, somando a validade à data de vencimento atual (mesma regra de renovação manual).

### Nenhum evento aparece

**Possíveis causas**:

1. Webhook não configurado → Clicar "Criar Webhook"
2. Nenhum curso foi concluído no EdApp
3. Verificar se EdApp está enviando webhooks

---

## 📊 Indicadores de Saúde

### ✅ Sistema Funcionando Bem

- Webhook: ✅ Ativo
- Taxa de sucesso: > 90%
- Eventos processados regularmente
- Qualificações aparecendo automaticamente

### ❌ Necessita Atenção

- Webhook: ❌ Inativo
- Taxa de sucesso: < 50%
- Muitos erros de mapeamento
- Nenhum evento nos últimos 7 dias

---

## 🎯 Checklist Semanal

- [ ] Verificar Log de Eventos
- [ ] Verificar taxa de sucesso
- [ ] Adicionar novos funcionários (se contratados)
- [ ] Adicionar novos cursos (se criados no EdApp)
- [ ] Confirmar qualificações criadas automaticamente

---

## 📈 Benefícios

✅ **Sem trabalho manual**: 0% de intervenção humana
✅ **Tempo real**: Qualificação criada em segundos
✅ **Auditável**: Log completo de todos eventos
✅ **Confiável**: Evita duplicatas automaticamente
✅ **Rastreável**: Observação identifica origem EdApp

---

**Data**: 23/01/2026
**Status**: ✅ Integração Automática 100% Funcional
**Próxima Revisão**: 30/01/2026
