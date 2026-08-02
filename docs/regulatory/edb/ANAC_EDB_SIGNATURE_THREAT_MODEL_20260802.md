# AirTrust — Threat Model de Assinaturas do eDB

> **Data:** 2026-08-02 (BRT)  
> **SHA-base:** `d27d72178a75664ff0fb8ac8f18768b88b8112ca`  
> **Status:** análise; não define validade jurídica, provider ou algoritmo definitivo  
> **Parent:** issue #693; baseline regulatório na PR #688

## 1. Objetivo

Identificar ameaças, controles e decisões necessárias para que as futuras assinaturas do Diário de Bordo Digital possam demonstrar:

- identidade positiva do signatário;
- controle exclusivo do meio de assinatura;
- intenção inequívoca e ação deliberada;
- associação permanente entre assinatura e conteúdo;
- integridade, rastreabilidade e não repúdio;
- preservação do original em correções;
- funcionamento compatível com PED e indisponibilidade de comunicação;
- isolamento multi-tenant.

Este documento não declara que autenticação JWT, senha, hash, certificado ou qualquer combinação já utilizada pelo AirTrust atende à Resolução ANAC nº 458/2017.

## 2. Escopo

### Atos considerados

1. assinatura do piloto em comando — PIC;
2. assinatura de quem registra discrepância;
3. assinatura de quem aprova retorno ao serviço;
4. contrassinatura do operador ou pessoa formalmente designada;
5. assinatura digital de página impressa ou exportação;
6. correção ou substituição de registro anteriormente assinado;
7. assinatura ou confirmação executada sem comunicação.

### Fora do escopo

- escolha comercial de autoridade certificadora;
- compra ou emissão de certificado;
- implementação de HSM/KMS;
- migration;
- deploy;
- ativação oficial;
- interpretação jurídica definitiva.

## 3. Estado de autenticação utilizado como ponto de partida

A documentação interna atual descreve autenticação por JWT simétrico, access token de curta duração, refresh token rotativo, blocklist, RBAC e isolamento por `empresa_id`. O código e os contratos de `origin/main` prevalecem sobre essa documentação.

Esse mecanismo pode autenticar uma sessão, mas não prova sozinho:

- que o titular controlava exclusivamente o meio no instante do ato;
- que revisou aquele conteúdo específico;
- que declarou intenção de assinar para uma finalidade específica;
- que a confirmação não foi reutilizada;
- que o conteúdo não mudou após a confirmação;
- que uma assinatura offline possui data e cadeia de confiança adequadas;
- que a evidência continuará verificável depois da expiração ou revogação de credenciais.

Conclusão: **login e assinatura devem ser domínios separados**.

## 4. Ativos protegidos

- conteúdo canônico da versão do registro;
- identidade e prerrogativas do signatário;
- intenção de assinatura;
- chaves privadas e credenciais;
- certificado e cadeia de confiança;
- evidência temporal;
- envelope de assinatura;
- vínculo entre assinatura, operador, aeronave, volume e versão;
- estado de revogação conhecido no momento do ato;
- histórico de correções;
- eventos de auditoria regulatória;
- dados locais no PED;
- fila de operações offline;
- exportações e páginas assinadas.

## 5. Fronteiras de confiança

```text
Usuário
  │
  ├─ credencial de autenticação
  ▼
Frontend/PED ── conteúdo apresentado ── intenção deliberada
  │                                      │
  │ rede ou fila offline                 │
  ▼                                      ▼
Worker/API ── autorização e tenant ── Signature Provider
  │                                      │
  ▼                                      ▼
D1/R2/arquivo regulado             certificado, chave, timestamp
  │
  ▼
Fiscalização, exportação e verificador independente
```

Fronteiras críticas:

- navegador/PED pode estar comprometido;
- sessão JWT pode ter sido roubada;
- relógio local não é confiável isoladamente;
- Worker e provider podem estar temporariamente indisponíveis;
- tenant ativo pode mudar;
- cadastro do usuário, operador ou aeronave pode mudar depois do ato;
- terceiro de manutenção pode ter prerrogativa limitada e temporária;
- o conteúdo operacional de `cv_*` pode mudar depois da assinatura.

