# Reconciliação Funcionários de Manutenção — Junho 2026

**Gerado em:** 2026-06-15
**Fonte:** `Relação de mecânicos junho26 (2).xls` → aba `Relação de mecânicos junho26`
**Empresa origem:** COSTA DO SOL TAXI AEREO S.A (código 00009)
**Tenant AirTrust:** `empresa_id = 6`
**Banco referência local:** `artifacts/local-dev-db/local-db-backup-pre-import-20260609.sqlite` (snapshot 2026-06-09)
**Arquivos de plano:** `tmp/manutencao_funcionarios_update_plan_junho26.json` / `.csv` (não versionados)

---

## 1 · Alerta de estado de produção

> **IMPORTANTE:** O backup local (2026-06-09) **não contém** os funcionários de Manutenção.
> Esses funcionários foram criados em produção por volta de **2026-06-13** como parte
> da auditoria de controle de acesso por setor (commit 80ed9179).
>
> **Estado confirmado em produção na data 2026-06-13:**
> - 19 funcionários de Manutenção (IDs 106–124, `setor_id=11`, `empresa_id=6`, `status=ATIVO`)
> - `email IS NULL`, `cpf IS NULL`, `matricula` desconhecida — criados sem dados pessoais
> - Podem receber qualificações mas **não conseguem fazer login** (sem email/CPF)
>
> A planilha tem **31 funcionários**. Os 19 de produção correspondem a um subconjunto
> não identificável sem acesso direto à base de produção.
> Os **12 restantes** podem ainda não existir em produção.

---

## 2 · Resumo executivo

| Métrica | Valor |
|---|---|
| Total de linhas lidas | **31** |
| MATCH_EXATO | **0** |
| MATCH_PROVÁVEL | **0** |
| CONFLITO | **0** |
| NÃO_ENCONTRADO (backup) | **31** |
| DADO_INVÁLIDO | **0** |
| CPFs inválidos | **0** |
| Emails inválidos | **0** |
| CPFs duplicados (planilha) | **0** |
| Matrículas duplicadas (planilha) | **0** |
| Emails duplicados (planilha) | **0** |
| Funções com "l" (L minúsculo) → algarismo romano | **19** |
| Admissões futuras | **0** |

### Campos faltantes mais comuns (todos os 31 funcionários)

Como todos os 31 estão ausentes do backup local, os campos faltantes em AirTrust são:
`cpf`, `email`, `matricula`, `nascimento`, `sexo`, `admissao`, `funcao`, `departamento`
(campos que a planilha fornece e que provavelmente estão NULL em produção para os 19 existentes).

---

## 3 · Tabela de reconciliação por funcionário

> CPFs mascarados como `***.***.***-NN` (últimos 2 dígitos visíveis apenas).

