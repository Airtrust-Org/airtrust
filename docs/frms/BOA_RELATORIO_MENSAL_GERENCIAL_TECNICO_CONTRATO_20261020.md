# BOA/CBMMG — Contrato do relatório mensal gerencial e técnico (prévia não oficial)

**Data:** 20/10/2026  
**Frente única:** PR #1650, `feat/frms-boa-mensal-consolidado-20261020`  
**Base:** requisitos 1.5.3 (especialmente 4–7) e POC 8.4 informados pelo proprietário; ainda requer confronto com edital integral, anexos e retificações.

## 1. Finalidade, autorização e segregação

O relatório só é acessível por administrador autenticado no tenant **`bombeiros`**, `empresa_id > 0` e **diferente de 6**. Antes de qualquer leitura dos registros operacionais o Worker exige perfil regulatório próprio e vigente `FIREFIGHTER_AVIATION`, resolve os setores autorizados e recusa equipe com menos de cinco funcionários. A entrada é:

```text
GET /api/bombeiros/frms/relatorios/gerencial-tecnico-previa?mes=YYYY-MM
```

A tela correspondente existe somente em `/bombeiros/frms`, isolada da interface offshore. Não utiliza dados da empresa 6, rotas gerais `/api/frms`, tabelas de check-in com scores offshore, parâmetros IFR/IOGP offshore nem funções de conformidade da Costa do Sol.

A única fonte operacional é `frms_fadiga_evento` com `tipo=BOA_CHECKIN_V1`, `BOA_CASE_OPENED_V1`, `BOA_CASE_TREATMENT_V1`, `BOA_CASE_CLOSED_V1` e `empresa_id` obrigatório em todos os cruzamentos. A identidade do colaborador é validada em `funcionarios` da própria empresa, ativo e não excluído. Parâmetros são SQL parametrizados, inclusive tenant e IDs do escopo. Não retorna nomes, códigos de funcionários, diagnósticos, KSS, valores de sono, PVT ou payloads individuais.

## 2. Semântica dos indicadores

| Indicador | Regra | Limitação |
| --- | --- | --- |
| Participantes com recibo | Número distinto de funcionários com `BOA_CHECKIN_V1` enviado no mês | Não equivale ao total de escalados |
| Recibos recebidos | Número de eventos `BOA_CHECKIN_V1` no mês referenciado por `reference_date` | Não significa conclusão validada nem aptidão |
| Diferença mensal | Recibos do mês menos recibos do mês imediatamente anterior | O indicador é de volume, não de risco ou desempenho |
| Casos de revisão | Um `BOA_CASE_OPENED_V1` para cada recibo | Divergência/duplicidade no encadeamento bloqueia o relatório |
| Sem tratamento | Caso com abertura, sem tratamento e sem fechamento | Situação observada **na hora da consulta** |
| Em tratamento | Caso com um evento de tratamento e sem encerramento | Não comprova mitigação efetiva |
| Encerrado com eficácia registrada | Caso com um evento de tratamento e um de encerramento | Documentação de eficácia não equivale à sua validação independente |

**Regra temporal:** os casos pertencem à coorte de recibos do mês solicitado. O estado de tratamento/fechamento reflete os eventos existentes **no momento da geração**, não necessariamente no fechamento daquele mês. Logo comparações históricas de estado exigem snapshot persistido, corte temporal e assinatura antes de serem oficiais.

**Proteção contra inferência:** se 1–4 participantes enviaram check-in, ocultar **todos** os números daquela coorte, inclusive totais grandes de pessoa/dia. Para coorte suficiente, se **qualquer** classe de estado apresentar contagem de 1–4, ocultar **a distribuição inteira dos casos**, inclusive seu total, evitando reconstrução por subtração. Se a equipe autorizada tiver menos de cinco, recusar a solicitação sem consulta de eventos.

**Integridade fail-closed:** devolver erro sem agregados quando faltam casos, existem aberturas/ações duplicadas ou transições impossíveis, há mais de um recibo para o mesmo funcionário e dia, referência de data inválida, resultados negativos ou contagens incoerentes. Nunca traduzir fonte incompleta/invalidada em zero ou conformidade. Zero só significa ausência de recibos encontrados naquele recorte autorizado.

## 3. Fundamentos científicos e recomendações

Este artefato **não** calcula índice científico de fadiga, probabilidade de ocorrência, aptidão, tempo de recuperação ou taxa de conformidade. Os dados de sono, KSS e PVT adaptado permanecem individuais e não entram em relatórios administrativos. A metodologia de classificação de risco BOA, limites de jornada/sobreaviso, adequação do PVT 60s e protocolos clínicos precisam de parecer e validação local competentes.

As recomendações padronizadas são **gerenciais**, não clínicas: confrontar escalas e missões para obter denominador; garantir responsável, prazo e análise de eficácia de mitigação; revisar acionamentos noturnos, oportunidade de repouso e sequência de missões conforme protocolo BOA futuramente aprovado. Sem entradas de escala, **não** calcular adesão ou cobertura.

## 4. Proveniência e segurança

A resposta identifica versão do método `BOA_MONTHLY_EVIDENCE_PREVIEW_V1`, mês, timestamp de emissão, fonte de funcionários/eventos, revisão da política vigente e estado `UNSIGNED_UNVALIDATED_PREVIEW`.

**Não foi emitido, persistido nem assinado** um relatório oficial. A visualização/impressão da prévia não equivale a arquivo auditável, assinatura ou prova de conceito apta. Não emitir identidade individual, payload clínico, impressão sem rótulo de prévia ou afirmação de validade normativa.

## 5. Aceite executado versus pendências reais

- **Comprovado em testes locais:** 18 testes focados de backend e 8 de frontend para o novo módulo; na suíte afetada, 96 testes Worker e 40 frontend passaram no SHA de código `7ed679d551b05eb5a47a9bbd3b213b24d2608c6a`. Typecheck do Worker e guards de rotas/segurança de tipos: PASS.
- **SQLite local com dados fictícios:** consultas de coorte e casos entre outubro/setembro reproduzidas, valores sob coorte pequena suprimidos, empresa 6 excluída e quebra de proveniência rejeitada. Ensaio adicional em SQLite com 130 funcionários fictícios e 520 eventos em dois meses passou; demonstra a consulta nesse volume, **não** 130 sessões concorrentes ou Cloudflare D1. Não é D1 remoto nem ensaio de 130 usuários concorrentes.
- **Não executado:** provisionamento de tenant BOA, perfil homologado/assinado, rollout de staging, QA com perfis reais, migração, qualquer escrita D1/R2 remota, merge ou produção.
- **Bloqueios para o requisito 5 do edital:** relatório gerencial/técnico final necessita método científico aprovado, escalas/turnos e exposição, política jurídica LGPD, avaliação independente de eficácia, histórico por snapshot, assinatura/arquivo imutável, trilha de emissão, estabilidade/teste de carga de 130 usuários e validação formal da POC.
- **Requisito 8:** comprovação de experiência prática depende de documentos legítimos da licitante, não do software.

**Ordem de conclusão:** rever ciência e contrato operacional BOA → homologar tenant/staging por fluxo autorizado → testar check-in/caso/mitigação/rastreabilidade com dados sintéticos e isolamento bidirecional → vincular escalas reais do BOA e definir denominadores → homologar relatório auditável e assinatura → executar prova de conceito e entregar atestados/documentação.

Este documento descreve **código em PR draft**, não funcionalidade publicada ou aceite da licitação.