## 6. Ameaças e controles mínimos

<!-- prettier-ignore -->
| ID | Ameaça | Cenário | Consequência | Controles mínimos | Evidência/teste |
|---|---|---|---|---|---|
| SIG-001 | Sessão roubada | Atacante usa access token válido para assinar | Falsa autoria | Reautenticação ou fator adicional por ato; intenção de uso único; contexto do signatário | Teste com token roubado sem fator de assinatura |
| SIG-002 | Confirmação reutilizada | Uma confirmação assina dois conteúdos | Associação inválida | `intent_id` único, hash e finalidade vinculados; consumo atômico; expiração curta | Replay do mesmo intent para outro hash |
| SIG-003 | Conteúdo alterado após revisão | Frontend mostra A, servidor grava B | Registro não corresponde à intenção | Conteúdo canônico congelado; hash exibido/derivado; assinatura sobre o hash; comparação server-side | Alteração de um byte falha na verificação |
| SIG-004 | Finalidade trocada | Confirmação de ciência vira assinatura de PIC | Ato com sentido jurídico diferente | `purpose` obrigatório e assinado; texto de intenção específico | Troca de purpose invalida envelope |
| SIG-005 | Tenant ou aeronave trocados | Intent criado em empresa A é aplicado em B | Violação multi-tenant e falsa vinculação | Tenant, operador, aeronave, volume e versão no envelope; verificação de ownership | Tentativa cross-tenant negada |
| SIG-006 | Prerrogativa expirada | Mecânico ou designado assina após expiração | Retorno ao serviço ou contrassinatura inválidos | Validação de prerrogativa no preparo e no commit; snapshot da licença/designação | Expiração entre preparo e commit |
| SIG-007 | Integração assina automaticamente | SIGVOOS ou job aplica assinatura | Ausência de ação deliberada | Providers inacessíveis a integrações; actor humano obrigatório; rota separada | Teste garante que importação nunca cria assinatura |
| SIG-008 | Administrador assina por outro | Impersonação ou role elevada permite assinatura alheia | Não repúdio comprometido | Proibir assinatura em sessão impersonada; identidade própria e fator próprio | Sessão impersonada rejeitada |
| SIG-009 | Correção apaga o original | Atualização in-place substitui conteúdo assinado | Perda de histórico | Append-only; nova versão; assinatura anterior preservada e marcada como substituída | Teste de correção mantém bytes anteriores |
| SIG-010 | Revogação ignorada | Certificado estava revogado no momento do ato | Assinatura não confiável | Política de validação, OCSP/CRL ou método aceito; guardar resposta e horário | Certificado revogado simulado |
| SIG-011 | Certificado expira depois | Verificação futura falha sem evidência histórica | Acervo perde verificabilidade | Preservar cadeia, política, timestamp e evidências de validação | Verificação tardia com certificado expirado |
| SIG-012 | Chave privada exposta | Chave em código, banco ou PED sem proteção | Assinaturas fraudulentas em escala | HSM/KMS/token seguro conforme método; nunca exportar chave; rotação e resposta | Scan de segredo e exercício de comprometimento |
| SIG-013 | Relógio manipulado | PED offline retrodata assinatura | Ordem e prazo falsos | Contador monotônico, último tempo confiável, timestamp posterior e marcação de incerteza | Clock rollback e fuso incorreto |
| SIG-014 | Comando offline duplicado | Sincronização envia o mesmo ato várias vezes | Duas assinaturas/eventos | ID idempotente, anti-replay e commit atômico | Sincronização repetida produz um evento |
| SIG-015 | Comandos offline fora de ordem | Correção chega antes do original | Cadeia inconsistente | Sequência por dispositivo/registro, dependências e quarentena | Reordenação controlada em teste |
| SIG-016 | PED perdido ou revogado | Dispositivo continua assinando | Uso não autorizado | Registro de dispositivo, revogação, chave vinculada, validade curta e bloqueio de sync | Assinatura após revogação rejeitada |
| SIG-017 | Malware altera UI | Usuário vê resumo diferente do payload | Intenção não informada | Tela de revisão derivada do mesmo objeto canônico; confirmação de campos críticos; hardening PED | Teste de discrepância UI/payload |
| SIG-018 | Log contém credencial ou conteúdo | Evidências vazam PII/chave/token | Incidente de segurança/LGPD | Logs com IDs, códigos e resultado; proibir payload, token, certificado privado e segredo | Guard de sanitização e revisão de logs |
| SIG-019 | Provider indisponível | Voo termina sem conseguir assinar | Paralisação operacional | Procedimento offline/contingência aceito; estados claros; retry idempotente | Simulação de indisponibilidade total |
| SIG-020 | Provider comprometido | Serviço externo aceita assinatura sem controle | Fraude sistêmica | Separação de deveres, verificação independente, auditabilidade, contrato e monitoramento | Teste independente e incidente simulado |
| SIG-021 | Exportação divergente | PDF não representa o registro assinado | Fiscalização recebe conteúdo incorreto | Exportar do snapshot assinado; hash/versão visíveis; assinatura da exportação | Golden test e comparação de hash |
| SIG-022 | Algoritmo ou schema muda | Nova release muda bytes canônicos | Assinaturas antigas deixam de validar | Versionar schema, canonicalização, algoritmo e método de cumprimento | Fixtures de verificação por versão |
| SIG-023 | Exclusão por retenção comum | Job apaga registro regulado | Violação de guarda | Política de retenção separada; sem delete funcional; hold regulatório | Teste de retenção e permissão |
| SIG-024 | Uso oficial sem autorização | Flag é ativada sem EO/LOA | Registro irregular | Gate por ato autorizativo, operador e aeronave; environment protegido | Teste de ativação sem autorização |

