# 🧪 TESTE FINAL - SISTEMA DE CHECKS COM EXAMINADORES

**Data:** 14/01/2026  
**Worker Version ID:** e7583255-0543-4f74-b3ea-557d05233c7d  
**Git Commit:** c35ba6e3  
**Status:** ✅ PRONTO PARA TESTE

---

## ⚡ EXECUÇÃO RÁPIDA

### Teste 1: Verificar Endpoints da API

```bash
# 1. Tipos de check disponíveis
curl -s "https://airtrust-api-production.airtrust.workers.dev/api/simuladores/tipos-check" | jq '.data | length'
# Esperado: 4

# 2. Examinadores cadastrados
curl -s "https://airtrust-api-production.airtrust.workers.dev/api/funcionadores?examinador=true" | jq '.data | length'
# Esperado: 2 (Bernardo Freire Antunes, Wilson Maciel Martins Nery)
```

### Teste 2: Fluxo Completo via Interface

#### Passo 1: Criar Sessão de Check

1. Acesse: https://airtrust.online/simuladores/sessoes/nova
2. Preencha:
   - **Simulador:** A139-Simulator-01
   - **Data:** 15/01/2026
   - **Hora Início:** 08:00
   - **Hora Fim:** 10:00
   - **Participante PF:** [qualquer funcionário ativo]
   - **Examinador:** Bernardo Freire Antunes
3. Marque os checks:
   - ☑ FAP05.2-139 - FAP 05.2 - Habilitação de Tipo - AW139
   - ☑ FAP06-139 - FAP 06 - Habilitação CHT - AW139
4. Clique em **"Salvar Sessão"**

**✅ Validação:**

- Toast de sucesso: "Sessão criada com sucesso!"
- Redirecionamento para lista de sessões
- Badge "Check" aparece na linha da sessão

#### Passo 2: Executar Sessão e Avaliar Manobras

1. Clique na sessão criada
2. Verifique:
   - ✅ Badge "Sessão de Check" no cabeçalho
   - ✅ Nome do examinador: "Bernardo Freire Antunes"
3. Avalie manobras (atribua notas de 0-10)
4. Clique em **"Salvar Ficha"**

**✅ Validação:**

- Toast de sucesso: "Ficha salva com sucesso!"
- Notas aparecem coloridas (verde: 8-10, amarelo: 6-7, vermelho: <6)

#### Passo 3: Tripulante Assina

1. Clique em **"Assinar"**
2. Desenhe assinatura no campo
3. Clique em **"Confirmar Assinatura"**

**✅ Validação:**

- Toast de sucesso: "Assinatura registrada com sucesso!"
- Botão "Assinar" desaparece
- Botão "Assinar como Instrutor" aparece

#### Passo 4: Instrutor Avalia Checks e Assina

1. Clique em **"Assinar como Instrutor"**
2. **CRÍTICO:** Verifique que aparece a seção **"Avaliação de Checks"**
3. Para cada check, marque:
   - **FAP05.2-139:**
     - ( ) ✓ Aprovado (X) ✗ Reprovado
     - Observações: "Precisa melhorar procedimentos de emergência"
   - **FAP06-139:**
     - (X) ✓ Aprovado ( ) ✗ Reprovado
     - Observações: "Excelente desempenho IFR"
4. Desenhe assinatura
5. Clique em **"Confirmar Assinatura"**

**✅ Validação Esperada:**

- ✅ Toast: "Resultados dos checks salvos com sucesso!"
- ✅ Toast: "Assinatura registrada com sucesso!"
- ✅ Status da ficha: "CONCLUÍDA"
- ✅ Botões de assinatura desaparecem

#### Passo 5: Verificar Qualificação Gerada

1. Acesse: https://airtrust.online/funcionarios
2. Busque o funcionário que fez a sessão (Participante PF)
3. Clique no nome → aba **"Qualificações"**
4. Verifique nova qualificação:
   - **Tipo:** FAP06-139
   - **Data Realização:** 15/01/2026
   - **Data Vencimento:** 15/01/2027 (12 meses)
   - **Status:** ATIVA
   - **Sessão:** [ID da sessão]

**✅ Validação:**

- ✅ **APENAS 1 qualificação** gerada (FAP06-139 - aprovado)
- ✅ **NENHUMA qualificação** para FAP05.2-139 (reprovado)

---

## 📋 CHECKLIST DE VALIDAÇÃO COMPLETA

### Backend

- [ ] Endpoint `/tipos-check` retorna 4 checks
- [ ] Endpoint `/funcionarios?examinador=true` retorna 2 examinadores
- [ ] Endpoint `/sessoes/:id/checks` retorna checks da sessão
- [ ] Endpoint `/sessoes/:id/checks/resultados` salva resultados

### Frontend - Nova Sessão

- [ ] Select de examinador carrega apenas `is_examinador=1`
- [ ] Multi-select de checks aparece ao selecionar examinador
- [ ] Payload inclui `examinador_id` e `checks[]`
- [ ] Toast de sucesso ao criar sessão

### Frontend - Ficha Detalhada

- [ ] Badge "Sessão de Check" aparece no cabeçalho
- [ ] Nome do examinador é exibido
- [ ] Manobras podem ser avaliadas normalmente
- [ ] Botões de assinatura aparecem corretamente

### Frontend - Modal de Assinatura do Instrutor

- [ ] Seção "Avaliação de Checks" aparece
- [ ] Cada check tem radio buttons Aprovado/Reprovado
- [ ] Campo de observações por check funciona
- [ ] Validação impede assinatura sem avaliar todos os checks
- [ ] Toast de erro se tentar assinar sem avaliar
- [ ] Toast de sucesso ao salvar resultados
- [ ] Toast de sucesso ao registrar assinatura

### Backend - Geração de Qualificações

