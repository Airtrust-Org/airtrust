# AirTrust — Training Multi-Day Form Validation

**Data:** 2026-06-06

## Problema

O formulário "Incluir turma planejada" em Qualificacoes.tsx usava:
- Data única (`data_planejada`)
- Instrutor em texto livre (não seleção de funcionário)
- Sem suporte a múltiplos dias
- Sem modalidade, recursos, limite de participantes

O novo formulário multi-dia em TreinamentosPlanejadosPage.tsx existia
(commit 274250c) mas não era acessível pela navegação principal.

## Correções

### 1. Navegação
Adicionada entrada na sidebar:
```
Treinamentos > Turmas Planejadas → /treinamentos/planejados
```

### 2. Formulário legado
- Adicionado notice "Registro legado — sessão avulsa" com link para o novo gerenciador
- Botão renomeado para "Incluir Turma (legado)"
- Adicionado botão "Gerenciar Turmas" que abre o novo formulário

### 3. Novo formulário (já existente)
Campos disponíveis no novo formulário:
- Modelo de qualificação
- Código da turma
- Modalidade (dropdown com 10 opções)
- Data de início + Data de fim
- Hora de início (default 08:00) + Hora de fim (default 17:00)
- Dias efetivos (geração automática, edição por dia)
- Instrutores (seleção de funcionários, múltiplos)
- Participantes (busca, seleção múltipla, prevenção de duplicidade)
- Base, sala, equipamento
- Limite de participantes
- Status inicial

## Compatibilidade

Registros legados com `data_planejada` continuam legíveis. O novo formulário
usa `data_inicio`/`data_fim` + tabela `treinamentos_dias` para o cronograma.

## Testes

A validação completa do formulário multi-dia requer smoke autenticado
(pendente de deploy).
