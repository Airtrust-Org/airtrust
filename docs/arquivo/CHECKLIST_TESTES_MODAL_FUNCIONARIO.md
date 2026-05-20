# ✅ CHECKLIST COMPLETO - TESTES MODAL FUNCIONÁRIO

**Data**: 27/11/2025  
**Status Worker**: ✅ Operacional em localhost:8787  
**Status Frontend**: ✅ Operacional em localhost:3000  
**APIs Validadas**:

- ✅ `/api/funcoes` - 5 registros
- ✅ `/api/setores` - 7 registros
- ✅ `/api/modelos-aeronave` - 2 registros (AW139, S76)

---

## 🎯 FASE 0: PREPARAÇÃO

### Ambiente

- [x] Worker rodando em localhost:8787
- [x] Frontend rodando em localhost:3000
- [x] Token de autenticação obtido via `/api/auth/login`
- [x] Endpoints de cadastros respondendo (funcoes, setores, modelos)

### Acesso

- [ ] Login realizado com `admin@airtrust.com` / `admin123`
- [ ] Token armazenado em `localStorage.airtrust_token`
- [ ] Página `/funcionarios` acessível

---

## 📋 FASE 1: RENDERIZAÇÃO INICIAL (Modo Criar)

### Modal Abre Corretamente

- [ ] Botão "Novo Funcionário" visível na página
- [ ] Clique no botão abre o modal
- [ ] Modal exibe título "Novo Funcionário"
- [ ] Modal possui backdrop (fundo escurecido)
- [ ] Botão "X" ou "Fechar" está visível

### Campos Visíveis (Ordem e Layout)

- [ ] **Nome** - input text, obrigatório (\*)
- [ ] **CPF** - input text com máscara, obrigatório (\*)
- [ ] **Matrícula** - input number, placeholder "00353"
- [ ] **Função** - select dropdown, obrigatório (\*), com ícone ✓
- [ ] **Setor** - select dropdown, obrigatório (\*), com ícone ✓
- [ ] **Modelo de Aeronave** - select dropdown, com ícone ✓
- [ ] **Base** - input text, uppercase automático
- [ ] **Data de Admissão** - input date
- [ ] **Situação** - select (ATIVO/INATIVO/AFASTADO)
- [ ] **Estado** - input text, max 2 chars, uppercase
- [ ] **Telefone** - input text com máscara
- [ ] **Endereço** - input text
- [ ] **Cidade** - input text
- [ ] **CEP** - input text com máscara

### Selects Populados (Dados da API)

- [ ] Select **Função** carrega dados de `/api/funcoes`
- [ ] Select **Função** mostra "✓ Selecione a função" como placeholder
- [ ] Select **Função** exibe apenas registros ativos (deleted_at = null)
- [ ] Select **Função** está ordenado alfabeticamente
- [ ] Select **Setor** carrega dados de `/api/setores`
- [ ] Select **Setor** mostra "✓ Selecione o setor" como placeholder
- [ ] Select **Setor** exibe apenas registros ativos
- [ ] Select **Setor** está ordenado alfabeticamente
- [ ] Select **Modelo** carrega dados de `/api/modelos-aeronave`
- [ ] Select **Modelo** mostra "✓ Selecione o modelo" como placeholder
- [ ] Select **Modelo** exibe formato "CODIGO - NOME" (ex: "AW139 - AW139")
- [ ] Select **Modelo** exibe apenas registros ativos
- [ ] **CRÍTICO**: Nenhum select mostra "Carregando..." indefinidamente

### Estados de Loading

- [ ] Se API demora, selects mostram "⚠️ Carregando funções..." temporariamente
- [ ] Loading desaparece após dados carregarem
- [ ] Se erro na API, exibe mensagem de erro (não trava em loading)

### Validações Visuais Iniciais

- [ ] Campo **Matrícula** aceita apenas números (0-9)
- [ ] Campo **Matrícula** limita a 5 caracteres
- [ ] Campo **Base** converte automaticamente para UPPERCASE
- [ ] Campo **Estado** converte automaticamente para UPPERCASE
- [ ] Campo **Estado** limita a 2 caracteres

---

## ✅ FASE 2: VALIDAÇÕES DE CAMPOS

### Matrícula (5 dígitos com auto-padding)

