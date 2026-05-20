# 🔍 DEBUG COMPLETO - IMPORTAÇÃO NÃO FUNCIONA

**Data:** 21/10/2025 22:42  
**Problema:** Importação não dá erro mas também não salva nada

---

## 🎯 SITUAÇÃO ATUAL

### Banco de Produção
```
Funcionários: 5 (apenas dados de teste)
CPFs: 12345678901, 12345678902, 12345678903, 12345678904, 12345678905
```

### Sua Tentativa
```
"Já importei os funcionários na produção"
Mas: Banco ainda tem apenas 5 funcionários de teste
Conclusão: A importação FALHOU silenciosamente
```

---

## 🚨 POSSÍVEIS CAUSAS

### 1. Verificação de Duplicados

O código **REJEITA** a importação se encontrar:
- ❌ CPFs duplicados
- ❌ Emails duplicados  
- ❌ Matrículas duplicadas

**Código (linha 311-356):**
```typescript
// Verificar CPFs duplicados
if (cpfs.length > 0) {
  const duplicadosCPF = await c.env.DB.prepare(`
    SELECT cpf FROM funcionarios 
    WHERE cpf IN (${placeholdersCPF}) AND deleted_at IS NULL
  `).bind(...cpfs).all();
  
  if (duplicadosCPF.results.length > 0) {
    return c.json({
      error: 'CPFs duplicados encontrados no banco',
      duplicados: duplicadosCPF.results.map((r: any) => r.cpf)
    }, 400);
  }
}
```

**Se sua planilha tem CPFs que já existem no banco, a importação é rejeitada!**

### 2. Validação de Campos

O código valida:
- ❌ CPF inválido
- ❌ Email inválido
- ❌ Campos obrigatórios faltando

### 3. Formato do CSV

O código espera:
- ✅ Header na primeira linha
- ✅ Campos separados por vírgula
- ✅ UTF-8 encoding

---

## ✅ COMO DEBUGAR

### Passo 1: Ver Logs no Console

**IMPORTANTE:** Abra o DevTools (F12) ANTES de importar!

1. Abra o navegador
2. Pressione F12
3. Vá para aba "Console"
4. Tente importar
5. Veja as mensagens

**Mensagens possíveis:**
```
✅ Sucesso:
[IMPORTAÇÃO] Iniciando processamento...
[IMPORTAÇÃO] 100 registros para processar
[IMPORTAÇÃO] Importação concluída: 100 sucessos, 0 erros

❌ Erro:
CPFs duplicados encontrados no banco
Emails duplicados encontrados no banco
CSV vazio ou inválido
Erro ao processar CSV
```

### Passo 2: Ver Resposta da API

No DevTools:
1. Aba "Network"
2. Filtrar por "importar"
3. Clicar na requisição
4. Ver "Response"

**Exemplo de resposta com erro:**
```json
{
  "error": "CPFs duplicados encontrados no banco",
  "duplicados": ["12345678901", "12345678902"]
}
```

### Passo 3: Verificar Banco Antes

```bash
# Ver funcionários atuais
npx wrangler d1 execute airtrust-db --remote --command="
SELECT id, nome, cpf, email, matricula 
FROM funcionarios 
WHERE deleted_at IS NULL;
"
```

### Passo 4: Verificar Banco Depois

```bash
# Ver se importou
npx wrangler d1 execute airtrust-db --remote --command="
SELECT COUNT(*) as total FROM funcionarios WHERE deleted_at IS NULL;
"

# Ver últimos importados
npx wrangler d1 execute airtrust-db --remote --command="
SELECT id, nome, cpf, created_at 
FROM funcionarios 
WHERE deleted_at IS NULL 
ORDER BY created_at DESC 
LIMIT 10;
"
```

---

## 🔧 SOLUÇÕES

### Solução 1: Limpar Dados de Teste

Se os 5 funcionários são apenas dados de teste:

```bash
# CUIDADO: Isso vai apagar os 5 funcionários de teste!
npx wrangler d1 execute airtrust-db --remote --command="
DELETE FROM funcionarios WHERE id IN (1,2,3,4,5);
"

# Verificar
npx wrangler d1 execute airtrust-db --remote --command="
SELECT COUNT(*) FROM funcionarios;
"
# Deve retornar: 0

# Agora importar seus funcionários reais
```

### Solução 2: Usar CPFs Diferentes

Se a planilha tem CPFs que já existem:

1. Editar planilha
2. Remover/alterar CPFs duplicados
3. Tentar importar novamente

### Solução 3: Modo UPDATE (se implementado)

Verificar se há opção de "atualizar" ao invés de "inserir".

