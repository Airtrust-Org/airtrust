# Controle de Voos N1 - Decisao de Ambiente do Piloto e Evidencias

> Data de referencia: 2026-06-14
> Estado atual do modulo: **pronto com ressalvas** para piloto interno controlado
> Base documental: `docs/CONTROLE_DE_VOOS_N1_PILOTO_EXECUCAO_CHECKLIST.md`, `docs/CONTROLE_DE_VOOS_N1_PILOTO_INTERNO_CONTROLADO.md`, `docs/CONTROLE_DE_VOOS_N1_END_TO_END_READINESS.md`, `docs/CONTROLE_DE_VOOS_N1_MVP_SPEC.md`, `docs/CONTROLE_DE_VOOS_N1_BACKEND_DESIGN.md`, `docs/AIRTRUST_ANAC_REGULATED_SYSTEMS_MASTER_PLAN.md`, `docs/AIRTRUST_MODULE_GOVERNANCE_EVIDENCE_STANDARD.md`, `docs/DECISOES_FASE0_SIGVOOS_CONTROLE_VOOS_FRMS.md`, `docs/DOSSIE_REGULATORIO_ANAC_AIRTRUST_DB_SDRME_CONTROLE_VOOS.md`

## 1. Sumario executivo

A decisao que precisa ser tomada agora nao e de rollout. A decisao e **em qual ambiente executar o piloto interno controlado do Controle de Voos N1** e **quais evidencias coletar** para sustentar a proxima fase de maturidade operacional e a futura preparacao regulatoria.

Recomendacao central:

- executar o piloto em **preview/staging com acesso restrito**;
- tratar o piloto como validacao operacional controlada, nao como liberacao ampla;
- usar o piloto para gerar evidencia de processo, governanca, estabilidade, divergencia e rollback;
- manter o fluxo legado como referencia formal durante toda a janela.

Por que isso **nao e rollout**:

- o modulo ainda esta em N1 operacional interno;
- a execucao ainda depende de dados controlados, usuarios restritos e observacao proxima;
- ainda nao ha decisao de virada canonica geral, nem equivalencia comprovada com o fluxo legado;
- o shadow mode com SIGVOOS e a alimentacao futura do FRMS ainda dependem de comparacao estruturada e de aprovacao posterior.

Por que isso **nao e uso regulado**:

- o piloto nao substitui Diario de Bordo, eDB, SDRMe, Sigvoos, APUS ou papel;
- nao ha Records Core regulado;
- nao ha assinatura juridica, trilha regulatoria ou pacote de aceitacao;
- nao existe autorizacao, aprovacao ou homologacao da ANAC para esse uso.

Conexao com SIGVOOS e FRMS:

- a estrategia definida para a Fase 0 estabelece que o **Controle de Voos sera a origem canonica futura do FRMS apos a virada**;
- ate la, o **SIGVOOS continua como origem externa em shadow mode**, sem dupla canonicidade simultanea;
- o piloto deve produzir evidencias de divergencia, campos faltantes, lacunas de identificacao de voo/trecho e consistencia operacional para sustentar o gap map `SIGVOOS -> Controle de Voos -> FRMS`.

## 2. Opcoes de ambiente

### Opcao A - Local controlado

Vantagens:

- menor risco operacional;
- reset simples;
- bom para ensaio tecnico, treinamento e roteiro seco;
- facilita reproducao de fluxos com seed local.

Riscos:

- baixa aderencia ao uso real multiusuario;
- pouca validade para evidencias de operacao real;
- risco de mascarar problemas de ambiente, permissao e comportamento concorrente.

Requisitos:

- `0410_controle_voos_n1_schema.sql` aplicada apenas no D1 local;
- seed local `cv_*` carregado;
- usuarios tecnicos de teste;
- runbook local revisado.

Impacto em migration 0410:

- **baixo risco**, pois e ambiente descartavel e isolado;
- adequado para validacao previa de esquema e massa demonstrativa.

Impacto em rollback:

- simples;
- pode ser descartado e recriado sem efeito operacional.

Impacto em evidencias:

- bom para evidencia tecnica inicial;
- fraco para evidencia operacional, governanca de uso e comparacao com legado.

Recomendacao:

- usar apenas como **preparacao tecnica**, nao como piloto formal com usuarios reais.

### Opcao B - Preview/Staging com acesso restrito

Vantagens:

- melhor equilibrio entre realismo e controle;
- suporta usuarios reais em janela limitada;
- reduz risco de contaminacao de producao;
- permite coletar evidencia operacional, tecnica e de governanca com supervisao.