- [ ] Digite "1" → campo mostra "1"
- [ ] Digite "12" → campo mostra "12"
- [ ] Digite "123" → campo mostra "123"
- [ ] Saia do campo (onBlur) com "123" → campo muda para "00123" ✅
- [ ] Digite "353" → onBlur → campo muda para "00353" ✅
- [ ] Digite "12345" → campo aceita (máximo)
- [ ] Digite "123456" → campo bloqueia 6º dígito (não aceita)
- [ ] Digite letras → não aceita (apenas números)
- [ ] **Feedback visual**: ícone ⏳ amarelo quando < 5 dígitos
- [ ] **Feedback visual**: ícone ✓ verde quando = 5 dígitos

### CPF (validação algorítmica)

- [ ] Digite "111.111.111-11" → deve mostrar erro (CPF inválido)
- [ ] Digite "123.456.789-00" → deve mostrar erro (dígitos verificadores incorretos)
- [ ] Digite CPF válido ex: "123.456.789-09" → aceita ✅
- [ ] Máscara formatada automaticamente: "12345678909" vira "123.456.789-09"
- [ ] Campo obrigatório: não permite salvar vazio

### Nome (obrigatório)

- [ ] Campo vazio → botão Salvar bloqueado ou mostra erro
- [ ] Digite nome → validação passa
- [ ] Aceita nomes com acentos (João, María)
- [ ] Aceita nomes compostos (José da Silva)

### Função (select obrigatório)

- [ ] Campo vazio (placeholder) → não permite salvar
- [ ] Selecione uma opção → validação passa
- [ ] Valor salvo é o **texto** da função (ex: "Comandante")
- [ ] **NÃO** salva o ID numérico

### Setor (select obrigatório)

- [ ] Campo vazio (placeholder) → não permite salvar
- [ ] Selecione uma opção → validação passa
- [ ] Valor salvo é o **texto** do setor (ex: "Operações")
- [ ] **NÃO** salva o ID numérico

### Modelo de Aeronave (select opcional)

- [ ] Campo pode ficar vazio (não obrigatório)
- [ ] Selecione "AW139 - AW139" → valor salvo é **5** (ID numérico)
- [ ] Selecione "S76 - S76" → valor salvo é **6** (ID numérico)
- [ ] **CRÍTICO**: Salva `modelo_aeronave_id: 5` (Number), **NÃO** `"AW139"` (String)

### Base (uppercase automático)

- [ ] Digite "gru" → campo converte para "GRU" em tempo real
- [ ] Digite "sp" → vira "SP"
- [ ] Aceita máximo 10 caracteres
- [ ] Pode ficar vazio (não obrigatório)

### Estado (uppercase, 2 chars)

- [ ] Digite "sp" → converte para "SP"
- [ ] Digite "rj" → converte para "RJ"
- [ ] Tenta digitar 3º caractere → bloqueia
- [ ] Aceita vazio

---

## 🎭 FASE 3: MÁSCARAS E FORMATAÇÃO

### CPF Mask

- [ ] Digite apenas números "12345678909"
- [ ] Máscara formata automaticamente: "123.456.789-09"
- [ ] Validação algorítmica rejeita dígitos verificadores incorretos

### Telefone Mask (se houver)

- [ ] Digite "11987654321"
- [ ] Formata como "(11) 98765-4321"

### CEP Mask (se houver)

- [ ] Digite "01310100"
- [ ] Formata como "01310-100"

### Data de Admissão

- [ ] Input type="date" funciona corretamente
- [ ] Selecione data no calendário → valor salvo no formato YYYY-MM-DD
- [ ] Data exibida corretamente no campo

---

## 💾 FASE 4: CRIAÇÃO DE FUNCIONÁRIO (Happy Path)

### Preencher Formulário Completo

- [ ] Nome: "João Silva Teste"
- [ ] CPF: "123.456.789-09" (válido)
- [ ] Matrícula: "353" → auto-complete para "00353" ✅
- [ ] Função: "Comandante" (selecionar no dropdown)
- [ ] Setor: "Operações" (selecionar no dropdown)
- [ ] Modelo: "AW139 - AW139" (selecionar no dropdown)
- [ ] Base: "gru" → auto-uppercase "GRU"
- [ ] Data Admissão: "2024-01-15"
- [ ] Situação: "ATIVO"
- [ ] Estado: "sp" → auto-uppercase "SP"
- [ ] Telefone: "(11) 98765-4321"
- [ ] Endereço: "Rua Teste, 123"
- [ ] Cidade: "São Paulo"
- [ ] CEP: "01310-100"

### Salvar e Validar