| # | Nome | Matrícula | CPF mascarado | Email | Departamento | Função | Match | Obs |
|---|---|---|---|---|---|---|---|---|
| 1 | FLAVIO CORREA | `000127` | `***.***.***-04` | `flavio.correa@voecostadosol.com.br` | MANUTENÇÃO CC 124 | COORD DE ENGENHARIA | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 2 | HEVERTON LUIZ CAMPISTA PESSANHA | `000324` | `***.***.***-26` | `heverton.pessanha@voecostadosol.com.br` | MECANICOS CC 128 | AUXILIAR DE MANUTENÇÃO | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 3 | ALAN CORTES | `000345` | `***.***.***-39` | `alan.cortes@voecostadosol.com.br` | MECANICOS CC 128 | AUXILIAR DE MANUTENÇÃO | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 4 | RENATO PINTO DOS SANTOS | `000351` | `***.***.***-68` | `renato.santos@voecostadosol.com.br` | MECANICOS CC 128 | AUXILIAR DE MANUTENÇÃO | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 5 | OEDEM PANTOJA DA ROCHA | `000353` | `***.***.***-49` | `oedem.rocha@voecostadosol.com.br` | MECANICOS CC 128 | AUXILIAR DE MANUTENÇÃO | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 6 | WAGNER DOMAS DA SILVA | `000373` | `***.***.***-30` | `wagner.domas@voecostadosol.com.br` | MECANICOS CC 128 | AUXILIAR DE MANUTENÇÃO | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 7 | LUIS FELIPE MARQUES MACHADO | `000374` | `***.***.***-18` | `luis.machado@voecostadosol.com.br` | MECANICOS CC 128 | AUXILIAR DE MANUTENÇÃO | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 8 | SERGIO COUTINHO MATOS | `000283` | `***.***.***-01` | `sergio.matos@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT l → `MEC MANUT I` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT I` (sugestão) |
| 9 | VIVIANE ROZENDO DE BARCELOS RIBEIRO | `000308` | `***.***.***-00` | `viviane.ribeiro@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT l → `MEC MANUT I` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT I` (sugestão) |
| 10 | ANDERSON LIZIARIO GUIMARAES | `000322` | `***.***.***-01` | `anderson.guimaraes@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT l → `MEC MANUT I` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT I` (sugestão) |
| 11 | FABIO DE OLIVEIRA | `000384` | `***.***.***-64` | `fabio.oliveira@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT l → `MEC MANUT I` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT I` (sugestão) |
| 12 | BRUNO VITAL JUSTINO | `000385` | `***.***.***-31` | `bruno.justino@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT l → `MEC MANUT I` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT I` (sugestão) |
| 13 | ROMARIO VIANA NASCIMENTO | `000196` | `***.***.***-70` | `romario.nascimento@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT ll → `MEC MANUT II` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT II` (sugestão) |
| 14 | CARLOS ALBERTO DE SOUZA CASTRO | `000339` | `***.***.***-48` | `carlos.souza@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT ll → `MEC MANUT II` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT II` (sugestão) |
| 15 | LUCIANO DA SILVA | `000371` | `***.***.***-39` | `luciano.silva@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT ll → `MEC MANUT II` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT II` (sugestão) |
| 16 | JOSE EDVAR DA SILVA | `000347` | `***.***.***-87` | `jose.silva@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lll → `MEC MANUT III` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT III` (sugestão) |
| 17 | SILVIO MACHADO DE SOUZA | `000364` | `***.***.***-34` | `silvio.souza@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lll → `MEC MANUT III` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT III` (sugestão) |
| 18 | CARLOS EDUARDO SANTOS SOUZA | `000368` | `***.***.***-37` | `carlos.santos@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lll → `MEC MANUT III` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT III` (sugestão) |
| 19 | DANIEL DA SILVA CUNHA | `000370` | `***.***.***-15` | `daniel.cunha@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lll → `MEC MANUT III` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT III` (sugestão) |
| 20 | FRANCISCO SERGIO NASCIMENTO DA COSTA | `000379` | `***.***.***-04` | `francisco.costa@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lll → `MEC MANUT III` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT III` (sugestão) |
| 21 | WAGNER BARROS DA SILVA | `000387` | `***.***.***-41` | `wagner.silva@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lll → `MEC MANUT III` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT III` (sugestão) |
| 22 | ROMUALDO DE JESUS BARAUNA | `000094` | `***.***.***-64` | `romualdo.barauna@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lV → `MEC MANUT IV` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT IV` (sugestão) |
| 23 | MARCIO BARROS MOTTA | `000133` | `***.***.***-90` | `marcio.motta@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lV → `MEC MANUT IV` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT IV` (sugestão) |
| 24 | RODRIGO DE BRITO FRATTE MODESTO | `000146` | `***.***.***-74` | `rodrigo.modesto@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lV → `MEC MANUT IV` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT IV` (sugestão) |
| 25 | FELISBERTO VALADARES RANGEL | `000245` | `***.***.***-72` | `felisberto.rangel@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT lV → `MEC MANUT IV` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `MEC MANUT IV` (sugestão) |
| 26 | FRANCISCO ALTEMIR DA SILVA CONCEICAO | `000086` | `***.***.***-87` | `francisco.altemir@voecostadosol.com.br` | MECANICOS CC 128 | MEC MANUT V | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 27 | DIEGO DA SILVA ROCHA | `000110` | `***.***.***-94` | `diego.rocha@voecostadosol.com.br` | MANUTENÇÃO CC 124 | ANALISTA DE SUPRIMENTOS ll → `ANALISTA DE SUPRIMENTOS II` | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção / ⚠ Função: `ANALISTA DE SUPRIMENTOS II` (sugestão) |
| 28 | ADRIANA COSTA E ALMEIDA DE MELO | `000198` | `***.***.***-95` | `adriana.almeida@voecostadosol.com.br` | MANUTENÇÃO CC 124 | ANALISTA DE CTM I | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 29 | KELLY SOARES DA SILVA | `000304` | `***.***.***-21` | `kelly.silva@voecostadosol.com.br` | MANUTENÇÃO CC 124 | ANALISTA DE CTM I | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 30 | DANIEL FEIJO SILVEIRA | `000383` | `***.***.***-58` | `daniel.silveira@voecostadosol.com.br` | MANUTENÇÃO CC 124 | AUXILIAR DE SUPRIMENTOS II | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |
| 31 | MIRELA DOS SANTOS SILVA | `000388` | `***.***.***-50` | `mirela.silva@voecostadosol.com.br` | MANUTENÇÃO CC 124 | AUXILIAR DE CTM I | ⬜ NAO_ENCONTRADO | ⚡ Requer verificação produção |

**Legenda:** ✅ Match exato · 🟡 Provável · 🔴 Conflito · ⬜ Não encontrado · ❌ Inválido

---

## 4 · Detalhe dos 31 NAO_ENCONTRADO

Todos os funcionários da planilha estão ausentes do backup local (2026-06-09).
Isso é **esperado** porque os funcionários de manutenção foram criados em produção
após 2026-06-09. As classificações abaixo aplicam-se ao banco de PRODUÇÃO:

| Grupo | Qtd | Fundamento |
|---|---|---|
| Provável match produção (IDs 106-124) | 19 | Existem em produção s/ CPF/email — planilha é a fonte para completar |
| Possivelmente não cadastrados ainda | 12 | Planilha tem 31; produção tem confirmados apenas 19 |
| Total planilha | 31 | — |

**Estimativa de distribuição (sem acesso direto à produção):**
- Funcionários com admissão mais antiga (pré-2024) provavelmente estão nos IDs 106–124
- Funcionários com admissão recente (pós-2025) podem ainda não ter sido cadastrados

---

## 5 · Issues a resolver antes de qualquer escrita

### 5.1 Algarismos romanos com "l" minúsculo

As funções abaixo usam `l` (letra L minúscula) onde provavelmente se quer `I` (algarismo romano):
**Não corrigir automaticamente — validar com o RH antes.**

| Linha | Nome | Função original | Sugestão de correção |
|---|---|---|---|
| 8 | SERGIO COUTINHO MATOS | `MEC MANUT l` | `MEC MANUT I` |
| 9 | VIVIANE ROZENDO DE BARCELOS RIBEIRO | `MEC MANUT l` | `MEC MANUT I` |
| 10 | ANDERSON LIZIARIO GUIMARAES | `MEC MANUT l` | `MEC MANUT I` |
| 11 | FABIO DE OLIVEIRA | `MEC MANUT l` | `MEC MANUT I` |
| 12 | BRUNO VITAL JUSTINO | `MEC MANUT l` | `MEC MANUT I` |
| 13 | ROMARIO VIANA NASCIMENTO | `MEC MANUT ll` | `MEC MANUT II` |
| 14 | CARLOS ALBERTO DE SOUZA CASTRO | `MEC MANUT ll` | `MEC MANUT II` |
| 15 | LUCIANO DA SILVA | `MEC MANUT ll` | `MEC MANUT II` |
| 16 | JOSE EDVAR DA SILVA | `MEC MANUT lll` | `MEC MANUT III` |
| 17 | SILVIO MACHADO DE SOUZA | `MEC MANUT lll` | `MEC MANUT III` |
| 18 | CARLOS EDUARDO SANTOS SOUZA | `MEC MANUT lll` | `MEC MANUT III` |
| 19 | DANIEL DA SILVA CUNHA | `MEC MANUT lll` | `MEC MANUT III` |
| 20 | FRANCISCO SERGIO NASCIMENTO DA COSTA | `MEC MANUT lll` | `MEC MANUT III` |
| 21 | WAGNER BARROS DA SILVA | `MEC MANUT lll` | `MEC MANUT III` |
| 22 | ROMUALDO DE JESUS BARAUNA | `MEC MANUT lV` | `MEC MANUT IV` |
| 23 | MARCIO BARROS MOTTA | `MEC MANUT lV` | `MEC MANUT IV` |
| 24 | RODRIGO DE BRITO FRATTE MODESTO | `MEC MANUT lV` | `MEC MANUT IV` |
| 25 | FELISBERTO VALADARES RANGEL | `MEC MANUT lV` | `MEC MANUT IV` |
| 27 | DIEGO DA SILVA ROCHA | `ANALISTA DE SUPRIMENTOS ll` | `ANALISTA DE SUPRIMENTOS II` |

### 5.2 Mapeamento de departamento → setor AirTrust

| Departamento planilha | Mapeamento provável | Setor AirTrust (id) | Ação |
|---|---|---|---|
| `MECANICOS CC 128` | Manutenção / Mecânicos | Manutenção (id=11 ou id=3) | Validar com admin qual setor canônico |
| `MANUTENÇÃO CC 124` | Manutenção / Administrativo-técnico | Manutenção (id=11 ou id=3) | Idem |

> **Atenção:** Há dois setores de Manutenção no sistema (ids 3 e 11 com nomes iguais).
> Confirmar com admin qual é o canônico para Manutenção antes de qualquer escrita.

### 5.3 Funcionário com admissão mais recente (menor risco de já existir)

Estes 6 funcionários têm admissão em 2025 ou 2026 e possivelmente ainda não estão cadastrados:

| Nome | Admissão | Matrícula |
|---|---|---|
| FRANCISCO SERGIO NASCIMENTO DA COSTA | 2025-08-01 | `000379` |
| FABIO DE OLIVEIRA | 2025-09-03 | `000384` |
| DANIEL FEIJO SILVEIRA | 2025-09-03 | `000383` |
| BRUNO VITAL JUSTINO | 2025-09-17 | `000385` |
| WAGNER BARROS DA SILVA | 2025-11-03 | `000387` |
| MIRELA DOS SANTOS SILVA | 2026-01-09 | `000388` |

---

## 6 · Script SQL de verificação em produção

> **Executar em modo READ-ONLY** (SELECT apenas) contra produção antes de qualquer UPDATE.

```sql
-- Verificar estado atual dos funcionários de Manutenção em produção
SELECT id, nome, matricula, cpf, email, funcao, setor, setor_id,
       nascimento, sexo, admissao, ativo, deleted_at