Riscos:

- depende de ambiente candidato alinhado com schema `cv_*`, dados controlados e RBAC efetivo;
- requer disciplina de acesso e massa de dados;
- pode haver diferencas residuais em relacao a producao.

Requisitos:

- `0410_controle_voos_n1_schema.sql` aplicada somente nesse ambiente autorizado;
- usuarios piloto restritos e comunicados;
- massa de dados controlada e rastreavel;
- rollback documentado;
- stop criteria aceitos;
- fluxo legado preservado.

Impacto em migration 0410:

- **aceitavel e recomendado** para o piloto formal;
- deve ocorrer apenas apos pre-checks de schema, permissao, massa e rollback.

Impacto em rollback:

- controlado;
- exige remocao de acesso, congelamento do piloto e preservacao dos dados apenas para analise interna.

Impacto em evidencias:

- forte;
- permite capturar logs, fluxos reais, feedbacks, incidentes, screenshots, divergencias com o legado e decisao go/no-go.

Recomendacao:

- **opcao recomendada para o primeiro piloto formal**.

### Opcao C - Producao com feature flag restrita

Vantagens:

- maior aderencia ao contexto real;
- favorece observacao de comportamento lado a lado com massa real;
- prepara melhor a transicao futura para shadow mode operacional mais proximo da realidade.

Riscos:

- maior risco de confusao regulatoria e de interpretacao como uso oficial;
- maior pressao por rollout prematuro;
- erro de permissao, tenant ou copy ambigua tem impacto mais alto;
- aumenta o risco de aplicar a `0410` no ambiente errado ou antes de decisao explicita.

Requisitos:

- feature flag realmente restrita;
- criterio formal de aprovacao executiva;
- suporte tecnico em tempo real;
- rollback pronto e exercitavel;
- fluxo legado explicitamente prevalente.

Impacto em migration 0410:

- **alto risco**;
- so pode ser considerada com decisao explicita posterior, nunca por inercia do piloto atual.

Impacto em rollback:

- mais complexo;
- exige desativacao rapida de acesso e comunicacao imediata de retorno ao processo anterior.

Impacto em evidencias:

- muito forte do ponto de vista de uso real;
- tambem aumenta risco de gerar evidencia contaminada por uso fora do escopo.

Recomendacao:

- **nao recomendada para o primeiro piloto**.

## 3. Decisao recomendada

Recomendacao proposta:

- ambiente: **preview/staging com acesso restrito**;
- usuarios: `1 sponsor/gestor operacional`, `1 a 2 usuarios OCC/controle`, `1 piloto observador ou limitado`, `1 administrador tecnico`, `1 responsavel AirTrust/produto`, `1 suporte tecnico`;
- dados: voos passados e controlados como base principal; voos futuros somente em observacao paralela e sem substituir sistema oficial;
- duracao: **5 dias**, conforme checklist operacional ja aprovado;
- escopo: dashboard, lista de voos, detalhe do voo, RDV operacional, criar/editar/finalizar preenchimento, resumo interno;
- permissoes: acesso limitado aos participantes, com leitura e escrita somente no que o piloto exigir;
- responsavel por GO/NO-GO: **sponsor operacional + responsavel AirTrust/produto**, com veto tecnico do administrador tecnico para risco critico.

## 4. Regras para migration 0410

### Onde pode aplicar

- ambiente local controlado;
- ambiente preview/staging explicitamente aprovado para o piloto.

### Onde nao pode aplicar

- producao;
- qualquer ambiente compartilhado nao aprovado para o piloto;
- qualquer ambiente em que os acessos, a massa de dados ou o rollback nao estejam formalmente definidos.

### Pre-checks obrigatorios

- ambiente alvo confirmado por escrito;
- backup/restore ou plano de retorno documentado;
- usuarios piloto definidos;
- massa `cv_*` preparada e revisada;
- validação de acesso e isolamento por tenant;
- checklist de stop criteria aceito.

### Rollback

- retirar acesso ao modulo;
- encerrar a janela de uso;
- preservar dados do piloto apenas para analise;
- retornar integralmente ao fluxo legado;
- registrar causa da reversao e condicoes para eventual retomada.

### Validacao pos-aplicacao

- confirmar existencia e acessibilidade das tabelas `cv_*`;
- validar leitura do dashboard;
- validar leitura e detalhe de voo;
- validar fluxo de RDV `null -> rascunho -> preenchimento_finalizado`;
- registrar evidencias da validacao do ambiente antes de liberar usuarios.

