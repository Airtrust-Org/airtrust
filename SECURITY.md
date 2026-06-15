# AirTrust - Modelo de Seguranca

> **Versao do documento:** 1.1 | **Data:** 2026-06-14
>
> **[DOCUMENTO INTERNO RESTRITO]** Este documento descreve controles e principios
> arquiteturais de seguranca do AirTrust. Ele nao e um runbook operacional, nao
> substitui o registro interno de seguranca e nao deve ser compartilhado
> externamente sem revisao formal.
>
> Vulnerabilidades conhecidas, vetores de ataque, configuracoes sensiveis,
> endpoints internos, nomes de secrets, payloads, evidencias tecnicas e planos de
> mitigacao sao mantidos em registro privado controlado, fora deste documento.

---

## Sumario

1. [Escopo e Limites](#1-escopo-e-limites)
2. [Principios de Seguranca](#2-principios-de-seguranca)
3. [Autenticacao e Sessoes](#3-autenticacao-e-sessoes)
4. [Autorizacao e Segregacao de Acesso](#4-autorizacao-e-segregacao-de-acesso)
5. [Isolamento Multi-Tenant](#5-isolamento-multi-tenant)
6. [Origem, Navegador e Headers](#6-origem-navegador-e-headers)
7. [Limitacao de Abuso](#7-limitacao-de-abuso)
8. [Protecao de Secrets](#8-protecao-de-secrets)
9. [Ambientes de Desenvolvimento](#9-ambientes-de-desenvolvimento)
10. [Assets LMS e Conteudo Embarcado](#10-assets-lms-e-conteudo-embarcado)
11. [Integracoes e Webhooks](#11-integracoes-e-webhooks)
12. [Rotas Administrativas e Manutencao](#12-rotas-administrativas-e-manutencao)
13. [Senhas, Convites e Recuperacao](#13-senhas-convites-e-recuperacao)
14. [Auditoria e Rastreabilidade](#14-auditoria-e-rastreabilidade)
15. [Gestao de Vulnerabilidades](#15-gestao-de-vulnerabilidades)
16. [Checklist Restritivo](#16-checklist-restritivo)

---

## 1. Escopo e Limites

Este documento registra o modelo de seguranca em nivel arquitetural. Ele deve ser
usado para orientar revisoes, desenho de controles e avaliacao de riscos sem
expor detalhes que facilitem ataque, bypass ou abuso operacional.

Este documento nao deve conter:

- valores reais de secrets, tokens, chaves, hashes ou credenciais;
- nomes detalhados de secrets quando uma categoria for suficiente;
- rotas internas sensiveis ou caminhos de manutencao;
- comandos executaveis para producao, staging, deploy ou migrations;
- payloads, provas de exploracao, bypasses ou vetores de ataque concretos;
- dados pessoais, UUIDs reais, IDs de recursos sensiveis ou amostras de banco;
- checklist de vulnerabilidades ativas ou pendencias exploraveis.

Qualquer informacao operacional sensivel deve permanecer em registros privados
com controle de acesso, trilha de auditoria e responsavel nomeado.

## 2. Principios de Seguranca

O AirTrust usa uma abordagem em camadas:

| Camada | Controle arquitetural |
|---|---|
| Transporte | TLS, HSTS em ambiente apropriado e politica de origem controlada |
| Identidade | Tokens assinados, expiracao curta e revogacao de sessoes |
| Autorizacao | RBAC, escopo por empresa e revisao de permissoes privilegiadas |
| Aplicacao | Validacao de entrada, headers de seguranca, CSP e rate limiting |
| Dados | Isolamento por tenant, soft delete e auditoria de alteracoes |
| Segredos | Injecao por provedor seguro, rotacao e comparacoes resistentes a timing |
| Auditoria | Eventos de seguranca e trilhas de escrita com contexto minimo necessario |

## 3. Autenticacao e Sessoes

A autenticacao usa tokens assinados com expiracao controlada e separacao entre
tokens de acesso, renovacao e tokens de escopo restrito. O modelo deve preservar:

- emissao de tokens com identificador revogavel;
- expiracao curta para tokens de acesso;
- renovacao com uso unico quando aplicavel;
- bloqueio ou revogacao de tokens encerrados;
- validacao de assinatura e expiracao em todas as rotas protegidas;
- tratamento seguro de falhas sem revelar detalhes internos.

O formato exato de payload, nomes de claims e detalhes de implementacao nao sao
necessarios neste documento. Mudancas nesses contratos devem ser revisadas no
codigo e nos testes correspondentes.

## 4. Autorizacao e Segregacao de Acesso

O AirTrust usa RBAC hierarquico e permissoes por contexto de empresa. O principio
operacional e conceder o menor privilegio necessario para cada papel.

Controles esperados:

- verificacao de autenticacao antes de acesso a recursos protegidos;
- resolucao de papel efetivo por empresa ativa;
- restricao de privilegios administrativos a usuarios explicitamente autorizados;
- separacao entre papeis operacionais, instrucionais, administrativos e leitura;
- revisao periodica de roles privilegiadas e excecoes temporarias.

Valores numericos, mapeamentos internos detalhados e excecoes sensiveis devem ser
consultados no codigo-fonte e no registro privado de seguranca, nao neste arquivo.

## 5. Isolamento Multi-Tenant

Toda operacao que acessa dados de tenant deve aplicar escopo de empresa de forma
explicita e verificavel. O isolamento deve ser tratado como requisito de
seguranca, nao apenas como filtro de produto.

Controles esperados:

- injecao de contexto de empresa em requisicoes autenticadas;
- filtro de empresa em leituras e escritas de dados de tenant;
- verificacao de ownership antes de alteracoes destrutivas ou sensiveis;
- proibicao de defaults inseguros para empresa em novas estruturas de dados;
- auditoria de operacoes privilegiadas com contexto de tenant.

Acesso cross-tenant deve ser excepcional, justificado, auditado e restrito a
controles administrativos especificos.

## 6. Origem, Navegador e Headers

O frontend e o worker devem aplicar politicas de origem e headers de seguranca de
forma consistente com o ambiente.

Controles esperados:

- allowlist de origens mantida no codigo/configuracao apropriada;
- CORS restrito ao necessario para clientes autorizados;
- credenciais permitidas somente quando o fluxo exigir;
- CSP restritiva por padrao;
- excecoes para conteudo embarcado documentadas e compensadas por escopo curto;
- headers contra MIME sniffing, clickjacking e vazamento excessivo de referrer;
- HSTS em ambiente adequado.

Listas completas de origens, dominios internos, headers especiais e excecoes
operacionais nao devem ser reproduzidas neste documento.

## 7. Limitacao de Abuso

Rotas sensiveis devem possuir limitacao de taxa ou controles equivalentes para
reduzir abuso, automacao indevida e tentativa de enumeracao.

Categorias esperadas:

- autenticacao;
- recuperacao de acesso;
- renovacao de sessao;
- webhooks e callbacks externos;
- uploads;
- importacoes e rotinas de alto custo.

Limites exatos, janelas e caminhos de rotas devem permanecer em configuracao,
codigo e runbooks privados. Este documento registra apenas a obrigacao
arquitetural.

## 8. Protecao de Secrets

Secrets devem ser tratados como material confidencial, nunca versionado e nunca
documentado por valor.

Controles esperados:

- injecao por mecanismo seguro do provedor de runtime;
- ausencia de secrets em arquivos rastreados pelo Git;
- rotacao em caso de suspeita de exposicao;
- comparacoes resistentes a timing para segredos compartilhados;
- separacao por ambiente e por finalidade;
- revisao de permissao de operadores que podem ler ou alterar secrets.

Este documento usa categorias, nao nomes especificos de secrets:

- assinatura de tokens;
- integracoes de comunicacao;
- manutencao controlada;
- armazenamento e assets;
- webhooks de terceiros;
- automacao de infraestrutura.

## 9. Ambientes de Desenvolvimento

Atalhos de desenvolvimento nao podem existir em staging ou producao. Qualquer
facilitador local deve ser fail-closed, depender de configuracao local ignorada
pelo Git e possuir guardas automatizados para impedir promocao indevida.

Controles esperados:

- ativacao apenas em ambiente local;
- configuracao local fora do Git;
- logs claramente identificados em desenvolvimento;
- guardas que falham quando configuracoes de dev aparecem em arquivos rastreados;
- revisao antes de qualquer mudanca em autenticacao local.

Nomes de variaveis, condicoes exatas e comportamento interno de bypass nao devem
ser documentados aqui.

## 10. Assets LMS e Conteudo Embarcado

Assets educacionais e conteudo embarcado devem usar tokens de escopo restrito,
duracao curta e controles de navegador adequados.

Controles esperados:

- cookies protegidos quando usados para assets;
- escopo limitado ao conteudo autorizado;
- expiracao curta;
- indisponibilidade do token para JavaScript quando possivel;
- separacao entre token de asset e token de acesso principal;
- CSP relaxada apenas quando tecnicamente necessaria e compensada por escopo.

Detalhes de path, claims e extracao de identificadores devem ser avaliados no
codigo e nos testes, nao neste documento.

## 11. Integracoes e Webhooks

Integracoes externas e webhooks devem validar autenticidade, limitar abuso e
registrar falhas sem expor dados sensiveis.

Controles esperados:

- validacao criptografica ou segredo compartilhado, conforme o provedor;
- comparacao resistente a timing quando aplicavel;
- rate limiting por categoria;
- rejeicao segura de integracoes desativadas;
- logs sanitizados;
- revisao periodica de integracoes legadas.

Endpoints publicos, headers de assinatura, nomes de secrets e detalhes por
provedor devem ficar em registros privados ou no codigo revisado.

## 12. Rotas Administrativas e Manutencao

Rotas administrativas e rotinas de manutencao devem ser tratadas como superficie
sensivel.

Controles esperados:

- autenticacao obrigatoria para operacoes administrativas;
- autorizacao por papel privilegiado;
- protecao adicional para manutencao automatizada;
- trilha de auditoria para acoes sensiveis;
- segregacao entre rotinas humanas, jobs internos e callbacks externos;
- revisao de qualquer rota que nao use autenticacao padrao.

Este documento nao lista paths de administracao, paths de manutencao, headers
internos ou nomes de segredos associados.

## 13. Senhas, Convites e Recuperacao

Senhas e tokens de recuperacao devem usar algoritmos apropriados e armazenamento
irreversivel.

Controles esperados:

- hash de senha com algoritmo apropriado para senha;
- politica minima de complexidade;
- tokens de recuperacao e convite armazenados como hash irreversivel;
- expiracao de tokens de recuperacao;
- invalidacao de fluxos antigos quando aplicavel;
- auditoria de alteracoes de credenciais.

Parametros exatos de hashing e expiracao devem ser revisados no codigo e nas
politicas internas, pois podem evoluir sem alterar este documento.

## 14. Auditoria e Rastreabilidade

Operacoes sensiveis devem gerar eventos suficientes para investigacao, sem
registrar dados desnecessarios.

Controles esperados:

- auditoria de escrita em entidades principais;
- registro de usuario, tenant, acao e contexto minimo necessario;
- trilha para acoes administrativas e impersonation;
- sanitizacao de payloads antes de persistencia;
- correlacao com request quando disponivel;
- retencao e acesso conforme politica interna.

Nomes de tabelas, schemas, exemplos de payload e detalhes de eventos sensiveis
devem ser consultados em artefatos tecnicos privados.

## 15. Gestao de Vulnerabilidades

Vulnerabilidades conhecidas, achados abertos, severidades, vetores, provas,
payloads e mitigacoes operacionais sao rastreados em registro interno privado.

Este documento deve conter apenas o processo:

- registrar achados em canal privado controlado;
- classificar severidade e impacto;
- definir responsavel e prazo;
- corrigir em branch revisavel;
- validar por teste ou evidencia;
- registrar fechamento com referencia interna.

Nao listar aqui fraquezas ativas, rotas afetadas, condicoes de exploracao ou
pendencias que possam orientar ataque.

## 16. Checklist Restritivo

Este checklist registra somente categorias de controle que devem existir. Ele nao
declara ausencia de vulnerabilidades nem substitui auditoria.

- [x] Autenticacao com tokens assinados e expiracao controlada
- [x] Revogacao ou bloqueio de sessoes quando aplicavel
- [x] Autorizacao por papel e contexto de empresa
- [x] Isolamento multi-tenant em dados de tenant
- [x] Politica de origem e headers de seguranca
- [x] CSP restritiva por padrao
- [x] Limitacao de abuso em categorias sensiveis
- [x] Secrets fora do Git e gerenciados por provedor seguro
- [x] Atalhos de desenvolvimento restritos a ambiente local
- [x] Assets LMS com escopo e expiracao limitados
- [x] Integracoes externas com validacao de autenticidade
- [x] Rotas administrativas com autenticacao e autorizacao
- [x] Senhas e tokens armazenados de forma irreversivel
- [x] Auditoria de operacoes sensiveis
- [x] Vulnerabilidades rastreadas em registro interno privado

Pendencias, excecoes, severidades e planos de mitigacao devem permanecer no
registro interno de seguranca.
