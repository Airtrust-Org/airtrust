# AIRTRUST v0.4-G5 — Escala Diária Aircraft-First UX

## 1) Problema reportado pelo usuário
A tela de Escala Diária ainda estava orientada por lógica genérica de atribuição, sem iniciar por aeronave ativa e sem restrição operacional clara de elegibilidade por quinzena/disponibilidade. Também faltava sinalização FRMS útil antes de salvar/publicar e teste funcional controlado de ponta a ponta.

## 2) Referência do PDF
Referência operacional: `ESCALA DIÁRIA SK76 03.02.2026.pdf`.

## 3) Decisão de fluxo: aircraft-first
A EDV passa a iniciar por aeronave:
- carregamento/listagem de aeronaves ativas;
- seleção de aeronave antes de tripulação;
- designação por matrícula/prefixo e não por voo/trecho.

## 4) Campos removidos
Removido do formulário EDV:
- `Localidade de operação`.

## 5) Campos mantidos
Mantidos no formulário operacional:
- Aeronave;
- Status da aeronave;
- Comandante;
- Qualificação comandante;
- Assento comandante;
- Copiloto;
- Qualificação copiloto;
- Assento copiloto;
- Tripulante extra (opcional);
- Base;
- Apresentação;
- Início;
- Término;
- Observações.

## 6) Regra de aeronaves ativas
Fonte usada: `GET /api/aeronaves`.
Regra de UI: listar aeronaves consideradas ativas para a operação diária e mostrar status ANV resumido em:
- `D` (Disponível);
- `I` (Indisponível);
- `M` (Manutenção).

## 7) Regra de tripulantes elegíveis
Fonte usada: `GET /api/escalas/tripulantes-operacionais` com `incluir_bloqueados=true`, `data_inicio`, `data_fim`, `quinzena`.
Regra de UI:
- aptos (`pode_ser_alocado=true`) como opções normais;
- indisponíveis/bloqueados em grupo separado, desabilitados;
- se a fonte de disponibilidade falhar, bloquear seleção de tripulantes e exibir aviso explícito.

## 8) Regra FRMS visível
Fontes usadas:
- `GET /api/frms/daily-fatigue?date=...&scope=team`
- `GET /api/frms/daily-fatigue/alerts?date=...`

Exibição resumida por tripulante antes de salvar/publicar:
- `FRMS OK`
- `Atenção`
- `Revisão operacional`
- `Sem check-in`
- `Indisponível` (quando FRMS indisponível)

Na tabela operacional, coluna `F` usa badge curto:
- `OK` = FRMS OK
- `ATN` = Atenção
- `REV` = Revisão operacional
- `SC` = Sem check-in
- `IND` = FRMS indisponível

Não expor no snapshot/UX:
- KSS;
- horas de sono;
- sintomas;
- medicamentos;
- álcool;
- texto pessoal de check-in.

## 9) Layout e padrão visual
A tela EDV foi alinhada ao padrão do módulo Escalas:
- subnavegação consistente (Mensal/Diária/Minha Escala/Configurações);
- bloco de data central com navegação anterior/próximo;
- cards compactos em grid para aeronaves do dia;
- tabela operacional com colunas no padrão EDV real;
- espaçamento e cards coerentes com Escalas Mensal.

## 10) Teste funcional criado
Script: `scripts/test-evd-functional.sh`.

Cobertura:
1. GET `/api/evd?data=DATE`
2. criação de atribuição por aeronave
3. bloqueio `PIC=SIC`
4. justificativa estruturada (quando aplicável)
5. publicação por data
6. listagem de revisões
7. detalhe do snapshot
8. ausência de campos sensíveis FRMS no snapshot

Comportamento de pré-condições:
- `SKIPPED: sem aeronave ativa`
- `SKIPPED: sem tripulantes elegíveis`

## 11) Limitações
- `tripulante extra` é persistido em `observacoes` com marcação operacional, sem alteração de schema;
- status ANV depende do cadastro atual de aeronaves e de convenção de status existente.

## 12) Próximos passos
- incluir backend dedicado para `tripulante_extra` (campo estruturado) sem ambiguidade em observações;
- adicionar endpoint de status ANV diário (D/I/M) consolidado por data;
- evoluir teste funcional para cenário com múltiplas aeronaves e validação de conflitos por janela de horário.