- [ ] Clique no botão "Salvar"
- [ ] **Verificar console.log**: `console.log('Enviando para backend:', dadosParaBackend)`
- [ ] **Validar dados no console**:
  ```json
  {
    "nome": "João Silva Teste",
    "cpf": "12345678909",
    "matricula": "00353",          // ✅ String com 5 dígitos
    "funcao": "Comandante",         // ✅ String (nome)
    "setor": "Operações",           // ✅ String (nome)
    "modelo_aeronave_id": 5,        // ✅ Number (ID)
    "base": "GRU",                  // ✅ Uppercase
    "data_admissao": "2024-01-15",
    "situacao": "ATIVO",
    "estado": "SP",                 // ✅ Uppercase
    ...
  }
  ```
- [ ] POST `/api/funcionarios` retorna `{ success: true, data: { id: ... } }`
- [ ] Modal fecha automaticamente após salvar
- [ ] Tabela de funcionários atualiza (novo registro aparece)
- [ ] Mensagem de sucesso exibida (toast/alert)

### Validar no Backend

- [ ] Executar query D1: `SELECT * FROM funcionarios WHERE matricula = '00353';`
- [ ] Verificar `modelo_aeronave_id = '5'` (TEXT no D1, mas valor numérico)
- [ ] Verificar `funcao = 'Comandante'` (texto, não ID)
- [ ] Verificar `setor = 'Operações'` (texto, não ID)
- [ ] Verificar `base = 'GRU'` (uppercase)
- [ ] Verificar `created_at` preenchido
- [ ] Verificar `deleted_at = NULL`

---

## ✏️ FASE 5: EDIÇÃO DE FUNCIONÁRIO

### Abrir Modal de Edição

- [ ] Na tabela de funcionários, clique no ícone de editar (✏️) de um registro existente
- [ ] Modal abre com título "Editar Funcionário"
- [ ] **CRÍTICO**: Todos os campos estão pré-preenchidos com dados corretos

### Validar Pré-Preenchimento (Exemplo: João Silva Teste)

- [ ] Nome: "João Silva Teste" (texto completo)
- [ ] CPF: "123.456.789-09" (com máscara)
- [ ] Matrícula: "00353" (5 dígitos com zeros à esquerda)
- [ ] Função: "Comandante" selecionado no dropdown
- [ ] Setor: "Operações" selecionado no dropdown
- [ ] Modelo: "AW139 - AW139" selecionado (ID 5 no backend)
- [ ] Base: "GRU" (uppercase)
- [ ] Data Admissão: "2024-01-15" (no campo date)
- [ ] Situação: "ATIVO" selecionado
- [ ] Estado: "SP" (uppercase)
- [ ] Telefone: "(11) 98765-4321" (com máscara)
- [ ] Endereço: "Rua Teste, 123"
- [ ] Cidade: "São Paulo"
- [ ] CEP: "01310-100" (com máscara)

### Editar e Salvar

- [ ] Altere Matrícula: "00353" → "00999"
- [ ] Altere Base: "GRU" → "cgb" (deve virar "CGB")
- [ ] Altere Modelo: "AW139" → "S76" (ID 6)
- [ ] Clique em "Salvar"
- [ ] **Verificar console.log**: dados atualizados corretos
- [ ] PUT `/api/funcionarios/:id` retorna `{ success: true }`
- [ ] Modal fecha
- [ ] Tabela atualiza (alterações visíveis)

### Validar no Backend

- [ ] Query D1: dados do funcionário foram atualizados
- [ ] `matricula = '00999'`
- [ ] `base = 'CGB'`
- [ ] `modelo_aeronave_id = '6'`
- [ ] `updated_at` foi atualizado

---

## 🚫 FASE 6: EDGE CASES E CENÁRIOS NEGATIVOS

### Validações de Integridade

- [ ] Tente criar funcionário com CPF duplicado → deve bloquear ou alertar
- [ ] Tente criar funcionário com matrícula duplicada → deve bloquear ou alertar
- [ ] Tente salvar sem Nome → validação bloqueia
- [ ] Tente salvar sem CPF → validação bloqueia
- [ ] Tente salvar sem Função → validação bloqueia
- [ ] Tente salvar sem Setor → validação bloqueia

### Casos Extremos

- [ ] Matrícula "00000" → aceita (se permitido)
- [ ] Matrícula "99999" → aceita
- [ ] Nome com 200 caracteres → verifica se aceita/trunca
- [ ] Base com caracteres especiais "GRU-1" → verifica comportamento
- [ ] Modelo vazio (null) → deve aceitar (campo opcional)

### Erros de API

- [ ] Simule erro 500 no backend → modal exibe mensagem de erro
- [ ] Simule timeout → modal não trava (exibe erro ou loading)
- [ ] Simule perda de token → redireciona para login ou exibe erro 401

