# 🔗 Integração EdApp - Guia Completo

## ✅ Como Funciona a Integração Automática

### 1. **Processo Automático (SEM necessidade de operador)**

Quando um funcionário **completa um curso no EdApp**:

```
1️⃣ EdApp detecta conclusão do curso
2️⃣ EdApp envia webhook para AirTrust (automático)
3️⃣ AirTrust recebe o evento em: /api/integracoes/edapp/webhook
4️⃣ AirTrust verifica:
   - Usuário está mapeado? (edapp_user_id → funcionario_id)
   - Curso está mapeado? (edapp_course_id → qualificacao_codigo)
5️⃣ AirTrust CRIA AUTOMATICAMENTE a qualificação:
   - Data de conclusão: data do evento
   - Data de vencimento: +1 ano (configurável)
   - Observações: "EdApp: course_id:ABC123"
6️⃣ Evento registrado no log ✅
```

### 2. **O que NÃO precisa fazer**

❌ NÃO precisa acessar o EdApp para verificar conclusões
❌ NÃO precisa copiar dados manualmente
❌ NÃO precisa criar qualificações manualmente
❌ NÃO precisa pressionar nenhum botão

### 3. **Como Ter Certeza que Está Funcionando**

#### Método 1: Dashboard de Status

Acesse: **Configurações → Integrações → EdApp → Status**

Você verá:

- ✅ **Webhook Ativo**: com ID único
- 📊 **Métricas em Tempo Real**:
  - Eventos Recebidos (total de webhooks recebidos)
  - Processados (qualificações criadas com sucesso)
  - Erros (eventos com problema de mapeamento)
  - Usuários Mapeados

#### Método 2: Log de Eventos (RECOMENDADO)

1. Clique em **"Ver Log Eventos"**
2. Veja TODOS os eventos recebidos do EdApp
3. Para cada evento, você verá:
   - ✅ **Status**: Processado / Pendente / Erro
   - 👤 **Usuário**: edapp_user_id
   - 📚 **Curso**: edapp_course_id
   - ⏰ **Data/Hora**: quando foi recebido
   - ❌ **Erro**: se houver problema (usuário não mapeado, curso não mapeado)

#### Método 3: Testar Webhook Manualmente

1. Clique em **"Testar Webhook"**
2. Sistema envia evento falso
3. Veja aparecer no log em tempo real
4. Verifica que o sistema está recebendo eventos

#### Método 4: Verificar Qualificações Criadas

1. Acesse **Funcionários → Pasta Virtual**
2. Veja qualificações com observação: **"EdApp: course_id:..."**
3. Confirme data de conclusão e vencimento

## 🔧 Configuração Inicial (Só precisa fazer UMA vez)

### Passo 1: Criar Webhook no EdApp

O sistema tem um botão **"Criar Webhook Automaticamente"** que faz isso por você!

**Manual (se quiser fazer no painel do EdApp)**:

1. Acesse EdApp → Settings → Integrations → Webhooks
2. Criar novo webhook:
   - **URL**: `https://api.airtrust.online/api/integracoes/edapp/webhook`
   - **Event**: `CourseCompletedEvent`
   - **Secret**: (copiar do arquivo .env)

### Passo 2: Mapear Usuários

Para cada funcionário que usa EdApp:

1. **Integrações → EdApp → Usuários**
2. Clicar **"Adicionar"**
3. Preencher:
   - **Funcionário ID**: ID no AirTrust
   - **EdApp User ID**: ID do usuário no EdApp
   - **Email**: email (opcional)

**Dica**: Use o botão "Listar Usuários EdApp" para ver todos os IDs

### Passo 3: Mapear Cursos

Para cada curso do EdApp que gera qualificação:

1. **Integrações → EdApp → Cursos**
2. Clicar **"Adicionar"**
3. Preencher:
   - **EdApp Course ID**: ID do curso no EdApp
   - **Nome do Curso**: nome descritivo
   - **Qualificação AirTrust**: selecionar tipo de qualificação

**Dica**: Use o botão "Listar Cursos EdApp" para ver todos os IDs

