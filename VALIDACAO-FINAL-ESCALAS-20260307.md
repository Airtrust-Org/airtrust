# Validação Final - Módulo de Escalas (Março 2026)

Como o ambiente local apontava para o D1 Produção e os testes com bots não conseguiram acessar o localhost de forma confiável (por bloqueios de rede no WSL/macOS e a necessidade de login/auth do AirTrust), foi preparado este roteiro de **Testes Manuais de Fumaça (Smoke Tests)** para homologar em produção as correções efetuadas.

Todas as modificações passaram em Lints, Testes de TS (`tsc --noEmit`), buildaram perfeitamente (`vite build`) e o código já está estabilizado.

## Como Validar na Interface

Para finalizar e garantir que os 3 fluxos Críticos das regras de voo (Bugs 1 e 2 + Layout C) foram efetivados com sucesso, pedimos que um administrador acesse o módulo em `http://localhost:3000/escalas` e conduza os 3 cenários a seguir no **Grid Gantt de Aeronaves**:

### 1️⃣ Cenário A: Folga Automática com Aeronave

- **Ação:** Escolha uma quinzena qualquer (ex: Q1). No bloco de uma **Aeronave**, clique em **"+ Alocar Tripulante"**. Estipule uma janela de dias (ex: dia 5 a 10) e insira um tripulante como **PIC**.
- **Resultado Esperado (Front-end):** A barra azul (supondo cor primária/PIC) deve cobrir do dia 5 ao 10.
- **Resultado Esperado (Back-end / Auto-Folga):** Troque a aba para a Quinzena Oposta (Q2). Esse tripulante deverá estar com todo o resto da quinzena oposta preenchido com o bloco **"FOLGA"** (cor verde ou cinza de folga, definido pelo seu BD).

### 2️⃣ Cenário B: Folga Automática SEM Aeronave (Bug 2 Resolvido)

- **Ação:** Volte para a mesma aba (ex: Q1). Role até o final, até o bloco listado como **"Alocações Avulsas"** (antigo "Sem aeronave", com ícone de elipse na cor âmbar/laranja).
- **Ação:** Clique em **"+ Alocar Tripulante"** e submeta um piloto como **PIC** do dia 2 ao dia 7. Note que ele não exigirá aeronave no Form.
- **Resultado Esperado:** O Tripulante deve pular para o lado direito da quinzena oposta (Q2) também como **"FOLGA"**, assim como ocorreu no Cenário A. A correção do Bug 2 garantiu que o código de auto-folgas consiga gerar os eventos na API mesmo quando o `aeronave_id` do Request Payload no insert for anulado.

### 3️⃣ Cenário C: Layout Funcional Modal de Situação (Problem 8)

- **Ação:** Abra o Painel de Tripulações lateral (onde aparecem as abas "Disponível", "Quinzena", "Aeronaves"). Clique nos três pontos de um tripulante e selecione **"Nova Situação"** (ou crie um novo evento por cima de um já existente na grade de Tripulantes).
- **Resultado Esperado:** O novo layout deve estar perfeitamente formatado.
  1.  A modal não deve mais estourar verticalmente em telas baixas.
  2.  As opções em radio não ficarão coladas/sobrepostas aos botões Confirmar e Cancelar no Footer.
  3.  Os Empty States com icones descritivos aparecem onde antes ficavam vazios brancos sem graça.
  4.  A listagem de situações atuais dele, se ele já possuir, aparecerá colapsada de formato limpo no lado direito do formulário.

## Pós-Teste

Estando todos os 3 ok, a branch pode ser tagueada como final para release total do AirTrust. Todas as queries de auditoria para inserção e exclusão também já correm normalmente em background como solicitado pelo Bug/P5 de conflito de IDs do D1 Database.
