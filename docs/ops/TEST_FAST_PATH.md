# AirTrust — Fast path de testes

Objetivo: provar a correção com a menor sequência suficiente, sem substituir a CI oficial.

## Sequência

```text
reprodução
→ teste focado
→ suíte afetada
→ checks locais relevantes
→ PR
→ 8 gates oficiais
→ E2E/staging somente quando o risco/comportamento exigir
```

## Planejador por delta

`npm run agent:test-plan` compara a branch com `origin/main` e monta um plano conservador.

- testes alterados são executados diretamente quando possível;
- mudanças de frontend chamam a suíte frontend;
- mudanças do Worker chamam suíte + typecheck do Worker;
- mudanças LMS/SCORM incluem smoke LMS local;
- mudanças E2E/Playwright incluem E2E;
- mudanças somente documentais não disparam suítes de produto localmente;
- CI oficial continua sendo a autoridade para integração.

Para executar o plano:

```bash
npm run agent:test-plan -- --run
```

## Browser

Validação manual no Brave/Chrome é apropriada para reprodução visual ou caso real. Se a mesma jornada precisar ser repetida em correções futuras, adicionar Playwright ou teste de integração e usar esse teste como prova primária.

## Evitar

- rodar toda a suíte antes de o teste focado passar;
- abrir logs de jobs verdes;
- repetir CI para o mesmo SHA sem delta;
- usar staging como substituto de teste focado;
- aumentar baseline/ratchet para obter verde.
