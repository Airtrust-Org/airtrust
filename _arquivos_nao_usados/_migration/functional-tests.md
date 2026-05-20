# ✅ CHECKLIST DE TESTES FUNCIONAIS - MÓDULO SIMULADORES

**Data**: 01/12/2025  
**Responsável**: **********\_\_\_**********  
**Versão**: Pós-consolidação arquitetural

---

## 📋 INSTRUÇÕES

1. Execute cada teste na ordem apresentada
2. Marque ✅ quando passar ou ❌ quando falhar
3. Documente bugs na seção ao final
4. Tire screenshots de erros
5. Não pule nenhum teste

---

## 🚀 PRÉ-REQUISITOS

- [ ] `npm run build` passou sem erros
- [ ] `npm run dev` rodando em localhost
- [ ] Usuário admin logado
- [ ] Dados de teste disponíveis no banco

---

## 1️⃣ DASHBOARD

**Rota**: `/simuladores/dashboard`

- [ ] Dashboard carrega em <3 segundos
- [ ] Cards de estatísticas mostram dados corretos
  - [ ] Total de simuladores
  - [ ] Total de sessões
  - [ ] Total de fichas
- [ ] Ações rápidas estão visíveis
  - [ ] Botão "Novo Simulador"
  - [ ] Botão "Agendar Sessão"
  - [ ] Botão "Ver Relatórios"
- [ ] Gráficos renderizam (se houver)
- [ ] Não há erros no console

**Observações**:

```
_____________________________________________
```

---

## 2️⃣ CADASTROS - SIMULADORES

### 2.1 Lista

**Rota**: `/simuladores/cadastros/simuladores`

- [ ] Lista carrega em <3 segundos
- [ ] Tabela mostra simuladores cadastrados
- [ ] Colunas visíveis:
  - [ ] Código ANAC
  - [ ] Modelo
  - [ ] Status
  - [ ] Ações
- [ ] Paginação funciona
- [ ] Filtros funcionam:
  - [ ] Por modelo
  - [ ] Por status
  - [ ] Por código
- [ ] Busca funciona
- [ ] Ordenação por colunas funciona
- [ ] Não há erros no console

### 2.2 Criar

**Rota**: `/simuladores/cadastros/simuladores/novo`

- [ ] Form abre corretamente
- [ ] Todos os campos estão visíveis
- [ ] Validações funcionam:
  - [ ] Código ANAC obrigatório
  - [ ] Modelo obrigatório
  - [ ] Fabricante obrigatório
- [ ] Botão "Salvar" funciona
- [ ] Simulador é criado no banco
- [ ] Redireciona para lista após criar
- [ ] Mensagem de sucesso é exibida
- [ ] Não há erros no console

### 2.3 Editar

**Rota**: `/simuladores/cadastros/simuladores/[id]/editar`

- [ ] Form carrega com dados preenchidos
- [ ] Campos são editáveis
- [ ] Botão "Salvar" funciona
- [ ] Alterações são persistidas
- [ ] Mensagem de sucesso é exibida
- [ ] Não há erros no console

### 2.4 Deletar

- [ ] Botão "Deletar" abre modal de confirmação
- [ ] Modal mostra mensagem clara
- [ ] Botão "Confirmar" deleta simulador
- [ ] Simulador some da lista
- [ ] Mensagem de sucesso é exibida
- [ ] Não há erros no console

**Observações**:

```
_____________________________________________
```

---

## 3️⃣ CADASTROS - MANOBRAS

**Rota**: `/simuladores/cadastros/manobras`

- [ ] Lista carrega
- [ ] Tabela mostra manobras cadastradas
- [ ] Botão "Nova Manobra" funciona
- [ ] Form de criação abre
- [ ] Manobra é criada corretamente
- [ ] Editar manobra funciona
- [ ] Deletar manobra funciona
- [ ] Não há erros no console

**Observações**:

```
_____________________________________________
```

---

## 4️⃣ CADASTROS - TEMPLATES

**Rota**: `/simuladores/cadastros/templates`

- [ ] Lista carrega
- [ ] Tabela mostra templates cadastrados
- [ ] Botão "Novo Template" funciona
- [ ] Form de criação abre
- [ ] Template é criado corretamente
- [ ] Associar manobras ao template funciona
- [ ] Editar template funciona
- [ ] Deletar template funciona
- [ ] Não há erros no console

**Observações**:

```
_____________________________________________
```

---

## 5️⃣ SESSÕES

### 5.1 Lista

**Rota**: `/simuladores/sessoes`

- [ ] Lista carrega
- [ ] Tabela mostra sessões agendadas
- [ ] Filtros funcionam:
  - [ ] Por data
  - [ ] Por simulador
  - [ ] Por status
- [ ] Paginação funciona
- [ ] Botão "Nova Sessão" funciona
- [ ] Não há erros no console

### 5.2 Agendar

**Rota**: `/simuladores/sessoes/nova`

- [ ] Form abre corretamente
- [ ] Combobox de simulador funciona
- [ ] Combobox de instrutor funciona
- [ ] Combobox de alunos funciona
- [ ] Data picker funciona
- [ ] Hora picker funciona
- [ ] Template é selecionável
- [ ] Botão "Agendar" funciona
- [ ] Sessão é criada no banco
- [ ] Fichas são criadas automaticamente
- [ ] Mensagem de sucesso é exibida
- [ ] Não há erros no console

### 5.3 Detalhes

**Rota**: `/simuladores/sessoes/[id]`

- [ ] Página carrega com dados da sessão
- [ ] Informações exibidas:
  - [ ] Simulador
  - [ ] Instrutor
  - [ ] Alunos
  - [ ] Data/hora
  - [ ] Status
- [ ] Lista de fichas está visível
- [ ] Botão "Editar" funciona
- [ ] Não há erros no console

### 5.4 Editar

**Rota**: `/simuladores/sessoes/[id]/editar`

- [ ] Form carrega com dados preenchidos
- [ ] Campos são editáveis
- [ ] Botão "Salvar" funciona
- [ ] Alterações são persistidas
- [ ] Não há erros no console

**Observações**:

```
_____________________________________________
```

---

## 6️⃣ FICHAS

### 6.1 Lista

**Rota**: `/simuladores/fichas`

- [ ] Lista carrega
- [ ] Tabela mostra fichas cadastradas
- [ ] Filtros funcionam:
  - [ ] Por sessão
  - [ ] Por aluno
  - [ ] Por status (pendente/concluída)
- [ ] Paginação funciona
- [ ] Click em ficha abre detalhes
- [ ] Não há erros no console

### 6.2 Visualizar

**Rota**: `/simuladores/fichas/[id]`

- [ ] Ficha carrega corretamente
- [ ] Informações exibidas:
  - [ ] Sessão
  - [ ] Aluno
  - [ ] Instrutor
  - [ ] Data
  - [ ] Manobras
  - [ ] Avaliações (se preenchida)
- [ ] Botão "Preencher" funciona (se pendente)
- [ ] Botão "Gerar PDF" funciona
- [ ] Não há erros no console

### 6.3 Preencher/Avaliar

**Rota**: `/simuladores/fichas/[id]/preencher`

- [ ] Form carrega corretamente
- [ ] Lista de manobras está visível
- [ ] Para cada manobra:
  - [ ] Campo de nota (1-5) funciona
  - [ ] Campo de observação funciona
- [ ] Campo de observação geral funciona
- [ ] Botão "Salvar Rascunho" funciona
- [ ] Botão "Finalizar Avaliação" funciona
- [ ] Status muda para "concluída"
- [ ] Mensagem de sucesso é exibida
- [ ] Não há erros no console

### 6.4 Gerar PDF ⭐ (CRÍTICO)

**Contexto**: Teste do PDF Generator consolidado

- [ ] Botão "Gerar PDF" está visível
- [ ] Click no botão gera PDF
- [ ] PDF abre em nova aba/download
- [ ] PDF contém todas as informações:
  - [ ] Cabeçalho com logo
  - [ ] Dados da sessão
  - [ ] Dados do aluno
  - [ ] Lista de manobras
  - [ ] Notas de cada manobra
  - [ ] Observações
  - [ ] Assinatura (se houver)
- [ ] Formatação está correta
- [ ] Não há textos cortados
- [ ] Não há overlap de elementos
- [ ] PDF é legível e profissional
- [ ] Tempo de geração <5 segundos
- [ ] Não há erros no console

**⚠️ SE PDF FALHAR**: Anotar erro exato na seção de bugs!

**Observações**:

```
_____________________________________________
```

---

## 7️⃣ RELATÓRIOS

**Rota**: `/simuladores/relatorios`

