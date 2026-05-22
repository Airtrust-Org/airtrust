# Playbook Operacional - Matriz de Treinamentos + Ficha 360

## Objetivo

Padronizar o controle de compliance por funcionario com base na matriz de treinamentos, eliminando falso alerta de vencimento e garantindo visibilidade completa de simulador e pasta virtual.

## Itens 1 e 2 concluidos

### Item 1 - Regra de validade de qualificacao (fonte unica)

- A Ficha 360 passa a considerar somente qualificacoes vigentes por codigo.
- Registros cancelados, renovados e marcados como renovada nao entram no calculo.
- A leitura usa sempre o registro mais recente por codigo para evitar historico antigo marcando alerta incorreto.

### Item 2 - Consistencia de compliance e visibilidade de modulos

- O compliance em lote usa a mesma regra de qualificacao vigente por codigo.
- O bloco de simulador na Ficha 360 agora suporta schemas legado e atual:
  - sessoes em `simulador_agendamentos` ou `sessoes`.
  - participante em `funcionario_id` ou `colaborador_id_aluno`.
  - fichas em `funcionario_id` ou `colaborador_id_aluno`.
- A aba de Pasta Virtual foi robustecida para schema variavel e filtro por empresa.

## Rotina semanal (operacao)

1. Revisar funcoes em `/configuracoes/matriz-treinamento`.
2. Validar requisitos obrigatorios por funcao (matriz ativa).
3. Auditar amostra de funcionarios na Ficha 360:
   - Resumo: sem falso vencido para curso renovado.
   - Simulador: sessoes e fichas visiveis.
   - Pasta Virtual: certificados/documentos carregados por categoria.
4. Corrigir excecoes (cadastro, tipo/codigo, vinculo do funcionario).
5. Validar alertas da auditoria FRMS automatica (cron diario 08:00 UTC):

- jornadas sem fatorizacao;
- jornadas fora da quinzena (> tolerancia +-2 dias);
- rolling sem jornada correspondente nos ultimos 120 dias.

6. Quando SIGVOOS vier com 0 dias e houver FIRA importada no mes, revisar a fonte de calculo por tripulante/competencia em `/frms/importacao-fira/:id/fonte-calculo`.

## Rotina mensal (governanca)

1. Exportar funcionarios nao conformes por funcao.
2. Priorizar vencidos em 30 dias por criticidade operacional.
3. Verificar cobertura de requisitos por funcao.
4. Revisar incidentes de dados (duplicidade, tipo incorreto, status invalido).
5. Executar saneamento de rolling legado (`frms_acumulo_rolling`) fora do horizonte real de jornadas.

## Regras de auditoria de dados

- Qualificacao valida deve respeitar:
  - `deleted_at IS NULL`
  - `status` diferente de `CANCELADA` e `RENOVADA`
  - `renovada = 0` quando campo existir
- Sempre avaliar ultima validade por codigo (ordem por data_vencimento/data_realizacao e id).
- Nao misturar historico com estado vigente no card de alerta.

### Integridade FRMS (adicional)

- Jornadas validas para mapa de efetividade devem ter ao menos um dos campos:
  - `hora_apresentacao`
  - `hora_termino`
  - `horas_voo_minutos > 0`
  - `duracao_jornada_minutos > 0`
- Regra de quinzena:
  - jornada deve respeitar a alocacao de quinzena do tripulante;
  - tolerancia operacional de +-2 dias;
  - fora desse intervalo entra em auditoria.
- Rolling sem jornada recente (>120 dias) e rolling fora do horizonte real sao candidatos a limpeza.

## Monitoramento automatico (cron diario 08:00 UTC)

- Jornadas sem fatorizacao.
- Jornadas lancadas fora da quinzena (> tolerancia +-2 dias).
- Rolling sem jornada correspondente nos ultimos 120 dias.
- Anomalias devem gerar notificacao de sistema com prioridade alta.

## Fonte de calculo FIRA x SIGVOOS

- A preferencia de fonte por tripulante/competencia e persistida em `frms_fonte_calculo_competencia`.
- Regra operacional:
  - preferir SIGVOOS quando houver dias validos para a competencia;
  - usar FIRA quando SIGVOOS estiver zerado e houver importacao valida no periodo;
  - em divergencia, revisar a preferencia explicitamente na rota de fonte de calculo.

## Smoke test rapido apos deploy

1. Abrir 3 fichas com historico de renovacao e confirmar ausencia de falso vencido.
2. Validar 1 funcionario com fichas de simulador existentes.
3. Validar 1 funcionario com documentos em pasta virtual (certificado e simulador).
4. Conferir compliance individual e lista de compliance com mesmo resultado para o mesmo requisito.

## Resultado esperado

- Alertas corretos na Ficha 360.
- Simulador e Pasta Virtual com dados consistentes.
- Matriz de treinamentos refletindo estado operacional real do funcionario.
