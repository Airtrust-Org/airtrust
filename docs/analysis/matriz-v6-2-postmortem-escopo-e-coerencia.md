# Matriz V6.2 - Postmortem de Escopo e Coerencia

**Data:** 2026-07-05
**Carater:** documental e local-only
**Escopo:** sem producao, sem D1 remoto, sem deploy, sem migration, sem alteracao de fichas/sessoes/avaliacoes/historico

## 1. Resumo executivo

A primeira rodada da Matriz V6.2 passou como "correta" porque validou com rigor o subconjunto que o loader carregava, mas nao validou o universo operacional completo da Costa do Sol.

O resultado foi:

- `39` modelos-alvo aceitos como se fechassem a V6.2.
- `702` linhas tecnicas aceitas como se esgotassem o pacote.
- `TRE-INST` e `CRED-EXA` mantidos fora do novo padrao, ainda com `22` itens legados.
- sessoes iniciais com nome->conteudo incoerente e IFR basico entrando cedo demais em parte da trilha.

O corretivo desta fase eleva o target para `41` modelos, `738` linhas tecnicas e `15` NOTECHS fora das tecnicas, inclui `TRE-INST` e `CRED-EXA` no mesmo padrao e adiciona guardrails para impedir repeticao da mesma falha de aceitacao.

## 2. O que falhou

### 2.1 O universo validado era menor que o universo operacional

A aceitacao anterior tratou o conjunto carregado pelo loader como se fosse o conjunto total de interesse. Isso validou bem o target carregado, mas nao respondeu a pergunta correta:

> "A V6.2 cobre de forma coerente o catalogo operacional relevante da empresa?"

O AirTrust tem um catalogo operacional de `51` modelos no relatorio de sessao/manobras. O loader V6.2, por desenho, consolidava apenas `39` templates. A revisao inicial nao exigiu a reconciliacao entre:

- catalogo operacional de `51` modelos;
- source map legado de `51` modelos / `1122` relacoes;
- target consolidado da V6.2.

Sem essa reconciliacao, `39` passou a parecer "fechado" quando era apenas "o que o loader carregava".

### 2.2 TRE-INST e CRED-EXA foram classificados como trilhas auxiliares

`TRE-INST` e `CRED-EXA` ficaram fora do target porque foram tratados como modelos auxiliares, nao como parte do conjunto que tambem precisa obedecer ao padrao estrutural novo.

Na pratica, isso deixou dois modelos ativos com o problema estrutural que a V6.2 estava tentando eliminar:

- `22` itens tecnicos legados;
- mistura de itens tecnicos com comportamento NOTECHS/CRM;
- ausencia de validacao dedicada para garantir `18 tecnicas + 15 NOTECHS`.

Sem guardrail explicito, a exclusao desses dois modelos passou despercebida.

### 2.3 Contagem estrutural foi usada como substituto de coerencia pedagogica

A revisao anterior verificou "quantidade correta" melhor do que verificou "sessao correta". Isso permitiu passar casos em que:

- o nome da sessao nao refletia o conteudo predominante;
- o bloco IFR entrava cedo demais nas sessoes iniciais;
- havia risco de confundir sistemas/anormalidades basicas com navegacao/aproximacoes IFR;
- uma sequencia podia parecer consistente por contagem, mas nao pela progressao didatica.

Os exemplos mais claros foram:

- `A139-I-03/12`: nome de sistema eletrico, conteudo IFR pesado.
- `A139-I-04/12`: nome de IFR, conteudo mais alinhado a eletrico/avionicos/AFCS.
- `SK76-I-03/12`: IFR pesado cedo demais.
- `SK76-I-04/12` e `SK76-I-05/12`: fronteira pedagogica entre automacao e IFR mal posicionada.

## 3. Por que 39 modelos passaram como "corretos"

`39` passou como "correto" por quatro motivos combinados:

1. Os testes validavam o alvo carregado, nao o inventario operacional completo.
2. Nao existia uma matriz de aceite modelo a modelo cobrindo os `51` modelos do catalogo.
3. Nao existia um guardrail que falhasse quando `TRE-INST` e `CRED-EXA` estivessem fora do `target_models`.
4. A documentacao anterior tratava os modelos excluidos como "fora do pacote", o que mascarou uma divida de escopo como se fosse uma decisao final fechada.

Em outras palavras: a implementacao estava consistente com um alvo menor, mas a aceitacao nao provou que esse alvo menor era suficiente.

## 4. Por que TRE-INST/CRED-EXA ficaram fora

Os dois modelos ficaram fora por uma combinacao de premissa errada e falta de teste:

- premissa errada: instrutor e examinador foram tratados como trilhas anexas, nao como modelos que tambem precisavam convergir para o padrao novo;
- falta de teste: nao havia falha automatica para `target_models != 41`;
- falta de teste: nao havia falha automatica quando `TRE-INST` ou `CRED-EXA` apareciam com `22` itens ou com familias `INV-CRM-*` / `EXA-NTS-*` dentro das tecnicas.