### Solução 4: Importar Via API Diretamente

Testar a API diretamente:

```bash
# Criar arquivo test.json
cat > test.json << 'EOF'
{
  "csv": "cpf,nome,email,matricula,cargo\n99999999999,Teste User,teste@email.com,TEST001,Piloto"
}
EOF

# Testar importação
curl -X POST \
  https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/funcionarios/importar \
  -H "Content-Type: application/json" \
  -d @test.json

# Ver resposta
```

---

## 📋 CHECKLIST DE DEBUG

### Antes de Importar

- [ ] Abrir DevTools (F12)
- [ ] Ir para aba Console
- [ ] Ir para aba Network
- [ ] Verificar quantos funcionários existem no banco
- [ ] Verificar se planilha está no formato correto

### Durante a Importação

- [ ] Ver mensagens no Console
- [ ] Ver requisição na aba Network
- [ ] Ver resposta da API
- [ ] Anotar mensagens de erro

### Depois da Importação

- [ ] Verificar quantos funcionários foram importados
- [ ] Ver últimos registros criados
- [ ] Verificar se CPFs correspondem
- [ ] Testar importação de qualificações

---

## 🎯 TESTE RÁPIDO

### Teste 1: Importar 1 Funcionário Novo

Crie arquivo `teste_1_funcionario.csv`:

```csv
cpf,nome,email,matricula,cargo
88888888888,Funcionario Teste,teste.novo@email.com,TESTNOVO001,Piloto
```

**Importante:** Use CPF que NÃO existe no banco!

Importe e veja se funciona.

### Teste 2: Ver Erro de Duplicado

Crie arquivo `teste_duplicado.csv`:

```csv
cpf,nome,email,matricula,cargo
12345678901,Teste Duplicado,teste@email.com,TEST001,Piloto
```

**Importante:** Use CPF que JÁ existe (12345678901)

Importe e veja a mensagem de erro.

---

## 💡 SCRIPT DE DIAGNÓSTICO

Salve como `diagnostico.sh`:

```bash
#!/bin/bash

echo "🔍 DIAGNÓSTICO DE IMPORTAÇÃO"
echo "============================"
echo ""

echo "1️⃣ Funcionários no banco:"
npx wrangler d1 execute airtrust-db --remote --command="
SELECT COUNT(*) as total FROM funcionarios WHERE deleted_at IS NULL;
"
echo ""

echo "2️⃣ Últimos 5 funcionários:"
npx wrangler d1 execute airtrust-db --remote --command="
SELECT id, nome, cpf, created_at 
FROM funcionarios 
WHERE deleted_at IS NULL 
ORDER BY created_at DESC 
LIMIT 5;
"
echo ""

echo "3️⃣ Últimas importações:"
npx wrangler d1 execute airtrust-db --remote --command="
SELECT * FROM importacoes_log 
ORDER BY created_at DESC 
LIMIT 3;
"
echo ""

echo "4️⃣ Qualificações no banco:"
npx wrangler d1 execute airtrust-db --remote --command="
SELECT COUNT(*) as total FROM qualificacoes;
"
echo ""

echo "✅ Diagnóstico concluído!"
```

Execute:
```bash
chmod +x diagnostico.sh
./diagnostico.sh
```

---

## 🎯 PRÓXIMOS PASSOS

### 1. Abrir DevTools e Tentar Importar

```
1. F12 → Console
2. Importar funcionários
3. Ver mensagens de erro
4. Anotar erro específico
```

### 2. Me Enviar o Erro

Copie e cole:
- Mensagem do Console
- Resposta da API (aba Network)
- Quantos funcionários tem no banco

### 3. Aplicar Solução Específica

Com base no erro, aplicaremos a solução correta.

---

## 📊 RESUMO

```
╔══════════════════════════════════════════════════╗
║                                                  ║
║   POR QUE NÃO IMPORTOU?                         ║
║                                                  ║
║   Possíveis causas:                             ║
║   1. CPFs duplicados                            ║
║   2. Emails duplicados                          ║
║   3. Matrículas duplicadas                      ║
║   4. Formato CSV inválido                       ║
║   5. Validação falhou                           ║
║                                                  ║
║   Como descobrir:                               ║
║   → Abrir DevTools (F12)                        ║
║   → Ver Console e Network                       ║
║   → Ler mensagem de erro                        ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```

---

**Criado em:** 21/10/2025 22:42  
**Status:** Aguardando logs do DevTools  
**Próxima ação:** Abrir F12 e tentar importar novamente

🔍 **ABRA O DEVTOOLS E TENTE IMPORTAR PARA VER O ERRO EXATO!**
