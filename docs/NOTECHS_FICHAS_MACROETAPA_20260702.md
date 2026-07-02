# NOTECHS nas Fichas — Macroetapa 2026-07-02

## Decisão desta etapa

- Novo padrão operacional: `18` manobras técnicas + `15` itens `NOTECHS`.
- `NOTECHS` é fixo, transversal e sempre separado das técnicas.
- `NOTECHS` é **dado estruturado persistido**, não apenas renderização visual/PDF.
- `NOTECHS` servirá futuramente para relatórios (consultável por ficha, aluno, instrutor, período, grupo, nota).
- A régua de avaliação atual permanece obrigatória e continua depois de `NOTECHS`.
- Observações e assinaturas permanecem na página principal da ficha.

## CRM Legado

- `CRM` era a categoria comportamental anterior, substituída por `NOTECHS`.
- **CRM NÃO foi apagado.** Todas as 5 manobras CRM (`S76-LOFT-21/22`, `LOFT-CRM-01/02/03`) e seus vínculos históricos em modelos de sessão e fichas permanecem intactos.
- CRM é tratado como **legado histórico preservado** para rastreabilidade.
- Novas fichas/modelos usam `NOTECHS`, não `CRM`.
- Notas antigas de CRM não são migradas automaticamente para `NOTECHS`.
- Migrations históricas de CRM (0284, 0292, 0293, 0303) permanecem versionadas.

## Persistência e Relatório Futuro

- NOTECHS é materializado como linhas reais em `fichas_sessao_manobras` com `categoria='NOTECHS'`.
- Os 15 itens NOTECHS existem no cadastro de `manobras` (migration 0413) e em `manobras_categorias`.
- Cada NOTECHS tem: código estável (`NOTECHS-01` a `NOTECHS-15`), nome PT, descrição EN, ordem (1001-1015), grupo, `empresa_id`/tenant.
- `resultado` e `observacoes` são persistidos via UPDATE no PUT `/fichas/:id` (mesmo fluxo das técnicas).
- NOTECHS é consultável via `SELECT ... WHERE categoria='NOTECHS'` em `fichas_sessao_manobras`.
- NOTECHS parcial é detectado por `getMissingNotechsItens()` / `getNotechsStatus()` e reportado como diagnóstico, sem DML automático.
- Fichas finalizadas (`APROVADO`, `NAO_APROVADO`, `CONCLUIDA`) são imutáveis — não recebem NOTECHS novo.

## Escopo desta implementação

- `GET /fichas/:id` é **read-only**: sem INSERT, UPDATE ou DELETE de NOTECHS.
- NOTECHS é materializado nos fluxos explícitos de escrita: criação de ficha via `simuladores-shared-session.ts` e `simuladores-sessoes.ts`.
- O helper `buildOperationalFichaManobras()` em `worker-airtrust/src/constants/notechs.ts` centraliza a regra 18 técnicas + 15 NOTECHS.
- O preview de ficha-modelo monta `18` técnicas por ordem + `15` NOTECHS fixos.
- Fichas legadas com `22` técnicas continuam preservadas como histórico.
- Fichas finalizadas não são reescritas automaticamente.
- `empresa_id` é incluído em todos os INSERTs de `fichas_sessao_manobras` (tenant scope).

## Fora de escopo nesta etapa

- Homologação pedagógica da seleção definitiva das `18` técnicas por modelo.
- Reorganização pedagógica completa por aeronave/modelo.
- Aprovação regulatória ou homologação ANAC.
- Aplicação de migration 0413 em produção, deploy ou qualquer DML operacional.
- Migração de notas CRM antigas para NOTECHS.
- Hard delete de CRM.

## Observação operacional

Enquanto a validação pedagógica final não ocorrer, a seleção das `18` técnicas no preview é apenas um recorte técnico seguro por ordem do modelo para revisão visual e de layout A4.

## Migration 0413

- `worker-airtrust/migrations/0413_notechs_categoria_itens.sql` — **não aplicada em produção**.
- Cria categoria `NOTECHS` em `manobras_categorias` e 15 itens em `manobras` por empresa.
- Idempotente (`INSERT OR IGNORE` com índices únicos).
- Pré-condição: migration 0394 (tenant-aware catálogo).
- Rollback documentado no arquivo da migration.
