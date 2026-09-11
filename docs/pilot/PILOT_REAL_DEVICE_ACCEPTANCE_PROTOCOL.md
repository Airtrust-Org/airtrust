# Pilot App — protocolo de aceitação em dispositivos reais

Status: obrigatório antes de qualquer reativação do sync offline em produção.

Tracking: #580.

## Objetivo

Validar o Pilot App em hardware real, contra um SHA exato já publicado em staging, antes de permitir `PILOT_OFFLINE_SYNC_ENABLED=true` em produção.

Os testes automatizados de browser são complementares. Eles não substituem esta matriz física.

## Pré-condições

- usar apenas staging;
- registrar o SHA exato da release validada;
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
- `staging_release_sha` com 40 caracteres hexadecimais;
- `validated_at` em ISO 8601;
- modelo do dispositivo;
- versão do sistema operacional;
- navegador ou modo PWA;
- orientação;
- resultado de cada linha;
- resultado dos 15 cenários, com observação curta quando necessário.

Screenshots ou vídeos podem ser referenciados quando úteis, mas não devem conter credenciais, tokens, dados pessoais ou payload operacional sensível.

## Regra de PASS

Uma linha só pode ter `result: "PASS"` se todos os cenários obrigatórios aplicáveis àquela linha tiverem passado.

O `status` global só pode ser `PASS` se as seis linhas obrigatórias estiverem presentes e em PASS.

O teste `src/__tests__/pilot-production-real-device-gate.test.ts` faz fail-closed caso produção seja reativada sem o arquivo de evidência com status PASS, SHA válido e as seis linhas obrigatórias.

## Falha e reteste

Qualquer FAIL mantém produção bloqueada. Corrigir a causa em PR separado, validar CI, publicar novo SHA em staging e repetir a matriz sobre esse novo SHA. Evidência de um SHA anterior não autoriza outro release.

## Cutover posterior

A existência da evidência não autoriza deploy por si só. Uma futura reativação de produção ainda exige PR específico, CI completo, revisão do SHA exato, workflow oficial de produção e smoke pós-deploy.