- [ ] Página carrega
- [ ] Filtros de período funcionam
- [ ] Relatórios exibidos:
  - [ ] Total de sessões no período
  - [ ] Total de fichas concluídas
  - [ ] Média de notas
  - [ ] Top manobras com dificuldade
- [ ] Gráficos renderizam (se houver)
- [ ] Exportar relatório funciona
- [ ] Não há erros no console

**Observações**:

```
_____________________________________________
```

---

## 8️⃣ IMPORTAÇÃO/EXPORTAÇÃO

### 8.1 Importar CSV

**Rota**: Botão em `/simuladores/cadastros/simuladores`

- [ ] Botão "Importar CSV" funciona
- [ ] Modal abre
- [ ] Upload de arquivo funciona
- [ ] Preview dos dados é exibido
- [ ] Validações funcionam:
  - [ ] Arquivo CSV válido
  - [ ] Colunas corretas
  - [ ] Dados válidos
- [ ] Botão "Confirmar Importação" funciona
- [ ] Simuladores são criados no banco
- [ ] Mensagem de sucesso é exibida
- [ ] Não há erros no console

### 8.2 Exportar CSV

- [ ] Botão "Exportar CSV" funciona
- [ ] Arquivo é baixado
- [ ] CSV contém todos os dados
- [ ] Formato está correto
- [ ] Não há erros no console

**Observações**:

```
_____________________________________________
```

---

## 🔧 TESTES DE PERFORMANCE

- [ ] Build time <3 segundos
- [ ] Página inicial carrega em <2 segundos
- [ ] Listas carregam em <3 segundos
- [ ] Forms abrem em <1 segundo
- [ ] PDF é gerado em <5 segundos
- [ ] Não há memory leaks (verificar DevTools)

**Métricas** (anotar):

- Build time: **\_\_\_** segundos
- Página inicial: **\_\_\_** segundos
- Lista: **\_\_\_** segundos
- PDF: **\_\_\_** segundos

---

## 🚨 BUGS ENCONTRADOS

### Bug #1

- **Onde**: **********************\_\_\_**********************
- **O que aconteceu**: **********************\_\_\_**********************
- **Como reproduzir**:
  1. ***
  2. ***
  3. ***
- **Erro no console**: **********************\_\_\_**********************
- **Screenshot**: (anexar)
- **Prioridade**: [ ] Crítica [ ] Alta [ ] Média [ ] Baixa
- **Status**: [ ] Pendente [ ] Em correção [ ] Resolvido

### Bug #2

- **Onde**: **********************\_\_\_**********************
- **O que aconteceu**: **********************\_\_\_**********************
- **Como reproduzir**:
  1. ***
  2. ***
  3. ***
- **Erro no console**: **********************\_\_\_**********************
- **Screenshot**: (anexar)
- **Prioridade**: [ ] Crítica [ ] Alta [ ] Média [ ] Baixa
- **Status**: [ ] Pendente [ ] Em correção [ ] Resolvido

### Bug #3

- **Onde**: **********************\_\_\_**********************
- **O que aconteceu**: **********************\_\_\_**********************
- **Como reproduzir**:
  1. ***
  2. ***
  3. ***
- **Erro no console**: **********************\_\_\_**********************
- **Screenshot**: (anexar)
- **Prioridade**: [ ] Crítica [ ] Alta [ ] Média [ ] Baixa
- **Status**: [ ] Pendente [ ] Em correção [ ] Resolvido

---

## ✅ CONCLUSÃO

**Total de testes**: **\_\_\_**  
**Testes passados**: **\_\_\_**  
**Testes falhados**: **\_\_\_**  
**Taxa de sucesso**: **\_\_\_**%

**Status Final**:

- [ ] ✅ Todos os testes passaram - APROVADO
- [ ] ⚠️ Alguns testes falharam - CORREÇÕES NECESSÁRIAS
- [ ] ❌ Muitos testes falharam - REFATORAÇÃO NECESSÁRIA

**Aprovado por**: **********\_\_\_**********  
**Data**: **********\_\_\_**********  
**Hora**: **********\_\_\_**********

**Observações finais**:

```
_______________________________________________
_______________________________________________
_______________________________________________
```

---

**Próximos passos após aprovação**:

1. Corrigir bugs encontrados (se houver)
2. Fazer commit das mudanças
3. Deploy para produção
4. Monitorar em produção por 24h
