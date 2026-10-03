# AirTrust — Training Compliance V4

**Data:** 2026-10-03  
**Empresa de referência:** Costa do Sol — `empresa_id=6`  
**Escopo:** matriz corporativa de treinamentos, regras de aplicabilidade e governança de designações.

## 1. Regra corporativa aprovada

Quando a matriz corporativa controlada abranger um público maior do que o mínimo regulatório, o AirTrust deve **preservar o público mais abrangente da matriz**.

Não reduzir uma obrigação já existente na matriz apenas porque a norma admite recorte por exposição, autorização, atividade ou designação individual.

Designações individuais ficam reservadas para funções/programas realmente específicos. Histórico de treinamento, certificado, matrícula LMS ou conclusão anterior **não podem ser usados para inferir designação**.

Ausência de designação específica também não pode apagar uma obrigação ampla que já exista por empresa, setor ou função.

## 2. Decisões consolidadas

| Tema | Regra V4 |
| --- | --- |
| AVSEC Conscientização | Obrigatório para toda a empresa. A base opera dentro de aeroporto e o requisito corporativo de acesso permanece abrangente. Perfis AVSEC especializados continuam separados. |
| NR-06 | Mantém abrangência corporativa da matriz. Não converter para designação individual de usuário de EPI. |
| NR-11 | Obrigatório para Mecânicos e Auxiliares de Manutenção. Não exigir designação nominal de operador para esses dois cargos. |
| NR-20 | Manter público amplo da matriz para o pessoal aplicável do ambiente operacional/manutenção. Para o hangar de manutenção de helicópteros, usar no AirTrust a trilha corporativa conservadora **NR-20 Intermediário**, com **16 h inicial**, **4 h recorrente** e **24 meses**. O EAD pode suportar teoria, mas a qualificação não deve ser tratada como concluída apenas por EAD quando houver componente prático exigido pelo programa aplicável. |
| NR-26 / Produtos Químicos / FDS | Todo o pessoal operacional tem contato com produtos químicos; manter abrangência operacional, sem designação nominal como condição de aplicabilidade. Não inventar validade nova quando o modelo revisado não a exigir explicitamente. |
| NR-35 | Manter a abrangência já existente na matriz para Manutenção, sem converter para designação nominal apenas para reduzir público. |
| SGSO / D2 | Validade corporativa: **36 meses**. Carga de referência: **8 h inicial / 4 h recorrente**. |
| PRE | Ciclo anual: **12 meses**. |
| D3 | Manter **12 meses**. |
| FDM EAD | Preservar o público amplo previsto na matriz. Designações podem ser usadas apenas para papéis específicos do programa, sem retirar a familiarização geral já prevista. |
| LOFT | Manter como controle/qualificação separado. Não desativar nem absorver em outro treinamento. |
| Manutenção controlada | Cursos controlados de Manutenção definidos na matriz permanecem em **24 meses**. Proveniência: **critério contratual Petrobras/IOGP informado pela Gerência de Treinamento**; não registrar como política interna. |
| Históricos e certificados | Nunca apagar, reescrever ou invalidar histórico concluído para fazer a matriz nova “caber”. A matriz define obrigação futura/atual; o histórico permanece evidência. |

## 3. Manutenção — regra de 24 meses

O ciclo de 24 meses aplica-se ao conjunto controlado de treinamentos de Manutenção aprovado pela Gerência de Treinamento, incluindo os modelos explicitamente tratados pelo alinhamento 0526, como `MNT_AW139` e `MNT_S76AC`, e demais itens controlados equivalentes da matriz.

Ao registrar proveniência no AirTrust:

- não usar `POLITICA_INTERNA` como justificativa do ciclo de 24 meses;
- usar referência contratual/cliente Petrobras/IOGP conforme informação da Gerência de Treinamento;
- não atribuir a mesma proveniência automaticamente a curso de Manutenção/Outros que não pertença à lista controlada;
- se posteriormente houver cláusula documental específica recebida da Petrobras/IOGP, complementar a referência sem alterar historicamente o fundamento já aprovado.

## 4. Designação x abrangência por matriz

