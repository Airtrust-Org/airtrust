# 📚 ÍNDICE COMPLETO - SISTEMA DE PROMPTS MODULARES

**Módulo**: Simuladores  
**Tipo**: Guia de Execução  
**Data**: $(date +%d/%m/%Y)

---

## 🎯 VISÃO GERAL

Sistema modular de 7 prompts para executar a **Fase 2: Consolidação Arquitetural** de forma sistemática, reproduzível e com automação máxima.

**Tempo total**: 6 horas  
**Arquivos migrados**: 28  
**Redução na raiz**: 97% (29 → 1)

---

## 📋 LISTA DE PROMPTS

| #   | Arquivo                         | Objetivo                    | Tempo  | Dependências |
| --- | ------------------------------- | --------------------------- | ------ | ------------ |
| 00  | `PROMPT_00_PREPARACAO.md`       | Checkpoint, backup e branch | 15 min | -            |
| 01  | `PROMPT_01_ESTRUTURA.md`        | Criar estrutura de pastas   | 30 min | 00           |
| 02  | `PROMPT_02_MIGRACAO_PAGINAS.md` | Migrar 28 arquivos          | 2h     | 01           |
| 03  | `PROMPT_03_PDF_CONSOLIDACAO.md` | Consolidar PDF (3→1)        | 1h     | 02           |
| 04  | `PROMPT_04_ROTAS.md`            | Rotas + lazy loading        | 1h     | 03           |
| 05  | `PROMPT_05_VALIDACAO.md`        | Validação e testes          | 1h     | 04           |
| 06  | `PROMPT_06_FINALIZACAO.md`      | Docs, commit, push          | 30 min | 05           |

---

## 🚀 EXECUÇÃO

### Opção 1: Sequencial (Recomendado)

Execute os prompts em ordem:

```bash
# 00 - Preparação
bash _migration/scripts/00-checkpoint-inicial.sh

# 01 - Estrutura
bash _migration/scripts/01-criar-estrutura.sh
bash _migration/scripts/02-criar-mapeamento.sh

# 02 - Migração
# Execute manualmente ou use loop:
for file in Dashboard.tsx ListaSimuladoresPagina.tsx ...; do
  bash _migration/scripts/03-migrate-file.sh "$file" "destino/"
done
bash _migration/scripts/04-atualizar-imports.sh

# 03 - PDF
bash _migration/scripts/05-comparar-pdf.sh
bash _migration/scripts/06-consolidar-pdf.sh

# 04 - Rotas
# Criar manualmente: pages/simuladores/simuladores.routes.tsx

# 05 - Validação
bash _migration/scripts/07-validar-completo.sh
bash _migration/scripts/08-criar-relatorio-testes.sh

# 06 - Finalização
bash _migration/scripts/08-atualizar-docs.sh
bash _migration/scripts/09-commit-final.sh
bash _migration/scripts/10-criar-indice.sh
bash _migration/scripts/11-celebrar.sh
```

### Opção 2: Modular (Avançado)

Execute apenas os prompts necessários:

```bash
# Exemplo: Apenas consolidar PDF
bash _migration/scripts/05-comparar-pdf.sh
bash _migration/scripts/06-consolidar-pdf.sh
```

---

## 📊 DETALHAMENTO DOS PROMPTS

### 00 - PREPARAÇÃO

**Scripts**:

- `00-checkpoint-inicial.sh`

**Ações**:

- Verifica git status
- Cria backup em `_backups/`
- Cria branch `refactor/simuladores-fase2`
- Valida build inicial
- Cria log timeline

**Output**:

- `_backups/fase2-checkpoint-[timestamp].zip`
- `_migration/logs/timeline.log`

---

### 01 - ESTRUTURA

**Scripts**:

- `01-criar-estrutura.sh`
- `02-criar-mapeamento.sh`

**Ações**:

- Cria 20+ pastas feature-based
- Gera tabela de mapeamento

**Output**:

- Estrutura de pastas completa
- `_migration/mapping-detalhado.md`

---

### 02 - MIGRAÇÃO DE PÁGINAS

**Scripts**:

- `03-migrate-file.sh` (executar 28x)
- `04-atualizar-imports.sh`

**Ações**:

- Move 28 arquivos para destinos
- Atualiza 13 padrões de import
- Loga cada migração

**Output**:

- Arquivos migrados
- `_migration/logs/migracoes.log`

---

### 03 - PDF CONSOLIDAÇÃO

**Scripts**:

- `05-comparar-pdf.sh`
- `06-consolidar-pdf.sh`

**Ações**:

- Compara 3 versões de PDF
- Escolhe melhor (PDFGeneratorNativo)
- Consolida em 1 arquivo
- Atualiza imports

**Output**:

- `components/PDFGenerator.tsx`
- Tabela de comparação

---

### 04 - ROTAS

**Scripts**: N/A (código TypeScript)

**Ações**:

- Cria `simuladores.routes.tsx`
- Implementa lazy loading
- Define 13 rotas
- Integra com `App.tsx`

**Output**:

- `pages/simuladores/simuladores.routes.tsx`

---

### 05 - VALIDAÇÃO

**Scripts**:

- `07-validar-completo.sh`
- `08-criar-relatorio-testes.sh`

**Ações**:

- Build validation
- Import check (grep)
- PDF count (esperado: 1)
- Folder structure check
- Root file count (esperado: 1)

**Output**:

- `_migration/logs/validation.log`
- `_migration/functional-tests-results.md`

---

### 06 - FINALIZAÇÃO

**Scripts**:

- `08-atualizar-docs.sh`
- `09-commit-final.sh`
- `10-criar-indice.sh`
- `11-celebrar.sh`

**Ações**:

- Atualiza CHANGELOG.md
- Cria relatório final
- Commit consolidado
- Push para branch
- Mensagem de sucesso

**Output**:

- CHANGELOG.md atualizado
- `_migration/RELATORIO_FASE2_FINAL.md`
- `_migration/INDICE_FASE2.md`
- Git commit + push

---

## 🎯 MÉTRICAS ESPERADAS

| Métrica                      | Antes | Depois | Melhoria |
| ---------------------------- | ----- | ------ | -------- |
| Arquivos na raiz             | 29    | 1      | -97%     |
| PDF Generators               | 3     | 1      | -67%     |
| Clareza                      | 6/10  | 10/10  | +67%     |
| Onboarding                   | ~4h   | ~1h    | -75%     |
| Build time                   | 2.5s  | 2.5s   | 0%       |
| Tempo para encontrar arquivo | ~1min | <20s   | -67%     |

---

## 🔄 ROLLBACK

Se algo der errado:

```bash
# Voltar ao checkpoint
cd /Users/filipedaumas/Documents/airtrust\ v1
rm -rf pages/simuladores
unzip -o _backups/fase2-checkpoint-[timestamp].zip

# Ou voltar ao commit anterior
git reset --hard HEAD~1
```

---

## 🧪 VALIDAÇÕES CRÍTICAS

Após cada prompt, validar:

1. **Build**: `npm run build` sem erros
2. **Imports**: Nenhum import quebrado
3. **Funcionalidade**: Navegar para páginas críticas
4. **PDF**: Gerar PDF de uma ficha

---

## 📚 DOCUMENTAÇÃO GERADA

Após execução completa, os seguintes documentos estarão disponíveis:

1. `_migration/RELATORIO_FASE2_FINAL.md` - Relatório executivo
2. `_migration/mapping-detalhado.md` - Mapeamento de arquivos
3. `_migration/functional-tests-results.md` - Resultados dos testes
4. `_migration/logs/timeline.log` - Timeline de execução
5. `_migration/logs/migracoes.log` - Log de migrações
6. `_migration/logs/validation.log` - Log de validação
7. `_migration/INDICE_FASE2.md` - Índice final

---

## 🎯 CASOS DE USO

### 1. Executar Fase 2 completa

Seguir todos os prompts em sequência (00 → 06)

### 2. Apenas consolidar PDF

Executar apenas PROMPT_03

### 3. Validar estado atual

Executar apenas PROMPT_05

### 4. Recriar estrutura

Executar apenas PROMPT_01

---

## 🔧 REQUISITOS

- **Node.js**: v20+
- **npm**: v10+
- **Git**: Configurado
- **Bash**: v3.2+ (padrão no macOS)
- **Permissões**: Executar scripts (`chmod +x`)

---

## 📞 SUPORTE

Em caso de problemas:

1. Verificar logs em `_migration/logs/`
2. Executar `bash _migration/scripts/07-validar-completo.sh`
3. Revisar CHANGELOG.md
4. Consultar backup em `_backups/`

---

## 🎉 CONCLUSÃO

Este sistema modular permite:

- ✅ Execução reproduzível
- ✅ Automação máxima
- ✅ Rollback fácil
- ✅ Documentação completa
- ✅ Validações em cada etapa
- ✅ Reutilização em outros módulos

**Status**: ✅ PRONTO PARA PRODUÇÃO

---

**Criado em**: $(date +%d/%m/%Y)  
**Módulo**: Simuladores  
**Fase**: 2 - Consolidação Arquitetural
