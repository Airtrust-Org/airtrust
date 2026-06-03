# AirTrust Supabase Migration Risk Matrix v0.5

**Date:** 2026-06-02
**Status:** Sprint I — Feasibility Audit
**Context:** Avaliação de riscos de migração D1/R2/Workers → Supabase

---

## Risk Assessment Framework

| Nível | Probabilidade | Impacto |
|---|---|---|
| Crítico | >50% | Parada total do sistema, perda de dados, vazamento entre tenants |
| Alto | 25-50% | Degradação significativa de funcionalidade, regressão de módulo |
| Médio | 10-25% | Impacto moderado, contornável com rollback |
| Baixo | <10% | Impacto mínimo, corrigível rapidamente |

---

## Risk Register

### 1. Perda de tenant isolation durante migração

| Campo | Valor |
|---|---|
| **Categoria** | Segurança / Multi-tenancy |
| **Probabilidade** | Alta (30-40%) |
| **Impacto** | Crítico |
| **Descrição** | Durante migração de dados D1→Postgres, políticas RLS podem não estar ativas ou configuradas incorretamente, expondo dados entre empresas. |
| **Mitigação** | Shadow run estendido (30 dias) com D1 e Postgres em paralelo. Testes automatizados de isolamento por tenant. Verificação de row counts por empresa_id pós-migração. |
| **Migrar agora?** | Não — risco inaceitável sem preparação extensa |
| **Observação** | Gap atual conhecido: ~5 endpoints de documentos sem verificação explícita de empresa_id. Corrigir antes de qualquer migração. |

---

### 2. RLS mal configurado

| Campo | Valor |
|---|---|
| **Categoria** | Segurança / Database |
| **Probabilidade** | Média (15-20%) |
| **Impacto** | Crítico |
| **Descrição** | Políticas RLS omitindo tabelas, usando lógica errada de tenant, ou não cobrindo todas as operações (SELECT/INSERT/UPDATE/DELETE). |
| **Mitigação** | Gerar políticas RLS automaticamente a partir do schema (toda tabela com empresa_id ganha política). Validar com `EXPLAIN` que políticas são aplicadas. Testes de penetração pós-migração. |
| **Migrar agora?** | Não — requer design cuidadoso das políticas |
| **Observação** | ~110 tabelas com empresa_id precisam de política RLS. ~33 tabelas sem empresa_id precisam de análise caso a caso. |

---

### 3. Migração de auth quebrar login

| Campo | Valor |
|---|---|
| **Categoria** | Auth / Acesso |
| **Probabilidade** | Média (20-25%) |
| **Impacto** | Alto |
| **Descrição** | Se migrar auth para Supabase Auth: hashes bcrypt incompatíveis, multi-empresa com per-company role perdido, impersonation quebrado, token blocklist não funcional. |
| **Mitigação** | **Não migrar auth.** Manter auth custom (jose + bcryptjs) mesmo com Postgres. Auth é database-agnostic — só precisa trocar queries D1→Postgres. |
| **Migrar agora?** | Não — recomendação é NUNCA migrar auth, manter custom |
| **Observação** | Auth atual é o componente mais customizado e melhor adaptado ao modelo multi-tenant do AirTrust. |

---

### 4. Storage de documento sensível

| Campo | Valor |
|---|---|
| **Categoria** | Segurança / Storage |
| **Probabilidade** | Baixa (10-15%) |
| **Impacto** | Crítico |
| **Descrição** | Durante migração R2→Supabase Storage, documentos (certificados médicos ASO, contratos, avaliações) expostos por bucket público ou política mal configurada. |
| **Mitigação** | Manter R2. Não migrar storage agora. Se migrar: buckets privados por padrão, presigned URLs para acesso, auditoria de acesso. |
| **Migrar agora?** | Não — manter R2 é mais seguro e mais barato |
| **Observação** | R2 já tem asset gateway com classificação público/privado/tenant-scoped. Supabase Storage traria egress cost adicional. |

---

### 5. Downtime durante cutover

