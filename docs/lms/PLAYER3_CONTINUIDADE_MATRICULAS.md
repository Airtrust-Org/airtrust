# AirTrust Player 3 — Inventário e preservação de todas as matrículas ativas

Atualizado em 2026-10-14. Frente de código: [PR #1389](https://github.com/Airtrust-Org/airtrust/pull/1389), preservação de alunos no cutover do LMS.

## Regra operacional

**Nenhum aluno perde o andamento por causa da substituição do player.** O avanço anterior é um direito histórico a preservar, mas porcentagem, contador visual, bookmark e aprovação são fatos *diferentes*. Progresso antigo = registro histórico e base de retomada; não vira automaticamente prova final concluída, qualificação ou certificado.

Manter a mesma matrícula, empresa, funcionário, curso e ciclo sempre que o contrato permitir. Nunca reinicializar matrícula antiga no cutover, nem sobrescrever informação mais recente com fotografia anterior.

## Que alunos entram no inventário

**Primeira execução autorizável: somente Costa do Sol, `empresa_id=6`, abrangendo todos os alunos e cursos desse tenant.** `lms_matriculas` não excluídas com status `EM_ANDAMENTO` e `NAO_INICIADO`; incluir `NAO_INICIADO` porque pode haver progresso SCORM persistido, dados divergentes ou matrícula que será afetada no lançamento. Outros clientes/tenants jamais são incluídos automaticamente: precisam de escopo e autorização próprios, workflow revisado separado e segredo de cifragem segregado. Manter todos os registros históricos e ciclos anteriores intocados. Se houver aluno com matrícula cancelada, duplicada, sem ciclo, status conflitante ou concluída com dados inconsistentes, inventariar em relatório de exceções separado **antes** de qualquer tratamento administrativo. Não tentar "normalizar" dados antigos por conta própria.

Capturar, por matrícula:

- **Identidade técnica privada**: `empresa_id`, `funcionario_id`, `matricula_id`, `curso_id`, `ciclo_id`, `numero_ciclo`, edição/versão do pacote, timestamps e fonte do registro.
- **SSOT**: status, `progresso_pct`, nota/tentativas de `lms_matriculas` **e** do ciclo atual; conflitos entre ambos.
- **Retomada**: `ultimo_slide`, `ultima_pagina`, `lms_progresso_scorm.lesson_status`, `completion_status`, `success_status`, `score_raw`, `last_commit_at`, `suspend_data` e `cmi_json` **em cofre criptografado**, nunca em GitHub/logs.
- **Evidência granular quando existir**: IDs de unidades/questões autenticamente cursadas, resultados de provas modulares e tentativas, presos à versão/hash do pacote. Um contador 80% não prova quais unidades foram visitadas.

A consulta fixa revisada é `scripts/learning-factory/player3-active-enrollments-readonly.sql`. Ela executa **SELECT-only**, filtrada por `empresa_id=6`, e não escreve no banco. O utilitário `player3-seal-active-inventory.mjs` recebe os dados apenas por stdin, valida identidades e criptografa todos os dados individualizados em AES-256-GCM (chave 256-bit protegida). Seus logs contêm somente totais sem identificação. A chave nunca entra no repositório e não deve ser registrada no chat.

### Execução autorizada

Workflow `.github/workflows/production-player3-enrollment-inventory-readonly.yml` — **pendente de integração na main e autorização das credenciais**. Só executa na main com SHA exato, oito gates, aprovação de environment production, confirmação `AIRTRUST_PLAYER3_READONLY_INVENTORY` e token D1 **somente leitura**. A chave `AIRTRUST_PLAYER3_SNAPSHOT_KEY_B64` precisa existir em Secrets e ser preservada no cofre de chaves corporativo; sem ela, o fluxo falha fechado. Somente um artefato **criptografado** é armazenado no GitHub Actions, não dados em texto puro; é obrigatório transferir a cópia criptografada para armazenamento privado corporativo governado com retenção suficiente para o cutover.

**Importante: o código versionado não significa que já exista um inventário real.** Ainda é preciso executar o workflow aprovado contra o D1 de produção e conferir o total de empresas/alunos/cursos e os conflitos reportados. Nenhuma query com resultado real foi executada nesta frente; não afirmar quantos alunos existem antes disso.

## Regra de continuidade na troca de versão

**A — Edição e unidades equivalentes, evidência confiável.** Mapear cada unidade completada do pacote de origem para o destino por crosswalk explícito e revisado; retomar na próxima unidade necessária, preservando o percentual antigo como dado histórico. Prova modular já aprovada só é creditada mediante evidência de avaliação verificável e política vigente. Nem mesmo 100% de slides conclui automaticamente a matrícula.

**B — Progresso legado de 80%, 99% etc., mas sem evidência granular suficiente.** Preservar rigorosamente o percentual, bookmark/CMI e datas no cofre. Elaborar crédito administrativo de **retomada**, identificado como tal e auditado, posicionando o aluno no ponto equivalente após revisão das versões; o crédito não fabrica eventos SCORM/Native nem aprova avaliação. Não forçar retorno automático a 0%; enviar para fila de equivalência com identificação da unidade/módulo mais próximo e decisão da Gerência de Treinamento.

**C — Divergência de ciclo, curso, tenant, ausência de vínculo, conflito de versão ou histórico não validado.** Classificar `SOURCE_CONFLICT` / revisão obrigatória. Não tocar dados da matrícula antiga. Resolver por equivalência individual documentada, nunca por atualização cega de tabela ou reaproveitamento de evidência de outro ciclo.

Implementação pura em `worker-airtrust/src/lib/lms-player3/continuity.ts`: `buildContinuityPlans` e `planContinuity`. Não altera banco; retorna `EXACT_RESTORE`, `UNIT_CROSSWALK`, `ADMIN_EQUIVALENCE_REVIEW`, `NO_PROGRESS` ou `SOURCE_CONFLICT`. Sempre `grants_completed=false` e `grants_certification=false`; a conclusão continua com o escritor canônico verificado no servidor.

## Inventário contínuo até o cutover

1. **T0, snapshot de referência**: extrair todos os alunos dos tenants autorizados, guardar arquivo cifrado, hash, SHA de código de origem e data/contagem. O workflow ser disparado não significa que o snapshot esteja correto: conferir totais e status.
2. **T1, delta**: continuar permitindo que alunos estudem no sistema atual. Antes do cutover, nova exportação completa ou evento de mudanças com inclusão de matrículas novas, status, CMI e ciclos; comparar `updated_at` e `last_commit_at` com T0, não sobrescrever evidência posterior.
3. **Janela de corte**: impedir somente novas escritas conflitantes durante migração daquela edição/tenant, nunca congelar toda a AirTrust; capturar snapshot final coerente, SHA/DB watermark, manifest de alvo e contagens reconciliadas. Registros que mudaram durante a janela não podem ser silenciosamente perdidos.
4. **Plano individual e dry-run**: para cada matrícula, destino previsto, versão dos dois lados, % preservada, módulo de retomada, divergências, evidência, operador/aprovação de equivalência, motivo e hash do snapshot. Necessário validar 1:1 (sem perda nem criação de matrícula), em isolamento por tenant/ciclo.
5. **Aplicação governada**: apenas pelo fluxo Schema V2/backend autorizado, com backup/recovery, registro de auditoria, idempotência, comparação de timestamps e pós-condições. Não executar SQL improvisado nem usar frontend para fabricar status.
6. **Pós-validação**: amostragem e execução real (incluindo alunos com 0/20/80/99%, avaliações modulares, retomada Safari/Chromium, qualificação/certificado). Nenhuma matrícula pode regredir; nunca converter matrícula `EM_ANDAMENTO` em `CONCLUIDO` sem provas verificadas.
7. **Rollback/reconciliação**: se a edição nova falhar, manter a matrícula histórica e o artefato de referência e liberar retomada compatível pela rota legada até corrigir a integração. Preservar a possibilidade de restaurar posicionamento sem alterar certificado.

## Pendências objetivas

- Não há **snapshot real de produção** ou contagem de alunos nesta execução; não disponibilizar nomes ou IDs privados no GitHub nem no chat.
- Precisamos de aprovação CI da PR, integração segura do workflow e chave de criptografia + token D1 somente leitura no ambiente governado.
- Precisamos do motor de aplicação de créditos com auditoria e versionamento por edição/ciclo, ligado à nova persistência Player 3 e ao writer canônico do LMS; **não implantar crédito diretamente na tabela de progresso SCORM**.
- Critérios finais para alunos cujos cursos mudaram exigem confronto pacote original x novo, preservando o design e a pedagogia.

## Adaptação comprovada dos 22 pacotes de origem — 2026-10-14

Inspeção privada dos arquivos `app.js` que efetivamente geram `cmi.suspend_data`:

- **12 cursos:** layout `v=2/3/4` com `a` (posição ativa) e `d[]` (índices ou IDs de slides percorridos). Essa lista pode ser convertida de volta aos IDs estáveis do `course_data.js`, **somente para retomada**, nunca para aprovar prova.
- **7 cursos:** formato compacto V4 (CRM/Ética/FDM/NR-05/Stop Work), que preserva `a` (bookmark) mas **não** fornece necessariamente o conjunto `d[]`. Não inventar visitas anteriores a partir do bookmark.
- **1 curso:** Gerenciamento de Resíduos V4 registra slides concluídos em `c[]` e decisões de cenário em `d{}`; distinguir esses campos para não creditar decisões como aulas.
- **2 cursos:** SGSO no formato bitmap `s='A10'` usa `c` (posição) e `v` (bitmap de visitas). Como não possui versão embutida, só interpretar quando o SHA-256 do original de D1/R2 for comprovadamente o da edição publicada; caso contrário revisão administrativa.

`worker-airtrust/src/lib/lms-player3/legacy-resume-evidence.ts` implementa esses leitores em modo SOMENTE LEITURA. Recebe o estado SCORM persistido em D1 e os IDs da edição **verificada pelo backend**; produz `VISITED_UNITS`, `BOOKMARK_ONLY` ou `REVIEW_REQUIRED`, sempre `grants_assessment_pass=false`, `grants_completion=false`. Não tomar entrada de alunos como fonte de auditoria.

**QA:** 10 testes específicos dos formatos de estado e rejeição de falso "passed", mais 14 testes de continuidade e 11 do núcleo Player3 = 35 Worker PASS; typecheck Worker PASS. Essas são provas de lógica, **não** validação de conteúdos/matrículas reais de produção.

**Aplicação futura:** cruzar com o manifesto/hash original privado e com a edição alvo; mapear `VISITED_UNITS` onde permitido, `BOOKMARK_ONLY` para equivalência administrativa auditada e `REVIEW_REQUIRED` para casos incompatíveis. Preservar 80% como histórico em todas as três categorias; não adiantar 80% das unidades por simples regra de três nem inferir aprovação de avaliações.

## Restrição explícita de privacidade multi-tenant

O objetivo de preservação vale para todas as empresas que um dia migrarem para Player3, **mas isso não concede acesso coletivo aos dados de todos os clientes**. O primeiro lote efetivo da Costa do Sol tem `WHERE m.empresa_id=6` no SQL, verificação de escopo no workflow e bloqueio independente no selador AES-256-GCM. Nenhum ID/CMI de outro tenant pode entrar no arquivo. Uma futura migração de outro cliente exige aprovação individual, edição auditada do contrato e segregação de chaves/artefatos. A contagem dos alunos na Costa do Sol continua **desconhecida** até o SELECT ser executado com autorização, gates e credenciais apropriados; não há snapshot real nesta PR.
