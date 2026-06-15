# Decisões da Fase 0: SIGVOOS → Controle de Voos → FRMS

> Data: 2026-06-14  
> Status: FASE 0 FECHADA PARA PLANEJAMENTO; IMPLEMENTAÇÃO BLOQUEADA ATÉ CONFIRMAÇÃO DO ID SIGVOOS  
> Escopo: decisão técnica e desenho conceitual; nenhuma alteração de código, migration, rota ou dado

## 0. Decisão executiva

A arquitetura aprovada para implementação é:

```text
SIGVOOS API
  → staging/raw de integração
  → Controle de Voos AirTrust (fonte operacional canônica interna)
  → adaptador CV→FRMS
  → frms_jornada.origem = 'CONTROLE_VOOS'
  → alertas, violações, relatórios e acumulados FRMS
```

O SIGVOOS será tratado como **origem externa de importação**, não como identidade da jornada
operacional consumida pelo FRMS. Edições e validações feitas no AirTrust pertencem ao Controle de
Voos e não podem continuar sendo representadas como dado SIGVOOS.

As decisões desta fase são:

1. Usar `CONTROLE_VOOS` como única origem operacional canônica do FRMS após a virada.
2. Manter `SIGVOOS` como origem canônica somente durante o shadow mode; não ativar as duas origens
   simultaneamente para cálculos operacionais.
3. Não existe hoje no normalizador um ID de voo, trecho ou jornada vindo do SIGVOOS.
4. Tratar `identificadorSigvoos` atual como identificador do **tripulante**, nunca do voo.
5. Exigir confirmação do fornecedor sobre ID nativo e imutável antes da migration final.
6. Enquanto essa confirmação não existir, usar chave composta provisória e registrar seu risco.
7. Preservar payload bruto no staging, normalizar em `cv_*` e proteger edições manuais por campo.
8. Registrar diferenças de campos protegidos em uma tabela de conflitos auditável.
9. Implementar o novo fluxo em paralelo e liberar a virada somente após shadow mode aprovado.
10. Manter `syncSigvoosForFrms()` funcional até a virada ser validada e estabilizada.

Documentos-base:

- `docs/AUDITORIA_SIGVOOS_CONTROLE_VOOS_FRMS.md`
- `docs/PLANO_MIGRACAO_SIGVOOS_PARA_CONTROLE_VOOS.md`

---

## 1. Origem canônica do FRMS

### Opção A — continuar gerando `frms_jornada.origem = 'SIGVOOS'`

**Vantagem:** reduz a quantidade inicial de pontos que precisam mudar no FRMS, pois a política
atual já considera apenas `SIGVOOS` operacional.

**Rejeitada porque:**

- perpetua o acoplamento do FRMS ao fornecedor externo;
- representa incorretamente como SIGVOOS dados editados ou validados no AirTrust;
- obriga nova alteração do FRMS quando o SIGVOOS for substituído;
- esconde que a base operacional interna passou a ser responsável pela jornada;
- mistura linhagem de importação com fonte canônica de consumo.

### Opção B — gerar `frms_jornada.origem = 'CONTROLE_VOOS'`

**Aprovada.**

Justificativa:

- evita perpetuar o acoplamento com SIGVOOS;
- permite substituir o SIGVOOS sem alterar novamente o contrato do FRMS;
- deixa explícito que o FRMS é alimentado pela base operacional interna;
- mantém SIGVOOS apenas como origem externa de importação e rastreabilidade;
- representa corretamente edições manuais, conflitos resolvidos e validações feitas no AirTrust;
- permite que outros fornecedores futuros alimentem o Controle de Voos sem criar novas origens
  canônicas no FRMS.

### Regra de transição

No shadow mode, jornadas derivadas do CV podem ser persistidas com
`origem='CONTROLE_VOOS'`, mas devem ficar fora dos cálculos operacionais enquanto
`SIGVOOS` permanecer canônico. Na virada, a política deve trocar de `SIGVOOS` para
`CONTROLE_VOOS` como **fonte única**.

Não se recomenda deixar `SIGVOOS` e `CONTROLE_VOOS` simultaneamente canônicos, porque os dois
fluxos representam a mesma operação e podem duplicar alertas, violações e acumulados.

