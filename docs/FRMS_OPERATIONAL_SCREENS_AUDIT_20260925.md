# Auditoria consolidada das telas operacionais FRMS — 2026-09-25

## Escopo

Auditoria das telas de Operação e Ficha do Tripulante após a integração de treinamento e simulador, com foco em:
- coerência entre fila, ficha, gráficos e histórico diário;
- jornada/atividade sem voo;
- voo real versus simulador;
- recuperação/standby;
- risco do período versus carga acumulada;
- fontes e confiança dos horários.

## Benchmark aplicado

A solução segue os princípios convergentes de ANAC/RBAC 117, EASA FTL/standby, ICAO FRMS e FAA FRMS:
- FRMS é orientado a evidência e contexto operacional, não a um único peso universal por atividade;
- repouso é período livre de serviço com oportunidade real de sono;
- standby em local escolhido (hotel/residência) não é equivalente a standby presencial em base/aeroporto;
- disponibilidade para acionamento imediato reduz a qualidade da oportunidade de recuperação;
- atividade administrativa/treinamento é carga de atividade, não recuperação;
- folga não deve gerar bônus automático sem evidência de sono/recuperação;
- horário e oportunidade de sono são relevantes para atividade noturna e simulador;
- parâmetros numéricos precisam permanecer governados/versionados por tenant/perfil.

Nenhum coeficiente novo foi inventado nesta correção. Os créditos V2 já governados continuam sendo a fonte numérica.

## Critério operacional consolidado

| Situação | Conta como atividade | Conta como voo real | Conta como simulador | Recuperação |
| --- | --- | --- | --- | --- |
| Voo | sim | sim | não | não |
| Simulador | sim | não | sim | não |
| Treinamento/administrativo | sim | não | não | não gera crédito |
| Standby hotel/residência | sim | não | não | crédito governado conforme repouso/no-work/callout |
| Standby base/aeroporto | sim | não | não | crédito governado menor que hotel/residência |
| Folga | não vira jornada | não | não | qualificada por sono/prontidão; sem bônus automático |
| Deslocamento a serviço | sim | não | não | restritivo |
| Atividade mista | sim | conforme componentes | conforme componentes | conforme componentes |

## Achados corrigidos

1. **"Carga operacional — Crítico" misturava carga e risco.**
   O status vinha do risco do período, que pode ser crítico por efetividade baixa mesmo com poucas horas. O cartão passa a se chamar **Risco do período**.

2. **HV FRMS duplicava voo real quando não havia simulador.**
   A UI passa a exibir **Voo real** e **Simulador** separadamente. O total equivalente FRMS permanece interno ao cálculo.

3. **Stub MANUAL do check-in aparecia como "Voo · 0h00".**
   Registro técnico sem HV/duração não é mais tratado como voo/jornada operacional.

4. **Atividade mista podia terminar no fim do voo mesmo com treinamento posterior.**
   O fim diário passa a considerar a última atividade relevante; o intervalo consolidado não soma sobreposição.

5. **Tela de check-in do dia sem voo tinha opções demais e horários incompletos.**
   Quatro situações principais ficam visíveis; exceções ficam em "Outra situação". Toda atividade/standby exige início e fim; folga não fabrica jornada.

6. **Gráfico e cards usavam fontes diferentes.**
   A timeline passa a receber o snapshot operacional e sobrepor o histórico persistido, incluindo projeção de hoje, treinamento e simulador.

7. **Gráficos vazios pareciam defeito.**
   Cada modo passa a informar explicitamente quando não existe evidência daquela dimensão, sem transformar ausência em zero.

8. **Ficha podia mostrar efetividade histórica diferente da efetividade operacional de hoje.**
   O snapshot do dia passa a ter prioridade; componentes históricos só são usados quando pertencem à mesma data/resultado real.

9. **Linhas MANUAL vazias eram exibidas como "Fonte não canônica".**
   A ficha mensal passa a identificá-las como **Check-in / aguardando fonte**, deixando claro que não são jornada concluída.

## Pontos que permanecem governados

Os pesos de recuperação e os parâmetros de efetividade não são alterados neste PR. Especialmente:
- hotel/residência e base/aeroporto usam máximos distintos já presentes na revisão V2;
- acionamento imediato usa multiplicador governado;
- treinamento/administrativo não recebe crédito de recuperação;
- folga é evidência de oportunidade de recuperação, não um bônus automático;
- parâmetros de ciclo embarcado existentes permanecem sujeitos à governança e rastreabilidade da revisão vigente.

## Critério de aceitação

- uma única fonte operacional por data para os cards;
- gráfico e tabela devem reproduzir o mesmo valor diário;
- sem voo não pode significar automaticamente folga;
- sem dado não pode aparecer como zero;
- início/fim de atividade reportada devem ser rastreáveis;
- voo real e simulador devem ser visíveis separadamente;
- status de risco não deve ser apresentado como quantidade de carga.
