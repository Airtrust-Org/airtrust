# Costa do Sol / AirTrust - Matriz V6 Owner Accepted 20260703

## Veredito

- GO para implementacao em branch/local/staging.
- NO-GO para producao.

## Registro de contexto

- A validacao formal de instrutor continua pendente.
- O owner aceitou avancar para implementacao documental e tecnica por urgencia.
- Os riscos permanecem documentados neste pacote V6.
- Producao continua bloqueada: nenhuma migration remota, nenhum DML remoto, nenhum deploy.

## Bloqueios resolvidos pela V5.1 e incorporados nesta V6

- Duplicidades intra-ficha tratadas sem violar `UNIQUE(modelo_id, manobra_id)`.
- `LOFT` e `LOFT Check` mantidos como sessoes distintas, com `carater=avaliativo` em metadata textual dos vinculos do check.
- Familia DECU tratada como `REALOCAR`.
- `S76-VOR-00` e `S76-LDP-00` tratados como codigos existentes de catalogo.
- Estrategia de metadata definida sem coluna nova obrigatoria: uso reversivel de `modelos_sessao_manobras.observacoes`.

## Ressalva obrigatoria sobre codigos de reforco

- Nao foi adotado sufixo `-R` para repeticao artificial.
- Quando nao havia variante tecnica catalogada suficiente, a V6 preferiu:
  - reaproveitamento de codigo tecnico existente da mesma familia operacional;
  - ou criacao pontual de variacao tecnica real, explicitamente nomeada.
- Repeticao pedagogica pura deve permanecer em observacao/instrucao, nunca como artifício para burlar unicidade.

## Novas variacoes tecnicas reais abertas pela V6

- `A139-PNO-01` - Pouso normal.
- `A139-AUT-02` - Flare e recuperacao avancada da autorrotacao.
- `A139-RPM-02` - Gerenciamento avancado de energia e RPM em flare/recuperacao.

## Guardrails mantidos

- Historico preservado.
- Sem hard delete.
- Sem alteracao em fichas finalizadas.
- Sem alteracao de layout PDF/ficha visual.
- Sem toque em PR #168.
- Sem reintroduzir NOTECHS dentro das 18 tecnicas.