- [ ] Qualificação gerada automaticamente para checks aprovados
- [ ] `qualificacao_tipo_id` correto (do check)
- [ ] `data_vencimento` = `data_conclusao` + 12 meses
- [ ] `status` = 'CONCLUIDA'
- [ ] `sessao_id` vinculado corretamente
- [ ] Nenhuma qualificação gerada para checks reprovados
- [ ] Auditoria registrada em `audit_log`

---

## 🚨 CENÁRIOS DE ERRO A TESTAR

### Erro 1: Assinar Sem Avaliar Checks

**Ação:** Instrutor clica "Confirmar Assinatura" sem marcar aprovado/reprovado

**Resultado Esperado:**

- ❌ Toast de erro: "Por favor, avalie todos os checks antes de assinar"
- ❌ Modal permanece aberto
- ❌ Assinatura NÃO registrada

### Erro 2: Criar Sessão com Examinador Mas Sem Checks

**Ação:** Selecionar examinador mas não marcar nenhum check

**Resultado Esperado:**

- ⚠️ Permitido criar sessão
- ⚠️ `is_check = 1` mas sem checks vinculados
- ⚠️ Modal de assinatura do instrutor NÃO exibe seção de checks (pois lista vazia)

### Erro 3: Tentar Reprovar Todos os Checks

**Ação:** Instrutor marca todos os checks como REPROVADO

**Resultado Esperado:**

- ✅ Resultados salvos corretamente
- ✅ NENHUMA qualificação gerada
- ✅ Assinatura registrada normalmente

---

## 📊 QUERIES SQL PARA VALIDAÇÃO MANUAL

### Verificar Sessão de Check Criada

```sql
SELECT
  sa.id,
  sa.is_check,
  sa.examinador_id,
  f.nome as examinador_nome,
  sa.data,
  sa.status
FROM simulador_agendamentos sa
LEFT JOIN funcionarios f ON sa.examinador_id = f.id
WHERE sa.is_check = 1
  AND sa.deleted_at IS NULL
ORDER BY sa.id DESC
LIMIT 5;
```

### Verificar Checks Vinculados à Sessão

```sql
SELECT
  sc.id as sessao_check_id,
  sc.sessao_id,
  qt.codigo,
  qt.nome,
  sc.qualificacao_tipo_id
FROM sessoes_checks sc
INNER JOIN qualificacoes_tipos qt ON sc.qualificacao_tipo_id = qt.id
WHERE sc.sessao_id = [ID_DA_SESSAO]
  AND sc.deleted_at IS NULL;
```

### Verificar Resultados dos Checks

```sql
SELECT
  scr.id,
  scr.sessao_check_id,
  scr.aprovado,
  scr.observacoes,
  scr.created_at
FROM sessoes_checks_resultados scr
WHERE scr.sessao_check_id IN (
  SELECT id FROM sessoes_checks WHERE sessao_id = [ID_DA_SESSAO]
)
  AND scr.deleted_at IS NULL;
```

### Verificar Qualificações Geradas

```sql
SELECT
  qh.id,
  qh.funcionario_cpf,
  qt.codigo,
  qt.nome,
  qh.data_conclusao,
  qh.data_vencimento,
  qh.status,
  qh.sessao_id,
  qh.observacoes
FROM qualificacoes_historico qh
INNER JOIN qualificacoes_tipos qt ON qh.qualificacao_tipo_id = qt.id
WHERE qh.sessao_id = [ID_DA_SESSAO]
  AND qh.deleted_at IS NULL;
```

---

## 🎯 CRITÉRIOS DE SUCESSO

### ✅ APROVADO se:

1. Modal de assinatura do instrutor **exibe seção de checks** com:
   - Radio buttons Aprovado/Reprovado
   - Campo de observações
   - Validação obrigatória
2. Checks aprovados **geram qualificações automaticamente** com:
   - `qualificacao_tipo_id` correto
   - `data_vencimento` calculada corretamente
   - `status` = 'CONCLUIDA'
3. Checks reprovados **NÃO geram qualificações**
4. Validação **impede assinatura** sem avaliar todos os checks
5. Toasts de sucesso/erro aparecem corretamente

### ❌ REPROVADO se:

1. Modal de assinatura do instrutor **não exibe** seção de checks
2. Checks aprovados **não geram** qualificações
3. Sistema **permite assinar** sem avaliar todos os checks
4. Qualificações geradas com dados **incorretos** (data, tipo, etc)
5. Checks reprovados **geram qualificações** (erro crítico)

---

## 🚀 PRÓXIMOS PASSOS APÓS VALIDAÇÃO

### Se APROVADO:

1. ✅ Marcar sistema como **PRODUÇÃO**
2. ✅ Comunicar equipe sobre nova funcionalidade
3. ✅ Criar treinamento para examinadores
4. ✅ Monitorar primeiras sessões de check
5. ✅ Coletar feedback dos usuários

### Se REPROVADO:

1. ❌ Documentar bugs encontrados
2. ❌ Corrigir issues críticos
3. ❌ Re-testar fluxo completo
4. ❌ Nova rodada de validação

---

**⏱️ Tempo estimado de teste:** 15-20 minutos  
**👥 Responsável pelo teste:** Administrador do sistema  
**📅 Prazo:** Imediato (sistema já deployado)

---

## 📞 SUPORTE

Em caso de erros:

1. Verificar console do navegador (F12)
2. Verificar logs do Worker (Cloudflare Dashboard)
3. Verificar queries SQL acima
4. Consultar documentação: [VALIDACAO-SISTEMA-CHECKS-14JAN2026.md](./VALIDACAO-SISTEMA-CHECKS-14JAN2026.md)

---

✅ **SISTEMA PRONTO PARA TESTE DE ACEITAÇÃO**
