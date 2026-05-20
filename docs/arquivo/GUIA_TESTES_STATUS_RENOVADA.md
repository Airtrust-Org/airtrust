# 🧪 GUIA DE TESTES: STATUS RENOVADA

**Versão Testada:** 99b088df-1466-472d-9560-9a67d7941b9a  
**Data:** 4 de Novembro de 2025  
**Ambiente:** Production (Cloudflare Workers)

---

## 📋 PRÉ-REQUISITOS

- [ ] Browser Chrome/Safari/Firefox/Edge atualizado
- [ ] Sessão ativa no AirTrust (token JWT válido)
- [ ] Acesso ao módulo Habilitações
- [ ] Alguns registros com `eh_renovada = 1` (renovadas)
- [ ] Alguns registros com `eh_renovada = 0` (não renovadas)

---

## ✅ TESTE 1: VISUALIZAÇÃO SEM FILTROS

### Objetivo:

Verificar se a tabela de habilitações exibe os status corretamente sem ícones redundantes.

### Passos:

1. Abrir `https://[WORKER_URL]/habilitacoes`
2. Aguardar carregamento completo
3. Observar coluna "STATUS"

### Validações:

```
✓ Habilitações VÁLIDAS mostram:
  Tag: "VÁLIDO" (fundo verde claro #4CAF5015)
  Texto: "Válida por XX dias"

✓ Habilitações VENCENDO mostram:
  Tag: "VENCENDO" (fundo laranja claro #FF980015)
  Texto: "Vence em XX dias"

✓ Habilitações VENCIDAS mostram:
  Tag: "VENCIDA" (fundo vermelho claro #F4433615)
  Texto: "Vencida há XX dias"

✓ Habilitações RENOVADAS mostram:
  Tag: "RENOVADA" (fundo roxo claro #8B5CF615)
  Texto: "Habilitação renovada"
  ❌ NÃO deve ter outra tag (ex: "VÁLIDO + Renovada")
```

### Resultado Esperado:

- [x] Uma única tag por habilitação
- [x] Cores distintas funcionando
- [x] Nenhum ícone (CheckCircle, Clock, AlertCircle) visível
- [x] Texto descritivo legível

---

## ✅ TESTE 2: FILTRO DE STATUS - RENOVADA

### Objetivo:

Verificar se o filtro "Renovada" funciona corretamente.

### Passos:

1. Abrir página Habilitações
2. Localizar dropdown "Filtrar por Status" (seção Filtros Avançados)
3. Clicar no dropdown

### Validações - Opções Disponíveis:

```
Verificar se o dropdown contém EXATAMENTE:
  ☐ Todos os Status        ← Default
  ☐ Válido
  ☐ Vencendo
  ☐ Vencida
  ☐ Renovada               ← NOVO! Deve estar presente
```

### Passos Continuação:

4. Selecionar "Renovada"
5. Aguardar atualização da tabela

### Validações - Resultado do Filtro:

```
✓ Tabela mostra APENAS habilitações com eh_renovada = 1
✓ Todas as linhas visíveis têm status "RENOVADA"
✓ Contador de registros atualiza (ex: "Registros (5)" se há 5 renovadas)
✓ Nenhuma habilitação VÁLIDA/VENCENDO/VENCIDA aparece
```

### Teste Reverso:

6. Selecionar "Válido"

### Validações:

```
✓ Tabela mostra APENAS habilitações VÁLIDAS
✓ Nenhuma renovada aparece
✓ Contador atualiza para novo total
```

---

## ✅ TESTE 3: COMBINAÇÃO DE FILTROS

### Objetivo:

Verificar se múltiplos filtros funcionam juntos corretamente.

### Cenário A: Status + Funcionário

1. Definir "Filtrar por Status" = "Renovada"
2. Definir "Filtrar por Funcionário" = "[nome de um funcionário]"
3. Clicar Enter ou aguardar atualização

### Validações:

```
✓ Tabela mostra APENAS:
  - Habilitações renovadas (eh_renovada = 1)
  - AND do funcionário especificado
✓ Se o funcionário não tem renovações, mostra "Nenhuma habilitação encontrada"
```

### Cenário B: Status + Tipo

1. Definir "Filtrar por Status" = "Renovada"
2. Definir "Filtrar por Tipo" = "[código qual, ex: CRM]"

### Validações:

```
✓ Tabela mostra APENAS:
  - Renovações (eh_renovada = 1)
  - AND da qualificação especificada
```

---

## ✅ TESTE 4: LIMPEZA DE FILTROS

### Objetivo:

Verificar se o botão "Limpar Filtros" funciona.

### Passos:

1. Aplicar qualquer combinação de filtros
2. Clicar botão "Limpar Filtros"

### Validações:

```
✓ Todos os campos de filtro voltam ao estado padrão (vazio)
✓ Tabela exibe TODAS as habilitações
✓ Botão "Limpar Filtros" desaparece (reaparece só com filtros ativos)
```

---

## ✅ TESTE 5: ORDENAÇÃO COM FILTROS

### Objetivo:

Verificar se a ordenação funciona com status "Renovada".

### Passos:

1. Filtrar por Status = "Renovada"
2. Clicar no header "STATUS" para ordenar

### Validações:

```
✓ Todas as linhas permanecem com status "RENOVADA" (não descobre)
✓ Outras colunas (FUNCIONÁRIO, QUALIFICAÇÃO, etc) podem ser ordenadas normalmente
```

---

## ✅ TESTE 6: RESPONSIVIDADE

### Objetivo:

Verificar se a tag de status é legível em diferentes tamanhos de tela.

### Desktop (1920px):

```
✓ Tag "RENOVADA" visível e legível
✓ Texto descritivo abaixo está claro
✓ Sem overflow ou corte de texto
```