### Regra de proibicao

- **proibido aplicar a migration 0410 em producao sem decisao explicita posterior, separada do piloto atual e aprovada pelos donos do ambiente**.

## 5. Evidencias a coletar no piloto

### Evidencias operacionais

- fluxos executados por usuario;
- RDVs iniciados;
- RDVs finalizados;
- tempos de preenchimento;
- duvidas recorrentes;
- divergencias entre previsto e realizado;
- divergencias com Sigvoos/APUS;
- relatorio final do piloto.

### Evidencias de governanca

- comunicacao enviada aos usuarios;
- aceite do escopo nao regulado;
- aceite dos stop criteria;
- registro de GO/NO-GO diario e final;
- registro de quem aprovou ambiente, acesso e continuidade;
- comprovacao de preservacao do fluxo legado.

### Evidencias tecnicas

- logs de acesso;
- incidentes e passos de reproducao;
- screenshots das telas-chave;
- validacao do ambiente pos-0410;
- comportamento de permissao e isolamento de tenant;
- estabilidade do fluxo RDV ponta a ponta.

### Evidencias para futura preparacao ANAC

- disciplina de escopo e nao confusao com sistema oficial;
- capacidade de rollback controlado;
- rastreabilidade de divergencias;
- governanca de acesso;
- evidencias de processo e maturidade operacional;
- relatorio consolidado de lacunas para evolucao regulatoria futura.

### Itens minimos a arquivar

- logs de acesso relevantes;
- planilha ou formulario de feedback diario;
- template de incidente preenchido quando houver;
- screenshots do dashboard, detalhe do voo e RDV;
- metricas consolidadas do piloto;
- relatorio final com decisao e proximos passos.

## 6. Relacao com SIGVOOS

O piloto deve observar explicitamente:

- campos que existem no AirTrust mas nao existem no SIGVOOS;
- campos que existem no SIGVOOS mas faltam no AirTrust;
- ausencia de **ID estavel de voo/trecho do SIGVOOS** confirmado pelo fornecedor;
- o fato de `identificadorSigvoos` representar **tripulante**, nao voo;
- dados de tripulacao;
- dados de jornada;
- horarios planejados x reais;
- status operacionais;
- divergencias de nomenclatura, granularidade e correspondencia.

Observacoes obrigatorias para o piloto:

- registrar se um voo do AirTrust consegue ou nao ser reconciliado sem ambiguidade com o dado externo;
- registrar quando a identidade do voo/trecho depender de heuristica;
- classificar campos em tres grupos:
  - `ja equivalentes`;
  - `equivalentes com adaptacao`;
  - `sem mapeamento confiavel`.

Resultado esperado:

- um insumo concreto para o futuro **gap map SIGVOOS -> Controle de Voos -> FRMS**;
- lista de divergencias que impedem virada canonica;
- lista de campos que ainda dependem de confirmacao do fornecedor ou de modelagem adicional.

## 7. Relacao com FRMS

No futuro, o Controle de Voos precisara fornecer ao FRMS:

- horarios reais de inicio e fim da jornada;
- horarios reais de cada etapa;
- pousos;
- ocorrencias que afetem repouso e continuidade;
- trocas de tripulacao;
- status e eventos suficientes para reconstruir jornada realizada.

O que ainda vem do SIGVOOS:

- a alimentacao externa que hoje sustenta o fluxo operacional existente do FRMS;
- referencias ainda nao substituidas enquanto o shadow mode nao for aprovado;
- dados cuja reconciliacao dependa do ID estavel do fornecedor.

Como sera o shadow mode:

- SIGVOOS permanece como origem externa ativa para o caminho atual;
- Controle de Voos gera uma segunda linha de comparacao, sem virar canonico cedo demais;
- o FRMS nao deve operar com duas fontes canonicas simultaneas;
- a virada so pode ocorrer depois que a equivalencia operacional for demonstrada e aprovada.

Dados que devem ser comparados:

- tripulante;
- voo/trecho;
- inicio e fim de jornada;
- horarios de decolagem e pouso;
- quantidade de etapas;
- pousos e ciclos quando relevantes;
- divergencias e cancelamentos;
- mudancas manuais protegidas por campo.

Divergencias que bloqueiam virada canonica:

- falta de ID estavel de voo/trecho;
- reconciliacao inconsistente entre jornada real e jornada derivada;
- campos criticos sem mapeamento confiavel;
- conflitos manuais nao auditaveis;
- diferencas recorrentes sem regra clara de precedencia.