## 7. Envelope conceitual de assinatura

O envelope deve ser independente da sessão e suficiente para verificação posterior.

```json
{
  "envelope_version": "edb.signature.v1",
  "signature_id": "uuid",
  "intent_id": "uuid-one-time",
  "purpose": "PIC_FLIGHT_RECORD",
  "tenant_id": 7,
  "operator_legal_id": "snapshot",
  "aircraft_registration": "snapshot",
  "volume_id": "uuid",
  "record_id": "uuid",
  "record_version": 1,
  "content_schema_version": "edb.record.v1",
  "content_hash": "algorithm:value",
  "previous_version_hash": null,
  "signer": {
    "user_id": 123,
    "person_reference": "internal-reference",
    "canac_or_license": "snapshot",
    "role_or_prerogative": "snapshot"
  },
  "authentication_context": {
    "method": "to-be-approved",
    "reauthenticated_at": "RFC3339",
    "device_id": "uuid-or-null",
    "impersonated": false
  },
  "signature": {
    "method": "to-be-approved",
    "algorithm": "versioned",
    "value": "opaque",
    "certificate_chain_reference": "opaque-or-null",
    "revocation_evidence_reference": "opaque-or-null",
    "timestamp_evidence_reference": "opaque-or-null"
  },
  "signed_at_claimed": "RFC3339",
  "accepted_at_server": "RFC3339-or-null",
  "offline_sequence": null
}
```

O exemplo é um contrato de análise, não uma definição final de banco ou API.

## 8. Ciclo de intenção

1. servidor valida identidade, tenant, prerrogativa e estado do registro;
2. servidor congela ou referencia um snapshot imutável;
3. servidor cria `intent_id` de uso único, com finalidade, hash e expiração;
4. PED apresenta o conteúdo e a declaração específica;
5. usuário executa reautenticação/fator exigido;
6. provider produz a evidência sobre o hash e a finalidade;
7. servidor revalida estado, prerrogativa e não utilização do intent;
8. commit atômico grava assinatura e consome o intent;
9. verificador independente valida envelope e cadeia;
10. evento regulatório registra somente metadados sanitizados.

Para assinatura offline, as etapas 1 a 8 precisam de uma variante formalmente aceita. Não é seguro apenas guardar um clique local e convertê-lo em assinatura no retorno da rede.

## 9. Alternativas a levar à ANAC

### Alternativa A — assinatura individual online com autenticação reforçada

**Descrição:** PIC ou mantenedor revisa o conteúdo, reautentica e assina enquanto conectado; o operador aplica assinatura digital própria posteriormente.