### Pontos que precisarão mudar

| Área | Ponto real do repositório | Mudança futura necessária |
|---|---|---|
| Política canônica | `worker-airtrust/src/lib/frms/frms-source-policy.ts` | Trocar a constante, status e nomenclaturas centradas em SIGVOOS por conceitos de fonte canônica operacional; na virada, `CONTROLE_VOOS` deve ser a única fonte aceita operacionalmente. |
| Lista TypeScript de origens | `worker-airtrust/src/lib/frms/types.ts` (`ORIGENS`) | Incluir `CONTROLE_VOOS`. |
| CHECK de `frms_jornada.origem` | schema vigente originado em `worker-airtrust/migrations/0351_frms_jornada_origem_sigvoos.sql` | Criar migration futura para aceitar `CONTROLE_VOOS`; não editar migration histórica. |
| Preferência de fonte por competência | `worker-airtrust/migrations/0361_frms_fonte_calculo_competencia.sql` | Rever o CHECK atualmente restrito a `SIGVOOS` e `FIRA`; decidir se a funcionalidade continuará existindo após a virada. |
| Alertas | `worker-airtrust/src/lib/frms/db-service-alertas.ts` | Passará a filtrar a fonte canônica `CONTROLE_VOOS`. |
| Alertas e acumulados diários | `worker-airtrust/src/cron/frms-daily-check.ts` | Remover os filtros SQL literais `SIGVOOS` e usar a política canônica compartilhada. |
| Rolling/acumulados | `worker-airtrust/src/lib/frms/db-service-acumulo.ts` | Consumirá a nova política canônica. |
| Rotas de acumulado e score | `worker-airtrust/src/routes/frms-fadiga-acumulada.ts` e `worker-airtrust/src/routes/frms.ts` | Validar todos os consumidores de `buildCanonicalOperationalSourceSql()`. |
| Reprocessamento de jornada | `worker-airtrust/src/lib/frms/db-service-jornadas.ts` | Validar bloqueios e decisões baseados em `shouldUseForOperationalFrms()`. |
| Relatórios FRMS | `worker-airtrust/src/lib/frms/db-service-relatorios.ts` | Auditar relatórios que leem jornadas para garantir distinção entre histórico, shadow e fonte canônica após a virada. |
| Snapshot/controle operacional | `worker-airtrust/src/lib/frms/operational-snapshot.ts` e `src/react-app/hooks/useFrmsOperationalSnapshot.ts` | Auditar campos e rótulos de origem expostos ao controle operacional. |
| Comparativo FIRA/SIGVOOS | `worker-airtrust/src/routes/frms-fira.ts` | Substituir comparativo e seleção centrados em SIGVOOS pelo dado canônico do Controle de Voos. |
| Limpeza e substituição legada | `worker-airtrust/src/services/sigvoos-frms.ts` | Rever filtros `origem IN (...)`, relabel para SIGVOOS e regras de substituição antes de deprecar o fluxo direto. |
| Tela mensal e badges de fonte | `src/react-app/pages/frms/frmsJornadasMensaisPresentation.ts` | Criar rótulos `CONTROLE_VOOS` e remover textos como `CANONICAL_SIGVOOS`/`PENDENTE_SIGVOOS` do modelo final. |
| Tipos do frontend FRMS | `src/react-app/hooks/useFrms.ts` | Atualizar status e tipos de fonte. |
| Comparativo e seletor FIRA | `src/react-app/pages/frms/frmsFiraTypes.ts` e `src/react-app/pages/frms/FrmsImportacaoFira.tsx` | Atualizar tipos, textos e opções que hoje apresentam SIGVOOS como fonte operacional. |
| Testes de contrato/política | `worker-airtrust/src/__tests__/frms/`, `worker-airtrust/src/__tests__/routes/` e `src/react-app/pages/frms/__tests__/` | Atualizar expectativas sem perder cobertura de exclusão de fontes não canônicas e de não duplicidade. |

