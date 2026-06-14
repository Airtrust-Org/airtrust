# AirTrust Regulated Records Core — Red Team Review

> **Tipo:** revisão crítica adversarial (red team) — somente documentação
> **Data:** 2026-06-14
> **Modelo:** Claude Opus 4.8
> **Alvo da revisão:** `docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md`
> **Status:** crítica interna; não é orientação jurídica/regulatória; não submetida à ANAC
> **Restrição:** nenhuma alteração de código, banco, migrations, deploy, secrets ou produção. Revisão fundamentada em leitura estática do repositório.
>
> **Postura desta revisão:** o objetivo NÃO é validar o documento de design. É tentar quebrá-lo antes que ele vire ADR físico, schema, migration e código regulado. Onde o design está correto, isto é dito brevemente. Onde está frágil, incompleto ou perigoso, o foco é total.

---

## Índice

1. [Veredito Executivo](#1-veredito-executivo)
2. [Top 15 Riscos Técnicos](#2-top-15-riscos-técnicos)
3. [Pontos Fortes do Desenho](#3-pontos-fortes-do-desenho)
4. [Pontos Fracos ou Ausentes](#4-pontos-fracos-ou-ausentes)
5. [Revisão de Imutabilidade](#5-revisão-de-imutabilidade)
6. [Revisão de Assinatura](#6-revisão-de-assinatura)
7. [Revisão de Offline/PED/Tablet](#7-revisão-de-offlinepedtablet)
8. [Revisão de Timestamp](#8-revisão-de-timestamp)
9. [Revisão de Hash/Canonicalização](#9-revisão-de-hashcanonicalização)
10. [Revisão de Backup/Restore](#10-revisão-de-backuprestore)
11. [Revisão de Modo Fiscalização](#11-revisão-de-modo-fiscalização)
12. [Revisão de Integração entre Módulos](#12-revisão-de-integração-entre-módulos)
13. [Decisões que Precisam de Consultor antes de Código Regulado](#13-decisões-que-precisam-de-consultor-antes-de-código-regulado)
14. [Recomendações de Alteração no Design Atual](#14-recomendações-de-alteração-no-design-atual)
15. [Sequência Recomendada de Implementação Segura](#15-sequência-recomendada-de-implementação-segura)
16. [Prompt Recomendado para Próxima Etapa](#16-prompt-recomendado-para-próxima-etapa)

---

## 1. Veredito Executivo

**O desenho é uma direção arquitetural correta, mas NÃO está pronto para virar ADR físico como está.**

Classificação por critério:

| Critério | Veredito | Justificativa curta |
|---|---|---|
| **Aceitável como direção?** | ✅ Sim | Records Core horizontal, JSON canônico como registro primário, B+C+D+E para imutabilidade e separação intenção/selagem offline são decisões maduras e defensáveis. |
| **Arriscado?** | ⚠️ Em pontos específicos | A maior parte do risco está concentrada em 5 áreas: imutabilidade real em D1, custódia de chave/assinatura offline, timestamp offline, governança de migrations e a dependência de um backup que hoje é comprovadamente falso. |
| **Incompleto?** | ⚠️ Sim | Falta threat model formal, modelo de custódia de chaves, governança de migrations executável, plano de operação offline detalhado e plano de contingência papel. São lacunas que precisam existir ANTES do schema físico, não depois. |
| **Excessivamente complexo?** | ⚠️ Parcialmente | Propõe 11 tabelas e ~24 tipos de evento de auditoria antes de existir um único registro regulado real. Há risco de big-design-up-front: construir o ledger genérico perfeito e nunca chegar ao eDB. |
| **Pronto para ADR físico?** | ❌ Não ainda | Precisa de: (a) decisões de consultor D-01/D-02/D-03/D-04/D-10; (b) threat model; (c) modelo de custódia de chave; (d) governança de migrations; (e) correção do backup real. |

**Resumo em uma frase:** o documento acerta o "o quê" e o "porquê", erra por otimismo no "como" da imutabilidade e do offline, e subestima três fatos verificados no próprio código que minam a base probatória que ele pretende construir.

**Três fatos verificados que o design subestima:**

1. **O backup atual produz um digest falso.** `worker-airtrust/src/services/backup/orchestrator.ts:507` retorna `sha256-${uuid}-${Date.now()}` — uma string que *parece* hash mas não é digest de nada. Pior: `TECHNICAL_DEBT.md` (§2.5 e §9.1) registra um `TypeError` latente em `orchestrator.ts:318` que pode fazer o backup falhar com 500. A "recuperabilidade" que o Records Core exige se apoiaria, hoje, sobre um mecanismo simultaneamente falso e quebrado.

2. **A `audit_events_v2` não é um ledger imutável.** A migration `0385_audit_events_v2.sql` cria uma tabela comum: tem `empresa_id`, `target_empresa_id`, `ip_hash`, `user_agent_hash` e índices — mas **não tem** `previous_event_hash`, sequência, encadeamento, nem trigger de bloqueio de `UPDATE`/`DELETE`. O design a trata como "inspiração" (§9.3), o que é honesto, mas precisa estar explícito para a liderança: hoje a auditoria v2 oferece **zero** garantia de imutabilidade.

3. **A superfície de migrations é enorme e mutável.** Há 380 migrations; 43 delas já criam triggers (operacionais: validação, vencimento). Nenhuma é guarda de imutabilidade. Isso prova que o time sabe usar triggers (bom), mas também que qualquer migration futura pode recriar uma tabela selada sem reanexar seu trigger — exatamente o vetor de falha do controle B.

Esses três pontos não invalidam a direção. Eles dizem que a fundação anunciada como "já existe e é útil" é mais fraca do que o design sugere, e que parte do esforço inicial precisa ser de *correção*, não só de *construção*.

> **Atualização pós-revisão — 2026-06-14:**
> O fato verificado #1 (backup com digest falso e TypeError latente) foi **parcialmente resolvido** após esta revisão:
> - Digest SHA-256 real implementado via `crypto.subtle.digest` em `orchestrator.ts` (commit `da5177af`); TypeError `:318` corrigido via `formatarUploadedAt()`.
> - Verificador local de `checksum-manifest.json` adicionado em `worker-airtrust/src/services/backup/checksum-manifest.ts`.
> - Restore drill local com fixtures fake rodável via Vitest adicionado em `worker-airtrust/src/__tests__/services/backup-restore-drill.test.ts` (ver `docs/BACKUP_RESTORE_DRILL.md`).
>
> **Limites remanescentes:** não há restore em D1 temporário/staging descartável; não há verificação pós-restore de `record_hash`/`manifest_hash`/chain; nenhuma evidência regulatória completa ainda. BACKUP-003 passa de "placeholder ativo" para "mitigado localmente — falta restore em staging descartável". Os fatos #2 (`audit_events_v2` não é ledger imutável) e #3 (migrations sem governança de imutabilidade) **continuam abertos** e não foram alterados por esta nota.

---

## 2. Top 15 Riscos Técnicos

Severidade e probabilidade em escala Baixa / Média / Alta. "Bloqueia?" indica se o risco impede iniciar implementação preparatória (não regulada) — não se impede o uso regulado (quase todos impedem o uso regulado).

| # | Risco | Sev. | Prob. | Causa raiz | Impacto | Mitigação recomendada | Bloqueia impl.? |
|---|---|---|---|---|---|---|---|
| **RT-01** | **D1/SQLite sem RLS nativo** — isolamento de tenant depende 100% de `WHERE empresa_id = ?` na aplicação | Alta | Média | SQLite não tem Row-Level Security; o isolamento é convenção de código, não garantia do banco | Vazamento cross-tenant de registro regulado = violação LGPD + quebra de cadeia de custódia | Camada de acesso obrigatória (repository) que injeta `empresa_id`; testes que tentam ler registro de outro tenant; lint `guard:auth-boundaries` estendido a Records Core | Não (mitigável em design) |
| **RT-02** | **Triggers SQLite são proteção insuficiente contra migrations mal feitas** — um `DROP/RECREATE TABLE` futuro remove o trigger silenciosamente | Alta | **Alta** | 380 migrations, 43 com triggers, nenhuma governança que reanexe triggers após recriação de tabela | Tabela selada volta a aceitar `UPDATE/DELETE` sem ninguém perceber; imutabilidade evapora | **Migration guard executável**: teste de arquitetura em CI que verifica presença dos triggers em cada tabela selada após rodar todas as migrations; checklist de PR; catálogo de "tabelas reguladas" | Não, mas é pré-requisito do controle B |
| **RT-03** | **Hash chain com concorrência por tenant** — duas selagens simultâneas no mesmo tenant podem ler o mesmo `previous_hash` e bifurcar a cadeia | Alta | Média | D1 tem modelo de concorrência limitado; o design reconhece (§4.3) mas não resolve | Cadeia bifurcada ou com gap → `CHAIN_BROKEN` em registros legítimos; perda de valor probatório | Serialização por `(empresa_id, record_type)`: fila lógica, ou `INSERT ... WHERE previous_hash = ?` com retry, ou sequência monotônica com unique constraint que force falha+retry | Não (decisão de design físico) |
| **RT-04** | **Canonicalização JSON quebrando hashes antigos** — qualquer evolução do algoritmo de canonicalização invalida verificação de registros já selados | Alta | Média | Canonicalização é frágil por natureza (ordem de chaves, números, datas, unicode, espaços) | Registro válido reporta `PAYLOAD_HASH_MISMATCH` anos depois; fiscal interpreta como adulteração | `canonicalization_version` imutável por registro (design já prevê); **suite de vetores de teste congelados**; proibir alteração in-place do canonicalizador — só nova versão aditiva; normalização Unicode NFC explícita | Não (regra de engenharia) |
| **RT-05** | **Anexos em R2 divergindo do manifesto** — registro selado aponta para R2 key cujo objeto foi sobrescrito, movido, expirado por lifecycle ou nunca persistido (escrita não transacional D1↔R2) | Alta | Média | D1 e R2 não compartilham transação; selagem grava hash do anexo em D1, mas o objeto R2 é independente | `ATTACHMENT_HASH_MISMATCH` ou anexo ausente em fiscalização; registro "selado" sem prova | R2 versioning + lifecycle proibido para buckets regulados; write-then-verify (reler objeto e conferir hash antes de selar); object lock/retention no R2 se disponível; reconciliação periódica D1↔R2 | Não (decisão de design físico) |
| **RT-06** | ~~**Backup com digest placeholder + path quebrado**~~ **[MITIGADO LOCALMENTE — ver Atualização §1]** Digest SHA-256 real implementado; TypeError corrigido; drill local implementado. Falta restore em staging descartável com verificação pós-restore de `record_hash`/chain. | **Alta** | ~~**Alta (já existe)**~~ **Baixa** (digest e TypeError corrigidos; drill local implementado) | ~~`orchestrator.ts:507` retorna `sha256-${uuid}-${Date.now()}`~~ SHA-256 real via `crypto.subtle.digest` (commit `da5177af`); TypeError `:318` corrigido; `TECHNICAL_DEBT.md §2.5` atualizado como RESOLVIDO | ~~"Recuperabilidade" e "evidência de integridade do backup" são fictícias hoje~~ Digest real implementado; drill local com `checksum-manifest.json` e fixtures fake rodável (ver `docs/BACKUP_RESTORE_DRILL.md`). Falta restore em staging e verificação de `record_hash`/chain. | ✅ SHA-256 real + verificador local + restore drill local concluídos (commit `da5177af`). **Pendente:** restore em staging descartável com verificação de domínio pós-restore. | ~~**Sim**~~ **Parcialmente** — bloqueio de digest e TypeError removido; falta staging drill para evidência regulatória completa |
| **RT-07** | **PWA offline sem atestação de dispositivo** — PWA não consegue provar que o device não está rooted/comprometido nem proteger segredo local | Alta | Média | Limitação da plataforma web; `regulated_devices` registra device mas não atesta integridade | Cache cifrado e "segredo local" extraíveis em device comprometido → assinatura/registro forjável offline | Para MVP não regulado: aceitar e rotular o limite. Para regulado com assinatura offline: app nativo + secure enclave/keystore + device attestation (Play Integrity / App Attest) + MDM | Não para MVP; **Sim** para offline regulado |
| **RT-08** | **Chave privada em device** — assinatura offline "de verdade" exige chave privada no tablet, que pode ser exfiltrada | Alta | Média | Custódia de chave em endpoint não confiável; o design menciona keystore mas não modela custódia | Chave de assinatura de PIC roubada = assinaturas forjadas com aparência válida | **Não armazenar chave privada de assinatura jurídica em PWA.** Server-side signing para online; para offline, intenção local + assinatura no servidor; ICP A3/keystore só com app nativo e modelo de custódia formal | Não para MVP (sem assinatura offline); **Sim** para offline regulado |
| **RT-09** | **Timestamp offline não confiável** — `client_clock_at` é manipulável (modo avião, relógio alterado, sem NTP) | Alta | **Alta** | Relógio do device é input não confiável por definição | Carimbo de tempo do registro/assinatura sem fé; cadeia de custódia temporal quebrada | Nunca usar `client_clock_at` como timestamp oficial; oficial = `server_received_at`; registrar drift; se a norma exigir hora do ato, exigir assinatura online ou TSA (carimbo de tempo) | Não (política de design) |
| **RT-10** | **Conflito de sincronização resolvido silenciosamente** — mesmo registro editado em dois contextos; "último vence" apaga informação | Alta | Média | Sync sem política explícita de conflito tende a auto-resolver | Registro oficial alterado sem trilha; possível perda de dado regulado | Conflito **nunca** auto-resolve: gera `regulated_sync_session` com `SYNC_CONFLICT_DETECTED`, bloqueia selagem e exige decisão humana via addendum (design já aponta, §4.9 — elevar a invariante dura) | Não (decisão de design) |
| **RT-11** | **Acesso fiscal e LGPD** — modo fiscalização pode expor dados pessoais de tripulantes/terceiros fora do escopo da fiscalização | Alta | Média | Export e fiscal view por aeronave/período arrastam PII de várias pessoas | Violação LGPD; exposição indevida em sessão de fiscal externo | Escopo mínimo obrigatório; masking de PII fora do escopo; base legal registrada; expiração de pacote R2; log de tudo que o fiscal viu | Não (decisão de design); **validar com consultor + DPO** |
| **RT-12** | **Tipo de assinatura indefinido (Gov.br/ICP/CANAC)** — toda a arquitetura de assinatura depende de decisão regulatória ausente | **Alta** | **Alta** | D-01/D-02 não respondidas; sem isso não se sabe se é server-side, client-side, A1, A3, Gov.br | Construir módulo de assinatura errado = refatorar eDB e SDRMe inteiros | Provider plugável (design já prevê) + **não implementar nenhum fluxo de assinatura jurídica antes de D-01/D-02**; só intenção interna no MVP | Não para MVP interno; **Sim** para assinatura regulada |
| **RT-13** | **RDV vs eDB sem fonte oficial definida** — não se sabe qual registro é primário quando divergem | Alta | Média | D-10 não respondida; design modela `regulated_record_links` mas não a precedência | Dois registros oficiais divergentes = pesadelo de auditoria; impossível dizer qual vale | Definir precedência regulatória antes de modelar a integração; até lá, RDV e eDB são registros distintos sem selagem cruzada | Não para módulos isolados; **Sim** para integração |
| **RT-14** | **Protótipos confundidos com sistema regulado** — Controle de Voos e MRO são frontend-only (zero API), mas demonstráveis | **Alta** | **Alta** | UX navegável sem backend; risco comercial/jurídico de "vender" como regulado | Operador acredita estar conforme; uso de dado mockado como se fosse registro oficial; exposição jurídica do AirTrust e do cliente | Banner/estado "PROTÓTIPO — NÃO REGULADO" no produto; proibição comercial de usar "homologado"; governança de release que separa módulo navegável de módulo persistido | Não (governança), mas **urgente** |
| **RT-15** | **Dependência de Cloudflare D1/R2 para evidência regulatória** — toda a prova vive em um único fornecedor; criptografia em repouso é gerenciada pela plataforma, não pelo AirTrust | Alta | Média | Vendor lock-in probatório; `SECURITY.md` não documenta encryption-at-rest controlada pelo AirTrust (D1/R2 at-rest é Cloudflare-managed) | Indisponibilidade/descontinuação do fornecedor, ou disputa sobre custódia, fragiliza a prova; sem export externo independente, registro fica "preso" | Export externo periódico assinado para armazenamento independente (object lock); manifesto verificável fora do AirTrust; não depender da app para verificar integridade | Não (decisão de arquitetura de evidência) |

**Riscos verificados como já existentes (não hipotéticos):** ~~RT-06 (backup falso/quebrado)~~ [RT-06 mitigado localmente após esta revisão — ver Atualização §1], RT-14 (protótipos mock), RT-02 e RT-15 (superfície e dependência confirmadas por leitura de código). Os demais são prospectivos sobre o design proposto.

---

## 3. Pontos Fortes do Desenho

Estes acertos devem ser **preservados** no ADR físico:

1. **Camada horizontal única (Records Core).** Resistir à tentação de reimplementar hash/assinatura/audit em cada módulo é a decisão estrutural correta. Reduz superfície de erro e cria um único ponto de conformidade.

2. **JSON canônico como registro primário, PDF como representação humana (§3.2, §6).** Inverte o erro comum de tratar o PDF como verdade. É a base de qualquer verificação reproduzível.

3. **Imutabilidade em camadas B+C+D+E, não defesa única (§5).** Reconhecer que "a aplicação bloqueia" (opção A) é insuficiente, e combinar trigger + append-only + hash chain + export externo, é maduro.

4. **Separação intenção offline vs. selagem no servidor (§8, design B).** É a postura conservadora correta enquanto a assinatura offline não for validada por consultor. Evita o erro fatal de declarar PWA offline com chave local como regulatório.

5. **Addendum obrigatório, nunca sobrescrita (§10).** Modelar diffs e hashes de valores anteriores/novos — não só texto livre — é o que diferencia addendum real de "edição disfarçada".

6. **`canonicalization_version` por hash (§6.2).** A previsão de que o algoritmo vai evoluir, e o registro do versionamento desde o dia 1, é exatamente o que evita o desastre de RT-04.

7. **Honestidade sobre o estado atual (§2.4, §20.3).** O design já admite checksum placeholder, SW network-only e mocks. Um documento que aponta as próprias fraquezas é confiável.

8. **Separação clara entre "pode fazer agora" e "depende de consultor" (§20.1/§20.2).** Permite avançar em infraestrutura preparatória sem travar tudo na agenda regulatória.

9. **Status explícito de verificação (`VALID`/`PAYLOAD_HASH_MISMATCH`/`CHAIN_BROKEN`/…) (§6.3).** Um verify que distingue tipos de falha é operacionalmente muito superior a um booleano.

---

## 4. Pontos Fracos ou Ausentes

O que precisa existir **antes** de virar ADR físico e não está no documento:

| Lacuna | Por que é bloqueante para o ADR | Onde deveria entrar |
|---|---|---|
| **Threat model formal** | Não há STRIDE/atacante-modelo. Quem é o adversário? Insider admin? PIC que quer alterar horário? OMA terceirizada? Fiscal malicioso? Sem isso, os controles são genéricos | Documento próprio antes do ADR |
| **Modelo de custódia de chaves** | O design fala em assinatura plugável mas não modela onde vivem as chaves, quem as gera, rotação, revogação, HSM/KMS. É o coração da validade jurídica | Seção dedicada; depende de D-01/D-02 |
| **Governança de migrations executável** | O controle B depende disto e não existe (RT-02). Precisa ser teste em CI, não prosa | ADR + teste de arquitetura |
| **Restore drill específico do Records Core** | O drill atual é D1 genérico; não verifica `record_hash`/`manifest_hash`/chain pós-restore (§14.3 lista como "exigido" mas não existe) | Runbook + evidência |
| **Plano de operação offline detalhado** | §8 dá a direção (B) mas não o protocolo: o que cacheia, como cifra, TTL do cache, o que acontece em logout, fila de sync, ordem de aplicação | Documento próprio; depende de D-03/D-05 |
| **Plano de contingência papel** | Mencionado como "obrigatório" (§8.2-D) mas não detalhado: como o papel volta ao sistema, quem digitaliza, como se evita gap no histórico digital | Runbook operacional |
| **Boundaries de serviço explícitos** | "service boundaries" citado (§19-B) sem definição: quais módulos podem chamar o quê, o que é interno vs. exposto, idempotência | ADR |
| **Política de retenção concreta** | `regulated_retention_policies` existe como tabela, mas os prazos reais por tipo dependem de norma (RT — depende de consultor) e não há default seguro escrito além de "arquivar" | Depende de consultor; default = nunca deletar |
| **Evidências ANAC mapeadas a controles** | A matriz de 50 requisitos existe em outro doc, mas não há rastreabilidade requisito→tabela→teste→evidência neste design | Matriz de rastreabilidade no ADR |
| **Mascaramento/minimização de PII (LGPD)** | §11.3 cita LGPD mas não define o mecanismo de masking nem o catálogo de campos PII | Depende de DPO; design técnico necessário |

---

## 5. Revisão de Imutabilidade

**A combinação B+C+D+E é necessária mas, como descrita, NÃO é suficiente.** Faltam os controles que tornam B confiável e que detectam quando ele falha.

### O que o design propõe (e está certo)
- B: triggers `BEFORE UPDATE/DELETE` com `RAISE(ABORT)` em tabelas seladas.
- C: event log append-only.
- D: hash chain por tenant.
- E: export externo assinado em R2.

### O que falta — e por que cada item importa

| Controle ausente | Por que é necessário | Consequência se faltar |
|---|---|---|
| **Migration guard (teste de arquitetura)** | Triggers podem ser removidos por migration futura (RT-02). Confirmado: 380 migrations, nenhuma governança de reanexação | Imutabilidade some sem alarme |
| **Teste que tenta `UPDATE`/`DELETE` em registro selado** | É a única prova de que o trigger funciona — em cada ambiente, após cada migration | Trigger presente no dev mas ausente no prod e ninguém sabe |
| **Permissões internas restritas** | Triggers SQLite não distinguem chamador. Um script com binding D1 ou rota admin pode burlar a lógica de app (mas não o trigger). Falta política de quem tem binding de escrita | Bypass por script/rota administrativa |
| **Inventário de rotas administrativas** | Rotas de manutenção/admin podem tocar tabelas seladas. `SECURITY.md` cita `MAINTENANCE_SECRET` com acesso a rotas de manutenção sem auth de usuário | Caminho privilegiado não auditado |
| **Política sobre scripts de manutenção** | Scripts com `wrangler d1 execute` ignoram triggers? (Não — triggers rodam no engine SQLite, então `RAISE(ABORT)` vale também para scripts. Mas `DROP TRIGGER` num script não.) Precisa de política escrita | DDL ad-hoc destrói garantia |
| **Estratégia de rollback** | O que acontece com a hash chain se uma migration é revertida? Rollback pode reintroduzir registros ou quebrar encadeamento | Chain inconsistente pós-rollback |
| **Paridade dev/staging/prod** | Triggers e constraints precisam existir idênticos nos 3 ambientes. Hoje não há verificação | "Funciona no staging" ≠ prod |
| **Detecção de drift** | Job periódico que recomputa a chain e compara com o armazenado, alertando em `CHAIN_BROKEN` | Adulteração só descoberta na fiscalização |

### Ponto crítico sobre `audit_events_v2`
O design (§9.3) trata a auditoria v2 como inspiração. **Verificado: a `audit_events_v2` (migration 0385) não tem `previous_event_hash`, sequência nem trigger de bloqueio.** Portanto o ledger regulatório (`regulated_audit_events`) é construção **nova e completa**, não evolução. Isto deve estar explícito no ADR para não se subestimar o esforço.

### Verdade técnica sobre triggers e SQLite
Triggers `RAISE(ABORT)` no SQLite **valem para qualquer caminho de escrita** dentro do engine — incluindo `wrangler d1 execute` e bindings de Worker. Isso é uma força. A fraqueza **não** é bypass de runtime; é **DDL**: `DROP TRIGGER`, `ALTER TABLE`, `DROP/RECREATE TABLE` numa migration removem a guarda. Logo, o vetor real é governança de migrations (RT-02), não chamada de aplicação. O ADR deve focar a defesa aí.

---

## 6. Revisão de Assinatura

Avaliação adversarial de cada opção, sob a pergunta: **qual arquitetura é mais segura enquanto a resposta regulatória (D-01/D-02) não chega?**

| Opção | Segurança técnica | Validade jurídica (provável) | Viável em tablet/PWA? | Veredito red team |
|---|---|---|---|---|
| **CANAC + senha + MFA (interno)** | Média — depende de força da senha/MFA; sem não-repúdio criptográfico | Provavelmente insuficiente para eDB/RAS | Sim | **Só para intenção / MVP não regulado.** Nunca rotular como regulatório |
| **Gov.br** | Boa — backbone ICP; não-repúdio razoável | A confirmar (D-01) — plausível para eDB | Sim (fluxo mobile) | **Candidata mais promissora** para eDB se aceita; depende de API externa |
| **ICP-Brasil A1** | Boa — certificado em software | Forte | Sim, mas custódia da chave é o problema | Boa para assinatura **server-side** com chave do operador em KMS |
| **ICP-Brasil A3 (token)** | Alta — chave em hardware | Mais forte | **Ruim em PWA** — exige hardware/driver | Reservar para RAS/manutenção crítica, com app nativo |
| **Híbrida (interno agora, ICP/Gov.br depois)** | — | — | — | **Recomendada como estratégia de fase**, com ressalva abaixo |
| **Server-side signing** | Concentra risco no servidor, mas protege contra device comprometido; facilita offline (intenção→assina no servidor) | Compatível com A1/Gov.br | Sim | **Preferida tecnicamente** enquanto não há decisão |
| **Client-side signing** | Protege chave do usuário, mas exige chave no device (RT-08) | Compatível com A3 | Frágil em PWA | Só com app nativo + keystore |

### Recomendação red team
1. **Construir o core com assinatura plugável** (design acerta), mas **abstrair em torno de server-side signing como default**, porque: (a) não coloca chave privada jurídica no device (elimina RT-08 no MVP); (b) torna o offline tratável (intenção local → assinatura no servidor ao reconectar); (c) é compatível com A1 e Gov.br, as duas candidatas mais prováveis.
2. **A assinatura deve cobrir** `record_hash` + `canonical_schema_version` + papel + timestamp do servidor (não do device).
3. **Armadilha da estratégia híbrida (E):** se a assinatura "interna agora" e a "ICP depois" tiverem modelos de dados ou semântica de não-repúdio diferentes, haverá refatoração do eDB inteiro. Mitigação: o registro de assinatura (`regulated_signatures`) já deve nascer com todos os campos de certificado (subject, serial, provider) mesmo que nulos no MVP, e o verify já deve tratar `signature_type`. O design prevê os campos — o ADR deve garantir que a *semântica* de validação seja a mesma.
4. **Não implementar nenhum fluxo de assinatura com pretensão jurídica antes de D-01/D-02.** Apenas trilha de intenção.

---

## 7. Revisão de Offline/PED/Tablet

### O desenho "intenção local + selo servidor depois" (design B) é suficiente para MVP **não regulado**?
**Sim.** Para um MVP que não substitui o papel, coletar offline, cifrar localmente, enfileirar e selar no servidor ao reconectar é uma arquitetura limpa e honesta. Recomendado.

### É suficiente para uso **regulado**?
**Não, sem três coisas:** (1) decisão de consultor sobre se a assinatura pode ocorrer no servidor *após* o ato offline (D-03/D-04); (2) cache local com criptografia e custódia de segredo adequadas; (3) atestação de dispositivo se a assinatura ocorrer no device.

### Avaliação adversarial por componente

| Componente | Risco red team | Recomendação |
|---|---|---|
| **PWA vs app nativo** | PWA não atesta integridade do device nem guarda chave forte (RT-07/RT-08) | PWA para coleta/leitura offline; app nativo **obrigatório** se a norma exigir assinatura offline com chave local |
| **Cache local (IndexedDB)** | Legível em device comprometido; não expira sozinho | Cifrar com chave derivada de sessão/credencial; TTL curto; limpar em logout/revogação |
| **Criptografia local** | Chave de cifra precisa morar em algum lugar; em PWA, derivável | Derivar de credencial + segredo de device rotacionável; não persistir chave em claro |
| **Service worker** | `FRONTEND_ARCHITECTURE`/design indicam APIs `network-only` hoje → não há offline regulado atual | SW dedicado ao eDB com estratégia própria; não reaproveitar o SW atual |
| **Device registry / revocation** | `regulated_devices` é bom, mas revogação não tem efeito garantido em device offline | Cache cifrado + expiração por política (design §13.3 acerta); wipe lógico na próxima abertura |
| **Tablet perdido/roubado** | Wipe remoto não é garantido em PWA offline | Assumir comprometimento: cache cifrado, TTL, segredo revogável, sem chave de assinatura jurídica no device |
| **Uso em área sem internet** | Cenário operacional real (helicóptero offshore, interior) | É o caso que decide PWA vs nativo. Quantos dias de cache (D-05) e se assina offline (D-03) definem a arquitetura |
| **Sync depois do voo** | Conflito silencioso (RT-10), timestamp falso (RT-09) | Conflito sempre explícito; timestamp oficial = servidor |
| **Contingência papel** | Reintroduz dupla fonte (design §8.2-D admite) | Protocolo formal de retorno ao papel + digitalização posterior como addendum/importação rotulada |

### Conclusão
O default técnico (B) está certo. **A decisão PWA vs nativo não pode ser tomada agora** — ela depende de D-03 (assinatura offline) e D-05 (dias de cache). O ADR deve manter as duas portas abertas: arquitetar a coleta offline de forma que migrar para app nativo não exija reescrever o Records Core, apenas a camada de device/assinatura.

---

## 8. Revisão de Timestamp

**Princípio inegociável: o relógio do device é um input hostil.** O design acerta ao separar `client_clock_at` de `server_received_at`, mas precisa elevar isto a invariante e definir qual timestamp é oficial para cada finalidade.

### Política técnica proposta (a incorporar no ADR)

| Timestamp | Origem | Confiável? | Uso oficial |
|---|---|---|---|
| `client_clock_at` | Relógio do device no ato | **Não** | Apenas informativo / cálculo de drift. Nunca oficial |
| `server_received_at` | Servidor ao receber | Sim | **Timestamp oficial de recebimento/selagem** |
| `clock_drift_seconds` | `server_received_at − client_clock_at` | Derivado | Auditoria; sinalizar drift anômalo |
| `signed_at` | Momento da assinatura | Depende de onde assina | Se server-side: confiável. Se device: tratar como `client_clock_at` |
| `sealed_at` | Servidor na selagem | Sim | Oficial para a cadeia |
| `sync_*_at` | Sessão de sync | `server_*` confiável | Trilha de sincronização |

### Regras
1. **Nenhum hash, selagem ou cadeia usa `client_clock_at`.** A ordem da chain é por `server_received_at` + sequência monotônica.
2. **Drift acima de um limite** (ex.: > N minutos) gera evento de auditoria, não bloqueio automático (a menos que a norma exija).
3. **Se a norma exigir a hora real do ato** (e não a de recebimento), há duas saídas: assinatura online no ato, ou **carimbo de tempo (TSA/RFC 3161)** — e isso é decisão de consultor.
4. **Não fingir precisão:** a UI e a exportação devem mostrar honestamente "registrado offline às X (relógio do dispositivo), recebido pelo servidor às Y".

---

## 9. Revisão de Hash/Canonicalização

A canonicalização é o ponto onde "funciona no meu teste" e "verificável em 5 anos" divergem. O design dá as regras certas (§6.1) mas faltam invariantes anti-regressão.

### Regras mínimas para não quebrar verificação histórica

1. **Unicode NFC explícito** antes de serializar. (Ausente no design — é causa clássica de mismatch entre plataformas.)
2. **Ordem de chaves determinística** (lexicográfica por code point), recursiva.
3. **Números com escala fixa por campo** — proibir float livre; usar string decimal ou inteiro+escala. (Design cita; reforçar: `1`, `1.0`, `1.00` devem ser impossíveis de coexistir.)
4. **Datas em UTC ISO 8601 com precisão fixa**; timezone operacional em campo separado.
5. **Whitespace e encoding fixos** (sem espaços, UTF-8 sem BOM).
6. **Catálogo explícito de campos excluídos** do payload canônico (`updated_at` operacional, labels de UI, cache). Mudar este catálogo = nova `canonicalization_version`.
7. **`canonical_schema_version` + `canonicalization_version` imutáveis por registro.** Verify usa a versão gravada, nunca a "atual".
8. **Suite de vetores congelados:** N payloads de exemplo com hash esperado, versionados; qualquer mudança que altere um vetor existente é proibida (só vetores novos).
9. **Anexos:** hash sobre bytes reais; manifesto com nome, MIME, tamanho, hash, R2 key; `record_hash` cobre payload + manifesto (design acerta).
10. **Reprocessamento histórico proibido:** nunca recomputar e regravar hash de registro selado. Se a canonicalização v2 surgir, registros antigos permanecem em v1 e são verificados em v1.

### Armadilha específica
O maior risco (RT-04) não é técnico — é processual: alguém "melhora" o canonicalizador num refactor e silenciosamente invalida anos de registros. **Defesa: a função de canonicalização é append-only por versão, protegida por teste de vetores congelados em CI.** Isto deve ser um item de governança, não só de código.

---

## 10. Revisão de Backup/Restore

**Esta é a área onde o estado atual mais contradiz a ambição do design.**

### Fatos verificados
- `orchestrator.ts:507` → checksum = `sha256-${uuid}-${Date.now()}` (**falso**).
- `TECHNICAL_DEBT.md §2.5/§9.1` → TypeError latente em `orchestrator.ts:318`, backup pode dar 500.
- `SECURITY.md` não documenta criptografia em repouso controlada pelo AirTrust; D1/R2 at-rest é gerenciado pela Cloudflare.

### Avaliação crítica

| Item | Estado | Veredito red team |
|---|---|---|
| **D1 backup** | ~~Existe, mas digest falso e path com bug~~ **[ATUALIZADO]** Digest SHA-256 real implementado (commit `da5177af`); TypeError corrigido | ~~Não confiável até corrigir RT-06~~ Digest real implementado; drill local implementado; falta restore em staging |
| **R2 backup** | Há rotas R2 e metadata manifest; mas "manifest ≠ backup integral de anexos" (design §14.1 admite) | Insuficiente para anexos regulados |
| **Manifest** | ~~Conceito presente~~ **[ATUALIZADO]** `checksum-manifest.json` com SHA-256 real; verificador local implementado em `checksum-manifest.ts` | Verificação local implementada; falta restore em staging descartável |
| **Restore drill** | ~~Existe drill D1 genérico; **não** há drill de Records Core~~ **[ATUALIZADO]** Restore drill local com `checksum-manifest.json` e fixtures fake implementado; ver `docs/BACKUP_RESTORE_DRILL.md` | Drill local implementado; **falta restore em staging descartável** com verificação pós-restore de `record_hash`/chain |
| **Verificação pós-restore** | Não existe verificação de `record_hash`/chain pós-restore em staging (permanece aberto) | Sem isto, "restaurado" ≠ "íntegro" para fins regulatórios |
| **Evidência de integridade** | ~~Hoje é placeholder~~ **[ATUALIZADO]** SHA-256 real e verificador local implementados; sem evidência regulatória completa ainda | Evidência técnica interna local implementada; evidência regulatória completa aguarda staging e Records Core |
| **Vendor lock-in (RT-15)** | Prova vive só na Cloudflare | Export externo independente obrigatório |
| **Export externo** | Conceito previsto (§14.4) | Elevar a requisito: object lock + verificação fora da app |

### Recomendação
1. ~~**Corrigir RT-06 é pré-requisito**~~ ✅ **CONCLUÍDO** — digest SHA-256 real + TypeError corrigidos (commit `da5177af`); verificador local de manifesto implementado; restore drill local com fixtures fake implementado (ver `docs/BACKUP_RESTORE_DRILL.md`). **Próxima etapa:** restore drill em staging descartável com verificação pós-restore de `record_hash`/chain.
2. **Restore drill do Records Core** específico: restaurar, recomputar todos os `record_hash`/`manifest_hash`, revalidar a chain, gerar export fiscal e comparar com o pré-restore. *(ainda aberto — exige Records Core implementado e staging descartável)*
3. **Não declarar "recuperabilidade regulatória" em nenhum artefato ANAC até o drill de staging passar com verificação pós-restore de domínio e `record_hash`/chain.**
4. **Export externo assinado** (fora da Cloudflare) com retenção independente, para que a prova não dependa de um único fornecedor.

---

## 11. Revisão de Modo Fiscalização

O design (§12) está conceitualmente correto. Os riscos são de LGPD e de escopo, não de arquitetura.

| Aspecto | Avaliação | Recomendação |
|---|---|---|
| **Perfil read-only temporário** | Correto | Bloqueio de mutação no nível de sessão **e** de rota; nunca confiar só na UI |
| **Escopo (aeronave/período/módulo)** | Correto | Escopo **mínimo obrigatório**; sem escopo = sem acesso |
| **Log de visualização** | Previsto (`FISCAL_RECORD_VIEWED`) | Cada registro visto = um evento; é a evidência para o operador |
| **Exportação** | Prevista | Sempre via `regulated_exports` com manifesto e expiração |
| **LGPD (RT-11)** | **Risco alto** | Masking de PII fora do escopo; base legal registrada; consultar DPO |
| **Acesso offline no tablet** | Previsto | Limitar ao cache autorizado; avisar se incompleto (design acerta) |
| **Expiração/revogação** | Previsto (`FISCAL_SESSION_EXPIRED`) | Expiração automática; revogação imediata; sessão não renovável silenciosamente |

### Pergunta adversarial não resolvida
**Quem é o "fiscal" no modelo de identidade?** Um inspetor da ANAC tem conta no AirTrust? É um usuário do operador agindo como anfitrião? É acesso anônimo escopado por token? Isto muda o modelo de auth e de auditoria e **não está definido**. Precisa de decisão (provável: usuário do operador concede sessão escopada e tudo é logado; mas confirmar com consultor como a ANAC espera acessar).

---

## 12. Revisão de Integração entre Módulos

O fluxo `Controle de Voos → RDV → eDB → assinatura PIC → discrepância → OS → RAS → status aeronave → FRMS/SGSO` é a ambição correta, mas **a ordem de selagem importa e o design não a torna explícita.**

### Quais links devem ser `regulated_record_links` e quais NÃO devem ser selados ainda

| Link | Selar agora? | Razão red team |
|---|---|---|
| Controle de Voos → RDV | ⚠️ Depende | RDV é registro regulado; o vínculo com a programação (não regulada) é rastreabilidade, não selagem cruzada |
| RDV → eDB (pré-preenchimento) | ❌ Não selar cruzado até D-10 | Enquanto não se sabe qual é a **fonte oficial** (RT-13), selar a dependência cria acoplamento que pode estar invertido. Modelar como link informativo, não como dependência de hash |
| eDB assinado → MRO (horas/ciclos) | ⚠️ Sim, mas unidirecional | O MRO **consome** dados do eDB selado; o link deve ser eDB→MRO e o MRO nunca deve atualizar contador a partir de eDB **não selado** (design §15.1 alerta; elevar a invariante) |
| Discrepância (eDB) → OS (MRO) | ✅ Sim | É a cadeia regulatória central do RBAC 135; link tipado e auditado |
| OS → RAS | ✅ Sim | RAS depende da OS; selagem encadeada faz sentido |
| RAS → status aeronave | ❌ Não é registro regulado | Status da aeronave é estado operacional derivado; deriva do RAS selado, mas o status em si não é selado |
| FRMS ← jornada real (RDV) | ⚠️ Consome, não sela | FRMS consome jornada do RDV selado; decisões críticas do FRMS podem ser registros regulados próprios |
| SGSO ← ocorrência (eDB) | ⚠️ Consome | Ocorrência nasce no eDB; o registro SGSO é derivado e pode ter selagem própria |

### Invariante que falta no design
**Nenhum módulo a jusante (MRO, FRMS, SGSO) deve atualizar estado regulado a partir de um registro a montante que não esteja selado.** O design menciona o risco (§4.11) mas não o eleva a regra dura. O ADR deve proibir, por exemplo, MRO atualizar contadores de horas/ciclos a partir de um RDV/eDB em draft.

### Risco de acoplamento prematuro
Selar a integração antes de D-10 (fonte oficial RDV vs eDB) é construir sobre fundação indefinida. **Recomendação: módulos regulados isolados primeiro (eDB sozinho, SDRMe sozinho); integração selada só depois da decisão de precedência.**

---

## 13. Decisões que Precisam de Consultor antes de Código Regulado

| Decisão | Pergunta | Impacto | Código que NÃO deve ser implementado antes | Código preparatório PERMITIDO mesmo sem ela |
|---|---|---|---|---|
| **D-01** | Tipo de assinatura aceito para eDB (Gov.br/ICP A1/A3/CANAC)? | Define provider, server vs client signing, custódia de chave | Qualquer fluxo de assinatura com pretensão jurídica no eDB | Tabela `regulated_signatures` com campos plugáveis; assinatura **interna de intenção** rotulada como não regulada |
| **D-02** | Tipo de assinatura aceito para SDRMe/RAS? | Idem, possivelmente nível mais alto | Fluxo de RAS digital regulado | Modelo de dados de OS/RAS sem assinatura jurídica |
| **D-03** | Assinatura offline tem validade? | Define PWA vs app nativo | Assinatura offline com chave local; SW de assinatura | Coleta offline + fila de sync + selagem no servidor (intenção) |
| **D-04** | Timestamp offline é aceito / exige TSA? | Define se basta `server_received_at` ou precisa carimbo de tempo | Lógica que trate `client_clock_at` como oficial | Captura de client/server timestamps + drift |
| **D-05** | Quantos registros/dias no PED? | Define tamanho e política do cache offline | Cache offline dimensionado | Estrutura de cache parametrizável |
| **D-06** | Granularidade da autorização (operador/frota/prefixo)? | Define config multi-tenant regulada | Gating de uso regulado por escopo | Campo `regulatory_scope_id` no modelo |
| **D-10** | Fonte oficial: RDV ou eDB? | Define a integração selada | Selagem cruzada RDV↔eDB; MRO consumindo de qual | `regulated_record_links` como rastreabilidade não selada |
| **D-11** | Formato de exportação fiscal aceito? | Define o pacote de export | Pacote final "oficial" | Export interno PDF+JSON+manifesto (formato provisório) |
| **LGPD** | Masking de PII em modo fiscal (com DPO) | Define o que o fiscal vê | Modo fiscal exposto a fiscal externo real | Modo fiscal interno com escopo + log |

**Regra geral:** tudo que é **estrutura, hash, ledger, addendum, export interno, device registry e canonicalização** pode avançar agora (modo não regulado). Tudo que é **assinatura jurídica, offline regulado, timestamp oficial do ato, integração selada e exposição a fiscal externo** espera consultor.

---

## 14. Recomendações de Alteração no Design Atual

| Ação | Item | Detalhe |
|---|---|---|
| **MANTER** | Records Core horizontal | Decisão estrutural correta |
| **MANTER** | JSON canônico primário, PDF humano | Base de verificação |
| **MANTER** | B+C+D+E para imutabilidade | Mas completar com os controles da §5 |
| **MANTER** | Intenção offline + selo servidor (B) | Default conservador correto |
| **MANTER** | Addendum com diffs e hashes | Não regredir para texto livre |
| **MANTER** | `canonicalization_version` por registro | Reforçar com vetores congelados |
| **ALTERAR** | "auditoria v2 é fundação útil" (§2.2/§9.3) | Reescrever: a v2 **não** é append-only nem encadeada hoje; o ledger regulado é construção nova |
| **ALTERAR** | "backup/drill já existem e ajudam" (§14.1) | ~~Reescrever: backup atual tem digest **falso** e bug latente; é passivo a corrigir, não ativo a aproveitar~~ **[ATUALIZADO]** Digest SHA-256 real e drill local implementados. Design review deve notar: backup tem digest real e drill local; **falta restore em staging descartável** com verificação de domínio. |
| **ALTERAR** | Default de assinatura | Tornar **server-side** o default explícito enquanto D-01/D-02 não vêm |
| **ALTERAR** | Política de timestamp | Elevar "device é hostil" a invariante; `server_received_at` é o único oficial |
| **ALTERAR** | Integração entre módulos (§15) | Tornar invariante dura: "a jusante nunca consome de registro não selado"; não selar RDV↔eDB antes de D-10 |
| **ACRESCENTAR** | Threat model formal | STRIDE com atacantes nomeados (insider admin, PIC, OMA, fiscal) |
| **ACRESCENTAR** | Modelo de custódia de chaves | Geração, rotação, revogação, KMS/HSM, server vs device |
| **ACRESCENTAR** | Governança de migrations executável | Teste de arquitetura que verifica triggers em tabelas seladas pós-migration |
| **ACRESCENTAR** | Restore drill do Records Core | Com verificação de hash/chain pós-restore |
| **ACRESCENTAR** | Plano de operação offline detalhado | Protocolo de cache, cifra, TTL, fila, conflito |
| **ACRESCENTAR** | Plano de contingência papel | Retorno ao papel + reentrada no sistema sem gap |
| **ACRESCENTAR** | Matriz de rastreabilidade | Requisito (50) → tabela → teste → evidência |
| **ACRESCENTAR** | Detecção de drift | Job que recomputa a chain e alerta |
| **ACRESCENTAR** | Identidade do fiscal | Como a ANAC acessa: conta, token escopado, anfitrião |
| **REMOVER/ADIAR** | Construir as 11 tabelas de uma vez | Big-design-up-front. Começar pelo núcleo mínimo (records + versions + hashes + audit ledger + addendum) e adiar `sync_sessions`, `devices`, `retention_policies`, `links` para quando o primeiro módulo real existir |
| **ADIAR** | Âncora externa (opção F) | Design já marca como não bloqueante — confirmar |
| **ADIAR** | `regulated_record_links` selados | Só após D-10 |

### Sobre a complexidade (anti big-design-up-front)
O maior risco de *produto* não está na tabela — está em gastar meses construindo o ledger genérico perfeito para 6 módulos e nunca entregar o eDB. **Recomendação: provar o Records Core com UM tipo de registro real, fim a fim (criar→selar→verificar→addendum→export→restore-drill), antes de generalizar para os 11 tipos.** Escolher o registro mais simples e autocontido para esse "vertical slice" — provavelmente uma etapa de eDB ou um certificado de treinamento LMS.

---

## 15. Sequência Recomendada de Implementação Segura

A sequência do design (§19, Fases A–J) é razoável, mas reordeno para colocar correções e fundações de governança antes do schema, e um vertical slice antes da generalização.

```
0. CORREÇÕES BLOQUEANTES (não-reguladas, fazer já)
   • ✅ Corrigir backup: digest SHA-256 real + TypeError orchestrator.ts:318 — CONCLUÍDO (commit da5177af)
   • ✅ Banner "PROTÓTIPO — NÃO REGULADO" em Controle de Voos e MRO — CONCLUÍDO
   • ✅ Restore drill que verifica o digest real — drill local CONCLUÍDO (ver docs/BACKUP_RESTORE_DRILL.md); PENDENTE: restore em staging descartável com verificação pós-restore de record_hash/chain
        │
        ▼
1. DOCUMENTAÇÃO / ADR + THREAT MODEL  (sem código)
   • Threat model (STRIDE, atacantes nomeados)
   • Modelo de custódia de chaves
   • Governança de migrations (especificação do teste de arquitetura)
   • ADR físico do núcleo MÍNIMO (5 tabelas, não 11)
        │
        ▼
2. VALIDAÇÃO COM CONSULTOR  (D-01..D-05, D-10, D-11, LGPD)
   • Sem isso, nada de assinatura jurídica / offline regulado / integração selada
        │
        ▼
3. TESTES DE ARQUITETURA  (antes do schema produtivo)
   • Teste que tenta UPDATE/DELETE em selado
   • Teste de vetores de canonicalização congelados
   • Migration guard em CI
        │
        ▼
4. SCHEMA DESIGN + VERTICAL SLICE (1 tipo de registro, não regulado)
   • records + versions + hashes + audit ledger + addendum
   • Fluxo completo: criar→selar→verificar→addendum→export→restore-drill
        │
        ▼
5. MVP NÃO REGULADO  (assinatura interna de intenção)
   • Canonicalização, hash chain, export interno, device registry básico
        │
        ▼
6. (após consultor) ASSINATURA ONLINE  (server-side, provider decidido)
        │
        ▼
7. (após consultor) OFFLINE  (PWA conservador OU app nativo conforme D-03/D-05)
        │
        ▼
8. INTEGRAÇÃO eDB  (primeiro módulo regulado, isolado, piloto controlado)
        │
        ▼
9. INTEGRAÇÃO SDRMe  (OS/task cards/RAS, componentes, AD/SB, LMS/qualificações)
        │
        ▼
10. INTEGRAÇÃO SELADA  (RDV↔eDB↔MRO↔FRMS↔SGSO, só após D-10)
        │
        ▼
11. TESTES E EVIDÊNCIAS ANAC  (matriz, restore drill, export fiscal, pacote por operador/OMA)
```

**Diferenças-chave vs. o roadmap original:**
- ~~Insere a **Fase 0 de correções** (backup falso, banners) — porque a fundação anunciada estava quebrada.~~ **[Fase 0 CONCLUÍDA após esta revisão: digest real implementado, banners N0 aplicados, drill local implementado. Pendente da Fase 0: restore em staging descartável.]**
- Move **threat model e governança de migrations para antes do schema**.
- Substitui "criar as 11 tabelas" por **núcleo mínimo + vertical slice**.
- Torna explícito que **assinatura/offline/integração selada são portões pós-consultor**.

---

## 16. Prompt Recomendado para Próxima Etapa

> **Próxima etapa:** somente após esta revisão ser aceita e as correções da Fase 0 serem agendadas, usar Codex 5.5 para produzir o ADR físico do **núcleo mínimo** (não as 11 tabelas).

```text
Você está no monorepo AirTrust. Use produção segura (airtrust-production-safe).

Modelo recomendado: Codex 5.5.

Objetivo:
Produzir, SEM IMPLEMENTAR, um ADR físico para o NÚCLEO MÍNIMO do AirTrust
Regulated Records Core, incorporando as críticas do red team.

Restrições:
Não criar código. Não criar migrations. Não alterar banco/frontend/backend.
Não fazer deploy. Não fazer commit. Não mexer em secrets.
Apenas documentação (ADR).

Arquivos obrigatórios de referência:
- docs/ANAC_RECORDS_CORE_RED_TEAM_REVIEW.md   (esta revisão — autoridade)
- docs/ANAC_RECORDS_CORE_DESIGN_REVIEW.md
- docs/ANAC_BRIEFING_CONSULTOR_REGULATORIO.md
- docs/ANAC_MATRIZ_CONFORMIDADE_AIRTRUST.csv
- worker-airtrust/migrations/0385_audit_events_v2.sql  (entender o que NÃO é ledger)
- worker-airtrust/src/services/backup/orchestrator.ts  (~~digest falso a corrigir~~ — corrigido em `da5177af`; ler para verificar SHA-256 real e entender o orquestrador)

Documento a criar:
docs/ANAC_RECORDS_CORE_ADR_NUCLEO_MINIMO.md

Escopo do ADR — APENAS o núcleo mínimo (5 tabelas), não as 11:
1. regulated_records
2. regulated_record_versions
3. regulated_record_hashes
4. regulated_audit_events  (ledger novo, append-only, hash-chained — NÃO reaproveitar audit_events_v2)
5. regulated_addenda

Para cada tabela: colunas com tipo SQLite, PK, FKs lógicas, índices,
constraints, e os triggers BEFORE UPDATE/DELETE com RAISE(ABORT) para
tabelas seladas.

O ADR DEVE responder explicitamente às críticas do red team:
- RT-02: especificar o TESTE DE ARQUITETURA (migration guard) que verifica,
  após rodar todas as migrations, que cada tabela selada tem seus triggers.
  Descrever o teste, não implementá-lo.
- RT-03: estratégia concreta de serialização da hash chain por
  (empresa_id, record_type) sob a concorrência limitada do D1.
- RT-04: regras de canonicalização (Unicode NFC, ordem de chaves, números
  com escala, datas UTC, campos excluídos) + suite de vetores congelados.
- RT-05: protocolo write-then-verify D1↔R2 e proibição de lifecycle/overwrite
  em buckets regulados.
- RT-09: política de timestamps (server_received_at é o único oficial).
- Imutabilidade: além dos triggers, listar permissões internas, política de
  scripts/DDL, paridade dev/staging/prod e detecção de drift.

O ADR NÃO deve cobrir (adiar para ADR posterior, pós-consultor):
- assinatura jurídica (depende de D-01/D-02)
- offline/PED/sync (depende de D-03/D-05)
- integração selada entre módulos (depende de D-10)
- modo fiscalização exposto a fiscal externo (depende de LGPD/consultor)

Entregue:
1. Caminho do ADR.
2. DDL conceitual das 5 tabelas (sem virar migration).
3. Especificação do teste de migration guard.
4. Estratégia de hash chain sob concorrência D1.
5. Lista do que ficou explicitamente fora do escopo e por quê.
```

---

## Entregáveis desta revisão (resumo)

1. **Documento criado:** `docs/ANAC_RECORDS_CORE_RED_TEAM_REVIEW.md`
2. **Veredito:** direção correta; **não pronto** para ADR físico sem threat model, custódia de chaves, governança de migrations e correção do backup. Excesso de escopo inicial (11 tabelas) — começar pelo núcleo mínimo.
3. **15 riscos técnicos** mapeados; 4 verificados como já existentes (~~RT-06 backup falso~~ [mitigado localmente — ver Atualização §1], RT-14 protótipos mock, RT-02/RT-15 confirmados em código).
4. **3 fatos verificados** que o design subestimava: ~~backup com digest falso + bug~~ [corrigido — ver Atualização §1; drill local implementado; falta staging], `audit_events_v2` não é ledger imutável (aberto), 380 migrations sem governança de imutabilidade (aberto).
5. **Próximo modelo:** Codex 5.5 — ADR físico do **núcleo mínimo (5 tabelas)**, não as 11.

---

*Red team review por Claude Opus 4.8 — 2026-06-14*
*Fundamentada em leitura estática do repositório AirTrust*
*Não é orientação jurídica/regulatória — validar decisões D-* com consultor*
