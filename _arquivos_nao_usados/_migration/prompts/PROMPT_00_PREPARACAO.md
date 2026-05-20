# 🔧 FASE 2 - PROMPT 1/7: PREPARAÇÃO E CHECKPOINT

**Módulo**: Simuladores  
**Etapa**: Preparação inicial  
**Tempo**: 15 minutos  
**Dependências**: Nenhuma

---

## 🎯 OBJETIVO

Criar ambiente seguro para Fase 2 com backup completo, branch isolada e validação do build inicial.

---

## 📋 CHECKLIST

- [ ] Verificar estado do repositório Git
- [ ] Criar branch de trabalho
- [ ] Fazer backup completo
- [ ] Validar build inicial
- [ ] Criar estrutura de logs

---

## 🔨 SCRIPT DE EXECUÇÃO

```bash
#!/bin/bash
# 00-checkpoint-inicial.sh
echo "🔍 CHECKPOINT INICIAL - FASE 2"

# 1. Verificar Git status
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️ ATENÇÃO: Há mudanças não commitadas"
  echo "Fazer commit antes? (s/n)"
  read -r response
  if [ "$response" = "s" ]; then
    git add -A
    git commit -m "chore: checkpoint antes da Fase 2"
  fi
fi

# 2. Criar branch de segurança
BRANCH_NAME="fase2-refatoracao-$(date +%Y%m%d)"
git checkout -b "$BRANCH_NAME"
echo "✅ Branch criada: $BRANCH_NAME"

# 3. Criar backup completo
BACKUP_DIR="_backups/fase2-inicio-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r src/react-app/pages/simuladores "$BACKUP_DIR/pages-original"
cp -r src/react-app/components/simuladores "$BACKUP_DIR/components-original"
cp src/react-app/App.tsx "$BACKUP_DIR/App.tsx.backup"
echo "✅ Backup criado: $BACKUP_DIR"

# 4. Verificar build inicial
echo ""
echo "🏗️ Verificando build inicial..."
npm run build > /tmp/build-inicial.log 2>&1

if [ $? -eq 0 ]; then
  BUILD_TIME=$(grep "built in" /tmp/build-inicial.log | awk '{print $4}')
  echo "✅ Build inicial: OK ($BUILD_TIME)"
else
  echo "❌ Build inicial: FALHOU"
  echo "Resolver antes de continuar!"
  cat /tmp/build-inicial.log
  exit 1
fi

# 5. Criar estrutura de tracking
mkdir -p _migration/logs
echo "$(date): Fase 2 iniciada" > _migration/logs/timeline.log
echo "Branch: $BRANCH_NAME" >> _migration/logs/timeline.log
echo "Backup: $BACKUP_DIR" >> _migration/logs/timeline.log

echo ""
echo "✅ CHECKPOINT COMPLETO!"
echo "📝 Próximo: Executar PROMPT_01_ESTRUTURA.md"
```

---

## ✅ VALIDAÇÃO

Ao final, você deve ter:

- ✅ Branch `fase2-refatoracao-YYYYMMDD` criada
- ✅ Backup em `_backups/fase2-inicio-*/`
- ✅ Build passando
- ✅ Logs em `_migration/logs/timeline.log`

---

## 🚨 ROLLBACK

Se algo der errado:

```bash
git checkout main
git branch -D fase2-refatoracao-*
rm -rf _backups/fase2-inicio-*
```

---

**Próximo**: `PROMPT_01_ESTRUTURA.md`
