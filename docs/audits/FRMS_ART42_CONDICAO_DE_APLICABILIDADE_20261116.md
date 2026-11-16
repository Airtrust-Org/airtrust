# FRMS — Art. 42 da Lei 13.475/2017 (madrugadas): condição de aplicabilidade

Data: 2026-11-16. Escopo: documentar o estado do art. 42 no FRMS e o que **depende de definição jurídica**,
sem tratar uma pendência jurídica como defeito de software. **Nada neste documento ativa o art. 42.**

## 1. O que o código faz hoje

- `worker-airtrust/src/lib/frms/law-art42-madrugadas.ts` calcula, a partir das jornadas realizadas,
  (a) madrugadas consecutivas trabalhadas, (b) madrugadas em 168 h e (c) o número de jornadas sem horário
  utilizável (`incompleteDuties`). Madrugada é o período entre 0 h e 6 h da base, total ou parcialmente.
- **Não modelado**, por falta de dado no snapshot: § 1º (3ª madrugada consecutiva só como extra no retorno) e a
  exceção do ACT Costa do Sol cl. 8ª § 2º (aeromédico e manutenção), porque a função a bordo e o tipo de
  operação por jornada não existem no snapshot.
- Em `regulatory-compliance.ts`, o cálculo só vale para helicóptero. Os achados têm dois destinos:
  - **sem** `law_art42_enforced`: viram `pendingValidation`. Aparecem na ficha como "validação pendente" e **não
    alteram o status** de conformidade;
  - **com** `law_art42_enforced: true` no perfil regulatório vigente (`lawArt42EnforcementEnabled`): viram
    `violations` e passam a bloquear. Jornada sem horário utilizável vira `LAW_ART42_DUTY_TIMES_INCOMPLETE`
    (desconhecido), nunca "conforme".
- O valor padrão é **inativo** (falha fechada): ausência do campo, JSON inválido ou perfil não resolvido resultam em
  inativo.

## 2. Estado em produção

O workflow `production-frms-sigvoos-chain-readonly.yml` (somente leitura) informa o estado do campo no perfil vigente
(`ART42_ENFORCEMENT_STATE`: `INACTIVE` ou `ACTIVE`) e, se estiver ativo, emite o aviso
`ART42_ACTIVE_VERIFY_LEGAL_BASIS`. O resultado do último disparo está no relatório de fechamento.

## 3. O que depende de definição (não é pendência de software)

| # | Questão | Quem decide | Efeito se ativar sem resposta |
|---|---|---|---|
| 1 | O art. 42 se aplica à operação offshore com apresentação antes das 06:00 sob regime de missão? | Jurídico da empresa, com a base sindical/ACT | Bloqueio de aeronautas por norma que talvez não se aplique ao regime |
| 2 | A exceção de aeromédico e manutenção (ACT cl. 8ª § 2º) depende de função a bordo e tipo de operação | Jurídico e Operações | Falso bloqueio de quem é excepcionado, ou falsa conformidade se a exceção for ignorada |
| 3 | A contagem usa a base contratual; qual fuso vale para tripulante lotado fora da base? | Jurídico | Madrugada contada em fuso errado |
| 4 | RBAC 117 A117.15(m) traz limite equivalente (2 madrugadas consecutivas; 4 em 168 h) que só pode ser alterado por manual aprovado pela ANAC | Coordenação regulatória | Duplicidade ou conflito entre limite legal e limite do manual |

## 4. Como ativar quando houver parecer (governado, fora deste código)

1. Parecer jurídico escrito respondendo 1 a 3, com data e responsável.
2. Revisão do perfil regulatório da empresa em `frms_regulatory_profiles.limits_json` com
   `"law_art42_enforced": true`, pelo fluxo governado de Schema V2 ou mudança de dados com `source_document_hash` do
   parecer, backup, recuperação e pós-condições. **Nunca** por escrita direta em produção.
3. Se a exceção da cl. 8ª § 2º for aplicável, antes de ativar é preciso levar função a bordo e tipo de operação ao
   snapshot; sem isso a exceção não é modelada (seção 1).
4. Validar em staging com tripulantes sintéticos: 2 madrugadas consecutivas (conforme), 3 (violação), 48 h livres
   (reinício) e jornada sem horário (desconhecido).

## 5. Testes que protegem o comportamento atual

`law-art42-madrugadas.test.ts` e `regulatory-compliance.test.ts` cobrem o cálculo e o caminho
inativo/ativo. A sonda de produção apenas lê o estado; não grava.

Este documento não constitui parecer jurídico nem aprovação ou aceitação da ANAC.
