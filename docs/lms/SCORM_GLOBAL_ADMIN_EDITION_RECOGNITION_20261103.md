# LMS SCORM — Reconhecimento administrativo global entre edições (03/11/2026)

## Regra aprovada pelo proprietário

Aplica-se a todos os alunos com progresso anterior em um treinamento SCORM
que receba uma nova edição. O histórico anterior é arquivado e as unidades
anteriores à posição calculada na edição ativa são reconhecidas como
concluídas por decisão administrativa.

Exemplo sintético: 84% anteriores e posição proposta 42/49 significam
unidades 1–41 reconhecidas, retomada na 42 e 84% na matrícula atual.
Isso não certifica presença real nos slides do novo ZIP, nem transfere nota,
aprovação de prova, qualificação ou certificado.

## Garantias

- O frontend não define porcentagem, posição nem pacote ativo. O servidor
  verifica tenant, usuário, matrícula, ciclo, SHA ACTIVE, manifesto e plano.
- A migração com crédito ocorre no mesmo batch D1 do arquivamento imutável.
- A trilha de auditoria registra origem, unidades reconhecidas e decisão
  administrativa, sem inventar prova ou resultado.
- Matrículas já zeradas pelo fluxo anterior podem ser recuperadas por
  operação autenticada e idempotente se ainda não houve estudo real
  na nova edição. Em conflito, não se apagam novas evidências.
- O CMI de retomada é compatível com o motor AirTrust Factory V3, versão 4,
  e não injeta notas nem status de aprovação.
- Outro motor SCORM exige homologação antes de permitir equivalência. Não
  presumir compatibilidade apenas por coincidência de número de slides.

## Validação de release

Os oito gates oficiais, testes de retomada e conclusão, staging autenticado,
isolamento tenant, integridade dos arquivos e autorização de produção
por SHA continuam obrigatórios. Não reaplicar Schema V2 0566.