**Vantagens:** menor exposição de chaves no PED; revogação e timestamp imediatos; implementação mais simples.

**Limitações:** sem procedimento aceito, indisponibilidade de rede pode impedir o ato obrigatório.

### Alternativa B — chave individual protegida no PED

**Descrição:** dispositivo provisionado executa assinatura criptográfica local, depois sincroniza o envelope imutável.

**Vantagens:** operação realmente stand-alone.

**Limitações:** MDM, secure enclave/keystore, revogação, troca de dispositivo, evidência temporal e suporte multiplataforma tornam o método significativamente mais complexo.

### Alternativa C — assinatura eletrônica individual offline + assinatura digital do operador

**Descrição:** PED registra ato individual robusto offline; o operador assina digitalmente o registro ou página após sincronização.

**Vantagens:** separa identidade operacional da chave institucional.

**Limitações:** a combinação e seus efeitos de não repúdio devem ser expressamente aceitos; assinatura do operador não pode mascarar ausência de ato válido do PIC.

### Alternativa D — certificado individual ICP-Brasil por signatário

**Descrição:** cada pessoa utiliza certificado individual compatível com o ato.

**Vantagens:** cadeia jurídica conhecida.

**Limitações:** emissão, renovação, uso em PED/offline, suporte operacional e custo; confirmar se é exigido ou apenas uma alternativa.

## 10. Recomendação condicionada

Antes da reunião prévia, a arquitetura deve permanecer provider-agnostic.

A preferência técnica preliminar é:

1. conteúdo canônico e Regulated Records Core independentes do provider;
2. intenção de uso único e finalidade explícita;
3. assinatura individual separada da assinatura digital do operador;
4. provider com interface de preparar, assinar, verificar, consultar revogação e exportar evidência;
5. suporte a verificação independente e versões antigas;
6. escrita offline somente depois de aceitação explícita do método.

Nenhuma dessas preferências substitui a manifestação da ANAC.

## 11. Perguntas regulatórias prioritárias

1. Qual ato exige certificado ICP-Brasil individual?
2. Assinatura eletrônica individual reforçada, combinada com assinatura digital do operador, atende ao PIC?
3. Qual evidência de autenticação reforçada é esperada?
4. Qual trusted timestamp é exigido para assinatura online e offline?
5. Como preservar validade após expiração/revogação posterior do certificado?
6. É aceita chave de dispositivo protegida por secure enclave/keystore?
7. Como tratar assinatura offline e o horário jurídico do ato?
8. A contrassinatura do operador pode ser automatizada com certificado institucional ou exige ação humana deliberada?
9. Qual informação de certificado/revogação deve acompanhar exportações?
10. Quais alterações de provider, algoritmo ou canonicalização exigem novo ateste?

## 12. Evidências exigidas antes de provider produtivo

- threat model revisado;
- decisão regulatória registrada;
- arquitetura de chaves e certificados;
- cerimônia de provisionamento e revogação;
- testes de replay, adulteração e cross-tenant;
- teste de sessão roubada e impersonação;
- teste de assinatura offline, se aplicável;
- verificador independente;
- teste de expiração e revogação;
- teste de recuperação após indisponibilidade;
- teste de correção preservando original;
- teste de portabilidade e verificação tardia;
- avaliação independente sem achado crítico ou alto pendente.

## 13. Critérios de bloqueio

Não implementar provider produtivo ou ativar assinatura quando houver:

- dúvida não resolvida sobre o método aceito;
- chave privada exportável ou compartilhada;
- possibilidade de assinatura em sessão impersonada;
- ausência de vínculo entre finalidade, hash e versão;
- intent reutilizável;
- alteração in-place de registro assinado;
- ausência de verificação de prerrogativa;
- impossibilidade de verificar assinatura antiga;
- offline baseado apenas em timestamp do dispositivo;
- acesso cross-tenant;
- ativação oficial sem ato autorizativo.

## 14. Próximo passo

Usar este threat model como anexo técnico da issue #693 e extrair suas dez perguntas prioritárias para o pacote de FOP 200 da issue #690. Depois da manifestação da ANAC, publicar um ADR de decisão do método de assinatura antes de qualquer código produtivo.
