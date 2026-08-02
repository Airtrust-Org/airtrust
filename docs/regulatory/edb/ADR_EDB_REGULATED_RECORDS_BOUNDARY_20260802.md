# ADR — Fronteira entre Controle de Voos e Registros Regulados do eDB

> **Status:** proposta para revisão  
> **Data:** 2026-08-02  
> **Decisão:** criar domínio regulado separado; `cv_*` não será convertido diretamente em Diário de Bordo oficial

## 1. Contexto

O Controle de Voos recebe ou produz dados operacionais que também aparecem no Diário de Bordo: etapas, tripulação, horários, tempos, combustível, POB, carga, natureza, ocorrências e discrepâncias.

Esses dados podem ser corrigidos por integrações, piloto ou coordenação. O eDB, por outro lado, deve preservar exatamente o conteúdo revisado e assinado, permitir correção sem apagar o original e demonstrar autenticidade, integridade, não repúdio, retenção e disponibilidade.

Transformar as tabelas `cv_*` diretamente no registro oficial criaria riscos:

- alteração retroativa de conteúdo assinado por sincronização do SIGVOOS;
- dependência de cadastros mutáveis;
- mistura de autorização operacional com validade jurídica;
- dificuldade de demonstrar uma única fonte oficial;
- soft delete incompatível com retenção regulatória;
- acoplamento de evolução do Controle de Voos ao método de cumprimento aceito pela ANAC.

## 2. Decisão

Criar três camadas explícitas.

### 2.1 Camada operacional

Responsabilidade: programação, execução, RDV, integração, conflito e coordenação.

Entidades existentes ou relacionadas:

- `cv_voos`;
- `cv_voo_etapas`;
- `cv_voo_tripulantes`;
- `cv_rdv_operacional`;
- `cv_voo_eventos`;
- staging e conflitos SIGVOOS.

Propriedades:

- editável conforme workflow operacional;
- pode receber dados externos;
- pode possuir valores incompletos;
- não possui valor oficial de Diário de Bordo;
- não é a fonte jurídica após assinatura.

### 2.2 Camada de projeção e revisão

Responsabilidade: montar um rascunho completo, validar os campos regulatórios e permitir revisão deliberada.

Proposta conceitual:

- `edb_drafts`;
- `edb_draft_sources`;
- `edb_validation_results`.

Propriedades:

- identifica a origem de cada campo;
- detecta mudanças na origem após a criação do rascunho;
- exige resolução explícita de conflito;
- não é registro oficial;
- pode ser descartada sem apagar evidência de auditoria operacional.

### 2.3 Camada regulada

Responsabilidade: guardar o acervo oficial e as evidências de assinatura.

Proposta conceitual, sem autorizar migration:

- `edb_volumes`;
- `edb_volume_terms`;
- `edb_records`;
- `edb_record_versions`;
- `edb_signatures`;
- `edb_operator_attestations`;
- `edb_technical_status_snapshots`;
- `edb_discrepancies`;
- `edb_return_to_service_actions`;
- `edb_read_acknowledgements`;
- `edb_devices`;
- `edb_sync_operations`;
- `edb_regulatory_audit_events`;
- `edb_exports`;
- `edb_reconstitution_cases`.

Propriedades:

- append-only após assinatura;
- sem `DELETE` funcional;
- correções por nova versão vinculada;
- snapshots independentes dos cadastros mutáveis;
- conteúdo canônico versionado;
- assinatura associada permanentemente ao conteúdo;
- retenção e exportação próprias;
- trilha de auditoria regulatória separada dos logs de aplicação.

## 3. Fluxo de dados

```text
SIGVOOS ─────┐
             ├──> Controle de Voos (`cv_*`) ──> projeção eDB não oficial
Entrada manual┘                                  │
                                                 ├─ validações de completude
                                                 ├─ conflitos de origem
                                                 └─ revisão deliberada do PIC
                                                            │
                                                            ▼
                                              snapshot canônico imutável
                                                            │
                                              assinatura eletrônica PIC
                                                            │
                                              assinatura digital operador
                                                            │
                                                            ▼
                                                 volume eDB oficial
```

Regras:

1. importação nunca aplica assinatura;
2. alteração em `cv_*` depois da assinatura não altera o registro regulado;
3. correção do eDB cria nova versão e invalida a assinatura substituída sem removê-la;
4. exportação sempre declara a versão e permite verificar o hash;
5. o status oficial só pode ser ativado para operador/aeronave abrangidos por autorização.

## 4. Modelo de conteúdo canônico

Cada versão assinável deve ser serializada conforme um schema versionado e determinístico.

Envelope conceitual:

```json
{
  "schema_version": "edb.record.v1",
  "record_id": "uuid",
  "version": 1,
  "volume_number": "NN/CC-MMM/AAAA",
  "operator": {
    "legal_id": "snapshot",
    "legal_name": "snapshot"
  },
  "aircraft": {
    "manufacturer": "snapshot",
    "model": "snapshot",
    "serial_number": "snapshot",
    "registration": "CC-MMM"
  },
  "flight": {},
  "technical_status": {},
  "occurrences": [],
  "previous_version_hash": null,
  "created_at": "RFC3339 UTC"
}
```

Decisões obrigatórias antes da implementação:

- algoritmo de canonicalização;
- política de números decimais e unidades;
- timezone e representação dos quatro horários;
- tratamento de `null`, campo não aplicável e campo desconhecido;
- versionamento do schema;
- algoritmo de hash e assinatura;
- trusted timestamp;
- validação e revogação de certificados;
- conservação das evidências criptográficas após expiração do certificado.

