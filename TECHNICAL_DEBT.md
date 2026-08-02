# AirTrust — Dívida Técnica e Riscos Residuais

> **Snapshot:** 2026-08-02 (BRT)  
> **Base verificada:** `ecf1c6106336fa177d9c6e215c1592c91ed85699` (`main`)  
> **Repositório:** `airtrustsystem-alt/airtrust`  
> **Uso:** fonte interna do Projeto AirTrust. O código, os contratos de schema e os workflows versionados prevalecem em caso de divergência.

Este documento registra somente riscos residuais e decisões operacionais ainda válidas. Inventários antigos que misturavam itens resolvidos, hipóteses e código morto não devem ser usados como instrução de mudança sem nova verificação no `origin/main`.

## 1. Prioridade alta

### Rotas monolíticas

LMS e Treinamentos Planejados ainda concentram SQL, validação e regra. A extração deve ser incremental, preservando contrato HTTP e testes.

### Frontend duplicado

A SPA canônica convive com componentes em `src/components/**`. Exclusão prematura quebra imports via `@/`.

### Schema drift em fixtures

Alguns bancos locais e smoke usam subconjuntos de migrations. Código defensivo e scripts de setup podem mascarar divergência. O contrato de schema deve ser a referência.

### Histórico de migrations

Há legado de prefixos duplicados e migrations antigas incompatíveis com práticas atuais. Não “limpar” retroativamente sem plano; usar Schema V2 e ledger.

## 2. RBAC e multitenancy

Riscos a acompanhar:

- ativação por tenant ainda exige classificação completa;
- novos recursos podem nascer sem `dominio_codigo`;
- qualquer rota nova pode esquecer read-side filtering;
- fluxos de instrutor e aluno precisam de testes próprios;
- mudanças em autenticação, role ou tenant devem preservar os guards já integrados.

## 3. Qualificações, EAD e certificados

- dados históricos podem conter categoria textual e FK divergentes;
- categoria inativa pode quebrar joins;
- reconciliação deve ser executada e verificada, não apenas codificada;
- certificado, ciclo e validade precisam permanecer sincronizados.

### Validação pública de certificados

`GET /api/certificados/validar/:hash` continua calculando o hash contra até 1.000 certificados carregados por uma consulta com múltiplos JOINs. A proteção por IP reduz abuso e custo acidental, mas não elimina a dívida estrutural.

Próxima evolução correta:

1. persistir o hash de validação em coluna própria;
2. criar índice para lookup direto;
3. executar backfill governado e verificável;
4. substituir a varredura e o cálculo sequencial por consulta única;
5. preservar compatibilidade com certificados já emitidos.

Essa evolução exige desenho de schema, migration/Schema V2, backfill, rollback e validação em staging. Não deve ser improvisada dentro de um hotfix de rate limit.

## 4. Infraestrutura e custo Cloudflare

### Cron de dez minutos é funcional, não código morto

O trigger `*/10 * * * *` executa o dispatcher resiliente e aciona, entre outros fluxos, `runEadRenewalJob` e `runSigvoosFrmsJobs`. As rotas EdApp que retornam 410 não representam o comportamento do cron.

Regras:

- não remover o cron como “no-op”;
- não usar inventários antigos que o associavam exclusivamente ao EdApp;
- qualquer redução de cadência do EAD deve preservar a frequência necessária de SIGVOOS/FRMS;
- alterar cadência somente com requisito operacional, métricas e teste do plano de execução.

### Retenção de backups no R2

O código registra `retention_policy` e `expires_at`, mas não há purga versionada confirmada para os objetos de backup. Uma regra de lifecycle pode existir diretamente na Cloudflare e não aparecer no repositório.

Antes de implementar exclusão:

1. verificar a configuração remota do bucket em cada ambiente;
2. inventariar os dois padrões de prefixo usados por backups;
3. validar retenções de 30 dias, 1 ano e 7 anos;
4. executar dry-run e exclusão paginada em staging;
5. preservar manifests, checksums e capacidade de restore.

A ausência de código não autoriza apagar objetos sem essa verificação.

### Assets LMS

Rotas de assets SCORM, H5P e PPTX constam na allowlist global, mas exigem tokens/cookies de escopo e validam curso, matrícula, empresa e permissão antes da leitura do R2.

Não aplicar o rate limiter D1 a cada arquivo estático: um único curso pode carregar dezenas ou centenas de assets, gerando escrita D1 por arquivo e bloqueando uso legítimo. Para controle adicional de volume, preferir regras de edge/Cloudflare e limitar emissão de sessão, launch ou token.

### `LIKE` com wildcard à esquerda

Filtros de cargo em rotas de escala usam padrões como `LIKE '%comandante%'`. O impacto atual é baixo para rosters pequenos, mas cresce linearmente com o headcount. Monitorar antes de normalizar campos ou criar estratégia indexável.

### Worker único

O Worker permanece monolítico. Isso não é dívida por si só. Separação só deve ocorrer quando métricas de bundle, cold start, ownership ou deploy justificarem a complexidade operacional adicional.

## 5. Simuladores

- código físico/versionado versus código canônico;
- modelos históricos e atuais convivem;
- FAP/IFR e `gera_qualificacao` dependem de matriz correta;
- PDFs e fichas oficiais exigem revisão antes de trocar código exibido;
- multi-participante amplia complexidade de autorização.

## 6. Observabilidade

A proveniência melhorou, mas deve ser usada consistentemente em diagnósticos. Health check sozinho não comprova correção de fluxo ou dados.

## 7. Documentação

Fontes de projeto ficam desatualizadas quando não estão ligadas a um SHA. Toda orientação operacional deve ser reconfirmada contra código, schema e workflows atuais antes de remoção de funcionalidade, migration ou mudança de infraestrutura.

## 8. Estratégia recomendada

- correções pequenas e cirúrgicas;
- uma PR por objetivo;
- teste focado, suíte afetada e CI existente;
- staging real quando houver infraestrutura, migration ou dados;
- registrar dívida lateral sem ampliar hotfix;
- atualizar fontes após marcos relevantes, não diariamente;
- confirmar configuração remota antes de concluir que um recurso Cloudflare está órfão ou sem lifecycle.

## 9. Itens que não são dívida por si só

- compatibilidade legada documentada;
- tabelas compartilhadas sem `empresa_id` quando o contrato assim define;
- guards rigorosos;
- processo de aprovação de produção;
- retenção de histórico;
- allowlist pública acompanhada de autenticação própria por token;
- nome histórico do banco de staging;
- Worker monolítico.

Só são dívida quando geram duplicação, ambiguidade, custo material comprovado ou impedem evolução segura.
