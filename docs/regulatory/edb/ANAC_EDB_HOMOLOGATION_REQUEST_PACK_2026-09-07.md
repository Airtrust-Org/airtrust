# ANAC eDB — homologation / technical-contract request pack

Date: 2026-09-07  
Issue: #93  
Purpose: prepare an exact external-information request without inventing API behavior.

## Confirmed regulatory/procedural basis

- Resolução ANAC nº 773/2025 governs the Diário de Bordo from 2026-01-01.
- Article 4 requires a request to ANAC for use of digital records and points to the specific regulation for computerized systems.
- Portaria ANAC nº 3.220/SPO/SAR/2019 establishes the reference model for electronic logbooks (eDB) and has later amendments, including changes published in 2024.
- Portaria ANAC nº 9.705/STI/2022 establishes requirements for acceptance of eDB systems. For the acceptance route described in its art. 2º, connection with the ANAC database must be explicitly demonstrated.
- For RBAC 135 operators, ANAC's current records-digitalization/service flow identifies the process `Certificação 135: E.O. – Utilização de registros digitais`, including FOP 219, D-144-01, FAI, revised operator manuals and software-conformity evidence when applicable; FOP 200 is used when a prior meeting is needed.
- ANAC's PDTIC identifies an institutional initiative for the Diário de Bordo API, but that planning document is not a technical API contract.
- The public homologation Swagger shell at `https://homologacao-api-diariodebordo.anac.gov.br/api/docs/index.html` does not currently expose a usable API definition; the observed `/api/docs/v1/swagger.json` path returns Not Found.

Official references reviewed:

- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2025/resolucao-773
- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias/2019/portaria-no-3220-spo-sar-15-10-2019
- https://www.anac.gov.br/assuntos/legislacao/legislacao-1/portarias/2022/portaria-9705-1
- https://www.gov.br/anac/pt-br/assuntos/regulados/programa-de-transformacao-digital/registros-de-manutencao
- https://www.gov.br/pt-br/servicos/solicitar-alteracao-de-certificado-de-operador-aereo-ou-especificacoes-operativas-de-autorizatario
- https://www.gov.br/anac/pt-br/assuntos/regulados/empresas-aereas/modelos-e-formularios/tabela-5
- https://www.gov.br/anac/pt-br/acesso-a-informacao/acoes-e-programas/governanca/plano-de-gestao-anual/PDTIC2024_2026.pdf

## Exact information required from ANAC

The request should ask ANAC to provide or formally identify the **current, versioned** material for the Diário de Bordo digital integration, including:

1. homologation base URL and environment-identification rules;
2. current OpenAPI/Swagger JSON/YAML or equivalent technical contract;
3. procedure for obtaining homologation credentials;
4. authentication mechanism, authorization model and scopes;
5. endpoint list and supported operations;
6. request/response DTOs, required/optional fields, enums and versioning rules;
7. validation rules and canonical error model;
8. idempotency semantics and duplicate-submission behavior;
9. retry guidance, timeout behavior and rate limits;
10. receipt, acceptance, rejection and later-status semantics;
11. digital-signature, certificate, hash or non-repudiation requirements;
12. requirements for operator/designated-person signature under the RBAC 135 lifecycle;
13. requirements for corrections/amendments while preserving prior information;
14. sandbox/homologation test cases and acceptance criteria;
15. exact evidence expected to demonstrate the ANAC-database connection required by the applicable acceptance route;
16. relationship between the current API contract and the eDB reference model established by Portaria 3.220 and its amendments;
17. procedure and evidence required to progress from homologation to production;
18. production credential issuance/rotation/revocation procedure;
19. change-notification/version-deprecation policy;
20. technical support channel for contract/environment incidents.

## Suggested formal request text

> A Costa do Sol Táxi Aéreo, operador certificado segundo o RBAC 135, está preparando a homologação de solução informatizada para registros de Diário de Bordo em conformidade com a Resolução ANAC nº 773/2025, a Resolução nº 458/2017, as Portarias ANAC nº 3.220/SPO/SAR/2019 e nº 9.705/STI/2022 e demais normas aplicáveis. Para evitar implementação baseada em inferência e assegurar aderência ao contrato técnico vigente da Agência, solicitamos a disponibilização ou indicação formal da documentação técnica atual da API de Diário de Bordo, incluindo contrato OpenAPI/Swagger ou equivalente, ambiente e credenciais de homologação, autenticação e escopos, endpoints/DTOs/enums, regras de validação, idempotência e tratamento de erros, semântica de recibo/aceite/rejeição, requisitos de assinatura e certificados, critérios de homologação e procedimento de progressão para produção. Solicitamos ainda orientação sobre a forma de demonstrar a conexão com a base de dados da ANAC prevista na Portaria nº 9.705/STI/2022, o vínculo com o modelo de referência de eDB vigente, o canal técnico oficial e a política de versionamento/depreciação da integração.

