# Player 3 — homologação técnica primeiro (decisão do operador, 2026-10-18)

**Objetivo atual:** fazer o player funcionar de ponta a ponta, sem auditar, converter, corrigir nem publicar os arquivos originais dos cursos. O operador fornecerá um ZIP com o conjunto de treinamentos **depois** da estabilização técnica para adaptações técnicas separadas. Não exigir aprovação pedagógica nem disponibilidade do RC8.1 como pré-requisito do **aceite técnico**.

## Dois aceites separados

1. **Aceite TÉCNICO (agora):** player isolado, autenticação e tenant, abertura de edição imutável, navegação, fixação, salvamento e retomada, tentativa errada, retentativa, correção exclusivamente pelo Worker, terminal atômico, não duplicação, vínculo de qualificação/certificado PDF verificável e replay, Chromium e WebKit. Executar com **pacote e matrículas 100% sintéticos**, em tenant QA explícito, por mecanismo governado e em staging. Um pacote técnico tem conteúdo inventado só para exercitar a interface; não representa cursos reais nem constitui conclusão de treinamento.
2. **Aceite de CONTEÚDO (posterior):** somente após o player técnico passar, receber do operador os ZIPs originais, preservar autoria e aplicar adaptações técnicas necessárias a cada curso. Políticas particulares, fidelidade visual/recursos e equivalência dos conteúdos existentes serão analisadas nessa fase. Isso não desbloqueia publicação de curso real nesta fase.

## Modalidade de prova técnica

Em `e2e/player3/fixture-contract.ts`, o perfil privado pode declarar `qaContentMode: "SYNTHETIC_TECHNICAL"` em vez do padrão `"AUTHORED_RC81"`. O hash SHA-256 do ZIP sintético deve corresponder exatamente à variável protegida `PLAYER3_QA_SYNTHETIC_SOURCE_SHA256` e **ser diferente do hash original RC8.1**. O perfil, por si só, nunca autoriza seu próprio pacote. A edição de conteúdo continua imutável, em origem HTTPS staging segregada; URLs continuam vinculadas a `empresa_id`, curso, edição e hash de conteúdo.

O teste técnico aceita **4 a 100 unidades sintéticas**, **1 a 8 avaliações oficiais** (dez perguntas verificáveis por avaliação), unidades de lição com recibos canônicos, pelo menos uma fixação e duas matrículas de browsers independentes. Os dois outros casos por browser permanecem: retomada histórica de navegação a 80% (sem nota inventada) e compatibilidade SCORM 1.2 externo em ambiente QA, separado do Native.

O E2E executa os mesmos caminhos **reais** de tela/iframe, API, D1, histórico, R2 e PDF. Não simular status de aprovação, gravar resultado direto no banco, falsificar `postMessage`, desligar guards do backend, nem usar pacote SCORM incompatível só para gerar verde. Ausência de infraestrutura/identidade, botão ou fixture deve falhar, não ser marcada como skip aprovado.

### Gates que não mudam

- Frontend sem acesso a gabaritos/segredos. Worker responde tentativas com dados efetivamente calculados e persistidos.
- Conclusão somente mediante política transacional e histórico/certificado emitidos e inspecionados; último slide e porcentagem não certificam.
- Tenant isolado, RBAC, origem do HTML5 e arquivos R2 verificados.
- Staging: workflow oficial, snapshot SHA, 8 gates, D1 Schema V2 e recuperação conforme manifesto/ledger, janela coordenada na issue #776.
- 0561 e 0562 são atualmente **REVIEW-ONLY**, sem autorização de SQL, seed ou produção. O aceite técnico não converte esses candidatos em migrações aplicadas.
- Produção só com autorização específica de SHA/artefato/escopo; não incluir ou modificar material de cursos antes da fase posterior.

## Critério objetivo de encerramento

O Player 3 técnico está pronto quando: a suite do novo SHA passou por 8/8 gates, Worker/Pages/schema necessários foram publicados oficialmente em staging, seis jornadas Chromium/WebKit usando matrículas QA descartáveis foram **executadas** com evidência real (não apenas listadas/compiladas), casos de erro e segurança passaram e a página abre/retoma/conclui sem duplicidade e com PDF acessível. Documentar bloqueio real caso a homologação não possa ser executada. **Não declarar o LMS de cursos originais pronto nem percentual global derivado desses testes.**

O contrato de homologação fiel do Doutrinamento RC8.1 permanece preservado em `docs/lms/PLAYER3_FRONT_D_HOMOLOGATION.md` e seu SHA original continua exigido em `AUTHORED_RC81`, **somente para a fase posterior**. Nada do treinamento real foi editado nesta mudança.

## Preflight de ativação QA sintética — execução sem alterações remotas

O candidato técnico possui o script `scripts/staging/player3-technical-qa-activation-preflight.mjs`. Ele valida **somente a configuração** do tenant QA para o SHA explicitamente revisado; não publica conteúdo, não cria matrícula, não consulta D1/R2 e nunca comprova seis jornadas.

Para executá-lo em um workspace protegido, forneça as variáveis do **ambiente staging autorizado**, sem registrá-las em logs nem arquivos públicos: `ENVIRONMENT=staging`, `PLAYER3_QA_SYNTHETIC_TENANT_ID` e `PLAYER3_QA_EXPECTED_SHA`, os oito allowlists exigidos pelo script, `PLAYER3_QA_STAGING_ORIGIN`, `PLAYER3_QA_API_ORIGIN`, `PLAYER3_AUTHORED_CONTENT_ORIGIN` e `PLAYER3_QA_CONTENT_ORIGIN`. A origem HTML5 deve ser uma **terceira origem HTTPS** diferente de Pages e Worker. Valores wildcard, tenant de cliente, ambiente de produção, SHA ou origem discrepantes devem falhar.

```bash
node scripts/staging/player3-technical-qa-activation-preflight.mjs
node --test scripts/__tests__/player3-technical-qa-activation-preflight.test.mjs
```

O output deliberadamente contém apenas nomes de gates ausentes, booleans e contagens, sem identidades, tokens ou valor de allowlist. **`tenantGateReady: true` não comprova schema, edição, matrícula, conclusão ou PDF**; esses campos permanecem `false` até validação física independente. Flags jamais devem ser habilitadas globalmente ou em produção.

**Dependências materiais ainda não supridas pelo gerador offline:** tenant sintético exclusivo autorizado, usuário autenticado sem acesso cross-tenant, curso criado pela API sob governança, marker Native, edição publicada com bytes/hash pinados, banco e política privados no R2, conteúdo HTML5 isolado, seis matrículas/ciclos distintos, perfil QA privado com credenciais adequadas, uma matrícula de continuidade 80% e um pacote SCORM 1.2 externo autorizado. Aplicações 0561/0562 de staging são infraestrutura necessária, mas não provisionam esses dados nem ativam flags. As matrículas devem ser criadas pelo writer transacional do Worker, não por INSERT improvisado.

A janela de mutações de staging utiliza o lock compartilhado `airtrust-staging-mutations-and-scorm-qa`; consultar issue #776 antes de qualquer seed, upload, deploy ou E2E. Restauração e limpeza dos dados descartáveis devem ser verificadas por recibos reais, sem apagar cursos ou matrículas preexistentes. Somente depois de executar e evidenciar 6/6 jornadas Chromium/WebKit, certificado PDF real e regressão SCORM é permitido avaliar saída de draft, merge protegido e release específico.
