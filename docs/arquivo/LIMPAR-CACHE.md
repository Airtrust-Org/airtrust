# 🔄 COMO LIMPAR O CACHE DO NAVEGADOR

## ⚠️ PROBLEMA

Após o deploy, o navegador ainda mostra dados antigos porque está usando JavaScript em cache.

## ✅ SOLUÇÕES (EM ORDEM DE PREFERÊNCIA)

### 1. **Hard Refresh (Mais Rápido)**

#### Mac:
- **Chrome/Edge:** `Cmd + Shift + R`
- **Firefox:** `Cmd + Shift + R`
- **Safari:** `Cmd + Option + R`

#### Windows/Linux:
- **Chrome/Edge:** `Ctrl + Shift + R`
- **Firefox:** `Ctrl + Shift + R`

### 2. **Modo Anônimo/Privado**

- **Chrome:** `Cmd + Shift + N` (Mac) ou `Ctrl + Shift + N` (Windows)
- **Firefox:** `Cmd + Shift + P` (Mac) ou `Ctrl + Shift + P` (Windows)
- **Safari:** `Cmd + Shift + N` (Mac)

### 3. **Limpar Cache Manualmente**

#### Chrome/Edge:
1. Abra DevTools: `F12` ou `Cmd + Option + I`
2. Clique com botão direito no ícone de **Reload**
3. Selecione **"Empty Cache and Hard Reload"**

#### Firefox:
1. Abra DevTools: `F12`
2. Vá em **Network**
3. Clique com botão direito → **Clear Browser Cache**

#### Safari:
1. Menu **Safari** → **Preferences** → **Advanced**
2. Marque **"Show Develop menu in menu bar"**
3. Menu **Develop** → **Empty Caches**

### 4. **Limpar Todo o Cache (Última Opção)**

#### Chrome/Edge:
1. `Cmd + Shift + Delete` (Mac) ou `Ctrl + Shift + Delete` (Windows)
2. Selecione **"Cached images and files"**
3. Clique em **"Clear data"**

#### Firefox:
1. `Cmd + Shift + Delete` (Mac) ou `Ctrl + Shift + Delete` (Windows)
2. Selecione **"Cache"**
3. Clique em **"Clear Now"**

---

## 🎯 PARA O SEU CASO ESPECÍFICO

**Você está vendo "Adriano Brasil" mas deveria ver "Adriana Brasil"**

### Solução Imediata:

1. **Feche TODAS as abas** do AirTrust
2. **Feche o navegador completamente**
3. **Abra novamente** e acesse: https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev
4. **Hard Refresh:** `Cmd + Shift + R`

### Verificação:

A ordenação alfabética deve mostrar:
- Página 1: **Adriana Brasil** (com "a")
- Não: ~~Adriano Brasil~~ (com "o")

---

## 🔍 COMO CONFIRMAR QUE O BACKEND ESTÁ CORRETO

Execute no terminal:

```bash
curl -s "https://0199d03e-fe13-77d7-a6e7-7d94d446894b.airtrust.workers.dev/api/v2/qualificacoes?page=1&limit=5&orderBy=funcionario_nome&orderDir=asc" | jq '.data[] | {id, funcionario_nome}'
```

**Resultado esperado:**
```json
{
  "id": 1983,
  "funcionario_nome": "Adriana Brasil"
}
```

Se o backend retorna "Adriana" mas o navegador mostra "Adriano", é **100% cache**.

---

## 📝 NOTA TÉCNICA

O sistema já tem cache busting implementado (hash nos arquivos JS), mas navegadores podem manter cache do HTML principal. Por isso, hard refresh é necessário após deploys.

**Versão atual do deploy:** d511f749-0996-4a54-9f5d-11925d4ea3e9