| Campo | Valor |
|---|---|
| **Categoria** | Operacional / Disponibilidade |
| **Probabilidade** | Alta (40-50%) |
| **Impacto** | Alto |
| **Descrição** | Migração de dados D1→Postgres requer janela de cutover. Com ~140 tabelas e dados reais, o processo pode levar horas. |
| **Mitigação** | Estratégia de shadow run: escrever em ambos bancos por 2-4 semanas, depois switch de leitura para Postgres. Rollback: voltar leitura para D1. |
| **Migrar agora?** | Não — requer planejamento detalhado de cutover |
| **Observação** | D1 é SQLite local ao Worker. Postgres seria remoto. Latência adicional precisa ser validada antes do cutover. |

---

### 6. Duplicidade de fontes durante transição

| Campo | Valor |
|---|---|
| **Categoria** | Arquitetura / Dados |
| **Probabilidade** | Média (20-30%) |
| **Impacto** | Alto |
| **Descrição** | Durante shadow run, D1 e Postgres podem divergir (uma escrita falha, a outra não). Dados inconsistentes entre fontes. |
| **Mitigação** | Write-ahead log para reconciliação. Checksums periódicos comparando D1 e Postgres. Circuit breaker: se divergência > threshold, abortar e investigar. |
| **Migrar agora?** | Não — shadow run precisa de infra de reconciliação |
| **Observação** | Cloudflare Queues poderia ser usado como buffer de escrita durante transição. |

---

### 7. Scripts legados com SQLite-specific

| Campo | Valor |
|---|---|
| **Categoria** | Código / Compatibilidade |
| **Probabilidade** | Alta (60-70%) |
| **Impacto** | Médio |
| **Descrição** | Scripts de manutenção, seed, admin, correções usam SQLite-specific SQL que não funciona em Postgres. |
| **Mitigação** | Inventário completo de scripts. Converter ou descontinuar. Manter D1 local para dev (scripts não precisam rodar em produção). |
| **Migrar agora?** | Não — scripts são problema de fase de migração, não bloqueiam decisão |
| **Observação** | Scripts em `scripts/seed-*` usam SQLite. Não afetam runtime. |

---

### 8. Migrations incompletas após tradução

| Campo | Valor |
|---|---|
| **Categoria** | Database / Integridade |
| **Probabilidade** | Média (15-20%) |
| **Impacto** | Alto |
| **Descrição** | Dos 357 arquivos de migration, alguns podem ser pulados na tradução, resultando em schema incompleto no Postgres. Views e triggers são particularmente propensos a erros. |
| **Mitigação** | Abordagem reversa: extrair schema final do D1 (sqlite_master) e traduzir, em vez de traduzir migration por migration. Validar comparando row counts e schema diff. |
| **Migrar agora?** | Não — tradução de 357 migrations é esforço de 2-3 semanas |
| **Observação** | Schema tem ~140 tabelas ativas. Abordagem de "schema final" é mais segura que "migration por migration". |

---

### 9. Mudança de custo

| Campo | Valor |
|---|---|
| **Categoria** | Financeiro |
| **Probabilidade** | Alta (80-90%) |
| **Impacto** | Baixo |
| **Descrição** | Atualmente custo de infra é $0/mês (Cloudflare free tier). Supabase Pro começa em $25/mês. Egress de storage adiciona custo variável. |
| **Mitigação** | Custo é previsível e baixo em termos absolutos. Supabase Pro ($25) + egress estimado ($0-25) = $25-50/mês é aceitável para uma SaaS. |
| **Migrar agora?** | Não é bloqueador — custo é baixo |
| **Observação** | Custo não é fator decisivo. $25-50/mês é irrelevante comparado ao custo de engenharia da migração. |

---

### 10. Rollback difícil

| Campo | Valor |
|---|---|
| **Categoria** | Operacional / Resiliência |
| **Probabilidade** | Média (15-25%) |
| **Impacto** | Crítico |
| **Descrição** | Uma vez que dados são migrados para Postgres e D1 é desligado, voltar atrás requer migração reversa (Postgres→D1), que é tão complexa quanto a ida. |
| **Mitigação** | Shadow run prolongado (4 semanas mínimo) com D1 como primary. Só desligar D1 após validação completa. Manter backup do D1 por 90 dias pós-migração. |
| **Migrar agora?** | Não — requer estratégia de rollback testada |
| **Observação** | Estratégia de shadow run é a melhor mitigação. Se Postgres falhar, D1 continua operando como primary. |

