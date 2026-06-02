# AirTrust Second Company Onboarding Runbook v0.5

Data: 2026-06-02

## 1. Escopo

Entrada da segunda empresa real em piloto controlado. Este runbook cobre preparacao, criacao operacional, validacao e handover. Ele nao autoriza seed, importacao, migration, alteracao manual no banco real ou criacao de dados sem aprovacao.

## 2. Quem Pode Executar

Somente operador AirTrust autorizado, com:

- acesso administrativo aprovado;
- entendimento do modelo multi-tenant;
- checklist preflight concluido;
- canal de suporte e rollback definido.

## 3. Pre-requisitos Legais e Operacionais

- Contrato, DPA/termos de tratamento de dados e escopo do piloto aprovados.
- Contato legal e contato operacional definidos.
- Modulos do piloto aprovados conforme matriz.
- Politica de assets protegidos publicada.
- Smoke autenticado da empresa atual concluido ou registrado como `SKIPPED_AUTH_REQUIRED` por falta de credencial.

## 4. Dados Que o Cliente Deve Fornecer

Coletar somente:

- nome legal e nome de exibicao;
- codigo curto para o tenant;
- timezone;
- primeiro admin: nome, email corporativo e cargo;
- quantidade estimada de funcionarios;
- modulos que entram no piloto;
- contato de suporte inicial;
- data de inicio planejada.

Nao coletar documentos pessoais, ASO, certificados ou bases completas antes da aprovacao do preflight.

## 5. Criacao da Empresa

Executar apenas pelo fluxo operacional aprovado da aplicacao ou wrapper seguro definido pela equipe.

Antes de criar:

- confirmar que nao ha migration pendente;
- confirmar que nao sera usado seed;
- confirmar que nao sera usado `wrangler d1 execute --remote`;
- confirmar que o tenant sera criado vazio ou com dados minimos aprovados.

Registrar evidencia sanitizada: data, operador, ambiente, modulos liberados e identificador nao sensivel do tenant.

## 6. Criacao do Primeiro Admin

Criar somente o primeiro admin indicado e aprovado pelo cliente.

Controles:

- usar email corporativo;
- nao reutilizar usuario de outra empresa;
- validar que o usuario fica vinculado somente ao tenant novo;
- nao conceder acesso de plataforma se o papel esperado for admin do tenant.

## 7. Convite Por E-mail e Fallback de ConviteUrl

Fluxo preferencial:

1. gerar convite pelo fluxo da aplicacao;
2. enviar por e-mail transacional;
3. registrar apenas status de envio, sem token.

Fallback:

- usar `conviteUrl` somente se o e-mail falhar;
- compartilhar por canal aprovado;
- nunca salvar ou commitar a URL;
- expirar/revogar convite se houver suspeita de exposicao.

## 8. Configuracao Inicial Por Modulo

Configurar apenas modulos aprovados:

- Funcionarios: campos basicos e status ativo/inativo.
- Qualificacoes: tipos, alertas e historico minimo se aprovado.
- Simuladores: modelos/sessoes somente se houver dados reais necessarios.
- Dashboard: leitura consolidada.
- Escalas/EVD: liberar com acompanhamento.
- FRMS/Fadiga: liberar com orientacao LGPD e escopo claro.

## 9. Dados Minimos

Comecar com o menor conjunto de dados possivel:

- 1 admin do tenant;
- configuracoes basicas da empresa;
- funcionarios essenciais para validar fluxo, se aprovado;
- qualificacoes ou sessoes apenas quando necessarias ao piloto.

Nao carregar documentos sensiveis antes de confirmar ownership, rotas autenticadas e consentimento operacional.

## 10. Modulos a Ativar

Ativar em piloto controlado:

- Funcionarios.
- Qualificacoes.
- Simuladores.
- Dashboard executivo.
- Escalas/EVD com acompanhamento.
- FRMS/Fadiga com acompanhamento.
- Exportacao/PDFs/certificados apos checagem de assets.

## 11. Modulos a Manter Ocultos

- Treinamentos planejados.
- SGSO.
- LMS/EAD.
- Hospedagem.
- Configuracoes "em breve".
- Funcionalidades com dados de teste.

Bloquear SIGVOOS para o novo tenant ate revisao especifica.

## 12. Smoke Antes de Liberar Acesso

Antes de entregar acesso ao cliente:

```bash
AIRTRUST_EXPECTED_EMPRESA_ID="<id-novo-tenant>" AIRTRUST_AUTH_TOKEN="<redacted>" \
  bash scripts/smoke-authenticated-operational.sh
```

Validar:

- auth/me;
- auth/empresas;
- dashboard;
- funcionarios;
- qualificacoes;
- simuladores;
- EVD/FRMS se liberados;
- probe seguro de assets.

## 13. Handover Para Cliente

Enviar apenas:

- URL da aplicacao;
- orientacao de primeiro login;
- modulos liberados no piloto;
- canal de suporte;
- limites do piloto;
- procedimento para reportar problema.

Nao enviar tokens, cookies, dumps, scripts SQL ou dados de outro tenant.

## 14. Suporte Inicial

Primeiros dias:

- monitorar login e erros de API;
- acompanhar modulos piloto;
- revisar feedback com checklist;
- manter escopo fechado;
- nao ativar modulo beta sem nova aprovacao.

## 15. Rollback/Offboarding

Se houver incidente:

1. suspender acesso do usuario afetado;
2. ocultar/desativar tenant conforme procedimento aprovado;
3. preservar evidencias sanitizadas;
4. comunicar responsaveis;
5. avaliar exclusao/retencao conforme contrato;
6. registrar decisao no log operacional.

## 16. Checklist de Evidencias

- Preflight aprovado.
- Matriz de modulos aprovada.
- Smoke public-only aprovado.
- Smoke autenticado do tenant atual aprovado ou `SKIPPED_AUTH_REQUIRED` registrado.
- Smoke autenticado do tenant novo aprovado antes do handover.
- Confirmacao de assets privados bloqueados.
- Confirmacao de que modulos ocultos nao aparecem para o cliente.

## 17. Proibicoes

- Criar empresa ou usuario fora do fluxo aprovado.
- Rodar seed, importacao, migration ou DB remoto manual.
- Criar schema novo.
- Executar deploy Pages durante onboarding.
- Versionar secrets, conviteUrl, token, cookie ou logs com PII.
- Ativar SIGVOOS, Hospedagem, SGSO ou LMS como produto pronto.