Além da lista acima, a implementação deve executar busca direcionada por filtros literais
`origem='SIGVOOS'`, `origem = 'SIGVOOS'`, `UPPER(...origem...) = 'SIGVOOS'`,
`CANONICAL_SIGVOOS` e `PENDENTE_SIGVOOS` antes da virada.

---

## 2. ID estável do SIGVOOS

### Resultado da verificação no código atual

**Não existe no pipeline atual um campo normalizado equivalente a `voo_id`, `flight_id`,
`id_voo`, `jornada_id`, `escala_id`, `trecho_id` ou outro identificador único de voo/trecho.**

Evidências:

- `worker-airtrust/src/services/sigvoos-frms.ts` define `SigvoosNormalizedLeg` sem ID de voo,
  trecho ou jornada.
- `normalizeSigvoosRecord()` lê `staff`, `flight_report` e `flight_report_leg`, mas não extrai
  nenhum `id` desses objetos como identidade operacional.
- O campo `identificadorSigvoos` é derivado de `staff.inscription`, `inscription`,
  `staff_inscription`, `matricula`, `matricula_funcional`, `employee_code` ou `crew_code`.
- Esse campo é usado para resolver o funcionário por matrícula/inscrição e para identificar
  pendências de tripulante. Portanto, ele identifica **tripulante**, não voo, trecho ou jornada.
- Os registros são agrupados por tripulante e data em `groupSigvoosRecordsByDay()`; a identidade
  individual do trecho não é preservada no modelo normalizado.
- A chamada atual usa o endpoint
  `/relatorios/voos/tripulantes/etapas/pesquisa`, mas o código não prova que um eventual ID
  presente no payload seja único ou estável.

O payload bruto fica disponível em `SigvoosNormalizedLeg.raw` e em `SigvoosGroupedDay.rawItems`,
mas hoje não é usado como chave de idempotência de voo.

### Conclusão

O repositório atual não permite afirmar que o SIGVOOS fornece um ID estável. A existência de
objetos como `flight_report_leg` também não prova estabilidade de seus possíveis IDs entre
sincronizações. Essa confirmação precisa vir do contrato/API e de amostras reais comparadas.

### Chave composta provisória

Se o fornecedor não oferecer ID nativo estável, a chave provisória de voo/trecho deve ser um hash
canônico dos seguintes campos normalizados:

```text
empresa_id
+ data_operacional
+ numero_do_voo/prefixo
+ matricula_da_aeronave
+ origem
+ destino
+ horario_previsto_partida
+ horario_previsto_chegada
```

Regras:

- normalizar caixa, espaços, ICAO, matrícula e timestamps antes do hash;
- armazenar tanto a composição legível quanto `chave_idempotencia`;
- não incluir tripulante na chave do voo;
- usar uma chave filha para alocação de tripulante, por exemplo
  `chave_voo + identificador_tripulante + funcao`;
- se número do voo não existir, marcar a chave como de baixa confiança e exigir reconciliação;
- manter mecanismo de alias/reconciliação, pois reprogramação de horário pode alterar a chave.

A chave composta é inferior a um ID nativo: horários, aeronave, rota e número podem ser corrigidos
ou reprogramados, causando falsa criação de novo voo ou associação incorreta.

**Gate:** a migration final e o índice único definitivo de idempotência não devem ser aprovados
antes da resposta formal do SIGVOOS sobre a identidade dos registros.

---

## 3. Perguntas obrigatórias ao fornecedor/API SIGVOOS

1. Existe ID único e imutável para voo?
2. Existe ID único e imutável para trecho/etapa?
3. Existe ID único e imutável para jornada por tripulante?
4. O ID muda quando o voo é reprogramado?
5. Como a API indica voo cancelado?
6. Como a API indica voo alterado?
7. Existe campo `updated_at` ou equivalente?
8. Existe endpoint incremental por data de alteração?
9. Existe paginação? Qual o contrato exato para detectar a última página?
10. Existe limite de rate? Quais limites, janelas e headers de retry?
11. Existe payload completo de tripulação por voo/trecho?
12. Existe distinção entre horário previsto, estimado e real?
13. Existe status operacional padronizado e documentação de transições?
14. Existe histórico de alterações?
15. Existe endpoint para buscar dados por janela de datas?
16. Existe endpoint para buscar detalhe por ID?
17. Como são representados voos alternados, retorno, atraso, corte de etapa e reposicionamento?
18. Como a API representa função do tripulante: comandante, copiloto, instrutor, tripulante extra
    e observador?