---

### 11. Regressão de módulos FRMS

| Campo | Valor |
|---|---|
| **Categoria** | Funcional / FRMS |
| **Probabilidade** | Média (20-30%) |
| **Impacto** | Alto |
| **Descrição** | Cálculos de fadiga usam `julianday()`, `datetime()` e outras funções SQLite. Conversão para Postgres (`EXTRACT`, `AGE`, `INTERVAL`) pode introduzir diferenças sutis de arredondamento ou timezone. |
| **Mitigação** | Testes de regressão com dados reais anonimizados. Comparar outputs do FRMS entre D1 e Postgres durante shadow run. Validar com especialista de fadiga. |
| **Migrar agora?** | Não — FRMS é o módulo mais sensível a mudanças de SQL |
| **Observação** | FRMS tem ~30 tabelas próprias. É o módulo com mais SQL complexo. |

---

### 12. Regressão de qualificações e simuladores

| Campo | Valor |
|---|---|
| **Categoria** | Funcional / Qualificações |
| **Probabilidade** | Média (15-25%) |
| **Impacto** | Alto |
| **Descrição** | Queries de qualificações usam JOINs complexos com `funcionarios`, datas de validade, renovação automática. Conversão pode quebrar lógica de expiração. |
| **Mitigação** | Testes de regressão focados em: cálculo de validade, renovação automática, histórico, stats diários. |
| **Migrar agora?** | Não — requer validação extensa |
| **Observação** | Qualificações são o core do produto. Qualquer regressão impacta todos os clientes. |

---

### 13. Vendor lock-in duplo

| Campo | Valor |
|---|---|
| **Categoria** | Estratégico |
| **Probabilidade** | Baixa (5-10%) |
| **Impacto** | Médio |
| **Descrição** | Modelo híbrido (Workers + Supabase) cria dependência em dois vendors. Se qualquer um aumentar preços ou descontinuar serviço, impacto é significativo. |
| **Mitigação** | Repository pattern isola o banco — trocar Postgres por outro banco SQL é possível. Workers são substituíveis por Supabase Edge Functions ou Node.js servers. |
| **Migrar agora?** | Não — híbrido aumenta vendor surface |
| **Observação** | Risco aceitável. Cloudflare e Supabase são estáveis. Repository pattern mitiga lock-in. |

---

## Resumo de riscos

| Risco | Prob | Impacto | Bloqueia migração? | Ação |
|---|---|---|---|---|
| Perda tenant isolation | Alta | Crítico | Sim | Corrigir gaps agora, shadow run 4+ semanas |
| RLS mal configurado | Média | Crítico | Sim | Geração automática + testes |
| Auth quebrar login | Média | Alto | Sim | Manter auth custom |
| Storage sensível exposto | Baixa | Crítico | Não (manter R2) | Manter R2 |
| Downtime | Alta | Alto | Sim | Shadow run + cutover planejado |
| Duplicidade fontes | Média | Alto | Sim | Write-ahead log + checksums |
| Scripts legados | Alta | Médio | Não | Converter durante migração |
| Migrations incompletas | Média | Alto | Sim | Abordagem "schema final" |
| Mudança custo | Alta | Baixo | Não | $25-50/mês aceitável |
| Rollback difícil | Média | Crítico | Sim | Shadow run 4+ semanas |
| Regressão FRMS | Média | Alto | Sim | Testes regressão + shadow run |
| Regressão qualificações | Média | Alto | Sim | Testes regressão |
| Vendor lock-in duplo | Baixa | Médio | Não | Repository pattern |

## Conclusão

**12 dos 13 riscos têm mitigação conhecida**, mas a maioria requer preparação significativa (shadow run, testes, tradução de schema) que não existe hoje. Nenhum risco é intransponível, mas o esforço de mitigação é maior que o benefício imediato da migração.

**Recomendação:** Não migrar agora. Investir o esforço em preparação (Repository pattern, auditoria tenant, Queues) para reduzir os riscos quando a migração for necessária.