O corretivo desta fase resolve isso incluindo ambos no target de `41` e exigindo `18 tecnicas + 15 NOTECHS` tambem para eles.

## 5. Por que "18 manobras" nao valida coerencia pedagogica

Uma sessao com `18` tecnicas pode continuar errada se a semantica estiver errada. So a contagem nao detecta:

- nome incompatvel com o conteudo predominante;
- IFR pesado antes do ponto pedagogico definido;
- NOTECHS/CRM infiltrados na lista tecnica;
- voo depois de pouso, corte ou encerramento;
- mistura de familias AW139 e SK76/S76;
- LOFT/check com ordem interna inadequada.

Por isso, contagem estrutural passou a ser apenas uma parte da aceitacao. A outra parte passou a ser coerencia de conteudo e sequencia.

## 6. Guardrails que faltavam

Antes deste corretivo, faltavam pelo menos estes guardrails:

- comparar explicitamente `target_models` com o target esperado de `41`;
- validar `738` linhas tecnicas totais;
- falhar se `TRE-INST` ou `CRED-EXA` nao estivessem no target;
- falhar se `TRE-INST` ou `CRED-EXA` tivessem mais de `18` tecnicas;
- falhar se `INV-CRM-*` ou `EXA-NTS-*` aparecessem dentro das tecnicas;
- falhar se uma sessao inicial recebesse IFR pesado antes de `05/12`;
- falhar se houvesse conteudo operacional depois de pouso/corte/encerramento;
- falhar se o `apply` tocasse qualquer tabela historica ou de execucao;
- exigir uma matriz de aceite cobrindo os `51` modelos do catalogo.

## 7. Guardrails adicionados nesta fase

Foram adicionados ou reforcados os seguintes guardrails:

### 7.1 Guardrails de dados

- `41` modelos-alvo obrigatorios.
- `738` linhas tecnicas totais obrigatorias.
- `18` tecnicas distintas por modelo-alvo.
- `15` NOTECHS fora das tecnicas.
- `TRE-INST` e `CRED-EXA` obrigatoriamente presentes no target.
- `TRE-INST` sem `INV-CRM-*` na lista tecnica.
- `CRED-EXA` sem `EXA-NTS-*` na lista tecnica.

### 7.2 Guardrails de coerencia pedagogica

- `A139-I-03/12` e `A139-I-04/12` sem bloco principal de aproximacoes IFR.
- `A139-I-05/12` com o bloco IFR/PBN basico.
- `SK76-I-03/12` e `SK76-I-04/12` sem IFR pesado.
- `SK76-I-05/12` como entrada correta do IFR basico.
- nenhuma sessao executa itens operacionais apos item terminal.
- nomes finais sem metadados internos.
- nenhuma mistura de familias AW139 e SK76/S76.

### 7.3 Guardrails de seguranca do apply

- sem `DELETE` fisico;
- DML restrito a:
  - `modelos_sessao`
  - `manobras`
  - `modelos_sessao_manobras`
- proibicao explicita de tocar:
  - `fichas_sessao`
  - `fichas_sessao_manobras`
  - `simulador_agendamentos`
  - `avaliacoes_manobras`
  - `fichas_manobras_historico`

### 7.4 Guardrail documental

- nova matriz de aceite `docs/analysis/matriz-v6-2-acceptance-matrix-51-modelos.md`, cobrindo os `51` modelos e registrando o veredito de cada um.

## 8. Como evitar repeticao

Para evitar repeticao da mesma falha, toda futura revisao de matriz precisa cumprir simultaneamente:

1. reconciliar o catalogo operacional completo com o target consolidado do loader;
2. registrar por escrito quais modelos estao dentro e fora do target, com justificativa;
3. impedir merge se `TRE-INST` e `CRED-EXA` nao obedecerem ao mesmo padrao estrutural;
4. validar conteudo, nao apenas contagem;
5. provar que o `apply` nao toca fichas, sessoes criadas, avaliacoes, assinaturas, comentarios ou historico;
6. tratar "fora do target" como divida registrada, nunca como fechamento implicito.

## 9. Estado final desta correcao

Depois deste corretivo:

- target V6.2 esperado: `41` modelos;
- total tecnico esperado: `738` linhas;
- NOTECHS esperados: `15` fora das tecnicas;
- `TRE-INST` e `CRED-EXA`: incluidos e normalizados;
- sessoes iniciais AW139 e SK76: nomes/progressao IFR corrigidos;
- catalogo operacional de `51` modelos: documentado ficha a ficha.

O que continua verdadeiro:

- ainda existem `10` modelos fora do target `41`;
- esses `10` nao impedem a seguranca do PR corretivo;
- mas impedem chamar a cobertura dos `51` modelos de "fechada" sem trilha propria adicional.
