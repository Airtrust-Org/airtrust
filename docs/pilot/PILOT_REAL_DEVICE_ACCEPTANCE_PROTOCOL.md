# Pilot App — protocolo de aceitação em dispositivos reais

Status: obrigatório antes de qualquer reativação do sync offline em produção.

Tracking: #580.

## Objetivo

Validar o Pilot App em hardware real, contra um SHA exato já publicado em staging, antes de permitir `PILOT_OFFLINE_SYNC_ENABLED=true` em produção.

Os testes automatizados de browser são complementares. Eles não substituem esta matriz física.

## Vínculo com a publicação de produção

O workflow oficial de produção valida a evidência física vinculada ao SHA publicado em staging antes de publicar Worker ou Pages. O SHA de staging precisa ser ancestral do release de produção, e o único arquivo que pode mudar entre eles é `docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json`; qualquer alteração de runtime ou outro delta bloqueia a publicação. Assim, o commit posterior que registra os resultados físicos não altera o código que foi homologado.

## Pré-condições

- usar apenas staging;
- registrar o SHA exato do codigo publicado em staging, antes de registrar a evidencia fisica;
- usar usuário/tenant de QA autorizado, sem inserir credenciais ou payload operacional sensível na evidência;
- confirmar que o Pilot App, Worker e frontend de staging correspondem ao mesmo release SHA;
- não executar promoção de produção durante esta validação.

## Matriz obrigatória

Cada linha abaixo deve terminar com `PASS`:

1. iPad — Safari — portrait;
2. iPad — Safari — landscape;
3. iPad — PWA/Home Screen — orientação não aplicável ao gate (`n/a`);
4. Android tablet — Chrome — portrait;
5. Android tablet — Chrome — landscape;
6. Android tablet — PWA — orientação não aplicável ao gate (`n/a`).

Para PWA, o fluxo deve ser exercitado no aplicativo instalado, não apenas em uma aba do navegador.

## Cenários mínimos

Em cada família de plataforma (iPad e Android), executar e registrar:

1. preparar/desbloquear o vault local;
2. baixar um flight package autorizado enquanto online;
3. confirmar o package e o estado de readiness persistidos localmente;
4. editar um campo do RDV e aguardar a confirmação `Salvo no tablet`;
5. habilitar modo avião/offline;
6. atualizar/reabrir o Pilot App;
7. desbloquear o vault e confirmar que o valor salvo foi restaurado exatamente;
8. continuar editando offline e confirmar avanço da revisão local;
9. reconectar e transmitir;
10. confirmar receipt idempotente do servidor, sem mutação duplicada;
11. provocar/verificar conflito explícito com versão de servidor obsoleta, sem last-write-wins silencioso;
12. confirmar que `Finalizar preenchimento` permanece separado de sincronização;
13. confirmar que `Enviar à Coordenação` permanece separado de finalização e produz receipt persistido;
14. confirmar que `/login` e o AirTrust raiz não são controlados pelo Service Worker do Pilot;
15. verificar touch targets, uma rolagem principal utilizável e ausência de overflow horizontal crítico nas duas orientações aplicáveis.

## Evidência obrigatória

Criar somente após a execução real:

`docs/pilot/PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.json`

Partir do arquivo `PILOT_REAL_DEVICE_ACCEPTANCE_EVIDENCE.example.json` e substituir todos os placeholders por evidência real.

O registro deve conter, no mínimo:

- `status` global;
- `staging_release_sha`, `worker_source_sha` e `pages_source_sha` iguais ao SHA do codigo publicado em staging (40 caracteres hexadecimais);
- `staging_pages_url` com o HTTPS do preview oficial `*.airtrust.pages.dev`;
- `validated_at` em ISO 8601;
- modelo do dispositivo;
- versão do sistema operacional;
- navegador ou modo PWA;
- orientação;
- resultado de cada linha e referencia saneada de evidencia fisica (`evidence_ref`);
- resultado dos 15 cenários, com observação curta quando necessário.

Screenshots ou vídeos podem ser referenciados quando úteis, mas não devem conter credenciais, tokens, dados pessoais ou payload operacional sensível.

## Vinculo entre o SHA publicado e o commit de evidência
Apos publicar o codigo exato em staging e realizar os testes fisicos, adicionar os resultados em um **commit de evidência** posterior, alterando **somente o arquivo EVIDENCE.json**. O SHA desse commit sera diferente do SHA da release, porque um commit Git nao pode conter seu proprio SHA sem alterar o SHA.

O workflow read-only passa a iniciar em `pull_request` quando a PR recebe o arquivo de evidencia: verifica o HEAD da PR de mesma origem, exige que o SHA publicado seja antepassado do commit da evidencia, proibe qualquer delta de runtime entre eles, valida 6 x 15 PASS e confere o Worker /api/version e assets Pages com o SHA publicado. Se o codigo mudar apos staging, publicar um novo candidato e refazer o aceite fisico. Isso **nao** libera schema, deploy, merge, flag ou producao.

## Regra de PASS

Uma linha só pode ter `result: "PASS"` se todos os cenários obrigatórios aplicáveis àquela linha tiverem passado.

O `status` global só pode ser `PASS` se as seis linhas obrigatórias estiverem presentes e em PASS.

O gate read-only `.github/workflows/pilot-real-device-acceptance.yml` valida o SHA exato, o Worker de staging e o asset do Pilot App publicado em Pages, além dos 15 cenários em cada uma das seis linhas; somente depois da execução real pode existir evidência PASS. O teste `src/__tests__/pilot-production-real-device-gate.test.ts` faz fail-closed caso produção seja reativada sem o arquivo de evidência com status PASS, SHA válido e as seis linhas obrigatórias.

## Falha e reteste

Qualquer FAIL mantém produção bloqueada. Corrigir a causa em PR separado, validar CI, publicar novo SHA em staging e repetir a matriz sobre esse novo SHA. Evidência de um SHA anterior não autoriza outro release.

## Cutover posterior

A existência da evidência não autoriza deploy por si só. Uma futura reativação de produção ainda exige PR específico, CI completo, revisão do SHA exato, workflow oficial de produção e smoke pós-deploy.