## 🔍 Monitoramento e Troubleshooting

### Como Saber se Um Evento Falhou?

No **Log de Eventos**, procure por eventos com:

- ❌ Status **"Erro"**
- 🔴 Fundo vermelho

Erros comuns:

#### 1. "Usuário não mapeado"

**Causa**: O funcionário completou o curso, mas não existe mapeamento
**Solução**:

- Vá em Usuários → Adicionar
- Mapear edapp_user_id para funcionario_id

#### 2. "Curso não mapeado"

**Causa**: O curso não está configurado no AirTrust
**Solução**:

- Vá em Cursos → Adicionar
- Mapear edapp_course_id para qualificacao_codigo

#### 3. "Já existe qualificação vigente"

**Causa**: Funcionário já tem essa qualificação válida
**Solução**: Normal! Sistema evita duplicatas automaticamente

### Verificação de Saúde

Execute regularmente:

1. **Ver Log Eventos** → Verificar se eventos estão chegando
2. **Verificar métricas**:
   - Taxa de sucesso: `Processados / Total` (ideal > 90%)
   - Erros recentes: verificar e corrigir mapeamentos
3. **Status do Webhook**: deve estar ✅ Ativo

## 📊 Relatórios e Auditoria

### Eventos Processados

```sql
-- Ver todas qualificações criadas pelo EdApp
SELECT
  f.nome,
  qh.qualificacao_codigo,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.observacoes
FROM qualificacoes_historico qh
JOIN funcionarios f ON qh.funcionario_id = f.id
WHERE qh.observacoes LIKE 'EdApp:%'
ORDER BY qh.created_at DESC;
```

### Log Completo

```sql
-- Ver todos eventos EdApp
SELECT
  tipo_evento,
  edapp_user_id,
  edapp_course_id,
  processado,
  erro_ultima,
  created_at
FROM integracoes_edapp_eventos
ORDER BY created_at DESC
LIMIT 100;
```

## 🚀 Fluxo de Trabalho Recomendado

### Setup Inicial (uma vez)

1. ✅ Configurar variáveis de ambiente (EDAPP_API_TOKEN, EDAPP_WEBHOOK_SECRET)
2. ✅ Criar webhook automaticamente (botão na interface)
3. ✅ Mapear todos usuários ativos
4. ✅ Mapear todos cursos relevantes

### Manutenção Contínua

1. 📊 Verificar Log de Eventos 1x por semana
2. 🔧 Mapear novos funcionários quando contratados
3. 📚 Mapear novos cursos quando adicionados no EdApp
4. ✅ Verificar taxa de sucesso mensal

### Quando Adicionar Novo Funcionário

1. Criar funcionário no AirTrust
2. **Integrações → EdApp → Usuários → Adicionar**
3. Mapear edapp_user_id

### Quando Adicionar Novo Curso

1. Criar tipo de qualificação no AirTrust (se necessário)
2. **Integrações → EdApp → Cursos → Adicionar**
3. Mapear edapp_course_id → qualificacao_codigo

## 🎯 Indicadores de Sucesso

✅ **Integração Funcionando Bem**:

- Webhook status: Ativo ✅
- Eventos processados > 90%
- Erros < 10%
- Qualificações aparecendo automaticamente
- Log de eventos mostra atividade recente

❌ **Problemas para Investigar**:

- Webhook status: Inativo
- Eventos processados < 50%
- Muitos erros de mapeamento
- Nenhum evento nos últimos 7 dias (se houver atividade no EdApp)

## 🔐 Segurança

- Webhook usa **secret** para validar origem
- Apenas eventos autenticados são processados
- Logs mantêm auditoria completa
- Soft delete em todos mapeamentos

## 📞 Suporte

Em caso de problemas:

1. Verificar Log de Eventos
2. Verificar se webhook está ativo
3. Validar mapeamentos (usuários e cursos)
4. Consultar este guia

---

**Data**: 23 de Janeiro de 2026
**Versão**: 1.0
**Status**: ✅ Integração Automática Ativa
