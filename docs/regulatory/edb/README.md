# AirTrust — Diário de Bordo Digital (eDB)

> **Baseline:** 2026-08-02 (BRT)  
> **SHA-base:** `d27d72178a75664ff0fb8ac8f18768b88b8112ca` (`origin/main`)  
> **Status:** análise e planejamento; não autoriza uso oficial, migration, deploy ou substituição do papel  
> **Escopo:** Diário de Bordo Digital para operadores, com ênfase inicial em RBAC 135

## Finalidade

Este diretório concentra a frente canônica de preparação do AirTrust para o Diário de Bordo Digital — eDB.

O objetivo é separar quatro assuntos que não podem ser confundidos:

1. **Controle de Voos/RDV operacional:** fonte de dados operacionais, atualmente não regulada como Diário de Bordo oficial.
2. **Software eDB:** conjunto de software, dispositivos e elementos necessários ao funcionamento do Diário de Bordo eletrônico.
3. **Ateste/aceitação do software:** demonstração de conformidade do sistema com a Resolução ANAC nº 458/2017 para um escopo explicitamente autorizado.
4. **Autorização do operador:** alteração de EO para RBAC 119/135, ou LOA nos demais casos, antes de substituir o Diário de Bordo impresso.

Nenhum artefato deste diretório permite afirmar que o AirTrust está homologado, aprovado, atestado ou autorizado pela ANAC.

## Ordem de precedência

Para esta frente, prevalecem:

1. legislação e orientações oficiais vigentes da ANAC;
2. código, schema, contratos e workflows presentes em `origin/main`;
3. este baseline datado;
4. documentos históricos do repositório.

Os documentos anteriores permanecem úteis como histórico, mas não devem ser tratados como baseline vigente sem reconciliação, especialmente:

- `docs/ANAC_HOMOLOGACAO_AIRTRUST_DB_DIGITAL_SDRME_CONTROLE_VOOS.md`;
- `docs/ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv`;
- `docs/DOSSIE_REGULATORIO_ANAC_AIRTRUST_DB_SDRME_CONTROLE_VOOS.md`;
- `docs/ANAC_BRIEFING_CONSULTOR_REGULATORIO.md`.

Esses arquivos foram produzidos antes da vigência da Resolução nº 773/2025 e misturam eDB, SDRMe, Controle de Voos e FRMS. Não são apagados nem reescritos por esta frente.

## Artefatos deste baseline

- `ANAC_EDB_REGULATORY_BASELINE_20260802.md`: interpretação operacional das normas oficiais.
- `ANAC_EDB_COMPLIANCE_MATRIX_20260802.csv`: requisito por requisito, componente, status, evidência e gate.
- `ADR_EDB_REGULATED_RECORDS_BOUNDARY_20260802.md`: fronteira arquitetural entre `cv_*` e o domínio regulado.
- `ANAC_EDB_RBAC135_SUBMISSION_PLAN_20260802.md`: estratégia de FOP 200, ateste do software e alteração de EO.
- `ANAC_EDB_IMPLEMENTATION_PLAN_20260802.md`: divisão em PRs pequenas, testes e critérios de saída.

## Fontes oficiais consultadas

Consulta realizada em 2026-08-02:

- Resolução ANAC nº 773, de 25 de junho de 2025: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-773
- Resolução ANAC nº 458, de 20 de dezembro de 2017, texto compilado: https://antigo.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2017/resolucao-no-458-20-12-2017
- Portaria nº 3.220/SPO/SAR, de 15 de outubro de 2019, compilada até a Portaria nº 15.103/SPO/2024: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias/2019/portaria-no-3220-spo-sar-15-10-2019
- Serviço oficial “Registros de Manutenção”, que descreve o fluxo de ateste de software e autorização de uso: https://www.gov.br/anac/pt-br/assuntos/regulados/programa-de-transformacao-digital/registros-de-manutencao
- Serviço oficial para alteração de certificação/EO de operadores RBAC 135: https://www.gov.br/pt-br/servicos/solicitar-alteracao-de-certificado-de-operador-aereo-ou-especificacoes-operativas-de-autorizatario
- IS nº 119-004, Revisão J: https://www.anac.gov.br/assuntos/legislacao/legislacao-1/boletim-de-pessoal/2023/bps-v-18-no-42-16-a-20-10-2023/is-119-004/visualizar_ato_normativo
- Modelos e formulários RBAC 135: https://www.gov.br/anac/pt-br/assuntos/regulados/empresas-aereas/modelos-e-formularios/tabela-5

## Gates obrigatórios

Antes de qualquer operação oficial:

- o método de cumprimento deve ser validado em reunião prévia com a ANAC;
- o software deve possuir o ateste/aceitação exigido para o escopo;
- o operador deve obter a autorização aplicável em EO ou LOA;
- os manuais do operador devem estar aceitos/aprovados conforme o processo aplicável;
- a migração do papel para o eDB deve seguir o prazo e o escopo autorizados;
- deve existir evidência independente de segurança e conformidade;
- o AirTrust deve demonstrar offline/PED, assinaturas, integridade, retenção, recuperação e fiscalização.

## Regra de segurança do projeto

Até o encerramento formal desses gates:

- o Controle de Voos pode gerar **rascunhos** e evidências de shadow mode;
- nenhum registro AirTrust deve ser apresentado como Diário de Bordo oficial;
- o papel permanece a fonte oficial do operador;
- não será criada migration de produção, ativação por tenant ou deploy regulado nesta frente documental.