## 8. Relacao com preparacao ANAC

Este piloto **nao e submissao ANAC**.

O piloto serve para gerar:

- evidencia de processo operacional controlado;
- evidencia de governanca de ambiente, acesso e escopo;
- evidencia de rollback e parada segura;
- evidencia de que o time sabe diferenciar uso interno de uso regulado;
- evidencia de maturidade para futuras fases.

O piloto **nao substitui**:

- eDB;
- SDRMe;
- Diario de Bordo;
- qualquer registro oficial;
- qualquer pacote de aceitacao ou autorizacao regulatoria.

Como ele ajuda o caminho regulado futuro:

- amadurece o fluxo operacional que futuramente pode alimentar modulos regulados;
- expõe lacunas de precedencia RDV x eDB;
- melhora a clareza de governanca, evidencia e rollback;
- prepara a conversa futura sobre integracao com FRMS, MRO, eDB e trilhas reguladas, mas sem antecipar essa virada.

## 9. Criterios de GO/NO-GO para ambiente

Checklist antes de autorizar o piloto:

- ambiente aprovado formalmente
- migration aplicada somente onde permitido
- acesso restrito aos participantes
- dados controlados e rastreaveis
- rollback definido e exercitavel
- usuarios comunicados
- fluxo legado preservado
- stop criteria aceitos
- validacao pos-0410 concluida
- sponsor e responsavel AirTrust concordam com a janela

## 10. Riscos principais

- confusao regulatoria sobre o valor do RDV operacional;
- migration aplicada no ambiente errado;
- dados reais sem controle ou sem rastreabilidade;
- divergencia relevante entre SIGVOOS e AirTrust;
- FRMS consumindo a fonte errada cedo demais;
- pressao organizacional por rollout antes da hora;
- ausencia de ID estavel de voo/trecho do SIGVOOS;
- campos manuais sem reconciliacao confiavel;
- interpretacao de evidencia do piloto como prova de prontidao regulatoria.

## 11. Decisao final proposta

| Decisao | Recomendacao | Dono | Prazo | Condicao de saida |
| --- | --- | --- | --- | --- |
| Ambiente do piloto | Preview/staging com acesso restrito | Sponsor + Responsavel AirTrust/produto | Antes do Dia 0 | Ambiente confirmado e validado |
| Uso da migration 0410 | Aplicar apenas em local e preview/staging aprovado; proibido em producao | Administrador tecnico | Antes da liberacao de usuarios | Schema `cv_*` validado e fluxo RDV funcional |
| Escopo do piloto | Fluxo N1 interno, sem rollout e sem uso oficial | Responsavel AirTrust/produto | Antes da comunicacao | Escopo comunicado e aceito |
| Coleta de evidencias | Coletar evidencias operacionais, tecnicas, de governanca e de preparacao futura | Suporte tecnico + Responsavel AirTrust/produto | Durante os 5 dias | Relatorio final consolidado |
| Relacao com SIGVOOS | Registrar gap map e divergencias, sem virada canonica | Responsavel produto + dono da integracao | Apos o piloto | Lista priorizada de gaps e conflitos |
| Relacao com FRMS | Manter SIGVOOS no caminho atual ate shadow mode aprovado | Dono FRMS + produto | Apos o piloto | Criterios de shadow mode formalizados |

## 12. Proximos passos macro

1. Executar o piloto conforme o checklist operacional aprovado.
2. Receber e consolidar a auditoria SIGVOOS relacionada ao fluxo CV -> FRMS.
3. Gerar o **gap map SIGVOOS -> Controle de Voos -> FRMS** com base nas evidencias do piloto.
4. Decidir criterios, escopo e gates do shadow mode.
5. So depois discutir virada canonica do FRMS para Controle de Voos.
6. Manter qualquer debate sobre eDB, SDRMe, Records Core ou uso regulado fora desta fase.

## Resumo proposto

- Ambiente recomendado: **preview/staging com acesso restrito**
- Decisao sobre a `0410`: **pode em local e preview/staging aprovado; proibida em producao sem decisao explicita posterior**
- Principal evidencia a coletar: **divergencia e equivalencia operacional entre fluxo real do piloto e referencias externas**
- Ligacao com SIGVOOS: **mapear lacunas, IDs instaveis e correspondencias criticas**
- Ligacao com FRMS: **preparar shadow mode, nao antecipar virada canonica**
- Ligacao com ANAC: **maturidade de processo e governanca, nao submissao regulatoria**