19. Qual é o timezone oficial dos horários? O payload inclui offset?
20. A API retorna dados apagados/cancelados ou apenas omite registros removidos?
21. IDs existentes dentro de `flight_report`, `flight_report_leg` e `staff` são públicos,
    documentados e estáveis?
22. Um mesmo trecho aparece repetido por tripulante no endpoint atual? Se sim, qual campo permite
    consolidar essas linhas no mesmo voo?
23. Correções retroativas podem ocorrer fora da janela operacional consultada? Por quanto tempo?
24. Há ambiente sandbox e payloads de referência para todos os estados operacionais?

Solicitar respostas por escrito, documentação do contrato e amostras do mesmo voo antes e depois
de reprogramação, cancelamento e correção retroativa.

---

## 4. Regras de edição manual no AirTrust

### Modelo aprovado

1. Preservar cada payload original do SIGVOOS em `cv_sigvoos_staging`.
2. Normalizar dados aceitos nas tabelas `cv_*`.
3. Permitir edição manual nos campos operacionais autorizados.
4. Rastrear edição manual por campo, e não apenas por registro.
5. Nunca sobrescrever automaticamente campo protegido/editado manualmente.
6. Quando SIGVOOS trouxer valor diferente para campo protegido, criar conflito.
7. Permitir ao usuário manter o valor AirTrust ou aceitar o valor SIGVOOS.
8. Registrar importação, edição, conflito e resolução em auditoria, incluindo
   `cv_voo_eventos` quando a entidade for voo.

### Precedência

| Situação | Regra |
|---|---|
| Campo nunca editado no AirTrust | O importador pode atualizar com o valor SIGVOOS. |
| Campo editado manualmente | O importador não sobrescreve; cria conflito se o valor divergir. |
| Campo validado pelo AirTrust | Deve ser tratado como protegido até ação explícita de reabertura. |
| Valor SIGVOOS igual ao valor AirTrust | Atualiza metadados/hash sem criar conflito. |
| Registro cancelado/ignorado manualmente | Não recriar silenciosamente; exigir regra ou resolução explícita. |
| Usuário aceita SIGVOOS | Aplicar valor, encerrar conflito e registrar responsável/data. |
| Usuário mantém AirTrust | Preservar valor, encerrar conflito e registrar a rejeição do valor externo. |

### Estados recomendados

| Estado | Significado |
|---|---|
| `IMPORTADO_SIGVOOS` | Registro criado/atualizado a partir do fornecedor sem edição manual pendente. |
| `EDITADO_AIRTRUST` | Pelo menos um campo operacional foi editado manualmente. |
| `CONFLITO_SIGVOOS` | Nova versão externa diverge de campo protegido/editado. |
| `VALIDADO_AIRTRUST` | Registro revisado e aprovado operacionalmente no AirTrust. |
| `IGNORADO_SIGVOOS` | Payload externo deliberadamente ignorado, com justificativa auditável. |
| `SUBSTITUIDO_SIGVOOS` | Versão externa anterior foi substituída por outra versão reconhecida do mesmo registro. |

Os estados não substituem flags por campo. Um voo pode estar `VALIDADO_AIRTRUST` e ainda possuir
um conflito novo em um campo específico.

### Auditoria mínima

Registrar: entidade, campo, valor anterior, valor novo, origem da mudança, payload/hash de origem,
usuário ou processo, data/hora, justificativa e decisão de conflito. O histórico não deve ser
apagado quando uma nova sincronização chegar.

---

## 5. Desenho mínimo das tabelas futuras

Esta seção é conceitual. Não autoriza migration.

### `cv_sigvoos_staging`