The operator/legal identity, certificate details and process identifiers should be completed only by the authorized operator representative in the official submission surface. They must not be guessed or copied from unrelated records.

## Submission route already identified

For a RBAC 135 operator, the official ANAC material points to the certification/EO alteration process for use of digital records. The package must be aligned with the operator's actual certification case and normally references FOP 219 and the supporting digital-record documentation listed by ANAC. If a prior meeting is required, the published procedure identifies FOP 200.

This artifact does not submit the request. Formal filing must be performed by the authorized operator representative through the applicable ANAC/SEI/service channel with the operator's real certification identifiers.

## Verified official route and dispatch-ready bundle

The ANAC service page was rechecked on 2026-09-07.  For an RBAC 135 operator:

1. a prior orientation meeting is optional, but when requested it uses the
   current FOP 200 through ANAC Electronic Petitioning/SEI;
2. the formal EO/records-digital process uses FOP 219 and FAI;
3. when the software has not already been verified/attested by ANAC, the
   official list also requires D-144-01, revised operator manuals in the
   separate manual process, the Resolution 458 software-conformity checklist,
   and an Art. 3 conformity report from a competent entity;
4. the published service directs general service/process questions to Fale com
   a ANAC or telephone 163.

The send-ready bundle is therefore:

- the current official FOP 200, completed and signed only by the authorized
  Costa do Sol representative;
- the formal request text above as a controlled annex, with no credentials,
  tokens, endpoint guesses, or personal data;
- the current operator-specific FOP 200 package in `fop200/`, including the
  submission checklist, meeting script and decision register;
- the current MGO/maintenance-source and field-gap evidence needed to frame
  the questions; and
- an explicit request that ANAC either supplies the versioned technical
  integration contract or records that no public/partner contract is available
  for the proposed route.

The AirTrust team must not submit this bundle itself: operator authority,
current COA/EO data, signatory powers, the chosen aircraft scope and the SEI
process identity are outside this repository and must be supplied by the
operator.  This is an authorization boundary, not a missing software secret.

## Exact external dependency register

| Dependency | Needed before implementation | Current evidence | Owner / resolution path |
| --- | --- | --- | --- |
| Versioned OpenAPI/Swagger or equivalent API contract | Base URL, operations, DTOs, enums, validation and error model | No usable contract was found in the official public material reviewed; the public Swagger shell is not a usable definition. | ANAC technical/regulatory response through the documented process. |
| Homologation access procedure | Environment rules, credential issuance and support channel | The public procedure identifies the regulatory process, not reusable API credentials. | ANAC; credentials must remain outside Git. |
| Transport semantics | Auth/scopes, idempotency, retries, rate limits, receipt, acceptance/rejection and status | Not specified by the published rules or service page. | Versioned ANAC contract and homologation guidance. |
| Integrity/signature transport requirements | Certificate, hash, signature, correction and operator-signature representation | Published regulation states the regulated outcome, not an API payload or certificate protocol. | ANAC technical/regulatory confirmation. |
| Homologation-to-production progression | Entry criteria, test cases, approval evidence and production access | Formal EO process and demonstrations are published; technical transition contract is not. | ANAC process owner and technical support channel. |

The request is intentionally limited to obtaining those official materials. It
does not request or authorize data transmission, production activation, or an
implementation inference.

## AirTrust implementation gate

Until ANAC supplies or confirms the current technical contract:

- do not infer or hard-code endpoint paths beyond the public documentation shell;
- do not invent DTOs, auth flows, enums or acceptance states;
- do not transmit production or homologation data;
- do not treat transport success as regulatory acceptance;
- keep external ANAC integration fail-closed;
- continue implementing only provider-neutral internal eDB domain invariants supported by the published regulation.

## Closure evidence for #93

Issue #93 can move from external-blocked to implementation-ready only when the repository can record, without secrets:

- document/version identifier and provenance of the technical contract;
- confirmed homologation procedure;
- sanitized environment metadata (never credentials);
- mapping review from ANAC DTOs to AirTrust internal model;
- explicit unresolved-contract findings, if any.

Credentials themselves must remain outside Git and outside issue/PR text.
