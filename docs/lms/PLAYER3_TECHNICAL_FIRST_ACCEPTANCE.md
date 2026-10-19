# Player 3 — homologação técnica primeiro (decisão do operador, 2026-10-18)

**Objetivo atual:** fazer o player funcionar de ponta a ponta, sem auditar, converter, corrigir nem publicar os arquivos originais dos cursos. O operador fornecerá um ZIP com o conjunto de treinamentos **depois** da estabilização técnica para adaptações técnicas separadas. Não exigir aprovação pedagógica nem disponibilidade do RC8.1 como pré-requisito do **aceite técnico**.

## Dois aceites separados

1. **Aceite TÉCNICO (agora):** player isolado, autenticação e tenant, abertura de edição imutável, navegação, fixação, salvamento e retomada, tentativa errada, retentativa, correção exclusivamente pelo Worker, terminal atômico, não duplicação, vínculo de qualificação/certificado PDF verificável e replay, Chromium e WebKit. Executar com **pacote e matrículas 100% sintéticos**, em tenant QA explícito, por mecanismo governado e em staging. Um pacote técnico tem conteúdo inventado só para exercitar a interface; não representa cursos reais nem constitui conclusão de treinamento.
2. **Aceite de CONTEÚDO (posterior):** somente após o player técnico passar, receber do operador os ZIPs originais, preservar autoria e aplicar adaptações técnicas necessárias a cada curso. Políticas particulares, fidelidade visual/recursos e equivalência dos conteúdos existentes serão analisadas nessa fase. Isso não desbloqueia publicação de curso real nesta fase.

## Identidades sintéticas independentes

O executor E2E exige `PLAYER3_QA_STORAGE_STATE_CHROMIUM` e
`PLAYER3_QA_STORAGE_STATE_WEBKIT` diferentes quando
`qaContentMode=SYNTHETIC_TECHNICAL`. O estado global legado
`PLAYER3_QA_STORAGE_STATE` não pode substituí-los nessa modalidade.
As credenciais de cada navegador devem pertencer a alunos sintéticos
autorizados no tenant QA, com matrículas e ciclos distintos; somente um
arquivo com nome diferente não comprova identidade independente.
Esse pré-requisito falha fechado antes de abrir o conteúdo. Os estados
autenticados ficam fora do repositório, em artefatos efêmeros protegidos
do GitHub Actions staging, nunca em comentários ou logs.

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