| Campo | Papel |
|---|---|
| `id` | Identificador interno imutável do recebimento. |
| `empresa_id` | Escopo obrigatório de tenant. |
| `sigvoos_entidade_tipo` | Tipo recebido, por exemplo voo, trecho ou alocação de tripulante. |
| `sigvoos_entidade_id` | ID nativo confirmado pelo fornecedor, quando existir. |
| `chave_idempotencia` | Chave nativa ou composta normalizada usada no processamento. |
| `payload_json` | Payload bruto original, sem mutação. |
| `payload_hash` | Hash do payload para detectar repetição e alteração. |
| `data_operacional` | Data operacional normalizada usada para janela/reprocessamento. |
| `imported_at` | Momento em que o AirTrust recebeu o payload. |
| `updated_at_sigvoos` | Timestamp de alteração informado pelo fornecedor, quando existir. |
| `status_processamento` | Pendente, processado, conflito, ignorado ou erro. |
| `erro_processamento` | Código/mensagem sanitizada do erro. |

Recomendações adicionais: referência para a entidade `cv_*` criada/atualizada, contador de
tentativas, `processed_at`, timestamps internos e índices tenant-scoped por chave, status e data.
O payload bruto deve ficar no staging, e não duplicado como fonte primária em `cv_voos`.

### Campos adicionais em `cv_voos`

| Campo | Papel |
|---|---|
| `sigvoos_voo_id` | ID nativo do voo, se confirmado estável. |
| `origem_importacao` | Linhagem externa da última criação/importação, por exemplo `SIGVOOS` ou `MANUAL`. |
| `origem_primaria` | Domínio responsável pelo dado canônico; para o fluxo alvo, `CONTROLE_VOOS`. |
| `importado_em` | Primeiro recebimento/importação do registro. |
| `atualizado_em_sigvoos` | Timestamp externo da versão aplicada. |
| `editado_manual` | Indicador agregado de que existe edição manual. |
| `possui_conflito` | Indicador agregado de conflito aberto. |
| `payload_hash_origem` | Hash da última versão externa aplicada. |

Além desses campos agregados, a implementação deve possuir rastreamento por campo, em JSON
estruturado validado ou, preferencialmente, em tabela própria de alterações/proveniência.

### `cv_conflitos_integracao`

Tabela recomendada:

| Campo | Papel |
|---|---|
| `id` | Identificador interno do conflito. |
| `empresa_id` | Tenant obrigatório. |
| `entidade_tipo` | Tipo da entidade normalizada. |
| `entidade_id` | ID interno da entidade em conflito. |
| `campo` | Campo normalizado em divergência. |
| `valor_airtrust` | Valor canônico atual do AirTrust. |
| `valor_sigvoos` | Novo valor recebido do SIGVOOS. |
| `status` | Aberto, manter AirTrust, aceitar SIGVOOS ou resolvido por regra. |
| `resolvido_por` | Usuário/processo responsável pela decisão. |
| `resolvido_em` | Data/hora da resolução. |

Recomendações adicionais: `staging_id`, hashes dos valores, justificativa, timestamps internos e
unicidade para impedir múltiplos conflitos abertos do mesmo campo e versão.

### Tabelas relacionadas

`cv_voo_tripulantes` também precisará de rastreabilidade externa e dados necessários à derivação
FRMS, pois o schema atual em `worker-airtrust/migrations/0410_controle_voos_n1_schema.sql` contém
apenas vínculo, função, apresentação, dispensa e observações. A modelagem final deve separar:

- identidade do voo/trecho;
- identidade e função do tripulante;
- tempos atribuídos ao tripulante;
- vínculo da jornada derivada ao FRMS;
- proveniência e edição manual por campo.

---

## 6. Estratégia de shadow mode

### Fluxos comparados

```text
Antigo: SIGVOOS → syncSigvoosForFrms() → frms_jornada.origem='SIGVOOS' → FRMS operacional

Novo:   SIGVOOS → staging → cv_* → cv-frms-adapter
        → frms_jornada.origem='CONTROLE_VOOS' → cálculo shadow, não operacional
```

Durante o shadow mode:

- o fluxo antigo continua sendo a referência operacional;
- o novo fluxo não envia alertas/notificações operacionais;
- resultados derivados devem ser calculados em espaço isolado ou com execução que não contamine
  tabelas/resultados canônicos;
- cada execução precisa ser reprodutível a partir do staging;
- divergências precisam apontar os registros e regras que produziram o delta.