### Tablet (768px):

```
✓ Tag permanece compacta
✓ Texto não quebra de forma estranha
✓ Coluna STATUS tem altura adequada
```

### Mobile (375px):

```
✓ Tag ainda é visível (pode usar 100% da coluna)
✓ Cor e fundo deixam legível o status
✓ Sem problemas de truncamento
```

---

## ✅ TESTE 7: EDGE CASES

### Caso 1: Habilitação sem data de vencimento

1. Localizar habilitação com `data_vencimento = NULL`
2. Verificar que mostra "VENCIDA" (nunca "RENOVADA" a menos que seja renovada)

### Caso 2: Habilitação renovada COM data de vencimento

1. Localizar renovada com `eh_renovada = 1` E `data_vencimento = [data futura]`
2. Verificar que mostra "RENOVADA" (não "VÁLIDO", mesmo com data válida)

### Caso 3: Data de vencimento hoje

1. Localizar habilitação com `data_vencimento = TODAY()`
2. Verificar que mostra "VENCENDO" (0 dias = "Vence em 0 dias" ou "Vencida"?)
   - Pode ser "Vencida" ou "Vencendo", mas deve ser consistente

### Caso 4: Data de vencimento amanhã

1. Localizar habilitação com `data_vencimento = TOMORROW()`
2. Verificar que mostra "VENCENDO" (1 dia)

### Caso 5: Data de vencimento em 31 dias

1. Localizar habilitação com `data_vencimento = TODAY() + 31 dias`
2. Verificar que mostra "VÁLIDO" (não "VENCENDO", pois limite é ≤30)

---

## ✅ TESTE 8: ÍCONES REMOVIDOS

### Objetivo:

Confirmar que ícones de status foram completamente removidos.

### Validações:

```
✗ NÃO deve haver CheckCircle verde (✓)
✗ NÃO deve haver Clock laranja (⏱)
✗ NÃO deve haver AlertCircle vermelho (⚠)

✓ Apenas TEXTO em cores deve estar presente
✓ Tag com background colorido deve estar presente
```

---

## ✅ TESTE 9: CONSISTÊNCIA DE DADOS

### Objetivo:

Verificar se os dados no frontend correspondem ao backend.

### Passos:

1. Filtrar por "Renovada"
2. Selecionar uma habilitação renovada
3. Abrir DevTools (F12)
4. Verificar a chamada GET `/api/v2/habilitacoes?filter=renovada`

### Validações:

```
✓ Todos os registros retornados têm eh_renovada = 1 (ou true)
✓ Quantidade de registros na tabela = quantidade da API
✓ Nenhum registro com eh_renovada = 0 ou false aparece
```

---

## ✅ TESTE 10: PERFORMANCE

### Objetivo:

Verificar se os filtros não causam lag.

### Passos:

1. Clicar rapidamente entre filtros diferentes
2. Alternar entre "Renovada" e "Válido" 10 vezes

### Validações:

```
✓ Tabela atualiza em < 500ms
✓ Sem travamento ou congelamento
✓ Spinner de carregamento aparece (opcional)
```

---

## 🐛 BUGS CONHECIDOS (Se Encontrados)

Se durante os testes você encontrar algum dos seguintes problemas, por favor reporte:

### Bug Esperado 1: Tipo vs Status

```
❌ Filtro por Tipo não funciona bem com Renovada
Motivo: Renovada é um atributo histórico, não tem tipo fixo
```

### Bug Esperado 2: Stats não atualizam

```
❌ Dashboard stats mostra "Renovadas: 0" mesmo com registros
Motivo: Endpoint `/stats` pode não estar calculando corretamente
```

### Bugs Não Esperados:

Se encontrar qualquer outro problema, documente:

- Passos para reproduzir
- Resultado esperado vs. resultado real
- Screenshot
- Versão do browser

---

## 📝 TEMPLATE DE RELATÓRIO

```markdown
## Teste: [NOME DO TESTE]

**Status:** ✅ PASSOU / ⚠️ PARCIAL / ❌ FALHOU

**Validações:**

- [x] Validação 1
- [x] Validação 2
- [ ] Validação 3 (FALHOU)

**Observações:**
[Descrever o que foi observado]

**Screenshots:**
[Se aplicável, adicionar screenshot]

**Data:** 4 de Novembro de 2025
**Testador:** [Nome]
**Browser:** [Chrome/Safari/Firefox/Edge] v[XX]
```

---

## 📊 MATRIZ DE COBERTURA DE TESTES

| #   | Teste                    | Status | Testador | Data |
| --- | ------------------------ | ------ | -------- | ---- |
| 1   | Visualização sem filtros | ⏳     | -        | -    |
| 2   | Filtro Status - Renovada | ⏳     | -        | -    |
| 3   | Combinação de filtros    | ⏳     | -        | -    |
| 4   | Limpeza de filtros       | ⏳     | -        | -    |
| 5   | Ordenação com filtros    | ⏳     | -        | -    |
| 6   | Responsividade           | ⏳     | -        | -    |
| 7   | Edge cases               | ⏳     | -        | -    |
| 8   | Ícones removidos         | ⏳     | -        | -    |
| 9   | Consistência de dados    | ⏳     | -        | -    |
| 10  | Performance              | ⏳     | -        | -    |

---

## 🎯 CRITÉRIO DE SUCESSO

✅ **Todos os 10 testes devem passar** para que a feature seja considerada:

- Funcional
- Performática
- Intuitiva
- Sem regressions

---

**Obrigado por testar!** 🎉

Para reportar issues: [usar JIRA/GitHub Issues]

Version: 99b088df-1466-472d-9560-9a67d7941b9a