FROM funcionarios
WHERE empresa_id = 6
  AND setor_id = 11  -- Manutenção canônico
ORDER BY id;

-- Confirmar se funcionários da planilha já existem por CPF
-- (substituir CPF_AQUI pelos CPFs reais, um por vez em ambiente seguro)
SELECT id, nome, matricula, cpf, email, setor_id, empresa_id
FROM funcionarios
WHERE empresa_id = 6
  AND cpf IN (/* lista de CPFs normalizados */)  -- NÃO commitar CPFs no SQL
ORDER BY nome;

-- Checar setor canônico de manutenção
SELECT id, codigo, nome FROM setores WHERE empresa_id = 6 ORDER BY id;
```

---

## 7 · Próximos passos recomendados

1. **[ ] Verificação em produção** — Executar o SQL acima (Seção 6) e exportar a lista de funcionários de Manutenção existentes (com nome, id).
2. **[ ] Match por nome** — Cruzar os nomes exportados de produção com os 31 nomes da planilha para identificar quais dos 19 IDs 106–124 correspondem a quais linhas.
3. **[ ] Validação de funções** — Confirmar com RH se "MEC MANUT l" → "MEC MANUT I" está correto (seção 5.1).
4. **[ ] Setor canônico** — Definir qual setor (id=3 ou id=11) é o correto para Manutenção.
5. **[ ] Script de update** — Após confirmação, gerar script de UPDATE isolado por CPF, com transação e rollback plan.
6. **[ ] Cadastro de novos** — Identificar os 12 que não existem e criar via UI (não bulk INSERT) após validação humana.
7. **[ ] Dry-run staging** — Aplicar tudo em staging antes de produção.

---

## 8 · Veredito

```
❌ NO-GO PARA UPDATE AUTOMÁTICO EM PRODUÇÃO
   Motivo: Impossível confirmar IDs de produção sem acesso direto.
            Risco de sobrescrever funcionário errado por ausência de CPF/email
            nos registros de produção.

✅ GO PARA ETAPA DE VERIFICAÇÃO (Seção 6)
   Ação: Executar query SELECT em produção e exportar estado atual.

✅ GO PARCIAL para script dry-run APÓS verificação
   Pré-condição: match nome↔id confirmado por humano + setor canônico definido.
```

---

## 9 · Arquivos gerados

| Arquivo | Conteúdo | CPF exposto? |
|---|---|---|
| `docs/MANUTENCAO_FUNCIONARIOS_RECONCILIACAO_JUNHO26.md` | Este relatório (mascarado) | NÃO |
| `tmp/manutencao_funcionarios_update_plan_junho26.json` | 279 registros campo-nível | Apenas mascarado |
| `tmp/manutencao_funcionarios_update_plan_junho26.csv` | Idem em CSV | Apenas mascarado |

> `tmp/` está no `.gitignore` — nenhum dos arquivos acima será commitado.
> CPF completo nunca foi gravado em disco — somente processado em memória.

---

*Gerado automaticamente por script de reconciliação · AirTrust · 2026-06-15*