---

## 🎨 FASE 7: UX E ACESSIBILIDADE

### Interações de Teclado

- [ ] Tab navega entre campos sequencialmente
- [ ] Enter em input text não submete o form (apenas botão Salvar)
- [ ] Esc fecha o modal
- [ ] Setas ↑↓ navegam nos selects

### Responsividade (Opcional)

- [ ] Modal responsivo em telas menores
- [ ] Campos empilham verticalmente se necessário

### Visual Feedback

- [ ] Hover nos botões muda cor
- [ ] Focus nos campos mostra borda destacada
- [ ] Campos inválidos mostram borda vermelha ou mensagem de erro
- [ ] Ícone ⏳ amarelo em matrícula incompleta
- [ ] Ícone ✓ verde em matrícula completa

### Mensagens de Erro

- [ ] Erros de validação claros e específicos
- [ ] Mensagens em português
- [ ] Posicionadas próximas aos campos relevantes

---

## 🔗 FASE 8: INTEGRAÇÃO COM QUALIFICAÇÕES (se aplicável)

### Seção de Certificações (Modo Edição)

- [ ] Modal de edição exibe seção "Certificações" ou "Qualificações"
- [ ] Lista certificações do funcionário (CMA, ASO, habilitações)
- [ ] Permite adicionar/editar/remover certificações
- [ ] Datas de vencimento exibidas corretamente

---

## ⚡ FASE 9: PERFORMANCE

### Tempos de Resposta

- [ ] Modal abre em < 500ms
- [ ] Selects carregam dados em < 1s
- [ ] Salvar funcionário responde em < 2s
- [ ] Editar funcionário carrega dados em < 1s

### Console do Browser

- [ ] Sem erros no console (F12)
- [ ] Sem warnings excessivos
- [ ] `console.log` de debug aparece corretamente

---

## 🧹 FASE 10: LIMPEZA E FECHAMENTO

### Fechar Modal

- [ ] Clique no "X" fecha o modal
- [ ] Clique fora do modal (backdrop) fecha o modal
- [ ] Esc fecha o modal
- [ ] Campos são resetados ao fechar (não ficam com dados antigos)

### Estado Persistente

- [ ] Token permanece em localStorage após refresh
- [ ] Tabela de funcionários mantém filtros/ordenação após criar/editar

---

## 📊 RESUMO FINAL

### Checklist Geral

- [ ] **FASE 0**: Preparação - Ambiente OK
- [ ] **FASE 1**: Renderização - Modal abre com campos corretos
- [ ] **FASE 2**: Validações - Matrícula, CPF, obrigatórios funcionam
- [ ] **FASE 3**: Máscaras - Formatação automática OK
- [ ] **FASE 4**: Criar - Funcionário criado com dados corretos
- [ ] **FASE 5**: Editar - Dados pré-preenchidos e edição funciona
- [ ] **FASE 6**: Edge Cases - Validações de integridade OK
- [ ] **FASE 7**: UX - Acessibilidade e feedback visual OK
- [ ] **FASE 8**: Integração - Qualificações (se aplicável)
- [ ] **FASE 9**: Performance - Tempos aceitáveis
- [ ] **FASE 10**: Limpeza - Modal fecha e reseta corretamente

### Bugs Encontrados

> Liste aqui qualquer bug encontrado durante os testes

### Melhorias Sugeridas

> Liste aqui sugestões de melhoria de UX ou funcionalidade

---

## 🎯 CRITÉRIOS DE ACEITAÇÃO

✅ **APROVADO SE**:

- Todos os campos obrigatórios validam corretamente
- Matrícula auto-completa para 5 dígitos (00353)
- Modelo salva ID numérico (5), não string ("AW139")
- Função e Setor salvam texto, não ID
- Base e Estado convertem para UPPERCASE
- Modal de edição pré-preenche todos os campos corretamente
- Selects carregam dados reais da API (não ficam em "Carregando...")
- Console.log mostra dados corretos antes de enviar ao backend
- Criação e edição salvam com sucesso no D1

❌ **REPROVADO SE**:

- Modelo salva string ao invés de ID
- Matrícula não completa com zeros à esquerda
- Selects ficam travados em "Carregando..."
- Modal de edição não pré-preenche campos
- Validações não bloqueiam campos obrigatórios vazios
- Erros no console do browser
- Dados não persistem no D1

---

**Última atualização**: 27/11/2025 - Modal corrigido nos commits b4b52c5 e c5f83fb
