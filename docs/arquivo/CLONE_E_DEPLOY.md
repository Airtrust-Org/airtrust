# 🚀 CLONE + DEPLOY DO AIRTRUST

## ❌ PROBLEMA

```
cd: no such file or directory: /Users/filipedaumas/airtrust-v1
```

A pasta do projeto não existe na sua máquina ainda.

## ✅ SOLUÇÃO - PASSO A PASSO

### **Step 1: Clone o Repositório**

```bash
cd ~
git clone https://github.com/fp-daumas/airtrust-v1.git
cd airtrust-v1
```

**Espere alguns segundos enquanto o git faz download...**

### **Step 2: Mude para o Branch Certo**

```bash
git checkout refactor/remove-v2-structure
```

### **Step 3: Faça Pull da Branch**

```bash
git pull origin refactor/remove-v2-structure
```

### **Step 4: Execute o Deploy**

```bash
chmod +x DEPLOY_PRODUCAO.sh
./DEPLOY_PRODUCAO.sh
```

---

## 📋 RESUMO EM 4 LINHAS

```bash
cd ~ && git clone https://github.com/fp-daumas/airtrust-v1.git
cd airtrust-v1
git checkout refactor/remove-v2-structure
./DEPLOY_PRODUCAO.sh
```

---

## 🔍 VERIFICAÇÃO

Depois de clonar, verifique se os arquivos estão lá:

```bash
ls -la | grep DEPLOY
```

Deve aparecer:

```
DEPLOY_PRODUCAO.sh
DEPLOY_FINAL_PRODUCAO.md
START_AQUI.txt
```

---

## ⏱️ TEMPO TOTAL

- Clone: ~1 minuto
- Deploy: ~2 minutos
- **Total: ~3 minutos até seu sistema estar online!**

---

## 🎯 RESULTADO ESPERADO

Depois que executar `./DEPLOY_PRODUCAO.sh`:

1. ✅ Browser abre para login Cloudflare
2. ✅ Você clica "Authorize" (1 clique)
3. ✅ Deploy automático
4. ✅ URL: https://airtrust.pages.dev

---

**Comece por aqui:**

```bash
cd ~ && git clone https://github.com/fp-daumas/airtrust-v1.git && cd airtrust-v1 && ./DEPLOY_PRODUCAO.sh
```

🚀 **Vá!**