### Não dependem de designação nominal para aplicabilidade V4

- AVSEC Conscientização;
- NR-06;
- NR-11 para Mecânicos e Auxiliares de Manutenção;
- NR-20 para o público amplo já definido na matriz;
- NR-26 / Produtos Químicos / FDS para o pessoal operacional;
- NR-35 para o público de Manutenção já definido na matriz;
- FDM EAD de familiarização, quando previsto amplamente na matriz.

### Permanecem adequados para designação específica

- ARSO;
- Supervisor ARSO;
- Gatekeeper;
- papéis específicos do FDM (`FDM_ADMIN`, `FDM_COMITE` e equivalentes aprovados);
- LOSA Observador;
- LOSA Analista;
- Auditor Comportamental;
- Auditor Interno;
- CIPA;
- Brigadista;
- Socorrista designado;
- Instrutor designado;
- Examinador designado;
- operador NR-12 quando houver equipamento/atividade que exija controle nominal;
- usuário autorizado de eDB/logbook de Manutenção;
- participante formal de Gestão de Mudanças;
- perfis AVSEC especializados por atividade;
- funções especiais de DGR/rampa/PTAP quando o programa exigir papel específico.

A lista acima define **tipos de designação**, não ocupantes. Ocupantes devem ser informados explicitamente pelos gestores responsáveis.

## 5. Governança de dados

1. Não inferir designações a partir de certificados, histórico, matrícula LMS, função parecida ou treinamento já realizado.
2. Não usar `setores_responsaveis_compliance` como fonte de RBAC ou como substituto de designações técnicas.
3. Não usar designação para reduzir regra ampla da matriz sem nova decisão explícita da Gerência de Treinamento.
4. Toda regra deve permanecer tenant-scoped (`empresa_id`).
5. Alteração de schema/dados remotos segue Schema V2, recovery point, ledger e pós-validação.
6. Produção exige autorização explícita, atual e específica para SHA/change/escopo.

## 6. Estado técnico relacionado

- `training-compliance-matrix-alignment-0526`: **aplicado e validado em staging** pelo workflow oficial `Staging D1 Schema Change (Safe Recovery Point)`, run `37152837890`, usando release SHA `422d4bb96b7ba92d7e722fdf563ce1262e7b7447`. SQL SHA-256 `1473d8815f4dff920672c50db70f171f3c915e73c95f1d4852a531366f785f77`; recovery point D1 `2026-10-03T20:49:45Z`; ledger confirmado; preflight e pós-condições da matriz V4 concluídos com PASS.
- `training-compliance-loft-bootstrap-0527`: bootstrap de LOFT corrigido e validado em staging antes da 0526.
- `setor-compliance-responsibles-0528`: integrado; é aditivo e independente das designações técnicas de Compliance. Remote apply permanece governado separadamente.

A SQL canônica da 0526 permanece imutável. Avanço posterior de `main` não altera a evidência da aplicação executada no SHA acima nem autoriza produção.

## 7. Cursos EAD — princípio de implementação

Para cursos EAD criados ou refeitos por esta frente:

- SCORM 1.2, Single SCO;
- pacote com `imsmanifest.xml` na raiz;
- fonte de tela legível (padrão atual: >= 20 px quando aplicável ao template);
- conteúdo técnico/regulatório preservado;
- interação e feedback de avaliação;
- `requiredSlides` / `requiredInteractions` quando usados pelo template;
- resume/suspend data funcionando;
- Preview read-only;
- nenhum EAD deve declarar, por si só, conclusão de componente prático obrigatório sem a respectiva evidência.

## 8. Próximos passos operacionais

1. Executar o caso real/QA do Compliance em staging contra a matriz V4 já aplicada.
2. Receber dos gestores apenas as listas de designações específicas do checklist V4.
3. Inserir essas designações pelo fluxo auditável do AirTrust; não inferir ocupantes.
4. Completar e fazer QA dos EADs ausentes ou ainda não publicados, verificando antes o catálogo/R2 live para evitar duplicidade.
5. Somente após staging + validação real, formar candidato de produção e solicitar autorização específica.