## 5. Assinaturas

O sistema deve tratar separadamente:

- assinatura eletrônica individual do PIC;
- assinatura eletrônica de quem registra discrepância;
- assinatura eletrônica de quem aprova retorno ao serviço;
- assinatura digital do operador ou pessoa formalmente designada;
- assinatura digital de páginas/exportações, quando aplicável.

O provedor deve ser abstrato até confirmação do método de cumprimento:

```text
SignatureProvider
├── prepareIntent(contentHash, signer, purpose)
├── sign(intent, credential)
├── verify(signatureEnvelope)
├── checkRevocation(certificate)
└── exportEvidence(signatureEnvelope)
```

A sessão JWT pode identificar o usuário, mas não substitui o ato deliberado de assinatura.

Requisitos mínimos do ato:

- reautenticação ou autenticação reforçada;
- apresentação do conteúdo e do propósito;
- declaração inequívoca de intenção;
- ação explícita;
- confirmação de sucesso;
- geração de envelope de evidência;
- impossibilidade de reutilizar a confirmação para outro conteúdo.

## 6. Situação técnica

O eDB deve possuir uma fronteira clara com manutenção.

O snapshot pré-voo inclui:

- última intervenção relevante;
- responsável pelo retorno ao serviço;
- próxima intervenção;
- horas de célula previstas;
- discrepâncias abertas;
- ações corretivas ou retardadas.

O eDB não precisa inicialmente substituir todo o MRO, mas deve:

- receber informação de fonte controlada;
- identificar a fonte e o responsável;
- impedir voo sem ciência requerida;
- registrar retorno ao serviço com identidade e assinatura;
- preservar o conteúdo exibido ao PIC.

## 7. Offline e sincronização

### 7.1 Princípios

- PED deve funcionar sem comunicação;
- conteúdo local deve ser cifrado;
- assinaturas e eventos devem possuir identificadores idempotentes;
- o servidor não pode reordenar ou modificar conteúdo assinado;
- conflito deve ser explícito;
- relógio do dispositivo não é fonte temporal confiável isoladamente.

### 7.2 Opções a validar com a ANAC

**Opção A — assinatura apenas online:** mais simples, mas incompatível com indisponibilidade de comunicação sem um procedimento de contingência aceito.

**Opção B — assinatura offline verificável:** o PED produz envelope assinado localmente e o servidor apenas valida e registra na sincronização. Exige gestão robusta de chaves, dispositivo, revogação e evidência temporal.

**Opção C — procedimento híbrido:** assinatura eletrônica offline individual e assinatura digital posterior do operador/servidor. A validade regulatória da combinação deve ser confirmada.

A implementação não deve escolher uma opção antes da reunião prévia.

## 8. Fonte oficial e feature flags

Devem existir estados distintos:

- `disabled`: módulo indisponível;
- `shadow`: cópia sem valor oficial, papel permanece oficial;
- `authorized_pending_migration`: autorização emitida, migração ainda em curso;
- `official`: eDB é a fonte oficial para aeronave/operador autorizados;
- `suspended`: uso oficial interrompido por procedimento regulatório;
- `decommissioning`: descontinuidade submetida à ANAC.

A flag deve ser aplicada por operador e aeronave, com referência ao ato autorizativo. Uma configuração genérica de tenant não é suficiente.

## 9. Segurança multi-tenant

- todas as tabelas reguladas devem possuir `empresa_id` e filtros obrigatórios;
- o operador legal deve ser snapshot e não apenas FK;
- acesso de terceiros de manutenção deve ser limitado ao registro/tarefa e período;
- fiscal não pode receber acesso cross-tenant;
- exportações devem ser geradas por escopo fechado e auditado;
- nenhuma assinatura pode ser movida entre tenant, aeronave, volume ou versão.

## 10. Consequências

### Positivas

- reduz risco de alteração retroativa;
- permite evolução do Controle de Voos sem reateste automático;
- torna o método de cumprimento auditável;
- facilita shadow mode e migração controlada;
- permite reutilizar o núcleo regulado futuramente pelo SDRMe sem misturar os domínios.

### Custos

- duplicação intencional por snapshot;
- nova infraestrutura de assinatura, retenção e offline;
- maior disciplina de versionamento;
- necessidade de avaliação independente e gestão de mudanças.

## 11. Alternativas rejeitadas

### A. Tornar `cv_rdv_operacional` o Diário de Bordo

Rejeitada porque o RDV é editável, agregado e dependente do fluxo operacional.

### B. Gerar PDF e tratar o arquivo como registro oficial

Rejeitada porque PDF isolado não resolve identidade, assinatura, correção, pesquisa, situação técnica, offline, retenção, auditoria e reconstituição.

### C. Usar somente audit log

Rejeitada porque log não substitui snapshot assinado nem garante associação permanente da assinatura ao conteúdo.

### D. Aplicar blockchain como requisito automático

Rejeitada. A Resolução nº 458 apresenta alternativas de demonstração de segurança. A escolha do método deve ser validada com a ANAC e não deve introduzir complexidade sem necessidade.

## 12. Gate para sair de proposta

Este ADR só poderá ser marcado como aceito após:

- revisão técnica de segurança;
- revisão operacional de pilotos, OCC e manutenção;
- reunião prévia e registro da orientação da ANAC;
- escolha documentada do método de assinatura e demonstração de segurança;
- validação do modelo offline/PED;
- aprovação do plano de migrations e retenção.