### Comparações obrigatórias

Comparar por empresa, tripulante, data e jornada:

- presença/ausência de tripulante e jornada;
- apresentação, término e FDP/duração de jornada;
- horas de voo;
- horas noturnas;
- repouso;
- status;
- alertas e violações;
- acumulados de 7d, 28d e 365d;
- cancelamentos, alternados e reprogramações;
- quantidade de voos e duplicidades;
- timezone e mudança de data operacional.

### Critérios mínimos para liberar a virada

- 0 divergências críticas;
- 0 tripulantes sem mapeamento;
- 0 voos duplicados;
- 0 jornadas duplicadas;
- cancelamentos e registros removidos tratados corretamente;
- timezone validado com casos de voo cruzando meia-noite;
- reprocessamento reproduzível a partir do mesmo staging;
- divergências justificadas documentadas e aprovadas;
- alertas e violações críticos equivalentes;
- acumulados 7d/28d/365d equivalentes;
- período mínimo de 7 dias consecutivos sem divergência crítica.

Tolerâncias numéricas só podem ser usadas para diferenças de arredondamento previamente
documentadas. Elas não podem esconder jornada ausente, voo duplicado, alerta crítico divergente,
cancelamento incorreto ou associação ao tripulante errado.

### Gate da virada

A virada deve ser atômica do ponto de vista da política operacional:

1. congelar e registrar o último resultado válido do fluxo antigo;
2. confirmar gates do shadow mode;
3. trocar a fonte canônica para `CONTROLE_VOOS`;
4. reprocessar alertas, violações e rolling;
5. executar smoke e comparação pós-virada;
6. manter rollback para `SIGVOOS` enquanto o fluxo antigo existir.

---

## 7. Plano da próxima implementação

A ordem aprovada, depois desta Fase 0, é:

1. Obter respostas formais do SIGVOOS sobre IDs, alterações, cancelamentos, paginação e timezone.
2. Fechar a granularidade final: voo, trecho e alocação de tripulante.
3. Criar migration de staging/raw SIGVOOS para Controle de Voos.
4. Adicionar campos de rastreabilidade em `cv_voos` e tabelas relacionadas.
5. Criar `worker-airtrust/src/services/sigvoos-cv-importer.ts`.
6. Importar SIGVOOS para Controle de Voos sem alterar o FRMS operacional.
7. Criar endpoint/tela de pendências e conflitos.
8. Criar `worker-airtrust/src/services/cv-frms-adapter.ts`.
9. Criar modo shadow compare isolado.
10. Validar e resolver divergências até cumprir todos os gates.
11. Criar migration futura para aceitar `CONTROLE_VOOS` em `frms_jornada.origem`.
12. Alterar `frms-source-policy.ts` e consumidores para tornar `CONTROLE_VOOS` a fonte canônica
    única.
13. Executar virada controlada e reprocessamento.
14. Monitorar estabilidade e manter rollback.
15. Deprecar o caminho direto `syncSigvoosForFrms()` somente após estabilização aprovada.

### Restrições para a próxima fase

- Não usar a chave composta provisória como decisão silenciosa e definitiva.
- Não colocar payload bruto como fonte canônica dentro de `cv_voos`.
- Não sobrescrever campo editado manualmente.
- Não ativar duas fontes canônicas operacionais ao mesmo tempo.
- Não desligar o fluxo antigo antes da aprovação do shadow mode.

---

## 8. Recomendação final

Usar **`CONTROLE_VOOS` como origem canônica do FRMS** e manter o SIGVOOS apenas como origem externa
de importação. Confirmar com o fornecedor um ID estável de voo/trecho antes da migration final;
até lá, qualquer chave composta é provisória e de menor confiabilidade.

Implementar o importador SIGVOOS→Controle de Voos em paralelo, preservar o payload bruto, proteger
edições manuais contra sobrescrita e registrar conflitos auditáveis. O fluxo direto
`syncSigvoosForFrms()` só deve ser desligado depois que o shadow mode demonstrar equivalência,
reprocessamento reproduzível, ausência de divergências críticas, ausência de duplicidades e
tratamento correto de cancelamentos e timezone.
